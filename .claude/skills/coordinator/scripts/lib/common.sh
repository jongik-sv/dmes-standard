#!/usr/bin/env bash
# 조정자 스크립트 공통 함수. 정본 사양: ../../references/contract.md §1·§3.1
# source 로만 쓴다. 설정 = 기본값(COORD_DEFAULTS) * <repo>/.coord.json * <repo>/.coord.local.json (jq 깊은 병합).

COORD_DEFAULTS='{
  "integration_branch": "dev",
  "git_bin": "git",
  "state_dir": "~/.coord",
  "terminal_backend": "orca",
  "coordinator": {"model": "opus", "effort": "medium"},
  "launch": {"claude": "claude", "glm": "glm", "opencode": "opencode --standalone"},
  "heavy": {"script": null, "measure_dir": "~/.dflow/locks/heavy-measure",
            "load_soft": 1.2, "load_hard": 2.0, "load_release": 0.8, "measure_quiet": 0.5},
  "usage": {"sources": [{"kind": "cache", "path": "/tmp/claude-usage-cache.json"},
                        {"kind": "coord-dump", "path": "~/.coord/ctx"},
                        {"kind": "limits-dir", "path": "~/.dflow/limits"}],
            "max_age_min": 30,
            "bands": {"Y": {"five": 60, "week": 70}, "O": {"five": 80, "week": 85}, "R": {"five": 95, "week": 95}},
            "week_pace": true},
  "compact": {"threshold_pct": 40, "threshold_tokens": null,
              "by_window": {"1000000": {"pct": 40}, "200000": {"pct": 70}},
              "hard_pct": 70, "cooldown_min": 30, "default_window": 200000, "wait_max_min": 10},
  "idle": {"idle_min": 5, "cooldown_min": 15, "confirm_gap_min": 2, "bg_recent_min": 10, "stall_max_min": 90},
  "stall": {"quiet_min": 20},
  "tick": {"cron": "7,27,47 * * * *"},
  "workflow": {"agents_by_band": {"G": 3, "Y": 2, "O": 1, "R": 0},
               "model_table": [
                 {"stage": "단순 시험 실행·결과 확인·기계적 치환", "size": "*", "model": "haiku", "effort": "low"},
                 {"stage": "조사·위치 찾기·문서 갱신", "size": "*", "model": "sonnet", "effort": "medium"},
                 {"stage": "구현·수정·특성 테스트 작성", "size": "S/M", "model": "sonnet", "effort": "high"},
                 {"stage": "구현·수정·특성 테스트 작성", "size": "L·동시성·트랜잭션·원인 모를 결함", "model": "opus", "effort": "high"},
                 {"stage": "리뷰(동작 보존 판정)", "size": "S", "model": "sonnet", "effort": "high"},
                 {"stage": "리뷰(동작 보존 판정)", "size": "M/L", "model": "opus", "effort": "high"},
                 {"stage": "보안·트랜잭션 정합성 판정", "size": "*", "model": "opus", "effort": "xhigh"}],
               "escalation": {"ladder": [{"model": "sonnet", "effort": "medium"},
                                         {"model": "sonnet", "effort": "high"},
                                         {"model": "opus", "effort": "high"}],
                              "allow_xhigh": false, "max_attempts": 3, "env_retry": 1}},
  "glm": {"max_sessions": 1, "timeout_s": 10},
  "search": {"command": "agy -p {prompt} --print-timeout {timeout}s --disable-slash-commands", "timeout_s": 240},
  "approvals": {"auto_allow": ["read", "status"],
                "auto_allow_spawned": ["read", "status", "edit-own", "commit-own", "heavy-build"]},
  "restart_rules": [],
  "records_check": false,
  "integration_check": "",
  "claude_projects_dir": "~/.claude/projects",
  "sessions_dir": "~/.claude/sessions",
  "tasks_root": null,
  "wake_targets": null
}'

COORD_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COORD_SCRIPTS_DIR="$(dirname "$COORD_LIB_DIR")"

coord_log() { printf '%s\n' "$*" >&2; }
coord_die() { local rc="$1"; shift; coord_log "$*"; exit "$rc"; }

