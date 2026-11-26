"""Build the canonical spatial model for Oudolf Garden Detroit.

python3 -I tools/build_model.py            -> data/detroit/model.json + instances.bin

Every object carries: id, type, layer, parent, geometry (local metres, x east / y north),
sourceRefs, status (documented | reconstructed | schematic | unknown) and
dataKind (source | inferred | hypothetical).

The planting arrangement INSIDE each bed is generated deterministically (seeded) from the
documented structure of its planting style and the documented species of its legend; it is
NOT a tracing of Oudolf's drawings. Positions are visual proxies, not surveyed plants.
"""
import json, math, os, random, struct, sys, hashlib
sys.path.insert(0, os.path.dirname(__file__))
from shapely.geometry import Polygon, MultiPolygon, Point, LineString, box, mapping, shape
from shapely.ops import unary_union
from shapely import affinity
from geo import EXTENT, LAT0, LON0
from osm_extract import load, way_coords, join_rings
import curated_oudolf as C

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "detroit")
VERSION = "0.3.0"

# --------------------------------------------------------------------------- helpers

def rng(*parts):
    return random.Random("|".join(str(p) for p in parts))


def r3(v):
    return round(v, 3)


def ring(coords):
    c = [[r3(x), r3(y)] for x, y in coords]
    if c[0] != c[-1]:
        c.append(c[0])
    return c


def geo(g):
    """shapely -> GeoJSON-like dict (local metres)"""
    if g.is_empty:
        return None
    if g.geom_type in ("Polygon", "MultiPolygon"):
        import shapely
        g = shapely.set_precision(g if g.is_valid else g.buffer(0), 0.001)
        if g.is_empty:
            return None
    if g.geom_type == "Polygon":
        return {"type": "Polygon", "coordinates": [ring(g.exterior.coords)] + [ring(i.coords) for i in g.interiors]}
    if g.geom_type == "MultiPolygon":
        return {"type": "MultiPolygon",
                "coordinates": [[ring(p.exterior.coords)] + [ring(i.coords) for i in p.interiors] for p in g.geoms]}
    if g.geom_type == "LineString":
        return {"type": "LineString", "coordinates": [[r3(x), r3(y)] for x, y in g.coords]}
    if g.geom_type == "MultiLineString":
        return {"type": "MultiLineString", "coordinates": [[[r3(x), r3(y)] for x, y in l.coords] for l in g.geoms]}
    if g.geom_type == "Point":
        return {"type": "Point", "coordinates": [r3(g.x), r3(g.y)]}
    if g.geom_type == "GeometryCollection":
        polys = [p for p in g.geoms if p.geom_type in ("Polygon", "MultiPolygon")]
        return geo(unary_union(polys)) if polys else None
    raise ValueError(g.geom_type)


def poisson(poly, r, rnd, k=30, max_pts=100000, avoid=None):
    """Bridson-style Poisson-disc sampling inside polygon (deterministic)."""
    if poly is None or poly.is_empty or poly.area < 1e-6:
        return []
    want = max_pts
    max_pts = max_pts * 8 if max_pts < 100000 else max_pts  # grow over the whole area, then thin uniformly
    minx, miny, maxx, maxy = poly.bounds
    cell = r / math.sqrt(2)
    gw = int((maxx - minx) / cell) + 1
    gh = int((maxy - miny) / cell) + 1
    grid = {}
    pts = []
    active = []
    from shapely.prepared import prep
    pp = prep(poly)
    pav = prep(avoid) if avoid is not None and not avoid.is_empty else None

    def ok(x, y):
        if not pp.contains(Point(x, y)):
            return False
        if pav and pav.contains(Point(x, y)):
            return False
        gx, gy = int((x - minx) / cell), int((y - miny) / cell)
        for i in range(gx - 2, gx + 3):
            for j in range(gy - 2, gy + 3):
                q = grid.get((i, j))
                if q and (q[0] - x) ** 2 + (q[1] - y) ** 2 < r * r:
                    return False
        return True

    for _ in range(200):
        x, y = rnd.uniform(minx, maxx), rnd.uniform(miny, maxy)
        if ok(x, y):
            pts.append((x, y)); active.append((x, y)); grid[(int((x - minx) / cell), int((y - miny) / cell))] = (x, y)
            break
    while active and len(pts) < max_pts:
        i = rnd.randrange(len(active))
        ax, ay = active[i]
        found = False
        for _ in range(k):
            a = rnd.uniform(0, 2 * math.pi); d = rnd.uniform(r, 2 * r)
            x, y = ax + d * math.cos(a), ay + d * math.sin(a)
            if ok(x, y):
                pts.append((x, y)); active.append((x, y)); grid[(int((x - minx) / cell), int((y - miny) / cell))] = (x, y)
                found = True
                break
        if not found:
            active.pop(i)
        # restart seeds in disconnected parts
        if not active and len(pts) < max_pts:
            for _ in range(60):
                x, y = rnd.uniform(minx, maxx), rnd.uniform(miny, maxy)
                if ok(x, y):
                    pts.append((x, y)); active.append((x, y)); grid[(int((x - minx) / cell), int((y - miny) / cell))] = (x, y)
                    break
    if len(pts) > want:
        pts = rnd.sample(pts, want)
    return pts


def voronoi(poly, pts, reach):
    cells = []
    for i, (px, py) in enumerate(pts):
        c = poly
        for j, (qx, qy) in enumerate(pts):
            if i == j:
                continue
            dx, dy = qx - px, qy - py
            d = math.hypot(dx, dy)
            if d > reach or d == 0:
                continue
            nx, ny = dx / d, dy / d
            mx, my = (px + qx) / 2, (py + qy) / 2
            L = 200
            tx, ty = -ny, nx
            hp = Polygon([(mx + tx * L, my + ty * L), (mx - tx * L, my - ty * L),
                          (mx - tx * L - nx * L, my - ty * L - ny * L), (mx + tx * L - nx * L, my + ty * L - ny * L)])
            c = c.intersection(hp)
            if c.is_empty:
                break
        cells.append(c)
    return cells


def blob(cx, cy, rx, ry, rot, rnd, n=18, wob=0.12):
    pts = []
    ph = rnd.uniform(0, 6.28)
    for k in range(n):
        a = 2 * math.pi * k / n
        w = 1 + wob * math.sin(3 * a + ph) + wob * 0.5 * math.sin(5 * a + ph * 1.7)
        x, y = rx * w * math.cos(a), ry * w * math.sin(a)
        c, s = math.cos(rot), math.sin(rot)
        pts.append((cx + x * c - y * s, cy + x * s + y * c))
    return Polygon(pts)


def largest(g):
    if g.geom_type == "MultiPolygon":
        return max(g.geoms, key=lambda p: p.area)
    if g.geom_type == "GeometryCollection":
        ps = [p for p in g.geoms if p.geom_type == "Polygon"]
        return max(ps, key=lambda p: p.area) if ps else Polygon()
    return g


# --------------------------------------------------------------------------- sources

