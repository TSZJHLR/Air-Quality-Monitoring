// map.js — Leaflet map setup and per-node marker updates

var map = null;
var mapMarkers = {};

function initMap() {
  map = L.map("aq-map", {
    center: [27.7050, 85.3400],
    zoom: 11,
    zoomControl: true,
    attributionControl: false
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18
  }).addTo(map);

  for (var i = 0; i < NODES.length; i++) {
    addMarker(NODES[i]);
  }
}

function addMarker(node) {
  var icon = L.divIcon({
    className: "",
    html: '<div class="aq-marker-wrap">'
        +   '<div class="aq-pin" id="mpin-' + node.id + '" style="background:' + node.color + ';box-shadow:0 0 16px ' + node.color + '">—</div>'
        +   '<div class="aq-pin-lbl">' + node.name + '</div>'
        + '</div>',
    iconSize:   [56, 64],
    iconAnchor: [28, 64]
  });

  var marker = L.marker([node.lat, node.lng], { icon: icon }).addTo(map);
  marker.bindPopup("", { maxWidth: 260 });
  mapMarkers[node.id] = marker;
}

function updateMapMarker(node, data) {
  var aqi = parseInt(data.aqi) || 0;
  var col = aqiColor(aqi);

  var pin = document.getElementById("mpin-" + node.id);
  if (pin) {
    pin.textContent      = aqi || "—";
    pin.style.background = col;
    pin.style.boxShadow  = "0 0 18px " + col;
    pin.style.color      = aqi > 100 ? "#fff" : "#000";
  }

  var pm25 = parseFloat(data.pm25_ug_m3   || 0).toFixed(1);
  var pm10 = parseFloat(data.pm10_ug_m3   || 0).toFixed(1);
  var co   = parseFloat(data.co_ppm       || 0).toFixed(2);
  var temp = parseFloat(data.temperature_c|| 0).toFixed(1);
  var humi = parseFloat(data.humidity_pct || 0).toFixed(1);
  var wind = parseFloat(data.wind_speed_ms|| 0).toFixed(1);

  var evtLine = "";
  if (data.event_type && data.event_type !== "none") {
    evtLine = '<div style="margin-top:6px;color:' + col + ';font-weight:700">⚠ EVENT: ' + data.event_type.replace(/_/g, " ").toUpperCase() + '</div>';
  }

  var html = '<div class="map-popup">'
    + '<div class="map-popup-title">' + node.name + ' · ' + node.sub + '</div>'
    + '<div class="map-popup-aqi" style="color:' + col + '">' + aqi + '</div>'
    + '<div class="map-popup-cat" style="color:' + col + '">' + aqiLabel(aqi) + '</div>'
    + '<div class="map-popup-row"><span>PM2.5</span><span>' + pm25 + ' µg/m³</span></div>'
    + '<div class="map-popup-row"><span>PM10</span><span>' + pm10 + ' µg/m³</span></div>'
    + '<div class="map-popup-row"><span>CO</span><span>' + co + ' ppm</span></div>'
    + '<div class="map-popup-row"><span>Temp / Humi</span><span>' + temp + '°C / ' + humi + '%</span></div>'
    + '<div class="map-popup-row"><span>Wind</span><span>' + wind + ' m/s</span></div>'
    + evtLine
    + '</div>';

  var marker = mapMarkers[node.id];
  if (marker && marker.getPopup()) {
    marker.getPopup().setContent(html);
  }
}