command -v jq >/dev/null 2>&1 || coord_die 4 "jq 가 필요하다"

coord_expand() { local p="$1"; case "$p" in "~") p="$HOME" ;; "~/"*) p="$HOME/${p#\~/}" ;; esac; printf '%s' "$p"; }

coord_repo() {
  if [ -n "${COORD_REPO:-}" ]; then printf '%s' "$COORD_REPO"; return; fi
  local common; common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 1
  dirname "$common"
}

_COORD_CFG=""
coord_cfg_all() {
  if [ -z "$_COORD_CFG" ]; then
    local repo shared local_ files
    repo="$(coord_repo 2>/dev/null || true)"
    shared="$repo/.coord.json"; local_="$repo/.coord.local.json"
    files=()
    [ -n "$repo" ] && [ -f "$shared" ] && files+=("$shared")
    [ -n "$repo" ] && [ -f "$local_" ] && files+=("$local_")
    if [ "${#files[@]}" -gt 0 ]; then
      _COORD_CFG="$( { printf '%s' "$COORD_DEFAULTS"; cat "${files[@]}"; } | jq -cs 'reduce .[] as $x ({}; . * $x)')" \
        || coord_die 3 "설정 파일 JSON 오류: ${files[*]}"
    else
      _COORD_CFG="$(printf '%s' "$COORD_DEFAULTS" | jq -c .)"
    fi
  fi
  printf '%s' "$_COORD_CFG"
}
# 값(문자열은 따옴표 없이). null·없음은 빈 줄.
coord_cfg() { coord_cfg_all | jq -r "($1) // empty | if type==\"string\" or type==\"number\" or type==\"boolean\" then tostring else tojson end"; }
coord_cfg_json() { coord_cfg_all | jq -c "($1)"; }

coord_state_root() { coord_expand "$(coord_cfg .state_dir)"; }
coord_run_id() {
  if [ -n "${1:-}" ]; then printf '%s' "$1"; return; fi
  if [ -n "${COORD_RUN:-}" ]; then printf '%s' "$COORD_RUN"; return; fi
  local cur; cur="$(coord_state_root)/current"
  [ -f "$cur" ] && head -1 "$cur" && return
  return 1
}
coord_run_dir() {
  local id; id="$(coord_run_id "${1:-}")" || coord_die 3 "현재 회차가 없다(coord-state.sh init 먼저)"
  printf '%s/%s' "$(coord_state_root)" "$id"
}
coord_state_file() { printf '%s/state.json' "$(coord_run_dir "${1:-}")"; }
# 현재 state.json 에 jq 적용(없으면 빈 출력, rc 3)
coord_state() { local f; f="$(coord_state_file)" || return 3; [ -f "$f" ] || return 3; jq -r "$1" "$f"; }

coord_now_epoch() { date +%s; }
coord_now_iso() { local s; s="$(date +%Y-%m-%dT%H:%M:%S%z)"; printf '%s:%s' "${s%??}" "${s: -2}"; }
coord_epoch_to_hm() { date -r "$1" +%H:%M 2>/dev/null || date -d "@$1" +%H:%M; }
# ISO 8601(+09:00·Z·소수초 허용) → epoch. 실패하면 빈 출력.
coord_iso_to_epoch() {
  local iso="$1" base tz
  [ -z "$iso" ] || [ "$iso" = "null" ] && return 0
  base="${iso%%[.+Z]*}"; base="${base%-[0-9][0-9]:[0-9][0-9]}"
  case "$iso" in
    *Z) tz="+0000" ;;
    *[+-][0-9][0-9]:[0-9][0-9]) tz="${iso: -6}"; tz="${tz/:/}" ;;
    *) tz="$(date +%z)" ;;
  esac
  date -j -f '%Y-%m-%dT%H:%M:%S%z' "${base}${tz}" +%s 2>/dev/null || date -d "$iso" +%s 2>/dev/null || true
}
coord_file_mtime() { stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null; }

