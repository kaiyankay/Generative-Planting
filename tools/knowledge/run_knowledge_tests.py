#!/usr/bin/env python3
"""Run knowledge/tests.html in headless Chrome, then check the Python retrieval CLI against the browser (parity).

  python3 -I tools/knowledge/run_knowledge_tests.py [--url URL]

Without --url the repository is served on a free local port under /Generative-Planting/ (the GitHub Pages base path) by the
knowledge server's own handler (tools/knowledge/server.py), so the Ask tests reach the real /api endpoints; no model is called
unless that server reports Claude connected (SDK + credentials + GP_CLAUDE_ALLOW_CALLS=1), and the tests never ask it to.
Writes docs/qa/knowledge_browser_tests.json and docs/qa/knowledge_parity.json (the fixed event script the browser built,
its query results, and the effective record ids), then runs `kq.py parity` on it.
The private P57 fixture is only served when private-inputs/ exists locally; elsewhere that test is reported as skipped.
"""
import argparse, functools, html, json, os, re, shutil, subprocess, sys, tempfile, threading, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--url"); ap.add_argument("--copy", choices=["full", "public"], default="full", help="public = run against the published seed only"); a = ap.parse_args()
    sfx = "_public" if a.copy == "public" else ""
    srv = tmp = None; url = a.url
    if not url:
        tmp = tempfile.mkdtemp(); os.symlink(ROOT, os.path.join(tmp, "Generative-Planting"))
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import server as ks
        class TestHandler(ks.Handler):
            serve_dir = tmp
            deny = ("/.git", "/.env", "/.claude")            # the local private P57 fixture is served to this local run only, as before
            def log_message(self, *x, **k): pass
        srv = ThreadingHTTPServer(("127.0.0.1", 0), TestHandler); threading.Thread(target=srv.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{srv.server_address[1]}/Generative-Planting/knowledge/tests.html" + ("?copy=public" if a.copy == "public" else "")
    t0 = time.time()
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from cdp import Chrome
    with Chrome(width=1600, height=1100) as c:
        c.goto(url)
        c.wait_for("!!document.getElementById('summary') && document.getElementById('summary').dataset.json.length > 0", timeout=300)
        res = json.loads(c.eval("document.getElementById('summary').dataset.json"))
    parity = res.pop("parity", None)
    res.update(url=url, runner="headless Chrome via DevTools protocol (tools/knowledge/cdp.py)", wallSeconds=round(time.time() - t0, 1))
    for r in res["results"]: print(("SKIP " if r.get("skipped") else "PASS " if r["ok"] else "FAIL ") + r["name"] + ("" if r["ok"] and not r.get("skipped") else "  -> " + r["detail"]))
    print(f"\n{res['ok']}/{res['total']} passed ({res.get('skipped', 0)} skipped) at {url}")
    qa = os.path.join(ROOT, "docs", "qa"); os.makedirs(qa, exist_ok=True)
    json.dump(res, open(os.path.join(qa, f"knowledge_browser_tests{sfx}.json"), "w"), indent=1, ensure_ascii=False)
    pok = False
    if parity:
        pp = os.path.join(qa, f"knowledge_parity{sfx}.json"); json.dump(parity, open(pp, "w"), indent=1, ensure_ascii=False)
        q = subprocess.run([sys.executable, "-I", os.path.join(ROOT, "tools", "knowledge", "kq.py"), "parity", pp], capture_output=True, text=True)
        print("\nPython kq.py parity:", q.stdout.strip()); pok = q.returncode == 0
        res["pythonParity"] = json.loads(q.stdout); json.dump(res, open(os.path.join(qa, f"knowledge_browser_tests{sfx}.json"), "w"), indent=1, ensure_ascii=False)
    if srv: srv.shutdown()
    if tmp: shutil.rmtree(tmp, ignore_errors=True)
    sys.exit(0 if res["ok"] == res["total"] and pok else 1)


if __name__ == "__main__":
    main()
