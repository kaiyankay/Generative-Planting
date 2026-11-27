#!/usr/bin/env python3
"""Tests for the Claude provider adapter and the knowledge server — no network, no model, no API charge.

  python3 -I tools/knowledge/llm/test_llm.py

L01–L09 test the adapter's own logic. Where the tool loop needs model turns, a SCRIPTED STAND-IN replays fixed blocks; it checks
what our code sends and how it handles each stop reason. It says nothing about Claude's answers. The real-model tests are
listed at the end as NOT RUN unless the server reports Claude connected and GP_CLAUDE_LIVE_TEST=1 is set.
Writes docs/qa/knowledge_llm_tests.json (knowledge_llm_tests_public.json with GP_KNOWLEDGE_COPY=public, after run_knowledge_tests.py --copy public).
"""
import json, os, sys, threading, types, urllib.request, urllib.error
from http.server import ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import kq, provider, server  # noqa: E402

ROOT = kq.ROOT
results = []


def check(name, ok, detail=""):
    results.append({"name": name, "ok": bool(ok), "detail": "" if ok else str(detail)[:400]})
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  -> " + str(detail)[:300]))


def notrun(name, why):
    results.append({"name": name, "ok": None, "notRun": True, "detail": why}); print("NOT RUN " + name + " — " + why)


seed = kq.load_seed()
SFX = "_public" if seed["meta"].get("copy") == "public" else ""                   # each copy has its own browser fixture (events + revision)
fx = json.load(open(os.path.join(ROOT, "docs", "qa", f"knowledge_parity{SFX}.json"), encoding="utf-8"))
kb = kq.KB(seed, None, fx["events"]); base = kq.KB(seed, None, [])

