---
name: dflow-dev
description: D'Flow 작업 1건의 전체 개발 사이클 실행 (승인 스윕→claim→설계→TDD구현→검증→완료보고). 시작 시 승인된(approved) 로컬 작업을 먼저 main 에 머지한다(/dflow-merge 흡수, 2026-08-24). 대화형 supervised 전용 — 무인 실행은 자율 러너 설계(2026-08-20)의 영역이다. 구현 규율 정본은 이 스킬의 references/dev-discipline.md. 트리거 - "/dflow-dev", "작업 구현해", "D'Flow 작업 개발". 사용법 - /dflow-dev <순번|TSK-ID> [--scope design|build|full] [--only design|build|verify|refactor] [--model opus|sonnet]
---
<!-- dflow-caps: worker — 팀장·워커가 이 줄로 기능 지원을 판정한다. 지우거나 바꾸지 않는다. -->

# /dflow-dev — D'Flow 작업 개발 사이클 (supervised)

> 문체: 에이전트 지시·보고·메시지 → `../_shared/style/Korean-STE-LLM-Guide.md`. 사람이 읽는 산출물 → `../_shared/style/Korean-STE-Writing-Guide.md`.

인자: `$ARGUMENTS` (`<순번|TSK-ID>` + 옵션)

<!-- worker:begin -->
> `--worker` = `/dflow-team` 팀장 전용 플래그 (사람이 직접 안 씀). 있으면 아래 「--worker 팀원 모드」 절 아홉 행(A~I)만 달라지고, 없으면 이 문서 절차 그대로.
> `--worker` 면 **지금 `.claude/skills/dflow-dev/references/worker-mode.md` 의 머리(아홉 행 표)와 「그 밖의 워커 규칙」 을 읽는다**:
> `node .claude/skills/dflow-dev/scripts/sections.mjs .claude/skills/dflow-dev/references/worker-mode.md '=/dflow-dev --worker' '그 밖의 워커 규칙'`.
> 「행 G」·「행 H」 = 단계 파일 표지 블록이 가리킬 때, 「설계 선행」 = `orch/design-first.md` 읽을 때 같은 방법으로 읽는다.
<!-- worker:end -->

> **위치 선언**: 사람이 기동·관찰하는 supervised(L0) 대화형 경로 (무인 루프 = 자율 러너 영역). 이 파일 = 오케스트레이션(순서·게이트 집행·상태·서버 보고) 공통 규칙만. 규율 반복 안 함. 단계별 절차 = 「단계 지도」 의 단계 파일.
>
> **규율 읽기**: 구현 규율 정본 `.claude/skills/dflow-dev/references/dev-discipline.md` 는 **통째로 읽지 않는다.**
> - 「단계 지도」 규율 열의 절 = 그 단계 시작 때 읽음.
> - 단계 파일이 dev-discipline 「절 이름」 을 가리키면 그 자리에서 그 절만 읽음.
> - 같은 세션에서 이미 읽었고 압축 없었으면 다시 안 읽음.
> - 추출: `node .claude/skills/dflow-dev/scripts/sections.mjs .claude/skills/dflow-dev/references/dev-discipline.md '<절 제목 앞부분>' …` (제목 앞 `=` → 딸린 절 없이 그 제목 본문만).
> - exit 3(`SECTION_MISSING`) → 그 파일 전체 Read.
> - Phase 서브에이전트에게 주는 문구 = `references/phase-prompt.md`.
> - 규칙 이유·사고 이력 = `references/rationale.md` (실행 중 안 읽음).
>
> 서버 통신 전부 dflow.mjs, 산문 파싱 금지 — exit code 로 분기. dflow-work 금지사항 전부 상속. **dflow.mjs 경로**: 대상 리포(cwd)의 `node .claude/skills/dflow-work/scripts/dflow.mjs` (환경변수 `DFLOW_SH` = dflow.mjs 경로. 있으면 우선). 경로는 **대상 리포 기준**. 킷(install.sh)도 리포 안 `.claude/skills/` 에 설치하므로 `~/.claude/skills/...` 추측 금지.

## 게이트 집행 원칙 (이 스킬의 존재 이유)

Phase 서브에이전트 `PHASE_RESULT` 자기 신고 = **참고 신호, 게이트 아님.**
게이트 판정 = 오케스트레이터(이 스킬 실행 세션)가 **자기 손으로 명령 실행**.

