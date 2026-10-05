#!/usr/bin/env bash
# deps.sh 가 워크트리 밖(메인 체크아웃) 파일을 쓰지 않는지 소형 픽스처 리포로 확인한다. 네트워크·실제 리포는 쓰지 않는다.
# 사용법: bash tests/deps-sh-no-main-write.sh [deps.sh 경로]   (기본: ../../dflow-dev/scripts/deps.sh, 실패하면 종료 코드 1)
# 시나리오(2026-10-05 tooltip-screens 사고): 워크트리의 패키지 node_modules 가 메인 체크아웃의 node_modules 로 가는 심링크일 때
#   pnpm install 이 링크를 따라 메인의 workspace 링크(b/node_modules/a)를 워크트리 경로로 다시 쓴다.
#   기대: 심링크만 지워지고(DEPS_UNLINKED) 메인 픽스처 파일은 하나도 안 바뀐다.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
deps="${1:-$here/../../dflow-dev/scripts/deps.sh}"
[ -f "$deps" ] || { echo "deps.sh 가 없다: $deps"; exit 2; }
deps="$(cd "$(dirname "$deps")" && pwd)/$(basename "$deps")"   # 시험 중 cd 하므로 절대경로로
command -v pnpm >/dev/null || { echo "pnpm 이 없어 건너뛴다"; exit 0; }
GIT=/usr/bin/git; [ -x "$GIT" ] || GIT=git

tmp="$(mktemp -d "${TMPDIR:-/tmp}/deps-fixture.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
fail=0
main="$tmp/main"; mkdir -p "$main/a" "$main/b" "$tmp/heavy"
(
  cd "$main" || exit 1
  $GIT init -q -b main . && printf 'packages:\n  - a\n  - b\n' > pnpm-workspace.yaml
  echo '{"name":"root","private":true,"version":"1.0.0"}' > package.json
  echo '{"name":"a","version":"1.0.0"}' > a/package.json
  echo '{"name":"b","version":"1.0.0","dependencies":{"a":"workspace:*"}}' > b/package.json
  printf 'node_modules\n' > .gitignore
  pnpm install --offline >/dev/null 2>&1
  $GIT add -A && $GIT -c user.email=t@t -c user.name=t commit -qm init
) || { echo "픽스처 준비 실패"; exit 2; }

fingerprint() { ( cd "$main" && find . -path ./.git -prune -o -print0 | xargs -0 stat -f '%m %N %Y' 2>/dev/null | sort -k2 | shasum | cut -c1-12 ); }

(cd "$main" && $GIT worktree add -q ../wt -b t-wt) || { echo "워크트리 준비 실패"; exit 2; }
ln -s "$main/a/node_modules" "$tmp/wt/a/node_modules"   # 메인에는 없는 폴더(끊어진 링크)
ln -s "$main/b/node_modules" "$tmp/wt/b/node_modules"   # 메인의 실제 폴더
before="$(fingerprint)"
out="$(cd "$tmp/wt" && MAIN_CHECKOUT="$main" DFLOW_HEAVY_DIR="$tmp/heavy" bash "$deps" 2>&1)"; rc=$?
after="$(fingerprint)"

chk() { if [ "$1" = ok ]; then echo "ok   $2"; else echo "FAIL $2"; fail=1; fi; }
[ "$rc" = 0 ] && chk ok "deps.sh exit 0" || chk no "deps.sh exit $rc"
[ "$before" = "$after" ] && chk ok "메인 픽스처 지문 그대로" || chk no "메인 픽스처가 바뀌었다($before → $after)"
[ "$(readlink "$main/b/node_modules/a")" = "../../a" ] && chk ok "메인 b/node_modules/a 링크 그대로" || chk no "메인 b/node_modules/a → $(readlink "$main/b/node_modules/a")"
printf '%s\n' "$out" | grep -q '^DEPS_UNLINKED b/node_modules' && chk ok "DEPS_UNLINKED b/node_modules" || chk no "DEPS_UNLINKED 줄이 없다"
{ [ -d "$tmp/wt/b/node_modules" ] && [ ! -L "$tmp/wt/b/node_modules" ]; } && chk ok "워크트리 안에 독립 node_modules" || chk no "워크트리 b/node_modules 가 실제 폴더가 아니다"
exit "$fail"
