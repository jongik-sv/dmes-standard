# /dflow-team 백엔드: spawn·정리 명령 정본

> **윈도우 = Orca 백엔드 전제**: 윈도우(Git Bash) 팀장은 **pane(Orca)** 로 돌림(Orca 안에서 시작).
> - tmux 판은 MSYS2 tmux 가 Git Bash 에서 도는지 검증한 적 없음(「플랫폼 차이」 절, 검증 전까지는 「돌 수도 있다」) → 윈도우 지원 경로 아님.
> - Orca·tmux 둘 다 없으면 `NO_TMUX` 로 시작 거부.
> - 윈도우에서는 `CLAUDE_PID`(팀장 세션 PID)도 설정 권장(없으면 `heavy.mjs` 가 `HEAVY_WARN` 출력).

SKILL.md 「0. 환경 감지」 가 백엔드 선택: 팀장이 Orca 안이면 **pane(Orca)**, 밖이면 **pane(tmux)**.
- 워커 프롬프트·`.result` 계약·`/dflow-dev --worker` = 두 백엔드 같음. 가르는 것 = 아래 차이표뿐.
- 근거·이력 = `rationale.md` 「백엔드(backends.md)」.

> 윈도우: 아래 `jq` 예시를 Bash 로 직접 칠 때는 같은 호출 맨 앞에 `export PATH="$PWD/.claude/skills/_shared/bin:$PATH";` 추가(`_shared/platform-support.md` 「문서 속 인라인 jq」).

**읽는 법**(필요한 절만 Bash `sed` 로 읽음):
- spawn = 「입장 제어」~「폴더 신뢰 확인」(tmux). Orca 는 거기에 「pane(Orca)」 추가.
- 회수·답·결과 줄 폴백 = 「생존·화면·답·회수」「결과 줄과 죽은 pane 폴백」. 정리 = 「고아 정리 규칙」.
```bash
sed -n '/^## 입장 제어/,/^### 팀원 환경을 벗기는 이유/p' .claude/skills/dflow-team/references/backends.md   # spawn(tmux·Orca 공통 준비 블록까지)
sed -n '/^## pane(Orca)/,/^## 고아 정리 규칙/p' .claude/skills/dflow-team/references/backends.md           # Orca 는 이것도
```

## 차이표

| 항목 | pane(tmux) | pane(Orca) |
|---|---|---|
| 팀원 정체 | 팀장이 tmux pane 에 띄운 대화형 claude 메인 에이전트(permission 확인 생략 모드) | Orca 탭의 claude 메인 에이전트(permission 확인 생략 모드) |
| worktree | 팀장이 `git worktree add --detach` 로 `<MAIN>/.claude/worktrees/dflow-<id8>` 생성, 기점 `origin/<기본브랜치>`. branch 안 만듦 | **같음**(「팀원 워크트리 준비」 = 두 백엔드 공통). 옛 방식(`orca worktree create`)이 리포 루트 바로 아래 `<MAIN>/dflow-<id8>` 에 만든 worktree 남아 있을 수 있음. 구분 = 「고아 정리 규칙」 전환 규칙(전제 검사 exclude `/dflow-*/` 가 가림) |
| 기상 신호 | 감시 루프의 `RESULT_READY`·`PANE_DEAD` | 감시 루프의 `RESULT_READY` |
| `blocked` 이후 | 팀원은 pane 에서 멈춰 기다림 | 팀원은 탭에서 멈춰 기다림 |
| 슬롯 점유 | `blocked` 동안 슬롯 계속 점유 | 같음 |
| 사람의 답 | 그 pane 에 직접 입력, 또는 팀장이 `send-keys` 로 입력 | 그 팀원 탭에 직접 입력 |
| 회수 | 결과 줄 처리 뒤 `kill-pane -t <pane>` | 결과 줄 처리 뒤 `orca terminal close --terminal <handle> --tab --json`(핸들 `-` 면 건너뜀) |
| 팀장 세션이 죽으면 | 팀원 생존(tmux 서버가 따로 돎). 새 팀장이 재구성에서 `.dflow-pane` 과 `#{pane_start_path}` 로 흡수 | 팀원 생존 |
| 정리 | `git worktree remove --force <경로>` | 새 방식(git worktree add)이면 tmux 와 같음. 옛 방식(`orca worktree create`, 리포 루트 worktree)만 `orca worktree rm --worktree path:<경로>`(「pane(Orca)」 「정리」 전환 규칙) |
| 팀원 screen | `capture-pane -p -t <pane>`(보고용), `-J -S -`(결과 줄 폴백) | `orca terminal read`(보고용). 신뢰 확인 판별에도 사용(「pane(Orca)」) |
| git 호출 | `command -v git` 절대경로 | 같음(두 백엔드 공통) |

## 입장 제어

**모든 spawn 의 첫 단계**(두 백엔드 공통). 새 작업·재개·재투입·해소·차단기 시험 spawn 모두 통과.
- 집행·`CAPACITY_*` 판정 정본 = SKILL.md 「5-3. 입장 제어」, 기준값·알림 문구 = `references/spawn.md` 「5-3. 입장 제어: 알림·기준값」. 집행 = 이 블록 한 곳. 팀장 체크아웃에서 돎.
```bash
CAP=$(node .claude/skills/dflow-team/scripts/capacity.mjs --state "$(git rev-parse --git-path dflow-team.capacity)"); echo "$CAP"
case "$CAP" in CAPACITY_LOW*) echo SPAWN_DEFERRED_CAPACITY; exit 0 ;; esac
```
- `SPAWN_DEFERRED_CAPACITY` 나오면 **이번 기상에 아무것도 띄우지 않음.**
  - 블록이 그 자리에서 끝남 → worktree·pane·포인터 하나도 안 만듦.
  - 후보는 원래 줄(대기 큐·재개 목록·해소 큐·재시작 대기)에 그대로 둠. `team.spawn`·`team.result` 안 씀.
  - 한 후보가 막히면 같은 기상의 나머지 후보도 안 띄움.
- `CAPACITY_OK`·`CAPACITY_UNKNOWN` 이면 이어서 띄움. 출력 줄 끝이 `notify=1` 이면 `references/spawn.md` 「5-3. 입장 제어: 알림·기준값」 의 한 줄 알림.
- 새 작업·해소 spawn 블록(아래 「팀원 워크트리 준비」, 두 백엔드 공통)은 이 두 줄로 시작 → 따로 부르지 않음.
  - merge-conflict.md 「2」 해소 spawn 도 그 블록을 그대로 돌림 → 여기에 걸림(tmux·Orca 모두).
