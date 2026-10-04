#!/usr/bin/env python3
"""합성 로그 생성 — analog 검색용(저장소 밖).
analog 기본 설정 log_base_dir=<ROOT>/{MODULE}, live 파일명 dmes-{module}.log 에 맞춰
  <ROOT>/mpn/dmes-mpn.log   (작은 파일, 기본 5MB   — 단일 스레드 검색 경로)
  <ROOT>/mpp/dmes-mpp.log   (큰 파일,   기본 200MB — minimum_mega_bytes_for_multi_thread(80) 이상, 멀티스레드 경로)
를 만든다. 시각은 2026-10-01 00:00:00 ~ 23:59:59 로 단조 증가(이진 탐색 가능).
줄 형식은 analog-serializer.lex_pattern 과 맞다:
  yyyy-MM-dd HH:mm:ss.SSS [thread] [serviceTag] [service] LEVEL logger - message
keyword(PERFKEY) 줄은 200줄에 1줄이고, 그 줄은 "Service end - service name … RunTime : [n]" 이라 /tree 가 서비스 트리를 만든다.
같은 시드라 항상 같은 내용(기준·변경 비교용). 사용: p2_gen_logs.py <ROOT> [small_mb=5] [large_mb=200]
"""
import os, random, sys

root = sys.argv[1]
small_mb = int(sys.argv[2]) if len(sys.argv) > 2 else 5
large_mb = int(sys.argv[3]) if len(sys.argv) > 3 else 200

def gen(path, target_mb):
    rnd = random.Random(20261001)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # 평균 줄 길이를 먼저 추정해 줄 수를 정한다.
    sample = "2026-10-01 00:00:00.000 [http-nio-8080-exec-1] [TAG0001] [SvcA] INFO  com.dongkuk.dmes.Sample - " + "x" * 40 + "\n"
    n = int(target_mb * 1024 * 1024 / (len(sample) + 6))
    step_ms = 86400_000 / n
    with open(path, "w", encoding="utf-8") as f:
        for i in range(n):
            ms = int(i * step_ms)
            h, rem = divmod(ms, 3600_000); m, rem = divmod(rem, 60_000); s, mm = divmod(rem, 1000)
            ts = "2026-10-01 %02d:%02d:%02d.%03d" % (h, m, s, mm)
            th = "http-nio-8080-exec-%d" % (i % 16)
            tag = "TAG%04d" % (i // 7 % 9999)
            if i % 200 == 0:
                svc = "PERFKEY.Svc%d" % (i // 200 % 50)
                msg = "Service end - service name %s RunTime : [%d]" % (svc, rnd.randint(1, 900))
                lvl = "INFO "
            elif i % 200 == 1:
                svc = "PERFKEY.Svc%d" % (i // 200 % 50)
                msg = "SERVICE_ACTION : SEARCH"
                lvl = "INFO "
            else:
                svc = "Svc%d" % (i % 50)
                msg = "processing row %d value=%s" % (i, "x" * rnd.randint(20, 60))
                lvl = "DEBUG" if i % 11 == 0 else "INFO "
            f.write("%s [%s] [%s] [%s] %s %s - %s\n" % (ts, th, tag, svc, lvl, "com.dongkuk.dmes.Sample", msg))
    print("%s  %.1f MB  %d lines" % (path, os.path.getsize(path) / 1048576, n))

gen(os.path.join(root, "mpn", "dmes-mpn.log"), small_mb)
gen(os.path.join(root, "mpp", "dmes-mpp.log"), large_mb)
