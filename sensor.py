"""
sensor.py — sensor data generation for both multi-node and single-node simulators.

Provides:
  SensorDataGenerator  — per-node class used by multi_node.py
  generate_data        — stateless function used by simulator.py
  WeatherState         — mutable weather state shared across single-node cycles
  EventTracker         — tracks active pollution events for single-node simulator
"""

import math, random
from collections import deque
from datetime import datetime, timezone

from config import (
    SEASONS, EVENT_MUL, ZONE_EVENTS,
    SIM_EVENTS, NODE_TYPE_FACTOR, NOWCAST_WIN,
)
from aqi import (
    aqi_pm25, aqi_pm10, aqi_co, aqi_composite, aqi_category,
    diurnal_factor, diurnal_sim, wind_dispersion, rain_washout,
    rain_scavenging, wind_chill, health_risk_score, health_risk_label,
    nowcast_aqi,
)

import logging
log = logging.getLogger("AQ")

_NEUTRAL = {"pm25": 1.0, "pm10": 1.0, "co": 1.0, "no2": 1.0}

class SensorDataGenerator:
    """
    Generates realistic telemetry for one sensor node per call to generate().
    Applies diurnal, seasonal, wind, rain, and pollution-event multipliers.
    NowCast PM2.5 is computed from a rolling window of recent readings.
    """

    def __init__(self, node: dict):
        self.node        = node
        self._hist       = deque(maxlen=NOWCAST_WIN)
        self._evt_active = False
        self._evt_type   = None
        self._evt_dur    = 0

    # --- event management ---------------------------------------------------

    def _tick_event(self):
        """Decrement active event countdown, or randomly trigger a new one (2.5% chance)."""
        if self._evt_active:
            self._evt_dur -= 1
            if self._evt_dur <= 0:
                self._evt_active = False
                log.info(f"[{self.node['id']}] Event ended: {self._evt_type}")
            return
        if random.random() < 0.025:
            self._evt_type   = random.choice(ZONE_EVENTS.get(self.node["zone"], ["waste_burning"]))
            self._evt_dur    = random.randint(4, 12)
            self._evt_active = True
            log.warning(f"[{self.node['id']}] EVENT: {self._evt_type.upper()}")

    def _event_multipliers(self) -> dict:
        return EVENT_MUL.get(self._evt_type, _NEUTRAL) if self._evt_active else _NEUTRAL

    # --- NowCast ------------------------------------------------------------

    def _nowcast_pm25(self, current: float) -> float:
        self._hist.append(current)
        vals = list(self._hist)
        if len(vals) < 2:
            return current
        c_min, c_max = min(vals), max(vals)
        wr = max(0.5, c_min / c_max if c_max else 0.5)
        ws = wt = 0.0
        for i, v in enumerate(reversed(vals)):
            w = wr ** i; ws += w * v; wt += w
        return ws / wt if wt else current

    # --- main generation ----------------------------------------------------

    def generate(self) -> dict:
        """Return a full telemetry dict for the current timestamp."""
        now      = datetime.now(timezone.utc)
        hour     = now.hour + now.minute / 60.0
        sm, t_off = SEASONS.get(now.month, (1.0, 0.0))
        df       = diurnal_factor(hour)

        ws   = max(0.0, random.gauss(2.5, 1.2))
        wd   = random.uniform(0, 360)
        pr   = random.gauss(910.0, 1.5)
        rain = random.random() < (0.40 if now.month in range(6, 10) else 0.08)
        rmm  = random.uniform(0.5, 8.0) if rain else 0.0
        wf   = wind_dispersion(ws)
        rf   = rain_washout(rmm)

        self._tick_event()
        em = self._event_multipliers()
        n  = self.node

        pm25 = max(2.0,  round(n["pm25"]*sm*df*wf*rf*em["pm25"]*n["traffic"] + random.gauss(0, n["pm25"]*0.08), 1))
        pm10 = max(5.0,  round(n["pm10"]*sm*df*wf*rf*em["pm10"]              + random.gauss(0, n["pm10"]*0.09), 1))
        pm1  = max(1.0,  round(pm25 * random.uniform(0.55, 0.68), 1))
        co   = max(0.1,  round(n["co"] *sm*0.85*df*em["co"]                  + random.gauss(0, 0.30), 2))
        co2  = max(380.0,round(n["co2"] + 80.0*df*(sm - 1)                   + random.gauss(0, 12.0), 1))
        no2  = max(5.0,  round(n["no2"]*df*em["no2"]                         + random.gauss(0, 5.0),  1))
        temp = round(n["temp"] + t_off + 4*math.sin(math.pi*(hour-6)/12) + random.gauss(0, 0.5) - 0.5*rmm/4, 1)
        humi = min(99.0, max(10.0, round(n["humi"] + (20 if rain else 0) - 8*math.sin(math.pi*(hour-6)/12) + random.gauss(0, 3), 1)))
        wc   = wind_chill(temp, ws)

        ap, a0, ac = aqi_pm25(pm25), aqi_pm10(pm10), aqi_co(co)
        aqi_val    = max(ap, a0, ac)
        nc         = round(self._nowcast_pm25(pm25), 1)
        cat, col   = aqi_category(aqi_val)
        hrs        = min(100, round(0.40*min(ap,500)/5 + 0.20*min(a0,500)/5 + 0.20*min(ac,500)/5 + 0.20*(no2/200)*100, 1))

        return {
            "node_id": n["id"],   "node_label": n["label"],
            "latitude": n["lat"], "longitude":  n["lon"],  "zone": n["zone"],
            "ts_utc":  now.isoformat(),
            "pm1_ug_m3": pm1,  "pm25_ug_m3": pm25, "pm10_ug_m3": pm10, "pm25_nowcast": nc,
            "co_ppm":  co,     "co2_ppm": co2,     "no2_ppb": no2,
            "temperature_c": temp, "humidity_pct": humi,
            "wind_speed_ms":   round(ws, 2), "wind_direction": round(wd, 1),
            "pressure_hpa":    round(pr, 1), "rain_mm":        round(rmm, 2),
            "wind_chill_c":    wc,
            "aqi":         aqi_val, "aqi_pm25": ap, "aqi_pm10": a0, "aqi_co": ac,
            "aqi_nowcast": aqi_pm25(nc),
            "aqi_category": cat, "aqi_colour": col,
            "health_risk_score": hrs,
            "event_active": int(self._evt_active),
            "event_type":   self._evt_type or "none",
        }

