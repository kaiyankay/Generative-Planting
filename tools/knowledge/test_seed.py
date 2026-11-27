#!/usr/bin/env python3
"""Migration checks for the knowledge Base snapshot (T01, T11 file part, T12 mapping part).

  python3 -I tools/knowledge/test_seed.py [--repo ../planting-db]

Compares knowledge/data/seed.json with planting-db at the pinned SHA, claim by claim. Writes docs/qa/knowledge_seed_tests.json.
"""
import argparse, glob, hashlib, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import build_seed as B  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append({"name": name, "ok": bool(ok), "detail": str(detail)[:400]})
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  -> " + str(detail)[:300]))


def notrun(name, why):
    print("NOT RUN " + name + " — " + why); notrun_list.append({"name": name, "why": why})


notrun_list = []


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--repo", default=os.path.join(os.path.dirname(ROOT), "planting-db")); a = ap.parse_args()
    pub_path = os.path.join(ROOT, "knowledge", "data", "seed.json")                 # published copy
    full_path = os.path.join(ROOT, "knowledge", "data", "local", "seed.json")       # full research copy (git-ignored), when on this machine
    seed_path = full_path if os.path.exists(full_path) else pub_path
    S = json.load(open(seed_path, encoding="utf-8")); P = json.load(open(pub_path, encoding="utf-8"))
    print("seed under test:", "full local research copy" if seed_path == full_path else "public copy (the full copy is not on this machine)")
    pdb = B.PDB(a.repo, S["meta"]["plantingDb"]["sha"])
    check("T01.a seed pinned to the planting-db SHA", S["meta"]["plantingDb"]["sha"] == B.PDB_SHA, S["meta"]["plantingDb"])
    R = {r["id"]: r for r in S["records"]}; E = {e["id"]: e for e in S["entities"]}

    # every claim: same id, rebuilt exactly
    n = bad = 0; firstbad = None
    for pf in pdb.ls("plants"):
        for cl in pdb.json(pf)["claims"]:
            n += 1
            r = R.get(cl["id"])
            if not r or B.to_legacy_claim(r) != cl or json.dumps(B.to_legacy_claim(r)) != json.dumps(cl):
                bad += 1; firstbad = firstbad or cl["id"]
    check(f"T01.b all {n} planting-db claims present with the same id and rebuilt byte-for-byte (key order kept)", bad == 0 and n == 615, f"{bad} differ, first {firstbad}")
    st = {}
    for r in S["records"]:
        if r.get("layer") == "planting-db claim": st[r["evidenceStatus"]] = st.get(r["evidenceStatus"], 0) + 1
    check("T01.c claim status kept: 534 unverified · 70 verified · 11 retired (retired = history, not active)",
          st == {"unverified": 534, "verified": 70, "retired": 11} and all(not R[i]["active"] for i in R if R[i].get("evidenceStatus") == "retired"), st)
    rels = pdb.json("relations.json")
    rb = [rl["id"] for rl in rels["relations"] if B.to_legacy_relation(R[rl["id"]]) != rl]
    check("T01.d all 41 relations.json rows rebuilt exactly (22 retired kept as history)", not rb and sum(1 for rl in rels["relations"] if not R[rl["id"]]["active"]) == 22, rb[:3])
    check("T01.e all 19 outside_db companion notes kept", sum(1 for r in S["records"] if r["predicate"] == "names_companions_outside_db") == len(rels["outside_db"]) == 19)
    cand = pdb.json("data/survey/candidate_evidence.json")["entries"]
    check("T01.f all 39 survey candidate records searchable (anonymous ids, verbatim text, status unreviewed)",
          all(c["id"] in R and R[c["id"]]["value"]["data"] == c["text"] and R[c["id"]]["sourceRefs"][0]["sourceId"] == c["source_id"] for c in cand) and len(cand) == 39)
    plants = [e for e in S["entities"] if e.get("seedSet") == "planting-db-10"]
    check("T01.g ten seed plants keep their original ids", sorted(p["id"] for p in plants) == sorted(os.path.basename(p)[:-5] for p in pdb.ls("plants")) and len(plants) == 10)
    src = pdb.json("sources.json")["sources"]
    check("T01.h all 35 planting-db sources kept with their licence fields", all(any(s2["id"] == s["id"] and s2.get("licence") == s.get("licence") for s2 in S["sources"]) for s in src))
    ont = pdb.json("ontology.json")["nodes"]
    check("T01.i all 438 ontology concepts are entities with their labels", all(n_["id"] in E and E[n_["id"]]["name"] == n_["label"] for n_ in ont))
    # projection parity with the old graph: (claim, concept) pairs = kg.json claim edges with a target
    kg = pdb.json("brain/data/kg.json")
    old = sorted((e["claim_id"], e["target"]) for e in kg["edges"] if e["type"] == "claim" and e.get("target"))
    new = sorted((r["id"], c) for r in S["records"] if r.get("layer") == "planting-db claim" for c in r["concepts"])
    check(f"T01.j claim→concept edges projectable from records = kg.json at the SHA ({len(old)})", old == new, (len(old), len(new)))
    der = [r for r in S["relations"] if r["formation"] in ("derived", "candidate") and r["layer"] == "planting-db kg"]
    check("T01.k rule-derived kg edges keep their rule and supporting claims (KG-R2/R5/R1/R4, M29)",
          all(r["supportingRecordIds"] or r["predicate"] in ("maps_to", "corresponds_to") for r in der) and all(all(s in R for s in r["supportingRecordIds"]) for r in der), len(der))
    check("T01.l AI source assessments kept apart from verification (534 assessments; none changes a status)", len(S["aiChecks"]) == 534 and st.get("verified") == 70)

    # idempotent: a second build gives the same bytes
    if seed_path == full_path:
        before = [hashlib.sha256(open(p, "rb").read()).hexdigest() for p in (full_path, pub_path)]
        subprocess.run([sys.executable, "-I", os.path.join(HERE, "build_seed.py"), "--repo", a.repo], check=True, capture_output=True)
        after = [hashlib.sha256(open(p, "rb").read()).hexdigest() for p in (full_path, pub_path)]
        check("T01.m rebuild is byte-identical for both copies (no duplicate records on re-run)", before == after, ([b[:12] for b in before], [x[:12] for x in after]))
    else:
        notrun("T01.m rebuild", "needs the licence-restricted research sources, which are not published")

    # new Phase 02A material is sourced and keeps its grain
    rob = [r for r in S["records"] if r["id"].startswith("obs:robertson-1929:")]
    ds = next(d for d in S["datasets"] if d["id"] == "ds:robertson-1929")
    check("T06.a Robertson 1929 rows kept unchanged (1998 rows, 38 plants; in the public copy the rows stay local and only their number is kept); per-plant record = count of listed visitor taxa with unit; no score field",
          (len(ds["rows"]) if seed_path == full_path else ds.get("rowsLocalOnly")) == 1998 and len(rob) == 38 and all(set(r["value"]["data"]) == {"listed_visitor_taxa", "rows"} and r["value"]["unit"] for r in rob))
    yar = R.get("obs:robertson-1929:achillea-millefolium")
    check("T06.b Robertson's Achillea millefolium attaches to the existing achillea-millefolium (no duplicate entity)", yar and yar["subjects"] == ["achillea-millefolium"])
    wat = [r for r in S["records"] if r["id"].startswith("mvw:")]
    check("T07.a 7 Metro Vancouver water records: no plant subject, place Metro Vancouver, quote verified, no litres-saved claims",
          len(wat) == 7 and all(all(E[s]["type"] == "topic" for s in r["subjects"]) and r["context"]["place"] == "place:vancouver" and r["sourceRefs"][0]["quoteVerified"] for r in wat)
          and not any(re.search(r"sav(e|es|ing) \d|litres? saved", r["statement"]) for r in wat))
    fr = [r for r in S["records"] if r["predicate"] == "fills_role"]
    check("T08.a Detroit roles are per recipe: every fills_role points at a role of one system; ecological role null (unknown)",
          fr and all(o.startswith("role:mix.") and E[o]["system"] for r in fr for o in r["objects"]) and all(r["value"]["data"]["ecologicalRole"] is None for r in fr), len(fr))
    roles = [e for e in S["entities"] if e["type"] == "role"]
    check("T08.b the same drawing role name in two recipes is two role entities", len({e["roleName"] for e in roles}) < len(roles), len(roles))

    # spatial mapping (read-only)
    sm = json.load(open(os.path.join(ROOT, "knowledge", "data", "species_map.json")))
    model = json.load(open(os.path.join(ROOT, "data", "detroit", "model.json")))
    check("T12.a every spatial sp.* id has a mapping row with a status", sorted(r["spatialId"] for r in sm["species"]) == sorted(s["id"] for s in model["species"]))
    terra = next(r for r in sm["species"] if r["spatialId"] == "sp.achillea-terracotta")
    check("T12.b cultivar never merged: Achillea millefolium 'Terra Cotta' is its own entity, cultivar_of achillea-millefolium",
          terra["entityId"] != "achillea-millefolium" and terra.get("cultivarOf") == "achillea-millefolium")
    cs = [r for r in sm["species"] if r["spatialId"] in ("sp.cornus-sericea", "sp.m-cornus-sericea")]
    check("T12.c both Cornus sericea spatial ids resolve to planting-db cornus-sericea", all(r["entityId"] == "cornus-sericea" and r["status"] == "matched" for r in cs))
    check("T12.d placeholders and lawn stay unresolved (status placeholder / not_a_taxon)", sm["counts"].get("placeholder") == 3 and sm["counts"].get("not_a_taxon") == 1)
    check("T12.e seed build did not change the spatial model file", subprocess.run(["git", "-C", ROOT, "diff", "--quiet", "--", "data/"]).returncode == 0)

    # privacy (published files)
    blob = open(seed_path, encoding="utf-8").read() + open(pub_path, encoding="utf-8").read()
    pats = {"email": r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}", "api key": r"sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}", "raw survey export": r"responses-2026-11-\d\d\.csv\"\s*:",
            "respondent map": r"\"(respondent_map|response_id|real_name|ip_address)\"\s*:"}
    hits = {k: re.findall(p, blob)[:3] for k, p in pats.items() if re.findall(p, blob)}
    hits.pop("email", None) if all(h.endswith(("@metrovancouver.org",)) for h in hits.get("email", [])) else None
    check("T11.a seed has no e-mail, API key, raw survey export or respondent map", not hits, hits)
    priv = subprocess.run(["git", "-C", ROOT, "ls-files", "private-inputs"], capture_output=True, text=True).stdout.strip()
    check("T11.b private-inputs/ is git-ignored and nothing in it is tracked", not priv and "private-inputs/" in open(os.path.join(ROOT, ".gitignore")).read())
    slide_terms = ["Pollinator visits to forbs", "Claytonia virginica\",923", "PERENNIALS TO OVERSEED"]
    check("T11.c no slide tables or lists in the public seed", not any(t in blob for t in slide_terms))

    # ---- 02A.1 data-integrity regressions (seed side)
    places = [e for e in S["entities"] if e.get("facet") == "place"]
    named_mv = [e["id"] for e in places if e["name"] == "Metro Vancouver" or "Metro Vancouver" in (e.get("aliases") or [])]
    check("D10.a one place entity for Metro Vancouver (place:vancouver); the 02A duplicate place:metro_vancouver is gone",
          "place:metro_vancouver" not in E and named_mv == ["place:vancouver"], named_mv)
    check("D10.b Metro Vancouver water rules sit on place:vancouver (records and the applies_in object)",
          all(R[i]["context"]["place"] == "place:vancouver" and R[i]["objects"] == ["place:vancouver"] for i in R if i.startswith("mvw:")))
    parent = {r["from"]: r["to"] for r in S["relations"] if r["predicate"] == "narrower_than" and r["from"].startswith("place:")}
    def chain(p):
        out = [p]
        while out[-1] in parent and len(out) < 10: out.append(parent[out[-1]])
        return out
    check("D10.c every place reaches place:global through narrower_than (Detroit and Illinois joined via North America)",
          all(chain(p["id"])[-1] == "place:global" for p in places if p["id"] != "place:global"), {p["id"]: chain(p["id"]) for p in places if chain(p["id"])[-1] != "place:global"})
    rob = [r for r in S["records"] if r["id"].startswith("obs:robertson-1929:")]
    check("D11 Robertson 1929 plant matches are spelling-only leads: evidenceStatus 'name-match lead', taxonMatch.checked false, never 'documented'",
          len(rob) == 38 and all(r["evidenceStatus"] == "name-match lead" and r["taxonMatch"]["checked"] is False for r in rob))
    det = [e for e in S["entities"] if e.get("layer") == "Detroit model taxon"]
    check("D15 Detroit taxa carry only the plan's plant type; no inferred height, spread or colour from the spatial model enters the knowledge base",
          sum(1 for e in det if e.get("plantType")) > 200 and not any(k in e for e in det for k in ("nominalHeightM", "nominalSpreadM", "displayFlower", "displayLeaf", "formProxy")))

    # the published copy: everything except the licence-restricted rows and quotes
    if seed_path == full_path:
        check("P01 the public copy is exactly public_seed(full copy) — nothing else differs", P == B.public_seed(S))
        pub_text = open(pub_path, encoding="utf-8").read()
        quotes = [r["quote"] for r in S["records"] if r.get("quote")]
        dsf = next(d for d in S["datasets"] if d["id"] == "ds:robertson-1929"); ti = dsf["columns"].index("targetTaxonName")
        names = {e["name"] for e in S["entities"]} | {x for e in S["entities"] for x in e.get("aliases", [])}
        leak = [i for i in {row[ti] for row in dsf["rows"]} if len(i) > 6 and i in pub_text and i not in names]
        check("P02 the public copy holds no Metro Vancouver quote (whole or first 30 characters) and no Robertson row (no listed insect name)",
              len(quotes) == 7 and not any(q[:30] in pub_text for q in quotes) and not leak and not any(d["rows"] for d in P["datasets"] if d.get("sourceId") in B.RESTRICTED_SOURCES), leak[:5])
        check("P03 the public copy keeps every entity, record and relation; its base version differs and names the full one",
              [r["id"] for r in P["records"]] == [r["id"] for r in S["records"]] and len(P["entities"]) == len(S["entities"]) and len(P["relations"]) == len(S["relations"])
              and P["meta"]["copy"] == "public" and P["meta"]["fullBaseVersion"] == S["meta"]["baseVersion"] != P["meta"]["baseVersion"])
    else:
        check("P02 the public copy holds no restricted quote or dataset row", not any(r.get("quote") for r in P["records"] if any(s.get("sourceId") in B.RESTRICTED_SOURCES for s in r["sourceRefs"]))
              and not any(d["rows"] for d in P["datasets"] if d.get("sourceId") in B.RESTRICTED_SOURCES))
        notrun("P01/P03 public copy = public_seed(full copy)", "the full research copy is not on this machine")

    out = {"total": len(results), "ok": sum(r["ok"] for r in results), "results": results, "notRun": notrun_list, "seedUnderTest": "full" if seed_path == full_path else "public", "seed": S["meta"]}
    os.makedirs(os.path.join(ROOT, "docs", "qa"), exist_ok=True)
    json.dump(out, open(os.path.join(ROOT, "docs", "qa", "knowledge_seed_tests.json"), "w"), indent=1)
    print(f"\n{out['ok']}/{out['total']} passed")
    sys.exit(0 if out["ok"] == out["total"] else 1)


if __name__ == "__main__":
    main()
