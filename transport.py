"""
transport.py — network transport layer for the KTM-AQ simulator.

Provides:
  ThingsBoardMQTT  — MQTT client with exponential-backoff reconnect
  http_publish     — REST fallback when MQTT is unavailable
  OfflineBuffer    — SQLite store for payloads that could not be sent
"""

import json, logging, sqlite3, time
from datetime import datetime, timezone
from config import TB_HOST, TB_PORT, OFFLINE_DB, SIM_SQLITE, MAX_BACKOFF, TOPIC_TELEM, TOPIC_ATTR

log = logging.getLogger("AQ")

try:
    import paho.mqtt.client as mqtt
    PAHO_AVAILABLE = True
except ImportError:
    PAHO_AVAILABLE = False
    print("[WARN] paho-mqtt not installed — HTTP fallback only.")

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False
    print("[WARN] requests not installed — HTTP fallback disabled.")

class ThingsBoardMQTT:
    """
    Single MQTT connection to ThingsBoard.
    Reconnects automatically with doubling delay up to MAX_BACKOFF seconds.
    """

    def __init__(self, token: str):
        self.token      = token
        self._connected = False
        self._client    = None
        self._backoff   = 5
        if PAHO_AVAILABLE:
            self._init_client()

    def _init_client(self):
        cid = f"G15-AQ-{self.token[-6:]}"
        try:
            self._client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=cid)
        except AttributeError:
            self._client = mqtt.Client(client_id=cid)          # paho < 2.0 fallback
        self._client.username_pw_set(self.token, "")
        self._client.on_connect    = lambda c, u, f, rc, *a: self._on_connect(rc)
        self._client.on_disconnect = lambda c, u, rc, *a:    self._on_disconnect(rc)

    def _on_connect(self, rc):
        self._connected = rc == 0
        self._backoff   = 5
        if rc == 0:
            log.info(f"MQTT connected [{self.token[-6:]}]")
        else:
            log.error(f"MQTT connect failed RC={rc} [{self.token[-6:]}]")

    def _on_disconnect(self, rc):
        self._connected = False
        log.warning(f"MQTT disconnected RC={rc} [{self.token[-6:]}]")

    def connect(self) -> bool:
        if not PAHO_AVAILABLE:
            return False
        try:
            self._client.loop_start()
            self._client.connect(TB_HOST, TB_PORT, keepalive=60)
            time.sleep(2.5)
            return self._connected
        except Exception as e:
            log.error(f"MQTT connect: {e}")
            self._client.loop_stop()
            return False

    def reconnect_with_backoff(self):
        """Intended to run in a daemon thread; retries until connected."""
        while not self._connected:
            wait = min(self._backoff, MAX_BACKOFF)
            log.info(f"Reconnecting in {wait}s ...")
            time.sleep(wait)
            self._backoff = min(self._backoff * 2, MAX_BACKOFF)
            try:
                self._client.reconnect()
                time.sleep(2.0)
            except Exception as e:
                log.warning(f"Reconnect failed: {e}")

    def publish(self, topic: str, payload: dict) -> bool:
        if not self._connected:
            return False
        try:
            info = self._client.publish(topic, json.dumps(payload), qos=1)
            info.wait_for_publish(timeout=5.0)
            return True
        except Exception as e:
            log.error(f"MQTT publish: {e}")
            return False

    def publish_attributes(self, attrs: dict):
        self.publish(TOPIC_ATTR, attrs)

    def disconnect(self):
        if self._client:
            self._client.loop_stop()
            self._client.disconnect()

def http_publish(token: str, payload: dict) -> bool:
    """POST telemetry to ThingsBoard REST API; used when MQTT is unavailable."""
    if not REQUESTS_AVAILABLE:
        return False
    try:
        r = requests.post(
            f"https://mqtt.thingsboard.cloud/api/v1/{token}/telemetry",
            json=payload, timeout=8,
        )
        return r.status_code == 200
    except Exception as e:
        log.error(f"HTTP fallback: {e}")
        return False

def http_publish_urllib(token: str, payload: dict) -> bool:
    """urllib-only HTTP fallback (no requests dependency) for single-node simulator."""
    import urllib.request
    data = json.dumps(payload).encode()
    req  = urllib.request.Request(
        f"https://{TB_HOST}/api/v1/{token}/telemetry",
        data=data, headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status == 200
    except Exception as e:
        log.debug(f"HTTP urllib: {e}")
        return False

class OfflineBuffer:
    """
    Persists unpublished payloads to SQLite so they survive restarts.
    Pass db_path=SIM_SQLITE for the single-node simulator.
    """

    _CREATE = ("CREATE TABLE IF NOT EXISTS buffer("
               "id INTEGER PRIMARY KEY AUTOINCREMENT, "
               "ts TEXT, node_id TEXT, payload TEXT, sent INTEGER DEFAULT 0)")

    def __init__(self, db_path: str = OFFLINE_DB):
        self.db = db_path
        with sqlite3.connect(self.db) as c:
            c.execute(self._CREATE)

    def _cx(self):
        return sqlite3.connect(self.db)

    def store(self, node_id: str, payload: dict):
        with self._cx() as c:
            c.execute("INSERT INTO buffer(ts,node_id,payload) VALUES(?,?,?)",
                      (datetime.now(timezone.utc).isoformat(), node_id, json.dumps(payload)))

    def pending(self):
        with self._cx() as c:
            return c.execute(
                "SELECT id,node_id,payload FROM buffer WHERE sent=0 ORDER BY id"
            ).fetchall()

    def mark_sent(self, row_id: int):
        with self._cx() as c:
            c.execute("UPDATE buffer SET sent=1 WHERE id=?", (row_id,))

    def pending_count(self) -> int:
        with self._cx() as c:
            return c.execute("SELECT COUNT(*) FROM buffer WHERE sent=0").fetchone()[0]

    def flush(self, client_map: dict):
        """
        Re-publish buffered rows in order using ThingsBoardMQTT clients.
        client_map: {node_id: ThingsBoardMQTT}. Stops on first failure.
        """
        for row_id, node_id, payload_str in self.pending():
            cli = client_map.get(node_id)
            ok  = cli and cli._connected and cli.publish(TOPIC_TELEM, json.loads(payload_str))
            if ok:
                self.mark_sent(row_id)
                log.info(f"  Flushed buffered row [{row_id}]")
            else:
                log.warning(f"  Flush [{row_id}] failed — retry later")
                break