- Design 게이트: `<TASKS>/<TSK>/design.md` Read → dev-discipline 최소 구조 5절(접근·파일 목록·테스트 전략·수용 기준 매핑·불변 규칙) 실재 확인. 없으면 실패.
- Build/Verify/Refactor 게이트: **오케스트레이터가 테스트 명령 직접 실행** → exit code·출력을 기준선과 차분 비교 (신규 실패 0 + 테스트 총수 미감소). 서브에이전트가 "통과" 해도 직접 실행 결과가 판정.
  게이트별 명령·범위(대응표)·재실행 생략·기록 = 그 Phase 파일의 「Design 게이트」·「Build 게이트」·「Verify·Refactor 게이트」.
- 도커: 기준선 전에 금지 모드 판정. 금지면 기준선·게이트·Phase 프롬프트에서 도커 명령 제외. 금지 아니면 도커 슬롯(`heavy.mjs --pool docker`)에서만 실행. 도커 런타임은 켜지 않음. 정본 = dev-discipline.md 「도커 사용 규칙」.

## 상태 모델

정본 = **산출물 실재**. state.json·서버 progress = 보조 신호.

- 필드·`phase` 값·`order` 전체 UUID·`api_base`·exit 10(중단됨)·exit 12 처리 → references/state-model.md §상태 모델 상세 (state.json 필드·phase 값·중단 처리). **progress·heartbeat·done·design-done·design-reopen·build-start 중 exit 10 이나 12 가 나오면 그 자리에서 멈추고 이 파일을 읽는다.** state.json 처음 쓰기·phase 값 판정 때도 읽는다.
  - exit 10 → `phase=cancelled`, 로컬 커밋만 남김(push·done 안 함), 사용자에게 한 줄 통지. exit 12 → state 안 바꿈.
- 기록 순서 고정: **산출물 커밋 → state.json 갱신 → progress 보고.** progress 보고 실패(exit≠0)여도 state 유지, 그 사실만 보고 (성공 Phase 되돌리지 않음). (예외 exit 10·12 → 위 줄)
- 실패 시 `phase` 되돌리지 않고 `last.event=*.fail` 만 기록 → 재실행 시 같은 Phase 재개.
- **재개 판정 = 산출물 교차 확인**:
  - state.json 이 있어도 그 phase 선행 산출물(design.md·Build 커밋)이 현재 트리에 실재하는지 확인.
  - 없으면 **산출물 있는 지점까지 후퇴해서 재시작**.
  - 서버 progress 숫자 = 힌트, 복원 정본 아님. progress = "보고 있었다" 증거, "산출물이 이 트리에 있다" 증거 아님 (타 PC 재개·매핑 밖 값 대비).

## 단계 지도

이 문서 = 모든 단계 공통 규칙만. 단계별 절차 = `.claude/skills/dflow-dev/references/orch/` 의 단계 파일 (아래 `orch/…` 는 그 폴더 기준). **단계 시작 전 그 행의 파일을 Read 하고 규율 열의 절을 읽는다** — 읽기 전 시작 금지. 같은 세션에서 이미 읽었고 압축 없었으면 다시 안 읽음. 단계 파일 끝 「다음 단계」 = 다음에 읽을 파일. 규율 열 = dev-discipline.md 절 제목 앞부분 (위 「규율 읽기」 `sections.mjs` 인자 그대로).

| 지금 | 판별 | 읽을 파일(순서대로) | 규율(dev-discipline 절) |
|---|---|---|---|
| 수동 착수 | 플래그 없음, 세션 시작 | `orch/sweep.md` → `orch/start.md` | `공통 금지` `포그라운드 실행` |
| 팀원 착수 | 팀원 모드(첫 표지 블록), 세션 시작 | `orch/start.md` | `공통 금지` `포그라운드 실행` |
| 새 claim | `orch/start.md` 의 ready 갈래 | `orch/base.md` → `orch/claim.md` | — |
| 설계 선행 모드 | claim 출력에 `DESIGN_FIRST_UNMET` | `orch/design-first.md` | — |
| 반려 재작업 | `orch/start.md` 의 반려 갈래, state.json `phase=rejected` | `orch/rework.md` | — |
| 설계 선행 재개 | `orch/start.md` 의 설계 선행 재개 갈래, state.json `phase=wait_pred` | `orch/design-first.md` → `orch/base.md` | `개발 브랜치 재머지` |
| 준비 | state.json `phase=prepare` | `orch/baseline.md` | `=게이트 기준선` `기준선 캐시` `research/docs` `도커 사용 규칙` `=무거운 명령 줄 세우기` `=모델 배정` `Build 모델 시험` |
| Design | state.json `phase=design` | `orch/phase-common.md` → `orch/design.md` | `Phase 정의` `게이트 기록` `advisor 호출` |
| Build | state.json `phase=build` | `orch/phase-common.md` → `orch/build.md` | `sonnet Build 의 opus 승급` |
| Verify | state.json `phase=verify` | `orch/phase-common.md` → `orch/verify.md` | — |
| Refactor | state.json `phase=refactor`(수동만) | `orch/phase-common.md` → `orch/refactor.md` | `Phase 05` |
| 마감 | Verify(수동은 Refactor) 게이트 뒤 | `orch/close.md` | — |
| 그 밖 | state.json 이 없음·`ready`·`reported`·`merged`·`cancelled`·`wait_review` | `orch/start.md` | — |

