"""Capture documented screenshot sets with headless Chrome (same URL states as the live app).

python3 -I tools/screenshots.py [--set phase01|phase011|before] [--only NAME] [--out DIR] [--base URL]

Phase 01 set   -> docs/screenshots/NN-name.png (kept for history)
Phase 01.1 set -> docs/screenshots/phase-01-1/NN-name.png
`before` set   -> docs/screenshots/phase-01-1/before/ (same cameras as the after set, run on the old code)
All at 1440x900, device scale 1. WebGL runs on SwiftShader (software), so anti-aliasing and timing differ
slightly from a GPU browser; content is the same model.
"""
import argparse, functools, os, subprocess, sys, tempfile, threading, shutil
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SETS = {
    "phase01": ("docs/screenshots", [
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
    ]),
    # same cameras as the after set, run against the Phase 01 code (old URL vocabulary)
    "before": ("docs/screenshots/phase-01-1/before", [
        ("01-hero", "index.html?view=3d&shot=1"),
        ("02-plan", "index.html?view=plan"),
        ("03-layers", "index.html?view=3d&shot=1&explode=1"),
        ("04-terrain", "index.html?view=3d&shot=1&layers=-veg,-structure,-built,%2Btopo.contours"),
        ("09-b1-plan", "index.html?view=plan&sel=bed.B1&focus=1&z=2.2"),
        ("09-b1-3d", "index.html?view=3d&shot=1&sel=bed.B1&focus=1&z=3.4"),
        ("10-closeup", "index.html?view=3d&shot=1&sel=bed.C3&focus=1&z=9"),
    ]),
    "phase011": ("docs/screenshots/phase-01-1", [
        ("01-hero-reference", "index.html?view=3d&shot=1"),
        ("02-plan-reference", "index.html?view=plan"),
        ("03-layer-overview", "index.html?view=layers&shot=1"),
        ("03b-layer-focus", "index.html?view=layers&shot=1&layer=composition"),
        ("04-terrain-only", "index.html?view=3d&shot=1&mode=terrain"),
        ("04b-terrain-plan", "index.html?view=plan&mode=terrain"),
        ("05-infrastructure", "index.html?view=plan&layer=infrastructure"),
        ("06-framework", "index.html?view=plan&layer=framework"),
        ("07a-composition-A", "index.html?view=plan&layer=composition&sel=bed.A1&focus=1&z=1.3"),
        ("07b-composition-B", "index.html?view=plan&layer=composition&sel=bed.B1&focus=1&z=1.3"),
        ("07c-composition-C", "index.html?view=plan&layer=composition&sel=bed.C3&focus=1&z=1.3"),
        ("07d-site-vegetation", "index.html?view=plan&layer=siteveg"),
        ("07e-representation", "index.html?view=plan&layer=representation&sel=bed.B1&focus=1&z=2.2"),
        ("07f-analysis", "index.html?view=plan&layer=analysis&overlay=framework:0.45"),
        ("08-planting-canvas", "index.html?view=3d&shot=1&mode=canvas&draft=blank"),
        ("08b-planting-canvas-plan", "index.html?view=plan&mode=canvas&draft=blank"),
        ("09a-replace-plan-before", "index.html?view=plan&sel=pl.B1.g27&focus=1&z=0.5"),
        ("09b-replace-plan-after", "index.html?view=plan&mode=canvas&draft=demo&sel=pl.B1.g27&focus=1&z=0.5"),
        ("09c-replace-3d-before", "index.html?view=3d&shot=1&sel=pl.B1.g27&focus=1&z=1.5"),
        ("09d-replace-3d-after", "index.html?view=3d&shot=1&mode=canvas&draft=demo&sel=pl.B1.g27&focus=1&z=1.5"),
        ("10-closeup", "index.html?view=3d&shot=1&sel=bed.C3&focus=1&z=9"),
        ("11-overlay", "index.html?view=plan&layer=composition&overlay=terrain:0.6,infrastructure:0.5"),
        ("12-restored-reference", "index.html?view=3d&shot=1&mode=canvas&draft=demo&then=reference"),
        ("05-style-test", "tools/style_test.html"),
        ("13-plan-b1", "index.html?view=plan&sel=bed.B1&focus=1&z=2.2"),
        ("14-3d-b1", "index.html?view=3d&shot=1&sel=bed.B1&focus=1&z=3.4"),
    ]),
    # Phase 01.2: Site setup as a component (UX/IA simplification). NAME@WxH sets a viewport for that shot.
    "ux": ("docs/screenshots/phase-01-2", [
        ("01-entry-axo", "index.html?view=axo&shot=1"),
        ("02-plan-same-place", "index.html?view=plan&shot=1"),
        ("03-layers-panel", "index.html?view=axo&shot=1&panel=1"),
        ("04-solo-with-trace", "index.html?view=plan&solo=composition&overlay=framework:0.5,infrastructure:0.35&panel=1"),
        ("05-terrain-filter", "index.html?view=axo&shot=1&filter=terrain&panel=1"),
        ("06-exploded-optional", "index.html?view=layers&shot=1&panel=1&layer=composition"),
        ("07-start-design", "index.html?view=axo&shot=1&newdesign=1"),
        ("08-working-blank", "index.html?view=axo&shot=1&draft=blank&design=working"),
        ("09-selection-compact", "index.html?view=axo&shot=1&sel=bed.B1"),
        ("10-selection-details", "index.html?view=plan&sel=bed.B1&details=1&focus=1&z=0.7"),
        ("11-site-sheet", "index.html?view=axo&shot=1&about=1"),
        ("12-embedded", "tools/embed_check.html"),
        ("13-phone-axo@390x844", "index.html?view=axo&shot=1"),
        ("14-phone-solo@390x844", "index.html?view=plan&solo=composition&panel=1"),
    ]),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base"); ap.add_argument("--only"); ap.add_argument("--set", default="phase011"); ap.add_argument("--out")
    ap.add_argument("--extra", action="append", default=[], help="NAME=QUERY, shot an extra state")
    a = ap.parse_args()
    srv = tmp = None
    base = a.base
    if not base:
        tmp = tempfile.mkdtemp(); os.symlink(ROOT, os.path.join(tmp, "Generative-Planting"))
        h = functools.partial(SimpleHTTPRequestHandler, directory=tmp); h.log_message = lambda *x, **k: None
        srv = ThreadingHTTPServer(("127.0.0.1", 8792), h); threading.Thread(target=srv.serve_forever, daemon=True).start()
        base = "http://127.0.0.1:8792/Generative-Planting/"
    rel, shots = SETS[a.set]
    shots = list(shots) + [tuple(e.split("=", 1)) for e in a.extra]
    out = a.out or os.path.join(ROOT, rel); os.makedirs(out, exist_ok=True)
    for name, q in shots:
        if a.only and a.only not in name: continue
        prof = tempfile.mkdtemp()
        size = "1440,900"
        if "@" in name: name, wh = name.split("@"); size = wh.replace("x", ",")
        path = os.path.join(out, name + ".png")
        cmd = [CHROME, "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars",
               f"--window-size={size}", "--force-device-scale-factor=1", f"--user-data-dir={prof}",
               "--virtual-time-budget=30000", f"--screenshot={path}", base + q]
        subprocess.run(cmd, capture_output=True, timeout=300)
        shutil.rmtree(prof, ignore_errors=True)
        print(name, os.path.exists(path) and os.path.getsize(path), flush=True)
    if srv: srv.shutdown()
    if tmp: shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
