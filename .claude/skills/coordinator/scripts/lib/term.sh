#!/usr/bin/env bash
# 터미널 어댑터. 정본 사양: ../../references/contract.md §3.2
# 공개 함수만 쓴다: term_list · term_read_screen · term_wait_idle · term_send · term_close · term_send_keys(콘솔 키 입력 전용).
# 백엔드는 설정 terminal_backend(orca 기본, tmux 는 뼈대). common.sh 를 먼저 source 해야 한다.
_term_d="${BASH_SOURCE[0]%/*}"; [ "$_term_d" != "${BASH_SOURCE[0]}" ] || _term_d=.
. "$_term_d/js-bridge.sh"   # COORD_JS_TERM=1 이면 아래 공개 함수를 scripts/lib/term.mjs(node)로 넘긴다(기본 꺼짐)

_term_backend() { local b; b="$(coord_cfg .terminal_backend)"; printf '%s' "${b:-orca}"; }
# 백엔드 이름을 _TB 에 둔다(서브셸 $(…) 없이 — 호출마다 fork 하지 않는다). 설정에 값이 없으면 orca.
_term_be() {
  _coord_cfg_ensure
  if _coord_flat_get .terminal_backend; then _TB="$_CF_RAW"; else _TB="$(coord_cfg .terminal_backend)"; fi
  [ -n "$_TB" ] || _TB=orca
}

# ---------- orca ----------
_orca_json() { orca "$@" --json 2>/dev/null; }
_orca_stale() { case "$1" in *terminal_handle_stale*|*"not found"*|*"Unknown terminal"*) return 0 ;; esac; return 1; }

_orca_term_list() {
  _orca_json terminal list | jq -r '.result.terminals[]? |
    [.handle, (.title // ""), (.worktreePath // ""), (if .lastOutputAt then ((.lastOutputAt/1000)|floor|tostring) else "-" end)] | @tsv'
}
_orca_term_read_screen() {
  local out rc; out="$(_orca_json terminal read --terminal "$1" --screen --limit "${2:-40}")"
  # ok 확인과 화면 줄 내기를 jq 한 번에(ok 가 아니면 줄을 내지 않고 7 로 끝난다 — 잘못된 JSON 도 0 이 아니므로 같은 길)
  printf '%s' "$out" | jq -r 'if (.ok // false) == true then .result.terminal.tail[]? else ("" | halt_error(7)) end' 2>/dev/null; rc=$?
  if [ "$rc" != 0 ]; then _orca_stale "$out" && return 3; return 4; fi
}
_orca_term_wait_idle() {
  local out; out="$(_orca_json terminal wait --terminal "$1" --for tui-idle --timeout-ms "$2")"
  if [ "$(printf '%s' "$out" | jq -r '.ok // false')" != "true" ]; then
    if _orca_stale "$out"; then echo stale; else echo timeout; fi; return 0
  fi
  if [ "$(printf '%s' "$out" | jq -r '.result.wait.satisfied // false')" = "true" ]; then echo satisfied; else echo timeout; fi
}
_orca_term_send() {
  local h="$1" text="$2"; shift 2
  local args=(terminal send --terminal "$h" --text "$text")
  while [ $# -gt 0 ]; do
    case "$1" in --enter) args+=(--enter) ;; --wait-submit) args+=(--wait-submit "$2"); shift ;; esac; shift
  done
  local out; out="$(_orca_json "${args[@]}")"
  if [ "$(printf '%s' "$out" | jq -r '.ok // false')" != "true" ]; then
    if _orca_stale "$out"; then echo stale; else echo "error $(printf '%s' "$out" | jq -r '.error.message // .error // "unknown"' | head -1)"; fi
    return 0
  fi
  # 결과 형식은 orca 버전에 따라 다르므로 단계 이름을 글자로 찾는다(가장 앞선 단계를 낸다).
  case "$out" in
    *turn_started*|*turnStarted*) echo turn_started ;;
    *'"submitted"'*|*submitted*true*) echo submitted ;;
    *) echo accepted ;;
  esac
}
# 키 이름 → 원시 바이트(Up=ESC [A · Down=ESC [B · Tab · Enter=CR · Esc=ESC · 1~9). 목록 밖이면 rc 1
_term_key_bytes() {
  case "$1" in
    Up) printf '\033[A' ;; Down) printf '\033[B' ;; Tab) printf '\t' ;; Enter) printf '\r' ;; Esc) printf '\033' ;;
    [1-9]) printf '%s' "$1" ;;
    *) return 1 ;;
  esac
}
# 키 전체를 한 번의 terminal send 로(Enter 옵션 없이). 키 하나라도 목록 밖이면 아무것도 보내지 않고 `error bad-key`
_orca_term_send_keys() {
  local h="$1" b="" k; shift
  for k in "$@"; do b="$b$(_term_key_bytes "$k")" || { echo "error bad-key"; return 0; }; done
  [ -n "$b" ] || { echo "error bad-key"; return 0; }
  _orca_term_send "$h" "$b"
}
_orca_term_close() {
  local out; out="$(_orca_json terminal close --terminal "$1" --tab)"
  if [ "$(printf '%s' "$out" | jq -r '.ok // false')" = "true" ]; then echo closed; elif _orca_stale "$out"; then echo stale; else echo "error"; fi
}

