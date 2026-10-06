#!/usr/bin/env bash
# 검색·조사 질의를 외부 검색 워커(기본 agy → 실패 시 opencode)에 한 번 보내고 답을 파일로 남긴다. 정본: ../references/contract.md §3.3, ../SKILL.md 「시간·토큰·성능 최적화 원칙」
# 사용법: search.sh [--tab|--print] [--cwd <폴더>] [--timeout <초>] [--worker <agy|opencode>] <질의…>
#   --tab  (설정 search.mode 기본 tab) 새 탭에 검색 워커를 띄워 사용자가 진행을 화면에서 볼 수 있게 한다.
#          agy 는 대화형(search.tab_command)이 지정 파일에 답을 쓰고, opencode 는 `opencode run --standalone` 출력을 tee 로 파일에 남긴다.
#          파일이 생기면(opencode 는 끝 표지가 생기면) 탭을 닫는다. 탭을 못 띄우면 --print 로 내려간다.
#   --print 화면 없이 단발 실행(agy: search.command, opencode: search.opencode.command). 빠르지만 사용자에게 안 보인다.
#   워커 순서는 설정 search.workers(기본 ["agy","opencode"]). 앞 워커가 실패(no-command·timeout·error·empty)하면 다음 워커로 내려간다.
#   --worker 는 그 워커 하나만 쓴다.
#   stdout 한 줄: `SEARCH ok <답 파일> <초> worker=<이름>` 또는 `SEARCH fail <no-command|timeout|error|empty> <사유>`(마지막 워커의 실패)
#   답 본문은 파일에만 쓴다(조정자는 필요한 만큼만 읽는다). 회차가 있으면 <회차>/searches/, 없으면 $TMPDIR.
#   질의 앞에 「저장소 파일을 수정하지 말고 읽기만 하라」를 늘 붙인다.
#   모든 워커가 fail 이면 조정자·레인은 Explore 서브에이전트(sonnet/medium)나 직접 grep 으로 대신한다.
#   opencode 질의에서는 `!`·`@` 를 지운다(TUI·셸 모드 오작동 방지, 사용자 규칙).
#   설정: search.workers, search.command·tab_command(agy), search.opencode.command·tab_command(자리 {prompt}·{timeout}·{out}), search.timeout_s
set -uo pipefail
source "$(dirname "$0")/lib/common.sh"
source "$(dirname "$0")/lib/compat.sh"

cwd="" timeout="" mode="" only=""
while [ $# -gt 0 ]; do
  case "$1" in
    --tab) mode=tab ;;
    --print) mode=print ;;
    --cwd) cwd="$2"; shift ;;
    --timeout) timeout="$2"; shift ;;
    --worker) only="$2"; shift ;;
    -h|--help) sed -n 2,15p "$0"; exit 0 ;;
    --) shift; break ;;
    *) break ;;
  esac
  shift
