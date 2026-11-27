"""Claude provider adapter for the Knowledge Workspace (Phase 02A.1 Part B).

Three gates must all be open before any model call is made — otherwise the adapter reports "not connected" and returns
no answer (never a simulated one):
  1. the official SDK is importable          (pip install anthropic)
  2. credentials exist on this machine        (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / an `ant auth login` profile)
  3. paid calls are explicitly authorised     (GP_CLAUDE_ALLOW_CALLS=1 in the server's environment)

Model: Claude Sonnet 5.5 (`claude-sonnet-5-5`, override with GP_CLAUDE_MODEL). Adaptive thinking (the model default), effort
"medium", server-side refusal fallback (`fallbacks: "default"`, beta server-side-fallback-2026-07-01).
The model reads the knowledge only through read-only tools over the SAME effective knowledge the browser shows (Preset +
the designer's events, rebuilt by tools/knowledge/kq.py and checked against the browser's activeRevision).
"""
import json, os, re, time

MODEL = os.environ.get("GP_CLAUDE_MODEL", "claude-sonnet-5-5")
FALLBACK_BETA = "server-side-fallback-2026-07-01"
EFFORT = os.environ.get("GP_CLAUDE_EFFORT", "medium")
MAX_TOOL_ROUNDS = 8

SYSTEM = """You answer questions from a landscape designer using only the Generative Planting knowledge base, which you read through the tools.

How to work:
- Search before you answer. Use search_knowledge, then get_evidence or get_records for the records you rely on; use resolve_name to identify a plant the designer names.
- Cite every claim with the record it comes from, written exactly as [[record:RECORD_ID]]. Name plants, recipes, datasets and places as [[entity:ENTITY_ID|display name]]. Only cite ids the tools returned.
- Keep the kind of evidence visible: say when a record is the designer's own knowledge, a survey statement (professional judgement, not a measurement), a value read from a database by a language model and not checked by a person, a name-match research lead, or recorded in a different place from the project.
- Shared attributes and list membership are not compatibility or community evidence; say so if the question leans that way.
- If the knowledge base does not hold the answer, say what is missing. Anything you add from general knowledge must be labelled "not from the knowledge base".
- Answer in the language of the question. Be concise; a designer reads this beside the plan."""

TOOLS = [
    {"name": "search_knowledge", "strict": True,
     "description": "Keyword and alias search over the knowledge in effect (Preset plus the designer's own layer). Returns records with ids, subjects, statement, value, source, place match against the project place, and evidence flags.",
     "input_schema": {"type": "object", "properties": {
         "query": {"type": "string", "description": "words to search for, e.g. plant names and the topic"},
         "project_place": {"type": "string", "description": "place id of the project, e.g. place:vancouver, or an empty string"}},
         "required": ["query", "project_place"], "additionalProperties": False}},
    {"name": "get_evidence", "strict": True,
     "description": "Full records for a list of record ids: statement, value, context (place, time, conditions), sources with locators, provenance and flags.",
     "input_schema": {"type": "object", "properties": {"record_ids": {"type": "array", "items": {"type": "string"}}},
                      "required": ["record_ids"], "additionalProperties": False}},
    {"name": "get_records", "strict": True,
     "description": "Records in effect about one entity, optionally for one predicate (e.g. water_drainage, exposure, seasonal_interest, mature_height, fills_role).",
     "input_schema": {"type": "object", "properties": {"subject_id": {"type": "string"}, "predicate": {"type": "string", "description": "a predicate or an empty string for all"}},
                      "required": ["subject_id", "predicate"], "additionalProperties": False}},
    {"name": "get_entity", "strict": True,
     "description": "One entity (plant, cultivar, recipe, dataset, place, list): names, type, status, and the ids of its records in effect.",
     "input_schema": {"type": "object", "properties": {"entity_id": {"type": "string"}}, "required": ["entity_id"], "additionalProperties": False}},
    {"name": "resolve_name", "strict": True,
     "description": "Match a plant name as written (scientific or common, any case) to entity ids; reports exact, ambiguous or none. Never guesses.",
     "input_schema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"], "additionalProperties": False}},
]

