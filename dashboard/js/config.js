// config.js — nodes, colorblind-safe palette, AQI helpers, history, storage

// ── NODE DEFINITIONS ─────────────────────────────────────────────────────────
// Colors use the Wong (2011) colorblind-safe palette
var NODES = [
  { id: "N1_Kathmandu", name: "Kathmandu", sub: "Ratna Park", lat: 27.7041, lng: 85.3145, color: "#0072b2" }, // Blue
  { id: "N2_Bhaktapur", name: "Bhaktapur", sub: "Durbar Square", lat: 27.6710, lng: 85.4298, color: "#e69f00" }, // Orange
  { id: "N3_Lalitpur", name: "Lalitpur", sub: "Lagankhel", lat: 27.6588, lng: 85.3247, color: "#009e73" }, // Bluish-green
  { id: "N4_Kirtipur", name: "Kirtipur", sub: "TU Campus", lat: 27.6778, lng: 85.2789, color: "#cc79a7" }, // Reddish-purple
  { id: "N5_Tokha", name: "Tokha", sub: "Rural Rim", lat: 27.7571, lng: 85.3247, color: "#56b4e9" }, // Sky blue
];

var PROXY_URL = "http://localhost:8765/all";
var MAX_PTS = 20;

// ── ROLLING HISTORY ───────────────────────────────────────────────────────────
var history = {};
for (var i = 0; i < NODES.length; i++) {
  history[NODES[i].id] = { pm25: [], co: [], no2: [] };
}

// ── AQI COLOUR — also uses distinct symbols in charts (not red/green pairs) ──
function aqiColor(aqi) {
  if (aqi <= 50) return "#1a9c5a"; // green
  if (aqi <= 100) return "#c89a1a"; // amber
  if (aqi <= 150) return "#d4641a"; // orange
  if (aqi <= 200) return "#c8383a"; // red
  if (aqi <= 300) return "#7c5cbf"; // purple
  return "#5a1a7a";                 // maroon
}

function aqiLabel(aqi) {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Sensitive";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very Unhealthy";
  return "Hazardous";
}

// Returns a short health advisory for the KPI card context line
function aqiAdvice(aqi) {
  if (aqi <= 50) return "Air quality satisfactory";
  if (aqi <= 100) return "Sensitive groups take care";
  if (aqi <= 150) return "Limit prolonged outdoor activity";
  if (aqi <= 200) return "Everyone may feel effects";
  if (aqi <= 300) return "Health warnings in effect";
  return "Emergency conditions";
}

// ── HISTORY MANAGEMENT ───────────────────────────────────────────────────────
function pushHistory(nodeId, pm25, co, no2) {
  var h = history[nodeId];
  h.pm25.push(pm25); if (h.pm25.length > MAX_PTS) h.pm25.shift();
  h.co.push(co); if (h.co.length > MAX_PTS) h.co.shift();
  h.no2.push(no2); if (h.no2.length > MAX_PTS) h.no2.shift();
}

function saveHistory() {
  try { localStorage.setItem("aq_history", JSON.stringify(history)); } catch (e) { }
}

function loadHistory() {
  try {
    var saved = JSON.parse(localStorage.getItem("aq_history") || "{}");
    for (var i = 0; i < NODES.length; i++) {
      var id = NODES[i].id;
      if (saved[id]) {
        history[id].pm25 = (saved[id].pm25 || []).slice(-MAX_PTS);
        history[id].co = (saved[id].co || []).slice(-MAX_PTS);
        history[id].no2 = (saved[id].no2 || []).slice(-MAX_PTS);
      }
    }
  } catch (e) { }
}

// ── SNAPSHOT ─────────────────────────────────────────────────────────────────
function saveSnapshot(all) {
  try {
    var obj = {};
    for (var i = 0; i < NODES.length; i++) {
      if (all[i]) obj[NODES[i].id] = all[i];
    }
    localStorage.setItem("aq_snapshot", JSON.stringify(obj));
  } catch (e) { }
}

function loadSnapshot() {
  try {
    var obj = JSON.parse(localStorage.getItem("aq_snapshot") || "null");
    if (!obj) return null;
    var result = [];
    for (var i = 0; i < NODES.length; i++) {
      result.push(obj[NODES[i].id] || { _ok: false });
    }
    return result;
  } catch (e) { return null; }
}