SOURCES = [
    {"id": "S-OSM", "title": "OpenStreetMap API 0.6 map extract (garden beds, paths, walls, roads, buildings, water)",
     "url": "https://www.openstreetmap.org/way/882942799", "accessed": "2026-11-26", "license": "ODbL-1.0",
     "attribution": "© OpenStreetMap contributors", "public": True,
     "use": "Authoritative vector geometry of the 15 main beds, 2 triangle beds, Rain Garden outline, gravel and grass walks, retaining walls, roads, Carillon, moat, Lake Tacoma."},
    {"id": "S-NAIP", "title": "USGS NAIP Imagery (The National Map), ~0.6 m natural colour", "url": "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer",
     "accessed": "2026-11-26", "license": "US public domain", "attribution": "USGS, USDA, The National Map: Orthoimagery", "public": True,
     "use": "Registration check of OSM geometry; digitising existing tree crowns; optional underlay. Acquisition year not exposed by the service (shows the garden planted, pre-meadow)."},
    {"id": "S-3DEP", "title": "USGS 3D Elevation Program (3DEP) dynamic elevation, 1 m", "url": "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer",
     "accessed": "2026-11-26", "license": "US public domain", "attribution": "USGS 3D Elevation Program", "public": True,
     "use": "Site-scale terrain (NAVD88 m). Not a survey of bed micro-topography."},
    {"id": "S-OGD-OVERVIEW", "title": "Oudolf Garden Detroit — Garden Overview (area/variety/plant statistics)", "url": "https://oudolfgardendetroit.org/garden-overview/",
     "accessed": "2026-11-26", "license": "© Oudolf Garden Detroit — facts cited, text not copied", "public": False},
    {"id": "S-OGD-MAIN", "title": "Oudolf Garden Detroit — Main Garden (15 beds, A/B/C styles, statistics as of March 2023)", "url": "https://oudolfgardendetroit.org/main-garden/",
     "accessed": "2026-11-26", "license": "© Oudolf Garden Detroit — facts cited", "public": False},
    {"id": "S-OGD-PL-2026", "title": "Official Plant List, February 2026 (A/B/C beds, Rain Garden)", "url": "https://oudolfgardendetroit.org/wp-content/uploads/2026/02/OudolfGardenDetroit_Plant-List_Feb-2026.pdf",
     "accessed": "2026-11-26", "license": "© Oudolf Garden Detroit — species names cited", "public": False},
    {"id": "S-OGD-FA-2019", "title": "Piet Oudolf, Revised Planting Plan A beds (Block), Oct 2019, 1:100", "url": "https://oudolfgardendetroit.org/wp-content/uploads/2026/02/OGD-Design-Forbs-A-Beds-web.webp",
     "accessed": "2026-11-26", "license": "© Piet Oudolf / OGD — legend facts cited, drawing not redistributed", "public": False},
    {"id": "S-OGD-FB-2019", "title": "Piet Oudolf, Revised Planting Plan B beds (Matrix), Oct 2019, 1:100", "url": "https://oudolfgardendetroit.org/wp-content/uploads/2026/02/OGD-Design-Forbs-B-Beds-web.webp",
     "accessed": "2026-11-26", "license": "© Piet Oudolf / OGD — legend facts cited", "public": False},
    {"id": "S-OGD-FC-2019", "title": "Piet Oudolf, Revised Planting Plan C beds (Grouping), Oct 2019, 1:100", "url": "https://oudolfgardendetroit.org/wp-content/uploads/2026/02/OGD-Design-Forbs-C-Beds-web.webp",
     "accessed": "2026-11-26", "license": "© Piet Oudolf / OGD — legend facts cited", "public": False},
    {"id": "S-OGD-BA-2020", "title": "Piet Oudolf, Bulb plan A beds (A1–A4), Sept 2020", "url": "https://oudolfgardendetroit.org/wp-content/uploads/2026/02/OGD-Design-Bulbs-A-Beds-web.webp",
     "accessed": "2026-11-26", "license": "© Piet Oudolf / OGD — bed codes + legend cited", "public": False},
    {"id": "S-OGD-BB-2020", "title": "Piet Oudolf, Bulb plan B beds (B1–B5), Sept 2020", "url": "https://oudolfgardendetroit.org/wp-content/uploads/2026/02/OGD-Design-Bulbs-B-Beds-web.webp",
     "accessed": "2026-11-26", "license": "© Piet Oudolf / OGD — bed codes + legend cited", "public": False},
    {"id": "S-OGD-BC-2020", "title": "Piet Oudolf, Bulb plan C beds (C1–C4), Sept 2020", "url": "https://oudolfgardendetroit.org/wp-content/uploads/2026/02/OGD-Design-Bulbs-C-Beds-web.webp",
     "accessed": "2026-11-26", "license": "© Piet Oudolf / OGD — bed codes + legend cited", "public": False},
    {"id": "S-OGD-RAIN", "title": "Rain Garden page + trees & shrubs plan (March 2020) + stormwater inlet CAD", "url": "https://oudolfgardendetroit.org/rain-garden/",
     "accessed": "2026-11-26", "license": "© OGD / Piet Oudolf / InSite Design Studio — facts cited", "public": False},
    {"id": "S-OGD-BIRD", "title": "Bird Border page + drawing (9 species, 45 plants, planted spring 2023)", "url": "https://oudolfgardendetroit.org/bird-border/",
     "accessed": "2026-11-26", "license": "© OGD — facts cited", "public": False},
    {"id": "S-OGD-MEADOW", "title": "Native Meadows page + East/West Meadow plant lists (Feb 2026)", "url": "https://oudolfgardendetroit.org/native-meadows/",
     "accessed": "2026-11-26", "license": "© OGD — facts cited", "public": False},
    {"id": "S-OGD-PHOTO-2023", "title": "Official aerial photograph of the Native Meadows (OGD 7-10-2023) — viewed for interpretation only", "url": "https://oudolfgardendetroit.org/native-meadows/",
     "accessed": "2026-11-26", "license": "© OGD — not redistributed", "public": False},
    {"id": "S-MODEL", "title": "This model: deterministic generator / interpretation (tools/build_model.py)", "url": "tools/build_model.py",
     "license": "MIT (code)", "public": True},
]

# --------------------------------------------------------------------------- bed register
# OSM way id -> (modelId, originalCode from Oudolf's 2020 bulb plans, style, column W->E, row)
BEDS = [
    (1197169313, "C1", "C1", "C", 1, "N"), (1197169305, "C2", "C2", "C", 1, "S"),
    (1197169312, "B1", "B1", "B", 2, "N"), (1197169304, "B2", "B2", "B", 2, "S"),
    (1197169311, "A1", "A1", "A", 3, "N"), (1197169303, "A2", "A2", "A", 3, "S"),
    (1197169310, "B3N", "B3", "B", 4, "N"), (1197169302, "B3S", "B3", "B", 4, "S"),
    (1197169309, "A3N", "A3", "A", 5, "N"), (1197169301, "A3S", "A3", "A", 5, "S"),
    (1197169308, "C3", "C3", "C", 6, "N"), (1197169300, "C4", "C4", "C", 6, "S"),
    (1197169307, "B4", "B4", "B", 7, "N"), (1197169299, "B5", "B5", "B", 7, "S"),
    (1197169298, "A4", "A4", "A", 8, "S"),
]
TRIANGLES = [(1197169306, "TN", "north-east triangle"), (1197169291, "TE", "east triangle")]
RAIN_GARDEN_WAY = 1197169292
STYLE = {"A": ("Block", "S-OGD-FA-2019", "S-OGD-BA-2020"), "B": ("Matrix", "S-OGD-FB-2019", "S-OGD-BB-2020"),
         "C": ("Grouping", "S-OGD-FC-2019", "S-OGD-BC-2020")}

# --------------------------------------------------------------------------- layers
LAYERS = [
    ("site", None, "Site", "group"), ("site.boundary", "site", "Garden boundary", "polygon"),
    ("site.context", "site", "Context (roads, parking, buildings)", "polygon"),
    ("site.water", "site", "Water (Lake Tacoma, moat)", "polygon"),
    ("topo", None, "Topography", "group"), ("topo.surface", "topo", "Terrain surface (3DEP 1 m)", "field"),
    ("topo.contours", "topo", "Contours 0.25 m", "derived"),
    ("built", None, "Built", "group"), ("built.paths", "built", "Paths — gravel & concrete", "polygon"),
    ("built.walks", "built", "Grass walks", "polygon"), ("built.walls", "built", "Limestone retaining walls", "line"),
    ("built.edging", "built", "Steel bed edging", "line"), ("built.structures", "built", "Carillon, memorial, boardwalk", "mixed"),
    ("structure", None, "Planting structure", "group"), ("structure.districts", "structure", "Districts", "polygon"),
    ("structure.beds", "structure", "Beds", "polygon"), ("structure.patches", "structure", "Patches / groups (schematic)", "polygon"),
    ("structure.labels", "structure", "Bed codes", "label"),
    ("veg", None, "Vegetation", "group"), ("veg.trees", "veg", "Trees", "instances"), ("veg.shrubs", "veg", "Shrubs", "instances"),
    ("veg.grasses", "veg", "Grasses & sedges", "instances"), ("veg.forbs", "veg", "Forbs & ferns", "instances"),
    ("veg.bulbs", "veg", "Bulbs (positions only)", "instances"), ("veg.lawn", "veg", "Lawn", "polygon"),
    ("analysis", None, "Analysis", "group"), ("analysis.slope", "analysis", "Slope (derived, 1 m)", "field"),
    ("analysis.pathdist", "analysis", "Distance to path (derived)", "field"),
    ("analysis.sun", "analysis", "Sun / shade — not available", "unknown"),
    ("analysis.moisture", "analysis", "Soil moisture — not available", "unknown"),
    ("analysis.ph", "analysis", "Soil pH — not available", "unknown"),
]
LAYER_DEFAULTS = {"topo.contours": False, "analysis.slope": False, "analysis.pathdist": False, "analysis.sun": False,
                  "analysis.moisture": False, "analysis.ph": False, "structure.patches": True}


def build_layers():
    out = []
    for i, (lid, parent, name, kind) in enumerate(LAYERS):
        unknown = kind == "unknown"
        out.append({"id": lid, "parent": parent, "name": name, "kind": kind, "order": i,
                    "visible": LAYER_DEFAULTS.get(lid, True) and not unknown, "locked": lid.startswith("site") or lid.startswith("topo"),
                    "selectable": kind not in ("field", "derived", "unknown", "group", "label"),
                    "opacity": 0.65 if lid.startswith("analysis") else 1.0,
                    "status": "unavailable" if unknown else "available"})
    return out


# --------------------------------------------------------------------------- main build

