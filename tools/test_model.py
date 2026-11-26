"""Model contract tests (no browser).  python3 -I tools/test_model.py

Checks: 15 main beds + codes, references, geometry validity, instances inside legal areas,
unknown fields stay null, deterministic rebuild (seed stability).
"""
import hashlib, json, os, struct, subprocess, sys, tempfile, shutil
from collections import Counter
from shapely.geometry import shape, Point
from shapely.prepared import prep

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "data", "detroit")
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))


def main():
    m = json.load(open(os.path.join(D, "model.json")))
    objs = {o["id"]: o for o in m["objects"]}
    pls = {p["id"]: p for p in m["placements"]}
    sps = {s["id"]: s for s in m["species"]}
    layers = {l["id"]: l for l in m["layers"]}
    srcs = {s["id"] for s in m["sources"]}
    recs = {r["id"] for r in m["recipes"]}

    # ---- beds
    beds = [o for o in m["objects"] if o["type"] == "bed"]
    main_beds = [b for b in beds if b["props"]["style"] in ("A", "B", "C")]
    check("15 main beds", len(main_beds) == 15, f"found {len(main_beds)}")
    st = Counter(b["props"]["style"] for b in main_beds)
    check("style split A5 B6 C4", st == Counter({"A": 5, "B": 6, "C": 4}), str(dict(st)))
    check("unique bed ids", len({b["id"] for b in beds}) == len(beds))
    codes = Counter(b["props"]["originalCode"] for b in main_beds)
    expect = Counter({"A1": 1, "A2": 1, "A3": 2, "A4": 1, "B1": 1, "B2": 1, "B3": 2, "B4": 1, "B5": 1, "C1": 1, "C2": 1, "C3": 1, "C4": 1})
    check("original codes match Oudolf 2020 bulb plans", codes == expect, str(dict(codes)))
    tri = [b for b in beds if b["props"]["style"] == "T"]
    check("triangles modelled separately, not in the 15", len(tri) == 2 and all(b["props"].get("countsTowardFifteen") is False for b in tri))

    # ---- references
    bad = []
    for o in m["objects"]:
        if o.get("parent") and o["parent"] not in objs: bad.append((o["id"], "parent", o["parent"]))
        if o.get("layer") not in layers: bad.append((o["id"], "layer", o.get("layer")))
        for s in o.get("sourceRefs", []):
            if s not in srcs: bad.append((o["id"], "source", s))
        if o.get("geometryRef") and o["geometryRef"] not in objs and not o["geometryRef"].startswith("bed outlines"): bad.append((o["id"], "geometryRef", o["geometryRef"]))
        sid = (o.get("props") or {}).get("speciesId")
        if sid and sid not in sps: bad.append((o["id"], "species", sid))
    for p in m["placements"]:
        if p.get("bedId") and p["bedId"] not in objs: bad.append((p["id"], "bed", p["bedId"]))
        if p.get("recipeId") not in recs: bad.append((p["id"], "recipe", p.get("recipeId")))
        for s in p.get("speciesIds", []):
            if s not in sps: bad.append((p["id"], "species", s))
        for s in p.get("sourceRefs", []):
            if s not in srcs: bad.append((p["id"], "source", s))
        if p.get("geometryRef") and p["geometryRef"] not in objs: bad.append((p["id"], "geometryRef", p["geometryRef"]))
        if not p.get("geometry") and not p.get("geometryRef"): bad.append((p["id"], "geometry", None))
    for l in m["layers"]:
        if l["parent"] and l["parent"] not in layers: bad.append((l["id"], "layer parent", l["parent"]))
    check("all references resolve", not bad, str(bad[:5]))
    check("placement ids unique", len(pls) == len(m["placements"]))
    check("placement index == position", all(p["index"] == i for i, p in enumerate(m["placements"])))
    check("species index unique", len({s["index"] for s in m["species"]}) == len(m["species"]))

    # ---- statuses
    allowed = {"documented", "reconstructed", "schematic", "unknown"}
    kinds = {"source", "inferred", "hypothetical", None}
    st_bad = [o["id"] for o in m["objects"] + m["placements"] if o.get("status") not in allowed or o.get("dataKind") not in kinds]
    check("status/dataKind vocabulary", not st_bad, str(st_bad[:5]))
    check("generated placements never claim 'documented' positions",
          all(p["status"] != "documented" or p.get("geometryRef") for p in m["placements"] if p.get("positionSource") == "generated-schematic"))

    # ---- geometry validity + extent
    E = m["project"]["coordinateSystem"]["extent"]
    inval = []
    for o in m["objects"] + m["placements"]:
        g = o.get("geometry")
        if not g: continue
        sh = shape(g)
        if not sh.is_valid: inval.append(o["id"])
        b = sh.bounds
        if b[0] < E["xmin"] - 1 or b[2] > E["xmax"] + 1 or b[1] < E["ymin"] - 1 or b[3] > E["ymax"] + 1: inval.append(o["id"] + "(extent)")
    check("geometries valid and inside extent", not inval, str(inval[:5]))
    # beds must not overlap each other
    bshapes = [(b["id"], shape(b["geometry"])) for b in main_beds + tri]
    ov = [(a, c) for i, (a, A) in enumerate(bshapes) for (c, Cc) in bshapes[i + 1:] if A.intersection(Cc).area > 0.05]
    check("main beds do not overlap", not ov, str(ov[:3]))

    # ---- instances inside legal areas
    buf = open(os.path.join(D, "instances.bin"), "rb").read()
    n = len(buf) // 16
    check("instance count matches header", n == m["instances"]["count"], f"{n} vs {m['instances']['count']}")
    bysp = {s["index"]: s for s in m["species"]}
    plist = m["placements"]
    preps = {}
    outside = []
    for i in range(n):
        x, y, si, pi, sc, rot, _ = struct.unpack_from("<ffHHBBH", buf, i * 16)
        if pi == 65535: continue
        p = plist[pi]
        bed = objs.get(p.get("bedId")) if p.get("bedId") else None
        g = bed["geometry"] if bed else (objs[p["districtId"]]["geometry"] if p.get("districtId") else None)
        if not g: continue
        k = (bed or {}).get("id") or p.get("districtId")
        if k not in preps: preps[k] = prep(shape(g).buffer(0.05))
        if not preps[k].contains(Point(x, y)): outside.append((i, p["id"]))
    check("every plant instance lies inside its bed / district", not outside, f"{len(outside)} outside e.g. {outside[:3]}")
    # instance ranges
    rng_bad = [p["id"] for p in plist if "instanceRange" in p and p["instanceRange"][1] != p.get("countModelled")]
    check("placement instanceRange == countModelled", not rng_bad, str(rng_bad[:5]))

    # ---- unknown fields stay unknown
    f = {x["id"]: x for x in m["fields"]}
    check("sun / moisture / pH are unknown, not zero", all(f[k]["status"] == "unknown" for k in ("field.sun", "field.moisture", "field.ph")))
    check("unknown layers flagged unavailable and hidden", all((not layers[k]["visible"]) and layers[k]["status"] == "unavailable" for k in ("analysis.sun", "analysis.moisture", "analysis.ph")))
    terr = f["field.elevation"]
    tb = open(os.path.join(D, "terrain.bin"), "rb").read()
    check("terrain grid size", len(tb) == terr["cols"] * terr["rows"] * 2)

    # ---- layer registry
    need = {"site", "topo", "built", "structure", "veg", "analysis"}
    check("layer groups present", need <= set(layers))
    check("visibility, lock and selectable are independent fields", all({"visible", "locked", "selectable"} <= set(l) for l in m["layers"]))

    # ---- seed stability: rebuild into a temp copy and compare bytes
    tmp = tempfile.mkdtemp()
    try:
        shutil.copytree(os.path.join(ROOT, "tools"), os.path.join(tmp, "tools"), ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copytree(os.path.join(ROOT, "sources"), os.path.join(tmp, "sources"))
        os.makedirs(os.path.join(tmp, "data", "detroit"))
        shutil.copy(os.path.join(D, "terrain.json"), os.path.join(tmp, "data", "detroit"))
        subprocess.run([sys.executable, "-I", os.path.join(tmp, "tools", "build_model.py")], check=True, capture_output=True)
        h1 = hashlib.sha256(buf).hexdigest()
        h2 = hashlib.sha256(open(os.path.join(tmp, "data", "detroit", "instances.bin"), "rb").read()).hexdigest()
        m2 = open(os.path.join(tmp, "data", "detroit", "model.json"), "rb").read()
        check("rebuild is deterministic (instances.bin)", h1 == h2, f"{h1[:12]} vs {h2[:12]}")
        check("rebuild is deterministic (model.json)", hashlib.sha256(m2).hexdigest() == hashlib.sha256(open(os.path.join(D, "model.json"), "rb").read()).hexdigest())
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # ---- coverage summary
    cover = {
        "objects": len(m["objects"]), "placements": len(m["placements"]), "instances": n, "species": len(m["species"]),
        "byStyle": dict(Counter(objs[p["bedId"]]["props"]["style"] for p in plist if p.get("bedId") in objs)),
        "byStatus": dict(Counter(o.get("status") for o in m["objects"])),
    }
    ok = sum(1 for r in results if r[1])
    for name, good, detail in results:
        print(("PASS " if good else "FAIL ") + name + ("" if good else "  -> " + detail))
    print(f"\n{ok}/{len(results)} passed")
    print(json.dumps(cover))
    json.dump({"passed": ok, "total": len(results), "results": [{"name": a, "ok": b, "detail": c} for a, b, c in results], "coverage": cover},
              open(os.path.join(ROOT, "docs", "qa", "model_tests.json"), "w"), indent=1)
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
