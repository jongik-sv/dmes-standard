#!/usr/bin/env bash
# 사용법: stall-check.sh [레인…]   (없으면 active 레인 전부. 정본: ../references/contract.md §3.3, 설계 §3.m)
# stdout 레인마다 한 줄: `STALL <레인> pid=<pid> cpu_delta=<초> quiet=<분>m heavy=<yes|no>` 또는 `OK <레인>`
# 읽기 전용(관측 기록 <회차>/ticks/stall-<레인> 만 쓴다). 프로세스를 죽이거나 jstack 을 뜨지 않는다(조정자가 판단).
# 판정(셋 다 맞으면 STALL)
#   1) 프로세스 트리: 레인 워크트리를 cwd 로 둔 빌드·시험 프로세스(GradleWrapperMain·GradleMain·gradlew·GradleWorkerMain·
#      Gradle Test Executor·vitest·playwright·tsc·jest) 와, 레인 세션이 띄운 java·node 를 뿌리로 그 자손까지.
#      서버(bootRun)·공용 데몬(GradleDaemon)·MCP 서버·레인 Claude 세션 자신은 뺀다. 트리가 없으면 OK.
#   2) 누적 CPU(ps -o time=)가 직전 관측보다 합계 2초 미만 늘었다(새 pid 는 전부 증가로 친다). 직전 관측이 없거나
#      60초 안이면 판정하지 않는다(OK, 관측만 남김).
#   3) 산출물 무변화가 stall.quiet_min 이상: 마지막 변화 = max(워크트리 git status --porcelain 내용이 바뀐 시각,
#      그 목록에 든 파일 mtime 최신값, HEAD 커밋 시각). ignore 된 build·scratch 출력은 보지 않는다.
# pid = 트리 중 누적 CPU 가 가장 큰 프로세스(jstack 대상 후보). heavy = heavy.sh snapshot RUN 줄 cwd 가 레인 워크트리 안인지.
set -uo pipefail
# shellcheck source=lib/common.sh
. "$(dirname "$0")/lib/common.sh"
coord_default_repo

case "${1:-}" in -h|--help) sed -n '2,13p' "$0" >&2; exit 0 ;; -*) coord_die 2 "사용법: stall-check.sh [레인…]" ;; esac

coord_has_run || coord_die 3 "현재 회차가 없다(coord-state.sh init 먼저)"
SF="$(coord_state_file)"
TICKS="$(coord_run_dir)/ticks"; mkdir -p "$TICKS" || coord_die 4 "ticks 폴더 생성 실패: $TICKS"
NOW="$(coord_now_epoch)"
QUIET="$(coord_cfg .stall.quiet_min)"; case "$QUIET" in ""|*[!0-9]*) QUIET=20 ;; esac
SNAP=""
if HS="$(coord_heavy_script)"; then SNAP="$(bash "$HS" snapshot 2>/dev/null)"; fi
if stat -f %m / >/dev/null 2>&1; then STATF="-f %m"; else STATF="-c %Y"; fi

# ps 한 번: pid ppid cpu초 args
PS="$(ps -axo pid=,ppid=,time=,args= 2>/dev/null | awk '{
  t = $3; d = 0; if (index(t, "-")) { split(t, dd, "-"); d = dd[1]; t = dd[2] }
  n = split(t, p, ":"); s = 0; for (i = 1; i <= n; i++) s = s * 60 + p[i]; s += d * 86400
  a = $0; sub(/^ *[0-9]+ +[0-9]+ +[^ ]+ +/, "", a)
  printf "%s\t%s\t%.2f\t%s\n", $1, $2, s, a }')"

# 레인 트리의 `pid\tcpu초` 목록. 인자: <워크트리> <레인 세션 pid>
lane_tree() {
  local wt="$1" spid="${2:-0}" cand roots
  cand="$(printf '%s\n' "$PS" | awk -F'\t' -v sp="$spid" '
    { pid[$1] = $2; args[$1] = $4 }
    END {
      for (p in pid) {
        a = args[p]
        if (p == sp || a ~ /bootRun|GradleDaemon|mcp|^([^ ]*\/)?awk /) continue
        hit = (a ~ /GradleWrapperMain|org\.gradle\.launcher\.GradleMain|(^|[\/ ])gradlew?( |$)|GradleWorkerMain|Gradle Test Executor|vitest|playwright|(^|[\/ ])tsc( |$)|typescript\/bin\/tsc|(^|[\/ ])jest( |$)/)
        if (!hit && sp > 0 && a ~ /^([^ ]*\/)?(java|node)( |$)/) {
          q = pid[p]; n = 0
          while (q > 1 && n < 50) { if (q == sp) { hit = 1; break }; q = pid[q]; n++ }
        }
        if (hit) print p
      }
    }')"
  [ -n "$cand" ] || return 0
  roots="$(coord_proc_cwds "$(printf '%s\n' "$cand" | paste -sd, -)" | while IFS="$(printf '\t')" read -r p cwd; do
    coord_path_in_wt "$cwd" "$wt" && echo "$p"
  done)"
  [ -n "$roots" ] || return 0
  # 뿌리 + 자손(제외 대상 빼고)
  printf '%s\n' "$PS" | awk -F'\t' -v roots="$(printf '%s' "$roots" | paste -sd, -)" -v sp="$spid" '
    { pid[$1] = $2; cpu[$1] = $3; args[$1] = $4 }
    END {
      n = split(roots, r, ","); for (i = 1; i <= n; i++) in_[r[i]] = 1
      changed = 1
      while (changed) { changed = 0
        for (p in pid) if (!(p in in_) && (pid[p] in in_) && p != sp && args[p] !~ /bootRun|GradleDaemon|mcp/) { in_[p] = 1; changed = 1 } }
      for (p in in_) if (p in cpu) printf "%s\t%s\n", p, cpu[p]
    }'
}

