#!/usr/bin/env python3
# Kathmandu Valley - Smart Air Quality Monitor
# Group 15 | ITS67404 IoT | Taylor's University | Jan 2026
# Usage: uv run src/main.py [all | multi | proxy | serve | sim]

import os, sys, time, threading, subprocess, webbrowser

# Resolved at import time so all subprocesses share the same root
SRC_DIR       = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR      = os.path.dirname(SRC_DIR)
DASHBOARD_DIR = os.path.join(ROOT_DIR, "iot/dashboard")
DATA_DIR      = os.path.join(ROOT_DIR, "iot/data")
DASHBOARD_URL = "http://localhost:8000/KTM-AQ-Dashboard.html"

# ThingsBoard device access tokens, one per physical node
TOKENS = {
    "N1_Kathmandu": "johf3tIp00BsoBBwYYYz",
    "N2_Bhaktapur":  "w6ts4ozm606t6gxh4vrj",
    "N3_Lalitpur":   "ln5d9pu04syh2ceozdu4",
    "N4_Kirtipur":   "iXhVahuIKUIlwBCxZx7x1",
    "N5_Tokha":      "y3994vefchqelncnsl0s",
}

BANNER = """
+----------------------------------------------------------------------+
|   Kathmandu Valley - Smart Air Quality Monitor                       |
|   Group 15  |  ITS67404 IoT  |  Taylor's University  |  Jan 2026   |
+----------------------------------------------------------------------+
"""

# Spawn a subprocess rooted at the project directory
def _spawn(cmd, **kw):
    kw.setdefault("cwd", ROOT_DIR)
    return subprocess.Popen(cmd, stdin=subprocess.DEVNULL, **kw)

# Runs in a daemon thread; short delay lets the server bind before opening
def _open_browser():
    time.sleep(2.5)
    print(f"  [4/4] Opening dashboard -> {DASHBOARD_URL}")
    webbrowser.open(DASHBOARD_URL)

# Blocks until Ctrl+C, then terminates all child processes cleanly
def _run_forever(procs):
    print(f"\n  All services running.\n  Dashboard -> {DASHBOARD_URL}\n  Press Ctrl+C to stop.\n")
    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        print("\n  Stopping all services ...")
        for p in procs: p.terminate()
        print("  Done.")

# Launch multi-node simulator in dry mode (no network required)
def start_multi_node():
    print("  [1/4] Starting multi-node simulator ...")
    return _spawn(["uv", "run", os.path.join(SRC_DIR, "multi_node.py"), "--auto", "--mode", "dry"])

# Launch the WebSocket proxy that bridges simulator output to the dashboard
def start_proxy():
    print("  [2/4] Starting proxy server on port 8765 ...")
    return _spawn([sys.executable, os.path.join(SRC_DIR, "proxy.py")])

# Serve the static dashboard files over HTTP on port 8000
def start_dashboard_server():
    print("  [3/4] Starting dashboard HTTP server on port 8000 ...")
    return _spawn([sys.executable, "-m", "http.server", "8000"], cwd=DASHBOARD_DIR)

# Start all four services in order with brief staggered delays
def run_all():
    os.makedirs(DATA_DIR, exist_ok=True)
    print(BANNER)
    print("  ThingsBoard Device Tokens:")
    for node, tok in TOKENS.items(): print(f"    {node:<20} -> {tok}")
    print()
    procs = [start_multi_node()]
    time.sleep(1)
    procs.append(start_proxy())
    time.sleep(1)
    procs.append(start_dashboard_server())
    threading.Thread(target=_open_browser, daemon=True).start()
    _run_forever(procs)

def run_multi():
    sys.path.insert(0, SRC_DIR)
    from multi_node import startup_menu, run_simulation
    run_simulation(startup_menu())

def run_proxy():
    sys.path.insert(0, SRC_DIR)
    from proxy import main as proxy_main
    proxy_main()

def run_serve():
    os.makedirs(DATA_DIR, exist_ok=True)
    p = start_dashboard_server()
    threading.Thread(target=_open_browser, daemon=True).start()
    print(f"  Dashboard -> {DASHBOARD_URL}\n  Press Ctrl+C to stop.\n")
    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        p.terminate(); print("\n  Server stopped.")

def run_sim():
    sys.path.insert(0, SRC_DIR)
    from simulator import main as sim_main
    sim_main()

# Dispatch table — maps CLI argument to handler function
COMMANDS = {"all": run_all, "multi": run_multi, "proxy": run_proxy, "serve": run_serve, "sim": run_sim}

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd not in COMMANDS:
        print(f"  Unknown command: {cmd}")
        print(f"  Usage: uv run src/main.py [{' | '.join(COMMANDS)}]")
        sys.exit(1)
    COMMANDS[cmd]()

if __name__ == "__main__":
    main()