done
[ $# -gt 0 ] || coord_die 2 "질의가 없다"
query="$*"
[ -n "$timeout" ] || timeout="$(coord_cfg .search.timeout_s)"; [ -n "$timeout" ] || timeout=240
[ -n "$mode" ] || mode="$(coord_cfg .search.mode)"; [ -n "$mode" ] || mode=print
if coord_has_run 2>/dev/null; then dir="$(coord_run_dir)/searches"; else dir="${TMPDIR:-/tmp}/coord-searches"; fi
mkdir -p "$dir"

# 워커 목록: --worker 가 있으면 그것만, 없으면 설정 search.workers(없으면 agy opencode)
if [ -n "$only" ]; then workers="$only"
else
  workers="$(coord_cfg_json '.search.workers // empty' | jq -r '.[]?' 2>/dev/null | tr '\n' ' ')"
  [ -n "$workers" ] || workers="agy opencode"
fi

# 셸 따옴표 하나로 감싼다
shq() { local q; q="$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; printf "'%s'" "$q"; }

# 워커 하나 실행. 성공이면 0 과 `SEARCH ok …` 줄, 실패면 1 과 `SEARCH fail …` 줄을 stdout 으로 낸다.
run_worker() {
  local w="$1" wait_for tmpl ttmpl q prompt out bin start secs rc reason th line tprompt wq
  case "$w" in
    agy) tmpl="$(coord_cfg .search.command)"; ttmpl="$(coord_cfg .search.tab_command)"; [ -n "$ttmpl" ] || ttmpl="agy -i {prompt}" ;;
    opencode)
      tmpl="$(coord_cfg .search.opencode.command)"; [ -n "$tmpl" ] || tmpl="opencode run --standalone {prompt}"
      ttmpl="$(coord_cfg .search.opencode.tab_command)"; [ -n "$ttmpl" ] || ttmpl="opencode run --standalone {prompt} 2>&1 | tee {out}"
      ;;
    *) echo "SEARCH fail no-command 모르는 검색 워커 $w"; return 1 ;;
  esac
  [ -n "$tmpl" ] || { echo "SEARCH fail no-command $w 명령 미설정"; return 1; }
  bin="${tmpl%% *}"
  command -v "$bin" >/dev/null 2>&1 || { echo "SEARCH fail no-command $bin 없음"; return 1; }

  q="$query"
  [ "$w" = opencode ] && q="$(printf '%s' "$query" | tr -d '!@')"
  prompt="저장소 파일을 수정하지 말고 읽기만 하라. 답은 근거 파일 경로(줄 번호)와 함께 짧게 낸다. 질의: $q"
  out="$dir/$(date +%Y%m%d-%H%M%S)-$$-$w.md"
  start="$(coord_now_epoch)"

  if [ "$mode" = tab ] && command -v orca >/dev/null 2>&1; then
    source "$(dirname "$0")/lib/term.sh"
    th="$(orca terminal create --worktree active --title "search-$w-$(date +%H%M%S)" --json 2>/dev/null | jq -r '[.. | objects | .handle? | strings | select(startswith("term_"))][0] // empty')"
    if [ -n "$th" ]; then
      if [ "$w" = opencode ]; then
        # run 출력이 화면에 흐르면서 tee 로 파일에 남는다. 끝나면 .done 표지가 생긴다.
        line="${ttmpl//\{prompt\}/$(shq "$prompt")}"; line="${line//\{out\}/$(shq "$out")}"
        line="cd $(shq "${cwd:-$(coord_repo)}") && { $line ; touch $(shq "$out.done") ; }"
        wait_for="$out.done"
      else
        tprompt="$prompt 답을 다 쓰면 그 내용을 파일 $out 에 저장하라(이 파일 하나만 만든다)."
        line="cd $(shq "${cwd:-$(coord_repo)}") && ${ttmpl//\{prompt\}/$(shq "$tprompt")}"
        wait_for="$out"   # agy 는 답을 다 쓴 뒤 파일을 만든다
      fi
      term_send "$th" "$line" --enter >/dev/null
      coord_log "검색 탭 $th($w)에서 진행 중(사용자가 화면에서 볼 수 있다)"
      while [ ! -e "$wait_for" ] && [ $(( $(coord_now_epoch) - start )) -lt "$timeout" ]; do sleep 5; done
      sleep 2
      term_close "$th" >/dev/null
      rm -f "$out.done"
      secs=$(( $(coord_now_epoch) - start ))
      if [ -s "$out" ]; then
        coord_has_run 2>/dev/null && coord_state_call event search - "$(jq -cn --arg q "$query" --arg f "$out" --arg w "$w" --argjson s "$secs" '{q:($q|.[0:200]),file:$f,secs:$s,mode:"tab",worker:$w}')" >/dev/null
        echo "SEARCH ok $out $secs worker=$w"; return 0
      fi
      echo "SEARCH fail timeout $w 탭 검색이 ${timeout}초 안에 답 파일을 쓰지 않음"; return 1
    fi
    coord_log "검색 탭을 띄우지 못해 $w 를 --print 로 진행"
  fi

  # 화면 없는 단발 실행. 템플릿의 {prompt}·{timeout} 을 인자 배열로 바꿔 셸 해석 없이 실행한다. 제한 시간이 넘으면 자기 자식 트리만 끝낸다.
  local parts p args=() pid
  read -r -a parts <<<"$tmpl"
  for p in "${parts[@]}"; do
    case "$p" in
      "{prompt}") args+=("$prompt") ;;
      *"{timeout}"*) args+=("${p//\{timeout\}/$timeout}") ;;
      *) args+=("$p") ;;
    esac
  done
  ( [ -n "$cwd" ] && cd "$cwd"; exec "${args[@]}" ) >"$out" 2>"$out.err" </dev/null &
  pid=$!
  while kill -0 "$pid" 2>/dev/null && [ $(( $(coord_now_epoch) - start )) -lt "$timeout" ]; do sleep 1; done
  if kill -0 "$pid" 2>/dev/null; then
    compat_kill_tree "$pid"; wait "$pid" 2>/dev/null
    echo "SEARCH fail timeout $w ${timeout}초 안에 끝나지 않음"; return 1
  fi
  wait "$pid"; rc=$?
  secs=$(( $(coord_now_epoch) - start ))
  if [ "$rc" -ne 0 ]; then
    reason="error"; [ "$secs" -ge "$timeout" ] && reason="timeout"
    echo "SEARCH fail $reason $w rc=$rc $(tail -1 "$out.err" | cut -c1-120)"; return 1
  fi
  rm -f "$out.err"
  [ -s "$out" ] || { echo "SEARCH fail empty $w 답 없음"; return 1; }
  coord_has_run 2>/dev/null && coord_state_call event search - "$(jq -cn --arg q "$query" --arg f "$out" --arg w "$w" --argjson s "$secs" '{q:($q|.[0:200]),file:$f,secs:$s,worker:$w}')" >/dev/null
  echo "SEARCH ok $out $secs worker=$w"; return 0
}

last=""
for w in $workers; do
  res="$(run_worker "$w")"; rc=$?
  last="$res"
  [ "$rc" -eq 0 ] && { echo "$res"; exit 0; }
  coord_log "검색 워커 $w 실패: $res"
done
echo "${last:-SEARCH fail no-command 검색 워커 없음}"
