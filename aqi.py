"""
aqi.py — AQI calculations, health risk scoring, and atmospheric correction factors.
Pure functions; no I/O, no side effects.
"""

import math
from collections import deque
from config import PM25_BP, PM10_BP, CO_BP, AQI_CATS, NOWCAST_WIN

def aqi_linear(concentration, breakpoints):
    """Convert a pollutant concentration to AQI using piecewise linear interpolation."""
    c = max(0.0, concentration)
    for c_lo, c_hi, i_lo, i_hi in breakpoints:
        if c_lo <= c <= c_hi:
            return int(round((i_hi - i_lo) / (c_hi - c_lo) * (c - c_lo) + i_lo))
    return 500  # above highest breakpoint → hazardous ceiling

def aqi_pm25(c): return aqi_linear(c, PM25_BP)
def aqi_pm10(c): return aqi_linear(c, PM10_BP)
def aqi_co(c):   return aqi_linear(c, CO_BP)

def aqi_composite(pm25, pm10, co):
    """Return the worst sub-index AQI across PM2.5, PM10, and CO."""
    return max(aqi_pm25(pm25), aqi_pm10(pm10), aqi_co(co))

def aqi_category(aqi):
    """Return (category label, colour string) for a given AQI integer."""
    for lo, hi, cat, col in AQI_CATS:
        if lo <= aqi <= hi:
            return cat, col
    return "Hazardous", "maroon"

def aqi_category_str(aqi):
    """Return only the category label (no colour)."""
    return aqi_category(aqi)[0]

def aqi_color_str(aqi):
    """Return only the colour string."""
    for lo, hi, _, col in AQI_CATS:
        if aqi <= hi:
            return col
    return "maroon"

_nowcast_buf: deque = deque(maxlen=NOWCAST_WIN)

def nowcast_aqi(pm25_now: float) -> int:
    """
    Append pm25_now to the rolling buffer and return a NowCast AQI.
    Uses the EPA weight-factor method: w = max(0.5, c_min/c_max).
    """
    _nowcast_buf.append(pm25_now)
    vals = list(_nowcast_buf)
    if len(vals) < 2:
        return aqi_pm25(pm25_now)
    c_max = max(vals)
    if not c_max:
        return 0
    w  = max((c_max - min(vals)) / c_max, 0.5)
    ws = sum(v * (w ** i) for i, v in enumerate(reversed(vals)))
    wt = sum(w ** i for i in range(len(vals)))
    return aqi_pm25(ws / wt)

def health_risk_score(pm25, co, no2, aqi):
    """Weighted composite health risk score 0–100."""
    s = (min(100, (pm25 / 250) * 100) * 0.50 +
         min(100, (aqi  / 500) * 100) * 0.25 +
         min(100, (co   /  35) * 100) * 0.15 +
         min(100, (no2  / 200) * 100) * 0.10)
    return round(s, 1)

def health_risk_label(score):
    if score <= 25: return "Low"
    if score <= 50: return "Moderate"
    if score <= 75: return "High"
    return "Very High"

def diurnal_factor(hour):
    """Traffic-shaped factor peaking near 08:00 and 19:00 (range ~0.6–1.6)."""
    return 0.60 + 0.40 * max(
        math.exp(-0.5 * ((hour - 8)  / 1.8) ** 2),
        math.exp(-0.5 * ((hour - 19) / 2.0) ** 2),
    ) * 2.5

def diurnal_sim(hour):
    """Alternative diurnal shape used by the single-node simulator (wider peaks)."""
    morn = 2.5 * math.exp(-0.5 * ((hour - 7.5)  / 1.5) ** 2)
    even = 2.2 * math.exp(-0.5 * ((hour - 18.5) / 1.5) ** 2)
    return max(0.5, min(0.6 + morn + even, 2.8))

def wind_dispersion(wind_speed):
    """Higher wind → better pollutant dispersion (min 0.25)."""
    return max(0.25, 1.0 - 0.065 * wind_speed)

def rain_washout(rain_mm):
    """Rainfall scavenges particulates from the air (min 0.30)."""
    return max(0.30, 1.0 - 0.06 * rain_mm)

def rain_scavenging(rain_mm):
    """Log-scale rain washout for single-node simulator."""
    return max(0.25, 1.0 - 0.08 * math.log1p(rain_mm)) if rain_mm > 0 else 1.0

def wind_chill(temp_c, wind_ms):
    """Steadman wind-chill; returns temp unchanged if conditions don't apply."""
    ws_kmh = wind_ms * 3.6
    if temp_c <= 10.0 and wind_ms >= 1.34:
        return round(13.12 + 0.6215*temp_c - 11.37*ws_kmh**0.16 + 0.3965*temp_c*ws_kmh**0.16, 1)
    return temp_c