coord_lock() {
  local d="$1.lock" i=0
  while ! mkdir "$d" 2>/dev/null; do
    i=$((i + 1)); [ "$i" -ge 300 ] && { coord_log "잠금 실패: $d"; return 1; }
    sleep 0.1
  done
}
coord_unlock() { rmdir "$1.lock" 2>/dev/null || true; }

coord_git() { local g; g="$(coord_cfg .git_bin)"; "${g:-git}" "$@"; }

coord_cpus() { sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 1; }
coord_load1() { sysctl -n vm.loadavg 2>/dev/null | awk '{print $2}' || awk '{print $1}' /proc/loadavg; }

# 화면 글에서 확인 창·질문 창 종류를 판정(없으면 빈 출력). stdin = 화면.
coord_screen_prompt_kind() {
  # 창은 화면 아래에 그려지므로 마지막 30줄만 본다(대화 기록 속 같은 문구에 속지 않게).
  local s; s="$(tail -30)"
  case "$s" in
    *"trust the files in this folder"*|*"one you trust"*) echo trust ;;
    *"What do you want to do?"*"Wait for limit to reset"*|*"What do you want to do?"*"Wait here, then continue"*|*"Usage limit reached"*"Stop and wait"*) echo usage-limit ;;
    *"Do you want to proceed?"*|*"will automatically deny this request"*|*"Esc to cancel · Tab to amend"*) echo permission ;;
    *"Enter to select"*|*"↑/↓ to navigate"*|*"Arrow keys to navigate"*) echo question ;;
    *"❯ 1."*) echo choice ;;
    *) ;;
  esac
}