class WeatherState:
    """Slowly-evolving weather state shared across simulator.py cycles."""

    def __init__(self):
        self.wind_speed = 3.0
        self.wind_dir   = 180.0
        self.pressure   = 1013.0
        self.rain       = 0.0

    def update(self) -> dict:
        mon = datetime.now().month
        target_wind = (random.gauss(4.5, 1.5) if 3 <= mon <= 5 else
                       random.gauss(3.0, 1.0) if 6 <= mon <= 9 else
                       random.gauss(1.5, 0.8))
        self.wind_speed = round(max(0.0, min(15.0,
            self.wind_speed + (self.wind_speed - target_wind) * -0.1 + random.gauss(0, 0.3))), 1)
        self.wind_dir   = round((self.wind_dir + random.gauss(0, 5)) % 360, 0)
        self.pressure   = round(max(990.0, min(1030.0, self.pressure + random.gauss(0, 0.2))), 1)
        rain_prob = 0.25 if 6 <= mon <= 9 else 0.05 if mon in (5, 10) else 0.01
        self.rain = (round(random.uniform(0.5, 15.0), 1) if random.random() < rain_prob
                     else round(max(0.0, self.rain * 0.6), 1))
        return {"wind_speed": self.wind_speed, "wind_dir": self.wind_dir,
                "pressure": self.pressure, "rain": self.rain}

class EventTracker:
    """Tracks the current pollution event for the single-node simulator."""

    def __init__(self, stats):
        self._event = "normal"
        self._left  = 0
        self._stats = stats   # reference to SimSessionStats for spike counting

    def tick(self, mode: str) -> str:
        if self._left > 0:
            self._left -= 1
            if self._left == 0:
                log.info("Event ended: %s — returning to normal.", self._event)
                self._event = "normal"
            return self._event

        if mode == "alert":
            self._event = "waste_burning"; self._left = 999
            return self._event

        if random.random() < 0.04:
            h, m = datetime.now().hour, datetime.now().month
            weights = {
                "traffic_jam":    3.0 if (6<=h<=9 or 17<=h<=20) else 0.5,
                "waste_burning":  2.0 if 16<=h<=20 else 0.3,
                "brick_kiln":     3.0 if m in (3,4,5,11,12,1,2) else 0.1,
                "festival_fires": 2.0 if m in (10,11) else 0.1,
                "dust_storm":     1.5 if m in (3,4,5) else 0.2,
            }
            total = sum(weights.values())
            r, cum = random.uniform(0, total), 0
            for evt, w in weights.items():
                cum += w
                if r <= cum:
                    self._event = evt; break
            self._left = random.randint(4, 12)
            self._stats.spikes += 1
            log.warning("EVENT: %s (%d readings)", SIM_EVENTS[self._event]["label"], self._left)
        return self._event

