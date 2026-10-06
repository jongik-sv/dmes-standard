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
| `state_dir` | `"~/.coord"` | 상태 폴더 뿌리. 회차 폴더는 `<state_dir>/<run-id>/`, 현재 회차는 `<state_dir>/current`(한 줄 run-id), 조정 세션 기록은 `<state_dir>/_session/`(§4, 그래서 run-id `_session` 은 쓸 수 없다). 환경 변수 `COORD_STATE_ROOT` 가 있으면 그 값이 이 설정보다 앞선다(`office.sh reap --state-dir` 가 하위 호출에 넘긴다) |
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
| `office.enabled` | `true` | 에이전트 오피스 표시(§4). false 면 `office.sh` 는 아무것도 하지 않는다 |
| `office.project_id` | `null` | 오피스에 표시할 D'Flow 프로젝트 UUID. 있으면 `watch --project` 로 넘기고, 비면 생략(`dflow.sh` 가 `.dflow` 의 기본값을 쓴다) |
| `office.label_max` | `40` | 팀원 키에 넣는 지시 요약의 최대 글자 수(키 전체는 늘 120자 이내) |
| `office.dflow_script` | `null` | `dflow.sh` 경로(리포 기준 상대 허용). null 이면 킷 기준 `../../dflow-work/scripts/dflow.sh` |
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
          "cron_id": null, "usage_band_notified": null, "closed_at": null},
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
- `run.closed_at` = 회차를 마감한 시각(ISO)이고, 열린 회차는 `null`. `coord-state.sh close-run`(또는 `event run-closed`)만 쓴다. 이 칸이 비고 같은 조정 세션이 아닌 다른 세션이 연 회차가 살아 있는 레인을 둔 채 오래 조용하면 `init`·`tick.sh` 가 `STALE_RUN` 으로 알린다(경고뿐, 자동 마감하지 않는다). 계약에 없는 칸(`.run.state` 등)으로 마감을 표시하지 않는다.

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
`coord_git …`(`git_bin` 으로 실행) · `coord_expand <경로>`(`~` 풀기) · `coord_sess8 <state.json>`(그 회차의 `<세션8>`, §4) ·
`coord_runs_summary`(회차마다 `<run-id> <세션8> <open> <finished> <살아 있는 레인> <busy> <session_id> <pid>` 탭 구분 한 줄, 깨진 파일은 건너뜀) ·
`coord_stale_runs <제외 run-id>`(마감 표식 없는 회차 `<run-id> <session_id|-> <세션8> <살아 있는 레인>`).

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
| `tick.sh` | `[--no-answer] [--dry-run]` | 감시 틱 한 번을 묶어 행동 줄만 낸다: `ANSWER/DENY/ESCALATE … lane=<레인>`(확인 창 자동 응답) · `PROMPT <레인> <kind>`(`--no-answer`) · `IDLE`·`WAIT_USER`·`STALL?`·`GONE`(idle-check) · `STALL`(stall-check) · `CTX_OVER <레인> pct=<n> thr=<n>` · `CTX_OVER_SELF pct=<n> thr=<n>` · `BAND_CHANGED <이전> <지금> five=<n> week=<n>`(state.usage 갱신, 한 번만) · `LOAD_SOFT\|LOAD_HARD\|LOAD_RELEASE per_core=<f>`(두 틱 연속) · `WINDOW_DUE <kind> lane=<레인\|-> until=<iso>` · `UNACKED <instr-id> <레인> <분>m` · `UNLINKED <이름> pid=<pid>`(처음 본 것만) · `STALE_RUN <run-id> session=<id> idle=<분>m`(마감 표식 없는 다른 회차 — 경고만, 팀장 키는 세션 단위라 유령을 만들지 않는다). 하나도 없으면 `TICK quiet` |
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
| `init <run-id> [--goal 글] [--rules-doc 경로]` | 회차 폴더·빈 state.json 생성, current 지정 · `RUN <run-id> <폴더>`. 현재 세션 id(`COORD_SESSION_ID` → `CLAUDE_CODE_SESSION_ID`)와 조정 세션 pid(`CLAUDE_PID` → `$PPID`)를 `.run.coordinator.session_id`·`.pid` 에 적는다. 같은 세션 id 의 다른 열린 회차가 있으면 회차는 만들되(**자동 마감하지 않는다**) stderr 경고와 stdout `SESSION_RUNS <세션8> open=<n>` 한 줄을 낸다 — 팀장 칸은 그 회차들과 공유된다. 그 밖의 세션의 마감 표식 없는 회차는 `STALE_RUN <run-id> open session=<id\|-> idle=<분>m`(경고만) |
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
| `close-run [json]` | 회차 마감: `run-closed` 이벤트 → `office.sh finish` → `.run.closed_at` 에 마감 시각(이미 있으면 처음 값 유지, finish 는 다시 건다) · `OK`. `event run-closed` 도 같은 함수를 탄다 |
| `summary` | summary.md 재생성 · 경로 |