- 블록을 통째로 안 도는 자리 = 재개(`references/resume.md` 0항)·재투입(restart.md 「재투입」). 이 블록을 먼저 따로 돎(있는 worktree 이어 쓰므로 준비 블록 전체 재실행 안 함).
- 주간 사용량(`capacity.mjs usage`)은 이 블록이 아님. 새 작업 spawn(SKILL.md 「5」 0항)만 이 블록 전에 따로 확인.

## pane(tmux)

팀원 = 팀장이 전용 tmux 소켓(`-L dflow`) pane 에 띄운 **대화형** claude 메인 에이전트. Agent 도구 서브에이전트로 안 띄움(SKILL.md 머리말 「제1 제약」). 팀장 세션이 죽어도 생존.

### 진짜 tmux 찾기

Orca 는 PATH 앞에 tmux shim(`orca agent-teams-tmux` 로 위임하는 셸 스크립트)을 끼움.
- shim 은 명령 부분집합만 처리하고 나머지는 `unsupported command` 로 거부.
- **`tmux -V` 는 거짓 버전을 답함** → 버전으로 가릴 수 없음.

```bash
find_tmux() {
  for c in /opt/homebrew/bin/tmux /usr/local/bin/tmux /usr/bin/tmux "$(command -v tmux 2>/dev/null)"; do
    [ -n "$c" ] && [ -x "$c" ] || continue
    grep -q 'agent-teams-tmux' "$c" 2>/dev/null && continue
    "$c" -L "dflowprobe$$" has-session -t __probe__ 2>&1 | grep -qi 'unsupported command' && continue
    printf '%s\n' "$c"; return 0
  done
  return 1
}
```

- 두 겹 필터: 스크립트 내용 `agent-teams-tmux`, 실제 명령 `unsupported command`.
- probe 소켓 이름에 `$$` 를 붙여 운영 소켓 `dflow` 를 안 건드림.
- 찾은 절대경로를 `TM` 에 담아 이후 모든 호출에 사용(절대경로로 부르면 Orca 안에서도 shim 우회).

### 팀원 워크트리 준비

**spawn**: worktree 준비 = 팀장 체크아웃에서 Bash 호출 1회.
- **이 블록은 `chmod +x "$WT/.dflow-run"` 줄까지 두 백엔드가 글자 그대로 같음.** Orca(「pane(Orca)」)는 같은 블록을 그 줄까지 그대로 돌고 아래만 `orca terminal create` 로 다르게 이음.
- `<모델 플래그>`: `MODEL` 이 `opus`·`sonnet` 이면 `--model opus`·`--model sonnet`, `default` 면 빈 값.
- `<EFFORT>`: SKILL.md 「인자」 가 정한 추론 강도(기본 `high`). 팀장 세션의 `CLAUDE_EFFORT` 는 아래에서 벗겨짐 → 플래그 없으면 팀원은 그 PC 의 `effortLevel` 따름.
- 첫 두 줄 = 「입장 제어」 블록 그대로, 빼지 않음. `SPAWN_DEFERRED_CAPACITY` 로 끝나면 worktree도 pane 도(Orca 는 탭도) 안 만든 것.

```bash
CAP=$(node .claude/skills/dflow-team/scripts/capacity.mjs --state "$(git rev-parse --git-path dflow-team.capacity)"); echo "$CAP"
case "$CAP" in CAPACITY_LOW*) echo SPAWN_DEFERRED_CAPACITY; exit 0 ;; esac
TM=$(find_tmux)
WT="<MAIN>/.claude/worktrees/dflow-<id8>"
git fetch -q origin && git worktree prune && git worktree add --detach "$WT" origin/<기본브랜치> || echo SPAWN_FAILED_WORKTREE
[ -e "$WT/.dflow.local" ] || [ ! -e "<MAIN>/.dflow.local" ] || ln -s "<MAIN>/.dflow.local" "$WT/.dflow.local"
[ -e "$WT/.dflow" ] || [ ! -e "<MAIN>/.dflow" ] || ln -s "<MAIN>/.dflow" "$WT/.dflow"
[ ! -e "<MAIN>/.env" ] || [ -e "$WT/.env" ] || ln -s "<MAIN>/.env" "$WT/.env"
if [ ! -e "$WT/.claude/skills/dflow-dev/SKILL.md" ]; then
  if [ -d "$WT/.claude/skills" ] && [ ! -L "$WT/.claude/skills" ]; then
    for s in dflow-dev dflow-work; do [ -e "$WT/.claude/skills/$s" ] || ln -s "<MAIN>/.claude/skills/$s" "$WT/.claude/skills/$s"; done
  else
    mkdir -p "$WT/.claude" && ln -s "<MAIN>/.claude/skills" "$WT/.claude/skills"
  fi
fi
printf '%s\n' '<포인터 한 줄>' > "$WT/.dflow-prompt"
cat > "$WT/.dflow-run" <<'RUNEOF'
#!/bin/sh
# 팀장 세션의 흔적을 벗긴다. 근거는 아래 「팀원 환경을 벗기는 이유」.
for v in $(env | sed -n 's/^\(CLAUDE[A-Z0-9_]*\)=.*/\1/p'); do
  case "$v" in CLAUDE_CONFIG_DIR) continue ;; esac
  unset "$v"
done
if [ -n "${ORCA_AGENT_TEAMS_TEAM_ID-}" ]; then
  for v in $(env | sed -n 's/^\(ORCA_[A-Z0-9_]*\)=.*/\1/p'); do unset "$v"; done
  unset TMUX TMUX_PANE
  PATH=$(printf '%s' "$PATH" | tr ':' '\n' | grep -v 'claude-agent-teams-bin' | paste -sd: -)
  export PATH
fi
RUNEOF
if [ "${DFLOW_WORKER_PLUGINS-}" = keep ]; then
  P='{}'
else
  P='{}'
  for f in "$HOME/.claude/settings.json" "<MAIN>/.claude/settings.json" "<MAIN>/.claude/settings.local.json"; do
    [ -f "$f" ] || continue
    q=$(jq -c --argjson p "$P" \
      '$p + ((.enabledPlugins // {}) | if type == "object" then with_entries(select(.value == true) | .value = false) else {} end)' \
      "$f" 2>/dev/null) && P="$q"
  done
fi
LIM="$HOME/.dflow/limits"; mkdir -p "$LIM"
W=$(node .claude/skills/dflow-team/scripts/worker-trim.mjs "<MAIN>" "$P" "$LIM/<id8>")
printf '%s' "$W" | jq -e 'type == "object"' >/dev/null 2>&1 || W='{}'
jq -n --arg f "$LIM/<id8>.json" --argjson plugins "$P" --argjson trim "$W" \
  '{statusLine: {type: "command", command: ("jq -c \"{at: (now | floor), rate_limits: (.rate_limits // null)}\" > \"" + $f + ".tmp\" && mv -f \"" + $f + ".tmp\" \"" + $f + "\"; printf dflow")}}
   + {hooks: {PreToolUse: [{matcher: "Bash", hooks: [{type: "command", timeout: 5,
       command: "if [ -f \"${CLAUDE_PROJECT_DIR-}/.claude/skills/dflow-dev/scripts/timeout-guard.mjs\" ]; then node \"${CLAUDE_PROJECT_DIR-}/.claude/skills/dflow-dev/scripts/timeout-guard.mjs\"; else cat >/dev/null 2>&1 || :; fi"}]}]}}
   + (if ($plugins | length) > 0 then {enabledPlugins: $plugins} else {} end)
   + $trim' \
  > "$LIM/<id8>.settings.json"
cat >> "$WT/.dflow-run" <<'RUNEOF'
S="$HOME/.dflow/limits/<id8>.settings.json"; M="$HOME/.dflow/limits/<id8>.mcp.json"
if [ "${DFLOW_WORKER_MCP-}" = keep ]; then set --; else
  set -- --strict-mcp-config
  [ -f "$HOME/.dflow/limits/<id8>.chrome" ] || set -- --no-chrome "$@"
  [ -f "$M" ] && set -- --mcp-config "$M" "$@"
fi
[ -f "$S" ] && exec claude --dangerously-skip-permissions --settings "$S" "$@" --effort <EFFORT> <모델 플래그> "$(cat .dflow-prompt)"
exec claude --dangerously-skip-permissions "$@" --effort <EFFORT> <모델 플래그> "$(cat .dflow-prompt)"
RUNEOF
chmod +x "$WT/.dflow-run"
if "$TM" -L dflow has-session -t dflow 2>/dev/null; then
  PANE=$("$TM" -L dflow split-window -t dflow -c "$WT" -P -F '#{pane_id}' './.dflow-run')
else
  "$TM" -L dflow new-session -d -s dflow -n dflow -x 200 -y 60 -c "$WT" './.dflow-run'
  "$TM" -L dflow set-option -t dflow remain-on-exit on
  "$TM" -L dflow set-option -w -t dflow pane-border-status top
  "$TM" -L dflow set-option -w -t dflow pane-border-format ' #{pane_title} '
  PANE=$("$TM" -L dflow list-panes -t dflow -F '#{pane_id}' | head -1)
fi
"$TM" -L dflow set-option -p -t "$PANE" allow-set-title off
"$TM" -L dflow select-pane -t "$PANE" -T 'w<slot> · <TSK> <id8> · <작업 이름>'
"$TM" -L dflow select-layout -t dflow tiled
printf '%s\n' "$PANE" > "$WT/.dflow-pane"
cat "$WT/.dflow-pane"
```
`<id8>`·`<모델 플래그>` 는 팀장이 글자 그대로 치환(heredoc 은 따옴표로 막아 `$S`·`$HOME` 이 팀원 실행 시점에 풀림).
설정 파일 경로를 실행 시점에 다시 만들고, 없으면 `--settings` 없이 띄움(없는 설정 파일을 받으면 claude 가 곧바로 끝남).
`.dflow-run` 을 다시 쓸 때(재개·재투입) `LIM` 줄 누락 금지(경로가 비면 재시작한 팀원이 전부 첫 screen에서 죽음).