_weather = WeatherState()   # module-level singleton; reset per simulator run if needed

def generate_data(high: bool = False, test: bool = False,
                  event: str = "normal", node: dict = None) -> dict:
    """
    Generate one sensor reading for the single-node simulator.
    node defaults to PRIMARY_NODE from config if not provided.
    """
    from config import PRIMARY_NODE
    node = node or PRIMARY_NODE

    if test:
        c = 35.4; aqi_v = aqi_pm25(c); hrs = health_risk_score(c, 0.8, 15.0, aqi_v)
        return {
            "pm1": 10.0, "pm25": c, "pm10": 55.0, "co": 0.8, "co2": 420.0, "no2": 15.0,
            "temperature": 18.0, "humidity": 55.0,
            "wind_speed": 2.5, "wind_dir": 180.0, "pressure": 1013.0, "rain": 0.0,
            "aqi": aqi_v, "nowcast_aqi": aqi_v, "aqi_category": aqi_category(aqi_v)[0],
            "health_risk_score": hrs, "health_risk_label": health_risk_label(hrs),
            "event_type": "test", "node_id": node["id"], "node_name": node["name"],
            "latitude": node["lat"], "longitude": node["lon"],
        }

    wx  = _weather.update()
    ev  = SIM_EVENTS.get(event, SIM_EVENTS["normal"])
    df  = diurnal_sim(datetime.now().hour + datetime.now().minute / 60.0)
    sf  = {1:2.3,2:2.1,3:1.9,4:2.0,5:1.7,6:0.8,7:0.5,8:0.5,9:0.6,10:1.1,11:1.6,12:2.1}.get(datetime.now().month, 1.0)
    nf  = NODE_TYPE_FACTOR.get(node["type"], 1.0)
    cf  = df * sf * nf * wind_dispersion(wx["wind_speed"]) * rain_scavenging(wx["rain"])
    mon = datetime.now().month

    pm25 = (round(random.uniform(160, 320), 1) if high else
            round(max(2.0, random.gauss(42, 10)*cf*ev["pm25"] + (random.uniform(15, 50) if random.random() < 0.07 else 0)), 1))
    pm10 = round(pm25 * random.uniform(1.7, 2.2), 1)
    pm1  = round(pm25 * random.uniform(0.48, 0.70), 1)
    temp = round(15.5 + 9.5 * math.sin(math.pi * (mon - 3.5) / 6) + random.gauss(0, 2), 1)
    hm, hs = ((84,6) if 6<=mon<=9 else (44,9) if mon in(12,1,2) else (52,10) if mon in(3,4,5) else (62,8))
    humi = round(max(10, min(99, random.gauss(hm, hs))), 1)
    co   = (round(random.uniform(9, 22), 2)   if high else round(max(0.1, random.gauss(1.5, 0.5)*cf*ev["co"]),  2))
    no2  = (round(random.uniform(90, 200), 1) if high else round(max(1.0, random.gauss(28, 9)*cf*ev["no2"]), 1))
    co2  = round(max(380, random.gauss(460, 50) * (1 + (cf*ev["pm25"] - 1) * 0.22)), 1)

    aqi_v = aqi_pm25(pm25)
    nc    = nowcast_aqi(pm25)
    cat   = aqi_category(aqi_v)[0]
    hrs   = health_risk_score(pm25, co, no2, aqi_v)

    return {
        "pm1": pm1, "pm25": pm25, "pm10": pm10,
        "co": co, "co2": co2, "no2": no2,
        "temperature": temp, "humidity": humi,
        "wind_speed": wx["wind_speed"], "wind_dir": wx["wind_dir"],
        "pressure": wx["pressure"],     "rain": wx["rain"],
        "aqi": aqi_v, "nowcast_aqi": nc, "aqi_category": cat,
        "health_risk_score": hrs, "health_risk_label": health_risk_label(hrs),
        "event_type": event, "event_label": ev["label"],
        "node_id": node["id"], "node_name": node["name"],
        "latitude": node["lat"], "longitude": node["lon"], "node_type": node["type"],
    }