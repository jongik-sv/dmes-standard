# 공통 계약 (정본)

- 정본 범위 = 설정 키 · 상태 파일 스키마 · 스크립트 인자와 출력 줄
- 문서와 스크립트가 다르면 스크립트가 맞음. 확인 = `node scripts/<이름>.mjs --help`
- 오피스·콘솔 폴러 구현 사양 = `office-contract.md`
- 설계 문서 경로 = SKILL.md (본문의 「설계 §…」 = 그 문서의 절)

## 1. 설정

### 1.1 파일과 병합

- 읽는 순서 = 리포 공용 `<repo>/.coord.json`(커밋) → PC 전용 `<repo>/.coord.local.json`(커밋 안 함)
- 병합 = `jq -s '.[0] * .[1]'` 깊은 병합
- 파일이 둘 다 없으면 기본값만 씀
- 기본값 정본 = `scripts/lib/common.mjs` 의 `COORD_DEFAULTS`. `templates/config.example.json` = 사본
- `<repo>` = 메인 체크아웃(`git rev-parse --git-common-dir` 의 부모). `git rev-parse --show-toplevel` 아님
  - 워크트리에서 불러도 같은 설정을 읽음
  - 환경 변수 `COORD_REPO` 가 있으면 그 값을 씀
- 경로 값의 `~` = 스크립트가 `$HOME` 으로 바꿈

### 1.2 키

