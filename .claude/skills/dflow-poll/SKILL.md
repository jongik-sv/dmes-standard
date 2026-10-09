---
name: dflow-poll
description: D'Flow 할당 작업 폴링 루프 — 백그라운드 스크립트가 에이전트 위임 태그(agent)가 붙은 ready 작업만 감시하고 발견 시 /dflow-dev 로 자동 착수, 사이클 종료 후 재감시. 태그 없는 작업은 수동(/dflow-dev 직접 지시) 몫. 낮 시간 반자동 전용(무인 야간 금지). 트리거 - "/dflow-poll", "폴링 시작", "작업 감시하다가 착수". 사용법 - /dflow-poll [--interval 300] [--until HH:MM] [--all]
---

# /dflow-poll — 할당 작업 폴링 루프 (반자동)

> 문체: 에이전트 지시·보고·메시지 → `../_shared/style/Korean-STE-LLM-Guide.md`. 사람이 읽는 산출물 → `../_shared/style/Korean-STE-Writing-Guide.md`.

인자: `$ARGUMENTS` (`--interval <초>` 기본 300, `--until <HH:MM>` 기본 18:00, `--all` = 위임 태그 필터 해제)

## 에이전트 위임 플래그

**자동 착수 대상 = WBS item tags 에 `agent` 가 붙은 작업뿐.**
- 사람이 WBS 에서 위임할 작업을 골라 태그를 달면 폴링은 그것만 집음.
- 태그 없는 작업은 목록에 떠도 자동 착수 안 함 (수동 `/dflow-dev <ref>` 직접 지시는 태그 무관 언제나 가능).
- 목적: 전량 자동의 위험(spec 없는 작업·판단 필요한 작업까지 집어가기)을 구조에서 차단.

- 표준 기동 = `--require-tag agent` 고정. 사용자가 명시적으로 `--all` 이라고 하면 필터 없이 기동 (예전 동작) — 이때 착수 전 판정이 유일한 방어선임을 통지.
- 태그는 D'Flow 웹(WBS 편집)이나 wbs.md import 의 tags 필드로 단다.
- **위임 태그 ≠ 담당자 배정.**
  - poll.mjs 는 `list --scope assigned` 로만 조회 → 태그만 달고 배정을 잊으면 그 작업은 **자동 루프에 영원히 안 걸림**.
  - 목록에 아예 안 떠서 "선행 미충족" 으로 오진하기 쉬움 (2026-08-26 리허설에서 이 오진으로 수 시간 소모).
  - 기동·재기동 시 태그는 있는데 미배정인 ready 가 보이면 한 줄 통지.
- list 응답에 tags 없음 → poll.mjs 가 후보별 show 로 조회.
  - 태그 없어 떨어진 후보는 `--tag-cache-cycles`(기본 3)주기 동안 show 재조회 안 함 → 새로 단 태그는 그만큼 늦게 잡힘.
  - 서버 list 응답에 tags 포함시키는 개선 = 러너 설계 개정 묶음의 후보.

> **위치 선언**: 이 스킬 = "깨어 있는 세션이 주기적으로 서버를 확인" 구조 — 자율 러너 설계(wbs-web 리포 docs/superpowers/specs, 킷에는 미동봉)가 **무인용으로는 기각한 B안 구조임을 알고 씀.** 사람이 근처에 있는 낮 시간 반자동 전용. `--until` 상한 없이 방치 금지. 무인 야간 실행 = 러너(launchd) 영역.
>
> 감시 = 결정적 스크립트(`scripts/poll.mjs`) 담당 — 대기 중 LLM 토큰 소모 0. 스크립트가 설정 로드(`.dflow`·`.dflow.local`, 레거시 `.env`)와 dflow.mjs 래핑 담당 → 세션이 env 를 직접 안 다룸.

## 절차

