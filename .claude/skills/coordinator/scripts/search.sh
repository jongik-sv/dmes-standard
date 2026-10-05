#!/usr/bin/env bash
# 검색·조사 질의를 외부 검색 워커(기본 agy)에 한 번 보내고 답을 파일로 남긴다. 정본: ../references/contract.md §3.3, ../SKILL.md 「시간·토큰·성능 최적화 원칙」
# 사용법: search.sh [--tab|--print] [--cwd <폴더>] [--timeout <초>] <질의…>
#   --tab  (설정 search.mode 기본 tab) 새 탭에 대화형 검색 워커(search.tab_command, 기본 `agy -i {prompt}`)를 띄워
#          사용자가 진행을 화면에서 볼 수 있게 한다. 답은 워커가 지정 파일에 쓰고, 파일이 생기면 탭을 닫는다.
#          탭을 못 띄우면 --print 로 내려간다.
#   --print 화면 없이 단발 실행(search.command, 기본 `agy -p … --print-timeout`). 빠르지만 사용자에게 안 보인다.
#   stdout 한 줄: `SEARCH ok <답 파일> <초>` 또는 `SEARCH fail <no-command|timeout|error|empty> <사유>`
#   답 본문은 파일에만 쓴다(조정자는 필요한 만큼만 읽는다). 회차가 있으면 <회차>/searches/, 없으면 $TMPDIR.
#   질의 앞에 「저장소 파일을 수정하지 말고 읽기만 하라」를 늘 붙인다.
#   fail 이면 조정자·레인은 Explore 서브에이전트(sonnet/medium)나 직접 grep 으로 대신한다.
#   설정: search.command(질의 자리 {prompt}·제한 시간 자리 {timeout}), search.timeout_s
set -uo pipefail
source "$(dirname "$0")/lib/common.sh"

cwd="" timeout="" mode=""
while [ $# -gt 0 ]; do
  case "$1" in
    --tab) mode=tab ;;
    --print) mode=print ;;
    --cwd) cwd="$2"; shift ;;
    --timeout) timeout="$2"; shift ;;
    -h|--help) sed -n 2,14p "$0"; exit 0 ;;
    --) shift; break ;;
    *) break ;;
  esac
  shift
done
[ $# -gt 0 ] || coord_die 2 "질의가 없다"
query="$*"
[ -n "$timeout" ] || timeout="$(coord_cfg .search.timeout_s)"; [ -n "$timeout" ] || timeout=240
tmpl="$(coord_cfg .search.command)"
[ -n "$tmpl" ] || { echo "SEARCH fail no-command search.command 미설정"; exit 0; }
bin="${tmpl%% *}"
command -v "$bin" >/dev/null 2>&1 || { echo "SEARCH fail no-command $bin 없음"; exit 0; }

prompt="저장소 파일을 수정하지 말고 읽기만 하라. 답은 근거 파일 경로(줄 번호)와 함께 짧게 낸다. 질의: $query"
if coord_has_run 2>/dev/null; then dir="$(coord_run_dir)/searches"; else dir="${TMPDIR:-/tmp}/coord-searches"; fi
mkdir -p "$dir"
out="$dir/$(date +%Y%m%d-%H%M%S)-$$.md"

# 템플릿의 {prompt}·{timeout} 을 인자 배열로 바꿔 셸 해석 없이 실행한다.
read -r -a parts <<<"$tmpl"
args=()
for p in "${parts[@]}"; do
  case "$p" in
    "{prompt}") args+=("$prompt") ;;
    *"{timeout}"*) args+=("${p//\{timeout\}/$timeout}") ;;
    *) args+=("$p") ;;
  esac
done

[ -n "$mode" ] || mode="$(coord_cfg .search.mode)"; [ -n "$mode" ] || mode=print
start="$(coord_now_epoch)"
if [ "$mode" = tab ] && command -v orca >/dev/null 2>&1; then
  source "$(dirname "$0")/lib/term.sh"
  ttmpl="$(coord_cfg .search.tab_command)"; [ -n "$ttmpl" ] || ttmpl="agy -i {prompt}"
  tprompt="$prompt 답을 다 쓰면 그 내용을 파일 $out 에 저장하라(이 파일 하나만 만든다)."
  q="$(printf '%s' "$tprompt" | sed "s/'/'\\\\''/g")"
  qq="'$q'"
  line="cd '${cwd:-$(coord_repo)}' && ${ttmpl//\{prompt\}/$qq}"
  th="$(orca terminal create --worktree active --title "search-$(date +%H%M%S)" --json 2>/dev/null | jq -r '[.. | objects | .handle? | strings | select(startswith("term_"))][0] // empty')"
  if [ -n "$th" ]; then
    term_send "$th" "$line" --enter >/dev/null
    coord_log "검색 탭 $th 에서 진행 중(사용자가 화면에서 볼 수 있다)"
    while [ ! -s "$out" ] && [ $(( $(coord_now_epoch) - start )) -lt "$timeout" ]; do sleep 5; done
    sleep 2
    term_close "$th" >/dev/null
    secs=$(( $(coord_now_epoch) - start ))
    if [ -s "$out" ]; then
      coord_has_run 2>/dev/null && coord_state_call event search - "$(jq -cn --arg q "$query" --arg f "$out" --argjson s "$secs" '{q:($q|.[0:200]),file:$f,secs:$s,mode:"tab"}')" >/dev/null
      echo "SEARCH ok $out $secs"; exit 0
    fi
    echo "SEARCH fail timeout 탭 검색이 ${timeout}초 안에 파일을 쓰지 않음"; exit 0
  fi
  coord_log "검색 탭을 띄우지 못해 --print 로 진행"
fi

( [ -n "$cwd" ] && cd "$cwd"; "${args[@]}" ) >"$out" 2>"$out.err"
rc=$?
secs=$(( $(coord_now_epoch) - start ))
if [ "$rc" -ne 0 ]; then
  reason="error"; [ "$secs" -ge "$timeout" ] && reason="timeout"
  echo "SEARCH fail $reason rc=$rc $(tail -1 "$out.err" | cut -c1-120)"; exit 0
fi
rm -f "$out.err"
[ -s "$out" ] || { echo "SEARCH fail empty 답 없음"; exit 0; }
coord_has_run 2>/dev/null && coord_state_call event search - "$(jq -cn --arg q "$query" --arg f "$out" --argjson s "$secs" '{q:($q|.[0:200]),file:$f,secs:$s}')" >/dev/null
echo "SEARCH ok $out $secs"
