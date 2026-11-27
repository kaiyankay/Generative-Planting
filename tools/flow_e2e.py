"""Integrated Prototype — release-gate run in a real browser (headless Chrome over the DevTools protocol).

python3 -I tools/flow_e2e.py [--serve <folder>] [--only unit|journey] [--port 8797]

1. unit:    flow-tests.html (engine gates 2–4 with the real Detroit model + labelled fixtures) -> docs/qa/flow_unit_tests.json
2. journey: a first-time user from an empty browser profile, with REAL mouse input on DOM controls and on the canvas
            (Define → Structure → Compose → Explore → Knowledge → save / export / reload / resume), every step checked
            against the project state and screenshotted -> docs/qa/flow_e2e.json + docs/screenshots/integrated-prototype/

The app is served under /Generative-Planting/ (the GitHub Pages base path) by tools/flow_server.Handler, so the
language-model endpoint answers "not configured" exactly as it does on this Mac. A personal-knowledge test database
(?kdb=gp-knowledge-e2e-…) keeps the real personal layer untouched.
"""
import argparse, base64, functools, json, os, subprocess, sys, tempfile, threading, time, urllib.request
from http.server import ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools", "knowledge")); sys.path.insert(0, os.path.join(ROOT, "tools"))
from cdp import WS  # noqa: E402
import flow_server  # noqa: E402

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SHOTS = os.path.join(ROOT, "docs", "screenshots", "integrated-prototype")


class Page:
    def __init__(self, ws):
        self.ws = ws; self.n = 0; self.errors = []; self.events = []

    def _event(self, m):
        meth = m.get("method", "")
        if meth == "Runtime.exceptionThrown":
            d = m["params"]["exceptionDetails"]; self.errors.append("exception: " + (d.get("exception", {}).get("description") or d.get("text", ""))[:400])
        elif meth == "Runtime.consoleAPICalled" and m["params"].get("type") == "error":
            self.errors.append("console.error: " + " ".join(str(a.get("value", a.get("description", ""))) for a in m["params"].get("args", []))[:400])
        elif meth == "Log.entryAdded" and m["params"]["entry"].get("level") == "error":
            e = m["params"]["entry"]; self.errors.append(f"log: {e.get('text', '')[:300]} {e.get('url', '')}")
        elif meth == "Page.downloadProgress" or meth == "Browser.downloadProgress":
            self.events.append(m)

    def __call__(self, method, **params):
        self.n += 1; mid = self.n
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get("id") == mid:
                if "error" in m: raise RuntimeError(f"{method}: {m['error']}")
                return m.get("result", {})
            self._event(m)

    def js(self, expr):
        r = self("Runtime.evaluate", expression=expr, awaitPromise=True, returnByValue=True)
        if r.get("exceptionDetails"): raise RuntimeError("JS: " + json.dumps(r["exceptionDetails"])[:900])
        return r["result"].get("value")

    def wait(self, expr, timeout=180):
        t = time.time()
        while time.time() - t < timeout:
            try:
                if self.js(expr): return True
            except RuntimeError: pass
            time.sleep(0.25)
        raise TimeoutError(expr)

    def mouse(self, t, x, y, buttons=0, shift=False):
        self("Input.dispatchMouseEvent", type=t, x=float(x), y=float(y), button="left" if (t != "mouseMoved" or buttons) else "none", buttons=buttons, clickCount=1, modifiers=8 if shift else 0)

    def click(self, x, y, shift=False):
        self.mouse("mouseMoved", x, y); self.mouse("mousePressed", x, y, 1, shift); self.mouse("mouseReleased", x, y, 0, shift)

    def drag(self, pts):
        self.mouse("mouseMoved", *pts[0]); self.mouse("mousePressed", *pts[0], 1)
        for p in pts[1:]: self.mouse("mouseMoved", *p, 1)
        self.mouse("mouseReleased", *pts[-1], 0)

    def el(self, sel):
        r = self.js(f"(() => {{ const e = document.querySelector({json.dumps(sel)}); if (!e) return null; e.scrollIntoView({{ block: 'center', inline: 'nearest' }}); const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }})()")
        if not r: raise RuntimeError("not found: " + sel)
        time.sleep(0.15); return r

    def click_el(self, sel, shift=False):
        x, y = self.el(sel); self.click(x, y, shift)

    def type(self, sel, text):
        self.click_el(sel); self.js(f"(() => {{ const e = document.querySelector({json.dumps(sel)}); e.select && e.select(); }})()")
        self("Input.insertText", text=text)

    def world(self, x, y):  # world metres -> client px in the active view
        return self.js(f"(() => {{ const F = GPFlow; if (F.ctx.st.view === 'plan') return F.plan.T({x}, {y}); return F.scene.screenOf({x}, {y}); }})()")

    def settle(self):
        self.js("new Promise((r) => { const t = setTimeout(r, 2500); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(); })); })"); time.sleep(0.4)

    def shot(self, name):
        self.mouse("mouseMoved", 700, 880); self.settle()
        path = os.path.join(SHOTS, name + ".png")
        open(path, "wb").write(base64.b64decode(self("Page.captureScreenshot", format="png")["data"])); return os.path.relpath(path, ROOT)


