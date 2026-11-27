#!/usr/bin/env python3
"""Build the read-only Base snapshot of the Dynamic Knowledge Canvas.

  python3 -I tools/knowledge/build_seed.py [--repo ../planting-db] [--sha <planting-db commit>]

Inputs (nothing is written back to any of them)
  planting-db @ PDB_SHA (read with `git show <sha>:<path>`, so the working tree of that repository does not matter)
      plants/*.json (entity + claims), relations.json, sources.json, synonyms.json, ontology.json,
      data/survey/candidate_evidence.json, review/ai/assessments/*.jsonl, brain/data/kg.json
  this repository
      data/detroit/model.json              species, recipes, sources of the spatial model (read only)
      sources/knowledge/robertson_1929_subset.tsv, metro_vancouver_water.json, fetch_log.json  (tools/knowledge/fetch_sources.py)
Outputs
  knowledge/data/local/seed.json           the full research copy · entities · records · relations · datasets · sources · predicates · aiChecks · meta
                                           (git-ignored: holds the licence-unclear Robertson rows and Metro Vancouver quotes)
  knowledge/data/seed.json                 the public copy: the same, minus those rows and quotes (public_seed); `--split` re-derives it
  knowledge/data/species_map.json          spatial sp.* id → knowledge entity (matched / cultivar_of / placeholder / not_a_taxon)
  knowledge/data/migration_manifest.json   counts in → out and everything left out, with the reason

Rules
  * A planting-db claim becomes one record with the SAME id. Mapped fields move into the record's generic slots; every other
    field is kept under `legacy`, and `to_legacy(record)` rebuilds the original claim exactly (tested for all claims).
  * relations.json rows become records with the same id (subject plant_a, object plant_b); retired rows stay as history.
  * Claim → concept edges are NOT copied from kg.json: the browser projects them from the records' `concepts`, so edits change
    them. kg.json edges that came from rules (KG-R1/R2/R4/R5, growth form) are kept as relations with `formation`
    derived/candidate and the record ids that support them; they are only shown while one supporting record is active.
  * New Phase 02A material is limited to sources that are real and checked: Detroit recipes (drawing roles only; ecological
    role unknown), Robertson 1929 visitor lists (presence rows, no scores), Metro Vancouver water rules (no plant subject).
Standard library only. Deterministic: same inputs → byte-identical outputs.
"""
import argparse, csv, glob, hashlib, json, os, re, subprocess, sys
from collections import Counter, defaultdict, OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PDB_SHA = "d5771049d06c5d0e8b68614613655cd15cd6ea43"     # kaiyankay/planting-db main, 2026-11-17 "Tidy: the website moved …"
OUT_DIR = os.path.join(ROOT, "knowledge", "data")
LOCAL_DIR = os.path.join(OUT_DIR, "local")          # git-ignored: the full research copy (seed.json) stays on this machine
# Licence not cleared for publication: their verbatim text / digitised rows exist only in the local copy. The public seed
# keeps every record (statements are paraphrases, counts are facts) without the quotes and without the dataset rows.
RESTRICTED_SOURCES = {"robertson-1929": "digitised table rows", "mv-water-restrictions": "verbatim page text", "mv-seasonal-lawn-care": "verbatim page text"}
LOCAL_NOTE = "kept in the local research copy (licence not cleared for publication)"


