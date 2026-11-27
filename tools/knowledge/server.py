#!/usr/bin/env python3
"""Knowledge Workspace server — the static page plus a small local API for Claude (Phase 02A.1 Part B).

  python3 -I tools/knowledge/server.py [--port 8782]
  GP_CLAUDE_ALLOW_CALLS=1 ANTHROPIC_API_KEY=… python3 -I tools/knowledge/server.py     # only when paid calls are authorised

Binds 127.0.0.1 only. Endpoints (JSON):
  GET  /api/llm/status      which prerequisites for real Claude calls are met (SDK, credentials, authorisation) — never the key
  POST /api/retrieve        keyword retrieval over the browser's effective knowledge (no model) — proves both sides read the same version
  POST /api/ask             Claude answers with read-only tools over that knowledge; returns retrieved / cited / answer separately
  POST /api/ingest/extract  Claude turns the designer's words into an editable preview; nothing is saved here

Every POST carries the browser's personal events and its activeRevision. The server rebuilds Preset + events with kq.py
and refuses (409) when its revision differs, so the model never reads a different knowledge version from the one on screen.
Layer "preset" uses the Preset alone. Requests from other origins are refused (a web page cannot spend your API credit).
"""
import argparse, json, os, posixpath, sys, threading, urllib.parse
from collections import OrderedDict
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, "llm"))
import kq                      # noqa: E402
import provider                # noqa: E402

ROOT = kq.ROOT
MAX_BODY = 8 * 1024 * 1024
DENY = ("/private-inputs", "/.git", "/.env", "/.claude")

# Every seed copy on this machine (full local research copy and/or the public copy), by baseVersion: the browser's
# activeRevision names the Preset it was built on, so the server always rebuilds the same one.
_seeds = {}
for _p in kq.seed_paths():
    _s = json.load(open(_p, encoding="utf-8")); _seeds.setdefault(_s["meta"]["baseVersion"], _s)
_seed = next(iter(_seeds.values()))
_sm = json.load(open(os.path.join(ROOT, "knowledge", "data", "species_map.json"), encoding="utf-8"))
_cache, _lock = OrderedDict(), threading.Lock()


def kb_for(events, layer, base=None):
    seed = _seeds.get(base, _seed) if base else _seed
    evs = [] if layer == "preset" else list(events or [])
    key = seed["meta"]["baseVersion"] + ":" + kq.fnv("|".join(e.get("id", "") for e in evs)) + f":{len(evs)}"
    with _lock:
        if key in _cache: _cache.move_to_end(key); return _cache[key]
    kb = kq.KB(seed, _sm, evs)
    with _lock:
        _cache[key] = kb
        while len(_cache) > 6: _cache.popitem(last=False)
    return kb


def clean_path(raw):
    return posixpath.normpath(urllib.parse.unquote(raw.split("?")[0].split("#")[0])) or "/"


class Handler(SimpleHTTPRequestHandler):
    serve_dir = ROOT                                # tests serve the same tree under a sub-path
    deny = DENY

    def _denied(self, path):
        return any(path == d or path.startswith(d + "/") or (d + "/") in path + "/" for d in self.deny)

    def __init__(self, *a, **k): super().__init__(*a, directory=self.serve_dir, **k)

    def log_message(self, fmt, *args):            # method + path only: never bodies, never headers
        sys.stderr.write("%s %s\n" % (self.command, self.path.split("?")[0]))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store"); super().end_headers()

    def _json(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def _same_origin(self):
        o = self.headers.get("Origin")
        if not o: return True                       # same-origin GETs and non-browser tools send none
        port = self.server.server_address[1]
        return o in (f"http://127.0.0.1:{port}", f"http://localhost:{port}")

    def do_GET(self):
        path = clean_path(self.path)
        if self._denied(path): return self._json(404, {"error": "not served"})
        if path == "/api/llm/status":
            st = provider.status(); st.update(server="gp-knowledge", baseVersion=_seed["meta"]["baseVersion"], copies={b: s["meta"].get("copy", "full") for b, s in _seeds.items()}); return self._json(200, st)
        if path.startswith("/api/"): return self._json(404, {"error": "unknown endpoint"})
        return super().do_GET()

    def do_HEAD(self):
        if self._denied(clean_path(self.path)) or clean_path(self.path).startswith("/api/"): self.send_response(404); self.end_headers(); return
        return super().do_HEAD()

    def do_POST(self):
        path = clean_path(self.path)
        if not self._same_origin(): return self._json(403, {"error": "cross-origin request refused"})
        if "application/json" not in (self.headers.get("Content-Type") or ""): return self._json(415, {"error": "send application/json"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BODY: return self._json(413, {"error": "body missing or too large"})
        try: body = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception: return self._json(400, {"error": "invalid JSON"})
        layer = body.get("layer") or "combined"
        want = body.get("activeRevision")
        base = (want or "").split("+")[0]
        kb = kb_for(body.get("events"), layer, base if base in _seeds else None)
        if want and want != kb.active_revision:
            return self._json(409, {"error": "knowledge version differs from the browser", "browser": want, "server": kb.active_revision, "serverPresets": list(_seeds)})
        if path == "/api/retrieve":
            res = kb.search(body.get("query", ""), limit=int(body.get("limit") or 20), place=body.get("projectPlace") or None)
            return self._json(200, {"activeRevision": kb.active_revision, "layer": layer, "returnedRecordIds": res["returnedRecordIds"],
                                    "scores": [r["score"] for r in res["results"]], "missing": res["missing"], "method": res["method"]})
        if path == "/api/ask":
            q = (body.get("question") or "").strip()
            if not q: return self._json(400, {"error": "empty question"})
            out = provider.ask(kb, q, {"layer": layer, "selection": body.get("selection"), "projectPlace": body.get("projectPlace"), "retrievedIds": body.get("retrievedIds")})
            out["layer"] = layer
            return self._json(200, out)
        if path == "/api/ingest/extract":
            t = (body.get("text") or "").strip()
            if not t: return self._json(400, {"error": "empty input"})
            return self._json(200, provider.extract(kb, t))
        return self._json(404, {"error": "unknown endpoint"})


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8782)
    a = ap.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    st = provider.status()
    print(f"Knowledge Workspace: http://127.0.0.1:{a.port}/knowledge/  ·  Claude: {'connected' if st['connected'] else 'not connected'} ({MODEL_NOTE(st)})", flush=True)
    srv.serve_forever()


def MODEL_NOTE(st):
    return st["model"] if st["connected"] else "; ".join(c["detail"] for c in st["checks"] if not c["ok"])


if __name__ == "__main__":
    main()