### 3.5 부작용 있는 스크립트(모두 `--dry-run`)

| 스크립트 | 인자 | stdout |
|---|---|---|
| `term-send-safe.sh` | `--handle <h>` \| `--lane <레인>`, `--text <글>` \| `--text-file <f>`, `[--timeout-ms 300000] [--raw] [--allow-busy]` | `SENT <h> <turn_started|submitted|accepted>` 또는 `REFUSED <h> <stale|not-idle|interrupt-visible|prompt-open|compacting|bang-in-text|draft-in-input|no-prompt>`. `--raw` 는 확인 창 응답(`1`·`2`)용: tui-idle 검사 없이 확인 창이 보일 때만 보낸다. `--allow-busy` 는 작업 중 세션에도 넣는다(Claude Code 가 작업 중 입력을 다음 차례로 받아 둔다): tui-idle 대기와 `esc to interrupt` 거절(`not-idle`·`interrupt-visible`)을 건너뛰고, `stale`·`bang-in-text`·`prompt-open`·`compacting`·`draft-in-input` 판정은 그대로 한다. 옵션이 없을 때의 동작·출력은 불변이다 |
| `compact-lane.sh` | `<레인> [--force-no-memo]` | `COMPACT_REFUSED <레인> <merge-in-flight|measure-lane|no-memo|cooldown|unsupported-kind|no-handle|term-send-safe 거부 사유>` · `COMPACT_DONE <레인> before=<n> after=<n>` · `COMPACT_TIMEOUT <레인>` |
| `spawn-lane.sh` | `--name <n> --kind <claude|glm|opencode> [--worktree <경로|선택자>] [--model m] [--effort e] [--autocompact t] [--prompt-file f]` | `SPAWNED <n> handle=<h> pid=<pid|-> session_id=<id|->` 또는 `SPAWN_FAIL <n> <wait|process|screen|preflight|glm-cap> <사유>`. glm 은 preflight 실패 시 `SPAWN_FAIL … preflight` (대체 여부는 조정자가 정한다) |
| `close-lane.sh` | `<레인>` \| `--handle <h>` | `CLOSED <레인> handle=<h>` 또는 `CLOSE_REFUSED <레인> <bg-running|worktree-left|branch-left|not-reported>` (worktree·branch 는 경고만, `--force-report` 로 통과) |
| `measure-window.sh` | `open <kind> [--lane <레인>] --until <iso> [--hold-heavy]` · `close` · `status` · `quiet-check` | `WINDOW_OPEN <kind> until=<iso> hold_job=<id|->` · `WINDOW_CLOSED <kind>` · `WINDOW <kind> lane=… until=…`/`WINDOW none` · `QUIET yes|no run=<n> per_core=<f> procs=<n>` |
| `auto-answer.sh` | `--lane <레인>` \| `--handle <h>` | `NONE <h>` · `ANSWER <h> <kind> <키> <사유>` · `DENY <h> <kind> <사유>`(Esc) · `ESCALATE <h> <kind> <사유>`(아무것도 안 보냄, 조정자가 판단 올리기 또는 사용자에게). 판정표는 `references/approvals.md` §5. 보내기 직전에 같은 창인지 다시 읽어 확인한다 |
| `statusline-dump.sh` | stdin = statusLine JSON | `<state_dir>/ctx/<session_id>.json` 에 `{at,session_id,context_window,rate_limits}` 저장 뒤 `COORD_STATUSLINE_NEXT` 명령이 있으면 같은 stdin 으로 실행해 그 출력을 그대로 낸다 |
| `console-poll.sh` | `[--once] [--dry-run]` \| `start` \| `stop` \| `status` | 정본 §4.1. `start` → `CONSOLE_POLLER started pid=<pid>`·`CONSOLE_POLLER running pid=<pid>`·`CONSOLE_POLLER skipped <사유>`, `stop` → `CONSOLE_POLLER stopped`·`CONSOLE_POLLER none`, `status` → `CONSOLE_POLLER up pid=<pid> since=<iso> cycle=<초>`·`CONSOLE_POLLER down`. 본문 루프는 stdout 에 아무것도 쓰지 않고 로그를 `~/.dflow/console/poller-<신원>.log` 에 남긴다 |
| `office.sh` | `lead-up` \| `lane-up <레인>` \| `lane-state <레인> <작업 중\|대기\|머지 중\|끝\|auto>` \| `lane-down <레인>` \| `beat` \| `finish` \| `reap [--state-dir <경로>]` | 없음(늘 종료 코드 0, 사용법 오류만 2). 경고는 stderr 한 줄. 정본 §4. `reap` 은 현재 회차 없이 돌고 상태 뿌리를 `--state-dir` → `COORD_STATE_ROOT` → 설정 `state_dir` 순으로 정한다 |

