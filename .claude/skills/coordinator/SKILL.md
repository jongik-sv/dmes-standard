---
name: coordinator
description: 큰 업무 하나를 여러 Claude Code 세션(레인)과 임시 워커에 나눠 맡기고, 조정 세션 하나가 분해·머지 허가·idle 감시와 자동 배정·고부하 조절·사용량 조절·compact·마감을 맡는 조정자 스킬. 트리거 - "/coordinator", "조정자 시작", "레인 조정", "여러 세션 조정", "머지 조정", "조정 종료". 사용법 - /coordinator start <run-id> [목표] · tick · status · merge <레인> · measure <레인> <분> · close <레인> · finish · help
---

# /coordinator: 레인 조정자

인자: `$ARGUMENTS`

> **컨텍스트 압축 뒤에는 Skill 도구로 `/coordinator` 를 다시 부르지 않는다**(스킬 전체가 다시 실린다).
> `references/resume.md` 의 재독 세트(state.json, summary.md, 정본 메모, resume.md)만 Bash `cat` 으로 읽는다.
> 감시 cron 은 슬래시 명령이 아닌 고정 문구 `[조정자 틱] coordinator 틱 절차 실행` 을 넣는다(슬래시 명령이면 틱마다 스킬 전체가 다시 실려 토큰이 샌다). 이 문구를 받으면 Skill 을 부르지 않고 아래 「틱 절차」만 따른다.
>
> **조정자 세션은 effort medium 이 기본이다**(`coordinator.effort`, 띄울 때 `--effort medium` 또는 `/model` 에서 변경).
> 틱의 수집·판정은 스크립트가 하므로 medium 으로 충분하다. 무거운 판단은 직접 하지 않고 「판단 올리기」 절의 서브에이전트에 올린다.

설계 정본: `docs/superpowers/specs/2026-10-04-coordinator-skill-design.md`. 설정 키·state 스키마·스크립트 이름과 출력 형식의 단일 정본은 `references/contract.md` 다. 이 문서와 어긋나면 contract.md 가 이긴다.

## 시간·토큰·성능 최적화 원칙

이 스킬은 언제나 시간·토큰·성능이 최적인 상태로 돈다. 높은 모델을 무작정 쓰지 않는다. 조정자 자신과 조정자가 지시하는 모든 세션·Workflow 에 아래 원칙이 적용되고, 지시 블록(`references/workflow.md`)에 그대로 들어간다.

