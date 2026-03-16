"""
storage.py — data persistence helpers for the KTM-AQ simulator.

Provides:
  csv_log          — append one reading to the multi-node CSV session log
  write_live       — atomically update aq_live_data.json for the proxy
  SessionStats     — per-metric min/max/avg accumulator (multi-node)
  SimSessionStats  — richer stats tracker for the single-node simulator
"""

import csv, json, os
from datetime import datetime, timezone
from config import CSV_LOG, CSV_FIELDS, LIVE_FILE, SIM_CSV, SIM_CSV_FIELDS

def csv_log(data: dict):
    """Append one sensor reading dict to the session CSV; writes header on first call."""
    exists = os.path.isfile(CSV_LOG)
    with open(CSV_LOG, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        if not exists:
            w.writeheader()
        w.writerow(data)

_live_store: dict = {}

def write_live(node_id: str, data: dict):
    """
    Merge the latest reading into the in-memory store and atomically write
    aq_live_data.json via a tmp-file rename so the proxy never reads a partial file.
    """
    import logging
    log = logging.getLogger("AQ")
    _live_store[node_id] = {
        **{k: v for k, v in data.items() if k != "ts_utc"},
        "_ok": True,
        "_ts": datetime.now(timezone.utc).isoformat(),
    }
    tmp = LIVE_FILE + ".tmp"
    try:
        with open(tmp, "w") as f:
            json.dump(_live_store, f)
        os.replace(tmp, LIVE_FILE)   # atomic on POSIX; near-atomic on Windows
    except Exception as e:
        log.warning(f"Live write failed: {e}")

class SessionStats:
    """Accumulates scalar readings per metric key; produces min/max/avg summaries."""

    def __init__(self):
        self._records: dict = {}

    def update(self, key: str, value: float):
        self._records.setdefault(key, []).append(value)

    def summary(self) -> dict:
        return {
            k: {
                "min":   round(min(v), 2),
                "max":   round(max(v), 2),
                "avg":   round(sum(v) / len(v), 2),
                "count": len(v),
            }
            for k, v in self._records.items()
        }

    def print_summary(self):
        print(f"\n{'='*72}\n  SESSION STATISTICS\n{'='*72}")
        for metric, s in sorted(self.summary().items()):
            print(f"  {metric:<42s}  min={s['min']:>8}  max={s['max']:>8}  avg={s['avg']:>8}  n={s['count']}")

def sim_init_csv():
    """Create the single-node CSV log with its header if it does not exist."""
    if not os.path.exists(SIM_CSV):
        with open(SIM_CSV, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(SIM_CSV_FIELDS)

def sim_append_csv(p: dict, reading_no: int, mqtt_ok: bool, http_ok: bool, buffered: bool):
    """Append one reading row to the single-node CSV."""
    from config import SIM_TOKEN  # avoid circular at module level
    lvl = ("CRITICAL" if p["pm25"] > 150.5 else
           "ALERT"    if p["pm25"] > 55.5  else "NORMAL")
    try:
        with open(SIM_CSV, "a", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow([
                datetime.now().isoformat(), reading_no, p.get("node_id", ""),
                p["pm1"], p["pm25"], p["pm10"],
                p["co"], p["co2"], p["no2"],
                p["temperature"], p["humidity"],
                p.get("wind_speed", ""), p.get("wind_dir", ""),
                p.get("pressure", ""), p.get("rain", 0),
                p["aqi"], p.get("nowcast_aqi", ""), p["aqi_category"],
                p.get("health_risk_score", ""), p.get("event_type", "normal"),
                lvl,
                "YES" if mqtt_ok   else "NO",
                "YES" if http_ok   else "NO",
                "YES" if buffered  else "NO",
            ])
    except Exception as e:
        import logging; logging.getLogger("AQ-Node").warning("CSV write: %s", e)

class SimSessionStats:
    """Extended stats tracker for the single-node simulator console summary."""

    def __init__(self):
        self.start     = datetime.now()
        self.total     = self.sent_mqtt = self.sent_http = self.buffered = 0
        self.alerts    = self.critical  = self.spikes    = self.reconnects = 0
        self.pm25: list  = []
        self.aqi:  list  = []
        self.temp: list  = []
        self.humi: list  = []

    def record(self, p: dict, mqtt_ok: bool, http_ok: bool, buf: bool):
        self.total += 1
        if mqtt_ok: self.sent_mqtt += 1
        if http_ok: self.sent_http += 1
        if buf:     self.buffered  += 1
        self.pm25.append(p["pm25"]); self.aqi.append(p["aqi"])
        self.temp.append(p["temperature"]); self.humi.append(p["humidity"])
        if p["aqi"]  > 100:   self.alerts   += 1
        if p["pm25"] > 150.5: self.critical += 1

    def _stat(self, lst):
        if not lst: return 0, 0, 0
        return round(min(lst), 1), round(max(lst), 1), round(sum(lst) / len(lst), 1)

    def print_summary(self):
        m, s = divmod(int((datetime.now() - self.start).total_seconds()), 60)
        W = 64
        print(f"\n{'='*W}\n  SESSION STATISTICS\n{'='*W}")
        for label, val in [
            ("Runtime",         f"{m}m {s}s"),
            ("Total readings",  self.total),
            ("Sent MQTT",       self.sent_mqtt),
            ("Sent HTTP",       self.sent_http),
            ("Buffered",        self.buffered),
            ("Reconnects",      self.reconnects),
            ("Spikes",          self.spikes),
            ("AQI alerts >100", self.alerts),
            ("Critical >200",   self.critical),
        ]: print(f"  {label:<22}: {val}")
        for lbl, lst, unit in [
            ("PM2.5", self.pm25, "µg/m³"),
            ("AQI",   self.aqi,  ""),
            ("Temp",  self.temp, "°C"),
            ("Humid", self.humi, "%"),
        ]:
            lo, hi, avg = self._stat(lst)
            print(f"  {lbl:<22}: {lo} / {hi} / {avg} {unit}")
        print("=" * W)