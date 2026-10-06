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
| `usage.spawn_week_max` | `95` | 새 레인·새 Pane 을 띄울 수 있는 1주 사용률 상한(%). 이 값 미만이면 띠(Y·O)와 상관없이 띄운다. 5시간 사용량이 높을 때는 모델 등급·동시 agent 수로만 조절한다 |
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
| `workflow.agents_by_band` | `{"G":2,"Y":2,"O":2,"R":0}` | 레인당 동시 agent 상한. 속도 조정(2026-10-06)으로 R 말고는 띠와 상관없이 2 |
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
| `approvals.watch_every_s` | `10` | `prompt-watch.sh --follow` 의 화면 읽기 간격(초). 읽을 때마다 `orca terminal read` 가 Electron 노드를 띄워 CPU 를 쓰므로 3초는 레인이 늘면 부하가 크다 |
| `approvals.screen_cache_s` | `20` | 폴러가 남긴 레인 화면 캐시(§4.1 「레인 화면 캐시」)를 `prompt-watch.sh` 가 믿는 시간(초). 이 안에 읽은 신선한 캐시가 있으면 orca 를 부르지 않고 그 화면으로 「창이 떴는가」 를 판정한다. `0` 이면 캐시를 쓰지도 읽지도 않고 늘 직접 읽는다. 자동 응답 재판정은 이 값과 무관하게 늘 직접 읽는다 |
| `approvals.auto_allow_spawned` | `["read","status","edit-own","commit-own","heavy-build"]` | 조정자가 띄운 세션(`spawned_by=coordinator`)의 자동 승인 범주. 거부 칸은 여기에 넣어도 늘 거부 |
| `restart_rules` | `[]` | `[{"glob":"src/backend/**","note":"세 서버 내린 뒤 jar 빌드·재기동"}]` |
| `office.enabled` | `true` | 에이전트 오피스 표시(§4). false 면 `office.sh` 는 아무것도 하지 않는다 |
| `office.project_id` | `null` | 오피스에 표시할 D'Flow 프로젝트 UUID. 있으면 `watch --project` 로 넘기고, 비면 생략(`dflow.sh` 가 `.dflow` 의 기본값을 쓴다) |
| `office.label_max` | `40` | 팀원 키에 넣는 지시 요약의 최대 글자 수(키 전체는 늘 120자 이내) |
| `office.dflow_script` | `null` | `dflow.sh` 경로(리포 기준 상대 허용). null 이면 킷 기준 `../../dflow-work/scripts/dflow.sh` |
| `office.quiet_min` | `30` | 팀장 자리 요약(§4)의 `lanes.quiet`: 살아 있는 레인 중 마지막 보고(없으면 지시) 뒤 이 분 넘게 조용한 레인 |
| `console.keys_enabled` | `false` | 오피스의 웹 키 입력 답하기(§4.1 「키 입력 답하기」) 켬. 기본 꺼짐 — 환경 변수 `COORD_CONSOLE_KEYS_ENABLED=1` 로도 켠다 |
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
          "cron_id": null, "usage_band_notified": null, "closed_at": null, "last_tick_at": null},
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
- `run.closed_at` = 회차를 마감한 시각(ISO)이고, 열린 회차는 `null`. `coord-state.sh close-run`(또는 `event run-closed`)만 쓴다. 이 칸이 비고 다른 조정 세션이 연 회차는 `init` 이 조건 없이, `tick.sh` 는 살아 있는 레인이 있고 `state.json` 이 120분 넘게 조용할 때만 `STALE_RUN` 으로 알린다(경고뿐, 자동 마감하지 않는다). 계약에 없는 칸(`.run.state` 등)으로 마감을 표시하지 않는다.

## 3. 스크립트

모든 스크립트는 `scripts/` 아래, `#!/usr/bin/env bash`, `set -uo pipefail`, 첫 줄 아래에 사용법 주석. 공통 함수는
`scripts/lib/common.sh`(설정·회차·시각·잠금·로그), 터미널은 `scripts/lib/term.sh`(어댑터) 에서만 부른다.
macOS(BSD `date`·`stat`) 와 GNU(Git Bash 포함) 양쪽에서 돈다. 기계가 읽는 결과는 **stdout**, 사람용 설명·경고는 **stderr**.
보내기·닫기 같은 부작용이 있는 스크립트는 모두 `--dry-run`(하려던 명령을 stderr 에 `DRY` 로 찍고 실제로 하지 않음)을 받는다. dry-run 의 성공 줄은 보냈다면 나왔을 줄 앞에 `DRY ` 를 붙인다(`DRY SENT <h> -`, `DRY SPAWNED … handle=-`). 거부 판정 줄은 원래 형식 그대로다. 값을 모르는 칸은 `-` 로 낸다(`for=-m`, `ctx=-%`, `heavy=-/-/-`).
비밀값(토큰·키)은 어떤 출력·로그·이벤트에도 남기지 않는다.

종료 코드: 0 정상(판정 결과가 부정이어도 0), 2 사용법 오류, 3 설정·회차 없음, 4 외부 도구 실패.

### 3.1 `lib/common.sh`

`coord_cfg <jq경로>`(값, 없으면 빈 줄) · `coord_cfg_json <jq경로>` · `coord_repo` · `coord_run_dir [run-id]` ·
`coord_now_iso` · `coord_now_epoch` · `coord_iso_to_epoch <iso>` · `coord_lock <dir>`/`coord_unlock <dir>`(mkdir 잠금 `<dir>.lock/`, 안에 주인 `pid`·`pstart`, 30초 대기 뒤 실패. 주인이 죽었거나 잠금이 `COORD_LOCK_STALE_S`(60초)보다 오래됐으면 탈취 잠금 아래에서 옮기고 새로 잡는다. unlock 은 주인이 나일 때만 푼다) ·
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
| `prompt-watch.sh` | `<레인>` \| `--handle <h>` \| `--lanes a,b,c` `[--follow <초>] [--every <초>]` | `NONE <h>` 또는 `PROMPT <h> <trust|usage-limit|permission|question|choice>` 다음 줄부터 `---` 로 감싼 화면 발췌. `--follow` 는 감지할 때까지(최대 초) `--every` 간격(기본 `approvals.watch_every_s`=10, 직접 주면 그 값) 반복. `--lanes` 는 한 프로세스에서 레인을 차례로 보며 줄 형식은 같고 줄 앞에 `<레인> ` 이 붙는다(`<레인> PROMPT <h> <kind>`·`<레인> NONE <h>`): 레인마다 창이 새로 뜨거나 종류가 바뀔 때 한 번 블록을 내고 끝나지 않고 계속 보며(`--follow` 시간이 다하면 레인마다 `NONE` 줄), 창이 사라지면 그 레인을 다시 새로 뜨는 것으로 센다. 같은 종류의 창이 사이에 「창 없음」 표본 없이 이어져도(권한 창 A → B) 창 지문(`full`)이 바뀌면 새 창으로 다시 알린다: 알린 창의 식별자는 종류 + 지문이고, 지문은 캐시 json 의 `full` 이며(직접 읽은 화면은 `lib/console-input.sh` 의 `console_full_sha` 로 같은 방식으로 계산) 창 부분의 지문이라 상태줄·사용량 숫자만 바뀐 같은 창은 다시 알리지 않는다. **한계**: 지문이 없는 창(머리를 못 찾음 — §4.1)은 종류로만 비교하므로, 그런 창끼리 사이 표본 없이 이어지면 한 번만 알린다(지문이 한쪽에만 있어도 종류로만 비교). 단일 모드(`<레인>`·`--handle`)는 첫 감지에서 끝나 이 비교가 없고, 응답 뒤 `screen_cache_s` 초 안에는 낡은 캐시가 이미 처리한 창을 다시 `PROMPT` 로 낼 수 있다(무해: `auto-answer.sh` 가 직접 읽어 `NONE`). **화면 캐시**: 폴러가 도는 동안은 `$DFLOW_CONSOLE_DIR/screen/<핸들>.json`(§4.1)의 `read_at_ms` 가 `approvals.screen_cache_s`(기본 20초, 0 이면 끔) 안이면 orca 를 부르지 않고 캐시 화면의 마지막 40줄로 판정한다(출력 형식은 그대로). 없음·낡음·깨짐·폴더·파일이 현재 사용자 소유·권한 700/600 이 아니거나 심볼릭 링크이거나 json 의 kind 가 화면 판정과 다르면 조용히(오류 없이) 직접 읽는다. `permission` 의 120줄 재읽기는 늘 직접 읽고, 그 화면에 권한 창이 없으면(그사이 사라짐) 이미 읽은 40줄(캐시·직접) 화면으로 발췌한다. `--follow` 는 신선한 캐시가 있는 동안 캐시 json 이 바뀐 때만 새로 판정하고(같은 창은 위 seen 규칙대로 다시 알리지 않는다), 캐시가 낡거나 사라지면(폴러가 꺼짐) 그때부터 직접 읽는다. **보안 경계**: 캐시는 「창이 떴는가」 감지와 Monitor 알림 전용이다 — `auto-answer.sh`·`term-send-safe.sh`·폴러 키 행·`console-poll.sh judge-sha` 의 재판정은 캐시를 읽지 않고 늘 터미널을 직접 읽는다(캐시가 최대 `screen_cache_s` 늦거나 틀려도 응답은 직접 읽은 화면대로). **감지 지연 상한**: 폴러가 도는 동안에도 캐시가 `screen_cache_s`(20초)보다 오래되면 직접 읽어 새 창을 잡으므로, 새 창은 최대 `screen_cache_s`(20) + `--every`(10) = 30초 안에 알린다 |
| `search.sh` | `[--tab\|--print] [--cwd <폴더>] [--timeout <초>] <질의…>` | `SEARCH ok <답 파일> <초>` 또는 `SEARCH fail <no-command|timeout|error|empty> <사유>`. 답은 회차 `searches/` 폴더(회차가 없으면 `$TMPDIR/coord-searches/`)에 쓴다 |
| `glm-preflight.sh` | 없음 | `ok <host> <model> <초>` 또는 `fail <alias|host|call|model> <사유>` |

### 3.4 상태 쓰기

`coord-state.sh <하위명령>`:

| 하위명령 | 하는 일 · stdout |
|---|---|
| `init <run-id> [--goal 글] [--rules-doc 경로]` | 회차 폴더·빈 state.json 생성, current 지정 · `RUN <run-id> <폴더>`. 현재 세션 id(`COORD_SESSION_ID` → `CLAUDE_CODE_SESSION_ID`)와 조정 세션 pid(`CLAUDE_PID`, 없으면 0 — 생존 판정에서 빠지고 TTL 에 맡긴다)를 `.run.coordinator.session_id`·`.pid` 에 적는다. 같은 세션 id 의 다른 열린 회차가 있으면 회차는 만들되(**자동 마감하지 않는다**) stderr 경고와 stdout `SESSION_RUNS <세션8> open=<n>` 한 줄을 낸다 — 팀장 칸은 그 회차들과 공유된다. 그 밖의 세션의 마감 표식 없는 회차는 `STALE_RUN <run-id> open session=<id\|-> idle=<분>m`(경고만) |
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
| `term-send-safe.sh` | `--handle <h>` \| `--lane <레인>`, `--text <글>` \| `--text-file <f>`, `[--timeout-ms 300000] [--raw [--expect-sha <sha>]] [--allow-busy] [--over-draft]` | `SENT <h> <turn_started|submitted|accepted>` 또는 `REFUSED <h> <stale|not-idle|interrupt-visible|prompt-open|compacting|bang-in-text|draft-in-input|no-prompt|lane-busy|prompt-changed>`. `--raw` 는 확인 창 응답(`1`·`2`)용: tui-idle 검사 없이 확인 창이 보일 때만 보낸다. `--raw` 에 `--lane <레인>` 을 주면 핸들 찾기에 더해 폴러·auto-answer 와 같은 레인 잠금(§4.1)을 쥐고(못 얻으면 `lane-busy`, 막 보낸 같은 창이면 `prompt-changed`) 보낸 뒤 보낸 표식을 남기고, `--expect-sha <sha>`(`console-poll.sh judge-sha` 의 창 지문 — 가리기 전 원문 창의 sha, §4.1 `full`)를 주면 잠금 안에서 다시 읽은 화면의 값이 다르거나 지문이 없을 때 `prompt-changed` 로 보내지 않는다. **`--expect-sha` 는 `--lane` 필수**(없으면 사용법 오류 종료 코드 2 — 잠금 없이 보내지 않는다). `--lane` 을 주면 화면을 41줄 읽고, `SENT` 직후 잠금 안에서 같은 창 기록에만 처리됨·소비를 남긴다. `--allow-busy` 는 작업 중 세션에도 넣는다(Claude Code 가 작업 중 입력을 다음 차례로 받아 둔다): tui-idle 대기와 `esc to interrupt` 거절(`not-idle`·`interrupt-visible`)을 건너뛰고, `stale`·`bang-in-text`·`prompt-open`·`compacting`·`draft-in-input` 판정은 그대로 한다. 옵션이 없을 때의 동작·출력은 불변이다 |
| `compact-lane.sh` | `<레인> [--force-no-memo]` | `COMPACT_REFUSED <레인> <merge-in-flight|measure-lane|no-memo|cooldown|unsupported-kind|no-handle|term-send-safe 거부 사유>` · `COMPACT_DONE <레인> before=<n> after=<n>` · `COMPACT_TIMEOUT <레인>` |
| `spawn-lane.sh` | `--name <n> --kind <claude|glm|opencode> [--worktree <경로|선택자>] [--model m] [--effort e] [--autocompact t] [--prompt-file f]` | `SPAWNED <n> handle=<h> pid=<pid|-> session_id=<id|->` 또는 `SPAWN_FAIL <n> <wait|process|screen|preflight|glm-cap> <사유>`. glm 은 preflight 실패 시 `SPAWN_FAIL … preflight` (대체 여부는 조정자가 정한다) |
| `close-lane.sh` | `<레인>` \| `--handle <h>` | `CLOSED <레인> handle=<h>` 또는 `CLOSE_REFUSED <레인> <bg-running|worktree-left|branch-left|not-reported>` (worktree·branch 는 경고만, `--force-report` 로 통과) |
| `measure-window.sh` | `open <kind> [--lane <레인>] --until <iso> [--hold-heavy]` · `close` · `status` · `quiet-check` | `WINDOW_OPEN <kind> until=<iso> hold_job=<id|->` · `WINDOW_CLOSED <kind>` · `WINDOW <kind> lane=… until=…`/`WINDOW none` · `QUIET yes|no run=<n> per_core=<f> procs=<n>` |
| `auto-answer.sh` | `--lane <레인>` \| `--handle <h>` | `NONE <h>` · `ANSWER <h> <kind> <키> <사유>` · `DENY <h> <kind> <사유>`(Esc) · `ESCALATE <h> <kind> <사유>`(아무것도 안 보냄, 조정자가 판단 올리기 또는 사용자에게). 판정표는 `references/approvals.md` §5. 권한 창의 명령·질문·선택지는 지문과 같은 한 번의 창 판정(`console_window_json`)의 창 안에서만 읽고, 허용(ANSWER)은 질문 줄이 정확히 `Do you want to proceed?` 이고 도구 이름 줄이 `… command` 인 창만이다(그 밖의 권한 창은 거부 칸이면 DENY, 아니면 `ESCALATE … not-proceed|not-command|window-shape`). trust·usage-limit·question·choice 도 같은 창의 모양과 kind 확인 문구가 창 안에 있을 때만 답하고 아니면 `ESCALATE … window-shape`(§4.1 `full`). 판정에 쓴 화면의 창 지문(가리기 전 원문 창의 sha, §4.1 `full`)을 기억했다가 레인 잠금을 얻은 뒤 보내기 바로 앞에 다시 읽은 화면과 비교해, kind 가 같아도 다르면 아무것도 보내지 않고 `NONE <h>`(다음 틱이 처음부터 다시 판정). 지문을 못 만들면 `ESCALATE <h> <kind> no-fingerprint` |
| `statusline-dump.sh` | stdin = statusLine JSON | `<state_dir>/ctx/<session_id>.json` 에 `{at,session_id,context_window,rate_limits}` 저장 뒤 `COORD_STATUSLINE_NEXT` 명령이 있으면 같은 stdin 으로 실행해 그 출력을 그대로 낸다 |
| `console-poll.sh` | `[--once] [--dry-run]` \| `start` \| `stop` \| `status` \| `input-handled (--lane <레인> \| --lead <세션8>) --by <coordinator\|auto>` \| `judge-sha --lane <레인>` | 정본 §4.1. `judge-sha` → `JUDGE <h> <kind> <창 지문(가리기 전 원문 창의 sha)>`·`NONE <h>`·`STALE <h>`·`NOFP <h>`(창 머리를 못 찾아 지문 없음 — 직접 보내지 않는다). `start` → `CONSOLE_POLLER started pid=<pid>`·`CONSOLE_POLLER running pid=<pid>`·`CONSOLE_POLLER skipped <사유>`, `stop` → `CONSOLE_POLLER stopped`·`CONSOLE_POLLER none`, `status` → `CONSOLE_POLLER up pid=<pid> since=<iso> cycle=<초>`·`CONSOLE_POLLER down`. 본문 루프는 stdout 에 아무것도 쓰지 않고 로그를 `~/.dflow/console/poller-<신원>.log` 에 남긴다 |
| `office.sh` | `lead-up` \| `lead-sync` \| `lane-up <레인>` \| `lane-state <레인> <작업 중\|대기\|머지 중\|답 대기\|끝\|auto>` \| `lane-down <레인>` \| `beat` \| `finish` \| `reap [--state-dir <경로>]` | 없음(늘 종료 코드 0, 사용법 오류만 2). 경고는 stderr 한 줄. 정본 §4. `lead-sync` 는 이 세션의 팀장 칸(라벨·자리 요약)을 다시 보낸다(폴러가 입력 요청 기록을 바꾼 직후). `reap` 은 현재 회차 없이 돌고 상태 뿌리를 `--state-dir` → `COORD_STATE_ROOT` → 설정 `state_dir` 순으로 정한다 |

### 지원 환경: macOS · Git Bash(윈도우)

- 필요 도구: bash 3.2+, git, curl, **jq**, openssl 또는 sha256sum, orca CLI, node(드문 경로 — 변이 검증·포트 폴백)·python3(선택). Git Bash 에는 jq·node·orca 가 기본 제공이 아니다(설치 필요).
- 플랫폼 차이(stat·date·프로세스 표·후손 종료·pgrep/pkill·cwd·sha256)는 `scripts/lib/compat.sh` 한 곳에 모은다. Git Bash 는 `ps -o`·`pgrep`·`lsof` 가 없어 `/proc/<pid>/{ppid,cmdline,cwd}` 를 읽는다.
- **작성 규칙**: 스크립트에 macOS 전용 명령·옵션(`ps -axo`·`pgrep`·`pkill`·`lsof`·`stat -f`·`date -r/-j/-v`·`sed -i ''`·`shasum`)을 직접 쓰지 않고 perl 을 쓰지 않는다. `BSD || GNU` 사슬은 GNU 를 앞에 둔다(GNU `stat -f` 는 `?` 와 rc 0). 정본·도구 표·한계: `../../_shared/platform-support.md`.
- 윈도우에서 얻을 수 없는 값(프로세스 누적 CPU·시작 시각·부하)은 「관측 불가」로 열어 둔다: `stall-check.sh` 는 STALL 을 내지 않는다.

## 4. 에이전트 오피스 표시 계약

조정 세션(팀장)과 레인(팀원)을 wbs-web 의 에이전트 오피스에 **표시 전용**으로 보인다. WBS 데이터(작업·lease·진도율)는 건드리지 않는다. 표시 경로는 `dflow.sh watch`(POST `/api/v1/agent/watch`, `agent_watchers`) 하나뿐이다. 구현은 `scripts/office.sh`, 화면(wbs-web)은 아래 규칙으로 읽는다.

**agent 키**