# 산출물: `<sig>\t<latest epoch>`
lane_output() {
  local wt="$1" list sig latest head
  list="$(coord_git -C "$wt" -c core.quotepath=off status --porcelain -uall 2>/dev/null)"
  sig="$(printf '%s' "$list" | cksum | awk '{ print $1 }')"
  # shellcheck disable=SC2086
  latest="$(printf '%s\n' "$list" | sed -e 's/^...//' -e 's/.* -> //' -e 's/^"\(.*\)"$/\1/' | grep -v '^$' \
    | (cd "$wt" && tr '\n' '\0' | xargs -0 stat $STATF 2>/dev/null) | sort -n | tail -1)"
  head="$(coord_git -C "$wt" log -1 --format=%ct HEAD 2>/dev/null)"
  [ -n "$head" ] && { [ -z "$latest" ] || [ "$head" -gt "$latest" ]; } && latest="$head"
  printf '%s\t%s\n' "$sig" "${latest:-0}"
}

if [ $# -gt 0 ]; then lanes="$*"
else lanes="$(jq -r '.lanes | to_entries[] | select((.value.state // "active") == "active") | .key' "$SF")"; fi

for L in $lanes; do
  if [ "$(jq -r --arg l "$L" '.lanes | has($l)' "$SF")" != true ]; then coord_log "없는 레인: $L"; continue; fi
  wt="$(coord_wt_abs "$(jq -r --arg l "$L" '.lanes[$l].worktree // ""' "$SF")")"
  spid="$(jq -r --arg l "$L" '.lanes[$l].session.pid // 0' "$SF")"
  sid="$(jq -r --arg l "$L" '.lanes[$l].session.session_id // ""' "$SF")"
  sf="$(coord_session_file "$spid" "$sid" 2>/dev/null || true)"
  [ -n "$sf" ] && { p2="$(jq -r '.pid // empty' "$sf")"; [ -n "$p2" ] && spid="$p2"; }
  case "$spid" in ""|*[!0-9]*) spid=0 ;; esac
  tf="$TICKS/stall-$L"
  if [ -z "$wt" ] || [ ! -d "$wt" ]; then coord_log "$L: 워크트리 없음 — 판정 생략"; echo "OK $L"; continue; fi

  tree="$(lane_tree "$wt" "$spid")"
  out="$(lane_output "$wt")"; sig="$(printf '%s' "$out" | cut -f1)"; latest="$(printf '%s' "$out" | cut -f2)"
  cpu_now="$(printf '%s\n' "$tree" | awk -F'\t' 'NF == 2 { printf "%s%s:%s", (n++ ? "," : ""), $1, $2 }')"

  p_at=""; p_sig=""; p_change=""; p_cpu=""
  if [ -f "$tf" ]; then
    p_at="$(sed -n 's/^at=//p' "$tf")"; p_sig="$(sed -n 's/^sig=//p' "$tf")"
    p_change="$(sed -n 's/^change_at=//p' "$tf")"; p_cpu="$(sed -n 's/^cpu=//p' "$tf")"
  fi
  change_at="$p_change"
  { [ -z "$change_at" ] || [ "$sig" != "$p_sig" ]; } && change_at="$NOW"
  printf 'at=%s\nsig=%s\nchange_at=%s\ncpu=%s\n' "$NOW" "$sig" "$change_at" "$cpu_now" > "$tf.tmp.$$" && mv -f "$tf.tmp.$$" "$tf"

  last="$change_at"; [ -n "$latest" ] && [ "$latest" -gt "$last" ] && last="$latest"
  quiet=$(( (NOW - last) / 60 )); [ "$quiet" -lt 0 ] && quiet=0
  if [ -z "$tree" ] || [ -z "$p_at" ] || [ $((NOW - p_at)) -lt 60 ] || [ "$quiet" -lt "$QUIET" ]; then echo "OK $L"; continue; fi

  delta="$(awk -v prev="$p_cpu" -v cur="$cpu_now" 'BEGIN {
    n = split(prev, a, ","); for (i = 1; i <= n; i++) { split(a[i], kv, ":"); pv[kv[1]] = kv[2] }
    m = split(cur, b, ","); d = 0
    for (i = 1; i <= m; i++) { split(b[i], kv, ":"); x = kv[2] - ((kv[1] in pv) ? pv[kv[1]] : 0); if (x > 0) d += x }
    printf "%.1f", d }')"
  if awk -v d="$delta" 'BEGIN { exit !(d < 2) }'; then
    top="$(printf '%s\n' "$tree" | sort -t"$(printf '\t')" -k2,2nr | head -1 | cut -f1)"
    heavy=no; coord_heavy_run_in_wt "$wt" "$SNAP" && heavy=yes
    echo "STALL $L pid=$top cpu_delta=$delta quiet=${quiet}m heavy=$heavy"
  else
    echo "OK $L"
  fi
done
exit 0
