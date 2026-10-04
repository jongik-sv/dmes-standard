#!/usr/bin/env python3
"""load 상한 초과 회차 빼기 — filter_load.py <in.csv> <out.csv> [상한=5]
(round,target) 묶음 안에 load1 이 상한을 넘은 줄이 하나라도 있으면 그 회차·대상 전체를 버린다."""
import csv, sys, collections
src, dst = sys.argv[1], sys.argv[2]
lim = float(sys.argv[3]) if len(sys.argv) > 3 else 5.0
rows = list(csv.DictReader(open(src)))
mx = collections.defaultdict(float)
for r in rows:
    k = (r["round"], r["target"]); mx[k] = max(mx[k], float(r["load1"]))
drop = sorted(k for k, v in mx.items() if v > lim)
kept = [r for r in rows if (r["round"], r["target"]) not in drop]
with open(dst, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["round", "target", "metric", "value", "load1"]); w.writeheader(); w.writerows(kept)
print("버림(회차,대상,최대 load):", [(k[0], k[1], mx[k]) for k in drop])
print("남김:", sorted(set((r["round"], r["target"]) for r in kept)))
