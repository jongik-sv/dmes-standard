#!/usr/bin/env python3
"""analog 프로세스 CPU 사용 — 유휴 / /tree 처리 중. (바쁜 대기(sleep 폴링) 제거 전후 비교용)
CPU% = 누적 CPU 시간 증가분 / 경과 시간 × 100 (코어 1개 = 100%). ps -o time= 의 0.01초 해상도라 구간은 30초 이상으로 잡는다.
 - idle : 요청 없이 IDLE_S 초
 - tree : 큰 로그(mpp) /tree 를 동시 1 요청으로 BUSY_S 초 동안 계속 반복 보낸다(요청 처리 중 CPU). 완료 요청 수·지연 중앙값도 함께.
사용: p2_cpu.py --port P --pid PID --round R --target T --load1 L --csv out.csv [--idle 30 --busy 40 --module mpp]
지표: idle_cpu_pct, tree_cpu_pct, tree_requests, tree_lat_median_ms, tree_cpu_ms_per_request
"""
import argparse, csv, os, statistics, time
import p2_common as c

ap = argparse.ArgumentParser()
for k in ("port", "pid", "round"): ap.add_argument("--" + k, type=int, required=True)
for k in ("target", "load1", "csv"): ap.add_argument("--" + k, required=True)
ap.add_argument("--idle", type=int, default=30); ap.add_argument("--busy", type=int, default=40)
ap.add_argument("--module", default="mpp")
a = ap.parse_args()

def row(m, v):
    new = not os.path.exists(a.csv) or os.path.getsize(a.csv) == 0
    with open(a.csv, "a", newline="") as f:
        w = csv.writer(f)
        if new: w.writerow(["round", "target", "metric", "value", "load1"])
        w.writerow([a.round, a.target, m, v, a.load1])

time.sleep(3)                                   # 기동 직후 JIT·초기화 꼬리를 피한다
c0, t0 = c.cpu_seconds(a.pid), time.time()
time.sleep(a.idle)
idle = (c.cpu_seconds(a.pid) - c0) / (time.time() - t0) * 100
row("idle_cpu_pct", round(idle, 2))

u = c.url(a.port, a.module, "tree")
c.fetch(u)                                      # 워밍업 1회(버림)
lat = []; c0, t0 = c.cpu_seconds(a.pid), time.time()
while time.time() - t0 < a.busy:
    code, ms, _ = c.fetch(u)
    if code == 200: lat.append(ms)
cpu = c.cpu_seconds(a.pid) - c0; wall = time.time() - t0
row("tree_cpu_pct", round(cpu / wall * 100, 1)); row("tree_requests", len(lat))
if lat:
    row("tree_lat_median_ms", round(statistics.median(lat), 1)); row("tree_cpu_ms_per_request", round(cpu * 1000 / len(lat), 1))
print("[cpu] %s idle=%.2f%% tree=%.1f%% req=%d" % (a.target, idle, cpu / wall * 100, len(lat)))
