"""Markdown summary of the e2e experiments: docs/qa/DESIGN_E2E.md from docs/qa/design_e2e.json.

python3 -I tools/e2e_report.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAMES = {"A": "A · whole-garden fill", "B": "B · across beds (curve, area)", "C": "C · terrain and environment response", "D": "D · editing a shared mix", "E": "E · knowledge connection", "F": "F · full iteration"}


def main():
    d = json.load(open(os.path.join(ROOT, "docs", "qa", "design_e2e.json")))
    L = [f"# Design e2e experiments — {d['summary']}", "", f"Runner: {d['runner']}. Started {d['started']}, finished {d.get('finished', '—')}.",
         f"Served at `{d['url']}`; personal knowledge in a test database (`{d['knowledgeDb']}`).", "", "## Checks", ""]
    for exp in "FABCDE":
        cs = [c for c in d["checks"] if c["experiment"] == exp]
        if not cs: continue
        L.append(f"### {NAMES[exp]}"); L.append("")
        for c in cs:
            L.append(f"- {'PASS' if c['ok'] else '**FAIL**'} — {c['name']}" + ("" if c["ok"] else f" (`{c['detail'][:200]}`)"))
        L.append("")
    E = d.get("experiments", {})
    L += ["## Numbers", ""]
    if "A" in E:
        a = E["A"]; t = a["totals"]
        L.append(f"- **A**: {t['perennials']:,} perennials + {t['bulbs']:,} bulbs on {t['areaM2']:,} m² ({t['density']} perennials / m², {t['species']} species), open bed area {a['openM2']} m².")
        for m in a["mixes"]:
            L.append(f"  - {m['name']} ({m['areaM2']} m²): " + "; ".join(f"{r['name']} {r['target']} → {r['actual']} ({r['unit']})" for r in m["roles"]))
        v = a.get("validation", {})
        L.append(f"  - validation: {v.get('rows', 0):,} design rows; {v.get('checkedPlantable', 0):,} re-checked with `plantableAt` → {v.get('notPlantable')} not plantable; elevation mismatch {v.get('zMismatch')} (max |Δz| {v.get('maxdz')}).")
    if "B" in E:
        b = E["B"]
        for q in b.get("line", []): L.append(f"- **B** curve: {q['label']}, beds {', '.join(x.replace('bed.', '') for x in q['beds'])}, {q['perennials']} perennials, {q['outsideBedsM2']} m² of the band on paths (unplanted); check {b.get('check')}.")
        for q in b.get("area", [])[-1:]: L.append(f"- **B** area: {q['label']}, beds {', '.join(x.replace('bed.', '') for x in q['beds'])}, {q['perennials']} perennials, {q['outsideBedsM2']} m² outside beds.")
    if "C" in E:
        c = E["C"]
        for k, v in c.get("underTrees", {}).items():
            if k == "shadeOK": L.append(f"- **C** shade knowledge applying in Detroit: {v}"); continue
            L.append(f"- **C** Under trees {k}: {v['plants']} plants, {v['underCrown']} under crowns {v['speciesUnderCrown']}, unplanted {v['unplanted']}, min distance to tree centre {v['minTrunkM']} m, z {v['z']}.")
        w = c.get("hypotheticalWetness")
        if w: L.append(f"- **C** hypothetical wetness: mean z by hydrology class OFF {w['off']['meanZ']} (n {w['off']['n']}) → ON {w['on']['meanZ']} (n {w['on']['n']}); {w['substitutions']} substitution kinds.")
        if c.get("edgeRule"): L.append(f"- **C** edge rule: {c['edgeRule']}.")
    if "D" in E:
        x = E["D"]
        L.append(f"- **D** Dropseed matrix v{x['before']['version']} → v{x['after']['version']}: " + "; ".join(f"{r['name']} {r['actual']}" for r in x["before"]["roles"]) + " → " + "; ".join(f"{r['name']} {r['actual']}" for r in x["after"]["roles"]))
        L.append(f"  - kept B5 (rows, hash) before/after: {x['kept']}; local repaint outside-area (rows, hash) {x.get('localEdit')}.")
    if "E" in E:
        e = E["E"]
        L.append(f"- **E** under the TE crown — before: {e['before']}; after adding a Geranium record: {e['afterAddingGeraniumRecord']}; scope Detroit-only: {e['afterNarrowingScope']}; after applying `{e['usdaRecord']}` here: {e['afterApplyingUSDAHere']}; missing knowledge: {e['missing']}.")
    if "F" in E: L.append(f"- **F** season (May): {E['F']['seasonMay']}.")
    L += ["", "## Screenshots (run order)", ""]
    for s in d.get("shots", []): L.append(f"- [{os.path.basename(s['file'])}](../../{s['file']}) — {s['caption']}")
    open(os.path.join(ROOT, "docs", "qa", "DESIGN_E2E.md"), "w").write("\n".join(L) + "\n")
    print("docs/qa/DESIGN_E2E.md")


if __name__ == "__main__":
    main()
