// app.js — fetch loop and page startup

var fetchTimer = null;
var isFetching = false;
var lastGood   = {};

// ── FETCH ─────────────────────────────────────────────────────────────────────
function fetchAll() {
  if (isFetching) return;
  isFetching = true;

  var xhr = new XMLHttpRequest();
  xhr.open("GET", PROXY_URL);
  xhr.timeout = 5000;

  xhr.onload = function() {
    isFetching = false;
    if (xhr.status !== 200) {
      showMsg("⚠ Proxy returned " + xhr.status, "err");
      return;
    }

    var obj;
    try { obj = JSON.parse(xhr.responseText); }
    catch (e) { showMsg("⚠ Bad response from proxy", "err"); return; }

    if (obj._waiting) {
      showMsg("⏳ Waiting for simulator first cycle ...", "err");
      return;
    }

    var all = [];
    for (var i = 0; i < NODES.length; i++) {
      var id    = NODES[i].id;
      var fresh = obj[id];
      if (fresh && fresh._ok) {
        lastGood[id] = fresh;
        all.push(fresh);
      } else if (lastGood[id]) {
        var stale = {};
        for (var k in lastGood[id]) stale[k] = lastGood[id][k];
        stale._stale = true;
        all.push(stale);
      } else {
        all.push({ _ok: false });
      }
    }

    var live = 0, stale = 0;
    for (var i = 0; i < all.length; i++) {
      if (all[i]._ok && !all[i]._stale) live++;
      if (all[i]._stale) stale++;
    }

    if (stale > 0) {
      showMsg("✓ " + (live + stale) + "/5 nodes (" + stale + " cached)", "ok");
    } else {
      showMsg("✓ " + live + "/5 nodes online", "ok");
    }

    for (var i = 0; i < all.length; i++) {
      if (all[i]._ok || all[i]._stale) {
        updateCard(NODES[i], all[i]);
        updateMapMarker(NODES[i], all[i]);
      }
    }

    updateCharts(all);
    updateKPIs(all);
    updateTicker(all);
    saveSnapshot(all);
    saveHistory();

    document.getElementById("last-update").textContent = "Last update: " + new Date().toLocaleTimeString();
  };

  xhr.onerror = xhr.ontimeout = function() {
    isFetching = false;
    var hasCache = Object.keys(lastGood).length > 0;
    if (hasCache) {
      var current = document.getElementById("msg").textContent;
      if (current.indexOf("retrying") === -1) showMsg(current + " (retrying)", "");
    } else {
      showMsg("⚠ Cannot reach proxy — is proxy.py running?", "err");
    }
  };

  xhr.send();
}

// ── CONNECT / STOP ────────────────────────────────────────────────────────────
function startFetch() {
  stopFetch();
  var rate = parseInt(document.getElementById("interval").value);
  localStorage.setItem("aq_connected", "1");
  localStorage.setItem("aq_interval",  rate);
  showMsg("Connecting ...", "");
  fetchAll();
  function loop() {
    fetchTimer = setTimeout(function() { fetchAll(); loop(); }, rate);
  }
  loop();
}

function stopFetch() {
  if (fetchTimer) { clearTimeout(fetchTimer); fetchTimer = null; }
  localStorage.removeItem("aq_connected");
  showMsg("Stopped", "");
}

function showMsg(text, cls) {
  var el = document.getElementById("msg");
  el.textContent = text;
  el.className   = cls;
}

// ── STARTUP ───────────────────────────────────────────────────────────────────
window.onload = function() {
  initThemeToggle();
  buildKPIs();
  initCharts();
  initMap();
  startClock();

  loadHistory();
  seedLineCharts();

  var snap = loadSnapshot();
  if (snap) {
    for (var i = 0; i < snap.length; i++) {
      if (snap[i]._ok) updateCard(NODES[i], snap[i]);
    }
    updateCharts(snap);
    updateKPIs(snap);
    updateTicker(snap);
  }

  var savedRate = localStorage.getItem("aq_interval");
  if (savedRate) document.getElementById("interval").value = savedRate;

  if (localStorage.getItem("aq_connected") === "1") {
    showMsg("Reconnecting ...", "");
    startFetch();
  } else {
    showMsg("Click Connect to start", "");
  }
};