# ---------- 게이트·감지·실행 스크립트용(추가) ----------
# 현재 회차 state.json 이 있으면 0(조용히 판정, 회차 없음 메시지를 내지 않는다).
coord_has_run() {
  local id; id="$(coord_run_id 2>/dev/null)" || return 1
  [ -n "$id" ] && [ -f "$(coord_state_root)/$id/state.json" ]
}
# 레인 값 읽기: coord_lane_get <레인> <jq 하위경로 예: .session.handle>. 없거나 null 이면 빈 줄. 회차 없으면 rc 3.
coord_lane_get() {
  coord_has_run || return 3
  jq -r --arg l "$1" "(.lanes[\$l]${2:-}) // empty | if type==\"string\" or type==\"number\" or type==\"boolean\" then tostring else tojson end" \
    "$(coord_state_file)"
}
# 사람이 읽을 셸 인용(작은따옴표). bash 3.2 의 printf %q 는 한글을 깨뜨려 쓰지 않는다.
coord_q() {
  local a out="" sq="'" esc="'\\''"
  for a in "$@"; do
    case "$a" in
      ''|*[!A-Za-z0-9_./:=@%+,-]*) out="$out'${a//$sq/$esc}' " ;;
      *) out="$out$a " ;;
    esac
  done
  printf '%s' "${out% }"
}
# 부작용 명령 실행. COORD_DRY=1 이면 stderr 에 `DRY <명령>` 만 찍고 rc 0.
coord_do() {
  if [ "${COORD_DRY:-0}" = 1 ]; then coord_log "DRY $(coord_q "$@")"; return 0; fi
  "$@"
}
# 상태 쓰기는 늘 coord-state.sh 로. COORD_DRY=1 이면 DRY 로 찍기만, 스크립트·회차가 없으면 stderr 에 알리고 건너뛴다.
coord_state_call() {
  local cs="$COORD_SCRIPTS_DIR/coord-state.sh"
  if [ "${COORD_DRY:-0}" = 1 ]; then coord_log "DRY coord-state.sh $(coord_q "$@")"; return 0; fi
  [ -f "$cs" ] || { coord_log "coord-state.sh 없음 — 상태 기록 건너뜀: $*"; return 0; }
  coord_has_run || { coord_log "회차 없음 — 상태 기록 건너뜀: $*"; return 0; }
  bash "$cs" "$@" >/dev/null
}
# heavy.sh 경로(설정 heavy.script, 리포 기준 상대 허용). 없으면 rc 1.
coord_heavy_script() {
  local p; p="$(coord_cfg .heavy.script)"; [ -n "$p" ] || return 1
  p="$(coord_expand "$p")"
  case "$p" in /*) ;; *) p="$(coord_repo)/$p" ;; esac
  [ -f "$p" ] || return 1
  printf '%s' "$p"
}
# 프로세스 시작 시각(pid 재사용 판정용, heavy.sh 의 pstart 와 같은 형식).
coord_pstart() { LC_ALL=C ps -o lstart= -p "$1" 2>/dev/null | sed 's/^ *//;s/ *$//'; }

# ---------- 상태 수집·판정 스크립트용(추가) ----------
# epoch 초 → ISO 8601(+09:00 꼴). 빈 값·실패면 빈 출력.
coord_epoch_to_iso() {
  [ -n "${1:-}" ] && [ "$1" != "null" ] || return 0
  local s; s="$(date -r "$1" +%Y-%m-%dT%H:%M:%S%z 2>/dev/null || date -d "@$1" +%Y-%m-%dT%H:%M:%S%z 2>/dev/null)"
  [ -n "$s" ] && printf '%s:%s' "${s%??}" "${s: -2}"
  return 0
}
# cwd 가 리포 밖(예: ~)이어도 스크립트가 든 리포를 쓰게 COORD_REPO 를 채운다. 이미 있거나 cwd 가 리포면 그대로.
coord_default_repo() {
  [ -n "${COORD_REPO:-}" ] && return 0
  git rev-parse --git-common-dir >/dev/null 2>&1 && return 0
  local common; common="$(cd "$COORD_SCRIPTS_DIR" && git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 0
  [ -n "$common" ] && { COORD_REPO="$(dirname "$common")"; export COORD_REPO; }
  return 0
}
# 레인 워크트리 값(리포 기준 상대 허용) → 절대경로(끝 / 없음). 빈 값이면 빈 출력.
coord_wt_abs() {
  local p; p="$(coord_expand "${1:-}")"
  [ -n "$p" ] && [ "$p" != "null" ] || return 0
  case "$p" in /*) ;; *) p="$(coord_repo)/$p" ;; esac
  p="${p%/}"; p="${p%/.}"
  printf '%s' "$p"
}
# <경로> 가 <워크트리> 안이면 0. 워크트리가 메인 체크아웃이면 그 아래 .claude/worktrees/ 는 다른 워크트리라 뺀다.
coord_path_in_wt() {
  local p="${1%/}" w="${2%/}" repo
  [ -n "$p" ] && [ -n "$w" ] || return 1
  case "$p/" in "$w/"*) ;; *) return 1 ;; esac
  repo="$(coord_repo 2>/dev/null)"
  if [ -n "$repo" ] && [ "$w" = "${repo%/}" ]; then
    case "$p/" in "$w/.claude/worktrees/"*) return 1 ;; esac
  fi
  return 0
}
coord_pid_alive() { [ -n "${1:-}" ] && [ "$1" != 0 ] && [ "$1" != null ] && kill -0 "$1" 2>/dev/null; }
# pid 콤마 목록 → 한 줄에 `<pid>\t<cwd>`(lsof).
coord_proc_cwds() {
  [ -n "${1:-}" ] || return 0
  lsof -a -d cwd -p "$1" -Fpn 2>/dev/null | awk '/^p/ { p = substr($0, 2) } /^n/ { print p "\t" substr($0, 2) }'
}
# 세션 상태 json 경로: <sessions_dir>/<pid>.json 이 있으면 그것(/clear 로 sessionId 가 바뀌어도 pid 가 정본),
# 없으면 sessionId 가 같은 파일을 찾는다. 못 찾으면 rc 1.
coord_session_file() {
  local pid="${1:-}" sid="${2:-}" d f
  d="$(coord_expand "$(coord_cfg .sessions_dir)")"
  if [ -n "$pid" ] && [ "$pid" != 0 ] && [ "$pid" != null ] && [ -f "$d/$pid.json" ]; then printf '%s' "$d/$pid.json"; return 0; fi
  [ -n "$sid" ] && [ "$sid" != null ] || return 1
  for f in "$d"/*.json; do
    [ -f "$f" ] || continue
    if [ "$(jq -r '.sessionId // empty' "$f" 2>/dev/null)" = "$sid" ]; then printf '%s' "$f"; return 0; fi
  done
  return 1
}
# 레인 워크트리를 cwd 로 둔 빌드·시험 프로세스(S7 라). 한 줄에 `<pid>\t<이름>`.
# 이름: GradleWrapperMain·gradle·vitest·playwright·tsc. 서버(bootRun)·공용 데몬(GradleDaemon)은 뺀다.
coord_wt_procs() {
  local wt="$1" cand pids
  [ -n "$wt" ] || return 0
  cand="$(ps -axo pid=,args= 2>/dev/null | awk '
    { a = $0; sub(/^ *[0-9]+ +/, "", a); n = "" }
    a ~ /^([^ ]*\/)?awk / || a ~ /bootRun|GradleDaemon/ { next }
    a ~ /GradleWrapperMain/ { n = "GradleWrapperMain" }
    n == "" && a ~ /(^|[\/ ])gradlew?( |$)|org\.gradle\.launcher\.GradleMain/ { n = "gradle" }
    n == "" && a ~ /vitest/ { n = "vitest" }
    n == "" && a ~ /playwright/ && a !~ /mcp/ { n = "playwright" }
    n == "" && a ~ /(^|[\/ ])tsc( |$)|typescript\/bin\/tsc/ { n = "tsc" }
    n != "" { print $1 "\t" n }')"
  [ -n "$cand" ] || return 0
  pids="$(printf '%s\n' "$cand" | cut -f1 | paste -sd, -)"
  coord_proc_cwds "$pids" | while IFS="$(printf '\t')" read -r p cwd; do
    coord_path_in_wt "$cwd" "$wt" || continue
    printf '%s\n' "$cand" | awk -F'\t' -v p="$p" '$1 == p'
  done
}
# heavy.sh snapshot 글(인자)에서 cwd 가 워크트리 안인 RUN 줄이 있으면 0.
coord_heavy_run_in_wt() {
  local wt="$1" snap="${2:-}" tag cwd
  [ -n "$wt" ] && [ -n "$snap" ] || return 1
  while IFS="$(printf '\t')" read -r tag _ _ _ cwd _; do
    [ "$tag" = RUN ] || continue
    coord_path_in_wt "$cwd" "$wt" && return 0
  done <<HEAVY_EOF
$snap
HEAVY_EOF
  return 1
}
# 레인 백그라운드 신호(S7). 인자: <워크트리 절대경로> <session-id> <heavy snapshot 글(없으면 빈 값)>.
# stdout: 콤마 목록(heavy·tasks·프로세스 이름) 또는 빈 출력. coord-status.sh 와 idle-check.sh 가 같이 쓴다.
coord_bg_signals() {
  local wt="$1" sid="${2:-}" snap="${3:-}" out="" root mins names
  coord_heavy_run_in_wt "$wt" "$snap" && out="heavy"
  root="$(coord_cfg .tasks_root)"
  if [ -n "$root" ] && [ -n "$sid" ] && [ "$sid" != null ]; then
    root="$(coord_expand "$root")"; mins="$(coord_cfg .idle.bg_recent_min)"
    if [ -n "$(find "$root"/*/"$sid"/tasks -maxdepth 1 -name '*.output' -mmin "-${mins:-10}" 2>/dev/null | head -1)" ]; then
      out="${out:+$out,}tasks"
    fi
  fi
  names="$(coord_wt_procs "$wt" | cut -f2 | awk '!s[$0]++' | paste -sd, -)"
  [ -n "$names" ] && out="${out:+$out,}$names"
  printf '%s' "$out"
}
# coord_iso_to_epoch 과 같되 초가 없는 꼴(2026-10-04T13:00+09:00)도 받는다. 실패하면 빈 출력.
coord_iso_to_epoch_loose() {
  local e; e="$(coord_iso_to_epoch "${1:-}")"
  if [ -z "$e" ] && [ -n "${1:-}" ]; then
    e="$(coord_iso_to_epoch "$(printf '%s' "$1" | sed -E 's/^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2})([^:0-9]|$)/\1:00\2/')")"
  fi
  printf '%s' "$e"
}