## 4. 에이전트 오피스 표시 계약

조정 세션(팀장)과 레인(팀원)을 wbs-web 의 에이전트 오피스에 **표시 전용**으로 보인다. WBS 데이터(작업·lease·진도율)는 건드리지 않는다. 표시 경로는 `dflow.sh watch`(POST `/api/v1/agent/watch`, `agent_watchers`) 하나뿐이다. 구현은 `scripts/office.sh`, 화면(wbs-web)은 아래 규칙으로 읽는다.

**agent 키**

| 대상 | 키 | 비고 |
|---|---|---|
| 팀장 | `<신원>/<host>/coord:<세션8>` | **조정 세션당 하나**다(회차가 아니다). `<세션8>` = 조정 세션 id(`COORD_SESSION_ID` → `CLAUDE_CODE_SESSION_ID`)의 앞 8자를 소문자 `[a-z0-9]` 로 거른 값, 세션 id 를 모르면 `p<CLAUDE_PID 또는 $PPID>`. `slots` = 그 세션의 **열린 회차 전부**(`run.closed_at` 이 null) 에서 합산한 살아 있는 레인 수(state 가 closed 가 아닌 레인), `busy` = 그중 작업 중·머지 중 레인 수. 레인이 0 이어도 `slots 0 busy 0` 을 보낸다. 회차가 열리고 닫혀도 키는 바뀌지 않고, 그 세션의 **마지막 열린 회차를 닫을 때만** 내린다. 서로 다른 세션 id 의 조정 세션 둘은 팀장 둘이다(정상) |
| 팀원 | `<신원>/<host>/임시:<레인>·<지시 요약>` | `until` 칸에 상태 라벨. `slots`·`busy` 는 보내지 않는다. 레인 이름은 키에서 40자로 잘리므로 `lane-add` 가 40자를 넘는 이름을 거절한다 |

