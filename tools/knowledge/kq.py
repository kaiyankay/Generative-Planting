#!/usr/bin/env python3
"""Knowledge query CLI — the retrieval contract outside the browser (for a future LLM tool server, scripts and tests).

  python3 -I tools/knowledge/kq.py search "Kinnikinnick drought" [--workspace my-knowledge.json] [--place place:vancouver] [--limit 20]
  python3 -I tools/knowledge/kq.py records --subject arctostaphylos-uva-ursi [--predicate resistances] [--history]
  python3 -I tools/knowledge/kq.py entity achillea-millefolium
  python3 -I tools/knowledge/kq.py resolve "Yarrow"
  python3 -I tools/knowledge/kq.py parity docs/qa/knowledge_parity.json     # browser results vs this implementation

Reads the Base seed (knowledge/data/local/seed.json when this machine has the full research copy, else knowledge/data/seed.json) and, optionally, a workspace file exported from the Knowledge page
(“Export my knowledge”): the effective state is Base + those events, exactly as in knowledge/src/kb.js. Output is JSON:
record ids, values, sources, context, status, flags and gaps — never a generated summary. Every search appends a trace line
to --trace (default: none) with the query, the effective revision and the returned ids. No network, no LLM.
Standard library only. Keep fold/tokens/norm_name/doc_text/search in step with kb.js (the parity test checks it).
"""
import argparse, json, math, os, re, sys, unicodedata
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PERSONAL = {"id": "me", "name": "My knowledge (this browser)", "type": "personal", "origin": "user", "layer": "personal"}


def fold(s):
    s = unicodedata.normalize("NFKD", "" if s is None else str(s))
    return re.sub("[̀-ͯ]", "", s).lower()


def tokens(s):
    out = []
    for w in re.findall(r"[a-z0-9]+|[㐀-鿿]", fold(s)):
        if len(w) > 3 and w.endswith("s") and not w.endswith("ss"): w = w[:-1]
        if len(w) > 1 or re.search(r"[㐀-鿿0-9]", w): out.append(w)
    return out


def norm_name(s):
    t = re.sub(r"[‘’'\"“”`]", "'", fold(s))
    t = re.sub(r"\s+", " ", t)
    return re.sub(r"\s*'\s*", "'", t).strip()


def js_str(x):
    if isinstance(x, float):
        if x.is_integer() and abs(x) < 1e21: return str(int(x))
        return repr(x)
    return str(x)


def flatten(v, push):
    if v is None or isinstance(v, bool): return
    if isinstance(v, (str, int, float)): push(v); return
    if isinstance(v, list):
        for x in v: flatten(x, push)
        return
    if isinstance(v, dict):
        for k in v: flatten(v[k], push)


def js_round6(x):
    return math.floor(x * 1e6 + 0.5) / 1e6


def fnv(s):
    h = 0x811c9dc5          # FNV-1a over UTF-16 code units, like kb.js
    units = []
    for c in s:
        o = ord(c)
        if o > 0xFFFF: o -= 0x10000; units += [0xD800 + (o >> 10), 0xDC00 + (o & 0x3FF)]
        else: units.append(o)
    for u in units:
        h ^= u; h = (h * 0x01000193) & 0xFFFFFFFF
    return format(h, "08x")


