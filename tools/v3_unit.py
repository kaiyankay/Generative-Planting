"""Run the engine suite (flow-tests.html) in headless Chrome and write docs/qa/v3_unit_tests.json.

python3 -I -u tools/v3_unit.py [--serve <folder>] [--port 8801]
"""
import argparse, json, os, sys, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools")); sys.path.insert(0, os.path.join(ROOT, "tools", "knowledge"))
import flow_e2e  # noqa: E402


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--serve", default=ROOT); ap.add_argument("--port", type=int, default=8801); a = ap.parse_args()
    P, chrome, srv, base = flow_e2e.launch(a.serve, a.port, 9381)
    try:
        P("Page.navigate", url=base + "flow-tests.html"); P.wait("document.documentElement.dataset.done === '1'", 1500)
        out = P.js("window.__flowTests"); out["runner"] = "headless Chrome (SwiftShader) over CDP, flow-tests.html"; out["errors"] = list(P.errors); out["at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        json.dump(out, open(os.path.join(ROOT, "docs", "qa", "v3_unit_tests.json"), "w"), indent=1)
        print(f"unit: {out['passed']} passed, {out['failed']} failed")
        for r in out["tests"]:
            if not r["ok"]: print("FAIL", r["id"], r["name"][:90], "\n   ", json.dumps(r["detail"])[:500])
    finally:
        chrome.terminate(); srv.shutdown()


if __name__ == "__main__":
    main()
