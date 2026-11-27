"""Generative Planting V2 — acceptance run in a real browser (headless Chrome over the DevTools protocol).

python3 -I -u tools/v2_e2e.py [--serve <folder>] [--only unit|journey] [--port 8798]

unit     flow-tests.html: V1 engine gates (44) + V2 gates (16)                              -> docs/qa/v2_unit_tests.json
journey  one continuous user journey with REAL mouse / keyboard input (no developer shortcuts for user actions):
         Intro → Landscape → Define strategy → Structure (whole scope at once) → Mix palette → live brush across beds
         (frames captured WHILE the button is held) → Cell Fill / Auto / freeze / mix edit → Plan / Axo / Diagram /
         Performance + months → regions with different flowering → Knowledge lenses + record → back → save / reload.
         Each step: expected, actual data assertions, screenshot, console errors -> docs/qa/v2_e2e.json + docs/screenshots/v2/
JS is used only to READ state (assertions) and to place the camera on a bed (a view operation); every design action is a
real click, key or drag.
"""
import argparse, base64, json, os, sys, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools")); sys.path.insert(0, os.path.join(ROOT, "tools", "knowledge"))
import flow_e2e  # noqa: E402
from flow_e2e import launch  # noqa: E402

SHOTS = os.path.join(ROOT, "docs", "screenshots", "v2")
flow_e2e.SHOTS = SHOTS


def unit(P, base):
    P("Page.navigate", url=base + "flow-tests.html")
    P.wait("document.documentElement.dataset.done === '1'", 900)
    out = P.js("window.__flowTests"); out["runner"] = "headless Chrome (SwiftShader) over CDP, flow-tests.html"; out["errors"] = list(P.errors)
    json.dump(out, open(os.path.join(ROOT, "docs", "qa", "v2_unit_tests.json"), "w"), indent=1)
    print(f"unit: {out['passed']} passed, {out['failed']} failed"); return out


