"""Generative Planting V3.1 — live-brush performance trace with REAL mouse input (Chrome over the DevTools protocol).

python3 -I -u tools/v3_perf.py --serve <folder> --label <name> [--gpu] [--scenario large|blank|both] [--port 8799]

The same script measures the V2 baseline (serve an export of the V2 commit) and the V3.1 build, on the same machine,
viewport (1440 × 900), camera (beds B1 + B2 fitted), brush (⌀ 3 m) and pointer path, so the numbers are comparable.

Setup (NOT measured, stated in the report): the design is built through the Project API — the V2 starter strategy, every
bed structured, Auto Compose on every cell (≈ 19 000 plants: the V2 large-design scale) — and the Matrix mix is put on the
brush. Measured: one continuous stroke with real Input.dispatchMouseEvent events (press, 110 moves ≈ 16 ms apart, release)
from bed B1 across the crushed-granite walk into B2 and back and forth inside B2.

Recorded in the page:  every animation frame (rAF timestamps → frame interval p50 / p95), every pointermove (event
timestamp), every plan draw (start, end, staged plant count), long tasks (PerformanceObserver), brush handler time
(F.brushLog). Input → drawn = end of the first plan draw that started after the input event, minus the event timestamp;
input → next frame = the next rAF after that draw (≈ presentation). Staged plants per draw while the button is held.
"""
import argparse, json, os, platform, statistics, subprocess, sys, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools")); sys.path.insert(0, os.path.join(ROOT, "tools", "knowledge"))
import flow_e2e  # noqa: E402

SETUP = r"""
(async () => {
  const F = GPFlow, P = F.P; const base = location.pathname.replace(/[^/]*$/, '');
  const S = await import(base + 'src/flow/strategy.js'); const C = await import(base + 'src/flow/compose.js');
  const keep = P.eligibleBeds().filter((b) => /^M[WE]$/.test(b.code)).map((b) => b.id);
  const s = S.proposeStrategy(P, { intent: S.STARTERS[0].text, scope: 'main', customBeds: [], keep }); P.confirmStrategy(s);
  F.go('structure', { force: true });
  const t0 = performance.now(); while ((!F.u.previews || F.u.pvBusy || F.u.previews.size < s.zones.flatMap((z) => z.bedIds).length) && performance.now() - t0 < 240000) await new Promise((r) => setTimeout(r, 200));
  P.commitStructureMany([...F.u.previews.values()]); F.u.previews = null;
  F.go('compose', { force: true });
  if (window.__SCENARIO === 'large') {
    const all = P.allCells(); const free = all.filter((c) => !(P.state.instances[c.id] && P.state.instances[c.id].plants.length));
    const r = C.autoCompose({ scopeCells: free, allCells: all, assignments: P.state.assignments, mixes: P.state.mixes, K: F.K, brief: P.state.brief, links: P.links() });
    P.assignMany(Object.fromEntries(r.proposals.map((p) => [p.cellId, p.mixId])));
  }
  return { plants: P.totals().plants, cells: P.allCells().length, beds: Object.keys(P.state.beds).length, mixes: P.state.mixes.map((m) => m.id) };
})()
"""
INSTR = r"""
(() => {
  const F = GPFlow; const c2d = document.getElementById('c2d');
  const R = window.__perf = { frames: [], inputs: [], draws: [], long: [], on: false };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) R.long.push([+e.startTime.toFixed(1), +e.duration.toFixed(1)]); }).observe({ type: 'longtask', buffered: false }); } catch (e) { R.noLongtask = String(e); }
  const loop = (t) => { if (R.on) R.frames.push(+t.toFixed(2)); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  c2d.addEventListener('pointermove', (e) => { if (R.on && e.buttons) R.inputs.push({ t: +e.timeStamp.toFixed(2) }); }, true);
  const pl = F.plan;
  // every kind of plan paint is timed: full draw (V2 and V3) and the V3 region redraw; the overlay (cursor) is timed apart
  const wrap = (name, kind) => { if (!pl[name]) return; const d0 = pl[name].bind(pl); pl[name] = function (...a) { const t0 = performance.now(); const r = d0(...a); const t1 = performance.now(); if (R.on) { const st = F.brush.stroke; R.draws.push([+t0.toFixed(2), +t1.toFixed(2), st ? st.added : -1, kind]); if (kind !== 'overlay') for (const i of R.inputs) if (i.drawn == null && i.t <= t0) { i.drawn = +t1.toFixed(2); i.staged = st ? st.added : -1; } } return r; }; };
  wrap('draw', 'full'); wrap('drawRegion', 'region'); wrap('drawOverlay', 'overlay');
  return true;
})()
"""


