"""Build the V2 test report from the machine-readable results.

python3 tools/v2_report.py  ->  docs/qa/V2_E2E.md, docs/screenshots/v2/live-stroke-strip.jpg, docs/screenshots/v2/journey.gif
"""
import json, os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QA = os.path.join(ROOT, "docs", "qa"); SH = os.path.join(ROOT, "docs", "screenshots", "v2")


def main():
    j = json.load(open(os.path.join(QA, "v2_e2e.json"))); u = json.load(open(os.path.join(QA, "v2_unit_tests.json")))
    L = ["# Generative Planting V2 — test report", "", f"Journey run {j['started']} → {j['finished']} · {j['runner']}", "",
         f"**Engine (flow-tests.html): {u['passed']} passed, {u['failed']} failed** ({u['ms']} ms) · **Journey: {j['passed']} passed, {j['failed']} failed** · console errors during the journey: {len(j['consoleErrors'])}", "",
         "## Journey (real mouse / keyboard input, one continuous session)", "", "| # | case | step | action | expected | result | evidence |", "|---|---|---|---|---|---|---|"]
    for s in j["steps"]:
        act = json.dumps(s["actual"], ensure_ascii=False) if not isinstance(s["actual"], str) else s["actual"]
        act = act.replace("|", "/")[:420]
        shot = f"[shot]({os.path.relpath(os.path.join(ROOT, s['screenshot']), QA)})" if s.get("screenshot", "").endswith((".png", ".jpg")) else ""
        L.append(f"| {s['n']} | {s['case']} | {s['name']} | {s['action']} | {s['expected']} | **{s['result']}** | {shot} `{act}` |")
    ls = j.get("liveStroke")
    if ls:
        L += ["", "## Case E — live brush, frames captured while the mouse button is held", "",
              "Staged instances during the drag (every 4th of 24 mouse moves): " + ", ".join(map(str, ls["stagedDuringDrag"])) + f"; committed plants during the drag: {ls['committedDuringDrag']} (nothing written before release); after release: +{ls['committedAfter']} in one undo step; beds {ls['beds']}, cells {ls['cells']}; plants on the walk {ls['plantsOnWalk']}, outside a cell {ls['plantsOutsideCells']}; mean / max processing per pointer move {ls['meanMoveMs']} / {ls['maxMoveMs']} ms (headless Chrome, SwiftShader, this Mac).", "",
              "![live stroke](../screenshots/v2/live-stroke-strip.jpg)", "", "Pointer log (each real mouse move with the staged state read right after it): `docs/qa/v2_e2e.json → pointerLog`."]
    L += ["", "## Engine tests", "", "| id | gate | test | result |", "|---|---|---|---|"]
    for t in u["tests"]: L.append(f"| {t['id']} | {t['gate']} | {t['name'].replace('|', '/')} | **{'pass' if t['ok'] else 'FAIL'}** |")
    if j["consoleErrors"]: L += ["", "## Console errors", ""] + [f"- `{e[:300]}`" for e in j["consoleErrors"]]
    open(os.path.join(QA, "V2_E2E.md"), "w").write("\n".join(L) + "\n")
    # live stroke strip
    fr = sorted(f for f in os.listdir(SH) if f.startswith("E-live-"))
    if fr:
        ims = [Image.open(os.path.join(SH, f)).convert("RGB").crop((0, 52, 1036, 836)) for f in fr]; w = 520; h = int(ims[0].height * w / ims[0].width)
        sheet = Image.new("RGB", (w * len(ims), h + 34), "#F7F3EA"); d = ImageDraw.Draw(sheet)
        for i, (im, f) in enumerate(zip(ims, fr)):
            sheet.paste(im.resize((w, h)), (i * w, 34)); d.text((i * w + 10, 10), os.path.splitext(f)[0].replace("E-live-", "move ").replace("-pressed", " · button held").replace("-released", " · released"), fill="#27241F")
        sheet.save(os.path.join(SH, "live-stroke-strip.jpg"), quality=86)
    # journey gif (step screenshots + live frames in order)
    seq = [s["screenshot"] for s in j["steps"] if s.get("screenshot", "").endswith((".png", ".jpg"))]
    for f in fr: seq.insert(next((i for i, s in enumerate(seq) if "brush-live" in s), len(seq)), "docs/screenshots/v2/" + f)
    frames = [Image.open(os.path.join(ROOT, p)).convert("RGB").resize((768, 480)) for p in seq if os.path.exists(os.path.join(ROOT, p))]
    if frames: frames[0].save(os.path.join(SH, "journey.gif"), save_all=True, append_images=frames[1:], duration=[1400 if "E-live" not in s else 700 for s in seq][:len(frames)], loop=0, optimize=True)
    print("report written:", len(j["steps"]), "steps,", len(u["tests"]), "engine tests,", len(frames), "gif frames")


if __name__ == "__main__":
    main()