def public_seed(full):
    """The publishable copy of a full seed: same entities, records and relations, minus restricted quotes and dataset rows."""
    s = json.loads(json.dumps(full))
    for d in s["datasets"]:
        if d.get("sourceId") in RESTRICTED_SOURCES and d.get("rows"):
            d["rowsLocalOnly"] = len(d["rows"]); d["rows"] = []; d["restricted"] = "rows " + LOCAL_NOTE
    for r in s["records"]:
        if any(x.get("sourceId") in RESTRICTED_SOURCES for x in r.get("sourceRefs", [])):
            if r.pop("quote", None) is not None: r["quoteLocalOnly"] = True
            for x in r["sourceRefs"]:
                if x.get("sourceId") in RESTRICTED_SOURCES and str(x.get("locator", "")).startswith("quote:"): x["locator"] = "verbatim quote " + LOCAL_NOTE
    meta = s["meta"]; full_version = meta.pop("baseVersion")
    meta.update(copy="public", fullBaseVersion=full_version,
                restricted={k: v + " " + LOCAL_NOTE for k, v in RESTRICTED_SOURCES.items()})
    body = json.dumps(s, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
    meta["baseVersion"] = "base-" + hashlib.sha256(body.encode()).hexdigest()[:12]
    return s


def write_seeds(full):
    """Full copy → knowledge/data/local/seed.json (git-ignored); public copy → knowledge/data/seed.json (published)."""
    os.makedirs(LOCAL_DIR, exist_ok=True)
    with open(os.path.join(LOCAL_DIR, "seed.json"), "w", encoding="utf-8") as f: json.dump(full, f, ensure_ascii=False, separators=(",", ":"))
    pub = public_seed(full)
    with open(os.path.join(OUT_DIR, "seed.json"), "w", encoding="utf-8") as f: json.dump(pub, f, ensure_ascii=False, separators=(",", ":"))
    print("full", full["meta"]["baseVersion"], "→ knowledge/data/local/seed.json · public", pub["meta"]["baseVersion"], "→ knowledge/data/seed.json")

# claim fields that move into generic record slots (everything else goes to `legacy`)
CLAIM_MAPPED = ["id", "plant", "field", "value", "value_kind", "value_label", "text", "source_id", "source_type", "source_url", "accessed",
                "context", "place", "time", "conditions", "cultivar", "concepts", "status", "claim_kind", "confidence", "verification_scope"]
REL_MAPPED = ["id", "plant_a", "plant_b", "relation_type", "direction", "text", "source_id", "source_type", "source_url", "accessed", "context",
              "status", "confidence", "verification_scope"]
# the edge vocabulary of tools/build_kg.py (rel_for), reused so the projection names edges the way the old graph did
CAT_REL = {"cat:environment": "grows_in", "cat:morphology": "has_morphology", "cat:temporal": "has_temporal_trait", "cat:ecological": "has_ecological_value",
           "cat:growth_form_cat": "classified_as", "cat:taxonomy": "in_taxon", "cross:place": "recorded_in", "cross:time": "recorded_at_age"}
FIELD_REL = {"resistances": "resists", "pest_susceptibility": "susceptible_to", "landscape_use": "used_for", "ecological_value": "has_ecological_value"}

PREDICATES = OrderedDict([
    # claim fields (planting-db schema 0.4.3)
    ("hardiness_zone", {"label": "Hardiness zone", "group": "condition"}), ("exposure", {"label": "Light exposure", "group": "condition"}),
    ("water_drainage", {"label": "Water / drainage", "group": "condition"}), ("soil_type", {"label": "Soil", "group": "condition"}),
    ("mature_height", {"label": "Mature height", "group": "form", "unit": "m"}), ("mature_spread", {"label": "Mature spread", "group": "form", "unit": "m"}),
    ("local_mature_size", {"label": "Local mature size (Vancouver street trees)", "group": "form"}), ("form", {"label": "Form", "group": "form"}),
    ("habit", {"label": "Habit", "group": "form"}), ("texture", {"label": "Texture", "group": "form"}),
    ("growth_rate", {"label": "Growth rate", "group": "time"}), ("time_to_intended_size", {"label": "Time to intended size", "group": "time"}),
    ("seasonal_interest", {"label": "Seasonal interest / flowering", "group": "time"}), ("long_term_performance", {"label": "Long-term performance", "group": "time"}),
    ("ecological_value", {"label": "Ecological value", "group": "ecology"}), ("invasive_status", {"label": "Invasive status", "group": "ecology"}),
    ("toxicity", {"label": "Toxicity", "group": "ecology"}), ("resistances", {"label": "Tolerates / resists", "group": "condition"}),
    ("pest_susceptibility", {"label": "Pest / disease susceptibility", "group": "condition"}), ("maintenance_level", {"label": "Maintenance", "group": "practice"}),
    ("landscape_use", {"label": "Landscape use", "group": "practice"}), ("behaviour_with_others", {"label": "Behaviour with other plants", "group": "practice"}),
    ("vancouver_context", {"label": "Vancouver presence / context", "group": "place"}), ("in_vancouver_street_tree_list", {"label": "On Vancouver street tree list", "group": "place"}),
    # relation types (relations.json)
    ("co_listed", {"label": "co-listed by a designer", "group": "relation", "note": "co-mention only; not compatibility"}),
    ("companion", {"label": "companion", "group": "relation"}), ("competes", {"label": "competes with", "group": "relation"}),
    ("layered_under", {"label": "layered under", "group": "relation"}), ("names_companions_outside_db", {"label": "names companions not in the base", "group": "relation"}),
    # survey candidates
    ("selection_reason", {"label": "Reason a designer chose it (survey)", "group": "practice"}), ("practitioner_note", {"label": "Practitioner note (survey)", "group": "practice"}),
    # Phase 02A additions
    ("has_role", {"label": "has drawing role", "group": "system", "note": "a role belongs to one recipe"}),
    ("fills_role", {"label": "fills role (in this recipe only)", "group": "system", "note": "drawing role from the plan legend; ecological role unknown unless a record says so"}),
    ("has_observation", {"label": "has observation", "group": "ecology"}),
    ("listed_in", {"label": "listed in", "group": "list", "note": "membership of a named list; not co-occurrence, compatibility or tested adaptation"}),
    ("has_water_rule", {"label": "water-use rule", "group": "water"}), ("has_water_guidance", {"label": "water-use guidance", "group": "water"}),
    ("applies_in", {"label": "applies in", "group": "place"}), ("mentioned_in", {"label": "mentioned in", "group": "source"}),
    ("cultivar_of", {"label": "cultivar of", "group": "taxonomy"}), ("note", {"label": "note", "group": "personal"}),
    ("preference", {"label": "designer preference", "group": "personal"}), ("observation", {"label": "observation", "group": "personal"}),
    ("practice", {"label": "practice / experience", "group": "personal"}), ("project_requirement", {"label": "project requirement", "group": "personal"}),
    # projected edge names (kg vocabulary)
    ("grows_in", {"label": "grows in", "group": "edge"}), ("has_morphology", {"label": "has form", "group": "edge"}), ("has_temporal_trait", {"label": "has seasonal / temporal trait", "group": "edge"}),
    ("has_ecological_value", {"label": "has ecological value", "group": "edge"}), ("resists", {"label": "tolerates", "group": "edge"}),
    ("susceptible_to", {"label": "susceptible to", "group": "edge"}), ("used_for", {"label": "used for", "group": "edge"}), ("classified_as", {"label": "classified as", "group": "edge"}),
    ("in_taxon", {"label": "in taxon", "group": "edge"}), ("recorded_in", {"label": "recorded in", "group": "edge"}), ("recorded_at_age", {"label": "recorded at age", "group": "edge"}),
    ("has_trait", {"label": "has trait", "group": "edge"}), ("notes", {"label": "notes", "group": "edge"}),
    ("in_height_band", {"label": "in height band (KG-R2)", "group": "derived"}), ("occupies_layer", {"label": "occupies layer (KG-R5)", "group": "derived"}),
    ("suited_for", {"label": "suited for (KG-R1 / KG-R4)", "group": "derived"}), ("is_growth_form", {"label": "is growth form (M29)", "group": "derived"}),
    ("has_origin", {"label": "origin", "group": "edge"}), ("in_genus", {"label": "in genus", "group": "taxonomy"}), ("in_family", {"label": "in family", "group": "taxonomy"}),
    ("part_of", {"label": "part of", "group": "ontology"}), ("narrower_than", {"label": "narrower than", "group": "ontology"}),
    ("requires_trait", {"label": "requires trait", "group": "ontology"}), ("maps_to", {"label": "maps to", "group": "ontology"}),
    ("typically_formed_by", {"label": "typically formed by", "group": "ontology"}), ("corresponds_to", {"label": "corresponds to", "group": "ontology"}),
])


def slug(s):
    s = s.lower().replace("×", "x")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


class PDB:
    def __init__(self, repo, sha):
        self.repo, self.sha = repo, sha
        subprocess.run(["git", "-C", repo, "cat-file", "-e", sha + "^{commit}"], check=True)

    def read(self, path):
        return subprocess.run(["git", "-C", self.repo, "show", f"{self.sha}:{path}"], capture_output=True, check=True).stdout.decode("utf-8")

    def json(self, path):
        return json.loads(self.read(path))

    def ls(self, prefix):
        out = subprocess.run(["git", "-C", self.repo, "ls-tree", "--name-only", self.sha, prefix + "/"], capture_output=True, check=True).stdout.decode()
        return sorted(x for x in out.split("\n") if x)


def to_legacy_claim(r):
    """Rebuild the original planting-db claim from a record (inverse of claim_record)."""
    c = dict(r["legacy"]["fields"])
    c.update({"id": r["id"], "plant": r["subjects"][0], "field": r["predicate"], "value": r["value"]["data"], "value_kind": r["value"]["kind"],
              "text": r["statement"], "context": r["context"]["text"], "place": r["context"]["place"], "time": r["context"]["time"],
              "conditions": r["context"]["conditions"], "cultivar": r["context"]["cultivar"], "concepts": r["concepts"],
              "status": r["evidenceStatus"], "claim_kind": r["knowledgeKind"], "confidence": r["confidence"],
              "source_id": r["sourceRefs"][0]["sourceId"], "source_type": r["sourceRefs"][0]["sourceType"]})
    for k in ("value_label",):
        if k in r["value"]: c[k] = r["value"][k]
    for k, src in (("source_url", "url"), ("accessed", "accessed")):
        if src in r["sourceRefs"][0]: c[k] = r["sourceRefs"][0][src]
    if "verificationScope" in r: c["verification_scope"] = r["verificationScope"]
    order = r["legacy"]["order"]
    return {k: c[k] for k in order}


def claim_record(cl, plant_file):
    rest = {k: v for k, v in cl.items() if k not in CLAIM_MAPPED}
    sref = {"sourceId": cl["source_id"], "sourceType": cl["source_type"], "locator": f"planting-db plants/{plant_file} · claim {cl['id']}"}
    if "source_url" in cl: sref["url"] = cl["source_url"]
    if "accessed" in cl: sref["accessed"] = cl["accessed"]
    val = {"kind": cl["value_kind"], "data": cl["value"]}
    if "value_label" in cl: val["value_label"] = cl["value_label"]
    r = {"id": cl["id"], "subjects": [cl["plant"]], "objects": [], "predicate": cl["field"], "value": val, "statement": cl["text"],
         "context": {"text": cl["context"], "place": cl["place"], "time": cl["time"], "conditions": cl["conditions"], "cultivar": cl["cultivar"], "scope": "source"},
         "concepts": cl["concepts"], "sourceRefs": [sref], "origin": "preset", "knowledgeKind": cl["claim_kind"],
         "evidenceStatus": cl["status"], "active": cl["status"] != "retired", "confidence": cl["confidence"],
         "layer": "planting-db claim", "legacyRef": f"planting-db@{PDB_SHA[:7]}:plants/{plant_file}#{cl['id']}",
         "legacy": {"fields": rest, "order": list(cl.keys())}}
    if "verification_scope" in cl: r["verificationScope"] = cl["verification_scope"]
    return r


def to_legacy_relation(r):
    c = dict(r["legacy"]["fields"])
    s = r["sourceRefs"][0]
    c.update({"id": r["id"], "plant_a": r["subjects"][0], "plant_b": r["objects"][0], "relation_type": r["predicate"], "direction": r["value"]["data"]["direction"],
              "text": r["statement"], "source_id": s["sourceId"], "source_type": s["sourceType"], "context": r["context"]["text"],
              "status": r["evidenceStatus"], "confidence": r["confidence"]})
    if "url" in s: c["source_url"] = s["url"]
    if "accessed" in s: c["accessed"] = s["accessed"]
    if "verificationScope" in r: c["verification_scope"] = r["verificationScope"]
    return {k: c[k] for k in r["legacy"]["order"]}


def relation_record(rl):
    rest = {k: v for k, v in rl.items() if k not in REL_MAPPED}
    sref = {"sourceId": rl["source_id"], "sourceType": rl["source_type"], "locator": f"planting-db relations.json · {rl['id']}"}
    if "source_url" in rl: sref["url"] = rl["source_url"]
    if "accessed" in rl: sref["accessed"] = rl["accessed"]
    formation = "derived" if rl.get("rule") or rl.get("derived_from") else ("candidate" if rl.get("verify_against") else "documented")
    r = {"id": rl["id"], "subjects": [rl["plant_a"]], "objects": [rl["plant_b"]], "predicate": rl["relation_type"],
         "value": {"kind": "relation", "data": {"direction": rl["direction"]}}, "statement": rl["text"],
         "context": {"text": rl["context"], "place": None, "time": [], "conditions": [], "cultivar": None, "scope": "source"},
         "concepts": [], "sourceRefs": [sref], "origin": "preset", "knowledgeKind": "relation", "formation": formation,
         "evidenceStatus": rl["status"], "active": rl["status"] != "retired", "confidence": rl["confidence"], "layer": "planting-db relation",
         "legacyRef": f"planting-db@{PDB_SHA[:7]}:relations.json#{rl['id']}", "legacy": {"fields": rest, "order": list(rl.keys())}}
    if "verification_scope" in rl: r["verificationScope"] = rl["verification_scope"]
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=os.path.join(os.path.dirname(ROOT), "planting-db"))
    ap.add_argument("--sha", default=PDB_SHA)
    ap.add_argument("--split", action="store_true", help="only re-derive the public seed from the local full copy")
    a = ap.parse_args()
    if a.split:
        return write_seeds(json.load(open(os.path.join(LOCAL_DIR, "seed.json"), encoding="utf-8")))
    need = [os.path.join(ROOT, "sources", "knowledge", f) for f in ("robertson_1929_subset.tsv", "metro_vancouver_water.json", "fetch_log.json")]
    if not all(os.path.exists(f) for f in need):
        raise SystemExit("The licence-restricted research sources (sources/knowledge/*.tsv, metro_vancouver_water.json) are not on this machine;\n"
                         "they are not published. The published seed is knowledge/data/seed.json — use it as it is.")
    pdb = PDB(a.repo, a.sha)
    manifest = {"inputs": {}, "out": {}, "excluded": []}

    ont = pdb.json("ontology.json"); sources_j = pdb.json("sources.json"); syn = pdb.json("synonyms.json")
    rel_j = pdb.json("relations.json"); cand = pdb.json("data/survey/candidate_evidence.json"); kg = pdb.json("brain/data/kg.json")
    plant_files = [p for p in pdb.ls("plants") if p.endswith(".json")]
    O = {n["id"]: n for n in ont["nodes"]}

    entities = OrderedDict(); records = []; relations = []; datasets = []; sources = OrderedDict()

    def add_entity(e):
        if e["id"] in entities: raise SystemExit("duplicate entity " + e["id"])
        entities[e["id"]] = e
        return e

    def place_parent(pid):
        # a place added in Phase 02A joins the planting-db place hierarchy (narrower_than, as kg.json does for its own places)
        par = entities[pid]["parent"]
        relations.append({"id": f"geo:parent:{pid}", "predicate": "narrower_than", "from": pid, "to": par, "formation": "documented", "rule": None, "supportingRecordIds": [],
                          "verdict": None, "basis": {"source": "geography (place added in Phase 02A)"}, "conditions": [], "origin": "preset", "layer": "Phase 02A"})

    # ---- sources
    for s in sources_j["sources"]:
        sources[s["id"]] = dict(s, origin="preset", layer="planting-db")
    # ---- concept entities (ontology 0.2.0, all levels; the graph shows the ones records reach)
    for n in ont["nodes"]:
        add_entity({"id": n["id"], "type": "concept", "level": n.get("level"), "name": n.get("label") or n["id"], "aliases": n.get("aliases", []),
                    "status": "established", "origin": "preset", "layer": "planting-db ontology", "definition": n.get("definition"),
                    "facet": n.get("facet"), "category": n.get("category"), "dimension": n.get("dimension"), "parent": n.get("parent") or n.get("hierarchy_parent")})
    # ---- plants + claims
    claims_in = 0; plant_names = {}
    for pf in plant_files:
        p = pdb.json(pf); en = p["entity"]; fname = os.path.basename(pf)
        names = [en["scientific_name"]] + en.get("synonyms_scientific", []) + sum(en.get("common_names", {}).values(), []) + en.get("raw_names", [])
        add_entity({"id": en["id"], "type": "plant", "name": en["scientific_name"], "scientificName": en["scientific_name"], "cultivar": None,
                    "commonName": (en.get("common_names", {}).get("en") or [None])[0], "aliases": sorted(set(names) - {en["scientific_name"]}),
                    "status": "established", "origin": "preset", "layer": "planting-db plant", "seedSet": "planting-db-10",
                    "legacyRef": f"planting-db@{PDB_SHA[:7]}:plants/{fname}#entity", "legacy": {"entity": en, "custom": p.get("custom"), "fill_plan": p.get("fill_plan")}})
        plant_names[en["scientific_name"]] = en["id"]
        for cl in p["claims"]:
            claims_in += 1
            records.append(claim_record(cl, fname))
    manifest["inputs"]["claims"] = claims_in
    # survey candidates as provisional taxa (names exactly as typed are aliases)
    dropped_alias = []
    def clean_names(eid, names):
        # planting-db synonyms.json carries a few source keys among the names (e.g. "rhs", "eflora_native_bc_taxon" for Yarrow);
        # they would make "rhs" resolve to a plant, so they are not used as aliases. The source file is not changed.
        keep = []
        for n in names:
            if re.fullmatch(r"[a-z0-9]+(_[a-z0-9]+)*", n) and (n in sources or "_" in n): dropped_alias.append({"entity": eid, "name": n}); continue
            keep.append(n)
        return keep
    for e in syn["entries"]:
        if e["id"] in entities:
            entities[e["id"]]["aliases"] = sorted(set(entities[e["id"]]["aliases"]) | set(clean_names(e["id"], e.get("names", []))) - {entities[e["id"]]["name"]})
            continue
        add_entity({"id": e["id"], "type": "plant", "name": e.get("scientific") or e["names"][0], "scientificName": e.get("scientific"), "cultivar": None,
                    "aliases": sorted(set(clean_names(e["id"], e.get("names", []))) - {e.get("scientific")}), "status": "candidate", "origin": "preset",
                    "layer": "survey candidate", "taxonReview": e.get("taxon_review"), "note": "named in the anonymous survey; not in the planting-db base; taxon review "
                    + (e.get("taxon_review") or "not recorded"), "legacyRef": f"planting-db@{PDB_SHA[:7]}:synonyms.json#{e['id']}"})
    # relations.json
    for rl in rel_j["relations"]:
        records.append(relation_record(rl))
    for i, od in enumerate(rel_j["outside_db"]):
        records.append({"id": f"outside:{od['plant']}:{od['source_id']}:{i + 1:02d}", "subjects": [od["plant"]], "objects": [], "predicate": "names_companions_outside_db",
                        "value": {"kind": "list", "data": od["companions_named"]}, "statement": f"{sources[od['source_id']]['name'] if od['source_id'] in sources else od['source_id']} names companions not in the base: "
                        + ", ".join(od["companions_named"]), "context": {"text": od.get("note"), "place": None, "time": [], "conditions": [], "cultivar": None, "scope": "source"},
                        "concepts": [], "sourceRefs": [{"sourceId": od["source_id"], "sourceType": sources.get(od["source_id"], {}).get("type"), "url": od["source_url"],
                        "locator": f"planting-db relations.json · outside_db[{i}]"}], "origin": "preset", "knowledgeKind": "observation", "evidenceStatus": "unverified",
                        "active": True, "confidence": None, "layer": "planting-db relation", "legacyRef": f"planting-db@{PDB_SHA[:7]}:relations.json#outside_db[{i}]", "legacy": {"fields": od}})
    # survey candidate evidence (anonymous ids, verbatim words, never a trait)
    add_entity({"id": "dataset:survey-candidates", "type": "dataset", "name": "Survey candidate evidence (15 anonymous responses, export 2026-11-14)", "aliases": [],
                "status": "established", "origin": "preset", "layer": "survey candidate", "note": cand["note"]})
    for ce in cand["entries"]:
        if ce["candidate_id"] not in entities:
            add_entity({"id": ce["candidate_id"], "type": "plant", "name": ce["raw_name"], "scientificName": None, "aliases": [], "status": "candidate", "origin": "preset",
                        "layer": "survey candidate", "note": "named in the anonymous survey; identity not checked"})
        rest = {k: v for k, v in ce.items() if k not in ("id", "candidate_id", "text", "kind", "source_id", "status")}
        records.append({"id": ce["id"], "subjects": [ce["candidate_id"]], "objects": ["dataset:survey-candidates"], "edgePredicate": "mentioned_in", "predicate": ce["kind"],
                        "value": {"kind": "text", "data": ce["text"]}, "statement": f"{ce['raw_name']} — {ce['text']}",
                        "context": {"text": "anonymous survey " + ce["survey_question"] + (("; basis: " + ce["basis"]) if ce.get("basis") else ""), "place": None, "time": [],
                                    "conditions": [], "cultivar": None, "scope": "source"},
                        "concepts": [], "sourceRefs": [{"sourceId": ce["source_id"], "sourceType": "practitioner", "locator": f"planting-db data/survey/candidate_evidence.json · {ce['id']}"}],
                        "origin": "preset", "knowledgeKind": ce["kind"], "evidenceStatus": ce["status"], "active": True, "confidence": None, "layer": "survey candidate",
                        "verificationScope": "statement", "legacyRef": f"planting-db@{PDB_SHA[:7]}:data/survey/candidate_evidence.json#{ce['id']}", "legacy": {"fields": rest}})
    manifest["aliases_not_used"] = dropped_alias
    manifest["inputs"].update({"plants": len(plant_files), "relations": len(rel_j["relations"]), "outside_db": len(rel_j["outside_db"]),
                               "candidate_evidence": len(cand["entries"]), "ontology_nodes": len(ont["nodes"]), "sources": len(sources_j["sources"]),
                               "synonym_entries": len(syn["entries"])})

    # ---- kg.json: cultivar nodes and rule-derived edges (claim → concept edges are re-projected, not copied)
    claim_ids = {r["id"] for r in records}
    for n in kg["nodes"]:
        if n["type"] == "cultivar":
            add_entity({"id": n["id"], "type": "cultivar", "name": n["label"], "scientificName": entities[n["plant"].split(":", 1)[1]]["name"], "cultivar": n["cultivar"],
                        "aliases": [], "status": "established", "origin": "preset", "layer": "planting-db kg"})
    nid = lambda x: x.split(":", 1)[1] if x.startswith("plant:") else x
    kept_types = {"height_band", "layer", "design", "classification", "concept", "hierarchy", "parent", "taxonomy", "cultivar_of", "entity"}
    dropped = Counter()
    claim_re = re.compile(r'"([a-z0-9-]+:[a-z_]+:[a-z0-9_]+)"')
    edge_claims = {}                       # kg edge id → claim ids behind it (a KG-R4 candidate cites band/layer edges, not claims)
    for e in kg["edges"]:
        cs = {c for c in claim_re.findall(json.dumps(e)) if c in claim_ids}
        if e.get("claim_id") in claim_ids: cs.add(e["claim_id"])
        edge_claims[e["id"]] = cs
    for e in kg["edges"]:
        if e.get("type") not in kept_types:
            dropped[(e.get("type"), e.get("kg_status"))] += 1; continue
        if e.get("kg_status") == "unknown":
            dropped[("design unknown (no evidence; kept as a gap, not an edge)", "unknown")] += 1; continue
        s, t = nid(e["source"]), nid(e["target"])
        if s not in entities or t not in entities:
            dropped[("endpoint missing", e.get("type"))] += 1; continue
        blob = json.dumps(e)
        support = set(edge_claims[e["id"]])
        for ref in re.findall(r'"edge": "([^"]+)"', blob):
            support |= edge_claims.get(ref, set())
        support = sorted(support)
        relations.append({"id": "kg:" + e["id"], "predicate": e.get("rel") or e["type"], "from": s, "to": t, "formation": e.get("kg_status", "documented"),
                          "rule": (e.get("basis") or {}).get("rule") if isinstance(e.get("basis"), dict) else None, "supportingRecordIds": support,
                          "verdict": e.get("verdict"), "basis": e.get("basis") if e["type"] not in ("design",) else {"verdict": e.get("verdict"), "via_uses": e.get("via_uses")},
                          "conditions": e.get("conditions", []), "origin": "preset", "layer": "planting-db kg", "legacyRef": f"planting-db@{PDB_SHA[:7]}:brain/data/kg.json#{e['id']}"})
    manifest["kg_edges_not_imported"] = {f"{k[0]} / {k[1]}": v for k, v in sorted(dropped.items(), key=str)}
    manifest["kg_counts_at_sha"] = kg["counts"]

    # ---- AI source assessments (a separate signal: an AI read the source; this is NOT human verification)
    ai = {}
    for f in pdb.ls("review/ai/assessments"):
        for line in pdb.read(f).splitlines():
            if not line.strip(): continue
            d = json.loads(line)
            ai[d["claim_id"]] = {k: d.get(k) for k in ("result", "risk", "explanation", "missing_context", "locator", "model", "method", "reviewed_at")}
    manifest["inputs"]["ai_assessments"] = len(ai)

    # ---- Detroit spatial model: taxa, recipes (drawing roles), species map
    model = json.load(open(os.path.join(ROOT, "data", "detroit", "model.json"), encoding="utf-8"))
    for s in model["sources"]:
        if s["id"] not in sources:
            sources[s["id"]] = {"id": s["id"], "name": s["title"], "type": "spatial-model source", "url": s.get("url"), "licence": s.get("license"),
                                "accessed": s.get("accessed"), "public": s.get("public"), "use": s.get("use"), "origin": "preset", "layer": "Generative-Planting model"}
    name_to_entity = {e["scientificName"]: e["id"] for e in entities.values() if e["type"] == "plant" and e.get("scientificName") and e["status"] == "established"}
    species_map = []
    for sp in model["species"]:
        key = sp.get("canonicalKey") or sp["scientificName"]
        base = re.sub(r"\s*'.*$", "", key).strip()
        row = {"spatialId": sp["id"], "canonicalKey": key, "scientificName": sp["scientificName"], "cultivar": sp.get("cultivar")}
        if sp["id"] == "sp.lawn":
            row.update(status="not_a_taxon", entityId=None, note="mown turf, not a taxon"); species_map.append(row); continue
        if sp.get("cultivar") and re.search(r"spec\.|mixed|M \+ F", sp["cultivar"]):
            row["placeholderCultivar"] = True
        if not sp.get("cultivar"):
            eid = name_to_entity.get(key)
            if not eid:
                eid = "taxon:" + slug(key); name_to_entity[key] = eid
                add_entity({"id": eid, "type": "plant", "name": key, "scientificName": key, "cultivar": None, "aliases": [], "status": "established", "origin": "preset",
                            "layer": "Detroit model taxon", "spatialIds": [], "note": "species named in the Oudolf Garden Detroit plan legends (spatial model); no planting-db claims"})
                row["status"] = "new_entity"
            else:
                row["status"] = "matched" if entities[eid]["layer"] == "planting-db plant" else "same_taxon"
            entities[eid].setdefault("spatialIds", []).append(sp["id"]); row["entityId"] = eid
        else:
            eid = "taxon:" + slug(key)
            if eid not in entities:
                add_entity({"id": eid, "type": "cultivar", "name": key, "scientificName": base, "cultivar": sp["cultivar"], "aliases": [], "status": "placeholder" if row.get("placeholderCultivar") else "established",
                            "origin": "preset", "layer": "Detroit model taxon", "spatialIds": [],
                            "note": "cultivar or selection named in the Detroit plan legends; never merged with its species" + ("; placeholder name in the legend" if row.get("placeholderCultivar") else "")})
            entities[eid].setdefault("spatialIds", []).append(sp["id"]); row["entityId"] = eid
            row["status"] = "placeholder" if row.get("placeholderCultivar") else "cultivar"
            if base in name_to_entity:
                row["cultivarOf"] = name_to_entity[base]
        species_map.append(row)
    # cultivar_of for Detroit cultivars whose species part is a known taxon (name parse; derived, not a merge)
    for e in list(entities.values()):
        if e["type"] == "cultivar" and e["layer"] == "Detroit model taxon" and e["scientificName"] in name_to_entity:
            relations.append({"id": f"cv:{e['id']}", "predicate": "cultivar_of", "from": e["id"], "to": name_to_entity[e["scientificName"]], "formation": "derived",
                              "rule": "name parse: species part of the canonical key", "supportingRecordIds": [], "origin": "preset", "layer": "Detroit model taxon",
                              "note": "identity link only: records about the species are not copied to the cultivar"})
    # recipes → planting systems, roles in a system, fills_role records
    S_REC = lambda rc: [{"sourceId": s, "sourceType": "spatial-model source", "locator": f"Generative-Planting data/detroit/model.json · recipes[{rc['id']}]"} for s in rc.get("sourceRefs", [])] \
        or [{"sourceId": "S-OGD-PL-2026", "sourceType": "spatial-model source", "locator": f"model.json recipes[{rc['id']}]"}]
    for rc in model["recipes"]:
        sid = "system:" + rc["id"]
        add_entity({"id": sid, "type": "planting_system", "name": rc["name"], "aliases": [rc["id"]], "status": "established", "origin": "preset", "layer": "Detroit model recipe",
                    "style": rc.get("style"), "version": rc.get("version"), "note": rc.get("roleNote") or rc.get("notes"), "spatialRecipeId": rc["id"]})
        roles = []
        for comp in rc["components"]:
            if comp["role"] not in roles: roles.append(comp["role"])
        for role in roles:
            rid = f"role:{rc['id']}:{role}"
            add_entity({"id": rid, "type": "role", "name": f"{role} — {rc['name']}", "aliases": [], "status": "established", "origin": "preset", "layer": "Detroit model recipe",
                        "roleName": role, "system": sid, "note": "drawing role in this recipe's plan legend; not an ecological role"})
            records.append({"id": f"rec:{rc['id']}:has_role:{role}", "subjects": [sid], "objects": [rid], "predicate": "has_role", "value": {"kind": "category", "data": role},
                            "statement": f"{rc['name']} uses the drawing role “{role}”.", "context": {"text": "Oudolf Garden Detroit plan legend, " + str(rc.get("version")), "place": "place:detroit",
                            "time": [], "conditions": [], "cultivar": None, "scope": "recipe"}, "concepts": [], "sourceRefs": S_REC(rc), "origin": "preset", "knowledgeKind": "attribute",
                            "evidenceStatus": "documented", "active": True, "confidence": None, "layer": "Detroit model recipe"})
        for i, comp in enumerate(rc["components"]):
            subj = []
            for spid in comp["speciesIds"]:
                m = next((r for r in species_map if r["spatialId"] == spid), None)
                if m and m.get("entityId"): subj.append(m["entityId"])
            if not subj: continue
            records.append({"id": f"rec:{rc['id']}:{i:03d}", "subjects": subj, "objects": [f"role:{rc['id']}:{comp['role']}"], "predicate": "fills_role",
                            "value": {"kind": "role", "data": {"legendCode": comp["legendCode"], "drawingRole": comp["role"], "ecologicalRole": None}},
                            "statement": f"In {rc['name']}, legend “{comp['legendCode']}” ({', '.join(entities[s]['name'] for s in subj)}) is drawn as {comp['role']}. Ecological role: unknown.",
                            "context": {"text": "Oudolf Garden Detroit plan legend; role holds in this recipe only", "place": "place:detroit", "time": [], "conditions": [], "cultivar": None,
                                        "scope": "recipe"}, "concepts": [], "sourceRefs": S_REC(rc), "origin": "preset", "knowledgeKind": "attribute", "evidenceStatus": "documented",
                            "active": True, "confidence": None, "layer": "Detroit model recipe", "spatialRefs": comp["speciesIds"]})
    add_entity({"id": "place:detroit", "type": "concept", "level": "concept", "name": "Detroit, Michigan (Belle Isle)", "aliases": ["Belle Isle", "Detroit"], "status": "established",
                "origin": "preset", "layer": "Phase 02A", "facet": "place", "parent": "place:north_america"})
    place_parent("place:detroit")
    # plant type as listed in the spatial model's species list (not among its inferredFields); heights, spreads and colours there are inferred and are NOT used
    ptypes = defaultdict(set)
    for sp in model["species"]:
        if "plantType" in (sp.get("inferredFields") or []): continue
        m = next((r for r in species_map if r["spatialId"] == sp["id"]), None)
        if m and m.get("entityId") and sp.get("plantType"): ptypes[m["entityId"]].add(sp["plantType"])
    for eid, ts in ptypes.items():
        if len(ts) == 1 and entities[eid]["layer"] == "Detroit model taxon":
            entities[eid]["plantType"] = next(iter(ts)); entities[eid]["plantTypeBasis"] = "Detroit spatial model species list (plantType is not marked inferred there)"

    # ---- Robertson 1929 visitor lists (rows unchanged; per-plant observation record = count of listed visitor taxa)
    rows = list(csv.DictReader(open(os.path.join(ROOT, "sources", "knowledge", "robertson_1929_subset.tsv"), encoding="utf-8"), delimiter="\t"))
    flog = json.load(open(os.path.join(ROOT, "sources", "knowledge", "fetch_log.json")))
    sources["robertson-1929"] = {"id": "robertson-1929", "name": "Robertson, C. (1929) Flowers and insects: lists of visitors of four hundred and fifty-three flowers. Carlinville, IL",
                                 "type": "literature", "publisher": "C. Robertson (self-published)", "url": "https://www.globalbioticinteractions.org/",
                                 "dataset_url": flog["robertson"]["url"], "dataset_sha256": flog["robertson"]["sha256"],
                                 "digitised_by": "Sarah E. Miller, 2015 (species associations manually extracted; indexed by GloBI)", "geo_specificity": "southwestern Illinois, USA",
                                 "licence": "underlying 1929 work: US public domain (published 1929); digitised table: no licence file in the GitHub repository — factual interaction rows; reuse to confirm by Kay before formal publication",
                                 "accessed": flog["fetched"], "origin": "preset", "layer": "Phase 02A"}
    cols = list(rows[0].keys())
    datasets.append({"id": "ds:robertson-1929", "title": "Robertson 1929 flower-visitor lists (subset: plants already in the base)", "sourceId": "robertson-1929",
                     "columns": cols, "rows": [[r[c] for c in cols] for r in rows], "rowsInSource": flog["robertson"]["rows_total"],
                     "note": "one row = one insect taxon Robertson listed as a visitor of one plant species near Carlinville, Illinois (observations ~1884–1916). Presence only: no visit counts, no dates per row.",
                     "origin": "preset"})
    add_entity({"id": "ds:robertson-1929", "type": "dataset", "name": "Robertson 1929 flower visitors (Carlinville, IL)", "aliases": ["Robertson", "Flowers and insects"],
                "status": "established", "origin": "preset", "layer": "Phase 02A"})
    by_plant = defaultdict(list)
    for i, r in enumerate(rows): by_plant[r["sourceTaxonName"]].append(i)
    for name in sorted(by_plant):
        eid = name_to_entity.get(name)
        if not eid:
            eid = "taxon:" + slug(name); name_to_entity[name] = eid
            add_entity({"id": eid, "type": "plant", "name": name, "scientificName": name, "cultivar": None, "aliases": [], "status": "established", "origin": "preset",
                        "layer": "Phase 02A taxon", "note": "species named in Robertson 1929; a cultivar of it is in the Detroit plan"})
            for e in list(entities.values()):
                if e["type"] == "cultivar" and e.get("scientificName") == name:
                    relations.append({"id": f"cv:{e['id']}", "predicate": "cultivar_of", "from": e["id"], "to": eid, "formation": "derived", "rule": "name parse: species part of the canonical key",
                                      "supportingRecordIds": [], "origin": "preset", "layer": "Detroit model taxon", "note": "identity link only"})
        idx = by_plant[name]; visitors = sorted({rows[i]["targetTaxonName"] for i in idx})
        records.append({"id": f"obs:robertson-1929:{slug(name)}", "subjects": [eid], "objects": ["ds:robertson-1929"], "predicate": "has_observation",
                        "value": {"kind": "quantitative", "data": {"listed_visitor_taxa": len(visitors), "rows": len(idx)}, "unit": "insect taxa listed as flower visitors"},
                        "statement": f"Robertson (1929) lists {len(visitors)} insect taxa visiting flowers of {name} near Carlinville, Illinois.",
                        "context": {"text": "Carlinville, Illinois, USA; Robertson's observations (c. 1884–1916); presence lists, observer effort not standardised", "place": "place:illinois",
                                    "time": ["period:1884-1916"], "conditions": [], "cultivar": None, "scope": "source"}, "concepts": [],
                        "sourceRefs": [{"sourceId": "robertson-1929", "sourceType": "literature", "locator": f"ds:robertson-1929 rows {idx[0]}–{idx[-1]} ({len(idx)} rows)", "datasetId": "ds:robertson-1929", "rows": idx}],
                        "origin": "preset", "knowledgeKind": "observation", "evidenceStatus": "name-match lead", "active": True, "confidence": None, "layer": "Phase 02A",
                        "datasetId": "ds:robertson-1929", "datasetRows": idx,
                        "taxonMatch": {"method": "exact spelling of Robertson's 1929 plant name against current names", "checked": False,
                                       "note": "historical names are not taxonomically reviewed (e.g. 1929 Illinois usage of Pycnanthemum flexuosum may correspond to today's P. tenuifolium); a research lead, not established evidence about the modern taxon"}})
    add_entity({"id": "place:illinois", "type": "concept", "level": "concept", "name": "Carlinville, Illinois", "aliases": ["Illinois"], "status": "established", "origin": "preset",
                "layer": "Phase 02A", "facet": "place", "parent": "place:north_america"})
    place_parent("place:illinois")

    # ---- Metro Vancouver water rules (no plant subject; topic entities)
    water = json.load(open(os.path.join(ROOT, "sources", "knowledge", "metro_vancouver_water.json"), encoding="utf-8"))
    for s in water["sources"]:
        sources[s["id"]] = dict(s, origin="preset", layer="Phase 02A")
    topics = {"lawn": ("topic:lawn-watering", "Lawn watering (Metro Vancouver)"), "trees_shrubs_flowers": ("topic:planting-bed-watering", "Watering trees, shrubs and flower beds (Metro Vancouver)")}
    for tid, tname in topics.values():
        add_entity({"id": tid, "type": "topic", "name": tname, "aliases": ["water conservation", "watering restrictions", "irrigation"], "status": "established",
                    "origin": "preset", "layer": "Phase 02A", "note": "a topic without a plant subject; rules apply to land use, not to any species"})
    mv = "place:vancouver"          # planting-db's own place node, labelled "Metro Vancouver" (Phase 02A first added a duplicate; removed in 02A.1)
    for st in water["statements"]:
        verified = next(w["quote_found"] for w in flog["water"] if w["id"] == st["id"])
        records.append({"id": st["id"], "subjects": [topics[k][0] for k in st["applies_to"]], "objects": [mv], "edgePredicate": "applies_in",
                        "predicate": "has_water_rule" if st["predicate"] == "regulates" else "has_water_guidance", "value": st["value"], "statement": st["statement"],
                        "quote": st["quote"], "context": {"text": st["scope"], "place": mv, "time": ["period:may01-oct15"] if "stage:1" in st["conditions"] else [], "conditions": st["conditions"],
                        "cultivar": None, "scope": "region"}, "concepts": [], "sourceRefs": [{"sourceId": st["source"], "sourceType": "municipal", "url": sources[st["source"]]["url"],
                        "locator": "quote: “" + st["quote"][:80] + ("…”" if len(st["quote"]) > 80 else "”"), "accessed": water["accessed"], "quoteVerified": verified}],
                        "origin": "preset", "knowledgeKind": "rule" if st["predicate"] == "regulates" else "guidance", "evidenceStatus": "documented", "active": True,
                        "confidence": None, "layer": "Phase 02A"})

    # ---- assemble
    for rec in records:
        for sid in rec["subjects"] + rec["objects"]:
            if sid not in entities: raise SystemExit(f"record {rec['id']} points at missing entity {sid}")
        rec.setdefault("objects", [])
    for rel in relations:
        if rel["from"] not in entities or rel["to"] not in entities: raise SystemExit("relation endpoint missing " + rel["id"])
    ids = Counter(r["id"] for r in records)
    dup = [k for k, v in ids.items() if v > 1]
    if dup: raise SystemExit("duplicate record ids " + str(dup[:5]))
    gp_model_hash = hashlib.sha256(open(os.path.join(ROOT, "data", "detroit", "model.json"), "rb").read()).hexdigest()
    seed = OrderedDict()
    seed["format"] = "gp-knowledge-seed/1"
    seed["meta"] = {"builtBy": "tools/knowledge/build_seed.py", "plantingDb": {"repo": "https://github.com/kaiyankay/planting-db", "sha": a.sha},
                    "spatialModel": {"file": "data/detroit/model.json", "sha256": gp_model_hash, "schemaVersion": model.get("schemaVersion")},
                    "external": {"robertson": flog["robertson"]["sha256"], "water_fetched": flog["fetched"]},
                    "ontologyVersion": ont.get("$ontology_version"), "note": "Base snapshot: read-only. Personal edits live in the browser (IndexedDB) and in exported workspace files."}
    seed["predicates"] = PREDICATES
    seed["edgeVocabulary"] = {"catRel": CAT_REL, "fieldRel": FIELD_REL}
    seed["sources"] = list(sources.values())
    seed["entities"] = list(entities.values())
    seed["records"] = records
    seed["relations"] = relations
    seed["datasets"] = datasets
    seed["aiChecks"] = ai
    body = json.dumps(seed, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
    seed["meta"]["baseVersion"] = "base-" + hashlib.sha256(body.encode()).hexdigest()[:12]
    os.makedirs(OUT_DIR, exist_ok=True)
    write_seeds(seed)
    json.dump({"note": "Spatial species → knowledge entity. matched = same taxon as a planting-db plant; same_taxon = a second sp.* id for one taxon; cultivar = its own entity, "
               "linked by cultivar_of only when the species is known; placeholder = legend name that is not a resolvable taxon; not_a_taxon = e.g. lawn. Nothing is merged.",
               "spatialModelSha256": gp_model_hash, "counts": dict(Counter(r["status"] for r in species_map)), "species": species_map},
              open(os.path.join(OUT_DIR, "species_map.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    manifest["out"] = {"entities": dict(Counter(e["type"] for e in entities.values())), "entities_total": len(entities),
                       "records": dict(Counter(r["layer"] for r in records)), "records_total": len(records),
                       "records_active": sum(r["active"] for r in records), "relations": dict(Counter(r["formation"] for r in relations)), "relations_total": len(relations),
                       "datasets": {d["id"]: len(d["rows"]) for d in datasets}, "sources": len(sources), "aiChecks": len(ai), "baseVersion": seed["meta"]["baseVersion"]}
    manifest["excluded"] = [
        {"what": "planting-db review/*.md, review/screenshots, review/exports", "why": "human review reports and UI screenshots, not knowledge statements; decisions they record are already in claim status"},
        {"what": "planting-db data/cov_trees/*.csv, data/inat/*.json", "why": "raw pulls; the claims built from them (cov_trees, inat sources) are migrated with their counts and locators"},
        {"what": "planting-db inputs/t5/*.json", "why": "assisted-extraction inputs already merged into claims (merge_t5.py)"},
        {"what": "planting-db designs/, design/, eval/, platform/, brain/ UI code", "why": "design sessions and applications, not knowledge; brain/data/kg.json rule edges are imported"},
        {"what": "kg.json claim/entity edges", "why": "re-projected live from records so edits change them (see kg_edges_not_imported)"},
        {"what": "planting-survey raw responses (Supabase / CSV)", "why": "private; only the de-identified candidate queue and claims already public in planting-db are used"},
        {"what": "course slides (P56 table, P57/P58 lists)", "why": "copyright: not in the public seed. P57 lists are only used as a local, git-ignored import fixture"}]
    json.dump(manifest, open(os.path.join(OUT_DIR, "migration_manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(manifest["out"], indent=1))
    print("seed.json", round(os.path.getsize(os.path.join(OUT_DIR, "seed.json")) / 1e6, 2), "MB (public) ·", round(os.path.getsize(os.path.join(LOCAL_DIR, "seed.json")) / 1e6, 2), "MB (local)")


if __name__ == "__main__":
    main()