- **팀원 전용 설정(플러그인·MCP 끄기)**:
  - spawn 시점에 `~/.claude/settings.json`·`<MAIN>/.claude/settings.json`·`<MAIN>/.claude/settings.local.json` 중 있는 파일의 `enabledPlugins` 에서 값이 `true` 인 키를 모아 전부 `false` 로 덮어 `<id8>.settings.json` 에 합침.
  - 목록 하드코딩 금지(PC 마다 켜 둔 플러그인 다름). 특정 플러그인 이름을 이 문서에 안 적음. 파일이 없거나 jq 가 못 읽으면 그 파일만 건너뜀.
  - `.dflow-run` 의 두 `exec` 줄 모두 `--no-chrome --strict-mcp-config` 를 붙여 MCP 서버를 끔(claude.ai 커넥터 포함. `claude-in-chrome` 은 `--no-chrome` 으로 빠짐).
  - 예외 = `worker_keep_plugins`·`worker_keep_skills` 의 `auto` 가 만든 두 파일뿐:
    - `<id8>.mcp.json`(켜 둔 플러그인이 제공하는 MCP 서버만 — `--strict-mcp-config` 는 플러그인 MCP 까지 끔) 있으면 `--mcp-config <파일>` 을 맨 앞에 추가.
    - `<id8>.chrome`(사용자 지침이 claude-in-chrome 사용) 있으면 `--no-chrome` 제거.
  - `--mcp-config` 는 가변 인자 → 뒤의 인자까지 설정 파일 경로로 먹음. **바로 뒤에 늘 다른 옵션(`--strict-mcp-config` 등)이 오게** 맨 앞에 둠. exec 줄의 프롬프트 바로 앞에는 두지 않음.
  - **`--setting-sources` 사용 금지**(user 설정의 heartbeat 훅이 함께 빠져 좌석표가 진척을 못 봄).
  - 전역 `~/.claude/settings.json` 자체는 읽기만 하고 안 건드림.
  - 끄지 않으려면 `DFLOW_WORKER_PLUGINS=keep`(플러그인, 팀장 세션 환경에서 읽음)·`DFLOW_WORKER_MCP=keep`(MCP·`claude-in-chrome`, 팀원 실행 시점에 `.dflow-run` 이 읽음. Orca 새 탭은 로그인 셸 환경 → 셸 프로필에 export)으로 각각 되돌림.
  - 이 설정은 tmux spawn·Orca spawn·재개(`references/resume.md`)·재투입(`references/restart.md` 「재투입」) 모두 이 블록으로 얻음.
