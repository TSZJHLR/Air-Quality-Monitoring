// ui.js — node cards, AQI gauges, sparklines, ticker, alarms, KPIs

var sparkCharts = {};
var alarmList   = [];
var alarmKeys   = {};

// ── CLOCK ────────────────────────────────────────────────────────────────────

function startClock() {
  setInterval(function() {
    document.getElementById("clock").textContent = new Date().toLocaleTimeString("en-GB");
  }, 1000);
}

// ── NODE CARDS ────────────────────────────────────────────────────────────────

function buildCards() {
  var html = "";
  for (var i = 0; i < NODES.length; i++) {
    var n = NODES[i];
    html += '<div class="node" id="node-' + n.id + '" style="--nc:' + n.color + '">'
      + '<div class="node-accent"></div>'
      + '<div class="node-top">'
      +   '<div>'
      +     '<div class="node-id">'   + n.id   + '</div>'
      +     '<div class="node-name">' + n.name + '</div>'
      +     '<div style="font-size:10px;color:var(--muted);margin-top:2px">' + n.sub + '</div>'
      +   '</div>'
      +   '<div class="node-aqi">'
      +     '<div class="node-aqi-num" id="aqi-' + n.id + '" style="color:' + n.color + '">—</div>'
      +     '<div class="node-aqi-lbl">AQI</div>'
      +   '</div>'
      + '</div>'
      + '<div class="node-grid">'
      +   '<div class="nm"><div class="nm-l">PM2.5</div>   <div class="nm-v" id="pm25-' + n.id + '">—<span class="nm-u"> µg/m³</span></div></div>'
      +   '<div class="nm"><div class="nm-l">PM10</div>    <div class="nm-v" id="pm10-' + n.id + '">—<span class="nm-u"> µg/m³</span></div></div>'
      +   '<div class="nm"><div class="nm-l">Temp</div>    <div class="nm-v" id="temp-' + n.id + '">—<span class="nm-u"> °C</span></div></div>'
      +   '<div class="nm"><div class="nm-l">Humidity</div><div class="nm-v" id="humi-' + n.id + '">—<span class="nm-u"> %</span></div></div>'
      + '</div>'
      + '<div class="node-bar-row">'
      +   '<div class="node-bar-info"><span id="cat-' + n.id + '">Waiting...</span><span id="bar-pct-' + n.id + '"></span></div>'
      +   '<div class="node-bar-bg"><div class="node-bar-fg" id="bar-' + n.id + '" style="width:0%;background:' + n.color + '"></div></div>'
      + '</div>'
      + '<div class="node-foot">'
      +   '<div class="node-online"><div class="online-dot" id="dot-' + n.id + '"></div><span id="status-' + n.id + '">Offline</span></div>'
      +   '<div class="node-updated" id="ts-' + n.id + '">—</div>'
      + '</div>'
      + '</div>';
  }
  document.getElementById("node-grid").innerHTML = html;
}

function updateCard(node, data) {
  var aqi  = parseInt(data.aqi)              || 0;
  var pm25 = parseFloat(data.pm25_ug_m3)     || 0;
  var pm10 = parseFloat(data.pm10_ug_m3)     || 0;
  var temp = parseFloat(data.temperature_c)  || 0;
  var humi = parseFloat(data.humidity_pct)   || 0;
  var co   = parseFloat(data.co_ppm)         || 0;
  var no2  = parseFloat(data.no2_ppb)        || 0;
  var col  = aqiColor(aqi);
  var pct  = Math.min(100, Math.round(aqi / 5));

  // Update AQI number and node accent colour
  var aqiEl = document.getElementById("aqi-" + node.id);
  aqiEl.textContent  = aqi || "—";
  aqiEl.style.color  = col;

  var card = document.getElementById("node-" + node.id);
  card.style.setProperty("--nc", col);
  var accent = card.querySelector(".node-accent");
  accent.style.background = col;
  accent.style.boxShadow  = "0 0 12px " + col;

  // Update metric cells — keep the unit <span> intact by only changing the text node
  setFirstText("pm25-" + node.id, pm25.toFixed(1));
  setFirstText("pm10-" + node.id, pm10.toFixed(1));
  setFirstText("temp-" + node.id, temp.toFixed(1));
  setFirstText("humi-" + node.id, humi.toFixed(1));

  // Category label and AQI bar
  var catEl = document.getElementById("cat-" + node.id);
  catEl.textContent = aqiLabel(aqi);
  catEl.style.color = col;
  document.getElementById("bar-pct-" + node.id).textContent  = pct + "%";
  document.getElementById("bar-" + node.id).style.width      = pct + "%";
  document.getElementById("bar-" + node.id).style.background = col;

  // Status footer
  document.getElementById("dot-"    + node.id).className    = "online-dot on";
  document.getElementById("status-" + node.id).textContent  = "Online";
  document.getElementById("ts-"     + node.id).textContent  = new Date().toLocaleTimeString();

  // Push into rolling history and update sub-components
  pushHistory(node.id, pm25, co, no2);
  updateGauge(node, aqi);
  updateSpark(node, pm25);
  if (aqi > 100) pushAlarm(node, data);
}