1. **최소 충분 등급에서 시작한다.** 일마다 감당할 수 있는 가장 낮은 모델·effort 로 시작하고, 실패·막힘의 **근거**(시험 실패, 리뷰 지적 반복, 같은 문제에 20분 넘게 막힘)가 생길 때만 한 칸 올린다. 경계가 애매할 때만 한 칸 위를 고른다.
2. **기본 등급은 sonnet 이다.** opus 는 판정(리뷰 M/L·머지 게이트·원인 진단)과 L 크기·동시성·트랜잭션 같은 어려운 구현에만 쓴다. `xhigh` 는 보안·트랜잭션 정합성 판정과 설정으로 켠 실패 사다리 끝 칸에만 쓴다. 기계적 일(단순 시험 실행·결과 집계·치환·상태 읽기)은 haiku/low 다. 등급표는 `workflow.model_table`(`references/contract.md` 1.3).
3. **단순 시험은 빠르게 돈다.** 단일 시험 파일·클래스, `tsc`, lint 는 Workflow 없이 세션이 바로 돌리고 heavy 슬롯을 기다리지 않는다(측정 창·무거운 작업 금지 중에만 미룬다). 바뀐 모듈 시험부터 돌리고, 전체 시험은 머지 요청 직전에 한 번만 heavy.sh 를 거쳐 돌린다.
4. **시험 실패는 실패 사다리로 올린다.** 같은 등급 반복 대신 `workflow.escalation.ladder` 를 한 칸씩 오른다. 시간 초과·부하 연쇄 실패는 코드 결함이 아닐 수 있으므로 load 를 확인한 뒤 같은 등급으로 한 번만 다시 돌린다. 끝 칸에서도 실패하면 더 돌리지 않고 `blocked` 로 보고한다(`references/workflow.md` §7).
5. **조정자는 적게 말하고 적게 읽는다.** effort medium 으로 돌고, 상태는 스크립트가 모아 결과 몇 줄만 읽는다. 바뀐 것이 없는 틱은 말 없이 끝낸다. reference 는 그 절차를 탈 때 그 절만 읽는다. 레인에 다시 묻기보다 state·보고를 먼저 본다.
6. **사용량 띠가 오르면 등급 상한을 낮춘다.** Y 띠: 실패 사다리 끝 칸을 `opus/high` 로 고정(xhigh 금지). O 띠: opus 는 리뷰·판정에만, 구현과 사다리는 sonnet/high 까지. R 띠: 새 Workflow·재시도 없음(`references/usage.md`).
7. **같은 일을 두 번 하지 않는다.** 재개 캐시가 깨지는 지시 수정, 이미 도는 Workflow 와 겹치는 지시, 같은 정보를 레인에 반복 요청하는 일을 피한다.
8. **조사는 영향에 비례해서 한다.** 영향이 작고 별것 아닌 조사(값 하나 확인, 파일 위치 찾기, 함수 동작 확인)에는 Workflow·여러 에이전트를 띄우지 않는다. `search.sh` 한 번이나 grep·cat 한 번으로 끝낸다. Workflow·병렬 조사는 여러 모듈에 걸치고 결과가 설계·머지 판정을 바꿀 만큼 영향이 클 때만 쓴다.
9. **검색은 외부 검색 워커가 먼저다.** 코드·문서 검색과 조사 질의는 `scripts/search.sh "<질의>"`(설정 `search.command`, 기본 agy)로 보낸다. Claude 토큰을 쓰지 않고, 답은 파일로 남아 필요한 만큼만 읽는다. `SEARCH fail` 이면 grep 이나 Explore 서브에이전트(sonnet/medium)로 대신한다. 레인 지시 블록에도 같은 규칙이 들어간다.
10. **실행 수단은 업무 크기로 고른다.** 일을 맡기거나 시작하기 전에 영향·범위·단계·시간 네 점수로 D0 직접 → D1 검색 워커 → D2 서브에이전트 하나 → D3 병렬 서브에이전트 → D4 Workflow → D5 새 세션 중 하나를 고른다. 낮은 단계부터 맞춰 보고, 부족하다는 근거가 나올 때만 올린다. 기준표는 `references/sizing.md`.

## 역할

| 역할 | 실체 | 하는 일 | 하지 않는 일 |
|---|---|---|---|
| **조정자(나)** | 대화형 Claude Code 세션 1개 | 분해·할당, 머지 허가, 측정 창 운영, 감시 틱, 세션·Pane 생성과 정리, 사용량 띠 판정, 다른 세션 compact, 통합 확인, SUMMARY·마감 보고 | 레인 소유 파일 수정(통합 확인 중 아주 작은 것 제외) |
| **레인 세션** | 사용자가 띄웠거나 조정자가 띄운 Claude Code 세션. 브랜치·워크트리 하나 | 자기 레인 일을 Workflow 로 진행, 진행 보고, 머지 요청·머지·정리, 자기 정본 메모 유지 | dev 에 허가 없이 머지, 메인 저장소 서버 재기동, 남의 소유 파일 수정 |
| **임시 워커** | 새 탭의 Claude Code(GLM 포함)·opencode·agy 등 | 짧은 단일 과제(교차 리뷰, 조사, 측정 실행, 문서 대조) | 머지, 다른 워커 관리 |
| **서브에이전트** | 각 세션 안의 Agent·Workflow 하위 에이전트 | 세션 안 단계 작업 | 조정자와 직접 통신(세션이 대신 보고) |

### 하지 않는 일

