---
name: coordinator
description: 큰 업무 하나를 여러 Claude Code 세션(레인)과 임시 워커에 나눠 맡기고, 조정 세션 하나가 분해·머지 허가·idle 감시와 자동 배정·고부하 조절·사용량 조절·compact·마감을 맡는 조정자 스킬. 트리거 - "/coordinator", "조정자 시작", "레인 조정", "여러 세션 조정", "머지 조정", "조정 종료". 사용법 - /coordinator start <run-id> [목표] · tick · status · merge <레인> · measure <레인> <분> · close <레인> · finish · help · metrics · mode <token|time>
---

# /coordinator: 레인 조정자

> 문체: 에이전트 지시·보고·메시지 → `../_shared/style/Korean-STE-LLM-Guide.md`. 사람이 읽는 산출물 → `../_shared/style/Korean-STE-Writing-Guide.md`.

인자: `$ARGUMENTS`

- 스크립트 호출 = `node .claude/skills/coordinator/scripts/<이름>.mjs <인자…>` (문서에서는 `node scripts/<이름>.mjs`)
- bash 판(.sh) = 퇴역(backup/), 실행 금지
- 동작 정본 = 스크립트(`--help`). 설정 키·state 스키마·스크립트 목록 = `references/contract.md`
- 폴러 구현 사양 = `references/office-contract.md`(유지보수용)
- reference = 그 절차를 탈 때 그 절만 `cat`
- 설계: `docs/superpowers/specs/2026-10-04-coordinator-skill-design.md`. 역할 표 = `references/protocol.md` §0
- 명령별 문서(`start`·`tick` = 아래 절)
  - `status` = `coord-status.mjs`(`monitor.md` §2) · `merge` = `merge-gate.md`
  - `measure` = `heavy.md` §3 · `close` = `spawn.md` §5
  - `finish` = `closing.md` · `help` = `references/help.md`
  - `metrics` = `node scripts/run-metrics.mjs --stdout --no-csv`(마감 때는 `closing.md` §4.5) · `mode` = `coord-state.mjs mode`

> **압축 뒤 Skill 재호출 금지.** `references/resume.md` 의 재독 세트만 Bash `cat` 으로 읽음
> 감시 cron 고정 문구: `[조정자 틱] .claude/skills/coordinator/SKILL.md 의 「틱 절차」 절만 읽고 실행(Skill 재호출 금지)`
> **조정자 effort = medium**(`coordinator.effort`). 수집·판정 = 스크립트, 무거운 판단만 「판단 올리기」.

## 시간·토큰·성능 최적화 원칙

적용 대상: 조정자와 지시받는 모든 세션·Workflow. 레인용 원문 = `templates/brief.md` 「작업 방식」

0. **회차 모드.** 기본 = token(토큰 우선). 사용자가 「빠르게」 같은 요청 → time
   - 기록: `node scripts/coord-state.mjs mode time`(되돌림 = `mode token`). 이미 도는 일은 그대로, 다음 배정부터
   - 모드가 바꾸는 것: 레인 상한(`mode.lanes_max` token 3·time 6), 레인당 동시 agent(`workflow.agents_by_mode`), 풀 우선순위, 모델 표 `mode` 행, Workflow 최소 항목(`mode.workflow_min_items`), 하트비트(`mode.heartbeat_min`)
   - 조정 세션 모델 = `coordinator.model_by_mode`(token sonnet/medium·time opus/medium). 바꿀 때 사용자에게 한 줄: 「`/model sonnet`(또는 `opus`) 입력」
1. **최소 충분 등급에서 시작.**
   - 근거(시험 실패, 리뷰 지적 반복, 20분 넘게 막힘)가 있을 때만 한 칸 올림
2. **모델 등급** = `workflow.model_table`(`contract.md` §1.3, `spawn.md` §1). 기본 sonnet
3. **실행 수단 = 업무 크기로 선택.** 수정 규모(파일·줄 수)를 먼저 적음
   - D0 직접 → D1 검색 워커 → D2 agent 하나 → D3 병렬 agent → D4 Workflow → D5 새 세션
   - 낮은 쪽부터(`sizing.md`)
   - 작은 조사에 Workflow·여러 agent 금지
4. **검색·조사 = 검색 워커 먼저.** `node scripts/search.mjs "<질의>"`(`sizing.md` D1)
5. **단순 시험은 바로.**
   - 단일 시험 파일·클래스·`tsc`·lint = Workflow·heavy 슬롯 없이 실행
   - 미룸 = 측정 창·금지 통지 중뿐. 범위·예산 = `brief.md` 「시험」