- `<신원>/<host>` 는 `dflow.sh` 의 `watcher_id_default`(`<신원>/<host>/poll`)에서 마지막 토막만 뗀 값이다(신원 = `/me` 의 user_email 로컬 파트, host = hostname 첫 토막, 둘 다 소문자 `[a-z0-9-]` 슬러그). 킷에 PC별 이름을 박지 않는다. 신원은 `state.json` 의 `.office.user` 에 캐시한다.
- **팀장 토큰(화면 파싱 규칙)**: 마지막 `/` 뒤 토막이 `coord:` 로 시작하면 팀장(조정)이고 `:` 뒤가 조정 세션 식별자(`<세션8>`)다. 화면은 이 값을 해석하지 않고 그대로 식별자로만 쓴다. 옛 형식 `…/coord:<run-id>`·`…/coord`(식별자 없음)도 팀장으로 읽되, 새 호출은 **옛 키를 새 키로 바꾸는 첫 beat 에서** 옛 키를 stop 한 뒤 새 키를 보낸다.
- **조정 세션 기록**: 팀장은 회차가 아니라 세션에 속하므로 `<state_dir>/_session/<세션8>.json` 에 `{"key","session_id","host","user","pid","handle","sent_at","slots","busy"}` 를 둔다(`office.sh` 가 `coord-state.sh` 와 같은 mkdir 잠금으로만 쓴다). `pid`·`handle` 은 조정 세션 프로세스·Orca 핸들이다. 회차의 `.office.sent._lead` 는 더 쓰지 않는다. 이 세션의 열린 회차 집합은 `<state_dir>/*/state.json` 중 `.run.coordinator.session_id` 의 앞 8자가 `<세션8>` 이고 `.run.closed_at` 이 null 인 것이다.
- **생존 판정은 프로세스 기준**이다(틱 beat 는 보조). PC 단위 폴러(`console-poll.sh`, §4.1)가 30초마다 `_session/*.json` 의 `pid` 를 `kill -0` 으로 확인해 죽었으면 그 세션의 팀장 키와, 그 세션 회차들의 `.office.sent` 에 남은 팀원 키를 즉시 stop 하고 기록을 지운다. 팀원 키는 레인 세션 pid(`lanes.<레인>.session.pid`)가 죽었을 때도 같은 처리를 한다. pid 를 모르면(0·빈 값) 그 대상은 프로세스 판정에서 제외하고 TTL(70분)에 맡긴다. 마감이 빠진 채 세션이 죽어도 TTL 70분 동안 유령이 남지 않는다.
- **팀원 슬롯 토큰(화면 파싱 규칙)**: 마지막 `/` 뒤 토막이 `임시:` 로 시작하면 팀원이다. `임시:` 뒤가 `<레인>·<요약>` 이고 **첫 `·` 가 레인과 요약의 경계**다(요약 안에는 `·` 가 있어도 된다). 지시 요약이 비면 `·` 없이 `임시:<레인>` 만 온다. 레인 이름에는 `·`·`/` 가 없다(`[A-Za-z0-9._-]`).
- **지시 요약** = 레인 `brief`(`coord-state.sh lane-add <레인> '{"brief":"한 줄"}'`) → 없으면 레인 `goal` → `title` → `memo` 첫 줄. 모두 비면 요약 없음. 항목 제목은 쓰지 않는다(항목을 끝낼 때마다 키가 바뀌어 슬롯이 새로 생긴다). 이미 올라간 레인에 `lane-add` 로 `brief` 를 바꾸면 바로 반영하고, 그 밖의 경로는 다음 beat 에서 반영된다. 개행·탭은 공백 하나로, 슬래시는 제거, 앞뒤 공백 제거 뒤 `office.label_max`(기본 40)자로 자른다. 레인 이름은 키에서 40자로 자르고, 키 전체(머리 부분 포함)는 120 이내라 레인 이름이 길면 요약이 더 줄어든다. **길이는 서버가 JS `.length`(UTF-16 코드 유닛)로 재므로 UTF-16 단위로 세고 자른다**(이모지 한 글자는 2, 쌍을 쪼개지 않는다). `label_max` 와 120 도 같은 단위다.
- **상태 라벨(until, 16자 이내)**: 팀원은 `작업 중`·`대기`·`머지 중`·`답 대기`·`끝` 중 하나다. `auto` 판정은 state.json 에서 한다: 레인 `state=closed` → `끝`, `merge.in_flight.lane` → `머지 중`, `hold` 가 있거나 `state=closing` → `대기`, 그 밖 `작업 중`. `답 대기` 는 state 가 아니라 **화면**으로 판정한다(아래).
- **조정 팀장의 `until`**: `조정 중`(기본) 또는 `답 대기` 둘뿐이다. `/dflow-team` 팀장(`…/lead`)의 `until` 은 종전처럼 종료 시각 라벨(`UNTIL_LABEL`)이고, 답을 기다리는 동안만 정확히 `답 대기` 를 보냈다가 끝나면 원래 값으로 되돌린다.
- **`답 대기` 판정(k2 폴러, 30초마다)**: 사용자 입력을 기다리는 창이 화면에 떠 있는 동안이다. 세션 화면은 `prompt-watch.sh`·`auto-answer.sh` 의 판정(`coord_screen_prompt_kind`: trust·usage-limit·permission·question·choice)을 그대로 쓴다. 대상별 조건: 팀원 = 레인 세션 화면에 그런 창이 있음. 조정 팀장 = 조정 세션 화면에 그런 창이 있음 **또는** 그 세션의 열린 회차 중 하나의 `state.json` `pending_user` 가 비어 있지 않음. `/dflow-team` 팀장 = 팀장 세션 화면에 그런 창이 있음. 폴러는 라벨이 **바뀔 때만** `watch` 를 다시 보내고, 창이 사라지면 다음 주기(30초 안)에 `lane-state <레인> auto`·`lead-label auto` 로 원래 라벨로 돌린다. 핸들을 모르면 화면 판정은 하지 않는다(`pending_user` 판정만 한다).
- 오피스는 키가 같으면 갱신, 다르면 새 슬롯으로 본다. 그래서 요약이 바뀌어 키가 달라지면 옛 키를 먼저 `--stop` 한 뒤 새 키를 등록한다. **옛 키 stop 이 실패하면(시간 초과 포함) 새 키를 보내지 않고 옛 키 기록을 유지한다**(서버 stop 은 멱등이라 다음 beat 가 다시 시도).
- **끝난 레인은 올리지 않는다**: 라벨이 `끝` 이거나 레인이 closed 이면 `lane-state`·`lane-up` 은 등록이 아니라 stop 이다(`lane-down` 뒤에 늦은 report·hold 가 와도 행이 다시 생기지 않는다).