class KB:
    def __init__(self, seed, species_map=None, events=()):
        self.seed = seed; self.species_map = species_map
        self.base_version = seed["meta"]["baseVersion"]; self.predicates = seed["predicates"]
        self.events = list(events); self.rebuild()

    def live_events(self):
        undone = set()
        for e in reversed(self.events):
            if e["type"] == "undo" and e["id"] not in undone: undone.add(e["target"])
        return [e for e in self.events if e["type"] != "undo" and e["id"] not in undone], undone

    def rebuild(self):
        live, undone = self.live_events()
        ents = {e["id"]: e for e in self.seed["entities"]}
        srcs = {s["id"]: s for s in self.seed["sources"]}; srcs["me"] = PERSONAL
        recs = {r["id"]: dict(r) for r in self.seed["records"]}
        datasets = {d["id"]: d for d in self.seed["datasets"]}
        excluded, superseded = {}, {}
        flat = []
        for e in live:
            if e["type"] == "batch":
                for i, c in enumerate(e["events"]): flat.append(dict(c, id=f"{e['id']}#{i}", at=e.get("at"), batchId=e["id"]))
            else: flat.append(e)
        for e in flat:
            tag = {"eventId": e.get("batchId") or e["id"], "at": e.get("at")}
            t = e["type"]
            if t == "add_entity" and e["entity"]["id"] not in ents: ents[e["entity"]["id"]] = dict(e["entity"], origin="user", **tag)
            elif t == "add_source": srcs[e["source"]["id"]] = dict(e["source"], origin="user", **tag)
            elif t == "add_dataset": datasets[e["dataset"]["id"]] = dict(e["dataset"], origin="user", **tag)
            elif t == "add_record" and e["record"]["id"] not in recs: recs[e["record"]["id"]] = dict({"active": True}, **e["record"], origin="user", **tag)
            elif t == "revise_record" and e["record"]["id"] not in recs:
                recs[e["record"]["id"]] = dict({"active": True}, **e["record"], origin="user", revises=e["target"], **tag); superseded[e["target"]] = e["record"]["id"]
            elif t == "exclude": excluded[e["target"]] = {"reason": e.get("reason", "")}
            elif t == "include": excluded.pop(e["target"], None)
        for r in recs.values():
            if r["id"] in excluded: r["_eff"] = {"active": False, "why": "excluded"}
            elif r["id"] in superseded: r["_eff"] = {"active": False, "why": "revised", "by": superseded[r["id"]]}
            elif r.get("active") is False: r["_eff"] = {"active": False, "why": "retired in source" if r.get("evidenceStatus") == "retired" else "inactive"}
            else: r["_eff"] = {"active": True}
        self.entities, self.sources, self.records, self.datasets = ents, srcs, recs, datasets
        self.excluded, self.superseded = excluded, superseded
        self.active_revision = f"{self.base_version}+{len(live)}e:{fnv('|'.join(e['id'] for e in self.events))}"
        self.index()

    def doc_text(self, r):
        parts = [r.get("statement"), r.get("quote"), (r.get("context") or {}).get("text"), (self.predicates.get(r["predicate"]) or {}).get("label") or r["predicate"], r.get("knowledgeKind")]
        for i in r["subjects"] + (r.get("objects") or []) + (r.get("concepts") or []):
            e = self.entities.get(i)
            if e: parts += [e.get("name")] + list(e.get("aliases") or [])
        place = (r.get("context") or {}).get("place")
        if place: parts.append((self.entities.get(place) or {}).get("name") or place)
        flatten(r.get("value"), lambda x: parts.append(self.entities[x]["name"] if isinstance(x, str) and x in self.entities else js_str(x)))
        for sr in r.get("sourceRefs") or []: parts.append((self.sources.get(sr["sourceId"]) or {}).get("name") or sr["sourceId"])
        if r.get("raw"): flatten(r["raw"], lambda x: parts.append(js_str(x)))
        return " ".join(js_str(x) for x in parts if x is not None and x != "")

    def index(self):
        post = {}
        for r in self.records.values():
            for t in dict.fromkeys(tokens(self.doc_text(r))): post.setdefault(t, []).append("r:" + r["id"])
        self.post, self.N = post, len(self.records)
        names = {}
        for e in self.entities.values():
            if e["type"] == "concept" and e.get("level") != "concept": continue
            keys = [e.get("name")] + list(e.get("aliases") or []) + ([e.get("scientificName")] if e.get("scientificName") and e["type"] != "cultivar" else [])
            for k in keys:
                k = norm_name(k)
                if k: names.setdefault(k, []).append(e["id"]) if e["id"] not in names.get(k, []) else None
        self.names = names

    def label(self, i): return (self.entities.get(i) or {}).get("name") or i

    def place_chain(self, p):
        par = {r["from"]: r["to"] for r in self.seed["relations"] if r["predicate"] == "narrower_than" and r["from"].startswith("place:") and r["to"].startswith("place:")}
        out = []
        while p and len(out) < 12: out.append(p); p = par.get(p)
        return out

    def place_relation(self, rp, pp):   # mirrors KB.placeRelation in knowledge/src/kb.js
        if not rp: return "unknown"
        if rp == pp: return "same"
        if pp in self.place_chain(rp): return "within"
        if rp in self.place_chain(pp): return "broader"
        return "elsewhere"

    def record_out(self, r):
        flags = []
        if r.get("origin") == "user": flags.append("personal knowledge (designer-provided; not externally verified)")
        if r.get("knowledgeKind") in ("selection_reason", "practitioner_note", "preference", "practice"): flags.append("experience or preference — use as a lead, not as a measured trait")
        if r.get("extraction") == "not_run": flags.append("free text; no extraction was run")
        if isinstance(r.get("extraction"), dict) and r["extraction"].get("method") == "claude": flags.append("structured by a language model from the designer's words; every field confirmed by the designer")
        pv = provenance(r, self.sources)
        if pv["cls"] == "model-inference": flags.append("language-model inference with no external source — not evidence")
        elif pv["extractedBy"] == "language model" and not pv["humanChecked"]: flags.append("values read from the source by a language model; not checked by a person")
        elif r.get("evidenceStatus") == "unverified": flags.append("not checked by a person against the source")
        if r.get("taxonMatch") and not r["taxonMatch"].get("checked"): flags.append("historical plant name matched by spelling only; taxonomy not checked — a research lead, not established evidence")
        o = {"recordId": r["id"], "subjects": [{"id": s, "name": self.label(s)} for s in r["subjects"]], "objects": [{"id": s, "name": self.label(s)} for s in r.get("objects") or []],
             "predicate": r["predicate"], "value": r.get("value"), "statement": r.get("statement"), "quote": r.get("quote"), "context": r.get("context"), "concepts": r.get("concepts") or [],
             "sourceRefs": [dict(s, sourceName=(self.sources.get(s["sourceId"]) or {}).get("name") or s["sourceId"]) for s in r.get("sourceRefs") or []],
             "origin": r.get("origin"), "knowledgeKind": r.get("knowledgeKind"), "evidenceStatus": r.get("evidenceStatus"), "verificationScope": r.get("verificationScope"),
             "state": r["_eff"], "revises": r.get("revises"), "supersededBy": self.superseded.get(r["id"]), "flags": flags, "provenance": pv}
        ai = (self.seed.get("aiChecks") or {}).get(r["id"])
        if ai: o["aiSourceCheck"] = dict(ai, note="an AI read the cited source; this is not human verification")
        return o

    def search(self, query, limit=20, place=None, include_history=False, subject_ids=None):
        qt = sorted(set(tokens(query)))
        scores = {}
        for t in qt:
            p = self.post.get(t)
            if not p: continue
            idf = math.log(1 + self.N / len(p))
            for key in p: scores[key] = scores.get(key, 0) + idf
        fq = fold(query); named = set()
        for name, ids in self.names.items():
            if len(name) > 3 and name in fq: named.update(ids)
        hits = []
        for key, sc in scores.items():
            r = self.records.get(key[2:])
            if not r or (not include_history and not r["_eff"]["active"]): continue
            if subject_ids and not any(s in subject_ids for s in r["subjects"]): continue
            bonus = 2 if any(s in named for s in r["subjects"]) else 0
            hits.append((js_round6(sc + bonus), r["id"], r))
        hits.sort(key=lambda h: (-h[0], h[1]))
        hits = hits[:limit]
        results = []
        for score, _, r in hits:
            o = self.record_out(r); o["score"] = score
            if place: o["placeMatch"] = self.place_relation((r.get("context") or {}).get("place"), place); o["placeNote"] = PLACE_NOTE[o["placeMatch"]]
            results.append(o)
        missing = [{"entityId": i, "name": self.label(i), "note": "entity known but no active records: attributes unknown"} for i in sorted(named)
                   if (self.entities.get(i) or {}).get("type") in ("plant", "cultivar") and not self.records_of(i)]
        return {"query": query, "projectContext": {"place": place} if place else None, "activeRevision": self.active_revision,
                "at": datetime.now(timezone.utc).isoformat(), "returnedRecordIds": [r["recordId"] for r in results], "results": results, "missing": missing,
                "method": "keyword + alias index over effective records (no embeddings, no LLM)"}

    def records_of(self, i, include_history=False):
        return [r for r in self.records.values() if (include_history or r["_eff"]["active"]) and (i in r["subjects"] or i in (r.get("objects") or []) or i in (r.get("concepts") or []) or (r.get("context") or {}).get("place") == i)]

    def resolve(self, name):
        ids = self.names.get(norm_name(name), [])
        ents = [self.entities[i] for i in ids]
        plants = [e for e in ents if e["type"] in ("plant", "cultivar")] or ents
        st = "exact" if len(plants) == 1 else "ambiguous" if plants else "none"
        return {"query": name, "status": st, "matches": [{"id": e["id"], "name": e["name"], "type": e["type"], "status": e.get("status")} for e in plants]}