6. **시험 실패 = 사다리.** `workflow.escalation.ladder` 를 한 칸씩(`workflow.md` §7)
7. **조정자는 적게 읽고 적게 말함.** 레인에 다시 묻기 전에 state·보고 확인
   - 상태 판단 = state.json 요약(`coord-state.mjs get`·`summary`)
   - 터미널 화면 = `prompt-watch.mjs` 가 이상을 판정한 레인 하나만 읽음
   - 조정 세션이 직접 하는 일 = D0(git·상태·짧은 확인)만. 조사 = 검색 워커, 구현 = 레인·풀
   - 진행표 요청 = `node scripts/coord-status.mjs` 출력 그대로 + `WBS.md`·오피스 위치. 레인 화면 다시 읽지 않음
   - 띄운 것은 바로 닫음
     - 단발 서브에이전트·워커 = `name` 없이 띄움(보고 뒤 스스로 끝남)
     - 조정자가 띄운 이름 있는 agent·레인·pane = 결과가 오면 즉시 닫음. 사람이 띄운 세션은 닫지 않음(`spawn.md` §5)
     - 동시에 4개 이하. 턴을 끝내기 전 `ListAgents` 확인
   - 컨텍스트 = `compact.coordinator_max`(200000) 넘으면 `CTX_OVER_SELF` → `compact.md` §8(`/clear` 재개)
   - 사용자가 `/clear` 뒤 재개하면 `node scripts/coord-state.mjs relink self`(새 세션 id 기록)
     - `RELINK self unknown` → `node scripts/coord-state.mjs relink self --sid "$CLAUDE_CODE_SESSION_ID"`
8. **사용량 띠가 오르면 일을 막지 않고 풀(opencode·GLM)·agy 비중을 키움.** 풀은 띠와 상관없이 늘 씀(`references/pool.md`, `usage.md` §2).
   - 새 Claude 레인 = 1주 사용률 < `usage.spawn_week_max` **그리고** 띠 ≠ R
   - R 에서는 풀(opencode·GLM)·agy 워커만
9. **같은 일을 두 번 하지 않음.**
   - 금지: 재개 캐시를 깨는 지시 수정, 도는 Workflow 와 겹치는 지시, 같은 질문 반복
10. **남의 진단은 직접 재 보고 옮김.** 확인 없이 사용자에게 전하지 않음
    - 화면 한 줄로 결론 내지 않음. 부하는 `ps`·`time` 숫자로 말함(`stall.md` §5, `heavy.md` §4)

## 판단 올리기

조정자(medium)는 아래 판단을 **opus/high 서브에이전트**에 위임하고 결론을 그대로 집행.
- 띄울 때 `name` 없이 띄움 → 결론을 보고하면 스스로 끝남
  - `name` = 다시 메시지를 보내야 하는(SendMessage) agent 에만. 이름 있는 agent 는 끝나는 즉시 닫음: `shutdown_request` → 안 끝나면 `TaskStop <이름>`
  - 이유: 이 환경에서 이름 있는 agent = 따로 남는 pane. 안 닫으면 레인처럼 남아 보임
- 넘길 것: 원문(게이트 출력·명령 전문·jstack 발췌·분해 입력) + 해당 reference 절
- 대상: `merge-gate.mjs` 의 `SHARED_API`·`OUTSIDE`(`merge-gate.md`)
- 대상: `auto-answer.mjs` 의 권한 창 `ESCALATE`(`approvals.md`)
- 대상: `STALL` 원인(`stall.md`), `start` 분해 초안(`decompose.md`), `finish` 결정·후속 정리(`closing.md`)
- 대상: 레인 `질문` 중 설계·정합성(공유 API·스키마·다른 레인과 겹치는 결정·트랜잭션). 아래 「`질문` 처리」 2단계

## 시작 절차 (`start <run-id> [목표]`)

조정 세션 하나 = 회차 하나.
- 열린 회차에 새 업무가 들어옴 → 그 회차에 `lane-add` + `run.goal` 덧붙임(`decompose.md` §1)

1. 설정 확인: `.coord.json`(공용)·`.coord.local.json`(PC 전용)
   - PC별 값(`launch.claude`·`integration_check`·`git_bin` 등) = 사용자에게 1회 확인
2. `node scripts/coord-state.mjs init <run-id> --goal "<목표>" [--rules-doc <경로>]`
   - 출력 `SESSION_RUNS`·`STALE_RUN` 처리 = `closing.md` §6
   - 사용자가 빠르게를 요청했으면 `node scripts/coord-state.mjs mode time`
   - `WBS.md` 자동 생성·열기(`wbs.auto_open`). 묶음 = `lane-add` 의 `group`, 조정자 단계 = `wbs-phase`·`wbs-done`·`wbs-issue`
3. 분해: `decompose.md`(초안 = 판단 올리기). 사용자 확정
   - 레인 공통 규칙 문서 = `templates/lane-rules-README.md`
