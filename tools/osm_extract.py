"""Read sources/raw/osm_map.json into local-frame features (shared helper)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from geo import to_local

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load():
    d = json.load(open(os.path.join(ROOT, "sources", "raw", "osm_map.json")))
    els = d["elements"]
    nodes = {e["id"]: e for e in els if e["type"] == "node"}
    ways = {e["id"]: e for e in els if e["type"] == "way"}
    rels = {e["id"]: e for e in els if e["type"] == "relation"}
    return nodes, ways, rels


def way_coords(nodes, w):
    out = []
    for n in w["nodes"]:
        if n in nodes:
            nd = nodes[n]
            x, y = to_local(nd["lat"], nd["lon"])
            out.append((round(x, 3), round(y, 3)))
    return out


def join_rings(segments):
    """Join open way segments into closed rings (for multipolygon members)."""
    segs = [list(s) for s in segments if len(s) > 1]
    rings = []
    while segs:
        ring = segs.pop(0)
        changed = True
        while ring[0] != ring[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == ring[-1]:
                    ring += s[1:]; segs.pop(i); changed = True; break
                if s[-1] == ring[-1]:
                    ring += s[::-1][1:]; segs.pop(i); changed = True; break
                if s[-1] == ring[0]:
                    ring = s + ring[1:]; segs.pop(i); changed = True; break
                if s[0] == ring[0]:
                    ring = s[::-1] + ring[1:]; segs.pop(i); changed = True; break
        rings.append(ring)
    return rings