def journey(P, base, narrow=True):
    log = {"runner": "headless Chrome (SwiftShader) over CDP; real mouse / keyboard input", "url": base, "started": time.strftime("%Y-%m-%d %H:%M:%S"), "steps": [], "pointerLog": []}
    n = [0]
    S = lambda e: P.js(e)  # noqa: E731

    def step(name, case, action, expected, fn, shot=True):
        n[0] += 1; t0 = time.time(); rec = {"n": n[0], "case": case, "name": name, "action": action, "expected": expected}
        e0 = len(P.errors)
        try:
            actual = fn(); ok = bool(actual.pop("ok", True)) if isinstance(actual, dict) else bool(actual)
            rec.update(actual=actual, result="pass" if ok else "FAIL")
        except Exception as e:  # noqa: BLE001
            rec.update(actual=str(e)[:700], result="FAIL")
        if shot:
            try: rec["screenshot"] = P.shot(f"{n[0]:02d}-{name}")
            except Exception as e: rec["screenshot"] = "failed: " + str(e)[:100]  # noqa: BLE001
        rec["s"] = round(time.time() - t0, 1); rec["newErrors"] = P.errors[e0:]
        log["steps"].append(rec); print(f"{rec['n']:02d} {case:3} {rec['result']:4} {name} ({rec['s']} s) {'' if rec['result'] == 'pass' else json.dumps(rec['actual'])[:400]}", flush=True)
        return rec

    def frame(name):
        path = os.path.join(SHOTS, name + ".png"); open(path, "wb").write(base64.b64decode(P("Page.captureScreenshot", format="png")["data"])); return os.path.relpath(path, ROOT)

    def key(k, code=None, vk=0, mods=0):
        P("Input.dispatchKeyEvent", type="keyDown", key=k, code=code or k, windowsVirtualKeyCode=vk, modifiers=mods); P("Input.dispatchKeyEvent", type="keyUp", key=k, code=code or k, windowsVirtualKeyCode=vk, modifiers=mods)

    FP = "(() => { let h = 2166136261 >>> 0, n = 0; const I = GPFlow.P.state.instances; for (const c of Object.keys(I).sort()) for (const p of I[c].plants) { n++; for (const ch of `${c}|${p.id}|${p.x}|${p.y};`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } } return n + ':' + h.toString(16); })()"
    fp = lambda: S(FP)  # noqa: E731
    CEN = "((bed) => { const P = GPFlow.P; if (!P.state.beds[bed]) { const b = GPFlow.boundsOf([GPFlow.store.getObject(bed).geometry]); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; } const c = P.state.beds[bed].cellIds.map((i) => P.state.cells[i].center); return [c.reduce((a, q) => a + q[0], 0) / c.length, c.reduce((a, q) => a + q[1], 0) / c.length]; })"
    cen = lambda bed: S(f"{CEN}({json.dumps(bed)})")  # noqa: E731
    focus = lambda beds: S(f"GPFlow.focusBeds({json.dumps(beds)}); true")  # noqa: E731

    origin = base.split("/Generative-Planting/")[0]
    P("Page.navigate", url=base + "LICENSE"); time.sleep(0.5)
    P("Storage.clearDataForOrigin", origin=origin, storageTypes="local_storage,indexeddb")
    P("Page.navigate", url=base + "?kdb=gp-knowledge-v2e2e-" + str(int(time.time()))); P.wait("document.documentElement.dataset.ready === '1' && !!window.GPFlow && !!document.getElementById('fintro')", 300)
    time.sleep(3.2)

    # ------------------------------------------------------------------ A · entry
    step("intro", "A", "Open the app in an empty browser profile", "A typographic introduction with a plant field drawn from the model's real instances; one Start",
         lambda: {"title": S("document.querySelector('.i-title').textContent"), "start": S("!!document.querySelector('[data-i=start]')"), "ok": S("!!document.querySelector('.i-title')")})
    step("choose-landscape", "A", "Click Start", "Three landscape cards in one axonometric language; only Detroit (real model) can be entered; the other two are 'Planned'",
         lambda: (P.click_el("[data-i=start]"), time.sleep(0.6), {"cards": S("document.querySelectorAll('.lcard').length"), "disabled": S("document.querySelectorAll('.lcard.off[aria-disabled=true]').length"), "ok": S("document.querySelectorAll('.lcard').length") == 3 and S("document.querySelectorAll('.lcard.off').length") == 2})[2])
    step("enter-detroit", "A", "Click the Detroit card", "Short transition into the Design workspace at Define; no resume prompt (empty profile)",
         lambda: (P.click_el(".lcard:not(.off)"), time.sleep(1.4), {"stage": S("GPFlow.stage()"), "intro": S("!!document.getElementById('fintro')"), "ok": S("GPFlow.stage()") == "define" and not S("!!document.getElementById('fintro')")})[2])

    # ------------------------------------------------------------------ B · Define strategy (one confirmation)
    def strategy():
        P.click_el("#dpanel [data-st=v2]"); time.sleep(1.2)
        s = S("(() => { const s = GPFlow.u.strategy; return { zones: s.zones.map((z) => [z.name, z.systemName, z.logic, z.bedIds.length]), beds: s.beds, kept: s.kept, rules: s.rules.map((r) => r[0]), unused: s.unused, method: s.method }; })()")
        s["ok"] = len(s["zones"]) >= 3 and s["beds"] >= 15 and len(s["kept"]) == 2 and "Rules mode" in s["method"]; return s
    step("strategy-proposed", "B", "Click the starter intent “Keep the meadows, … matrix along the main garden paths, early flowers beneath trees, pollinators all season”",
         "A whole-site strategy drawn on the map: ≥ 3 zones (role · system · logic) over ≥ 15 Main Garden beds, meadows kept, Rules mode stated, trees rule reported honestly", strategy)
    def confirm():
        u0 = S("GPFlow.P.past.length"); P.click_el("#dpanel [data-a=confirm]"); time.sleep(0.5)
        return {"confirmed": S("GPFlow.P.state.strategy.confirmed"), "undoSteps": S("GPFlow.P.past.length") - u0, "next": S("!document.getElementById('fnext').disabled"), "ok": S("GPFlow.P.state.strategy.confirmed") and S("GPFlow.P.past.length") - u0 == 1}
    step("strategy-confirmed", "B", "Click “Confirm strategy”", "One undoable confirmation; Continue enabled; no bed-by-bed confirmation", confirm)

    # ------------------------------------------------------------------ C · Structure: whole scope at once
    def structure():
        P.click_el("#fnext"); P.wait("GPFlow.stage() === 'structure' && GPFlow.u.previews && GPFlow.u.previews.size >= 15 && !GPFlow.u.pvBusy", 240)
        r = S("(() => { const pv = [...GPFlow.u.previews.values()]; return { beds: pv.length, cells: pv.reduce((a, r) => a + (r.ok ? r.cells.length : 0), 0), failed: pv.filter((r) => !r.ok).map((r) => r.bedId), curved: pv.filter((r) => r.ok && r.params.curved).length, logics: [...new Set(pv.map((r) => r.logic))], ms: GPFlow.u.pvMs }; })()")
        r["ok"] = r["beds"] >= 15 and not r["failed"] and r["curved"] >= 3 and len(r["logics"]) >= 3; return r
    step("structure-preview-all", "C", "Click Continue to Structure", "Every bed of the strategy previewed at once (curved bands along the paths, honeycomb, organic), no bed fails", structure)
    def size_change():
        z = S("GPFlow.P.state.strategy.zones.find((z) => z.logic === 'honeycomb').id"); before = S(f"GPFlow.P.state.strategy.zones.find((z) => z.id === '{z}').bedIds.reduce((a, b) => a + (GPFlow.u.previews.get(b)?.cells.length || 0), 0)")
        x, y = P.el(f"#dpanel [data-zsize='{z}']"); w = S(f"document.querySelector(\"#dpanel [data-zsize='{z}']\").getBoundingClientRect().width"); P.click(x + w * 0.35, y); time.sleep(1.5)
        after = S(f"GPFlow.P.state.strategy.zones.find((z) => z.id === '{z}').bedIds.reduce((a, b) => a + (GPFlow.u.previews.get(b)?.cells.length || 0), 0)")
        return {"zone": z, "cellsBefore": before, "cellsAfter": after, "ok": before != after}
    step("structure-size", "C", "Drag the Matrix-beds cell-width slider (real click on the track)", "The zone's real candidates change (cell count), only that zone is recomputed", size_change)
    def guide_curve():
        z = S("GPFlow.P.state.strategy.zones.find((z) => z.logic === 'bands').id"); beds = S(f"GPFlow.P.state.strategy.zones.find((z) => z.id === '{z}').bedIds")
        P.click_el(f"#dpanel [data-zguide='{z}']"); time.sleep(0.3); focus(beds); time.sleep(0.6)
        a, b = cen(beds[0]), cen(beds[-1]); pts = [[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + 6 * (t * (1 - t)) * 4] for t in (0, 0.33, 0.66, 1)]
        for q in pts: x, y = P.world(*q); P.click(x, y); time.sleep(0.15)
        P.click_el("#dpanel [data-a=guideok]"); time.sleep(2.5)
        r = S(f"(() => {{ const ids = GPFlow.P.state.strategy.zones.find((z) => z.id === '{z}').bedIds; const pv = ids.map((b) => GPFlow.u.previews.get(b)).filter(Boolean); return {{ beds: pv.length, curve: pv.filter((r) => r.ok && r.params.guide === 'curve').length, cells: pv.reduce((a, r) => a + (r.ok ? r.cells.length : 0), 0), note: pv[0] && pv[0].adaptation && pv[0].adaptation.notes[0] }}; }})()")
        r["ok"] = r["curve"] >= 2; return r
    step("structure-guide-curve", "C", "“Draw a guide curve” for the path zone, click 4 points across the beds, “Use this curve”", "Bands of the zone follow the drawn curve (distance bands from it), clipped by each bed", guide_curve)
    def confirm_all():
        u0 = S("GPFlow.P.past.length"); P.click_el("#dpanel [data-a=confirmall]"); time.sleep(1.5)
        return {"beds": S("Object.keys(GPFlow.P.state.beds).length"), "cells": S("GPFlow.P.allCells().length"), "undoSteps": S("GPFlow.P.past.length") - u0, "ok": S("Object.keys(GPFlow.P.state.beds).length") >= 15 and S("GPFlow.P.past.length") - u0 == 1}
    step("structure-confirm-all", "C", "Click “Confirm N beds”", "All beds structured in ONE undo step", confirm_all)
    def refine():
        ids0 = S("JSON.stringify(Object.fromEntries(Object.entries(GPFlow.P.state.beds).map(([b, v]) => [b, v.cellIds])))"); focus(["bed.A1"]); time.sleep(0.6)
        x, y = P.world(*cen("bed.A1")); P.click(x, y); time.sleep(0.5); P.click_el("#dpanel [data-bl=organic]"); time.sleep(1.2); P.click_el("#dpanel [data-a=confirmall]"); time.sleep(1.2)
        ids1 = json.loads(S("JSON.stringify(Object.fromEntries(Object.entries(GPFlow.P.state.beds).map(([b, v]) => [b, v.cellIds])))")); ids0 = json.loads(ids0)
        others = all(ids0[b] == ids1[b] for b in ids0 if b != "bed.A1")
        return {"A1": S("GPFlow.P.state.beds['bed.A1'].logic"), "othersUnchanged": others, "ok": S("GPFlow.P.state.beds['bed.A1'].logic") == "organic" and others}
    step("structure-refine-bed", "C", "Click bed A1 on the canvas, choose Organic, confirm", "Only A1 changes (local refinement); every other bed keeps its cell ids", refine)

    # ------------------------------------------------------------------ D · Mix palette
    def palette():
        P.click_el("#fnext"); time.sleep(1.5)
        r = S("(() => ({ cards: document.querySelectorAll('.mixcard').length, svgs: document.querySelectorAll('.mixcard .mv-plan circle').length, systems: GPFlow.P.state.mixes.map((m) => m.system), layers: GPFlow.P.state.mixes.map((m) => m.layers.map((L) => L.basis).join('+')) }))()")
        r["ok"] = r["cards"] >= 3 and r["svgs"] > 100; return r
    step("mix-palette", "D", "Continue to Compose", "A visual palette: each mix card shows a plan patch from the fill engine, a section, a phenology ribbon, its system; recipes from the Detroit legends (base + overlay + drift)", palette)
    def compare():
        ids = S("GPFlow.P.state.mixes.slice(0, 2).map((m) => m.id)")
        for i in ids: P.click_el(f".mixcard[data-mix='{i}'] [data-cmp]"); time.sleep(0.4)
        return {"compare": S("!!document.querySelector('.compare .cmpgrid')"), "ok": S("!!document.querySelector('.compare .cmpgrid')")}
    step("mix-compare", "D", "Click “compare” on two mix cards", "Same-scale plan patches, sections and ribbons side by side", compare)

    # ------------------------------------------------------------------ E · live brush (the critical case)
    mixM = S("GPFlow.P.state.mixes.find((m) => m.system === 'matrix-based').id"); mixC = S("GPFlow.P.state.mixes.find((m) => m.system === 'maximal-color').id")
    def hover():
        P.click_el(f".mixcard[data-mix='{mixM}'] header"); time.sleep(0.5); focus(["bed.B1", "bed.B2"]); time.sleep(0.8)
        f0 = fp(); a = cen("bed.B1"); x, y = P.world(*a)
        for k in range(5): P.mouse("mouseMoved", x + k * 6, y + k * 4); time.sleep(0.08)
        time.sleep(0.3); g = S("GPFlow.brush.ghost ? GPFlow.brush.ghost.pts.length : 0")
        return {"brush": S("!!GPFlow.brush.active"), "hud": S("!document.getElementById('fhud').hidden"), "ghost": g, "unchanged": fp() == f0, "ok": g > 0 and fp() == f0 and S("!!GPFlow.brush.active")}
    step("brush-hover", "E", "Click the Matrix mix card, move the mouse over bed B1 (no button)", "Brush on (HUD), ghost candidates under the cursor, nothing written", hover)
    def live_stroke():
        S("(() => { const p = GPFlow.plan; p.view.scale *= 1.7; p.request(); return true; })()"); time.sleep(0.6)
        a, b = cen("bed.B1"), cen("bed.B2"); f0 = fp(); u0 = S("GPFlow.P.past.length"); t0 = S("GPFlow.P.totals().plants")
        a = [a[0] + (b[0] - a[0]) * 0.2, a[1] + (b[1] - a[1]) * 0.2]; b = [a[0] + (b[0] - a[0]) * 0.75, a[1] + (b[1] - a[1]) * 0.75]; log["liveStrokeWorld"] = [a, b]
        pts = [P.world(a[0] + (b[0] - a[0]) * k / 24, a[1] + (b[1] - a[1]) * k / 24) for k in range(25)]
        frames = []; seen = []
        P.mouse("mouseMoved", *pts[0]); P.mouse("mousePressed", *pts[0], 1)
        for k, p in enumerate(pts[1:], 1):
            P.mouse("mouseMoved", *p, 1); time.sleep(0.04)
            st = S("(() => { const s = GPFlow.brush.stroke; return s ? { added: s.added, staged: GPFlow.brush.stagedPlants().length, cells: s.cells.size, committed: GPFlow.P.totals().plants } : null; })()")
            seen.append(st); log["pointerLog"].append({"k": k, "x": round(p[0], 1), "y": round(p[1], 1), "buttons": 1, **(st or {})})
            if k in (6, 12, 18, 24): P.settle(); frames.append({"k": k, "staged": st["staged"], "committed": st["committed"], "frame": frame(f"E-live-{k:02d}-pressed")})
        P.mouse("mouseReleased", *pts[-1], 0); time.sleep(0.8)
        after = S("GPFlow.P.totals().plants"); last = S("GPFlow.brush.last")
        offPath = S("Object.values(GPFlow.P.state.instances).flatMap((i) => i.plants).filter((p) => !GPFlow.cellAt(p.x, p.y)).length")
        onWalk = S("(() => { const w = GPFlow.store.getObject('built.gravel-walks'); const g = w.geometry; const inP = (poly, x, y) => { let c = false; for (const r of poly) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }; const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; return Object.values(GPFlow.P.state.instances).flatMap((i) => i.plants).filter((p) => polys.some((q) => inP(q, p.x, p.y))).length; })()")
        frames.append({"k": "released", "frame": frame("E-live-25-released")})
        grew = [s["staged"] for s in seen]; monotone = all(grew[i] >= grew[i - 1] for i in range(1, len(grew)))
        r = {"stagedDuringDrag": grew[::4], "committedDuringDrag": sorted({s["committed"] for s in seen}), "committedAfter": after - t0, "undoSteps": S("GPFlow.P.past.length") - u0, "beds": last["beds"], "cells": last["cells"], "plantsOutsideCells": offPath, "plantsOnWalk": onWalk,
             "meanMoveMs": last["meanMoveMs"], "maxMoveMs": last["maxMoveMs"], "frames": frames}
        r["ok"] = grew[5] > 0 and grew[-1] > grew[5] and monotone and r["committedDuringDrag"] == [t0] and after - t0 == grew[-1] and r["undoSteps"] == 1 and last["beds"] >= 2 and offPath == 0 and onWalk == 0
        log["liveStroke"] = r; return r
    step("brush-live-stroke", "E", "Press on B1, drag across the walk to B2 (25 real mouse moves), release", "Plants appear and increase WHILE the button is held (frames + staged counts, nothing committed); on release the same plants are committed in one undo step; no plant on the walk or outside a cell", live_stroke)
    def esc_cancel():
        f0 = fp(); a, b = cen("bed.B3N"), cen("bed.B3S"); focus(["bed.B3N", "bed.B3S"]); time.sleep(0.6); p0, p1 = P.world(*a), P.world(*b)
        P.mouse("mouseMoved", *p0); P.mouse("mousePressed", *p0, 1)
        for k in range(1, 9): P.mouse("mouseMoved", p0[0] + (p1[0] - p0[0]) * k / 8, p0[1] + (p1[1] - p0[1]) * k / 8, 1)
        staged = S("GPFlow.brush.stagedPlants().length"); key("Escape", vk=27); P.mouse("mouseReleased", *p1, 0); time.sleep(0.5)
        return {"stagedBeforeEsc": staged, "unchanged": fp() == f0, "ok": staged > 0 and fp() == f0}
    step("brush-esc-cancel", "E", "Drag over B3N → B3S, press Esc before releasing", "Staged plants discarded; design unchanged", esc_cancel)
    def undo_redo():
        f1 = fp(); P.click_el("#fundo"); time.sleep(0.6); f0 = fp(); P.click_el("#fredo"); time.sleep(0.6); f2 = fp()
        return {"undone": f0 != f1, "redoneSame": f2 == f1, "ok": f0 != f1 and f2 == f1}
    step("brush-undo-redo", "E", "Click Undo, then Redo (dock)", "The whole stroke disappears and comes back identically", undo_redo)
    def repeat():
        focus(["bed.B1", "bed.B2"]); time.sleep(0.6); f0 = fp(); a, b = log["liveStrokeWorld"]; pts = [P.world(a[0] + (b[0] - a[0]) * k / 24, a[1] + (b[1] - a[1]) * k / 24) for k in range(25)]; P.drag(pts); time.sleep(0.8)
        return {"added": S("GPFlow.brush.last.added"), "same": fp() == f0, "ok": fp() == f0}
    step("brush-repeat-no-stacking", "E", "Drag the same stroke again", "Same world-anchored candidates: nothing added, nothing stacked", repeat)
    def zoom_metric():
        a, b = cen("bed.B4"), cen("bed.B5"); focus(["bed.B4", "bed.B5"]); time.sleep(0.6); res = []
        for scale in (1.0, 2.2):
            S(f"(() => {{ const p = GPFlow.plan; p.view.scale *= {scale}; p.request(); return true; }})()"); time.sleep(0.5)
            pts = [P.world(a[0] + (b[0] - a[0]) * k / 10, a[1] + (b[1] - a[1]) * k / 10) for k in range(11)]
            pts = [p for p in pts if 0 < p[0] < 1030 and 60 < p[1] < 830]
            P.drag(pts); time.sleep(0.8)
            d = S(f"(() => {{ const a = {json.dumps(a)}, b = {json.dumps(b)}; const ids = new Set(GPFlow.P.past.length ? Object.values(GPFlow.P.state.instances).flatMap((i) => i.plants).map((p) => p.id) : []); const r = GPFlow.brush.active.r; let mx = 0; for (const i of Object.values(GPFlow.P.state.instances)) for (const p of i.plants) {{ if (p.mixId !== GPFlow.brush.active.mixId) continue; const vx = b[0] - a[0], vy = b[1] - a[1]; const L2 = vx * vx + vy * vy; let t = ((p.x - a[0]) * vx + (p.y - a[1]) * vy) / L2; t = Math.max(0, Math.min(1, t)); const dd = Math.hypot(a[0] + t * vx - p.x, a[1] + t * vy - p.y); if (dd < 8) mx = Math.max(mx, dd); }} return {{ r, maxDist: +mx.toFixed(2), added: GPFlow.brush.last.added, scale: +GPFlow.plan.view.scale.toFixed(1) }}; }})()")
            res.append(d); key("z", "KeyZ", 90, 4) if scale == 1.0 else None; time.sleep(0.5)
        return {"runs": res, "ok": all(r["maxDist"] <= r["r"] + 0.25 for r in res) and res[0]["added"] > 0}
    step("brush-zoom-metric", "E", "Stroke B4 → B5 at two zoom levels (undo between)", "The brush is in metres: at both zooms plants lie within the same radius of the stroke", zoom_metric)
    def fast_drag():
        focus(["bed.A3N", "bed.A3S"]); time.sleep(0.6); a, b = cen("bed.A3N"), cen("bed.A3S"); pts = [P.world(a[0] + (b[0] - a[0]) * k / 3, a[1] + (b[1] - a[1]) * k / 3) for k in range(4)]
        P.drag(pts); time.sleep(0.8)
        gaps = S(f"(() => {{ const a = {json.dumps(a)}, b = {json.dumps(b)}; const pl = Object.values(GPFlow.P.state.instances).flatMap((i) => i.plants); let miss = 0, tot = 0; for (let k = 1; k < 40; k++) {{ const x = a[0] + (b[0] - a[0]) * k / 40, y = a[1] + (b[1] - a[1]) * k / 40; if (!GPFlow.cellAt(x, y)) continue; tot++; if (!pl.some((p) => Math.hypot(p.x - x, p.y - y) < 1.2)) miss++; }} return {{ tot, miss, samples: GPFlow.brush.last.samples, moves: GPFlow.brush.last.moves }}; }})()")
        gaps["ok"] = gaps["tot"] > 5 and gaps["miss"] == 0; return gaps
    step("brush-fast-drag", "E", "A fast drag: only 3 mouse moves over ~25 m", "The stroke is densified (step ≤ radius / 2): no gap along the path inside the beds", fast_drag)

    # ------------------------------------------------------------------ F · layers, Cell Fill, Auto, freeze, shared edit, 2D/3D
    def overlay_only():
        focus(["bed.B1", "bed.B2"]); time.sleep(0.6); P.click_el(f".mixcard[data-mix='{mixC}'] header"); time.sleep(0.4)
        P.click_el("#fhud [data-slot=base]"); time.sleep(0.2)
        bul = S("!!document.querySelector('#fhud [data-slot=ephemeral]')")
        if bul: P.click_el("#fhud [data-slot=ephemeral]"); time.sleep(0.2)
        slots = S("GPFlow.brush.active.slots")
        BASE = "(() => { let n = 0; for (const [c, i] of Object.entries(GPFlow.P.state.instances)) if (/\\.B1\\.|\\.B2\\./.test(c)) for (const p of i.plants) if (p.slot === 'base') n += p.x * 7 + p.y; return +n.toFixed(2); })()"
        b0 = S(BASE); o0 = S("Object.values(GPFlow.P.state.instances).flatMap((i) => i.plants).filter((p) => p.slot === 'overlay').length")
        a, b = cen("bed.B1"), cen("bed.B2"); pts = [P.world(a[0] + (b[0] - a[0]) * k / 20 + 0.8, a[1] + (b[1] - a[1]) * k / 20) for k in range(21)]; P.drag(pts); time.sleep(0.8)
        b1 = S(BASE); o1 = S("Object.values(GPFlow.P.state.instances).flatMap((i) => i.plants).filter((p) => p.slot === 'overlay').length")
        return {"slots": slots, "baseUnchanged": b0 == b1, "overlayBefore": o0, "overlayAfter": o1, "ok": slots == ["overlay"] and b0 == b1 and o1 != o0}
    step("brush-overlay-keeps-matrix", "F", "Choose Colour blocks, switch the HUD to Overlay only, drag over the painted matrix", "Emergents of the new mix appear over the existing matrix; the matrix (base) is kept exactly", overlay_only)
    def cell_fill():
        key("Escape", vk=27); time.sleep(0.3); focus(["bed.C3"]); time.sleep(0.6)
        c = S("GPFlow.P.state.beds['bed.C3'].cellIds[0]"); x, y = P.world(*S(f"GPFlow.P.state.cells['{c}'].center")); P.click(x, y); time.sleep(0.5)
        P.click_el(f".mixcard[data-mix='{mixM}'] [data-edit]"); time.sleep(0.3); P.click_el("#dpanel [data-a=close]"); time.sleep(0.3)
        S(f"GPFlow.P.setView({{ selectedMix: '{mixM}' }}); true")
        P.click_el("#finsp [data-i=fill]"); time.sleep(0.8)
        inst = S(f"(() => {{ const i = GPFlow.P.state.instances['{c}']; return i ? {{ n: i.plants.length, target: i.target, frag: GPFlow.P.state.assignments['{c}'].fragments.map((f) => f.geometry ? 'part' : 'whole') }} : null; }})()")
        return {"cell": c, "inst": inst, "ok": bool(inst) and inst["n"] > 10 and "whole" in inst["frag"]}
    step("cell-fill", "F", "Esc (brush off), click a C3 cell, “Fill with Dropseed matrix” in the inspector", "The whole cell is filled by the same engine (whole-cell fragment, target vs placed shown)", cell_fill)
    def freeze():
        c = S("GPFlow.P.state.beds['bed.C3'].cellIds[0]"); P.click_el("#finsp [data-i=freeze]"); time.sleep(0.5)
        f0 = S(f"JSON.stringify(GPFlow.P.state.instances['{c}'].plants.map((p) => p.id + p.x))")
        P.click_el(f".mixcard[data-mix='{mixC}'] header"); time.sleep(0.3); x, y = P.world(*S(f"GPFlow.P.state.cells['{c}'].center")); P.drag([[x - 60, y], [x, y], [x + 60, y]]); time.sleep(0.8)
        f1 = S(f"JSON.stringify(GPFlow.P.state.instances['{c}'].plants.map((p) => p.id + p.x))"); key("Escape", vk=27)
        return {"frozen": S(f"!!GPFlow.P.state.locks['{c}']"), "unchanged": f0 == f1, "ok": f0 == f1 and S(f"!!GPFlow.P.state.locks['{c}']")}
    step("freeze", "F", "“Freeze” the filled cell, then brush across it", "The frozen cell keeps every plant", freeze)
    def auto():
        key("Escape", vk=27); time.sleep(0.3); P.click_el("#dpanel [data-a=auto]"); time.sleep(1.2); n = S("GPFlow.u.autoPreview ? GPFlow.u.autoPreview.proposals.length : 0"); f0 = fp()
        P.click_el("#dpanel [data-a=autoaccept]"); time.sleep(2)
        return {"proposals": n, "changed": fp() != f0, "planted": S("GPFlow.P.totals().assigned"), "cells": S("GPFlow.P.allCells().length"), "ok": n > 10 and fp() != f0}
    step("auto-compose", "F", "Click “Auto compose”, check the dashed proposal, Accept", "Unplanted cells get mixes by the documented greedy rule; previewed first; one undo step", auto)
    def shared_edit():
        P.click_el(f".mixcard[data-mix='{mixM}'] [data-edit]"); time.sleep(0.6)
        lid = S(f"GPFlow.P.mix('{mixM}').layers.find((L) => L.slot === 'overlay').id"); P.type(f"#dpanel [data-lden='{lid}']", "1.4"); key("Tab", vk=9); time.sleep(1.5)
        imp = S("(() => { const p = GPFlow.u.editor && GPFlow.u.editor.preview; return p ? { uses: p.uses.length, before: p.before, after: p.after, frozen: p.frozen.length } : null; })()")
        P.click_el("#dpanel [data-a=applyall]"); time.sleep(2)
        v = S(f"GPFlow.P.mix('{mixM}').version")
        return {"impact": imp, "version": v, "ok": bool(imp) and imp["after"] != imp["before"] and v >= 2}
    step("shared-mix-edit", "F", "Open the Matrix recipe, set its emergent layer to 1.4 / m², read the impact, “Update all”", "Impact previewed (cells, plants before → after, frozen excluded); only fragments of this mix re-filled", shared_edit)
    def axo():
        P.click_el("#dpanel [data-a=close]"); time.sleep(0.3); rows = S("GPFlow.store.model.placements.filter((p) => p.kind === 'plants').reduce((a, p) => a + p.countModelled, 0)"); tot = S("GPFlow.P.totals().plants")
        P.click_el("#fdock [data-mode=axo]"); time.sleep(3)
        return {"view": S("GPFlow.ctx.st.view"), "modelRows": rows, "projectPlants": tot, "ok": S("GPFlow.ctx.st.view") == "3d" and rows == tot}
    step("axo-same-instances", "F", "Click Axo in the dock", "The 3D view shows the same plant instances (model rows = project plants)", axo)

    # ------------------------------------------------------------------ G / H · Explore, views, months, distribution
    def explore():
        P.click_el("#fdock [data-mode=plan]"); time.sleep(0.8); P.click_el("#fnext"); time.sleep(2)
        return {"stage": S("GPFlow.stage()"), "mode": S("GPFlow.mode()"), "ok": S("GPFlow.stage()") == "explore" and S("GPFlow.mode()") == "performance"}
    step("explore-performance", "H", "Plan, then Continue to Explore", "Performance view: 1 m pixels of flowering plants / m² for the month, unknown hatched, continuity links, short legend; timeline in the dock", explore)
    def regions():
        for bed, mix in (("bed.A2", mixC), ("bed.A4", S("GPFlow.P.state.mixes.find((m) => m.id.includes('organic')).id"))):
            S(f"GPFlow.go('compose'); true"); time.sleep(0.5); focus([bed]); time.sleep(0.5)
            cells = S(f"GPFlow.P.state.beds['{bed}'].cellIds.filter((c) => !GPFlow.P.state.locks[c])")
            x, y = P.world(*S(f"GPFlow.P.state.cells['{cells[0]}'].center")); P.click(x, y); time.sleep(0.3)
            for c in cells[1:]: x, y = P.world(*S(f"GPFlow.P.state.cells['{c}'].center")); P.click(x, y, shift=True); time.sleep(0.05)
            S(f"GPFlow.P.setView({{ selectedMix: '{mix}' }}); true"); P.click_el("#finsp [data-i=fill]"); time.sleep(1.2)
        P.click_el("#fsteps [data-st=explore]"); time.sleep(1.5); focus(["bed.A2", "bed.A4"]); time.sleep(0.6)
        for bed in ("bed.A2", "bed.A4"):
            for i, c in enumerate(S(f"GPFlow.P.state.beds['{bed}'].cellIds")):
                x, y = P.world(*S(f"GPFlow.P.state.cells['{c}'].center")); P.click(x, y, shift=(bed != 'bed.A2' or i > 0)); time.sleep(0.04)
        P.click_el(f"#ftrack [data-m='6']"); time.sleep(1)
        rows = S("(() => { const m = 6; const out = {}; for (const b of ['bed.A2', 'bed.A4']) { let area = 0, pl = 0, fl = 0, unk = 0, pres = 0, n = 0; for (const c of GPFlow.P.state.beds[b].cellIds) { const pc = GPFlow.P.perf.perCell[c]; const cell = GPFlow.P.state.cells[c]; if (!pc || pc.status !== 'planted') continue; area += cell.areaM2; pl += pc.plants; fl += pc.months[m].instances; unk += pc.months[m].unknownInstances; pres += pc.months[m].state === 'resource' ? 1 : 0; n++; } out[b] = { area: Math.round(area), plants: pl, flowering: fl, fraction: +(fl / pl).toFixed(3), perM2: +(fl / area).toFixed(2), unknown: unk, presence: pres + '/' + n }; } return out; })()")
        a, b = rows["bed.A2"], rows["bed.A4"]
        rows["table"] = S("!!document.querySelector('#dpanel .members')"); rows["ok"] = abs(a["area"] - b["area"]) / max(a["area"], b["area"]) < 0.2 and abs(a["plants"] - b["plants"]) / max(a["plants"], b["plants"]) < 0.25 and a["flowering"] != b["flowering"] and a["fraction"] != b["fraction"]
        return rows
    step("regions-distribution", "G", "Fill bed A2 with Colour blocks and A4 with Organic groups (select cells, Fill), shift-click both beds in Explore, June", "Similar area and plant totals; presence can be similar, but flowering counts / fraction / per m² differ; unknown apart", regions)
    def illus_off():
        u0 = S("GPFlow.P.perf.byMonth[6].unknownInstances"); f0 = S("GPFlow.P.perf.byMonth[6].floweringInstances"); P.click_el("#fsteps [data-st=define]"); time.sleep(0.8)
        P.click_el("#dpanel [data-ks=illustrative]"); time.sleep(1.2); u1 = S("GPFlow.P.perf.byMonth[6].unknownInstances"); f1 = S("GPFlow.P.perf.byMonth[6].floweringInstances")
        P.click_el("#dpanel [data-ks=illustrative]"); time.sleep(1); P.click_el("#fsteps [data-st=explore]"); time.sleep(1)
        return {"unknownOn": u0, "unknownOff": u1, "floweringOn": f0, "floweringOff": f1, "ok": u1 > u0 and f1 < f0}
    step("illustrative-off", "G", "Define → untick the Illustrative layer, read June, tick it again", "Without the teaching layer the unknown count rises and known flowering falls — shown as unknown, never as 0", illus_off)
    def views():
        f0 = fp(); cx0 = S("GPFlow.plan.view.cx"); out = {}
        for m in ("plan", "axo", "plan", "diagram", "performance"):
            P.click_el(f"#fdock [data-mode={m}]"); time.sleep(2.5 if m == "axo" else 0.8)
            out[m] = S("GPFlow.mode()")
            if m == "diagram":
                for d in ("structure", "mix", "arrangement"): P.click_el(f"#flegend [data-dg={d}]"); time.sleep(0.6); frame(f"H-diagram-{d}")
        for mo in (4, 7, 9): P.click_el(f"#ftrack [data-m='{mo}']"); time.sleep(0.6); frame(f"H-performance-m{mo:02d}")
        P.click_el("#fplay"); time.sleep(2.2); playing = S("GPFlow.u.playing"); P.click_el("#fplay"); time.sleep(0.3)
        return {"modes": out, "played": playing, "designUnchanged": fp() == f0, "cameraKept": abs(S("GPFlow.plan.view.cx") - cx0) < 3, "ok": fp() == f0 and playing and out["diagram"] == "diagram"}
    step("views-and-months", "H", "Dock: Plan → Axo → Plan → Diagram (structure · mix · arrangement) → Performance; months Apr / Jul / Sep; Play, Pause", "Real visual differences, same coordinates; camera target kept; views and timeline never change the design", views)
    def issue_loop():
        iss = S("(() => { const i = GPFlow.P.perf.issues.find((x) => x.actions.includes('reassign') && x.cells.length); return i ? i.id : null; })()")
        f0 = fp(); P.click_el(f"#dpanel [data-act='reassign|{iss}']"); time.sleep(1); st = S("GPFlow.stage()"); sel = S("GPFlow.u.cells.size")
        c = S("[...GPFlow.u.cells][0]"); other = S(f"(() => {{ const a = GPFlow.P.state.assignments['{c}']; const used = new Set(a ? a.fragments.map((f) => f.mixId) : []); return (GPFlow.P.state.mixes.find((m) => !used.has(m.id)) || GPFlow.P.state.mixes[0]).id; }})()")
        P.click_el(f".mixcard[data-mix='{other}'] header"); time.sleep(0.3); S(f"GPFlow.focusCells(['{c}']); true"); time.sleep(0.5); x, y = P.world(*S(f"GPFlow.P.state.cells['{c}'].center")); P.drag([[x - 30, y], [x, y + 10], [x + 30, y]]); time.sleep(0.8); key("Escape", vk=27)
        P.click_el("#fsteps [data-st=explore]"); time.sleep(1)
        return {"issue": iss, "stage": st, "selected": sel, "changed": fp() != f0, "ok": st == "compose" and sel > 0 and fp() != f0}
    step("issue-back-to-compose", "H", "In “To look at”, click “Repaint these cells”, paint, return to Explore", "Compose opens with the issue's cells selected; the change is recomputed in Explore", issue_loop)

    # ------------------------------------------------------------------ I · Knowledge
    def knowledge():
        P.click_el(".f-sections [data-ws=knowledge]"); time.sleep(1.5)
        P.click_el("#fknow [data-lens=ecology]"); time.sleep(0.8); edges = S("document.querySelectorAll('#fknow path.e').length")
        P.click_el("#fknow .k-net .n[data-n^='grp:']"); time.sleep(0.6); dimmed = S("document.querySelectorAll('#fknow .n.dim').length")
        P.click_el("#fknow path.e:not(.dim)"); time.sleep(0.5); ev = S("!!document.querySelector('#fknow .k-side h3')")
        P.click_el("#fknow [data-tab=matrix]"); time.sleep(0.5); mx = S("document.querySelectorAll('#fknow .k-mx td[data-e]').length")
        P.click_el("#fknow [data-tab=table]"); time.sleep(0.5); tb = S("document.querySelectorAll('#fknow .k-tb tr[data-e]').length")
        P.click_el("#fknow [data-tab=network]"); time.sleep(0.5); P.click_el("#fknow [data-lens=spatial]"); time.sleep(1); sp = S("document.querySelectorAll('#fknow path.e').length")
        return {"ecologyEdges": edges, "dimmed": dimmed, "evidence": ev, "matrixCells": mx, "tableRows": tb, "spatialEdges": sp, "ok": edges > 5 and dimmed > 0 and ev and mx > 0 and tb > 0 and sp > 5}
    step("knowledge-lenses", "I", "Knowledge tab → Ecological association lens, click a plant node, click a line; Matrix, Table; Spatial function lens", "X · Plants → Z → Y network from real relations; focus dims the rest; a line shows its evidence; Matrix / Table read the same edges; V4.3 spatial-function relations are back", knowledge)
    def knowledge_add():
        sp = S("(() => { const ids = [...new Set(Object.values(GPFlow.P.state.instances).flatMap((i) => i.plants.map((p) => p.plantId)))]; return ids.find((id) => GPFlow.K.traits(id).bloom.status === 'unknown'); })()")
        u0 = S("GPFlow.P.perf.byMonth[6].unknownInstances")
        P.click_el("#fknow [data-lens=environment]"); time.sleep(0.4); P.click_el("#fknow [data-scope=project]"); time.sleep(0.4)
        S(f"(() => {{ const KV = GPFlow.KV; KV.focus = {{ id: '{sp}' }}; KV.render(); return true; }})()")  # select the plant the issue names (equivalent to clicking its node)
        P.click_el("#fknow details.kadd summary"); time.sleep(0.3); P.type("#fknow form [name=bloom]", "6-7"); P.type("#fknow form [name=original]", "TEST: observed flowering June–July in the garden"); P.click_el("#fknow form .btn-p"); time.sleep(1.2)
        prev = S("GPFlow.KV.pending ? GPFlow.KV.pending.lines : null"); P.click_el("#fknow [data-k=apply]"); time.sleep(1)
        u1 = S("GPFlow.P.perf.byMonth[6].unknownInstances"); P.click_el("#fknow [data-k=back]"); time.sleep(1)
        return {"plant": sp, "preview": prev, "unknownJuneBefore": u0, "unknownJuneAfter": u1, "back": S("document.getElementById('fknow').hidden"), "stage": S("GPFlow.stage()"), "ok": bool(prev) and u1 < u0 and S("document.getElementById('fknow').hidden")}
    step("knowledge-record", "I", "Add a project record (flowering 6–7) for a placed plant with unknown flowering → preview the effect → Apply → Back to the design", "The effect (metrics before → after) is shown before applying; after Apply the unknown count falls; the design (stage, selection) is where it was", knowledge_add)

    # ------------------------------------------------------------------ J · save, compare, reload
    def snapshots():
        P.click_el("#dpanel [data-a=snap]"); time.sleep(0.8); P.click_el("#fsteps [data-st=compose]"); time.sleep(0.6); focus(["bed.B4"]); time.sleep(0.5)
        P.click_el(f".mixcard[data-mix='{mixC}'] header"); time.sleep(0.3); a = cen("bed.B4"); x, y = P.world(*a); P.drag([[x - 50, y - 20], [x, y], [x + 50, y + 20]]); time.sleep(0.8); key("Escape", vk=27)
        P.click_el("#fsteps [data-st=explore]"); time.sleep(1); P.click_el("#dpanel [data-cmp]"); time.sleep(1)
        return {"snapshots": S("GPFlow.P.snapshots().length"), "compare": S("!!document.querySelector('#dpanel .compare table')"), "ok": S("GPFlow.P.snapshots().length") >= 1 and S("!!document.querySelector('#dpanel .compare table')")}
    step("save-compare", "J", "“Save this option”, change the design, “compare”", "Both options compared with the same definitions, month and scope (recomputed now)", snapshots)
    def export():
        e = S("(() => { const e = GPFlow.P.exportData(); const i = e.instances[0]; return { schema: e.schema, plants: e.instances.length, z: Number.isFinite(i.z), slot: i.slot, frags: e.cells.filter((c) => c.fragments.length).length, mixes: e.mixes.length, layers: e.mixes[0].layers.length, assumptions: e.assumptions.length, frozen: e.cells.filter((c) => c.frozen).length }; })()")
        e["ok"] = e["z"] and e["plants"] > 500 and e["frags"] > 0 and e["frozen"] >= 1; return e
    step("export", "J", "Export JSON (read)", "Instances with x / y / z, slot, fragment and mix version; layered recipes; frozen cells; assumptions", export, shot=False)
    def reload():
        f0 = fp(); frags = S("Object.values(GPFlow.P.state.assignments).reduce((a, x) => a + x.fragments.length, 0)"); locks = S("Object.keys(GPFlow.P.state.locks).length")
        P("Page.navigate", url=base + "?resume=1&intro=0"); P.wait("document.documentElement.dataset.ready === '1' && !!window.GPFlow && GPFlow._ready", 300); time.sleep(3)
        return {"same": fp() == f0, "fragments": [frags, S("Object.values(GPFlow.P.state.assignments).reduce((a, x) => a + x.fragments.length, 0)")], "locks": [locks, S("Object.keys(GPFlow.P.state.locks).length")], "stage": S("GPFlow.stage()"), "ok": fp() == f0 and locks == S("Object.keys(GPFlow.P.state.locks).length")}
    step("reload-resume", "J", "Reload the page (resume)", "Plants (ids, x, y), fragments, locks, strategy and stage restored", reload)

    # ------------------------------------------------------------------ K · narrow layout
    if narrow:
        def narrow_shot():
            P("Emulation.setDeviceMetricsOverride", width=820, height=1000, deviceScaleFactor=1, mobile=False); time.sleep(1.5)
            r = {"dock": S("document.getElementById('fdock').getBoundingClientRect().height"), "panelTop": S("document.getElementById('dpanel').getBoundingClientRect().top"), "overflowX": S("document.documentElement.scrollWidth > innerWidth")}
            r["ok"] = not r["overflowX"]; return r
        step("narrow-820", "K", "Resize to 820 × 1000", "Canvas above, panel below, dock in two rows; no horizontal overflow", narrow_shot)
        P("Emulation.setDeviceMetricsOverride", width=1440, height=900, deviceScaleFactor=1, mobile=False)
    log["consoleErrors"] = list(P.errors); log["finished"] = time.strftime("%Y-%m-%d %H:%M:%S")
    log["passed"] = sum(1 for s in log["steps"] if s["result"] == "pass"); log["failed"] = sum(1 for s in log["steps"] if s["result"] != "pass")
    json.dump(log, open(os.path.join(ROOT, "docs", "qa", "v2_e2e.json"), "w"), indent=1)
    print(f"journey: {log['passed']} passed, {log['failed']} failed, console errors {len(log['consoleErrors'])}")
    return log


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--serve", default=ROOT); ap.add_argument("--only", default=""); ap.add_argument("--port", type=int, default=8798)
    a = ap.parse_args(); os.makedirs(SHOTS, exist_ok=True); os.makedirs(os.path.join(ROOT, "docs", "qa"), exist_ok=True)
    P, chrome, srv, base = launch(a.serve, a.port, 9362)
    try:
        if a.only in ("", "unit"): unit(P, base)
        if a.only in ("", "journey"): P.errors.clear(); journey(P, base)
    finally:
        chrome.terminate(); srv.shutdown()


if __name__ == "__main__":
    main()
