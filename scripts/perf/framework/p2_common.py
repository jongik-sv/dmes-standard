"""p2 공통 보조 — 요청, 스레드 수·CPU 시간 읽기."""
import base64, hashlib, subprocess, threading, time, urllib.request, urllib.error, urllib.parse

CLIENT_KEY = "dmes-bff-local-client-key-2026"   # application.yml 기본값(BACKEND_CLIENT_KEY 미설정 시)
KEYWORD = base64.b64encode(b"PERFKEY").decode()
QUERY = {"from": "20261001000000", "to": "20261001235959", "keyword": KEYWORD,
         "serverType": "perf", "clientType": "app", "ignoreCase": "false", "byThread": "false"}

def url(port, module, endpoint):
    q = dict(QUERY); q["module"] = module
    path = "/log/range/time" + ("/tree" if endpoint == "tree" else "")
    return "http://127.0.0.1:%d%s?%s" % (port, path, urllib.parse.urlencode(q))

def fetch(u, timeout=600):
    """(상태코드, 지연 ms, 본문 bytes)"""
    req = urllib.request.Request(u, headers={"X-Client-Key": CLIENT_KEY})
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read(); code = r.status
    except urllib.error.HTTPError as e:
        body = e.read(); code = e.code
    except Exception as e:                       # 연결 실패 등
        body = repr(e).encode(); code = -1
    return code, (time.perf_counter() - t0) * 1000.0, body

def os_threads(pid):
    """ps -M 로 본 OS 스레드 수(빠르다 — 폴링용)."""
    out = subprocess.run(["ps", "-M", "-p", str(pid)], capture_output=True, text=True).stdout.splitlines()
    return max(len(out) - 1, 0)

def jcmd_threads(pid, jdk_home):
    """jcmd Thread.print 의 스레드 줄 수(따옴표로 시작하는 줄)."""
    out = subprocess.run([jdk_home + "/bin/jcmd", str(pid), "Thread.print"], capture_output=True, text=True).stdout
    return sum(1 for l in out.splitlines() if l.startswith('"'))

def cpu_seconds(pid):
    """누적 CPU 시간(초). ps 의 time= 은 [[H:]M:]S.cc 형식."""
    t = subprocess.run(["ps", "-o", "time=", "-p", str(pid)], capture_output=True, text=True).stdout.strip()
    sec = 0.0
    for part in t.split(":"):
        sec = sec * 60 + float(part)
    return sec

class ThreadSampler:
    """요청이 도는 동안 최대 스레드 수를 잰다. ps -M 는 50ms, jcmd 는 1초 간격."""
    def __init__(self, pid, jdk_home):
        self.pid, self.jdk = pid, jdk_home
        self.max_ps = 0; self.max_jcmd = 0
        self._stop = threading.Event(); self._ts = []
    def _ps(self):
        while not self._stop.is_set():
            self.max_ps = max(self.max_ps, os_threads(self.pid)); time.sleep(0.05)
    def _jc(self):
        while not self._stop.is_set():
            self.max_jcmd = max(self.max_jcmd, jcmd_threads(self.pid, self.jdk))
            self._stop.wait(1.0)
    def __enter__(self):
        for fn in (self._ps, self._jc):
            t = threading.Thread(target=fn, daemon=True); t.start(); self._ts.append(t)
        return self
    def __exit__(self, *a):
        self._stop.set()
        for t in self._ts: t.join(timeout=5)

def sha(b):
    return hashlib.sha256(b).hexdigest()[:16]
