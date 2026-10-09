---
name: coordinator
description: 큰 업무 하나를 여러 Claude Code 세션(레인)과 임시 워커에 나눠 맡기고, 조정 세션 하나가 분해·머지 허가·idle 감시와 자동 배정·고부하 조절·사용량 조절·compact·마감을 맡는 조정자 스킬. 트리거 - "/coordinator", "조정자 시작", "레인 조정", "여러 세션 조정", "머지 조정", "조정 종료". 사용법 - /coordinator start <run-id> [목표] · tick · status · merge <레인> · measure <레인> <분> · close <레인> · finish · help
---

# /coordinator: 레인 조정자

인자: `$ARGUMENTS`

- 스크립트 호출 = `node .claude/skills/coordinator/scripts/<이름>.mjs <인자…>` (문서에서는 `node scripts/<이름>.mjs`)
- bash 판(.sh) = 2026-10-09 퇴역(backup/), 실행 금지

> **압축 뒤 Skill 재호출 금지.** `references/resume.md` 의 재독 세트만 Bash `cat` 으로 읽음.
> 감시 cron 고정 문구: `[조정자 틱] .claude/skills/coordinator/SKILL.md 의 「틱 절차」 절만 읽고 실행(Skill 재호출 금지)`
> - 슬래시 명령이면 틱마다 스킬 전체가 다시 실림
> - 이 문구를 받으면 「틱 절차」만 따름
> **조정자 기본 effort = medium**(`coordinator.effort`). 수집·판정 = 스크립트, 무거운 판단만 「판단 올리기」.

설계: `docs/superpowers/specs/2026-10-04-coordinator-skill-design.md`
- 설정 키·state 스키마·스크립트 인자·출력 줄 정본 = `references/contract.md` (이 문서와 어긋나면 contract.md 우선)
- 역할 표 = `references/protocol.md` §0

## 시간·토큰·성능 최적화 원칙

적용 대상: 조정자와 조정자가 지시하는 모든 세션·Workflow. 지시 블록(`references/workflow.md`)에 그대로 들어감.

1. **최소 충분 등급에서 시작.** 실패·막힘 근거(시험 실패, 리뷰 지적 반복, 20분 넘게 막힘)가 생길 때만 한 칸 올림.
2. **기본 = sonnet.**
   - opus = 판정(M/L 리뷰·머지 게이트·원인 진단), L·동시성·트랜잭션 구현
   - xhigh = 보안·정합성 판정
   - 기계적 일 = haiku/low
   - 표: `workflow.model_table`
3. **실행 수단 = 업무 크기로 선택.**
   - 먼저 핵심 수정이 몇 파일·몇 줄인지 적음
   - D0 직접 → D1 검색 워커 → D2 agent 하나 → D3 병렬 agent → D4 Workflow → D5 새 세션 중 낮은 쪽부터(영향·범위·단계·시간, `references/sizing.md`)
   - 작은 조사에 Workflow·여러 agent 금지
4. **검색·조사 = 검색 워커 먼저.** `node scripts/search.mjs "<질의>"`
   - 기본 agy 새 탭, 실패 시 opencode. Claude 토큰 0, 답 = 파일
   - 두 워커 모두 `SEARCH fail` 일 때만 grep 또는 sonnet/medium agent
   - 레인 지시문에도 「agy·opencode 먼저」 기재(조사·위치 찾기·사용처 집계)
5. **단순 시험은 빠르게.** 단일 시험 파일·클래스·`tsc`·lint = Workflow·heavy 슬롯 없이 바로
   - 미루는 경우 = 측정 창·금지 통지 중
   - 전체 시험 = 머지 요청 직전 1회
6. **시험 실패 = 사다리.**
   - 환경 실패 → 같은 등급 1회 재실행
   - 코드 실패 → `workflow.escalation.ladder` 를 한 칸씩
   - 끝 칸에서도 실패 → blocked 보고(`references/workflow.md` §7)
7. **조정자는 적게 읽고 적게 말함.**
   - 틱 = `tick.mjs` 1회, `TICK quiet` 이면 말 없이 끝
   - reference = 그 절차를 탈 때 그 절만
   - 레인에 다시 묻기 전에 state·보고 확인
8. **사용량 띠가 오르면 일을 막지 않고 Claude 몫을 opencode·agy 로 이동.**
   - Y: 제한 없음에 가까움. 조사·문서 정리·쉬운 반복 구현 = opencode·agy
   - O: 새 Workflow 허용(model·effort 명시). opus = 판정·L 구현·동시성에 계속. 대기 작업 자동 배정만 중단. 일반 구현 = opencode 워커 우선
   - R: Claude 세션 = 머지·정리만. 남은 일 = opencode·agy 워커
   - `usage.relaxed`(계정 여유 스위치) 켬 → R 이 아니면 띠와 무관하게 Claude 사용
   - **새 레인 = 1주 사용률 `usage.spawn_week_max`(95%) 미만이면 띠와 무관하게 띄움**
   - 동시 agent 상한 = G4·Y3·O2·R0(`references/usage.md`)