4. 레인 확보: `spawn.md`
   - 사용자 세션 = 신원 보고로 연결
   - 스킬이 띄우는 세션 = `spawn-lane.mjs`
   - 띄운 세션에 `prompt-watch.mjs` 부착 = `approvals.md` §1
   - 레인 수 상한 = `mode.lanes_max[모드]` 와 `usage.md` 「새 레인 상한」 중 작은 쪽
   - 레인마다 `node scripts/coord-state.mjs lane-add`
     - 지시 한 줄(오피스 슬롯 이름) = `"brief"` 로 함께 입력
   - 오피스 표시 = 스크립트 자동 전송, 실패 무시(`office-contract.md` §4)
5. 착수 지시: `templates/brief.md` 자리표시자를 채워 SendMessage
   - 번호: `node scripts/coord-state.mjs instr <레인> start`
   - 원문: `lanes/<레인>/brief.md`
6. 감시 시작
   - 이벤트 틱: `Monitor` 로 `node .claude/skills/coordinator/scripts/tick.mjs --watch` 를 백그라운드 감시(줄이 나올 때만 깨움)
     - 주기 기본 300초(`--interval`). 같은 일(종류+대상)은 15분(`--repeat-min`) 안에 한 번만 나옴
   - 하트비트: `CronCreate` 간격 = `mode.heartbeat_min[모드]`분(token 30·time 15), 고정 문구 그대로
   - `set-many` 로 기록(cron_id·조정 세션 이름·주소. session_id·pid·handle = `init` 이 기록)
   - `node scripts/coord-state.mjs set-many '.run.cron_id' '"<id>"' '.run.coordinator.name' '"<이름>"' '.run.coordinator.addr' '"<주소>"'`

## 틱 절차

1. `node scripts/tick.mjs` 실행(확인·선택 창 자동 응답 포함, `WBS.md` 자동 갱신)
   - Monitor 로 받은 --watch 줄도 같은 표로 처리. 하트비트 틱은 tick.mjs 1회
2. `TICK quiet` 이고 처리할 메시지 없음 → **말 없이 턴 종료.**
3. 나온 줄만 아래 표대로 처리
4. 바뀐 것이 있었으면 `node scripts/coord-state.mjs summary`

| 줄 | 처리 |
|---|---|
| `ANSWER …` | 기록만 됨. 할 일 없음 |
| `DENY …` | 레인에 `확인 창 거부` 통지(`protocol.md` 3.11) |
| `ESCALATE … permission` | → `approvals.md` §3 |
| `ESCALATE …`(그 밖)·`WAIT_USER` | 사용자에게 한 줄 알림. 덮어 보내지 않음 |
| `IDLE <레인>` | → `monitor.md` §5. `queue`·`backlog` 없음 + 마지막 보고 `정리 완료` + `spawned_by = "coordinator"` → `close-lane.mjs <레인>`(`user` 면 회차에서 떼고 한 줄 알림) |
| `STALL?`·`STALL` | → `stall.md`. 프로세스 직접 종료 금지 |
| `GONE` | 화면 확인 뒤 레인 정리 또는 재기동 여부를 사용자에게 |
| `POOL_DONE …` | 기록만. `fallback=1` 이 한 레인에서 3번 넘음 → 그 레인 지시의 풀 몫 낮출지 판단 |
| `CTX_OVER`(`tokens=`·`max=` 포함) | → `compact.md`(`compact-lane.mjs <레인> --clear`). 결과 `relink=unknown` → 신원 요청 뒤 `relink <레인> --sid <id>`(`compact.md` §5) |
| `CTX_OVER_SELF` | 정본 메모·`summary` 갱신 뒤 사용자에게 「`/clear` 뒤 재개 문구」 한 줄(`compact.md` §8). 재개 뒤 `coord-state.mjs relink self`. `RELINK self unknown` → `relink self --sid "$CLAUDE_CODE_SESSION_ID"` |
| `BAND_CHANGED` | → `usage.md` §4. 전 레인에 `사용량 조정` 1회 |
| `LOAD_SOFT`·`LOAD_HARD`·`LOAD_RELEASE` | → `heavy.md` §4 |
| `WINDOW_DUE` | → `heavy.md` §3 |
| `UNACKED` | 「`<instr_id>` 받았는지 한 줄 답」(최대 2회, 그 뒤 화면 확인) |
| `UNLINKED` | 신원 보고를 요청할지 사용자에게 한 줄 |
| `STALE_RUN <회차> …` | 경고만. 그대로 둠. 끝난 회차가 확실 → 사용자에게 알린 뒤 `close-run`(`closing.md` §6) |

## 메시지 분기

첫 줄 `[보내는쪽→받는쪽] <종류>:` 로 분기.
- 수신 시: `node scripts/coord-state.mjs report <레인> "<요약>"`
- 첫 줄에 `instr_id` 가 있으면: `node scripts/coord-state.mjs ack <instr-id>` (레인 이름 붙이면 사용법 오류)