| 대상 | 키 | 비고 |
|---|---|---|
| 팀장 | `<신원>/<host>/coord:<세션8>` | **조정 세션당 하나**다(회차가 아니다). `<세션8>` = 조정 세션 id(`COORD_SESSION_ID` → `CLAUDE_CODE_SESSION_ID`)의 앞 8자를 소문자 `[a-z0-9]` 로 거른 값, 세션 id 를 모르면 `p<조정 세션 pid>`, pid 도 모르면 회차 id(이 경우 키가 회차 단위로 돌아가므로 `init` 이 stderr 경고를 낸다). `slots` = 그 세션의 **열린 회차 전부**(`run.closed_at` 이 null) 에서 합산한 살아 있는 레인 수(state 가 closed 가 아닌 레인), `busy` = 그중 작업 중·머지 중 레인 수. 레인이 0 이어도 `slots 0 busy 0` 을 보낸다. 회차가 열리고 닫혀도 키는 바뀌지 않고, 그 세션의 **마지막 열린 회차를 닫을 때만** 내린다. 서로 다른 세션 id 의 조정 세션 둘은 팀장 둘이다(정상) |
| 팀원 | `<신원>/<host>/임시:<레인>·<지시 요약>` | `until` 칸에 상태 라벨. `slots`·`busy` 는 보내지 않는다. 레인 이름은 키에서 40자로 잘리므로 `lane-add` 가 40자를 넘는 이름을 거절한다 |

- `<신원>/<host>` 는 `dflow.sh` 의 `watcher_id_default`(`<신원>/<host>/poll`)에서 마지막 토막만 뗀 값이다(신원 = `/me` 의 user_email 로컬 파트, host = hostname 첫 토막, 둘 다 소문자 `[a-z0-9-]` 슬러그). 킷에 PC별 이름을 박지 않는다. 신원은 `state.json` 의 `.office.user` 에 캐시한다.
- **팀장 토큰(화면 파싱 규칙)**: 마지막 `/` 뒤 토막이 `coord:` 로 시작하면 팀장(조정)이고 `:` 뒤가 조정 세션 식별자(`<세션8>`)다. 화면은 이 값을 해석하지 않고 그대로 식별자로만 쓴다. 옛 형식 `…/coord:<run-id>`·`…/coord`(식별자 없음)도 팀장으로 읽되, 새 호출은 **옛 키를 새 키로 바꾸는 첫 beat 에서** 옛 키를 stop 한 뒤 새 키를 보낸다.
- **조정 세션 기록**: 팀장은 회차가 아니라 세션에 속하므로 `<state_dir>/_session/<세션8>.json` 에 `{"key","session_id","host","user","pid","handle","sent_at","slots","busy"}` 를 둔다(`office.sh` 가 `coord-state.sh` 와 같은 mkdir 잠금으로만 쓴다). `pid`·`handle` 은 조정 세션 프로세스·Orca 핸들이다. 회차의 `.office.sent._lead` 는 더 쓰지 않는다. 이 세션의 열린 회차 집합은 `<state_dir>/*/state.json` 중 `.run.coordinator.session_id` 의 앞 8자가 `<세션8>` 이고 `.run.closed_at` 이 null 인 것이다.
- **생존 판정은 프로세스 기준**이다(틱 beat 는 보조). PC 단위 폴러(`console-poll.sh`, §4.1)가 30초마다 `_session/*.json` 의 `pid` 를 `kill -0` 으로 확인해 죽었으면 그 세션의 팀장 키와, 그 세션 회차들의 `.office.sent` 에 남은 팀원 키를 즉시 stop 하고 기록을 지운다. 팀원 키는 레인 세션 pid(`lanes.<레인>.session.pid`)가 죽었을 때도 같은 처리를 한다. pid 를 모르면(0·빈 값) 그 대상은 프로세스 판정에서 제외하고 TTL(70분)에 맡긴다. 마감이 빠진 채 세션이 죽어도 TTL 70분 동안 유령이 남지 않는다.
- **팀원 슬롯 토큰(화면 파싱 규칙)**: 마지막 `/` 뒤 토막이 `임시:` 로 시작하면 팀원이다. `임시:` 뒤가 `<레인>·<요약>` 이고 **첫 `·` 가 레인과 요약의 경계**다(요약 안에는 `·` 가 있어도 된다). 지시 요약이 비면 `·` 없이 `임시:<레인>` 만 온다. 레인 이름에는 `·`·`/` 가 없다(`[A-Za-z0-9._-]`).
- **지시 요약** = 레인 `brief`(`coord-state.sh lane-add <레인> '{"brief":"한 줄"}'`) → 없으면 레인 `goal` → `title` → `memo` 첫 줄. 모두 비면 요약 없음. 항목 제목은 쓰지 않는다(항목을 끝낼 때마다 키가 바뀌어 슬롯이 새로 생긴다). 이미 올라간 레인에 `lane-add` 로 `brief` 를 바꾸면 바로 반영하고, 그 밖의 경로는 다음 beat 에서 반영된다. 개행·탭은 공백 하나로, 슬래시는 제거, 앞뒤 공백 제거 뒤 `office.label_max`(기본 40)자로 자른다. 레인 이름은 키에서 40자로 자르고, 키 전체(머리 부분 포함)는 120 이내라 레인 이름이 길면 요약이 더 줄어든다. **길이는 서버가 JS `.length`(UTF-16 코드 유닛)로 재므로 UTF-16 단위로 세고 자른다**(이모지 한 글자는 2, 쌍을 쪼개지 않는다). `label_max` 와 120 도 같은 단위다.
- **상태 라벨(until, 16자 이내)**: 팀원은 `작업 중`·`대기`·`머지 중`·`답 대기`·`끝` 중 하나다. `auto` 판정은 state.json 과 **입력 요청 기록**(아래 「레인 요약·팀장 자리 요약·입력 요청」)으로 한다: 레인 `state=closed` → `끝`, 살아 있는 입력 요청 기록 → `답 대기`, `merge.in_flight.lane` → `머지 중`, `hold` 가 있거나 `state=closing` → `대기`, 그 밖 `작업 중`(우선순위 `끝` > `답 대기` > `머지 중` > `대기` > `작업 중`).
- **조정 팀장의 `until`**: `조정 중` 또는 `답 대기` 둘뿐이고 팀장 watch 마다 늘 싣는다. 이 세션의 열린 회차 중 하나라도 `pending_user` 가 비어 있지 않거나 팀장 입력 요청 기록(`coord_lead_<세션8>.json`)이 살아 있으면 `답 대기`, 아니면 `조정 중`. `/dflow-team` 팀장(`…/lead`)의 `until` 은 종전처럼 종료 시각 라벨(`UNTIL_LABEL`)이고, 답을 기다리는 동안만 정확히 `답 대기` 를 보냈다가 끝나면 원래 값으로 되돌린다.
- **`답 대기` 판정은 화면이 아니라 기록 파일로 한다**: 화면 감지(`coord_screen_prompt_kind`: trust·usage-limit·permission·question·choice, 30초 주기)는 폴러(§4.1)의 일이고, 폴러는 감지 결과를 입력 요청 기록으로 남긴 뒤(바꾸거나 지운 직후) 레인은 `lane-state <레인> auto`, 조정 팀장은 `lead-sync` 를 부른다. `office.sh` 는 기록을 읽기만 하며 터미널을 읽지 않는다. 핸들을 모르는 세션은 기록이 없으므로 `pending_user` 판정만 남는다.
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
| `coord-state.sh set '.merge…'` 로 `in_flight` 는 그대로고 `merge.queue` 만 바뀔 때 · `set '.pending_user…'` | `lead-sync`(팀장 자리 요약·라벨) |
| 폴러가 입력 요청 기록을 쓰거나 지운 직후(§4.1) | 레인 `COORD_RUN=<그 레인의 회차> office.sh lane-state <레인> auto` · 조정 팀장 `COORD_RUN=<그 세션의 열린 회차 하나> office.sh lead-sync`(기록 파일 이름에 회차가 없으므로 회차는 부르는 쪽이 넘긴다. `current` 에 맡기면 다른 회차를 본다). 폴러가 조정 키로 `dflow.sh watch` 를 직접 보내면 요약 칸이 빠져 서버가 null 로 덮으므로 늘 이 경로로 보낸다 |
| `close-lane.sh` 가 레인을 closed 로 쓴 뒤 | `lane-down <레인>` |
| `tick.sh` 끝(`--dry-run` 제외) | `coord-state.sh set .run.last_tick_at <지금 ISO>` 뒤 `beat` — 팀장과 살아 있는 레인 전원을 같은 키로 재전송(하트비트). 끝난 레인·state 에서 사라진 레인은 stop. 개별 호출이 빠져도 beat 가 state.json 기준으로 바로잡는다. 마감 뒤에는 `.office.sent` 에 남은 키만 stop 한다 |
| `console-poll.sh` 생존 감시(§4.1, 30초마다) | `reap` — `_session/*.json` 의 `pid` 가 죽은 세션은 팀장 키와 그 세션 회차들(마감 여부 무관)의 `.office.sent` 팀원 키를 stop 한다. **`.office.finished` 표식은 남기지 않는다**(잘못 죽었다고 판정된 살아 있는 세션이 다음 beat 에서 다시 올라올 수 있어야 한다). 죽은 세션의 회차는 열린 채 남으므로 폴러·대상 해석은 「살아 있는 세션의 열린 회차」(세션 기록이 있고 pid 가 살아 있는 세션)만 센다. 세션 기록은 모든 stop 이 성공했을 때만 지운다(실패분은 다음 주기가 다시 시도). 살아 있는(또는 기록 없는) 세션의 열린 회차에서는 `session.pid` 가 죽은 레인의 팀원 키만 stop 하고 기록을 지운다. pid 0·빈 값은 판정에서 뺀다. 한 호출의 ABORT 는 호출 전체에 걸린다 |
| `coord-state.sh close-run`·`event run-closed`(`closing.md` §6) | `finish` — 레인마다 ABORT 를 풀고 이 회차의 팀원 키를 모두 stop 한다(한 건의 실패가 나머지를 막지 않는다). **팀장 키는 이 세션에 다른 열린 회차가 남아 있으면 stop 하지 않고 `slots`·`busy` 만 다시 합산해 보내며, 마지막 열린 회차를 닫을 때만 stop 한다.** `.office.finished=true` 는 늘 남기며, 그 뒤 그 회차의 `office.sh` 는 `beat` 만 동작해 stop 이 실패해 기록에 남은 키를 마저 내린다(유령 행 방지) |