9. **같은 일을 두 번 하지 않음.** 금지: 재개 캐시를 깨는 지시 수정, 도는 Workflow 와 겹치는 지시, 같은 질문 반복.
10. **남의 진단은 직접 재 보고 옮김.**
    - 레인·다른 세션의 원인 진단을 확인 없이 사용자에게 전하지 않음
    - 화면 한 줄로 결론 내지 않음. 부하는 `ps`·`time` 으로 잰 숫자로 말함(`stall.md` §5, `heavy.md` §4)

## 판단 올리기

조정자(medium)는 아래 판단을 **opus/high 서브에이전트**에 위임하고 결론을 그대로 집행.
- 넘길 것: 원문(게이트 출력·명령 전문·jstack 발췌·분해 입력) + 해당 reference 절
- `merge-gate.mjs` 의 `SHARED_API`·`OUTSIDE` 판정 (`merge-gate.md`)
- `auto-answer.mjs` 의 권한 창 `ESCALATE` (`approvals.md`)
- `STALL` 원인 (`stall.md`)
- `start` 의 분해 초안 (`decompose.md`)
- `finish` 의 결정·후속 정리 (`closing.md`)

## 시작 절차 (`start <run-id> [목표]`)

조정 세션 하나 = 회차 하나.
- 열린 회차가 있는데 새 업무가 들어옴 → 새 회차 없이 그 회차에 `lane-add` + `run.goal` 에 덧붙임(`decompose.md` §1)

1. 설정 확인: `<repo>/.coord.json`(공용)·`.coord.local.json`(PC 전용)
   - `launch.claude`·`integration_check`·`git_bin` 등 PC별 값 = 사용자에게 1회 확인
2. `node scripts/coord-state.mjs init <run-id> --goal "<목표>" [--rules-doc <경로>]`
   - 조정 세션 `COORD_SESSION_ID`(또는 `CLAUDE_CODE_SESSION_ID`)·pid(`CLAUDE_PID`, 없으면 0)를 `.run.coordinator.session_id`·`.pid` 에 기록
   - pid 0 = 생존 판정에서 빠지고 TTL 70분에 맡김
   - 오피스 팀장 칸 = 조정 세션당 하나(`coord:<세션8>`), 회차당 아님
   - 같은 세션의 앞 회차가 열려 있어도 자동 마감 없음
   - `SESSION_RUNS <세션8> open=<n>` 출력(새 회차 포함 열린 회차 수). 팀장 칸 공유, slots·busy 합산
   - 끝난 회차 → `COORD_RUN=<회차> node scripts/coord-state.mjs close-run`
   - 다른 세션의 열린 회차 → `STALE_RUN <회차> open …` 경고만. 직접 닫지 않음(진행 중인 다른 조정자의 회차일 수 있음)
3. 분해: `references/decompose.md`(초안 = 판단 올리기). 사용자 확정. 레인 공통 규칙 문서 = `templates/lane-rules-README.md`.
4. 레인 확보: `references/spawn.md`
   - 사용자 세션 = 신원 보고로 연결
   - 스킬이 띄우는 세션 = `spawn-lane.mjs`
   - 띄운 세션에 `Monitor` 로 `node scripts/prompt-watch.mjs <레인> --follow 1200` 부착(여러 레인 = `--lanes a,b,c` 하나로. 폴러가 돌면 화면 직접 읽지 않고 캐시로 판정)
   - 레인마다 `node scripts/coord-state.mjs lane-add` (에이전트 오피스 슬롯 이름이 될 지시 한 줄 = `"brief"` 로 함께 입력)
   - 오피스 표시 = `init`·`spawn-lane.mjs`·틱이 자동 전송, 표시 전용이라 실패해도 무시. 키 규칙 = `references/contract.md` §4
5. 착수 지시: `templates/brief.md` 에 `protocol.md` 템플릿과 `workflow.md` 블록을 채워 SendMessage
   - 번호: `node scripts/coord-state.mjs instr <레인> start`
   - 원문: `lanes/<레인>/brief.md`
6. `CronCreate`(`tick.cron`, 위 고정 문구) → `node scripts/coord-state.mjs set '.run.cron_id' '"<id>"'`, `.run.coordinator` 에 자기 이름·주소·핸들·session_id.

## 틱 절차

1. `node scripts/tick.mjs` 실행. 확인·선택 창 자동 응답까지 스크립트가 처리.
2. `TICK quiet` 이고 처리할 메시지 없음 → **말 없이 턴 종료.**
3. 나온 줄만 처리(표 아래 두 목록 포함)
4. 바뀐 것이 있었으면 `node scripts/coord-state.mjs summary` (표·목록 처리 뒤)

