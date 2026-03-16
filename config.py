import os

_SRC  = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_SRC)
DATA  = os.path.join(_ROOT, "iot/data")
os.makedirs(DATA, exist_ok=True)

OFFLINE_DB = os.path.join(DATA, "aq_offline_buffer.sqlite3")
CSV_LOG    = os.path.join(DATA, "session_log.csv")
LIVE_FILE  = os.path.join(DATA, "aq_live_data.json")

# Single-node simulator paths (different subdirectory)
SIM_DATA   = os.path.join(_ROOT, "data")
os.makedirs(SIM_DATA, exist_ok=True)
SIM_SQLITE = os.path.join(SIM_DATA, "aq_buffer.db")
SIM_CSV    = os.path.join(SIM_DATA, "aq_session_log.csv")
SIM_LOG    = os.path.join(SIM_DATA, "aq_simulation.log")

TB_HOST     = "thingsboard.cloud"
TB_PORT     = 1883
TOPIC_TELEM = "v1/devices/me/telemetry"
TOPIC_ATTR  = "v1/devices/me/attributes"

# Multi-node tokens
TOKENS = {
    "N1_Kathmandu": "johf3tIp00BsoBBwYYYz",
    "N2_Bhaktapur":  "w6ts4ozm606t6gxh4vrj",
    "N3_Lalitpur":   "ln5d9pu04syh2ceozdu4",
    "N4_Kirtipur":   "iXhVahuIKUIlwBCxZx7x1",
    "N5_Tokha":      "y3994vefchqelncnsl0s",
}

# Single-node primary token
SIM_TOKEN = "jXDKIEcYCcCQ7txGeCbo"

INTERVAL    = 15    # seconds between multi-node publish cycles
MAX_BACKOFF = 120   # cap on exponential reconnect delay (seconds)
NOWCAST_WIN = 12    # rolling window size for NowCast PM2.5
SIM_INTERVAL = 5   # seconds between single-node readings

NODES = [
    {"id": "N1_Kathmandu", "label": "Kathmandu - Ratna Park",   "token": TOKENS["N1_Kathmandu"],
     "lat": 27.7041, "lon": 85.3145, "zone": "urban_core",
     "pm25": 95.0,  "pm10": 148.0, "co": 3.8,  "co2": 520.0, "no2": 62.0,
     "temp": 18.5,  "humi": 62.0,  "traffic": 1.35, "kiln": 0.10},
    {"id": "N2_Bhaktapur", "label": "Bhaktapur - Durbar Square", "token": TOKENS["N2_Bhaktapur"],
     "lat": 27.6710, "lon": 85.4298, "zone": "semi_urban_industrial",
     "pm25": 110.0, "pm10": 165.0, "co": 3.2,  "co2": 490.0, "no2": 48.0,
     "temp": 17.8,  "humi": 58.0,  "traffic": 0.90, "kiln": 0.45},
    {"id": "N3_Lalitpur",  "label": "Lalitpur - Lagankhel",     "token": TOKENS["N3_Lalitpur"],
     "lat": 27.6588, "lon": 85.3247, "zone": "suburban",
     "pm25": 78.0,  "pm10": 120.0, "co": 2.5,  "co2": 465.0, "no2": 40.0,
     "temp": 19.2,  "humi": 65.0,  "traffic": 1.05, "kiln": 0.15},
    {"id": "N4_Kirtipur",  "label": "Kirtipur - TU Campus",     "token": TOKENS["N4_Kirtipur"],
     "lat": 27.6778, "lon": 85.2789, "zone": "peri_urban",
     "pm25": 62.0,  "pm10": 98.0,  "co": 1.8,  "co2": 440.0, "no2": 30.0,
     "temp": 20.1,  "humi": 68.0,  "traffic": 0.70, "kiln": 0.05},
    {"id": "N5_Tokha",     "label": "Tokha - Rural Rim",        "token": TOKENS["N5_Tokha"],
     "lat": 27.7571, "lon": 85.3247, "zone": "rural",
     "pm25": 48.0,  "pm10": 78.0,  "co": 1.2,  "co2": 415.0, "no2": 18.0,
     "temp": 16.8,  "humi": 72.0,  "traffic": 0.45, "kiln": 0.08},
]

PRIMARY_NODE = {
    "id": "KTM-NODE-01-RATNAPARK", "name": "Ratna Park",
    "lat": 27.7080, "lon": 85.3140, "type": "urban_traffic",
}