def pct(xs, q):
    if not xs: return None
    xs = sorted(xs); k = max(0, min(len(xs) - 1, int(round(q / 100 * (len(xs) - 1))))); return round(xs[k], 1)


PROFILE = False


def summarize_profile(pr, top=25):
    nodes = {n["id"]: n for n in pr["nodes"]}; dt = pr.get("timeDeltas", []); self_t = {}
    for sid, d in zip(pr.get("samples", []), dt): self_t[sid] = self_t.get(sid, 0) + d
    agg = {}
    for nid, t in self_t.items():
        cf = nodes[nid]["callFrame"]; key = f"{cf['functionName'] or '(anon)'} {cf['url'].split('/')[-1]}:{cf['lineNumber'] + 1}"; agg[key] = agg.get(key, 0) + t
    tot = sum(agg.values()) or 1
    return [[k, round(v / 1000, 1), round(100 * v / tot, 1)] for k, v in sorted(agg.items(), key=lambda kv: -kv[1])[:top]]


def run(P, base, scenario, label):
    P("Page.navigate", url=base + "LICENSE"); time.sleep(0.4)
    P("Storage.clearDataForOrigin", origin=base.split("/Generative-Planting/")[0], storageTypes="local_storage,indexeddb")
    P("Page.navigate", url=base + "?fresh=1&intro=0&kdb=gp-perf-" + str(int(time.time())))
    P.wait("document.documentElement.dataset.ready === '1' && !!window.GPFlow", 300); time.sleep(1.5)
    P.js(f"window.__SCENARIO = {json.dumps(scenario)}")
    t = time.time(); setup = P.js(SETUP); setup["setupS"] = round(time.time() - t, 1); time.sleep(2)
    # a mix that really changes the ground: Maximal Color (Colour blocks) over the Matrix-planted path beds B1 / B2
    mix = P.js("(GPFlow.P.state.mixes.find((m) => m.system === 'maximal-color') || GPFlow.P.state.mixes[0]).id")
    P.js(f"GPFlow.setBrush({{ mixId: {json.dumps(mix)}, slots: null }}); GPFlow.brush.setRadius(1.5); GPFlow.focusBeds(['bed.B1', 'bed.B2']); true"); time.sleep(1.5)
    P.js(INSTR); time.sleep(0.5)
    cen = lambda bed: P.js(f"(() => {{ const P = GPFlow.P; const c = P.state.beds['{bed}'].cellIds.map((i) => P.state.cells[i].center); return [c.reduce((a, q) => a + q[0], 0) / c.length, c.reduce((a, q) => a + q[1], 0) / c.length]; }})()")  # noqa: E731
    a, b = cen("bed.B1"), cen("bed.B2")
    pts = []
    for k in range(60): u = k / 59; pts.append([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u])
    for k in range(50): pts.append([b[0] + 3.0 * ((k % 10) / 5 - 1 if (k // 10) % 2 == 0 else 1 - (k % 10) / 5), b[1] - 4 + k * 0.16])
    scr = [P.world(*q) for q in pts]
    if PROFILE: P("Profiler.enable"); P("Profiler.setSamplingInterval", interval=200); P("Profiler.start")
    P.js("__perf.on = true; GPFlow.brushLog.length = 0; true")
    P.mouse("mouseMoved", *scr[0]); time.sleep(0.05)
    t0 = time.time(); P.mouse("mousePressed", *scr[0], 1); held_frames = []
    for i, q in enumerate(scr[1:]):
        P.mouse("mouseMoved", *q, 1); time.sleep(0.016)
        if i in (20, 60, 100): held_frames.append(P.js("GPFlow.brush.stroke ? GPFlow.brush.stroke.added : -1"))
    t1 = time.time()
    prof = summarize_profile(P("Profiler.stop")["profile"]) if PROFILE else None
    P.mouse("mouseReleased", *scr[-1], 0); t2 = time.time()
    time.sleep(1.5); P.js("__perf.on = false; true")
    R = P.js("(() => { const R = __perf; return { frames: R.frames, inputs: R.inputs, draws: R.draws, long: R.long, brush: GPFlow.brushLog.slice(), last: GPFlow.brush.last ? { added: GPFlow.brush.last.added, removed: GPFlow.brush.last.removed, cells: GPFlow.brush.last.cells, beds: GPFlow.brush.last.beds, ms: GPFlow.brush.last.ms } : null, plants: GPFlow.P.totals().plants, noLongtask: R.noLongtask || null }; })()")
    fr = R["frames"]; down_t = None
    # the stroke window: from the first input to the last input (held), release handled separately
    ins = R["inputs"]; w0 = ins[0]["t"] if ins else 0; w1 = ins[-1]["t"] if ins else 0
    iv = [fr[i + 1] - fr[i] for i in range(len(fr) - 1) if w0 <= fr[i] <= w1]
    lat = [i["drawn"] - i["t"] for i in ins if i.get("drawn") is not None]
    nxt = []
    for i in ins:
        if i.get("drawn") is None: continue
        f = next((x for x in fr if x >= i["drawn"]), None)
        if f is not None: nxt.append(f - i["t"])
    dr = [d[1] - d[0] for d in R["draws"] if w0 <= d[0] <= w1 and (len(d) < 4 or d[3] != 'overlay')]
    ov = [d[1] - d[0] for d in R["draws"] if w0 <= d[0] <= w1 and len(d) > 3 and d[3] == 'overlay']
    kinds = {}
    for d in R["draws"]:
        if w0 <= d[0] <= w1 and len(d) > 3: kinds[d[3]] = kinds.get(d[3], 0) + 1
    longs_hold = [l for l in R["long"] if w0 - 5 <= l[0] <= w1]
    longs_after = [l for l in R["long"] if l[0] > w1]
    staged_seq = [d[2] for d in R["draws"] if w0 <= d[0] <= w1 and (len(d) < 4 or d[3] != 'overlay')]
    out = {
        "label": label, "scenario": scenario, "setup": setup, "inputs": len(ins), "inputsDrawn": len(lat),
        "frameIntervalMs": {"p50": pct(iv, 50), "p95": pct(iv, 95), "max": round(max(iv), 1) if iv else None, "n": len(iv)},
        "inputToDrawnMs": {"p50": pct(lat, 50), "p95": pct(lat, 95), "max": round(max(lat), 1) if lat else None},
        "inputToNextFrameMs": {"p50": pct(nxt, 50), "p95": pct(nxt, 95)},
        "planDrawMs": {"p50": pct(dr, 50), "p95": pct(dr, 95), "max": round(max(dr), 1) if dr else None, "n": len(dr), "kinds": kinds},
        "overlayDrawMs": {"p50": pct(ov, 50), "p95": pct(ov, 95), "n": len(ov)},
        "brushHandlerMs": {"p50": pct([q["dt"] for q in R["brush"]], 50), "p95": pct([q["dt"] for q in R["brush"]], 95), "max": max([q["dt"] for q in R["brush"]] or [0]), "n": len(R["brush"])},
        "longTasksWhileHeld": {"n": len(longs_hold), "ge100": len([l for l in longs_hold if l[1] >= 100]), "max": max([l[1] for l in longs_hold] or [0]), "list": longs_hold[:20]},
        "longTasksAfterRelease": {"n": len(longs_after), "max": max([l[1] for l in longs_after] or [0]), "list": longs_after[:10]},
        "stagedWhileHeld": held_frames, "stagedDistinctFramesHeld": len(set(s for s in staged_seq if s > 0)),
        "release": R["last"], "harnessStrokeS": round(t1 - t0, 2), "releaseCallS": round(t2 - t1, 2), "plantsAfter": R["plants"], "noLongtask": R["noLongtask"], "profileWhileHeld": prof,
    }
    print(json.dumps({k: out[k] for k in ("label", "scenario", "frameIntervalMs", "inputToDrawnMs", "planDrawMs", "brushHandlerMs", "longTasksWhileHeld", "stagedWhileHeld", "release")}), flush=True)
    out["raw"] = {"frames": fr, "inputs": ins, "draws": R["draws"], "long": R["long"], "brush": R["brush"]}
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--serve", default=ROOT); ap.add_argument("--label", required=True); ap.add_argument("--gpu", action="store_true")
    ap.add_argument("--scenario", default="both"); ap.add_argument("--port", type=int, default=8799); ap.add_argument("--profile", action="store_true"); a = ap.parse_args()
    global PROFILE; PROFILE = a.profile
    if a.gpu:
        flow_e2e_launch = flow_e2e.launch
        import functools, tempfile, threading, urllib.request  # noqa: E401
        from http.server import ThreadingHTTPServer
        import flow_server
        from cdp import WS
        tmp = tempfile.mkdtemp(); os.symlink(os.path.abspath(a.serve), os.path.join(tmp, "Generative-Planting"))
        srv = ThreadingHTTPServer(("127.0.0.1", a.port), functools.partial(flow_server.Handler, directory=tmp)); threading.Thread(target=srv.serve_forever, daemon=True).start()
        prof = tempfile.mkdtemp(); dport = 9371
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
        base = f"http://127.0.0.1:{a.port}/Generative-Planting/"; del flow_e2e_launch
    else:
        P, chrome, srv, base = flow_e2e.launch(a.serve, a.port, 9372)
    renderer = None
    try:
        P("Page.navigate", url="about:blank"); time.sleep(0.3)
        renderer = P.js("(() => { const g = document.createElement('canvas').getContext('webgl'); const d = g && g.getExtension('WEBGL_debug_renderer_info'); return g ? g.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : g.RENDERER) : 'no webgl'; })()")
        runs = []
        for sc in (["blank", "large"] if a.scenario == "both" else [a.scenario]): runs.append(run(P, base, sc, a.label))
        dev = {"machine": subprocess.run(["sysctl", "-n", "hw.model"], capture_output=True, text=True).stdout.strip(), "cpu": subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"], capture_output=True, text=True).stdout.strip(),
               "os": "macOS " + platform.mac_ver()[0], "chrome": subprocess.run([flow_e2e.CHROME, "--version"], capture_output=True, text=True).stdout.strip(), "renderer": renderer, "headless": True, "viewport": "1440x900 @1x", "gpu": a.gpu}
        os.makedirs(os.path.join(ROOT, "docs", "qa", "perf"), exist_ok=True)
        path = os.path.join(ROOT, "docs", "qa", "perf", f"{a.label}{'-gpu' if a.gpu else '-swiftshader'}.json")
        json.dump({"device": dev, "at": time.strftime("%Y-%m-%d %H:%M:%S"), "runs": runs}, open(path, "w"), indent=1); print("->", os.path.relpath(path, ROOT))
    finally:
        chrome.terminate(); srv.shutdown()


if __name__ == "__main__":
    main()
