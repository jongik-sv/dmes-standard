#!/usr/bin/env bash
# 사용법: merge-gate.sh <레인> | --branch <브랜치>
#   머지 허가 전 기계적 확인(설계 §3.b). 정본 출력: references/contract.md §3.3
#   첫 줄 GATE <ok|wait|conflict> branch=<b> base=<integration> tree=<hash|-> files=<n>
#   이어 CONFLICT·FORBIDDEN·OUTSIDE·SHARED_API·RESTART·WINDOW·INFLIGHT 사유 줄.
#   conflict = 충돌 있음, wait = FORBIDDEN·WINDOW·INFLIGHT 있음, 그 밖 ok(OUTSIDE·SHARED_API·RESTART 는 조정자 판단).
#   --branch 만 주면 소유·금지 대조는 건너뛴다. 회차가 없으면 WINDOW·INFLIGHT 도 건너뛴다.
set -uo pipefail
. "$(dirname "$0")/lib/common.sh"

lane="" branch=""
while [ $# -gt 0 ]; do
  case "$1" in
    --branch) branch="${2:-}"; shift ;;
    -h|--help) sed -n '2,7p' "$0"; exit 0 ;;
    -*) coord_die 2 "모르는 옵션: $1" ;;
    *) lane="$1" ;;
  esac
  shift
done
[ -n "$lane" ] || [ -n "$branch" ] || coord_die 2 "사용법: merge-gate.sh <레인> | --branch <브랜치>"

# 글롭 → 확장 정규식. `**/` = 0개 이상 폴더, `**` = 아무 글자, `*` = / 를 뺀 글자, `?` = / 를 뺀 한 글자.
# 끝이 / 인 글롭은 그 폴더 아래 전부.
glob_re() {
  local g="$1" re="" i=0 n c
  case "$g" in */) g="${g}**" ;; esac
  n=${#g}
  while [ "$i" -lt "$n" ]; do
    c="${g:i:1}"
    case "$c" in
      '*')
        if [ "${g:i:2}" = "**" ]; then
          if [ "${g:i+2:1}" = "/" ]; then re="${re}(.*/)?"; i=$((i + 3)); continue; fi
          re="${re}.*"; i=$((i + 2)); continue
        fi
        re="${re}[^/]*" ;;
      '?') re="${re}[^/]" ;;
      '.'|'+'|'('|')'|'|'|'^'|'$'|'['|']'|'{'|'}'|'\') re="${re}\\${c}" ;;
      *) re="${re}${c}" ;;
    esac
    i=$((i + 1))
  done
  printf '^%s$' "$re"
}
# glob_match <경로> <글롭…>: 하나라도 맞으면 0
glob_match() {
  local p="$1" g re; shift
  for g in "$@"; do
    [ -n "$g" ] || continue
    re="$(glob_re "$g")"
    [[ $p =~ $re ]] && return 0
  done
  return 1
}
if [ "${MERGE_GATE_SELFTEST:-}" = 1 ]; then
  t() { if glob_match "$1" "$2"; then r=match; else r=no; fi; [ "$r" = "$3" ] && echo "PASS $2 ~ $1 → $r" || echo "FAIL $2 ~ $1 → $r (기대 $3)"; }
  t src/backend/a/b/C.java 'src/backend/**' match
  t src/backend 'src/backend/**' no
  t src/frontend/shared/src/index.ts '**/index.ts' match
  t index.ts '**/index.ts' match
  t src/a.ts 'src/*.ts' match
  t src/a/b.ts 'src/*.ts' no
  t docs/x/y.md 'docs/' match
  t docsx/y.md 'docs/' no
  t src/a.b.ts 'src/a?b.ts' match
  t 'src/a+b.ts' 'src/a+b.ts' match
  t src/aXb.ts 'src/a.b.ts' no
  exit 0
fi