**state.json 기록**: `.office.sent["<레인>"]` = 마지막에 보낸 팀원 키, `.office.label["<레인>"]` = 마지막에 보낸 라벨, `.office.user` = 신원 캐시, `.office.finished` = 마감 표식(이 회차의 팀원 키를 모두 내렸다는 뜻이고 팀장 키와는 무관하다). 팀장 키·마지막 `<slots>,<busy>` 는 위 「조정 세션 기록」(`_session/<세션8>.json`)에 둔다. 서버 TTL 은 70분이라 틱(기본 20분) 하트비트로 충분하다. `office.sh` 가 `coord-state.sh set` 으로만 쓴다.

**호출 연결**(모두 `office.sh … >/dev/null 2>&1 || true`, stdout 계약 불변):

| 지점 | 호출 |
|---|---|
| `coord-state.sh init` | `lead-up` |
| `spawn-lane.sh` 세션 확인 뒤(`record_lane`) | `lane-up <레인>` |
| `coord-state.sh lane-add`(이미 올라간 레인만)·`report`·`item-done`·`hold` | `lane-state <레인> auto` |
| `coord-state.sh set '.merge…'` 로 `in_flight` 레인이 바뀔 때(머지 허가·완료) | 이전·새 레인에 `lane-state <레인> auto` |
| `close-lane.sh` 가 레인을 closed 로 쓴 뒤 | `lane-down <레인>` |
| `tick.sh` 끝(`--dry-run` 제외) | `beat` — 팀장과 살아 있는 레인 전원을 같은 키로 재전송(하트비트). 끝난 레인·state 에서 사라진 레인은 stop. 개별 호출이 빠져도 beat 가 state.json 기준으로 바로잡는다. 마감 뒤에는 `.office.sent` 에 남은 키만 stop 한다 |
| `console-poll.sh` 생존 감시(§4.1, 30초마다) | `reap` — `_session/*.json` 의 `pid` 가 죽은 세션은 팀장 키와 그 세션 회차들(마감 여부 무관)의 `.office.sent` 팀원 키를 stop 하고 그 회차들에 `.office.finished=true` 를 남긴다. 세션 기록은 모든 stop 이 성공했을 때만 지운다(실패분은 다음 주기가 다시 시도). 살아 있는(또는 기록 없는) 세션의 열린 회차에서는 `session.pid` 가 죽은 레인의 팀원 키만 stop 하고 기록을 지운다. pid 0·빈 값은 판정에서 뺀다. 한 호출의 ABORT 는 호출 전체에 걸린다 |
| `coord-state.sh close-run`·`event run-closed`(`closing.md` §6) | `finish` — 레인마다 ABORT 를 풀고 이 회차의 팀원 키를 모두 stop 한다(한 건의 실패가 나머지를 막지 않는다). **팀장 키는 이 세션에 다른 열린 회차가 남아 있으면 stop 하지 않고 `slots`·`busy` 만 다시 합산해 보내며, 마지막 열린 회차를 닫을 때만 stop 한다.** `.office.finished=true` 는 늘 남기며, 그 뒤 그 회차의 `office.sh` 는 `beat` 만 동작해 stop 이 실패해 기록에 남은 키를 마저 내린다(유령 행 방지) |

