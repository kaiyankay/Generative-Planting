#!/usr/bin/env python3
"""Real data for the Phase 02A.1 interface mock-ups (design study, not product code).

  python3 -I tools/knowledge/mockup_data.py

Reads knowledge/data/seed.json and writes docs/knowledge/redesign-02a1/data.js (window.MOCK). Every number, name,
link and value drawn in the mock-ups comes from here; the layout coordinates are computed, never hand-placed data.
"""
import json, math, os, random, re, sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "docs", "knowledge", "redesign-02a1")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kq  # noqa: E402
S = kq.load_seed()
E = {e["id"]: e for e in S["entities"]}; R = S["records"]; SRC = {s["id"]: s for s in S["sources"]}
ACTIVE = [r for r in R if r.get("active", True)]
PLANTS = [e["id"] for e in S["entities"] if e.get("seedSet") == "planting-db-10"]
GF = {r["from"]: E[r["to"]]["name"] for r in S["relations"] if r["predicate"] == "is_growth_form"}
ORIGIN = {}
for p in PLANTS: ORIGIN[p] = E[p]["legacy"]["entity"].get("origin_status", "")
CULT = {r["from"]: r["to"] for r in S["relations"] if r["predicate"] == "cultivar_of"}
ROB = {r["subjects"][0]: r for r in R if r["id"].startswith("obs:robertson-1929:")}

# ---------- 1. shared-knowledge network of the ten full profiles ----------
THEMES = {"water": ("Water & soil", ["water", "soil"]), "tolerance": ("Tolerance", ["stress"]), "ecology": ("Ecology", ["ecology"]),
          "light": ("Light", ["exposure"]), "use": ("Use & season", ["use", "interest"])}
FACET_THEME = {f: t for t, (_, fs) in THEMES.items() for f in fs}
support = defaultdict(lambda: defaultdict(set))      # concept → plant → source ids
recs = defaultdict(lambda: defaultdict(list))
for r in ACTIVE:
    if r["layer"] != "planting-db claim": continue
    for c in r["concepts"]:
        support[c][r["subjects"][0]].add(r["sourceRefs"][0]["sourceId"]); recs[c][r["subjects"][0]].append(r["id"])
hubs, common = [], []
for c, by in support.items():
    f = E[c].get("facet"); t = FACET_THEME.get(f)
    if not t: continue
    n = len(by)
    if n >= 8: common.append({"id": c, "label": E[c]["name"], "plants": n, "theme": t}); continue
    if n < 2: continue
    if f == "use" and E[c]["name"] not in ("Ground cover", "Native planting", "Rock garden", "Mixed shrub border"): continue
    hubs.append({"id": c, "label": E[c]["name"], "theme": t, "facet": f, "plants": sorted(by),
                 "sources": {p: sorted(v) for p, v in by.items()}, "records": {p: recs[c][p] for p in by}})
hubs.sort(key=lambda h: (list(THEMES).index(h["theme"]), -len(h["plants"]), h["label"]))
colisted = [{"a": r["subjects"][0], "b": r["objects"][0], "id": r["id"], "source": r["sourceRefs"][0]["sourceId"]}
            for r in ACTIVE if r["predicate"] == "co_listed"]

# topical groups: plants grouped by the shared concepts they carry (average linkage on Jaccard) — an analysis, never drawn as links
sets = {p: {h["id"] for h in hubs if p in h["plants"]} for p in PLANTS}
jac = lambda a, b: len(sets[a] & sets[b]) / max(1, len(sets[a] | sets[b]))
groups = [[p] for p in PLANTS]
while len(groups) > 3:
    best = max(((i, j) for i in range(len(groups)) for j in range(i + 1, len(groups))),
               key=lambda ij: sum(jac(a, b) for a in groups[ij[0]] for b in groups[ij[1]]) / (len(groups[ij[0]]) * len(groups[ij[1]])))
    groups[best[0]] += groups[best[1]]; del groups[best[1]]
clusters = []
for g in sorted(groups, key=len, reverse=True):
    cnt = Counter(h for p in g for h in sets[p])
    top = [E[h]["name"] for h, n in cnt.most_common() if n >= max(2, math.ceil(len(g) * .6))][:4]
    clusters.append({"plants": g, "sharedBy": top})
# gaps: themes where a plant has no shared concept at all
gaps = []
for p in PLANTS:
    for t in ("ecology", "tolerance"):
        if not any(p in h["plants"] for h in hubs if h["theme"] == t):
            gaps.append({"plant": p, "theme": THEMES[t][0]})