`lane-state`·`lane-up` 은 키·라벨·요약 해시가 기록과 모두 같으면 보내지 않는다(beat·lead-up·lead-sync 는 늘 보낸다). 사용자가 띄운 세션처럼 `lane-up` 을 거치지 않은 레인은 다음 beat 에서 등록된다.

**실패 정책**: 어떤 실패도 조정자 동작을 막지 않는다(종료 코드 0, 경고는 stderr 한 줄). 호출당 5초 제한(`timeout` 명령이 없어 백그라운드 + kill 로 구현, 후손 프로세스까지 재귀로 죽인다). 시간 초과·네트워크 오류(rc 6)·인증·권한·경로 오류(rc 3·5·7)·설정 없음이면 그 호출의 남은 전송을 건너뛴다. `dflow.sh` rc 2 는 stderr 로 가른다: JSON 본문이면 API 4xx 거절이라 그 건만 경고하고 나머지는 계속 보내고, 글이면 설정 없음이라 무출력으로 남은 전송을 건너뛴다. `enabled=false`, `dflow.sh` 없음, D'Flow 설정(PAT) 미로드(`dflow.sh` 종료 코드 2)는 아무 출력 없이 건너뛴다. `COORD_DRY=1` 이면 보내지 않는다.

**D'Flow 설정 로드**: 스킬 폴더(심링크) 경로에서 설정을 읽으면 다른 리포의 PAT 로 404 가 난다. `dflow.sh` 는 항상 리포 루트(`coord_repo`, 곧 `git rev-parse --git-common-dir` 의 부모인 메인 체크아웃)를 cwd 로, 환경 변수 `DFLOW_CONFIG_DIR` 를 지정해 실행한다. 이미 `DFLOW_CONFIG_DIR` 가 있으면 그 값을 쓴다.

**레인 요약·팀장 자리 요약·입력 요청** (오피스·lane-tools 의 「요약만 보기」. 서버 형식 정본은 `dflow-work/references/api-contract.md` §2.12 「watch 요약 칸」)

- 셋 다 watch 본문의 추가 칸이고 `dflow.sh watch --summary-json`·`--lead-summary-json`·`--input-request-json` 으로 싣는다. **칸을 빼면 서버가 그 칸을 null 로 덮어쓰므로, 그 키로 watch 를 보내는 모든 경로(lane-up·lane-state·beat·lead-up·lead-sync·finish 의 팀장 재전송)가 매번 현재 값을 싣는다.** 새 주기 폴링은 없다 — 위 「호출 연결」 시점에만 보낸다.
- 모두 **state.json 최상위·레인 값과 입력 요청 기록 파일만으로** 만든다(터미널·orca 호출 없음). 비밀(토큰)·경로(worktree·memo·rules_doc)·핸들·pid·세션 id 는 싣지 않는다.
- 문자열 정리(서버와 같은 규칙, 해시 일치용): 제어 문자(U+0000~001F·U+007F~009F)를 지우되 줄바꿈·탭은 공백 하나로(발췌 줄은 탭까지 지운다) → 코드포인트 기준으로 자른다. 시각은 시간대(`Z`·`±HH:MM`) 있는 ISO 만 싣고 그 밖은 null. 숫자는 정수로 내리고 범위로 자른다.
- **레인 `summary`**(팀원 키): `{v:1, lane(≤60), state(≤20, 기본 active), brief(lanes.<l>.brief ≤200 — goal·memo 로 대체하지 않는다), items_done·items_total(항목 개수, weight 무시, 0~9999), hold(hold.reason ≤100|null), branch(≤120), **lead(이 레인을 가진 조정 팀장 키 `coord:<세션8>` 의 `<세션8>`, ≤40자, 그 회차 `.run.coordinator` 의 session_id 앞 8자 규칙(§4 세션8)·모르면 칸을 뺀다)**, last_report_at·last_instr_at(ISO|null), ctx_pct(.ctx.pct 정수 0~100|null), compact_pending(bool)}`. 전체 2048바이트(UTF-8, `tojson`)를 넘으면 brief → hold → branch 순으로 줄인다(실측: 최대 길이 이모지로 채워도 약 1.9KB).
- **팀장 `lead_summary`**(조정 팀장 키): `{v:1, runs:[…]}`. runs = 이 세션의 열린 회차(`slots`·`busy` 와 같은 집합) 중 `run.created_at` 기준 최근 5개를 오래된 순으로, 회차마다 `{run(회차 id ≤60), decision:{pending_user, open(= pending_user 건수), first_title(첫 건 text 첫 줄 ≤100|null)}, merge:{in_flight(≤60|null), queue:[≤10, 각 ≤60 — 문자열 또는 {lane} 의 레인 이름]}, progress:{goal(run.goal 첫 줄 ≤120|null), started_at(run.created_at), items_done, items_total(레인 항목 개수 합계)}, lanes:{working(작업 중·머지 중), waiting(대기·답 대기), done(끝), quiet:[≤10 — 끝 아닌 레인 중 마지막 보고(없으면 지시) 뒤 office.quiet_min 분 넘게 조용한 레인, 보고·지시가 모두 없으면 넣지 않는다]}, resource:{band(usage.band, UNKNOWN 이면 null), five, week(0~100 정수|null), load_adjust(load.hard_ticks), banned(load.banned 가 비어 있지 않음)}, alive:{last_tick_at(run.last_tick_at)}}`. 전체 8192바이트를 넘으면 오래된 회차부터 뺀다. `lane-down` 의 제외 레인은 `끝` 으로 센다. `tick.sh` 가 매 틱 beat 전에 `.run.last_tick_at` 을 쓴다.
- **`input_request`**(팀원 키): 폴러가 `${DFLOW_CONSOLE_DIR:-~/.dflow/console}/input/<kind>_<ref>.json`(레인 `coord_lane_<레인>.json`, 조정 팀장 `coord_lead_<세션8>.json`)에 쓰는 기록 `{"v":1,"kind":"permission|question|choice|usage-limit|trust|message","since":"<UTC ms ISO>","excerpt":["…"],"handled":null|{"by":"coordinator|auto","at":"<ISO>"}}` 을 읽어 그대로 싣는다(발췌는 아래쪽 10줄·줄당 200자로 다시 자르고, 3072바이트를 넘으면 위 줄부터 버린다). 기록이 없으면 `null` 을 싣는다(창이 사라졌다는 뜻). 파일이 없거나 JSON 이 깨졌거나 kind·since(시간대)·handled 형식이 틀리면 **없는 것**으로 본다. 기록이 있고 `handled` 가 null 이고 kind 가 `usage-limit`·`trust` 가 아니면 「살아 있는 기록」 이고 라벨이 `답 대기` 가 된다(처리됨·자동 처리 종류도 칸에는 싣는다). 쓰기는 폴러 몫이고 `office.sh` 는 읽기만 한다. **폴러는 발췌를 console-redact 로 가린 뒤 기록을 쓴다** — `office.sh` 는 다시 가리지 않고 서버도 가리지 않는다. 팀장 기록은 칸으로 싣지 않고 `until` 판정에만 쓴다.
- **자유 글 가림**: `summary.brief`·`summary.hold`(사유)·`lead_summary` 의 `decision.first_title`·`progress.goal` 과 팀원 키의 지시 요약은 `office.sh` 가 `console_redact_text`(lib/console-redact.sh)로 가리고 `/`·`~/` 로 시작하는 절대 경로 토큰을 `[경로]` 로 바꾼 뒤 싣는다. 함수가 없거나 실패하면 그 칸을 비운다(`brief`·`hold` 는 `""`, `first_title`·`goal` 은 빈 글 처리 규칙대로, 키는 요약 없이 머리만 — 실패 시 닫힘).
- **해시**: 레인은 `summary`+`input_request` 의 sha256 을 `.office.sumhash["<레인>"]`(stop 하면 지움), 조정 팀장은 `until`+`lead_summary` 의 sha256 을 세션 기록 `_session/<세션8>.json` 의 `.sumhash`(`.label` 도 함께)에 둔다. 해시는 「같은 키·같은 라벨(팀장은 같은 slots/busy)인데 요약만 바뀌었을 때 watch 를 추가로 보낼지」 판단에만 쓰고, 칸을 뺄지 정하는 데는 쓰지 않는다.
- **서버 `summary_error`**: 형식이 틀린 칸은 서버가 그 칸만 null 로 저장하고 응답에 `summary_error`(`칸: 사유 | …`)를 싣는다. `dflow.sh` 는 stderr 에 `SUMMARY_ERROR <글>` 한 줄, `office.sh` 는 경고 한 줄만 남기고 종료 코드·stdout·ABORT 판정은 그대로다.
- **조정자 읽기 규칙**: 레인 상태 판단은 이 요약(state.json)이 기본이고, 터미널 화면은 `prompt-watch.sh` 가 이상을 판정한 레인 하나만 읽는다.

### 4.1 콘솔 폴러 (오피스 → 로컬 세션 · 로컬 세션 → 오피스)

서버 쪽 대기열·엔드포인트·상태 전이는 `dflow-work/references/api-contract.md` §2.12 가 정본이다. 이 절은 **로컬 폴러**의 규칙이다.
구현은 `scripts/console-poll.sh` 하나이고 조정자(coordinator)와 `/dflow-team` 이 함께 쓴다. LLM 을 부르지 않는다(Claude 토큰 0).

**단위·잠금**: PC 하나 × 신원 하나당 폴러 하나. `~/.dflow/console/poller-<신원>.lock/`(mkdir, 안에 `pid`·`since`)로 단일 실행을 보장한다.
잠금이 있어도 그 `pid` 가 죽었으면 탈취한다. 신원은 `office.sh` 와 같은 슬러그(`<신원>/<host>` 의 앞 칸)이고 PAT 는 `dflow.sh` 의 기본 토큰이다. 한 신원에 PAT 가 여럿이거나 기본 토큰이 프로젝트 한정이면 서버가 `forbidden_role` 로 거절해 콘솔 전달이 꺼지고 아래 「프로젝트 한정 PAT」 의 안내 문구를 낸다(`dflow.sh profiles` 에서 `--as` 로 고르는 것은 후속).
`DFLOW_CONFIG_DIR`·cwd 규칙은 위 「D'Flow 설정 로드」 와 같다.