| 키 | 기본값 | 뜻 |
|---|---|---|
| `integration_branch` | `"dev"` | 머지 대상 통합 브랜치 |
| `git_bin` | `"git"` | git 실행 파일(훅이 git 을 바꿔 쓰는 PC 는 `/usr/bin/git`) |
| `state_dir` | `"~/.coord"` | 상태 폴더 뿌리. 회차 폴더 `<state_dir>/<run-id>/`, 현재 회차 `<state_dir>/current`(한 줄 run-id), 조정 세션 기록 `<state_dir>/_session/`(`office-contract.md` §4, run-id `_session` 사용 불가). 환경 변수 `COORD_STATE_ROOT` 가 이 설정보다 앞섬(`office.mjs reap --state-dir` 가 하위 호출에 넘김) |
| `terminal_backend` | `"orca"` | `orca` \| `tmux`(tmux 는 뼈대만) |
| `coordinator.model` | `"opus"` | 조정자 세션 모델(사람이 띄울 때 참고, 스크립트는 안 씀) |
| `coordinator.effort` | `"medium"` | 조정자 세션 effort. 무거운 판단 = 서브에이전트로(SKILL.md 「판단 올리기」) |
| `launch.claude` | `"claude"` | Claude Code 실행 명령 앞부분(예: `orca claude-teams --dangerously-skip-permissions`) |
| `launch.glm` | `"glm"` | GLM Claude Code 실행 alias |
| `launch.opencode` | `"opencode --standalone"` | opencode 워커 실행 명령 |
| `heavy.script` | `null` | heavy.sh 경로(리포 기준 상대 또는 절대). 없으면 통지만 |
| `heavy.measure_dir` | `"~/.dflow/locks/heavy-measure"` | 측정 레인 전용 칸 DIR |
| `heavy.load_soft` | `1.2` | load1/코어 가 이 값 이상이면 새 무거운 착수 지시 보류 |
| `heavy.load_hard` | `2.0` | 두 틱 연속 이 값 이상이면 최저 우선순위 레인에 금지 통지 |
| `heavy.load_release` | `0.8` | 두 틱 연속 이 값 미만이면 금지 해제 |
| `heavy.measure_quiet` | `0.5` | 측정 창 시작 전 load1/코어 가 이 값 아래로 2분 유지 |
| `usage.sources` | `[{"kind":"cache","path":"/tmp/claude-usage-cache.json"},{"kind":"coord-dump","path":"~/.coord/ctx"},{"kind":"limits-dir","path":"~/.dflow/limits"}]` | 사용량 출처 읽는 순서 |
| `usage.max_age_min` | `30` | 이보다 오래된 출처는 버림 |
| `usage.bands` | `{"Y":{"five":75,"week":85},"O":{"five":90,"week":93},"R":{"five":98,"week":98}}` | 띠 경계(이상이면 그 띠) |
| `usage.week_pace` | `false` | 켜면 1주 남은 날 보정(설계 §3.f)으로 1주 사용률이 `week_allow` 를 넘을 때 띠를 한 단계 올림 |
| `usage.week_pace_margin` | `20` | `week_pace` 를 켰을 때 `week_allow = 100×(7−남은 일수)/7 + 이 값` 의 여유(%p) |
| `usage.relaxed` | `false` | 계정 여유 스위치(사용자가 다른 계정을 쓸 수 있을 때 켬). 켜면 `usage-band.mjs` 가 Y·O 를 G 로 내려 냄(R 그대로). 끄면 띠가 오를 때 Claude 몫을 opencode·agy 로 옮김(`usage.md` §2) |
| `usage.spawn_week_max` | `95` | 새 레인·새 Pane 을 띄울 수 있는 1주 사용률 상한(%). Claude 새 레인 = 이 값 미만 **그리고** 띠 ≠ R. 5시간 사용량이 높을 때는 모델 등급·동시 agent 수로만 조절 |
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
| `workflow.agents_by_band` | `{"G":4,"Y":3,"O":2,"R":0}` | 레인당 동시 agent 상한. R = 새 Workflow 없음 |
| `workflow.model_table` | 아래 1.3 | 지시 템플릿의 단계·크기별 model·effort(최소 충분 등급) |
| `workflow.escalation.ladder` | `[sonnet/medium, sonnet/high, opus/high]` | 시험 실패 시 수정 agent 등급 사다리(`workflow.md` §7) |
| `workflow.escalation.allow_xhigh` | `false` | true 면 사다리 끝에 `opus/xhigh` 한 칸 추가 |
| `workflow.escalation.max_attempts` | `3` | 항목당 수정 시도 상한(환경 재실행 제외) |
| `workflow.escalation.env_retry` | `1` | 환경 실패(시간 초과·부하 연쇄)일 때 같은 등급 재실행 횟수 |
| `search.mode` | `"tab"` | `tab` = 새 탭에 검색 워커를 띄워 사용자가 진행을 봄. `print` = 화면 없이 단발 실행 |
| `search.workers` | `["agy","opencode"]` | 검색 워커 순서. 앞 워커가 실패(no-command·timeout·error·empty)하면 다음 워커로. 모두 실패해야 Claude agent(sonnet/medium)가 대신함 |
| `search.tab_command` | `"agy -i {prompt}"` | agy 탭 모드 명령 틀 |
| `search.command` | `"agy -p {prompt} --print-timeout {timeout}s --disable-slash-commands"` | agy 단발 명령 틀. `{prompt}` = 인자 하나, `{timeout}` = 초. 빈 값이면 agy 건너뜀 |
| `search.opencode.command` | `"opencode run --standalone {prompt}"` | opencode 단발 명령 틀. 제한 시간 = `search.timeout_s` 로 `search.mjs` 가 직접 검 |
| `search.opencode.tab_command` | `"opencode run --standalone {prompt} 2>&1 \| tee {out}"` | opencode 탭 명령 틀. 출력이 탭에 흐르면서 `{out}`(답 파일)에 남고, 끝나면 `{out}.done` 생성 |
| `search.timeout_s` | `240` | 워커마다 거는 검색 제한 시간 |
| `glm.max_sessions` | `1` | 동시 GLM 세션 상한 |
| `glm.timeout_s` | `10` | 사전 확인 호출 제한 시간 |
| `approvals.auto_allow` | `["read","status"]` | 사용자가 띄운 세션의 확인 창 자동 승인 범주. 가능한 값 = `read`·`status`·`edit-own`·`commit-own`·`heavy-build`. 기본 = 가장 좁게 |
| `approvals.watch_every_s` | `10` | `prompt-watch.mjs --follow` 의 화면 읽기 간격(초). 읽을 때마다 `orca terminal read` 가 CPU 를 쓰므로 3초보다 길게 둠 |
| `approvals.screen_cache_s` | `20` | 폴러가 남긴 레인 화면 캐시(`office-contract.md` §4.1 「레인 화면 캐시」)를 `prompt-watch.mjs` 가 믿는 시간(초). 0 = 캐시를 쓰지도 읽지도 않음. 자동 응답 재판정은 늘 직접 읽음 |
| `approvals.auto_allow_spawned` | `["read","status","edit-own","commit-own","heavy-build"]` | 조정자가 띄운 세션(`spawned_by=coordinator`)의 자동 승인 범주. 거부 칸은 여기에 넣어도 늘 거부 |
| `restart_rules` | `[]` | `[{"glob":"src/backend/**","note":"세 서버 내린 뒤 jar 빌드·재기동"}]` |
| `merge.auto_build` | `true` | 머지 뒤 반영 빌드를 묻지 않고 함(`closing.md` §7). false 면 건너뛰고 마감 보고에 남김. 스크립트가 읽지 않는 문서 규칙 |
| `merge.auto_push` | `true` | 통합 브랜치 push·릴리스 반영을 묻지 않고 함(`closing.md` §7, 강제 push 금지). false 면 건너뛰고 마감 보고에 남김. 문서 규칙 |
| `office.enabled` | `true` | 에이전트 오피스 표시(`office-contract.md` §4). false 면 `office.mjs` 는 아무것도 안 함 |
| `office.project_id` | `null` | 오피스에 표시할 D'Flow 프로젝트 UUID. 있으면 `watch --project` 로 넘김. 비면 생략(`dflow.sh` 가 `.dflow` 의 기본값을 씀) |
| `office.label_max` | `40` | 팀원 키에 넣는 지시 요약의 최대 글자 수(키 전체는 늘 120자 이내) |
| `office.dflow_script` | `null` | `dflow.sh` 경로(리포 기준 상대 허용). null 이면 킷 기준 `../../dflow-work/scripts/dflow.sh` |
| `office.quiet_min` | `30` | 팀장 자리 요약의 `lanes.quiet` 기준: 살아 있는 레인 중 마지막 보고(없으면 지시) 뒤 이 분 넘게 조용한 레인 |
| `console.keys_enabled` | `false` | 오피스 웹 키 입력 답하기 켬(`office-contract.md` §4.1 「키 입력 답하기」). 환경 변수 `COORD_CONSOLE_KEYS_ENABLED=1` 로도 켬 |
| `records_check` | `false` | 머지 게이트에서 레인 기록 문서 확인 |
| `integration_check` | `""` | 통합 확인 방법 문장(서버 기동·화면 확인). 킷에 도구 이름을 넣지 않음 |
| `claude_projects_dir` | `"~/.claude/projects"` | transcript 뿌리 |
| `sessions_dir` | `"~/.claude/sessions"` | 세션 상태 json 폴더 |
| `tasks_root` | `null` | 세션 tasks 출력 뿌리(macOS 는 `/private/tmp/claude-<uid>` 꼴). null 이면 S7(다) 생략 |
| `wake_targets` | `null` | 한도 초기화 깨우기 대상 파일(있으면 레인 증감 때 갱신 알림) |