// Sets only the first text node so child <span> elements are not overwritten
function setFirstText(id, value) {
  var el = document.getElementById(id);
  if (!el) return;
  if (el.childNodes[0]) {
    el.childNodes[0].textContent = value;
  } else {
    el.textContent = value;
  }
}

// ── AQI GAUGES ────────────────────────────────────────────────────────────────

function buildGauges() {
  var html = "";
  for (var i = 0; i < NODES.length; i++) {
    var n = NODES[i];
    html += '<div class="gauge-card">'
      + '<div class="gauge-node">'    + n.name + '</div>'
      + '<div class="gauge-sub-lbl">' + n.sub  + '</div>'
      + '<div class="gauge-wrap">'
      +   '<svg viewBox="0 0 120 70" width="120" height="70">'
      +     '<path d="M10,65 A50,50 0 0,1 110,65" fill="none" stroke="#1c2a38" stroke-width="8" stroke-linecap="round"/>'
      +     '<path id="garc-' + n.id + '" d="M10,65 A50,50 0 0,1 110,65" fill="none" stroke="' + n.color + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="0 157" style="transition:stroke-dasharray 1s ease,stroke .5s"/>'
      +     '<line id="gneedle-' + n.id + '" x1="60" y1="65" x2="60" y2="22" stroke="#d0e4f0" stroke-width="1.5" stroke-linecap="round" style="transform-origin:60px 65px;transform:rotate(-90deg);transition:transform 1s ease"/>'
      +     '<circle cx="60" cy="65" r="4" fill="#0b1017" stroke="#d0e4f0" stroke-width="1.5"/>'
      +   '</svg>'
      +   '<div class="gauge-val">'
      +     '<div class="gauge-num" id="gnum-' + n.id + '" style="color:' + n.color + '">—</div>'
      +     '<div class="gauge-unit">AQI</div>'
      +   '</div>'
      + '</div>'
      + '<div class="gauge-cat" id="gcat-' + n.id + '" style="color:' + n.color + '">—</div>'
      + '</div>';
  }
  document.getElementById("gauge-row").innerHTML = html;
}

function updateGauge(node, aqi) {
  var col    = aqiColor(aqi);
  var pct    = Math.min(1, aqi / 300);
  var arcLen = 157;
  var filled = pct * arcLen;

  var arc    = document.getElementById("garc-"    + node.id);
  var needle = document.getElementById("gneedle-" + node.id);
  var num    = document.getElementById("gnum-"    + node.id);
  var cat    = document.getElementById("gcat-"    + node.id);

  if (arc)    { arc.style.strokeDasharray = filled + " " + (arcLen - filled); arc.style.stroke = col; }
  if (needle) { needle.style.transform = "rotate(" + (-90 + pct * 180) + "deg)"; }
  if (num)    { num.textContent = aqi || "—"; num.style.color = col; }
  if (cat)    { cat.textContent = aqiLabel(aqi); cat.style.color = col; }
}

// ── SPARKLINES ────────────────────────────────────────────────────────────────

