"""Continuous record of the design iteration: an animated GIF and a contact sheet from the e2e screenshots.

python3 -I tools/make_flow_sheet.py [--shots docs/screenshots/integrated] [--log docs/qa/design_e2e.json]

Reads the screenshot list (in run order) from the e2e JSON, writes flow.gif (one frame per step, caption burnt in)
and flow-sheet.jpg next to the screenshots. Needs Pillow.
"""
import argparse, json, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def font(size):
    for f in ("/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/Supplemental/Arial.ttf"):
        if os.path.exists(f):
            try: return ImageFont.truetype(f, size)
            except Exception: pass
    return ImageFont.load_default()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots", default=os.path.join(ROOT, "docs", "screenshots", "integrated"))
    ap.add_argument("--log", default=os.path.join(ROOT, "docs", "qa", "design_e2e.json"))
    ap.add_argument("--skip", default="", help="comma-separated screenshot name prefixes to leave out (e.g. E01 for a public copy)")
    a = ap.parse_args()
    log = json.load(open(a.log))
    skip = [k for k in a.skip.split(",") if k]
    shots = [s for s in log.get("shots", []) if os.path.exists(os.path.join(ROOT, s["file"])) and not any(os.path.basename(s["file"]).startswith(k) for k in skip)]
    frames = []; f = font(22)
    for k, s in enumerate(shots):
        im = Image.open(os.path.join(ROOT, s["file"])).convert("RGB")
        im = im.resize((960, int(im.height * 960 / im.width)))
        d = ImageDraw.Draw(im); cap = f"{k + 1}/{len(shots)}  {s['caption']}"
        lines, cur = [], ""
        for w in cap.split(" "):
            if d.textlength(cur + " " + w, font=font(15)) > 920: lines.append(cur); cur = w
            else: cur = (cur + " " + w).strip()
        lines.append(cur)
        h = 12 + 20 * len(lines); d.rectangle([0, im.height - h, im.width, im.height], fill=(51, 67, 58))
        for i, ln in enumerate(lines): d.text((14, im.height - h + 6 + 20 * i), ln, fill=(245, 241, 232), font=font(15))
        frames.append(im)
    if not frames: print("no screenshots"); return
    gif = os.path.join(a.shots, "flow.gif")
    frames[0].save(gif, save_all=True, append_images=frames[1:], duration=2600, loop=0, optimize=True)
    cols = 3; tw = 480; th = int(frames[0].height * tw / frames[0].width); rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw + (cols + 1) * 8, rows * th + (rows + 1) * 8), (238, 233, 221))
    for i, im in enumerate(frames): sheet.paste(im.resize((tw, th)), (8 + (i % cols) * (tw + 8), 8 + (i // cols) * (th + 8)))
    sheet.save(os.path.join(a.shots, "flow-sheet.jpg"), quality=85)
    print(f"{len(frames)} frames -> {os.path.relpath(gif, ROOT)}, flow-sheet.jpg")


if __name__ == "__main__":
    main()