### 1.3 `workflow.model_table` 기본값

- 원칙 = 최소 충분 등급(SKILL.md 「시간·토큰·성능 최적화 원칙」)
- 기본 = sonnet. opus = 판정과 어려운 구현만. xhigh = 보안·정합성 판정만
  - opus 판정에는 설계 판정·측정 판정 포함(표 밖, agent 고를 때 적용)
- `model: "search"` = Claude agent 가 아니라 검색 워커(`search.mjs`, 읽기 전용)
  - 두 워커가 모두 실패할 때만 sonnet/medium agent 가 대신함
- `size` = 착수 지시 항목 표의 크기(S/M/L)

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
| `state.json` | 아래 스키마. `coord-state.mjs` 만 씀(mkdir 잠금 `.lock`) |
| `events.jsonl` | `{"at":ISO,"kind":…,"lane":…\|null,"data":{…}}` 한 줄씩 |
| `lanes/<레인>/brief.md` | 착수 지시 원문 |
| `lanes/<레인>/reports.md` | 받은 보고 요약 누적 |
| `summary.md` | `node scripts/coord-state.mjs summary` 가 만든 사람용 요약 |
| `ticks/` | 스크립트 전용 직전 관측: `idle-check.mjs`·`stall-check.mjs` 의 관측 기록, `tick.mjs` 의 직전 부하 단계(`load`) |