- **첫 턴 컨텍스트 줄이기(PC별 opt-in)**: `W=$(node .claude/skills/dflow-team/scripts/worker-trim.mjs …)` 가 `.dflow.local`(개인 설정. 이미 export 된 `DFLOW_WORKER_*` env 가 이김)의 네 키를 읽어 설정 조각을 냄. 블록이 그것을 맨 뒤에 덮어 합침. **키가 없으면 조각 `{}` → 종전과 똑같음.**
  | 키 | 설정에 들어가는 것 |
  |---|---|
  | `worker_keep_skills=<쉼표 목록>` | 사용자 스킬(`~/.claude/skills`) 중 목록 밖 것을 `skillOverrides` 에서 `"off"`, claude.ai 동기화 스킬을 `syncClaudeAiSkills: false` 로 숨김. 남길 것 없으면 `none`. **`auto`**(단독 또는 `auto,<이름>`)면 그 PC 의 사용자 전역 지침(`~/.claude/CLAUDE.md` 와 `@` 포함 파일)의 부정문 아닌 문장에 이름이 나오는 사용자 스킬을 남김(`WORKER_SKILLS_AUTO kept=<목록>` 한 줄). 지침을 못 읽으면 사용자 스킬을 하나도 안 끔 |
  | `worker_skills_off=<쉼표 목록>` | 그 이름들을 `skillOverrides` 에서 `"off"`(예: 안 쓰는 Claude Code 내장 스킬) |
  | `worker_keep_plugins=<쉼표 목록>` | 켜진 플러그인을 끄는 종전 규칙에서 목록의 `<이름>@<마켓>` 을 제외, claude.ai 동기화 플러그인을 `syncClaudeAiPlugins: false` 로 숨김. 남길 것 없으면 `none`. **`auto`** 면 지침에 `<이름>@<마켓>` 이 나오거나, 플러그인·plugin·MCP 가 함께 든 부정문 아닌 문장에 `<이름>` 이 나오는 켜진 플러그인을 켜 둠(`WORKER_PLUGINS_AUTO kept=<목록>`). 켜 둔 플러그인이 MCP 서버를 제공하면 `<id8>.mcp.json` 을 만들어 `--mcp-config` 로 넘김. 지침(부정문 제외)에 claude-in-chrome 이 나오면 `<id8>.chrome` 을 만들어 `--no-chrome` 제거 |
  | `worker_output_style=<값>` | `outputStyle`(예: `default`) |

  - `dflow-*` 와 대상 리포의 프로젝트 스킬(`<MAIN>/.claude/skills` 의 폴더 이름과 머리말 `name`)은 어느 목록에 적혀도 안 끔.
  - 킷이 아는 스킬 이름 = `dflow-*` 뿐. 다른 이름은 이 문서·스크립트에 안 적고 사람이 `.dflow.local` 에 적음.
  - 가리키는 스킬·플러그인·스타일 파일이 이 PC 에 없으면 `WORKER_SKILL_NOT_FOUND`·`WORKER_PLUGIN_NOT_FOUND`·`WORKER_OUTPUT_STYLE_NOT_FOUND` 한 줄만 내고 진행(스크립트는 늘 exit 0, 실패하면 `{}`).
  - **`disableBundledSkills` 사용 금지**(Workflow 도구 설명이 도리어 커짐).
  - 사용자 전역 훅(`~/.claude/settings.json` 의 heartbeat·가드 등)은 안 건드림.
  - 근거·실측 = `references/rationale.md` 「팀원 첫 턴 컨텍스트 줄이기」.
- **timeout 가드 훅**: 같은 설정 파일에 `hooks.PreToolUse`(matcher `Bash`, timeout 5)로 `node .claude/skills/dflow-dev/scripts/timeout-guard.mjs` 를 검.
  - 팀원과 그 Phase 서브에이전트가 `heavy.mjs`·`baseline.mjs run`·`gradlew`·`mvn`·`playwright test` 를 timeout 없이(또는 300000 미만으로) 부르거나 `run_in_background` 로 부르면 exit 2 로 막고 이유를 모델에게 보임(E2E 서버 start만 백그라운드 허용. `nohup` 은 예외 아님).
  - 판정 규칙 정본 = 스크립트 머리말.
  - 훅 명령은 `timeout-guard.mjs` 파일이 있을 때만 `node` 로 부르고, 없으면 입력을 버리고 통과시킴(가드가 조용히 꺼질 수 있으므로 스크립트 이름을 바꿀 때 이 문구도 함께 고침).
  - 이미 만들어 둔 `~/.dflow/limits/*.settings.json` 은 다음 spawn 때 재생성되어야 새 훅 문구가 반영됨.
  - 명령은 heartbeat 훅과 같은 가드형 → 스크립트가 없는 킷에서는 stdin 을 비우고 통과.
  - 전역 `~/.claude/settings.json` 에는 안 넣음. 근거 = `references/rationale.md`.
- **statusLine 덤프**: `--settings` 로 붙인 statusLine 이 입력 JSON 의 `.rate_limits`(구독자일 때 `five_hour`·`seven_day` 마다 `used_percentage`·`resets_at`)를 `~/.dflow/limits/<id8>.json` 에 씀.
  - 팀장은 이것으로 한도와 해제 시각을 정함(`references/restart.md` 「한도 판정」).
  - worktree 밖(`~/.dflow/limits`)에 씀(안에 쓰면 `DIRTY` 검사와 「고아 정리 규칙」 2번이 깨짐). 임시 파일에 쓰고 옮김.
  - 팀원 pane 의 statusLine 표시 = `dflow`. 두 백엔드·재개·재시작 팀원 모두 덤프를 남김.
  - 파일은 안 지움(같은 id8 을 다시 띄우면 덮어씀).
- **전용 소켓 `-L dflow`** → 팀장이 tmux 안이든 밖이든 코드 경로 하나, 사람의 tmux 세션을 안 건드림. 서버 없으면 `new-session`, 있으면 `split-window`. `-x 200 -y 60` = detached 동안의 가상 크기(`capture-pane` 이 씀).
- **pane 이름표**: `select-pane -T` 로 `w<slot> · <TSK> <id8> · <작업 이름>` 을 붙이고, `pane-border-status top`·`pane-border-format`(window 옵션 → `-w`, 세션 만들 때 한 번)으로 테두리에 표시.
- **`allow-set-title off` 를 `select-pane -T` 보다 먼저 검**(없으면 claude 가 제목을 자기 진행 표시로 덮음). pane 옵션 → `-p` 와 pane id 로 **pane 마다** 검(tmux 3.3 이상).
- `remain-on-exit on` = 죽은 pane 을 남겨 마지막 screen과 `#{pane_dead_status}` 를 읽게 함.
  - `exec` 로 셸을 claude 로 대체 → `pane_pid` 가 곧 claude.
  - 명령은 `.dflow-run`, 프롬프트는 `.dflow-prompt` 파일 경유(인용 문제 회피).
  - `claude "<프롬프트>"` 는 대화형 세션을 띄우고 그 문자열을 첫 턴으로 제출(`-p` 안 씀).
