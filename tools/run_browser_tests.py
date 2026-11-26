"""Run tests.html in headless Chrome under the production base path.

python3 -I tools/run_browser_tests.py [--url URL]

Without --url it serves the repo at http://127.0.0.1:8791/Generative-Planting/ (same base path
as GitHub Pages) and runs tests.html there. With --url it runs against e.g. the live site.
Writes docs/qa/browser_tests.json.
"""
import argparse, html, json, os, re, subprocess, sys, tempfile, time, shutil, functools, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def serve(tmp, port):
    h = functools.partial(SimpleHTTPRequestHandler, directory=tmp)
    h.log_message = lambda *a, **k: None
    srv = ThreadingHTTPServer(("127.0.0.1", port), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url")
    ap.add_argument("--out", default=os.path.join(ROOT, "docs", "qa", "browser_tests.json"))
    a = ap.parse_args()
    srv = tmp = None
    url = a.url
    if not url:
        tmp = tempfile.mkdtemp()
        os.symlink(ROOT, os.path.join(tmp, "Generative-Planting"))
        srv = serve(tmp, 8791)
        url = "http://127.0.0.1:8791/Generative-Planting/tests.html"
    prof = tempfile.mkdtemp()
    cmd = [CHROME, "--headless=new", "--disable-gpu-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
           "--window-size=1600,1000", f"--user-data-dir={prof}", "--virtual-time-budget=90000", "--run-all-compositor-stages-before-draw",
           "--dump-dom", url]
    t0 = time.time()
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    dom = p.stdout
    m = re.search(r'id="summary"[^>]*data-json="([^"]*)"', dom)
    if not m:
        print("no results in DOM; stderr tail:\n", p.stderr[-1500:])
        sys.exit(2)
    res = json.loads(html.unescape(m.group(1)))
    res["url"] = url
    res["runner"] = "headless Chrome (SwiftShader software WebGL) --dump-dom"
    res["wallSeconds"] = round(time.time() - t0, 1)
    for r in res["results"]:
        print(("PASS " if r["ok"] else "FAIL ") + r["name"] + ("" if r["ok"] else "  -> " + r["detail"]))
    print(f"\n{res['ok']}/{res['total']} passed at {url}")
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    json.dump(res, open(a.out, "w"), indent=1)
    if srv:
        srv.shutdown()
    shutil.rmtree(prof, ignore_errors=True)
    if tmp:
        shutil.rmtree(tmp, ignore_errors=True)
    sys.exit(0 if res["ok"] == res["total"] else 1)


if __name__ == "__main__":
    main()