- 시각 = ISO 8601 + 시간대(`date +%Y-%m-%dT%H:%M:%S%z` 를 `+09:00` 꼴로)
- 스크립트 내부 비교 = epoch 초

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
                  "kind": "claude|glm|opencode|agy|worker", "window": null, "spawned_by": "user|coordinator"},
      "branch": "", "worktree": "", "owned": [], "forbidden": [], "heavy_env": null, "priority": 2,
      "items": [{"id": "", "title": "", "weight": 1, "done": false}],
      "queue": [], "hold": null,
      "last_report_at": null, "last_instr_at": null,
      "ctx": null, "compact": {"pending": false, "last_at": null, "pre_compact": null, "history": []},
      "memo": "", "state": "active|closing|closed",
      "brief": "", "question": {"at": "", "text": ""}
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
  "pending_user": [{"at": "", "text": ""}],
  "office": {"sent": {}, "label": {}, "sumhash": {}, "user": "", "finished": false}
}
```

- `hold` = `{"reason": "measure-wait|merge-wait|user-wait|heavy-ban|no-work|usage-band|…", "until": ISO|null}`
- `merge.in_flight` = `{"lane","branch","expected_tree","granted_at"}`
  - 완료 보고 뒤 `history` 로 옮기고 `merged`·`tree`·`cleaned` 를 채움
- `windows[]` = `{"kind":"measure|move|ban","lane":<측정 레인|null>,"opened_at","until","notified":[],"hold_job":<heavy detach id|null>}`
  - 닫으면 배열에서 빼고 이벤트로 남김
- `ctx` = `{"tokens","window","pct","src","at"}`
- `load.soft_ticks`·`hard_ticks`·`release_ticks` = 초기값 0 칸. 틱 카운터로 갱신되지 않음(부하 단계 기록 = `ticks/load`)
- `lanes.<l>.brief` = 오피스 레인 칸의 지시 요약 한 줄(`lane-add` 로 설정)
- `lanes.<l>.question` = 레인의 문장 질문 `{at, text}`
  - 쓰기 = `coord-state.mjs report <레인> --question <글>`, 지우기 = `--answered`
- `office.*` = 오피스 표시 기록(`office.mjs` 가 `coord-state.mjs set` 으로만 씀)
  - `sent` = 레인별 마지막 보낸 팀원 키
  - `label` = 레인별 마지막 보낸 라벨
  - `sumhash` = 레인별 요약 해시
  - `user` = 신원 캐시
  - `finished` = 이 회차의 팀원 키를 모두 내렸다는 마감 표식
  - 상세 = `office-contract.md` §4
- `glm` = `glm-preflight.mjs` 가 기록
- `run.coordinator` = `init` 이 `session_id`·`pid`·`handle` 을 기록. 조정자는 `name`·`addr` 만 씀
- `run.closed_at` = 회차를 마감한 시각(ISO). 열린 회차 = `null`
  - 쓰기 = `node scripts/coord-state.mjs close-run`(또는 `event run-closed`)만
  - 이 칸이 비고 다른 조정 세션이 연 회차 → `init` 은 조건 없이 `STALE_RUN` 으로 알림
  - `tick.mjs` 는 살아 있는 레인이 있고 `state.json` 이 120분 넘게 조용할 때만 알림
  - `STALE_RUN` = 경고뿐. 자동 마감 안 함
  - 계약에 없는 칸(`.run.state` 등)으로 마감을 표시하지 않음

## 3. 스크립트

- 위치 = `scripts/` 아래 node ESM(`.mjs`). 호출 = `node scripts/<이름>.mjs <인자…>`
- 앞머리에 사용법 주석. `--help` 가 같은 내용을 냄
- 공통 함수 = `scripts/lib/common.mjs`(설정·회차·시각·잠금·로그)
- 터미널 호출 = `scripts/lib/term.mjs`(어댑터)에서만
- macOS(BSD `date`·`stat`)와 GNU(Git Bash 포함) 양쪽에서 동작
- stdout = 기계가 읽는 결과. stderr = 사람용 설명·경고
- 부작용 스크립트(보내기·닫기 등) = 모두 `--dry-run`
  - 하려던 명령을 stderr 에 `DRY` 로 찍고 실제로 안 함
  - 성공 줄 = 보냈다면 나왔을 줄 앞에 `DRY ` 를 붙임(`DRY SENT <h> -`, `DRY SPAWNED … handle=-`)
  - 거부 판정 줄 = 원래 형식 그대로
- 값을 모르는 칸 = `-`(`for=-m`, `ctx=-%`, `heavy=-/-/-`)
- 비밀값(토큰·키) = 어떤 출력·로그·이벤트에도 남기지 않음
- bash 판 퇴역본·옛 시험 = `backup/`(실행 경로 아님)

종료 코드:
- 0 = 정상(판정 결과가 부정이어도 0)
- 2 = 사용법 오류
- 3 = 설정·회차 없음
- 4 = 외부 도구 실패
- 70 = 내부 오류(`term-send-safe`·`auto-answer`·`spawn-lane`). 보내거나 띄우지 않고 끝남

### 3.1 `lib/common.mjs`

- `coord_cfg <jq경로>`(값, 없으면 빈 줄) · `coord_cfg_json <jq경로>` · `coord_repo` · `coord_run_dir [run-id]`
- `coord_now_iso` · `coord_now_epoch` · `coord_iso_to_epoch <iso>`
- `coord_lock <dir>` / `coord_unlock <dir>` = mkdir 잠금 `<dir>.lock/`(안에 주인 `pid`·`pstart`)
  - 대기 30초 뒤 실패
  - 주인이 죽었거나 잠금이 `COORD_LOCK_STALE_S`(60초)보다 오래되면 탈취 잠금 아래에서 옮기고 새로 잡음
  - unlock = 주인이 나일 때만 풂
- `coord_git …`(`git_bin` 으로 실행) · `coord_expand <경로>`(`~` 풀기)
- `coord_sess8 <state.json>` = 그 회차의 `<세션8>`(`office-contract.md` §4)
- `coord_runs_summary` = 회차마다 `<run-id> <세션8> <open> <finished> <살아 있는 레인> <busy> <session_id> <pid>` 탭 구분 한 줄(깨진 파일은 건너뜀)
- `coord_stale_runs <제외 run-id>` = 마감 표식 없는 회차 `<run-id> <session_id|-> <세션8> <살아 있는 레인>`

### 3.2 `lib/term.mjs`

공개 6함수만 CLI 로 부를 수 있음. orca 구현 = `orca terminal … --json`.

| 함수 | 출력(stdout) |
|---|---|
| `term_list` | 한 줄에 하나 `<handle>\t<title>\t<worktreePath>\t<lastOutputAt epoch초\|->` |
| `term_read_screen <h> [줄수]` | 렌더된 화면 글(마지막 N줄, 기본 40) |
| `term_wait_idle <h> <ms>` | `satisfied` \| `timeout` \| `stale` |
| `term_send <h> <text> [--enter] [--wait-submit <초>]` | `accepted`·`submitted`·`turn_started`·`stale`·`error <msg>` 중 하나 |
| `term_send_keys <h> <키…>` | `term_send` 와 같은 값 + `error bad-key`(보내기 전에 걸러 아무것도 안 넣음). 키 이름·바이트 = `office-contract.md` §4.1 「키 입력 답하기」 |
| `term_close <h>` | `closed` \| `stale` |

### 3.3 판정·수집(읽기 전용)

| 스크립트 | 인자 | stdout |
|---|---|---|
| `tick.mjs` | `[--no-answer] [--dry-run]` | 틱 한 번을 묶어 행동 줄만 냄: `ANSWER/DENY/ESCALATE … lane=<레인>`(확인 창 자동 응답) · `PROMPT <레인> <kind>`(`--no-answer`) · `IDLE`·`WAIT_USER`·`STALL?`·`GONE`(idle-check) · `STALL`(stall-check) · `CTX_OVER <레인> pct=<n> thr=<n>` · `CTX_OVER_SELF pct=<n> thr=<n>` · `BAND_CHANGED <이전> <지금> five=<n> week=<n>`(state.usage 갱신, 한 번만) · `LOAD_SOFT\|LOAD_HARD\|LOAD_RELEASE per_core=<f>`(두 틱 연속) · `WINDOW_DUE <kind> lane=<레인\|-> until=<iso>` · `UNACKED <instr-id> <레인> <분>m` · `UNLINKED <이름> pid=<pid>`(처음 본 것만) · `STALE_RUN <run-id> session=<id\|-> idle=<분>m`(다른 조정 세션 회차만, 경고만). 하나도 없으면 `TICK quiet` |
| `ctx-usage.mjs` | `<session-id>` \| `--pid <pid>` \| `--lane <레인>` `[--window N]` | `CTX <session-id> tokens=<n> window=<n> pct=<n> src=transcript\|dump at=<iso>` 또는 `CTX <id> unknown <사유>` |
| `usage-band.mjs` | 없음 | `BAND <G\|Y\|O\|R\|UNKNOWN> five=<n\|-> week=<n\|-> week_allow=<n\|-> src=<kind\|-> at=<iso\|-> five_reset=<iso\|-> week_reset=<iso\|-> raw=<G\|Y\|O\|R\|->`. `raw` = `usage.relaxed` 로 내리기 전 띠 |
| `coord-status.mjs` | `[--json]` | 레인마다 `LANE <레인> name=<세션> status=<busy\|idle\|gone> for=<분>m report=<HH:MM\|-> commit=<HH:MM\|-> ahead=<n\|-> bg=<콤마목록\|-> ctx=<n\|->% hold=<사유\|->`, 이어 `PC load1=<f\|-> cpus=<n> per_core=<f\|-> heavy=<held>/<waiting>/<K> swap_mb=<n\|-> five=<n\|-> week=<n\|-> band=<띠>`, 상태에 없는 Claude 세션마다 `UNLINKED <이름> pid=<pid> cwd=<경로>`, 회차의 창마다 `WINDOW <kind> lane=<레인\|-> until=<iso>`. `--json` = 같은 정보를 객체 배열로(`"type"`: lane\|pc\|unlinked\|window) |
| `idle-check.mjs` | `[레인…]` (없으면 active 레인 전부) | 레인마다 하나: `IDLE <레인> since=<iso>` · `CANDIDATE <레인>`(첫 관측, 확정 전) · `BUSY <레인> <사유>` · `HOLD <레인> <사유>` · `WAIT_USER <레인> <창 종류>` · `COMPACTING <레인>` · `STALL? <레인> bg=<분>m` · `GONE <레인>` |
| `stall-check.mjs` | `[레인…]` | `STALL <레인> pid=<pid> cpu_delta=<초> quiet=<분>m heavy=<yes\|no>` 또는 `OK <레인>` |
| `merge-gate.mjs` | `<레인>` \| `--branch <브랜치>` | 첫 줄 `GATE <ok\|wait\|conflict> branch=<b> base=<integration> tree=<hash\|-> files=<n>`, 이어 사유 줄 `CONFLICT <경로>` · `FORBIDDEN <경로>` · `OUTSIDE <경로>`(소유 밖) · `SHARED_API <경로>` · `RESTART <note>` · `WINDOW <kind> until=<iso>` · `INFLIGHT <레인>` |
| `prompt-watch.mjs` | `<레인>` \| `--handle <h>` \| `--lanes a,b,c` `[--follow <초>] [--every <초>]` | `NONE <h>` 또는 `PROMPT <h> <trust\|usage-limit\|permission\|question\|choice\|interrupted>` 다음 줄부터 `---` 로 감싼 화면 발췌. `--lanes` = 줄 앞에 `<레인> ` 이 붙음(`<레인> PROMPT <h> <kind>`·`<레인> NONE <h>`·`<레인> GONE <사유>`). 판정·캐시·지문 규칙 = `office-contract.md` §4.2 |
| `search.mjs` | `[--tab\|--print] [--cwd <폴더>] [--timeout <초>] [--worker <agy\|opencode>] <질의…>` | `SEARCH ok <답 파일> <초> worker=<이름>` 또는 `SEARCH fail <no-command\|timeout\|error\|empty> <사유>`. 답 파일 = 회차 `searches/` 폴더(회차가 없으면 `$TMPDIR/coord-searches/`) |
| `glm-preflight.mjs` | 없음 | `ok <host> <model> <초>` 또는 `fail <alias\|host\|call\|model> <사유>`(모두 종료 코드 0). 회차가 있으면 결과를 state `.glm` 에 기록 |

### 3.4 상태 쓰기

`node scripts/coord-state.mjs <하위명령>`:

- 회차 = `COORD_RUN` 환경 변수 → `<state_dir>/current`(`init` 은 인자의 run-id)
- 쓰기 = mkdir 잠금(`<회차>/.lock`) 아래 임시 파일 → mv

| 하위명령 | 하는 일 · stdout |
|---|---|
| `init <run-id> [--goal 글] [--rules-doc 경로]` | 회차 폴더·빈 state.json 생성, current 지정 · `RUN <run-id> <폴더>`. `.run.coordinator` 에 `session_id`(`COORD_SESSION_ID` → `CLAUDE_CODE_SESSION_ID`)·`pid`(`CLAUDE_PID`, 없으면 0 = 생존 판정에서 빠지고 TTL 70분(`office-contract.md` §4)에 맡김)·`handle`(`ORCA_TERMINAL_HANDLE`, 없으면 빈 값) 기록. 같은 세션 id 의 다른 열린 회차가 있으면 회차는 만들되(**자동 마감 안 함**) stderr 경고 + stdout `SESSION_RUNS <세션8> open=<n>`(팀장 칸은 그 회차들과 공유). 다른 세션의 마감 표식 없는 회차는 `STALE_RUN <run-id> open session=<id\|-> idle=<분>m`(경고만) |
| `use <run-id>` | current 바꾸기 · `OK` |
| `get [jq식]` | state.json 에 jq 적용 결과 |
| `set <jq경로> <json값>` | 값 쓰기(예: `set '.lanes.a8.priority' 3`) · `OK` |
| `set-many <경로> <값> [<경로> <값> …]` | 값 여러 개를 한 번의 잠금·쓰기로 · `OK` |
| `lane-add <레인> <json>` | 기본 레인 골격 * 기존 값 * json 병합(기존 값 유지) · `OK` |
| `event <kind> [레인\|-] [json]` | events.jsonl 에 한 줄 · `OK` |
| `instr <레인> <kind>` | 다음 지시 번호 발급·기록, `last_instr_at` 갱신 · `<레인>-<n>` |
| `ack <instr-id>` | ack 시각 기록 · `OK` |
| `report <레인> [요약 글] [--question <글>\|--answered]` | `last_report_at` 갱신, reports.md 에 한 줄 · `OK`. `--question` = `.lanes.<레인>.question` 기록(`text` = 첫 줄 200자), `--answered` = 그 질문 삭제 |
| `item-done <레인> <항목id>` | 항목 완료 · `PROGRESS <레인> <pct>%` |
| `progress` | 레인마다 `PROGRESS <레인> <pct>% <끝난가중치>/<전체가중치>`, 마지막 `PROGRESS ALL <pct>%` |
| `hold <레인> <사유\|-> [until-iso]` | hold 세우기(`-` = 풀기) · `OK` |
| `close-run [json]` | 회차 마감: `run-closed` 이벤트 → `node scripts/office.mjs finish` → `.run.closed_at` 기록(이미 있으면 처음 값 유지, finish 는 다시 검) · `OK`. `event run-closed` 도 같은 길 |
| `summary` | summary.md 재생성 · 경로 |

### 3.5 부작용 있는 스크립트(모두 `--dry-run`)

| 스크립트 | 인자 | stdout |
|---|---|---|
| `term-send-safe.mjs` | `--handle <h>` \| `--lane <레인>`, `--text <글>` \| `--text-file <f>`, `[--timeout-ms 300000] [--raw [--expect-sha <sha>]] [--allow-busy] [--over-draft]` | `SENT <h> <turn_started\|submitted\|accepted>` 또는 `REFUSED <h> <stale\|not-idle\|interrupt-visible\|prompt-open\|compacting\|bang-in-text\|draft-in-input\|no-prompt\|lane-busy\|prompt-changed>`. `--raw` = 확인 창 응답용(`1`·`2`). `--expect-sha` = `--raw --lane` 필수. `--allow-busy` = 작업 중 세션에도 넣음. `--over-draft` = 입력창 글이 회색 추천 문구일 때만 조정자가 씀. 옵션 상세 = `office-contract.md` §4.3 |
| `compact-lane.mjs` | `<레인> [--force-no-memo] [--over-draft] [--dry-run]` | `COMPACT_REFUSED <레인> <merge-in-flight\|measure-lane\|no-memo\|cooldown\|unsupported-kind\|no-handle\|term-send-safe 거부 사유>` · `COMPACT_DONE <레인> before=<n\|-> after=<n\|->` · `COMPACT_TIMEOUT <레인>` |
| `spawn-lane.mjs` | `--name <n> --kind <claude\|glm\|opencode> [--worktree <경로\|선택자>] [--model m] [--effort e] [--autocompact t] [--prompt-file f] [--brief "<한 줄>"]` | `SPAWNED <n> handle=<h> pid=<pid\|-> session_id=<id\|->` 또는 `SPAWN_FAIL <n> <wait\|process\|screen\|preflight\|glm-cap> <사유>`. glm 은 preflight 실패 시 `SPAWN_FAIL … preflight`(대체 여부는 조정자가 정함) |
| `close-lane.mjs` | `<레인>` \| `--handle <h>` `[--force-report]` | `CLOSED <레인> handle=<h>` 또는 `CLOSE_REFUSED <레인> <bg-running\|not-reported>`. 워크트리·브랜치 남음 = stderr 경고만. `--force-report` = `not-reported` 만 통과 |
| `measure-window.mjs` | `open <measure\|move\|ban> [--lane <레인>] --until <iso> [--hold-heavy]` · `close [<kind>]` · `status` · `quiet-check` | `WINDOW_OPEN <kind> until=<iso> hold_job=<id\|->` · `WINDOW_CLOSED <kind>` · `WINDOW <kind> lane=… until=…` / `WINDOW none` · `QUIET yes\|no\|unknown run=<n> per_core=<f\|-> procs=<n>`(unknown = load 를 얻을 수 없는 환경, per_core 는 `-`) |
| `auto-answer.mjs` | `--lane <레인>` \| `--handle <h>` | `NONE <h>` · `ANSWER <h> <kind> <키> <사유>` · `DENY <h> <kind> <사유>`(Esc) · `ESCALATE <h> <kind> <사유>`(아무것도 안 보냄, 조정자가 판단 올리기 또는 사용자에게). 판정표 = `approvals.md` §5. 창 판정 상세 = `office-contract.md` §4.4 |
| `statusline-dump.mjs` | stdin = statusLine JSON | `<state_dir>/ctx/<session_id>.json` 에 `{at,session_id,context_window,rate_limits}` 저장. `COORD_STATUSLINE_NEXT` 명령이 있으면 같은 stdin 으로 실행해 그 출력을 그대로 냄 |
| `console-poll.mjs` | `start` \| `stop` \| `status` \| `--once [--dry-run]` \| `run` \| `handle-record team --agent <신원>/<host>/lead --repo <MAIN> [--slots n] [--busy n] [--until-label 글] [--project id]` \| `handle-clear team --repo <MAIN>` \| `input-handled (--lane <레인> \| --lead <세션8>) --by <coordinator\|auto> [--expect-full <창 지문>]` \| `judge-sha --lane <레인>` | 사양 = `office-contract.md` §4.1. `judge-sha` → `JUDGE <h> <kind> <창 지문>` · `NONE <h>` · `STALE <h>` · `NOFP <h>`(창 머리를 못 찾아 지문 없음 — 직접 보내지 않음). `start` → `CONSOLE_POLLER started pid=<pid>` · `CONSOLE_POLLER running pid=<pid>` · `CONSOLE_POLLER skipped <사유>`. `stop` → `CONSOLE_POLLER stopped` · `CONSOLE_POLLER none`. `status` → `CONSOLE_POLLER up pid=<pid> since=<iso> cycle=<초>` · `CONSOLE_POLLER down`. `input-handled` → `OK` · `NONE` · `NONE prompt-changed`. `handle-record` → `OK <경로>`. `handle-clear` → `OK`. `run` = 내부 루프(직접 부르지 않음). 루프는 stdout 에 아무것도 안 쓰고 로그를 `~/.dflow/console/poller-<신원>.log` 에 남김 |
| `office.mjs` | `lead-up` \| `lead-sync` \| `lane-up <레인>` \| `lane-state <레인> <작업 중\|대기\|머지 중\|답 대기\|끝\|auto>` \| `lane-down <레인>` \| `beat` \| `finish` \| `reap [--state-dir <경로>]` | stdout 없음. 종료 코드 늘 0(사용법 오류만 2). 경고 = stderr 한 줄. 사양 = `office-contract.md` §4. `lead-sync` = 이 세션 팀장 칸(라벨·자리 요약) 다시 보냄(폴러가 입력 요청 기록을 바꾼 직후). `reap` = 현재 회차 없이 동작, 상태 뿌리 = `--state-dir` → `COORD_STATE_ROOT` → 설정 `state_dir` 순 |

### 지원 환경: macOS · Git Bash(윈도우)

- 필요 도구 = **node 18.17+**(조정자 스크립트 전부), git, orca CLI, **jq**(복잡한 jq 식의 폴백 경로에만)
  - 오피스(`dflow.sh`)와 `heavy.sh` 호출에는 리포 쪽 bash 3.2+·curl·openssl 이 따로 필요(조정자 밖)
  - Git Bash = 킷 동봉 jq(`_shared/bin/win64/jq.exe`, `-b`)를 `lib/compat.mjs` 의 `jqCommand` 가 직접 부름. node·orca 는 설치 필요
- 플랫폼 차이(stat·date·프로세스 표·후손 종료·pgrep/pkill·cwd·sha256) = `scripts/lib/compat.mjs` 한 곳에 모음
  - Git Bash 는 `ps -o`·`pgrep`·`lsof` 가 없어 `/proc/<pid>/{ppid,cmdline,cwd}` 를 읽음
- **작성 규칙**:
  - 스크립트에 macOS 전용 명령·옵션을 직접 쓰지 않음(`ps -axo`·`pgrep`·`pkill`·`lsof`·`stat -f`·`date -r/-j/-v`·`sed -i ''`·`shasum`)
  - perl 을 쓰지 않음
  - `BSD || GNU` 사슬은 GNU 를 앞에 둠(GNU `stat -f` 는 `?` 와 rc 0)
  - 정본·도구 표·한계 = `../../_shared/platform-support.md`
- 윈도우에서 얻을 수 없는 값(프로세스 누적 CPU·시작 시각·부하) = 「관측 불가」로 열어 둠
  - `stall-check.mjs` 는 STALL 을 내지 않음

## 4. 에이전트 오피스 표시 계약

→ `office-contract.md` §4 (오피스 표시) · §4.1 (콘솔 폴러) · §4.2 (`prompt-watch.mjs`) · §4.3 (`term-send-safe.mjs`) · §4.4 (`auto-answer.mjs`)