- dev push·main 반영: 사용자가 지시할 때만 한다.
- 삭제(DB 행, 브랜치 `-D`, 워크트리 `--force`): 사용자 결정 목록(`pending_user`)에 올린다.
- 레인 소유 파일 수정과 레인 안 구현 규율(TDD·리뷰 루프): 레인의 몫이다.
- D'Flow 작업 수명주기: `dflow-team` 의 몫이다. 이 스킬은 D'Flow 를 몰라도 돈다.
- 서버 기동·화면 확인의 세부 방법: 설정 `integration_check` 문장을 따른다. 이 문서에 도구 이름을 적지 않는다.
- git 실행 파일, 레인 실행 명령, 통합 확인 방법은 모두 설정(`git_bin`·`launch.claude`·`integration_check`)으로만 가리킨다.

## 판단 올리기

조정자는 medium 으로 돌므로 아래 다섯 가지는 직접 판정하지 않고 **`opus` / `high` 서브에이전트**(Agent 도구, `model: "opus"`, effort high)에 올린다. 서브에이전트에는 판단에 필요한 원문(머지 게이트 출력, 확인 창 명령 전문, jstack 발췌, 분해 입력)과 해당 reference 절 이름을 넘기고, 결론과 근거를 돌려받아 그대로 집행한다. 각 reference 의 해당 절에 「판단 올리기」 표시가 있다.

| 올리는 판단 | 언제 | 참고 절 |
|---|---|---|
| 머지 게이트 판정 | `merge-gate.sh` 출력에 `SHARED_API` 또는 `OUTSIDE` 줄이 있을 때 | `merge-gate.md` |
| 확인 창 명령 분류 | 명령이 `approvals.md` 판단표 어느 칸인지 애매할 때 | `approvals.md` |
| STALL 원인 진단 | `stall-check.sh` 가 `STALL` 일 때(jstack 해석 등) | `stall.md` |
| 업무 분해·레인 묶기 초안 | `start` 의 분해 단계 | `decompose.md` |
| 마감 보고의 결정·후속 정리 | `finish` 의 마감 보고 작성 | `closing.md` |

## 시작 절차 (`/coordinator start <run-id> [목표]`)

1. **설정 확인**: `<repo>/.coord.json`·`.coord.local.json` 이 있는지 보고, 없으면 기본값을 쓴다고 사용자에게 한 줄 알린다. `templates/config.example.json` 이 기본값 사본이다. `launch.claude`·`integration_check`·`heavy.script`·`git_bin` 처럼 PC마다 다른 값은 사용자에게 한 번 확인한다.
2. **회차 만들기**: `scripts/coord-state.sh init <run-id> --goal "<목표>" [--rules-doc <경로>]`. 출력 `RUN <run-id> <폴더>`.
3. **업무 분해**: `references/decompose.md` 를 읽고 항목 표·레인 묶기·의존 그래프를 만든다(초안은 「판단 올리기」). 사용자에게 분해 결과를 보이고 확정받는다. 레인 공통 규칙 문서는 `templates/lane-rules-README.md` 로 만든다.
4. **레인 확보**: `references/spawn.md` 를 읽는다. 사용자가 이미 띄운 세션은 착수 지시에 신원 보고 요청을 넣어 `신원:` 메시지로 연결하고, 스킬이 띄우는 세션은 `scripts/spawn-lane.sh` 의 결과 handle 을 기록한다. 등급(Fable·Opus·Sonnet·GLM·Haiku)은 `spawn.md` 표로 정한다. 각 레인은 `coord-state.sh lane-add <레인> <json>` 으로 state 에 넣는다.
5. **착수 지시**: `references/protocol.md` 의 착수 지시 템플릿과 `references/workflow.md` 의 Workflow 블록을 `templates/brief.md` 로 채워 보낸다. 지시 번호는 `coord-state.sh instr <레인> start` 로 받고, 지시 원문은 `lanes/<레인>/brief.md` 에 남긴다. 보내는 길은 늘 SendMessage 이고, 터미널 입력이 필요하면 `term-send-safe.sh` 만 쓴다.
6. **감시 cron 생성**: `CronCreate` 로 `tick.cron`(기본 `7,27,47 * * * *`) 주기에 프롬프트 `[조정자 틱] coordinator 틱 절차 실행` 을 넣는다(슬래시 명령 금지). 정각을 피한 분을 쓴다.
7. **state 에 기록**: `coord-state.sh set '.run.cron_id' '"<id>"'`, 조정자 자신의 이름·주소·핸들도 `.run.coordinator` 에 적는다. `coord-state.sh summary` 로 summary.md 를 만든다.

