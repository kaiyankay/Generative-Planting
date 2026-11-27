#!/usr/bin/env python3
"""Render the 02A.1 mock-up states to PNG (1440×900 @2x) with headless Chrome.

  python3 -I tools/knowledge/mockup_data.py && python3 -I tools/knowledge/render_mockups.py
"""
import functools, os, sys, tempfile, threading, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE)); sys.path.insert(0, HERE)
from cdp import Chrome  # noqa: E402

DIR = os.path.join(ROOT, "docs", "knowledge", "redesign-02a1")


class Q(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Q, directory=DIR)); threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}/mockup.html"
    names = {1: "A-default-workspace", 2: "B-collection-analysis", 3: "C-after-adding-knowledge"}
    with Chrome(width=1440, height=900, scale=2) as c:
        for s, n in names.items():
            c.goto(f"{base}?s={s}"); c.wait_for("document.documentElement.dataset.ready === '1'", timeout=60); time.sleep(0.8)
            c.screenshot(os.path.join(DIR, n + ".png")); print(n)
    srv.shutdown()


if __name__ == "__main__":
    main()