def provenance(r, sources):   # mirrors provenance() in knowledge/src/kb.js
    import re as _re
    if r.get("origin") == "user": return {"cls": "personal", "extractedBy": "person", "humanChecked": False}
    src = sources.get(((r.get("sourceRefs") or [{}])[0] or {}).get("sourceId")) or {}
    if src.get("type") == "model": return {"cls": "model-inference", "extractedBy": "language model", "humanChecked": False, "sourceType": "model"}
    rb = str(((r.get("legacy") or {}).get("fields") or {}).get("recorded_by") or "")
    by = "language model" if _re.match(r"claude", rb, _re.I) else "script" if _re.search(r"\.py\b|export", rb, _re.I) else ("person" if rb else None)
    return {"cls": "source", "sourceType": src.get("type"), "extractedBy": by, "humanChecked": r.get("evidenceStatus") == "verified"}


PLACE_NOTE = {"same": "same place as the project", "within": "recorded inside the project region", "broader": "recorded for a larger region that contains the project place",
              "elsewhere": "recorded elsewhere — do not transfer without checking", "unknown": "place not stated"}


PUBLIC_SEED = os.path.join(ROOT, "knowledge", "data", "seed.json")               # the published copy
LOCAL_SEED = os.path.join(ROOT, "knowledge", "data", "local", "seed.json")       # full research copy, git-ignored (licence-unclear rows and quotes)


