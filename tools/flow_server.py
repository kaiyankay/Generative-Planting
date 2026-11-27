"""Local server for the Integrated Prototype: static files (no cache) + the language-model gate.

python3 -I tools/flow_server.py [--port 8796] [--dir .]

/api/flow/llm/status   -> {"configured": bool, "model": str|null, "reasons": [...]}
/api/flow/llm/suggest  -> POST gp.mixRequest/1 -> {"recipes": [...]}          (only when configured)
/api/flow/llm/edit     -> POST gp.mixRequest/1 with instruction -> {"changes": [...], "explanation": str}

The live path needs three things, none of which this repository provides: the `anthropic` Python package, an
ANTHROPIC_API_KEY in this server's environment, and GP_CLAUDE_ALLOW_CALLS=1 (explicit permission to spend). The key
stays in this process; the browser only ever sees the structured answer, which it validates again (llm.js).
On a static host (GitHub Pages, githack) these endpoints do not exist and the page runs in Rules mode.
"""
import argparse, functools, json, os, sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

MODEL = os.environ.get("GP_FLOW_MODEL", "claude-sonnet-5-5")
SYSTEM = (
    "You help a landscape designer compose planting mixes (community recipes) from the plant knowledge supplied in the "
    "request. Use only plant ids and evidence ids present in the request. Proportions are shares of individual plants "
    "and must sum to 1. Never give coordinates, plant counts, scores or performance metrics: the design tool computes "
    "those. Keep facts you were not given out of the answer; list unknowns and suggested knowledge additions separately. "
    "Answer with JSON only."
)


def gates():
    reasons = []
    try:
        import anthropic  # noqa: F401
    except Exception:
        reasons.append("Python package 'anthropic' is not installed")
    if not os.environ.get("ANTHROPIC_API_KEY"):
        reasons.append("no ANTHROPIC_API_KEY in the server environment")
    if os.environ.get("GP_CLAUDE_ALLOW_CALLS") != "1":
        reasons.append("GP_CLAUDE_ALLOW_CALLS=1 not set (no permission to spend on model calls)")
    return reasons


def _obj(props, req=None):
    return {"type": "object", "properties": props, "required": req or list(props), "additionalProperties": False}


STR, NUM, STRS = {"type": "string"}, {"type": "number"}, {"type": "array", "items": {"type": "string"}}
SCHEMAS = {
    "suggest": _obj({
        "recipes": {"type": "array", "items": _obj({
            "name": STR,
            "members": {"type": "array", "items": _obj({"plantId": STR, "role": STR, "proportion": NUM, "why": STRS})},
            "density": NUM,
            "rationale": {"type": "array", "items": _obj({"text": STR, "refs": STRS})},
            "unknowns": STRS, "gaps": STRS})},
        "knowledgeSuggestions": {"type": "array", "items": _obj({"plantId": STR, "attr": STR, "why": STR})},
    }),
    "edit": _obj({
        "changes": {"type": "array", "items": _obj({"op": STR, "plantId": STR, "role": STR, "proportion": NUM, "factor": NUM, "to": STR, "value": NUM},
                                                 ["op", "plantId", "role", "proportion", "factor", "to", "value"])},
        "explanation": STR,
    }),
}
TASKS = {
    "suggest": "Propose up to three mix recipes for the target cells and objectives in the request. Unused fields: empty arrays.",
    "edit": "Propose a minimal patch to request.mix that follows request.instruction; do not regenerate the mix. "
            "Ops: add, remove, setProportion, scaleRole, setRole, replace (plantId -> to), setDensity (value). Unused fields: empty string or 0.",
}


def call_model(kind, req):
    import anthropic
    client = anthropic.Anthropic()  # credentials from this server's environment only
    msg = client.beta.messages.create(
        model=MODEL, max_tokens=16000, system=SYSTEM,
        betas=["server-side-fallback-2026-07-01"], fallbacks="default",  # a policy decline is retried server-side
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMAS[kind]}},
        messages=[{"role": "user", "content": TASKS[kind] + "\n\nREQUEST:\n" + json.dumps(req)}],
    )
    if msg.stop_reason == "refusal":
        raise RuntimeError("the model declined the request")
    if msg.stop_reason == "max_tokens":
        raise RuntimeError("answer truncated")
    text = next(b.text for b in msg.content if b.type == "text")
    out = json.loads(text)
    if kind == "edit":  # drop the empty placeholder fields the strict schema requires
        out["changes"] = [{k: v for k, v in c.items() if v not in ("", 0) or k == "op"} for c in out["changes"]]
    return out


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        p = self.path.split("?")[0]
        if p.endswith("/api/flow/llm/status"):
            r = gates()
            return self._json(200, {"configured": not r, "model": MODEL if not r else None, "reasons": r or ["configured"]})
        return super().do_GET()

    def do_POST(self):
        p = self.path.split("?")[0]
        kind = "suggest" if p.endswith("/api/flow/llm/suggest") else "edit" if p.endswith("/api/flow/llm/edit") else None
        if not kind:
            return self._json(404, {"error": "not found"})
        r = gates()
        if r:
            return self._json(503, {"error": "language model not configured: " + "; ".join(r)})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n) or b"{}")
            return self._json(200, call_model(kind, req))
        except Exception as e:  # the browser keeps the user's work and stays in Rules mode
            return self._json(502, {"error": f"model call failed: {type(e).__name__}"})


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8796)
    ap.add_argument("--dir", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    a = ap.parse_args()
    ThreadingHTTPServer(("127.0.0.1", a.port), functools.partial(Handler, directory=a.dir)).serve_forever()
