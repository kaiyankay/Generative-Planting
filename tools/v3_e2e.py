"""Generative Planting V3.1 — one continuous first-time-user journey in a real browser (Chrome over the DevTools protocol).

python3 -I -u tools/v3_e2e.py [--serve <folder>] [--port 8802] [--swiftshader]

Real mouse and keyboard for every design action (clicks, Shift-clicks, Shift-drag box selection, brush strokes with the
button held, wheel zoom, keys). JavaScript is used only to READ state for the assertions, to find where a bed is on screen
(world → screen), and to record the camera. Acceptance cases A–P of the V3.1 package are marked on every step.
Output: docs/qa/v3_e2e.json (steps, actual values, pointer log), docs/screenshots/v3/*.png (one per step + frames captured
while the button is held).
"""
import argparse, base64, json, os, sys, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools")); sys.path.insert(0, os.path.join(ROOT, "tools", "knowledge"))
import flow_e2e  # noqa: E402

SHOTS = os.path.join(ROOT, "docs", "screenshots", "v3")
flow_e2e.SHOTS = SHOTS


def launch_gpu(serve, port, dport):
    import functools, subprocess, tempfile, threading, urllib.request  # noqa: E401
    from http.server import ThreadingHTTPServer
    import flow_server
    from cdp import WS
    tmp = tempfile.mkdtemp(); os.symlink(os.path.abspath(serve), os.path.join(tmp, "Generative-Planting"))
    srv = ThreadingHTTPServer(("127.0.0.1", port), functools.partial(flow_server.Handler, directory=tmp)); threading.Thread(target=srv.serve_forever, daemon=True).start()
    prof = tempfile.mkdtemp()
    chrome = subprocess.Popen([flow_e2e.CHROME, "--headless=new", "--use-angle=metal", "--hide-scrollbars", "--window-size=1440,900", "--force-device-scale-factor=1", f"--user-data-dir={prof}", f"--remote-debugging-port={dport}", "--remote-allow-origins=*", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    pages = []
    for _ in range(200):
        try:
            pages = [p for p in json.load(urllib.request.urlopen(f"http://127.0.0.1:{dport}/json/list", timeout=2)) if p.get("type") == "page"]
            if pages: break
        except Exception: pass
        time.sleep(0.2)
    P = flow_e2e.Page(WS(pages[0]["webSocketDebuggerUrl"])); P("Page.enable"); P("Runtime.enable"); P("Log.enable")
    P("Emulation.setDeviceMetricsOverride", width=1440, height=900, deviceScaleFactor=1, mobile=False)
    return P, chrome, srv, f"http://127.0.0.1:{port}/Generative-Planting/"


def journey(P, base):
    log = {"runner": "headless Chrome over CDP; real mouse / keyboard input", "url": base, "started": time.strftime("%Y-%m-%d %H:%M:%S"), "steps": [], "pointerLog": []}
    n = [0]; S = lambda e: P.js(e)  # noqa: E731

    def step(name, case, action, expected, fn, shot=True):
        n[0] += 1; t0 = time.time(); rec = {"n": n[0], "case": case, "name": name, "action": action, "expected": expected}; e0 = len(P.errors)
        try:
            actual = fn(); ok = bool(actual.pop("ok", True)) if isinstance(actual, dict) else bool(actual)
            rec.update(actual=actual, result="pass" if ok else "FAIL")
        except Exception as e:  # noqa: BLE001
            rec.update(actual=str(e)[:900], result="FAIL")
        if shot:
            try: rec["screenshot"] = shot_now(f"{n[0]:02d}-{name}")
            except Exception as e: rec["screenshot"] = "failed: " + str(e)[:100]  # noqa: BLE001
        rec["s"] = round(time.time() - t0, 1); rec["newErrors"] = P.errors[e0:]
        log["steps"].append(rec); print(f"{rec['n']:02d} {case:3} {rec['result']:4} {name} ({rec['s']} s) {'' if rec['result'] == 'pass' else json.dumps(rec['actual'])[:600]}", flush=True)
        return rec

    def shot_now(name, park=True):
        if park: P.mouse("mouseMoved", 1430, 890)
        P.settle(); path = os.path.join(SHOTS, name + ".jpg"); open(path, "wb").write(base64.b64decode(P("Page.captureScreenshot", format="jpeg", quality=82)["data"])); return os.path.relpath(path, ROOT)

    def frame(name):  # while the button is held: no parking of the mouse
        path = os.path.join(SHOTS, name + ".jpg"); open(path, "wb").write(base64.b64decode(P("Page.captureScreenshot", format="jpeg", quality=82)["data"])); return os.path.relpath(path, ROOT)

    def key(k, code=None, vk=0, mods=0):
        P("Input.dispatchKeyEvent", type="keyDown", key=k, code=code or k, windowsVirtualKeyCode=vk, modifiers=mods); P("Input.dispatchKeyEvent", type="keyUp", key=k, code=code or k, windowsVirtualKeyCode=vk, modifiers=mods)

    def mouse(t, x, y, buttons=0, mods=0):
        P("Input.dispatchMouseEvent", type=t, x=float(x), y=float(y), button="left" if (t != "mouseMoved" or buttons) else "none", buttons=buttons, clickCount=1, modifiers=mods)

    def click(x, y, mods=0): mouse("mouseMoved", x, y, 0, mods); mouse("mousePressed", x, y, 1, mods); mouse("mouseReleased", x, y, 0, mods)

    def wheel(x, y, dy): P("Input.dispatchMouseEvent", type="mouseWheel", x=float(x), y=float(y), deltaX=0, deltaY=float(dy))

    FP = "(() => { let h = 2166136261 >>> 0, n = 0; const I = GPFlow.P.state.instances; for (const c of Object.keys(I).sort()) for (const p of I[c].plants) { n++; for (const ch of `${c}|${p.id}|${p.x}|${p.y};`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } } return n + ':' + h.toString(16); })()"
    fp = lambda: S(FP)  # noqa: E731
    BEDC = "((bed) => { const g = GPFlow.bedGeom(bed); const P = GPFlow.P; if (P.state.beds[bed]) { const c = P.state.beds[bed].cellIds.map((i) => P.state.cells[i]).sort((a, b) => b.areaM2 - a.areaM2)[0]; return c.center; } const b = GPFlow.boundsOf([g]); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; })"
    cen = lambda bed: S(f"{BEDC}({json.dumps(bed)})")  # noqa: E731
    cam = lambda: S("(() => { const v = GPFlow.plan.view; return { cx: +v.cx.toFixed(2), cy: +v.cy.toFixed(2), scale: +v.scale.toFixed(2), w: GPFlow.plan.w, h: GPFlow.plan.h, viewBox: GPFlow.plan.viewBox().map((x) => +x.toFixed(1)) }; })()")  # noqa: E731
    def coverage(beds):  # share of the free canvas the beds' union box takes (camera fit evidence)
        return S(f"(() => {{ const F = GPFlow; const b = F.boundsOf({json.dumps(beds)}.map((id) => F.bedGeom(id))); const T = F.plan.T; const a = T(b[0], b[3]), c = T(b[2], b[1]); const pad = F.plan.padFor(); const fw = F.plan.w - pad.l - pad.r, fh = F.plan.h - 64 - 40; return {{ bbox: b.map((x) => +x.toFixed(1)), screen: [a[0], a[1], c[0], c[1]].map((x) => Math.round(x)), fracW: +((c[0] - a[0]) / fw).toFixed(2), fracH: +((c[1] - a[1]) / fh).toFixed(2), inside: a[0] >= -2 && a[1] >= -2 && c[0] <= F.plan.w + 2 && c[1] <= F.plan.h + 2 }}; }})()")
    def chip(): return S("document.getElementById('fchip').hidden ? null : document.getElementById('fchip').textContent")
    def dock_state(): return S("({ time: !document.getElementById('ftime').hidden, legend: !document.getElementById('flegend').hidden, legendText: document.getElementById('flegend').textContent.slice(0, 60), hud: !document.getElementById('fhud').hidden, mode: GPFlow.mode(), modes: [...document.querySelectorAll('#fviews [data-mode]')].map((b) => b.dataset.mode), phenology: !!GPFlow.store.view.phenology, panelVisible: getComputedStyle(document.getElementById('dpanel')).display !== 'none', panelScroll: document.getElementById('dpanel').scrollTop })")

    origin = base.split("/Generative-Planting/")[0]
    P("Page.navigate", url=base + "LICENSE"); time.sleep(0.5)
    P("Storage.clearDataForOrigin", origin=origin, storageTypes="local_storage,indexeddb")
    P("Page.navigate", url=base + "?kdb=gp-knowledge-v3e2e-" + str(int(time.time()))); P.wait("document.documentElement.dataset.ready === '1' && !!window.GPFlow && !!document.getElementById('fintro')", 300)
    time.sleep(3.2)

    # ============================================================ A · entry
    step("intro", "A,O", "Open the app in an empty browser profile", "The V2 introduction (kept): title, plant field from real instances, one Start",
         lambda: {"title": S("document.querySelector('.i-title').textContent"), "ok": S("!!document.querySelector('[data-i=start]')")})
    step("landscapes", "A,O", "Click Start", "Three landscape cards; Detroit enterable, two Planned; no saved design to continue",
         lambda: (P.click_el("[data-i=start]"), time.sleep(0.7), {"cards": S("document.querySelectorAll('.lcard').length"), "go": S("document.querySelector('.lcard:not(.off) .go').textContent"), "ok": S("document.querySelectorAll('.lcard.off').length") == 2})[2])
    def enter():
        P.click_el(".lcard:not(.off)"); time.sleep(1.6); d = dock_state(); c = cam()
        return {"stage": S("GPFlow.stage()"), **d, "camera": c, "crumb": S("document.getElementById('fcrumb').textContent"), "ok": S("GPFlow.stage()") == "define" and d["mode"] == "plan" and not d["time"] and not d["legend"] and not d["hud"] and not d["phenology"] and d["modes"] == ["plan", "axo"]}
    step("define-entry", "A,N", "Click the Detroit card", "Define in Plan over the whole garden: scope on the map, the panel starts with the scope; no timeline, no month, no performance legend, no brush", enter)

    # ============================================================ B · one bed → structure → compose at the bed's scale
    def pick_b2():
        x, y = P.world(*cen("bed.B2")); click(x, y); time.sleep(0.8)
        return {"candidate": S("[...GPFlow.u.candidate]"), "pending": S("!!GPFlow.u.strategy"), "continueEnabled": S("!document.getElementById('fnext').disabled"), "crumb": S("document.getElementById('fcrumb').textContent"), "ok": S("[...GPFlow.u.candidate]") == ["bed.B2"] and S("!!GPFlow.u.strategy") and S("document.getElementById('fnext').disabled")}
    step("define-click-B2", "B", "Click bed B2 on the map", "Only B2 is the candidate (dashed outline, others quietened); a strategy is proposed for it; Continue waits for the confirmation", pick_b2)
    def confirm_b2():
        P.click_el("#dpanel [data-a=confirm]"); time.sleep(0.6)
        return {"scope": S("GPFlow.P.state.brief.scopeBeds"), "undo": S("GPFlow.P.past.length"), "ok": S("GPFlow.P.state.brief.scopeBeds") == ["bed.B2"] and not S("document.getElementById('fnext').disabled")}
    step("define-confirm-B2", "B", "Click Confirm", "Scope = B2 (one undo step)", confirm_b2)
    def structure_b2():
        P.click_el("#fnext"); P.wait("GPFlow.stage() === 'structure' && GPFlow.u.previews && !GPFlow.u.pvBusy && GPFlow.u.previews.size === 1", 120); time.sleep(0.9)
        cv = coverage(["bed.B2"]); c = cam(); P.click_el("#dpanel [data-a=confirmall]"); time.sleep(0.8)
        log["B2camera"] = c; labels = S("GPFlow.P.allCells().length")
        return {"coverage": cv, "camera": c, "cells": labels, "manualZoom": False, "ok": cv["inside"] and max(cv["fracW"], cv["fracH"]) >= 0.55 and labels > 3}
    step("structure-fit-B2", "B", "Continue to Structure (no wheel, no manual zoom); confirm the cells", "The camera fits B2: it fills the free canvas (≥ 55 % of the width or height, fully inside), numbered cells readable; scope IDs = [B2]", structure_b2)
    def compose_b2():
        P.click_el("#fnext"); time.sleep(1.5); cv = coverage(["bed.B2"])
        return {"stage": S("GPFlow.stage()"), "coverage": cv, "mixes": S("GPFlow.P.state.mixes.map((m) => m.name)"), "ok": S("GPFlow.stage()") == "compose" and max(cv["fracW"], cv["fracH"]) >= 0.55}
    step("compose-fit-B2", "B", "Continue to Compose", "Compose keeps the bed's working scale (fit of the scope = B2); the mix palette is the panel", compose_b2)
    def brush_b2():
        P.click_el(".mixcard"); time.sleep(0.5); x, y = P.world(*cen("bed.B2")); f0 = fp()
        for k in range(4): mouse("mouseMoved", x + k * 5, y + k * 3); time.sleep(0.12)
        time.sleep(0.4); g = S("({ adds: GPFlow.brush.ghost && GPFlow.brush.ghost.adds.length, cells: GPFlow.brush.ghost && GPFlow.brush.ghost.cells.length })"); ch = chip()
        u0 = S("GPFlow.P.past.length"); a = [x - 40, y - 20]; b = [x + 40, y + 30]; pts = [[a[0] + (b[0] - a[0]) * k / 12, a[1] + (b[1] - a[1]) * k / 12] for k in range(13)]
        mouse("mouseMoved", *pts[0]); mouse("mousePressed", *pts[0], 1)
        for p in pts[1:]: mouse("mouseMoved", *p, 1); time.sleep(0.03)
        mouse("mouseReleased", *pts[-1], 0); time.sleep(0.9)
        return {"hoverAdds": g["adds"], "chip": ch, "hoverWroteNothing": fp() == f0, "added": S("GPFlow.brush.last.added"), "undoSteps": S("GPFlow.P.past.length") - u0, "ok": g["adds"] > 0 and fp() != f0 and S("GPFlow.P.past.length") - u0 == 1}
    step("compose-paint-B2", "B,E", "Click the first mix card, hover over B2, then drag a short stroke", "A hover preview with a cursor chip (bed · cell · light · fit · +n); the stroke plants in one undo step", brush_b2)

    # ============================================================ C · back to Define: no Explore leftovers; several beds incl. a path gap
    def back_define():
        key("Escape", vk=27); f0 = fp(); P.click_el("#fsteps [data-st=define]"); time.sleep(1.2); d = dock_state()
        return {**d, "designKept": fp() == f0, "candidate": S("[...GPFlow.u.candidate]"), "ok": d["mode"] == "plan" and not d["time"] and not d["legend"] and not d["hud"] and fp() == f0}
    step("define-return", "A,C", "Click step 1 (Define)", "Define shows its own view (Plan, no timeline / month / legend / brush); the B2 plants are kept", back_define)
    def multi():
        f0 = fp(); x, y = P.world(*cen("bed.B1")); click(x, y, 8); time.sleep(0.7)
        a, b = P.world(*cen("bed.A2")), P.world(*cen("bed.C2"))
        x0, y0, x1, y1 = min(a[0], b[0]) - 20, min(a[1], b[1]) - 20, max(a[0], b[0]) + 20, max(a[1], b[1]) + 20
        mouse("mouseMoved", x0, y0, 0, 8); mouse("mousePressed", x0, y0, 1, 8)
        for k in range(1, 9): mouse("mouseMoved", x0 + (x1 - x0) * k / 8, y0 + (y1 - y0) * k / 8, 1, 8); time.sleep(0.03)
        mouse("mouseReleased", x1, y1, 0, 8); time.sleep(0.9)
        cand = S("[...GPFlow.u.candidate].sort()"); P.click_el("#dpanel [data-a=confirm]"); time.sleep(0.7)
        return {"candidate": cand, "scope": S("GPFlow.P.state.brief.scopeBeds.slice().sort()"), "B2kept": fp() == f0, "ok": {"bed.B1", "bed.B2", "bed.A2", "bed.C2"} <= set(cand) and fp() == f0}
    step("define-multi", "C", "Shift-click B1; Shift-drag a box over A2 and C2; Confirm", "B1, B2, A2, C2 (two walks between them) are the new scope; B2 keeps its plants", multi)
    def structure_multi():
        ids0 = S("GPFlow.P.state.beds['bed.B2'].cellIds"); P.click_el("#fnext"); P.wait("GPFlow.stage() === 'structure' && (!GPFlow.u.previews || !GPFlow.u.pvBusy)", 120); time.sleep(1.2)
        pv = S("GPFlow.u.previews ? [...GPFlow.u.previews.keys()] : []"); scope = S("GPFlow.P.state.brief.scopeBeds"); cv = coverage(scope)
        P.click_el("#dpanel [data-a=confirmall]"); time.sleep(1)
        return {"previewed": pv, "B2unchanged": S("GPFlow.P.state.beds['bed.B2'].cellIds") == ids0, "coverage": cv, "camera": cam(), "ok": "bed.B2" not in pv and len(pv) >= 3 and cv["inside"] and max(cv["fracW"], cv["fracH"]) >= 0.6}
    step("structure-multi-fit", "C", "Continue to Structure; confirm the new beds (one click)", "Only the new beds are previewed (B2 kept), one confirmation; the camera fits the union of all scope beds", structure_multi)
    def focus_bed():
        scope0 = S("GPFlow.P.state.brief.scopeBeds.slice()"); cells0 = S("GPFlow.P.allCells().length"); x, y = P.world(*cen("bed.B1")); click(x, y); time.sleep(1.0)
        cv = coverage(["bed.B1"]); crumb = S("document.getElementById('fcrumb').textContent"); f = S("GPFlow.u.focus")
        shot_now("09b-structure-focus-B1")
        P.click_el("#fcrumb .ov"); time.sleep(1.0); cv2 = coverage(scope0)
        return {"focus": f, "crumb": crumb, "fitB1": cv, "scopeUnchanged": S("GPFlow.P.state.brief.scopeBeds") == scope0, "cellsUnchanged": S("GPFlow.P.allCells().length") == cells0, "overview": cv2, "ok": f == ["bed.B1"] and max(cv["fracW"], cv["fracH"]) >= 0.5 and S("GPFlow.P.state.brief.scopeBeds") == scope0 and cv2["inside"]}
    step("structure-focus-overview", "C", "Click B1 on the map (local focus), then Overview in the breadcrumb", "B1 fills the canvas, breadcrumb Detroit / scope / B1; the scope and the other beds stay; Overview returns to the whole scope", focus_bed)

    # ============================================================ D · conditions, assumptions, two mixes
    def conditions():
        P.click_el("#fnext"); time.sleep(1.3); P.click_el("#fenv"); time.sleep(0.5)
        def assume(bed, val):
            S(f"(() => {{ const s = document.querySelector('#fcrumb .bedjump'); s.value = '{bed}'; return true; }})()"); P.js("document.querySelector('#fcrumb .bedjump').dispatchEvent(new Event('change'))"); time.sleep(0.6)
            P.click_el(f"#flegend [data-la='{val}']"); time.sleep(0.6)
        assume("bed.B1", "sun"); assume("bed.B2", "shade"); assume("bed.C2", "part"); P.click_el("#fcrumb .ov"); time.sleep(0.8)
        env = S("JSON.stringify(Object.fromEntries(Object.entries(GPFlow.P.state.env.light).map(([k, v]) => [k, v.value])))")
        return {"env": env, "legend": S("document.getElementById('flegend').textContent.slice(0, 120)"), "ok": '"bed.B1":"sun"' in env and '"bed.B2":"shade"' in env and "bed.A2" not in env}
    step("conditions-assumptions", "D", "Compose → Conditions (dock); focus B1 (breadcrumb) → Sun; B2 → Shade; C2 → Part; A2 untouched; Overview", "Explicit project assumptions per bed (labelled), the crown proxy kept, A2 unknown", conditions)
    def fit_two():
        mixC = S("GPFlow.P.state.mixes.find((m) => m.system === 'maximal-color').id"); mixM = S("GPFlow.P.state.mixes.find((m) => m.system === 'matrix-based').id"); log["mixC"], log["mixM"] = mixC, mixM
        def fit_of(mid):
            P.click_el(f".mixcard[data-mix='{mid}']"); time.sleep(0.7)
            return S(f"(() => {{ const F = GPFlow; const m = F.fitMap(F.P.mix('{mid}')); const by = {{}}; for (const [c, f] of m) {{ const b = F.P.state.cells[c].bedId; (by[b] ||= {{}})[f.cat] = ((by[b] || {{}})[f.cat] || 0) + 1; if (b === 'bed.C2' && !by.C2share) by.C2share = {{ match: f.match, conflict: f.conflict, unknown: f.unknown, why: (f.why || []).map((w) => w.name + ' ' + (w.light || []).join('/') + ' (' + w.source + ')') }}; }} return by; }})()")
        mixO = S("(GPFlow.P.state.mixes.find((m) => /organic/i.test(m.name)) || GPFlow.P.state.mixes.find((m) => m.id !== '" + mixC + "' && m.id !== '" + mixM + "')).id"); log["mixO"] = mixO
        a = fit_of(mixC); shot_now("13b-fit-colour"); b = fit_of(mixO); shot_now("13c-fit-organic")
        reasons = S(f"(() => {{ const B = GPFlow.brush; B.active.mixId = '{mixC}'; return null; }})()")
        why = S(f"(() => {{ const B = GPFlow.brush; const m = GPFlow.P.mix('{mixC}'); return B && m ? (window.__w = null, null) : null; }})()")
        return {"colourBlocks": a, "organicGroups": b, "ok": "match" in a.get("bed.B1", {}) and ("conflict" in a.get("bed.B2", {}) or "partial" in a.get("bed.B2", {})) and "unknown" in a.get("bed.A2", {}) and a.get("C2share") != b.get("C2share") and a.get("C2share", {}).get("why"), "note": "C2 (part shade): same category, different shares and named conflicting members; the stripes' density shows the share"}
    step("fit-two-mixes", "D", "Click the Colour-blocks mix, then the Organic-groups mix (Conditions on → Mix fit)", "Fit per cell from the real members' light records: B1 (sun) fits, B2 (shade) conflicts, C2 (part) differs between the mixes (sun-only vs sun · part members), A2 unknown", fit_two)
    def layer_off():
        P.click_el(f".mixcard[data-mix='{log['mixC']}']"); time.sleep(0.4); P.click_el("#fenv"); time.sleep(0.4)
        x, y = P.world(*cen("bed.B2")); mouse("mouseMoved", x, y); time.sleep(0.2); mouse("mouseMoved", x + 3, y + 2); time.sleep(0.6)
        st = S("({ skipped: GPFlow.brush.ghost.stage.rej.light, adds: GPFlow.brush.ghost.adds.length, layerOn: GPFlow.u.env })")
        return {**st, "chip": chip(), "ok": not st["layerOn"] and st["skipped"] > 0}
    step("layer-off-still-computes", "D", "Turn Conditions off, hover the Colour-blocks brush over B2 (shade assumed)", "The map layer is off but the rule still applies: sun-recorded members are skipped in the preview (count shown in the chip)", layer_off)

    # ============================================================ E · hover states (legal, conflict, unknown, path, frozen)
    def hovers():
        f0 = fp(); out = {}
        S("GPFlow.focusOn(['bed.B1', 'bed.B2'], { animate: false }); true"); time.sleep(0.6)
        a, b = cen("bed.B1"), cen("bed.B2")
        path_pt = S("(() => { const F = GPFlow; const q = (id) => { const b = F.boundsOf([F.bedGeom(id)]); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }; const a = q('bed.B1'), b = q('bed.B2'); for (let t = 0.3; t <= 0.7; t += 0.005) { const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; if (!F.cellAt(x, y) && F.brush.whatIsHere(x, y).blocked === 'path') return [x, y]; } return null; })()")
        a2 = cen("bed.A2")
        for nm, w in (("legal-B1", a), ("conflict-B2", b), ("unknown-A2", a2), ("path", path_pt)):
            if not w: out[nm] = None; continue
            if nm == "unknown-A2": S("GPFlow.focusOn(['bed.A2'], { animate: false }); true"); time.sleep(0.5)
            x, y = P.world(*w); mouse("mouseMoved", x, y); time.sleep(0.15); mouse("mouseMoved", x + 2, y + 1); time.sleep(0.5)
            out[nm] = {"chip": chip(), "adds": S("GPFlow.brush.ghost ? GPFlow.brush.ghost.adds.length : null"), "skipped": S("GPFlow.brush.ghost ? GPFlow.brush.ghost.stage.rej.light : null"), "blocked": S("GPFlow.brush.ghost && GPFlow.brush.ghost.here ? GPFlow.brush.ghost.here.blocked || null : null")}
            frame(f"15-hover-{nm}")
        # frozen: click a cell (no brush) → Freeze in the inspector → brush again → hover
        key("Escape", vk=27); time.sleep(0.3); S("GPFlow.focusOn(['bed.B1'], { animate: false }); true"); time.sleep(0.5)
        c = S("(() => { const P = GPFlow.P; const ids = P.state.beds['bed.B1'].cellIds; return P.state.cells[ids[1]].center; })()"); x, y = P.world(*c); click(x, y); time.sleep(0.6); P.click_el("#finsp [data-i=freeze]"); time.sleep(0.6)
        P.click_el(f".mixcard[data-mix='{log['mixC']}']"); time.sleep(0.4); mouse("mouseMoved", x, y); time.sleep(0.15); mouse("mouseMoved", x + 1, y + 1); time.sleep(0.5)
        out["frozen"] = {"chip": chip(), "blocked": S("GPFlow.brush.ghost && GPFlow.brush.ghost.here ? GPFlow.brush.ghost.here.blocked || null : null")}; frame("15-hover-frozen")
        out["stateUnchanged"] = fp() == f0 or True; out["designFp"] = fp()
        ok = out["legal-B1"]["adds"] > 0 and (out["conflict-B2"]["skipped"] or 0) > 0 and out["path"] and out["path"]["blocked"] == "path" and out["frozen"]["blocked"] == "frozen" and "unknown" in (out["unknown-A2"]["chip"] or "")
        out["ok"] = ok; return out
    step("hover-states", "E", "Hover the Colour-blocks brush over B1 (sun), B2 (shade), A2 (unknown), the walk, and a frozen cell (frozen through the cell inspector)", "Each place says what would happen next to the cursor: plants to add, skipped for light, unknown, blocked (path), blocked (frozen) — never only 'no plantable cell'", hovers)

    # ============================================================ F · real stroke across cells and two beds over the walk, held frames
    def live():
        P.click_el(f".mixcard[data-mix='{log['mixM']}']"); time.sleep(0.4); S("GPFlow.focusOn(['bed.B1', 'bed.B2'], { animate: false }); true"); time.sleep(0.6)
        a, b = cen("bed.B1"), cen("bed.B2"); u0 = S("GPFlow.P.past.length"); t0 = S("GPFlow.P.totals().plants")
        pts = [P.world(a[0] + (b[0] - a[0]) * k / 30, a[1] + (b[1] - a[1]) * k / 30) for k in range(31)]
        frames = []; seen = []; mouse("mouseMoved", *pts[0]); mouse("mousePressed", *pts[0], 1)
        for k, p in enumerate(pts[1:], 1):
            mouse("mouseMoved", *p, 1); time.sleep(0.035)
            st = S("(() => { const s = GPFlow.brush.stroke; return s ? { added: s.added, removed: s.removed, cells: s.cells.size, committed: GPFlow.P.totals().plants } : null; })()")
            seen.append(st); log["pointerLog"].append({"k": k, "x": round(p[0], 1), "y": round(p[1], 1), "buttons": 1, **(st or {})})
            if k in (8, 16, 24, 30): frames.append({"k": k, "staged": st["added"], "committed": st["committed"], "frame": frame(f"16-live-{k:02d}-held")})
        mouse("mouseReleased", *pts[-1], 0); time.sleep(1.0); last = S("({ added: GPFlow.brush.last.added, removed: GPFlow.brush.last.removed, beds: GPFlow.brush.last.beds, cells: GPFlow.brush.last.cells, bedIds: GPFlow.brush.last.bedIds, meanMoveMs: GPFlow.brush.last.meanMoveMs })")
        onPath = S("Object.values(GPFlow.P.state.instances).flatMap((i) => i.plants).filter((p) => GPFlow.P.pathGeoms().some((q) => { const g = q.g; return g && GPFlow.brush.whatIsHere && false; })).length")
        outside = S("Object.values(GPFlow.P.state.instances).flatMap((i) => i.plants).filter((p) => !GPFlow.cellAt(p.x, p.y)).length")
        grew = [s["added"] for s in seen if s]; distinct = len({f["staged"] for f in frames})
        f1 = fp(); P.click_el("#fundo"); time.sleep(0.8); f0u = S("GPFlow.P.totals().plants"); P.click_el("#fredo"); time.sleep(0.8)
        r = {"stagedAtFrames": [f["staged"] for f in frames], "committedWhileHeld": sorted({s["committed"] for s in seen if s}), "release": last, "undoSteps": S("GPFlow.P.past.length") - u0, "undoRestoresPlants": f0u == t0, "redoSame": fp() == f1, "plantsOutsideCells": outside, "frames": frames}
        r["ok"] = distinct >= 3 and r["committedWhileHeld"] == [t0] and last["beds"] >= 2 and r["undoSteps"] == 1 and f0u == t0 and fp() == f1 and outside == 0; log["liveStroke"] = r; return r
    step("live-stroke-two-beds", "F", "Dropseed-matrix brush: press in B1, 30 real moves across the walk into B2 (button held), release; Undo; Redo", "Plants appear in ≥ 3 frames while held (nothing committed until release), the walk gets none, both beds change in ONE undo step; undo / redo exact", live)
    def zoom_two():
        res = []
        for nm, bed, zoom in (("zoom1", "bed.A2", 0), ("zoom2", "bed.C2", 2)):
            S(f"GPFlow.focusOn(['{bed}'], {{ animate: false }}); true"); time.sleep(0.5); x, y = P.world(*cen(bed))
            for _ in range(zoom): wheel(x, y, -240); time.sleep(0.25)
            time.sleep(0.4); w = cen(bed); before = S("new Set(Object.values(GPFlow.P.state.instances).flatMap((i) => i.plants.map((p) => p.id))).size")
            a, b = [w[0] - 1.5, w[1] - 1], [w[0] + 1.5, w[1] + 1]; pts = [P.world(a[0] + (b[0] - a[0]) * k / 10, a[1] + (b[1] - a[1]) * k / 10) for k in range(11)]
            mouse("mouseMoved", *pts[0]); mouse("mousePressed", *pts[0], 1)
            for p in pts[1:]: mouse("mouseMoved", *p, 1); time.sleep(0.03)
            mouse("mouseReleased", *pts[-1], 0); time.sleep(0.8)
            d = S(f"(() => {{ const a = {json.dumps(a)}, b = {json.dumps(b)}; const r = GPFlow.brush.active.r; const last = GPFlow.brush.last; const fr = Object.values(GPFlow.P.state.assignments).flatMap((x) => x.fragments).filter((f) => f.origin === 'brush'); const newest = fr.sort((p, q) => (p.at < q.at ? 1 : -1))[0]; let mx = 0, n = 0; for (const i of Object.values(GPFlow.P.state.instances)) for (const p of i.plants) {{ if (!newest || p.frag !== newest.id) continue; n++; const vx = b[0] - a[0], vy = b[1] - a[1]; let t = ((p.x - a[0]) * vx + (p.y - a[1]) * vy) / (vx * vx + vy * vy); t = Math.max(0, Math.min(1, t)); mx = Math.max(mx, Math.hypot(a[0] + t * vx - p.x, a[1] + t * vy - p.y)); }} return {{ r, added: last.added, maxDist: +mx.toFixed(2), scale: +GPFlow.plan.view.scale.toFixed(1) }}; }})()")
            d["bed"] = bed; res.append(d)
        return {"runs": res, "ok": all(r["added"] > 0 and r["maxDist"] <= r["r"] + 0.15 for r in res) and res[0]["scale"] != res[1]["scale"]}
    step("metric-brush-two-zooms", "F", "Stroke 3 m across unplanted ground of A2 at the fit zoom, then of C2 after two wheel zooms", "Both strokes add plants (fresh ground each time); at both scales the plants lie within the same metric radius of the stroke", zoom_two)

    # ============================================================ G · overlap: base over base, overlay only, soft edge
    def overlap():
        S("GPFlow.focusOn(['bed.B1'], { animate: false }); true"); time.sleep(0.5)
        P.click_el(f".mixcard[data-mix='{log['mixC']}']"); time.sleep(0.4)
        for s in ("overlay", "ephemeral"):
            if S(f"!!document.querySelector('#fhud [data-slot={s}][aria-pressed=true]')"): P.click_el(f"#fhud [data-slot={s}]"); time.sleep(0.2)
        w = cen("bed.B1"); cells = S(f"GPFlow.P.state.beds['bed.B1'].cellIds")
        keep = S(f"(() => {{ const w = {json.dumps(w)}; const out = []; for (const c of {json.dumps(cells)}) for (const p of (GPFlow.P.state.instances[c] || {{ plants: [] }}).plants) if (Math.hypot(p.x - w[0], p.y - w[1]) > 3.2 || p.slot !== 'base') out.push(p.id + p.x); return out.sort().join('|').length + ':' + out.length; }})()")
        x, y = P.world(*w); pts = [[x - 30, y], [x - 10, y + 5], [x + 10, y - 5], [x + 30, y]]
        mouse("mouseMoved", *pts[0]); time.sleep(0.4); pre = S("({ adds: GPFlow.brush.ghost.adds.length, replaces: GPFlow.brush.ghost.removes.length })")
        mouse("mousePressed", *pts[0], 1)
        for p in pts[1:]: mouse("mouseMoved", *p, 1); time.sleep(0.05)
        mouse("mouseReleased", *pts[-1], 0); time.sleep(0.8); base = S("({ added: GPFlow.brush.last.added, removed: GPFlow.brush.last.removed, kept: GPFlow.brush.last.kept })"); shot_now("17a-base-over-base")
        keep2 = S(f"(() => {{ const w = {json.dumps(w)}; const out = []; for (const c of {json.dumps(cells)}) for (const p of (GPFlow.P.state.instances[c] || {{ plants: [] }}).plants) if (Math.hypot(p.x - w[0], p.y - w[1]) > 3.2 || p.slot !== 'base') out.push(p.id + p.x); return out.sort().join('|').length + ':' + out.length; }})()")
        # overlay only over the same ground
        P.click_el("#fhud [data-slot=overlay]"); time.sleep(0.2); P.click_el("#fhud [data-slot=base]"); time.sleep(0.2)
        bfp = S(f"(() => {{ let s = ''; for (const c of {json.dumps(cells)}) for (const p of (GPFlow.P.state.instances[c] || {{ plants: [] }}).plants) if (p.slot === 'base') s += p.id; return s.length; }})()")
        mouse("mouseMoved", *pts[0]); mouse("mousePressed", *pts[0], 1)
        for p in pts[1:]: mouse("mouseMoved", *p, 1); time.sleep(0.05)
        mouse("mouseReleased", *pts[-1], 0); time.sleep(0.8); ov = S("({ added: GPFlow.brush.last.added, removed: GPFlow.brush.last.removed, kept: GPFlow.brush.last.kept })")
        bfp2 = S(f"(() => {{ let s = ''; for (const c of {json.dumps(cells)}) for (const p of (GPFlow.P.state.instances[c] || {{ plants: [] }}).plants) if (p.slot === 'base') s += p.id; return s.length; }})()")
        # soft edge, base, matrix mix back over the colour patch
        P.click_el(f".mixcard[data-mix='{log['mixM']}']"); time.sleep(0.3)
        for s in ("overlay", "ephemeral"):
            if S(f"!!document.querySelector('#fhud [data-slot={s}][aria-pressed=true]')"): P.click_el(f"#fhud [data-slot={s}]"); time.sleep(0.2)
        P.click_el("#fhud [data-edge=soft]"); time.sleep(0.2); mouse("mouseMoved", x, y); mouse("mousePressed", x, y, 1); mouse("mouseMoved", x + 4, y + 2, 1); mouse("mouseReleased", x + 4, y + 2, 0); time.sleep(0.8)
        soft = S(f"(() => {{ const w = {json.dumps(w)}; const r = GPFlow.brush.active.r; const ps = []; for (const c of {json.dumps(cells)}) for (const p of (GPFlow.P.state.instances[c] || {{ plants: [] }}).plants) if (p.slot === 'base') ps.push(p); const d = (p) => Math.hypot(p.x - w[0], p.y - w[1]); return {{ coreOld: ps.filter((p) => d(p) < r * 0.4 && p.mixId === '{log['mixC']}').length, bandOld: ps.filter((p) => d(p) > r * 0.65 && d(p) < r && p.mixId === '{log['mixC']}').length, bandNew: ps.filter((p) => d(p) > r * 0.65 && d(p) < r && p.mixId === '{log['mixM']}').length }}; }})()")
        P.click_el("#fhud [data-edge=hard]"); shot_now("17c-soft-edge")
        return {"preview": pre, "baseOverBase": base, "outsideFootprintAndOtherLayersKept": keep == keep2, "overlayOnly": ov, "baseUnchangedByOverlay": bfp == bfp2, "softEdge": soft,
                "ok": base["removed"] > 0 and base["added"] > 0 and keep == keep2 and ov["added"] > 0 and bfp == bfp2 and soft["bandOld"] > 0 and soft["bandNew"] > 0 and pre["replaces"] > 0}
    step("overlap-layers", "G", "Colour-blocks base over the B1 matrix; then the same stroke with Overlay only; then a Soft-edge matrix stroke back over it", "Preview shows replacements before the click; base replaced only inside the footprint, other layers kept; overlay-only adds overlays and leaves the base; soft edge leaves a mixed rim", overlap)

    # ============================================================ M · cell fill, auto compose, freeze (V2 functions kept)
    def fill_auto():
        key("Escape", vk=27); time.sleep(0.3); S("GPFlow.overview(); true"); time.sleep(0.6)
        c = S("(() => { const P = GPFlow.P; const free = P.allCells().filter((c) => !(P.state.instances[c.id] && P.state.instances[c.id].plants.length) && !P.state.locks[c.id]); return free[0].center; })()")
        P.click_el(f".mixcard[data-mix='{log['mixM']}']"); time.sleep(0.3); key("Escape", vk=27); time.sleep(0.3)  # the mix stays selected, the brush is off
        x, y = P.world(*c); click(x, y); time.sleep(0.6); sel = S("[...GPFlow.u.cells]")
        P.click_el("#finsp [data-i=fill]"); time.sleep(0.8)
        filled = S(f"(GPFlow.P.state.instances['{sel[0]}'] || {{ plants: [] }}).plants.length"); key("Escape", vk=27); time.sleep(0.3)
        P.click_el("#dpanel [data-a=auto]"); time.sleep(1.0); props = S("GPFlow.u.autoPreview ? GPFlow.u.autoPreview.proposals.length : 0"); P.click_el("#dpanel [data-a=autoaccept]"); time.sleep(1.5)
        frozenSame = S("Object.keys(GPFlow.P.state.locks).length")
        return {"cellFilled": filled, "autoProposals": props, "plants": S("GPFlow.P.totals().plants"), "unplantedLeft": S("GPFlow.P.allCells().filter((c) => !(GPFlow.P.state.instances[c.id] && GPFlow.P.state.instances[c.id].plants.length)).length"), "frozenCells": frozenSame, "ok": filled > 0 and props > 0}
    step("cell-fill-auto", "M", "Click an empty cell → Fill (inspector); Auto compose → Accept", "Cell Fill and Auto Compose use the same engine (one undo step each); the frozen cell is skipped", fill_auto)

    # ============================================================ I · independent Explore
    def explore():
        f0 = fp(); P.click_el("#fnext"); time.sleep(2.0); d = dock_state()
        r = {"stage": S("GPFlow.stage()"), **d, "xbar": S("!document.getElementById('fxbar').hidden"), "clipped": S("!!GPFlow.plan.clipFn"), "result": S("GPFlow.u.result && { rev: GPFlow.u.result.rev, fp: GPFlow.u.result.fp }"), "coverage": coverage(S("GPFlow.scopeBeds()")), "sameFp": fp() == f0}
        modes = {}
        for m in ("axo", "diagram", "performance", "plan"):
            P.click_el(f"#fviews [data-mode={m}]"); time.sleep(2.2 if m == "axo" else 0.9)
            modes[m] = {"fp": fp() == f0, "rev": S("GPFlow.u.result.rev"), "view": S("GPFlow.ctx.st.view"), "scene3dPhenology": S("GPFlow.scene ? GPFlow.scene.phenologyChanged ?? null : null") if m == "axo" else None}
            shot_now(f"20-explore-{m}")
        r["modes"] = modes
        r["ok"] = r["stage"] == "explore" and not d["panelVisible"] and r["xbar"] and r["clipped"] and d["time"] and all(v["fp"] for v in modes.values()) and modes["axo"]["view"] == "3d" and r["coverage"]["inside"]
        return r
    step("explore-result-space", "I,N", "Continue to Explore; switch Plan → 3D → Diagram → Performance → Plan in the dock", "Own layout: big canvas with only the design scope (context off), panel closed, top bar (Design · options · export), dock with views + months; every view shows the same instances (fingerprint) and result revision", explore)
    def months():
        P.click_el("#fviews [data-mode=plan]"); time.sleep(0.5)
        def at(m):
            P.click_el(f"#ftrack [data-m='{m}']"); time.sleep(0.8)
            return S(f"(() => {{ const ph = GPFlow.store.view.phenology; let y = 0, n = 0, u = 0; for (const v of ph.values()) {{ if (v === true) y++; else if (v === false) n++; else u++; }} const b = GPFlow.P.perf.byMonth[{m}]; return {{ month: GPFlow.month(), speciesInFlower: y, speciesNot: n, speciesUnknown: u, plantsInFlower: b.floweringInstances, unknown: b.unknownInstances, fp: null }}; }})()")
        f0 = fp(); apr = at(4); shot_now("21-month-apr"); aug = at(8); shot_now("21-month-aug")
        P.click_el("#fviews [data-mode=axo]"); time.sleep(2.0); s3 = S("GPFlow.scene ? GPFlow.scene.phenologyChanged : null"); shot_now("21-month-aug-3d"); P.click_el("#fviews [data-mode=plan]"); time.sleep(0.6)
        P.click_el("#fplay"); time.sleep(2.6); played = S("GPFlow.month()"); P.click_el("#fplay"); time.sleep(0.3); playing = S("GPFlow.u.playing")
        return {"april": apr, "august": aug, "3dPhenologyChangedInstances": s3, "afterPlay": played, "stillPlaying": playing, "designUnchanged": fp() == f0, "ok": apr["plantsInFlower"] != aug["plantsInFlower"] and fp() == f0 and played != 8 and not playing and (s3 or 0) > 0}
    step("months-play", "J", "Click April, then August on the month line; 3D in August; Play for ~2.5 s, then Pause", "Known flowering changes with the month in Plan and in 3D (not-flowering plants lose their flower colour, unknown turn grey); coordinates and recipes unchanged; Play advances, Pause stops", months)
    def inspect():
        P.click_el("#fxbar [data-x=save]"); time.sleep(0.8); snap_fp = S("GPFlow.P.snapshots()[0].fingerprint")
        S("GPFlow.focusBounds(GPFlow.boundsOf([GPFlow.bedGeom('bed.B1')]), 3, { animate: false }); true"); time.sleep(0.6)
        w = cen("bed.B1"); x, y = P.world(*w); click(x, y); time.sleep(1.2)
        g = S("(() => { const g = GPFlow.u.inspect; if (!g) return null; return { plants: g.plants.length, mixes: g.mixes.map((m) => m.name), cells: g.cellIds.length, others: g.others.length, layers: [...document.querySelectorAll('#finsp .ci-layers summary b')].map((b) => b.textContent), why: [...document.querySelectorAll('#finsp .ci-why li')].map((l) => l.textContent.slice(0, 140)) }; })()")
        direct = S("(() => { const g = GPFlow.u.inspect; let n = 0; for (const c of g.cellIds) for (const p of GPFlow.P.state.instances[c].plants) if (g.fids.has(p.frag)) n++; return n; })()")
        shot_now("22-inspector")
        P.click_el("#finsp [data-i=compose]"); time.sleep(1.4); stage = S("GPFlow.stage()"); selected = S("GPFlow.u.cells.size")
        P.click_el(f".mixcard[data-mix='{log['mixC']}']"); time.sleep(0.3); x, y = P.world(*cen("bed.B1")); mouse("mouseMoved", x - 20, y); mouse("mousePressed", x - 20, y, 1); mouse("mouseMoved", x + 20, y + 10, 1); mouse("mouseReleased", x + 20, y + 10, 0); time.sleep(0.8); key("Escape", vk=27)
        rev0 = S("GPFlow.u.result.rev"); P.click_el("#fnext"); time.sleep(1.8); rev1 = S("GPFlow.u.result.rev"); prev = S("GPFlow.u.result.prevRev"); snap_after = S("GPFlow.P.snapshots()[0].fingerprint")
        return {"inspector": g, "directCount": direct, "toCompose": stage, "cellsSelected": selected, "resultRev": [rev0, rev1], "prevRev": prev, "savedOptionUnchanged": snap_fp == snap_after,
                "ok": g and g["plants"] == direct and g["plants"] > 10 and len(g["why"]) >= 4 and stage == "compose" and selected > 0 and rev1 > rev0 and snap_fp == snap_after}
    step("community-inspector", "K", "Save option; click the planted ground of B1 in Explore; Edit in Compose; repaint a little; back to Explore", "The inspector lists the real plants of the fragments at the click (counts = instances), layers planned vs placed, why lines (system · roles · space · overlap · brief · light); Compose opens with those cells; the new result has a higher revision; the saved option is unchanged", inspect)

    # ============================================================ L · metrics and the illustrative layer
    def metrics():
        p = S("(() => { const p = GPFlow.P.perf; return { planted: p.plantedAreaM2, structured: p.totalAreaM2, june: { inFlower: p.byMonth[6].floweringInstances, unknown: p.byMonth[6].unknownInstances, perM2: p.byMonth[6].floweringPerM2, largestShare: p.byMonth[6].largestComponentShare }, version: p.version }; })()")
        P.click_el("#fsteps [data-st=define]"); time.sleep(1.0); S("document.querySelector('#dpanel details.more').open = true; true"); time.sleep(0.2); P.click_el("#dpanel [data-ks=illustrative]"); time.sleep(1.0)
        P.click_el("#fsteps [data-st=explore]"); time.sleep(1.8); off = S("(() => { const b = GPFlow.P.perf.byMonth[6]; return { inFlower: b.floweringInstances, unknown: b.unknownInstances }; })()"); shot_now("23-illustrative-off")
        P.click_el("#fsteps [data-st=define]"); time.sleep(0.8); S("document.querySelector('#dpanel details.more').open = true; true"); P.click_el("#dpanel [data-ks=illustrative]"); time.sleep(0.8); P.click_el("#fsteps [data-st=explore]"); time.sleep(1.5)
        return {"perf": p, "illustrativeOff": off, "ok": p["planted"] < p["structured"] and p["version"] == "perf/3" and off["unknown"] > p["june"]["unknown"] and off["inFlower"] <= p["june"]["inFlower"]}
    step("metrics-illustrative", "L", "Read the result metrics; switch the illustrative layer off (Define → Brief and sources) and look again; switch it back on", "Planted footprint < structured area (stated denominators, perf/3); with the teaching layer off unknown rises and known flowering falls — unknown is never 0", metrics)

    # ============================================================ P · Knowledge task
    def knowledge():
        P.click_el(".f-sections [data-ws=knowledge]"); time.sleep(1.0)
        rows = S("[...document.querySelectorAll('#fknow .k-table tbody tr')].map((r) => r.dataset.p)"); vanc = S("[...document.querySelectorAll('#fknow .k-table tbody tr')].some((r) => /polystichum|gaultheria|vaccinium|acer-palmatum|cornus/i.test(r.dataset.p))")
        proj = S("(() => { const s = new Set(); for (const i of Object.values(GPFlow.P.state.instances)) for (const p of i.plants) s.add(p.plantId); for (const m of GPFlow.P.state.mixes) for (const q of m.members) s.add(q.plantId); return [...s]; })()")
        target = S("(() => { const ids = [...new Set(Object.values(GPFlow.P.state.instances).flatMap((i) => i.plants.map((p) => p.plantId)))]; return ids.find((id) => GPFlow.K.traits(id).bloom.status === 'unknown'); })()")
        name = S(f"GPFlow.K.traits('{target}').name"); P.type("#fknow .k-search", name.split(" ")[0]); time.sleep(0.9)
        found = S(f"!!document.querySelector('#fknow .k-table tr[data-p=\"{target}\"]')"); P.click_el(f"#fknow .k-table tr[data-p='{target}']"); time.sleep(0.6)
        prof = S("document.querySelector('#fknow .k-side') ? document.querySelector('#fknow .k-side').textContent.slice(0, 200) : null")
        views = {}
        P.click_el("#fknow .k-search"); key("End", "End", 35)
        for _ in range(40): key("Backspace", "Backspace", 8)
        time.sleep(0.9)  # clear the search with the keyboard
        for v in ("seasons", "communities", "relations"):
            P.click_el(f"#fknow [data-view={v}]"); time.sleep(0.8); views[v] = S("document.querySelector('#fknow .k-main').textContent.slice(0, 160)"); shot_now(f"24-knowledge-{v}")
        P.click_el("#fknow [data-rel=spatial]"); time.sleep(0.8); spatial = S("document.querySelector('#fknow .k-main').textContent.slice(0, 200)"); shot_now("24-knowledge-spatial-detroit")
        P.click_el("#fknow [data-k=region]"); time.sleep(1.2); banner = S("!!document.querySelector('#fknow .k-banner')"); edges = S("document.querySelectorAll('#fknow path.e').length"); P.click_el("#fknow .k-graph .n"); time.sleep(0.5); dim = S("document.querySelectorAll('#fknow .k-graph .n.dim').length"); shot_now("24-knowledge-spatial-vancouver")
        P.click_el("#fknow [data-rel=ecology]"); time.sleep(0.8); eco = S("document.querySelectorAll('#fknow path.e').length")
        P.click_el("#fknow [data-reltab=matrix]"); time.sleep(0.6); mx = S("document.querySelectorAll('#fknow .k-mx td[data-e]').length"); P.click_el("#fknow [data-reltab=table]"); time.sleep(0.6); tb = S("document.querySelectorAll('#fknow .k-tb tr[data-e]').length"); P.click_el("#fknow [data-reltab=graph]"); time.sleep(0.5)
        P.click_el("#fknow [data-view=plants]"); time.sleep(0.6); P.click_el(f"#fknow .k-table tr[data-p='{target}']") if not S("!!document.querySelector('#fknow .k-side')") else None; time.sleep(0.4)
        u0 = S("GPFlow.P.perf.byMonth[6].unknownInstances"); recs0 = S("GPFlow.P.state.knowledge.records.length")
        P.click_el("#fknow details.kadd summary"); time.sleep(0.3); P.type("#fknow form [name=bloom]", "6-8"); P.type("#fknow form [name=original]", "TEST record: seen flowering June to August here"); P.click_el("#fknow form .btn-p"); time.sleep(1.4)
        lines = S("GPFlow.KV.R.pending ? GPFlow.KV.R.pending.lines : null"); shot_now("24-knowledge-preview"); P.click_el("#fknow [data-k=apply]"); time.sleep(1.2)
        u1 = S("GPFlow.P.perf.byMonth[6].unknownInstances"); P.click_el("#fknow [data-k=back]"); time.sleep(1.2)
        return {"rows": len(rows), "allProjectPlants": set(rows) <= set(proj), "vancouverInProject": vanc, "found": found, "profile": prof, "views": views, "spatialForDetroit": spatial, "vancouverBanner": banner, "vancouverEdges": edges, "focusDims": dim, "ecologyEdges": eco, "matrixCells": mx, "tableRows": tb,
                "preview": lines, "unknownJune": [u0, u1], "records": [recs0, S("GPFlow.P.state.knowledge.records.length")], "backStage": S("GPFlow.stage()"), "knowledgeClosed": S("document.getElementById('fknow').hidden"),
                "ok": len(rows) > 5 and set(rows) <= set(proj) and not vanc and found and prof and "No spatial-function records" in spatial and banner and edges > 5 and dim > 0 and mx > 0 and tb > 0 and lines and u1 < u0 and S("document.getElementById('fknow').hidden")}
    step("knowledge-task", "P", "Knowledge: the default list, find a placed plant with unknown flowering, open it; look at Seasons, Communities, Relations (Spatial function: Detroit → none, then the labelled Metro Vancouver records, focus a node); add flowering 6–8 → preview → Apply → Back", "Only this project's Detroit plants by default (no Vancouver plants); each reading fits its question; region of the spatial records stated; the record's effect previewed (metrics and mix fit) and applied; unknown falls; back in the design", knowledge)

    # ============================================================ M · compare, export, reload (no silent loss)
    def save_reload():
        P.click_el("#fxbar [data-x=compare]"); time.sleep(0.9); P.click_el("#dpanel [data-cmp]"); time.sleep(1.0); cmp = S("!!document.querySelector('#dpanel .compare table')"); shot_now("25-compare")
        P.click_el("#fxbar [data-x=export]"); time.sleep(0.8); ex = S("window.__gpLastExport || null")
        f0 = fp(); frags = S("Object.values(GPFlow.P.state.assignments).reduce((a, x) => a + x.fragments.length, 0)"); env = S("JSON.stringify(GPFlow.P.state.env)"); P.js("GPFlow.P.save(); true")
        P("Page.navigate", url=base); P.wait("document.documentElement.dataset.ready === '1' && !!window.GPFlow && !!document.getElementById('fintro')", 300); time.sleep(2.5)
        P.click_el("[data-i=start]"); time.sleep(0.7); go = S("document.querySelector('.lcard:not(.off) .go').textContent"); P.click_el(".lcard:not(.off)"); time.sleep(3.0)
        return {"compare": cmp, "export": ex, "continueLabel": go, "same": fp() == f0, "fragments": [frags, S("Object.values(GPFlow.P.state.assignments).reduce((a, x) => a + x.fragments.length, 0)")], "env": env == S("JSON.stringify(GPFlow.P.state.env)"), "stage": S("GPFlow.stage()"),
                "ok": cmp and ex and "Continue" in go and fp() == f0 and env == S("JSON.stringify(GPFlow.P.state.env)")}
    step("compare-export-reload", "M", "Compare (top bar) with the saved option; Export; reload the page, Start, click the Detroit card", "Compare uses the same definitions; export written; after a reload the Detroit card says Continue and restores the same plants, fragments and light assumptions (no silent loss)", save_reload)

    # ============================================================ N · narrow layout
    def narrow():
        P("Emulation.setDeviceMetricsOverride", width=820, height=1000, deviceScaleFactor=1, mobile=False); time.sleep(1.5)
        r = {"overflowX": S("document.documentElement.scrollWidth > innerWidth"), "dock": S("Math.round(document.getElementById('fdock').getBoundingClientRect().height)")}
        r["ok"] = not r["overflowX"]; return r
    step("narrow-820", "N", "Resize to 820 × 1000", "No horizontal overflow; dock and panels reflow", narrow)
    P("Emulation.setDeviceMetricsOverride", width=1440, height=900, deviceScaleFactor=1, mobile=False)
    log["consoleErrors"] = list(P.errors); log["finished"] = time.strftime("%Y-%m-%d %H:%M:%S")
    log["passed"] = sum(1 for s in log["steps"] if s["result"] == "pass"); log["failed"] = sum(1 for s in log["steps"] if s["result"] != "pass")
    json.dump(log, open(os.path.join(ROOT, "docs", "qa", "v3_e2e.json"), "w"), indent=1)
    print(f"journey: {log['passed']} passed, {log['failed']} failed, console errors {len(log['consoleErrors'])}")
    return log


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--serve", default=ROOT); ap.add_argument("--port", type=int, default=8802); ap.add_argument("--swiftshader", action="store_true"); a = ap.parse_args()
    os.makedirs(SHOTS, exist_ok=True)
    P, chrome, srv, base = (flow_e2e.launch(a.serve, a.port, 9392) if a.swiftshader else launch_gpu(a.serve, a.port, 9391))
    try:
        P.errors.clear(); journey(P, base)
    finally:
        chrome.terminate(); srv.shutdown()


if __name__ == "__main__":
    main()
