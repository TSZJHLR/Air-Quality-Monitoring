// ui.js — node cards, gauges, sparklines, ticker, alarms, KPIs

var sparkCharts = {};
var alarmList   = [];
var alarmKeys   = {};
var prevKPIs    = {};   // stores previous KPI values for trend arrows

// ── CLOCK ─────────────────────────────────────────────────────────────────────
function startClock() {
  setInterval(function() {
    document.getElementById("clock").textContent = new Date().toLocaleTimeString("en-GB");
  }, 1000);
}

// ── THEME TOGGLE ──────────────────────────────────────────────────────────────
function initThemeToggle() {
  var saved = localStorage.getItem("aq_theme") || "dark";
  applyTheme(saved);

  document.getElementById("theme-btn").addEventListener("click", function() {
    var current = document.documentElement.getAttribute("data-theme") || "dark";
    var next    = current === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("aq_theme", next);
    if (typeof refreshChartTheme === "function") refreshChartTheme();
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  var lbl = document.getElementById("theme-lbl");
  if (lbl) lbl.textContent = theme === "dark" ? "Light" : "Dark";
}

// ── KPI CARDS ─────────────────────────────────────────────────────────────────
// KPI definitions — what each card shows, its color token, and a helper
var KPI_DEFS = [
  { id: "k-nodes",  icon: "",   label: "Nodes Online",     sub: "",                         color: "#0072b2" },
  { id: "k-aqi",    icon: "",   label: "Avg AQI",          sub: "Valley average",           color: "#c89a1a" },
  { id: "k-pm25",   icon: "",   label: "Avg PM2.5 µg/m³",  sub: "WHO safe limit: 15 µg/m³", color: "#009e73" },
  { id: "k-temp",   icon: "",   label: "Avg Temperature",  sub: "°C across all nodes",      color: "#cc79a7" },
  { id: "k-alarm",  icon: "",   label: "Active Alarms",    sub: "AQI > 100",                color: "#d4641a" },
];

function buildKPIs() {
  var row = document.getElementById("kpi-row");
  var html = "";
  KPI_DEFS.forEach(function(kpi) {
    html += '<div class="kpi" style="--kpi-color:' + kpi.color + '">'
      + '<div class="kpi-header">'
      +   '<span class="kpi-icon" aria-hidden="true">' + kpi.icon + '</span>'
      +   '<span class="kpi-trend" id="trend-' + kpi.id + '">—</span>'
      + '</div>'
      + '<div class="kpi-val" id="' + kpi.id + '">—</div>'
      + '<div class="kpi-lbl">' + kpi.label + '</div>'
      + '<div class="kpi-sub" id="sub-' + kpi.id + '">' + kpi.sub + '</div>'
      + '</div>';
  });
  row.innerHTML = html;
}

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

  var avgAqi  = count ? Math.round(aqiSum / count) : 0;
  var avgPm25 = count ? (pm25Sum / count) : 0;
  var avgTemp = count ? (tempSum / count) : 0;

  setKPI("k-nodes", okNodes + "/5",        prevKPIs.nodes,  okNodes,    "nodes");
  setKPI("k-aqi",   count ? avgAqi : "—",  prevKPIs.aqi,    avgAqi,     "aqi");
  setKPI("k-pm25",  count ? avgPm25.toFixed(1) : "—", prevKPIs.pm25, avgPm25, "pm25");
  setKPI("k-temp",  count ? avgTemp.toFixed(1) : "—", prevKPIs.temp, avgTemp, "temp");

  // Dynamic sub-label for AQI card
  if (count) {
    var subEl = document.getElementById("sub-k-aqi");
    if (subEl) subEl.textContent = aqiAdvice(avgAqi);
    var subPm = document.getElementById("sub-k-pm25");
    if (subPm) {
      subPm.textContent = avgPm25 > 15
        ? "⚠ Above WHO limit (" + avgPm25.toFixed(1) + ")"
        : "Within WHO safe limit";
      subPm.style.color = avgPm25 > 15 ? "var(--orange)" : "var(--green)";
    }
  }

  prevKPIs = { nodes: okNodes, aqi: avgAqi, pm25: avgPm25, temp: avgTemp };
}

function setKPI(id, display, prev, curr, type) {
  var el = document.getElementById(id);
  if (el) el.textContent = display;

  var trendEl = document.getElementById("trend-" + id);
  if (!trendEl || prev === undefined) return;

  var diff = curr - prev;
  var absDiff = Math.abs(diff);

  if (absDiff < 0.5) {
    trendEl.textContent = "—";
    trendEl.className = "kpi-trend";
    return;
  }

  // For AQI, PM2.5, alarms: up = bad; for nodes: up = good
  var upIsBad = (type === "aqi" || type === "pm25");
  var arrow   = diff > 0 ? "▲" : "▼";
  var cls     = diff > 0
    ? (upIsBad ? "kpi-trend up warn" : "kpi-trend up")
    : (upIsBad ? "kpi-trend down"    : "kpi-trend down warn");

  trendEl.textContent = arrow + " " + absDiff.toFixed(type === "temp" ? 1 : 0);
  trendEl.className   = cls;
}

// ── NODE CARDS ────────────────────────────────────────────────────────────────
function buildCards() {
  var html = buildCardsHTML();
  document.getElementById("node-grid").innerHTML = html;
  var detail = document.getElementById("node-grid-detail");
  if (detail) detail.innerHTML = html;
}

function buildCardsHTML() {
  var html = "";
  for (var i = 0; i < NODES.length; i++) {
    var n = NODES[i];
    html += '<div class="node" id="node-' + n.id + '" style="--nc:' + n.color + '">'
      + '<div class="node-accent"></div>'
      + '<div class="node-row">'

      + '<div class="node-identity">'
      +   '<div class="node-name">' + n.name + '</div>'
      +   '<div class="node-sub-loc">' + n.sub + '</div>'
      + '</div>'

      + '<div class="node-aqi">'
      +   '<div class="node-aqi-num" id="aqi-' + n.id + '" style="color:' + n.color + '">—</div>'
      +   '<div class="node-aqi-lbl" id="cat-' + n.id + '">AQI</div>'
      + '</div>'

      + '<div class="node-metrics">'
      +   '<div class="nm"><span class="nm-l">PM2.5</span> <span class="nm-v" id="pm25-'   + n.id + '">—</span><span class="nm-u"> µg</span></div>'
      +   '<div class="nm"><span class="nm-l">PM10</span>  <span class="nm-v" id="pm10-'   + n.id + '">—</span><span class="nm-u"> µg</span></div>'
      +   '<div class="nm"><span class="nm-l">CO</span>    <span class="nm-v" id="co-'     + n.id + '">—</span><span class="nm-u"> ppm</span></div>'
      +   '<div class="nm"><span class="nm-l">NO2</span>   <span class="nm-v" id="no2-'    + n.id + '">—</span><span class="nm-u"> ppb</span></div>'
      +   '<div class="nm"><span class="nm-l">Temp</span>  <span class="nm-v" id="temp-'   + n.id + '">—</span><span class="nm-u"> °C</span></div>'
      +   '<div class="nm"><span class="nm-l">Humi</span>  <span class="nm-v" id="humi-'   + n.id + '">—</span><span class="nm-u"> %</span></div>'
      +   '<div class="nm"><span class="nm-l">Wind</span>  <span class="nm-v" id="wind-'   + n.id + '">—</span><span class="nm-u"> m/s</span></div>'
      +   '<div class="nm"><span class="nm-l">Risk</span>  <span class="nm-v" id="risk-'   + n.id + '">—</span><span class="nm-u">/100</span></div>'
      + '</div>'

      + '<div class="node-status-chip">'
      +   '<div class="online-dot" id="dot-' + n.id + '"></div>'
      +   '<span id="status-' + n.id + '">Offline</span>'
      + '</div>'

      + '</div>'
      + '<div class="node-bar-bg"><div class="node-bar-fg" id="bar-' + n.id + '" style="width:0%;background:' + n.color + '"></div></div>'
      + '</div>';
  }
  return html;
}

function updateCard(node, data) {
  var aqi  = parseInt(data.aqi)             || 0;
  var pm25 = parseFloat(data.pm25_ug_m3)    || 0;
  var pm10 = parseFloat(data.pm10_ug_m3)      || 0;
  var temp = parseFloat(data.temperature_c)   || 0;
  var humi = parseFloat(data.humidity_pct)    || 0;
  var co   = parseFloat(data.co_ppm)          || 0;
  var no2  = parseFloat(data.no2_ppb)         || 0;
  var wind = parseFloat(data.wind_speed_ms)   || 0;
  var risk = parseFloat(data.health_risk_score) || 0;
  var col  = aqiColor(aqi);
  var pct  = Math.min(100, Math.round(aqi / 5));

  var aqiEl = document.getElementById("aqi-" + node.id);
  if (aqiEl) { aqiEl.textContent = aqi || "—"; aqiEl.style.color = col; }

  var catEl = document.getElementById("cat-" + node.id);
  if (catEl) { catEl.textContent = aqiLabel(aqi); catEl.style.color = col; }

  var card = document.getElementById("node-" + node.id);
  if (card) {
    card.style.setProperty("--nc", col);
    var accent = card.querySelector(".node-accent");
    if (accent) accent.style.background = col;
  }

  var f = function(id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };
  f("pm25-" + node.id, pm25.toFixed(1));
  f("pm10-" + node.id, pm10.toFixed(1));
  f("co-"   + node.id, co.toFixed(2));
  f("no2-"  + node.id, no2.toFixed(1));
  f("temp-" + node.id, temp.toFixed(1));
  f("humi-" + node.id, humi.toFixed(1));
  f("wind-" + node.id, wind.toFixed(1));
  f("risk-" + node.id, Math.round(risk));

  var barEl = document.getElementById("bar-" + node.id);
  if (barEl) { barEl.style.width = pct + "%"; barEl.style.background = col; }

  var dotEl = document.getElementById("dot-" + node.id);
  if (dotEl) dotEl.className = "online-dot on";
  var statusEl = document.getElementById("status-" + node.id);
  if (statusEl) statusEl.textContent = "Online";

  pushHistory(node.id, pm25, co, no2);
  updateGauge(node, aqi);
  updateSpark(node, pm25);
  if (aqi > 100) pushAlarm(node, data);
}

function setFirstText(id, value) {
  var el = document.getElementById(id);
  if (!el) return;
  if (el.childNodes[0]) { el.childNodes[0].textContent = value; }
  else { el.textContent = value; }
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
      +   '<svg viewBox="0 0 120 70" width="96" height="56" role="img" aria-label="AQI gauge for ' + n.name + '">'
      +     '<path d="M10,65 A50,50 0 0,1 110,65" fill="none" stroke="var(--bg3)" stroke-width="8" stroke-linecap="round"/>'
      +     '<path id="garc-' + n.id + '" d="M10,65 A50,50 0 0,1 110,65" fill="none" stroke="' + n.color + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="0 157" style="transition:stroke-dasharray 1s ease,stroke .5s"/>'
      +     '<line id="gneedle-' + n.id + '" x1="60" y1="65" x2="60" y2="22" stroke="var(--text2)" stroke-width="1.5" stroke-linecap="round" style="transform-origin:60px 65px;transform:rotate(-90deg);transition:transform 1s ease"/>'
      +     '<circle cx="60" cy="65" r="4" fill="var(--bg1)" stroke="var(--text2)" stroke-width="1.5"/>'
      +   '</svg>'
      +   '<div class="gauge-val">'
      +     '<div class="gauge-num" id="gnum-' + n.id + '" style="color:' + n.color + '">—</div>'
      +     '<div class="gauge-unit">AQI</div>'
      +   '</div>'
      + '</div>'
      + '<div class="gauge-cat" id="gcat-' + n.id + '">—</div>'
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
    html += '<div class="spark-card" style="border-color:' + n.color + '40">'
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
            backgroundColor: n.color + "22",
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.35,
            fill: true
          }]
        },
        options: {
          responsive: false,
          maintainAspectRatio: false,
          animation: { duration: 200 },
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
    var n      = NODES[i];
    var aqi    = parseInt(r.aqi) || 0;
    var cls    = aqi > 200 ? "crit" : aqi > 100 ? "warn" : "hi";
    var pm25str = parseFloat(r.pm25_ug_m3   || 0).toFixed(1);
    var tempstr = parseFloat(r.temperature_c|| 0).toFixed(1);
    parts.push('<span class="' + cls + '">' + n.name + '</span>: AQI ' + aqi + ' (' + aqiLabel(aqi) + ') &nbsp;·&nbsp; PM2.5 ' + pm25str + ' µg/m³ &nbsp;·&nbsp; ' + tempstr + '°C');
    if (r.event_type && r.event_type !== "none") {
      parts.push('<span class="warn">! EVENT @ ' + n.name + ': ' + r.event_type.replace(/_/g, " ").toUpperCase() + '</span>');
    }
  }
  if (parts.length > 0) {
    var txt = parts.join("  &nbsp;·····&nbsp;  ");
    document.getElementById("ticker-text").innerHTML = txt + "  &nbsp;·····&nbsp;  " + txt;
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
  var sev  = aqi > 200 ? "CRIT" : aqi > 150 ? "HIGH" : "WARN";
  var col  = aqiColor(aqi);

  var item = '<div class="alarm-item' + cls + '">'
    + '<span class="alarm-sev" style="color:' + col + '">' + sev + '</span>'
    + '<div class="alarm-body">'
    +   '<strong>' + node.name + '</strong>'
    +   ' AQI <strong style="color:' + col + '">' + aqi + '</strong> &middot; ' + aqiLabel(aqi)
    +   '<div class="alarm-detail">PM2.5 ' + pm25 + ' &middot; CO ' + co + ' ppm' + evtTxt + '</div>'
    + '</div>'
    + '<span class="alarm-time">' + new Date().toLocaleTimeString() + '</span>'
    + '</div>';

  alarmList.unshift(item);
  if (alarmList.length > 50) alarmList.pop();

  document.getElementById("alarm-list").innerHTML = alarmList.join("");
  document.getElementById("k-alarm").textContent  = alarmList.length;

  // Update trend for alarm KPI
  var tEl = document.getElementById("trend-k-alarm");
  if (tEl) { tEl.textContent = "▲ " + alarmList.length; tEl.className = "kpi-trend up warn"; }
}