## 틱 절차 (`[조정자 틱] coordinator 틱 절차 실행` 또는 `/coordinator tick`)

감시 cron 이 20분마다 이 프롬프트를 넣는다. 아래 1~8 을 순서대로 하고, 바뀐 것이 없으면 **아무 말 없이 턴을 끝낸다**(사용자 화면을 어지럽히지 않는다).

1. `scripts/coord-status.sh` 로 한 화면 상태표를 얻는다(`LANE`·`PC`·`UNLINKED`·`WINDOW` 줄). `UNLINKED` 가 있으면 그 세션에 신원 보고를 요청할지 사용자에게 한 줄 묻는다.
2. 처리하지 않은 메시지(머지 요청·질문·보고)가 있으면 그것부터 처리한다(아래 「메시지 분기표」).
3. `scripts/idle-check.sh` 로 idle 판정을 하고 `IDLE` 레인에 배정한다(`references/monitor.md`). 띠에 따라 배정 범위가 다르다.
4. `scripts/stall-check.sh` 로 정지 의심 레인을 찾는다. `STALL` 이면 `references/stall.md`, 원인 진단은 「판단 올리기」.
5. `scripts/ctx-usage.sh --lane <레인>` 으로 컨텍스트 임계값을 보고, 넘은 레인은 `references/compact.md` 절차로 compact 한다. 조정자 자신이 넘었으면 사용자에게 한 줄로 알린다.
6. `scripts/usage-band.sh` 의 띠가 `usage.band`(state) 와 다르면 `references/usage.md` 대로 처리하고 전 레인에 `사용량 조정` 을 한 번만 보낸다. 같은 알림은 반복하지 않는다.
7. 창 끝 처리: `scripts/measure-window.sh status` 로 열린 창을 보고, 끝났거나 예정 끝 + 15분이 지난 창은 `references/heavy.md` 로 닫거나 점검한다. load 기준(`heavy.load_soft` 등)도 이때 본다.
8. busy 레인마다 `scripts/prompt-watch.sh <레인>` 으로 확인·선택 창을 본다. `PROMPT` 가 나오면 `scripts/auto-answer.sh --lane <레인>` 으로 자동 응답하고, `ESCALATE` 만 `references/approvals.md` 로 처리한다. 조정자가 띄운 세션과 Workflow 가 도는 레인에는 틱과 별도로 `Monitor` 감시(`prompt-watch.sh --follow`)가 붙어 있는지 확인하고, 없으면 다시 붙인다.

마지막으로 변화가 있었으면 `coord-state.sh summary` 로 summary.md 를 갱신한다. 판정과 지시는 `events.jsonl` 에 `coord-state.sh event` 로 남긴다.

## 메시지 분기표

메시지의 첫 줄은 `[보내는쪽→받는쪽] <종류>: …` 이다. `<종류>` 로 분기한다. 받는 즉시 `coord-state.sh report <레인> "<요약>"` 으로 보고 시각을 적고, 첫 줄에 `instr_id` 가 있으면 `coord-state.sh ack <instr-id>` 를 한다.