**주기**: 환경 변수 `COORD_CONSOLE_CYCLE_S`(기본 30초)로 정한다. watch 응답의 `console.poll_s` 는 읽지 않는다. 서버가 콘솔을 모르는지는 `dflow.sh console-poll`(또는 `console-screen`)의 exit 7 로 판정하고, 그러면 2·3 을 10분 쉰다. 한 주기는 아래 네 일을 순서대로 하고, 한 일의 실패가 나머지를 막지 않는다.

1. **생존 감시(서버 지원과 무관하게 늘 한다)**: `_session/*.json` 의 `pid` 와 열린 회차 레인의 `session.pid` 를 `kill -0` 으로 확인해 죽은 대상의 오피스 키를 stop 한다(§4 「생존 판정」). 확인할 조정 세션 기록(`_session/*.json`)·살아 있는 세션의 열린 회차·팀장 핸들 기록이 하나도 없으면 폴러는 두 주기 연속 빈 채로 보고 스스로 끝난다.
2. **프롬프트 전달**(watch 응답에 `console` 칸이 있는 서버에서만): `dflow.sh console-poll --host <host> [--accepts keys] --limit 1`(`--accepts keys` 는 키 입력 답하기를 켰을 때만 — 기본은 꺼짐) → 프롬프트마다 대상 해석 → 안전 입력(글 행) 또는 아래 「키 입력 답하기」(키 행, 켰을 때) → `console-ack`.
3. **화면 올리기**(2 와 같은 조건): 해석되는 대상마다 화면 끝 40줄을 읽어 가린 뒤 `console-screen` 으로 올린다. 같은 화면으로 아래 「입력 요청 감지」 를 한다(새 읽기 없음). 조정 레인 화면은 같은 읽기 결과를 아래 「레인 화면 캐시」 로 남긴다(새 읽기 없음).
4. **입력 요청 알림**: 3 에서 바뀐 입력 요청 기록(과 키 입력 뒤 지운 기록)을 알린다 — 조정 레인·조정 팀장은 `office.sh`, `/dflow-team` 팀장은 폴러가 직접 `watch`.

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

**한 번에 한 건**: 폴러는 `console-poll [--accepts keys] --limit 1` 로 한 건만 집고, 그 건의 전달과 ack 를 끝낸 뒤에 다음 건을 집는다(한 주기 안에서 대기열이 빌 때까지, 최대 20건). 여러 건을 한꺼번에 집으면 모두 같은 `claimed_at` 으로 서버의 120초 ack 창을 함께 쓰므로 앞 건이 오래 걸리면 뒤 건이 `unknown` 이 된다.

**프로젝트 한정 PAT**: poll·ack 가 exit 5 + 본문 `code=forbidden_role` 이면 콘솔 전달(poll·ack)만 끄고(폴러를 다시 시작하면 다시 시도) 「프로젝트 한정 PAT 라 오피스 프롬프트 전달 불가. 한정 없는 PAT 필요」 를 로그와 stderr 에 한 번만 낸다. 생존 감시·화면 올리기·답 대기는 계속한다. `console-screen` 은 같은 요청에 같은 대상을 두 번 넣지 않고, `captured_at` 은 ISO 8601 UTC 로 보낸다.

**1회 전달**: poll 이 `claimed` 로 바꾼 뒤에만 보내고, ack 하기 전에 폴러가 죽으면 서버가 120초 뒤 `unknown` 으로 닫는다. 폴러는 다시 시작해도 이전에 claim 한 행을 모르고, 모르는 채로 다시 보내지 않는다. ack 가 네트워크로 실패하면(rc 6) 같은 인자로 세 번까지 다시 부르고 그래도 안 되면 포기한다(서버가 `unknown` 으로 닫는다). **`retry` ack 를 다시 부를 때 404 가 오면 이미 반영된 것으로 본다**(서버가 `retry` 를 받으면 `claim_token` 을 비워 같은 토큰이 더는 통하지 않는다).

**머리글**: 터미널에 넣는 글은 한 줄이다.

```
[오피스→<ref>] 프롬프트: <본문>
```

`<ref>` = `coord_lane` 이면 레인 이름, 두 팀장(`coord_lead`·`team_lead`)이면 `lead`, `team_worker` 이면 그 슬롯의 주문 `id8`. 형식 `^[A-Za-z0-9._-]{1,40}$` 이어야 하고 아니면 `lead` 로 쓴다.
Messages 창(`lane-tools` 의 `mail.tsx`)은 사용자 입력의 첫머리에서 정규식 `^\[오피스→([A-Za-z0-9._-]{1,40})\] 프롬프트: ([\s\S]*)$` 를 찾아 peer 「오피스」, via `office` 로 보인다. `cross-session-message` 태그는 흉내 내지 않는다.

**화면 수집·가림**: `term_read_screen <h> 41` 의 결과를 이 순서로 가공한다(맨 앞 한 줄은 줄 꺾임으로 이어진 비밀 판정에만 쓰고 올리는 것은 마지막 40줄이다).

1. ANSI 이스케이프(CSI·OSC)와 제어 문자(탭 제외)를 지운다. 줄 끝 공백을 지운다. 눈에 안 보이는 문자(제로폭·방향 표식·soft hyphen·결합 문자)를 지운다. **가림 처리 전에** 한 줄을 2000바이트(UTF-8 글자 경계)로 먼저 자르고(자르고 나서 가림 — 경계에 걸린 비밀이 반쯤 남지 않게 잘린 끝 토막이 12자 이상이거나 알려진 접두어로 시작하면 가린다), 가린 뒤 한 줄을 400자(코드포인트)로 자른다.
2. **비밀 모양 문자열을 `[가림]` 으로 바꾼다.** 한 줄씩 아래 규칙을 모두 적용한다(앞 규칙이 바꾼 자리는 다시 보지 않아도 된다).

   | # | 규칙 | 값 |
   |---|---|---|
   | 1 | Anthropic·OpenAI 형 키 | `sk-` 로 시작하고 `[A-Za-z0-9_-]{16,}` 가 이어지는 것 |
   | 2 | D'Flow PAT | `dflow_pat_` + 공백 아닌 문자 연속 |
   | 3 | JWT | `eyJ…` 로 시작하는 점 둘의 세 토막(`eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*`) |
   | 4 | 값이 붙는 이름 | `password`·`passwd`·`pwd`·`secret`·`token`·`api_key`·`apikey`·`api-key`(대소문자 무시) 뒤 `=` 또는 `:` 와 공백 아닌 값 → 이름과 구분자는 두고 값만 가림 |
   | 5 | Authorization 헤더 | `Authorization:` 뒤 한 줄 전부, 그리고 `Bearer <값>` 의 값 |
   | 6 | 긴 base64·hex | 연속 40자 이상의 `[A-Za-z0-9+/_=-]`. 단 경로·단어 오탐을 줄이기 위해 대문자·소문자·숫자 중 둘 이상을 섞은 것, 또는 `[0-9a-fA-F]{40,}`(hex)만 가린다. 40자 hex(git 전체 SHA)도 가려지는 것을 받아들인다 |

   규칙 1~6 은 최소선이고 구현은 더 넓다(`lib/console-redact.sh`, 시험 `tests/console-redact.sh`): 접두어가 뚜렷한 40자 미만 토큰(`AIza`·`glpat-`·`hf_`·`GOCSPX-`·`sk_live_`·`whsec_`·`xox[abpr]-`·`gh[pousr]_`·`github_pat_`·`npm_`·`sbp_`·`(AKIA|ASIA)…` 등), 이름 목록 확장(`pass`·`pw`·`passphrase`·`cookie`·`session`·`sig`·`*_key`·한글 `키`), 이름과 값이 공백으로 나뉜 CLI 인자(`--token X`·`-p X`·`-u user:pass`·`.netrc`), 구분자·구조 변형(`'DB_PASSWORD', 'x'`·전각 `：`·YAML 블록 값), URL·DB 접속 문자열의 암호(`://u:p@h`·`user/pass@db`), 줄 꺾임·줄 번호·표 테두리로 끊긴 긴 비밀과 PEM 블록 전체. 64KB 가 넘는 줄은 거절하지 않고 먼저 잘라 가린다(65,000바이트 한 줄도 20ms 안에 끝난다). 의도한 오탐과 알려진 한계는 시험 파일 머리에 적혀 있다.

   가림 규칙은 `tests/` 의 단위 시험으로 고정한다: 위 여섯 종류 각각의 가려지는 예와, 가려지면 안 되는 예(40자 이하의 평범한 단어·소문자만의 긴 경로 `src/frontend/packages/shared/src/components/AgDataGrid`·7~12자 짧은 SHA·40자 미만 hex)를 둔다. 짧은 SHA(7~12자)는 가리지 않는다는 것을 시험으로 고정한다.
3. 마지막 40줄을 남기고, 합계 8KB(UTF-8) 를 넘으면 앞쪽 줄부터 버린다. 가림이 끝난 줄들의 sha256(hex)을 `sha` 로 한다.

화면은 **`sha` 가 바뀐 것만** 전체(`lines` 포함)로 올리고, 같으면 touch(`lines` 없음)만 보낸다. 서버가 `need_full` 을 돌려주면 다음 주기에 전체를 올린다. 올리기 전에 가림을 건너뛰는 경로는 없다(가림 함수 실패 시 그 대상은 올리지 않는다).

