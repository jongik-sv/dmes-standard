#!/usr/bin/env bash
# 터미널 어댑터. 정본 사양: ../../references/contract.md §3.2
# 공개 함수 다섯 개만 쓴다: term_list · term_read_screen · term_wait_idle · term_send · term_close.
# 백엔드는 설정 terminal_backend(orca 기본, tmux 는 뼈대). common.sh 를 먼저 source 해야 한다.

_term_backend() { local b; b="$(coord_cfg .terminal_backend)"; printf '%s' "${b:-orca}"; }

# ---------- orca ----------
_orca_json() { orca "$@" --json 2>/dev/null; }
_orca_stale() { case "$1" in *terminal_handle_stale*|*"not found"*|*"Unknown terminal"*) return 0 ;; esac; return 1; }

_orca_term_list() {
  _orca_json terminal list | jq -r '.result.terminals[]? |
    [.handle, (.title // ""), (.worktreePath // ""), (if .lastOutputAt then ((.lastOutputAt/1000)|floor|tostring) else "-" end)] | @tsv'
}
_orca_term_read_screen() {
  local out; out="$(_orca_json terminal read --terminal "$1" --screen --limit "${2:-40}")"
  if [ "$(printf '%s' "$out" | jq -r '.ok // false')" != "true" ]; then _orca_stale "$out" && return 3; return 4; fi
  printf '%s' "$out" | jq -r '.result.terminal.tail[]?'
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

# ---------- 공개 함수 ----------
term_list()        { "_$(_term_backend)_term_list" "$@"; }
term_read_screen() { "_$(_term_backend)_term_read_screen" "$@"; }
term_wait_idle()   { "_$(_term_backend)_term_wait_idle" "$@"; }
term_send()        { "_$(_term_backend)_term_send" "$@"; }
term_close()       { "_$(_term_backend)_term_close" "$@"; }
