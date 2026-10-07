#!/usr/bin/env python3
"""python re 와 aggrid_docs.mjs 의 pyre 변환층을 대조하는 시험 전용 도구(실행 경로 아님).

stdin: {"patterns": [[원문, 플래그], ...], "texts": [...]}  (플래그는 'i' 'm' 's' 조합)
stdout: {"<패턴 번호>": {"<텍스트 번호>": [[시작, 끝, 그룹1, 그룹2, ...], ...]}}  일치가 있는 쌍만(위치는 코드포인트, 그룹 없음은 null)
"""
import json
import re
import sys

req = json.load(sys.stdin)
FLAGS = {"i": re.I, "m": re.M, "s": re.S}
out = {}
for pi, (src, flags) in enumerate(req["patterns"]):
    fl = 0
    for ch in flags:
        fl |= FLAGS[ch]
    rx = re.compile(src, fl)
    per = {}
    for ti, text in enumerate(req["texts"]):
        rows = [[m.start(), m.end(), *[m.group(g) for g in range(1, rx.groups + 1)]] for m in rx.finditer(text)]
        if rows:
            per[str(ti)] = rows
    if per:
        out[str(pi)] = per
sys.stdout.write(json.dumps(out, ensure_ascii=True))
