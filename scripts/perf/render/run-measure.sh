#!/bin/bash
# MDM 화면 렌더링 시간 측정 실행기 — measure-screens.mjs 를 돌리고 summarize.mjs 로 중앙값을 낸다.
#
# ★실행은 조정 세션이 「측정 시작」을 보낸 뒤에만 한다. 시간 잰 값은 다른 무거운 작업이 없는
#   상태에서만 신뢰할 수 있다. 그래서 기본값은 heavy.sh 독점(--exclusive) 경로다.
#
# 준비물: node, python 은 필요 없다(sqlite 도 쓰지 않는다). playwright 모듈이 보이는 위치에서 실행한다.
#   기본은 이 스크립트가 있는 저장소 안에서 돌릴 때 src/frontend/node_modules 가 보인다.
#   다른 곳에서 돌리려면 PLAYWRIGHT_PATH 로 모듈 경로를 준다.
#
# 사용
#   bash scripts/perf/render/run-measure.sh [회차]
#   RENDER_SCREENS=termMng,columnMng RENDER_TAB_STATE=warm bash scripts/perf/render/run-measure.sh 3
#   # 독점 대기 없이 강제로(다른 무거운 작업이 있을 수 있음 — 결과 신뢰도 ↓):
#   RENDER_NO_EXCLUSIVE=1 bash scripts/perf/render/run-measure.sh 3
#
# 환경 변수는 README.md 의 표를 본다. PC 고유 경로는 전부 환경 변수로 받는다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="${PERF_REPO:-$(/usr/bin/git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || true)}"
[ -n "$REPO" ] || { echo "[render-perf] 저장소 경로가 없다. PERF_REPO 로 지정한다." >&2; exit 2; }

PERF_OUT="${PERF_OUT:-${TMPDIR:-/tmp}/dmes-perf/render}"
RENDER_BASE_URL="${RENDER_BASE_URL:-http://localhost:5300}"
RENDER_ROUNDS="${1:-${RENDER_ROUNDS:-3}}"
HEAVY_SH="${HEAVY_SH:-$REPO/.claude/skills/dflow-dev/scripts/heavy.sh}"
export PERF_OUT RENDER_BASE_URL RENDER_ROUNDS

say() { echo "[render-perf] $*" >&2; }

# ── 사전 확인 ────────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || { say "node 가 PATH 에 없다."; exit 2; }
/usr/bin/git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1 || { say "여기가 git 저장소가 아니다: $REPO"; exit 2; }

mkdir -p "$PERF_OUT"

if [ -n "${PLAYWRIGHT_PATH:-}" ]; then
  export NODE_PATH="${PLAYWRIGHT_PATH}${NODE_PATH:+:$NODE_PATH}"
  say "PLAYWRIGHT_PATH=$PLAYWRIGHT_PATH"
fi

# 측정 대상 서버가 살아 있는지 확인한다. **이 스크립트는 서버를 띄우지 않는다.**
# (프로덕션 빌드 미리보기 서버는 측정 워크트리에서 따로 띄운다 — scripts/perf/render/README.md §사용법)
if command -v curl >/dev/null 2>&1; then
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$RENDER_BASE_URL/login" || echo 000)"
  if [ "$code" = "000" ]; then
    say " measurer 서버에 닿지 못한다: $RENDER_BASE_URL/login (code=$code)"
    say " 이 스크립트는 서버를 띄우지 않는다. README §사용법 의 1~2단계를 먼저 한다."
    exit 3
  fi
  say "대상 서버: $RENDER_BASE_URL (login → $code)"
fi

say "결과 폴더: $PERF_OUT"
say "회차: $RENDER_ROUNDS   탭 상태: ${RENDER_TAB_STATE:-cold}"

run_measure() {
  node "$SCRIPT_DIR/measure-screens.mjs" "$RENDER_ROUNDS" "$@"
  node "$SCRIPT_DIR/summarize.mjs"
}

if [ "${RENDER_NO_EXCLUSIVE:-0}" = "1" ]; then
  say "독점 대기 없음(RENDER_NO_EXCLUSIVE=1) — 다른 무거운 작업이 있으면 결과 신뢰도가 낮다."
  run_measure
  exit 0
fi

if [ ! -f "$HEAVY_SH" ]; then
  say "heavy.sh 가 없다: $HEAVY_SH"
  say "독점 실행을 보장할 수 없다. HEAVY_SH 로 지정하거나 RENDER_NO_EXCLUSIVE=1 로 명시하고 진행한다."
  exit 2
fi

# 다른 무거운 명령이 돌지 않게 독점 슬롯을 잡고 돌린다.
# 슬롯을 DFLOW_HEAVY_WAIT(기본 90초) 안에 못 얻으면 HEAVY_BUSY(exit 75)로 끝난다 — 실패가 아니니 다시 부른다.
bash "$HEAVY_SH" --exclusive -- bash "$SCRIPT_DIR/run-measure.sh" "$RENDER_ROUNDS"
