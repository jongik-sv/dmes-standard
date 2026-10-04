#!/usr/bin/env python3
"""결과 CSV(round,target,metric,value,load1) 를 지표×대상 중앙값으로 요약한다.
사용: summarize.py <csv> [--single] [--base 라벨]
기준 대상은 --base 로 지정한 라벨(없거나 CSV 에 없으면 가장 먼저 나오는 라벨, 보통 A). 다른 대상은 기준 대비 증감 %를 붙인다.
--single 은 회차 1회짜리(결정적 지표)라 값 그대로 표로 낸다."""
import csv, statistics, sys
from collections import OrderedDict, defaultdict

args = sys.argv[1:]
single = "--single" in args
base_label = None
if "--base" in args:
    i = args.index("--base")
    if i + 1 < len(args):
        base_label = args[i + 1]; del args[i:i + 2]
    else:
        sys.exit("--base 뒤에 라벨이 필요하다")
args = [a for a in args if a != "--single"]
path = args[0]
vals = defaultdict(list); loads = defaultdict(list)
targets = OrderedDict(); metrics = OrderedDict()
with open(path) as f:
    for r in csv.DictReader(f):
        try: v = float(r["value"])
        except ValueError: continue
        vals[(r["metric"], r["target"])].append(v); loads[(r["metric"], r["target"])].append(float(r["load1"] or 0))
        targets[r["target"]] = 1; metrics[r["metric"]] = 1
ts = list(targets)
if base_label not in targets:
    base_label = ts[0] if ts else None
print("# %s   (중앙값 / 회차 수 / load1 평균, 기준 대상 %s)" % (path, base_label))
W = max([46] + [len(m) + 2 for m in metrics])
print(("%-" + str(W) + "s") % "metric" + "".join("%-36s" % t for t in ts))

def med_of(xs):
    return xs[0] if single else statistics.median(xs)

for m in metrics:
    line = ("%-" + str(W) + "s") % m
    bx = vals.get((m, base_label))
    base = med_of(bx) if bx else None
    for t in ts:
        xs = vals.get((m, t))
        if not xs: line += "%-36s" % "-"; continue
        med = med_of(xs)
        pct = "" if (t == base_label or not base) else " (%+.1f%%)" % ((med - base) / base * 100)
        cell = "%g%s n=%d L=%.1f" % (round(med, 3), pct, len(xs), sum(loads[(m, t)]) / len(loads[(m, t)]))
        line += "%-36s" % cell
    print(line)