- `.dflow.local`(레거시 `.env`)·`.dflow`·스킬 링크는 팀장이 먼저 검(claude 는 시작할 때 cwd 의 `.claude/skills` 를 읽음. 워커 부트스트랩의 같은 명령은 이미 있으면 건너뜀).
  - 스킬 폴더가 실제 폴더인데 `dflow-dev` 가 없으면 스킬만 하나씩 링크(폴더째 걸면 `.claude/skills/skills` 생김).
  - 메인 체크아웃에 `.env` 있으면 함께 링크(구버전 heartbeat 훅).
  - 그 밖의 gitignore 된 심링크(예 `docs/mdm/design`)는 워커의 `deps.mjs`(dflow-dev 행 H)가 검(`DEPS_LINK <경로>`).
- Windows(Git Bash) 에서 `ln -s` 는 링크 대신 복사본을 만듦. 복사본으로도 동작(대가: 이미 뜬 팀원에는 스킬 수정이 반영 안 됨).
- `git worktree add` 실패(`SPAWN_FAILED_WORKTREE`, 대개 같은 경로 잔존) 시 띄우지 않고 경로 보고. 같은 id8 의 옛 worktree는 결과 처리가 지웠거나 `parked` 로 남음. `parked` 면 "사람 확인 필요".
- `team.spawn` 의 `worktree` = `$WT`, `handle` = `tmux:<pane_id>`(예: `tmux:%3`).
- 팀원 프로세스는 팀장 세션 안에 안 나타남(ListAgents 에 팀원도 손자도 없음. 손자는 팀원이 스스로 회수).

### 폴더 신뢰 확인

대화형 claude 는 처음 보는 디렉터리에서 신뢰 확인을 띄움.

```
Quick safety check: Is this a project you created or one you trust?
❯ No, exit
  Yes, I trust this folder
```

**`--dangerously-skip-permissions` 로 안 넘어감**(그 대화상자는 `-p` 나 비 TTY 에서만 건너뜀). 팀원 worktree는 매번 새 경로 → **매번** 뜸. spawn 직후 팀장이 screen 읽어 확인이 보이면 답을 보냄.

```bash
for i in 1 2 3 4 5 6 7 8 9 10; do
  scr=$("$TM" -L dflow capture-pane -p -t "$PANE" 2>/dev/null)
  case "$scr" in
    *"I trust this folder"*) "$TM" -L dflow send-keys -t "$PANE" Down; \
                             "$TM" -L dflow send-keys -t "$PANE" Enter; break ;;
    *"bypass permissions on"*) break ;;
  esac
  sleep 1
done
```

- 이 규칙은 **screen 문자열에 기댐**(확인한 판본 v2.1.273).
- 깨지면 팀원이 신뢰 확인 screen에서 멈춘 채 생존 → 무응답 자동 정리(`references/result-handling.md` 「중단·무응답·정지·대기 판정·자동 재시작」)가 가려냄.
- `~/.claude.json` 의 `hasTrustDialogAccepted` 는 안 건드림(여러 세션이 동시에 쓰는 파일).

### 팀원 환경을 벗기는 이유

팀원 pane 은 팀장 환경을 통째로 물려받음.
- `.dflow-run` 은 `CLAUDE` 로 시작하는 변수를 전부 벗김(`CLAUDE_CONFIG_DIR` 만 남김). 대화 기록 저장이 꺼짐. 팀장의 메시징 채널·세션 ID·PID·에이전트 팀 설정을 팀원이 제 것으로 쓰는 것을 막음.
- **`ORCA_*`·`TMUX`·`TMUX_PANE` 벗기기와 PATH 의 shim 제거는 `ORCA_AGENT_TEAMS_TEAM_ID` 가 있을 때만 함**(팀장이 Orca 안에서 tmux 백엔드로 팀원을 띄울 때만 새는 값. Orca 가 새로 띄운 탭의 `ORCA_AGENT_HOOK_*` 를 지우면 그 탭이 오피스 화면에서 사라짐).
- 조건은 `if [ -n "${ORCA_AGENT_TEAMS_TEAM_ID-}" ]; then <벗기기 전부>; fi` 한 블록으로 묶음(줄마다 걸면 먼저 지운 `ORCA_*` 가 판별 변수까지 지움).
- 변수별로 무엇이 깨지는지 = rationale.md.

### 생존·화면·답·회수

| 항목 | 명령 |
|---|---|
| 생존 | `"$TM" -L dflow list-panes -t <pane> -F '#{pane_dead}' 2>/dev/null` — 빈 출력 = pane 없음, `1` = 죽음, `0` = 생존 |
| 종료 코드 | `"$TM" -L dflow list-panes -t <pane> -F '#{pane_dead_status}' 2>/dev/null` |
| screen(보고용) | `"$TM" -L dflow capture-pane -p -t <pane>` |
| 결과 줄 폴백 | `"$TM" -L dflow capture-pane -p -J -S - -t <pane>` |
| `blocked` 답 | `"$TM" -L dflow send-keys -t <pane> -l -- "$ans"` 뒤에 `"$TM" -L dflow send-keys -t <pane> Enter` |
| 회수 | `"$TM" -L dflow kill-pane -t <pane>` 뒤에 `"$TM" -L dflow select-layout -t dflow tiled` |
| worktree 대응 | `#{pane_start_path}` |

- **screen은 생존 증거로 쓰지 않는다.** 정본 = SKILL.md 「3. 결과 처리」 의 한 줄 원칙과 `references/result-handling.md` 「생존 증거」(branch tip commit 시각·서버 progress·미커밋 변경 목록). screen은 보고용과 신뢰 확인 판별에만 사용.
- 빈 출력과 `1` 을 함께 죽음으로 봄(`remain-on-exit` 를 놓친 pane 은 흔적 없이 사라짐).
- 답은 `-l --` 로 넣음(없으면 tmux 가 답을 **키 이름으로 먼저 해석함** — `Up`·`Space` 같은 답이 키로 눌림). 신뢰 확인의 `Down`·`Enter` 는 키 이름이 맞음 → `-l` 없이 보냄.
- 회수 뒤 `select-layout tiled` 를 다시 돌려 남은 pane 이 빈자리를 메우게 함.
- 팀장과 사람이 같은 pane 에 동시에 입력하면 섞임. 팀장이 답을 넣을 때는 그 사실을 한 줄 알림.

### 결과 줄과 죽은 pane 폴백

결과 = `<워크트리>/<TASK_DIR>/.result`.
- pane 이 죽었는데 파일이 없으면 죽은 pane screen 전체에서 `<TSK> <id8> ` 로 시작하는 마지막 줄을 찾음(워커는 같은 줄을 마지막 응답으로도 출력).
- 그것도 없으면 `failed no-result`(SKILL.md 「3. 결과 처리」).