def seed_paths():
    """Seed files on this machine, the full local copy first. GP_KNOWLEDGE_COPY=public uses the public copy only."""
    ps = [PUBLIC_SEED] if os.environ.get("GP_KNOWLEDGE_COPY") == "public" else [LOCAL_SEED, PUBLIC_SEED]
    return [p for p in ps if os.path.exists(p)]


def load_seed(base_version=None):
    """The seed in use (full local copy when present), or the copy with the given baseVersion."""
    for p in seed_paths():
        s = json.load(open(p, encoding="utf-8"))
        if base_version is None or s["meta"]["baseVersion"] == base_version: return s
    raise SystemExit(f"no seed with base version {base_version} on this machine")


def load(workspace=None):
    seed = load_seed()
    sm = json.load(open(os.path.join(ROOT, "knowledge", "data", "species_map.json"), encoding="utf-8"))
    events = []
    if workspace:
        ws = json.load(open(workspace, encoding="utf-8"))
        if ws.get("format") != "gp-knowledge-workspace/1": raise SystemExit("not a knowledge workspace file")
        if ws.get("baseVersion") != seed["meta"]["baseVersion"]: print(f"note: workspace made on {ws.get('baseVersion')}, base is {seed['meta']['baseVersion']}", file=sys.stderr)
        events = ws["events"]
    return KB(seed, sm, events)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["search", "records", "entity", "resolve", "parity"]); ap.add_argument("arg", nargs="?")
    ap.add_argument("--workspace"); ap.add_argument("--place"); ap.add_argument("--limit", type=int, default=20); ap.add_argument("--subject"); ap.add_argument("--predicate")
    ap.add_argument("--history", action="store_true"); ap.add_argument("--trace", help="append a JSON line per search to this file")
    a = ap.parse_args()
    if a.cmd == "parity":
        fx = json.load(open(a.arg)); kb = KB(load_seed(fx.get("baseVersion")), None, fx["events"])
        base = KB(kb.seed, None, [])
        bad = []
        if kb.active_revision != fx["activeRevision"]: bad.append(f"revision {kb.active_revision} != {fx['activeRevision']}")
        act = sorted(r["id"] for r in kb.records.values() if r["_eff"]["active"])
        if act != fx["activeIds"]: bad.append(f"active record sets differ ({len(act)} vs {len(fx['activeIds'])})")
        for q in fx["queries"]:
            res = kb.search(q["q"], limit=20)
            if res["returnedRecordIds"] != q["ids"] or [r["score"] for r in res["results"]] != q["scores"]: bad.append(f"query {q['q']!r}: {res['returnedRecordIds'][:5]} vs {q['ids'][:5]}")
        for q in fx["baseQueries"]:
            res = base.search(q["q"], limit=20)
            if res["returnedRecordIds"] != q["ids"]: bad.append(f"base query {q['q']!r} differs")
        print(json.dumps({"ok": not bad, "checked": {"queries": len(fx["queries"]), "baseQueries": len(fx["baseQueries"]), "activeIds": len(act)}, "problems": bad}, indent=1, ensure_ascii=False))
        sys.exit(0 if not bad else 1)
    kb = load(a.workspace)
    if a.cmd == "search":
        out = kb.search(a.arg or "", limit=a.limit, place=a.place, include_history=a.history)
        if a.trace:
            with open(a.trace, "a", encoding="utf-8") as f: f.write(json.dumps({"at": out["at"], "query": out["query"], "place": a.place, "activeRevision": out["activeRevision"], "returnedRecordIds": out["returnedRecordIds"]}) + "\n")
    elif a.cmd == "records":
        out = {"activeRevision": kb.active_revision, "records": [kb.record_out(r) for r in kb.records.values() if (a.history or r["_eff"]["active"]) and (not a.subject or a.subject in r["subjects"]) and (not a.predicate or r["predicate"] == a.predicate)]}
    elif a.cmd == "entity":
        e = kb.entities.get(a.arg)
        out = None if not e else {"entity": {k: v for k, v in e.items() if k != "legacy"}, "activeRecordIds": [r["id"] for r in kb.records_of(a.arg)],
                                  "historyRecordIds": [r["id"] for r in kb.records_of(a.arg, True) if not r["_eff"]["active"]], "activeRevision": kb.active_revision}
    else:
        out = kb.resolve(a.arg or "")
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1); print()


if __name__ == "__main__":
    main()
