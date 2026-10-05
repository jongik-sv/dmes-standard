# 공통 계약 (정본)

설정 키, 상태 파일 스키마, 스크립트 이름·인자·출력 형식의 **단일 정본**이다. 다른 references 와 scripts 는 이 문서와
어긋나면 안 된다. 설계 근거: `docs/superpowers/specs/2026-10-04-coordinator-skill-design.md`(이하 설계).

## 1. 설정

### 1.1 파일과 병합

- 리포 공용 `<repo>/.coord.json`(커밋) → PC 전용 `<repo>/.coord.local.json`(커밋 안 함) 순으로 읽어 `jq -s '.[0] * .[1]'`
  로 깊게 병합한다. 둘 다 없으면 아래 기본값만 쓴다. 기본값은 `scripts/lib/common.sh` 의 `COORD_DEFAULTS` 가 정본이고
  `templates/config.example.json` 은 그 사본이다.
- `<repo>` 는 `git rev-parse --show-toplevel` 이 아니라 **메인 체크아웃**(`git rev-parse --git-common-dir` 의 부모)이다.
  워크트리에서 불러도 같은 설정을 읽는다. `COORD_REPO` 환경 변수가 있으면 그것을 쓴다.
- 경로 값의 `~` 는 스크립트가 `$HOME` 으로 바꾼다.

### 1.2 키

