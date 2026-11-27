#!/usr/bin/env python3
"""Recording of one real Ask / Add session (Phase 02A.1 Part B) — headless Chrome against the knowledge server.

  python3 -I tools/knowledge/record_ask.py

Starts tools/knowledge/server.py's handler on a free port (so /api is real), opens the page with a throw-away test database and
performs the steps with the page's own elements: select a plant, "Ask about this", type, Retrieve, follow a record, go back,
write a note in the same box, save it, ask again on Combined and on Preset. Claude's state is whatever the server reports — on
this machine "not connected" — and no answer is shown because none exists. Writes docs/screenshots/knowledge-02b/NN-*.png,
index.json and ask-session.gif (frames from this session; the caption strip under each frame is added by this script).
"""
import json, os, sys, threading, time
from http.server import ThreadingHTTPServer
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE)); sys.path.insert(0, HERE)
from cdp import Chrome  # noqa: E402
import server as ks  # noqa: E402

OUT = os.path.join(ROOT, "docs", "screenshots", "knowledge-02b")
H = """
window.$ = s => document.querySelector(s); window.$$ = s => [...document.querySelectorAll(s)];
window.clk = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
window.typ = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
window.A = window.GPKApp; 0;
"""
Q = "Is Kinnikinnick suitable for a dry, sunny slope in Vancouver?"
NOTE = "Kinnikinnick sulked on our north slope; on the dry south bank in Vancouver it filled in by year three."
STEPS = [
    ("01-start", "Plant Library, Combined layer.", "", 0.4),
    ("02-select", "Select Kinnikinnick: the inspector opens.", "clk($$('#cbody .node.plant').find(g => g.dataset.ent === 'arctostaphylos-uva-ursi'))", 0.8),
    ("03-ask-open", "“Ask about this” opens Ask in the same column, with the plant as context.", "clk($('#insp [data-act=ask]'))", 0.6),
    ("04-type-a", "Type the question…", f"typ($('#adText'), {json.dumps(Q[:24])})", 0.3),
    ("05-type-b", "…", f"typ($('#adText'), {json.dumps(Q)}); $('#askPlace').value='place:vancouver'; $('#askPlace').dispatchEvent(new Event('change'))", 0.4),
    ("06-retrieve", "Retrieve: the knowledge in effect, no model. The server rebuilt the same version from this browser's events and returned the same records.", "clk($('[data-retrieve]'))", 1.4),
    ("07-not-connected", "Claude's state as the server reports it: not connected — SDK, credentials, authorisation. “Ask Claude” stays off; no answer is shown.", "$('#addp').scrollTop = 250", 0.4),
    ("08-follow", "A retrieved record locates the evidence: inspector and canvas, with a way back.", "$('#addp').scrollTop = 0; clk($('#askOut .ri'))", 0.8),
    ("09-back", "Back to the question: nothing was lost.", "clk($('#insp .backask'))", 0.6),
    ("10-add", "Same text box, Add: an observation in my own words.", f"clk($('[data-tab=add]')); typ($('#adText'), {json.dumps(NOTE)})", 0.8),
    ("11-save", "Saved as personal knowledge (◆). “Understand with Claude” needs a connection; the plain Save keeps the words as written.", "clk($('#adOut [data-save]'))", 0.8),
    ("12-ask-again", "Ask again on Combined: my note is retrieved beside the Preset records.", "A.openAsk({ sel: null }); typ($('#adText'), 'Kinnikinnick slope Vancouver'); clk($('[data-retrieve]'))", 1.4),
    ("13-preset", "Same question on the Preset layer: my note is not there — the server reads the Preset version too.", "A.setLayer('preset'); A.openAsk({ sel: null }); typ($('#adText'), 'Kinnikinnick slope Vancouver'); clk($('[data-retrieve]'))", 1.4),
]


def caption(img, text, n, total):
    from PIL import Image, ImageDraw, ImageFont
    w, h = img.size; bar = 54
    out = Image.new("RGB", (w, h + bar), (37, 42, 37)); out.paste(img, (0, 0))
    d = ImageDraw.Draw(out)
    try: f = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 17)
    except Exception: f = ImageFont.load_default()
    d.text((18, h + 17), f"{n}/{total}  {text}", fill=(255, 255, 255), font=f)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    class Hd(ks.Handler):
        def log_message(self, *a): pass
    srv = ThreadingHTTPServer(("127.0.0.1", 0), Hd); threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_address[1]}/knowledge/index.html?db=gp-knowledge-test-rec&fresh=1"
    index, frames = [], []
    with Chrome(width=1440, height=900, scale=1) as c:
        c.goto(url); c.wait_for("document.documentElement.dataset.ready === '1'", timeout=90); time.sleep(1.2)
        c.eval(H)
        for name, cap, js, wait in STEPS:
            if js: c.eval(f"(async () => {{ {js} }})()"); time.sleep(wait)
            if name not in ("11-save",): c.eval("document.getElementById('toast').hidden = true; 0")
            state = json.loads(c.eval("JSON.stringify({ layer: A.layer, tab: A.add.isOpen ? A.add.tab : null, sel: A.sel && (A.sel.id || A.sel.kind), events: A.kb.events.length, revision: A.kbv().activeRevision, retrieved: A.add.asker?.retr?.out.returnedRecordIds.length ?? null, serverSame: A.add.asker?.retr?.server?.same ?? null, claude: (document.querySelector('.conn b')||{}).textContent || null })"))
            p = os.path.join(OUT, name + ".png"); c.screenshot(p)
            index.append({"file": name + ".png", "caption": cap, "state": state}); frames.append((p, cap)); print(name, json.dumps(state))
    srv.shutdown()
    from PIL import Image
    imgs = []
    for i, (p, cap) in enumerate(frames, 1):
        im = Image.open(p).convert("RGB").resize((1152, 720), Image.LANCZOS)
        imgs.append(caption(im, cap, i, len(frames)).quantize(colors=128, method=Image.Quantize.MEDIANCUT))
    durs = [2600 if len(cap) > 60 else 1500 for _, cap in frames]; durs[-1] = 4000
    gif = os.path.join(OUT, "ask-session.gif")
    imgs[0].save(gif, save_all=True, append_images=imgs[1:], duration=durs, loop=0, optimize=True)
    json.dump({"about": "Phase 02A.1 Part B — one real Ask/Add session in headless Chrome against tools/knowledge/server.py (1440×900). Test database only. Claude: as reported by the server (not connected here); no model output appears.",
               "gif": "ask-session.gif", "shots": index}, open(os.path.join(OUT, "index.json"), "w"), indent=1, ensure_ascii=False)
    print("gif", os.path.getsize(gif) // 1024, "KB")


if __name__ == "__main__":
    main()
