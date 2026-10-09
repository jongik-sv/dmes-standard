#!/bin/bash
# P2 m-mdm 빌드 시간·메모리 측정. 기준 A(BASE_REF) 와 변경 B(CHANGE_REF) 를 콜드·웜으로 번갈아 잰다.
# 자세한 내용은 같은 폴더의 README.md 를 본다.
# 실행: bash scripts/perf/frontend/p2-measure.sh [회차 수, 기본 4]
#       공용 무거운 작업 칸을 독점하려면 이 스크립트를 바깥에서 감싼다: node .claude/skills/dflow-dev/scripts/heavy.mjs --detach --exclusive bash scripts/perf/frontend/p2-measure.sh
#       HEAVY_CMD 는 감싸지 않는다. env.txt 에 "node heavy.mjs status" 한 줄을 적는 데만 쓴다(기본: 저장소의 .claude/skills/dflow-dev/scripts/heavy.mjs 가 있으면 그것).
#
# 순서
#   0. 준비(재지 않음): 두 워크트리에 pnpm install(오프라인 우선)과 shared 빌드.
#   1. 예열 1회(버림): A·B 콜드 빌드 한 번씩. OS 파일 캐시를 양쪽 같은 상태로 맞춘다.
#   2. 회차 1..N: 홀수 회차 A→B, 짝수 회차 B→A(ABBA, 순서 편향 상쇄).
#      한 워크트리 안에서는 콜드(산출물·빌드 캐시 삭제 뒤) → 바로 이어 웜(아무것도 지우지 않고 재빌드).
#   콜드 = m-mdm/dist, m-mdm/node_modules/.cache(lib-dev 지문·tsc tsbuildinfo), *.tsbuildinfo 를 지운 상태.
#          삭제는 측정용 워크트리 안의 m-mdm 폴더에만 한다. OS 페이지 캐시는 sudo purge 없이 비울 수 없어 예열로 맞춘다.
#   측정값 = /usr/bin/time -l 의 real(초)·maximum resident set size(자식 가운데 가장 큰 단일 프로세스 RSS).
#   회차마다 직전 uptime load(1분·5분)를 남긴다.
set -u
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO=${PERF_REPO:-$(/usr/bin/git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)}
[ -n "$REPO" ] && [ -d "$REPO" ] || { echo '저장소 경로를 찾지 못함 — PERF_REPO 로 지정' >&2; exit 2; }
BASE_REF=${BASE_REF:-refactor-2026-10-base}
CHANGE_REF=${CHANGE_REF:-dev}
A=${WT_BASE:-$REPO/.claude/worktrees/perf-frontend-base}
B=${WT_CHANGE:-$REPO/.claude/worktrees/perf-frontend-dev}
OUT=${PERF_OUT:-${TMPDIR:-/tmp}/dmes-perf/frontend}
LOAD_LIMIT=${LOAD_LIMIT:-5}
# env.txt 기록용 heavy.mjs 경로(상대 경로는 저장소 기준). 설정하지 않으면 저장소의 heavy.mjs 가 있을 때 그것을 쓰고, 명시적으로 비우면 기록하지 않는다.
if [ "${HEAVY_CMD+set}" != set ] && [ -f "$REPO/.claude/skills/dflow-dev/scripts/heavy.mjs" ]; then
  HEAVY_CMD="$REPO/.claude/skills/dflow-dev/scripts/heavy.mjs"
fi
HEAVY_CMD=${HEAVY_CMD-}
case "${HEAVY_CMD%% *}" in ""|/*) ;; *) [ -e "$REPO/${HEAVY_CMD%% *}" ] && HEAVY_CMD="$REPO/$HEAVY_CMD" ;; esac
CLEANUP=${PERF_CLEANUP:-0}
ROUNDS=${1:-4}
CREATED_A=0; CREATED_B=0
mkdir -p "$OUT"
CSV=$OUT/results.csv
export LIB_DEV_FORCE_BUILD=1   # dev watch 가 있어도 직접 빌드(pkg-build 가 watch 에 맡기지 않게)
unset CI TSUP_DTS

log() { echo "[p2 $(date +%H:%M:%S)] $*"; }
load1() { uptime | sed -E 's/.*load averages?: *([0-9.]+)[, ]+([0-9.]+).*/\1 \2/'; }