| 키 | 기본값 | 뜻 |
|---|---|---|
| `integration_branch` | `"dev"` | 머지 대상 통합 브랜치 |
| `git_bin` | `"git"` | git 실행 파일(훅이 git 을 바꿔 쓰는 PC 는 `/usr/bin/git`) |
| `state_dir` | `"~/.coord"` | 상태 폴더 뿌리. 회차 폴더는 `<state_dir>/<run-id>/`, 현재 회차는 `<state_dir>/current`(한 줄 run-id) |
| `terminal_backend` | `"orca"` | `orca` \| `tmux`(tmux 는 뼈대만) |
| `coordinator.model` | `"opus"` | 조정자 세션 모델(사람이 띄울 때 참고, 스크립트는 안 씀) |
| `coordinator.effort` | `"medium"` | 조정자 세션 effort. 무거운 판단은 서브에이전트로 올린다(SKILL.md 「판단 올리기」) |
| `launch.claude` | `"claude"` | Claude Code 실행 명령 앞부분(예: `orca claude-teams --dangerously-skip-permissions`) |
| `launch.glm` | `"glm"` | GLM Claude Code 실행 alias |
| `launch.opencode` | `"opencode --standalone"` | opencode 워커 실행 명령 |
| `heavy.script` | `null` | heavy.sh 경로(리포 기준 상대 또는 절대). 없으면 통지만 |
| `heavy.measure_dir` | `"~/.dflow/locks/heavy-measure"` | 측정 레인 전용 칸 DIR |
| `heavy.load_soft` | `1.2` | load1/코어 가 이 값을 넘으면 새 무거운 착수 지시 보류 |
| `heavy.load_hard` | `2.0` | 두 틱 연속 넘으면 최저 우선순위 레인에 금지 통지 |
| `heavy.load_release` | `0.8` | 두 틱 연속 아래면 금지 해제 |
| `heavy.measure_quiet` | `0.5` | 측정 창 시작 전 load1/코어 가 이 값 아래로 2분 유지 |
| `usage.sources` | `[{"kind":"cache","path":"/tmp/claude-usage-cache.json"},{"kind":"coord-dump","path":"~/.coord/ctx"},{"kind":"limits-dir","path":"~/.dflow/limits"}]` | 사용량 출처 읽는 순서 |
| `usage.max_age_min` | `30` | 이보다 오래된 출처는 버린다 |
| `usage.bands` | `{"Y":{"five":60,"week":70},"O":{"five":80,"week":85},"R":{"five":95,"week":95}}` | 띠 경계(이상이면 그 띠) |
| `usage.week_pace` | `true` | 1주 남은 날 보정(설계 §3.f) 사용 |
| `compact.threshold_pct` | `40` | 기본 임계 % |
| `compact.threshold_tokens` | `null` | 토큰 임계(둘 다 있으면 먼저 닿는 쪽) |
| `compact.by_window` | `{"1000000":{"pct":40},"200000":{"pct":70}}` | 창 크기별 % 덮어쓰기 |
| `compact.hard_pct` | `70` | Workflow 중이라도 사용자에게 알리는 % |
| `compact.cooldown_min` | `30` | 같은 레인 compact 최소 간격 |
| `compact.default_window` | `200000` | 창 크기를 모를 때 |
| `compact.wait_max_min` | `10` | Compacting 사라짐 대기 상한 |
| `idle.idle_min` | `5` | idle 지속 최소 분 |
| `idle.cooldown_min` | `15` | 마지막 지시 뒤 재지시 금지 분 |
| `idle.confirm_gap_min` | `2` | 후보 확정에 필요한 두 관측 사이 최소 분 |
| `idle.bg_recent_min` | `10` | tasks 출력 mtime 이 이 분 안이면 백그라운드 실행 중 |
| `idle.stall_max_min` | `90` | 백그라운드 거부가 이보다 길면 정체 의심 |
| `stall.quiet_min` | `20` | 산출물 무변화 + CPU 정지 판정 분 |
| `tick.cron` | `"7,27,47 * * * *"` | 감시 틱 cron |
| `workflow.agents_by_band` | `{"G":3,"Y":2,"O":1,"R":0}` | 레인당 동시 agent 상한 |
| `workflow.model_table` | 아래 1.3 | 지시 템플릿의 단계·크기별 model·effort(최소 충분 등급) |
| `workflow.escalation.ladder` | `[sonnet/medium, sonnet/high, opus/high]` | 시험 실패 시 수정 agent 등급 사다리(`references/workflow.md` §7) |
| `workflow.escalation.allow_xhigh` | `false` | true 면 사다리 끝에 `opus/xhigh` 한 칸을 더한다 |
| `workflow.escalation.max_attempts` | `3` | 항목당 수정 시도 상한(환경 재실행 제외) |
| `workflow.escalation.env_retry` | `1` | 환경 실패(시간 초과·부하 연쇄)일 때 같은 등급 재실행 횟수 |
| `search.mode` | `"tab"` | `tab` 은 새 탭에 대화형 검색 워커를 띄워 사용자가 진행을 보게 한다. `print` 는 화면 없이 단발 실행 |
| `search.tab_command` | `"agy -i {prompt}"` | 탭 모드 명령 틀 |
| `search.command` | `"agy -p {prompt} --print-timeout {timeout}s --disable-slash-commands"` | 검색 워커 명령 틀. `{prompt}` 는 인자 하나로, `{timeout}` 은 초로 바뀐다. 빈 값이면 검색 워커 없음 |
| `search.timeout_s` | `240` | 검색 제한 시간 |
| `glm.max_sessions` | `1` | 동시 GLM 세션 상한 |
| `glm.timeout_s` | `10` | 사전 확인 호출 제한 시간 |
| `approvals.auto_allow` | `["read","status"]` | 사용자가 띄운 세션의 확인 창 자동 승인 범주. 가능한 값: `read`·`status`·`edit-own`·`commit-own`·`heavy-build`. 기본은 가장 좁게 |
| `approvals.auto_allow_spawned` | `["read","status","edit-own","commit-own","heavy-build"]` | 조정자가 띄운 세션(`spawned_by=coordinator`)의 자동 승인 범주. 거부 칸은 여기에 넣어도 늘 거부 |
| `restart_rules` | `[]` | `[{"glob":"src/backend/**","note":"세 서버 내린 뒤 jar 빌드·재기동"}]` |
| `records_check` | `false` | 머지 게이트에서 레인 기록 문서 확인 |
| `integration_check` | `""` | 통합 확인 방법 문장(서버 기동·화면 확인). 킷에 도구 이름을 넣지 않는다 |
| `claude_projects_dir` | `"~/.claude/projects"` | transcript 뿌리 |
| `sessions_dir` | `"~/.claude/sessions"` | 세션 상태 json 폴더 |
| `tasks_root` | `null` | 세션 tasks 출력 뿌리(예: `/private/tmp/claude-501`). null 이면 S7(다) 생략 |
| `wake_targets` | `null` | 한도 초기화 깨우기 대상 파일(있으면 레인 증감 때 갱신 알림) |