**레인 화면 캐시**(`lib/screen-cache.sh`, 시험 `tests/screen-cache.sh`): 화면 올리기가 조정 레인(`coord_lane`)의 화면을 읽은 **그 한 번**의 결과를 로컬에 남겨 `prompt-watch.sh` 가 같은 화면을 또 읽지 않게 한다(전 대상 화면 읽기 지점은 `screens_collect` 한 곳이고 읽은 그 자리에서 레인마다 바로 캐시를 쓴다 — 서버 올리기·입력 요청 알림보다 앞이다. 상주 폴러만 창이 보인 레인에 한해 아래 「재읽기」 를 더 하고, 키 행 재판정·`judge-sha` 의 읽기는 캐시와 무관한 직접 읽기다).
- 위치·권한: `$DFLOW_CONSOLE_DIR/screen/`(폴더 700). 키는 터미널 핸들(`[A-Za-z0-9._:-]`, 앞 `.` 불가·100자 이하, `:` 는 `=` 로 바꾼다 — 경로 이탈 불가). 파일은 `<키>.txt`(읽은 화면 원문 그대로, **가리기 전** — 로컬 600 에만 두고 서버·로그·stderr 로 내지 않는다)와 `<키>.json`(600) = `{"kind":"permission|choice|question|usage-limit|trust|null","read_at_ms":<읽은 시각 에포크 ms>,"lines":<줄 수 41>,"full":"<창 지문, 있을 때만>"}`. `kind` 는 `coord_screen_prompt_kind` 결과(창 없음이면 null).
- 쓰기: 임시 파일에 쓴 뒤 `mv -f` 로 교체한다. `.txt` 를 먼저, `.json` 을 나중에 바꾸므로 json 이 새로우면 txt 도 새롭다(읽는 쪽이 반쯤 쓴 파일을 보지 않는다).
- 정리: 읽기에 실패했거나 터미널 목록에서 빠진 핸들의 캐시는 바로 지우고(낡은 캐시를 남기지 않는다), 대상에서 빠진 핸들·끝난 회차의 것은 주기마다 10분 넘은 파일(임시 파일 포함)을 지운다. 설정 `approvals.screen_cache_s` 가 0 이면 쓰지 않고 있던 캐시도 지운다. `--dry-run` 은 캐시를 쓰지도 지우지도 않는다.
- 재읽기(⑤): 상주 폴러(`run`)는 화면 읽기에서 창(`kind` 가 null 이 아님)이 보인 레인만 `COORD_CONSOLE_REREAD_S`(기본 5)초 뒤 한 번 더 읽어 캐시(`full` 포함)를 바로 갱신한다 — 창이 사라졌는지·바뀌었는지를 다음 30초 주기까지 기다리지 않고 `prompt-watch.sh` 가 믿게 한다. 주기당 한 번·레인당 한 번, 입력 요청 알림 다음에 돌고 시간은 구간 상한(`COORD_CONSOLE_PHASE_MAX_S`)과 주기 몫의 남은 시간 안이다(다른 단계·주기 길이는 그대로). 창이 없는 레인은 다시 읽지 않는다. 입력 요청 기록·서버 올리기는 하지 않는다(다음 주기 몫). `--once`·`--dry-run` 은 하지 않는다.
- 끝낼 때(4.1 종료 정리): 폴러가 끝나면(`stop`·TERM·자동 종료·`--once` 끝 — 단일 인스턴스 잠금의 주인일 때만) 화면 캐시 폴더의 파일(`.txt`·`.json`·임시 파일)을 모두 지운다(원문이 로컬에 남지 않게). `stop` 이 TERM 뒤 KILL 하는 경우는 `stop` 이 대신 지운다. `--dry-run` 은 지우지 않는다. 낡은 캐시는 `prompt-watch.sh` 가 직접 읽기로 물러나므로 지워도 안전하다(시험용 `COORD_CONSOLE_KEEP_SCREEN=1` 은 지우지 않는다).
- 읽는 쪽은 `prompt-watch.sh` 하나(§3.3)이고, 폴더·파일이 현재 사용자 소유·권한 700/600·심볼릭 링크 아님일 때만 믿는다. 자동 응답 직전 재판정(`auto-answer.sh`·`term-send-safe.sh`·키 행·`judge-sha`)은 이 캐시를 절대 읽지 않는다.

**입력 요청 감지**(k11 — `lib/console-input.sh`, 시험 `tests/console-keys.sh`): 화면 올리기에서 읽은 같은 화면(41줄)으로 조정 레인(`coord_lane`)·조정 팀장(`coord_lead`)·`/dflow-team` 팀장(`team_lead`) 세션에 사용자 입력을 기다리는 창이 있는지 판정한다(팀원 `team_worker` 는 하지 않는다). 판정은 `coord_screen_prompt_kind`(마지막 30줄, `trust`·`usage-limit`·`permission`·`question`·`choice`) 그대로이고 모델 토큰을 쓰지 않는다.

