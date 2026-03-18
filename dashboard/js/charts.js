// charts.js — Chart.js with maintainAspectRatio:false and proportional axes

var charts = {};

function chartTheme() {
  var isDark = document.documentElement.getAttribute("data-theme") !== "light";
  return {
    grid:   isDark ? "rgba(42,53,69,0.45)"  : "rgba(168,159,148,0.3)",
    tick:   isDark ? "#4a6070"              : "#8a8078",
    legend: isDark ? "#c0d8e8"              : "#2a2018",
    font:   "'JetBrains Mono', monospace"
  };
}

function tickStyle(t) {
  return { color: t.tick, font: { family: t.font, size: 8 }, maxTicksLimit: 5 };
}

function baseOpts(t, unit) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { color: t.legend, font: { family: t.font, size: 8 }, boxWidth: 10, padding: 8 } },
      tooltip: {
        backgroundColor: "rgba(18,22,28,0.92)",
        titleFont: { family: t.font, size: 8 },
        bodyFont:  { family: t.font, size: 8 },
        borderColor: "rgba(77,168,212,0.2)", borderWidth: 1,
        padding: 6
      }
    },
    scales: {
      x: {
        grid: { display: false },        /* no vertical gridlines — cleaner */
        border: { display: false },
        ticks: tickStyle(t)
      },
      y: {
        grid: { color: t.grid, drawBorder: false },
        border: { display: false, dash: [3,3] },
        ticks: Object.assign({}, tickStyle(t), { callback: function(v) { return v + (unit||""); } }),
        beginAtZero: false
      }
    }
  };
}

function baseBarOpts(t, unit, horizontal) {
  var o = baseOpts(t, unit);
  o.interaction = { mode: "index", intersect: false };
  o.plugins.legend = { display: false };
  o.indexAxis = horizontal ? "y" : "x";
  /* Bar charts should start at zero so bar lengths are meaningful */
  o.scales.y.beginAtZero = true;
  if (horizontal) o.scales.x.beginAtZero = true;
  return o;
}

// ── INIT ──────────────────────────────────────────────────────
function initCharts() {
  charts.pm25   = makeLineChart("c-pm25",  "PM2.5 µg/m³", " µg");
  charts.co     = makeLineChart("c-co",    "CO ppm",      " ppm");
  charts.no2    = makeLineChart("c-no2",   "NO₂ ppb",     " ppb");
  charts.aqiBar = makeBarChart("c-aqi-h",  "AQI",   "",      true);
  charts.health = makeBarChart("c-health", "Risk",  "",      false);
  charts.pm10   = makeBarChart("c-pm10",   "PM10",  " µg",   false);
  charts.wind   = makeBarChart("c-wind",   "Wind",  " m/s",  false);
  charts.th     = makeTempHumidChart();

  charts.health.options.scales.y.max = 100;
  charts.health.options.scales.y.beginAtZero = true;
  charts.health.update("none");
}

// ── LINE CHART ───────────────────────────────────────────────
function makeLineChart(canvasId, yLabel, unit) {
  var t = chartTheme();
  var dashes = [[], [5,3], [2,3], [8,3,2,3], [4,2,4,2]];
  var datasets = NODES.map(function(n, i) {
    return {
      label: n.name,
      data: [],
      borderColor: n.color,
      backgroundColor: n.color + "14",
      borderWidth: 1.8,
      pointRadius: 2,
      pointHoverRadius: 4,
      tension: 0.32,
      fill: false,
      borderDash: dashes[i] || []
    };
  });

  var opts = baseOpts(t, unit);
  opts.scales.y.title = { display: true, text: yLabel, color: t.tick, font: { family: t.font, size: 8 } };

  return new Chart(document.getElementById(canvasId).getContext("2d"), {
    type: "line",
    data: { labels: makeLabels(MAX_PTS), datasets: datasets },
    options: opts
  });
}

// ── BAR CHART ────────────────────────────────────────────────
function makeBarChart(canvasId, label, unit, horizontal) {
  var t = chartTheme();
  var colors  = NODES.map(function(n) { return n.color + "aa"; });
  var borders = NODES.map(function(n) { return n.color; });

  return new Chart(document.getElementById(canvasId).getContext("2d"), {
    type: "bar",
    data: {
      labels: NODES.map(function(n) { return n.name; }),
      datasets: [{ label: label, data: [0,0,0,0,0], backgroundColor: colors, borderColor: borders, borderWidth: 1.5, borderRadius: 4 }]
    },
    options: baseBarOpts(t, unit, horizontal)
  });
}