```bash
"$TM" -L dflow capture-pane -p -J -S - -t <pane> 2>/dev/null | grep -E '^<TSK> <id8> ' | tail -n 1
```

- `-J` = 줄바꿈된 줄을 이음. `-S -` = 스크롤백 전체 읽음(보이는 영역만 읽으면 스크롤아웃된 결과 줄을 놓치고 사유가 잘림).
- `failed not-isolated` 는 워커가 파일을 안 쓰므로 이 폴백으로만 옴.

### 재구성

팀장이 컨텍스트를 잃어도 아래 한 줄로 살아 있는 팀원을 흡수(`pane_start_path` = worktree 경로. worktree 루트의 `.dflow-agent` 와 `.dflow-pane` 이 교차 확인에 쓰임).
```bash
"$TM" -L dflow list-panes -a -F '#{pane_id} #{pane_dead} #{pane_start_path}' 2>/dev/null
```

### 마감

**소켓에 pane 이 하나도 없을 때만** 서버를 거둠. 이 규칙의 정본 = 이 절(`references/closing.md` 4번이 가리킴).

```bash
[ -z "$("$TM" -L dflow list-panes -a -F '#{pane_id}' 2>/dev/null)" ] && "$TM" -L dflow kill-server
```

- 이 소켓은 **사용자 단위**, 리포 단위 아님. 자기 슬롯 표만 보고 `kill-server` 하면 **다른 체크아웃의 살아 있는 팀원이 미커밋 산출물을 안은 채 죽음.**
- 결과 처리가 끝난 pane 은 `kill-pane` 으로 거둠 → 팀원이 모두 끝나고 다른 팀장도 없으면 목록이 비어 서버를 거둠.
- 하나라도 남으면 서버를 남김(대가 = 서버 하나). 다음 팀장의 재구성이 그 pane 들을 흡수.
- `.dflow-agent` 없는 worktree 가리키는 pane 은 고아 → 전제 검사가 찾아 보고.

### 정리

worktree 아직 있을 때만 팀장 체크아웃에서 실행.
```bash
git worktree remove --force "$WT"
```
`--force` 필요 이유 = 미추적 부산물(`.result`·`.dflow-agent`·`.dflow-prompt`·`.dflow-pane`·`.dflow-run`·`.dflow.local`(레거시 `.env`) 링크·`.dflow` 링크·스킬 링크). 먼저 「고아 정리 규칙」 을 따름. 살아 있는 팀원의 worktree는 안 지움.

## pane(Orca)

Orca 안에서 띄운 팀장은 이 백엔드를 먼저 고름(SKILL.md 「0. 환경 감지」).
- `git worktree add --detach` 로 만든 순수 git worktree를 `orca terminal create --worktree path:<WT> --command ./.dflow-run --json` 이 받아들임(핸들 = `.result.terminal.handle`).
- 새 탭의 claude 는 permission 확인 생략 모드로 포인터를 첫 입력으로 받아 착수.
- `orca terminal close --terminal <핸들> --tab --json` 이 `ptyKilled:false` 로 답해도 claude 프로세스는 실제로 끝남.
- 그래서 Orca 도 tmux 와 같은 방식으로 spawn·회수·재투입(`references/restart.md` 「Orca」).

**spawn**: 「pane(tmux)」 스폰 블록의 처음부터 `chmod +x "$WT/.dflow-run"` 줄까지를 **그대로, Bash 호출 1회 안에서** 돎.
- 입장 제어 두 줄 포함 → 따로 부르지 않음. `SPAWN_DEFERRED_CAPACITY` 로 끝나면 아래를 부르지 않음.
- `WT` = tmux 와 같은 `<MAIN>/.claude/worktrees/dflow-<id8>`. 옛 리포 루트 위치(`<MAIN>/dflow-<id8>`)는 새로 안 씀.
- 그 블록 뒤, tmux 의 `if "$TM" -L dflow has-session ...` 대신 같은 호출 안에서 아래로 이음.
- 블록 안 `TM=$(find_tmux)` 는 이 호출 안에서만 쓰고 버림. Orca 팀장이 다른 블록(SKILL.md·restart.md)의 `TM` 자리표를 채울 때는 tmux 가 설치돼 있어도 **빈 값**.
```bash
R=$(orca terminal create --worktree "path:$WT" --title 'w<slot> · <TSK> <id8> · <작업 이름>' --command ./.dflow-run --json)
printf '%s\n' "$R"
H=$(printf '%s' "$R" | jq -r '.result.terminal.handle // .result.agentTerminalHandle // "-"')
printf '%s\n' "$H" > "$WT/.dflow-pane"
```
- `<기본브랜치>`(준비 블록 `git worktree add` 의 기점) = SKILL.md 「1. 시작」 전제 검사가 구한 이름(agent branch 결국 merge될 곳).
- 포인터 = SKILL.md 「5. 팀원 spawn」 의 한 줄 그대로. 준비 블록이 이미 `$WT/.dflow-prompt` 에 씀(큰따옴표·`$`·백틱 없음). 첫 입력으로 자동 제출 → 팀원이 바로 착수. `--title` 로 tmux 와 같은 이름표를 붙임.
- 핸들 필드는 `result.terminal.handle` 을 먼저 봄.
  - 옛 런타임은 이 필드 대신 `result.agentTerminalHandle` 만 주거나(`result.startupTerminal.handle` 만 주는 더 옛 런타임도 있음) 아무것도 안 줌.
  - 셋 다 없으면 `handle` 을 `-` 로 두고, screen 읽기 없이 git·서버 증거만 사용.
- **`$WT/.dflow-pane` 에 핸들을 씀**(tmux 가 pane id 를 쓰는 자리와 같게. 재개·재투입·회수가 백엔드 구분 없이 같은 파일에서 대상을 찾음).
- `team.spawn` 의 `handle` 표기 = events.md 가 이미 정한 형식(raw "Orca 터미널 핸들", `orca:` 접두 없음) 그대로.
- 이후 이 worktree 가리킬 때는 `--worktree "path:$WT"` 선택자 사용.
- 팀원 screen 보기(보고용): `orca terminal read --terminal <handle>`(생존 증거로는 안 씀).

