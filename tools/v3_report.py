"""Build the V3.1 test report from the machine-readable results.

python3 tools/v3_report.py -> docs/qa/V3_E2E.md, docs/screenshots/v3/{live-stroke-strip.jpg, explore-views.jpg, overlap-strip.jpg,
                              knowledge-sheet.jpg, journey.gif}
"""
import json, os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QA = os.path.join(ROOT, "docs", "qa"); SH = os.path.join(ROOT, "docs", "screenshots", "v3")


def sheet(files, out, labels, w=560, crop=(0, 52, 1440, 836), cols=None):
    files = [f if os.path.exists(os.path.join(SH, f)) else f.replace('.png', '.jpg') for f in files]
    ims = [Image.open(os.path.join(SH, f)).convert("RGB").crop(crop) for f in files if os.path.exists(os.path.join(SH, f))]
    if not ims: return None
    cols = cols or len(ims); rows = (len(ims) + cols - 1) // cols; h = int(ims[0].height * w / ims[0].width)
    sh = Image.new("RGB", (w * cols, (h + 30) * rows), "#F7F3EA"); d = ImageDraw.Draw(sh)
    for i, (im, lb) in enumerate(zip(ims, labels)):
        x, y = (i % cols) * w, (i // cols) * (h + 30); sh.paste(im.resize((w, h)), (x, y + 30)); d.text((x + 10, y + 9), lb, fill="#27241F")
    sh.save(os.path.join(SH, out), quality=84); return out


def perf_rows():
    rows = []
    for lab, f in (("V2 (6fd9001)", "v2-baseline-gpu.json"), ("V3.1", "v3-final-gpu.json")):
        p = os.path.join(QA, "perf", f)
        if not os.path.exists(p): continue
        d = json.load(open(p))
        for r in d["runs"]:
            lt = r["longTasksWhileHeld"]
            rows.append(f"| {lab} | {r['scenario']} ({r['setup']['plants']:,} plants) | {r['frameIntervalMs']['p50']} / {r['frameIntervalMs']['p95']} | {r['inputToDrawnMs']['p50']} / {r['inputToDrawnMs']['p95']} | {r['planDrawMs']['p50']} ({', '.join(f'{k} {v}' for k, v in (r['planDrawMs'].get('kinds') or {}).items())}) | {r['brushHandlerMs']['p50']} / {r['brushHandlerMs']['p95']} | {lt['n']} ({lt['ge100']} ≥ 100 ms, max {lt['max']}) | {', '.join(map(str, r['stagedWhileHeld']))} | {r['frameIntervalMs']['max']} |")
        dev = d["device"]
    return rows, dev if rows else None


def main():
    j = json.load(open(os.path.join(QA, "v3_e2e.json"))); u = json.load(open(os.path.join(QA, "v3_unit_tests.json")))
    rows, dev = perf_rows()
    L = ["# Generative Planting V3.1 — test report", "", f"Journey run {j['started']} → {j['finished']} · {j['runner']}", "",
         f"**Engine (flow-tests.html): {u['passed']} passed, {u['failed']} failed** · **Real-browser journey: {j['passed']} passed, {j['failed']} failed** · console errors during the journey: {len(j['consoleErrors'])}", ""]
    if rows:
        L += ["## Case H — live brush performance, same machine, same stroke (real mouse events)", "",
              f"Device: {dev['machine']} · {dev['cpu']} · {dev['os']} · {dev['chrome']} · GPU: {dev['renderer']} · headless · {dev['viewport']}. One stroke: press, 110 moves ≈ 16 ms apart, release; bed B1 → walk → B2 → zig-zag in B2; ⌀ 3 m; Colour-blocks mix over the Auto-Composed design. Tool: `tools/v3_perf.py`; raw frames / inputs / draws: `docs/qa/perf/*.json`.", "",
              "| build | scenario | frame interval p50 / p95 ms | input → drawn p50 / p95 ms | plan paint p50 ms (kinds) | brush handler p50 / p95 ms | long tasks while held | staged plants at moves 21 / 61 / 101 | worst frame ms |", "|---|---|---|---|---|---|---|---|---|"] + rows + ["",
              "Targets of the package: p95 frame ≤ 33 ms, input → visible preview p95 ≤ 100 ms, no long task ≥ 100 ms while drawing. The worst single frame is listed rather than hidden (see the report)."]
    L += ["", "## Journey (one continuous session from an empty profile; real mouse / keyboard)", "", "| # | case | step | action | expected | result | evidence |", "|---|---|---|---|---|---|---|"]
    for s in j["steps"]:
        act = json.dumps(s["actual"], ensure_ascii=False) if not isinstance(s["actual"], str) else s["actual"]
        act = act.replace("|", "/")[:520]
        shot = f"[shot]({os.path.relpath(os.path.join(ROOT, s['screenshot']), QA)})" if str(s.get("screenshot", "")).endswith((".png", ".jpg")) else ""
        L.append(f"| {s['n']} | {s['case']} | {s['name']} | {s['action']} | {s['expected']} | **{s['result']}** | {shot} `{act}` |")
    ls = j.get("liveStroke")
    if ls:
        L += ["", "## Case F — frames captured while the button is held", "",
              f"Staged plants at moves 8 / 16 / 24 / 30: {', '.join(map(str, ls['stagedAtFrames']))}; committed while held: {ls['committedWhileHeld']} (nothing written before release); release: +{ls['release']['added']} in {ls['release']['cells']} cells of {', '.join(ls['release']['bedIds'])}; undo steps {ls['undoSteps']}; plants outside a cell {ls['plantsOutsideCells']}.", "",
              "![live stroke](../screenshots/v3/live-stroke-strip.jpg)", "", "Pointer log: `docs/qa/v3_e2e.json → pointerLog`."]
    L += ["", "## Overlap (case G) · Explore views (case I) · Knowledge (case P)", "", "![overlap](../screenshots/v3/overlap-strip.jpg)", "", "![explore](../screenshots/v3/explore-views.jpg)", "", "![knowledge](../screenshots/v3/knowledge-sheet.jpg)", "", "Continuous journey (screenshots in order): `docs/screenshots/v3/journey.gif`."]
    L += ["", "## Engine tests", "", "| id | gate | test | result |", "|---|---|---|---|"]
    for t in u["tests"]: L.append(f"| {t['id']} | {t['gate']} | {t['name'].replace('|', '/')} | **{'pass' if t['ok'] else 'FAIL'}** |")
    if j["consoleErrors"]: L += ["", "## Console errors", ""] + [f"- `{e[:300]}`" for e in j["consoleErrors"]]
    open(os.path.join(QA, "V3_E2E.md"), "w").write("\n".join(L) + "\n")
    fr = sorted(f for f in os.listdir(SH) if f.startswith("16-live-") and f.endswith((".png", ".jpg")))
    sheet(fr, "live-stroke-strip.jpg", [f.replace("16-live-", "move ").replace("-held", " · button held").replace(".png", "").replace(".jpg", "") for f in fr], w=520, crop=(0, 52, 1036, 836))
    sheet(["13b-fit-colour.png", "13c-fit-organic.png", "17a-base-over-base.png", "17c-soft-edge.png"], "overlap-strip.jpg", ["fit: Colour blocks", "fit: Organic groups", "base over base", "soft edge"], w=480, crop=(0, 52, 1036, 836), cols=4)
    sheet(["20-explore-plan.png", "20-explore-axo.png", "20-explore-diagram.png", "20-explore-performance.png", "21-month-apr.png", "21-month-aug.png", "22-inspector.png", "21-month-aug-3d.png"], "explore-views.jpg", ["Plan", "3D", "Diagram", "Performance", "April", "August", "community inspector", "August in 3D"], w=480, crop=(0, 52, 1440, 900), cols=4)
    sheet(["25-knowledge-task.png", "24-knowledge-seasons.png", "24-knowledge-communities.png", "24-knowledge-spatial-detroit.png", "24-knowledge-spatial-vancouver.png", "24-knowledge-preview.png"], "knowledge-sheet.jpg", ["back in the design after the record", "seasons", "communities", "spatial: Detroit", "spatial: Metro Vancouver (labelled)", "record preview"], w=480, crop=(0, 52, 1440, 900), cols=3)
    seq = [s["screenshot"] for s in j["steps"] if str(s.get("screenshot", "")).endswith((".png", ".jpg"))]
    k = next((i for i, s in enumerate(seq) if "live-stroke" in s), len(seq))
    for f in reversed(fr): seq.insert(k, "docs/screenshots/v3/" + f)
    frames = [Image.open(os.path.join(ROOT, p)).convert("RGB").resize((720, 450)) for p in seq if os.path.exists(os.path.join(ROOT, p))]
    if frames: frames[0].save(os.path.join(SH, "journey.gif"), save_all=True, append_images=frames[1:], duration=[1300 if "16-live" not in s else 600 for s in seq][:len(frames)], loop=0, optimize=True)
    print("report:", len(j["steps"]), "steps,", len(u["tests"]), "engine tests,", len(frames), "gif frames")


if __name__ == "__main__":
    main()