`lane-state`·`lane-up` 은 키·라벨이 기록과 같으면 보내지 않는다(beat·lead-up 은 늘 보낸다). 사용자가 띄운 세션처럼 `lane-up` 을 거치지 않은 레인은 다음 beat 에서 등록된다.

**실패 정책**: 어떤 실패도 조정자 동작을 막지 않는다(종료 코드 0, 경고는 stderr 한 줄). 호출당 5초 제한(`timeout` 명령이 없어 백그라운드 + kill 로 구현, 후손 프로세스까지 재귀로 죽인다). 시간 초과·네트워크 오류(rc 6)·인증·권한·경로 오류(rc 3·5·7)·설정 없음이면 그 호출의 남은 전송을 건너뛴다. `dflow.sh` rc 2 는 stderr 로 가른다: JSON 본문이면 API 4xx 거절이라 그 건만 경고하고 나머지는 계속 보내고, 글이면 설정 없음이라 무출력으로 남은 전송을 건너뛴다. `enabled=false`, `dflow.sh` 없음, D'Flow 설정(PAT) 미로드(`dflow.sh` 종료 코드 2)는 아무 출력 없이 건너뛴다. `COORD_DRY=1` 이면 보내지 않는다.

**D'Flow 설정 로드**: 스킬 폴더(심링크) 경로에서 설정을 읽으면 다른 리포의 PAT 로 404 가 난다. `dflow.sh` 는 항상 리포 루트(`coord_repo`, 곧 `git rev-parse --git-common-dir` 의 부모인 메인 체크아웃)를 cwd 로, 환경 변수 `DFLOW_CONFIG_DIR` 를 지정해 실행한다. 이미 `DFLOW_CONFIG_DIR` 가 있으면 그 값을 쓴다.

### 4.1 콘솔 폴러 (오피스 → 로컬 세션 · 로컬 세션 → 오피스)

서버 쪽 대기열·엔드포인트·상태 전이는 `dflow-work/references/api-contract.md` §2.12 가 정본이다. 이 절은 **로컬 폴러**의 규칙이다.
구현은 `scripts/console-poll.sh` 하나이고 조정자(coordinator)와 `/dflow-team` 이 함께 쓴다. LLM 을 부르지 않는다(Claude 토큰 0).

**단위·잠금**: PC 하나 × 신원 하나당 폴러 하나. `~/.dflow/console/poller-<신원>.lock/`(mkdir, 안에 `pid`·`since`)로 단일 실행을 보장한다.
잠금이 있어도 그 `pid` 가 죽었으면 탈취한다. 신원은 `office.sh` 와 같은 슬러그(`<신원>/<host>` 의 앞 칸)이고 PAT 는 `dflow.sh profiles` 에서 슬러그가 같은 키를 `--as` 로 고른다.
`DFLOW_CONFIG_DIR`·cwd 규칙은 위 「D'Flow 설정 로드」 와 같다.

**주기**: 30초(서버 watch 응답의 `console.poll_s` 가 있으면 15~120 으로 잘라 따른다). 한 주기는 아래 세 일을 순서대로 하고, 한 일의 실패가 나머지를 막지 않는다.

1. **생존 감시(서버 지원과 무관하게 늘 한다)**: `_session/*.json` 의 `pid` 와 열린 회차 레인의 `session.pid` 를 `kill -0` 으로 확인해 죽은 대상의 오피스 키를 stop 한다(§4 「생존 판정」). 확인할 조정 세션·열린 회차·팀장 기록이 하나도 없으면 폴러는 두 주기 연속 빈 채로 보고 스스로 끝난다.
2. **프롬프트 전달**(watch 응답에 `console` 칸이 있는 서버에서만): `dflow.sh console-poll --host <host>` → 프롬프트마다 대상 해석 → 안전 입력 → `console-ack`.
3. **화면 올리기**(2 와 같은 조건): 해석되는 대상마다 화면 끝 40줄을 읽어 가린 뒤 `console-screen` 으로 올린다.

**대상 해석** — `target_kind`·`target_ref` 를 이 PC 의 터미널 핸들로 바꾼다. 이 PC 에서 찾지 못하면 `refused`·`target-not-found`, 둘 이상이면 `refused`·`ambiguous`.

