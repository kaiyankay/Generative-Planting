"""Minimal Chrome DevTools Protocol client (standard library only): launch headless Chrome, evaluate JS, take screenshots.

    with Chrome(width=1440, height=900) as c:
        c.goto(url); c.wait_for("document.documentElement.dataset.ready === '1'")
        c.eval("1 + 1"); c.screenshot("out.png")
"""
import base64, json, os, shutil, socket, struct, subprocess, tempfile, time, urllib.request

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


class WS:
    def __init__(self, url):
        assert url.startswith("ws://")
        hostport, path = url[5:].split("/", 1)
        host, port = hostport.split(":")
        self.s = socket.create_connection((host, int(port)), timeout=120)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((f"GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf: buf += self.s.recv(4096)
        if b" 101 " not in buf.split(b"\r\n")[0]: raise RuntimeError("websocket upgrade failed: " + buf[:200].decode("latin1"))
        self.rest = buf.split(b"\r\n\r\n", 1)[1]

    def send(self, text):
        data = text.encode(); mask = os.urandom(4); n = len(data)
        head = bytes([0x81]) + (bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n) if n < 65536 else bytes([0x80 | 127]) + struct.pack(">Q", n))
        self.s.sendall(head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def _read(self, n):
        while len(self.rest) < n:
            chunk = self.s.recv(1 << 20)
            if not chunk: raise RuntimeError("websocket closed")
            self.rest += chunk
        out, self.rest = self.rest[:n], self.rest[n:]
        return out

    def recv(self):
        msg = b""
        while True:
            b0, b1 = self._read(2)
            n = b1 & 0x7F
            if n == 126: n = struct.unpack(">H", self._read(2))[0]
            elif n == 127: n = struct.unpack(">Q", self._read(8))[0]
            payload = self._read(n); op = b0 & 0x0F
            if op == 8: raise RuntimeError("websocket closed by peer")
            if op in (0, 1, 2): msg += payload
            if b0 & 0x80 and op in (0, 1, 2): return msg.decode()


class Chrome:
    def __init__(self, width=1440, height=900, scale=1):
        self.width, self.height, self.scale = width, height, scale

    def __enter__(self):
        self.prof = tempfile.mkdtemp()
        self.p = subprocess.Popen([CHROME, "--headless=new", "--remote-debugging-port=0", f"--user-data-dir={self.prof}", f"--window-size={self.width},{self.height}",
                                   "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        port_file = os.path.join(self.prof, "DevToolsActivePort")
        for _ in range(200):
            if os.path.exists(port_file) and open(port_file).read().strip(): break
            time.sleep(0.05)
        port = open(port_file).read().split()[0]
        for _ in range(100):
            try:
                tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json")); page = next(t for t in tabs if t["type"] == "page"); break
            except Exception: time.sleep(0.1)
        self.ws = WS(page["webSocketDebuggerUrl"]); self.n = 0
        self.call("Page.enable"); self.call("Runtime.enable")
        self.call("Emulation.setDeviceMetricsOverride", width=self.width, height=self.height, deviceScaleFactor=self.scale, mobile=False)
        return self

    def __exit__(self, *a):
        try: self.p.terminate(); self.p.wait(10)
        except Exception: self.p.kill()
        shutil.rmtree(self.prof, ignore_errors=True)

    def call(self, method, **params):
        self.n += 1; mid = self.n
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get("id") == mid:
                if "error" in m: raise RuntimeError(f"{method}: {m['error']}")
                return m.get("result", {})

    def goto(self, url):
        self.call("Page.navigate", url=url)

    def eval(self, expr, await_promise=True):
        r = self.call("Runtime.evaluate", expression=expr, awaitPromise=await_promise, returnByValue=True)
        if "exceptionDetails" in r: raise RuntimeError(json.dumps(r["exceptionDetails"])[:600])
        return r["result"].get("value")

    def wait_for(self, expr, timeout=120, every=0.25):
        t = time.time()
        while time.time() - t < timeout:
            try:
                if self.eval(expr): return True
            except RuntimeError: pass
            time.sleep(every)
        raise TimeoutError(expr)

    def screenshot(self, path):
        data = self.call("Page.captureScreenshot", format="png")["data"]
        with open(path, "wb") as f: f.write(base64.b64decode(data))
