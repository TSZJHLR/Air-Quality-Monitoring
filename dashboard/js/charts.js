// charts.js — Chart.js setup and updates
// One object holds all chart instances so any file can call updateCharts()

var charts = {};

var GRID_COLOR = "rgba(28,42,56,0.8)";
var TICK_STYLE = { color: "#3d5870", font: { family: "JetBrains Mono", size: 9 } };

function initCharts() {
  charts.pm25   = makeLineChart("c-pm25", "PM2.5 µg/m³", " µg");
  charts.co     = makeLineChart("c-co",   "CO ppm",      " ppm");
  charts.no2    = makeLineChart("c-no2",  "NO₂ ppb",     " ppb");
  charts.aqiBar = makeBarChart("c-aqi-h", "AQI",  "", true);
  charts.pm10   = makeBarChart("c-pm10",  "PM10", " µg");
  charts.wind   = makeBarChart("c-wind",  "Wind", " m/s");
  charts.health = makeBarChart("c-health","Risk", "");
  charts.th     = makeTempHumidChart();

  // health risk tops out at 100
  charts.health.options.scales.y.max = 100;
  charts.health.update();
}

function makeLineChart(canvasId, yLabel, unit) {
  var datasets = [];
  for (var i = 0; i < NODES.length; i++) {
    var n = NODES[i];
    datasets.push({
      label: n.name,
      data: [],
      borderColor: n.color,
      backgroundColor: n.color + "12",
      borderWidth: 1.8,
      pointRadius: 2,
      tension: 0.4,
      fill: false
    });
  }
  return new Chart(document.getElementById(canvasId).getContext("2d"), {
    type: "line",
    data: {
      labels: makeLabels(MAX_PTS),
      datasets: datasets
    },
    options: {
      responsive: true,
      animation: { duration: 400 },
      plugins: {
        legend: { labels: { color: "#d0e4f0", font: { family: "JetBrains Mono", size: 9 }, boxWidth: 10, padding: 12 } }
      },
      scales: {
        x: { grid: { color: GRID_COLOR }, ticks: TICK_STYLE },
        y: {
          grid: { color: GRID_COLOR },
          ticks: Object.assign({}, TICK_STYLE, { callback: function(v) { return v + unit; } }),
          title: { display: true, text: yLabel, color: "#3d5870", font: { family: "JetBrains Mono", size: 9 } }
        }
      }
    }
  });
}

function makeBarChart(canvasId, label, unit, horizontal) {
  var colors = [];
  var borders = [];
  for (var i = 0; i < NODES.length; i++) {
    colors.push(NODES[i].color + "99");
    borders.push(NODES[i].color);
  }
  return new Chart(document.getElementById(canvasId).getContext("2d"), {
    type: "bar",
    data: {
      labels: NODES.map(function(n) { return n.name; }),
      datasets: [{
        label: label,
        data: [0, 0, 0, 0, 0],
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: horizontal ? "y" : "x",
      responsive: true,
      animation: { duration: 400 },
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: GRID_COLOR }, ticks: TICK_STYLE },
        y: { grid: { color: GRID_COLOR }, ticks: Object.assign({}, TICK_STYLE, { callback: function(v) { return v + unit; } }) }
      }
    }
  });
}

function makeTempHumidChart() {
  return new Chart(document.getElementById("c-th").getContext("2d"), {
    type: "bar",
    data: {
      labels: NODES.map(function(n) { return n.name; }),
      datasets: [
        { label: "Temp °C",    data: [0,0,0,0,0], backgroundColor: "#ff675588", borderColor: "#ff6755", borderWidth: 1.5, borderRadius: 4 },
        { label: "Humidity %", data: [0,0,0,0,0], backgroundColor: "#00c8f055", borderColor: "#00c8f0", borderWidth: 1.5, borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      animation: { duration: 400 },
      plugins: { legend: { labels: { color: "#d0e4f0", font: { family: "JetBrains Mono", size: 9 }, boxWidth: 10 } } },
      scales: {
        x: { grid: { color: GRID_COLOR }, ticks: TICK_STYLE },
        y: { grid: { color: GRID_COLOR }, ticks: TICK_STYLE }
      }
    }
  });
}

function updateCharts(all) {
  // Line charts use rolling history arrays
  for (var i = 0; i < NODES.length; i++) {
    var id = NODES[i].id;
    charts.pm25.data.datasets[i].data = history[id].pm25.slice();
    charts.co.data.datasets[i].data   = history[id].co.slice();
    charts.no2.data.datasets[i].data  = history[id].no2.slice();
  }
  charts.pm25.update();
  charts.co.update();
  charts.no2.update();

  // Bar charts use the current snapshot values
  var temps   = [], humis  = [], aqis   = [];
  var pm10s   = [], winds  = [], health = [];
  var aqiColors = [], aqiBorders = [];

  for (var i = 0; i < all.length; i++) {
    var r = all[i];
    var ok = r && r._ok;
    temps.push(ok  ? parseFloat(r.temperature_c)   || 0 : 0);
    humis.push(ok  ? parseFloat(r.humidity_pct)    || 0 : 0);
    aqis.push(ok   ? parseInt(r.aqi)               || 0 : 0);
    pm10s.push(ok  ? parseFloat(r.pm10_ug_m3)      || 0 : 0);
    winds.push(ok  ? parseFloat(r.wind_speed_ms)   || 0 : 0);
    health.push(ok ? parseFloat(r.health_risk_score)|| 0 : 0);
    var col = aqiColor(aqis[i]);
    aqiColors.push(col + "99");
    aqiBorders.push(col);
  }

  charts.th.data.datasets[0].data = temps;
  charts.th.data.datasets[1].data = humis;
  charts.th.update();

  charts.aqiBar.data.datasets[0].data            = aqis;
  charts.aqiBar.data.datasets[0].backgroundColor = aqiColors;
  charts.aqiBar.data.datasets[0].borderColor     = aqiBorders;
  charts.aqiBar.update();

  charts.pm10.data.datasets[0].data = pm10s;
  charts.pm10.update();

  charts.wind.data.datasets[0].data = winds;
  charts.wind.update();

  charts.health.data.datasets[0].data            = health;
  charts.health.data.datasets[0].backgroundColor = aqiColors;
  charts.health.data.datasets[0].borderColor     = aqiBorders;
  charts.health.update();
}

// Seed line charts right after loadHistory() on page load
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
  var labels = [];
  for (var i = 1; i <= n; i++) labels.push(i);
  return labels;
}