command -v pnpm >/dev/null 2>&1 || { echo "pnpm 을 PATH 에서 찾을 수 없다. node·pnpm 을 설치하거나 PATH 에 넣은 뒤 다시 실행한다." >&2; exit 2; }

# 측정용 워크트리인지 확인한다: 저장소의 git worktree 목록에 있고, 메인 체크아웃(목록 첫 항목)·$REPO 와 다른 경로여야 한다.
# 아니면 종료한다(메인 체크아웃에서 pnpm install·rm -rf·빌드가 돌면 실행 중인 dev 서버 화면까지 영향을 받는다).
validate_wt() {
  local wt=$1 real main="" listed=0 p q first=1
  real=$(cd "$wt" 2>/dev/null && pwd -P) || { log "측정용 워크트리 경로를 열 수 없다: $wt"; exit 4; }
  while IFS= read -r p; do
    q=$(cd "${p#worktree }" 2>/dev/null && pwd -P) || q=${p#worktree }
    if [ "$first" = 1 ]; then main=$q; first=0; fi
    [ "$q" = "$real" ] && listed=1
  done < <(/usr/bin/git -C "$REPO" worktree list --porcelain | grep '^worktree ')
  [ "$listed" = 1 ] || { log "git worktree 목록에 없는 경로다: $wt"; exit 4; }
  [ "$real" != "$main" ] || { log "메인 체크아웃은 측정용 워크트리로 쓸 수 없다: $wt"; exit 4; }
  [ "$real" != "$(cd "$REPO" && pwd -P)" ] || { log "저장소 루트는 측정용 워크트리로 쓸 수 없다: $wt"; exit 4; }
}

# 측정용 워크트리가 없으면 detached 로 만든다. 있으면 목록 검증 뒤 HEAD 가 ref 와 같을 때만 쓴다(다르면 종료).
ensure_wt() {
  local wt=$1 ref=$2 flag=$3 want have
  want=$(/usr/bin/git -C "$REPO" rev-parse --verify "$ref^{commit}") || { log "$ref 커밋을 찾지 못함"; exit 2; }
  if [ -d "$wt" ]; then
    validate_wt "$wt"
    have=$(/usr/bin/git -C "$wt" rev-parse HEAD 2>/dev/null)
    [ "$have" = "$want" ] || { log "$wt 이 이미 있고 HEAD($have)가 $ref($want)와 다르다. 이전 실행의 잔여물이면 git worktree remove 로 지우고 다시 실행한다."; exit 2; }
    log "기존 워크트리 사용 $wt (HEAD ${have:0:8}, ref $ref)"
  else
    /usr/bin/git -C "$REPO" worktree add --detach "$wt" "$want" || { log "워크트리 생성 실패 $wt"; exit 2; }
    eval "$flag=1"
    validate_wt "$wt"
  fi
}

remove_wt() {
  local wt=$1
  /usr/bin/git -C "$REPO" worktree remove "$wt" || log "워크트리 제거 실패(수정된 파일이 있을 수 있다, --force 는 쓰지 않는다): $wt"
}

cleanup() {
  if [ "$CLEANUP" = 1 ]; then
    [ "$CREATED_A" = 1 ] && remove_wt "$A"
    [ "$CREATED_B" = 1 ] && remove_wt "$B"
  fi
}
trap cleanup EXIT

prep() {
  local wt=$1 name=$2
  log "준비 $name: pnpm install"
  (cd "$wt/src/frontend" && pnpm install --offline --frozen-lockfile >"$OUT/prep-$name-install.log" 2>&1) \
    || (cd "$wt/src/frontend" && pnpm install --prefer-offline --frozen-lockfile >>"$OUT/prep-$name-install.log" 2>&1) \
    || { log "준비 실패 $name install"; exit 3; }
  log "준비 $name: shared build"
  (cd "$wt/src/frontend/shared" && pnpm build >"$OUT/prep-$name-shared.log" 2>&1) || { log "준비 실패 $name shared"; exit 3; }
}

clean_mdm() {
  local d=$1/src/frontend/m-mdm
  validate_wt "$1"   # 측정용 워크트리가 아니면 종료(삭제 전 마지막 방어선)
  rm -rf "$d/dist" "$d/node_modules/.cache"
  find "$d" -maxdepth 1 -name '*.tsbuildinfo' -delete
}

# measure <wt> <name A|B> <round> <kind cold|warm>
measure() {
  local wt=$1 name=$2 round=$3 kind=$4
  local f=$OUT/r$round-$name-$kind.log
  [ "$kind" = cold ] && clean_mdm "$wt"
  local ld; ld=$(load1)
  (cd "$wt/src/frontend/m-mdm" && /usr/bin/time -l pnpm build) >"$f" 2>&1
  local rc=$?
  local sec rss
  sec=$(grep -E '^ *[0-9.]+ real' "$f" | tail -1 | awk '{print $1}')
  rss=$(grep 'maximum resident set size' "$f" | tail -1 | awk '{print $1}')
  local l1=${ld%% *} keep=1
  awk -v l="$l1" -v m="$LOAD_LIMIT" 'BEGIN{exit !(l>m)}' && keep=0
  echo "$round,$name,$kind,$sec,$rss,${ld// /,},$rc,$keep" >>"$CSV"
  log "r$round $name $kind: ${sec}s rss=${rss} load=$ld rc=$rc keep=$keep"
  return $((1 - keep))
}

# 콜드·웜 한 쌍. 어느 쪽이든 load(1분)가 한도를 넘으면 그 쌍을 버리고(keep=0 으로 남김) 60초 쉰 뒤 다시 잰다(최대 3번).
pair() {
  local try
  for try in 1 2 3; do
    if measure "$1" "$2" "$3" cold && measure "$1" "$2" "$3" warm; then return 0; fi
    log "r$3 $2 load $LOAD_LIMIT 초과 - 버리고 60초 뒤 다시"; sleep 60
  done
  log "r$3 $2 3번 모두 load $LOAD_LIMIT 초과"
}

[ "$A" != "$B" ] || { log "WT_BASE 와 WT_CHANGE 가 같은 경로다: $A"; exit 4; }
ensure_wt "$A" "$BASE_REF" CREATED_A
ensure_wt "$B" "$CHANGE_REF" CREATED_B
{
  echo "# 시작 $(date '+%Y-%m-%d %H:%M:%S')"
  echo "# A($BASE_REF) $(/usr/bin/git -C "$A" rev-parse --short HEAD) B($CHANGE_REF) $(/usr/bin/git -C "$B" rev-parse --short HEAD)"
  echo "# 전원: $(pmset -g batt 2>/dev/null | head -1)"
  if [ -n "$HEAVY_CMD" ]; then
    heavy_bin=${HEAVY_CMD%% *}
    case "$heavy_bin" in *.mjs) heavy_run=node ;; *) heavy_run=bash ;; esac   # 확장자로 실행기를 고른다(.mjs node · .sh bash)
    echo "# heavy: $("$heavy_run" "$heavy_bin" status 2>/dev/null)"
  fi
} >"$OUT/env.txt"
echo "round,wt,kind,sec,maxrss_bytes,load1,load5,rc,keep" >"$CSV"

prep "$A" A
prep "$B" B
pair "$A" A 0
pair "$B" B 0
for r in $(seq 1 "$ROUNDS"); do
  if [ $((r % 2)) -eq 1 ]; then pair "$A" A "$r"; pair "$B" B "$r"; else pair "$B" B "$r"; pair "$A" A "$r"; fi
done
echo "# 끝 $(date '+%Y-%m-%d %H:%M:%S')" >>"$OUT/env.txt"
log "끝 - $CSV"