EXTRACT_SCHEMA = {"type": "object", "additionalProperties": False, "required": ["statements"], "properties": {"statements": {"type": "array", "items": {
    "type": "object", "additionalProperties": False,
    "required": ["text", "subjects", "kind", "place_id", "place_as_written", "time", "conditions", "topic", "value", "uncertain"],
    "properties": {
        "text": {"type": "string", "description": "the designer's words for this statement, copied verbatim from the input"},
        "subjects": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["name_as_written", "entity_id"],
                     "properties": {"name_as_written": {"type": "string"}, "entity_id": {"type": "string", "description": "id from resolve_name, or empty if not exactly matched"}}}},
        "kind": {"type": "string", "enum": ["observation", "practice", "preference", "project_requirement", "note"]},
        "place_id": {"type": "string", "description": "a place id from the knowledge base, or empty"}, "place_as_written": {"type": "string"},
        "time": {"type": "string", "description": "when, as stated (years, season, plant age), or empty"},
        "conditions": {"type": "array", "items": {"type": "string"}, "description": "site conditions as stated (soil, slope, irrigation…)"},
        "topic": {"type": "string", "enum": ["water", "light", "soil", "tolerance", "ecology", "season", "size_form", "use", "behaviour", "maintenance", "other"]},
        "value": {"type": "string", "description": "the claim in a few words, or empty"},
        "uncertain": {"type": "array", "items": {"type": "string"}, "description": "what could not be decided from the words alone"}}}}}}

EXTRACT_SYSTEM = """You turn a landscape designer's own words into a structured preview for their personal knowledge layer. The designer reviews and edits every field before anything is saved.
Rules: split into statements only where the text makes separate claims; copy each statement's text verbatim; identify plants with resolve_name and use an entity id only for an exact match (otherwise leave entity_id empty); use a place id only if the text names that place; leave time, place and value empty when they are not stated; never add facts that are not in the text; list in `uncertain` what the words leave open."""


def status():
    checks = []
    try:
        import anthropic  # noqa: F401
        checks.append({"id": "sdk", "ok": True, "detail": "anthropic " + getattr(anthropic, "__version__", "")})
    except Exception:
        checks.append({"id": "sdk", "ok": False, "detail": 'Python package "anthropic" is not installed — pip install anthropic'})
    cred = bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.path.isdir(os.path.expanduser("~/.config/anthropic")))
    checks.append({"id": "credentials", "ok": cred, "detail": "credentials found" if cred else "no ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / `ant auth login` profile on this machine"})
    allowed = os.environ.get("GP_CLAUDE_ALLOW_CALLS") == "1"
    checks.append({"id": "authorised", "ok": allowed, "detail": "paid calls authorised (GP_CLAUDE_ALLOW_CALLS=1)" if allowed else "paid calls not authorised — start the server with GP_CLAUDE_ALLOW_CALLS=1 when you want real calls"})
    return {"connected": all(c["ok"] for c in checks), "provider": "anthropic", "model": MODEL, "effort": EFFORT, "fallbacks": "default", "checks": checks}


# ---------- tools over the effective knowledge (read-only) ----------
LOCAL_ONLY_SOURCES = {"mv-water-restrictions", "mv-seasonal-lawn-care", "robertson-1929"}   # licence not cleared: verbatim text / digitised rows stay local


def model_view(o):
    """What may leave this machine for a record: no verbatim third-party quotes, no digitised dataset rows, no raw/legacy fields."""
    o = dict(o); o.pop("quote", None); o.pop("raw", None)
    refs = []
    for s in o.get("sourceRefs") or []:
        s = {k: v for k, v in s.items() if k in ("sourceId", "sourceType", "sourceName", "url", "accessed", "page")}
        if s.get("sourceId") in LOCAL_ONLY_SOURCES: s["note"] = "verbatim text and table rows from this source stay on the designer's machine (licence not cleared)"
        refs.append(s)
    o["sourceRefs"] = refs
    return o


def _rec_brief(kb, r):
    o = model_view(kb.record_out(r))
    src = o["sourceRefs"][0] if o["sourceRefs"] else {}
    return {"record_id": o["recordId"], "subjects": [s["name"] for s in o["subjects"]], "subject_ids": [s["id"] for s in o["subjects"]], "predicate": o["predicate"],
            "statement": o["statement"], "value": o["value"], "source": src.get("sourceName"), "place": (o.get("context") or {}).get("place"),
            "origin": o["origin"], "evidence_status": o["evidenceStatus"], "flags": o["flags"], "provenance": o.get("provenance")}