| `target_kind` | 핸들을 찾는 곳 |
|---|---|
| `coord_lead` | `<state_dir>/_session/<ref>.json` 의 `handle`(없으면 그 세션의 열린 회차 `.run.coordinator.handle`) |
| `coord_lane` | `<state_dir>/*/state.json` 중 `.run.closed_at` 이 null 인 회차의 `lanes[<ref>].session.handle`(레인 `state` 가 closed 가 아닌 것). 둘 이상의 열린 회차에 같은 레인 이름이 있으면 `ambiguous` |
| `team_lead` | `~/.dflow/console/lead/*.json`(아래) 중 `pid` 가 살아 있는 것의 `handle`. 둘 이상이면 `ambiguous` |
| `team_worker` | 위 팀장 기록의 `agent`·`repo` 로 `lead-state.sh --agent … --repo …` 를 읽어 `SLOT` 의 슬롯이 `<ref>`(`w<n>` 의 `n`)인 줄의 `handle` |

- 조정 팀장 핸들은 조정 세션이 시작할 때 `_session/<세션8>.json` 의 `handle` 과 `.run.coordinator.handle` 에 자기 Orca 핸들을 적는다(`init` 이 못 채우던 칸이다). 핸들을 알 수 없으면 비워 두고 그 대상은 `target-not-found` 가 된다.
- **팀장 핸들 기록(`/dflow-team`)**: 팀장이 시작할 때 `~/.dflow/console/lead/<MAIN 경로 cksum>.json` 에 `{"agent":"<신원>/<host>/lead","repo":"<MAIN>","handle":"<h>","pid":<팀장 PID>,"at":"<iso>"}` 를 쓰고 마감할 때 지운다.
- 대상이 이 PC 의 터미널 목록(`term_list`)에 없으면 핸들이 stale 인 것이므로 `refused`·`stale` 이다.

**안전 입력**: `term-send-safe.sh --handle <h> --allow-busy --text-file <f>` 하나로만 넣는다(다른 경로로 터미널에 쓰지 않는다). 폴러는 보내기 전에 서버를 믿지 않고 본문을 다시 정리한다: 줄바꿈(CR·LF·U+2028·U+2029)·탭을 공백 하나로 → 나머지 제어 문자(C0·C1·DEL) 제거 → 앞뒤 공백 제거(연속 공백은 접지 않는다 — 줄바꿈을 먼저 지우면 단어가 붙는다). `!` 가 있으면 보내지 않고 `refused`·`bang-in-text`, 정리 뒤 비면 `refused`·`error`.
`term-send-safe.sh` 의 결과를 ack 로 옮긴다:

| 결과 | ack |
|---|---|
| `SENT <h> <turn_started\|submitted\|accepted>` | `sent` + `detail` |
| `REFUSED <h> compacting` | `retry` + `compacting`(만료까지 30초마다 다시 시도) |
| `REFUSED <h> stale` | `refused` + `stale` |
| `REFUSED <h> prompt-open` / `draft-in-input` / `bang-in-text` | `refused` + 같은 사유 |
| 그 밖(종료 코드 비정상 등) | `refused` + `error` |

**1회 전달**: poll 이 `claimed` 로 바꾼 뒤에만 보내고, ack 하기 전에 폴러가 죽으면 서버가 120초 뒤 `unknown` 으로 닫는다. 폴러는 다시 시작해도 이전에 claim 한 행을 모르고, 모르는 채로 다시 보내지 않는다. ack 가 네트워크로 실패하면(rc 6) 같은 인자로 세 번까지 다시 부르고 그래도 안 되면 포기한다(서버가 `unknown` 으로 닫는다). **`retry` ack 를 다시 부를 때 404 가 오면 이미 반영된 것으로 본다**(서버가 `retry` 를 받으면 `claim_token` 을 비워 같은 토큰이 더는 통하지 않는다).

**머리글**: 터미널에 넣는 글은 한 줄이다.

```
[오피스→<ref>] 프롬프트: <본문>
```

