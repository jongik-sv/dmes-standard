---
name: dflow-poll
description: D'Flow 할당 작업 폴링 루프 — 백그라운드 스크립트가 에이전트 위임 태그(agent)가 붙은 ready 작업만 감시하고 발견 시 /dflow-dev 로 자동 착수, 사이클 종료 후 재감시. 태그 없는 작업은 수동(/dflow-dev 직접 지시) 몫. 낮 시간 반자동 전용(무인 야간 금지). 트리거 - "/dflow-poll", "폴링 시작", "작업 감시하다가 착수". 사용법 - /dflow-poll [--interval 300] [--until HH:MM] [--all]
---

# /dflow-poll — 할당 작업 폴링 루프 (반자동)

> 문체: 에이전트 지시·보고·메시지 → `../_shared/style/Korean-STE-LLM-Guide.md`. 사람이 읽는 산출물 → `../_shared/style/Korean-STE-Writing-Guide.md`.

인자: `$ARGUMENTS` (`--interval <초>` 기본 300, `--until <HH:MM>` 기본 18:00, `--all` = 위임 태그 필터 해제)

## 에이전트 위임 플래그

**자동 착수 대상 = WBS item tags 에 `agent` 붙은 작업뿐.**
- 사람이 WBS 에서 위임할 작업 골라 태그 달면 폴링은 그것만 집음.
- 태그 없는 작업은 목록에 떠도 자동 착수 안 함 (수동 `/dflow-dev <ref>` 직접 지시는 태그 무관 언제나 가능).
- 목적: 전량 자동의 위험(spec 없는 작업·판단 필요한 작업까지 집어감)을 구조에서 차단.

→ references/delegation-tags.md §에이전트 위임 플래그 세부
→ references/delegation-tags.md §위치 선언 (낮 시간 반자동 전용, `--until` 상한 없이 방치 금지)

## 절차

1. **기동**: 대상 저장소(cwd)에서 poll.mjs 를 **백그라운드로 실행**:
   ```bash
   node .claude/skills/dflow-poll/scripts/poll.mjs --interval 300 --until 18:00 --require-tag agent --actions full
   ```
   - `--require-tag agent` = 표준. 사용자가 `--all` 명시한 경우에만 뺌 — 이때 착수 전 판정이 유일한 방어선임을 통지.
   - `--actions full` 도 표준. 설계 검토·구현자동 작업(서버 판단 `action` 이 `design`·`build`, 계약 2.11)은 사람의 「설계 승인」·「설계 확정」 거쳐 `/dflow-team` 팀장이나 사람의 `/dflow-dev` 가 맡음. 옛 서버면 이 칸 없어 종전대로 모두 옴.
   - **반드시 Bash 의 `run_in_background`** — 셸 `&` 백그라운드 금지. `&` 로 띄우면 종료 알림이 세션에 안 와서 루프가 소리 없이 끊김 (2026-08-22 실증).
   - 첫 조회는 즉시 — ready 이미 있으면 곧바로 종료 알림 옴.
   - → references/operations.md §기동 기본값
2. **종료 알림 분기** (exit code — 산문 파싱 금지):
   - **0 = ready 발견**: stdout 각 줄 = `순번<TAB>id8<TAB>이름[<TAB>action]` (넷째 칸 = 계약 2.11 서버 판단, 옛 서버면 없음).
     - **착수 전에 dflow-dev Phase 01 의 착수 가능 판정(spec 실재·선행 검사) 먼저 통과시킴.**
     - 불가 판정이면 사유 통지 + 그 id8 을 exclude 에 넣어 즉시 재기동 (서버는 spec 부재·선행 미충족 작업도 ready 로 노출 — 2026-08-22 실증).
     - 서버 계약이 2.9 여도 `reached` 가 거짓인 선행은 여기서 불가(선행 대기)로 봄. dflow-dev 「v2.9 설계 선행 후보」 로 안 넘김 (설계 선행은 상한 있는 /dflow-team 팀장만 줌).
     - 통과하면 사용자에게 한 줄 통지 ("`<id8> <이름>` 착수") 후 **첫 줄의 id8 로** `/dflow-dev <id8>` 사이클 실행.
     - 순번은 그 시점 목록 캐시 기준이라 시간 지나면 어긋날 수 있음 — **claim 은 반드시 id8 로.**
     - 넷째 칸 있고 `full` 아니면 (겹쳐 뜬 옛 poll 등) 착수 안 함. "`<id8>` 는 설계 검토·구현자동 작업이라 건너뜁니다(/dflow-team 이나 사람의 /dflow-dev 가 맡습니다)" 통지 후 그 id8 을 exclude 에 넣어 재기동.
   - **9 = 승인 감지(merge 대상)**: stdout 각 줄 = `TSK<TAB>order-id` — 로컬 state.json 은 reported 인데 서버가 approved 로 바뀐 주문.
     - **사람에게 묻지 않고** dflow-dev Phase 01-가 승인 스윕(merge·뒷정리) 실행 → poll.mjs 재기동.
   - **10 = 반려 감지(재작업 대상)**: stdout 각 줄 = `TSK<TAB>order-id<TAB>review_note` — 로컬 state.json 이 **reported 또는 merged** 인데 서버 마지막 완료리포트가 `review_action=reject` 인 주문.
     - **사람에게 묻지 않고** review_note 를 요구사항 입력으로 `/dflow-dev <id8>` 재작업 사이클 실행 후 재기동 (dflow-dev Phase 01 반려 재작업 경로).
     - → references/exclude-and-detection.md §승인(exit 9) 근거, §반려 감지(exit 10) 근거
   - **8 = 종료 시각 도달**: 루프 종료 보고 후 끝. 자동 연장 금지 — 연장은 사람이 재기동.
   - **3/5/7·6·2 (인증·permission·꺼짐·네트워크·설정)**: 중단·보고. 재시도 금지(3/5/7). exit 2 → stderr 그대로 보고. → references/operations.md §오류 종료 코드