- **기록**: `~/.dflow/console/input/<kind>_<ref>.json`(`coord_lane_<레인>`·`coord_lead_<세션8>`·`team_lead_lead`, ref 는 `[A-Za-z0-9._-]` 만) = `{"v":1,"kind":…,"since":"<UTC 밀리초 ISO …Z>","excerpt":["…"],"handled":null|{"by":"coordinator"|"auto","at":"<ISO>"},"full":"<sha>","run":"<회차>","handle":"<핸들>"}`. `full`(창 지문 — 가리기 전 원문 창의 sha, 아래)·`run`(조정 레인의 회차 — 그 핸들로 그 레인을 가진 열린 회차가 하나일 때)·`handle`(그 세션 핸들)은 **킷 내부 칸**이라 서버로 보내지 않는다(`office.sh` 가 `input_request` 를 `{v,kind,since,excerpt,handled}` 로 추린다). `office.sh` 는 레인 기록 중 `run` 이 자기 회차(`COORD_RUN`)이고 `handle` 이 그 회차 state 의 레인 핸들과 같은 것만 쓴다(같은 PC 의 두 조정 세션이 같은 레인 이름을 써도 섞이지 않게 — 두 칸이 없는 옛 기록은 쓰지 않고 폴러가 다음 주기에 다시 쓴다). 팀장 기록은 세션별 이름이라 회차·핸들을 보지 않는다. 쓰는 쪽은 폴러뿐(임시 파일 → mv, 권한 600, 기록마다 짧은 mkdir 잠금), 읽는 쪽은 `office.sh`(레인 watch 의 `input_request`·팀장 라벨). 화면 원문·발췌는 로그·stderr 에 남기지 않는다(시각·대상·kind 만).
- **발췌**(최대 10줄, 같은 입력이면 같은 출력): 가린 화면 줄(`console_screen_filter`)을 줄마다 제어 문자(U+0000~001F·U+007F~009F, 탭 포함) 삭제 → 줄 끝 공백 제거 → 200자(코드포인트) 자름. 열쇠 줄 = 커서 줄(앞의 공백·상자 테두리 `│┃║|` 를 건너뛰고 `❯`·`›`·`>` + 공백 + 글)과 선택지 줄(`N.`, 앞에 커서가 있어도 됨). 맨 아래 열쇠 줄에서 위로 사이 일반 줄이 3줄 이하인 열쇠 줄들을 한 창으로 보고, 창이 10줄 안이면 「창 끝 + 3줄」을 아래 끝으로 창 첫 줄을 포함하는 연속 10줄(아래쪽 우선), 10줄보다 길면 커서 줄과 그 가까운 열쇠 줄 10개, 열쇠 줄이 없으면 마지막 10줄. 권한 창이면 **명령 첫 줄**(창 첫 열쇠 줄 위의 마지막 머리 줄 — 끝이 `Bash command`·`Edit file`·`Write file`·`Read file`·`Fetch`·`command` — 다음의 첫 글 줄)이 위 선택에 빠졌을 때 커서 줄 → 명령 첫 줄 → 커서에 가까운 열쇠 줄 → 창 안 일반 줄 → 명령 나머지 줄 → 아래 안내 줄 순으로 10줄을 고른다(모자라면 안내 줄부터 버린다 — 여러 줄 명령의 첫 줄만 다른 두 창이 같은 발췌를 내지 않게). 앞뒤 빈 줄을 걷고, `input_request` 3072바이트 상한에 들게 발췌 JSON 이 2800바이트를 넘으면 위쪽 일반 줄부터, 그다음 커서에서 먼 열쇠 줄부터, 마지막에 명령 첫 줄을 버린다(커서 줄은 남긴다). 커서 위치가 sha 에 들어가 재판정이 이동 결과를 확인할 수 있다. 가림이 실패하면 기록을 만들지 않는다.
- **창 지문 `full`**(킷 내부, 서버 계약 밖·서버에 보내지 않고 로컬 기록(권한 600)에만 둔다): 발췌는 창 아래쪽만 담고 가림은 줄 나머지를 지우므로(`Authorization: …`) 가린 화면으로는 두 창을 가르지 못한다. 그래서 **가리기 전 원문**에서 ANSI·제어 문자·보이지 않는 문자를 지운 뒤 「창」만 골라 만든다. 줄 끝 CR 한두 개(CRLF)와 끝맺은 ANSI 시퀀스(색·커서 이동)는 지우지만, 그 뒤에도 제어 문자(줄 가운데 CR·끝맺지 않은 ESC·탭 밖 C0·DEL·C1)가 남았거나 2000자를 넘는 줄은 「나쁜 줄」로 두고(제어 문자는 U+FFFD 로 바꿔 창 범위를 정한다 — 예전처럼 마지막 CR 뒤 조각만 남겨 본문 줄이 들여쓰기 0 가로줄·질문 줄로 바뀌지 않게), **창 안에 나쁜 줄이 하나라도 있으면 지문 없음**이다(창 밖 대화 기록의 나쁜 줄은 막지 않는다). 창 판정 1회는 시간 상한 3초(`COORD_CONSOLE_WINDOW_TIMEOUT_S`, perl alarm)이고 넘으면 지문 없음이다. 창 = 머리 줄부터 마지막 선택지 줄 + 3줄 안의 안내 줄(없으면 바로 이어지는 더 깊은 들여쓰기 줄)까지다. 머리는 권한 창이면 질문 줄(선택지 블록 첫 줄 바로 위의 마지막 글 줄 — 문구로 찾지 않는다)에서 위로 가장 가까운 **들여쓰기 0** 의 가로줄(─ 10개 이상과 공백뿐)·`╭` 줄이고, 그 다음 글 줄이 도구 이름 줄(`Bash command`·`PowerShell command`·`Edit file`·`Write file`·`Create file`·`Overwrite file`·`Read file`·`Edit notebook`·`Fetch`·`Tool use` 등, 뒤에 `(unsandboxed)`·`(runs on …)` 같은 괄호 하나 허용)이 아니면 머리가 아니다(지문 없음 — 더 위로 찾지 않는다). 명령 본문은 창 안에서 들여쓰기돼 그려지므로 본문 속 가로줄·`╭` 은 머리가 되지 않는다. 그 밖의 창이면 선택지 블록 위의 가로줄(없으면 질문 문장 첫 줄)이다. 같은 판정이 권한 창의 도구 이름 줄·질문 줄·본문(머리·도구 이름 줄·질문 줄·선택지 줄을 뺀 나머지)·선택지 줄을 내고(`console_window_json`, `console_input_snapshot` 의 `CI_WIN`), `auto-answer.sh` 는 이것만으로 명령을 판정하고(창 밖 대화 기록은 보지 않는다), 허용은 질문 줄이 정확히 `Do you want to proceed?` 이고 질문 줄 들여쓰기가 도구 이름 줄과 같을 때만이다(본문 속 가짜 질문이 질문 줄로 잡히면 들여쓰기가 달라 `window-shape`). 권한 창이 아닌 kind(trust·usage-limit·question·choice — kind 는 화면 마지막 30줄 글로 정해 명령 본문·대화 줄 문구로도 바뀐다)도 같은 창의 모양(`gen`)으로만 자동 응답한다: 선택지 블록 위 가장 가까운 들여쓰기 0 머리 다음 줄이 도구 이름 줄(권한 창 모양)·머리가 들여쓴 가로줄·블록 안에 열쇠 줄보다 얕은 글 줄(본문 속 가짜 선택지가 진짜 질문 줄을 끼고 붙음)·질문 줄 없음이거나, 그 kind 의 확인 문구(trust: `trust the files in this folder`·`one you trust` + 끝 쪽 `No, exit`·`trust this folder`, usage-limit: `What do you want to do?`·`Usage limit reached` 로 시작하는 줄)가 창 머리~질문 줄에 없으면 `ESCALATE … window-shape` 이고, 선택지 번호는 창 블록에서만 고른다(번호 있는 Yes 가 없는 신뢰 창은 1 을 짐작해 보내지 않고 `no-yes-option`). 발췌의 「명령 첫 줄」 고르기(`_CI_EXCERPT_JQ` 의 머리 줄 = 끝 글자)는 오피스 표시용이라 이 창 판정과 따로다(판정·지문에 쓰지 않는다). 창 줄마다 커서 표시(`❯`·`›`·`>` + 공백)를 지우고 공백 연속을 하나로 접어, 첫 줄 kind 와 `\n` 으로 이어 sha256 한다(`lib/console-input.sh` 의 **`console_full_sha` 단일 함수**, `console_input_snapshot` 의 `CI_FULL`). 커서만 움직였거나 상태줄·창 밖 줄만 바뀐 같은 창은 같은 값이고, 41줄로 읽든 80줄로 읽든 창이 들어 있으면 같은 값이다. **한계**: ① 명령 본문 줄이 들여쓰기 없이(줄 맨 앞부터) 그려지는 터미널이면 본문에 넣은 가로줄 + 도구 이름 줄로 머리를 위조할 수 있다(실제 Claude Code 창은 본문을 3칸 들여 그리므로 해당 없음, 위조 머리 아래만 판정·지문에 들어간다) ② 실제 Bash 창의 설명 줄(예: `Remove build dir` — 설치된 Claude Code 는 명령 위에 질문과 같은 들여쓰기로 그린다)·권한 결과·경고 줄도 본문으로 보므로 그런 창은 `ESCALATE … unknown:<첫 단어>` 로 올라간다(이 수정 전과 같은 보수 동작). 질문과 선택지 사이에 흐린 안내 줄이 끼면 그 줄이 질문 줄이 되어 `not-proceed` 로 올라간다 ③ 상태줄이 빈 줄 없이 마지막 선택지 바로 아래에 더 깊은 들여쓰기로 붙는 화면은 상태줄이 창 끝(선택지 설명)으로 들어가 숫자(%)가 바뀔 때 지문이 바뀐다(새 since — 키 행은 `prompt_changed` 로 닫힌다) ④ 도구 이름 줄 목록 밖의 권한 창은 지문이 없어 오피스·조정자 직접 답이 닫힌다 ⑤ 화면 원문에 제어 문자가 섞인 창(줄 가운데 CR 등)·2000자 넘는 줄이 든 창·판정 3초 초과는 정상 창이어도 지문 없음으로 닫힌다(보수) ⑥ 확인·선택 창 모양 규칙은 실제 창(들여쓰기 0 머리 + 제목, 또는 머리 없는 글 묶음)에 맞췄으므로, 머리가 들여쓴 가로줄이거나 위쪽에 옛 권한 창 흔적(머리 + 도구 이름 줄)이 남은 정상 창은 `window-shape` 로 올라간다. **머리를 못 찾으면 지문이 없고 모두 닫는다**: 감지는 기록하되 `full` 을 null 로 두고, 키 행은 `prompt_changed` 로 거절·`judge-sha` 는 `NOFP <h>`·`term-send-safe.sh --expect-sha` 는 `REFUSED prompt-changed`·`auto-answer.sh` 는 `ESCALATE … no-fingerprint`. 감지·키 행 재판정·보내기 직전 확인·`auto-answer.sh`·`judge-sha`·`--expect-sha` 가 모두 이 함수를 쓴다.
- **발췌 해시**(서버와 같은 규칙): 줄마다 제어 문자 제거 → 줄 끝 ASCII 공백(U+0020)만 제거 → `\n` 으로 이은 UTF-8 의 sha256 소문자 hex(끝 개행 없음). 고정 벡터 `['a  ','b']` → `7e18f737311b2dc3b2f269dd78396b0351f14fb66efa879f768cb23181883c78`. 킷은 sha 를 서버에 보내지 않는다(감지·재판정·보내기 직전 확인이 모두 같은 함수 `console_input_snapshot` 을 쓴다).
- **상태기계**(30초 주기): 창 없음 → 기록 삭제. 창 있음 → ① 기록이 없거나 kind 가 다르거나 `full`·`handle`·`run` 이 다르거나 기록의 since 가 소비 목록에 있으면 새 기록(since = 지금, handled = null) ② 그 밖(같은 kind·같은 화면·소비되지 않음)이면 since·handled 를 두고 발췌만 갱신. 단 키를 막 보낸 레인(`lock/lane-<레인>.sent` 가 `COORD_CONSOLE_SENT_GRACE_S`(10초) 안이고 sha 가 같음)은 화면에 아직 반영 전인 같은 창이므로 그 주기에 새 기록을 만들지 않는다. `usage-limit`·`trust` 는 자동 처리 대상이라 만들 때 handled = `{by:"auto",at}` 이다. 해석되지 않는(닫힌·사라진·터미널 목록에 없는) 대상의 기록은 지운다(읽기 실패는 그대로 둔다).
- **문장 질문(kind `message`)**: 조정자가 레인의 SendMessage 질문을 `coord-state.sh report <레인> [요약] --question <글>` 로 적으면 `.lanes.<레인>.question = {at, text(첫 줄 200자, 제어 문자 정리)}` 이 되고, `--answered` 가 지운다(stdout·reports.md 형식은 종전과 같다). 레인 화면에 창이 없고 question 이 있으면 `{kind:"message", since: question.at 의 UTC 밀리초 ISO, excerpt:[가린 첫 줄], handled:null}` 기록을 두고, question 이 지워지면 지운다. 화면 창이 있으면 화면 창이 우선이다.
- **소비 목록** `input/consumed/<이름>.list`: `since sha` 한 줄씩(최근 20줄). 키를 보냈거나(알 수 없는 실패 포함) 조정자·auto-answer 가 답한 (since, sha) 를 넣는다. 같은 모양 창이 다시 뜨면 since 를 새로 정한다(최종 계약 (g)). 창 식별용으로 `input/consumed/<이름>.full` 에 `since full` 도 같은 규칙으로 둔다(커서가 움직여 발췌 sha 가 바뀐 같은 창도 소비된 것으로 본다).
- **handled 기록**: `console-poll.sh input-handled (--lane <레인> | --lead <세션8>) --by <coordinator|auto>` — 기록이 있으면 handled 를 `{by,at}` 로 바꾸고 (since, 발췌 sha) 를 소비 목록에 넣은 뒤 `office.sh` 를 부른다(시간 초과·네트워크면 알림 표식을 남겨 폴러가 다시) · stdout `OK`, 기록이 없으면 `NONE`. `auto-answer.sh` 는 ANSWER·DENY 로 키를 보낸 직후(`--dry-run` 제외) `--by auto` 로 부른다(실패 무시). `--expect-full <창 지문>` 을 주면 기록의 `full` 이 그 값일 때만(답한 창이 아직 기록의 창일 때만) 처리하고, 다르면(기록이 이미 다음 창) 아무것도 바꾸지 않고 `NONE prompt-changed`. `term-send-safe.sh --lane … --raw --expect-sha` 는 `SENT` 직후 레인 잠금 안에서 직접 처리·소비까지 한다.
- **조정자가 직접 답하기**(판단 올리기 뒤, `approvals.md` §3): ① 판단을 올리기 전에 `console-poll.sh judge-sha --lane <레인>`(→ `JUDGE <h> <kind> <sha>`)으로 그 화면의 `full` 을 기억한다 ② 결론이 나면 `term-send-safe.sh --lane <레인> --text 1|2 --raw --expect-sha <sha>` — 레인 잠금 안에서 다시 읽은 화면의 `full` 이 다르면 `REFUSED <h> prompt-changed`(보내지 않음, 처음부터 다시), 잠금을 못 얻으면 `lane-busy` ③ `SENT` 면 처리됨·소비는 `term-send-safe.sh` 가 잠금 안에서 이미 남겼으므로 따로 부르지 않는다(키를 다른 경로로 보냈을 때만 `console-poll.sh input-handled --lane <레인> --by coordinator --expect-full <sha>`).
- **알림**(바뀐 대상만 — 생성·삭제·kind·발췌 변경. 표식 `input/.notify/<이름>` 을 남겨 시간 초과·네트워크 실패면 다음 주기에 다시): 조정 레인 → `COORD_RUN=<그 레인의 회차> office.sh lane-state <레인> auto`, 조정 팀장 → `COORD_RUN=<그 세션의 열린 회차> office.sh lead-sync`(호출당 20초 — `office.sh` 최악 시간 watch 3번 × 5초 + 여유, 실패 무시. 같은 이름 레인이 둘 이상 회차에 있으면 회차마다 부른다). 이 알림 구간은 주기 몫(`COORD_CONSOLE_CYCLE_MAX_S`)·구간 상한(`COORD_CONSOLE_PHASE_MAX_S`) 밖에서 따로 `COORD_CONSOLE_NOTIFY_MAX_S`(45초) 안에 돌고, 남은 시간에 한 번이 다 들어가지 않으면 남은 표식은 다음 주기로 미룬다. `office.sh` 가 시간 제한으로 끊겨도 쥔 세션 기록 잠금은 EXIT/TERM trap 이 풀고, KILL 로 남은 잠금(state.json·세션 기록)은 `coord_lock` 이 주인 pid 가 죽었거나 60초 넘게 오래된 것을 탈취한다(§3.1). `/dflow-team` 팀장은 `office.sh` 를 거치지 않고 폴러가 기록(`lead/*.json` 의 agent·slots·busy·project)으로 `dflow.sh watch --agent … --slots … --busy … --until "답 대기" [--project …]` 를 보내고, 창이 사라지면 같은 인자에 기록의 `until_label` 로 되돌린다(5초 제한·실패 무시). `답 대기` 는 기록이 「살아 있을」 때(handled null·kind 가 `usage-limit`·`trust` 아님)만이고 전환(살아 있음↔아님)이 있을 때만 보낸다 — 자동 처리 창(`usage-limit`·`trust`)은 `답 대기` 를 띄우지 않는다. `until_label` 이 비면 되돌리기를 보내지 않고 로그 한 줄만 남긴다.
- **`답 대기` 판정은 폴러가 한다**: §4 의 「`답 대기` 판정(k2 폴러, 30초마다)」 문장을 이 절이 구체화한다 — 판정 근거는 위 기록이 있는지(조정 팀장은 여기에 §4 의 `pending_user` 조건이 더해진다)이고, 라벨을 실제로 보내는 일은 조정 레인·조정 팀장은 `office.sh`, `/dflow-team` 팀장은 폴러가 맡는다.