- 조건부 절 (단계 파일이 가리킬 때 읽음):
  - 리포에 `.dflow-gates` 있으면 `게이트 범위 대응표`
  - 화면 작업이면 `화면 작업의 브라우저 E2E`
  - 신규 실패가 모두 타이밍·성능 테스트면 `부하 민감 테스트`
  - 명령이 10분 넘을 듯하면 `분리 실행·독점 실행`
  - 결정 번호 필요하면 `공용 결정 기록`
  - 마이그레이션 더하면 `마이그레이션 버전`
- 이전 단계에서 읽은 절은 다음 단계에서도 유효 (예: Build 도 「준비」 에서 읽은 `기준선 캐시`·`무거운 명령` 을 따름).

**모르면 전부 읽는다**(fail-closed): state.json 못 읽음 · `phase` 가 표에 없음 · 어느 행인지 애매 → `orch/` 파일을 sweep·start·rework·base·claim·baseline·design-first·phase-common·design·build·verify·refactor·close 순서로 모두 읽고 dev-discipline.md 도 전체 Read.

## 압축 뒤

컨텍스트 압축 요약 뒤 첫 행동 = 단계 지도 행 다시 찾기.
- 이 작업 agent 브랜치(`agent/<주문id8>-*`) 위 → `<TASKS>/<TSK>/state.json` 의 `phase` 로 찾음.
- agent 브랜치 전 → 「수동 착수」·「팀원 착수」 행.
- 그 행의 파일·규율 절 + 지나온 앞 행들의 규율 절을 다시 읽고 진행.
- 압축 요약의 기억으로 단계 절차 대신 금지.
<!-- worker:begin -->
`--worker` 면 `references/worker-mode.md` 의 머리 표와 「그 밖의 워커 규칙」 도 다시 읽는다.
<!-- worker:end -->

<!-- worker:begin -->
## --worker 팀원 모드 (팀장 전용)

**팀장 전용, 사람이 직접 안 씀.** 행 A~I 와 세부 규칙(행 G 기본 브랜치 반영 확인·행 H 설치·도커·`.result`) 정본 = `.claude/skills/dflow-dev/references/worker-mode.md` — 이 문서 머리의 첫 표지 블록에서 이미 읽었다. 이 문서의 「--worker」 A~I = 그 파일의 행.
<!-- worker:end -->

## 실행 범위 (--scope)

`--scope design|build|full` = 정식 실행의 시작점·멈춤점만 변경. 다른 값이거나 `--only` 와 함께 오면 사용법 알리고 멈춤.
- 범위 규칙(서버 판단·`claim_scope`·옛 서버) = `orch/start.md` 「서버 판단」
- `design` 멈춤 = `orch/design.md` 「설계만 멈춤」
- `build` 시작 = 같은 파일 「설계 받기」


## --only 옵션 · 대상 저장소

→ references/rare-cases.md §--only 옵션 (`--only` 가 오면 읽음: Phase 만 실행·서버 보고 없음·덮어쓰기 경고)
→ references/rare-cases.md §대상 저장소 (wbs-web 이 대상이거나 마이그레이션 포함 작업이면 읽음)

## 참조

| 문서 | 읽을 때 |
|---|---|
| references/state-model.md | state.json 처음 쓰기 · phase 값 판정 · progress/heartbeat/done 이 exit 10·12 |
| references/rare-cases.md | `--only` 인자 · wbs-web 대상 · 마이그레이션 포함 작업 |
| references/worker-mode.md | `--worker` 플래그 |
| references/dev-discipline.md | 단계 지도 규율 열 지정 절만 (통째 금지) |
| references/phase-prompt.md | Phase 서브에이전트 프롬프트 작성 |
| references/rationale.md | 규칙 이유·사고 이력 (실행 중 안 읽음) |
