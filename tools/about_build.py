"""Generative Planting · About — store the engine's run of the About example, check it is reproducible, take the page screenshots.

python3 -I -u tools/about_build.py [--port 8812] [--dport 9233] [--no-shots]

1. Serves this folder under /Generative-Planting/ (as GitHub Pages does) and opens headless Chrome with an empty profile.
2. Runs about/js/case.js `buildCase` (the real engine, an in-memory project that is never saved) TWICE and requires the two
   fingerprints of the plant instances to be identical; writes about/data/case.json (what the About pages read first).
3. Opens every About page at 1920 × 1080 (classroom projection) and 1440 × 900 (laptop), waits until each page says it is
   ready, and saves screenshots to docs/screenshots/about/. Reports console errors and missing resources.
"""
import argparse, base64, json, os, sys, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools")); sys.path.insert(0, os.path.join(ROOT, "tools", "knowledge"))
import flow_e2e  # noqa: E402

SHOTS = os.path.join(ROOT, "docs", "screenshots", "about")
SHOT_LIST = [  # name, path, width, height, element to scroll to (or None)
    ("01-project", "about/", 1920, 1080, None),
    ("02-project-cover", "about/", 1920, 1080, "#cover"),
    ("03-project-agents", "about/", 1920, 1080, "#agents"),
    ("10-how-define", "about/how-it-works/?stage=define", 1920, 1080, "#figure"),
    ("11-how-structure-organic", "about/how-it-works/?stage=structure&structure=organic", 1920, 1080, "#figure"),
    ("12-how-compose-paint", "about/how-it-works/?stage=compose&compose=paint", 1920, 1080, "#figure"),
    ("13-how-compose-layers", "about/how-it-works/?stage=compose&compose=layers", 1920, 1080, "#figure"),
    ("14-how-compose-brush", "about/how-it-works/?stage=compose&compose=brush", 1920, 1080, "#figure"),
    ("15-how-explore-axo", "about/how-it-works/?stage=explore&explore=axo&month=7", 1920, 1080, "#figure"),
    ("16-how-explore-season", "about/how-it-works/?stage=explore&explore=season&month=6", 1920, 1080, "#figure"),
    ("17-how-chain", "about/how-it-works/", 1920, 1080, "#chain"),
    ("18-how-brush-steps", "about/how-it-works/", 1920, 1080, "#brush"),
    ("20-method", "about/method/", 1920, 1080, None),
    ("21-method-knowledge", "about/method/", 1920, 1080, "#knowledge"),
    ("22-method-knowledge-change", "about/method/", 1920, 1080, ".gp-after"),
    ("23-method-modules", "about/method/", 1920, 1080, "#modules .gp-span"),
    ("24-method-systems", "about/method/", 1920, 1080, "#systems .gp-span"),
    ("25-method-layers", "about/method/", 1920, 1080, "#layers .gp-span"),
    ("26-method-rules", "about/method/", 1920, 1080, "#rules .gp-span"),
    ("27-method-ai", "about/method/", 1920, 1080, "#ai"),
    ("30-data", "about/data/", 1920, 1080, None),
    ("31-data-coverage", "about/data/", 1920, 1080, "#coverage"),
    ("40-laptop-how", "about/how-it-works/?stage=compose&compose=brush", 1440, 900, "#figure"),
    ("41-laptop-method", "about/method/", 1440, 900, "#systems .gp-span"),
]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--port", type=int, default=8812); ap.add_argument("--dport", type=int, default=9233); ap.add_argument("--no-shots", action="store_true")
    a = ap.parse_args()
    P, chrome, srv, base = flow_e2e.launch(ROOT, a.port, a.dport)
    report = {"runs": [], "pages": []}
    try:
        P("Page.navigate", url=base + "about/data/"); P.wait("document.body && document.body.dataset.ready === '1'", timeout=120)
        build = f"""(async () => {{ const {{ loadEngine }} = await import({json.dumps(base + 'about/js/engine.js')}); const {{ buildCase }} = await import({json.dumps(base + 'about/js/case.js')});
            const E = await loadEngine(); const A = await buildCase(E); const B = await buildCase(E); A.meta.source = 'stored';
            return JSON.stringify({{ a: A.meta.fp, b: B.meta.fp, fa: A.meta.fpFill, fb: B.meta.fpFill, ms: [A.meta.ms, B.meta.ms], C: A }}); }})()"""
        r = json.loads(P.js(build))
        report["runs"] = {"fingerprints": [r["a"], r["b"]], "fill": [r["fa"], r["fb"]], "ms": r["ms"], "identical": r["a"] == r["b"] and r["fa"] == r["fb"]}
        print("engine runs:", report["runs"])
        if not report["runs"]["identical"]: raise SystemExit("the example is not reproducible: fingerprints differ")
        os.makedirs(os.path.join(ROOT, "about", "data"), exist_ok=True)
        with open(os.path.join(ROOT, "about", "data", "case.json"), "w") as f: json.dump(r["C"], f, separators=(",", ":"))
        print("wrote about/data/case.json", os.path.getsize(os.path.join(ROOT, "about", "data", "case.json")) // 1024, "KB")
        if not a.no_shots:
            os.makedirs(SHOTS, exist_ok=True)
            for name, path, w, h, sel in SHOT_LIST:
                P("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=1, mobile=False)
                P.errors.clear(); P("Page.navigate", url=base + path); time.sleep(0.6)
                P.wait("document.body && document.body.dataset.ready === '1'", timeout=90)
                if sel: P.js(f"(() => {{ const e = document.querySelector({json.dumps(sel)}); if (e) {{ e.scrollIntoView({{ block: 'start' }}); window.scrollBy(0, -64); }} return !!e; }})()")
                P.settle()
                missing = P.js("performance.getEntriesByType('resource').filter((e) => e.responseStatus >= 400).map((e) => e.name)") or []
                data = P("Page.captureScreenshot", format="png")["data"]; open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(data))
                report["pages"].append({"shot": name, "path": path, "size": [w, h], "errors": list(P.errors), "missing": missing})
                print(name, "errors:", len(P.errors), "missing:", len(missing))
        with open(os.path.join(ROOT, "docs", "qa", "about_build.json"), "w") as f: json.dump(report, f, indent=1)
    finally:
        chrome.terminate(); srv.shutdown()


if __name__ == "__main__":
    main()
