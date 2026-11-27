#!/usr/bin/env python3
"""Fetch and verify the external Phase 02A sources (network; run rarely, output is committed).

  python3 -I tools/knowledge/fetch_sources.py

1. Robertson, C. (1929) "Flowers and insects" as digitised by S.E. Miller (2015) and indexed by GloBI
   (github.com/millerse/Flowers-and-insects-...). The whole interactions.tsv is downloaded, hashed, and only the rows
   whose plant name matches a plant the knowledge base already holds (the ten planting-db plants and the species-level
   names of the Detroit spatial model) are kept in sources/knowledge/robertson_1929_subset.tsv, unchanged.
2. Metro Vancouver water pages: every `quote` in sources/knowledge/metro_vancouver_water.json must occur in the page
   text as fetched today; the result is written to the fetch log. A quote that is not found fails the run.
Standard library + curl only.
"""
import csv, hashlib, html, io, json, os, re, subprocess, sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "sources", "knowledge")
ROBERTSON_URL = ("https://raw.githubusercontent.com/millerse/Flowers-and-insects-lists-of-visitors-to-four-hundred-and-fifty-three-flowers/"
                 "master/interactions.tsv")
PDB_PLANTS = ["Acer palmatum", "Cercidiphyllum japonicum", "Cornus nuttallii", "Cornus sericea", "Gaultheria shallon", "Vaccinium ovatum",
              "Arctostaphylos uva-ursi", "Polystichum munitum", "Achillea millefolium", "Gaillardia aristata"]


def curl(url):
    p = subprocess.run(["curl", "-s", "-L", "-m", "60", "-A", "Mozilla/5.0 (knowledge-canvas source check)", url], capture_output=True)
    if p.returncode: raise SystemExit(f"fetch failed: {url}")
    return p.stdout


def page_text(raw):
    t = raw.decode("utf-8", "ignore")
    t = re.sub(r"(?is)<(script|style).*?</\1>", " ", t); t = re.sub(r"<[^>]+>", " ", t)
    return html.unescape(re.sub(r"\s+", " ", t)).replace("​", "")


def detroit_names():
    m = json.load(open(os.path.join(ROOT, "data", "detroit", "model.json"), encoding="utf-8"))
    names = set()
    for s in m["species"]:
        key = s.get("canonicalKey") or s["scientificName"]
        names.add(re.sub(r"\s*'.*$", "", key).strip())     # species part of a cultivar name; the row keeps its own name
    return names


def main():
    log = {"fetched": date.today().isoformat(), "robertson": {}, "water": []}
    raw = curl(ROBERTSON_URL)
    log["robertson"] = {"url": ROBERTSON_URL, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8")), delimiter="\t"))
    keep_names = set(PDB_PLANTS) | detroit_names()
    kept = [r for r in rows if r["sourceTaxonName"] in keep_names]
    log["robertson"].update({"rows_total": len(rows), "plants_total": len({r['sourceTaxonName'] for r in rows}),
                             "rows_kept": len(kept), "plants_kept": sorted({r["sourceTaxonName"] for r in kept}),
                             "filter": "sourceTaxonName equals a planting-db plant or the species part of a Detroit model species name"})
    with open(os.path.join(OUT, "robertson_1929_subset.tsv"), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), delimiter="\t", lineterminator="\n")
        w.writeheader(); w.writerows(kept)
    water = json.load(open(os.path.join(OUT, "metro_vancouver_water.json"), encoding="utf-8"))
    pages = {s["id"]: page_text(curl(s["url"])) for s in water["sources"]}
    bad = 0
    for st in water["statements"]:
        ok = st["quote"] in pages[st["source"]]
        bad += not ok
        log["water"].append({"id": st["id"], "source": st["source"], "quote_found": ok})
    json.dump(log, open(os.path.join(OUT, "fetch_log.json"), "w"), indent=1)
    print(json.dumps(log["robertson"], indent=1)[:600]); print(f"water quotes found: {len(log['water']) - bad}/{len(log['water'])}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
