<h1>Kathmandu Valley Smart Air Quality Monitoring System</h1>

<p>Group 15  |  ITS67404 Internet of Things</p>

<hr>

<h2>Overview</h2>

<p>
A multi-node IoT air quality monitoring system that simulates five sensor stations
across the Kathmandu Valley. Each node generates realistic pollutant readings
influenced by diurnal patterns, seasonal factors, weather, and random pollution
events. Data is published to ThingsBoard via MQTT with an HTTP fallback, stored
locally in SQLite and CSV, and served to a live browser dashboard through a
lightweight proxy server.
</p>

<hr>

<h2>Project Structure</h2>

<pre>
project-root/
  src/
    main.py          Entry point — starts all services
    proxy.py         HTTP proxy that serves live data to the dashboard
    config.py        Shared constants, node definitions, AQI tables
    aqi.py           AQI math, NowCast, health risk, weather factors
    transport.py     MQTT client, HTTP fallback, SQLite offline buffer
    storage.py       CSV logger, live JSON writer, session statistics
    sensor.py        Sensor data generators for both simulators
    multi_node.py    Multi-node simulation loop (5 nodes)
    simulator.py     Single-node simulation loop (Ratna Park)
  iot/
    dashboard/
      KTM-AQ-Dashboard.html   Live browser dashboard
      css/
        style.css              Dashboard styles
      js/
        config.js              Node list, AQI helpers, history store
        charts.js              Chart.js initialisation and updates
        map.js                 Leaflet map initialisation and updates
        ui.js                  Cards, gauges, sparklines, ticker, alarms
        app.js                 Fetch loop, startup, connection state
    data/
      aq_live_data.json        Written each cycle, read by proxy
      session_log.csv          Rolling CSV of all sensor readings
      aq_offline_buffer.sqlite3  Buffered payloads pending publish
</pre>

<hr>

<h2>Requirements</h2>

<p>This project uses <code>uv</code> for environment and dependency management.</p>

<h3>Install uv</h3>

<p><strong>Windows:</strong></p>
<pre><code>powershell -c "irm https://astral.sh/uv/install.ps1 | iex"</code></pre>

<p><strong>macOS / Linux:</strong></p>
<pre><code>curl -LsSf https://astral.sh/uv/install.sh | sh</code></pre>

<h3>Set up the environment</h3>

<pre><code>uv venv
uv add paho-mqtt requests</code></pre>

<hr>

<h2>Running the System</h2>

<p>The main entry point starts all services in order and opens the dashboard in a browser:</p>

<pre><code>uv run src/main.py</code></pre>

<p>Individual services can be started separately:</p>

<table>
  <thead>
    <tr>
      <th>Command</th>
      <th>What it starts</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>uv run src/main.py all</code></td>
      <td>All services (default)</td>
    </tr>
    <tr>
      <td><code>uv run src/main.py multi</code></td>
      <td>Multi-node simulator only</td>
    </tr>
    <tr>
      <td><code>uv run src/main.py proxy</code></td>
      <td>Dashboard proxy server only</td>
    </tr>
    <tr>
      <td><code>uv run src/main.py serve</code></td>
      <td>Static HTTP server for the dashboard only</td>
    </tr>
    <tr>
      <td><code>uv run src/main.py sim</code></td>
      <td>Single-node simulator only</td>
    </tr>
  </tbody>
</table>

<hr>

<h2>Sensor Nodes</h2>

<table>
  <thead>
    <tr>
      <th>Node ID</th>
      <th>Location</th>
      <th>Zone</th>
      <th>Base PM2.5 (ug/m3)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>N1_Kathmandu</td>
      <td>Kathmandu - Ratna Park</td>
      <td>Urban Core</td>
      <td>95.0</td>
    </tr>
    <tr>
      <td>N2_Bhaktapur</td>
      <td>Bhaktapur - Durbar Square</td>
      <td>Semi-Urban Industrial</td>
      <td>110.0</td>
    </tr>
    <tr>
      <td>N3_Lalitpur</td>
      <td>Lalitpur - Lagankhel</td>
      <td>Suburban</td>
      <td>78.0</td>
    </tr>
    <tr>
      <td>N4_Kirtipur</td>
      <td>Kirtipur - TU Campus</td>
      <td>Peri-Urban</td>
      <td>62.0</td>
    </tr>
    <tr>
      <td>N5_Tokha</td>
      <td>Tokha - Rural Rim</td>
      <td>Rural</td>
      <td>48.0</td>
    </tr>
  </tbody>
