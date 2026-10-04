#!/bin/bash
# P3: be-run 종료가 다른 워크트리 gradle 빌드에 주는 영향(결정적, A·B 각 1회).
# 전제: 분리된 GRADLE_USER_HOME(기본). 기준 A 의 be-run 종료는 전역 gradlew --stop 이라 같은 홈의 모든 데몬을 멈춘다.
#   분리하지 않으면(PERF_GRADLE_HOME=global) 다른 레인 빌드를 죽이므로 이 스크립트는 거부한다.
# 방식: 대상 T 의 be-run 을 띄웠다 내리는 동안, 반대편 워크트리에서 오래 걸리는 gradle 시험(희생자)을 같은 홈에서 돌려 둔다.
# 환경: P3_MODS(기본 --analog), P3_VICTIM_CMD(희생자 명령, 반대편 워크트리 루트 기준. 기본은 25초 넘게 걸리는 mdm :lib:test :api:test --rerun-tasks), P3_WARMUP(희생자 안정 대기 초, 기본 25)
cd "$(dirname "$0")" && . ./lib.sh
[ "$PERF_GRADLE_HOME" = global ] && die "P3 는 분리된 GRADLE_USER_HOME 이 필요하다(전역 --stop 이 다른 레인을 죽인다)."
MODS="${P3_MODS:---analog}"; WARM="${P3_WARMUP:-25}"
VICTIM_CMD="${P3_VICTIM_CMD:-cd src/backend/mdm && ../gradlew :lib:test :api:test --rerun-tasks --max-workers=2 --console=plain}"
resolve_refs; gradle_home_prepare
trap 'wt_remove_all' EXIT
wt_ensure A; wt_ensure B
CSV="$RESULTS/p3.csv"
daemons() {  # 분리된 홈의 데몬 수(--status 의 IDLE|BUSY 행)
  ( cd "$1/src/backend" && ./gradlew --status 2>/dev/null | grep -cE 'IDLE|BUSY' )
}
r=1
for t in A B; do
  other=B; [ "$t" = B ] && other=A
  wt="$(wt_path "$t")"; ow="$(wt_path "$other")"
  preflight_ports || die "포트 점유: 서버 창 필요"
  wait_quiet; L="$(load1)"; vlog="$RESULTS/p3_${t}_victim.log"; blog="$RESULTS/p3_${t}_be.log"
  # 대상 모듈의 포트(단일 모듈이면 그 포트). 기본 analog 8191.
  port="${P3_PORT:-8191}"
  log "P3 대상 $t 희생자 시작($other): $VICTIM_CMD"
  ( cd "$ow" && eval "$VICTIM_CMD" ) >"$vlog" 2>&1 &
  vpid=$!
  sleep "$WARM"
  kill -0 "$vpid" 2>/dev/null || { csv_add "$CSV" "$r" "$t" p3 victim_valid 0 6 "$L"; die "희생자가 $WARM 초 안에 끝남. P3_VICTIM_CMD 를 더 긴 시험으로 바꾼다. 로그: $vlog"; }
  d0="$(daemons "$ow")"
  ( cd "$wt" && GRADLE_OPTS="$(gradle_opts_for warm)" exec ./be-run.sh $MODS ) >"$blog" 2>&1 &
  bpid=$!
  w=0; until lsof -nP -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; do
    kill -0 "$bpid" 2>/dev/null || break; [ "$w" -ge 900 ] && break; sleep 2; w=$((w+2)); done
  log "  be-run 기동 확인(대기 ${w}s), 종료(TERM)"
  kill -TERM "$bpid" 2>/dev/null
  w=0; while kill -0 "$bpid" 2>/dev/null && [ "$w" -lt 180 ]; do sleep 1; w=$((w+1)); done
  kill -0 "$bpid" 2>/dev/null && kill -KILL "$bpid" 2>/dev/null
  wait "$bpid" 2>/dev/null; kill_own_listeners "$wt"
  d1="$(daemons "$ow")"
  # 희생자 종료 대기
  w=0; while kill -0 "$vpid" 2>/dev/null && [ "$w" -lt "${P3_VICTIM_TIMEOUT:-1800}" ]; do sleep 5; w=$((w+5)); done
  kill -0 "$vpid" 2>/dev/null && { echo "[perf] 희생자 시간 초과, 종료" >&2; kill -TERM "$vpid" 2>/dev/null; }
  wait "$vpid"; vrc=$?
  stopmsg="$(grep -c 'Gradle build daemon has been stopped' "$vlog")"
  fail=0; { [ "$vrc" -ne 0 ] || [ "$stopmsg" -gt 0 ]; } && fail=1
  csv_add "$CSV" "$r" "$t" p3 victim_failed "$fail" 0 "$L"
  csv_add "$CSV" "$r" "$t" p3 victim_rc "$vrc" 0 "$L"
  csv_add "$CSV" "$r" "$t" p3 daemon_stopped_msgs "$stopmsg" 0 "$L"
  csv_add "$CSV" "$r" "$t" p3 daemons_before_stop "$d0" 0 "$L"
  csv_add "$CSV" "$r" "$t" p3 daemons_after_stop "$d1" 0 "$L"
  log "  -> 희생자 rc=$vrc stopped메시지=$stopmsg 데몬 $d0 -> $d1"
  sleep 20
done
column -s, -t "$CSV"