def run_tool(kb, name, args, trace):
    if name == "search_knowledge":
        res = kb.search(args.get("query", ""), limit=12, place=args.get("project_place") or None)
        ids = res["returnedRecordIds"]; trace["retrieved"].extend(ids)
        out = [{**_rec_brief(kb, kb.records[i]), "score": r["score"], "place_match": r.get("placeMatch")} for i, r in zip(ids, res["results"])]
        return {"results": out, "known_but_empty": res["missing"]}
    if name == "get_evidence":
        ids = [i for i in args.get("record_ids", []) if i in kb.records][:30]; trace["retrieved"].extend(ids)
        return {"records": [model_view(kb.record_out(kb.records[i])) for i in ids], "unknown_ids": [i for i in args.get("record_ids", []) if i not in kb.records]}
    if name == "get_records":
        sid = args.get("subject_id", ""); pred = args.get("predicate") or None
        rs = [r for r in kb.records.values() if r["_eff"]["active"] and sid in r["subjects"] and (not pred or r["predicate"] == pred)]
        rs.sort(key=lambda r: (r.get("origin") != "user", r["predicate"], r["id"]))     # the designer's own records are never the ones cut
        shown = rs[:40]; trace["retrieved"].extend(r["id"] for r in shown)
        out = {"records": [_rec_brief(kb, r) for r in shown], "total": len(rs)}
        if len(rs) > len(shown): out["note"] = f"showing {len(shown)} of {len(rs)}; the designer's own records come first — ask for one predicate to see the rest"
        return out
    if name == "get_entity":
        e = kb.entities.get(args.get("entity_id", ""))
        if not e: return {"error": "unknown entity id"}
        recs = kb.records_of(e["id"])
        return {"entity": {k: v for k, v in e.items() if k not in ("legacy",)}, "active_record_ids": [r["id"] for r in recs][:80], "records_in_effect": len(recs)}
    if name == "resolve_name":
        return kb.resolve(args.get("name", ""))
    return {"error": "unknown tool " + name}


REF = re.compile(r"\[\[(record|entity):([^\]|]+)(?:\|([^\]]*))?\]\]")


def parse_refs(kb, text, retrieved):
    out = []
    for m in REF.finditer(text or ""):
        kind, rid, label = m.group(1), m.group(2).strip(), m.group(3)
        exists = rid in kb.records if kind == "record" else rid in kb.entities
        out.append({"type": kind, "id": rid, "label": label, "exists": exists, "retrieved": kind == "record" and rid in retrieved})
    return out


def _client():
    import anthropic
    return anthropic.Anthropic()


def _call(client, **kw):
    """One Messages request with the documented server-side refusal fallback for Claude Sonnet 5.5."""
    return client.beta.messages.create(model=MODEL, max_tokens=16000, betas=[FALLBACK_BETA], fallbacks="default", output_config=kw.pop("output_config", {"effort": EFFORT}), **kw)


def _err(e):
    try: import anthropic
    except Exception: return "unexpected error: " + e.__class__.__name__
    if isinstance(e, anthropic.AuthenticationError): return "authentication failed (check the API key)"
    if isinstance(e, anthropic.PermissionDeniedError): return "the credentials lack permission for this model"
    if isinstance(e, anthropic.NotFoundError): return f"model {MODEL} not found for these credentials"
    if isinstance(e, anthropic.RateLimitError): return "rate limited — try again shortly"
    if isinstance(e, anthropic.BadRequestError): return "bad request: " + str(getattr(e, "message", e))
    if isinstance(e, anthropic.APIStatusError): return f"API error {e.status_code}"
    if isinstance(e, anthropic.APIConnectionError): return "network error reaching the API"
    return "unexpected error: " + e.__class__.__name__