### 1.3 `workflow.model_table` 기본값

최소 충분 등급 원칙(SKILL.md 「시간·토큰·성능 최적화 원칙」)을 따른다. `model: "search"` 는 Claude agent 가 아니라 검색 워커(`search.sh`, 기본 agy, 읽기 전용)를 쓰라는 뜻이고, 검색이 실패하면 sonnet/medium agent 로 대신한다. 기본은 sonnet, opus 는 판정과 어려운 구현에만, xhigh 는 보안·정합성 판정에만 쓴다. `size` 는 착수 지시 항목 표의 크기(S/M/L)다.

```json
[
  {"stage":"단순 시험 실행·결과 확인·기계적 치환","size":"*","model":"haiku","effort":"low"},
  {"stage":"조사·위치 찾기·영향 범위·사용처 목록","size":"*","model":"search","effort":"-"},
  {"stage":"문서 갱신","size":"*","model":"sonnet","effort":"medium"},
  {"stage":"구현·수정·특성 테스트 작성","size":"S/M","model":"sonnet","effort":"high"},
  {"stage":"구현·수정·특성 테스트 작성","size":"L·동시성·트랜잭션·원인 모를 결함","model":"opus","effort":"high"},
  {"stage":"리뷰(동작 보존 판정)","size":"S","model":"sonnet","effort":"high"},
  {"stage":"리뷰(동작 보존 판정)","size":"M/L","model":"opus","effort":"high"},
  {"stage":"보안·트랜잭션 정합성 판정","size":"*","model":"opus","effort":"xhigh"}
]
```

## 2. 상태 파일

회차 폴더 `<state_dir>/<run-id>/`:

| 파일 | 내용 |
|---|---|
| `state.json` | 아래 스키마. `coord-state.sh` 만 쓴다(mkdir 잠금 `.lock`) |
| `events.jsonl` | `{"at":ISO,"kind":…,"lane":…|null,"data":{…}}` 한 줄씩 |
| `lanes/<레인>/brief.md` | 착수 지시 원문 |
| `lanes/<레인>/reports.md` | 받은 보고 요약 누적 |
| `summary.md` | `coord-state.sh summary` 가 만든 사람용 요약 |
| `ticks/` | `idle-check.sh`·`stall-check.sh` 의 직전 관측(스크립트 전용) |

시각은 모두 ISO 8601 + 시간대(`date +%Y-%m-%dT%H:%M:%S%z` 를 `+09:00` 꼴로). 스크립트 내부 비교는 epoch 초.

### 2.1 `state.json` 스키마

```json
{
  "schema": 1,
  "run": {"id": "", "goal": "", "rules_doc": "", "integration_branch": "dev", "created_at": "",
          "coordinator": {"name": "", "addr": "", "session_id": "", "handle": "", "pid": 0},
          "cron_id": null, "usage_band_notified": null},
  "lanes": {
    "<레인>": {
      "session": {"name": "", "addr": "", "session_id": "", "pid": 0, "handle": "",
                  "kind": "claude|glm|opencode|agy|worker", "window": 1000000, "spawned_by": "user|coordinator"},
      "branch": "", "worktree": "", "owned": [], "forbidden": [], "heavy_env": null, "priority": 2,
      "items": [{"id": "", "title": "", "weight": 1, "done": false}],
      "queue": [], "hold": null,
      "last_report_at": null, "last_instr_at": null,
      "ctx": null, "compact": {"pending": false, "last_at": null, "pre_compact": null, "history": []},
      "memo": "", "state": "active|closing|closed"
    }
  },
  "deps": [["<레인>:<항목>", "<레인>:<항목>"]],
  "merge": {"in_flight": null, "queue": [], "history": []},
  "windows": [],
  "usage": {"band": "UNKNOWN", "five": null, "week": null, "src": null, "at": null},
  "load": {"soft_ticks": 0, "hard_ticks": 0, "release_ticks": 0, "banned": []},
  "instrs": [{"id": "<레인>-<n>", "lane": "", "kind": "", "sent_at": "", "ack_at": null, "nudges": 0}],
  "backlog": [{"id": "", "kind": "", "fits": [], "desc": "", "taken_by": null}],
  "approvals": [{"at": "", "lane": "", "decision": "allow|deny|user", "category": "", "cmd": "", "why": ""}],
  "glm": {"status": null, "at": null, "detail": null},
  "decisions": [{"at": "", "text": ""}],
  "pending_user": [{"at": "", "text": ""}]
}
```

