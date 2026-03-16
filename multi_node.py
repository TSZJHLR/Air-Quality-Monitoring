"""
multi_node.py — Multi-Node Simulation Loop
Kathmandu Valley Smart Air Quality Monitor
Group 15 | ITS67404 IoT | Taylor's University | Jan 2026

Orchestrates 5 sensor nodes: generate → log → publish → repeat.
All heavy logic lives in: config, aqi, transport, storage, sensor.
"""

import logging, random, sys, threading, time
from datetime import datetime

from config    import NODES, INTERVAL, TOPIC_TELEM, TOPIC_ATTR
from aqi       import aqi_pm25
from transport import ThingsBoardMQTT, http_publish, OfflineBuffer
from storage   import csv_log, write_live, SessionStats
from sensor    import SensorDataGenerator

log = logging.getLogger("AQ")
logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

BANNER = """
+----------------------------------------------------------------------+
|   Kathmandu Valley - Smart Air Quality Monitoring Simulator          |
|   Group 15  |  ITS67404 IoT  |  Taylor's University  |  Jan 2026   |
+----------------------------------------------------------------------+
"""

def startup_menu() -> dict:
    print(BANNER)
    print("  [1] Live   [2] Dry run   [3] High pollution demo   [4] Exit\n")
    c = input("  Select [1-4]: ").strip()
    if c == "4":
        sys.exit(0)
    mode = {"1":"live","2":"dry","3":"high"}.get(c, "live")
    if mode != "live":
        log.info(f"{mode} mode selected")
    return {"mode": mode, "force_high": mode == "high", "high_pm25": 220.0}

def _connect_all(clients):
    for cli, n in zip(clients, NODES):
        if not cli.connect():
            log.warning(f"{n['id']} MQTT failed — HTTP fallback active")

def _publish_attributes(clients):
    for cli, n in zip(clients, NODES):
        if cli._connected:
            cli.publish_attributes({
                "id": n["id"], "label": n.get("label", ""),
                "group": "Group 15", "module": "ITS67404",
                "university": "Taylor's University", "fw_version": "3.0.0",
            })
            log.info(f"{n['id']} attributes published")

def _apply_high_pollution(d: dict, cfg: dict) -> dict:
    d["pm25_ug_m3"] = cfg["high_pm25"] + random.uniform(0, 40)
    d["pm10_ug_m3"] = round(d["pm25_ug_m3"] * 1.55, 1)
    d.update({
        "aqi": aqi_pm25(d["pm25_ug_m3"]),
        "aqi_pm25": aqi_pm25(d["pm25_ug_m3"]),
        "aqi_category": "Very Unhealthy",
        "health_risk_score": 85,
        "event_active": 1,
        "event_type": "demo_high_pollution",
    })
    return d

def _print_row(d: dict):
    print(f"  [{d['node_id']:20s}]  PM2.5={d['pm25_ug_m3']:6.1f}  PM10={d['pm10_ug_m3']:6.1f}"
          f"  CO={d['co_ppm']:5.2f}  T={d['temperature_c']:5.1f}C  AQI={d['aqi']:3d} ({d['aqi_category'][:10]})")
    if d["event_active"]:
        print(f"  *** EVENT: {d['event_type'].upper()} ***")
    if d["aqi"] > 100:
        lvl = "UNHEALTHY" if d["aqi"] > 150 else "USG"
        print(f"  *** ALERT {lvl}: [{d['node_id']}] PM2.5={d['pm25_ug_m3']} AQI={d['aqi']} ***")

def _publish_node(d: dict, cli: ThingsBoardMQTT, n: dict, buf: OfflineBuffer, mode: str):
    if mode != "live":
        return
    payload = {k: v for k, v in d.items() if k != "ts_utc"}
    if cli._connected:
        if cli.publish(TOPIC_TELEM, payload):
            print(f"  -> MQTT sent [{d['node_id']}]")
        else:
            buf.store(d["node_id"], payload)
            log.warning(f"MQTT fail — buffered ({buf.pending_count()} pending)")
    else:
        if http_publish(n["token"], payload):
            print(f"  -> HTTP sent [{d['node_id']}]")
        else:
            buf.store(d["node_id"], payload)

def _reconnect_stale(clients, buf):
    for cli in clients:
        if not cli._connected:
            threading.Thread(target=cli.reconnect_with_backoff, daemon=True).start()
    buf.flush({n["id"]: c for n, c in zip(NODES, clients)})

def run_simulation(cfg: dict):
    buf     = OfflineBuffer()
    stats   = SessionStats()
    clients = [ThingsBoardMQTT(n["token"]) for n in NODES]
    gens    = [SensorDataGenerator(n) for n in NODES]

    if cfg["mode"] == "live":
        _connect_all(clients)
        _publish_attributes(clients)

    log.info(f"Simulation started — {len(NODES)} nodes, interval={INTERVAL}s")
    cycle = 0

    try:
        while True:
            cycle += 1
            print(f"\n{'='*72}\n  Cycle #{cycle:04d}  |  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n{'='*72}")

            for gen, cli, n in zip(gens, clients, NODES):
                d = gen.generate()
                if cfg.get("force_high"):
                    d = _apply_high_pollution(d, cfg)

                _print_row(d)

                for key in ("pm25_ug_m3","pm10_ug_m3","co_ppm","co2_ppm","no2_ppb","temperature_c","humidity_pct","aqi"):
                    stats.update(f"{d['node_id']}.{key}", d[key])

                csv_log(d)
                write_live(d["node_id"], d)
                _publish_node(d, cli, n, buf, cfg["mode"])
                time.sleep(0.5)

            if cfg["mode"] == "live":
                _reconnect_stale(clients, buf)

            print(f"\n  Cycle={cycle}  Buffered={buf.pending_count()}  Next in {INTERVAL}s ...")
            time.sleep(INTERVAL)

    except KeyboardInterrupt:
        print("\n\nStopped.")
    finally:
        stats.print_summary()
        if cfg["mode"] == "live":
            for cli in clients: cli.disconnect()
        from config import CSV_LOG, OFFLINE_DB
        print(f"\n  CSV    -> {CSV_LOG}\n  Buffer -> {OFFLINE_DB}")

def main():
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--auto", action="store_true")
    p.add_argument("--mode", default="live", choices=["live","dry","high"])
    args = p.parse_args()
    cfg  = {"mode":args.mode,"force_high":args.mode=="high","high_pm25":220.0} \
           if args.auto or not sys.stdin.isatty() else startup_menu()
    if args.auto:
        print(f"  [auto] {args.mode} mode")
    run_simulation(cfg)

if __name__ == "__main__":
    main()