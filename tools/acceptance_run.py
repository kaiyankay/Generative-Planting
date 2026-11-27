"""Acceptance run of the computational space, driven like a user in ONE real Chrome session.

python3 -I tools/acceptance_run.py [--out docs/screenshots/phase-01-3] [--json docs/qa/acceptance_run.json]

Chrome (headless, SwiftShader WebGL) is driven over the DevTools protocol: mouse clicks are real input events
(Input.dispatchMouseEvent, incl. shift), every step is captured with Page.captureScreenshot, and the query results
shown on screen are read back from the page (window.GP) and written to JSON. Steps follow the brief:
  1 select B1 in Axo · 2 Plan keeps the selection · 3 hide the reference planting · 4 elevation / slope / distance
  to path in B1 · 5 two conditions overlaid · 6 change a threshold (and a uniform case) · 7 blank working design
  in B1 · 8 back to Axo, zones on the terrain · 9 Reference restored · 10 several beds, then all design beds.
No third-party packages: the WebSocket client below is ~40 lines of RFC 6455.
"""
import argparse, base64, functools, json, os, shutil, socket, struct, subprocess, sys, tempfile, threading, time, urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


class WS:
    def __init__(self, url):
        u = urlparse(url)
        self.s = socket.create_connection((u.hostname, u.port), timeout=120)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((f"GET {u.path} HTTP/1.1\r\nHost: {u.hostname}:{u.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.s.recv(4096)
        if b" 101 " not in buf.split(b"\r\n")[0]:
            raise RuntimeError("websocket handshake failed: " + buf[:200].decode(errors="replace"))
        self.rest = buf.split(b"\r\n\r\n", 1)[1]

    def _read(self, n):
        while len(self.rest) < n:
            chunk = self.s.recv(1 << 20)
            if not chunk:
                raise RuntimeError("socket closed")
            self.rest += chunk
        out, self.rest = self.rest[:n], self.rest[n:]
        return out

    def send(self, text):
        data = text.encode(); mask = os.urandom(4); n = len(data)
        head = bytes([0x81]) + (bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n) if n < 65536 else bytes([0x80 | 127]) + struct.pack(">Q", n))
        self.s.sendall(head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def recv(self):
        msg = b""
        while True:
            b0, b1 = self._read(2)
            n = b1 & 0x7F
            if n == 126: n = struct.unpack(">H", self._read(2))[0]
            elif n == 127: n = struct.unpack(">Q", self._read(8))[0]
            payload = self._read(n)
            op = b0 & 0x0F
            if op == 9:  # ping
                continue
            msg += payload
            if b0 & 0x80:
                return msg.decode()


class CDP:
    def __init__(self, ws):
        self.ws = ws; self.n = 0

    def __call__(self, method, **params):
        self.n += 1; mid = self.n
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        t0 = time.time()
        while True:
            if time.time() - t0 > 90:
                raise RuntimeError(f"{method}: no answer in 90 s")
            m = json.loads(self.ws.recv())
            if m.get("id") == mid:
                if "error" in m:
                    raise RuntimeError(f"{method}: {m['error']}")
                return m.get("result", {})

    def js(self, expr):
        r = self("Runtime.evaluate", expression=expr, awaitPromise=True, returnByValue=True)
        if r.get("exceptionDetails"):
            raise RuntimeError("JS: " + json.dumps(r["exceptionDetails"])[:600])
        return r["result"].get("value")

    def click(self, x, y, shift=False):
        mod = 8 if shift else 0
        for t in ("mouseMoved", "mousePressed", "mouseReleased"):
            self("Input.dispatchMouseEvent", type=t, x=x, y=y, button="left" if t != "mouseMoved" else "none", clickCount=1, modifiers=mod)

    def click_el(self, selector):
        r = self.js(f"(() => {{ const e = document.querySelector({json.dumps(selector)}); if (!e) return null; e.scrollIntoView({{block:'nearest'}}); const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }})()")
        if not r:
            raise RuntimeError("not found: " + selector)
        self.click(r[0], r[1])

    def shot(self, path):
        self.js("new Promise((r) => { const t = setTimeout(r, 1500); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(); })); })")
        time.sleep(0.4)
        data = self("Page.captureScreenshot", format="png")["data"]
        open(path, "wb").write(base64.b64decode(data))


def main():
    import faulthandler, signal
    faulthandler.register(signal.SIGUSR1)  # kill -USR1 <pid> prints where a run is waiting
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "docs", "screenshots", "phase-01-3"))
    ap.add_argument("--json", default=os.path.join(ROOT, "docs", "qa", "acceptance_run.json"))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    tmp = tempfile.mkdtemp(); os.symlink(ROOT, os.path.join(tmp, "Generative-Planting"))
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *x):
            pass
    h = functools.partial(Quiet, directory=tmp)
    srv = ThreadingHTTPServer(("127.0.0.1", 8793), h); threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:8793/Generative-Planting/"
    prof = tempfile.mkdtemp(); port = 9337
    chrome = subprocess.Popen([CHROME, "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars",
                               "--window-size=1440,900", "--force-device-scale-factor=1", f"--user-data-dir={prof}",
                               f"--remote-debugging-port={port}", "--remote-allow-origins=*", "about:blank"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    log = {"runner": "headless Chrome (SwiftShader) over the DevTools protocol; real mouse input events", "steps": []}
    try:
        pages = []
        for _ in range(150):
            try:
                pages = [p for p in json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=2)) if p.get("type") == "page"]
                if pages: break
            except Exception:
                pass
            time.sleep(0.2)
        if not pages:
            raise RuntimeError(f"Chrome did not open its debugging port {port} (another run still holding it?)")
        page = pages[0]
        c = CDP(WS(page["webSocketDebuggerUrl"]))
        c("Page.enable"); c("Runtime.enable")
        c("Emulation.setDeviceMetricsOverride", width=1440, height=900, deviceScaleFactor=1, mobile=False)
        c("Page.navigate", url=base + "index.html")  # a first visit: the site preset is shown before the workspace
        for _ in range(300):
            if c.js("document.documentElement.dataset.ready === '1'"):
                break
            time.sleep(0.1)
        c.js("localStorage.clear(); GP.discardDraft(); true")
        errs = "window.__errs = []; window.addEventListener('error', (e) => __errs.push(e.message)); const _ce = console.error; console.error = (...a) => { __errs.push(a.join(' ')); _ce(...a); }; true"
        c.js(errs)

        def step(no, name, shot, data):
            print(f"  … {no}", flush=True)
            path = os.path.join(a.out, shot + ".png"); c.shot(path)
            log["steps"].append({"step": no, "name": name, "screenshot": os.path.relpath(path, ROOT), "data": data})
            print(f"{no:>4}  {name}  -> {shot}.png", flush=True)

        R2 = [{"field": "field.slope", "breaks": [2]}, {"field": "field.distance-to-path", "breaks": [1.5]}]
        # ---- 0 · entry: the site preset in its axonometric, then Open site -> the same workspace
        c("Emulation.setDeviceMetricsOverride", width=1440, height=900, deviceScaleFactor=1, mobile=False)  # settle the viewport before the first frame
        c.js("window.dispatchEvent(new Event('resize')); true"); time.sleep(1.5)
        step("0a", "first visit: the site preset (axonometric) before the workspace tools", "00a-entry-site-preset",
             c.js("({ entered: GP.entered(), view: GP.viewState().view, preset: GP.site(), levels: GP.spatialModel() })"))
        c.click_el("#btnEnter"); time.sleep(0.4)
        step("0b", "Open site: the same axonometric becomes the workspace", "00b-workspace-entered", c.js("({ entered: GP.entered(), view: GP.viewState().view, axoHome: GP.viewState().axoHome })"))
        # ---- 1 · select B1 in Axo (a real click on the bed in the 3D view), open Conditions from its card
        c.js("GP._scene.focus('bed.B1', 1.7, true); true"); time.sleep(0.5)
        xy = c.js("(() => { const g = GP.getObject('bed.B1').geometry.coordinates[0]; let x = 0, y = 0; g.slice(0, -1).forEach((q) => { x += q[0]; y += q[1]; }); return GP._scene.screenOf(x / (g.length - 1), y / (g.length - 1)); })()")
        c.click(xy[0], xy[1]); time.sleep(0.3)
        step("1a", "click B1 in Axo: the bed is selected, its card shows the condition ranges across the bed", "01a-axo-select-b1",
             c.js("({ selection: GP.selection(), card: document.getElementById('inspector').innerText.split('\\n').slice(0, 6) })"))
        c.click_el("#inspector [data-act=cond]"); time.sleep(0.4)
        step("1b", "Conditions opens on B1 (scope = B1, 1 m terrain cells)", "01b-axo-conditions-b1",
             c.js("({ conditions: GP.conditions(), domain: GP.domain('bed.B1') })"))
        # ---- 2 · Plan keeps the same selection and place
        before = c.js("GP._scene.viewCenter()")
        c.click_el(".obs [data-v=plan]"); time.sleep(0.4)
        step("2", "switch to Plan: same selection, same scope, same centre and scale", "02-plan-same-scope",
             c.js(f"({{ view: GP.viewState().view, selection: GP.selection(), scope: GP.conditions().scope, axoCentre: {json.dumps(before)}, planCentre: {{ x: GP._plan.view.cx, y: GP._plan.view.cy, ppm: GP._plan.view.scale }} }})"))
        c.js("GP._ui.an && true"); c.click_el("#conditions [data-a=zoom]"); time.sleep(0.3)
        # ---- 3 · hide the reference planting (view only)
        c.click_el("#conditions [data-a=hide]"); time.sleep(0.4)
        step("3", "Hide planting: the reference is only hidden (placements kept), B1's real outline stays", "03-plan-planting-hidden",
             c.js("({ filter: GP.viewFilter(), design: GP.design(), placementsInB1: GP._store.placementsByBed.get('bed.B1').length, bedOutlineVisible: GP._store.layerVisible('structure.beds'), bedAreaM2: GP.getObject('bed.B1').props.areaM2 })"))
        # ---- 4 · elevation, slope, distance to path inside B1
        dist = c.js("GP.distribution('bed.B1', { fields: ['field.elevation', 'field.slope', 'field.distance-to-path', 'field.sun'] })")
        for k, (fid, nm) in enumerate([("field.elevation", "elevation"), ("field.slope", "slope"), ("field.distance-to-path", "path")]):
            c.click_el(f'#conditions input[value="field:{fid}"]'); time.sleep(0.4)
            f = dist["fields"][fid]
            step(f"4{'abc'[k]}", f"{nm} across B1, in bands no finer than its accuracy", f"04{'abc'[k]}-b1-{nm}",
                 {k2: f[k2] for k2 in ("min", "p10", "p50", "p90", "max", "mean", "range", "tolerance", "uniform", "histogram")})
        log["distributionB1"] = dist
        # ---- 5 · two conditions overlaid
        c.js(f"GP.setConditionRules({json.dumps(R2)}); true")
        c.click_el('#conditions input[value="zones"]'); time.sleep(0.5)
        z5 = c.js("(() => { const c = GP.computation(); return { id: c.id, rules: c.rules.map((r) => ({ field: r.field, breaks: r.breaks, uncertainAreaM2: r.uncertainAreaM2, uniformIn: r.uniformIn })), summary: c.summary, zones: c.zones.map((z) => ({ id: z.id, bedId: z.bedId, label: z.label, areaM2: z.areaM2, regions: z.regions, cells: z.cells, stats: z.stats })), notes: c.notes, areaM2: c.areaM2, ms: c.ms }; })()")
        step("5", "slope 2° × distance to path 1.5 m: four zones that tile B1", "05-b1-zones-slope-path", z5)
        # ---- 6 · change a threshold (typed into the panel), then a uniform case
        c.js("(() => { const i = document.querySelector('#conditions [data-rn=\"0\"]'); i.focus(); i.select(); return true; })()")
        c("Input.insertText", text="1"); c.js("document.querySelector('#conditions [data-rn=\"0\"]').dispatchEvent(new Event('change', { bubbles: true })); true"); time.sleep(0.5)
        z6 = c.js("(() => { const c = GP.computation(); return { id: c.id, threshold: c.rules[0].breaks, summary: c.summary, notes: c.notes }; })()")
        step("6a", "slope threshold changed 2° → 1°: zones recomputed", "06a-b1-threshold-1deg", {"before": z5["summary"], "after": z6})
        uni = c.js("(() => { const d = GP.distribution('bed.TN').fields['field.elevation']; const t = +((d.min + d.max) / 2).toFixed(3); const r = GP.classify('bed.TN', { rules: [{ field: 'field.elevation', breaks: [t] }] }); return { bed: 'bed.TN', elevation: { min: d.min, max: d.max, range: d.range, tolerance: d.tolerance, uniform: d.uniform }, threshold: t, zones: r.zones.length, notes: r.notes }; })()")
        c.js(f"GP.setConditionScope(['bed.TN']); GP.setConditionRules([{{ field: 'field.elevation', breaks: [{uni['threshold']}] }}]); GP.showZones(); true"); time.sleep(0.3)
        c.js("(() => { const g = GP.getObject('bed.TN').geometry; const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const q of g.coordinates[0]) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); } GP._plan.fit([b[0] - 10, b[1] - 8, b[2] + 10, b[3] + 8]); return true; })()"); time.sleep(0.3)
        uni["inPanel"] = c.js("GP.conditions().computation")
        step("6b", "uniform ground is not split: TN's elevation varies less than the DEM accuracy, so a threshold inside its range leaves it whole", "06b-tn-uniform-no-split", uni)
        c.js("GP.showField('field.elevation'); true"); time.sleep(0.3)
        step("6c", "the same bed shown as a field: one band, marked uniform (no colour stretch over noise)", "06c-tn-uniform-field", {"field": c.js("GP.distribution('bed.TN').fields['field.elevation']")})
        c.js(f"GP.setConditionScope(['bed.B1']); GP.setConditionRules({json.dumps(R2)}); GP.showZones(); true"); c.click_el("#conditions [data-a=zoom]"); time.sleep(0.3)
        # ---- 7 · blank working design in B1 only
        fp = c.js("({ zones: GP.computation().fingerprint, dist: JSON.stringify(GP.distribution('bed.B1').fields) })")
        c.click_el("#conditions [data-a=blank]"); time.sleep(0.6)
        c.click_el("#conditions [data-a=hide]"); time.sleep(0.4)  # show the planting again: only B1 is empty
        d7 = c.js(f"({{ design: GP.design(), draft: GP.draftInfo(), placementsB1: (GP._store.placementsByBed.get('bed.B1') || []).length, placementsA1: (GP._store.placementsByBed.get('bed.A1') || []).length, zonesUnchanged: GP.computation().fingerprint === {json.dumps(fp['zones'])}, fieldsUnchanged: JSON.stringify(GP.distribution('bed.B1').fields) === {json.dumps(fp['dist'])}, zones: GP.computation().summary }})")
        step("7", "blank working design in B1 only: B1 empty, neighbours keep their planting, fields and zones unchanged", "07-plan-blank-b1-zones-kept", d7)
        # ---- 8 · back to Axo: the zones lie on the terrain and inside the bed outline
        c.click_el(".obs [data-v='3d']"); time.sleep(0.4)
        c.js("GP._scene.focus('bed.B1', 2.3, true); GP._scene.repaintGroundNow(); true"); time.sleep(0.8)
        d8 = c.js("""(() => { const S = GP._store, sc = GP._scene, cmp = GP.computation(); const out = [];
          for (const z of cmp.zones) { const r = z.geometry.coordinates[0][0]; for (const q of r.filter((_, k) => k % 7 === 0).slice(0, 6)) { const s = sc.screenOf(q[0], q[1]); const g = sc.groundAt(s[0], s[1]); if (g) out.push(Math.hypot(g[0] - q[0], g[1] - q[1])); } }
          return { view: GP.viewState().view, design: GP.design(), zoneVerticesTested: out.length, maxRoundTripErrorM: Math.max(...out), elevationRangeOfB1: GP.distribution('bed.B1').fields['field.elevation'].range, verticalExaggeration: sc.VEX }; })()""")
        step("8", "Axo: zones painted on the terrain surface, aligned with the bed outline (screen↔ground round trip)", "08-axo-zones-on-terrain", d8)
        # ---- 9 · Reference restored
        c.click_el(".design [data-d=reference]"); time.sleep(0.6)
        d9 = c.js("({ design: GP.design(), referenceFingerprint: GP._store.refInst.fingerprint(), activeFingerprint: GP._store.inst.fingerprint(), placementsB1: GP._store.placementsByBed.get('bed.B1').length, placements: GP._store.model.placements.length, workingDesignKept: !!GP.draftInfo() })")
        d9["identical"] = d9["referenceFingerprint"] == d9["activeFingerprint"]
        step("9", "Reference: the original planting is complete (same instance fingerprint)", "09-axo-reference-restored", d9)
        # ---- 10 · several beds (shift-click in Plan), then every design bed
        c.click_el(".obs [data-v=plan]"); time.sleep(0.3)
        c.js("GP._plan.fit([-62, -18, 8, 26]); GP.select(null); true"); time.sleep(0.3)
        for bid in ("bed.A1", "bed.B2"):
            p = c.js(f"(() => {{ const g = GP.getObject('{bid}').geometry.coordinates[0]; let x = 0, y = 0; g.slice(0, -1).forEach((q) => {{ x += q[0]; y += q[1]; }}); const t = GP._plan.T(x / (g.length - 1), y / (g.length - 1)); const r = GP._plan.c.getBoundingClientRect(); return [r.left + t[0], r.top + t[1]]; }})()")
            c.click(p[0], p[1], shift=True); time.sleep(0.4)
        d10 = c.js("(() => { const c = GP.computation(); return { scope: GP.conditions().scope, splits: c.splits, summary: c.summary, perBed: c.scope.bedIds.map((b) => ({ bed: b, zones: c.zones.filter((z) => z.bedId === b).map((z) => [z.label, z.areaM2]) })) }; })()")
        c.js("document.querySelector('#conditions details.perbed')?.setAttribute('open', ''); true")
        step("10a", "shift-click A1 and B2: one computation over three beds, every zone keeps its bed id", "10a-plan-three-beds", d10)
        c.click_el("#conditions [data-a=all]"); time.sleep(0.8)
        c.js("GP.fit(); true"); time.sleep(0.4)
        d10b = c.js("(() => { const c = GP.computation(); return { beds: c.scope.bedIds.length, zones: c.zones.length, areaM2: c.areaM2, summary: c.summary, ms: c.ms }; })()")
        step("10b", "All design beds: 20 beds, one computation", "10b-plan-all-design-beds", d10b)
        c.js("GP.setView('3d'); GP._scene.home(); true"); time.sleep(0.8)
        step("10c", "All design beds in Axo", "10c-axo-all-design-beds", {"view": c.js("GP.viewState().view")})
        log["errors"] = c.js("window.__errs")
        log["levels"] = c.js("GP.spatialModel()")
        log["ok"] = not log["errors"]
    finally:
        chrome.terminate(); srv.shutdown()
        shutil.rmtree(prof, ignore_errors=True); shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(os.path.dirname(a.json), exist_ok=True)
    json.dump(log, open(a.json, "w"), indent=1, ensure_ascii=False)
    print("errors:", log.get("errors"), "->", os.path.relpath(a.json, ROOT))


if __name__ == "__main__":
    main()
