#!/bin/bash
# 무거운 명령(vitest·tsc·tsup·pnpm build 등)을 작업 폴더에서 저장소의 heavy.mjs(PC 전역 줄 세우기)로 감싸 돌리는 얇은 도우미.
# 옛 레인 전용 도우미(c3-heavy.sh)는 자체 mkdir 잠금이었다. 잠금 회수·경쟁 처리는 heavy.mjs 에 맡기고 여기서는 다루지 않는다.
# p2-measure.sh 는 이것을 쓰지 않는다(측정은 heavy.mjs --detach --exclusive 로 바깥에서 감싼다).
# 사용: bash with-heavy.sh <작업 폴더> <명령> [인자...]
# 환경 변수: PERF_REPO(저장소 경로, 기본: 이 스크립트 위치의 git 최상위), HEAVY_SH(기본 $PERF_REPO/.claude/skills/dflow-dev/scripts/heavy.mjs),
#            VITEST_MAX_WORKERS(기본 2)
# heavy.mjs 가 슬롯을 DFLOW_HEAVY_WAIT(기본 90초) 안에 못 얻으면 명령을 돌리지 않고 HEAVY_BUSY 와 exit 75 로 끝난다. 실패가 아니니 같은 명령을 다시 부른다.
usage() { echo "사용: with-heavy.sh <작업 폴더> <명령> [인자...]" >&2; exit 2; }
[ $# -ge 2 ] || usage
dir="$1"; shift
[ -d "$dir" ] || { echo "[with-heavy] 작업 폴더가 없다: $dir" >&2; exit 2; }
REPO=${PERF_REPO:-$(/usr/bin/git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null)}
[ -n "$REPO" ] || { echo "[with-heavy] 저장소 경로를 찾지 못했다. PERF_REPO 로 지정한다." >&2; exit 2; }
HEAVY=${HEAVY_SH:-$REPO/.claude/skills/dflow-dev/scripts/heavy.mjs}
case "$HEAVY" in /*) ;; *) HEAVY="$PWD/$HEAVY" ;; esac   # cd 뒤에도 찾도록 절대 경로로
[ -f "$HEAVY" ] || { echo "[with-heavy] heavy.mjs 가 없다: $HEAVY (HEAVY_SH 로 지정한다)" >&2; exit 2; }
export VITEST_MAX_WORKERS=${VITEST_MAX_WORKERS:-2}
cd "$dir" || exit 2
echo "[with-heavy] 실행: (cd $dir) $*" >&2
case "$HEAVY" in *.mjs) HEAVY_RUN=node ;; *) HEAVY_RUN=bash ;; esac   # 확장자로 실행기를 고른다(.mjs node · .sh bash)
exec "$HEAVY_RUN" "$HEAVY" -- "$@"   # -- : 첫 인자를 heavy.mjs 하위 명령·옵션이 아니라 실행할 명령으로 읽게 한다