`<ref>` = `coord_lane` 이면 레인 이름, 두 팀장(`coord_lead`·`team_lead`)이면 `lead`, `team_worker` 이면 그 슬롯의 주문 `id8`. 형식 `^[A-Za-z0-9._-]{1,40}$` 이어야 하고 아니면 `lead` 로 쓴다.
Messages 창(`lane-tools` 의 `mail.tsx`)은 사용자 입력의 첫머리에서 정규식 `^\[오피스→([A-Za-z0-9._-]{1,40})\] 프롬프트: ([\s\S]*)$` 를 찾아 peer 「오피스」, via `office` 로 보인다. `cross-session-message` 태그는 흉내 내지 않는다.

**화면 수집·가림**: `term_read_screen <h> 40` 의 결과를 이 순서로 가공한다.

1. ANSI 이스케이프(CSI·OSC)와 제어 문자(탭 제외)를 지운다. 줄 끝 공백을 지운다. 한 줄은 400자(코드포인트)로 자른다.
2. **비밀 모양 문자열을 `[가림]` 으로 바꾼다.** 한 줄씩 아래 규칙을 모두 적용한다(앞 규칙이 바꾼 자리는 다시 보지 않아도 된다).

   | # | 규칙 | 값 |
   |---|---|---|
   | 1 | Anthropic·OpenAI 형 키 | `sk-` 로 시작하고 `[A-Za-z0-9_-]{16,}` 가 이어지는 것 |
   | 2 | D'Flow PAT | `dflow_pat_` + 공백 아닌 문자 연속 |
   | 3 | JWT | `eyJ…` 로 시작하는 점 둘의 세 토막(`eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*`) |
   | 4 | 값이 붙는 이름 | `password`·`passwd`·`pwd`·`secret`·`token`·`api_key`·`apikey`·`api-key`(대소문자 무시) 뒤 `=` 또는 `:` 와 공백 아닌 값 → 이름과 구분자는 두고 값만 가림 |
   | 5 | Authorization 헤더 | `Authorization:` 뒤 한 줄 전부, 그리고 `Bearer <값>` 의 값 |
   | 6 | 긴 base64·hex | 연속 40자 이상의 `[A-Za-z0-9+/_=-]`. 단 경로·단어 오탐을 줄이기 위해 대문자·소문자·숫자 중 둘 이상을 섞은 것, 또는 `[0-9a-fA-F]{40,}`(hex)만 가린다. 40자 hex(git 전체 SHA)도 가려지는 것을 받아들인다 |

   가림 규칙은 `tests/` 의 단위 시험으로 고정한다: 위 여섯 종류 각각의 가려지는 예와, 가려지면 안 되는 예(40자 이하의 평범한 단어·소문자만의 긴 경로 `src/frontend/packages/shared/src/components/AgDataGrid`·7~12자 짧은 SHA·40자 미만 hex)를 둔다. 짧은 SHA(7~12자)는 가리지 않는다는 것을 시험으로 고정한다.
3. 마지막 40줄을 남기고, 합계 8KB(UTF-8) 를 넘으면 앞쪽 줄부터 버린다. 가림이 끝난 줄들의 sha256(hex)을 `sha` 로 한다.

화면은 **`sha` 가 바뀐 것만** 전체(`lines` 포함)로 올리고, 같으면 touch(`lines` 없음)만 보낸다. 서버가 `need_full` 을 돌려주면 다음 주기에 전체를 올린다. 올리기 전에 가림을 건너뛰는 경로는 없다(가림 함수 실패 시 그 대상은 올리지 않는다).

**기동·정지**: `start` 는 잠금을 잡고 백그라운드로 루프를 띄운다(`CONSOLE_POLLER started|running|skipped`). 부르는 곳:
조정자 `coord-state.sh init`(회차를 열 때)·`/dflow-team` 시작, 정지는 `coord-state.sh close-run`(이 PC 에 열린 회차·살아 있는 팀장 기록이 모두 없을 때만)·`/dflow-team` 마감이다.
`start` 는 늘 안전하게 여러 번 부를 수 있다(이미 돌면 `running`). 폴러가 스스로 끝나는 조건은 위 「생존 감시」 의 두 주기 연속 빈 상태다.

**실패 정책**: §4 와 같다 — 어떤 실패도 부른 쪽 동작을 막지 않고, 폴러 안에서는 한 주기의 실패가 다음 주기를 막지 않는다. 비밀값(토큰·claim_token·원문 화면)은 로그에 남기지 않는다. 로그에는 시각·대상·결과·사유만 적는다.
