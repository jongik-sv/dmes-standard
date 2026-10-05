#!/usr/bin/env bash
# deps.sh 가 워크트리 밖(메인 체크아웃) 파일을 쓰지 않는지 소형 픽스처 리포로 확인한다. 네트워크·실제 리포는 쓰지 않는다.
# 사용법: bash tests/deps-sh-no-main-write.sh [deps.sh 경로]   (기본: ../../dflow-dev/scripts/deps.sh, 실패하면 종료 코드 1)
# 시나리오(2026-10-05 tooltip-screens 사고): 워크트리의 패키지 node_modules 가 메인 체크아웃의 node_modules 로 가는 심링크일 때
#   pnpm install 이 링크를 따라 메인의 workspace 링크(b/node_modules/a)를 워크트리 경로로 다시 쓴다.
#   기대: 심링크만 지워지고(DEPS_UNLINKED) 메인 픽스처 파일은 하나도 안 바뀌며 워크트리에 독립 node_modules 가 생긴다.
#   E 루트에 lockfile 이 없고 하위 워크스페이스만 설치돼 있는 배치(링크를 지운 하위 폴더가 다시 설치돼야 한다)
#   A 평면 배치 · B 깊이 4 를 넘는 배치(src/fe/packages/*) · C 루트는 실제 폴더이고 패키지만 심링크(공백·한글 경로, 상대 링크)
#   · D 메인 안 파일을 가리키는 gitignore 심링크는 복제하지 않는다(DEPS_LINK_SKIP)
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
chk() { if [ "$1" = ok ]; then echo "ok   $2"; else echo "FAIL $2"; fail=1; fi; }

# 메인 픽스처 만들기: mk_main <루트 폴더> <워크스페이스 폴더(루트 기준, . 이면 루트)>
mk_main() {
  local root="$1" ws="$2"
  mkdir -p "$root/$ws/packages/a" "$root/$ws/packages/b"
  (
    cd "$root" || exit 1
    $GIT init -q -b main . || exit 1
    printf 'packages:\n  - packages/*\n' > "$ws/pnpm-workspace.yaml"
    echo '{"name":"root","private":true,"version":"1.0.0"}' > "$ws/package.json"
    echo '{"name":"a","version":"1.0.0"}' > "$ws/packages/a/package.json"
    echo '{"name":"b","version":"1.0.0","dependencies":{"a":"workspace:*"}}' > "$ws/packages/b/package.json"
    [ "$ws" = . ] || echo '{"name":"top","private":true,"version":"1.0.0"}' > package.json   # E: 루트에는 lockfile 없는 package.json 만
    printf 'node_modules\nx.yml\n' > .gitignore
    echo real > real.yml
    ln -s real.yml x.yml                      # D: 메인 안 파일을 가리키는 ignore 된 심링크
    ( cd "$ws" && pnpm install --offline >/dev/null 2>&1 )
    $GIT add -A && $GIT -c user.email=t@t -c user.name=t commit -qm init
  )
}
# 메인 지문: 파일 내용·링크 대상·이름 목록(이식 가능한 명령만)
fingerprint() {
  ( cd "$1" && {
      find . -path ./.git -prune -o -type f -exec shasum {} +
      find . -path ./.git -prune -o -type l -exec sh -c 'for f; do echo "$f -> $(readlink "$f")"; done' _ {} +
      find . -path ./.git -prune -o -print
    } 2>/dev/null | sort | shasum | cut -c1-12 )
}
run_deps() {  # run_deps <워크트리> <메인>
  ( cd "$1" && MAIN_CHECKOUT="$2" DFLOW_HEAVY_DIR="$tmp/heavy" bash "$deps" 2>&1 )
}

scenario() {  # scenario <이름> <루트 폴더 이름> <ws> <변형: abs|rel|mixed>
  local name="$1" rootname="$2" ws="$3" mode="$4"
  local root="$tmp/$rootname"; mkdir -p "$root"
  local main="$root/main" wt="$root/wt" pk="$ws/packages" out rc before after
  [ "$ws" = . ] && pk=packages
  mk_main "$main" "$ws" || { echo "픽스처 준비 실패($name)"; fail=1; return; }
  (cd "$main" && $GIT worktree add -q ../wt -b t-wt) || { echo "워크트리 준비 실패($name)"; fail=1; return; }
  case "$mode" in
    abs)   ln -s "$main/$pk/a/node_modules" "$wt/$pk/a/node_modules"   # 메인에 없는 폴더(끊어진 링크)
           ln -s "$main/$pk/b/node_modules" "$wt/$pk/b/node_modules" ;;
    mixed) ( cd "$wt/$ws" && pnpm install --offline >/dev/null 2>&1 )   # 루트 node_modules 는 실제 폴더
           rm -rf "$wt/$pk/b/node_modules"
           ln -s "../../../main/$pk/b/node_modules" "$wt/$pk/b/node_modules" ;;   # 상대 링크
    mixed-abs) ( cd "$wt/$ws" && pnpm install --offline >/dev/null 2>&1 )   # 워크스페이스 node_modules 는 실제 폴더, 패키지 b 만 링크
           rm -rf "$wt/$pk/b/node_modules"
           ln -s "$main/$pk/b/node_modules" "$wt/$pk/b/node_modules" ;;
  esac
  before="$(fingerprint "$main")"
  out="$(run_deps "$wt" "$main")"; rc=$?
  after="$(fingerprint "$main")"
  [ "$rc" = 0 ] && chk ok "$name: deps.sh exit 0" || chk no "$name: deps.sh exit $rc"
  [ "$before" = "$after" ] && chk ok "$name: 메인 픽스처 지문 그대로" || chk no "$name: 메인 픽스처가 바뀌었다($before → $after)"
  [ "$(readlink "$main/$pk/b/node_modules/a")" = "../../a" ] && chk ok "$name: 메인 b/node_modules/a 링크 그대로" || chk no "$name: 메인 b/node_modules/a → $(readlink "$main/$pk/b/node_modules/a")"
  printf '%s\n' "$out" | grep -q "^DEPS_UNLINKED $pk/b/node_modules" && chk ok "$name: DEPS_UNLINKED" || chk no "$name: DEPS_UNLINKED 줄이 없다"
  { [ -d "$wt/$pk/b/node_modules" ] && [ ! -L "$wt/$pk/b/node_modules" ]; } && chk ok "$name: 워크트리 안에 독립 node_modules" || chk no "$name: 워크트리 b/node_modules 가 실제 폴더가 아니다"
  if [ "$name" = A ]; then
    printf '%s\n' "$out" | grep -q '^DEPS_LINK_SKIP x.yml' && chk ok "D: DEPS_LINK_SKIP x.yml" || chk no "D: DEPS_LINK_SKIP 줄이 없다"
    [ ! -e "$wt/x.yml" ] && [ ! -L "$wt/x.yml" ] && chk ok "D: 워크트리에 x.yml 링크를 걸지 않았다" || chk no "D: 워크트리에 x.yml 이 생겼다"
  fi
}

mkdir -p "$tmp/heavy"
scenario A  a  .          abs
scenario B  b  src/fe     abs     # node_modules 경로 깊이 5 (DEPS_MAXDEPTH 기본 4 를 넘는다)
scenario C  "c 한글 경로" .  mixed   # 공백·한글 경로 + 상대 링크 + 루트 node_modules 는 실제 폴더
scenario E  e  src/fe     mixed-abs  # 루트는 lockfile 없는 package.json, 하위 src/fe 워크스페이스는 node_modules 가 있고 패키지 b 만 링크(dmes-standard 배치)
exit "$fail"