ALL_NODES = [
    {"id": "KTM-NODE-01-RATNAPARK", "name": "Ratna Park",  "lat": 27.7080, "lon": 85.3140, "type": "urban_traffic"},
    {"id": "KTM-NODE-02-BHAKTAPUR", "name": "Bhaktapur",   "lat": 27.6710, "lon": 85.4298, "type": "industrial"},
    {"id": "KTM-NODE-03-PULCHOWK",  "name": "Pulchowk",    "lat": 27.6788, "lon": 85.3172, "type": "educational"},
    {"id": "KTM-NODE-04-TEKU",      "name": "Teku",         "lat": 27.6933, "lon": 85.2973, "type": "urban_traffic"},
    {"id": "KTM-NODE-05-NAGARKOT",  "name": "Nagarkot",     "lat": 27.7163, "lon": 85.5185, "type": "rural_rim"},
]

NODE_TYPE_FACTOR = {
    "urban_traffic": 1.0, "industrial": 1.4,
    "educational":   0.7, "rural_rim":  0.3,
}

PM25_BP = [(0.0,9.0,0,50),(9.1,35.4,51,100),(35.5,55.4,101,150),
           (55.5,125.4,151,200),(125.5,225.4,201,300),(225.5,325.4,301,500)]
PM10_BP = [(0,54,0,50),(55,154,51,100),(155,254,101,150),
           (255,354,151,200),(355,424,201,300),(425,604,301,500)]
CO_BP   = [(0.0,4.4,0,50),(4.5,9.4,51,100),(9.5,12.4,101,150),
           (12.5,15.4,151,200),(15.5,30.4,201,300),(30.5,50.4,301,500)]

AQI_CATS = [
    (0,   50,  "Good",                           "green"),
    (51,  100, "Moderate",                        "yellow"),
    (101, 150, "Unhealthy for Sensitive Groups",  "orange"),
    (151, 200, "Unhealthy",                       "red"),
    (201, 300, "Very Unhealthy",                  "purple"),
    (301, 500, "Hazardous",                       "maroon"),
]

SEASONS = {
    1:(2.10,-4.0), 2:(2.20,-3.5), 3:(1.80,-1.0), 4:(1.60,1.5),
    5:(1.30, 4.0), 6:(0.55, 2.0), 7:(0.40, 1.5), 8:(0.45,1.0),
    9:(0.60, 0.5),10:(0.90,-0.5),11:(1.50,-2.0),12:(1.90,-3.5),
}

EVENT_MUL = {
    "traffic_jam":   {"pm25":2.2,"pm10":2.0,"co":3.5,"no2":2.8},
    "waste_burning": {"pm25":4.5,"pm10":4.2,"co":5.0,"no2":1.5},
    "brick_kiln":    {"pm25":5.5,"pm10":6.0,"co":2.0,"no2":1.8},
    "festival":      {"pm25":3.0,"pm10":2.8,"co":1.8,"no2":1.6},
}

ZONE_EVENTS = {
    "urban_core":            ["traffic_jam", "waste_burning"],
    "semi_urban_industrial": ["brick_kiln",  "waste_burning"],
    "suburban":              ["traffic_jam", "festival"],
}

# Single-node event table (richer set)
SIM_EVENTS = {
    "normal":         {"pm25":1.0,"co":1.0,"no2":1.0,"label":"Normal"},
    "traffic_jam":    {"pm25":2.8,"co":4.0,"no2":3.5,"label":"Traffic Jam"},
    "waste_burning":  {"pm25":5.0,"co":6.0,"no2":2.0,"label":"Waste Burning"},
    "brick_kiln":     {"pm25":3.5,"co":2.5,"no2":1.8,"label":"Brick Kiln Activity"},
    "festival_fires": {"pm25":4.0,"co":3.5,"no2":2.5,"label":"Festival Fires"},
    "dust_storm":     {"pm25":3.0,"co":1.0,"no2":1.0,"label":"Dust Storm"},
}

# CSV column order for multi-node session log
CSV_FIELDS = [
    "ts_utc","node_id","node_label","zone",
    "pm1_ug_m3","pm25_ug_m3","pm10_ug_m3","pm25_nowcast",
    "co_ppm","co2_ppm","no2_ppb","temperature_c","humidity_pct",
    "wind_speed_ms","wind_direction","pressure_hpa","rain_mm","wind_chill_c",
    "aqi","aqi_pm25","aqi_pm10","aqi_co","aqi_nowcast",
    "aqi_category","health_risk_score","event_active","event_type",
]

# CSV column order for single-node session log
SIM_CSV_FIELDS = [
    "timestamp","reading_no","node_id","pm1","pm25","pm10","co","co2","no2",
    "temperature","humidity","wind_speed","wind_dir","pressure","rain",
    "aqi","nowcast_aqi","aqi_category","health_risk_score","event_type","alert_level",
    "sent_mqtt","sent_http","buffered",
]