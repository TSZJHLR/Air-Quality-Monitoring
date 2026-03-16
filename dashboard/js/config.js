// config.js — nodes, AQI colours/labels, shared history arrays

var NODES = [
  { id: "N1_Kathmandu", name: "Kathmandu", sub: "Ratna Park",    lat: 27.7041, lng: 85.3145, color: "#00c8f0" },
  { id: "N2_Bhaktapur", name: "Bhaktapur", sub: "Durbar Square", lat: 27.6710, lng: 85.4298, color: "#ff6b35" },
  { id: "N3_Lalitpur",  name: "Lalitpur",  sub: "Lagankhel",     lat: 27.6588, lng: 85.3247, color: "#00e599" },
  { id: "N4_Kirtipur",  name: "Kirtipur",  sub: "TU Campus",     lat: 27.6778, lng: 85.2789, color: "#ffc947" },
  { id: "N5_Tokha",     name: "Tokha",     sub: "Rural Rim",     lat: 27.7571, lng: 85.3247, color: "#ce93d8" },
];

var PROXY_URL = "http://localhost:8765/all";
var MAX_PTS   = 20;

// Rolling history — keeps the last MAX_PTS readings per node per pollutant
var history = {};
for (var i = 0; i < NODES.length; i++) {
  history[NODES[i].id] = { pm25: [], co: [], no2: [] };
}

function aqiColor(aqi) {
  if (aqi <= 50)  return "#00e599";
  if (aqi <= 100) return "#ffc947";
  if (aqi <= 150) return "#ff8c42";
  if (aqi <= 200) return "#ff4757";
  if (aqi <= 300) return "#b44cff";
  return "#7b1fa2";
}

function aqiLabel(aqi) {
  if (aqi <= 50)  return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Sensitive";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very Unhealthy";
  return "Hazardous";
}

function pushHistory(nodeId, pm25, co, no2) {
  var h = history[nodeId];
  h.pm25.push(pm25); if (h.pm25.length > MAX_PTS) h.pm25.shift();
  h.co.push(co);     if (h.co.length   > MAX_PTS) h.co.shift();
  h.no2.push(no2);   if (h.no2.length  > MAX_PTS) h.no2.shift();
}

// Save/load chart history so the graphs survive a page refresh
function saveHistory() {
  try {
    localStorage.setItem("aq_history", JSON.stringify(history));
  } catch (e) {}
}

function loadHistory() {
  try {
    var saved = JSON.parse(localStorage.getItem("aq_history") || "{}");
    for (var i = 0; i < NODES.length; i++) {
      var id = NODES[i].id;
      if (saved[id]) {
        history[id].pm25 = (saved[id].pm25 || []).slice(-MAX_PTS);
        history[id].co   = (saved[id].co   || []).slice(-MAX_PTS);
        history[id].no2  = (saved[id].no2  || []).slice(-MAX_PTS);
      }
    }
  } catch (e) {}
}

// Save/load the last full data snapshot so cards populate immediately on reload
function saveSnapshot(all) {
  try {
    var obj = {};
    for (var i = 0; i < NODES.length; i++) {
      if (all[i]) obj[NODES[i].id] = all[i];
    }
    localStorage.setItem("aq_snapshot", JSON.stringify(obj));
  } catch (e) {}
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
  } catch (e) {
    return null;
  }
}