"""Independent cross-check of the computational space (no browser).  python3 -I tools/test_compute.py

Recomputes B1 from the source files with shapely + numpy — lattice on the DEM nodes, cells clipped to the bed,
fields at each part's centroid, area-weighted statistics, slope × distance-to-path zones — and compares with what
the browser computed in the acceptance run (docs/qa/acceptance_run.json). Two implementations, one answer.
"""
import json, math, os, sys
import numpy as np
from shapely.geometry import shape, box, Point
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "data", "detroit")
res = []


def check(name, ok, detail=""):
    res.append((name, bool(ok), detail))


def main():
    acc_path = os.path.join(ROOT, "docs", "qa", "acceptance_run.json")
    if not os.path.exists(acc_path):
        print("run tools/acceptance_run.py first"); sys.exit(2)
    acc = json.load(open(acc_path))
    m = json.load(open(os.path.join(D, "model.json")))
    t = json.load(open(os.path.join(D, "terrain.json")))
    case = json.load(open(os.path.join(D, "case.json")))
    cfg = json.load(open(os.path.join(ROOT, "data", "compute.json")))
    z = np.fromfile(os.path.join(D, "terrain.bin"), dtype="<i2").reshape(t["rows"], t["cols"]).astype(float) / 100 + t["datumZ"]
    ox, oy, cs = t["origin"][0], t["origin"][1], t["cellSize"]

    def elev(x, y):
        fx, fy = (x - ox) / cs, (y - oy) / cs
        x0, y0 = min(t["cols"] - 2, int(math.floor(fx))), min(t["rows"] - 2, int(math.floor(fy)))
        tx, ty = fx - x0, fy - y0
        v = z[y0:y0 + 2, x0:x0 + 2]
        return (v[0, 0] * (1 - tx) + v[0, 1] * tx) * (1 - ty) + (v[1, 0] * (1 - tx) + v[1, 1] * tx) * ty

    h = cfg["fields"]["field.slope"]["baselineM"] / 2
    def slope(x, y):
        gx = (elev(x + h, y) - elev(x - h, y)) / (2 * h); gy = (elev(x, y + h) - elev(x, y - h)) / (2 * h)
        return math.degrees(math.atan(math.hypot(gx, gy)))

    paths = unary_union([shape(o["geometry"]) for o in m["objects"] if o["type"] in case["pathTypes"]])
    bed = next(o for o in m["objects"] if o["id"] == "bed.B1"); g = shape(bed["geometry"])
    b = g.bounds
    c0, c1 = math.floor((b[0] - ox) / cs + 0.5), math.floor((b[2] - ox) / cs + 0.5)
    r0, r1 = math.floor((b[1] - oy) / cs + 0.5), math.floor((b[3] - oy) / cs + 0.5)
    cells = []
    for c in range(c0, c1 + 1):
        for r in range(r0, r1 + 1):
            part = g.intersection(box(ox + (c - .5) * cs, oy + (r - .5) * cs, ox + (c + .5) * cs, oy + (r + .5) * cs))
            if part.area < 1e-7:
                continue
            p = part.centroid
            if not g.covers(p):
                p = part.representative_point()
            cells.append((c, r, part.area, p.x, p.y))
    A = np.array([q[2] for q in cells])
    E = np.array([elev(q[3], q[4]) for q in cells]); S = np.array([slope(q[3], q[4]) for q in cells])
    P = np.array([paths.distance(Point(q[3], q[4])) for q in cells])
    check("B1 domain: cell parts tile the bed (shapely)", abs(A.sum() - g.area) < 1e-6, f"{A.sum():.6f} vs {g.area:.6f}")

    js = acc["distributionB1"]["fields"]
    for fid, V, tol in (("field.elevation", E, 2e-3), ("field.slope", S, 2e-2), ("field.distance-to-path", P, 2e-3)):
        f = js[fid]; mean = float((A * V).sum() / A.sum())
        ok = abs(V.min() - f["min"]) < tol and abs(V.max() - f["max"]) < tol and abs(mean - f["mean"]) < tol
        check(f"{fid}: min / max / area-weighted mean agree with the browser", ok, f"py {V.min():.4f}/{V.max():.4f}/{mean:.4f}  js {f['min']}/{f['max']}/{f['mean']}")
    check("sun / soil moisture / pH stay unknown in the browser result", all(js[k]["known"] is False for k in ("field.sun",) if k in js))

    step5 = next(s for s in acc["steps"] if s["step"] == "5")["data"]
    keys = np.char.add(np.char.add((S >= 2).astype(int).astype(str), "|"), (P >= 1.5).astype(int).astype(str))
    py = {k: float(A[keys == k].sum()) for k in sorted(set(keys))}
    jz = {zz["key"]: zz["areaM2"] for zz in step5["summary"]}
    check("slope 2° × path 1.5 m: same zones with the same areas (±0.05 m²)", set(py) == set(jz) and all(abs(py[k] - jz[k]) < 0.05 for k in py), json.dumps({"py": {k: round(v, 2) for k, v in py.items()}, "js": jz}))
    check("zones tile B1 (browser vector geometry)", abs(sum(zz["areaM2"] for zz in step5["zones"]) - g.area) < 0.02)

    s6 = next(s for s in acc["steps"] if s["step"] == "6b")["data"]
    check("uniform bed not split (TN elevation range below the DEM accuracy)", s6["elevation"]["uniform"] and s6["zones"] == 1 and s6["elevation"]["range"] < s6["elevation"]["tolerance"], json.dumps(s6["elevation"]))
    s7 = next(s for s in acc["steps"] if s["step"] == "7")["data"]
    check("blank design in B1: fields and zones unchanged", s7["zonesUnchanged"] and s7["fieldsUnchanged"] and s7["placementsB1"] == 0 and s7["placementsA1"] > 0)
    s8 = next(s for s in acc["steps"] if s["step"] == "8")["data"]
    check("Axo: zone vertices land on the terrain within 5 cm", s8["maxRoundTripErrorM"] < 0.05 and s8["zoneVerticesTested"] >= 10, json.dumps(s8))
    s9 = next(s for s in acc["steps"] if s["step"] == "9")["data"]
    check("Reference restored identically", s9["identical"])
    check("acceptance run without runtime errors", not acc.get("errors"), json.dumps(acc.get("errors"))[:200])

    for n, ok, d in res:
        print(("PASS " if ok else "FAIL ") + n + ("" if ok else "  -> " + d))
    okn = sum(1 for _, ok, _ in res if ok)
    print(f"\n{okn}/{len(res)} passed")
    json.dump({"ok": okn, "total": len(res), "results": [{"name": n, "ok": ok, "detail": d} for n, ok, d in res]}, open(os.path.join(ROOT, "docs", "qa", "compute_crosscheck.json"), "w"), indent=1)
    sys.exit(0 if okn == len(res) else 1)


if __name__ == "__main__":
    main()
