#!/bin/bash
# P2 측정 — $RESULTS/jars/<라벨>.jar 를 라벨 순서대로 번갈아(A B C A B C …) ROUNDS 회 기동해
#   (1) 동시 N=1,4,8,16 요청 지연·스레드 수 (작은 로그 mpn · 큰 로그 mpp, /log/range/time 와 /tree)
#   (2) 유휴·/tree 처리 중 CPU
# 를 잰다. 서버는 메인 체크아웃 서버(8191 등)와 겹치지 않게 포트 ANALOG_PERF_PORT(기본 18191)를 쓴다. 이 스크립트는 gradle 을 쓰지 않는다.
# 사용: ./p2_run.sh [ROUNDS=3]       (먼저 p2_build.sh, 로그는 p2_gen_logs.py 로 자동 생성)
# 환경: ROUND_START=<n> 회차 번호를 n 부터 매긴다(중단 뒤 이어 재기동·재측정용, 기본 1).
#       LOAD_WAIT=<상한> 이면 CPU 구간 전에 1분 load 가 상한 아래로 내려갈 때까지 최대 180초 기다린다.
#       NS="1 4 8 16" 동시 요청 수 목록.
# 산출: $RESULTS/p2_load.csv, p2_cpu.csv, p2_bodies.txt(응답 해시 — 대상 간 같아야 함), p2_server_<라벨>_r<회차>.log
source "$(dirname "$0")/lib.sh"
ROUNDS="${1:-3}"
[ "${DRY:-}" = 1 ] && ROUNDS=1
NS="${NS:-1 4 8 16}"
MPN_MB=5; MPP_MB=200; CPU_ARGS=""
if [ "${DRY:-}" = 1 ]; then NS="1"; MPN_MB=1; MPP_MB=90; CPU_ARGS="--idle 5 --busy 5"; fi
SERVER_PID=""
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null && wait "$SERVER_PID" 2>/dev/null; SERVER_PID=""; }
trap stop_server EXIT

if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then echo "포트 $PORT 사용 중 — ANALOG_PERF_PORT 로 다른 포트를 지정한다" >&2; exit 1; fi
[ -f "$LOGROOT/mpp/dmes-mpp.log" ] || python3 "$PERF_DIR/p2_gen_logs.py" "$LOGROOT" $MPN_MB $MPP_MB
cd "$PERF_DIR"   # python 모듈(p2_common) import

RS="${ROUND_START:-1}"
for r in $(seq "$RS" $((RS + ROUNDS - 1))); do
  for t in $TARGETS; do
    l=$(target_label "$t")
    jar="$JARS/$l.jar"; [ -f "$jar" ] || { echo "jar 없음: $jar (p2_build.sh 먼저)" >&2; exit 1; }
    # 서버 기동: 합성 로그 경로, 모듈 mpn·mpp, 포트 $PORT, 공유 설정은 jar 안 application.yml 기본값(대상별 기본 풀 크기 그대로)
    # 기준(A)의 /tree 는 jar 실행 시 classpath:analog-serializer.json 을 File 로 풀다 500 이 난다(ResourceUtils.getFile). 모든 대상에 같은 방식으로
    # jar 안 파일을 꺼내 file: 경로로 지정해 우회한다(기능 동일, 대상 간 조건 동일).
    SER="$JARS/analog-serializer_$l.json"; unzip -p "$jar" BOOT-INF/classes/analog-serializer.json > "$SER"
    ANALOG_PORT=$PORT ANALOG_LOG_BASE_DIR="$LOGROOT/{MODULE}" ANALOG_MODULES=mpn,mpp \
      "$JAVA_HOME/bin/java" -Xmx1g -Dfile.encoding=UTF-8 -Danalog-serializer.config_file="file:$SER" -jar "$jar" > "$RESULTS/p2_server_${l}_r${r}.log" 2>&1 &
    SERVER_PID=$!
    for i in $(seq 1 90); do curl -fs "http://127.0.0.1:$PORT/actuator/health" >/dev/null 2>&1 && break; sleep 1; done
    curl -fs "http://127.0.0.1:$PORT/actuator/health" >/dev/null 2>&1 || { echo "[p2] $l 기동 실패 — $RESULTS/p2_server_${l}_r${r}.log" >&2; stop_server; continue; }
    sleep 5   # 기동 직후 JIT 꼬리
    for mod in mpn mpp; do for ep in range tree; do for n in $NS; do
      python3 p2_load.py --port $PORT --pid $SERVER_PID --jdk "$JAVA_HOME" --module $mod --endpoint $ep --n $n \
        --round $r --target $l --load1 "$(load1)" --csv "$RESULTS/p2_load.csv" --sha-file "$RESULTS/p2_bodies.txt"
    done; done; done
    # LOAD_WAIT=<상한> 이면 CPU 구간 전에 1분 load 가 상한 아래로 내려갈 때까지 최대 180초 기다린다(부하 구간이 남긴 load 꼬리 제거).
    if [ -n "${LOAD_WAIT:-}" ]; then for i in $(seq 1 36); do awk -v l="$(load1)" -v m="$LOAD_WAIT" 'BEGIN{exit !(l<m)}' && break; sleep 5; done; echo "[p2] CPU 구간 전 load1=$(load1)"; fi
    python3 p2_cpu.py --port $PORT --pid $SERVER_PID --round $r --target $l --load1 "$(load1)" --csv "$RESULTS/p2_cpu.csv" $CPU_ARGS
    stop_server
    [ "${DRY:-}" = 1 ] || sleep 10   # 쿨다운 — 연속 측정의 열 영향 완화
  done
done
BASE_LABEL=$(target_label "${TARGETS%% *}")
python3 "$PERF_DIR/summarize.py" "$RESULTS/p2_load.csv" --base "$BASE_LABEL"
python3 "$PERF_DIR/summarize.py" "$RESULTS/p2_cpu.csv" --base "$BASE_LABEL"
echo "응답 동일성: $RESULTS/p2_bodies.txt 에서 대상별 sha 가 같은지 확인(sha= 값, warmup 줄)"
echo "정리: ./p2_cleanup.sh  (측정 워크트리 제거)"
