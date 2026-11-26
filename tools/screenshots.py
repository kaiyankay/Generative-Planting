"""Capture the documented screenshot set with headless Chrome (same URL states as the live app).

python3 -I tools/screenshots.py [--base http://127.0.0.1:8791/Generative-Planting/]
Writes docs/screenshots/NN-name.png at 1440x900. WebGL runs on SwiftShader (software), so
anti-aliasing and timing differ slightly from a GPU browser; content is the same model.
"""
import argparse, functools, os, subprocess, sys, tempfile, threading, shutil
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SHOTS = [
    ("01-hero", "index.html?view=3d&shot=1"),
    ("02-plan", "index.html?view=plan"),
    ("03-layer-structure", "index.html?view=3d&shot=1&lopen=1&layers=%2Btopo.contours"),
    ("04-block", "index.html?view=3d&shot=1&sel=bed.A1&focus=1&z=3.4"),
    ("05-matrix", "index.html?view=3d&shot=1&sel=bed.B1&focus=1&z=3.4"),
    ("06-grouping", "index.html?view=3d&shot=1&sel=bed.C3&focus=1&z=3.4"),
    ("07-inspector", "index.html?view=plan&sel=bed.B3N&focus=1&z=1.1&at=-12.5,9"),
    ("08-layer-toggle", "index.html?view=3d&shot=1&lopen=1&layers=-veg.forbs,-veg.grasses,-veg.bulbs,-veg.shrubs,%2Btopo.contours,%2Banalysis.slope"),
    ("09-plan-detail", "index.html?view=plan&sel=bed.B1&focus=1&z=2.2"),
    ("10-exploded", "index.html?view=3d&shot=1&explode=1"),
    ("11-phone", "index.html?view=3d&shot=1"),
]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--base"); ap.add_argument("--only")
    a = ap.parse_args()
    srv = tmp = None
    base = a.base
    if not base:
        tmp = tempfile.mkdtemp(); os.symlink(ROOT, os.path.join(tmp, "Generative-Planting"))
        h = functools.partial(SimpleHTTPRequestHandler, directory=tmp); h.log_message = lambda *x, **k: None
        srv = ThreadingHTTPServer(("127.0.0.1", 8792), h); threading.Thread(target=srv.serve_forever, daemon=True).start()
        base = "http://127.0.0.1:8792/Generative-Planting/"
    out = os.path.join(ROOT, "docs", "screenshots"); os.makedirs(out, exist_ok=True)
    for name, q in SHOTS:
        if a.only and a.only not in name: continue
        prof = tempfile.mkdtemp()
        path = os.path.join(out, name + ".png")
        size = "390,844" if name == "11-phone" else "1440,900"
        cmd = [CHROME, "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars",
               f"--window-size={size}", "--force-device-scale-factor=1", f"--user-data-dir={prof}",
               "--virtual-time-budget=25000", f"--screenshot={path}", base + q]
        subprocess.run(cmd, capture_output=True, timeout=240)
        shutil.rmtree(prof, ignore_errors=True)
        print(name, os.path.exists(path) and os.path.getsize(path))
    if srv: srv.shutdown()
    if tmp: shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