| 줄 | 처리 |
|---|---|
| `ANSWER …` | 기록만 됨. 할 일 없음 |
| `DENY …` | 레인에 `확인 창 거부` 통지(`protocol.md`) |
| `ESCALATE … permission` | 아래 목록 |
| `ESCALATE …`(그 밖) · `WAIT_USER` | 사용자에게 한 줄 알림. 덮어 보내지 않음 |
| `IDLE <레인>` | `references/monitor.md` 배정(queue → backlog → 병목 대기 레인 (a)~(e) → 쉬어라). 띠별 범위(Y·O = opencode 워커 우선 포함). 병목 대기 레인의 보고 = `진행 보고` 행 참조 |
| `STALL?`·`STALL` | `references/stall.md`(원인 = 판단 올리기). 프로세스 직접 종료 금지 |
| `GONE` | 화면 확인 뒤 레인 상태 정리 또는 재기동 여부를 사용자에게 |
| `CTX_OVER` | `references/compact.md`(정본 갱신 요청 → `compact-lane.mjs`) |
| `CTX_OVER_SELF` | 정본 메모·state 갱신 뒤 사용자에게 「조정자 compact 필요」 한 줄 |
| `BAND_CHANGED` | `references/usage.md` 띠 행동, 전 레인에 `사용량 조정` 1회 |
| `LOAD_*` | `references/heavy.md` load 기준 |
| `WINDOW_DUE` | `references/heavy.md` 창 닫기·점검 |
| `UNACKED` | 「`<instr_id>` 받았는지 한 줄 답」(최대 2회, 그 뒤 화면 확인) |
| `UNLINKED` | 그 세션에 신원 보고를 요청할지 사용자에게 한 줄 |
| `STALE_RUN <회차>` | 아래 목록 |

`ESCALATE … permission` 처리
1. `node scripts/console-poll.mjs judge-sha --lane <레인>` → 화면 sha 기억
2. 판단 올리기
3. `node scripts/term-send-safe.mjs --lane <레인> --raw --expect-sha <sha>`
   - `SENT` = 처리됨. 소비는 term-send-safe 가 이미 기록하므로 input-handled 부르지 않음
   - 키를 다른 경로로 보냈을 때만 `--expect-full <sha>` 와 함께 input-handled (`approvals.md` §3)
4. 사용자 결정 항목 → 사용자에게 한 줄

`STALE_RUN <회차>` 처리
- 의미: 다른 조정 세션의 회차가 마감 표식 없이, 살아 있는 레인을 둔 채 남음(경고만, 자동 마감 없음)
- 기본 = 그대로 둠
- 끝난 회차가 확실 → 사용자에게 알린 뒤 `COORD_RUN=<회차> node scripts/coord-state.mjs close-run` (`closing.md` §6)
- 오피스 표시 = 조정 세션이 죽으면 PC 폴러의 `node scripts/office.mjs reap` 이 내림

레인 상태 판단
- 기본 = state.json 요약(`node scripts/coord-state.mjs get`·`summary`)
- 터미널 화면 = `prompt-watch.mjs` 가 이상을 판정한 레인 하나만 읽음

## 메시지 분기

첫 줄 `[보내는쪽→받는쪽] <종류>:` 로 분기.
- 수신 시: `node scripts/coord-state.mjs report <레인> "<요약>"`
- 첫 줄에 `instr_id` 가 있으면: `node scripts/coord-state.mjs ack <instr-id>` (레인 이름을 앞에 붙이면 사용법 오류)

| 종류 | 처리 |
|---|---|
| `신원` | `node scripts/coord-state.mjs set '.lanes.<레인>.session' …`(`spawn.md` 신원 연결) |
| `진행 보고` | `item-done` → `progress`(`monitor.md` 진도율). 아래 목록 참조 |
| `질문` | 아래 목록 |
| `머지 요청` | `merge-gate.md`(`merge-gate.mjs`). 한 번에 하나만 허가, 허가에 「머지 뒤 다음 일」 |
| `머지 완료`·`정리 완료` | 트리 대조 → `merge.history`, 다음 허가. 남긴 브랜치 = `pending_user` |
| `측정 끝` | `node scripts/measure-window.mjs close` → 전 레인 `무거운 작업 재개` |
| `정본 갱신 완료`·재개 답 | `compact.md` |
| 대신 승인 요청 | 받지 않음(권한 우회 방지) |

`진행 보고` 에 「대기」「기다린다」가 있고 원인이 다른 레인 머지·의존물·Oracle·heavy 슬롯·사용자 결정
- IDLE 확정을 기다리지 않음. 무작정 대기시키지 않음
- **같은 답장에** 병목과 무관한 일을 함께 줌(`monitor.md` 「병목 대기 레인」 (a)~(e)). 없을 때만 대기 유지