has_run=0; coord_has_run && has_run=1
owned=() forbidden=()
if [ -n "$lane" ]; then
  [ "$has_run" = 1 ] || coord_die 3 "현재 회차가 없다(레인 이름으로 부르려면 회차가 필요)"
  [ "$(coord_state "(.lanes[\"$lane\"] // null) | type")" = object ] || coord_die 2 "상태에 없는 레인: $lane"
  [ -n "$branch" ] || branch="$(coord_lane_get "$lane" .branch)"
  [ -n "$branch" ] || coord_die 3 "레인 $lane 의 branch 가 비어 있다"
  while IFS= read -r g; do [ -n "$g" ] && owned+=("$g"); done < <(jq -r --arg l "$lane" '.lanes[$l].owned[]? // empty' "$(coord_state_file)")
  while IFS= read -r g; do [ -n "$g" ] && forbidden+=("$g"); done < <(jq -r --arg l "$lane" '.lanes[$l].forbidden[]? // empty' "$(coord_state_file)")
fi

# merge-tree 의 경로는 현재 폴더 기준으로 나오므로 작업 트리 맨 위에서 돈다.
top="$(coord_git rev-parse --show-toplevel 2>/dev/null)" && cd "$top" || true

base=""
[ "$has_run" = 1 ] && base="$(coord_state '.run.integration_branch // empty')"
[ -n "$base" ] || base="$(coord_cfg .integration_branch)"
coord_git rev-parse --verify -q "${base}^{commit}" >/dev/null || coord_die 4 "통합 브랜치가 없다: $base"
coord_git rev-parse --verify -q "${branch}^{commit}" >/dev/null || coord_die 2 "브랜치가 없다: $branch"

# 1. 충돌·예상 트리
mt="$(coord_git merge-tree --write-tree --name-only --no-messages "$base" "$branch" 2>/dev/null)"; mrc=$?
conflicts=()
case "$mrc" in
  0) tree="$(printf '%s\n' "$mt" | head -1)" ;;
  1) tree="-"
     while IFS= read -r p; do [ -n "$p" ] && conflicts+=("$p"); done < <(printf '%s\n' "$mt" | sed '1d' | sort -u) ;;
  *) coord_die 4 "git merge-tree 실패(rc=$mrc). git 2.38 이상이 필요하다" ;;
esac

# 2. 범위
files=()
while IFS= read -r p; do [ -n "$p" ] && files+=("$p"); done < <(coord_git diff --name-only "${base}...${branch}" 2>/dev/null)

reasons=()
add() { reasons+=("$1"); }
gate_wait=0
if [ "${#conflicts[@]}" -gt 0 ]; then for p in "${conflicts[@]}"; do add "CONFLICT $p"; done; fi

is_shared_api() {
  case "$1" in
    src/frontend/shared/*) ;;
    *) return 1 ;;
  esac
  case "$1" in
    */index.ts|*/index.tsx|*.d.ts|*/types.ts|*.types.ts|*Types.ts|*Props.ts|*/types/*|src/frontend/shared/package.json) return 0 ;;
  esac
  return 1
}

if [ "${#files[@]}" -gt 0 ]; then
  for p in "${files[@]}"; do
    if [ "${#forbidden[@]}" -gt 0 ] && glob_match "$p" "${forbidden[@]}"; then add "FORBIDDEN $p"; gate_wait=1
    elif [ "${#owned[@]}" -gt 0 ] && ! glob_match "$p" "${owned[@]}"; then add "OUTSIDE $p"
    fi
    is_shared_api "$p" && add "SHARED_API $p"
  done
  # 5. 재기동 영향(규칙마다 한 번)
  nrules="$(coord_cfg_json '.restart_rules | length')"
  i=0
  while [ "$i" -lt "${nrules:-0}" ]; do
    rg="$(coord_cfg ".restart_rules[$i].glob")"; note="$(coord_cfg ".restart_rules[$i].note")"
    for p in "${files[@]}"; do
      if glob_match "$p" "$rg"; then add "RESTART ${note:-$rg}"; break; fi
    done
    i=$((i + 1))
  done
fi

# 6. 측정 창 · 진행 중 머지
if [ "$has_run" = 1 ]; then
  while IFS= read -r w; do
    [ -n "$w" ] && { add "WINDOW $w"; gate_wait=1; }
  done < <(jq -r '.windows[]? | select(.kind == "measure") | "\(.kind) until=\(.until // "-")"' "$(coord_state_file)")
  inf="$(jq -r --arg l "$lane" --arg b "$branch" '
    .merge.in_flight // empty
    | select(if $l != "" then (.lane // "") != $l else (.branch // "") != $b end)
    | (.lane // .branch // "?")' "$(coord_state_file)")"
  if [ -n "$inf" ]; then add "INFLIGHT $inf"; gate_wait=1; fi
fi

if [ "${#conflicts[@]}" -gt 0 ]; then g=conflict
elif [ "$gate_wait" = 1 ]; then g=wait
else g=ok
fi
echo "GATE $g branch=$branch base=$base tree=$tree files=${#files[@]}"
if [ "${#reasons[@]}" -gt 0 ]; then printf '%s\n' "${reasons[@]}"; fi
exit 0