// ── TEMP / HUMIDITY ──────────────────────────────────────────
function makeTempHumidChart() {
  var t = chartTheme();
  var opts = baseBarOpts(t, "", false);
  opts.plugins.legend = { labels: { color: t.legend, font: { family: t.font, size: 9 }, boxWidth: 10 } };

  return new Chart(document.getElementById("c-th").getContext("2d"), {
    type: "bar",
    data: {
      labels: NODES.map(function(n) { return n.name; }),
      datasets: [
        { label: "Temp °C",    data: [0,0,0,0,0], backgroundColor: "rgba(214,100,26,0.55)", borderColor: "#d4641a", borderWidth: 1.5, borderRadius: 4 },
        { label: "Humidity %", data: [0,0,0,0,0], backgroundColor: "rgba(0,114,178,0.45)",  borderColor: "#0072b2", borderWidth: 1.5, borderRadius: 4 }
      ]
    },
    options: opts
  });
}

// ── THEME REFRESH ────────────────────────────────────────────
function refreshChartTheme() {
  var t = chartTheme();
  var all = [charts.pm25, charts.co, charts.no2, charts.aqiBar, charts.health, charts.th, charts.pm10, charts.wind];
  all.forEach(function(c) {
    if (!c) return;
    if (c.options.plugins.legend && c.options.plugins.legend.labels) c.options.plugins.legend.labels.color = t.legend;
    ["x","y"].forEach(function(ax) {
      if (!c.options.scales[ax]) return;
      if (c.options.scales[ax].grid)  c.options.scales[ax].grid.color  = t.grid;
      if (c.options.scales[ax].ticks) c.options.scales[ax].ticks.color = t.tick;
      if (c.options.scales[ax].title) c.options.scales[ax].title.color = t.tick;
    });
    c.update("none");
  });
}

// ── UPDATE ───────────────────────────────────────────────────
function updateCharts(all) {
  for (var i = 0; i < NODES.length; i++) {
    var id = NODES[i].id;
    charts.pm25.data.datasets[i].data = history[id].pm25.slice();
    charts.co.data.datasets[i].data   = history[id].co.slice();
    charts.no2.data.datasets[i].data  = history[id].no2.slice();
  }
  charts.pm25.update();
  charts.co.update();
  charts.no2.update();

  var temps=[],humis=[],aqis=[],pm10s=[],winds=[],health=[];
  var aqiColors=[],aqiBorders=[];
  for (var i = 0; i < all.length; i++) {
    var r = all[i], ok = r && r._ok;
    temps.push(ok  ? parseFloat(r.temperature_c)    ||0:0);
    humis.push(ok  ? parseFloat(r.humidity_pct)     ||0:0);
    aqis.push(ok   ? parseInt(r.aqi)                ||0:0);
    pm10s.push(ok  ? parseFloat(r.pm10_ug_m3)       ||0:0);
    winds.push(ok  ? parseFloat(r.wind_speed_ms)    ||0:0);
    health.push(ok ? parseFloat(r.health_risk_score)||0:0);
    var col = aqiColor(aqis[i]);
    aqiColors.push(col+"aa"); aqiBorders.push(col);
  }

  charts.th.data.datasets[0].data = temps;
  charts.th.data.datasets[1].data = humis;
  charts.th.update();

  charts.aqiBar.data.datasets[0].data            = aqis;
  charts.aqiBar.data.datasets[0].backgroundColor = aqiColors;
  charts.aqiBar.data.datasets[0].borderColor     = aqiBorders;
  charts.aqiBar.update();

  charts.health.data.datasets[0].data            = health;
  charts.health.data.datasets[0].backgroundColor = aqiColors;
  charts.health.data.datasets[0].borderColor     = aqiBorders;
  charts.health.update();

  charts.pm10.data.datasets[0].data = pm10s;
  charts.pm10.update();

  charts.wind.data.datasets[0].data = winds;
  charts.wind.update();
}

function seedLineCharts() {
  if (!charts.pm25) return;
  for (var i = 0; i < NODES.length; i++) {
    var id = NODES[i].id;
    charts.pm25.data.datasets[i].data = history[id].pm25.slice();
    charts.co.data.datasets[i].data   = history[id].co.slice();
    charts.no2.data.datasets[i].data  = history[id].no2.slice();
  }
  charts.pm25.update("none");
  charts.co.update("none");
  charts.no2.update("none");
}

function makeLabels(n) {
  var a = []; for (var i=1;i<=n;i++) a.push(i); return a;
}