3. **사이클 종료 후 재기동**: /dflow-dev 가 reported 로 끝나든 중단으로 끝나든 결과를 사용자에게 보고한 뒤 poll.mjs 를 다시 백그라운드로 올림 (1번). 종료 시각 지났으면 안 올림.
   - → references/exclude-and-detection.md §claim exit 4 처리 (claim 이 exit 4 로 막힌 작업: `--exclude`·`--exclude-temp` 갈라 재기동)
4. **중지**: 사용자가 "중지" 하면 실행 중인 poll.mjs 태스크 멈추고(TaskStop) 종료 보고.

## 동시성·안전 규칙

- **한 번에 1건.** /dflow-dev 사이클 도는 동안 poll.mjs 안 띄움 (중복 claim 방지).
- **충돌 감지 시 질문 금지 — 자동 대기가 기본값.** 기동 시점에 다른 사이클 진행 중이면 "그 사이클이 끝날 때까지 폴링 보류" 한 줄 통지 후 감시 상태로 들어가, idle 확인되면 스스로 poll.mjs 기동. → references/operations.md §충돌 감지 시 질문 금지
- 착수는 자동이되 **완료는 종전대로 승인 대기까지만** — done 후 approve 시도 금지 (dflow-work 상속).
- 매 착수·매 사이클 종료를 사용자에게 한 줄씩 통지 — 반자동의 "반" = 이 가시성.
- **기동·재기동 시 위임 태그 없는 ready 있으면 "수동 대기 N건(목록)" 한 줄 통지.** 필터가 조용히 삼키면 사용자는 그 작업이 있는 줄도 모름. 통지만 하고 착수 안 함.
- 기동·재기동 시 태그는 있는데 미배정인 ready 보이면 한 줄 통지.
- poll.mjs 출력 파일을 tail 로 상시 관찰 금지 — 종료 알림만 기다림.
- **"지금은 잡을 게 없다" 는 자체 판단으로 폴링 끄기 금지** — 조건 갖춰지는 순간을 잡는 것이 폴링의 용도. 정지 = 사용자 지시나 `--until` 도달로만.
- exclude 사유 3종(`--exclude` 영구성 · `--exclude-temp` 일시성 · `--exclude-wait` 선행 대기) 구분해 관리, 세션 로컬 목록에 사유 기록. → references/exclude-and-detection.md §exclude 사유 관리
- 승인·반려 감지 대조 방식 → references/exclude-and-detection.md §승인·반려 감지

## 종료 조건 요약

| 조건 | 동작 |
|---|---|
| `--until` 도달 (기본 18:00) | 정상 종료 — 자동 연장 금지 |
| 승인 감지(9) | merge 스윕(Phase 01-가) 실행 후 재기동 — 질문 금지 |
| 반려 감지(10) | review_note 를 입력으로 재작업 사이클 실행 후 재기동 — 질문 금지 |
| 인증(3)·permission(5)·꺼짐(7) | 즉시 중단·보고 |
| 네트워크·일시 오류(6 — 126/127 포함) 연속 3회 | 중단·보고 |
| 설정(2) | stderr 그대로 보고 |
| ready 전부 차단 목록 | `--exclude` 로 재기동 — 전부 제외돼 빈 목록이면 계속 대기 |
| 사용자 "중지" | TaskStop 후 보고 |

## 참조

| 문서 | 읽을 때 |
|---|---|
| references/delegation-tags.md | `--all` 요청, 태그 단 작업이 안 잡힐 때(미배정·캐시 지연), 무인 실행 가능 여부 질문, Windows·Linux 지원 확인 |
| references/operations.md | 설정 경로·`DFLOW_SH` 오버라이드, exit 2·3·5·6·7 종료, 다른 사이클 도는 중 기동 |
| references/exclude-and-detection.md | claim exit 4, exclude 선택·해제(영구/일시/선행 대기), exit 9·10 감지 원리·승인 취소 동작, 설계 선행 질문 |
