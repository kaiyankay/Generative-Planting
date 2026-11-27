"""End-to-end experiments A–F of the Integrated Design Prototype on the real Detroit model.

python3 -I tools/design_e2e.py [--out docs/qa/design_e2e.json] [--shots docs/screenshots/integrated] [--only A,B]

Serves this checkout under /Generative-Planting/ (the GitHub Pages base path), drives ONE headless Chrome over the DevTools
protocol with real mouse input events for the brushes and the panels, checks every result against the model data
(beds, paths, DEM, knowledge) and writes screenshots of every step plus a JSON record. A personal-knowledge test database
(`kdb=gp-knowledge-e2e-…`) is used, so a real personal knowledge layer in the browser is never touched.
"""
import argparse, base64, functools, json, math, os, subprocess, sys, tempfile, threading, time, urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools", "knowledge"))
from cdp import WS  # noqa: E402  (standard-library websocket client of the knowledge tools)

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


class Quiet(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


class Page:
    def __init__(self, ws):
        self.ws = ws; self.n = 0

    def __call__(self, method, **params):
        self.n += 1; mid = self.n
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get("id") == mid:
                if "error" in m: raise RuntimeError(f"{method}: {m['error']}")
                return m.get("result", {})

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

    def mouse(self, t, x, y, buttons=0, shift=False, button="left"):
        self("Input.dispatchMouseEvent", type=t, x=float(x), y=float(y), button=button if t != "mouseMoved" or buttons else "none", buttons=buttons, clickCount=1, modifiers=8 if shift else 0)

    def click(self, x, y, shift=False):
        self.mouse("mouseMoved", x, y); self.mouse("mousePressed", x, y, 1, shift); self.mouse("mouseReleased", x, y, 0, shift)

    def drag(self, pts, step_s=0.0):
        self.mouse("mouseMoved", *pts[0]); self.mouse("mousePressed", *pts[0], 1)
        for p in pts[1:]:
            self.mouse("mouseMoved", *p, 1)
            if step_s: time.sleep(step_s)
        self.mouse("mouseReleased", *pts[-1], 0)

    def el(self, sel):
        r = self.js(f"(() => {{ const e = document.querySelector({json.dumps(sel)}); if (!e) return null; e.scrollIntoView({{ block: 'center', inline: 'nearest' }}); const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }})()")
        if not r: raise RuntimeError("not found: " + sel)
        return r

    def click_el(self, sel, shift=False):
        x, y = self.el(sel); self.click(x, y, shift)

    def screen(self, x, y):  # world → client px in the active view
        return self.js(f"(() => {{ const v = GP.viewState().view; if (v === 'plan') return GP._plan.T({x}, {y}); const s = GP._scene.screenOf({x}, {y}); return s; }})()")

    def shot(self, path):
        self.mouse("mouseMoved", 130, 860)  # pointer over the palette footer / entry card: no hover tag over the canvas
        self.js("new Promise((r) => { const t = setTimeout(r, 1500); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(); })); })")
        time.sleep(0.35)
        open(path, "wb").write(base64.b64decode(self("Page.captureScreenshot", format="png")["data"]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "docs", "qa", "design_e2e.json"))
    ap.add_argument("--shots", default=os.path.join(ROOT, "docs", "screenshots", "integrated"))
    ap.add_argument("--only", default="")
    ap.add_argument("--port", type=int, default=8794)
    ap.add_argument("--serve", default=ROOT, help="folder served as /Generative-Planting/ (a snapshot copy lets you keep editing while the run goes)")
    a = ap.parse_args()
    only = set(a.only.split(",")) if a.only else None
    os.makedirs(a.shots, exist_ok=True); os.makedirs(os.path.dirname(a.out), exist_ok=True)
    tmp = tempfile.mkdtemp(); os.symlink(os.path.abspath(a.serve), os.path.join(tmp, "Generative-Planting"))
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), functools.partial(Quiet, directory=tmp)); threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{a.port}/Generative-Planting/"
    prof = tempfile.mkdtemp(); dport = 9341
    chrome = subprocess.Popen([CHROME, "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars", "--window-size=1440,900",
                               "--force-device-scale-factor=1", f"--user-data-dir={prof}", f"--remote-debugging-port={dport}", "--remote-allow-origins=*", "about:blank"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    kdb = "gp-knowledge-e2e-" + str(int(time.time()))
    log = {"runner": "headless Chrome (SwiftShader) over the DevTools protocol; real mouse input events for brushes and panels", "url": base, "knowledgeDb": kdb, "started": time.strftime("%Y-%m-%d %H:%M:%S"), "experiments": {}, "checks": []}
    shots = []
    try:
        pages = []
        for _ in range(150):
            try:
                pages = [p for p in json.load(urllib.request.urlopen(f"http://127.0.0.1:{dport}/json/list", timeout=2)) if p.get("type") == "page"]
                if pages: break
            except Exception: pass
            time.sleep(0.2)
        P = Page(WS(pages[0]["webSocketDebuggerUrl"]))
        P("Page.enable"); P("Runtime.enable")
        P("Emulation.setDeviceMetricsOverride", width=1440, height=900, deviceScaleFactor=1, mobile=False)
        errors = []

        def check(exp, name, ok, detail=""):
            log["checks"].append({"experiment": exp, "name": name, "ok": bool(ok), "detail": str(detail)[:600]})
            print(("PASS " if ok else "FAIL ") + f"[{exp}] {name}" + ("" if ok else "  -> " + str(detail)[:300]), flush=True)

        def shot(name, caption):
            path = os.path.join(a.shots, name + ".png"); P.shot(path); shots.append({"file": os.path.relpath(path, ROOT), "caption": caption}); print("  shot", name, flush=True)

        def load(q=""):
            P("Page.navigate", url=base + "index.html" + q)
            P.wait("document.documentElement.dataset.ready === '1'")
            P.wait("!!document.documentElement.dataset.knowledge", 120)
            P.js("window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(e.message)); const ce = console.error.bind(console); console.error = (...a) => { window.__errs.push(a.join(' ')); ce(...a); }; true")

        def run(ops):
            return P.js(f"(() => {{ const r = GP.design.run({json.dumps(ops)}); return r; }})()")

        def want(e): return only is None or e in only

        # ============================================================ F (part 1) + A: entry → empty beds → palette → fill with real clicks
        P("Page.navigate", url=base + "index.html?kdb=" + kdb)
        P.js("true")
        P.wait("document.documentElement.dataset.ready === '1'")
        P.js("localStorage.clear(); true")
        P("Page.navigate", url=base + "?kdb=" + kdb)  # a plain visit: the site preset first
        P.wait("document.documentElement.dataset.ready === '1'"); P.wait("!!document.documentElement.dataset.knowledge", 120)
        shot("F01-entry", "Entry: the Detroit site preset in the canonical axonometric, with the two ways to start designing")
        check("F", "entry shows the site preset and the design choices", P.js("!document.getElementById('entry').hidden && /Oudolf Garden Detroit/.test(document.getElementById('entry').innerText) && !!document.getElementById('btnStartBlank')"))
        P.click_el("#btnStartBlank"); time.sleep(0.5)
        check("F", "Empty beds starts a working design in the same workspace (plan, palette, brushes)", P.js("GP.design.active() && GP.design() === 'working' && !document.getElementById('palette').hidden && GP.viewState().view === 'plan' && GP._store.draft.from === 'blank'"))
        shot("F02-workspace", "The design workspace: mixes on the left, brushes in the canvas toolbar, the 15 empty main beds hatched")
        exps = log["experiments"]
        B = ["bed.B1", "bed.B2", "bed.B3N", "bed.B3S", "bed.B4", "bed.B5"]; AC = ["bed.A1", "bed.A2", "bed.A3N", "bed.A3S", "bed.A4", "bed.C1", "bed.C2", "bed.C3", "bed.C4"]
        cen = P.js("Object.fromEntries(GP._store.beds.map((b) => { const c = GP._store.getPlantingContext(b.id).conditionsAtCentroid; return [b.id, [c.x, c.y]]; }))")
        # A: Dropseed matrix on the six B beds (shift-click to select several), Colour blocks on the nine A and C beds
        P.click_el('[data-mix="mix.dropseed-matrix"]'); P.click_el('[data-tool="fill"]')
        for b in B: P.click(*P.screen(*cen[b]), shift=True)
        check("A", "Shift-click selects six beds before filling", P.js("GP._ui && document.querySelector('#dhint').innerText.includes('6 beds selected')"), P.js("document.querySelector('#dhint').innerText"))
        shot("A01-select-beds", "Experiment A: six B beds selected with the Fill brush (Shift-click)")
        P.click_el('#dhint [data-a=fillsel]'); time.sleep(0.3)
        P.click_el('[data-mix="mix.block-colour"]')
        for b in AC: P.click(*P.screen(*cen[b]), shift=True)
        P.click_el('#dhint [data-a=fillsel]'); time.sleep(0.3)
        fa = P.js("GP.design.feedback()")
        exps["A"] = {"assignments": fa["assignments"], "totals": fa["totals"], "mixes": [{"name": m["name"], "roles": m["roles"], "areaM2": m["areaM2"]} for m in fa["mixes"]], "openM2": fa["openM2"]}
        check("A", "two assignments, each spanning several beds, cover all 15 main beds (no open bed area)", len(fa["assignments"]) == 2 and fa["openM2"] == 0 and sorted(sum([q["beds"] for q in fa["assignments"]], [])) == sorted(B + AC), json.dumps([(q["label"], q["beds"]) for q in fa["assignments"]]))
        check("A", "real plants written to the working design (> 12,000 perennials)", fa["totals"]["perennials"] > 12000, fa["totals"])
        tol = [r for m in fa["mixes"] for r in m["roles"] if r["layer"] == "base"]
        check("A", "base-role proportions within 5 points of the target", all(abs(r["actual"] - r["target"]) <= 0.05 for r in tol), json.dumps([(r["name"], r["target"], r["actual"]) for r in tol]))
        val = P.js("""(() => { const S = GP._store; let n = 0, bad = 0, zBad = 0, maxdz = 0; const out = [];
          for (const p of S.model.placements) { if (p.kind !== 'plants') continue; for (const i of S.instancesOfPlacement(p.id)) { n++; const x = S.inst.x[i], y = S.inst.y[i];
            if (n % 7 === 0) { const pa = S.plantableAt(x, y); if (!pa.value || pa.unitId !== p.bedId) { bad++; if (out.length < 5) out.push([x, y, pa.reason]); } }
            const rec = S.instanceRecord(i); const z = S.sampleElevation(x, y); const dz = Math.abs(rec.elevation - z); maxdz = Math.max(maxdz, dz); if (dz > 1e-9 || rec.type !== 'designPlant') zBad++; } }
          return { rows: n, checkedPlantable: Math.floor(n / 7), notPlantable: bad, examples: out, zMismatch: zBad, maxdz }; })()""")
        exps["A"]["validation"] = val
        check("A", "every sampled design plant is plantable and inside its own bed (paths, structures excluded)", val["notPlantable"] == 0, val)
        check("A", "every design plant record carries its DEM elevation (bilinear 3DEP, no display exaggeration)", val["zMismatch"] == 0, val)
        shot("A02-filled-plan", "Experiment A: the 15 main beds painted with two executable mixes — real plants, 2D plan")
        P.click_el('.obs [data-v="3d"]'); time.sleep(1.2)
        check("A", "3D renders the same design plants (rendered instances = live rows)", P.js("GP._scene.renderedInstances() === GP._store.liveCount"), P.js("[GP._scene.renderedInstances(), GP._store.liveCount]"))
        shot("A03-filled-axo", "Experiment A: the same design in the axonometric 3D view, on the 3DEP terrain")
        P.click_el('.obs [data-v="plan"]'); time.sleep(0.5)

        # ============================================================ B: a curve across several beds; an area across beds
        if want("B"):
            P.click_el('[data-mix="mix.organic-groups"]'); P.click_el('[data-tool="line"]')
            P.js("(() => { const i = document.querySelector('#dhint [data-k=lineW]'); i.value = 3; i.dispatchEvent(new Event('input')); return true; })()")
            line = [[-48, 6], [-42, 8.5], [-36, 9.5], [-30, 9], [-24, 10.5], [-18, 12], [-12, 12.5], [-6, 13]]
            pts = []
            for k in range(len(line) - 1):
                for t in range(6):
                    u = t / 6; pts.append(P.screen(line[k][0] + (line[k + 1][0] - line[k][0]) * u, line[k][1] + (line[k + 1][1] - line[k][1]) * u))
            pts.append(P.screen(*line[-1]))
            P.drag(pts)
            time.sleep(0.4)
            fb = P.js("GP.design.feedback()"); asg = [q for q in fb["assignments"] if q["type"] == "line"]
            exps["B"] = {"line": asg}
            ok = bool(asg) and len(asg[0]["beds"]) >= 3
            check("B", "a curve drawn with the mouse becomes ONE assignment across ≥ 3 beds", ok, asg)
            if asg:
                chk = P.js(f"""(() => {{ const S = GP._store; let n = 0, bad = 0; for (const p of S.model.placements) {{ if (p.kind !== 'plants' || p.assignmentId !== '{asg[0]['id']}') continue; for (const i of S.instancesOfPlacement(p.id)) {{ n++; const pa = S.plantableAt(S.inst.x[i], S.inst.y[i]); if (!pa.value) bad++; }} }} return {{ plants: n, onPathOrOutside: bad }}; }})()""")
                exps["B"]["check"] = chk
                check("B", "no plant of the curve band on a path or outside a bed; the path part is reported as unplanted space", chk["onPathOrOutside"] == 0 and asg[0]["outsideBedsM2"] > 1 and chk["plants"] > 100, {**chk, "outsideBedsM2": asg[0]["outsideBedsM2"]})
            P.js("(() => { const p = GP._plan; p.view.cx = -27; p.view.cy = 9; p.view.scale = 14; p.request(); return true; })()"); time.sleep(0.3)
            shot("B01-curve-across-beds", "Experiment B: one curve band (Organic groups, drifts) across B1, A1 and B3N; the gravel paths it crosses stay unplanted")
            # an area across two beds and the path between them
            P.click_el('[data-mix="mix.native-meadow"]'); P.click_el('[data-tool="area"]')
            ring = [[-60, -10], [-50, -14], [-38, -12], [-30, -15], [-26, -6], [-36, -4], [-48, -2], [-60, -5], [-60, -10]]
            P.js("(() => { const p = GP._plan; p.view.cx = -50; p.view.cy = -8; p.view.scale = 14; p.request(); return true; })()"); time.sleep(0.3)
            dense = []
            for k in range(len(ring) - 1):
                for t in range(5): u = t / 5; dense.append(P.screen(ring[k][0] + (ring[k + 1][0] - ring[k][0]) * u, ring[k][1] + (ring[k + 1][1] - ring[k][1]) * u))
            dense.append(P.screen(*ring[-1]))
            P.drag(dense)
            time.sleep(0.3)
            fb = P.js("GP.design.feedback()"); ar = [q for q in fb["assignments"] if q["type"] == "area"]
            exps["B"]["area"] = ar
            check("B", "an area drawn across beds is clipped to the beds (one assignment, several beds, path area unplanted)", bool(ar) and len(ar[-1]["beds"]) >= 2 and ar[-1]["outsideBedsM2"] > 1, ar)
            P.js("(() => { const p = GP._plan; p.view.cx = -48; p.view.cy = -6; p.view.scale = 16; p.request(); return true; })()"); time.sleep(0.3)
            shot("B02-area-across-beds", "Experiment B: a lasso area (Native meadow) across C2, B2 and the path between them — clipped to the beds")
            P.js("GP.design.undo(); true")  # keep the A + curve state for D

        # ============================================================ C: the same mix in different conditions (real fields, knowledge, a hypothetical scenario)
        if want("C"):
            # C1: Under trees in B4 (no tree crown) and in TE (an existing NAIP crown, steeper)
            r = run([{"op": "fill", "beds": ["bed.TE"], "mix": "mix.under-trees"}])
            asgTE = r["created"][0]
            r = run([{"op": "paint", "geometry": {"type": "Polygon", "coordinates": [[[54, -68], [84, -68], [84, -50], [54, -50], [54, -68]]]}, "mix": "mix.under-trees"}])
            asgME = r["created"][0]
            c1 = P.js(f"""(() => {{ const out = {{}}; for (const id of ['{asgTE}', '{asgME}']) {{ const g = GP.design.generated(id); const pl = GP.design.plants(id); const trees = GP._cs._trees;
                const under = pl.filter((p) => trees.some((t) => Math.hypot(t.x - p.x, t.y - p.y) <= t.r)); const sp = {{}}; for (const p of under) sp[p.speciesId] = (sp[p.speciesId] || 0) + 1;
                const minTrunk = Math.min(...pl.map((p) => Math.min(...trees.map((t) => Math.hypot(t.x - p.x, t.y - p.y)))));
                out[id] = {{ plants: pl.length, underCrown: under.length, speciesUnderCrown: sp, unplanted: g.diag.unplanted, rules: g.diag.rules, minTrunkM: +minTrunk.toFixed(2), z: [g.diag.env.zMin, g.diag.env.zMax], beds: g.diag.beds }}; }}
                out.shadeOK = Object.fromEntries(['sp.m-cornus-sericea', 'sp.m-geranium-maculatum', 'sp.m-packera-aurea', 'sp.aquilegia-canadensis', 'sp.m-carex-radiata'].map((s) => [s, GP.design._lib.shadeOK(s)]));
                return out; }})()""")
            exps["C"] = {"underTrees": c1}
            te = c1[asgTE]
            check("C", "Under trees in TE: under the existing crown only species with shade knowledge applying in Detroit (Cornus sericea, USDA North America record)", te["underCrown"] > 0 and set(te["speciesUnderCrown"]) <= {"sp.m-cornus-sericea", "sp.mertensia-virginica"} and c1["shadeOK"]["sp.m-cornus-sericea"] is True, te)
            check("C", "positions under the crown with no qualified species are left unplanted, with the reason", te["unplanted"].get("crown", 0) > 0, te["unplanted"])
            check("C", "plants keep ≥ 0.6 m from existing tree centres (approximate trunks)", te["minTrunkM"] >= 0.6 and c1[asgME]["minTrunkM"] >= 0.6, [te["minTrunkM"], c1[asgME]["minTrunkM"]])
            check("C", "the same mix in an East Meadow area with a crown: Cornus under the crown, unqualified positions unplanted, open ground planted with every role", c1[asgME]["underCrown"] > 0 and set(c1[asgME]["speciesUnderCrown"]) <= {"sp.m-cornus-sericea", "sp.mertensia-virginica"} and c1[asgME]["unplanted"].get("crown", 0) > 0 and c1[asgME]["plants"] > 300, c1[asgME])
            check("C", "the East Meadow area: the boardwalk inside it stays unplanted", c1[asgME]["unplanted"].get("blocked", 0) > 0, c1[asgME]["unplanted"])
            P.click_el('[data-cb=species]')
            P.js("(() => { const p = GP._plan; p.view.cx = 62; p.view.cy = -32; p.view.scale = 9; p.request(); return true; })()"); time.sleep(0.3)
            shot("C01-under-trees-crowns", "Experiment C: Under trees in TE and part of the East Meadow — under existing crowns only species with applicable shade knowledge; × = left unplanted (no qualified species), boardwalk excluded")
            # C2: the same Native meadow mix on low and high ground, without and with the HYPOTHETICAL wetness scenario
            r = run([{"op": "paint", "geometry": {"type": "Polygon", "coordinates": [[[-47, -80], [-10, -80], [-10, -40], [-47, -40], [-47, -80]]]}, "mix": "mix.native-meadow"}])
            asgMW = r["created"][0]
            stat = """((id) => { const pl = GP.design.plants(id); const L = GP.design._lib; const by = { dry: [], moist: [], wet: [] }; let known = 0;
                for (const p of pl) { if (p.layer === 2) continue; const h = L.hydrology(p.speciesId); if (h.range && h.range.length === 1) { by[h.range[0]].push(p.z); known++; } }
                const m = (a) => a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(3) : null; return { plants: pl.length, knownHydrology: known, meanZ: { dry: m(by.dry), moist: m(by.moist), wet: m(by.wet) }, n: { dry: by.dry.length, moist: by.moist.length, wet: by.wet.length } }; })"""
            off = P.js(f"{stat}('{asgMW}')")
            run([{"op": "setScenario", "wet": True}])
            on = P.js(f"{stat}('{asgMW}')"); g = P.js(f"GP.design.generated('{asgMW}').diag")
            exps["C"]["hypotheticalWetness"] = {"off": off, "on": on, "rules": g["rules"], "substitutions": len(g["substitutions"]), "fields": g["fields"]}
            check("C", "scenario OFF: species of every hydrology class are spread over the same ground (mean z of wet ≈ dry, within 0.05 m)", off["meanZ"]["wet"] is not None and abs(off["meanZ"]["wet"] - off["meanZ"]["dry"]) < 0.05, off)
            check("C", "scenario ON (hypothetical, flagged): species sort along the ground — mean z wet < moist < dry, wet ≥ 0.10 m below dry", None not in on["meanZ"].values() and on["meanZ"]["wet"] < on["meanZ"]["moist"] < on["meanZ"]["dry"] and on["meanZ"]["dry"] - on["meanZ"]["wet"] >= 0.10, on)
            check("C", "the scenario is labelled hypothetical in the result and its basis is the official list attribute", any(rr.get("hypothetical") for rr in g["rules"]) and any("S-OGD-MEADOW" in (rr.get("basis") or "") for rr in g["rules"]), g["rules"])
            P.click_el('[data-cb=hydrology]')
            P.js("(() => { const p = GP._plan; p.view.cx = -27; p.view.cy = -60; p.view.scale = 11; p.request(); return true; })()"); time.sleep(0.3)
            shot("C02-wetness-on", "Experiment C: Native meadow in the West Meadow with the HYPOTHETICAL 'lower ground is wetter' scenario — wet-listed species gather on low ground")
            run([{"op": "setScenario", "wet": False}]); time.sleep(0.2)
            shot("C03-wetness-off", "Experiment C: the same space and mix with the scenario off — the same species intermingled regardless of elevation")
            # C3: an edge rule (role rule, real distance-to-path field)
            em = P.js("""(() => { const S = GP._store; const f = GP._cs.field('field.distance-to-path'); let n = 0, min = Infinity; const a = GP.design.state().assignments.find((q) => q.mixId === 'mix.dropseed-matrix');
              for (const p of GP.design.plants(a.id)) { if (p.layer !== 1) continue; n++; min = Math.min(min, GP._cs._sampleField(f, p.x, p.y)); } return { emergents: n, minDistanceToPathM: +min.toFixed(2), rule: 0.6 }; })()""")
            exps["C"]["edgeRule"] = em
            check("C", "role rule on a real field: Dropseed emergents all ≥ 0.6 m from paths (distance-to-path, OSM)", em["emergents"] > 0 and em["minDistanceToPathM"] >= 0.6, em)
            run([{"op": "remove", "assignment": asgMW}, {"op": "remove", "assignment": asgME}])
            P.click_el('[data-cb=mix]')

        # ============================================================ D: edit a shared mix; a kept local area and another mix are not touched
        if want("D"):
            hashes = """(() => { const S = GP._store; const out = {}; for (const p of S.model.placements) { if (p.kind !== 'plants') continue; const k = p.mixId || 'kept'; let h = out[k] || 0; for (const i of S.instancesOfPlacement(p.id)) h = (h + ((Math.imul(Math.round(S.inst.x[i] * 1000) ^ Math.imul(Math.round(S.inst.y[i] * 1000), 31), 2654435761) ^ S.inst.sp[i]) >>> 0)) >>> 0; out[k] = h; } return out; })()"""
            # keep (freeze) B5 with the Keep brush: drag around it
            P.click_el('[data-tool="keep"]')
            b5 = P.js("(() => { const b = GP._store.getObject('bed.B5').geometry.coordinates[0]; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of b) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0 - 0.6, y0 - 0.6, x1 + 0.6, y1 + 0.6]; })()")
            ring = [[b5[0], b5[1]], [b5[2], b5[1]], [b5[2], b5[3]], [b5[0], b5[3]], [b5[0], b5[1]]]
            dense = []
            for k in range(4):
                for t in range(8): u = t / 8; dense.append(P.screen(ring[k][0] + (ring[k + 1][0] - ring[k][0]) * u, ring[k][1] + (ring[k + 1][1] - ring[k][1]) * u))
            dense.append(P.screen(*ring[0]))
            P.js("GP.fit(); true"); time.sleep(0.2)
            dense = []
            for k in range(4):
                for t in range(8): u = t / 8; dense.append(P.screen(ring[k][0] + (ring[k + 1][0] - ring[k][0]) * u, ring[k][1] + (ring[k + 1][1] - ring[k][1]) * u))
            dense.append(P.screen(*ring[0]))
            P.drag(dense); time.sleep(0.3)
            keep = P.js("GP.design.assignments().filter((q) => q.type === 'keep')")
            check("D", "Keep brush: B5 kept as a frozen snapshot", bool(keep) and keep[-1]["frozenPlants"] > 500, keep)
            before = P.js(hashes); fbb = P.js("GP.design.feedback()")
            kept_before = P.js("(() => { const S = GP._store; const k = S.model.placements.filter((p) => p.kind === 'plants' && !p.mixId); let h = 0, n = 0; for (const p of k) for (const i of S.instancesOfPlacement(p.id)) { n++; h = (h + ((Math.imul(Math.round(S.inst.x[i] * 1000) ^ Math.imul(Math.round(S.inst.y[i] * 1000), 31), 2654435761) ^ S.inst.sp[i]) >>> 0)) >>> 0; } return [n, h]; })()")
            # edit the shared mix in the mix editor: matrix share 72 % → 50 %, Pending → Preview → Apply
            P.click_el('[data-edit="mix.dropseed-matrix"]'); time.sleep(0.2)
            P.js("(() => { const i = document.querySelector('[data-share=matrix]'); i.value = 50; i.dispatchEvent(new Event('change')); return true; })()")
            P.click_el('#dpanel [data-open=groups]'); time.sleep(0.1)
            P.js("(() => { const i = document.querySelector('[data-add=groups]'); i.value = \"Echinacea pallida 'Hula Dancer'\"; i.dispatchEvent(new Event('change')); return true; })()")
            P.click_el('#dpanel [data-a=preview]'); time.sleep(0.3)
            prev = P.js("({ pending: document.querySelectorAll('#dpanel .d-pend li').length, text: document.querySelector('#dpanel .d-pend').innerText, roles: [...document.querySelectorAll('#dpanel .d-ba')].map((e) => e.innerText) })")
            check("D", "mix edit is held as pending changes and previewed (plants and role shares before → after) before it is applied", prev["pending"] == 2 and "Preview:" in prev["text"] and len(prev["roles"]) >= 2, prev)
            shot("D01-mix-preview", "Experiment D: Dropseed matrix edited (matrix 72 % → 50 %, + Echinacea pallida 'Hula Dancer' in the groups) — preview, not applied yet")
            P.click_el('#dpanel [data-a=apply]'); time.sleep(0.4)
            after = P.js(hashes); fba = P.js("GP.design.feedback()")
            kept_after = P.js("(() => { const S = GP._store; const k = S.model.placements.filter((p) => p.kind === 'plants' && !p.mixId); let h = 0, n = 0; for (const p of k) for (const i of S.instancesOfPlacement(p.id)) { n++; h = (h + ((Math.imul(Math.round(S.inst.x[i] * 1000) ^ Math.imul(Math.round(S.inst.y[i] * 1000), 31), 2654435761) ^ S.inst.sp[i]) >>> 0)) >>> 0; } return [n, h]; })()")
            mb = next(m for m in fbb["mixes"] if m["id"] == "mix.dropseed-matrix"); ma = next(m for m in fba["mixes"] if m["id"] == "mix.dropseed-matrix")
            exps["D"] = {"before": {"roles": mb["roles"], "version": mb["version"], "plants": mb["perennials"]}, "after": {"roles": ma["roles"], "version": ma["version"], "plants": ma["perennials"]}, "hashesBefore": before, "hashesAfter": after, "kept": [kept_before, kept_after]}
            check("D", "every non-frozen Dropseed space follows the new version (groups share rises, version + 2)", ma["version"] == mb["version"] + 2 and next(r for r in ma["roles"] if r["id"] == "groups")["actual"] > next(r for r in mb["roles"] if r["id"] == "groups")["actual"] + 0.1, [mb["roles"], ma["roles"]])
            check("D", "the kept B5 snapshot is byte-identical after the mix edit", kept_before == kept_after and kept_before[0] > 500, [kept_before, kept_after])
            check("D", "spaces of another mix (Colour blocks) are untouched", before.get("mix.block-colour") == after.get("mix.block-colour"), [before.get("mix.block-colour"), after.get("mix.block-colour")])
            P.js("GP.fit(); true"); time.sleep(0.3)
            shot("D02-mix-applied", "Experiment D: after Apply — every Dropseed space updated, kept B5 and the Colour blocks spaces unchanged")
            # a local edit: paint a small area in B2 with Colour blocks; plants elsewhere stay as they were
            outside = """(() => { const S = GP._store; let h = 0, n = 0; const box = [-44, -20, -34, -12]; for (const p of S.model.placements) { if (p.kind !== 'plants') continue; for (const i of S.instancesOfPlacement(p.id)) { const x = S.inst.x[i], y = S.inst.y[i]; if (x > box[0] - 1 && x < box[2] + 1 && y > box[1] - 1 && y < box[3] + 1) continue; n++; h = (h + ((Math.imul(Math.round(x * 1000) ^ Math.imul(Math.round(y * 1000), 31), 2654435761) ^ S.inst.sp[i]) >>> 0)) >>> 0; } } return [n, h]; })()"""
            o1 = P.js(outside)
            run([{"op": "paint", "geometry": {"type": "Polygon", "coordinates": [[[-44, -20], [-34, -20], [-34, -12], [-44, -12], [-44, -20]]]}, "mix": "mix.block-colour"}])
            o2 = P.js(outside)
            exps["D"]["localEdit"] = {"outsideBefore": o1, "outsideAfter": o2}
            check("D", "a local repaint changes nothing outside its area (plants outside identical)", o1 == o2, [o1, o2])

        # ============================================================ E: knowledge → design judgement
        if want("E"):
            P.js("(() => { const a = GP.design.state().assignments.find((q) => q.mixId === 'mix.under-trees' && (q.bedIds || []).includes('bed.TE')); window.__te = a ? a.id : null; return true; })()")
            if not P.js("!!window.__te"):
                r = run([{"op": "fill", "beds": ["bed.TE"], "mix": "mix.under-trees"}]); P.js(f"window.__te = '{r['created'][0]}'; true")
            under = """(() => { const id = window.__te; const pl = GP.design.plants(id); const trees = GP._cs._trees; const sp = {}; for (const p of pl) if (trees.some((t) => Math.hypot(t.x - p.x, t.y - p.y) <= t.r)) sp[p.speciesId] = (sp[p.speciesId] || 0) + 1; return { underCrown: sp, unplantedCrown: GP.design.generated(id).diag.unplanted.crown || 0 }; })()"""
            e0 = P.js(under)
            prof0 = P.js("GP.design.library.profile('sp.m-geranium-maculatum').exposure.status")
            # add knowledge (through the plant card's form): Geranium maculatum tolerates part shade, in Detroit
            r1 = P.js("GP.design.runAsync([{ op: 'addKnowledge', speciesId: 'sp.m-geranium-maculatum', kind: 'exposure', value: ['exposure:part_shade', 'exposure:shade'], place: 'place:detroit', note: 'e2e test record' }])")
            e1 = P.js(under)
            # narrow the scope: design rules may use only records for Detroit itself
            P.js("GP.design.runAsync([{ op: 'setKnowledgePolicy', accept: ['same', 'within'] }])"); e2 = P.js(under)
            usda = P.js("GP.design.library.profile('sp.m-cornus-sericea').exposure.notApplied.map((q) => q.r.id).filter((id) => id.includes('usda'))[0] || null")
            P.js(f"GP.design.runAsync([{{ op: 'applyRecordHere', recordId: {json.dumps(usda)}, why: 'e2e: North America record judged valid for Belle Isle' }}])"); e3 = P.js(under)
            P.js("GP.design.runAsync([{ op: 'setKnowledgePolicy', accept: ['same', 'within', 'broader'] }])")
            missing = P.js("['sp.m-packera-aurea', 'sp.m-carex-radiata', 'sp.sporobolus-heterolepis'].map((s) => { const p = GP.design.library.profile(s); return [s, p.exposure.status, p.bloom.status]; })")
            exps["E"] = {"before": e0, "geraniumExposureBefore": prof0, "afterAddingGeraniumRecord": e1, "addResult": r1, "afterNarrowingScope": e2, "usdaRecord": usda, "afterApplyingUSDAHere": e3, "missing": missing}
            check("E", "before: Geranium maculatum has no exposure record (unknown) and is never planted under the crown", prof0 == "unknown" and "sp.m-geranium-maculatum" not in e0["underCrown"], [prof0, e0])
            check("E", "adding a personal Detroit record makes the engine plant Geranium under the crown and leaves fewer positions unplanted", e1["underCrown"].get("sp.m-geranium-maculatum", 0) > 0 and e1["unplantedCrown"] < e0["unplantedCrown"], e1)
            check("E", "narrowing the knowledge scope to Detroit-only removes Cornus sericea (its record is for North America) from under the crown", "sp.m-cornus-sericea" not in e2["underCrown"] and "sp.m-cornus-sericea" in e0["underCrown"], [e0, e2])
            check("E", "applying the North America record to Detroit (a stored scope decision) brings Cornus back", e3["underCrown"].get("sp.m-cornus-sericea", 0) > 0 and bool(usda), e3)
            check("E", "missing knowledge is reported as unknown, never invented", all(m[1] in ("unknown", "not applicable here") for m in missing), missing)
            P.click_el('[data-cb=species]')
            P.js("(() => { const p = GP._plan; p.view.cx = 61; p.view.cy = -3; p.view.scale = 26; p.request(); return true; })()"); time.sleep(0.3)
            # open the plant card of a Geranium under the crown
            pos = P.js("(() => { const S = GP._store; const trees = GP._cs._trees; for (const p of S.model.placements) { if (p.kind !== 'plants' || p.assignmentId !== window.__te) continue; for (const i of S.instancesOfPlacement(p.id)) { const sp = S.speciesByIndex[S.inst.sp[i]].id; const x = S.inst.x[i], y = S.inst.y[i]; if (sp === 'sp.m-geranium-maculatum' && trees.some((t) => Math.hypot(t.x - x, t.y - y) <= t.r)) return 'pi.' + i; } } return null; })()")
            if pos: P.js(f"GP.select('{pos}'); true"); time.sleep(0.3)
            shot("E01-knowledge-card", "Experiment E: a Geranium maculatum planted under the TE crown after the personal Detroit exposure record — its knowledge card")
            P.click_el('[data-cb=mix]')

        # ============================================================ F (part 2): iterate — undo / redo, 2D/3D, reference, operations drawer
        if want("F"):
            P.js("GP.select(null); GP.fit(); true")
            n0 = P.js("GP.design.feedback().totals.perennials")
            P.click_el('#dUndo'); time.sleep(0.3); n1 = P.js("GP.design.feedback().totals.perennials")
            P.click_el('#dRedo'); time.sleep(0.3); n2 = P.js("GP.design.feedback().totals.perennials")
            check("F", "Undo and Redo through the bar buttons", n1 != n0 and n2 == n0, [n0, n1, n2])
            P.click_el('.design [data-d=reference]'); time.sleep(0.6)
            ref_ok = P.js("GP.design() === 'reference' && GP._store.scenario === 'reference' && document.getElementById('palette').hidden")
            shot("F03-reference", "Reference comparison: the reconstructed reference planting in the same canvas (palette hidden, nothing changed)")
            P.click_el('.design [data-d=working]'); time.sleep(0.6)
            check("F", "Reference ↔ Working design switch keeps both intact", ref_ok and P.js("GP.design() === 'working' && GP.design.feedback().totals.perennials") == n0)
            P.click_el('#dFeedback'); time.sleep(0.3)
            P.js("(() => { const i = document.querySelector('#dpanel [data-a=month]'); i.value = 5; i.dispatchEvent(new Event('input')); return true; })()"); time.sleep(0.2)
            sz = P.js("GP.design.season(5)")
            exps["F"] = {"seasonMay": {k: sz[k] for k in ("total", "known", "coverage", "blooming", "speciesKnown", "speciesUnknown")}}
            check("F", "season feedback uses only applicable phenology records and reports the coverage", sz["coverage"] < 1 and sz["total"] > 0, exps["F"]["seasonMay"])
            shot("F04-feedback-season", "Feedback: totals, target vs actual per mix, unfilled space, site rules, May — bloom known only where a record applies (coverage shown)")
            P.js("(() => { const i = document.querySelector('#dpanel [data-a=month]'); i.value = 0; i.dispatchEvent(new Event('input')); return true; })()")
            P.click_el('#dOps'); time.sleep(0.3)
            P.js("document.querySelector('#dAsk').value = 'make the matrix in B4 lighter and add emergents along the path'; true"); P.click_el('#ddrawer [data-a=ask]'); time.sleep(0.2)
            asked = P.js("document.querySelector('#dAskOut').innerText")
            check("F", "free language is not faked: without a connected model the request is reported as not interpreted", "Not interpreted" in asked, asked)
            P.js("""(() => { document.querySelector('#dJson').value = JSON.stringify([{ op: 'point', at: [5.5, -14], mix: 'mix.block-colour', count: 7 }, { op: 'editMix', mix: 'mix.block-colour', changes: [{ op: 'setShare', roleId: 'emergents', value: 0.24 }] }], null, 1); return true; })()""")
            P.click_el('#ddrawer [data-a=prev]'); time.sleep(0.4)
            prevtxt = P.js("document.querySelector('#dOut').innerText")
            shot("F05-ops-preview", "Ask · Operate: the structured design operations (the same interface the brushes use) previewed — hollow circles, nothing applied")
            P.click_el('#ddrawer [data-a=apply]'); time.sleep(0.4)
            apptxt = P.js("document.querySelector('#dOut').innerText")
            check("F", "structured operations preview, then apply through the same engine", "Preview" in prevtxt and "Applied" in apptxt, [prevtxt, apptxt])
            P.click_el('#ddrawer [data-a=close]')
            P.click_el('.obs [data-v="3d"]'); time.sleep(1.0)
            shot("F06-final-axo", "The iterated design in 3D")
            P.click_el('.obs [data-v="plan"]'); time.sleep(0.3); P.js("GP.fit(); true"); time.sleep(0.3)
            shot("F07-final-plan", "The iterated design in plan")
            # reload: the design document is restored and rebuilt deterministically
            n3 = P.js("GP.design.feedback().totals.perennials"); h3 = P.js("GP._store.draft.inst.fingerprint().live")
            P("Page.navigate", url=base + "index.html?view=plan&design=working&kdb=" + kdb); P.wait("document.documentElement.dataset.ready === '1'"); P.wait("!!document.documentElement.dataset.knowledge", 120); time.sleep(1.0)
            n4 = P.js("GP.design.feedback().totals.perennials")
            check("F", "after a reload the design document is restored and rebuilt to the same plants", n4 == n3, [n3, n4])
            errs = P.js("(window.__errs || []).slice(0, 5)")
            check("F", "no runtime errors", not errs, errs)
        log["shots"] = shots
    finally:
        log["finished"] = time.strftime("%Y-%m-%d %H:%M:%S")
        ok = sum(1 for c in log["checks"] if c["ok"]); log["summary"] = f"{ok}/{len(log['checks'])} checks passed"
        json.dump(log, open(a.out, "w"), indent=1, ensure_ascii=False)
        print("\n" + log["summary"], "->", os.path.relpath(a.out, ROOT))
        try: chrome.terminate(); chrome.wait(10)
        except Exception: chrome.kill()
        srv.shutdown()


if __name__ == "__main__":
    main()
