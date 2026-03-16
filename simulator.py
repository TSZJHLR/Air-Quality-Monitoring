"""
simulator.py — Single-Node Simulation Loop
Kathmandu Valley Smart Air Quality Monitor
Group 15 | ITS67404 IoT | Taylor's University | Jan 2026

Simulates the primary node (Ratna Park) only.
All heavy logic lives in: config, aqi, transport, storage, sensor.
For multi-node simulation use multi_node.py.
"""

import logging, signal, sys, time
from datetime import datetime

from config    import PRIMARY_NODE, ALL_NODES, SIM_TOKEN, SIM_INTERVAL, SIM_SQLITE, SIM_CSV, SIM_LOG, TOPIC_TELEM, TOPIC_ATTR
from aqi       import aqi_pm25, aqi_category, health_risk_score, health_risk_label, nowcast_aqi
from transport import ThingsBoardMQTT, http_publish_urllib, OfflineBuffer
from storage   import sim_init_csv, sim_append_csv, SimSessionStats
from sensor    import generate_data, EventTracker, WeatherState

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
log = logging.getLogger("AQ-Node")
_fh = logging.FileHandler(SIM_LOG, encoding="utf-8")
_fh.setFormatter(logging.Formatter("%(asctime)s  %(levelname)-8s  %(message)s", datefmt="%Y-%m-%d %H:%M:%S"))
log.addHandler(_fh)

PM25_ALERT = 55.5
PM25_CRIT  = 150.5
AQI_ALERT  = 100

SEP = "  " + "-" * 56

def _aqi_color(aqi):
    for threshold, color in [(50,"GREEN"),(100,"YELLOW"),(150,"ORANGE"),(200,"RED"),(300,"PURPLE")]:
        if aqi <= threshold: return color
    return "MAROON"

def print_banner(stats: SimSessionStats):
    W   = 70
    tok = SIM_TOKEN[:6] + "*" * 18
    print(f"\n{'='*W}\n  GROUP 15  |  ITS67404 Internet of Things  |  Assessment 3")
    print(f"  Kathmandu Valley Smart Air Quality Monitoring — Single Node\n{'='*W}")
    for lbl, val in [
        ("Primary Node",  PRIMARY_NODE["id"]),
        ("Location",      f"{PRIMARY_NODE['name']}, Kathmandu, Nepal"),
        ("ThingsBoard",   "thingsboard.cloud:1883"),
        ("Access Token",  tok),
        ("Interval",      f"{SIM_INTERVAL}s"),
        ("SQLite",        "ENABLED -> " + SIM_SQLITE),
        ("CSV Log",       SIM_CSV),
    ]: print(f"  {lbl:<16}: {val}")
    print("=" * W + "\n")

def print_reading(p: dict, n: int, mqtt_ok: bool, http_ok: bool, buffered: bool):
    ts     = datetime.now().strftime("%Y-%m-%d  %H:%M:%S")
    aqi    = p["aqi"]
    status = ("SENT [MQTT]"        if mqtt_ok  else
              "SENT [HTTP]"        if http_ok  else
              "BUFFERED [SQLite]"  if buffered else "DROPPED")
    evt    = p.get("event_label", "Normal")
    alert  = ("  <<< CRITICAL >>>" if p["pm25"] > PM25_CRIT  else
              "  <<< ALERT >>>"    if p["pm25"] > PM25_ALERT else "")

    print(f"\n{'='*70}\n  [{ts}]  Reading #{n:05d}{alert}")
    print(f"  Status: {status}   |   Event: {evt}\n{SEP}")
    for lbl, val, unit, note in [
        ("PM1.0",    p["pm1"],                  "ug/m3", ""),
        ("PM2.5",    p["pm25"],                 "ug/m3", " (WHO 24h: 15 ug/m3)"),
        ("PM10",     p["pm10"],                 "ug/m3", ""),
        ("CO",       p["co"],                   "ppm",   " (WHO 8h: 9 ppm)"),
        ("CO2",      p["co2"],                  "ppm",   ""),
        ("NO2",      p["no2"],                  "ppb",   " (WHO annual: 10 ug/m3)"),
        ("Temp",     p["temperature"],          "C",     ""),
        ("Humidity", p["humidity"],             "%",     ""),
        ("Wind",     p.get("wind_speed", 0),    "m/s",   ""),
        ("Pressure", p.get("pressure",  0),     "hPa",   ""),
        ("Rain",     p.get("rain",      0),     "mm/h",  ""),
    ]: print(f"    {lbl:<12}: {val:>8}  {unit}{note}")
    print(SEP)
    print(f"    AQI         : {aqi:>8d}  [{_aqi_color(aqi)}]  {p['aqi_category']}")
    print(f"    NowCast AQI : {p.get('nowcast_aqi', aqi):>8d}  (12-reading avg)")
    print(f"    Risk Score  : {p.get('health_risk_score', 0):>8.1f} / 100  ({p.get('health_risk_label','N/A')})")
    print("=" * 70)
    log.info("PM2.5=%.1f PM10=%.1f T=%.1fC H=%.1f%% CO=%.2f AQI=%d NC=%d Risk=%.0f Evt=%s %s",
             p["pm25"], p["pm10"], p["temperature"], p["humidity"],
             p["co"], aqi, p.get("nowcast_aqi", aqi),
             p.get("health_risk_score", 0), evt, p["aqi_category"])