1. **기동**: 대상 저장소(cwd)에서 poll.mjs 를 **백그라운드로 실행**:
   ```bash
   node .claude/skills/dflow-poll/scripts/poll.mjs --interval 300 --until 18:00 --require-tag agent --actions full
   ```
   - `--require-tag agent` = 표준. 사용자가 `--all` 을 명시한 경우에만 뺌.
   - `--actions full` 도 표준. 설계 검토·구현자동 작업(서버 판단 `action` 이 `design`·`build`, 계약 2.11)은 사람의 「설계 승인」·「설계 확정」 을 거쳐 `/dflow-team` 팀장이나 사람의 `/dflow-dev` 가 맡음. 옛 서버면 이 칸이 없어 종전대로 모두 옴.
   - **반드시 Bash 의 `run_in_background`** — 셸 `&` 백그라운드 금지. `&` 로 띄우면 종료 알림이 세션에 안 와서 루프가 소리 없이 끊김 (2026-08-22 실증).
   - 첫 조회는 즉시 — ready 가 이미 있으면 곧바로 종료 알림이 옴.
   - 기본값: 설정 = cwd 의 git 최상위, `DFLOW_CONFIG_DIR` 로 오버라이드 (레거시 `.env` 는 `DFLOW_ENV_FILE`). dflow.mjs = poll.mjs 와 같은 스킬 묶음의 것(자기 위치 기준), `DFLOW_SH` env 로 오버라이드.
2. **종료 알림 분기** (exit code — 산문 파싱 금지):
   - **0 = ready 발견**: stdout 각 줄 = `순번<TAB>id8<TAB>이름[<TAB>action]` (넷째 칸 = 계약 2.11 서버 판단, 옛 서버면 없음).
     - **착수 전에 dflow-dev Phase 01 의 착수 가능 판정(spec 실재·선행 검사)을 먼저 통과시킴.**
     - 불가 판정이면 사유 통지 + 그 id8 을 exclude 에 넣어 즉시 재기동 (서버는 spec 부재·선행 미충족 작업도 ready 로 노출 — 2026-08-22 실증).
     - 서버 계약이 2.9 여도 `reached` 가 거짓인 선행은 여기서 불가(선행 대기)로 봄. dflow-dev 「v2.9 설계 선행 후보」 로 넘기지 않음 (설계 선행은 상한이 있는 /dflow-team 팀장만 줌).
     - 통과하면 사용자에게 한 줄 통지 ("`<id8> <이름>` 착수") 후 **첫 줄의 id8 로** `/dflow-dev <id8>` 사이클 실행.
     - 순번은 그 시점 목록 캐시 기준이라 시간이 지나면 어긋날 수 있음 — **claim 은 반드시 id8 로.**
     - 넷째 칸이 있고 `full` 이 아니면 (겹쳐 뜬 옛 poll 등) 착수 안 함. "`<id8>` 는 설계 검토·구현자동 작업이라 건너뜁니다(/dflow-team 이나 사람의 /dflow-dev 가 맡습니다)" 통지 후 그 id8 을 exclude 에 넣어 재기동.
   - **9 = 승인 감지(머지 대상)**: stdout 각 줄 = `TSK<TAB>order-id` — 로컬 state.json 은 reported 인데 서버가 approved 로 바뀐 주문.
     - **사람에게 묻지 않고** dflow-dev Phase 01-가 승인 스윕(머지·뒷정리) 실행 → poll.mjs 재기동.
     - 승인 → 머지 → 후속 해금 연쇄가 사람 개입 없이 이어지게 하는 트리거 (2026-08-25 리허설 결함 ①).
   - **10 = 반려 감지(재작업 대상)**: stdout 각 줄 = `TSK<TAB>order-id<TAB>review_note` — 로컬 state.json 이 **reported 또는 merged** 인데 서버 마지막 완료리포트가 `review_action=reject` 인 주문.
     - merged 까지 훑는 이유: 사람이 웹에서 승인을 무르고 재작업을 요청하면 (approved→claimed, 2026-08-27) 그 시점 로컬은 이미 merged → reported 만 보면 영영 못 봄.
     - **반려는 order.status 를 rejected 로 만들지 않음 — claimed 로 롤백될 뿐이라 일반 claimed 와 구분 불가** (2026-08-25 실측). 판정 근거 = show 응답 최상위 `.reports` 의 마지막 completion 리포트뿐.
     - **사람에게 묻지 않고** review_note 를 요구사항 입력으로 `/dflow-dev <id8>` 재작업 사이클 실행 후 재기동 (dflow-dev Phase 01 반려 재작업 경로).
   - **8 = 종료 시각 도달**: 루프 종료를 보고하고 끝. 자동 연장 금지 — 연장은 사람이 재기동.
   - **3/5/7 (인증·권한·꺼짐)**: 즉시 중단·보고. 재시도 금지.
   - **6 (네트워크·일시 오류 연속 3회)**: 중단·보고. dflow.mjs 실행 불가(126/127 — 심링크 재생성 찰나 등)도 같은 일시 오류로 취급, 스크립트가 한도까지 재시도한 결과.
   - **2 (설정)**: stderr 를 그대로 보고.