**폴더 신뢰 확인**: tmux 처럼 spawn 직후 screen 최대 10 회(1초 간격) 읽어 가려냄. **키를 보내는 방법은 실측하지 않았으므로 보내지 않음.**
```bash
for i in 1 2 3 4 5 6 7 8 9 10; do
  scr=$(orca terminal read --terminal "$H" 2>/dev/null)
  case "$scr" in
    *"I trust this folder"*) echo "TRUST_NEEDS_HUMAN $H"; break ;;
    *"bypass permissions on"*) break ;;
  esac
  sleep 1
done
```
- `I trust this folder` 가 보이면 "사람 확인 필요" 로 보고하고 넘어감 — 그 탭에서 사람이 직접 답해야 함.
- 이미 신뢰된 리포(`<MAIN>`) 아래에서는 안 뜨지만 다른 부모 경로에서는 뜰 수 있어 루프를 남김.
- `bypass permissions on` 이 보이면 통과. screen 문자열에 기대는 한계는 tmux 와 같음.

**정리**: 전환 규칙을 먼저 봄.
```bash
if orca worktree list --json 2>/dev/null | jq -e --arg p "<경로>" '[.result.worktrees[]?.path] | index($p) != null' >/dev/null; then
  orca worktree rm --worktree path:<경로>
else
  git worktree remove --force "<경로>"
fi
orca worktree list        # 누수 확인. 옛 방식 워크트리(dflow-<id8>, 리포 루트)가 남아 있으면 위 첫 갈래로 지운다
```
- 옛 방식(`orca worktree create`)으로 뜬 worktree만 `orca worktree list --json` 에 나타남.
  - 그 경로면 `orca worktree rm`(체크아웃된 로컬 branch만 삭제를 시도하고, merge됐음을 입증하지 못하는 branch와 worktree보다 먼저 있던 branch는 보존).
  - 아니면(새 방식) tmux 와 같은 `git worktree remove --force`.
- 미커밋분을 잃으므로 먼저 「고아 정리 규칙」 을 따름.
- 옛 방식의 `orca worktree rm` 에는 `--force` 를 「고아 정리 규칙」 1번(부트스트랩 실패)에서만 붙임. 두 갈래 모두 branch 삭제는 강제 안 함.
- `orca worktree list --json` 모양 = `{result:{worktrees:[{path,…}]}}`.

## 고아 정리 규칙

두 백엔드 공통. 대상 = 루트 `.dflow-agent` 값이 `<신원>/<host>/` 로 시작하는 worktree(`parked` 포함).
결과 처리(done·needs-merge·skipped·failed·cancelled), 고아 스캔, 무응답 자동 정리, 마감이 이 규칙으로 팀원 worktree 지움.
**아래 "Orca 정리 명령" = 「pane(Orca)」 「정리」 전환 규칙의 줄임말**(경로가 `orca worktree list --json` 에 있으면 `orca worktree rm --worktree path:<경로>`, 없으면(새 방식) `git worktree remove --force <경로>`).
0. **설계 완료 대기**(`<TASKS>/*/state.json` 이 `phase=wait_pred`, `references/design-ahead.md`): 깨끗하고 push 됐어도 **지우지 않음**(결과 처리·고아 스캔·마감 모두).
   - 선행이 끝나면 같은 worktree로 이어 구현. 지우면 재개가 의존성 설치·기준선부터 다시 함.
   - `.dflow-agent` 는 `parked` 로 둠. 아래 1~5번은 보지 않음.
1. **부트스트랩 실패**(`.result` 의 branch 칸이 `-`, branch 만들기 전에 끝남): 미커밋 목록이 알려진 부산물(`.dflow-agent`, `.dflow-prompt`, `.dflow-pane`, `.dflow-run`, `.result`, `.issues`, `<TASK_DIR>/spec.md` 캐시, `.dflow.local`(레거시 `.env`) 링크, `.dflow` 링크, 스킬 링크(`.claude/skills` 또는 그 안의 `dflow-dev`·`dflow-work`))뿐일 때만 정리.
   - tmux 는 `git worktree remove --force`, Orca 는 Orca 정리 명령에 `--force` 추가. 두 백엔드 모두 `--force` 사용(`spec.md` 캐시·스킬 폴더 안 개별 링크는 `info/exclude` 가 안 가림).
   - Orca 의 `--force` 는 worktree 강제 제거만 함. branch 삭제는 강제 안 함.
   ```bash
   git -C <워크트리> status --porcelain --untracked-files=all \
     | grep -v -E '^\?\? (\.dflow-(agent|prompt|pane|run)|\.env|\.dflow|\.dflow\.local|\.claude/skills(/dflow-(dev|work)(/.*)?)?|<TASK_DIR>/(spec\.md|\.result|\.issues))$'
   ```
   출력이 비어야 함. 그 밖의 변경이 있으면 보존하고 경로와 목록을 보고. 이유: branch 없어도 워커가 무언가 고쳤다면 그것은 사람이 판단할 산출물.
2. **그 밖**: 미커밋 변경이 없어야 하고(첫 줄), 이어서 둘 중 하나가 참이면 정리.
   ```bash
   git -C <워크트리> status --porcelain       # 비어 있어야 한다. 부산물은 info/exclude 로 가려져 있다
   git fetch origin
   if git -C <워크트리> rev-parse -q --verify "origin/<agent 브랜치>" >/dev/null; then
     test "$(git -C <워크트리> rev-parse HEAD)" = "$(git -C <워크트리> rev-parse origin/<agent 브랜치>)"
   else
     git -C <워크트리> merge-base --is-ancestor HEAD "origin/<기본브랜치>"
   fi
   ```
   **대안 조건**(둘째 갈래, 2026-09-24 추가): agent branch 이미 merge되고 원격에서 지워진 뒤에는 첫 갈래(HEAD 비교)를 확인할 원격 ref 자체가 없음.
   - `/dflow-merge` 는 `--no-ff` 고정 → merge된 작업의 HEAD 는 기본 branch 조상. 그 조건으로 대신 판정.
   - 이 대안이 없으면 merge 뒤 원격 agent branch 지운 worktree 영영 정리 안 되고 쌓임.
2-1. **해소 worktree**(이름 `dflow-<id8>-resolve`, detached, SKILL.md 「5-2. 해소 spawn」): 1·2번 대신 아래 둘이 모두 참일 때 정리. 결과 줄 branch 칸이 늘 `-` 여도 1번(부트스트랩 실패)을 안 씀.
   ```bash
   git -C <워크트리> status --porcelain --untracked-files=all \
     | grep -v -E '^\?\? (\.dflow-(agent|prompt|pane|run)|\.env|\.dflow|\.dflow\.local|\.claude/skills(/dflow-(dev|work|merge|team)(/.*)?)?|<TASK_DIR>/\.result)$'
   git fetch origin
   git -C <워크트리> merge-base --is-ancestor HEAD origin/<개발브랜치>
   ```
   - 첫 명령 출력이 비고 둘째가 0 이면 지움(push 했거나 `reset --keep` 으로 버림 → 잃을 것 없음). tmux 는 `git worktree remove --force <경로>`, Orca 는 Orca 정리 명령에 `--force` 추가.
   - 아니면 3번으로.
   - 해소 worktree는 "재개 가능" 아님 → `parked` 로 바꾸고 "멈춤" 표에 넣음. 사유 = 결과 줄 status(`blocked` 해소 중 멈춤 등).
   - 살아 있는 해소 워커(`blocked` 포함)의 worktree는 4번대로 안 지움.

