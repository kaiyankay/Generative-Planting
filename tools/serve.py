"""Static server for local development and tests: no caching, so edited ES modules are always fresh.

python3 -I tools/serve.py [--port 8790] [--dir .]
"""
import argparse, functools, os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8790)
    ap.add_argument("--dir", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    a = ap.parse_args()
    ThreadingHTTPServer(("127.0.0.1", a.port), functools.partial(NoCache, directory=a.dir)).serve_forever()