3. **사이클 종료 후 재기동**: /dflow-dev 가 reported 로 끝나든 중단으로 끝나든 결과를 사용자에게 보고한 뒤 poll.mjs 를 다시 백그라운드로 올림 (1번). 종료 시각이 지났으면 안 올림.
   - claim 이 **exit 4(선행·상태로 인한 진행 불가)** 로 막힌 작업: fetch/merge 후 1회 재시도 (dflow-dev 규칙). 그래도 4 면 사유를 갈라 재기동 시 전달 (제외 없이 재기동하면 즉시 재발견해 공회전):
     - **영구성**(사용자 결정 대기 등) → `--exclude id8,id8`
     - **일시성**(spec 부재·선행 산출물 대기) → `--exclude-temp id8,id8`. 스크립트가 `--recheck-cycles`(기본 6주기) 뒤 스스로 해제해 재발견시킴. 세션이 착수 판정을 다시 하고 여전히 막혀 있으면 다시 `--exclude-temp` 로 재기동. 사람이 안 알려줘도 재검사가 도는 구조.
4. **중지**: 사용자가 "중지" 하면 실행 중인 poll.mjs 태스크를 멈추고(TaskStop) 종료 보고.

## 동시성·안전 규칙

- **한 번에 1건.** /dflow-dev 사이클이 도는 동안 poll.mjs 안 띄움 (중복 claim 방지).
- **충돌 감지 시 질문 금지 — 자동 대기가 기본값.**
  - 기동 시점에 같은 워킹트리에서 다른 사이클(다른 세션의 /dflow-dev 포함)이 진행 중이면 AskUserQuestion 으로 선택지를 묻지 않음.
  - "그 사이클이 끝날 때까지 폴링 보류" 한 줄 통지 후 감시 상태로 들어가, idle 확인되면 스스로 poll.mjs 기동.
  - 폴링 = 자동 루프. 명백한 기본값(대기)이 있는데 사람을 세우면 자동화 자체가 죽음.
  - 질문은 기본값 없는 경우만 (예: 사용자가 충돌 감수 기동을 명시 요구).