3. 하나라도 거짓이면 안 지움. 이어서 `references/lead-state.md` 「고아 스캔」 의 **"재개 가능"** 조건으로 가름.
   - 재개 가능이면 `.dflow-agent` 를 **건드리지 않고** 그대로 둠 → 「5-1. 재개 spawn」 이 이어받음(그 절차가 슬롯 값을 다시 씀).
   - 재개 가능이 아니면 경로와 미커밋 목록(`git -C <워크트리> status --porcelain` 출력)을 **"멈춤" 표**에 붙임. 살아 있는 팀원의 worktree(4번)가 아니면 `.dflow-agent` 값을 `parked` 로 바꿔 정규 슬롯 스캔에서 뺌.
   - 이유: 느린 팀원이나 commit 전에 멈춘 팀원의 산출물을 안 잃음. 보존된 worktree `.dflow-agent` 가 `w<slot>` 값 그대로면, 그 슬롯에 새로 뜬 팀원과 슬롯 표시가 같아 재구성이 충돌.
   ```bash
   printf '%s\n' '<신원>/<host>/parked' > <워크트리>/.dflow-agent
   ```
4. 살아 있는 팀원(SKILL.md 「팀장 상태」 정의)의 worktree는 조건과 무관하게 안 지움.
   - 두 백엔드의 `blocked` worktree 모두 여기에 듦(팀원이 pane 이나 탭에서 답을 기다림).
   - 예외 = 무응답 자동 정리(`references/result-handling.md`) 하나.
5. **생성 branch 정리**: worktree 지웠으면 그 worktree 만들 때 생긴 branch 지움.
   - 새 방식(`git worktree add --detach`)은 두 백엔드 모두 생성 branch 없음 → 이 항목은 **옛 방식**(`orca worktree create`)이 남긴, 이름에 `dflow-<id8>` 이 든 branch에만 해당.
   - `agent/` 로 시작하는 branch는 안 지움(작업 산출물).
   ```bash
   git fetch origin
   git branch --format='%(refname:short)' --list '*dflow-<id8>*' | while IFS= read -r br; do
     case "$br" in agent/*) continue ;; esac
     git merge-base --is-ancestor "$br" origin/<기본브랜치> && git branch -D "$br"
   done
   ```
   - `git branch -D` 는 다른 worktree 체크아웃한 branch 거부 → 그런 branch는 남음.
   - `origin/<기본브랜치>` 의 조상인 것만 지움(이름만 맞는 branch 고유 commit 안 잃음).
   - id8 을 모르면(컨텍스트 압축으로 이름을 잃은 경우) 위 루프의 첫 줄만 `git branch --format='%(refname:short)' --list '*dflow-[0-9a-f]*'` 로 바꿔 돎.
   - 앞의 `*` = Orca 가 이름 앞에 다른 접두를 붙일 수 있어서. `dflow-` 뒤를 16진수로 한정해 `worktree-dflow-team` 같은 개발 branch 후보에서 뺌.
   - 세 안전 조건(`agent/` 아님, 체크아웃 안 됨, `origin/<기본브랜치>` 의 조상)은 루프가 그대로 지킴.

## 플랫폼 차이

두 백엔드의 셸 블록은 macOS·Linux 와 Windows(Git Bash, MSYS) 에서 같은 절차로 돎. 아래 항목만 블록 안에서 `uname -s` 로 가름(`MINGW*|MSYS*|CYGWIN*`). WSL = Linux.
경로는 항상 git 출력(`rev-parse`·`worktree list`)에서 얻고 `pwd` 와 문자열로 비교하지 않음. Windows 에서 git 은 `C:/…` 형, bash 는 `/c/…` 형 → 같은 위치가 다른 문자열.

| 항목 | macOS·Linux | Windows(Git Bash) |
|---|---|---|
| tmux | 대개 설치돼 있거나 패키지 관리자로 설치 | **MSYS2 로 따로 설치해야 함. 미검증** |
| 호스트 이름 | `hostname` 의 첫 점 앞부분(`hostname \| cut -d. -f1`) | 같음. Windows 의 hostname.exe 에는 `-s` 가 없음 |
| 팀장 세션 PID | `CLAUDE_PID`(= `$PPID`) | `CLAUDE_PID`(필수. 없으면 전제 검사가 `NO_CLAUDE_PID` 로 중단). `$PPID` 는 부모가 Cygwin 프로세스가 아니면 1 |
| `.dflow.local`(레거시 `.env`)·스킬 링크 | 심링크 | `ln -s` 가 복사본을 만듦. 복사본으로 동작(「pane(tmux)」 spawn) |
| 필요한 명령 | node 18.17+·git·tmux(또는 Orca) | node 18.17+·git. tmux 는 MSYS2(미검증). 사용자 bash 문법 명령(게이트·baseline 명령)을 돌릴 때만 Git Bash |

- **Windows tmux 미검증**: MSYS2 tmux 가 Git Bash 에서 실제로 도는지 확인한 적 없음. Git for Windows 기본 구성이 아니고, tmux 자체의 Windows 제약도 알려져 있음. 검증 전까지 Windows 는 「돌 수도 있다」. WSL 은 Linux 로 취급 → 그대로 돎.
- **`ln -s`**: 복사본을 만듦(파일·폴더 모두). `MSYS=winsymlinks:nativestrict` 를 주면 진짜 심링크가 되지만 설계는 복사본 전제.
- **줄끝**: Windows 기본 `core.autocrlf=true` 클론은 스크립트를 CRLF 로 바꿈. 킷과 설치 대상의 `.gitattributes`(install.sh 가 넣음)가 LF 로 고정하고, `dflow.mjs`·heartbeat 훅이 `.dflow`·`.dflow.local`(레거시 `.env`) 값의 `\r` 을 걷어냄.
- **미확인**: 실제 Windows Claude Code 세션의 Bash 도구가 `CLAUDE_PID` 를 내보내는지는 러너에서 잴 수 없었음(세션 없음). 그래서 전제 검사가 `NO_CLAUDE_PID` 로 막음(SKILL.md 「1. 시작」 전제 검사).
