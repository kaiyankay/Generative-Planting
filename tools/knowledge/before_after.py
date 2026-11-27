#!/usr/bin/env python3
"""Before / after sheets: the Phase 02A screen (docs/screenshots/knowledge/) next to the Phase 02A.1 screen
(docs/screenshots/knowledge-02a1/) for the same task. Images are the real screenshots, scaled; only the captions are added.

  python3 -I tools/knowledge/before_after.py
"""
import os
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OLD = os.path.join(ROOT, "docs", "screenshots", "knowledge"); NEW = os.path.join(ROOT, "docs", "screenshots", "knowledge-02a1")
OUT = os.path.join(NEW, "before-after"); os.makedirs(OUT, exist_ok=True)
PAIRS = [
    ("a-default", "01-overview-base", "01-workspace-default", "Default view",
     "02A: one force graph of every node type, database-style toolbar (Graph · Matrix · Table · Base/Mine), counts pill.",
     "02A.1: collections on the left; Plant Library network with the illustrations; links only through shared records; groups as areas; common ground folded."),
    ("b-explore", "02-kinnikinnick-graph-inspector", "03-connections-yarrow", "Exploring one plant",
     "02A: radial neighbourhood of attributes only; inspector overlays the graph.",
     "02A.1: Connections across collections (recipe via cultivar, research lead, survey, local sources, places); inspector narrows the canvas."),
    ("c-compare", "09-matrix-water-cell", "08-library-compare", "Comparing plants",
     "02A: matrix cells hold raw text values and status dots.",
     "02A.1: each column is a small chart with a meaning — height bars by source, light, water scale, months, counts."),
    ("d-revision", "08-revision-inspector", "20-revision-vs", "Editing preset knowledge",
     "02A: the revision copied St. Louis context, MOBOT as source and kind “attribute”.",
     "02A.1: Preset struck through against my version; source “me”, my place, kind observation; original restorable."),
    ("e-mine", "10-table-mine", "24-personal", "What my knowledge changed",
     "02A: a record table filtered to “Mine”; added plants missing; ids and hashes in the way.",
     "02A.1: Personal knowledge per plant — added, my versions against originals, lists with unlinked rows — plus history with undo."),
    ("f-list", "12-list-in-graph", "23-add-list", "Importing a list",
     "02A: duplicate memberships (Achillea + Yarrow), “irrigation” became a record, title from the file name.",
     "02A.1: one membership per plant (rows kept), unlinked rows not counted, title and source asked before import."),
]


def font(sz, bold=False):
    for p in ["/System/Library/Fonts/HelveticaNeue.ttc", "/System/Library/Fonts/Helvetica.ttc"]:
        try: return ImageFont.truetype(p, sz, index=1 if bold else 0)
        except Exception: pass
    return ImageFont.load_default()


def wrap(d, text, f, w):
    lines, cur = [], ""
    for word in text.split():
        t = (cur + " " + word).strip()
        if d.textlength(t, font=f) > w and cur: lines.append(cur); cur = word
        else: cur = t
    return lines + [cur] if cur else lines


def main():
    W = 1440; pw = 700; ph = int(pw * 1800 / 2880); pad = 14
    for key, old, new, title, cap_old, cap_new in PAIRS:
        im = Image.new("RGB", (W, ph + 170), "white"); d = ImageDraw.Draw(im)
        d.text((pad, 14), title, fill="#252A25", font=font(26, True))
        for i, (f, lab, cap) in enumerate([(old, "Before · Phase 02A", cap_old), (new, "After · Phase 02A.1", cap_new)]):
            x = pad + i * (pw + 12); src = Image.open(os.path.join(OLD if i == 0 else NEW, f + ".png")).convert("RGB").resize((pw, ph), Image.LANCZOS)
            im.paste(src, (x, 56)); d.rectangle([x, 56, x + pw - 1, 56 + ph - 1], outline="#C9CEC8")
            d.text((x, 56 + ph + 10), lab, fill="#96512E" if i else "#7F877F", font=font(15, True))
            for j, line in enumerate(wrap(d, cap, font(14), pw)): d.text((x, 56 + ph + 32 + j * 19), line, fill="#4C534C", font=font(14))
        im.save(os.path.join(OUT, f"{key}.png")); print(key)


if __name__ == "__main__":
    main()
