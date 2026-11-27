"""Build data/<site>/design-library.json: site-specific plant attributes the design engine may use, each with its source.

python3 -I tools/build_design_library.py --private /path/to/private-inputs

Detroit, today: the hydrology zone printed for every species on the official East / West Meadow plant lists
(Oudolf Garden Detroit, February 2026, source S-OGD-MEADOW). The zone is a species attribute on the list; the lists do
not map where those zones are on site (that stays unknown in the model). Only facts (species name -> printed zone) are
stored; the PDFs stay in the git-ignored private-inputs folder.

The zone is kept as printed and mapped to three ordered classes the engine can compare with a field:
  wet   <- "Obligate wet 10cm"
  moist <- "Facultative wet 5cm", "Obligate wet/Fac. wet" (printed as both; kept as moist-to-wet, see `range`)
  dry   <- "Facult. upland/Upland", "Upland"
"""
import argparse, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZONES = {
    "Obligate wet 10cm": ("wet", ["wet"]),
    "Facultative wet 5cm": ("moist", ["moist"]),
    "Obligate wet/Fac. wet": ("moist", ["moist", "wet"]),
    "Facult. upland/Upland": ("dry", ["dry"]),
    "Upland": ("dry", ["dry"]),
}


def read_list(path):
    import pymupdf  # only needed when rebuilding from the PDFs
    doc = pymupdf.open(path)
    lines = [l.strip() for p in doc for l in p.get_text().split("\n") if l.strip()]
    out = {}
    i = 0
    while i < len(lines):
        if lines[i] in ZONES and i >= 2:
            name = lines[i - 2].rstrip("*").strip()
            out[name] = lines[i]
        i += 1
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--private", required=True, help="private-inputs folder that holds web/OudolfGardenDetroit_*_Meadow_Plants_List.pdf")
    ap.add_argument("--site", default="detroit")
    a = ap.parse_args()
    model = json.load(open(os.path.join(ROOT, "data", a.site, "model.json")))
    by_name = {}
    for s in model["species"]:
        if s.get("cultivar"):
            continue  # a printed species zone is never given to a cultivar (cultivars are not synonyms)
        by_name.setdefault(s["scientificName"], []).append(s["id"])
    lists = {
        "west": read_list(os.path.join(a.private, "web", "OudolfGardenDetroit_West_Meadow_Plants_List.pdf")),
        "east": read_list(os.path.join(a.private, "web", "OudolfGardenDetroit_East_Meadow_Plants_List.pdf")),
    }
    species = {}
    unmatched = []
    conflicts = []
    for lst, rows in lists.items():
        for name, printed in rows.items():
            ids = by_name.get(name)
            if not ids:
                unmatched.append({"name": name, "list": lst, "printed": printed})
                continue
            cls, rng = ZONES[printed]
            order = ["dry", "moist", "wet"]
            for sid in ids:
                rec = species.setdefault(sid, {"scientificName": name, "hydrology": {"class": cls, "range": list(rng), "printedByList": {}, "sourceRef": "S-OGD-MEADOW"}})
                h = rec["hydrology"]
                if h["printedByList"] and printed not in h["printedByList"].values():
                    conflicts.append({"speciesId": sid, "printed": {**h["printedByList"], lst: printed}})
                    h["range"] = sorted(set(h["range"]) | set(rng), key=order.index)
                    h["class"] = None  # the two lists disagree: the species carries the range of both, no single class
                    h["note"] = "East and West lists print different zones; both are kept."
                h["printedByList"][lst] = printed
    out = {
        "schema": "generative-planting/design-library", "version": "0.1", "site": a.site,
        "place": "place:detroit",
        "note": "Site-specific plant attributes with their source. Hydrology zone = the zone printed for the species on the official 2026 East / West Meadow lists (S-OGD-MEADOW). It is a species attribute; where these zones are on site is not published (field.moisture stays unknown). Cultivars never receive a species' zone.",
        "classes": {"hydrology": [{"id": "dry", "label": "Upland (dry)", "order": 0}, {"id": "moist", "label": "Facultative wet (moist)", "order": 1}, {"id": "wet", "label": "Obligate wet", "order": 2}]},
        "species": dict(sorted(species.items())),
        "unmatched": unmatched, "conflicts": conflicts,
    }
    dst = os.path.join(ROOT, "data", a.site, "design-library.json")
    json.dump(out, open(dst, "w"), indent=1, ensure_ascii=False)
    print(f"{len(species)} species with a printed hydrology zone; {len(unmatched)} names not in the model; {len(conflicts)} conflicts -> {dst}")


if __name__ == "__main__":
    sys.exit(main())
