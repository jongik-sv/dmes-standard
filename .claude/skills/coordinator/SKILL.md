---
name: coordinator
description: 큰 업무 하나를 여러 Claude Code 세션(레인)과 임시 워커에 나눠 맡기고, 조정 세션 하나가 분해·머지 허가·idle 감시와 자동 배정·고부하 조절·사용량 조절·compact·마감을 맡는 조정자 스킬. 트리거 - "/coordinator", "조정자 시작", "레인 조정", "여러 세션 조정", "머지 조정", "조정 종료". 사용법 - /coordinator start <run-id> [목표] · tick · status · merge <레인> · measure <레인> <분> · close <레인> · finish · help
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

> **압축 뒤 Skill 재호출 금지.** `references/resume.md` 의 재독 세트만 Bash `cat` 으로 읽음
> 감시 cron 고정 문구: `[조정자 틱] .claude/skills/coordinator/SKILL.md 의 「틱 절차」 절만 읽고 실행(Skill 재호출 금지)`
> **조정자 effort = medium**(`coordinator.effort`). 수집·판정 = 스크립트, 무거운 판단만 「판단 올리기」.

## 시간·토큰·성능 최적화 원칙

적용 대상: 조정자와 지시받는 모든 세션·Workflow. 레인용 원문 = `templates/brief.md` 「작업 방식」

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
8. **사용량 띠가 오르면 일을 막지 않고 Claude 몫을 opencode·agy 로 이동**(`usage.md` §2).
   - 새 Claude 레인 = 1주 사용률 < `usage.spawn_week_max` **그리고** 띠 ≠ R
   - R 에서는 opencode·agy 워커만
9. **같은 일을 두 번 하지 않음.**
   - 금지: 재개 캐시를 깨는 지시 수정, 도는 Workflow 와 겹치는 지시, 같은 질문 반복
10. **남의 진단은 직접 재 보고 옮김.** 확인 없이 사용자에게 전하지 않음
    - 화면 한 줄로 결론 내지 않음. 부하는 `ps`·`time` 숫자로 말함(`stall.md` §5, `heavy.md` §4)

## 판단 올리기

조정자(medium)는 아래 판단을 **opus/high 서브에이전트**에 위임하고 결론을 그대로 집행.
- 넘길 것: 원문(게이트 출력·명령 전문·jstack 발췌·분해 입력) + 해당 reference 절
- 대상: `merge-gate.mjs` 의 `SHARED_API`·`OUTSIDE`(`merge-gate.md`)
- 대상: `auto-answer.mjs` 의 권한 창 `ESCALATE`(`approvals.md`)
- 대상: `STALL` 원인(`stall.md`), `start` 분해 초안(`decompose.md`), `finish` 결정·후속 정리(`closing.md`)

## 시작 절차 (`start <run-id> [목표]`)

조정 세션 하나 = 회차 하나.
- 열린 회차에 새 업무가 들어옴 → 그 회차에 `lane-add` + `run.goal` 덧붙임(`decompose.md` §1)

1. 설정 확인: `.coord.json`(공용)·`.coord.local.json`(PC 전용)
   - PC별 값(`launch.claude`·`integration_check`·`git_bin` 등) = 사용자에게 1회 확인
2. `node scripts/coord-state.mjs init <run-id> --goal "<목표>" [--rules-doc <경로>]`
   - 출력 `SESSION_RUNS`·`STALE_RUN` 처리 = `closing.md` §6
   - `WBS.md` 자동 생성·열기(`wbs.auto_open`). 묶음 = `lane-add` 의 `group`, 조정자 단계 = `wbs-phase`·`wbs-done`·`wbs-issue`
3. 분해: `decompose.md`(초안 = 판단 올리기). 사용자 확정
   - 레인 공통 규칙 문서 = `templates/lane-rules-README.md`