# ---------- L01–L02 gates ----------
st = provider.status()
check("L01 status reports the three gates (SDK, credentials, authorisation) and never the key itself",
      [c["id"] for c in st["checks"]] == ["sdk", "credentials", "authorised"] and st["model"] == "claude-sonnet-5-5" and st["fallbacks"] == "default"
      and not any(os.environ.get(k, "\0") in json.dumps(st) for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")), st)
if not st["connected"]:
    before = "anthropic" in sys.modules
    a = provider.ask(kb, "Is Kinnikinnick drought tolerant?", {"layer": "combined"}); e = provider.extract(kb, "Yarrow self-seeds in gravel.")
    check("L02 not connected: ask and extract return not_connected with reasons, no answer and no client is created",
          a["status"] == "not_connected" and e["status"] == "not_connected" and "answer" not in a and "preview" not in e and ("anthropic" in sys.modules) == before, (a, e))
else:
    notrun("L02 not-connected gate", "Claude is connected on this machine")

# ---------- L03–L06 read-only tools over the effective knowledge ----------
tr = {"retrieved": [], "tool_calls": []}
out = provider.run_tool(kb, "search_knowledge", {"query": "Kinnikinnick drought tolerant", "project_place": "place:vancouver"}, tr)
ref = kb.search("Kinnikinnick drought tolerant", limit=12, place="place:vancouver")
check("L03 search_knowledge = kq retrieval on the same effective knowledge (ids, order, place match), and is recorded as retrieved",
      [r["record_id"] for r in out["results"]] == ref["returnedRecordIds"] and tr["retrieved"] == ref["returnedRecordIds"] and all("place_match" in r for r in out["results"]))
mv = provider.run_tool(kb, "get_evidence", {"record_ids": ["mvw:restriction-period", "obs:robertson-1929:zizia-aurea", "no-such-record"]}, tr)
blob = json.dumps(mv, ensure_ascii=False)
quotes = [r["quote"] for r in seed["records"] if r.get("quote")]      # the verbatim quotes this copy holds (none in the public copy)
check("L04 licence-restricted text stays local: no verbatim Metro Vancouver quote or locator, Robertson marked; unknown ids reported, not invented",
      not any(q in blob for q in quotes) and all("locator" not in s for r in mv["records"] for s in r["sourceRefs"])
      and any("stay on the designer's machine" in s.get("note", "") for r in mv["records"] for s in r["sourceRefs"]) and mv["unknown_ids"] == ["no-such-record"], blob[:300])
pers = [r for r in kb.records.values() if r.get("origin") == "user" and r["_eff"]["active"]]
gr = provider.run_tool(kb, "get_records", {"subject_id": "achillea-millefolium", "predicate": ""}, tr)
gb = provider.run_tool(base, "get_records", {"subject_id": "achillea-millefolium", "predicate": ""}, {"retrieved": [], "tool_calls": []})
mine_ids = {r["id"] for r in pers if "achillea-millefolium" in r["subjects"]}
check("L05 get_records reads the layer it was given: Combined includes the designer's Yarrow note, Preset does not",
      mine_ids and mine_ids <= {r["record_id"] for r in gr["records"]} and not (mine_ids & {r["record_id"] for r in gb["records"]}), mine_ids)
rn = provider.run_tool(kb, "resolve_name", {"name": "kinnikinnick"}, tr); en = provider.run_tool(kb, "get_entity", {"entity_id": "arctostaphylos-uva-ursi"}, tr)
check("L06 resolve_name and get_entity", rn["status"] == "exact" and rn["matches"][0]["id"] == "arctostaphylos-uva-ursi" and en["records_in_effect"] > 10 and "legacy" not in en["entity"]
      and provider.run_tool(kb, "get_entity", {"entity_id": "nope"}, tr).get("error"))

# ---------- L07 tool schemas ----------
ok = True
for t in provider.TOOLS:
    s = t["input_schema"]; ok &= t.get("strict") is True and s.get("additionalProperties") is False and sorted(s["required"]) == sorted(s["properties"])
def strict_obj(s):
    if s.get("type") == "object": return s.get("additionalProperties") is False and sorted(s["required"]) == sorted(s["properties"]) and all(strict_obj(v) for v in s["properties"].values())
    if s.get("type") == "array": return strict_obj(s["items"])
    return True
check("L07 every tool is strict (additionalProperties false, all properties required); the extraction schema is strict throughout", ok and strict_obj(provider.EXTRACT_SCHEMA))

# ---------- L08–L09 the loop, against a scripted stand-in (not a model) ----------
B = lambda **k: types.SimpleNamespace(**k)
class Stub:
    """Replays fixed responses and records every request our code sends. Not Claude; nothing here is shown as an answer."""
    def __init__(self, turns): self.turns = list(turns); self.calls = []; self.beta = B(messages=B(create=self.create))
    def create(self, **kw): self.calls.append(json.loads(json.dumps(kw, default=lambda o: o.__dict__))); return self.turns.pop(0)
U = lambda: B(input_tokens=10, output_tokens=5)
stub = Stub([
    B(stop_reason="tool_use", model="stub", usage=U(), content=[B(type="text", text="Looking."), B(type="tool_use", id="t1", name="search_knowledge", input={"query": "Kinnikinnick drought", "project_place": "place:vancouver"}),
                                                                 B(type="tool_use", id="t2", name="resolve_name", input={"name": "Kinnikinnick"})]),
    B(stop_reason="pause_turn", model="stub", usage=U(), content=[B(type="text", text="")]),
    B(stop_reason="end_turn", model="stub", usage=U(), content=[B(type="text", text=f"STUB TEXT [[record:{ref['returnedRecordIds'][0]}]] [[record:arctostaphylos-uva-ursi:water_drainage:mobot01]] [[record:invented-id]] [[entity:arctostaphylos-uva-ursi|Kinnikinnick]]")]),
])
res = provider.ask(kb, "Is Kinnikinnick drought tolerant?", {"layer": "combined", "projectPlace": "place:vancouver", "selection": {"kind": "entity", "id": "arctostaphylos-uva-ursi"}, "retrievedIds": []}, client=stub)
c0 = stub.calls[0]; c1 = stub.calls[1]
check("L08 request: claude-sonnet-5-5, server-side fallback beta with fallbacks='default', effort medium, max_tokens 16000, cached system prompt, the five strict tools",
      c0["model"] == "claude-sonnet-5-5" and c0["betas"] == ["server-side-fallback-2026-07-01"] and c0["fallbacks"] == "default" and c0["output_config"] == {"effort": "medium"} and c0["max_tokens"] == 16000
      and c0["system"][0]["cache_control"] == {"type": "ephemeral"} and [t["name"] for t in c0["tools"]] == [t["name"] for t in provider.TOOLS] and "thinking" not in c0, {k: c0[k] for k in ("model", "betas", "fallbacks", "output_config")})
tr_msg = c1["messages"][-1]; ref2 = kb.search("Kinnikinnick drought", limit=12, place="place:vancouver")["returnedRecordIds"]
check("L09 loop: both tool results go back in ONE user message (ids matched), pause_turn is continued, and retrieved / cited / answer are reported apart",
      tr_msg["role"] == "user" and [b["tool_use_id"] for b in tr_msg["content"]] == ["t1", "t2"] and len(stub.calls) == 3 and res["status"] == "answered"
      and res["retrieved_record_ids"][:len(ref2)] == ref2 and res["cited_record_ids"] == [ref["returnedRecordIds"][0], "arctostaphylos-uva-ursi:water_drainage:mobot01", "invented-id"]
      and [r["retrieved"] for r in res["refs"] if r["type"] == "record"] == [True, "arctostaphylos-uva-ursi:water_drainage:mobot01" in res["retrieved_record_ids"], False]
      and [r["exists"] for r in res["refs"]] == [True, True, False, True] and res["activeRevision"] == kb.active_revision and res["usage"]["input_tokens"] == 30, json.dumps(res)[:400])
stub2 = Stub([B(stop_reason="end_turn", model="stub", usage=U(), content=[B(type="text", text=json.dumps({"statements": [{"text": "Yarrow self-seeds", "subjects": [{"name_as_written": "Yarrow", "entity_id": "achillea-millefolium"}, {"name_as_written": "Foo bar", "entity_id": "made-up"}], "kind": "observation", "place_id": "place:nowhere", "place_as_written": "", "time": "", "conditions": [], "topic": "behaviour", "value": "", "uncertain": []}]}))])])
ex = provider.extract(kb, "Yarrow self-seeds", client=stub2); x = ex["preview"]["statements"][0]
check("L10 extraction: json_schema output format; ids the knowledge does not hold are cleared (never invented) and noted; result is a preview only",
      stub2.calls[0]["output_config"]["format"]["type"] == "json_schema" and ex["status"] == "preview" and x["subjects"][0]["entity_id"] == "achillea-millefolium" and x["subjects"][1]["entity_id"] == "" and x["place_id"] == ""
      and any("Foo bar" in u for u in x["uncertain"]) and "nothing is saved" in ex["note"] and kb.active_revision == ex["activeRevision"])
stub3 = Stub([B(stop_reason="refusal", model="stub", usage=U(), content=[])])
check("L11 a refusal is reported as declined, with no answer text", provider.ask(kb, "x", {}, client=stub3)["status"] == "refused")

# ---------- S01–S07 the server ----------
srv = ThreadingHTTPServer(("127.0.0.1", 0), type("H", (server.Handler,), {"log_message": lambda *a, **k: None}))
threading.Thread(target=srv.serve_forever, daemon=True).start(); P = srv.server_address[1]
def req(path, body=None, headers=None, method=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    r = urllib.request.Request(f"http://127.0.0.1:{P}{path}", data=json.dumps(body).encode() if body is not None else None, headers=h, method=method or ("POST" if body is not None else "GET"))
    try:
        with urllib.request.urlopen(r) as f: return f.status, json.loads(f.read() or b"null") if "json" in f.headers.get("Content-Type", "") else f.read()
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"null")
s, b = req("/api/llm/status")
check("S01 GET /api/llm/status: same gates as the adapter, plus the Preset version the server reads", s == 200 and b["checks"] == st["checks"] and b["baseVersion"] == seed["meta"]["baseVersion"])
same = True; detail = []
for q in fx["queries"]:
    s, b = req("/api/retrieve", {"query": q["q"], "limit": 20, "layer": "combined", "activeRevision": fx["activeRevision"], "events": fx["events"]})
    if s != 200 or b["returnedRecordIds"] != q["ids"] or b["scores"] != q["scores"]: same = False; detail.append(q["q"])
for q in fx["baseQueries"]:
    s, b = req("/api/retrieve", {"query": q["q"], "limit": 20, "layer": "preset", "activeRevision": base.active_revision, "events": fx["events"]})
    if s != 200 or b["returnedRecordIds"] != q["ids"]: same = False; detail.append("preset " + q["q"])
check(f"S02 the server rebuilds the browser's knowledge from its events: {len(fx['queries'])} Combined + {len(fx['baseQueries'])} Preset queries return the browser's ids and scores", same, detail)
s, b = req("/api/retrieve", {"query": "x", "layer": "combined", "activeRevision": "base-wrong+0e:00000000", "events": fx["events"]})
check("S03 a different knowledge version is refused (409) with both revisions", s == 409 and b["server"] == fx["activeRevision"])
s1, _ = req("/api/ask", {"question": "x"}, {"Origin": "https://example.com"}); s2, _ = req("/api/ask", {"question": "x"}, {"Content-Type": "text/plain"})
check("S04 requests from another web origin are refused (403); non-JSON bodies are refused (415)", s1 == 403 and s2 == 415)
codes = [req(p)[0] for p in ("/private-inputs/x.csv", "/knowledge/../private-inputs/x.csv", "/%2e%2e/private-inputs/x", "/.git/config", "/.claude/launch.json")]
check("S05 private inputs, git metadata and local settings are never served (also through ../ or encoded paths)", all(c == 404 for c in codes), codes)
s, b = req("/api/ask", {"question": "Is Kinnikinnick drought tolerant?", "layer": "combined", "activeRevision": fx["activeRevision"], "events": fx["events"]})
check("S06 /api/ask over HTTP: not connected here, so no answer text — or a real answer only when every gate is open", s == 200 and (b["status"] == "not_connected" and "answer" not in b if not st["connected"] else b["status"] in ("answered", "refused", "error")))
s, b = req("/knowledge/index.html", method="GET")
check("S07 the page itself is served by the same server (same origin as the API)", s == 200)
srv.shutdown()

# ---------- real-model tests ----------
LIVE = st["connected"] and os.environ.get("GP_CLAUDE_LIVE_TEST") == "1"
why = "Claude not connected on this machine (" + "; ".join(c["detail"] for c in st["checks"] if not c["ok"]) + ")" if not st["connected"] else "GP_CLAUDE_LIVE_TEST=1 not set (would incur API charges)"
for n in ["R01 a real question answered by claude-sonnet-5-5 with tool calls over the effective knowledge",
          "R02 every record Claude cites exists in the knowledge version on screen",
          "R03 a citation followed in the page opens that record",
          "R04 a real extraction preview of a designer's note, confirmed and saved",
          "R05 Preset vs Combined: same model, questions and settings (tools/knowledge/llm/validate.py --run-model)"]:
    notrun(n, why) if not LIVE else notrun(n, "live tests are run by validate.py --run-model and recorded there")

ran = [r for r in results if not r.get("notRun")]
summary = {"total": len(ran), "ok": sum(1 for r in ran if r["ok"]), "notRun": sum(1 for r in results if r.get("notRun")), "connection": st, "results": results,
           "note": "L08–L11 use a scripted stand-in to test our loop; they are not model tests. R01–R05 are the model tests."}
os.makedirs(os.path.join(ROOT, "docs", "qa"), exist_ok=True)
json.dump(summary, open(os.path.join(ROOT, "docs", "qa", f"knowledge_llm_tests{SFX}.json"), "w"), indent=1, ensure_ascii=False)
print(f"\n{summary['ok']}/{summary['total']} passed · {summary['notRun']} not run (real model)")
sys.exit(0 if summary["ok"] == summary["total"] else 1)