# force layout (bipartite, deterministic) for the default themes
DEFAULT_THEMES = ["water", "tolerance", "ecology", "light"]
nodes = [{"id": p, "kind": "plant"} for p in PLANTS] + [{"id": h["id"], "kind": "hub"} for h in hubs if h["theme"] in DEFAULT_THEMES]
links = [(h["id"], p, len(h["sources"][p])) for h in hubs if h["theme"] in DEFAULT_THEMES for p in h["plants"]]
links += [(c["a"], c["b"], 1) for c in colisted]
rnd = random.Random(7); pos = {n["id"]: [rnd.uniform(-1, 1), rnd.uniform(-1, 1)] for n in nodes}
for it in range(900):
    a = 0.05 * (1 - it / 900) + 0.002
    disp = {k: [0.0, 0.0] for k in pos}
    ids = list(pos)
    for i, u in enumerate(ids):
        for v in ids[i + 1:]:
            dx, dy = pos[u][0] - pos[v][0], pos[u][1] - pos[v][1]; d2 = dx * dx + dy * dy + 1e-4
            f = 0.012 / d2
            disp[u][0] += dx * f; disp[u][1] += dy * f; disp[v][0] -= dx * f; disp[v][1] -= dy * f
    for u, v, w in links:
        dx, dy = pos[u][0] - pos[v][0], pos[u][1] - pos[v][1]; d = math.hypot(dx, dy) + 1e-6
        f = (d - 0.32) * 0.9
        disp[u][0] -= dx / d * f; disp[u][1] -= dy / d * f; disp[v][0] += dx / d * f; disp[v][1] += dy / d * f
    for k in pos:
        disp[k][0] -= pos[k][0] * 0.08; disp[k][1] -= pos[k][1] * 0.08
        m = math.hypot(*disp[k]) + 1e-9; s = min(m, 0.08) * a / 0.05
        pos[k][0] += disp[k][0] / m * s; pos[k][1] += disp[k][1] / m * s
xs = [v[0] for v in pos.values()]; ys = [v[1] for v in pos.values()]
norm = {k: [(v[0] - min(xs)) / (max(xs) - min(xs)), (v[1] - min(ys)) / (max(ys) - min(ys))] for k, v in pos.items()}

def plant_card(p):
    e = E[p]; ent = e["legacy"]["entity"]
    n = sum(1 for r in ACTIVE if p in r["subjects"])
    srcs = {r["sourceRefs"][0]["sourceId"] for r in ACTIVE if p in r["subjects"]}
    return {"id": p, "name": e["name"], "common": e.get("commonName"), "growthForm": GF.get(p, ""), "records": n,
            "sources": len({s for s in srcs if not s.startswith("survey-r")}), "surveyRespondents": len(set(ent.get("survey_respondents", []))),
            "origin": ORIGIN.get(p, ""), "art": f"art/{p}.webp"}

# ---------- 2. collections (left rail) ----------
detroit_taxa = [e for e in S["entities"] if e.get("layer") in ("Detroit model taxon", "Phase 02A taxon") and e["type"] in ("plant", "cultivar")]
survey_recs = [r for r in R if r["sourceRefs"][0]["sourceId"].startswith("survey-r")]
local_src = {"cov_trees": "Vancouver street trees (City open data)", "inat": "iNaturalist, Greater Vancouver", "eflora": "E-Flora BC"}
collections = {
    "library": {"full": len(PLANTS), "planTaxa": len(detroit_taxa), "candidates": sum(1 for e in S["entities"] if e.get("status") == "candidate"), "mine": 0},
    "survey": {"respondents": sum(1 for s in S["sources"] if s["id"].startswith("survey-r")), "statements": len(survey_recs),
               "kinds": dict(Counter(r["knowledgeKind"] for r in survey_recs)), "beyondLibrary": sum(1 for e in S["entities"] if e.get("status") == "candidate")},
    "research": {"robertsonPlants": len(ROB), "robertsonRows": len(next(d for d in S["datasets"] if d["id"] == "ds:robertson-1929")["rows"]),
                 "literatureRelations": sum(1 for r in S["relations"] if r["predicate"] in ("requires_trait", "typically_formed_by", "maps_to", "corresponds_to"))},
    "recipes": {"recipes": sum(1 for e in S["entities"] if e["type"] == "planting_system"), "roleRecords": sum(1 for r in R if r["predicate"] == "fills_role")},
    "local": {"water": sum(1 for r in R if r["id"].startswith("mvw:")), **{k: sum(1 for r in ACTIVE if r["sourceRefs"][0]["sourceId"] == k) for k in local_src}},
}
recipe_list = []
for e in S["entities"]:
    if e["type"] != "planting_system": continue
    mix = e["spatialRecipeId"]
    mem = {s for r in R if r["predicate"] == "fills_role" and r["objects"][0].startswith(f"role:{mix}:") for s in r["subjects"]}
    recipe_list.append({"id": e["id"], "name": e["name"], "members": len(mem)})

# ---------- 3. recipe B: composition ----------
mix = "mix.B-matrix"; ORDER = ["emergent", "scatter", "group", "matrix", "bulb-scatter", "bulb-cluster", "bulb-line", "bulb-drift"]
roles = defaultdict(list)
for r in R:
    if r["predicate"] != "fills_role" or not r["objects"][0].startswith(f"role:{mix}:"): continue
    for s in r["subjects"]:
        e = E[s]; species = CULT.get(s)
        rob = ROB.get(s) or (ROB.get(species) if species else None)
        roles[r["value"]["data"]["drawingRole"]].append({
            "id": s, "name": e["name"], "type": e["type"], "status": e["status"], "legend": r["value"]["data"]["legendCode"],
            "speciesProfile": species if species in PLANTS else (s if s in PLANTS else None),
            "robertson": rob["value"]["data"]["listed_visitor_taxa"] if rob else None, "robertsonVia": "species" if (rob and s not in ROB) else ("taxon" if rob else None),
            "recordId": r["id"]})