- 착수는 자동이되 **완료는 종전대로 승인 대기까지만** — done 후 approve 시도 금지 (dflow-work 상속).
- 매 착수·매 사이클 종료를 사용자에게 한 줄씩 통지 — 반자동의 "반" = 이 가시성.
- **기동·재기동 시 위임 태그 없는 ready 가 있으면 "수동 대기 N건(목록)" 한 줄 통지.** 필터가 조용히 삼키면 사용자는 그 작업이 있는 줄도 모름. 통지만 하고 착수 안 함.
- poll.mjs 출력 파일을 tail 로 상시 관찰 금지 — 종료 알림만 기다림.
- **"지금은 잡을 게 없다" 는 자체 판단으로 폴링 끄기 금지** — 조건이 갖춰지는 순간을 잡는 것이 폴링의 용도. 정지 = 사용자 지시나 `--until` 도달로만.
- **exclude 사유 2종을 구분해 관리** (세션 로컬 목록에 사유를 함께 기록):
  - **영구성**(사용자 결정 대기·선행의 구조적 부재·다른 프로젝트) — `--exclude`. 사용자가 해소를 알리기 전까지 유지. 임의 재시도 금지.
  - **일시성**(spec 부재·선행 산출물 대기) — `--exclude-temp`. 스크립트가 `--recheck-cycles` 뒤 스스로 해제해 재발견 유도 (위 3번) — 사람이 알려주는 것을 전제 안 함. 사용자가 먼저 "채워졌다" 고 알리면 즉시 해제·재기동 가능.
  - **선행 대기**(서버 판정 `reached=false` 인 선행을 기다림) — `--exclude-wait`.
    - 선행이 끝나기 전에는 다시 봐도 결과가 같음 → `--wait-cycles`(기본 24주기, 300초면 2시간) 뒤에야 스스로 풂.
    - 선행의 완료·머지를 알게 되면 목록에서 빼고 재기동.
    - 지금은 팀장(/dflow-team 「선행 사전 검사」)이 씀.
    - 선행 대기 작업 중 빈 슬롯에 설계를 먼저 줄 후보(설계 선행, 계약 2.9)도 팀장이 자기 선행 대기 목록에서 고름 (/dflow-team references/design-ahead.md).
    - poll 은 ready 만 반환. 설계를 마치고 선행을 기다리는 주문은 claimed 라 poll 에 안 나옴.
    - poll 루프가 스스로 설계 선행을 안 하는 이유: 상한(`DFLOW_DESIGN_AHEAD_MAX`) 없이 선행 대기 작업을 하나씩 전부 설계해 쌓게 되고, 선행이 계약을 바꾸면 그만큼 재작업.
- 승인 = poll.mjs 가 감지 (exit 9 — 위 2번): 로컬 reported ↔ 서버 approved 대조.
- 반려도 poll.mjs 가 감지 (exit 10): 로컬 reported·merged ↔ 서버 마지막 completion 리포트의 review_action=reject 대조.
  - **order.status 만 보면 영영 못 봄** (claimed 로 롤백).
  - 승인 뒤 재작업 요청도 같은 신호로 잡힘 — 로컬이 merged 인 주문도 훑기 때문.
  - 승인 취소는 리뷰 기록을 지우므로 이 감지에 안 걸림 (사람이 다시 검토하겠다는 뜻).
  - 통지를 기다릴 필요 없이 머지 스윕 → 재기동이 자동 연결. 다른 세션·다른 PC 가 그 선행을 지금 당장 기다리면 /dflow-merge 를 직접 써도 됨.

## 지원 환경: macOS · Linux · Windows (node)

`scripts/poll.mjs` 는 node 로 macOS·Linux·Windows 에서 같이 돎. 필요 도구: node 18.17+, git. 스크립트를 새로 쓸 때 macOS 전용 명령·perl 금지 (정본: `../_shared/platform-support.md`).

## 종료 조건 요약

| 조건 | 동작 |
|---|---|
| `--until` 도달 (기본 18:00) | 정상 종료 — 자동 연장 금지 |
| 승인 감지(9) | 머지 스윕(Phase 01-가) 실행 후 재기동 — 질문 금지 |
| 반려 감지(10) | review_note 를 입력으로 재작업 사이클 실행 후 재기동 — 질문 금지 |
| 인증(3)·권한(5)·꺼짐(7) | 즉시 중단·보고 |
| 네트워크·일시 오류(6 — 126/127 포함) 연속 3회 | 중단·보고 |
| ready 전부 차단 목록 | `--exclude` 로 재기동 — 전부 제외돼 빈 목록이면 계속 대기 |
| 사용자 "중지" | TaskStop 후 보고 |
