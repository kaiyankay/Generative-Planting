"""Markdown report + continuous journey sheet from the release-gate run.

python3 -I tools/flow_report.py   (after tools/flow_e2e.py)

Reads docs/qa/flow_unit_tests.json and docs/qa/flow_e2e.json, writes docs/qa/FLOW_E2E.md, adds the ordered screenshot
list to flow_e2e.json and builds flow.gif + flow-sheet.jpg in docs/screenshots/integrated-prototype/ (make_flow_sheet.py).
"""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QA = os.path.join(ROOT, "docs", "qa")


def short(v, n=260):
    s = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    s = s.replace("|", "\\|").replace("\n", " ")
    return s if len(s) <= n else s[:n] + "…"


def main():
    unit = json.load(open(os.path.join(QA, "flow_unit_tests.json")))
    e2e = json.load(open(os.path.join(QA, "flow_e2e.json")))
    shots = []
    for s in e2e["steps"]:
        extra = []
        if isinstance(s.get("actual"), dict):
            for k in ("previewShot", "extraShot", "shot"):
                if isinstance(s["actual"].get(k), str): extra.append(s["actual"][k])
            for k in ("shots",):
                if isinstance(s["actual"].get(k), list): extra += [x for x in s["actual"][k] if isinstance(x, str)]
        names = sorted(set(extra + ([s["screenshot"]] if isinstance(s.get("screenshot"), str) and s["screenshot"].endswith(".png") else [])))
        for f in names: shots.append({"file": f, "caption": f"{s['n']:02d} {s['name']}: {s['action']}"})
    # every screenshot of the run in file order (some steps save several states)
    d = os.path.join(ROOT, "docs", "screenshots", "integrated-prototype"); listed = {x["file"] for x in shots}
    for f in sorted(os.listdir(d)):
        rel = os.path.relpath(os.path.join(d, f), ROOT)
        if f.endswith(".png") and rel not in listed: shots.append({"file": rel, "caption": f.replace(".png", "")})
    shots.sort(key=lambda x: os.path.basename(x["file"]))
    e2e["shots"] = shots
    json.dump(e2e, open(os.path.join(QA, "flow_e2e.json"), "w"), indent=1)
    L = ["# Integrated Prototype — release-gate run (real browser)", "",
         f"Runner: {e2e['runner']} · started {e2e['started']}, finished {e2e.get('finished')} · personal knowledge test database `{e2e['knowledgeDb']}`.", "",
         f"**Engine tests (flow-tests.html): {unit['passed']} passed, {unit['failed']} failed** ({unit['ms']} ms). "
         f"**First-time-user journey: {e2e['passed']} passed, {e2e['failed']} failed.** Console / runtime errors during the journey: {len(e2e.get('consoleErrors', []))}.", "",
         "## Journey (real mouse input on DOM controls and the canvas)", "", "| # | step | action | expected | actual (abridged) | result | screenshot |", "|---|---|---|---|---|---|---|"]
    for s in e2e["steps"]:
        sh = s.get("screenshot", ""); link = f"[png](../../{sh})" if isinstance(sh, str) and sh.endswith(".png") else ""
        L.append(f"| {s['n']} | {s['name']} | {short(s['action'], 120)} | {short(s['expected'], 140)} | {short(s.get('actual'))} | **{s['result']}** | {link} |")
    if e2e.get("consoleErrors"): L += ["", "### Console errors", ""] + [f"- `{short(e, 300)}`" for e in e2e["consoleErrors"]]
    L += ["", "## Engine tests by gate (real Detroit model; FIXTURE = labelled synthetic case)", "", "| gate | id | test | result | detail (abridged) |", "|---|---|---|---|---|"]
    for t in unit["tests"]:
        L.append(f"| {t['gate']} | {t['id']} | {short(t['name'], 160)} | **{'pass' if t['ok'] else 'FAIL'}** | {short(t['detail'], 220)} |")
    L += ["", "Continuous record: [flow-sheet.jpg](../screenshots/integrated-prototype/flow-sheet.jpg), [flow.gif](../screenshots/integrated-prototype/flow.gif)."]
    open(os.path.join(QA, "FLOW_E2E.md"), "w").write("\n".join(L) + "\n")
    print("wrote docs/qa/FLOW_E2E.md;", len(shots), "screenshots")
    subprocess.run([sys.executable, "-I", os.path.join(ROOT, "tools", "make_flow_sheet.py"), "--shots", d, "--log", os.path.join(QA, "flow_e2e.json")], check=False)


if __name__ == "__main__":
    main()