recipe = {"id": "system:" + mix, "name": E["system:" + mix]["name"], "note": "Sporobolus heterolepis is the documented matrix grass; groups and scattered emergents sit within it.",
          "roleNote": E["system:" + mix]["note"], "roles": [{"role": k, "members": roles[k]} for k in ORDER if roles.get(k)],
          "members": len({m["id"] for v in roles.values() for m in v})}
rob_items = sorted([{"name": m["name"], "count": m["robertson"], "via": m["robertsonVia"], "role": k} for k, v in roles.items() for m in v if m["robertson"]],
                   key=lambda x: -x["count"])

# ---------- 4. Yarrow (species behind 'Terra Cotta') ----------
Y = "achillea-millefolium"
def months(r):
    d = r["value"]["data"]; return d.get("flowering_months") if isinstance(d, dict) else None
yar_season = [{"source": r["sourceRefs"][0]["sourceId"], "sourceName": SRC.get(r["sourceRefs"][0]["sourceId"], {}).get("name", ""), "place": E.get(r["context"]["place"], {}).get("name", ""),
               "months": months(r)} for r in ACTIVE if Y in r["subjects"] and r["predicate"] == "seasonal_interest" and months(r)]
yar_survey = [{"id": r["id"], "text": r["statement"], "kind": r["knowledgeKind"], "respondent": r["sourceRefs"][0]["sourceId"]} for r in ACTIVE if Y in r["subjects"] and r["sourceRefs"][0]["sourceId"].startswith("survey-r")]
yar_water = [{"value": (r["value"].get("value_label") or r["value"]["data"]), "source": r["sourceRefs"][0]["sourceId"], "place": E.get(r["context"]["place"], {}).get("name", "")}
             for r in ACTIVE if Y in r["subjects"] and r["predicate"] == "water_drainage"]
yar_drought = [{"source": r["sourceRefs"][0]["sourceId"], "text": r["statement"], "place": E.get(r["context"]["place"], {}).get("name", "")}
               for r in ACTIVE if Y in r["subjects"] and "stress:drought" in r["concepts"]]
yarrow = {**plant_card(Y), "season": yar_season, "survey": yar_survey, "water": yar_water, "drought": yar_drought,
          "robertson": ROB[Y]["value"]["data"]["listed_visitor_taxa"], "photo": {"file": "img/achillea-millefolium-card.jpg"}}

# ---------- 5. compare rows for recipe members with any knowledge ----------
compare = []
for k in ORDER:
    for m in roles.get(k, []):
        if not (m["robertson"] or m["speciesProfile"] or k == "matrix"): continue
        sp = m["speciesProfile"]
        row = {"name": m["name"], "role": k, "type": m["type"], "profile": bool(sp), "profileRecords": plant_card(sp)["records"] if sp else 0,
               "robertson": m["robertson"], "robertsonVia": m["robertsonVia"], "season": [], "water": [], "survey": 0}
        if sp:
            row["season"] = [x for x in yar_season] if sp == Y else []
            row["water"] = sorted({str(x["value"]) for x in yar_water}) if sp == Y else []
            row["survey"] = len({x["respondent"] for x in yar_survey}) if sp == Y else 0
        compare.append(row)

# ---------- 6. data issues seen in the 02A screenshots ----------
dup = [r for r in R if r["layer"] == "planting-db claim" and "derived from the respondent's note" in r["statement"]]
issues = {"respondentNoteDerivedClaims": len(dup), "placeNodes": [p for p in ("place:vancouver", "place:metro_vancouver") if p in E],
          "robertsonNameMatchesOnly": len(ROB)}

data = {"generatedFrom": {"baseVersion": S["meta"]["baseVersion"], "plantingDb": S["meta"]["plantingDb"]["sha"][:7]},
        "plants": [plant_card(p) for p in PLANTS], "hubs": hubs, "commonGround": common, "colisted": colisted, "clusters": clusters, "gaps": gaps,
        "themes": {k: v[0] for k, v in THEMES.items()}, "defaultThemes": DEFAULT_THEMES, "layout": norm,
        "collections": collections, "recipeList": recipe_list, "recipe": recipe, "robertson": rob_items, "yarrow": yarrow, "compare": compare, "issues": issues}
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "data.js"), "w", encoding="utf-8") as f:
    f.write("window.MOCK = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n")
print(json.dumps({"hubs": len(hubs), "defaultHubs": sum(1 for h in hubs if h["theme"] in DEFAULT_THEMES), "links": len(links), "clusters": clusters, "gaps": gaps,
                  "common": common, "recipeMembers": recipe["members"], "robertson": rob_items, "compareRows": len(compare), "collections": collections,
                  "yarSeason": yar_season, "yarSurvey": yar_survey, "issues": issues}, ensure_ascii=False, indent=0)[:4000])