`질문` 처리
1. `node scripts/coord-state.mjs report <레인> "<요약>" --question "<첫 줄>"` 기록
2. 근거 확인 뒤 직접 답함 → `report <레인> --answered`
   - 화면 창에 `node scripts/term-send-safe.mjs --lane … --raw` 로 답함 → 처리됨은 이미 기록됨
   - 다른 경로로 답함 → `node scripts/console-poll.mjs input-handled --lane <레인> --by coordinator --expect-full <judge-sha 의 지문>`
3. 삭제·shared 기존 API 변경·사용자 결정 → `pending_user` 에 올려 사용자에게

## 금지

- 실행 중인 Workflow 하위 에이전트에 SendMessage (사본이 떠 같은 파일을 고침). 규칙 변경 = TaskStop 후 남은 단계만 새로.
- 사용자 입력 대기 화면에 지시·`/compact` 덮어 보내기. 터미널 입력 = `term-send-safe.mjs`·`auto-answer.mjs` 로만.
- 지시문의 `!` (opencode 는 `/`·`@` 도).
- 삭제(DB 행·브랜치 `-D`·워크트리 `--force`·`rm -rf`), 프로세스 직접 종료, 강제 push(`--force`).
- (예외 안내) 반영 빌드·통합 브랜치 push·릴리스 브랜치 반영 = 금지 아님, **조정자 몫**
  - `merge.auto_build`·`merge.auto_push` 가 false 이면 건너뜀
  - 머지를 트리 대조로 확인한 뒤 사용자에게 묻지 않고 스스로 판단해 실행(`closing.md` §7)
  - 빌드·push 시점을 사용자 결정 목록에 올리지 않음(2026-10-07 사용자 지시)
  - 레인은 여전히 push 하지 않음
- 레인 소유 파일 수정, 같은 지시를 cooldown 안에 반복, PC별 이름을 문서·지시문에 박기(설정으로만).
- **회차를 끝낼 때 `finish` 절차(`closing.md`)를 건너뛰기.**
  - 최소한 `node scripts/coord-state.mjs close-run` 호출
  - 오피스 팀장·팀원 표시를 내리고 `.run.closed_at` 을 남기는 길 = 이것뿐
- **state 칸을 계약 밖 이름으로 직접 `set` 해 상태 흉내 내기**(예: `set '.run.state' '"finished"'`).
  - 동작 없이 끝난 것처럼 보일 뿐, 오피스에 팀장 칸이 남음
  - 상태 칸 = `contract.md` §2.1 에 있는 것만
- **실제 개발 작업**(제품 코드·시험 수정, 개발 커밋). 몇 줄이라도 레인을 띄워 맡김.
  - 조정자 몫 = 위치 조사·분해·지시·머지 게이트·반영 빌드·push·재기동·화면 확인·보고
  - 머지 뒤 실행 중 서버에 반영하는 빌드(watch 없는 형제 패키지 dist 단발 빌드 등) = 개발 작업 아님, 조정자 몫
  - 이미 손댄 편집 = 패치로 보관 → 원복 → 그 패치를 레인 지시에 넘김(2026-10-06 사용자 지시)

## 참조 (그 절차를 탈 때만 `cat`)

| 문서 | 읽는 때 |
|---|---|
| `references/contract.md` | 설정 키·state 스키마·스크립트 인자와 출력 줄·에이전트 오피스 표시 계약(§4) |
| `references/protocol.md` | 역할 표, 메시지 형식, 지시 템플릿 |
| `references/sizing.md` | 실행 수단(D0~D5) 고르기 |
| `references/workflow.md` | 지시 블록, 동시 agent 상한, 실패 사다리 |
| `references/decompose.md` | 분해, 레인 공통 규칙 문서 |
| `references/merge-gate.md` | 머지 요청 |
| `references/monitor.md` | idle 배정, 진도율, 반복 방지 |
| `references/heavy.md` | 측정 창·금지·load·이동 창·전용 칸 |
| `references/spawn.md` | 세션 생성·등급·GLM·신원 연결·정리 |
| `references/usage.md` | 사용량 띠, 한도 초기화 뒤 재개 |
| `references/compact.md` | 컨텍스트 임계, 정본 메모 |
| `references/approvals.md` | 확인·선택 창 판정표, `ESCALATE` |
| `references/stall.md` · `closing.md` · `resume.md` · `help.md` | 정지 · 마감 · 압축 뒤 · 사용법(`help`) |

- 스크립트 = `scripts/` 아래. 목록·출력 형식 = `references/contract.md` §3
- 템플릿 = `templates/`(`lane-rules-README.md`·`brief.md`·`config.example.json`)