def startup_menu() -> str:
    print("-"*62 + "\n  SELECT SIMULATION MODE\n" + "-"*62)
    print("  [1] Normal  [2] Alert Demo  [3] Self-Test  [4] Offline\n" + "-"*62)
    while True:
        c = input("  Enter [1/2/3/4] (default=1): ").strip()
        if c in ("", "1"): return "normal"
        if c == "2":       return "alert"
        if c == "3":       return "test"
        if c == "4":       return "offline"
        print("  Enter 1-4.")

def run_self_test():
    print("  AQI Self-Test:")
    cases = [
        (0.0,   0,   "Good"),
        (9.0,  50,   "Good"),
        (9.1,  51,   "Moderate"),
        (35.4, 100,  "Moderate"),
        (35.5, 101,  "Unhealthy for Sensitive Groups"),
        (55.5, 151,  "Unhealthy"),
        (125.5,201,  "Very Unhealthy"),
    ]
    passed = 0
    for c, exp, cat in cases:
        got = aqi_pm25(c)
        ok  = (got == exp and aqi_category(got)[0] == cat)
        if ok: passed += 1
        print(f"  PM2.5={c:>6.1f}  exp={exp:>4d}  got={got:>4d}  {'PASS' if ok else 'FAIL'}")
    print(f"\n  {passed}/{len(cases)} passed.\n")

def _build_and_connect(attempts=6) -> tuple:
    """Return (ThingsBoardMQTT, is_connected)."""
    cli = ThingsBoardMQTT(SIM_TOKEN)
    # override client id style for single-node
    ok  = cli.connect()
    if ok:
        cli.publish_attributes({"nodes": ALL_NODES, "firmware": "v2.0", "group": "Group15"})
    return cli, ok

def main():
    stats = SimSessionStats()
    print_banner(stats)
    mode  = startup_menu(); print()

    if mode == "test":
        run_self_test(); return

    sim_init_csv()
    buf = OfflineBuffer(db_path=SIM_SQLITE)

    client, is_conn = None, False
    from transport import PAHO_AVAILABLE
    if PAHO_AVAILABLE and mode != "offline":
        client, is_conn = _build_and_connect()
    elif mode == "offline":
        log.info("OFFLINE MODE — MQTT disabled.")
    else:
        log.warning("paho-mqtt unavailable — HTTP fallback only.")

    if mode == "alert":
        log.warning("ALERT DEMO — PM2.5 > 150 to trigger alarms.")

    evt_tracker = EventTracker(stats)
    log.info("Running. Ctrl+C to stop.\n")
    signal.signal(signal.SIGINT, lambda s, f: (_ for _ in ()).throw(KeyboardInterrupt()))

    counter = 0
    try:
        while True:
            counter += 1
            event    = evt_tracker.tick(mode)
            p        = generate_data(high=(mode == "alert"), event=event, node=PRIMARY_NODE)
            mqtt_ok  = http_ok = buffered = False

            if is_conn and PAHO_AVAILABLE and mode != "offline":
                mqtt_ok = client.publish(TOPIC_TELEM, p)
                if not mqtt_ok:
                    is_conn = False

            if not mqtt_ok and mode != "offline":
                log.warning("MQTT unavailable — HTTP fallback ...")
                http_ok = http_publish_urllib(SIM_TOKEN, p)
                if http_ok: log.info("HTTP succeeded.")

            if not mqtt_ok and not http_ok:
                buf.store(PRIMARY_NODE["id"], p); buffered = True
                log.warning("Buffered. Unsent: %d", buf.pending_count())
                if mode != "offline" and PAHO_AVAILABLE:
                    try: client.disconnect()
                    except: pass
                    stats.reconnects += 1
                    client, is_conn = _build_and_connect(attempts=3)

            print_reading(p, counter, mqtt_ok, http_ok, buffered)
            stats.record(p, mqtt_ok, http_ok, buffered)
            sim_append_csv(p, counter, mqtt_ok, http_ok, buffered)
            time.sleep(SIM_INTERVAL)

    except KeyboardInterrupt:
        print(f"\n\n  Stopped after {counter} readings.")
    finally:
        if client and PAHO_AVAILABLE:
            try: client.disconnect(); log.info("MQTT disconnected.")
            except: pass
        stats.print_summary(); print()
        for f in [SIM_CSV, SIM_LOG, SIM_SQLITE]:
            import os
            if os.path.exists(f):
                extra = f"  ({buf.pending_count()} unsent)" if f == SIM_SQLITE else ""
                print(f"  Saved: {f}{extra}")
        print()

if __name__ == "__main__":
    main()