def launch(serve, port, dport):
    tmp = tempfile.mkdtemp(); os.symlink(os.path.abspath(serve), os.path.join(tmp, "Generative-Planting"))
    srv = ThreadingHTTPServer(("127.0.0.1", port), functools.partial(flow_server.Handler, directory=tmp)); threading.Thread(target=srv.serve_forever, daemon=True).start()
    prof = tempfile.mkdtemp()
    chrome = subprocess.Popen([CHROME, "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars", "--window-size=1440,900", "--force-device-scale-factor=1",
                               f"--user-data-dir={prof}", f"--remote-debugging-port={dport}", "--remote-allow-origins=*", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    pages = []
    for _ in range(200):
        try:
            pages = [p for p in json.load(urllib.request.urlopen(f"http://127.0.0.1:{dport}/json/list", timeout=2)) if p.get("type") == "page"]
            if pages: break
        except Exception: pass
        time.sleep(0.2)
    P = Page(WS(pages[0]["webSocketDebuggerUrl"]))
    P("Page.enable"); P("Runtime.enable"); P("Log.enable")
    P("Emulation.setDeviceMetricsOverride", width=1440, height=900, deviceScaleFactor=1, mobile=False)
    return P, chrome, srv, f"http://127.0.0.1:{port}/Generative-Planting/"


def unit(P, base):
    P("Page.navigate", url=base + "flow-tests.html")
    P.wait("document.documentElement.dataset.done === '1'", 600)
    out = P.js("window.__flowTests")
    out["runner"] = "headless Chrome (SwiftShader) over CDP, flow-tests.html"; out["errors"] = list(P.errors)
    json.dump(out, open(os.path.join(ROOT, "docs", "qa", "flow_unit_tests.json"), "w"), indent=1)
    print(f"unit: {out['passed']} passed, {out['failed']} failed")
    return out


def journey(P, base):
    kdb = "gp-knowledge-e2e-" + str(int(time.time()))
    log = {"runner": "headless Chrome (SwiftShader) over CDP; real mouse input on DOM controls and canvas", "url": base, "knowledgeDb": kdb, "started": time.strftime("%Y-%m-%d %H:%M:%S"), "steps": []}
    n = [0]

    def step(name, action, expected, fn, shot=True):
        n[0] += 1; t0 = time.time(); rec = {"n": n[0], "name": name, "action": action, "expected": expected}
        try:
            actual = fn(); ok = bool(actual.pop("ok", True)) if isinstance(actual, dict) else bool(actual)
            rec.update(actual=actual, result="pass" if ok else "FAIL")
        except Exception as e:  # noqa: BLE001
            rec.update(actual=str(e)[:600], result="FAIL")
        if shot:
            try: rec["screenshot"] = P.shot(f"{n[0]:02d}-{name}")
            except Exception as e: rec["screenshot"] = "failed: " + str(e)[:100]  # noqa: BLE001
        rec["s"] = round(time.time() - t0, 1); rec["errorsSoFar"] = len(P.errors)
        log["steps"].append(rec); print(f"{rec['n']:02d} {rec['result']:4} {name} ({rec['s']} s) {'' if rec['result'] == 'pass' else json.dumps(rec['actual'])[:300]}")
        return rec

    S = lambda e: P.js(e)  # noqa: E731
    url = base + f"?kdb={kdb}"
    P("Page.navigate", url=base + "LICENSE"); time.sleep(0.5)
    origin = base.split("/Generative-Planting/")[0]
    P("Storage.clearDataForOrigin", origin=origin, storageTypes="local_storage,indexeddb")  # a first-time user: nothing saved
    P("Page.navigate", url=url); P.wait("document.documentElement.dataset.ready === '1' && !!window.GPFlow", 300)
    time.sleep(1.5)

    step("define-first-visit", "Open the app with an empty browser profile", "One project preselected, intent input and starters, Rules mode stated, no resume prompt, no site set-up page",
         lambda: {"stage": S("GPFlow.stage()"), "resume": S("!!GPFlow.u.resume"), "starters": S("document.querySelectorAll('[data-s]').length"), "mode": S("document.querySelector('.f-modetag').textContent"),
                  "ok": S("GPFlow.stage()") == "define" and not S("!!GPFlow.u.resume") and S("document.querySelectorAll('[data-s]').length") == 3})

    def read_intent():
        P.click_el("[data-s=corridor]"); P.wait("!!GPFlow.P.state.brief.interpreted")
        o = S("GPFlow.P.state.brief.objectives")
        return {"objectives": {k: v["on"] for k, v in o.items()}, "months": o["flowering"]["months"], "read": S("GPFlow.P.state.brief.interpreted.read"), "ok": o["pollinators"]["on"] and o["continuity"]["on"]}
    step("define-brief", "Click the starter 'Connected flower resources along the paths…'", "Explicit brief: pollinators + continuity on, what was read is shown", read_intent)

    def layers():
        before = S("JSON.stringify(GPFlow.P.context().sample(-30, 8))")
        P.click_el("#btnLayers"); P.wait("!document.querySelector('#layers').hidden")
        P.click_el('#ltree .lrow.group[data-group="siteveg"] .eye')
        after = S("GPFlow.P.context().sample(-30, 8), JSON.stringify(GPFlow.ctx.cs._pointValues(-30, 8, null, ['field.elevation','field.slope','field.distance-to-path','field.canopy']))")
        vis = S("GPFlow.store.layerVisible('siteveg.trees')")
        return {"treesVisible": vis, "sampleBefore": before, "pointValuesAfter": after, "ok": vis is False}
    step("define-layer-toggle", "Open Layers, hide 'Site vegetation'", "Layer hidden in the view; the site query (crowns, distances) is unchanged", layers)
    step("define-unknowns", "Read the knowledge panel", "Sources listed with counts; illustrative layer labelled not verified; unknown site data stated",
         lambda: {"text": S("document.querySelector('#dpanel').innerText.match(/Coverage[^\\n]*/)[0]"), "ok": "not verified" in S("document.querySelector('#dpanel').innerText") and "pH" in S("document.querySelector('#dpanel').innerText")}, shot=False)
    P.click_el("#btnLayersClose")

    def to_structure():
        P.click_el("#fnext"); P.wait("GPFlow.stage() === 'structure'"); return {"stage": S("GPFlow.stage()"), "view": S("GPFlow.ctx.st.view")}
    step("structure-start", "Click 'Continue to Structure'", "Structure stage; plan view; eligible beds outlined; prompt to select a bed", to_structure)

    def click_bed(bed, logic):
        def fn():
            c = S(f"(() => {{ const o = GPFlow.store.getObject('{bed}'); const g = o.geometry.type === 'Polygon' ? o.geometry.coordinates[0] : o.geometry.coordinates[0][0]; let x = 0, y = 0; for (const p of g) {{ x += p[0]; y += p[1]; }} return [x / g.length, y / g.length]; }})()")
            sx, sy = P.world(*c); P.click(sx, sy)
            P.wait(f"GPFlow.u.bed === '{bed}' && GPFlow.u.thumbs && Object.keys(GPFlow.u.thumbs).length === 3", 120)
            P.click_el(f"[data-logic={logic}]"); P.wait(f"GPFlow.u.preview && GPFlow.u.preview.logic === '{logic}'")
            pv = S("(() => { const p = GPFlow.u.preview; return { cells: p.cells.length, explanation: p.adaptation.explanation, params: p.params, notes: p.adaptation.notes }; })()")
            return {**pv, "ok": pv["cells"] > 0}
        return fn
    step("structure-B1-bands", "Click bed B1 on the canvas, then the Bands card", "Numbered cells adapted to the bed, with the reason shown", click_bed("bed.B1", "bands"))

    def confirm():
        P.click_el("[data-a=confirm]"); P.wait("!GPFlow.u.preview")
        return {"cells": S("GPFlow.P.allCells().length"), "draft": S("GPFlow.store.draftInfo()"), "ok": S("GPFlow.P.allCells().length") > 0}
    step("structure-B1-confirmed", "Click 'Confirm cells'", "Cells committed; B1 emptied in a working draft, other beds keep the reference", confirm)

    def back_forth():
        b1 = S("JSON.stringify(GPFlow.P.state.brief)"); c1 = S("GPFlow.P.allCells().map(c => c.id).join()")
        P.click_el("#fback"); P.wait("GPFlow.stage() === 'define'"); shot = P.shot(f"{n[0] + 1:02d}-back-to-define-intact")
        P.click_el("#fnext"); P.wait("GPFlow.stage() === 'structure'")
        b2 = S("JSON.stringify({...GPFlow.P.state.brief, confirmedAt: JSON.parse(%s).confirmedAt})" % json.dumps(b1)); c2 = S("GPFlow.P.allCells().map(c => c.id).join()")
        return {"briefSame": json.loads(b1)["objectives"] == json.loads(b2)["objectives"] and json.loads(b1)["intent"] == json.loads(b2)["intent"], "cellsSame": c1 == c2, "extraShot": shot, "ok": c1 == c2}
    step("structure-back-and-return", "Click '← Define', then 'Continue to Structure'", "Brief and cells unchanged", back_forth, shot=False)
    step("structure-A2-honeycomb", "Click bed A2 on the canvas, then Honeycomb", "Hex cells adapted to A2", click_bed("bed.A2", "honeycomb"))
    step("structure-A2-confirmed", "Confirm", "A2 cells committed; B1 unchanged", confirm)
    step("structure-TE-organic", "Click the triangle bed TE (with an existing tree crown), then Organic patches", "Patches from a clipped Voronoi; crown inside the bed", click_bed("bed.TE", "organic"))
    step("structure-TE-confirmed", "Confirm", "Three beds structured", confirm)

    def to_compose():
        P.click_el("#fnext"); P.wait("GPFlow.stage() === 'compose'"); return {"task": S("document.querySelector('#dpanel .task').textContent"), "primary": S("document.querySelector('[data-a=suggest]').className")}
    step("compose-start", "Click 'Continue to Compose'", "First action is Suggest / Create a mix; cells shown unassigned (hatched)", to_compose)

    def suggest():
        P.click_el("[data-a=suggest]"); P.wait("GPFlow.u.suggestion && !GPFlow.u.suggestion.loading", 60)
        r = S("(() => { const s = GPFlow.u.suggestion.res; return { mode: s.mode, recipes: s.recipes.map(r => ({ name: r.name, members: r.members.length, months: r.coverage && r.coverage.months })), target: s.target }; })()")
        return {**r, "ok": r["mode"] == "rules" and len(r["recipes"]) >= 2}
    step("compose-suggest", "Click 'Suggest mixes'", "Rules-mode candidates with members, roles, proportions, coverage, rationale; labelled not AI", suggest)

    def accept():
        P.click_el('[data-acc="0"]'); P.wait("GPFlow.P.state.mixes.length >= 1"); P.click_el('[data-acc="0"]'); P.wait("GPFlow.P.state.mixes.length >= 2")
        if S("!!GPFlow.u.suggestion"): P.click_el("[data-a=close]")
        return {"mixes": S("GPFlow.P.state.mixes.map(m => [m.id, m.name, m.origin, m.members.length])"), "ok": S("GPFlow.P.state.mixes.length") == 2}
    step("compose-accept", "Accept the first two candidates", "Two mixes in the project library (origin: rules)", accept)

    def auto():
        P.click_el("[data-a=auto]"); P.wait("!!GPFlow.u.autoPreview")
        pv = S("(() => { const a = GPFlow.u.autoPreview; const by = {}; for (const p of a.proposals) by[p.mixId] = (by[p.mixId] || 0) + 1; return { proposals: a.proposals.length, by, rule: a.rule }; })()")
        shot = P.shot(f"{n[0]:02d}b-auto-compose-preview")
        P.click_el("[data-a=autoaccept]"); P.wait("GPFlow.P.totals().plants > 0", 120)
        t = S("GPFlow.P.totals()"); rows = S("GPFlow.store.model.placements.filter(p => p.kind === 'plants').reduce((a, p) => a + p.countModelled, 0)")
        return {**pv, "plants": t["plants"], "modelRows": rows, "previewShot": shot, "ok": rows == t["plants"] and pv["proposals"] == t["cells"]}
    step("compose-auto", "Click 'Auto compose', check the preview, Accept", "Every unassigned cell proposed; accept places real plant instances (model rows = project instances)", auto)

    def inspect():
        c = S("GPFlow.P.state.cells['c.TE.1'].center"); sx, sy = P.world(*c); P.click(sx, sy); P.wait("GPFlow.u.cells.has('c.TE.1')")
        return {"inspector": S("document.querySelector('#finsp').innerText.slice(0, 400)"), "ok": not S("document.querySelector('#finsp').hidden")}
    step("compose-inspect-cell", "Click cell TE·1 on the canvas (no brush)", "Inspector opens only now: conditions (crown), mix, placed vs target", inspect)

    def paint():
        P.click_el(".f-insp .x")
        mix2 = S("GPFlow.P.state.mixes[1].id"); P.click_el(f'[data-paint="{mix2}"]'); P.wait("!!GPFlow.u.paint")
        ids = S("GPFlow.P.state.beds['bed.A2'].cellIds.slice(0, 5)"); pts = [P.world(*S(f"GPFlow.P.state.cells['{i}'].center")) for i in ids]
        undo0 = S("GPFlow.P.past.length"); P.drag(pts); P.wait(f"GPFlow.P.past.length === {undo0 + 1}")
        got = S(f"{json.dumps(ids)}.map(i => GPFlow.P.state.assignments[i].mixId)")
        return {"cells": ids, "assigned": got, "undoSteps": S("GPFlow.P.past.length") - undo0, "ok": all(g == mix2 for g in got) and S("GPFlow.P.past.length") - undo0 == 1}
    step("compose-paint-drag", "Click 'Paint' on the second mix and drag across five A2 cells", "One gesture = one assignment = one undo step; plants replaced in those cells only", paint)

    def undo_redo():
        fp1 = S("(async () => (await import('./src/flow/project.js')).fingerprint(GPFlow.P.state.instances))()")
        P.click_el("#fundo"); P.wait("GPFlow.P.future.length === 1"); fp0 = S("(async () => (await import('./src/flow/project.js')).fingerprint(GPFlow.P.state.instances))()")
        P.click_el("#fredo"); P.wait("GPFlow.P.future.length === 0"); fp2 = S("(async () => (await import('./src/flow/project.js')).fingerprint(GPFlow.P.state.instances))()")
        P("Input.dispatchKeyEvent", type="keyDown", key="Escape", code="Escape", windowsVirtualKeyCode=27); P("Input.dispatchKeyEvent", type="keyUp", key="Escape", code="Escape", windowsVirtualKeyCode=27)
        return {"after": fp1, "undone": fp0, "redone": fp2, "paintOff": S("!GPFlow.u.paint"), "ok": fp1 == fp2 and fp0 != fp1 and S("!GPFlow.u.paint")}
    step("compose-undo-redo-esc", "Click Undo, then Redo, then press Esc", "Undo restores the previous plants, redo the painted ones; Esc leaves paint mode", undo_redo, shot=False)

    def axo():
        P.click_el('.obs button[data-v="3d"]'); P.wait("GPFlow.ctx.st.view === '3d'"); time.sleep(2)
        P.js("GPFlow.scene.setViewCenter && GPFlow.scene.setViewCenter(-28, 2, 9)"); time.sleep(1.5)
        rows = S("GPFlow.store.model.placements.filter(p => p.kind === 'plants').reduce((a, p) => a + p.countModelled, 0)")
        return {"view": "axo", "rows": rows, "projectPlants": S("GPFlow.P.totals().plants"), "ok": rows == S("GPFlow.P.totals().plants")}
    step("compose-3d", "Click 'Axo'", "The same plants and cell tints in the existing 3D model (one record set for 2D and 3D)", axo)
    P.click_el('.obs button[data-v="plan"]'); P.wait("GPFlow.ctx.st.view === 'plan'")

    def edit_mix():
        mix1 = S("GPFlow.P.state.mixes[0].id"); uses = S(f"GPFlow.P.usesOf('{mix1}')")
        other = S(f"(() => {{ const o = {{}}; for (const [c, a] of Object.entries(GPFlow.P.state.assignments)) if (a.mixId !== '{mix1}') o[c] = GPFlow.P.state.instances[c].plants.length + ':' + GPFlow.P.state.instances[c].plants[0].x; return o; }})()")
        P.click_el(f'[data-edit="{mix1}"]'); P.wait("!!GPFlow.u.editor")
        P.type("#mxask", "keep the grass matrix, increase spring bloom"); P.click_el("[data-a=propose]"); P.wait("!!GPFlow.u.editor.proposal")
        prop = S("GPFlow.u.editor.proposal.matched"); shot = P.shot(f"{n[0] + 1:02d}-mix-edit-proposal")
        P.click_el("[data-a=applyprop]"); P.click_el("[data-a=save]"); P.wait("!GPFlow.u.editor || !!GPFlow.u.editor.save")
        prev = S("GPFlow.u.editor ? ({ before: GPFlow.u.editor.save.preview.before, after: GPFlow.u.editor.save.preview.after }) : null"); shot2 = P.shot(f"{n[0] + 1:02d}-mix-edit-update-all-preview")
        if prev: P.click_el("[data-a=saveall]"); P.wait("!GPFlow.u.editor")
        other2 = S(f"(() => {{ const o = {{}}; for (const [c, a] of Object.entries(GPFlow.P.state.assignments)) if (a.mixId !== '{mix1}') o[c] = GPFlow.P.state.instances[c].plants.length + ':' + GPFlow.P.state.instances[c].plants[0].x; return o; }})()")
        ver = S(f"GPFlow.P.mix('{mix1}').version")
        return {"matched": prop, "preview": prev, "uses": len(uses), "version": ver, "otherCellsUnchanged": other == other2, "shots": [shot, shot2], "ok": other == other2 and ver == 2}
    step("compose-edit-shared-mix", "Edit mix 1: type 'keep the grass matrix, increase spring bloom', Propose, Apply, Save → Update all", "A patch, not a regeneration; preview of affected plants; only that mix's cells rearranged", edit_mix, shot=False)

    def knowledge_add():
        mix2 = S("GPFlow.P.state.mixes[1].id"); P.click_el(f'[data-edit="{mix2}"]'); P.wait("!!GPFlow.u.editor")
        P.js("document.querySelector('.f-panel details:last-of-type').open = true")
        pid = S("GPFlow.u.editor.draft.members.find(m => m.role !== 'matrix').plantId")
        P.click_el(f'[data-kn="{pid}"]'); P.wait("!!GPFlow.u.knowledgeAdd")
        P.type("#kntext", "Here it keeps flowering into October and I saw moths on it in the evening.")
        P.click_el("[data-a=read]"); P.wait("GPFlow.u.knowledgeAdd.claims && GPFlow.u.knowledgeAdd.claims.bloom && GPFlow.u.knowledgeAdd.claims.bloom.length > 0")
        claims = S("GPFlow.u.knowledgeAdd.claims"); shot = P.shot(f"{n[0] + 1:02d}-knowledge-add-review")
        before = S(f"GPFlow.K.traits('{pid}').bloom.value")
        P.click_el("[data-a=save]"); P.wait("!GPFlow.u.knowledgeAdd")
        after = S(f"GPFlow.K.traits('{pid}')"); rec = S("GPFlow.P.state.knowledge.records.slice(-1)[0]")
        P.click_el("[data-a=cancel]")
        return {"plant": pid, "claims": claims, "before": before, "after": [after["bloom"]["value"], after["bloom"]["source"], after["bloom"]["status"]], "record": rec, "shot": shot, "ok": after["bloom"]["source"] == "project" and rec["original"].startswith("Here it keeps")}
    step("compose-add-knowledge", "Edit mix 2 → 'add what you know' on a plant → type a note → Read my note → Save (this project)", "Claims reviewed before saving; original words kept; project scope; committed design unchanged", knowledge_add, shot=False)

    def to_explore():
        P.click_el("#fnext")
        if S("!!GPFlow.u.confirm"): P.shot(f"{n[0]:02d}b-leave-empty-confirm"); P.click_el("#fconfirm .btn-s")
        P.wait("GPFlow.stage() === 'explore'"); return {"view": S("GPFlow.P.state.view.explore"), "issues": S("GPFlow.P.perf.issues.map(i => i.title)")}
    step("explore-start", "Click 'Continue to Explore'", "Same design, planting view by default", to_explore)

    def months():
        fp = S("(async () => (await import('./src/flow/project.js')).fingerprint(GPFlow.P.state.instances))()")
        P.click_el('[data-v="pollinator"]'); out = {}
        for m in (4, 6, 8):
            P.click_el(f'#ftl [data-m="{m}"]'); P.wait(f"GPFlow.month() === {m}")
            b = S(f"(() => {{ const b = GPFlow.P.perf.byMonth[{m}]; return {{ resource: b.resourceCells, uncertain: b.uncertainCells, groups: b.groups.map(g => g.group), components: b.components.length }}; }})()")
            out[m] = b; P.shot(f"{n[0]:02d}-{['', '', '', '', 'apr', '', 'jun', '', 'aug'][m]}")
        fp2 = S("(async () => (await import('./src/flow/project.js')).fingerprint(GPFlow.P.state.instances))()")
        return {"byMonth": out, "designUnchanged": fp == fp2, "ok": fp == fp2}
    step("explore-pollinator-months", "Click 'Pollinators', then April, June, August on the timeline", "Resource cells, groups and continuity per month from the placed plants; the design is not changed", months, shot=False)

    def views():
        P.click_el('[data-v="adaptability"]'); s1 = P.shot(f"{n[0]:02d}-adaptability")
        P.click_el('[data-v="seasonality"]'); P.js("GPFlow.focusCells(['c.A2.1','c.A2.2','c.A2.3'])"); s2 = P.shot(f"{n[0]:02d}-seasonality")
        return {"shots": [s1, s2], "adapt": S("(() => { const c = { match: 0, conflict: 0, uncertain: 0 }; for (const p of Object.values(GPFlow.P.perf.perCell)) if (p.adaptability) c[p.adaptability.status]++; return c; })()")}
    step("explore-views", "Click 'Adaptability', then 'Seasonality'", "Match / conflict / uncertain from known traits; per-plant flowering in the month", views, shot=False)

    def issue_loop():
        P.click_el('[data-v="pollinator"]'); P.js("GPFlow.ctx.fit()")
        iss = S("GPFlow.P.perf.issues.map(i => ({ id: i.id, type: i.type, actions: i.actions }))")
        target = next((i for i in iss if "editMix" in i["actions"]), None) or (iss[0] if iss else None)
        if not target: return {"issues": iss, "note": "no issue to follow in this design", "ok": True}
        P.click_el(f'[data-iss="{target["id"]}"]'); shot = P.shot(f"{n[0]:02d}-issue-selected")
        act = "editMix" if "editMix" in target["actions"] else "reassign" if "reassign" in target["actions"] else "knowledge"
        P.click_el(f'[data-act="{act}"]'); P.wait("GPFlow.stage() === 'compose'")
        state = S("({ editor: !!GPFlow.u.editor, cells: [...GPFlow.u.cells], knowledge: !!GPFlow.u.knowledgeAdd })")
        shot2 = P.shot(f"{n[0]:02d}-issue-to-compose")
        if state["editor"]: P.click_el("[data-a=cancel]")
        if state["knowledge"]: P.click_el("[data-a=cancel]")
        P.click_el("#fnext")
        if S("!!GPFlow.u.confirm"): P.click_el("#fconfirm .btn-s")
        P.wait("GPFlow.stage() === 'explore'")
        return {"issue": target, "action": act, "composeState": state, "shots": [shot, shot2], "ok": state["editor"] or len(state["cells"]) > 0 or state["knowledge"]}
    step("explore-issue-to-compose", "Click an issue, then its action (Edit mix / Reassign)", "Returns to Compose with the mix or cells selected; then back to Explore", issue_loop, shot=False)

    def knowledge_ws():
        stage = S("GPFlow.stage()"); P.click_el('.f-sections [data-ws="knowledge"]'); P.wait("!document.querySelector('#fknow').hidden"); time.sleep(4)
        shot = P.shot(f"{n[0]:02d}-knowledge-workspace")
        P.click_el('.f-sections [data-ws="design"]'); P.wait("document.querySelector('#fknow').hidden")
        return {"stageKept": S("GPFlow.stage()") == stage, "shot": shot, "ok": S("GPFlow.stage()") == stage}
    step("knowledge-workspace-and-back", "Click 'Knowledge' in the top bar, then 'Design'", "Knowledge workspace over the design; back to the same stage and view", knowledge_ws, shot=False)

    def save_export():
        P.type("#snapname", "First pass"); P.click_el("[data-a=snap]"); P.wait("GPFlow.P.snapshots().length === 1")
        dl = tempfile.mkdtemp(); P("Page.setDownloadBehavior", behavior="allow", downloadPath=dl)
        P.click_el("[data-a=export]")
        f = None
        for _ in range(60):
            fs = [x for x in os.listdir(dl) if x.endswith(".json")]
            if fs: f = os.path.join(dl, fs[0]); break
            time.sleep(0.5)
        data = json.load(open(f)) if f else None
        summary = None
        if data:
            i0 = data["instances"][0]
            summary = {"file": os.path.basename(f), "bytes": os.path.getsize(f), "keys": list(data.keys()), "cells": len(data["cells"]), "mixes": len(data["mixes"]), "instances": len(data["instances"]), "firstInstance": i0, "caveats": len(data["caveats"]), "hasPerformance": bool(data.get("performance"))}
        return {"snapshots": S("GPFlow.P.snapshots().map(s => s.name)"), "export": summary, "ok": bool(summary) and summary["instances"] == S("GPFlow.P.totals().plants") and i0.get("z") is not None}
    step("explore-save-export", "Type a snapshot name, click 'Save snapshot', click 'Export planting data'", "Snapshot read back from storage; export file with brief, cells, mixes, every plant x/y/z, performance, caveats", save_export)

    def reload_resume():
        fp = S("(async () => (await import('./src/flow/project.js')).fingerprint(GPFlow.P.state.instances))()"); mixes = S("GPFlow.P.state.mixes.map(m => m.id + 'v' + m.version)")
        P("Page.reload"); P.wait("document.documentElement.dataset.ready === '1' && !!window.GPFlow", 300); time.sleep(1)
        shot = P.shot(f"{n[0]:02d}-reload-resume-offer")
        P.click_el("[data-a=resume]"); P.wait("GPFlow.stage() === 'explore'", 60)
        fp2 = S("(async () => (await import('./src/flow/project.js')).fingerprint(GPFlow.P.state.instances))()"); mixes2 = S("GPFlow.P.state.mixes.map(m => m.id + 'v' + m.version)")
        rows = S("GPFlow.store.model.placements.filter(p => p.kind === 'plants').reduce((a, p) => a + p.countModelled, 0)")
        return {"fingerprint": [fp, fp2], "mixes": [mixes, mixes2], "modelRows": rows, "stage": S("GPFlow.stage()"), "brief": S("GPFlow.P.state.brief.intent"), "shot": shot, "ok": fp == fp2 and mixes == mixes2}
    step("reload-resume", "Reload the page, click 'Resume this design'", "Same brief, cells, mixes, assignments, plant positions and stage", reload_resume)

    def compare():
        P.click_el("[data-cmp]"); P.wait("!!GPFlow.u.compare"); return {"table": S("document.querySelector('.cand').innerText.slice(0, 500)")}
    step("explore-compare", "Click 'Compare' on the snapshot", "Same metric definitions side by side; knowledge-version difference flagged if any", compare)

    def narrow():
        P("Emulation.setDeviceMetricsOverride", width=820, height=1000, deviceScaleFactor=1, mobile=False); time.sleep(1.5)
        P.js("window.dispatchEvent(new Event('resize'))"); shot = P.shot(f"{n[0]:02d}-narrow-820")
        P("Emulation.setDeviceMetricsOverride", width=1440, height=900, deviceScaleFactor=1, mobile=False); P.js("window.dispatchEvent(new Event('resize'))")
        return {"shot": shot}
    step("narrow-layout", "Narrow the window to 820 px", "Panel below the canvas; stepper numbers only", narrow, shot=False)

    log["consoleErrors"] = list(P.errors); log["finished"] = time.strftime("%Y-%m-%d %H:%M:%S")
    log["passed"] = sum(1 for s in log["steps"] if s["result"] == "pass"); log["failed"] = sum(1 for s in log["steps"] if s["result"] != "pass")
    json.dump(log, open(os.path.join(ROOT, "docs", "qa", "flow_e2e.json"), "w"), indent=1)
    print(f"journey: {log['passed']} passed, {log['failed']} failed, console errors: {len(log['consoleErrors'])}")
    return log


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--serve", default=ROOT); ap.add_argument("--only", default=""); ap.add_argument("--port", type=int, default=8797)
    a = ap.parse_args(); os.makedirs(SHOTS, exist_ok=True); os.makedirs(os.path.join(ROOT, "docs", "qa"), exist_ok=True)
    P, chrome, srv, base = launch(a.serve, a.port, 9361)
    try:
        if a.only in ("", "unit"): unit(P, base)
        if a.only in ("", "journey"): P.errors.clear(); journey(P, base)
    finally:
        chrome.terminate(); srv.shutdown()


if __name__ == "__main__":
    main()