- `hold` = `{"reason": "measure-wait|merge-wait|user-wait|heavy-ban|no-work|usage-band|…", "until": ISO|null}`.
- `merge.in_flight` = `{"lane","branch","expected_tree","granted_at"}`. 완료 보고 뒤 `history` 로 옮기고 `merged`·`tree`·`cleaned` 를 채운다.
- `windows[]` = `{"kind":"measure|move|ban","lane":<측정 레인|null>,"opened_at","until","notified":[],"hold_job":<heavy detach id|null>}`. 닫으면 배열에서 빼고 이벤트로 남긴다.
- `ctx` = `{"tokens","window","pct","src","at"}`.

## 3. 스크립트

모든 스크립트는 `scripts/` 아래, `#!/usr/bin/env bash`, `set -uo pipefail`, 첫 줄 아래에 사용법 주석. 공통 함수는
`scripts/lib/common.sh`(설정·회차·시각·잠금·로그), 터미널은 `scripts/lib/term.sh`(어댑터) 에서만 부른다.
macOS(BSD `date`·`stat`) 와 GNU 양쪽에서 돈다. 기계가 읽는 결과는 **stdout**, 사람용 설명·경고는 **stderr**.
보내기·닫기 같은 부작용이 있는 스크립트는 모두 `--dry-run`(하려던 명령을 stderr 에 `DRY` 로 찍고 실제로 하지 않음)을 받는다. dry-run 의 성공 줄은 보냈다면 나왔을 줄 앞에 `DRY ` 를 붙인다(`DRY SENT <h> -`, `DRY SPAWNED … handle=-`). 거부 판정 줄은 원래 형식 그대로다. 값을 모르는 칸은 `-` 로 낸다(`for=-m`, `ctx=-%`, `heavy=-/-/-`).
비밀값(토큰·키)은 어떤 출력·로그·이벤트에도 남기지 않는다.

종료 코드: 0 정상(판정 결과가 부정이어도 0), 2 사용법 오류, 3 설정·회차 없음, 4 외부 도구 실패.

### 3.1 `lib/common.sh`

`coord_cfg <jq경로>`(값, 없으면 빈 줄) · `coord_cfg_json <jq경로>` · `coord_repo` · `coord_run_dir [run-id]` ·
`coord_now_iso` · `coord_now_epoch` · `coord_iso_to_epoch <iso>` · `coord_lock <dir>`/`coord_unlock <dir>`(mkdir 잠금, 30초 대기 뒤 실패) ·
`coord_git …`(`git_bin` 으로 실행) · `coord_expand <경로>`(`~` 풀기).

### 3.2 `lib/term.sh`

다섯 함수만 공개한다. orca 구현은 `orca terminal … --json` 을 쓴다.

| 함수 | 출력(stdout) |
|---|---|
| `term_list` | 한 줄에 하나 `<handle>\t<title>\t<worktreePath>\t<lastOutputAt epoch초|->` |
| `term_read_screen <h> [줄수]` | 렌더된 화면 글(마지막 N줄, 기본 40) |
| `term_wait_idle <h> <ms>` | `satisfied` 또는 `timeout` 또는 `stale` |
| `term_send <h> <text> [--enter] [--wait-submit <초>]` | `accepted`·`submitted`·`turn_started`·`stale`·`error <msg>` 중 하나 |
| `term_close <h>` | `closed` 또는 `stale` |