**키 입력 답하기**: **기본 꺼짐(`console.keys_enabled=false`), 다음 회차에 훅 기반(구조화된 권한 이벤트)으로 재설계.** 꺼져 있으면 폴러는 poll 요청에 `accepts:['keys']` 를 싣지 않아 서버가 키 행을 주지 않고, 그래도 키 행을 받으면(옛 서버·경합·중복) 화면 재판정·`term_send_keys` 앞에서 바로 `refused`·reason `error`·detail `keys_disabled` 로 ack 한다(키 전송 0, 서버 reason 목록은 그대로). 입력 요청 감지(레인 키의 `input_request`)·`답 대기` 라벨·조정자 직접 답하기(`term-send-safe.sh --raw --expect-sha`)·`auto-answer.sh` 는 이 설정과 무관하다. 켜려면 설정 `console.keys_enabled=true` 또는 환경 변수 `COORD_CONSOLE_KEYS_ENABLED=1`. 아래는 켰을 때의 동작이다.

오피스에서 세션 주인 본인이 누른 키를 서버가 키 행으로 만들고(서버 몫), 폴러는 행의 어떤 칸도 믿지 않고 아래를 **한 건씩** 순서대로 한다. 키 행 = 글 행 칸(id·target_kind·target_ref·claim_token·expires_at) + `kind:"keys"`·`keys:[…]`·`input_request:{kind,since,sha}`, `text` 없음. 행에 `kind` 가 없으면 글 행, `keys` 면 키 행, 그 밖의 값이면 `refused`·`error`(글로 넣지 않는다).

1. `target_kind` 가 `coord_lane` 이 아니거나 ref 가 `[A-Za-z0-9._-]` 가 아니면 `refused`·`error`.
2. **허용 키**: 배열·1~4개·모두 문자열이고 정규식 `^((Up|Down),){0,3}(Up|Down|Tab|[1-9]|Enter|Esc)$` 모양 — 앞자리는 `Up`·`Down` 만, 마지막 자리는 `Up|Down|Tab|1~9|Enter|Esc` 하나. 원소마다 검사한다(합친 글을 보지 않는다 — `["Down,Enter"]`·`"Down\nEnter"`·숫자 `2` 는 위반). 위반이면 `refused`·`error`. `input_request` 의 kind·sha(64자 hex)·since(시간대 있는 ISO) 형식이 틀려도 `error`.
3. **만료**: 지금 > `expires_at` 이면 보내지 않고 `refused`·`stale`. 지금 시각을 숫자로 구하지 못하면 `refused`·`error`(불확실하면 보내지 않음).
4. **대상 해석**: 위 「대상 해석」 의 `coord_lane` 규칙(없으면 `target-not-found`, 둘이면 `ambiguous`, 터미널 목록에 없으면 `stale`).
5. **재판정**: 그 핸들 화면을 새로 읽어(41줄) 감지와 같은 함수로 kind·발췌 sha 를 다시 만들고, 요청의 `input_request` 와 kind·sha(문자열 비교)·since(밀리초 시각 비교 — 표기가 달라도 같은 순간이면 같다)가 같고 **그리고** 폴러의 기록 `input/coord_lane_<레인>.json` 의 since·`full`(창 지문 — 가리기 전 원문 창의 sha, 발췌에 안 든 창 앞부분 포함)과도 같은지 본다. 하나라도 다르거나 창이 없으면 보내지 않고 `refused`·`prompt_changed`(읽기 stale 이면 `stale`, 읽기·가림 실패면 `error`).
6. **소비 확인**: (since, sha) 가 소비 목록에 있으면 `refused`·`prompt_changed`(같은 요청 재전송 방지 — 서버도 한 번만 주지만 이중 방어).
7. **레인 잠금**: `~/.dflow/console/lock/lane-<레인>/`(mkdir, 안에 pid·pstart, 죽은 주인은 탈취, 최대 `COORD_CONSOLE_LANE_LOCK_WAIT_S`=10초 대기)을 쥔다. `auto-answer.sh` 도 키를 보내는 구간에서 같은 잠금을 쥔다(못 얻으면 `NONE <h>` 처럼 건너뛰고 다음 틱에 다시, `--handle` 만 주면 현재 회차에서 그 핸들의 레인을 찾아 쓴다). 폴러가 잠금을 못 얻으면 다른 쪽이 답하는 중이므로 `refused`·`prompt_changed`.
8. **보내기 직전 확인(잠금 안)**: 「막 보낸 표식」(`lane-<레인>.sent` 가 10초 안이고 같은 sha — auto-answer 가 방금 답했는데 화면 반영 전)·기록 since·`full`·화면 kind·sha·소비를 한 번 더 보고, 그 **뒤**(화면 읽기로 시간이 지난 뒤, 보내기 바로 앞) 만료를 본다(3 과 같은 규칙). 다르면 보내지 않는다(위와 같은 사유).
9. **한 번에 보내기**: `term_send_keys <h> <키…>`(lib/term.sh) 한 번. orca 는 키 이름을 원시 바이트(Up=ESC `[A`, Down=ESC `[B`, Tab=`\t`, Enter=`\r`, Esc=ESC, 1~9=그 숫자)로 바꿔 `orca terminal send --terminal <h> --text <바이트열> --json` 한 번(Enter 옵션 없음), tmux 는 `tmux send-keys -t <h> <이름…>`(Esc→`Escape`) 한 번. `term-send-safe.sh --raw` 를 키마다 부르지 않는다(키마다 3초 대기라 경쟁 창이 늘어난다). 보내는 동안 `inflight/<id>` 를 둔다.
10. **보낸 뒤**: (since, sha) 를 소비 목록에 넣고, 막 보낸 표식을 남기고, 입력 요청 기록을 지운 뒤 잠금을 풀고 4 의 알림을 남긴다.

| `term_send_keys` 결과 | ack |
|---|---|
| `accepted`·`submitted`·`turn_started` | `sent` + `detail`(그 값) |
| `stale`(넣지 못했음이 확실) | `refused` + `stale` |
| `error bad-key`(보내기 전에 걸러 아무것도 넣지 않음) | `refused` + `error` |
| 그 밖(오류·시간 초과 — 키를 일부 넣었을 수 있다) | **ack 생략**(서버가 120초 뒤 `unknown` 으로 닫는다, inflight 는 남김). `refused` 로 ack 하지 않는다(최종 계약 (g)). (since, sha) 는 소비로 기억 |

`prompt_changed` 는 `refused` 와만 쓴다. 제자리 이동만(`[Down,Up]`) 보내도 (since, sha) 는 소비된다. 남은 경쟁 창: 마지막 화면 확인(8)과 `orca terminal send` 사이(프로세스 한두 개 실행 시간, 수백 ms)는 화면을 잠글 수 없어 남는다 — 그 사이에 창이 바뀌면 키가 새 창에 들어갈 수 있다. 레인 잠금은 auto-answer·폴러·조정자 직접 답(`term-send-safe.sh --raw --lane`) 사이의 겹침만 막고, 세션 자체의 화면 변화(모델이 다음 창을 띄움)는 막지 못한다. auto-answer·조정자 직접 답도 같은 이유로 마지막 화면 읽기와 send 사이의 짧은 틈이 남는다.

**기동·정지**: `start` 는 잠금을 잡고 백그라운드로 루프를 띄운다(`CONSOLE_POLLER started|running|skipped`). 부르는 곳:
조정자 `coord-state.sh init`(회차를 열 때)·`/dflow-team` 시작. `coord-state.sh close-run` 과 `/dflow-team` 마감은 폴러를 멈추지 않는다(마감은 팀장 핸들 기록만 지운다) — 폴러가 스스로 끝난다. `stop` 은 손으로 멈출 때 쓴다.
`start` 는 늘 안전하게 여러 번 부를 수 있다(이미 돌면 `running`). 폴러가 스스로 끝나는 조건은 위 「생존 감시」 의 두 주기 연속 빈 상태(이 신원·host 의 `pid` 가 있는 세션 기록, 살아 있음이 확인된 열린 회차, `pid` 가 살아 있는 팀장 기록이 모두 없음 — `pid` 0·빈 값인 기록·회차는 세지 않는다)와 `office.enabled` 가 꺼진 것이다.

**실패 정책**: §4 와 같다 — 어떤 실패도 부른 쪽 동작을 막지 않고, 폴러 안에서는 한 주기의 실패가 다음 주기를 막지 않는다. 비밀값(토큰·claim_token·원문 화면)은 로그에 남기지 않는다. 로그에는 시각·대상·결과·사유만 적는다.