</table>

<hr>

<h2>Simulation Modes</h2>

<p>When running the multi-node simulator interactively, a startup menu is shown:</p>

<table>
  <thead>
    <tr>
      <th>Option</th>
      <th>Mode</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td>Live</td>
      <td>Publish to ThingsBoard via MQTT, fall back to HTTP</td>
    </tr>
    <tr>
      <td>2</td>
      <td>Dry run</td>
      <td>Generate data locally, no network publishing</td>
    </tr>
    <tr>
      <td>3</td>
      <td>High pollution demo</td>
      <td>Force PM2.5 above 200 to trigger alarms</td>
    </tr>
    <tr>
      <td>4</td>
      <td>Exit</td>
      <td>Quit the simulator</td>
    </tr>
  </tbody>
</table>

<p>
When launched by <code>main.py</code>, the simulator always starts in dry run mode
so no ThingsBoard credentials are required.
</p>

<hr>

<h2>AQI Scale</h2>

<p>US EPA 2024 breakpoints used throughout the system:</p>

<table>
  <thead>
    <tr>
      <th>AQI Range</th>
      <th>Category</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>0 - 50</td><td>Good</td></tr>
    <tr><td>51 - 100</td><td>Moderate</td></tr>
    <tr><td>101 - 150</td><td>Unhealthy for Sensitive Groups</td></tr>
    <tr><td>151 - 200</td><td>Unhealthy</td></tr>
    <tr><td>201 - 300</td><td>Very Unhealthy</td></tr>
    <tr><td>301 - 500</td><td>Hazardous</td></tr>
  </tbody>
</table>

<hr>

<h2>Module Descriptions</h2>

<dl>
  <dt><strong>config.py</strong></dt>
  <dd>
    Single source of truth for all constants. Contains file paths, ThingsBoard
    host and port, device tokens, node definitions, AQI breakpoint tables,
    seasonal multipliers, pollution event tables, and CSV field lists.
    Imported by every other module.
  </dd>

<dt><strong>aqi.py</strong></dt>
  <dd>
    Pure calculation functions with no I/O or side effects. Implements the US EPA
    piecewise linear AQI formula for PM2.5, PM10, and CO; AQI category lookup;
    NowCast weighted rolling average; composite health risk scoring; and
    atmospheric correction factors for diurnal pattern, wind dispersion,
    rain washout, and wind chill.
  </dd>

<dt><strong>transport.py</strong></dt>
  <dd>
    Network layer shared by both simulators. <code>ThingsBoardMQTT</code> wraps
    paho-mqtt with exponential-backoff reconnect. <code>http_publish</code> and
    <code>http_publish_urllib</code> provide REST fallbacks. <code>OfflineBuffer</code>
    persists unpublished payloads to SQLite so they survive restarts and are
    flushed in order when connectivity is restored.
  </dd>

<dt><strong>storage.py</strong></dt>
  <dd>
    Persistence helpers. <code>csv_log</code> appends each reading to the session
    CSV. <code>write_live</code> atomically updates <code>aq_live_data.json</code>
    via a tmp-file rename so the proxy never reads a partial file.
    <code>SessionStats</code> and <code>SimSessionStats</code> accumulate
    min/max/avg readings and print a summary on exit.
  </dd>

<dt><strong>sensor.py</strong></dt>
  <dd>
    Data generation for both simulators. <code>SensorDataGenerator</code> is a
    per-node class that applies diurnal, seasonal, wind, rain, and
    pollution-event multipliers and maintains a NowCast rolling window.
    <code>WeatherState</code> is a slowly-evolving weather model shared across
    single-node cycles. <code>EventTracker</code> manages the current pollution
    event for the single-node simulator. <code>generate_data</code> is a
    stateless function for single-node use.
  </dd>