| 종류 | 처리 |
|---|---|
| `신원` | 레인의 `session` 칸(이름·세션ID·핸들·pid·워크트리)을 `coord-state.sh set` 으로 기록한다. `spawn.md` 「신원 연결」 |
| `진행 보고` | 항목을 `coord-state.sh item-done` 으로 갱신하고 `progress` 로 진도율을 낸다. `monitor.md` 「진도율」 |
| `질문` | 선택지와 기본안을 읽고 근거를 확인해 직접 답한다. 삭제·shared 기존 API 변경·사용자 결정 항목이면 `pending_user` 에 올려 사용자에게 묻는다 |
| `머지 요청` | `references/merge-gate.md` 대로 `merge-gate.sh <레인>` 을 돌려 허가 또는 대기를 답한다. 한 번에 하나만 허가한다 |
| `머지 완료` | 머지 커밋 트리를 예상 트리와 대조해 `merge.history` 에 적고, 다음 머지를 허가한다. 정리 완료를 기다린다 |
| `정리 완료` | 머지 기록을 닫는다(`cleaned`). 남긴 브랜치는 `pending_user` 에 올린다 |
| `측정 끝` | `heavy.md` 순서 ⑤: `measure-window.sh close` 후 전 레인에 `무거운 작업 재개` |
| `정본 갱신 완료` | `남은 일 3줄` 을 `compact.pre_compact` 에 적고 compact 를 이어 진행한다. `compact.md` |
| `재개 확인` 답 | `pre_compact` 와 대조한다. 크게 다르면 정본 경로를 다시 짚어 준다 |
| 확인 창 대신 승인 요청 | 받아들이지 않는다(권한 우회 방지). `approvals.md` 규칙대로만 조정자가 직접 판단한다 |
| 그 밖 | 사용자 메시지면 그 지시를 따른다. 레인 메시지인데 형식이 아니면 형식을 한 줄로 안내한다 |

## 금지 목록

- **실행 중인 Workflow 하위 에이전트에 SendMessage 를 보내지 않는다**(사본이 새로 떠 같은 파일을 함께 고친다). 규칙을 바꾸려면 그 세션에 TaskStop 후 남은 단계만 새 스크립트로 띄우게 지시한다.
- 사용자 입력 대기 화면(선택 창·질문 창)에 지시나 `/compact` 를 덮어 보내지 않는다. 터미널 입력은 `term-send-safe.sh` 하나로만 보낸다.
- 지시문에 `!` 를 넣지 않는다(셸 모드로 바뀐다). opencode 에는 `/`·`@` 도 넣지 않는다.
- 레인끼리 서로 대신 승인해 달라는 요청을 수락하지 않는다.
- 프로세스를 직접 종료하지 않는다. 근거와 권고를 레인에 보낸다.
- 삭제하지 않는다(DB 행·브랜치 `-D`·워크트리 `--force`·`rm -rf`).
- 같은 레인에 같은 종류의 지시를 cooldown(`idle.cooldown_min`, 기본 15분) 안에 다시 보내지 않는다. ack 없는 지시가 있으면 새 지시 대신 「`<instr_id>` 받았는지 한 줄 답」만 보낸다(최대 2회).
- dev push 와 main 반영을 사용자 지시 없이 하지 않는다.
- 설정에 정해진 값을 문서·지시문에 PC별 이름으로 박지 않는다.

## 명령 요약

| 인자 | 하는 일 |
|---|---|
| `start <run-id> [목표]` | 위 「시작 절차」 |
| `tick` | 위 「틱 절차」(보통 cron 이 호출) |
| `status` | `coord-status.sh` 와 `coord-state.sh progress` 로 상태표·진도율을 답한다. 레인에 다시 묻지 않는다(마지막 보고가 1시간보다 오래됐을 때만 묻는다) |
| `merge <레인>` | 그 레인의 머지 요청을 `merge-gate.md` 로 처리한다 |
| `measure <레인> <분>` | `heavy.md` 측정 창 순서로 창을 연다(예정 끝 = 지금 + 분) |
| `close <레인>` | `spawn.md` 정리 절차: `close-lane.sh <레인>` |
| `finish` | `closing.md` 마감(통합 확인, SUMMARY, 정리 확인, 마감 보고, cron 삭제) |
| `help` | `references/help.md` 를 읽어 사용법을 설명한다 |

## 참조

아래 문서는 그 절차를 탈 때 Bash `cat` 으로 읽는다.

