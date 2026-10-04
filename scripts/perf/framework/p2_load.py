#!/usr/bin/env python3
"""동시 N 요청 부하 + 지연·스레드 수 측정. 한 서버(이미 떠 있음)에 대해 한 번 호출 = 한 (모듈, 엔드포인트, N).
사용: p2_load.py --port P --pid PID --jdk JAVA_HOME --module mpn|mpp --endpoint range|tree --n N
                 --round R --target A --load1 L --csv out.csv --sha-file bodies.txt
지표(CSV): {mode}_{endpoint}_n{N}_lat_median_ms / _lat_p95_ms / _max_threads_ps / _max_threads_jcmd / _http503 / _http_other_err
  mode = small(mpn) | large(mpp).  시작 직후 1회 요청은 워밍업으로 버린다.
"""
import argparse, csv, os, statistics, threading
import p2_common as c

ap = argparse.ArgumentParser()
for k in ("port", "pid", "n", "round"): ap.add_argument("--" + k, type=int, required=True)
for k in ("jdk", "module", "endpoint", "target", "load1", "csv", "sha_file"): ap.add_argument("--" + k.replace("_", "-"), required=True, dest=k)
a = ap.parse_args()
mode = "small" if a.module == "mpn" else "large"
u = c.url(a.port, a.module, a.endpoint)

# 워밍업(버림) + 본문 해시(응답 동일성 확인용)
code, _, body = c.fetch(u)
with open(a.sha_file, "a") as f:
    f.write("%s,%s,%s,warmup_status=%s,sha=%s,bytes=%d\n" % (a.target, mode, a.endpoint, code, c.sha(body), len(body)))

results = [None] * a.n
barrier = threading.Barrier(a.n)
def worker(i):
    barrier.wait()
    results[i] = c.fetch(u)
ths = [threading.Thread(target=worker, args=(i,)) for i in range(a.n)]
with c.ThreadSampler(a.pid, a.jdk) as s:
    for t in ths: t.start()
    for t in ths: t.join()

ok = sorted(r[1] for r in results if r[0] == 200)
p503 = sum(1 for r in results if r[0] == 503)
other = sum(1 for r in results if r[0] not in (200, 503))
shas = {c.sha(r[2]) for r in results if r[0] == 200}
with open(a.sha_file, "a") as f:
    f.write("%s,%s,%s,n=%d,distinct_body_sha_among_200=%d\n" % (a.target, mode, a.endpoint, a.n, len(shas)))

def row(metric, val):
    new = not os.path.exists(a.csv) or os.path.getsize(a.csv) == 0
    with open(a.csv, "a", newline="") as f:
        w = csv.writer(f)
        if new: w.writerow(["round", "target", "metric", "value", "load1"])
        w.writerow([a.round, a.target, "%s_%s_n%d_%s" % (mode, a.endpoint, a.n, metric), val, a.load1])

if ok:
    row("lat_median_ms", round(statistics.median(ok), 1))
    row("lat_p95_ms", round(ok[min(len(ok) - 1, int(0.95 * len(ok)))], 1))
row("max_threads_ps", s.max_ps); row("max_threads_jcmd", s.max_jcmd)
row("http503", p503); row("http_other_err", other)
print("[load] %s %s %s n=%d median=%s ms 503=%d err=%d threads(ps)=%d" %
      (a.target, mode, a.endpoint, a.n, round(statistics.median(ok), 1) if ok else "-", p503, other, s.max_ps))