### 3.3 판정·수집(읽기 전용)

| 스크립트 | 인자 | stdout |
|---|---|---|
| `ctx-usage.sh` | `<session-id>` \| `--pid <pid>` \| `--lane <레인>` `[--window N]` | `CTX <session-id> tokens=<n> window=<n> pct=<n> src=transcript|dump at=<iso>` 또는 `CTX <id> unknown <사유>` |
| `usage-band.sh` | 없음 | `BAND <G|Y|O|R|UNKNOWN> five=<n|-> week=<n|-> week_allow=<n|-> src=<kind|-> at=<iso|-> five_reset=<iso|-> week_reset=<iso|->` |
| `coord-status.sh` | `[--json]` | 레인마다 `LANE <레인> name=<세션> status=<busy|idle|gone> for=<분>m report=<HH:MM|-> commit=<HH:MM|-> ahead=<n|-> bg=<콤마목록|-> ctx=<n|->% hold=<사유|->`, 이어 `PC load1=<f> cpus=<n> per_core=<f> heavy=<held>/<waiting>/<K> swap_mb=<n|-> five=<n|-> week=<n|-> band=<띠>`, 상태에 없는 Claude 세션마다 `UNLINKED <이름> pid=<pid> cwd=<경로>`, 회차의 창마다 `WINDOW <kind> lane=<레인|-> until=<iso>` |
| `idle-check.sh` | `[레인…]` (없으면 active 레인 전부) | 레인마다 하나: `IDLE <레인> since=<iso>` · `CANDIDATE <레인>`(첫 관측, 확정 전) · `BUSY <레인> <사유>` · `HOLD <레인> <사유>` · `WAIT_USER <레인> <창 종류>` · `COMPACTING <레인>` · `STALL? <레인> bg=<분>m` · `GONE <레인>` |
| `stall-check.sh` | `[레인…]` | `STALL <레인> pid=<pid> cpu_delta=<초> quiet=<분>m heavy=<yes|no>` 또는 `OK <레인>` |
| `merge-gate.sh` | `<레인>` \| `--branch <브랜치>` | 첫 줄 `GATE <ok|wait|conflict> branch=<b> base=<integration> tree=<hash|-> files=<n>`, 이어 사유 줄 `CONFLICT <경로>` · `FORBIDDEN <경로>` · `OUTSIDE <경로>`(소유 밖) · `SHARED_API <경로>` · `RESTART <note>` · `WINDOW <kind> until=<iso>` · `INFLIGHT <레인>` |
| `prompt-watch.sh` | `<레인>` \| `--handle <h>` `[--follow <초>]` | `NONE <h>` 또는 `PROMPT <h> <trust|usage-limit|permission|question|choice>` 다음 줄부터 `---` 로 감싼 화면 발췌. `--follow` 는 감지할 때까지(최대 초) 3초 간격 반복 |
| `search.sh` | `[--tab\|--print] [--cwd <폴더>] [--timeout <초>] <질의…>` | `SEARCH ok <답 파일> <초>` 또는 `SEARCH fail <no-command|timeout|error|empty> <사유>`. 답은 회차 `searches/` 폴더(회차가 없으면 `$TMPDIR/coord-searches/`)에 쓴다 |
| `glm-preflight.sh` | 없음 | `ok <host> <model> <초>` 또는 `fail <alias|host|call|model> <사유>` |

### 3.4 상태 쓰기

`coord-state.sh <하위명령>`:

| 하위명령 | 하는 일 · stdout |
|---|---|
| `init <run-id> [--goal 글] [--rules-doc 경로]` | 회차 폴더·빈 state.json 생성, current 지정 · `RUN <run-id> <폴더>` |
| `use <run-id>` | current 바꾸기 |
| `get [jq식]` | state.json 에 jq 적용 결과 |
| `set <jq경로> <json값>` | 값 쓰기(예: `set '.lanes.a8.priority' 3`) · `OK` |
| `lane-add <레인> <json>` | 기본 레인 골격에 json 병합 · `OK` |
| `event <kind> [레인|-] [json]` | events.jsonl 에 한 줄 · `OK` |
| `instr <레인> <kind>` | 다음 지시 번호 발급·기록, `last_instr_at` 갱신 · `<레인>-<n>` |
| `ack <instr-id>` | ack 시각 기록 · `OK` |
| `report <레인> [요약 글]` | `last_report_at` 갱신, reports.md 에 한 줄 · `OK` |
| `item-done <레인> <항목id>` | 항목 완료 · `PROGRESS <레인> <pct>%` |
| `progress` | 레인마다 `PROGRESS <레인> <pct>% <끝난가중치>/<전체가중치>`, 마지막 `PROGRESS ALL <pct>%` |
| `hold <레인> <사유|-> [until-iso]` | hold 세우기(`-` 는 풀기) |
| `summary` | summary.md 재생성 · 경로 |

### 3.5 부작용 있는 스크립트(모두 `--dry-run`)

| 스크립트 | 인자 | stdout |
|---|---|---|
| `term-send-safe.sh` | `--handle <h>` \| `--lane <레인>`, `--text <글>` \| `--text-file <f>`, `[--timeout-ms 300000] [--raw]` | `SENT <h> <turn_started|submitted|accepted>` 또는 `REFUSED <h> <stale|not-idle|interrupt-visible|prompt-open|compacting|bang-in-text|draft-in-input|no-prompt>`. `--raw` 는 확인 창 응답(`1`·`2`)용: tui-idle 검사 없이 확인 창이 보일 때만 보낸다 |
| `compact-lane.sh` | `<레인> [--force-no-memo]` | `COMPACT_REFUSED <레인> <merge-in-flight|measure-lane|no-memo|cooldown|unsupported-kind|no-handle|term-send-safe 거부 사유>` · `COMPACT_DONE <레인> before=<n> after=<n>` · `COMPACT_TIMEOUT <레인>` |
| `spawn-lane.sh` | `--name <n> --kind <claude|glm|opencode> [--worktree <sel>] [--model m] [--effort e] [--autocompact t] [--prompt-file f]` | `SPAWNED <n> handle=<h> pid=<pid|-> session_id=<id|->` 또는 `SPAWN_FAIL <n> <wait|process|screen|preflight|glm-cap> <사유>`. glm 은 preflight 실패 시 `SPAWN_FAIL … preflight` (대체 여부는 조정자가 정한다) |
| `close-lane.sh` | `<레인>` \| `--handle <h>` | `CLOSED <레인> handle=<h>` 또는 `CLOSE_REFUSED <레인> <bg-running|worktree-left|branch-left|not-reported>` (worktree·branch 는 경고만, `--force-report` 로 통과) |
| `measure-window.sh` | `open <kind> [--lane <레인>] --until <iso> [--hold-heavy]` · `close` · `status` · `quiet-check` | `WINDOW_OPEN <kind> until=<iso> hold_job=<id|->` · `WINDOW_CLOSED <kind>` · `WINDOW <kind> lane=… until=…`/`WINDOW none` · `QUIET yes|no run=<n> per_core=<f> procs=<n>` |
| `auto-answer.sh` | `--lane <레인>` \| `--handle <h>` | `NONE <h>` · `ANSWER <h> <kind> <키> <사유>` · `DENY <h> <kind> <사유>`(Esc) · `ESCALATE <h> <kind> <사유>`(아무것도 안 보냄, 조정자가 판단 올리기 또는 사용자에게). 판정표는 `references/approvals.md` §5. 보내기 직전에 같은 창인지 다시 읽어 확인한다 |
| `statusline-dump.sh` | stdin = statusLine JSON | `<state_dir>/ctx/<session_id>.json` 에 `{at,session_id,context_window,rate_limits}` 저장 뒤 `COORD_STATUSLINE_NEXT` 명령이 있으면 같은 stdin 으로 실행해 그 출력을 그대로 낸다 |