def main():
    nodes, ways, rels = load()
    ext = box(EXTENT["xmin"], EXTENT["ymin"], EXTENT["xmax"], EXTENT["ymax"])
    objects = []
    placements = []
    inst = []  # (x, y, speciesId, placementIdx, scale, rot)

    def W(wid):
        return way_coords(nodes, ways[wid])

    def poly_of(wid):
        return Polygon(W(wid)).buffer(0)

    def add(o):
        o.setdefault("sourceRefs", ["S-OSM"])
        o.setdefault("status", "documented")
        o.setdefault("dataKind", "source")
        objects.append(o)
        return o

    # ---------------- site & districts
    park = poly_of(882942799)
    add({"id": "site.oudolf-garden-detroit", "type": "site", "name": "Oudolf Garden Detroit", "layer": "site.boundary",
         "parent": None, "geometry": None, "props": {"osm": "way/882942799", "location": "Belle Isle, Detroit, Michigan, USA",
         "designer": "Piet Oudolf"}, "sourceRefs": ["S-OGD-OVERVIEW", "S-OSM"]})
    add({"id": "district.main-garden", "type": "district", "name": "Main Garden", "layer": "structure.districts",
         "parent": "site.oudolf-garden-detroit", "geometry": geo(park),
         "props": {"areaM2": round(park.area, 1), "officialAcres": 1.5, "osm": "way/882942799"},
         "sourceRefs": ["S-OSM", "S-OGD-MAIN"]})

    # ---------------- beds
    bed_polys = {}
    for wid, mid, code, style, col, row in BEDS:
        p = poly_of(wid)
        bed_polys[mid] = p
        sname, fsrc, bsrc = STYLE[style]
        add({"id": f"bed.{mid}", "type": "bed", "name": f"Bed {mid}", "layer": "structure.beds", "parent": "district.main-garden",
             "geometry": geo(p),
             "props": {"style": style, "styleName": sname, "originalCode": code, "column": col, "row": row,
                       "areaM2": round(p.area, 1), "perimeterM": round(p.length, 1), "osm": f"way/{wid}",
                       "codeNote": "Code as written on Piet Oudolf's Sept 2020 bulb plans; A3 and B3 each label two beds, split here as N/S." if code in ("A3", "B3") else "Code as written on Piet Oudolf's Sept 2020 bulb plans.",
                       "edging": "steel (official overview)"},
             "sourceRefs": ["S-OSM", fsrc, bsrc, "S-OGD-MAIN"], "status": "documented", "dataKind": "source",
             "confidence": {"outline": "high (OSM, registered against NAIP)", "code": "high (bulb plan key)", "style": "high (key maps)"}})
    for wid, mid, label in TRIANGLES:
        p = poly_of(wid)
        bed_polys[mid] = p
        add({"id": f"bed.{mid}", "type": "bed", "name": f"Triangle {mid}", "layer": "structure.beds", "parent": "district.main-garden",
             "geometry": geo(p),
             "props": {"style": "T", "styleName": "Triangles (Matrix)", "originalCode": None, "areaM2": round(p.area, 1),
                       "osm": f"way/{wid}", "codeNote": "Official statistics list 'Triangles (Matrix)' separately from the 15 beds; no drawing code published. Identification of these two OSM beds as the Triangles is inferred from position.",
                       "countsTowardFifteen": False},
             "sourceRefs": ["S-OSM", "S-OGD-MAIN"], "status": "reconstructed", "dataKind": "inferred",
             "confidence": {"outline": "high (OSM)", "identity": "medium (inferred)"}})

    # ---------------- rain garden, bird border, meadows
    rg = poly_of(RAIN_GARDEN_WAY)
    add({"id": "district.rain-garden", "type": "district", "name": "Rain Garden", "layer": "structure.districts",
         "parent": "site.oudolf-garden-detroit", "geometry": geo(rg),
         "props": {"areaM2": round(rg.area, 1), "officialAcres": 0.25, "stormwaterPracticeAreaSqft": 3803,
                   "retentionDepthIn": 8.2, "retentionVolumeCuft": 1677, "osm": f"way/{RAIN_GARDEN_WAY}",
                   "note": "OSM outline = planted basin; official 0.25 acre includes surroundings."},
         "sourceRefs": ["S-OSM", "S-OGD-RAIN"]})
    add({"id": "bed.RG", "type": "bed", "name": "Rain Garden basin", "layer": "structure.beds", "parent": "district.rain-garden",
         "geometry": geo(rg), "props": {"style": "RG", "styleName": "Rain garden", "areaM2": round(rg.area, 1), "originalCode": None},
         "sourceRefs": ["S-OSM", "S-OGD-RAIN"]})
    # cobble swale (schematic: from the CAD sheet, inlet at the street; route inside basin inferred)
    c = rg.centroid
    top = max(rg.exterior.coords, key=lambda q: q[1])
    swale = LineString([(top[0] + 1.5, top[1] + 4.0), (top[0] + 0.5, top[1] - 2), (c.x + 1.0, c.y + 6), (c.x, c.y)])
    add({"id": "built.rain-garden-cobble-swale", "type": "swale", "name": "Cobble swale from street inlet", "layer": "built.structures",
         "parent": "district.rain-garden", "geometry": geo(swale),
         "props": {"note": "Inlet + trench drain + cobble swale documented on the CAD sheet; its exact route here is schematic."},
         "sourceRefs": ["S-OGD-RAIN"], "status": "schematic", "dataKind": "hypothetical"})

    # Bird border: two staggered rows along the parking side (west) of the Rain Garden
    off = rg.buffer(3.2, join_style=1).exterior
    westpts = [q for q in off.coords if q[0] < rg.centroid.x - 2]
    westpts.sort(key=lambda q: q[1])
    bb_line = LineString(westpts).simplify(0.5)
    # keep ~27 m (45 plants in 2 staggered rows at ~1.2 m)
    L = bb_line.length
    mid = L / 2
    seg = LineString([bb_line.interpolate(max(0, mid - 13.5)).coords[0], bb_line.interpolate(mid - 4.5).coords[0],
                      bb_line.interpolate(mid + 4.5).coords[0], bb_line.interpolate(min(L, mid + 13.5)).coords[0]])
    add({"id": "district.bird-border", "type": "district", "name": "Bird Border", "layer": "structure.districts",
         "parent": "site.oudolf-garden-detroit", "geometry": geo(seg.buffer(1.6, cap_style=1)),
         "props": {"officialAcres": 0.035, "plants": 45, "varieties": 9, "planted": "spring 2023", "form": "two staggered hedgerow rows",
                   "note": "Official text: along the parking area, backdrop to the Rain Garden at the west end. Exact alignment not published — schematic."},
         "sourceRefs": ["S-OGD-BIRD"], "status": "schematic", "dataKind": "inferred"})

    # water
    r = rels[420953]
    outer = [Polygon(rr).buffer(0) for rr in join_rings([W(m["ref"]) for m in r["members"] if m["type"] == "way" and m["ref"] in ways and m["role"] == "outer"]) if len(rr) > 3]
    inner = [Polygon(rr).buffer(0) for rr in join_rings([W(m["ref"]) for m in r["members"] if m["type"] == "way" and m["ref"] in ways and m["role"] == "inner"]) if len(rr) > 3]
    lake = unary_union(outer).difference(unary_union(inner)) if inner else unary_union(outer)
    lake = lake.intersection(ext)
    islands = unary_union(inner).intersection(ext) if inner else Polygon()
    add({"id": "water.lake-tacoma", "type": "water", "name": "Lake Tacoma", "layer": "site.water", "parent": "site.oudolf-garden-detroit",
         "geometry": geo(lake), "props": {"osm": "relation/420953"}})
    moat = poly_of(106966326).difference(poly_of(106966318))
    add({"id": "water.carillon-moat", "type": "water", "name": "Carillon moat", "layer": "site.water", "parent": "site.oudolf-garden-detroit",
         "geometry": geo(moat), "props": {"osm": "relation/9177263"}})
    island = poly_of(106966318)

    # meadows (schematic: located from official text + 2023 aerial photo; area matched to official acreage)
    def fit_area(p, target):
        lo, hi = -15.0, 15.0
        for _ in range(40):
            m = (lo + hi) / 2
            a = p.buffer(m, join_style=1).area
            if a < target:
                lo = m
            else:
                hi = m
        return p.buffer((lo + hi) / 2, join_style=1)

    keep_out = unary_union([park.buffer(4.0), lake.buffer(1.5), poly_of(106966326).buffer(2.0), rg.buffer(3.0)])
    west_seed = Polygon([(-44, -42), (-12, -42), (-12, -78), (-46, -82)])
    east_seed = Polygon([(40, -18), (62, -8), (92, -22), (96, -62), (70, -80), (38, -76)])
    for mid_, seedp, target, label in (("west", west_seed, 0.38 * 4046.86, "West Meadow"), ("east", east_seed, 0.87 * 4046.86, "East Meadow")):
        mp = largest(fit_area(seedp, target * 1.25).difference(keep_out))
        # adjust once more to official area after clipping
        for _ in range(6):
            f = math.sqrt(target / mp.area)
            mp = largest(affinity.scale(mp, f, f, origin="centroid").difference(keep_out))
        add({"id": f"district.{mid_}-meadow", "type": "district", "name": label, "layer": "structure.districts",
             "parent": "site.oudolf-garden-detroit", "geometry": geo(mp),
             "props": {"officialAcres": 0.38 if mid_ == "west" else 0.87, "modelAreaM2": round(mp.area, 1), "opened": "2024-10",
                       "officialName": "Jean Wright Hudson Peace Meadows",
                       "note": "Boundary is schematic: located from the official description (low-lying south portion around the Carillon) and the official 2023 aerial photograph, then scaled to the published area. Hydrology zones are species attributes, not mapped."},
             "sourceRefs": ["S-OGD-MEADOW", "S-OGD-PHOTO-2023", "S-MODEL"], "status": "schematic", "dataKind": "inferred",
             "confidence": {"outline": "low", "area": "medium (matched to official acreage)"}})
        bed_polys["M" + mid_[0].upper()] = mp
        add({"id": f"bed.M{mid_[0].upper()}", "type": "bed", "name": f"{label} planting", "layer": "structure.beds",
             "parent": f"district.{mid_}-meadow", "geometry": geo(mp),
             "props": {"style": "M", "styleName": "Native meadow (lakeplain prairie)", "areaM2": round(mp.area, 1), "originalCode": None},
             "sourceRefs": ["S-OGD-MEADOW"], "status": "schematic", "dataKind": "inferred"})

    # ---------------- built: walks, walls, roads, structures
    def mp_rel(rid):
        r = rels[rid]
        outers = [W(m["ref"]) for m in r["members"] if m["role"] == "outer" and m["ref"] in ways]
        inners = [W(m["ref"]) for m in r["members"] if m["role"] == "inner" and m["ref"] in ways]
        os_ = [Polygon(x).buffer(0) for x in join_rings(outers) if len(x) > 3]
        is_ = [Polygon(x).buffer(0) for x in join_rings(inners) if len(x) > 3]
        g = unary_union(os_)
        if is_:
            g = g.difference(unary_union(is_))
        return g

    gravel = mp_rel(16191056)
    beds_union = unary_union(list(bed_polys.values()))
    gravel = gravel.difference(unary_union([bed_polys[k] for k in bed_polys if not k.startswith("M")]))
    add({"id": "built.gravel-walks", "type": "path", "name": "Crushed granite walks", "layer": "built.paths", "parent": "district.main-garden",
         "geometry": geo(gravel), "props": {"surface": "crushed granite (ADA)", "osm": "relation/16191056", "areaM2": round(gravel.area, 1)}})
    grassw = mp_rel(16191061)
    add({"id": "built.grass-walks", "type": "path", "name": "Walkable lawn strips", "layer": "built.walks", "parent": "district.main-garden",
         "geometry": geo(grassw), "props": {"surface": "turf", "osm": "relation/16191061", "areaM2": round(grassw.area, 1),
                                           "note": "Official overview: 'walkable lawns that intersect with pathways'."}})
    for wid in (1197169288, 1197169289, 1197169290):
        add({"id": f"built.wall-{wid}", "type": "wall", "name": "Michigan limestone retaining wall", "layer": "built.walls",
             "parent": "district.main-garden", "geometry": geo(LineString(W(wid))),
             "props": {"material": "Michigan limestone", "osm": f"way/{wid}", "heightM": None,
                       "note": "Official overview: two retaining walls border the Main Garden to protect from flooding. Height not published."},
             "sourceRefs": ["S-OSM", "S-OGD-OVERVIEW"]})
    # bed edging (derived from bed outlines)
    add({"id": "built.steel-edging", "type": "edging", "name": "Steel bed edging", "layer": "built.edging", "parent": "district.main-garden",
         "geometry": None, "geometryRef": "bed outlines (all main beds)", "props": {"material": "steel", "note": "Official overview: 15 large beds with steel edging; rendered on every bed outline."},
         "sourceRefs": ["S-OGD-OVERVIEW"], "status": "documented", "dataKind": "source"})

    # roads / sidewalks / footways as polygons (buffered centrelines, width inferred from lanes)
    road_polys, walk_polys, park_polys, bldg = [], [], [], []
    for w in ways.values():
        t = w.get("tags", {})
        cs = W(w["id"])
        if len(cs) < 2:
            continue
        hw = t.get("highway")
        if hw in ("residential", "unclassified", "tertiary", "service") and t.get("area") != "yes":
            lanes = int(t.get("lanes", "2").split(";")[0]) if t.get("lanes", "2")[0].isdigit() else 2
            width = 3.3 * lanes if hw != "service" else 5.0
            road_polys.append(LineString(cs).buffer(width / 2, cap_style=2, join_style=1))
        elif hw in ("footway", "path", "cycleway", "pedestrian", "steps") and t.get("surface") not in ("grass",) and t.get("area") != "yes":
            if w["id"] in (1049391272, 1049391273, 1049391274, 1049391275, 1197169273):
                continue  # garden gravel walks already as area
            width = 3.0 if hw == "cycleway" else (1.8 if t.get("footway") == "sidewalk" else 1.6)
            walk_polys.append((w["id"], LineString(cs).buffer(width / 2, cap_style=2, join_style=1), t))
        if t.get("amenity") == "parking" and cs[0] == cs[-1] and len(cs) > 3:
            park_polys.append(Polygon(cs).buffer(0))
        if (t.get("building") or t.get("building:part")) and cs[0] == cs[-1] and len(cs) > 3:
            bldg.append((w["id"], Polygon(cs).buffer(0), t))
    roads = unary_union(road_polys).intersection(ext)
    add({"id": "context.roads", "type": "road", "name": "Roads (Loiter Way, Picnic Way, Strand Drive)", "layer": "site.context",
         "parent": "site.oudolf-garden-detroit", "geometry": geo(roads),
         "props": {"note": "Buffered OSM centrelines; widths inferred from lane count (3.3 m/lane)."}, "status": "reconstructed", "dataKind": "inferred"})
    parking = unary_union(park_polys).intersection(ext).difference(roads)
    add({"id": "context.parking", "type": "parking", "name": "Parking", "layer": "site.context", "parent": "site.oudolf-garden-detroit",
         "geometry": geo(parking), "props": {}})
    boardwalk_id = 1543136211
    walks = []
    for wid, p, t in walk_polys:
        if wid == boardwalk_id:
            continue
        walks.append(p)
    walks_u = unary_union(walks).intersection(ext).difference(roads).difference(beds_union)
    add({"id": "context.sidewalks", "type": "path", "name": "Concrete walks & trails", "layer": "built.paths", "parent": "site.oudolf-garden-detroit",
         "geometry": geo(walks_u), "props": {"note": "Buffered OSM centrelines, widths inferred (1.6–3.0 m)."}, "status": "reconstructed", "dataKind": "inferred"})
    if boardwalk_id in ways:
        bw = LineString(W(boardwalk_id))
        add({"id": "built.east-meadow-boardwalk", "type": "boardwalk", "name": "East Meadow boardwalk", "layer": "built.structures",
             "parent": "district.east-meadow", "geometry": geo(bw.buffer(0.9, cap_style=2, join_style=1)),
             "props": {"material": "wood", "widthM": 1.8, "osm": f"way/{boardwalk_id}",
                       "note": "Official text: the east meadow features a wooden boardwalk. Identification with this OSM path is inferred; width inferred."},
             "sourceRefs": ["S-OSM", "S-OGD-MEADOW"], "status": "reconstructed", "dataKind": "inferred"})
    for wid, p, t in bldg:
        pi = p.intersection(ext)
        if pi.is_empty:
            continue
        name = t.get("name", "building").replace("\xa0", " ")
        h = float(t.get("height", 0) or 0) or (float(t.get("building:levels", 1)) * 3.5)
        typ = "tower" if t.get("building") == "tower" else "building"
        add({"id": f"structure.{wid}", "type": typ, "name": name, "layer": "built.structures" if "Carillon" in name or t.get("building:part") else "site.context",
             "parent": "site.oudolf-garden-detroit", "geometry": geo(pi),
             "props": {"heightM": h, "osm": f"way/{wid}", "levels": t.get("building:levels"), "minLevel": t.get("building:min_level"),
                       "built": t.get("start_date"), "architect": t.get("architect")},
             "status": "documented" if t.get("height") else "reconstructed", "dataKind": "source" if t.get("height") else "inferred"})
    # monuments / benches
    for n in nodes.values():
        t = n.get("tags", {})
        if t.get("name") == "International Peace Memorial" or (t.get("amenity") == "bench"):
            from geo import to_local
            x, y = to_local(n["lat"], n["lon"])
            if not ext.contains(Point(x, y)):
                continue
            is_mem = t.get("name") == "International Peace Memorial"
            add({"id": f"structure.node-{n['id']}", "type": "monument" if is_mem else "bench",
                 "name": t.get("name", "Bench"), "layer": "built.structures", "parent": "site.oudolf-garden-detroit",
                 "geometry": {"type": "Point", "coordinates": [r3(x), r3(y)]},
                 "props": {"osm": f"node/{n['id']}", "material": t.get("material"), "built": t.get("start_date")}})

    # lawn: everything inside extent not water/road/parking/garden features (a residual) — documented grass via OSM where present
    grass_polys = []
    for w in ways.values():
        t = w.get("tags", {})
        cs = W(w["id"])
        if t.get("landuse") == "grass" and len(cs) > 3 and cs[0] == cs[-1]:
            grass_polys.append(Polygon(cs).buffer(0))
    grass_osm = mp_rel(17884248)
    lawn = unary_union(grass_polys + [grass_osm]).intersection(ext)
    hard = unary_union([roads, parking, walks_u, lake, moat, island, park, rg] + [b[1] for b in bldg])
    lawn_resid = ext.difference(hard).difference(unary_union([bed_polys["MW"], bed_polys["ME"]]))
    add({"id": "veg.lawn", "type": "lawn", "name": "Mown lawn & park turf", "layer": "veg.lawn", "parent": "site.oudolf-garden-detroit",
         "geometry": geo(lawn_resid.buffer(0)),
         "props": {"note": "Residual open ground (not road, water, path, bed or building). OSM maps most of it as landuse=grass; uncovered fringes are assumed turf.",
                   "osmGrassAreaM2": round(lawn.area, 1)},
         "status": "reconstructed", "dataKind": "inferred"})
    add({"id": "veg.carillon-island", "type": "lawn", "name": "Carillon island planting", "layer": "veg.lawn", "parent": "site.oudolf-garden-detroit",
         "geometry": geo(island), "props": {"note": "Island inside the moat; vegetation outside the scope of the Oudolf planting."},
         "status": "reconstructed", "dataKind": "inferred"})

    # ---------------- existing trees (digitised from NAIP crowns)
    trees_path = os.path.join(ROOT, "sources", "curated", "naip_tree_crowns.json")
    if os.path.exists(trees_path):
        for i, t in enumerate(json.load(open(trees_path))["crowns"]):
            x, y, rr = t["x"], t["y"], t["r"]
            pid = f"tree.existing-{i+1:02d}"
            add({"id": pid, "type": "tree", "name": f"Existing tree {i+1}", "layer": "veg.trees", "parent": "site.oudolf-garden-detroit",
                 "geometry": {"type": "Point", "coordinates": [x, y]},
                 "props": {"crownRadiusM": rr, "speciesId": "sp.unidentified-tree", "heightM": None,
                           "note": "Crown centre and radius digitised from USGS NAIP; species and height unknown (height for display inferred from crown)."},
                 "sourceRefs": ["S-NAIP"], "status": "reconstructed", "dataKind": "inferred"})
            inst.append((x, y, "sp.unidentified-tree", None, min(1.6, max(0.6, rr / 5.0)), rng("tr", i).random()))

    # ---------------- planting: recipes + placements + instances
    species = dict(C.SP)
    recipes = []

    def recipe(rid, name, style, legend, sources, notes):
        comps = []
        for code, sps, role in legend:
            comps.append({"legendCode": code, "speciesIds": sps, "role": role})
        recipes.append({"id": rid, "name": name, "style": style, "version": "design-2019-10/bulbs-2020-09",
                        "components": comps, "sourceRefs": sources, "notes": notes,
                        "roleNote": "Roles are the legend grouping of this recipe (how the species is drawn in this plan), not a global property of the species."})

    recipe("mix.A-block", "A beds — Block plan", "A", C.LEGEND_A + C.BULBS_A, ["S-OGD-FA-2019", "S-OGD-BA-2020"],
           "Right-hand legend = block species (often paired, e.g. 'Echinacea + Dalea'); bottom legend = emergent symbols placed over blocks.")
    recipe("mix.B-matrix", "B beds — Matrix plan", "B", C.LEGEND_B + C.BULBS_B, ["S-OGD-FB-2019", "S-OGD-BB-2020", "S-OGD-PL-2026"],
           "Sporobolus heterolepis is the documented matrix grass; groups and scattered emergents sit within it.")
    recipe("mix.C-grouping", "C beds — Organic grouping plan", "C", C.LEGEND_C + C.BULBS_C, ["S-OGD-FC-2019", "S-OGD-BC-2020"],
           "Upper legend = groups; lower legend headed 'Individual plants / small groups'.")
    recipe("mix.T-triangles", "Triangles (Matrix)", "T", [], ["S-OGD-MAIN"],
           "Statistics only (14 varieties: 6 forbs, 2 grasses, 6 trees & shrubs = 13 plants). Species not published: components unknown.")
    recipe("mix.RG", "Rain Garden", "RG", [("tree/shrub", [s], "shrub") for _, s in C.RAIN_TREES] +
           [("forb", [s], "group") for s in C.RAIN_PERENNIALS] + [("sedge", [s], "matrix") for s in C.RAIN_SEDGES],
           ["S-OGD-RAIN", "S-OGD-PL-2026"], "Trees & shrubs from the March 2020 plan legend; perennials and sedges from the 2026 list.")
    recipe("mix.BIRD", "Bird Border hedgerow", "H", [("shrub", [s], "hedgerow") for s in C.BIRD_BORDER], ["S-OGD-BIRD"],
           "Nine mostly-native shrubs and small trees in two staggered rows; underplanting not itemised.")

    # meadow species records
    meadow_ids = {}
    for name in sorted(set(C.MEADOW_EAST) | set(C.MEADOW_WEST)):
        sid = "sp.m-" + name.lower().replace(" ", "-").replace(".", "")
        ptype = "shrub" if name in C.MEADOW_SHRUBS else ("grass" if name.startswith(C.MEADOW_GRAMINOIDS_PREFIX) else "forb")
        form = "shrub" if ptype == "shrub" else ("grass-upright" if ptype == "grass" and name.split()[0] in ("Andropogon", "Sorghastrum", "Schizachyrium", "Elymus") else ("grass-fine" if ptype == "grass" else "meadow-forb"))
        h = {"shrub": 1.8, "grass": 0.9 if form == "grass-fine" else 1.5}.get(ptype, 1.0)
        rr = rng("mc", name)
        col = rr.choice(["#e7c94a", "#d9a3c9", "#f1eee6", "#a99ad8", "#d36f3c", "#efe6a0", "#7d8fd6", None, None])
        species[sid] = {"id": sid, "scientificName": name, "cultivar": None, "plantType": ptype, "formProxy": form,
                        "nominalHeightM": h, "nominalSpreadM": 0.6 if ptype != "shrub" else 1.6, "displayFlower": col,
                        "displayLeaf": rr.choice(["#7f8c55", "#8a9463", "#6f8650", "#93945f"]) if ptype == "grass" else rr.choice(["#5f7d45", "#6b8549", "#587240"]),
                        "aliases": [], "note": "Native meadow list (Feb 2026). Display colour is a generic meadow proxy."}
        meadow_ids[name] = sid
    recipe("mix.MW", "West Meadow", "M", [(n, [meadow_ids[n]], "meadow") for n in C.MEADOW_WEST], ["S-OGD-MEADOW"], C.MEADOW_HYDRO_NOTE)
    recipe("mix.ME", "East Meadow", "M", [(n, [meadow_ids[n]], "meadow") for n in C.MEADOW_EAST], ["S-OGD-MEADOW"], C.MEADOW_HYDRO_NOTE)

    # official densities -> per-bed estimates
    style_area = {}
    for wid, mid, code, style, col, row in BEDS:
        style_area[style] = style_area.get(style, 0) + bed_polys[mid].area
    ST = C.STATS["mainGardenByStyle"]
    dens = {s: {k: ST[s][k] / style_area[s] for k in ("forbs", "grasses", "bulbs")} for s in "ABC"}
    tri_area = sum(bed_polys[m].area for _, m, _ in TRIANGLES)
    dens["T"] = {"forbs": ST["T"]["forbs"] / tri_area, "grasses": ST["T"]["grasses"] / tri_area, "bulbs": 0}

    VIS = 0.42   # visual proxies per real plant (non-bulb)
    VIS_BULB = 0.12

    def add_pl(pl):
        pl["index"] = len(placements)
        placements.append(pl)
        return pl["index"]

    def scatter_instances(poly, count, sids, pidx, seed, avoid=None, minr=None):
        if count <= 0 or poly.is_empty:
            return 0
        rnd = rng("inst", seed)
        area = poly.area
        r = minr or max(0.18, 0.75 * math.sqrt(area / max(1, count)))
        pts = poisson(poly, r, rnd, max_pts=count, avoid=avoid)
        for k, (x, y) in enumerate(pts):
            sid = sids[k % len(sids)] if len(sids) > 1 else sids[0]
            inst.append((x, y, sid, pidx, 0.8 + 0.4 * rnd.random(), rnd.random()))
        return len(pts)

    for wid, mid, code, style, col, row in BEDS:
        bp = bed_polys[mid]
        inner = bp.buffer(-0.25)
        rnd = rng("bed", mid)
        legend = {"A": C.LEGEND_A, "B": C.LEGEND_B, "C": C.LEGEND_C}[style]
        bulbs = {"A": C.BULBS_A, "B": C.BULBS_B, "C": C.BULBS_C}[style]
        d = dens[style]
        base_meta = {"bedId": f"bed.{mid}", "recipeId": {"A": "mix.A-block", "B": "mix.B-matrix", "C": "mix.C-grouping"}[style],
                     "positionSource": "generated-schematic", "status": "schematic", "dataKind": "hypothetical",
                     "sourceRefs": [STYLE[style][1], "S-MODEL"]}
        n_real_forb = d["forbs"] * bp.area
        n_real_grass = d["grasses"] * bp.area

        def comp_list(role):
            return [e for e in legend if e[2] == role]

        def pick_balanced(entries, n, key):
            r2 = rng("pick", mid, key)
            seq = []
            while len(seq) < n:
                block = entries[:]
                r2.shuffle(block)
                seq += block
            return seq[:n]

        if style in ("A", "C"):
            cell_area = 3.3 if style == "A" else 4.2
            n_cells = max(8, int(bp.area / cell_area))
            r = math.sqrt(bp.area / n_cells) * 0.78
            seeds = poisson(inner, r, rnd, max_pts=n_cells)
            if style == "A":
                # Oudolf's blocks read as rows across the bed: stretch seeds along the bed's long axis
                pass
            cells = voronoi(bp, seeds, reach=r * 4.5)
            role = "block" if style == "A" else "group"
            entries = comp_list(role)
            # greedy colouring so neighbours differ
            assign = [None] * len(cells)
            order = list(range(len(cells)))
            r3_ = rng("col", mid)
            r3_.shuffle(order)
            counts = {e[0]: 0 for e in entries}
            for i in order:
                ci = cells[i]
                nb = {assign[j][0] for j in range(len(cells)) if assign[j] and j != i and ci.distance(cells[j]) < 0.05}
                cands = [e for e in entries if e[0] not in nb] or entries
                mn = min(counts[e[0]] for e in cands)
                pool = [e for e in cands if counts[e[0]] == mn]
                e = r3_.choice(pool)
                assign[i] = e
                counts[e[0]] += 1
            tot_area = sum(c.area for c in cells)
            for i, (cell, e) in enumerate(zip(cells, assign)):
                if style == "C":
                    shaped = cell.buffer(-0.22, join_style=1).buffer(0.16, join_style=1)
                else:
                    shaped = cell.buffer(-0.05, join_style=2)
                shaped = largest(shaped.intersection(bp))
                if shaped.is_empty or shaped.area < 0.25:
                    continue
                code_, sids, role_ = e
                is_grass = all(species[s]["plantType"] in ("grass", "sedge") for s in sids)
                real = (n_real_grass if is_grass else n_real_forb) * cell.area / tot_area * (1.0 if is_grass else 1.0)
                pid = f"pl.{mid}.{'b' if style == 'A' else 'g'}{i+1:02d}"
                pidx = add_pl(dict(base_meta, id=pid, kind="area", role=role_, legendCode=code_, speciesIds=sids,
                                   geometry=geo(shaped), areaM2=round(shaped.area, 2),
                                   countEstimatedReal=round(real), countBasis="official per-style total × area share (estimate)"))
                nvis = max(2, int(round(real * VIS)))
                placements[pidx]["countModelled"] = scatter_instances(shaped.buffer(-0.12), nvis, sids, pidx, pid)
            # emergent / individual points
            pe = comp_list("emergent" if style == "A" else "individual")
            n_pts = int(bp.area / (5.5 if style == "A" else 7.0))
            pts = poisson(inner.buffer(-0.2), 1.5 if style == "A" else 1.7, rng("em", mid), max_pts=n_pts)
            seq = pick_balanced(pe, len(pts), "em")
            for k, ((x, y), e) in enumerate(zip(pts, seq)):
                code_, sids, role_ = e
                pid = f"pl.{mid}.{'e' if style == 'A' else 'i'}{k+1:02d}"
                pidx = add_pl(dict(base_meta, id=pid, kind="point", role=role_, legendCode=code_, speciesIds=sids,
                                   geometry={"type": "Point", "coordinates": [r3(x), r3(y)]}, symbolRadiusM=0.35,
                                   countEstimatedReal=None, countBasis="symbol = individual plant or small group (count not published)"))
                rr = rng("pt", pid)
                ng = 1 if (style == "C" or rr.random() < 0.5) else 3
                for g in range(ng):
                    a = rr.uniform(0, 6.28); dd = 0 if g == 0 else rr.uniform(0.2, 0.35)
                    inst.append((x + dd * math.cos(a), y + dd * math.sin(a), sids[g % len(sids)], pidx, 0.9 + 0.3 * rr.random(), rr.random()))
                placements[pidx]["countModelled"] = ng
        else:  # B matrix
            groups = comp_list("group")
            em = comp_list("emergent")
            sc = comp_list("scatter")
            matrix = comp_list("matrix")[0]
            gp = poisson(inner.buffer(-0.35), 1.85, rnd, max_pts=int(bp.area / 3.6))
            seq = pick_balanced(groups, len(gp), "grp")
            gpolys = []
            for k, ((x, y), e) in enumerate(zip(gp, seq)):
                code_, sids, role_ = e
                rr = rng("g", mid, k)
                rx = rr.uniform(0.5, 0.78); ry = rx * rr.uniform(0.8, 1.2)
                g = blob(x, y, rx, ry, rr.uniform(0, 3.14), rr, wob=0.08).intersection(bp)
                g = largest(g)
                if g.is_empty:
                    continue
                gpolys.append(g)
                pid = f"pl.{mid}.g{k+1:02d}"
                real = n_real_forb * 0.7 * g.area / max(1, sum(1 for _ in gp) * 1.4)
                pidx = add_pl(dict(base_meta, id=pid, kind="area", role=role_, legendCode=code_, speciesIds=sids,
                                   geometry=geo(g), areaM2=round(g.area, 2), countEstimatedReal=None,
                                   countBasis="group size not published"))
                placements[pidx]["countModelled"] = scatter_instances(g.buffer(-0.05), max(2, int(g.area * 3.0)), sids, pidx, pid, minr=0.28)
            gu = unary_union(gpolys) if gpolys else Polygon()
            pidm = f"pl.{mid}.matrix"
            pidx = add_pl(dict(base_meta, id=pidm, kind="area", role="matrix", legendCode=matrix[0], speciesIds=matrix[1],
                               geometry=None, geometryRef=f"bed.{mid}", areaM2=round(bp.area, 1),
                               countEstimatedReal=round(n_real_grass), countBasis="official B-bed grass total × area share (estimate)",
                               status="documented", dataKind="source",
                               note="Matrix species documented ('Matrix Grass: Sporobolus heterolepis'); it underlies the whole bed and overlaps the groups."))
            placements[pidx]["countModelled"] = scatter_instances(inner, int(n_real_grass * VIS), matrix[1], pidx, pidm,
                                                                  avoid=gu.buffer(0.05), minr=0.42)
            # emergents
            ep = poisson(inner.buffer(-0.2), 1.6, rng("em", mid), max_pts=int(bp.area / 9.0), avoid=gu)
            seqe = pick_balanced(em, len(ep), "em")
            for k, ((x, y), e) in enumerate(zip(ep, seqe)):
                code_, sids, role_ = e
                pid = f"pl.{mid}.e{k+1:02d}"
                pidx = add_pl(dict(base_meta, id=pid, kind="point", role=role_, legendCode=code_, speciesIds=sids,
                                   geometry={"type": "Point", "coordinates": [r3(x), r3(y)]}, symbolRadiusM=0.3, countEstimatedReal=None,
                                   countBasis="symbol = individual plant or small group"))
                inst.append((x, y, sids[0], pidx, 1.0, rng("e", pid).random()))
                placements[pidx]["countModelled"] = 1
            # scatter species across matrix
            for code_, sids, role_ in sc:
                pid = f"pl.{mid}.s-{code_.lower()}"
                sp_pts = poisson(inner, 1.1, rng("sc", mid, code_), max_pts=int(bp.area / 4.5), avoid=gu)
                pidx = add_pl(dict(base_meta, id=pid, kind="scatter", role=role_, legendCode=code_, speciesIds=sids,
                                   geometry={"type": "MultiPoint", "coordinates": [[r3(x), r3(y)] for x, y in sp_pts]},
                                   countEstimatedReal=None, countBasis="scatter density not published"))
                for x, y in sp_pts:
                    inst.append((x, y, sids[0], pidx, 0.9 + 0.2 * rng("s", x, y).random(), rng("sr", x, y).random()))
                placements[pidx]["countModelled"] = len(sp_pts)

        # ---- bulbs (independent layer, overlaps herbaceous placements)
        n_bulb_real = d["bulbs"] * bp.area
        bmeta = dict(base_meta, recipeId=base_meta["recipeId"], sourceRefs=[STYLE[style][2], "S-MODEL"])
        n_groups = int(bp.area / 4.0)
        bpts = poisson(inner, 1.4, rng("bulb", mid), max_pts=n_groups)
        seqb = pick_balanced(bulbs, len(bpts), "bulb")
        per_group_vis = max(3, int(n_bulb_real * VIS_BULB / max(1, len(bpts))))
        for k, ((x, y), e) in enumerate(zip(bpts, seqb)):
            code_, sids, role_ = e
            rr = rng("bg", mid, k)
            rx = rr.uniform(0.45, 0.9) * (1.3 if role_ == "bulb-drift" else 1.0)
            g = largest(blob(x, y, rx, rx * rr.uniform(0.6, 1.0), rr.uniform(0, 3.14), rr, wob=0.1).intersection(bp))
            if g.is_empty:
                continue
            pid = f"pl.{mid}.bulb{k+1:02d}"
            pidx = add_pl(dict(bmeta, id=pid, kind="area", role=role_, legendCode=code_, speciesIds=sids, layerHint="veg.bulbs",
                               geometry=geo(g), areaM2=round(g.area, 2), countEstimatedReal=round(n_bulb_real / max(1, len(bpts))),
                               countBasis="official per-style bulb total ÷ modelled drifts (estimate)",
                               bloomState=None, bloomNote="Bulb bloom times are not modelled; positions only."))
            placements[pidx]["countModelled"] = scatter_instances(g, per_group_vis, sids, pidx, pid, minr=0.12)

    # ---- triangles: documented counts, undocumented species
    for wid, mid, label in TRIANGLES:
        bp = bed_polys[mid]
        inner = bp.buffer(-0.25)
        base_meta = {"bedId": f"bed.{mid}", "recipeId": "mix.T-triangles", "positionSource": "generated-schematic",
                     "status": "unknown", "dataKind": "hypothetical", "sourceRefs": ["S-OGD-MAIN", "S-MODEL"]}
        share = bp.area / tri_area
        pidx = add_pl(dict(base_meta, id=f"pl.{mid}.matrix", kind="area", role="matrix", legendCode=None, speciesIds=[],
                           geometry=None, geometryRef=f"bed.{mid}", areaM2=round(bp.area, 1),
                           countEstimatedReal=round(ST["T"]["grasses"] * share), countBasis="official Triangles grass total × area share",
                           note="2 grass varieties documented by count only; species unknown — rendered with a neutral grass proxy."))
        placements[pidx]["countModelled"] = scatter_instances(inner, int(ST["T"]["grasses"] * share * VIS), ["sp.sporobolus-heterolepis"], pidx, f"tri{mid}", minr=0.42)
        placements[pidx]["renderProxySpecies"] = "sp.sporobolus-heterolepis"
        ntree = round(13 * share)
        tp = poisson(inner.buffer(-0.8) if inner.buffer(-0.8).area > 4 else inner, 2.6, rng("trish", mid), max_pts=ntree)
        pidx = add_pl(dict(base_meta, id=f"pl.{mid}.woody", kind="scatter", role="shrub", legendCode=None, speciesIds=["sp.unidentified-shrub"],
                           geometry={"type": "MultiPoint", "coordinates": [[r3(x), r3(y)] for x, y in tp]},
                           countEstimatedReal=ntree, countBasis="13 trees & shrubs across both triangles (official), split by area",
                           note="Species not published."))
        for x, y in tp:
            inst.append((x, y, "sp.unidentified-shrub", pidx, 1.0, rng("tw", x).random()))
        placements[pidx]["countModelled"] = len(tp)

    # ---- rain garden
    rgi = rg.buffer(-0.6)
    tree_counts = {"sp.betula-nigra-heritage": 11, "sp.rhododendron-viscosum": 16, "sp.rhus-copallina": 10, "sp.viburnum-nudum": 14,
                   "sp.clethra-alnifolia": 10, "sp.myrica-gale": 6, "sp.hamamelis-vernalis": 4, "sp.hamamelis-jelena": 2,
                   "sp.halesia-carolina": 2, "sp.nyssa-sylvatica": 3, "sp.lindera-benzoin": 4, "sp.stewartia-pseudocamellia": 2,
                   "sp.chionanthus-virginicus": 1, "sp.ilex-verticillata": 6}
    seq = []
    for s, n in tree_counts.items():
        seq += [s] * n
    rng("rgseq").shuffle(seq)
    tp = poisson(rgi.buffer(-0.4), 1.45, rng("rgtrees"), max_pts=len(seq))
    rmeta = {"bedId": "bed.RG", "recipeId": "mix.RG", "positionSource": "generated-schematic", "status": "schematic",
             "dataKind": "hypothetical", "sourceRefs": ["S-OGD-RAIN", "S-MODEL"]}
    woody_pts = []
    for k, ((x, y), s) in enumerate(zip(tp, seq)):
        pid = f"pl.RG.w{k+1:02d}"
        pidx = add_pl(dict(rmeta, id=pid, kind="point", role="tree" if species[s]["plantType"] == "tree" else "shrub",
                           legendCode=None, speciesIds=[s], geometry={"type": "Point", "coordinates": [r3(x), r3(y)]},
                           countEstimatedReal=1, countBasis="species mix counted from the March 2020 plan (≈91 symbols vs 89 official)",
                           symbolRadiusM=species[s]["nominalSpreadM"] / 2))
        inst.append((x, y, s, pidx, 0.85 + 0.3 * rng("rgw", k).random(), rng("rgr", k).random()))
        placements[pidx]["countModelled"] = 1
        woody_pts.append(Point(x, y).buffer(species[s]["nominalSpreadM"] * 0.35))
    wu = unary_union(woody_pts)
    pidx = add_pl(dict(rmeta, id="pl.RG.sedges", kind="area", role="matrix", legendCode=None, speciesIds=C.RAIN_SEDGES,
                       geometry=None, geometryRef="bed.RG", areaM2=round(rg.area, 1), countEstimatedReal=1742,
                       countBasis="official Rain Garden grasses/sedges count"))
    placements[pidx]["countModelled"] = scatter_instances(rgi, int(1742 * VIS * 0.8), C.RAIN_SEDGES, pidx, "rgsedge", avoid=wu, minr=0.36)
    fp = poisson(rgi.buffer(-0.3), 2.2, rng("rgf"), max_pts=int(rg.area / 6))
    for k, (x, y) in enumerate(fp):
        s = C.RAIN_PERENNIALS[k % len(C.RAIN_PERENNIALS)]
        g = largest(blob(x, y, 0.7, 0.55, rng("rgb", k).uniform(0, 3), rng("rgb2", k), wob=0.1).intersection(rgi))
        if g.is_empty:
            continue
        pid = f"pl.RG.f{k+1:02d}"
        pidx = add_pl(dict(rmeta, id=pid, kind="area", role="group", legendCode=None, speciesIds=[s], geometry=geo(g),
                           areaM2=round(g.area, 2), countEstimatedReal=None, countBasis="1,078 forbs in total (official); per-group unknown"))
        placements[pidx]["countModelled"] = scatter_instances(g, max(2, int(g.area * 2.2)), [s], pidx, pid, minr=0.3)

    # ---- bird border: 45 plants, two staggered rows
    bmeta = {"bedId": None, "districtId": "district.bird-border", "recipeId": "mix.BIRD", "positionSource": "generated-schematic",
             "status": "schematic", "dataKind": "hypothetical", "sourceRefs": ["S-OGD-BIRD", "S-MODEL"]}
    rowA = seg.parallel_offset(0.55, "left")
    rowB = seg.parallel_offset(0.55, "right")
    seqb = []
    while len(seqb) < 45:
        b_ = C.BIRD_BORDER[:]
        rng("bbs", len(seqb)).shuffle(b_)
        seqb += b_
    seqb = seqb[:45]
    k = 0
    for ri, rowl in enumerate((rowA, rowB)):
        n = 23 if ri == 0 else 22
        for j in range(n):
            t = (j + (0.5 if ri else 0.0) + 0.25) / n
            p = rowl.interpolate(t * rowl.length)
            s = seqb[k]
            pid = f"pl.BIRD.{k+1:02d}"
            pidx = add_pl(dict(bmeta, id=pid, kind="point", role="hedgerow", legendCode=None, speciesIds=[s],
                               geometry={"type": "Point", "coordinates": [r3(p.x), r3(p.y)]}, countEstimatedReal=1,
                               countBasis="45 plants (official); sequence generated"))
            inst.append((p.x, p.y, s, pidx, 0.9 + 0.2 * rng("bb", k).random(), rng("bbr", k).random()))
            placements[pidx]["countModelled"] = 1
            k += 1

    # ---- meadows: low-density matrix of the listed species (arrangement unknown)
    for key, lst in (("MW", C.MEADOW_WEST), ("ME", C.MEADOW_EAST)):
        mp = bed_polys[key]
        sids = [meadow_ids[n] for n in lst]
        real = C.STATS["meadows"]
        tot = real["graminoids"][1] + real["forbs"][1] + real["shrubs"][1]
        share = mp.area / (bed_polys["MW"].area + bed_polys["ME"].area)
        pidx = add_pl({"id": f"pl.{key}.mix", "bedId": f"bed.{key}", "recipeId": f"mix.{key}", "kind": "area", "role": "meadow",
                       "legendCode": None, "speciesIds": sids, "geometry": None, "geometryRef": f"bed.{key}",
                       "areaM2": round(mp.area, 1), "countEstimatedReal": round(tot * share),
                       "countBasis": "official meadow totals × area share", "positionSource": "generated-schematic",
                       "status": "schematic", "dataKind": "hypothetical", "sourceRefs": ["S-OGD-MEADOW", "S-MODEL"],
                       "note": "Species list documented; their arrangement, density and hydrology zoning are not published."})
        rnd = rng("meadow", key)
        n = int(tot * share * 0.3)
        pts = poisson(mp.buffer(-0.3), max(0.5, 0.8 * math.sqrt(mp.area / n)), rnd, max_pts=n)
        grass_sids = [s for s in sids if species[s]["plantType"] == "grass"]
        forb_sids = [s for s in sids if species[s]["plantType"] == "forb"]
        shrub_sids = [s for s in sids if species[s]["plantType"] == "shrub"]
        for i, (x, y) in enumerate(pts):
            # visual drifts: each ~7 m cell favours three species (illustrative; real arrangement unpublished)
            cr = rng("drift", key, int(math.floor(x / 7)), int(math.floor(y / 7)))
            dom_g = [cr.choice(grass_sids) for _ in range(2)]
            dom_f = [cr.choice(forb_sids) for _ in range(2)]
            gshare = 0.6 + 0.3 * cr.random()
            u = rnd.random()
            if u < 0.012 and shrub_sids:
                s = rnd.choice(shrub_sids)
            elif rnd.random() < gshare:
                s = rnd.choice(dom_g) if rnd.random() < 0.75 else rnd.choice(grass_sids)
            else:
                s = rnd.choice(dom_f) if rnd.random() < 0.7 else rnd.choice(forb_sids)
            inst.append((x, y, s, pidx, 0.6 + 0.9 * rnd.random(), rnd.random()))
        placements[pidx]["countModelled"] = len(pts)

    # ---------------------------------------------------------------- instances.bin
    sp_list = sorted(species.keys())
    sp_index = {s: i for i, s in enumerate(sp_list)}
    # sort instances by placement for range lookup
    inst_sorted = sorted(range(len(inst)), key=lambda i: (inst[i][3] if inst[i][3] is not None else -1, i))
    buf = bytearray()
    ranges = {}
    for n, i in enumerate(inst_sorted):
        x, y, s, pidx, sc, rot = inst[i]
        pi_ = 65535 if pidx is None else pidx
        buf += struct.pack("<ffHHBBH", x, y, sp_index[s], pi_, max(0, min(255, int(sc * 100))), int(rot * 255) & 255, 0)
        if pidx is not None:
            a, b = ranges.get(pidx, (n, 0))
            ranges[pidx] = (a, b + 1)
    open(os.path.join(OUT, "instances.bin"), "wb").write(bytes(buf))
    for pidx, (a, b) in ranges.items():
        placements[pidx]["instanceRange"] = [a, b]

    # ---------------------------------------------------------------- fields
    terrain = json.load(open(os.path.join(OUT, "terrain.json")))
    fields = [
        dict(terrain, name="Elevation", units="m (NAVD88)", resolutionM=1.0, time="3DEP dynamic service, accessed 2026-11-26",
             sourceRefs=["S-3DEP"], validExtent=EXTENT, status="available", dataKind="source",
             note="Site-scale terrain only; bed micro-topography (crowning, edging steps) is not captured at 1 m."),
        {"id": "field.slope", "name": "Slope", "units": "degrees", "status": "derived", "dataKind": "inferred", "derivedFrom": "field.elevation",
         "method": "central differences on the 1 m grid", "validExtent": EXTENT, "sourceRefs": ["S-3DEP"]},
        {"id": "field.distance-to-path", "name": "Distance to nearest walk", "units": "m", "status": "derived", "dataKind": "inferred",
         "derivedFrom": ["built.gravel-walks", "built.grass-walks", "context.sidewalks"], "method": "Euclidean distance to path polygons, computed on query",
         "validExtent": EXTENT, "sourceRefs": ["S-OSM"]},
        {"id": "field.sun", "name": "Sun / shade", "units": None, "status": "unknown", "dataKind": None, "sourceRefs": [],
         "note": "No measured or modelled insolation is available. Returns null (unknown), never 0."},
        {"id": "field.moisture", "name": "Soil moisture / hydrology", "units": None, "status": "unknown", "dataKind": None, "sourceRefs": ["S-OGD-MEADOW"],
         "note": "Meadow species carry hydrology-zone attributes on the official list, but the zones are not mapped."},
        {"id": "field.ph", "name": "Soil pH", "units": "pH", "status": "unknown", "dataKind": None, "sourceRefs": [], "note": "Not published."},
    ]

    # ---------------------------------------------------------------- species records
    sp_out = []
    for sid in sp_list:
        s = dict(species[sid])
        s["index"] = sp_index[sid]
        s["sourceRefs"] = s.get("sourceRefs") or (["S-OGD-MEADOW"] if sid.startswith("sp.m-") else ["S-OGD-PL-2026", "S-OGD-FA-2019", "S-OGD-FB-2019", "S-OGD-FC-2019"])
        s["inferredFields"] = ["formProxy", "nominalHeightM", "nominalSpreadM", "displayFlower", "displayLeaf"]
        s["phenology"] = None
        s["temporal"] = {"plantingDate": None, "initialHeightM": None, "matureHeightM": None, "seasonalStates": None}
        s["canonicalKey"] = (s["scientificName"] + (" '" + s["cultivar"] + "'" if s.get("cultivar") else "")).strip()
        sp_out.append(s)

    model = {
        "schema": "generative-planting/spatial-model",
        "schemaVersion": "0.3",
        "project": {
            "caseId": "oudolf-garden-detroit", "name": "Oudolf Garden Detroit", "designer": "Piet Oudolf",
            "location": "Belle Isle, Detroit, Michigan, USA", "version": VERSION, "built": "2026-11-26",
            "reconstructionEpoch": {"id": "design-2019-10+bulbs-2020-09",
                                    "description": "Planting intent of Oudolf's revised plans (Oct 2019) and bulb plans (Sept 2020) on the as-built bed outlines (OSM). Statistics as of March 2023; plant lists Feb 2026 kept as dated references.",
                                    "notCurrentSurvey": True},
            "coordinateSystem": {"id": "OGD-LOCAL-2026", "units": "m", "axes": "x = east, y = north, z = up (elevation)",
                                 "origin": {"lat": LAT0, "lon": LON0, "note": "OSM point of the Main Garden"},
                                 "projection": "local tangent plane (equirectangular, WGS84 radii at origin); < 2 cm distortion over the extent",
                                 "horizontalDatum": "WGS84 (via OSM)", "verticalDatum": "NAVD88 (USGS 3DEP)",
                                 "threeJs": "renderer uses y-up: three(x, y, z) = (x, elevation, -y)",
                                 "north": [0, 1], "extent": EXTENT},
            "uncertainty": {"bedOutlines": "OSM mapper accuracy, visually within ~0.5 m of NAIP", "elevation": "3DEP 1 m, vertical ~0.1 m",
                            "patchesAndPlants": "schematic (generated), not surveyed",
                            "meadowOutlines": "schematic, area matched to official acreage"},
            "officialStatistics": C.STATS,
            "attribution": ["© OpenStreetMap contributors (ODbL)", "USGS / USDA The National Map (public domain)",
                            "Planting facts: Oudolf Garden Detroit & Piet Oudolf (cited, not reproduced)"],
        },
        "sources": SOURCES,
        "layers": build_layers(),
        "objects": objects,
        "species": sp_out,
        "recipes": recipes,
        "placements": placements,
        "instances": {"file": "instances.bin", "count": len(inst), "stride": 16,
                      "layout": "float32 x, float32 y, uint16 speciesIndex, uint16 placementIndex (65535 = none), uint8 scale*100, uint8 rotation*255/2π, uint16 pad",
                      "note": "Visual proxies: ~0.42 per real plant for perennials, ~0.12 per bulb, 1 per tree/shrub. Seeded and stable across reloads; not surveyed plant positions.",
                      "visualRatio": {"perennial": VIS, "bulb": VIS_BULB, "woody": 1.0}},
        "fields": fields,
        "versioning": {"baseline": "immutable", "drafts": "operations patch list applied to a copy (see MODEL_CONTRACT.md)"},
    }
    json.dump(model, open(os.path.join(OUT, "model.json"), "w"), separators=(",", ":"))
    # summary
    from collections import Counter
    print("objects", len(objects), Counter(o["type"] for o in objects))
    print("placements", len(placements), Counter(p["kind"] for p in placements))
    print("instances", len(inst), "species", len(sp_out), "size", os.path.getsize(os.path.join(OUT, "model.json")) // 1024, "KB")
    print({k: round(v, 1) for k, v in style_area.items()}, "tri", round(tri_area, 1))


if __name__ == "__main__":
    main()
