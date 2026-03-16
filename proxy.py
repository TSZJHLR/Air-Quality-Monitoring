#!/usr/bin/env python3
# Kathmandu Valley - Smart Air Quality Monitor
# Dashboard Proxy  |  Group 15 | ITS67404 IoT | Taylor's University | Jan 2026
# Serves aq_live_data.json written by multi_node.py to the dashboard.
# Run: uv run src/main.py proxy

import json, os, time
from http.server import BaseHTTPRequestHandler, HTTPServer

_ROOT     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(_ROOT, "iot/data", "aq_live_data.json")
PORT      = 8765
_snapshot = None  # stale-read fallback if the file is mid-write


class _Server(HTTPServer):
    allow_reuse_address = True

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass  # suppress per-request stdout noise

    def _send(self, body, status=200):
        """Encode and write a JSON response with CORS headers."""
        if isinstance(body, dict): body = json.dumps(body).encode()
        elif isinstance(body, str): body = body.encode()
        try:
            self.send_response(status)
            for k, v in [
                ("Content-Type",                 "application/json"),
                ("Content-Length",               str(len(body))),
                ("Access-Control-Allow-Origin",  "*"),
                ("Access-Control-Allow-Methods", "GET, OPTIONS"),
                ("Cache-Control",                "no-store"),
            ]: self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)
            self.wfile.flush()
        except Exception: pass  # client may have disconnected

    def do_OPTIONS(self): self._send(b"", 204)

    def do_GET(self):
        global _snapshot

        if self.path == "/health":
            return self._send({"status": "ok"})

        if self.path.startswith("/all"):
            if not os.path.exists(DATA_FILE):
                print(f"  [WAIT] {DATA_FILE} not found — run multi_node.py first")
                return self._send({"_waiting": True, "_msg": "multi_node.py not started"})
            try:
                content   = open(DATA_FILE).read()
                data      = json.loads(content)
                _snapshot = content
                ok = sum(1 for v in data.values() if isinstance(v, dict) and v.get("_ok"))
                print(f"  Served: {ok}/5 nodes  [{time.strftime('%H:%M:%S')}]")
                return self._send(content.encode())
            except Exception as e:
                # Return last known-good snapshot rather than an empty error
                print(f"  [ERR] {e} — returning last snapshot")
                return self._send((_snapshot or json.dumps({"_error": str(e)})).encode())

        self._send(b'{"error":"not found"}', 404)


def main():
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    print(f"\n  KTM-AQ Proxy  |  http://localhost:{PORT}  |  Ctrl+C to stop\n")
    try:
        _Server(("localhost", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\n  Proxy stopped.")

if __name__ == "__main__":
    main()