| 종류 | 처리 |
|---|---|
| `신원` | `node scripts/coord-state.mjs set '.lanes.<레인>.session' …`(`spawn.md` §4) |
| `진행 보고` | `item-done`(WBS 자동 갱신) → `progress`(`monitor.md` §7). 「대기」 보고 → 아래 목록 |
| `질문` | 아래 목록 |
| `머지 요청` | `merge-gate.md`. 한 번에 하나만 허가, 허가에 「머지 뒤 다음 일」. 레인당 commit 1개·dev tip 위(`NOT_SQUASHED`·`NOT_REBASED` → 합친 뒤 재요청), 머지 = `--ff-only` |
| `머지 완료`·`정리 완료` | 트리 대조 → `merge.history`, 다음 허가. 남긴 브랜치 = `pending_user`. 아래 「끝난 레인 닫기」 |
| `측정 끝` | `node scripts/measure-window.mjs close` → 전 레인 `무거운 작업 재개` |
| `정본 갱신 완료`·재개 답 | `compact.md` |
| 대신 승인 요청 | 받지 않음(권한 우회 방지) |

끝난 레인 닫기(사용자 요청 없이, 같은 턴에)
- 조건: `정리 완료` 수신(트리 대조·`merge.history` 기록 뒤), 그 레인에 다음 항목(`queue`·`backlog`) 없음
- `lanes.<레인>.session.spawned_by = "coordinator"` → `node scripts/close-lane.mjs <레인>`(`spawn.md` §5)
- `spawned_by = "user"`(사람이 띄운 세션) → 닫지 않음. 회차에서 떼고 사용자에게 한 줄(`spawn.md` §5)
- 다음 항목을 받은 레인 → 그 항목의 `정리 완료` 때 다시 판단

`진행 보고` 의 「대기」「기다린다」(원인 = 다른 레인 머지·의존물·Oracle·heavy 슬롯·사용자 결정)
- IDLE 확정을 기다리지 않음. **같은 답장에** 병목과 무관한 일을 줌(`monitor.md` 「병목 대기 레인」)

`질문` 처리
1. `node scripts/coord-state.mjs report <레인> "<요약>" --question "<첫 줄>"` 기록
2. 같은 질문 확인: `node scripts/coord-state.mjs decisions --grep "<핵심어>"` → 있으면 그 답 그대로
3. 종류별 처리(화면 창 답 = `approvals.md` §3)
   - 사실·절차(규칙 문서·머지 순서·시험 범위) → 직접 답
   - 영향 작은 선택(기본안 있음, 레인 안에서 끝남) → 「기본안대로」
   - 설계·정합성(공유 API·스키마·다른 레인과 겹침·트랜잭션) → 「판단 올리기」(opus/high)
   - 제품 결정·삭제·shared 기존 API 변경 → `pending_user` 에 올려 사용자에게. 레인은 기본안으로 계속할 수 있으면 계속
4. 답한 뒤: `report <레인> --answered` + `node scripts/coord-state.mjs decide <레인> "<질문 요약>" "<결정>"`
   - 판단 올리기로 정함 → `--esc`. 앞 결정을 뒤집음 → `--reverse`

## 금지

- 실행 중인 Workflow 하위 에이전트에 SendMessage (`workflow.md` §6)
- 사용자 입력 대기 화면에 지시·`/compact` 덮어 보내기
  - 터미널 입력 = `term-send-safe.mjs`·`auto-answer.mjs` 로만
- 지시문의 `!` (opencode 는 `/`·`@` 도)
- 삭제(DB 행·브랜치 `-D`·워크트리 `--force`·`rm -rf`), 프로세스 직접 종료, 강제 push(`--force`)
  - 예외: 반영 빌드·통합 브랜치 push·릴리스 반영 = **조정자 몫**, 묻지 않고 실행(`closing.md` §7)
  - 레인은 push 하지 않음
- 레인 소유 파일 수정, 같은 지시를 cooldown 안에 반복
- PC별 이름을 문서·지시문에 박기(설정으로만)
- **회차 마감 때 `finish`(`closing.md`) 건너뛰기.**
  - 마감 정리 = `--watch` Monitor 중지·cron 삭제 포함(`closing.md` §4)
  - 최소 = `close-run`(`closing.md` §6)
- 계약 밖 state 칸(`.run.state` 등)을 `set` 해 마감 흉내 내기. 상태 칸 = `contract.md` §2.1 뿐
- **실제 개발 작업**(제품 코드·시험 수정, 개발 커밋). 몇 줄이라도 레인을 띄워 맡김.
  - 조정자 몫 = 위치 조사·분해·지시·머지 게이트·반영 빌드·push·재기동·화면 확인·보고
  - 이미 손댄 편집 = 패치 보관 → 원복 → 패치를 레인 지시에 넘김