4. 레인 확보: `spawn.md`
   - 사용자 세션 = 신원 보고로 연결
   - 스킬이 띄우는 세션 = `spawn-lane.mjs`
   - 띄운 세션에 `prompt-watch.mjs` 부착 = `approvals.md` §1
   - 레인마다 `node scripts/coord-state.mjs lane-add`
     - 지시 한 줄(오피스 슬롯 이름) = `"brief"` 로 함께 입력
   - 오피스 표시 = 스크립트 자동 전송, 실패 무시(`office-contract.md` §4)
5. 착수 지시: `templates/brief.md` 자리표시자를 채워 SendMessage
   - 번호: `node scripts/coord-state.mjs instr <레인> start`
   - 원문: `lanes/<레인>/brief.md`
6. `CronCreate`(`tick.cron`, 위 고정 문구) 후 `set-many` 로 기록(session_id·pid·handle = `init` 이 기록)
   - `node scripts/coord-state.mjs set-many '.run.cron_id' '"<id>"' '.run.coordinator.name' '"<이름>"' '.run.coordinator.addr' '"<주소>"'`

## 틱 절차

1. `node scripts/tick.mjs` 실행(확인·선택 창 자동 응답 포함, `WBS.md` 자동 갱신)
2. `TICK quiet` 이고 처리할 메시지 없음 → **말 없이 턴 종료.**
3. 나온 줄만 아래 표대로 처리
4. 바뀐 것이 있었으면 `node scripts/coord-state.mjs summary`

| 줄 | 처리 |
|---|---|
| `ANSWER …` | 기록만 됨. 할 일 없음 |
| `DENY …` | 레인에 `확인 창 거부` 통지(`protocol.md` 3.11) |
| `ESCALATE … permission` | → `approvals.md` §3 |
| `ESCALATE …`(그 밖)·`WAIT_USER` | 사용자에게 한 줄 알림. 덮어 보내지 않음 |
| `IDLE <레인>` | → `monitor.md` §5 |
| `STALL?`·`STALL` | → `stall.md`. 프로세스 직접 종료 금지 |
| `GONE` | 화면 확인 뒤 레인 정리 또는 재기동 여부를 사용자에게 |
| `CTX_OVER` | → `compact.md` |
| `CTX_OVER_SELF` | 정본 메모·state 갱신 뒤 사용자에게 「조정자 compact 필요」 |
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
| `머지 완료`·`정리 완료` | 트리 대조 → `merge.history`, 다음 허가. 남긴 브랜치 = `pending_user` |
| `측정 끝` | `node scripts/measure-window.mjs close` → 전 레인 `무거운 작업 재개` |
| `정본 갱신 완료`·재개 답 | `compact.md` |
| 대신 승인 요청 | 받지 않음(권한 우회 방지) |

`진행 보고` 의 「대기」「기다린다」(원인 = 다른 레인 머지·의존물·Oracle·heavy 슬롯·사용자 결정)
- IDLE 확정을 기다리지 않음. **같은 답장에** 병목과 무관한 일을 줌(`monitor.md` 「병목 대기 레인」)

`질문` 처리
1. `node scripts/coord-state.mjs report <레인> "<요약>" --question "<첫 줄>"` 기록
2. 근거 확인 뒤 직접 답함 → `report <레인> --answered` (화면 창 답 = `approvals.md` §3)
3. 삭제·shared 기존 API 변경·사용자 결정 → `pending_user` 에 올려 사용자에게

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
- **회차 마감 때 `finish`(`closing.md`) 건너뛰기.** 최소 = `close-run`(`closing.md` §6)
- 계약 밖 state 칸(`.run.state` 등)을 `set` 해 마감 흉내 내기. 상태 칸 = `contract.md` §2.1 뿐
- **실제 개발 작업**(제품 코드·시험 수정, 개발 커밋). 몇 줄이라도 레인을 띄워 맡김.
  - 조정자 몫 = 위치 조사·분해·지시·머지 게이트·반영 빌드·push·재기동·화면 확인·보고
  - 이미 손댄 편집 = 패치 보관 → 원복 → 패치를 레인 지시에 넘김