def ask(kb, question, context, client=None):
    """Answer with tool use over `kb`. Returns retrieved ids, tool calls, cited refs and the answer — kept apart for research.
    `client` is for unit tests of the loop only (a scripted stand-in, never presented as Claude); production always goes through the gates."""
    st = status()
    if client is None:
        if not st["connected"]:
            return {"status": "not_connected", "connection": st}
        client = _client()
    trace = {"retrieved": [], "tool_calls": []}
    head = (f"Context — layer: {context.get('layer')}; knowledge revision: {kb.active_revision}; project place: {context.get('projectPlace') or 'not set'}; "
            f"selected object: {json.dumps(context.get('selection'), ensure_ascii=False)}; browser retrieval already run for this question returned: {', '.join(context.get('retrievedIds') or []) or 'nothing'}.")
    messages = [{"role": "user", "content": head + "\n\nQuestion: " + question}]
    t0 = time.time(); usage = {"input_tokens": 0, "output_tokens": 0}; resp = None
    try:
        for _ in range(MAX_TOOL_ROUNDS):
            resp = _call(client, system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}], tools=TOOLS, messages=messages)
            usage["input_tokens"] += resp.usage.input_tokens; usage["output_tokens"] += resp.usage.output_tokens
            if resp.stop_reason in ("end_turn", "refusal", "max_tokens"): break
            if resp.stop_reason == "pause_turn":
                messages.append({"role": "assistant", "content": resp.content}); continue
            uses = [b for b in resp.content if b.type == "tool_use"]
            if not uses: break
            messages.append({"role": "assistant", "content": resp.content})
            results = []
            for b in uses:
                out = run_tool(kb, b.name, b.input if isinstance(b.input, dict) else {}, trace)
                trace["tool_calls"].append({"name": b.name, "input": b.input, "returned": len(json.dumps(out))})
                results.append({"type": "tool_result", "tool_use_id": b.id, "content": json.dumps(out, ensure_ascii=False)[:60000], "is_error": "error" in out})
            messages.append({"role": "user", "content": results})
    except Exception as e:  # SDK errors → a readable reason, no answer
        return {"status": "error", "error": _err(e), "connection": st, "trace": trace}
    text = "".join(b.text for b in (resp.content if resp else []) if b.type == "text")
    retrieved = list(dict.fromkeys(trace["retrieved"]))
    refs = parse_refs(kb, text, set(retrieved))
    return {"status": "answered" if resp and resp.stop_reason != "refusal" else "refused", "model": getattr(resp, "model", MODEL), "stop_reason": getattr(resp, "stop_reason", None),
            "answer": text, "refs": refs, "retrieved_record_ids": retrieved, "cited_record_ids": [r["id"] for r in refs if r["type"] == "record"],
            "tool_calls": trace["tool_calls"], "usage": usage, "seconds": round(time.time() - t0, 1), "activeRevision": kb.active_revision}


def extract(kb, text, client=None):
    """Structured, editable preview of the designer's words. Never applied here: the browser shows it and saves only on confirmation."""
    st = status()
    if client is None:
        if not st["connected"]:
            return {"status": "not_connected", "connection": st}
        client = _client()
    trace = {"retrieved": [], "tool_calls": []}
    messages = [{"role": "user", "content": "Designer's input (verbatim):\n" + text}]
    tools = [t for t in TOOLS if t["name"] in ("resolve_name", "search_knowledge")]
    try:
        for _ in range(MAX_TOOL_ROUNDS):
            resp = _call(client, system=EXTRACT_SYSTEM, tools=tools, messages=messages,
                         output_config={"effort": EFFORT, "format": {"type": "json_schema", "schema": EXTRACT_SCHEMA}})
            if resp.stop_reason != "tool_use": break
            messages.append({"role": "assistant", "content": resp.content})
            results = []
            for b in resp.content:
                if b.type == "tool_use":
                    out = run_tool(kb, b.name, b.input if isinstance(b.input, dict) else {}, trace)
                    trace["tool_calls"].append({"name": b.name, "input": b.input})
                    results.append({"type": "tool_result", "tool_use_id": b.id, "content": json.dumps(out, ensure_ascii=False)[:30000]})
            messages.append({"role": "user", "content": results})
    except Exception as e:
        return {"status": "error", "error": _err(e), "connection": st}
    if resp.stop_reason == "refusal":
        return {"status": "refused", "model": resp.model}
    raw = next((b.text for b in resp.content if b.type == "text"), "{}")
    try: data = json.loads(raw)
    except ValueError: return {"status": "error", "error": "the model did not return the preview format", "stop_reason": resp.stop_reason}
    for s in data.get("statements", []):      # the server checks every id the model proposes; unknown ids are cleared, never invented
        for sub in s["subjects"]:
            if sub["entity_id"] and sub["entity_id"] not in kb.entities: sub["entity_id"] = ""; s["uncertain"].append(f"no entity for {sub['name_as_written']}")
        if s["place_id"] and s["place_id"] not in kb.entities: s["place_id"] = ""
    return {"status": "preview", "model": resp.model, "preview": data, "tool_calls": trace["tool_calls"], "input": text, "activeRevision": kb.active_revision,
            "note": "model extraction — nothing is saved until the designer confirms"}