# ---------- tmux (뼈대: handle = tmux pane id) ----------
_tmux_term_list() { tmux list-panes -a -F $'#{pane_id}\t#{pane_title}\t#{pane_current_path}\t-' 2>/dev/null; }
_tmux_term_read_screen() { tmux capture-pane -p -t "$1" 2>/dev/null | tail -n "${2:-40}" || return 3; }
_tmux_term_wait_idle() {
  # tmux 에는 tui-idle 이 없다: 화면이 2초 동안 그대로이고 'esc to interrupt' 가 없으면 idle 로 본다.
  local end=$(( $(date +%s) + $2 / 1000 )) a b
  while [ "$(date +%s)" -le "$end" ]; do
    a="$(tmux capture-pane -p -t "$1" 2>/dev/null)" || { echo stale; return 0; }
    sleep 2; b="$(tmux capture-pane -p -t "$1" 2>/dev/null)"
    if [ "$a" = "$b" ] && ! printf '%s' "$b" | grep -q 'esc to interrupt'; then echo satisfied; return 0; fi
  done
  echo timeout
}
_tmux_term_send() {
  local h="$1" text="$2"; shift 2
  tmux send-keys -t "$h" -l "$text" 2>/dev/null || { echo stale; return 0; }
  case " $* " in *" --enter "*) tmux send-keys -t "$h" Enter ;; esac
  echo accepted
}
_tmux_term_close() { tmux kill-pane -t "$1" 2>/dev/null && echo closed || echo stale; }
_tmux_term_send_keys() {  # 이름 키를 send-keys 한 번에(Esc → Escape)
  local h="$1" k a=(); shift
  for k in "$@"; do
    case "$k" in Esc) a+=(Escape) ;; Up|Down|Tab|Enter|[1-9]) a+=("$k") ;; *) echo "error bad-key"; return 0 ;; esac
  done
  [ "${#a[@]}" -gt 0 ] || { echo "error bad-key"; return 0; }
  tmux send-keys -t "$h" "${a[@]}" 2>/dev/null || { echo stale; return 0; }
  echo accepted
}

# ---------- 공개 함수 ----------
term_list()        { if _jsb_on TERM; then _jsb_call term term_list "$@"; return; fi; _term_be; "_${_TB}_term_list" "$@"; }
term_read_screen() { if _jsb_on TERM; then _jsb_call term term_read_screen "$@"; return; fi; _term_be; "_${_TB}_term_read_screen" "$@"; }
term_wait_idle()   { if _jsb_on TERM; then _jsb_call term term_wait_idle "$@"; return; fi; _term_be; "_${_TB}_term_wait_idle" "$@"; }
term_send()        { if _jsb_on TERM; then _jsb_call term term_send "$@"; return; fi; _term_be; "_${_TB}_term_send" "$@"; }
term_close()       { if _jsb_on TERM; then _jsb_call term term_close "$@"; return; fi; _term_be; "_${_TB}_term_close" "$@"; }
# term_send_keys <h> <키 이름…> — 확인·선택 창에 키(Up·Down·Tab·Enter·Esc·1~9)를 한 번에 넣는다(콘솔 키 입력, contract §4.1).
#   stdout: accepted|submitted|turn_started · stale(넣지 못함이 확실) · `error <사유>`(bad-key 는 아무것도 보내지 않음)
term_send_keys()   { if _jsb_on TERM; then _jsb_call term term_send_keys "$@"; return; fi; _term_be; "_${_TB}_term_send_keys" "$@"; }