function buildSparks() {
  var html = "";
  for (var i = 0; i < NODES.length; i++) {
    var n = NODES[i];
    html += '<div class="spark-card" style="border-color:' + n.color + '33">'
      + '<div class="spark-top">'
      +   '<div>'
      +     '<div class="spark-name" style="color:' + n.color + '">' + n.name + '</div>'
      +     '<div style="font-family:var(--mono);font-size:8px;color:var(--muted)">PM2.5 µg/m³</div>'
      +   '</div>'
      +   '<div><div class="spark-val" id="sv-' + n.id + '" style="color:' + n.color + '">—</div><div class="spark-lbl">CURRENT</div></div>'
      + '</div>'
      + '<canvas class="spark-canvas" id="sc-' + n.id + '" height="46"></canvas>'
      + '</div>';
  }
  document.getElementById("spark-row").innerHTML = html;

  for (var i = 0; i < NODES.length; i++) {
    var n = NODES[i];
    sparkCharts[n.id] = new Chart(
      document.getElementById("sc-" + n.id).getContext("2d"), {
        type: "line",
        data: {
          labels: [],
          datasets: [{
            data: [],
            borderColor: n.color,
            backgroundColor: n.color + "18",
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: false,
          maintainAspectRatio: false,
          animation: { duration: 250 },
          plugins: { legend: { display: false } },
          scales: { x: { display: false }, y: { display: false } }
        }
      }
    );
  }
}

function updateSpark(node, pm25) {
  var sc = sparkCharts[node.id];
  if (!sc) return;
  sc.data.labels.push("");
  sc.data.datasets[0].data.push(pm25);
  if (sc.data.labels.length > MAX_PTS) {
    sc.data.labels.shift();
    sc.data.datasets[0].data.shift();
  }
  sc.update("none");
  var el = document.getElementById("sv-" + node.id);
  if (el) el.textContent = pm25.toFixed(1);
}

// ── TICKER ────────────────────────────────────────────────────────────────────

function updateTicker(all) {
  var parts = [];
  for (var i = 0; i < all.length; i++) {
    var r = all[i];
    if (!r || !r._ok) continue;
    var n   = NODES[i];
    var aqi = parseInt(r.aqi) || 0;
    var cls = aqi > 200 ? "crit" : aqi > 100 ? "warn" : "hi";
    var pm25str = parseFloat(r.pm25_ug_m3  || 0).toFixed(1);
    var tempstr = parseFloat(r.temperature_c|| 0).toFixed(1);
    parts.push('<span class="' + cls + '">' + n.name + '</span>: AQI ' + aqi + ' (' + aqiLabel(aqi) + ') &nbsp;·&nbsp; PM2.5 ' + pm25str + ' µg/m³ &nbsp;·&nbsp; ' + tempstr + '°C');
    if (r.event_type && r.event_type !== "none") {
      parts.push('<span class="warn">⚠ EVENT @ ' + n.name + ': ' + r.event_type.replace(/_/g, " ").toUpperCase() + '</span>');
    }
  }
  if (parts.length > 0) {
    var txt = parts.join(" &nbsp;&nbsp;·····&nbsp;&nbsp; ");
    document.getElementById("ticker-text").innerHTML = txt + " &nbsp;&nbsp;·····&nbsp;&nbsp; " + txt;
  }
}

// ── ALARM LOG ─────────────────────────────────────────────────────────────────

function pushAlarm(node, data) {
  var aqi = parseInt(data.aqi) || 0;
  var key = node.id + "-" + Math.floor(Date.now() / 20000);
  if (alarmKeys[key]) return;
  alarmKeys[key] = true;

  var pm25   = parseFloat(data.pm25_ug_m3 || 0).toFixed(1);
  var co     = parseFloat(data.co_ppm     || 0).toFixed(2);
  var evtTxt = (data.event_type && data.event_type !== "none")
    ? " · EVENT: " + data.event_type.replace(/_/g, " ").toUpperCase() : "";
  var cls  = aqi > 200 ? "" : " warn";
  var icon = aqi > 200 ? "🔴" : aqi > 150 ? "🟠" : "🟡";
  var col  = aqiColor(aqi);

  var item = '<div class="alarm-item' + cls + '">'
    + '<span class="alarm-icon">' + icon + '</span>'
    + '<div class="alarm-body">'
    +   '<strong>' + node.name + ' (' + node.id + ')</strong> — AQI <strong style="color:' + col + '">' + aqi + '</strong> · ' + aqiLabel(aqi)
    +   '<div class="alarm-detail">PM2.5 ' + pm25 + ' µg/m³ · CO ' + co + ' ppm' + evtTxt + '</div>'
    + '</div>'
    + '<span class="alarm-time">' + new Date().toLocaleTimeString() + '</span>'
    + '</div>';

  alarmList.unshift(item);
  if (alarmList.length > 50) alarmList.pop();

  document.getElementById("alarm-list").innerHTML = alarmList.join("");
  document.getElementById("k-alarm").textContent  = alarmList.length;
}

// ── KPI ROW ───────────────────────────────────────────────────────────────────

function updateKPIs(all) {
  var okNodes = 0, aqiSum = 0, pm25Sum = 0, tempSum = 0, count = 0;
  for (var i = 0; i < all.length; i++) {
    var r = all[i];
    if (!r || !r._ok) continue;
    okNodes++;
    aqiSum  += parseInt(r.aqi)             || 0;
    pm25Sum += parseFloat(r.pm25_ug_m3)    || 0;
    tempSum += parseFloat(r.temperature_c) || 0;
    count++;
  }
  document.getElementById("k-nodes").textContent = okNodes + "/5";
  document.getElementById("k-aqi").textContent   = count ? Math.round(aqiSum  / count) : "—";
  document.getElementById("k-pm25").textContent  = count ? (pm25Sum / count).toFixed(1) : "—";
  document.getElementById("k-temp").textContent  = count ? (tempSum / count).toFixed(1) : "—";
}