<dt><strong>multi_node.py</strong></dt>
  <dd>
    Simulation loop for all five nodes. Each cycle calls
    <code>SensorDataGenerator.generate()</code>, logs to CSV, writes the live
    JSON file, and publishes via MQTT or HTTP. Disconnected clients are
    reconnected in daemon threads, and the offline buffer is flushed at the
    end of each cycle.
  </dd>

<dt><strong>simulator.py</strong></dt>
  <dd>
    Single-node loop for the primary Ratna Park node. Supports four modes:
    normal, alert demo, self-test, and offline. Provides a detailed console
    readout of every sensor reading including health risk, NowCast AQI,
    and event status.
  </dd>

<dt><strong>proxy.py</strong></dt>
  <dd>
    Lightweight HTTP server on port 8765. Reads <code>aq_live_data.json</code>
    on every <code>GET /all</code> request and returns it with CORS headers.
    Serves a stale snapshot if the file is mid-write. Uses
    <code>allow_reuse_address</code> so it binds immediately after a restart.
  </dd>

<dt><strong>main.py</strong></dt>
  <dd>
    Entry point and service orchestrator. Spawns the simulator, proxy, and
    dashboard HTTP server as subprocesses, then opens the browser. A dispatch
    table maps CLI arguments to individual service runners.
  </dd>
</dl>

<hr>

<h2>Dashboard</h2>

<p>
The dashboard is a static HTML page served from <code>iot/dashboard/</code> on
port 8000. It polls the proxy every 1-60 seconds (configurable) and updates all
components in place without reloading the page.
</p>

<h3>Components</h3>

<ul>
  <li>KPI row — nodes online, average AQI, average PM2.5, average temperature, alarm count</li>
  <li>AQI gauges — one SVG arc gauge per node</li>
  <li>Leaflet map — live AQI marker per node with popup details, dark tile filter</li>
  <li>PM2.5 sparklines — rolling 20-reading mini chart per node</li>
  <li>Node telemetry cards — PM2.5, PM10, temperature, humidity, AQI bar</li>
  <li>PM2.5 trend chart — rolling line chart, all nodes</li>
  <li>CO and NO2 trend charts — rolling line charts, all nodes</li>
  <li>Health risk score bar chart</li>
  <li>PM10 and wind speed bar charts</li>
  <li>Temperature and humidity grouped bar chart</li>
  <li>Event ticker — scrolling banner of live node status</li>
  <li>Alarm log — timestamped list of AQI threshold breaches</li>
</ul>

<p>
Chart history and the last full data snapshot are persisted to
<code>localStorage</code> so the dashboard repopulates immediately on page reload.
</p>

<hr>

<h2>Ports</h2>

<table>
  <thead>
    <tr>
      <th>Port</th>
      <th>Service</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>8000</td>
      <td>Static HTTP server for the dashboard</td>
    </tr>
    <tr>
      <td>8765</td>
      <td>Proxy server (GET /all, GET /health)</td>
    </tr>
    <tr>
      <td>1883</td>
      <td>ThingsBoard MQTT (outbound only)</td>
    </tr>
  </tbody>
</table>

<hr>

<h2>ThingsBoard Device Tokens</h2>

<table>
  <thead>
    <tr>
      <th>Node</th>
      <th>Token</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>N1_Kathmandu</td><td>johf3tIp00BsoBBwYYYz</td></tr>
    <tr><td>N2_Bhaktapur</td><td>w6ts4ozm606t6gxh4vrj</td></tr>
    <tr><td>N3_Lalitpur</td><td>ln5d9pu04syh2ceozdu4</td></tr>
    <tr><td>N4_Kirtipur</td><td>iXhVahuIKUIlwBCxZx7x1</td></tr>
    <tr><td>N5_Tokha</td><td>y3994vefchqelncnsl0s</td></tr>
  </tbody>
</table>

<hr>

<p> 

</p>