| 문서 | 읽는 때 |
|---|---|
| `references/contract.md` | 설정 키·state 스키마·스크립트 인자와 출력 줄을 확인할 때 |
| `references/protocol.md` | 레인에 지시를 보내거나 메시지 형식을 확인할 때 |
| `references/decompose.md` | `start` 의 업무 분해, 레인 공통 규칙 문서를 만들 때 |
| `references/merge-gate.md` | `머지 요청`을 받았을 때, `merge <레인>` |
| `references/monitor.md` | 틱의 idle 판정·배정, 진도율 집계, 반복 지시 방지 |
| `references/heavy.md` | 측정 창·무거운 작업 금지·load 기준·이동 창·전용 칸 |
| `references/spawn.md` | 세션·Pane 생성, 등급 선택, GLM 사전 확인, 신원 연결, 정리 |
| `references/usage.md` | 사용량 띠 변화, 한도 초기화 뒤 재개 |
| `references/compact.md` | 컨텍스트 임계값 초과, 정본 메모 규칙, 조정자 자기 compact |
| `references/sizing.md` | 일을 맡기거나 시작하기 전 실행 수단(D0~D5)을 고를 때 |
| `references/workflow.md` | 착수·다음 일 지시에 넣는 Workflow 블록, 동시 agent 상한 |
| `references/approvals.md` | `prompt-watch.sh` 가 `PROMPT` 를 낼 때, `auto-answer.sh` 가 `ESCALATE` 를 낼 때 |
| `references/stall.md` | `stall-check.sh` 가 `STALL` 을 낼 때 |
| `references/closing.md` | `finish` 에 들어설 때 |
| `references/resume.md` | 컨텍스트 압축 뒤 이어 갈 때 |
| `references/help.md` | 인자가 `help` 일 때만 |

템플릿: `templates/lane-rules-README.md`(레인 공통 규칙 문서 뼈대), `templates/brief.md`(착수 지시 뼈대), `templates/config.example.json`(설정 기본값 사본).

## 스크립트

모두 `scripts/` 아래. 읽기 전용이 아닌 것은 `--dry-run` 을 받는다. 인자와 출력 줄은 `references/contract.md` §3 이 정본이다.

- `coord-status.sh`: 레인·PC 한 화면 상태표(`--json` 가능). 토큰을 쓰지 않는다.
- `coord-state.sh`: state.json 읽기·쓰기(`init`·`use`·`get`·`set`·`lane-add`·`event`·`instr`·`ack`·`report`·`item-done`·`progress`·`hold`·`summary`).
- `idle-check.sh`: idle 후보·확정·거부 판정.
- `stall-check.sh`: busy 인데 멈춘 레인 판정.
- `ctx-usage.sh`: 세션 컨텍스트 사용률(transcript 계산 기본, 덤프가 있으면 그쪽).
- `usage-band.sh`: 5시간·1주 사용량 띠(G·Y·O·R·UNKNOWN).
- `merge-gate.sh`: 머지 게이트의 기계적 부분(충돌·예상 트리·범위·재기동·창).
- `prompt-watch.sh`: 레인 화면의 확인 창·선택 창 감지와 발췌.
- `auto-answer.sh`: 확인·선택 창 자동 응답(신뢰 확인·한도 창·권한 창·선택 질문). 판정표는 `approvals.md` §5.
- `search.sh`: 검색·조사 질의를 외부 검색 워커(기본 agy)에 한 번 보내고 답을 파일로 남긴다.
- `glm-preflight.sh`: GLM 이 Z.ai 로 가는지 사전 확인(토큰을 출력하지 않는다).
- `term-send-safe.sh`: 안전 확인 뒤 터미널 입력(`--raw` 는 확인 창 응답용).
- `compact-lane.sh`: 다른 세션 compact 의 기계 부분.
- `spawn-lane.sh`: 세션 생성과 기동 확인.
- `close-lane.sh`: 끝난 세션 닫기.
- `measure-window.sh`: 측정·이동·금지 창 열기·닫기·상태·정숙 확인.
- `statusline-dump.sh`: 스킬이 띄우는 세션에만 쓰는 선택 기능. statusLine 덤프. 사용자 전역 statusline 은 건드리지 않는다.
- `lib/common.sh`·`lib/term.sh`: 공통 함수와 터미널 어댑터(직접 부르지 않는다).
