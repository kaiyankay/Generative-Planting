#!/usr/bin/env python3
"""Research validation: the same questions against Preset and Combined knowledge.

  python3 -I tools/knowledge/llm/validate.py [--workspace my-knowledge.json] [--run-model]

Part 1 (always, no model): keyword retrieval for each question on Preset and on Combined — what each layer would hand a model.
Part 2 (only with --run-model AND Claude connected): the same model, questions and settings answer once per layer through the
read-only tools; for each run it records what the tools retrieved, what the answer cited, and the answer itself — kept apart.
Without both, Part 2 is written as NOT RUN with the reason. No result is assumed in advance.

The designer layer is the exported workspace given with --workspace (Kay's own knowledge); without it, the fixed test event
script from the browser tests (docs/qa/knowledge_parity.json) is used and labelled as such — it is not anyone's real knowledge.
Writes docs/qa/knowledge_validation.json and docs/knowledge/02b/VALIDATION.md.
"""
import argparse, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import kq, provider  # noqa: E402

ROOT = kq.ROOT
QUESTIONS = [
    {"q": "Is Kinnikinnick suitable for a dry, sunny slope in Vancouver?", "place": "place:vancouver"},
    {"q": "How much summer water does Yarrow need once established?", "place": "place:vancouver"},
    {"q": "Which plants in the library tolerate drought?", "place": "place:vancouver"},
    {"q": "What do the designers in the survey say about Yarrow?", "place": ""},
    {"q": "Which insects visit Zizia aurea flowers, and where was that recorded?", "place": "place:vancouver"},
    {"q": "When can a new planting be watered under Metro Vancouver's restrictions?", "place": "place:vancouver"},
    {"q": "Which members of the B beds recipe flower in late summer?", "place": ""},
    {"q": "Acer griseum", "place": "place:vancouver"},
]
K = 12


def short(kb, rid):
    r = kb.records.get(rid) or {}
    return {"id": rid, "origin": r.get("origin"), "statement": (r.get("statement") or "")[:120]}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--workspace"); ap.add_argument("--run-model", action="store_true"); a = ap.parse_args()
    seed = kq.load_seed()
    if a.workspace:
        ws = json.load(open(a.workspace, encoding="utf-8")); events = ws["events"]; layer_src = f"exported workspace {os.path.basename(a.workspace)}"
    else:
        events = json.load(open(os.path.join(ROOT, "docs", "qa", "knowledge_parity.json"), encoding="utf-8"))["events"]
        layer_src = "TEST EVENT SCRIPT from the browser tests (docs/qa/knowledge_parity.json) — not a real designer's knowledge"
    pre, comb = kq.KB(seed, None, []), kq.KB(seed, None, events)
    rows = []
    for item in QUESTIONS:
        p = pre.search(item["q"], limit=K, place=item["place"] or None)["returnedRecordIds"]
        c = comb.search(item["q"], limit=K, place=item["place"] or None)["returnedRecordIds"]
        added = [i for i in c if i not in p]; dropped = [i for i in p if i not in c]
        why = {}
        for i in dropped:
            eff = comb.records[i]["_eff"]
            why[i] = eff.get("why") + (f" by {eff['by']}" if eff.get("by") else "") if not eff["active"] else "pushed below the top %d by other records" % K
        rows.append({"question": item["q"], "projectPlace": item["place"] or None, "preset": p, "combined": c,
                     "addedInCombined": [dict(short(comb, i), personal=comb.records[i].get("origin") == "user") for i in added],
                     "droppedInCombined": [dict(short(pre, i), why=why[i]) for i in dropped],
                     "jaccard": round(len(set(p) & set(c)) / max(1, len(set(p) | set(c))), 3)})
    st = provider.status()
    model = {"status": "not run", "reason": None, "runs": []}
    if not a.run_model: model["reason"] = "--run-model not given (each run is a paid API call)"
    elif not st["connected"]: model["reason"] = "Claude not connected: " + "; ".join(c["detail"] for c in st["checks"] if not c["ok"])
    else:
        model["status"] = "run"; model["settings"] = {"model": provider.MODEL, "effort": provider.EFFORT, "fallbacks": "default", "max_tokens": 16000, "tools": [t["name"] for t in provider.TOOLS]}
        for item in QUESTIONS:
            for name, kb in (("preset", pre), ("combined", comb)):
                res = provider.ask(kb, item["q"], {"layer": name, "projectPlace": item["place"] or None, "selection": None, "retrievedIds": []})
                model["runs"].append({"question": item["q"], "layer": name, "status": res.get("status"), "model": res.get("model"), "retrieved": res.get("retrieved_record_ids"),
                                      "cited": res.get("cited_record_ids"), "citedNotRetrieved": [r["id"] for r in res.get("refs", []) if r["type"] == "record" and not r["retrieved"]],
                                      "citedUnknown": [r["id"] for r in res.get("refs", []) if not r["exists"]], "answer": res.get("answer"), "usage": res.get("usage"), "error": res.get("error")})
    out = {"at": time.strftime("%Y-%m-%d %H:%M"), "presetRevision": pre.active_revision, "combinedRevision": comb.active_revision, "designerLayer": layer_src,
           "retrieval": {"method": "keyword + alias index (kq.py = window.GPK), top %d, no model" % K, "questions": rows}, "model": model, "connection": st}
    os.makedirs(os.path.join(ROOT, "docs", "qa"), exist_ok=True)
    json.dump(out, open(os.path.join(ROOT, "docs", "qa", "knowledge_validation.json"), "w"), indent=1, ensure_ascii=False)
    md = [f"# Preset vs Combined — validation run {out['at']}", "",
          f"- Preset `{pre.active_revision}` · Combined `{comb.active_revision}`",
          f"- Designer layer: {layer_src}", "",
          "## Part 1 — retrieval (real, no model)", "",
          f"Top {K} records per question, keyword + alias index (the same in the browser and in `kq.py`). What changes between layers is only what the designer layer adds, revises or leaves out.", "",
          "| Question | Same records (Jaccard) | Added in Combined | Left out in Combined |", "|---|---|---|---|"]
    for r in rows:
        md.append(f"| {r['question']} | {r['jaccard']} | {len(r['addedInCombined'])} ({sum(1 for x in r['addedInCombined'] if x['personal'])} personal) | {len(r['droppedInCombined'])}" + (f" — {', '.join(sorted(set(x['why'] for x in r['droppedInCombined'])))}" if r['droppedInCombined'] else "") + " |")
    md += ["", "## Part 2 — Claude's answers (same model, questions and settings per layer)", ""]
    if model["status"] != "run":
        md += [f"**NOT RUN.** {model['reason']}.", "", "Nothing about Claude's answers is reported here. When run, each question records, per layer: what the tools retrieved, what the answer cited (and any citation not retrieved or not in the knowledge), and the answer text — kept apart."]
    else:
        md += ["| Question | Layer | Retrieved | Cited | Cited, not retrieved | Cited, unknown |", "|---|---|---|---|---|---|"]
        for m in model["runs"]:
            md.append(f"| {m['question']} | {m['layer']} | {len(m['retrieved'] or [])} | {len(m['cited'] or [])} | {len(m['citedNotRetrieved'])} | {len(m['citedUnknown'])} |")
        md += ["", "Answers are in `docs/qa/knowledge_validation.json`."]
    os.makedirs(os.path.join(ROOT, "docs", "knowledge", "02b"), exist_ok=True)
    open(os.path.join(ROOT, "docs", "knowledge", "02b", "VALIDATION.md"), "w").write("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
