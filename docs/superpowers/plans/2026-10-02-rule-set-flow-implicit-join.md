# 룰 세트 흐름도 — IF·예외 합류 노드 없애기(모이는 자리 계산) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** IF 와 받는 노드(CATCH)의 합류(MERGE) 노드를 없앤다. IF 블록의 끝(모이는 자리)과 처리 갈래가 돌아오는 자리는 그래프에서 계산하고, IF 갈래는 END 로 가서 세트를 끝낼 수 있으며(끝내는 갈래), 받는 노드는 빈 단계(TASK)에도 붙는다. MERGE 는 병렬 합류에만 남고 이중선 막대로 그린다. 엔진·TS 해석기는 옛 형식을 계속 받고, 편집기는 열 때 옛 형식을 새 형식으로 바꾼다.

**Architecture:** 흐름 구조 해석(Java `flow` 패키지 + TS `flow-model.ts`)의 2단계 트리 만들기를 "줄기(spine)·모이는 자리(join)·돌아오는 자리(J)" 계산으로 바꾸고(Task 1), 블록 트리에 `Step`·`Split.joinId`·`Branch.ends`·`Guarded.step/joinId` 를 더한다. 실행(Task 2)·정적 검사(Task 3)·편집 연산(Task 4)·배치(Task 5)·디버거(Task 7)는 그 트리 모양만 보고 각자 바뀐다. 한 벌 코퍼스 `rule-set-corpus.json` 과 퍼즈 `rule-set-fuzz.json` 이 Java·TS 두 구현을 묶는다. 편집기는 `toEditFlow` 안에서 옛 합류를 지우는 순수 변환(`upgradeLegacyMerges`)을 거쳐 새 형식만 다룬다.

**Tech Stack:** Java 21(sealed interface·record·switch 패턴), JUnit 5, Spring Boot + OASIS, SQLite, TypeScript + React 19 + Mantine 9(`@dk-oasis/shared` 래퍼), `@xyflow/react` 12, `@dagrejs/dagre`, Vitest(happy-dom), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-rule-set-flow-implicit-join-design.md`(커밋 04a4dc30, 결정 J-D1~J-D19, 결정 기록 D-136). 앞 스펙 `2026-10-01-rule-set-flow-catch-design.md`(받는 노드, D-134)·`2026-09-29-rule-set-flow-design.md`(흐름 모델)·`2026-10-01-rule-set-flow-phase4-design.md`(TASK). 구조·문구 참고 계획 `docs/superpowers/plans/2026-10-01-rule-set-flow-catch.md`.

**작업 위치:** 워크트리 `/Users/jji/project/dmes-standard-wt/rule-set-join`(이하 `$W`), 브랜치 `feat/rule-set-join`(dev 에서 분기, 이 계획 커밋 포함). 병렬 태스크는 하위 워크트리 `/Users/jji/project/dmes-standard-wt/rsj-tN`(브랜치 `rsj-tN`, 그때의 `feat/rule-set-join` 끝에서 분기)에서 구현하고, 리뷰 통과 뒤 feat 에 `--no-ff` 로 병합한다. 혼자 도는 태스크는 feat 워크트리에서 바로 해도 된다. 모든 명령은 해당 워크트리 루트 기준이다.

---

## 병렬 순서

경로 접두어 `src/frontend/m-mdm/pages/dme/ruleSetEdit/` 는 `rse/`, `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/` 는 `eng/`, `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/` 는 `lib/` 로 줄인다. 동시에 도는 구현 에이전트는 셋까지(16GB 노트북 — gradle 두 벌 + vitest 한 벌이 한계). 모델 등급: cheap(정해진 내용 옮기기) · standard(정해진 설계를 코드로) · capable(알고리즘·여러 파일 정합).

| 태스크 | 등급 | 먼저 병합돼야 할 태스크 | 고치는 곳(요약) | 함께 못 도는 태스크 |
|---|---|---|---|---|
| 1 구조 해석(Java·TS)·관대한 도우미·구조 코퍼스·퍼즈 재생성 | capable | — | `eng/flow/*`, `eng/rule/FlowRun`·`FlowKeys`(컴파일 맞춤 SEAM(T2)), `lib/RuleSetAnalyzer`·`RuleSetPathState`(TASK 블록), `rse/flow-model.ts`·`set-model.ts`(TASK 블록)·`flow-layout.ts`·`trace-view.ts`(이름 맞춤), 코퍼스·두 러너·퍼즈 파일, 엔진 `FlowFixtures`·`FlowParserTest`·`FlowTreeTest` | 전부(첫 물결 단독) |
| 2 엔진 실행·입력 키 검사·서버 실행 시험 | capable | 1 | `eng/rule/FlowRun`·`FlowKeys`, 엔진 시험 `RuleSetIfEndTest`(새)·`RuleSetLegacyMergeTest`(새)·`RuleSetCatchTest`·`RuleSetTraceEditTest`, api `RuleSetRunnerTest` | — |
| 3 정적 검사(끝내는 갈래)·경로 코퍼스·퍼즈 생성기 | capable | 1 | `lib/RuleSetAnalyzer`·`RuleSetPathState`·`check/ledger/RuleSetOrderCheck`, `rse/set-model.ts`, 코퍼스·두 러너·`RuleSetFlowFuzz`·퍼즈 파일, lib `RuleSetPathStateTest` | — |
| 4 편집 모델 — 옛 형식 변환·블록 도우미·분기·노드·받는 노드 연산·접기 보기·열기 알림 | capable | 1 | `rse/flow-edit.ts`, `rse/canvas/collapse.ts`, `rse/state/useRuleSetEdit.ts`, 시험 `legacy-upgrade.test.ts`(새)·`flow-edit.test.ts`·`flow-edit-3.test.ts`·`branch-order.test.ts`·`catch-edit.test.ts`·`catch-return.test.ts`·`flow-connect.test.ts`·`flow-reconnect.test.ts` 와 변환으로 기대가 바뀌는 시험 | — |
| 5 자동 배치 — 모이는 자리·끝내는 갈래 비켜 놓기·병렬 합류 크기 | standard | 1 | `rse/flow-layout.ts`, 시험 `flow-layout.test.ts`·`catch-layout.test.ts` | — |
| 6 캔버스·패널 — 이중선 합류·빈 단계 예외 연결점·접기 대표 선 손잡이·메뉴·IF 패널·가이드 | standard | 4, 5 | `rse/canvas/nodes.tsx`·`FlowCanvas.tsx`·`menus/edit-menu.ts`, `rse/styles/base.ts`, `rse/panels/PropertyPanel.tsx`·`PanelHeader.tsx`, `docs/guide/FrontEnd/Local-Rules.md`, 시험 `implicit-join-ui.test.ts`(새)·`catch-canvas.test.ts`·`flow-menu.test.ts`·`catch-panel.test.ts` | — (7 과 함께 돌 수 있다 — 7 은 `trace-view.ts`·`debugger/*` 만 고친다) |
| 7 디버거 — 돌아오는 자리에서 CATCH_* 되돌림·끝낸 갈래 표시 | capable | 1, 2 | `rse/trace-view.ts`, `rse/debugger/debug-model.ts`·`TraceDetail.tsx`·`VariablePanel.tsx`, 시험 `trace-view.test.ts`·`catch-debug.test.ts`·`debug-model.test.ts` | — |
| 8 문서·계약 설명·결정 D-136 | cheap | 1~7 | `docs/mdm/decisions.md`, `docs/mdm/engine-contract.md`, 엔진 스키마 설명·`DefinitionLookup`·`RuleSetResult`·`RunTrace` Javadoc, 생성 TS, 기능설계서, 받는 노드 스펙 머리 | — |
| 9 e2e 시나리오와 실제 실행(새 포트·새 DB) | standard | 1~7 | `src/frontend/e2e/mdm-ruleSetEdit.spec.ts`, `src/frontend/e2e/fixtures/mdm-ruleSet-data.sql` | — |

물결: **①** 1 단독(구조 해석·코퍼스가 모든 태스크의 바탕). **②** 1 병합 뒤 2·3·4 를 함께 연다(2 = 엔진 `rule` 패키지·api 시험, 3 = mdm/lib 분석기·`set-model.ts`·코퍼스·퍼즈, 4 = `flow-edit.ts`·`useRuleSetEdit.ts` — 고치는 파일이 겹치지 않는다). gradle 을 쓰는 2·3 이 함께 돌 때 셋째 에이전트는 화면 태스크(4)만. **③** 자리가 나면 5(1 뒤), 7(1·2 뒤) 순으로 연다. **④** 6(4·5 뒤, 7 과 함께 돌 수 있다). **⑤** 8·9(1~7 병합 뒤, 함께 돌 수 있다 — 9 가 `$W` 에서 서버를 띄운 동안 8 은 gradle 을 돌리지 않는다).

같은 파일을 고치는 태스크 짝: 1→3(코퍼스·퍼즈·`set-model.ts`·`RuleSetAnalyzer`·`RuleSetPathState`, 3 은 1 병합 뒤), 1→4(`flow-model.ts` 를 4 는 읽기만), 1→5(`flow-layout.ts`), 1→7(`trace-view.ts`). 병합 충돌이 나면 나중에 병합하는 쪽에서 컨트롤러가 푼다. 편집 연산은 옛 형식 변환과 맞물려(변환이 픽스처를 바꾸면 분기·노드·받는 노드 연산 시험이 함께 움직인다) 한 태스크(4)로 둔다.

---

## 스펙 대비 편차(코드로 확인한 근거) — 이 계획의 처리

| # | 스펙 | 코드 사실(근거) | 이 계획의 처리 |
|---|---|---|---|
| F1 | §14.6 은 `E2S_FLOW` 노드 수가 바뀌는 시나리오로 E11·E15 만 든다 | E14 도 `E2S_FLOW` 를 열고 `flowNodes` 7개를 단언한다(`src/frontend/e2e/mdm-ruleSetEdit.spec.ts:524`) | E14 도 6개로 고친다(Task 9) |
| F2 | §14.6 E18 "IF 의 「갈래 1」 선 끝을 END 로 옮겨 끝내는 갈래로" | 갈래 선(IF→r2) 끝을 END 로 옮기면 r2 에 닿을 수 없어 S10 거부다. 또 `E2S_FLOW` 의 IF 뒤 룰 `E2S_SPD` 는 `S_FCT` 를 읽는데 `S_FCT` 는 사전에 없어(`fixtures/mdm-ruleSet-data.sql:5` 컬럼 3개) 끝내는 갈래에서만 만들면 `UNKNOWN_INPUT` 거부로 저장이 꺼진다 | 새 픽스처 세트 `E2S_IFEND`(IF 뒤 룰이 사전 변수만 읽는다)를 두고, 갈래의 **마지막 선**(r2→r3) 끝을 END 로 옮긴다(Task 9, Ruling R13) |
| F3 | §14.2 N21 "안쪽 IF(바깥 갈래 안)… → S5" | 바깥이 **새 형식 IF** 면 바깥 갈래 줄기가 안쪽 IF 의 모이는 자리(§2.2 5 로 "그 외" 첫 노드)를 지나 END 로 가므로 바깥 갈래도 끝내는 갈래가 된다. 오류는 뒤에서 바깥 이어지는 갈래가 같은 노드를 다시 지날 때의 S6 이다. S5 는 둘러싼 끝이 고정일 때(병렬 합류·옛 합류·돌아오는 자리)만 난다 | N21 은 병렬 갈래 안 IF(→ S5), 추가 사례 N26 은 바깥 새 형식 IF(→ S6)로 둘 다 고정한다(Task 1) |
| F4 | §14.2 바뀌는 사례 여섯 | 사례 58(`처리 갈래 안 IF 갈래는 END 로 못 간다`)은 옛 형식 IF 라 기대가 그대로지만 이름이 새 규칙과 어긋난다. 사례 57 의 이름 끝 `(FLOW_STRUCTURE 2단계)` 도 받게 되어 틀린다 | 57·58 이름을 바꾼다(기대는 §14.2 대로, Task 1) |
| F5 | §14.4 "변환이 빈 단계를 넣은 경우는 `EMPTY_TASK` 경고 한 줄만 다르다" | `EMPTY_TASK` 문구에 개수가 든다(`set-model.ts:179` `빈 단계 ${tasks}개`) — 원래 빈 단계가 있으면 줄이 생기지 않고 문구가 바뀐다. 룰·빈 단계가 하나도 없던 흐름(IF·합류만)은 변환이 빈 단계를 넣어 `EMPTY` 거부가 사라진다 | 변환 동치 시험은 양쪽에서 `EMPTY_TASK`·`EMPTY` 줄을 빼고 비교하고, 두 줄은 따로 규칙으로 본다(Task 4) |
| F6 | §7 "엔진 스키마 `docs/mdm/engine-contract/`" | 정본은 엔진 main resources `kr/dongkuk/maru/mdm/engine/engine-contract.schema.json` 이고(`EngineContractSchemaTest.java:55`), `docs/mdm/engine-contract/schema/` 는 이미 어긋난 초안이다(`diff` 363줄) | 정본만 고치고 생성 TS 를 다시 만든다(Task 8) |
| F7 | §14.5 `RuleSetSimulateTest` 에 새 형식 기록 수 | 저장 전 흐름 기록 실행은 `RuleSetRunner.trace(json, …)` 한 경로이고 `RuleSetRunnerTest` 가 이미 그 입구를 시험한다(`RuleSetRunnerTest.java:99-105`). 시뮬레이트 골든은 옛 형식 흐름이라 그대로여야 한다 | 새 형식 기록 시험은 `RuleSetRunnerTest` 에 둔다. `RuleSetSimulateTest` 골든은 손대지 않는다(옛 형식 불변 확인, Task 2) |
| F9 | §2.2 둘째 문단 "편집기 기본 모양(`insertSplit` 의 "그 외")이 흐름을 잇는 쪽", §8.3 안내 줄 | END 로 들어가는 선(팔레트 기본 끼울 선, e2e E3)에 IF 를 끼우면 「그 외」 선이 END 로 바로 간다. §2.2 5 는 END 직행 갈래를 이어지는 갈래로 고르지 않으므로 「갈래 1」(빈 단계)이 이어지고 「그 외」 가 끝내는 갈래가 된다 — 실행 결과는 같지만 패널이 「그 외」 옆에 「끝냄」 과 "흐름을 이어 갈 갈래는 「그 외」로 둔다" 안내를 함께 보이게 된다 | 「끝냄」 표지는 그대로 보이고, 안내 줄은 몸 있는 끝내는 갈래가 있을 때만 보인다(R21, Task 6). 사용자 확인 대상으로 보고한다 |
| F8 | §6 TASK `CATCH_NEVER` "받는 노드 속성 패널의 표시는 TASK 경고도 같은 자리에" | 패널은 종류 이름이 든 `CATCH_NEVER` 만 종류 옆에 보이고 나머지 `CATCH_NEVER` 는 목록에서 뺀다(`PropertyPanel.tsx:487·535`) — TASK 문구에는 종류 이름이 없어 어디에도 안 보인다 | TASK 문구는 「받을 예외」 섹션 머리 한 줄(`flow-prop-catch-never-task`)로 보인다(Task 6, Ruling R19) |

## Rulings(스펙이 정하지 않은 세부 — 이 계획이 정했다)

- **R1 코퍼스 사례 수:** 새 사례는 26개다(스펙 N1~N24 + N25 = S9 셋째 문구 + N26 = F3 의 바깥 새 형식 IF). 두 러너 `MIN_CASES` 는 Task 1 이 64 → 78, Task 3 이 78 → 90 으로 함께 올린다.
- **R2 N16 은 그대로 S5 다:** 병렬 분기의 짝 합류는 줄기에 들어간다(`after(PARALLEL)` = 짝 MERGE). 처리 갈래가 그 합류로 돌아오면 `J` = 합류이고, 정상 갈래 `seq(next(R), J)` 는 병렬을 한 칸으로 넘어 `next(합류)` 로 가 `J` 에 닿지 않고 END 로 빠진다 — "갈래가 pm에서 닫히지 않고 end로 나간다".
- **R3 퍼즈 파일:** Task 1 은 생성기를 고치지 않고 `-Dfuzz.write=true` 로 파일만 다시 만든다(문구·차수 규칙이 바뀌어 기존 기대가 달라진다). Task 3 이 생성기를 새 형식으로 바꾸고 다시 만든다. 손으로 고치지 않는다.
- **R4 코퍼스 기대는 규범이다:** 이 계획 표의 기대값은 스펙에서 손으로 끌어낸 정답이다. Java 결과가 다르면 Java 를 고치거나 BLOCKED 로 보고한다 — Java 출력을 붙여 넣지 않는다(퍼즈만 Java 결과가 기대다).
- **R5 TASK 블록 실행:** `Guarded.step` 이 TASK 면 `begin → 고친 값 → 정상 갈래 입력 키 검사 → path·기록` 순서로 빈 단계를 기록하고 정상 갈래를 실행한다. 처리 갈래는 실행하지 않는다. 입력 키 검사를 기록 전에 하는 것은 실패할 때 같은 노드 기록이 둘(OK·ERROR) 생기지 않게 하려는 것이다.
- **R6 IF 끝냄 신호:** `FlowRun.Ended(@Nullable catchNodeId)`. 끝내는 IF 갈래 몸을 다 실행하면 `Ended(null)`. `guarded()` 는 처리 갈래 몸에서 `Ended(null)` 을 받으면 `Ended(그 받는 노드)` 로 바꿔 다시 던진다.
- **R7 조각(Fragment) 선 순서:** IF 블록 조각은 `edges` 에 블록 안 선·꼬리 선·끝 선을 **원래 선 배열 순서 그대로** 담고, 꼬리·끝 선은 `to: ""` 로 둔 채 그 ID 를 `tails`·`endTails`(선 ID 목록)에 적는다. 붙여 넣을 때 `edges` 순서대로 새 ID 를 주고 꼬리는 `t.to`, 끝 선은 붙여 넣는 흐름의 END 로 잇는다(스펙 §8.2 의 "원래 선 배열 순서대로" 를 그대로 지키려는 모양).
- **R8 새 빈 단계 자리:** `insertSplit`(IF)·`addBranch`(IF)·`fillEmptyBranches`·`upgradeLegacyMerges` 가 만드는 빈 단계는 노드 배열에서 그 IF 바로 뒤(같은 IF 에 여럿이면 만든 순서대로 이어서)에 둔다. 위치(`view.positions`)는 넣지 않는다.
- **R9 병렬 분기도 들어오는 선 여럿:** IF 의 모이는 자리가 병렬 분기일 수 있으므로 병렬의 지우기·옮기기·풀기도 분기로 들어오는 선을 모두 옮긴다(스펙 §8.2 의 "removeNode PARALLEL" 규칙을 옮기기·풀기에도 쓴다).
- **R10 `IF_EMPTY_TWICE` 검사 자리:** 결과 흐름에서 짝 MERGE 없는 IF 의 같은 from→to 선이 둘 이상이면 거부하는 검사(`emptyTwice`)를 `removeNode`·`moveNode`·`dissolveSplit` 결과에 건다. `connect`·`reconnectEdge` 는 지금처럼 "이미 이어진 선이다" 로 먼저 막는다.
- **R11 들어오는 선 없는 룰 옮기기:** 떨어진 룰·빈 단계(들어오는 선 0)도 옮길 수 있다(나가는 선은 하나여야 한다). 문구 `RULE_EDGES_NOT_ONE_MOVE` 는 "룰 노드의 나가는 선이 하나가 아니라 옮길 수 없다. 선을 먼저 정리한다".
- **R12 끝낸 갈래 표시 문구:** 디버그 툴바 상태 `완료 · {n}단계 · 결과 변수 {m}개 · IF {제목}의 「{갈래}」 갈래에서 끝냈다`. 제목 = IF `label`, 없으면 "조건". 갈래 = 선 `label`, 없으면 "그 외"(그 외 선) 또는 `갈래 {order}`. END 노드 상세에도 같은 문장(`sim-detail-ended-branch`).
- **R13 e2e E18 세트:** 픽스처에 새 형식 세트 `E2S_IFEND` 를 더하고(편차 F2), "등급 A" 갈래의 마지막 선 `e5`(r2→r3) 끝을 END 로 옮긴다.
- **R14 열기 알림:** `useRuleSetEdit.load` 가 변환한 개수가 1 이상이면 메시지 줄(`set-message`, `kind: "info"`)에 "옛 합류 노드 {n}개를 없앤 형식으로 바꿔 열었다. 저장하면 새 형식으로 남는다." 를 둔다. 저장 뒤 다시 읽기(`runWrite`)는 저장 결과 문구가 덮는다.
- **R15 변환 개수:** `toEditFlowCounted(raw, ruleIds)` 가 `{ flow, upgraded }` 를 돌려주고 `toEditFlow` 는 그 `flow` 다. `upgraded` = 지운 합류 수 + 빈 단계로 바꾼 합류 수(빈 갈래 채우기는 세지 않는다).
- **R16 룰 확정 검사의 TASK 블록:** `RuleSetOrderCheck` 의 받는 룰·처리 갈래 쌍은 `step` 이 RULE 인 블록만 만든다.
- **R17 계약 설명:** 스키마 정본(엔진 resources)의 설명 문구만 고치고 모양(`required`·`type`)은 그대로다. `docs/mdm/engine-contract/schema/` 초안은 손대지 않는다.
- **R18 END 노드 상세:** `TraceDetail` 에 `endedBranch?: string | null` prop 을 더하고 `VariablePanel` 이 `endedBranchText(trace, flow)` 로 채운다.
- **R19 받는 노드 패널(TASK):** 붙은 노드가 TASK 면 「붙은 룰」 칸 이름이 「붙은 노드」 이고, TASK 의 `CATCH_NEVER` 문구는 「받을 예외」 섹션 머리에 한 줄로 보인다.
- **R20 접기 대표 선:** ID 는 `fold:{분기 ID}`(`FOLD_EDGE_PREFIX = "fold:"`). 캔버스는 이 선에 [+]·고르기·우클릭 메뉴·끝 손잡이를 주지 않는다.
- **R21 이어지는 갈래 안내 줄:** IF 속성 패널의 안내(`flow-prop-if-ending-help`)는 끝내는 갈래 가운데 **몸이 있는 것**(END 로 바로 가지 않는 갈래)이 하나라도 있을 때만 보인다. END 앞 선에 IF 를 끼우면(`insertSplit`) 「그 외」 가 END 로 바로 가 §2.2 5 규칙상 끝내는 갈래가 되는데(편차 F9), 실행은 같고 고칠 것이 없으므로 「끝냄」 표지만 보이고 안내는 숨긴다.

## Global Constraints

- DB 검증은 **SQLite 만** 한다. 도커를 쓰지 않는다(워커 기본, 사용자 메모 "SQLite 만 테스트·워커 도커 금지").
- **엔진(Java, maru-mdm-engine)과 TS(m-mdm)는 `rule-set-corpus.json`·`rule-set-fuzz.json` 으로 같아야 한다.** 구조 문구·검사 문구·순서가 한 글자라도 다르면 안 된다. 코퍼스에 사례를 더하면 Java `RuleSetCorpusTest.MIN_CASES` 와 TS `rule-set-corpus.test.ts` `MIN_CASES` 를 **같은 커밋에서 같은 값으로** 올린다(R1).
- m-mdm 시험은 `cd src/frontend/m-mdm && node scripts/test.mjs --maxWorkers=3` 로 돌린다(파일 하나: 뒤에 `tests/dme/ruleSetEdit/<파일>.test.ts`). 완료 게이트는 출력 끝의 `[m-mdm test 합계]` 줄이다.
- **같은 체크아웃에서 서버가 떠 있는 동안 gradle 엔진 빌드·시험을 돌리지 않는다**(엔진 jar 가 바뀌어 떠 있는 mdm 이 `NoClassDefFoundError` 로 죽는다). 구현은 본체 체크아웃이 아니라 워크트리 `$W`(브랜치 `feat/rule-set-join`)와 하위 워크트리 `/Users/jji/project/dmes-standard-wt/rsj-tN`(브랜치 `rsj-tN`)에서 한다. 본체 체크아웃(`/Users/jji/project/dmes-standard`)의 파일은 건드리지 않는다(다른 세션의 미커밋 변경이 있다). Task 9 가 `$W` 에서 e2e 서버를 띄운 동안에는 `$W` 에서 gradle 을 돌리지 않는다.
- 워크트리 준비(새 워크트리마다 한 번): `cp /Users/jji/project/dmes-standard/src/backend/gradle/wrapper/gradle-wrapper.jar src/backend/gradle/wrapper/`(wrapper jar 는 git 에 없다), `pnpm --dir src/frontend install --frozen-lockfile=false`, `pnpm --dir src/frontend --filter @dk-oasis/shared build`.
- 테스트 명령(워크트리 루트 기준):
  - 공통 환경: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home PATH=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin:$PATH`
  - 엔진: `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)` / 한 클래스 `(cd src/backend/maru-mdm-engine && ../gradlew test --tests '*이름' --console=plain)`
  - mdm/lib: `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)` / 한 클래스 `(cd src/backend/mdm && ../gradlew :lib:test --tests '*이름' --console=plain)`
  - mdm/api: `(cd src/backend/mdm && ../gradlew :api:test --tests '<패턴>' --console=plain)`
  - 퍼즈 다시 쓰기: `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetFlowFuzz*' -Dfuzz.write=true --console=plain)`
  - 타입 검사: `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint`(오류 0. `rtk proxy` 를 붙이지 않으면 rtk 가 eslint 로 바꿔 실패한다)
  - 계약 생성: `pnpm --dir src/frontend --filter @dk-oasis/m-mdm gen:contract`(생성 파일은 손으로 고치지 않는다)
- 화면 태스크(4~7)는 RULE.md 무조건 적용 스킬 **`mantine-aggrid-ui`** 를 따른다: `.claude/skills/mantine-aggrid-ui/SKILL.md` 를 끝까지 읽고, 화면 모듈은 `@mantine/*` 를 import 하지 않고 `@dk-oasis/shared/*` 만 쓴다. 바꾼 `.ts`·`.tsx` 파일은 커밋 전 `python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit <파일…>`·`python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit <파일…>` 이 **0건**이어야 한다.
- 화면 규칙 정본 `docs/guide/FrontEnd/Local-Rules.md`: §8 한 변 색 바 금지, §16 무거운 계산은 memo, §17 로컬 `.css` import 금지(새 CSS 는 `styles/*.ts` 문자열 상수), §19 React Flow 캔버스 함정(누름을 받는 표시에 `nodrag nopan`). 색은 의미 토큰(`var(--color-*)`·`--rsf-*`)만 쓴다. 단축키는 `canvas/shortcuts.ts` 디스패처 하나뿐이고, 편집 한 번 = `page.tsx` 의 `edit(f => …)` 한 번 = 되돌리기 한 칸.
- FLOW_JSON `version` 은 1 그대로다(J-D15). 엔진 계약(`FlowNode`·`FlowEdge`·`NodeKind`·`RuleSetResult`·`RunTrace`)의 **모양은 바꾸지 않는다** — 설명 문구만 Task 8 이 고친다.
- **옛 형식으로 지금 받는 흐름은 결과·기록이 한 글자도 바뀌지 않는다**(A5). 기존 골든 `rule-set-trace-golden.json`·시뮬레이트 HTTP 골든·옛 형식 코퍼스 사례(편차 F4 의 두 이름과 §14.2 의 여섯 사례 말고)의 기대는 고치지 않는다 — 고치게 되면 구현이 틀린 것이다.
- 새 action 동사를 만들지 않는다(ADR-0003 D5).
- `docs/mdm/decisions.md` 는 append-only 이고 **Task 8 만** 쓴다. 결정 번호는 **D-136** 이다(A6 — D-135 는 하위 세트 호출 스펙 예약이므로 마지막 번호 다음을 쓰는 규칙을 적용하지 않는다). `docs/mdm/engine-contract.md`·기능설계서·받는 노드 스펙 머리도 Task 8 만 쓴다.
- git: 워크트리 루트에서 `/usr/bin/git` 단순 한 줄 명령만(cd 결합·파이프 금지). 자기가 만든·고친 파일만 경로로 지정해 `/usr/bin/git add <paths>` 뒤 `/usr/bin/git commit -m "<type>(<scope>): <한국어 요약>" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- <paths>`. `add -A`·`add .`·`stash`·`reset --hard`·브랜치 전환 금지. 메시지는 한국어 conventional 이고 트레일러는 정확히 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` 다.
- **e2e:** §14 대로 E3·E11·E13·E14·E15 를 고치고 E17·E18 을 더한다(편차 F1·F2). 마지막 Task 9 에서 **실제로 돌린다** — 본체 서버(포털 5100·mcm 8100·mdm 8096)가 아니라 `$W` 에서 빈 포트로 새로 띄운 mcm·mdm·포털과 **새 mcm.db·mdm.db** 로 돌린다. 본체 서버를 끄거나 재시작하지 않는다.
- 기준선: 착수 때 컨트롤러가 엔진·lib·api(룰 세트 관련)·화면 시험 수를 한 번 돌려 진행 장부에 적는다. 각 태스크 완료 보고는 기준선 대비 증감과 실패에서 고친 기대 목록(파일:시험 이름 → 바뀐 까닭 한 줄)을 적는다.

## Review Focus

1. **옛 형식 세트가 그대로 도는가** — IF 합류·돌아오는 합류가 있는 저장된 흐름은 `steps`·`finalValues`·`caught`·`endedBy`·`warnings`·`path`·기록이 지금과 같고, 편집기 변환 결과는 기록에서 MERGE 가 빠지고 J-D10 자리에 TASK 가 생기는 것 말고 같다. 담당: Task 2 `RuleSetLegacyMergeTest`(쌍둥이 넷), Task 4 `legacy-upgrade.test.ts`(코퍼스·퍼즈 모든 옛 형식 흐름의 변환 전후 `io`·`deps`·`checks` 동치).
2. **한 노드가 블록 여럿을 닫을 때 `CATCH_*` 를 안쪽부터 되돌리는가** — IF 모이는 자리 = 돌아오는 자리, 병렬 갈래 안 받는 노드가 병렬 합류로 돌아옴, 중첩 받는 노드가 같은 자리로 돌아옴. 엔진은 블록 끝에서, 디버거 `frames` 는 돌아오는 자리 기록에서 고친 값보다 먼저 되돌린다. 담당: Task 2 `돌아오는_자리가_IF_모이는_자리와_같으면_CATCH_를_되돌린_뒤_고친_값이_들어간다`, Task 7 `돌아오는_자리에서_안쪽_블록부터_CATCH_를_되돌린다`.
3. **Java·TS 모이는 자리 계산이 같은가** — 끝내는 갈래 판정, §2.2 5 의 실행 순서 규칙, 중첩 IF 의 같은 자리 모임, S8 을 방문 검사보다 먼저, 모이는 자리는 IF 에 닿을 때만 계산. 담당: Task 1(구조 코퍼스 + 재생성한 퍼즈), Task 3(새 생성기 퍼즈 — 끝내는 갈래 15%·옛 형식 IF 20%).
4. **세트를 열기만 하면 dirty 가 아니고, 편집기는 IF 합류를 저장하지 않는가** — `baseJson` 과 편집 흐름이 같은 변환을 거치고, 변환은 같은 입력이면 같은 결과다. 연쇄 합류·END 앞 합류(→ 빈 단계)·빈 갈래 여럿(→ 빈 단계 채우기)·대상 아닌 MERGE 유지. 담당: Task 4 `legacy-upgrade.test.ts`, Task 9 E17.
5. **끝내는 IF 갈래 실행** — 루트에서는 정상 완료(`endedBy` 없음), 처리 갈래 안이면 가장 안쪽 받는 노드가 `endedBy`, 병렬 갈래 안이면 남은 형제를 돌리지 않고 끝난 형제 + 지금 갈래까지 합친다. 담당: Task 2 `RuleSetIfEndTest`, Task 7 `병렬_갈래_안_IF_끝냄_기록의_END_프레임은_열린_갈래를_합친다`.

---

## 구조 문구 표(Java `FlowParser`·TS `flow-model.ts` 한 벌 — 글자 그대로)

| 기호 | 코드 | nodeId · edgeId | 문구 |
|---|---|---|---|
| d1 | FLOW_STRUCTURE | 노드 · null | `{id}의 들어오는 선이 {n}개다. {규칙}` — 규칙: START·CATCH `없어야 한다`, MERGE `2개 이상이어야 한다`, 그 밖(END·RULE·TASK·IF·PARALLEL) `1개 이상이어야 한다` |
| f2(병렬) | FLOW_STRUCTURE | 분기 · null | `분기 {id}를 닫는 합류가 {n}개다. 정확히 1개여야 한다`(PARALLEL 만) |
| f2(IF) | FLOW_STRUCTURE | IF · null | `IF {id}를 닫는 합류가 {n}개다. IF 는 합류를 두지 않는다`(n ≥ 2 일 때만) |
| f4 | FLOW_STRUCTURE | IF · 둘째부터의 선 | `IF {s}의 갈래 {e}가 갈래 {e0}와 같은 노드 {X}로 간다. 같은 노드로 가는 갈래는 하나만 둔다`(짝 MERGE 없는 IF, 선 배열 순서, 분기별 검사의 갈래 순서 검사 뒤) |
| h1 | FLOW_CATCH | 받는 노드 · null | `받는 노드 {c}가 붙은 노드 {x}가 없다`(x 가 비었으면 `-`) |
| h2 | FLOW_CATCH | 받는 노드 · null | `받는 노드 {c}는 룰·빈 단계 노드에만 붙일 수 있다({t}는 {KIND})` |
| S5 | FLOW_STRUCTURE | cur · null | `갈래가 {stop}에서 닫히지 않고 {cur}로 나간다` |
| S6 | FLOW_STRUCTURE | 두 번 만난 노드 · null | `{id}를 두 번 지난다. 순환이 있거나 갈래가 모이는 자리 밖에서 만난다` |
| S7 | FLOW_STRUCTURE | 뒤 받는 노드 c · null | `{R}의 처리 갈래 {c}가 {Y}로 돌아온다. 앞 처리 갈래 {c0}처럼 {X}로 돌아와야 한다` |
| S8 | FLOW_STRUCTURE | cur · null | `처리 갈래 {c}가 {R}의 정상 갈래 노드 {cur}로 들어간다. 처리 갈래는 한 노드로 돌아오거나 끝 노드로 가야 한다` |
| S9 | FLOW_STRUCTURE | cur · null | 도착 END: `처리 갈래 {c}가 끝에 닿지 않고 {cur}로 나간다` / 도착이 옛 합류: `처리 갈래 {c}가 합류 {J}나 끝에 닿지 않고 {cur}로 나간다` / 그 밖: `처리 갈래 {c}가 돌아올 자리 {J}나 끝에 닿지 않고 {cur}로 나간다` |
| S10 | FLOW_STRUCTURE | 노드 · null | `{id}에 도달할 수 없다` |

그대로인 문구(a·b·c·d2·e·f1·g1~g5·h3~h7)는 지금 코드의 글자를 쓴다.

## 검사 문구 표(Java `RuleSetAnalyzer`·TS `set-model.ts` 한 벌 — 새로 둔 것만)

| 코드 | 심각도 | ruleId | nodeId | 문구 |
|---|---|---|---|---|
| CATCH_NEVER(TASK) | WARN | null | 받는 노드 | `{t}는 빈 단계라 {c}가 받는 예외가 일어나지 않는다`(받는 노드마다 한 줄, 받는 종류 수와 상관없이) |

## 편집 연산 문구 표(`flow-edit.ts` — 새로 둔 것·바뀐 것)

| 상수 | 문구 |
|---|---|
| `IF_EMPTY_TWICE(s)` | `IF {s}에 같은 노드로 가는 갈래가 이미 있다. 빈 갈래는 하나만 둔다` |
| `NO_JOIN_BRANCH(s)` | `분기 {s}의 갈래가 모이는 자리를 찾지 못했다` |
| `NO_JOIN_REMOVE(s)` | `분기 {s}의 갈래가 모이는 자리를 찾지 못해 지울 수 없다` |
| `NO_JOIN_MOVE(s)` | `분기 {s}의 갈래가 모이는 자리를 찾지 못해 옮길 수 없다` |
| `NO_JOIN_DISSOLVE(s)` | `분기 {s}의 갈래가 모이는 자리를 찾지 못해 풀 수 없다` |
| `KEEP_ENDING` | `끝내는 갈래만 남기면 뒤 흐름에 닿을 수 없다` |
| `ENDING_TO_PARALLEL` | `끝내는 갈래가 있는 IF 는 병렬로 바꿀 수 없다. 병렬 갈래는 모두 합류로 모여야 한다` |
| `RULE_EDGES_NOT_ONE`(바뀜) | `룰 노드의 나가는 선이 하나가 아니라 지울 수 없다. 선을 먼저 정리한다` |
| `RULE_EDGES_NOT_ONE_MOVE`(바뀜) | `룰 노드의 나가는 선이 하나가 아니라 옮길 수 없다. 선을 먼저 정리한다` |
| `RETURN_JOIN_END` | `처리 갈래가 돌아오는 자리라 지우면 그 처리 갈래가 끝내기로 바뀐다. 앞에 빈 단계를 두거나 선을 먼저 정리한다` |
| `RETURN_TO_END` | `노드 다음이 끝 노드라 흐름으로 돌아올 자리가 없다. 노드 뒤에 빈 단계를 넣은 뒤 다시 한다` |
| `CATCH_ONLY_RULE`(바뀜) | `룰·빈 단계 노드에만 예외 받기를 붙인다` |
| `MERGE_ONLY_BY_SPLIT` | `합류 노드는 분기를 지워서 없앤다` |
| `NO_COPY`(바뀜) | `시작·끝·합류는 복사하지 않는다. 병렬 분기를 복사하면 합류가 함께 복사된다` |
| `UPGRADE_NOTICE(n)` | `옛 합류 노드 {n}개를 없앤 형식으로 바꿔 열었다. 저장하면 새 형식으로 남는다.` |

없애는 것: `RETURN_MERGE_NOT_ONE`·`RETURN_MERGE_STUCK`·`handlerTrail`·`returnRuleFor`·`returnTargetOf`·`ensureReturnMerge`·`connectReturn`·`unwindReturnMerge`·`removeCatch`.

---
## 태스크 사이 조건(해당 태스크 구현자는 반드시 지킨다)

- **줄 번호 기준:** 이 계획의 줄 번호·발췌는 dev `04a4dc30` 기준이다. 다른 작업이 먼저 dev 에 들어오면 줄 번호를 `grep -n` 으로 다시 찾는다.
- **SEAM 표지:** Task 1 은 Task 2 가 고칠 엔진 실행 자리에 `// SEAM(T2)` 를 단다(`FlowRun.guarded` 의 TASK 블록 형변환 한 곳). Task 2 가 `grep -rn "SEAM(T2)" src/backend` 로 모두 없앤다. 최종 검증에서 `SEAM(T` 는 0건이어야 한다.
- **Task 1 이 만드는 TS 이름(뒤 태스크가 그대로 쓴다):** `flow-model.ts` 의 `Step`·`Split.joinId`·`Split.mergeId: string | null`·`Branch.ends`·`Guarded.step`·`Guarded.joinId`, 관대한 도우미 `joinOf`·`endingBranches`·`handlerTarget`·`returnOf`. Java 는 `flow.Step`·`Split.joinId()`·`Branch.ends()`·`Guarded.step()`·`Guarded.joinId()`·`Guarded.nodeId()`.
- **코퍼스·퍼즈 파일:** Task 1(구조 사례·`MIN_CASES` 78·퍼즈 다시 쓰기)과 Task 3(경로 사례·`MIN_CASES` 90·생성기 바꾸고 다시 쓰기)만 고친다. 사례를 더할 때 두 러너의 `MIN_CASES` 를 같은 값으로 올린다.
- **`flow-edit.ts`·`canvas/collapse.ts`:** Task 4 만 고친다(옛 형식 변환·블록 도우미·분기·노드·조각·받는 노드 연산·접기 보기). Task 6 은 그 공개 함수·`FOLD_EDGE_PREFIX` 만 쓴다.
- **변환이 다른 영역 시험을 움직인다:** Task 4 의 `toEditFlow` 변환·`insertSplit`(IF) 새 모양 때문에 배치·캔버스·디버거·페이지 시험의 픽스처 기대(노드 수·`m1`·합류 위치)가 바뀐다. 동작 코드는 각 태스크 몫이지만, Task 4 는 자기 병합 때 전체 화면 시험이 통과하도록 그 **기대값만** 새 형식으로 고친다(Task 4 Step 13 의 판정 규칙).
- **`flow-layout.ts`:** Task 1 은 이름 맞춤(`b.rule` → `b.step`, `b.mergeId` → `b.joinId`·`?? b.joinId`)만, Task 5 가 배치 동작을 바꾼다.
- **`trace-view.ts`:** Task 1 은 이름 맞춤(`b.step`, `mergeId` 가 null 이면 `paths.set` 하지 않음)만, Task 7 이 `guardJoins` 와 되돌림을 바꾼다.
- **기능설계서·`engine-contract.md`·`decisions.md`:** Task 8 만 쓴다. 화면 태스크는 완료 보고에 바꾼 동작·testid 를 적고 Task 8 이 옮긴다.

---

### Task 1: 흐름 구조 해석(Java·TS) — 줄기·모이는 자리·돌아오는 자리·끝내는 갈래·관대한 도우미·구조 코퍼스

**등급:** capable — 두 언어로 같은 알고리즘(줄기·모이는 자리 기억·지켜보는 정상 줄기)을 쓰고 코퍼스로 글자까지 맞춘다.
**병렬:** 첫 물결 단독.

**Files:**
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/Step.java`
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/Block.java`·`RuleStep.java`·`TaskStep.java`·`Branch.java`·`Split.java`·`Guarded.java`·`FlowParser.java`(전체 교체)·`package-info.java`
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java`(컴파일 맞춤 3줄)·`FlowKeys.java`(TASK 블록 3곳)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetAnalyzer.java`(`guarded`·`never`)·`RuleSetPathState.java`(`Walk.guarded`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts`·`set-model.ts`(`guarded`·`never`)·`flow-layout.ts`(이름 맞춤)·`trace-view.ts`(이름 맞춤)
- Modify: `src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json`·`rule-set-fuzz.json`(다시 쓰기)
- Modify: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java`(`MIN_CASES`)·`src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts`(`MIN_CASES`)
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/FlowFixtures.java`·`flow/FlowParserTest.java`·`flow/FlowTreeTest.java`, `src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-model.test.ts`

**Interfaces:**
- Consumes: 없음(첫 태스크).
- Produces(Java, `kr.dongkuk.maru.mdm.engine.flow`):
  - `public sealed interface Step extends Block permits RuleStep, TaskStep { String nodeId(); }`, `Block permits Seq, Step, Split, Guarded`
  - `record Branch(String edgeId, @Nullable String cond, boolean otherwise, @Nullable String label, Seq body, boolean ends)`
  - `record Split(String nodeId, NodeKind kind, @Nullable String mergeId, String joinId, List<Branch> branches)`
  - `record Guarded(Step step, Seq normal, List<Handler> handlers, @Nullable String mergeId, @Nullable String joinId)` + `String nodeId()` + `@Nullable Handler handlerFor(CatchKind)`
  - `FlowParser.catchable(NodeKind)` = RULE·TASK
- Produces(TS, `rse/flow-model.ts`):
  - `type Step = RuleStep | TaskStep`, `Branch.ends: boolean`, `Split.mergeId: string | null`, `Split.joinId: string`, `Guarded { type: "GUARDED"; step: Step; normal; handlers; mergeId: string | null; joinId: string | null }`
  - `joinOf(flow: RuleSetFlow, splitId: string): string | null` — IF 는 옛 짝 MERGE 또는 §2.2 모이는 자리, PARALLEL 은 짝 MERGE, 못 정하면 null
  - `endingBranches(flow: RuleSetFlow, splitId: string): string[] | null` — 새 형식 IF 의 끝내는 갈래 선 ID(실행 순서), 옛 IF·병렬은 `[]`, 분기 아님·못 정하면 null
  - `handlerTarget(flow: RuleSetFlow, catchId: string): string | null` — 처리 갈래 도착(END ID 면 끝내는 갈래)
  - `returnOf(flow: RuleSetFlow, nodeId: string): string | null` — 노드 배열 순서로 첫 돌아오는 처리 갈래의 도착
  - `CATCHABLE` = `{"RULE","TASK"}`

- [ ] **Step 1: 블록 타입 — Java**

`Step.java`(새 파일):
```java
package kr.dongkuk.maru.mdm.engine.flow;

/** 한 칸짜리 단계 — RULE·TASK(하위 세트 호출 스펙이 SET 을 더한다). 받는 노드가 붙으면 {@link Guarded#step()} 이 된다(implicit-join spec §4, J-D11). */
public sealed interface Step extends Block permits RuleStep, TaskStep {

    /** 노드 ID. */
    String nodeId();
}
```
`Block.java` 본문:
```java
/** 블록 트리 한 칸 — 순차·단계(룰·빈 단계)·분기·받는 노드 블록(implicit-join spec §4). */
public sealed interface Block permits Seq, Step, Split, Guarded {}
```
`RuleStep.java`: `public record RuleStep(String nodeId, String ruleId) implements Step {}`
`TaskStep.java`: `public record TaskStep(String nodeId) implements Step {}`(Javadoc 그대로)
`Branch.java`:
```java
/**
 * 갈래 하나 — 나가는 선과 그 갈래의 본문. {@code ends} 는 끝내는 IF 갈래(다른 갈래와 노드를 함께 지나지 않고 END 로 가서 세트를 끝낸다,
 * implicit-join spec §2.2)면 true 이고 본문은 END 앞까지다. 이어지는 갈래·병렬 갈래·옛 형식 IF 갈래는 false.
 */
public record Branch(String edgeId, @Nullable String cond, boolean otherwise, @Nullable String label, Seq body, boolean ends) {}
```
`Split.java`:
```java
/**
 * 분기 하나. {@code kind} 는 IF 또는 PARALLEL. {@code branches} 는 실행 순서다 — IF 는 order 오름차순 뒤 그 외, PARALLEL 은 order 오름차순.
 * {@code mergeId} 는 PARALLEL 과 옛 형식 IF 의 짝 MERGE(새 형식 IF 는 null), {@code joinId} 는 이어지는 갈래가 모이는 노드다
 * (MERGE 가 있으면 MERGE, implicit-join spec §2.2 4 의 예외에서만 END).
 */
public record Split(String nodeId, NodeKind kind, @Nullable String mergeId, String joinId, List<Branch> branches) implements Block {}
```
(`import kr.dongkuk.maru.mdm.engine.spi.Nullable;` 을 더한다.)
`Guarded.java`:
```java
/**
 * 받는 노드가 붙은 단계(받는 노드 spec §3, implicit-join spec §2.3). 단계가 성공하면 {@code normal} 을, 실패하거나 결과가 없는데 그 종류를
 * 받는 노드가 있으면 그 처리 갈래를 실행한다. 처리 갈래는 {@code joinId}(돌아오는 자리 J)로 돌아오거나({@code ends=false}) END 로 가서
 * 세트를 끝낸다({@code ends=true}). 돌아오는 처리 갈래가 없으면 {@code normal} 은 비고 {@code joinId} 는 null 이며 노드의 나가는 선은
 * 바깥 순차가 그대로 잇는다. {@code mergeId} 는 옛 형식 돌아오는 MERGE(splitId = 이 노드)일 때만 {@code joinId} 와 같다.
 * {@code step} 이 TASK 면 처리 갈래는 실행되지 않는다(J-D4). m-mdm {@code flow-model.ts} 의 {@code Guarded} 짝.
 */
public record Guarded(Step step, Seq normal, List<Handler> handlers, @Nullable String mergeId, @Nullable String joinId) implements Block {

    /** 처리 갈래 하나 — 받는 노드 ID·받는 종류(저장 순서)·본문·END 로 끝내는가. */
    public record Handler(String catchNodeId, List<CatchKind> kinds, Seq body, boolean ends) {}

    /** 받는 노드가 붙은 노드 ID. */
    public String nodeId() {
        return step.nodeId();
    }

    /** kind 를 받는 처리 갈래. 없으면 null(한 노드에서 한 종류는 한 받는 노드만 받는다 — FLOW_CATCH). */
    public @Nullable Handler handlerFor(CatchKind kind) {
        for (Handler h : handlers) {
            if (h.kinds().contains(kind)) {
                return h;
            }
        }
        return null;
    }
}
```
`package-info.java` 의 Javadoc 마지막 두 문장을 바꾼다:
```java
 * 받는 노드(CATCH)는 붙은 단계(RULE·TASK)와 함께 {@link kr.dongkuk.maru.mdm.engine.flow.Guarded} 한 칸이 된다(받는 노드 spec §3).
 * IF 와 처리 갈래는 합류(MERGE) 없이 모이는 자리·돌아오는 자리로 바로 가고, 해석이 그 자리를 줄기에서 계산한다(implicit-join spec §2, D-136).
 * 옛 형식(IF·받는 노드가 붙은 노드를 가리키는 MERGE)도 그대로 받는다. MERGE 는 새 형식에서 병렬 합류에만 쓴다.
 * m-mdm {@code pages/dme/ruleSetEdit/flow-model.ts} 가 같은 알고리즘·문구를 갖고 {@code rule-set-corpus.json} 이 동치를 고정한다.
```

- [ ] **Step 2: 엔진 시험 픽스처·실패하는 구조 시험 — Java**

`FlowFixtures.java` 끝(`nestedFlow()` 뒤)에 더한다:
```java
    /** 새 형식 IF(implicit-join spec §1) — start → if1 [b1 "X > 10" → a(R_A)] [b2 "X > 0" → b(R_B)] [그 외 bo → c(R_C)] → j(빈 단계) → end. */
    public static FlowDefinition ifFlowNew() {
        return flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), task("j"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 10"), br("b2", "if1", "b", 2, "X > 0"), other("bo", "if1", "c"),
                        e("ea", "a", "j"), e("eb", "b", "j"), e("ec", "c", "j"), e("ej", "j", "end")));
    }
```

`FlowParserTest.java` — 바뀌는 기존 시험을 고친다:

`IF_흐름은_그_외를_마지막에_둔_갈래_순서로_트리가_된다` 끝에 `assertEquals("m1", s.joinId());` 와 `assertFalse(s.branches().get(0).ends());` 를 더한다.

`f1_f2_짝_분기가_없는_합류와_합류가_없는_분기` 를 아래로 바꾼다(이름도):
```java
    @Test
    void f1_짝_분기가_없는_합류_f2_합류가_없는_병렬과_합류가_둘인_IF() {
        FlowDefinition f = line(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), merge("m1", null), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "b"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ee", "m1", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|m1|null|합류 m1의 짝 분기 -가 없다"), issues(f), "IF 는 합류가 0개여도 된다");
        FlowDefinition par = line(List.of(start(), par("p1"), rule("a", "R_A"), rule("b", "R_B"), end()),
                List.of(e("e0", "start", "p1"), pe("p1a", "p1", "a", 1), pe("p1b", "p1", "b", 2), e("ea", "a", "end"), e("eb", "b", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|p1|null|분기 p1를 닫는 합류가 0개다. 정확히 1개여야 한다"), issues(par));
        FlowDefinition two = line(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), merge("m1", "if1"),
                        merge("m2", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 1"), br("b2", "if1", "b", 2, "X > 2"), other("bo", "if1", "c"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ec", "c", "m2"), e("em", "m1", "m2"), e("ee", "m2", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|if1|null|IF if1를 닫는 합류가 2개다. IF 는 합류를 두지 않는다"), issues(two));
    }
```
`일단계_순서는_a_b_c_노드별_d_e_f1_분기별_f2_g` 의 기대에서 `"FLOW_STRUCTURE|if1|null|분기 if1를 닫는 합류가 0개다. 정확히 1개여야 한다",` 줄을 지운다(IF 는 합류 0개가 맞다).
`두_번_지나는_노드` 의 기대 문구 끝을 `갈래가 모이는 자리 밖에서 만난다` 로 바꾼다.
`받는_룰은_Guarded_블록이고_처리_갈래는_돌아옴과_끝냄을_안다` 의 `g.rule()` 을 `g.step()` 으로 바꾸고 `assertEquals("mr", g.joinId());` 를 더한다.
`돌아오는_처리_갈래가_없으면_정상_갈래가_비고_룰의_나가는_선이_그대로_이어진다` 에 `assertNull(g.joinId());` 를 더한다.
`받는_노드_오류는_FLOW_CATCH_로_모두_모은다` 의 기대를 바꾼다 — 첫 줄 `"FLOW_CATCH|c0|null|받는 노드 c0가 붙은 노드 zz가 없다"`, 둘째 줄(`c1는 룰 노드에만…`)은 지운다(빈 단계에도 붙는다).
`받는_노드가_있으면_END_는_들어오는_선이_여럿이어도_되고_없으면_지금처럼_하나다` 를 아래로 바꾼다:
```java
    @Test
    void END_는_들어오는_선이_여럿이어도_되고_룰은_들어오는_선이_없으면_거부한다() {
        FlowDefinition withCatch = flow(List.of(start(), rule("r1", "R_A"), catchNode("c1", "r1", "NO_RESULT"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "end"), e("e3", "c1", "end")));
        assertEquals(List.of(), issues(withCatch));
        FlowDefinition orphan = flow(List.of(start(), rule("r1", "R_A"), rule("r2", "R_B"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "end"), e("e3", "r2", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|r2|null|r2의 들어오는 선이 0개다. 1개 이상이어야 한다"), issues(orphan));
    }
```
`처리_갈래가_다른_합류로_가면_멈추고_처리_갈래_안_IF_갈래는_END_로_못_간다` 의 첫 흐름(`jump`) 기대를 받는 것으로 바꾼다(둘째 `nested` 는 그대로 — 옛 형식 IF 는 모든 갈래가 합류로 닫혀야 한다). 이름은 `처리_갈래가_둘러싼_IF_의_옛_합류로_돌아오면_받고_옛_형식_IF_갈래는_END_로_못_간다`:
```java
        FlowParse p = FlowParser.parse(jump);
        assertEquals(List.of(), p.issues());
        Split s = (Split) p.tree().root().items().get(0);
        Guarded g = (Guarded) s.branches().get(0).body().items().get(0);
        assertEquals("m9", g.joinId());
        assertNull(g.mergeId());
        assertEquals(List.of(), g.normal().items());
```

새 시험을 파일 끝(`}` 앞)에 더한다:
```java
    // ── 모이는 자리·끝내는 갈래(implicit-join spec §2.2) ──

    private static Split split(FlowDefinition f, int index) {
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        return (Split) p.tree().root().items().get(index);
    }

    @Test
    void 새_형식_IF_는_갈래가_다음_노드로_바로_모인다() {
        FlowParse p = FlowParser.parse(kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifFlowNew());
        assertEquals(List.of(), p.issues());
        Split s = (Split) p.tree().root().items().get(0);
        assertNull(s.mergeId());
        assertEquals("j", s.joinId());
        assertEquals(List.of("b1", "b2", "bo"), s.branches().stream().map(Branch::edgeId).toList());
        assertTrue(s.branches().stream().noneMatch(Branch::ends));
        assertEquals(new TaskStep("j"), p.tree().root().items().get(1));
    }

    @Test
    void 빈_갈래는_모이는_자리로_바로_가는_선이고_중첩_IF_는_같은_자리에서_함께_닫힌다() {
        // if1 [b1 → if2 [d1 → a][그 외 → b]] [그 외 → z(빈 갈래)], a·b → z → end — 두 IF 가 z 에서 함께 닫힌다.
        FlowDefinition g = flow(List.of(start(), ifNode("if1"), ifNode("if2"), rule("a", "R_A"), rule("b", "R_B"), rule("z", "R_Z"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "if2", 1, "X > 0"), other("bo", "if1", "z"), br("d1", "if2", "a", 1, "X > 1"),
                        other("do", "if2", "b"), e("ea", "a", "z"), e("eb", "b", "z"), e("ez", "z", "end")));
        Split outer = split(g, 0);
        assertEquals("z", outer.joinId());
        assertEquals(List.of(), outer.branches().get(1).body().items(), "그 외는 z 로 바로 가는 빈 갈래");
        Split inner = (Split) outer.branches().get(0).body().items().get(0);
        assertEquals("z", inner.joinId());
        assertEquals(new RuleStep("z", "R_Z"), FlowParser.parse(g).tree().root().items().get(1));
    }

    @Test
    void END_로_바로_가는_갈래는_끝내는_갈래이고_빈_갈래로_세지_않는다() {
        // if1 [b1 "X > 0" → end] [그 외 → a] → a → end. 두 갈래가 겹치지 않아 §2.2 5 — END 로 바로 가지 않는 마지막 갈래(그 외)가 이어진다.
        Split s = split(flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "end", 1, "X > 0"), other("bo", "if1", "a"), e("ea", "a", "end"))), 0);
        assertEquals("a", s.joinId());
        assertTrue(s.branches().get(0).ends());
        assertEquals(List.of(), s.branches().get(0).body().items());
        assertFalse(s.branches().get(1).ends());
        assertEquals(List.of(), s.branches().get(1).body().items());
    }

    @Test
    void 몸_있는_끝내는_갈래_여럿과_이어지는_갈래_둘이면_이어지는_갈래가_처음_만나는_노드가_모이는_자리다() {
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("e1n", "R_E1"), rule("e2n", "R_E2"), rule("a", "R_A"), rule("b", "R_B"),
                        rule("x", "R_X"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "e1n", 1, "X > 1"), br("b2", "if1", "e2n", 2, "X > 2"), br("b3", "if1", "a", 3, "X > 3"),
                        other("bo", "if1", "b"), e("ee1", "e1n", "end"), e("ee2", "e2n", "end"), e("ea", "a", "x"), e("eb", "b", "x"),
                        e("ex", "x", "end")));
        Split s = split(f, 0);
        assertEquals("x", s.joinId());
        assertEquals(List.of(true, true, false, false), s.branches().stream().map(Branch::ends).toList());
        assertEquals(List.of(new RuleStep("e1n", "R_E1")), s.branches().get(0).body().items());
    }

    @Test
    void 모든_갈래가_따로_END_로_가면_실행_순서_마지막의_END_직행_아닌_갈래가_이어진다() {
        // 그 외에 노드가 있으면 그 외가 이어진다(§1 둘째 예).
        Split s1 = split(flow(List.of(start(), ifNode("if1"), rule("r8", "R_L"), rule("r2", "R_M"), end()),
                List.of(e("e0", "start", "if1"), br("e3", "if1", "r8", 1, "PRICE = NULL"), e("e4", "r8", "end"), other("e5", "if1", "r2"),
                        e("e6", "r2", "end"))), 0);
        assertEquals("r2", s1.joinId());
        assertEquals(List.of(true, false), s1.branches().stream().map(Branch::ends).toList());
        // 그 외가 END 로 바로 가면 조건 갈래가 이어진다(N20).
        Split s2 = split(flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "end"), e("ea", "a", "end"))), 0);
        assertEquals("a", s2.joinId());
        assertEquals(List.of(false, true), s2.branches().stream().map(Branch::ends).toList());
    }

    @Test
    void 다른_갈래와_노드를_함께_지나는_갈래는_끝내는_갈래가_아니다() {
        // b1·b2 는 s 를 함께 지난 뒤 END, 그 외는 c → END 따로(N24).
        Split s = split(flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), rule("s", "R_S"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), br("b2", "if1", "b", 2, "X > 1"), other("bo", "if1", "c"),
                        e("ea", "a", "s"), e("eb", "b", "s"), e("ec", "c", "end"), e("es", "s", "end"))), 0);
        assertEquals("s", s.joinId());
        assertEquals(List.of(false, false, true), s.branches().stream().map(Branch::ends).toList());
    }

    @Test
    void f4_새_형식_IF_의_같은_도착_갈래_선_둘은_거부하고_옛_IF_와_병렬은_받는다() {
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), end()),
                List.of(e("e1", "start", "if1"), br("e2", "if1", "a", 1, "X > 0"), other("e3", "if1", "a"), e("e4", "a", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|if1|e3|IF if1의 갈래 e3가 갈래 e2와 같은 노드 a로 간다. 같은 노드로 가는 갈래는 하나만 둔다"), issues(f));
        FlowDefinition old = flow(List.of(start(), ifNode("if1"), merge("m1", "if1"), end()),
                List.of(e("e1", "start", "if1"), br("e2", "if1", "m1", 1, "X > 0"), other("e3", "if1", "m1"), e("e4", "m1", "end")));
        assertEquals(List.of(), issues(old));
        FlowDefinition par = flow(List.of(start(), par("p1"), merge("pm", "p1"), end()),
                List.of(e("e1", "start", "p1"), pe("e2", "p1", "pm", 1), pe("e3", "p1", "pm", 2), e("e4", "pm", "end")));
        assertEquals(List.of(), issues(par));
    }

    @Test
    void S6_줄기_순환과_모이는_자리_재진입() {
        // if1 [b1 → a → c → a(순환)] [그 외 → b] → b → end: 모이는 자리를 계산하는 줄기가 a 를 두 번 만난다.
        FlowDefinition loop = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("c", "R_C"), rule("b", "R_B"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "b"), e("ea", "a", "c"), e("ec", "c", "a"),
                        e("eb", "b", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|a|null|a를 두 번 지난다. 순환이 있거나 갈래가 모이는 자리 밖에서 만난다"), issues(loop));
        // r1 → if1 [b1 → a → r1] [그 외 → end]: if1 의 모이는 자리를 계산하다 다시 if1 의 모이는 자리가 필요하다(N7).
        FlowDefinition back = flow(List.of(start(), rule("r1", "R_A"), ifNode("if1"), rule("a", "R_B"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "end"), e("ea", "a", "r1")));
        assertEquals(List.of("FLOW_STRUCTURE|if1|null|if1를 두 번 지난다. 순환이 있거나 갈래가 모이는 자리 밖에서 만난다"), issues(back));
    }

    @Test
    void S6_갈래가_다른_갈래_중간_노드로_들어간다() {
        // N5 — 세 갈래가 모두 z 에서 만나고 b1·b2 는 y 를 함께 지난다: b2 가 이미 지난 y 를 다시 만난다.
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("a", "A"), rule("b", "B"), rule("c", "C"), rule("y", "D"), rule("z", "E"), end()),
                List.of(e("e1", "start", "if1"), br("b1", "if1", "a", 1, "X > 1"), br("b2", "if1", "b", 2, "X > 2"), other("bo", "if1", "c"),
                        e("ea", "a", "y"), e("eb", "b", "y"), e("ec", "c", "z"), e("ey", "y", "z"), e("ez", "z", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|y|null|y를 두 번 지난다. 순환이 있거나 갈래가 모이는 자리 밖에서 만난다"), issues(f));
    }

    // ── 돌아오는 자리(implicit-join spec §2.3) ──

    @Test
    void 처리_갈래가_룰_바로_뒤_노드나_정상_경로_중간_노드로_돌아온다() {
        FlowParse p = FlowParser.parse(flow(List.of(start(), rule("r1", "R_G"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "R_H"), rule("n", "R_F"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "n"), e("e3", "c1", "h"), e("e4", "h", "n"), e("e5", "n", "end"))));
        assertEquals(List.of(), p.issues());
        Guarded g = (Guarded) p.tree().root().items().get(0);
        assertEquals("n", g.joinId());
        assertNull(g.mergeId());
        assertEquals(List.of(), g.normal().items());
        assertEquals(new Guarded.Handler("c1", List.of(CatchKind.NO_RESULT), new Seq(List.of(new RuleStep("h", "R_H"))), false), g.handlers().get(0));
        assertEquals(new RuleStep("n", "R_F"), p.tree().root().items().get(1));
        FlowParse mid = FlowParser.parse(flow(List.of(start(), rule("r1", "R_G"), rule("n1", "R_K"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "R_H"),
                        rule("n2", "R_F"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "n1"), e("e3", "n1", "n2"), e("e4", "c1", "h"), e("e5", "h", "n2"), e("e6", "n2", "end"))));
        Guarded gm = (Guarded) mid.tree().root().items().get(0);
        assertEquals("n2", gm.joinId());
        assertEquals(List.of(new RuleStep("n1", "R_K")), gm.normal().items());
    }

    @Test
    void S7_두_처리_갈래가_서로_다른_노드로_돌아온다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "A"), rule("x", "B"), rule("y", "C"), catchNode("c1", "r1", "NO_RESULT"), rule("h1", "D"),
                        catchNode("c2", "r1", "EVAL_ERROR"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "x"), e("e3", "x", "y"), e("e4", "y", "end"), e("e5", "c1", "h1"), e("e6", "h1", "x"),
                        e("e7", "c2", "y")));
        assertEquals(List.of("FLOW_STRUCTURE|c2|null|r1의 처리 갈래 c2가 y로 돌아온다. 앞 처리 갈래 c1처럼 x로 돌아와야 한다"), issues(f));
    }

    @Test
    void S8_처리_갈래가_정상_갈래_노드로_들어가면_방문_검사보다_먼저_멈춘다() {
        // c1 → if1 [b1 → h1 → n1] [그 외 → h2 → n2]: if1 의 갈래는 n2 에서 만나 돌아오는 자리는 n2, 그런데 b1 은 정상 갈래 노드 n1 을 지난다.
        FlowDefinition f = flow(List.of(start(), rule("r1", "A"), rule("n1", "B"), rule("n2", "C"), catchNode("c1", "r1", "NO_RESULT"), ifNode("if1"),
                        rule("h1", "D"), rule("h2", "E"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "n1"), e("e3", "n1", "n2"), e("e4", "n2", "end"), e("e5", "c1", "if1"),
                        br("b1", "if1", "h1", 1, "X > 0"), other("bo", "if1", "h2"), e("e6", "h1", "n1"), e("e7", "h2", "n2")));
        assertEquals(List.of("FLOW_STRUCTURE|n1|null|처리 갈래 c1가 r1의 정상 갈래 노드 n1로 들어간다. 처리 갈래는 한 노드로 돌아오거나 끝 노드로 가야 한다"),
                issues(f));
    }

    @Test
    void S9_셋째_문구와_정상_갈래가_병렬을_넘어_END_로_빠지는_S5() {
        // N25 — 처리 갈래가 아직 지나지 않은 다른 병렬의 합류 pm3 을 지나 돌아오는 자리 j 로 가려 한다.
        FlowDefinition s9 = flow(List.of(start(), ifNode("if1"), rule("r1", "A"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "B"), par("p3"),
                        rule("a", "C"), merge("pm3", "p3"), rule("j", "D"), end()),
                List.of(e("e1", "start", "if1"), br("b1", "if1", "r1", 1, "X > 0"), other("bo", "if1", "p3"), e("e2", "r1", "j"), e("ec", "c1", "h"),
                        e("eh", "h", "pm3"), pe("pa", "p3", "a", 1), pe("pb", "p3", "pm3", 2), e("ea", "a", "pm3"), e("ep", "pm3", "j"), e("ej", "j", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|pm3|null|처리 갈래 c1가 돌아올 자리 j나 끝에 닿지 않고 pm3로 나간다"), issues(s9));
        // N16 — 처리 갈래가 병렬 합류 pm 으로 돌아온다(J = pm). 정상 갈래는 병렬을 한 칸으로 넘어 pm 에 닿지 않고 END 로 빠진다.
        FlowDefinition s5 = flow(List.of(start(), rule("r1", "A"), par("p1"), rule("a", "B"), rule("b", "C"), merge("pm", "p1"), rule("x", "D"),
                        catchNode("c1", "r1", "NO_RESULT"), rule("h", "E"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "p1"), pe("pa", "p1", "a", 1), pe("pb", "p1", "b", 2), e("ea", "a", "pm"), e("eb", "b", "pm"),
                        e("ep", "pm", "x"), e("ex", "x", "end"), e("ec", "c1", "h"), e("eh", "h", "pm")));
        assertEquals(List.of("FLOW_STRUCTURE|end|null|갈래가 pm에서 닫히지 않고 end로 나간다"), issues(s5));
    }

    @Test
    void 돌아오는_자리가_IF_모이는_자리이거나_병렬_합류여도_받는다() {
        // N13 — r1 은 if1 의 b1 갈래 안, c1 → h → j(= if1 의 모이는 자리).
        Split s = split(flow(List.of(start(), ifNode("if1"), rule("r1", "G"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "H"), rule("x", "K"),
                        rule("j", "F"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "r1", 1, "X > 0"), other("bo", "if1", "x"), e("e2", "r1", "j"), e("ec", "c1", "h"),
                        e("eh", "h", "j"), e("ex", "x", "j"), e("ej", "j", "end"))), 0);
        assertEquals("j", s.joinId());
        assertEquals("j", ((Guarded) s.branches().get(0).body().items().get(0)).joinId());
        // N14 — 병렬 갈래 안 r1 의 처리 갈래가 병렬 합류 pm 으로 돌아온다.
        Split p = split(flow(List.of(start(), par("p1"), rule("r1", "G"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "H"), rule("y", "K"),
                        merge("pm", "p1"), rule("z", "F"), end()),
                List.of(e("e0", "start", "p1"), pe("pa", "p1", "r1", 1), pe("pb", "p1", "y", 2), e("e2", "r1", "pm"), e("ec", "c1", "h"),
                        e("eh", "h", "pm"), e("ey", "y", "pm"), e("ep", "pm", "z"), e("ez", "z", "end"))), 0);
        Guarded g = (Guarded) p.branches().get(0).body().items().get(0);
        assertEquals("pm", g.joinId());
        assertNull(g.mergeId());
    }

    @Test
    void 빈_단계에도_받는_노드를_붙이고_TaskStep_블록이_된다() {
        FlowParse p = FlowParser.parse(flow(List.of(start(), task("t1"), catchNode("c1", "t1", "NO_RESULT"), rule("h", "H"),
                        catchNode("c2", "t1", "EVAL_ERROR"), rule("n", "F"), end()),
                List.of(e("e1", "start", "t1"), e("e2", "t1", "n"), e("e3", "c1", "h"), e("e4", "h", "n"), e("e5", "c2", "end"), e("e6", "n", "end"))));
        assertEquals(List.of(), p.issues());
        Guarded g = (Guarded) p.tree().root().items().get(0);
        assertEquals(new TaskStep("t1"), g.step());
        assertEquals("n", g.joinId());
        assertTrue(g.handlers().get(1).ends());
        assertEquals(List.of("H", "F"), p.tree().ruleIds());
    }
```
(`import static …FlowFixtures.pe;`·`par` 는 이미 있다. `task` import 도 이미 있다.)

`FlowTreeTest.java` 끝에 더한다:
```java
    @Test
    void 끝내는_갈래_안_노드는_IF_뒤_노드보다_앞이고_빈_단계_블록도_위치를_갖는다() {
        // if1 [b1 → e → end](끝내는 갈래) [그 외 → a] → a → z → end
        FlowTree t = tree(flow(List.of(start(), ifNode("if1"), rule("e", "R_E"), rule("a", "R_A"), rule("z", "R_Z"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "e", 1, "X > 0"), other("bo", "if1", "a"), e("ee", "e", "end"), e("ea", "a", "z"),
                        e("ez", "z", "end"))));
        assertEquals(Relation.AFTER, t.relation("z", "e"), "블록 뒤에서 끝내는 갈래 결과를 읽으면 IF_SIBLING 이 아니라 뒤 경로다(§6)");
        assertEquals(List.of("e", "a", "z"), t.ruleSteps().stream().map(RuleStep::nodeId).toList());
        FlowTree tk = tree(flow(List.of(start(), kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.task("t1"), catchNode("c1", "t1", "NO_RESULT"),
                        rule("h", "R_H"), rule("n", "R_F"), end()),
                List.of(e("e1", "start", "t1"), e("e2", "t1", "n"), e("e3", "c1", "h"), e("e4", "h", "n"), e("e5", "n", "end"))));
        assertEquals(Relation.BEFORE, tk.relation("t1", "h"));
        assertEquals(Relation.BEFORE, tk.relation("h", "n"));
        assertEquals(List.of("h", "n"), tk.ruleSteps().stream().map(RuleStep::nodeId).toList());
    }
```

- [ ] **Step 3: 실패 확인**

Run: `(cd src/backend/maru-mdm-engine && ../gradlew test --tests '*FlowParserTest' --tests '*FlowTreeTest' --console=plain)`
Expected: 컴파일 실패(`Branch` 6칸·`Split.joinId`·`Guarded.step`·`TaskStep` 이 `Step` 이 아님 등). Step 1 만 넣고 FlowParser 를 아직 안 바꿨다면 컴파일 오류가 `FlowParser.java`·`FlowRun.java`·`FlowKeys.java` 에서 난다.

- [ ] **Step 4: `FlowParser.java` 전체 교체**

```java
package kr.dongkuk.maru.mdm.engine.flow;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree.Frame;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree.Position;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;

/**
 * 흐름 구조 검사와 블록 트리 만들기(plan C3, 받는 노드 spec §3, implicit-join spec §2·§3). 1단계는 어긋난 것을 모두 모으고, 하나라도 있으면
 * 트리를 만들지 않는다. 2단계(트리 만들기)는 첫 오류에서 멈춘다. IF 의 모이는 자리와 처리 갈래의 돌아오는 자리는 그 블록에 닿을 때
 * 줄기(spine)로 계산하고 IF 별로 기억한다. 문구·순서를 바꾸면 m-mdm flow-model.ts 와 rule-set-corpus.json 을 함께 바꾼다.
 */
public final class FlowParser {

    public static final String STRUCTURE = "FLOW_STRUCTURE";
    public static final String IF_ELSE = "FLOW_IF_ELSE";
    /** 받는 노드 붙임·종류 오류(받는 노드 spec §5). */
    public static final String CATCH = "FLOW_CATCH";

    private FlowParser() {}

    /** 받는 노드를 붙일 수 있는 노드 종류(implicit-join spec §2.7 — RULE·TASK). 하위 세트 호출 스펙이 SET 을 더한다. */
    public static boolean catchable(NodeKind k) {
        return k == NodeKind.RULE || k == NodeKind.TASK;
    }

    /** ruleIds 순서의 한 줄 흐름. 노드 "start", "r1".."rN", "end", 선 "e1".."e(N+1)". */
    public static FlowDefinition linear(List<String> ruleIds) {
        List<FlowNode> nodes = new ArrayList<>();
        List<FlowEdge> edges = new ArrayList<>();
        nodes.add(new FlowNode("start", NodeKind.START, null, null, null, null, null));
        String prev = "start";
        for (int i = 0; i < ruleIds.size(); i++) {
            String id = "r" + (i + 1);
            nodes.add(new FlowNode(id, NodeKind.RULE, ruleIds.get(i), null, null, null, null));
            edges.add(new FlowEdge("e" + (i + 1), prev, id, null, null, false, null));
            prev = id;
        }
        nodes.add(new FlowNode("end", NodeKind.END, null, null, null, null, null));
        edges.add(new FlowEdge("e" + (ruleIds.size() + 1), prev, "end", null, null, false, null));
        return new FlowDefinition(1, List.copyOf(nodes), List.copyOf(edges));
    }

    public static FlowParse parse(FlowDefinition flow) {
        List<FlowIssue> issues = new ArrayList<>();
        Map<String, FlowNode> byId = new LinkedHashMap<>();
        // a — 노드 ID 중복
        for (FlowNode n : flow.nodes()) {
            if (byId.containsKey(n.id())) {
                issues.add(structure(n.id(), null, "노드 ID " + n.id() + "가 겹친다"));
            } else {
                byId.put(n.id(), n);
            }
        }
        // 받는 노드가 붙은 노드 → 붙은 받는 노드(노드 배열 순서). 붙임이 맞는 것만 — h 가 채우고 e·2단계가 쓴다.
        Map<String, List<FlowNode>> catchesOf = new LinkedHashMap<>();
        for (FlowNode n : byId.values()) {
            FlowNode target = n.kind() == NodeKind.CATCH && !blank(n.attachTo()) ? byId.get(n.attachTo()) : null;
            if (target != null && catchable(target.kind())) {
                catchesOf.computeIfAbsent(target.id(), k -> new ArrayList<>()).add(n);
            }
        }
        // b1·b2 — 시작·끝 개수
        long starts = byId.values().stream().filter(n -> n.kind() == NodeKind.START).count();
        long ends = byId.values().stream().filter(n -> n.kind() == NodeKind.END).count();
        if (starts != 1) {
            issues.add(structure(null, null, "시작 노드가 " + starts + "개다. 정확히 1개여야 한다"));
        }
        if (ends != 1) {
            issues.add(structure(null, null, "끝 노드가 " + ends + "개다. 정확히 1개여야 한다"));
        }
        // c — 없는 노드를 가리키는 선(걸린 선은 개수 계산에서 뺀다)
        Map<String, List<FlowEdge>> in = new HashMap<>();
        Map<String, List<FlowEdge>> out = new HashMap<>();
        for (FlowEdge e : flow.edges()) {
            boolean ok = true;
            if (!byId.containsKey(e.from())) {
                issues.add(structure(e.from(), e.id(), "선 " + e.id() + "가 없는 노드 " + e.from() + "를 가리킨다"));
                ok = false;
            }
            if (!byId.containsKey(e.to())) {
                issues.add(structure(e.to(), e.id(), "선 " + e.id() + "가 없는 노드 " + e.to() + "를 가리킨다"));
                ok = false;
            }
            if (ok) {
                out.computeIfAbsent(e.from(), k -> new ArrayList<>()).add(e);
                in.computeIfAbsent(e.to(), k -> new ArrayList<>()).add(e);
            }
        }
        // d1·d2·e·f1 — 노드별
        for (FlowNode n : byId.values()) {
            int i = in.getOrDefault(n.id(), List.of()).size();
            int o = out.getOrDefault(n.id(), List.of()).size();
            degree(issues, n.id(), "들어오는", i, inRule(n.kind()));
            degree(issues, n.id(), "나가는", o, outRule(n.kind()));
            if (n.kind() == NodeKind.RULE && blank(n.ruleId())) {
                issues.add(structure(n.id(), null, "룰 노드 " + n.id() + "에 룰 ID가 없다"));
            }
            if (n.kind() == NodeKind.MERGE) {
                FlowNode s = n.splitId() == null ? null : byId.get(n.splitId());
                boolean split = s != null && (s.kind() == NodeKind.IF || s.kind() == NodeKind.PARALLEL);
                boolean guard = s != null && catchesOf.containsKey(s.id());
                if (!split && !guard) {
                    issues.add(structure(n.id(), null, "합류 " + n.id() + "의 짝 분기 " + (n.splitId() == null ? "-" : n.splitId()) + "가 없다"));
                }
            }
        }
        // f2·g1..g5·f4 — 분기별
        for (FlowNode n : byId.values()) {
            if (n.kind() != NodeKind.IF && n.kind() != NodeKind.PARALLEL) {
                continue;
            }
            long merges = byId.values().stream().filter(m -> m.kind() == NodeKind.MERGE && n.id().equals(m.splitId())).count();
            if (n.kind() == NodeKind.PARALLEL && merges != 1) {
                issues.add(structure(n.id(), null, "분기 " + n.id() + "를 닫는 합류가 " + merges + "개다. 정확히 1개여야 한다"));
            }
            if (n.kind() == NodeKind.IF && merges > 1) {
                issues.add(structure(n.id(), null, "IF " + n.id() + "를 닫는 합류가 " + merges + "개다. IF 는 합류를 두지 않는다"));
            }
            List<FlowEdge> outs = out.getOrDefault(n.id(), List.of());
            List<FlowEdge> ordered = new ArrayList<>();
            if (n.kind() == NodeKind.IF) {
                long others = outs.stream().filter(FlowEdge::otherwise).count();
                if (others != 1) {
                    issues.add(new FlowIssue(IF_ELSE, n.id(), null, "IF " + n.id() + "에 \"그 외\" 갈래가 " + others + "개다. 정확히 1개여야 한다"));
                }
                for (FlowEdge e : outs) {
                    if (!e.otherwise() && blank(e.cond())) {
                        issues.add(new FlowIssue(IF_ELSE, n.id(), e.id(), "IF " + n.id() + "의 갈래 " + e.id() + "에 조건식이 없다"));
                    }
                }
                outs.stream().filter(e -> !e.otherwise()).forEach(ordered::add);
            } else {
                for (FlowEdge e : outs) {
                    if (!blank(e.cond()) || e.otherwise()) {
                        issues.add(structure(n.id(), e.id(), "병렬 분기 " + n.id() + "의 갈래 " + e.id() + "에는 조건을 둘 수 없다"));
                    }
                }
                ordered.addAll(outs);
            }
            for (FlowEdge e : ordered) {
                if (e.order() == null) {
                    issues.add(structure(n.id(), e.id(), "분기 " + n.id() + "의 갈래 " + e.id() + "에 순서가 없다"));
                }
            }
            Set<Integer> seen = new HashSet<>();
            for (FlowEdge e : ordered) {
                if (e.order() != null && !seen.add(e.order())) {
                    issues.add(structure(n.id(), e.id(), "분기 " + n.id() + "의 갈래 순서 " + e.order() + "가 겹친다"));
                }
            }
            // f4 — 새 형식 IF(짝 MERGE 없음)의 같은 도착 갈래 선(J-D7). 옛 IF·병렬은 보지 않는다.
            if (n.kind() == NodeKind.IF && merges == 0) {
                Map<String, String> first = new HashMap<>();
                for (FlowEdge e : outs) {
                    String prev = first.putIfAbsent(e.to(), e.id());
                    if (prev != null) {
                        issues.add(structure(n.id(), e.id(), "IF " + n.id() + "의 갈래 " + e.id() + "가 갈래 " + prev + "와 같은 노드 " + e.to()
                                + "로 간다. 같은 노드로 가는 갈래는 하나만 둔다"));
                    }
                }
            }
        }
        // h1..h5 — 받는 노드별(받는 노드 spec §5 FLOW_CATCH)
        for (FlowNode n : byId.values()) {
            if (n.kind() != NodeKind.CATCH) {
                continue;
            }
            FlowNode target = blank(n.attachTo()) ? null : byId.get(n.attachTo());
            if (target == null) {
                issues.add(new FlowIssue(CATCH, n.id(), null, "받는 노드 " + n.id() + "가 붙은 노드 " + (blank(n.attachTo()) ? "-" : n.attachTo()) + "가 없다"));
            } else if (!catchable(target.kind())) {
                issues.add(new FlowIssue(CATCH, n.id(), null, "받는 노드 " + n.id() + "는 룰·빈 단계 노드에만 붙일 수 있다(" + target.id() + "는 " + target.kind() + ")"));
            }
            List<String> keys = n.catches() == null ? List.of() : n.catches();
            if (keys.isEmpty()) {
                issues.add(new FlowIssue(CATCH, n.id(), null, "받는 노드 " + n.id() + "에 받을 예외 종류가 없다"));
            }
            Set<String> seen = new HashSet<>();
            for (String k : keys) {
                if (CatchKind.parse(k).isEmpty()) {
                    issues.add(new FlowIssue(CATCH, n.id(), null, "받는 노드 " + n.id() + "의 예외 종류 " + k + "를 모른다"));
                } else if (!seen.add(k)) {
                    issues.add(new FlowIssue(CATCH, n.id(), null, "받는 노드 " + n.id() + "에 예외 종류 " + k + "가 겹친다"));
                }
            }
        }
        // h6·h7 — 받는 노드가 붙은 노드별
        for (Map.Entry<String, List<FlowNode>> en : catchesOf.entrySet()) {
            Map<String, String> owner = new HashMap<>();
            for (FlowNode c : en.getValue()) {
                for (String k : c.catches() == null ? List.<String>of() : c.catches()) {
                    if (CatchKind.parse(k).isEmpty()) {
                        continue;
                    }
                    String prev = owner.putIfAbsent(k, c.id());
                    if (prev != null && !prev.equals(c.id())) {
                        issues.add(new FlowIssue(CATCH, c.id(), null, "룰 노드 " + en.getKey() + "에서 예외 종류 " + k + "를 " + prev + "와 " + c.id() + "가 함께 받는다"));
                    }
                }
            }
            long merges = byId.values().stream().filter(m -> m.kind() == NodeKind.MERGE && en.getKey().equals(m.splitId())).count();
            if (merges > 1) {
                issues.add(structure(en.getKey(), null, "룰 " + en.getKey() + "로 돌아오는 합류가 " + merges + "개다. 1개까지 둔다"));
            }
        }
        if (!issues.isEmpty()) {
            return new FlowParse(null, List.copyOf(issues));
        }
        try {
            return new FlowParse(new Builder(byId, out, catchesOf).build(), List.of());
        } catch (Stop s) {
            return new FlowParse(null, List.of(s.issue));
        }
    }

    // ------------------------------------------------------------------ 2단계

    /** 첫 오류에서 멈추려고 던진다. */
    private static final class Stop extends RuntimeException {
        private static final long serialVersionUID = 1L;
        final transient FlowIssue issue;

        Stop(FlowIssue issue) {
            super(issue.message(), null, false, false);
            this.issue = issue;
        }
    }

    /** IF 하나의 모이는 자리와 끝내는 갈래 선 ID(implicit-join spec §2.2). */
    private record Join(String joinId, Set<String> ending) {}

    /** 지켜보는 정상 줄기 하나(§2.4 1) — 받는 노드가 붙은 노드, 지금 만드는 처리 갈래의 받는 노드, 정상 줄기(END 제외). */
    private record Watch(String guardId, String catchId, Set<String> normal) {}

    private static final class Builder {
        final Map<String, FlowNode> nodes;
        final Map<String, List<FlowEdge>> out;
        final Map<String, List<FlowNode>> catchesOf;
        final Map<String, String> mergeOf = new HashMap<>();
        final Set<String> visited = new HashSet<>();
        final List<RuleStep> steps = new ArrayList<>();
        final Map<String, Position> positions = new HashMap<>();
        final Map<String, NodeKind> splitKinds = new HashMap<>();
        /** IF ID → 모이는 자리(§2.2 6 — 해석 한 번 동안 기억한다). */
        final Map<String, Join> joins = new HashMap<>();
        /** 지금 모이는 자리를 계산 중인 IF — 다시 필요하면 S6. */
        final Set<String> joining = new HashSet<>();
        /** 지켜보는 정상 줄기 묶음 — push 로 넣으므로 반복은 가장 안쪽부터다. */
        final Deque<Watch> watches = new ArrayDeque<>();
        String endId;
        int order;

        Builder(Map<String, FlowNode> nodes, Map<String, List<FlowEdge>> out, Map<String, List<FlowNode>> catchesOf) {
            this.nodes = nodes;
            this.out = out;
            this.catchesOf = catchesOf;
            for (FlowNode n : nodes.values()) {
                if (n.kind() == NodeKind.MERGE) {
                    mergeOf.put(n.splitId(), n.id());
                }
            }
        }

        FlowTree build() {
            FlowNode start = nodes.values().stream().filter(n -> n.kind() == NodeKind.START).findFirst().orElseThrow();
            FlowNode end = nodes.values().stream().filter(n -> n.kind() == NodeKind.END).findFirst().orElseThrow();
            endId = end.id();
            visited.add(start.id());
            Seq root = seq(next(start.id()), endId, List.of());
            visited.add(endId);
            for (FlowNode n : nodes.values()) {
                if (!visited.contains(n.id())) {
                    throw new Stop(structure(n.id(), null, n.id() + "에 도달할 수 없다"));
                }
            }
            return new FlowTree(root, start.id(), endId, steps, positions, splitKinds);
        }

        Seq seq(String cur, String stop, List<Frame> chain) {
            return seq(cur, stop, chain, "갈래가 " + stop + "에서 닫히지 않고 ");
        }

        Seq seq(String cur, String stop, List<Frame> chain, String notClosed) {
            List<Block> items = new ArrayList<>();
            while (!cur.equals(stop)) {
                cur = step(cur, stop, items, chain, notClosed);
            }
            return new Seq(List.copyOf(items));
        }

        /** 노드 하나를 블록으로 만들어 items 에 넣고 다음 노드 ID 를 돌려준다(§2.4 — 침범 → 방문 → 종류). stop 은 둘러싼 끝. */
        String step(String cur, String stop, List<Block> items, List<Frame> chain, String notClosed) {
            for (Watch w : watches) {
                if (w.normal().contains(cur)) {
                    throw new Stop(structure(cur, null, "처리 갈래 " + w.catchId() + "가 " + w.guardId() + "의 정상 갈래 노드 " + cur
                            + "로 들어간다. 처리 갈래는 한 노드로 돌아오거나 끝 노드로 가야 한다"));
                }
            }
            if (visited.contains(cur)) {
                throw new Stop(structure(cur, null, twice(cur)));
            }
            FlowNode n = nodes.get(cur);
            if (n.kind() == NodeKind.START || n.kind() == NodeKind.END || n.kind() == NodeKind.MERGE) {
                throw new Stop(structure(cur, null, notClosed + cur + "로 나간다"));
            }
            visited.add(cur);
            positions.put(cur, new Position(chain, order++));
            return switch (n.kind()) {
                case RULE, TASK -> stepNode(n, stop, items, chain);
                case IF -> ifBlock(n, items, chain);
                default -> parallelBlock(n, items, chain);
            };
        }

        String stepNode(FlowNode n, String stop, List<Block> items, List<Frame> chain) {
            String id = n.id();
            Step s;
            if (n.kind() == NodeKind.RULE) {
                RuleStep r = new RuleStep(id, n.ruleId());
                steps.add(r);
                s = r;
            } else {
                s = new TaskStep(id);
            }
            List<FlowNode> catches = catchesOf.getOrDefault(id, List.of());
            if (catches.isEmpty()) {
                items.add(s);
                return next(id);
            }
            return guarded(s, catches, stop, items, chain);
        }

        /** 받는 노드 블록(§2.3) — 정상 갈래(사슬 0) 다음 처리 갈래(사슬 k+1, 받는 노드 배열 순서). */
        String guarded(Step s, List<FlowNode> catches, String stop, List<Block> items, List<Frame> chain) {
            String id = s.nodeId();
            List<String> normalSpine = spine(next(id), stop);
            Set<String> inS = new LinkedHashSet<>(normalSpine);
            List<String> targets = new ArrayList<>();
            for (FlowNode c : catches) {
                String t = endId;
                for (String x : spine(next(c.id()), null)) {
                    if (inS.contains(x) || x.equals(endId)) {
                        t = x;
                        break;
                    }
                }
                targets.add(t);
            }
            String j = null;
            String jCatch = null;
            for (int k = 0; k < catches.size(); k++) {
                String t = targets.get(k);
                if (t.equals(endId)) {
                    continue;
                }
                if (j == null) {
                    j = t;
                    jCatch = catches.get(k).id();
                } else if (!t.equals(j)) {
                    String c = catches.get(k).id();
                    throw new Stop(structure(c, null, id + "의 처리 갈래 " + c + "가 " + t + "로 돌아온다. 앞 처리 갈래 " + jCatch + "처럼 " + j + "로 돌아와야 한다"));
                }
            }
            String mergeId = j != null && j.equals(mergeOf.get(id)) ? j : null;
            Seq normal = j == null ? new Seq(List.of()) : seq(next(id), j, FlowTree.extend(chain, id, 0));
            Set<String> watched = new LinkedHashSet<>(normalSpine);
            watched.remove(endId);
            List<Guarded.Handler> handlers = new ArrayList<>();
            for (int k = 0; k < catches.size(); k++) {
                FlowNode c = catches.get(k);
                visited.add(c.id());
                String t = targets.get(k);
                String notClosed = "처리 갈래 " + c.id() + "가 " + (t.equals(endId) ? "끝" : t.equals(mergeId) ? "합류 " + t + "나 끝" : "돌아올 자리 " + t + "나 끝")
                        + "에 닿지 않고 ";
                watches.push(new Watch(id, c.id(), watched));
                try {
                    Seq body = seq(next(c.id()), t, FlowTree.extend(chain, id, k + 1), notClosed);
                    List<CatchKind> kinds = c.catches().stream().map(key -> CatchKind.parse(key).orElseThrow()).toList();
                    handlers.add(new Guarded.Handler(c.id(), kinds, body, t.equals(endId)));
                } finally {
                    watches.pop();
                }
            }
            if (mergeId != null) {
                visited.add(mergeId);
            }
            items.add(new Guarded(s, normal, List.copyOf(handlers), mergeId, j));
            return j == null ? next(id) : mergeId != null ? next(mergeId) : j;
        }

        String ifBlock(FlowNode n, List<Block> items, List<Frame> chain) {
            String id = n.id();
            splitKinds.put(id, NodeKind.IF);
            String legacy = mergeOf.get(id);
            Join jn = legacy != null ? new Join(legacy, Set.of()) : join(id);
            List<FlowEdge> ordered = ordered(NodeKind.IF, out.get(id));
            List<Branch> branches = new ArrayList<>();
            for (int b = 0; b < ordered.size(); b++) {
                FlowEdge e = ordered.get(b);
                boolean ends = jn.ending().contains(e.id());
                Seq body = seq(e.to(), ends ? endId : jn.joinId(), FlowTree.extend(chain, id, b));
                branches.add(new Branch(e.id(), e.cond(), e.otherwise(), e.label(), body, ends));
            }
            if (legacy != null) {
                visited.add(legacy);
                items.add(new Split(id, NodeKind.IF, legacy, legacy, List.copyOf(branches)));
                return next(legacy);
            }
            items.add(new Split(id, NodeKind.IF, null, jn.joinId(), List.copyOf(branches)));
            return jn.joinId();
        }

        String parallelBlock(FlowNode n, List<Block> items, List<Frame> chain) {
            String id = n.id();
            splitKinds.put(id, NodeKind.PARALLEL);
            String mergeId = mergeOf.get(id);
            List<FlowEdge> ordered = ordered(NodeKind.PARALLEL, out.get(id));
            List<Branch> branches = new ArrayList<>();
            for (int b = 0; b < ordered.size(); b++) {
                FlowEdge e = ordered.get(b);
                branches.add(new Branch(e.id(), e.cond(), e.otherwise(), e.label(), seq(e.to(), mergeId, FlowTree.extend(chain, id, b)), false));
            }
            visited.add(mergeId);
            items.add(new Split(id, NodeKind.PARALLEL, mergeId, mergeId, List.copyOf(branches)));
            return next(mergeId);
        }

        /** 블록 단위 다음 노드(§2.1 after). END 면 null. */
        String after(String x) {
            FlowNode n = nodes.get(x);
            return switch (n.kind()) {
                case END -> null;
                case IF -> mergeOf.containsKey(x) ? mergeOf.get(x) : join(x).joinId();
                case PARALLEL -> mergeOf.get(x);
                default -> next(x);
            };
        }

        /** 줄기 — from 에서 after 를 따라간다. stop 이나 END 에 닿으면 그 노드까지 넣고 멈춘다. 같은 노드를 두 번 만나면 S6. */
        List<String> spine(String from, String stop) {
            List<String> out = new ArrayList<>();
            Set<String> seen = new HashSet<>();
            String cur = from;
            while (cur != null) {
                if (!seen.add(cur)) {
                    throw new Stop(structure(cur, null, twice(cur)));
                }
                out.add(cur);
                if (cur.equals(stop) || cur.equals(endId)) {
                    break;
                }
                cur = after(cur);
            }
            return out;
        }

        /** 새 형식 IF 의 모이는 자리와 끝내는 갈래(§2.2 2~6). 계산 중에 다시 필요하면 S6. */
        Join join(String s) {
            Join have = joins.get(s);
            if (have != null) {
                return have;
            }
            if (!joining.add(s)) {
                throw new Stop(structure(s, null, twice(s)));
            }
            List<FlowEdge> br = ordered(NodeKind.IF, out.get(s));
            List<List<String>> spines = new ArrayList<>();
            List<Set<String>> ns = new ArrayList<>();
            for (FlowEdge e : br) {
                List<String> sp = spine(e.to(), null);
                spines.add(sp);
                Set<String> n = new HashSet<>(sp);
                n.remove(endId);
                ns.add(n);
            }
            Set<String> ending = new LinkedHashSet<>();
            List<Integer> cont = new ArrayList<>();
            for (int i = 0; i < br.size(); i++) {
                boolean alone = true;
                for (int k = 0; k < br.size() && alone; k++) {
                    if (k != i && !Collections.disjoint(ns.get(i), ns.get(k))) {
                        alone = false;
                    }
                }
                if (alone) {
                    ending.add(br.get(i).id());
                } else {
                    cont.add(i);
                }
            }
            String joinId = endId;
            if (!cont.isEmpty()) {
                int first = cont.get(0);
                for (String x : spines.get(first)) {
                    if (x.equals(endId)) {
                        break;
                    }
                    boolean all = true;
                    for (int k : cont) {
                        if (k != first && !ns.get(k).contains(x)) {
                            all = false;
                            break;
                        }
                    }
                    if (all) {
                        joinId = x;
                        break;
                    }
                }
                if (joinId.equals(endId)) {
                    ending.clear(); // §2.2 4 예외 — 갈래를 만들 때 S6·S5 로 거부된다
                }
            } else {
                int pick = -1;
                for (int i = br.size() - 1; i >= 0; i--) {
                    if (!br.get(i).to().equals(endId)) {
                        pick = i;
                        break;
                    }
                }
                if (pick < 0) {
                    ending.clear(); // 모든 갈래가 END 로 바로 감 — 1단계 f4 가 막으므로 여기 오지 않는다
                } else {
                    joinId = br.get(pick).to();
                    ending.remove(br.get(pick).id());
                }
            }
            joining.remove(s);
            Join j = new Join(joinId, Set.copyOf(ending));
            joins.put(s, j);
            return j;
        }

        String next(String nodeId) {
            return out.get(nodeId).get(0).to();
        }

        /** IF: 그 외가 아닌 선 order 오름차순 뒤 그 외. PARALLEL: order 오름차순. */
        static List<FlowEdge> ordered(NodeKind kind, List<FlowEdge> edges) {
            List<FlowEdge> main = new ArrayList<>(edges.stream().filter(e -> !e.otherwise()).toList());
            main.sort(Comparator.comparingInt(FlowEdge::order));
            if (kind == NodeKind.IF) {
                edges.stream().filter(FlowEdge::otherwise).forEach(main::add);
            }
            return main;
        }
    }

    // ------------------------------------------------------------------ 도우미

    private static String twice(String id) {
        return id + "를 두 번 지난다. 순환이 있거나 갈래가 모이는 자리 밖에서 만난다";
    }

    /** 개수 규칙: 0 = 없어야, 2 = 2개 이상, 3 = 1개 이상. */
    private static int inRule(NodeKind k) {
        return switch (k) {
            case START, CATCH -> 0;
            case MERGE -> 2;
            default -> 3;
        };
    }

    private static int outRule(NodeKind k) {
        return switch (k) {
            case END -> 0;
            case IF, PARALLEL -> 2;
            default -> 1;
        };
    }

    private static void degree(List<FlowIssue> issues, String id, String dir, int n, int rule) {
        boolean ok = rule == 2 ? n >= 2 : rule == 3 ? n >= 1 : n == rule;
        if (!ok) {
            String text = rule == 0 ? "없어야 한다" : rule == 1 ? "1개여야 한다" : rule == 2 ? "2개 이상이어야 한다" : "1개 이상이어야 한다";
            issues.add(structure(id, null, id + "의 " + dir + " 선이 " + n + "개다. " + text));
        }
    }

    private static FlowIssue structure(String nodeId, String edgeId, String message) {
        return new FlowIssue(STRUCTURE, nodeId, edgeId, message);
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
```
(Javadoc `FlowTree.ruleSteps` 의 "받는 룰" 은 "받는 노드가 붙은 룰" 로 둬도 되고 그대로 둬도 된다 — 동작은 그대로다.)

- [ ] **Step 5: 엔진 실행·입력 키 — 컴파일 맞춤**

`FlowRun.java`:
- `import kr.dongkuk.maru.mdm.engine.flow.Step;` 는 필요 없다. `guarded()` 첫 줄 `RuleStep r = g.rule();` 를 `RuleStep r = (RuleStep) g.step(); // SEAM(T2): TASK 블록·돌아오는 자리(joinId)·IF 끝냄은 Task 2 가 실행한다` 로 바꾼다.
- `ifSplit()` 끝 `merge(s, null, ctx, made);` 를 `if (s.mergeId() != null) { merge(s, null, ctx, made); }` 로 바꾼다(새 형식 IF 는 합류 기록이 없다 — Task 2 가 끝냄을 더한다).

`FlowKeys.java`:
- import 에 `kr.dongkuk.maru.mdm.engine.flow.Step` 을 더한다.
- `case Guarded g ->` 안의 `ruleKeys(g.rule(), …)` 를 `if (g.step() instanceof RuleStep r) { ruleKeys(r, g.handlerFor(CatchKind.INPUT_ERROR) != null, available, sure, maybe, reported, out); }` 로 바꾼다.
- `produced(RuleStep r)` 를 아래로 바꾸고 `guardSure`·`guardAll` 의 `produced(g.rule())` 를 `produced(g.step())` 로 바꾼다:
```java
    /** 단계 결과 이름 — 빈 단계·정의 없는 룰은 빈 집합. */
    private Set<String> produced(Step s) {
        if (!(s instanceof RuleStep r)) {
            return new HashSet<>();
        }
        RuleDefinition def = defs.get(r.ruleId());
        return def == null ? new HashSet<>() : new HashSet<>(RuleEvaluator.resultNames(def));
    }
```

- [ ] **Step 6: mdm/lib 분석기 — TASK 블록(Java)**

`RuleSetAnalyzer.java` `PathWalk.guarded` 의 `rule(g.rule(), st);` 를 `if (g.step() instanceof RuleStep r) { rule(r, st); }` 로 바꾸고 `never(Guarded g)` 를 아래로 바꾼다(문구 표 CATCH_NEVER(TASK)):
```java
        /** CATCH_NEVER(R12, implicit-join spec §6) — 처리 갈래 순서. 빈 단계는 받는 노드마다 한 줄, 룰은 받는 종류 저장 순서·룰이 있고 RELEASED 가 있을 때만. */
        void never(Guarded g) {
            if (!(g.step() instanceof RuleStep step)) {
                for (Guarded.Handler h : g.handlers()) {
                    out.add(new RuleSetCheck(RuleSetCheck.CATCH_NEVER, RuleSetCheck.WARN, null, null, null,
                            g.nodeId() + "는 빈 단계라 " + h.catchNodeId() + "가 받는 예외가 일어나지 않는다", h.catchNodeId(), null));
                }
                return;
            }
            String id = step.ruleId();
            RuleIo r = rules.get(id);
            if (r == null || !r.exists() || r.releasedVer() == null) {
                return;
            }
            for (Guarded.Handler h : g.handlers()) {
                for (CatchKind k : h.kinds()) {
                    if (k == CatchKind.NO_RESULT && r.hasDefault()) {
                        out.add(new RuleSetCheck(RuleSetCheck.CATCH_NEVER, RuleSetCheck.WARN, id, null, null,
                                id + "에 기본 행이 있어 " + h.catchNodeId() + "가 받는 결과 없음이 일어나지 않는다", h.catchNodeId(), null));
                    } else if (k == CatchKind.HIT_CONFLICT && !"UNIQUE".equals(r.hitPolicy()) && !"ANY".equals(r.hitPolicy())) {
                        out.add(new RuleSetCheck(RuleSetCheck.CATCH_NEVER, RuleSetCheck.WARN, id, null, null,
                                id + "의 적중 정책 " + (r.hitPolicy() == null ? "-" : r.hitPolicy()) + "에서는 " + h.catchNodeId()
                                        + "가 받는 판정 충돌이 일어나지 않는다", h.catchNodeId(), null));
                    }
                }
            }
        }
```
`RuleSetPathState.java` `Walk.guarded` 의 두 줄을 바꾼다:
```java
            if (g.step() instanceof RuleStep r) {
                out.putIfAbsent(r.nodeId(), new At(Set.copyOf(st.defined()), Set.copyOf(st.maybe())));
            }
            At normal = new At(new HashSet<>(st.defined()), new HashSet<>(st.maybe()));
            Set<String> made = g.step() instanceof RuleStep r ? produces.apply(r.ruleId()) : null;
```
(`Set<String> made = produces.apply(g.rule().ruleId());` 줄 자리. `if (made != null)` 은 그대로다.)

- [ ] **Step 7: 엔진 시험 통과 확인**

Run: `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)`
Expected: 모두 PASS. 실패가 `RuleSetFlowEvaluationTest`·`RuleSetTraceTest`·`RuleSetCatchTest`·골든에서 나면 옛 형식 흐름의 결과가 바뀐 것이므로 구현을 고친다(Global Constraints). `RuleSetCatchTest` 의 끝냄 시험(`h → end`)은 정상 다음 노드가 `after` 라 처리 갈래가 END 로 가는 끝냄 그대로다.

- [ ] **Step 8: TS 블록 타입·해석 — `flow-model.ts`**

머리 주석 끝에 한 문단을 더한다:
```ts
 * implicit-join spec(D-136): IF 와 처리 갈래는 합류 없이 모이는 자리·돌아오는 자리로 바로 가고, 해석이 그 자리를 줄기(spine)로 계산한다
 * (`makeJoins` — 엔진 `FlowParser.Builder` 의 after·spine·join 짝). 옛 형식(IF·받는 노드가 붙은 노드를 가리키는 MERGE)도 그대로 받는다.
 * 편집기용 관대한 도우미(`joinOf`·`endingBranches`·`handlerTarget`·`returnOf`)는 같은 계산을 쓰되 오류면 null 을 돌려준다.
```
타입을 바꾼다(기존 `Branch`·`Split`·`Guarded`·`Block` 정의 자리):
```ts
/** 한 칸짜리 단계 — 엔진 `flow.Step`(RULE·TASK, 하위 세트 호출 스펙이 SET 을 더한다). */
export type Step = RuleStep | TaskStep;

/** 갈래 하나. ends = 끝내는 IF 갈래(본문은 END 앞까지, implicit-join spec §2.2). 이어지는 갈래·병렬 갈래·옛 IF 갈래는 false. */
export interface Branch {
  edgeId: string;
  cond: string | null;
  otherwise: boolean;
  label: string | null;
  body: Seq;
  ends: boolean;
}

/** branches 는 실행 순서. mergeId 는 PARALLEL·옛 IF 의 짝 MERGE(새 IF 는 null), joinId 는 이어지는 갈래가 모이는 노드. */
export interface Split {
  type: "SPLIT";
  nodeId: string;
  kind: "IF" | "PARALLEL";
  mergeId: string | null;
  joinId: string;
  branches: Branch[];
}
```
`Guarded` 를 바꾼다:
```ts
/**
 * 받는 노드가 붙은 단계(받는 노드 spec §3, implicit-join spec §2.3) — 엔진 `flow.Guarded` 짝. joinId = 돌아오는 자리(돌아오는 처리 갈래가 없으면 null),
 * mergeId 는 옛 돌아오는 MERGE 일 때만 joinId 와 같다. 맨 위에 nodeId 를 두지 않는다 — 블록을 걷는 코드가 GUARDED 를 빼먹으면 tsc 가 막는다.
 */
export interface Guarded {
  type: "GUARDED";
  step: Step;
  normal: Seq;
  handlers: Handler[];
  mergeId: string | null;
  joinId: string | null;
}

export type Block = Seq | Step | Split | Guarded;
```
`CATCHABLE` 를 `new Set<FlowNodeKind>(["RULE", "TASK"])` 로, 주석을 "받는 노드를 붙일 수 있는 노드 종류(엔진 `FlowParser.catchable` — RULE·TASK)" 로 바꾼다.

차수표를 바꾼다(`AT_LEAST_ONE` 을 표보다 위로 옮긴다):
```ts
const AT_LEAST_ONE: Degree = { min: 1, max: Number.POSITIVE_INFINITY };
const IN_DEGREE: Record<FlowNodeKind, Degree> = {
  START: NONE, END: AT_LEAST_ONE, RULE: AT_LEAST_ONE, TASK: AT_LEAST_ONE, IF: AT_LEAST_ONE, PARALLEL: AT_LEAST_ONE, MERGE: MANY, CATCH: NONE,
};
```
`parseFlow` 안:
- `const hasCatch = …` 줄을 지운다. d1 의 `const di = n.kind === "END" && hasCatch ? AT_LEAST_ONE : IN_DEGREE[n.kind];` 를 `const di = IN_DEGREE[n.kind];` 로.
- f2 줄 `if (merges !== 1) issues.push(…분기 … 닫는 합류가 …)` 를 바꾼다:
```ts
    if (n.kind === "PARALLEL" && merges !== 1) issues.push(issue("FLOW_STRUCTURE", n.id, null, `분기 ${n.id}를 닫는 합류가 ${merges}개다. 정확히 1개여야 한다`));
    if (n.kind === "IF" && merges > 1) issues.push(issue("FLOW_STRUCTURE", n.id, null, `IF ${n.id}를 닫는 합류가 ${merges}개다. IF 는 합류를 두지 않는다`));
```
- g5(순서 겹침) 반복 뒤, 분기 노드 반복 안 끝에 f4 를 더한다:
```ts
    if (n.kind === "IF" && merges === 0) {
      const first = new Map<string, string>();
      for (const e of out) {
        const prev = first.get(e.to);
        if (prev === undefined) first.set(e.to, e.id);
        else issues.push(issue("FLOW_STRUCTURE", n.id, e.id, `IF ${n.id}의 갈래 ${e.id}가 갈래 ${prev}와 같은 노드 ${e.to}로 간다. 같은 노드로 가는 갈래는 하나만 둔다`));
      }
    }
```
- h1·h2 문구를 문구 표대로 바꾼다(`붙은 노드`, `룰·빈 단계 노드에만 붙일 수 있다`).

`build` 함수 전체를 아래 두 함수로 바꾼다(`sortBranches` 는 그대로 둔다):
```ts
/** IF 하나의 모이는 자리와 끝내는 갈래 선 ID(§2.2) — 엔진 `FlowParser.Join` 짝. */
interface JoinInfo {
  joinId: string;
  ending: ReadonlySet<string>;
}

const twiceIssue = (id: string) => issue("FLOW_STRUCTURE", id, null, `${id}를 두 번 지난다. 순환이 있거나 갈래가 모이는 자리 밖에서 만난다`);

/**
 * 줄기·모이는 자리 계산(§2.1·§2.2) — 엔진 `FlowParser.Builder` 의 after·spine·join 짝. 해석(build)과 관대한 도우미가 함께 쓴다.
 * 순환·모이는 자리 재진입은 ParseStop(S6)으로 던진다. 1단계가 막는 모양(나가는 선 없음·짝 없는 병렬)은 Error 로 던진다(관대한 도우미만 만난다).
 */
function makeJoins(byId: ReadonlyMap<string, FlowNode>, outOf: (id: string) => FlowEdge[], mergeOf: ReadonlyMap<string, string>, endId: string) {
  const memo = new Map<string, JoinInfo>();
  const joining = new Set<string>();
  const next = (id: string): string => {
    const o = outOf(id);
    if (o.length === 0) throw new Error(`${id}에서 나가는 선이 없다`);
    return o[0].to;
  };
  const after = (x: string): string | null => {
    const n = byId.get(x);
    if (!n) throw new Error(`없는 노드 ${x}`);
    if (n.kind === "END") return null;
    if (n.kind === "IF") return mergeOf.get(x) ?? join(x).joinId;
    if (n.kind === "PARALLEL") {
      const m = mergeOf.get(x);
      if (m === undefined) throw new Error(`병렬 ${x}의 합류가 없다`);
      return m;
    }
    return next(x);
  };
  const spine = (from: string, stop: string | null): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    let cur: string | null = from;
    while (cur !== null) {
      if (seen.has(cur)) throw new ParseStop(twiceIssue(cur));
      seen.add(cur);
      out.push(cur);
      if (cur === stop || cur === endId) break;
      cur = after(cur);
    }
    return out;
  };
  function join(s: string): JoinInfo {
    const have = memo.get(s);
    if (have) return have;
    if (joining.has(s)) throw new ParseStop(twiceIssue(s));
    joining.add(s);
    const br = sortBranches("IF", outOf(s));
    const spines = br.map((e) => spine(e.to, null));
    const ns = spines.map((sp) => new Set(sp.filter((x) => x !== endId)));
    const ending = new Set<string>();
    const cont: number[] = [];
    br.forEach((e, i) => {
      const alone = ns.every((other, k) => k === i || ![...ns[i]].some((x) => other.has(x)));
      if (alone) ending.add(e.id);
      else cont.push(i);
    });
    let joinId = endId;
    if (cont.length > 0) {
      const first = cont[0];
      for (const x of spines[first]) {
        if (x === endId) break;
        if (cont.every((k) => k === first || ns[k].has(x))) {
          joinId = x;
          break;
        }
      }
      if (joinId === endId) ending.clear(); // §2.2 4 예외 — 갈래를 만들 때 S6·S5 로 거부된다
    } else {
      let pick = -1;
      for (let i = br.length - 1; i >= 0; i--) {
        if (br[i].to !== endId) {
          pick = i;
          break;
        }
      }
      if (pick < 0) ending.clear(); // 모든 갈래가 END 로 바로 감 — 1단계 f4 가 막으므로 해석에서는 오지 않는다
      else {
        joinId = br[pick].to;
        ending.delete(br[pick].id);
      }
    }
    joining.delete(s);
    const info: JoinInfo = { joinId, ending };
    memo.set(s, info);
    return info;
  }
  return { next, spine, join };
}

/** 2단계 — 블록 트리를 만든다(엔진 `FlowParser.Builder`). 첫 오류에서 ParseStop 을 던진다. */
function build(
  unique: readonly FlowNode[],
  byId: ReadonlyMap<string, FlowNode>,
  outOf: (id: string) => FlowEdge[],
  catchMap: ReadonlyMap<string, readonly FlowNode[]>,
): FlowTree {
  const visited = new Set<string>();
  const mergeOf = new Map<string, string>();
  for (const m of unique) if (m.kind === "MERGE" && m.splitId != null) mergeOf.set(m.splitId, m.id);
  const endId = unique.find((n) => n.kind === "END")!.id;
  const { next, spine, join } = makeJoins(byId, outOf, mergeOf, endId);
  /** 지켜보는 정상 줄기 묶음(§2.4 1) — 배열 끝이 가장 안쪽. */
  const watches: { guardId: string; catchId: string; normal: ReadonlySet<string> }[] = [];

  const seq = (from: string, stop: string, notClosed = `갈래가 ${stop}에서 닫히지 않고 `): Seq => {
    const items: Block[] = [];
    let cur = from;
    while (cur !== stop) cur = step(cur, stop, items, notClosed);
    return { type: "SEQ", items };
  };

  /** 노드 하나를 블록으로 만들어 items 에 넣고 다음 노드 ID 를 돌려준다(§2.4 — 침범 → 방문 → 종류). stop 은 둘러싼 끝. */
  const step = (cur: string, stop: string, items: Block[], notClosed: string): string => {
    for (let i = watches.length - 1; i >= 0; i--) {
      const w = watches[i];
      if (w.normal.has(cur)) {
        throw new ParseStop(
          issue("FLOW_STRUCTURE", cur, null, `처리 갈래 ${w.catchId}가 ${w.guardId}의 정상 갈래 노드 ${cur}로 들어간다. 처리 갈래는 한 노드로 돌아오거나 끝 노드로 가야 한다`),
        );
      }
    }
    if (visited.has(cur)) throw new ParseStop(twiceIssue(cur));
    const node = byId.get(cur)!;
    if (node.kind === "START" || node.kind === "END" || node.kind === "MERGE") {
      throw new ParseStop(issue("FLOW_STRUCTURE", cur, null, `${notClosed}${cur}로 나간다`));
    }
    visited.add(cur);
    if (node.kind === "RULE" || node.kind === "TASK") {
      const s: Step = node.kind === "RULE" ? { type: "RULE", nodeId: cur, ruleId: node.ruleId as string } : { type: "TASK", nodeId: cur };
      const cs = catchMap.get(cur) ?? [];
      if (cs.length === 0) {
        items.push(s);
        return next(cur);
      }
      return guarded(s, cs, stop, items);
    }
    if (node.kind === "IF") return ifBlock(cur, items);
    return parallelBlock(cur, items);
  };

  const ifBlock = (id: string, items: Block[]): string => {
    const legacy = mergeOf.get(id);
    const info: JoinInfo = legacy !== undefined ? { joinId: legacy, ending: new Set() } : join(id);
    const branches: Branch[] = sortBranches("IF", outOf(id)).map((e) => {
      const ends = info.ending.has(e.id);
      return { edgeId: e.id, cond: orNull(e.cond), otherwise: e.otherwise === true, label: orNull(e.label), body: seq(e.to, ends ? endId : info.joinId), ends };
    });
    if (legacy !== undefined) {
      visited.add(legacy);
      items.push({ type: "SPLIT", nodeId: id, kind: "IF", mergeId: legacy, joinId: legacy, branches });
      return next(legacy);
    }
    items.push({ type: "SPLIT", nodeId: id, kind: "IF", mergeId: null, joinId: info.joinId, branches });
    return info.joinId;
  };

  const parallelBlock = (id: string, items: Block[]): string => {
    const mergeId = mergeOf.get(id)!;
    const branches: Branch[] = sortBranches("PARALLEL", outOf(id)).map((e) => ({
      edgeId: e.id, cond: orNull(e.cond), otherwise: e.otherwise === true, label: orNull(e.label), body: seq(e.to, mergeId), ends: false,
    }));
    visited.add(mergeId);
    items.push({ type: "SPLIT", nodeId: id, kind: "PARALLEL", mergeId, joinId: mergeId, branches });
    return next(mergeId);
  };

  /** 받는 노드 블록(§2.3) — 정상 줄기 → 처리 줄기들 → 도착 비교(S7) → 정상 갈래 → 처리 갈래. */
  const guarded = (s: Step, cs: readonly FlowNode[], stop: string, items: Block[]): string => {
    const id = s.nodeId;
    const normalSpine = spine(next(id), stop);
    const inS = new Set(normalSpine);
    const targets = cs.map((c) => {
      for (const x of spine(next(c.id), null)) if (inS.has(x) || x === endId) return x;
      return endId;
    });
    let j: string | null = null;
    let jCatch = "";
    for (let k = 0; k < cs.length; k++) {
      const t = targets[k];
      if (t === endId) continue;
      if (j === null) {
        j = t;
        jCatch = cs[k].id;
      } else if (t !== j) {
        throw new ParseStop(issue("FLOW_STRUCTURE", cs[k].id, null, `${id}의 처리 갈래 ${cs[k].id}가 ${t}로 돌아온다. 앞 처리 갈래 ${jCatch}처럼 ${j}로 돌아와야 한다`));
      }
    }
    const back: string | null = j;
    const mergeId = back !== null && mergeOf.get(id) === back ? back : null;
    const normal: Seq = back === null ? { type: "SEQ", items: [] } : seq(next(id), back);
    const watched = new Set(normalSpine.filter((x) => x !== endId));
    const handlers: Handler[] = cs.map((c, k) => {
      visited.add(c.id);
      const t = targets[k];
      const notClosed = `처리 갈래 ${c.id}가 ${t === endId ? "끝" : t === mergeId ? `합류 ${t}나 끝` : `돌아올 자리 ${t}나 끝`}에 닿지 않고 `;
      watches.push({ guardId: id, catchId: c.id, normal: watched });
      try {
        return { catchNodeId: c.id, kinds: (c.catches ?? []).filter(isCatchKind), body: seq(next(c.id), t, notClosed), ends: t === endId };
      } finally {
        watches.pop();
      }
    });
    if (mergeId !== null) visited.add(mergeId);
    items.push({ type: "GUARDED", step: s, normal, handlers, mergeId, joinId: back });
    return back === null ? next(id) : mergeId !== null ? next(mergeId) : back;
  };

  const start = unique.find((n) => n.kind === "START")!;
  visited.add(start.id);
  const root = seq(next(start.id), endId);
  visited.add(endId);
  for (const n of unique) {
    if (!visited.has(n.id)) throw new ParseStop(issue("FLOW_STRUCTURE", n.id, null, `${n.id}에 도달할 수 없다`));
  }
  return new FlowTree(root, start.id, endId);
}
```
`FlowTree` 생성자 걷기의 GUARDED 가지를 바꾼다:
```ts
        } else if (b.type === "GUARDED") {
          this.positions.set(b.step.nodeId, { chain, order: counter++ });
          if (b.step.type === "RULE") this.steps.push(b.step);
          walk(b.normal, [...chain, { split: b.step.nodeId, kind: "GUARD", branch: 0 }]);
          b.handlers.forEach((h, i) => walk(h.body, [...chain, { split: b.step.nodeId, kind: "GUARD", branch: i + 1 }]));
```
파일 끝(`flowRuleIds` 뒤)에 관대한 도우미를 더한다:
```ts
// ───────────────────────── 편집기용 관대한 도우미(implicit-join spec §8.1) ─────────────────────────

interface Lenient {
  byId: Map<string, FlowNode>;
  outOf: (id: string) => FlowEdge[];
  mergeOf: Map<string, string>;
  endId: string | null;
}

/** 구조 오류가 있어도 쓰는 그래프 — 겹친 ID 는 첫 노드, 없는 노드를 가리키는 선은 뺀다, MERGE 짝은 처음 나온 것. */
function lenient(flow: RuleSetFlow): Lenient {
  const byId = new Map<string, FlowNode>();
  for (const n of flow.nodes ?? []) if (!byId.has(n.id)) byId.set(n.id, n);
  const outs = new Map<string, FlowEdge[]>();
  for (const e of flow.edges ?? []) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    if (!outs.has(e.from)) outs.set(e.from, []);
    outs.get(e.from)!.push(e);
  }
  const mergeOf = new Map<string, string>();
  for (const n of byId.values()) if (n.kind === "MERGE" && n.splitId != null && !mergeOf.has(n.splitId)) mergeOf.set(n.splitId, n.id);
  const end = [...byId.values()].find((n) => n.kind === "END");
  return { byId, outOf: (id) => outs.get(id) ?? [], mergeOf, endId: end ? end.id : null };
}

/** 분기의 모이는 자리 — IF 는 옛 짝 MERGE 또는 §2.2 의 모이는 자리, PARALLEL 은 짝 MERGE. 분기 아님·순환 등으로 못 정하면 null. */
export function joinOf(flow: RuleSetFlow, splitId: string): string | null {
  const L = lenient(flow);
  const s = L.byId.get(splitId);
  if (!s || L.endId === null) return null;
  if (s.kind === "PARALLEL") return L.mergeOf.get(splitId) ?? null;
  if (s.kind !== "IF") return null;
  const legacy = L.mergeOf.get(splitId);
  if (legacy !== undefined) return legacy;
  try {
    return makeJoins(L.byId, L.outOf, L.mergeOf, L.endId).join(splitId).joinId;
  } catch {
    return null;
  }
}

/** §2.2 의 끝내는 갈래 선 ID(실행 순서). 옛 IF·병렬은 빈 목록, 분기 아님·못 정하면 null. */
export function endingBranches(flow: RuleSetFlow, splitId: string): string[] | null {
  const L = lenient(flow);
  const s = L.byId.get(splitId);
  if (!s || L.endId === null || (s.kind !== "IF" && s.kind !== "PARALLEL")) return null;
  if (s.kind === "PARALLEL" || L.mergeOf.has(splitId)) return [];
  try {
    const info = makeJoins(L.byId, L.outOf, L.mergeOf, L.endId).join(splitId);
    return sortBranches("IF", L.outOf(splitId)).filter((e) => info.ending.has(e.id)).map((e) => e.id);
  } catch {
    return null;
  }
}

/** 처리 갈래 도착(§2.3 2 — 정상 줄기는 둘러싼 끝을 모르므로 END 까지 본다). END ID 면 끝내는 처리 갈래. 못 정하면 null. */
export function handlerTarget(flow: RuleSetFlow, catchId: string): string | null {
  const L = lenient(flow);
  const c = L.byId.get(catchId);
  if (!c || c.kind !== "CATCH" || L.endId === null || isBlankJava(c.attachTo)) return null;
  const host = L.byId.get(c.attachTo as string);
  if (!host || !CATCHABLE.has(host.kind)) return null;
  try {
    const J = makeJoins(L.byId, L.outOf, L.mergeOf, L.endId);
    const S = new Set(J.spine(J.next(host.id), null));
    for (const x of J.spine(J.next(catchId), null)) if (S.has(x) || x === L.endId) return x;
    return null;
  } catch {
    return null;
  }
}

/** 노드의 돌아오는 자리 J — 노드 배열 순서로 첫 돌아오는 처리 갈래의 도착. 없으면 null. */
export function returnOf(flow: RuleSetFlow, nodeId: string): string | null {
  const L = lenient(flow);
  if (L.endId === null) return null;
  for (const c of catchesOf(flow, nodeId)) {
    const t = handlerTarget(flow, c.id);
    if (t !== null && t !== L.endId) return t;
  }
  return null;
}
```

- [ ] **Step 9: TS 블록을 걷는 곳 — 이름 맞춤**

`set-model.ts`:
- import 에 `type Step` 를 더하지 않아도 된다. `guarded` 의 `rule(g.rule, s);` 를 `if (g.step.type === "RULE") rule(g.step, s);` 로.
- `never` 를 바꾼다:
```ts
  /** CATCH_NEVER(R12, implicit-join spec §6) — 빈 단계는 받는 노드마다 한 줄, 룰은 처리 갈래 순서·받는 종류 저장 순서(룰이 있고 RELEASED 가 있을 때만). */
  const never = (g: Guarded) => {
    if (g.step.type === "TASK") {
      for (const h of g.handlers) out.push(check("CATCH_NEVER", "WARN", null, null, null, `${g.step.nodeId}는 빈 단계라 ${h.catchNodeId}가 받는 예외가 일어나지 않는다`, h.catchNodeId));
      return;
    }
    const id = g.step.ruleId;
    const r = ruleOf(rules, id);
    if (!r || !r.exists || r.releasedVer == null) return;
    for (const h of g.handlers) {
      for (const k of h.kinds) {
        if (k === "NO_RESULT" && r.hasDefault === true) {
          out.push(check("CATCH_NEVER", "WARN", id, null, null, `${id}에 기본 행이 있어 ${h.catchNodeId}가 받는 결과 없음이 일어나지 않는다`, h.catchNodeId));
        } else if (k === "HIT_CONFLICT" && r.hitPolicy !== "UNIQUE" && r.hitPolicy !== "ANY") {
          out.push(
            check("CATCH_NEVER", "WARN", id, null, null, `${id}의 적중 정책 ${r.hitPolicy ?? "-"}에서는 ${h.catchNodeId}가 받는 판정 충돌이 일어나지 않는다`, h.catchNodeId),
          );
        }
      }
    }
  };
```
- `walk` 의 `else if (b.type === "TASK") continue;` 는 그대로(Step 의 TASK 칸).

`flow-layout.ts`(동작은 Task 5 — 여기서는 이름만):
- `bodyIds` SPLIT 가지: `out.push(b.nodeId, b.mergeId);` → `out.push(b.nodeId); if (b.mergeId) out.push(b.mergeId);`. GUARDED 가지: `out.push(b.rule.nodeId);` → `out.push(b.step.nodeId);`
- `placeSplit`: `g.edge(b.nodeId, b.mergeId)` → `g.edge(b.nodeId, b.joinId)`, `g.node(b.mergeId)` → `g.node(b.joinId)`.
- `placeGuarded`: `b.rule.nodeId` 두 곳 → `b.step.nodeId`.
- `firstNode`: `b.rule.nodeId` → `b.step.nodeId`. `lastExit`: `return b.mergeId;` → `return b.mergeId ?? b.joinId;`, `return b.mergeId ?? b.rule.nodeId;` → `return b.mergeId ?? b.step.nodeId;`

`trace-view.ts` `scopePaths`(동작은 Task 7):
- GUARDED 가지 `paths.set(b.rule.nodeId, path); guardRules.add(b.rule.nodeId);` → `b.step.nodeId`, `guardMerges.set(b.mergeId, b.rule.nodeId)` → `b.step.nodeId`.
- SPLIT 가지 `paths.set(b.mergeId, path);` → `if (b.mergeId) paths.set(b.mergeId, path);`

Run: `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint`
Expected: 오류 0(남은 오류가 시험 파일의 `rule`·`mergeId` 기대뿐이면 Step 10 에서 고친다).

- [ ] **Step 10: TS 해석 시험 — `flow-model.test.ts`**

바뀌는 기존 시험:
- `IF 흐름은 갈래 두 개짜리 Split 하나이고…`: Split 기대에 `joinId: "m1",` 을 `mergeId` 뒤에, 두 갈래 기대에 `ends: false` 를 더한다.
- `f1·f2 합류의 짝 분기가 없으면 그 분기를 닫는 합류도 0개다`: 이름을 `f1 합류의 짝 분기가 없으면 보고하고, IF 는 합류 0개가 맞다` 로, 기대에서 `분기 if1를 닫는 합류가 0개다…` 줄을 뺀다.
- `받는 룰은 GUARDED 블록이고…`: `rule:` 기대를 `step:` 으로, `joinId: "mr"` 을 더한다.
- `받는 노드 오류는 FLOW_CATCH 로 모두 모은다(Java 와 같은 순서·문구)`: Java Step 2 와 같이 `붙은 노드 zz` 로 바꾸고 `t1는 TASK` 줄을 뺀다.
- `받는 노드가 있으면 END 는 들어오는 선이 여럿이어도 된다`: 이름을 `END 는 들어오는 선이 여럿이어도 되고 룰은 들어오는 선이 없으면 거부한다` 로 바꾸고 Java 의 `orphan` 사례(`r2의 들어오는 선이 0개다. 1개 이상이어야 한다`)를 더한다.
- `돌아오는 합류는 하나까지, 처리 갈래가 다른 합류로 가거나…`: "다른 합류로 가는" 사례의 기대를 `issues: []` 와 GUARDED `joinId: "m9"`·`mergeId: null` 로, `두 번 지난다` 문구가 있으면 끝 구절을 `모이는 자리 밖에서` 로 바꾼다.
- `갈래가 짝 합류가 아닌 다른 합류로 나간다`(2단계 describe): `두 번 지난다` 문구 끝 구절을 바꾼다.

새 describe 를 파일 끝에 더한다(Java Step 2 와 같은 흐름 — 결과 글자가 같아야 한다):
```ts
describe("모이는 자리·돌아오는 자리(implicit-join spec §2) — Java FlowParserTest 짝", () => {
  const R = (id: string, ruleId: string) => node(id, "RULE", { ruleId });
  const br = (id: string, from: string, to: string, order: number, cond: string) => edge(id, from, to, { order, cond });
  const other = (id: string, from: string, to: string) => edge(id, from, to, { otherwise: true });
  const pe = (id: string, from: string, to: string, order: number) => edge(id, from, to, { order });
  const catchN = (id: string, attachTo: string, ...catches: string[]) => node(id, "CATCH", { attachTo, catches });
  const firstSplit = (f: RuleSetFlow) => {
    const p = parseFlow(f);
    expect(p.issues).toEqual([]);
    const s = p.tree!.root.items[0];
    if (s.type !== "SPLIT") throw new Error("SPLIT 아님");
    return s;
  };
  const msgs = (f: RuleSetFlow) => parseFlow(f).issues.map((i) => `${i.code}|${i.nodeId}|${i.edgeId}|${i.message}`);

  it("새 형식 IF 는 합류 없이 모이고 끝내는 갈래는 END 로 간다(§1 둘째 예)", () => {
    const s = firstSplit(
      flow(
        [node("start", "START"), node("if1", "IF"), R("r8", "L"), R("r2", "M"), node("end", "END")],
        [edge("e0", "start", "if1"), br("e3", "if1", "r8", 1, "PRICE = NULL"), edge("e4", "r8", "end"), other("e5", "if1", "r2"), edge("e6", "r2", "end")],
      ),
    );
    expect(s.mergeId).toBeNull();
    expect(s.joinId).toBe("r2");
    expect(s.branches.map((b) => b.ends)).toEqual([true, false]);
  });

  it("그 외가 END 로 바로 가면 조건 갈래가 이어진다(N20)", () => {
    const s = firstSplit(
      flow([node("start", "START"), node("if1", "IF"), R("a", "A"), node("end", "END")], [edge("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "end"), edge("ea", "a", "end")]),
    );
    expect(s.joinId).toBe("a");
    expect(s.branches.map((b) => b.ends)).toEqual([false, true]);
  });

  it("다른 갈래와 노드를 함께 지나면 이어지는 갈래다(N24)", () => {
    const s = firstSplit(
      flow(
        [node("start", "START"), node("if1", "IF"), R("a", "A"), R("b", "B"), R("c", "C"), R("s", "S"), node("end", "END")],
        [edge("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), br("b2", "if1", "b", 2, "X > 1"), other("bo", "if1", "c"), edge("ea", "a", "s"), edge("eb", "b", "s"), edge("ec", "c", "end"), edge("es", "s", "end")],
      ),
    );
    expect(s.joinId).toBe("s");
    expect(s.branches.map((b) => b.ends)).toEqual([false, false, true]);
  });

  it("f4·S6·S7·S8·S9 셋째·S5 문구가 Java 와 같다", () => {
    expect(msgs(flow([node("start", "START"), node("if1", "IF"), R("a", "A"), node("end", "END")], [edge("e1", "start", "if1"), br("e2", "if1", "a", 1, "X > 0"), other("e3", "if1", "a"), edge("e4", "a", "end")]))).toEqual([
      "FLOW_STRUCTURE|if1|e3|IF if1의 갈래 e3가 갈래 e2와 같은 노드 a로 간다. 같은 노드로 가는 갈래는 하나만 둔다",
    ]);
    expect(
      msgs(flow([node("start", "START"), R("r1", "A"), node("if1", "IF"), R("a", "B"), node("end", "END")], [edge("e1", "start", "r1"), edge("e2", "r1", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "end"), edge("ea", "a", "r1")])),
    ).toEqual(["FLOW_STRUCTURE|if1|null|if1를 두 번 지난다. 순환이 있거나 갈래가 모이는 자리 밖에서 만난다"]);
    expect(
      msgs(
        flow(
          [node("start", "START"), R("r1", "A"), R("x", "B"), R("y", "C"), catchN("c1", "r1", "NO_RESULT"), R("h1", "D"), catchN("c2", "r1", "EVAL_ERROR"), node("end", "END")],
          [edge("e1", "start", "r1"), edge("e2", "r1", "x"), edge("e3", "x", "y"), edge("e4", "y", "end"), edge("e5", "c1", "h1"), edge("e6", "h1", "x"), edge("e7", "c2", "y")],
        ),
      ),
    ).toEqual(["FLOW_STRUCTURE|c2|null|r1의 처리 갈래 c2가 y로 돌아온다. 앞 처리 갈래 c1처럼 x로 돌아와야 한다"]);
    expect(
      msgs(
        flow(
          [node("start", "START"), R("r1", "A"), R("n1", "B"), R("n2", "C"), catchN("c1", "r1", "NO_RESULT"), node("if1", "IF"), R("h1", "D"), R("h2", "E"), node("end", "END")],
          [edge("e1", "start", "r1"), edge("e2", "r1", "n1"), edge("e3", "n1", "n2"), edge("e4", "n2", "end"), edge("e5", "c1", "if1"), br("b1", "if1", "h1", 1, "X > 0"), other("bo", "if1", "h2"), edge("e6", "h1", "n1"), edge("e7", "h2", "n2")],
        ),
      ),
    ).toEqual(["FLOW_STRUCTURE|n1|null|처리 갈래 c1가 r1의 정상 갈래 노드 n1로 들어간다. 처리 갈래는 한 노드로 돌아오거나 끝 노드로 가야 한다"]);
    expect(
      msgs(
        flow(
          [node("start", "START"), node("if1", "IF"), R("r1", "A"), catchN("c1", "r1", "NO_RESULT"), R("h", "B"), node("p3", "PARALLEL"), R("a", "C"), node("pm3", "MERGE", { splitId: "p3" }), R("j", "D"), node("end", "END")],
          [edge("e1", "start", "if1"), br("b1", "if1", "r1", 1, "X > 0"), other("bo", "if1", "p3"), edge("e2", "r1", "j"), edge("ec", "c1", "h"), edge("eh", "h", "pm3"), pe("pa", "p3", "a", 1), pe("pb", "p3", "pm3", 2), edge("ea", "a", "pm3"), edge("ep", "pm3", "j"), edge("ej", "j", "end")],
        ),
      ),
    ).toEqual(["FLOW_STRUCTURE|pm3|null|처리 갈래 c1가 돌아올 자리 j나 끝에 닿지 않고 pm3로 나간다"]);
    expect(
      msgs(
        flow(
          [node("start", "START"), R("r1", "A"), node("p1", "PARALLEL"), R("a", "B"), R("b", "C"), node("pm", "MERGE", { splitId: "p1" }), R("x", "D"), catchN("c1", "r1", "NO_RESULT"), R("h", "E"), node("end", "END")],
          [edge("e1", "start", "r1"), edge("e2", "r1", "p1"), pe("pa", "p1", "a", 1), pe("pb", "p1", "b", 2), edge("ea", "a", "pm"), edge("eb", "b", "pm"), edge("ep", "pm", "x"), edge("ex", "x", "end"), edge("ec", "c1", "h"), edge("eh", "h", "pm")],
        ),
      ),
    ).toEqual(["FLOW_STRUCTURE|end|null|갈래가 pm에서 닫히지 않고 end로 나간다"]);
  });

  it("빈 단계에 붙은 받는 노드는 TASK step 의 GUARDED 다", () => {
    const p = parseFlow(
      flow(
        [node("start", "START"), node("t1", "TASK", { label: "빈 단계" }), catchN("c1", "t1", "NO_RESULT"), R("h", "H"), catchN("c2", "t1", "EVAL_ERROR"), R("n", "F"), node("end", "END")],
        [edge("e1", "start", "t1"), edge("e2", "t1", "n"), edge("e3", "c1", "h"), edge("e4", "h", "n"), edge("e5", "c2", "end"), edge("e6", "n", "end")],
      ),
    );
    expect(p.issues).toEqual([]);
    const g = p.tree!.root.items[0];
    expect(g.type === "GUARDED" && { step: g.step, joinId: g.joinId, ends: g.handlers.map((h) => h.ends) }).toEqual({ step: { type: "TASK", nodeId: "t1" }, joinId: "n", ends: [false, true] });
    expect(p.tree!.ruleIds()).toEqual(["H", "F"]);
  });

  it("관대한 도우미 — joinOf·endingBranches·handlerTarget·returnOf, 깨진 흐름은 null", () => {
    const f = flow(
      [node("start", "START"), R("r1", "G"), catchN("c1", "r1", "NO_RESULT"), node("if1", "IF"), R("e", "E"), R("h", "H"), catchN("c2", "r1", "EVAL_ERROR"), R("n", "F"), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "n"), edge("e3", "c1", "if1"), br("b1", "if1", "e", 1, "X > 0"), other("bo", "if1", "h"), edge("ee", "e", "end"), edge("eh", "h", "n"), edge("e5", "c2", "end"), edge("en", "n", "end")],
    );
    expect(joinOf(f, "if1")).toBe("h");
    expect(endingBranches(f, "if1")).toEqual(["b1"]);
    expect(handlerTarget(f, "c1")).toBe("n");
    expect(handlerTarget(f, "c2")).toBe("end");
    expect(returnOf(f, "r1")).toBe("n");
    expect(joinOf(flow(ifNodes(), ifEdges()), "if1")).toBe("m1");
    expect(endingBranches(flow(ifNodes(), ifEdges()), "if1")).toEqual([]);
    expect(joinOf(flow(parNodes(), parEdges()), "p1")).toBe("m1");
    expect(joinOf(f, "r1")).toBeNull();
    // 순환(a → c → a)이면 모이는 자리를 정하지 못한다.
    const loop = flow(
      [node("start", "START"), node("if1", "IF"), R("a", "A"), R("c", "C"), R("b", "B"), node("end", "END")],
      [edge("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "b"), edge("ea", "a", "c"), edge("ec", "c", "a"), edge("eb", "b", "end")],
    );
    expect(joinOf(loop, "if1")).toBeNull();
    expect(endingBranches(loop, "if1")).toBeNull();
    // 받는 노드가 붙은 노드가 없거나 나가는 선이 없으면 null.
    expect(handlerTarget(flow([node("start", "START"), catchN("c9", "zz", "NO_RESULT"), node("end", "END")], [edge("e1", "start", "end")]), "c9")).toBeNull();
    expect(returnOf(f, "n")).toBeNull();
  });
});
```
import 줄에 `endingBranches, handlerTarget, joinOf, returnOf` 를 더한다.

Run: `cd src/frontend/m-mdm && node scripts/test.mjs --maxWorkers=3 tests/dme/ruleSetEdit/flow-model.test.ts`
Expected: PASS.

- [ ] **Step 11: 구조 코퍼스 — 바뀌는 사례**

`rule-set-corpus.json` 의 기존 사례를 이름으로 찾아 고친다(나머지 칸은 그대로):
1. `흐름 — 합류 없는 병렬 분기`: `checks` 에서 `"end의 들어오는 선이 2개다. 1개여야 한다"` 줄을 지운다.
2. `흐름 — 이미 닫힌 합류를 다시 만나면 방문 검사가 종류 검사보다 먼저 걸린다`: 문구를 `"m1를 두 번 지난다. 순환이 있거나 갈래가 모이는 자리 밖에서 만난다"` 로.
3. `flow_exist_and_structure`: `checks` 를 `[{ "code": "RULE_NOT_FOUND", "severity": "REJECT", "ruleId": "R_NONE", "otherRuleId": null, "varName": null, "message": "R_NONE는 없는 룰이다", "nodeId": "r2", "edgeId": null }]` 하나로(두 구조 오류가 사라지고 §2.2 5 로 "그 외" r2 가 이어지는 갈래, r1 갈래가 끝내는 갈래다. `ids` 는 그대로 `["R_A","R_NONE"]`).
4. `받는 노드 — 붙은 룰이 없다(FLOW_CATCH)`: 이름을 `받는 노드 — 붙은 노드가 없다(FLOW_CATCH)` 로, 문구를 `"받는 노드 c1가 붙은 노드 zz가 없다"` 로.
5. `받는 노드 — 빈 단계에는 붙일 수 없다(FLOW_CATCH)`: 이름을 `받는 노드 — 빈 단계에 붙으면 CATCH_NEVER 경고다(D-136)` 로, `checks` 를 아래로:
```json
        "checks": [
          { "code": "EMPTY_TASK", "severity": "WARN", "message": "빈 단계 1개 — 실행 때 그냥 지나간다" },
          { "code": "CATCH_NEVER", "severity": "WARN", "message": "t1는 빈 단계라 c1가 받는 예외가 일어나지 않는다", "nodeId": "c1" }
        ]
```
6. `받는 노드 — 처리 갈래가 다른 분기의 합류로 간다(FLOW_STRUCTURE 2단계)`: 이름을 `받는 노드 — 처리 갈래가 둘러싼 IF 의 옛 합류로 돌아오면 받는다(D-136)` 로, `checks` 를 `[]` 로.
7. `받는 노드 — 처리 갈래 안 IF 갈래는 END 로 못 간다(지금 문구, 편차 F7)`: 이름만 `받는 노드 — 처리 갈래 안 옛 형식 IF 의 갈래는 END 로 못 간다(옛 합류는 모든 갈래를 닫는다)` 로(기대 그대로, 편차 F4).

- [ ] **Step 12: 구조 코퍼스 — 새 사례 14개(N2·N3·N5·N6·N7·N10·N15·N16·N17·N18·N20·N21·N25·N26)**

`cases` 배열 마지막 원소 뒤(`]` 앞)에 쉼표를 찍고 아래를 차례로 넣는다. 들여쓰기는 파일의 기존 사례(원소 4칸, 칸 6칸)를 따른다. 기대값은 규범이다(R4). 룰 모양은 모두 `{ "exists": true, "status": "INUSE", "releasedVer": 1, … }` 이다.
```json
    {
      "name": "흐름 — 새 형식 IF 의 빈 갈래 둘이 같은 노드로 간다(f4, J-D7)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "if1", "kind": "IF" }, { "id": "a", "kind": "RULE", "ruleId": "A" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e1", "from": "start", "to": "if1" }, { "id": "e2", "from": "if1", "to": "a", "order": 1, "cond": "X > 0" },
          { "id": "e3", "from": "if1", "to": "a", "otherwise": true }, { "id": "e4", "from": "a", "to": "end" }] },
      "ids": ["A"],
      "rules": { "A": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RA" }] } },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["A"] }], "results": [{ "name": "RA", "by": ["A"], "readers": [] }] },
        "deps": { "A": [] },
        "checks": [{ "code": "FLOW_STRUCTURE", "severity": "REJECT", "message": "IF if1의 갈래 e3가 갈래 e2와 같은 노드 a로 간다. 같은 노드로 가는 갈래는 하나만 둔다", "nodeId": "if1", "edgeId": "e3" }]
      }
    },
    {
      "name": "흐름 — 끝내는 갈래가 END 로 가고 그 외 빈 갈래가 이어진다(§1 둘째 예, D-136)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "r1", "kind": "RULE", "ruleId": "P" }, { "id": "if1", "kind": "IF", "label": "단가 확인" },
          { "id": "r8", "kind": "RULE", "ruleId": "L" }, { "id": "r2", "kind": "RULE", "ruleId": "M" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e1", "from": "start", "to": "r1" }, { "id": "e2", "from": "r1", "to": "if1" },
          { "id": "e3", "from": "if1", "to": "r8", "order": 1, "cond": "PRICE = NULL", "label": "단가 없음" }, { "id": "e4", "from": "r8", "to": "end" },
          { "id": "e5", "from": "if1", "to": "r2", "otherwise": true, "label": "그 외" }, { "id": "e6", "from": "r2", "to": "end" }] },
      "condIo": { "e3": { "ok": true, "message": null, "vars": [{ "name": "PRICE", "source": "NONE" }] } },
      "ids": ["P", "L", "M"],
      "rules": {
        "P": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "PRICE" }] },
        "L": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "LOG" }] },
        "M": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "PRICE", "source": "NONE" }], "results": [{ "name": "AMOUNT" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["P", "L"] }],
          "results": [{ "name": "PRICE", "by": ["P"], "readers": ["M"] }, { "name": "LOG", "by": ["L"], "readers": [] }, { "name": "AMOUNT", "by": ["M"], "readers": [] }] },
        "deps": { "P": [], "L": [], "M": ["P"] },
        "checks": []
      }
    },
    {
      "name": "흐름 — 갈래가 다른 갈래 중간 노드로 들어가면 두 번 지난다(N5)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "if1", "kind": "IF" }, { "id": "a", "kind": "RULE", "ruleId": "A" }, { "id": "b", "kind": "RULE", "ruleId": "B" },
          { "id": "c", "kind": "RULE", "ruleId": "C" }, { "id": "y", "kind": "RULE", "ruleId": "D" }, { "id": "z", "kind": "RULE", "ruleId": "E" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e1", "from": "start", "to": "if1" }, { "id": "b1", "from": "if1", "to": "a", "order": 1, "cond": "X > 1" },
          { "id": "b2", "from": "if1", "to": "b", "order": 2, "cond": "X > 2" }, { "id": "bo", "from": "if1", "to": "c", "otherwise": true },
          { "id": "ea", "from": "a", "to": "y" }, { "id": "eb", "from": "b", "to": "y" }, { "id": "ec", "from": "c", "to": "z" }, { "id": "ey", "from": "y", "to": "z" },
          { "id": "ez", "from": "z", "to": "end" }] },
      "ids": ["A", "B", "C", "D", "E"],
      "rules": {
        "A": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RA" }] },
        "B": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RB" }] },
        "C": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RC" }] },
        "D": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RD" }] },
        "E": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RE" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["A", "B", "C", "D", "E"] }],
          "results": [{ "name": "RA", "by": ["A"], "readers": [] }, { "name": "RB", "by": ["B"], "readers": [] }, { "name": "RC", "by": ["C"], "readers": [] },
            { "name": "RD", "by": ["D"], "readers": [] }, { "name": "RE", "by": ["E"], "readers": [] }] },
        "deps": { "A": [], "B": [], "C": [], "D": [], "E": [] },
        "checks": [{ "code": "FLOW_STRUCTURE", "severity": "REJECT", "message": "y를 두 번 지난다. 순환이 있거나 갈래가 모이는 자리 밖에서 만난다", "nodeId": "y" }]
      }
    },
    {
      "name": "흐름 — 모이는 자리가 아닌 병렬 합류로 블록 밖 선이 하나 더 들어온다(N6, S5)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "if1", "kind": "IF" }, { "id": "p1", "kind": "PARALLEL" }, { "id": "a", "kind": "RULE", "ruleId": "A" },
          { "id": "b", "kind": "RULE", "ruleId": "B" }, { "id": "c", "kind": "RULE", "ruleId": "C" }, { "id": "pm", "kind": "MERGE", "splitId": "p1" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e1", "from": "start", "to": "if1" }, { "id": "b1", "from": "if1", "to": "p1", "order": 1, "cond": "X > 0" },
          { "id": "bo", "from": "if1", "to": "c", "otherwise": true }, { "id": "pa", "from": "p1", "to": "a", "order": 1 }, { "id": "pb", "from": "p1", "to": "b", "order": 2 },
          { "id": "ea", "from": "a", "to": "pm" }, { "id": "eb", "from": "b", "to": "pm" }, { "id": "ec", "from": "c", "to": "pm" }, { "id": "ep", "from": "pm", "to": "end" }] },
      "ids": ["A", "B", "C"],
      "rules": {
        "A": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RA" }] },
        "B": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RB" }] },
        "C": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RC" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["A", "B", "C"] }],
          "results": [{ "name": "RA", "by": ["A"], "readers": [] }, { "name": "RB", "by": ["B"], "readers": [] }, { "name": "RC", "by": ["C"], "readers": [] }] },
        "deps": { "A": [], "B": [], "C": [] },
        "checks": [{ "code": "FLOW_STRUCTURE", "severity": "REJECT", "message": "갈래가 pm에서 닫히지 않고 end로 나간다", "nodeId": "end" }]
      }
    },
    {
      "name": "흐름 — 갈래가 IF 앞으로 되돌아가면 모이는 자리를 다시 찾다 두 번 지난다(N7)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "r1", "kind": "RULE", "ruleId": "A" }, { "id": "if1", "kind": "IF" }, { "id": "a", "kind": "RULE", "ruleId": "B" },
          { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e1", "from": "start", "to": "r1" }, { "id": "e2", "from": "r1", "to": "if1" }, { "id": "b1", "from": "if1", "to": "a", "order": 1, "cond": "X > 0" },
          { "id": "bo", "from": "if1", "to": "end", "otherwise": true }, { "id": "ea", "from": "a", "to": "r1" }] },
      "ids": ["A", "B"],
      "rules": {
        "A": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RA" }] },
        "B": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RB" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["A", "B"] }], "results": [{ "name": "RA", "by": ["A"], "readers": [] }, { "name": "RB", "by": ["B"], "readers": [] }] },
        "deps": { "A": [], "B": [] },
        "checks": [{ "code": "FLOW_STRUCTURE", "severity": "REJECT", "message": "if1를 두 번 지난다. 순환이 있거나 갈래가 모이는 자리 밖에서 만난다", "nodeId": "if1" }]
      }
    },
    {
      "name": "받는 노드 — 두 처리 갈래가 서로 다른 노드로 돌아온다(N10, S7)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "r1", "kind": "RULE", "ruleId": "A" }, { "id": "x", "kind": "RULE", "ruleId": "B" }, { "id": "y", "kind": "RULE", "ruleId": "C" },
          { "id": "c1", "kind": "CATCH", "attachTo": "r1", "catches": ["NO_RESULT"] }, { "id": "h1", "kind": "RULE", "ruleId": "D" },
          { "id": "c2", "kind": "CATCH", "attachTo": "r1", "catches": ["EVAL_ERROR"] }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e1", "from": "start", "to": "r1" }, { "id": "e2", "from": "r1", "to": "x" }, { "id": "e3", "from": "x", "to": "y" }, { "id": "e4", "from": "y", "to": "end" },
          { "id": "e5", "from": "c1", "to": "h1" }, { "id": "e6", "from": "h1", "to": "x" }, { "id": "e7", "from": "c2", "to": "y" }] },
      "ids": ["A", "B", "C", "D"],
      "rules": {
        "A": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RA" }] },
        "B": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RB" }] },
        "C": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RC" }] },
        "D": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RD" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["A", "B", "C", "D"] }],
          "results": [{ "name": "RA", "by": ["A"], "readers": [] }, { "name": "RB", "by": ["B"], "readers": [] }, { "name": "RC", "by": ["C"], "readers": [] },
            { "name": "RD", "by": ["D"], "readers": [] }] },
        "deps": { "A": [], "B": [], "C": [], "D": [] },
        "checks": [{ "code": "FLOW_STRUCTURE", "severity": "REJECT", "message": "r1의 처리 갈래 c2가 y로 돌아온다. 앞 처리 갈래 c1처럼 x로 돌아와야 한다", "nodeId": "c2" }]
      }
    },
    {
      "name": "받는 노드 — 빈 단계의 받는 노드 둘(돌아옴·끝냄)은 CATCH_NEVER 한 줄씩이고 처리 갈래 경로 상태는 그대로 센다(N15)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "t1", "kind": "TASK", "label": "빈 단계" }, { "id": "c1", "kind": "CATCH", "attachTo": "t1", "catches": ["NO_RESULT"] },
          { "id": "h", "kind": "RULE", "ruleId": "H" }, { "id": "c2", "kind": "CATCH", "attachTo": "t1", "catches": ["EVAL_ERROR"] }, { "id": "n", "kind": "RULE", "ruleId": "F" },
          { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e1", "from": "start", "to": "t1" }, { "id": "e2", "from": "t1", "to": "n" }, { "id": "e3", "from": "c1", "to": "h" }, { "id": "e4", "from": "h", "to": "n" },
          { "id": "e5", "from": "c2", "to": "end" }, { "id": "e6", "from": "n", "to": "end" }] },
      "ids": ["H", "F"],
      "rules": {
        "H": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "F": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "V", "source": "NONE" }], "results": [{ "name": "W" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["H"] }], "results": [{ "name": "V", "by": ["H"], "readers": ["F"] }, { "name": "W", "by": ["F"], "readers": [] }] },
        "deps": { "H": [], "F": ["H"] },
        "checks": [
          { "code": "EMPTY_TASK", "severity": "WARN", "message": "빈 단계 1개 — 실행 때 그냥 지나간다" },
          { "code": "CATCH_NEVER", "severity": "WARN", "message": "t1는 빈 단계라 c1가 받는 예외가 일어나지 않는다", "nodeId": "c1" },
          { "code": "CATCH_NEVER", "severity": "WARN", "message": "t1는 빈 단계라 c2가 받는 예외가 일어나지 않는다", "nodeId": "c2" },
          { "code": "FLOW_PARTIAL", "severity": "WARN", "ruleId": "F", "varName": "V", "message": "F가 읽는 V는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다", "nodeId": "n" }
        ]
      }
    },
    {
      "name": "받는 노드 — 처리 갈래가 병렬 합류로 돌아오면 정상 갈래가 병렬을 넘어 END 로 빠진다(N16, S5)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "r1", "kind": "RULE", "ruleId": "A" }, { "id": "p1", "kind": "PARALLEL" }, { "id": "a", "kind": "RULE", "ruleId": "B" },
          { "id": "b", "kind": "RULE", "ruleId": "C" }, { "id": "pm", "kind": "MERGE", "splitId": "p1" }, { "id": "x", "kind": "RULE", "ruleId": "D" },
          { "id": "c1", "kind": "CATCH", "attachTo": "r1", "catches": ["NO_RESULT"] }, { "id": "h", "kind": "RULE", "ruleId": "E" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e1", "from": "start", "to": "r1" }, { "id": "e2", "from": "r1", "to": "p1" }, { "id": "pa", "from": "p1", "to": "a", "order": 1 },
          { "id": "pb", "from": "p1", "to": "b", "order": 2 }, { "id": "ea", "from": "a", "to": "pm" }, { "id": "eb", "from": "b", "to": "pm" }, { "id": "ep", "from": "pm", "to": "x" },
          { "id": "ex", "from": "x", "to": "end" }, { "id": "ec", "from": "c1", "to": "h" }, { "id": "eh", "from": "h", "to": "pm" }] },
      "ids": ["A", "B", "C", "D", "E"],
      "rules": {
        "A": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RA" }] },
        "B": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RB" }] },
        "C": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RC" }] },
        "D": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RD" }] },
        "E": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RE" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["A", "B", "C", "D", "E"] }],
          "results": [{ "name": "RA", "by": ["A"], "readers": [] }, { "name": "RB", "by": ["B"], "readers": [] }, { "name": "RC", "by": ["C"], "readers": [] },
            { "name": "RD", "by": ["D"], "readers": [] }, { "name": "RE", "by": ["E"], "readers": [] }] },
        "deps": { "A": [], "B": [], "C": [], "D": [], "E": [] },
        "checks": [{ "code": "FLOW_STRUCTURE", "severity": "REJECT", "message": "갈래가 pm에서 닫히지 않고 end로 나간다", "nodeId": "end" }]
      }
    },
    {
      "name": "흐름 — 룰의 들어오는 선이 0개면 1개 이상이어야 한다(N17)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "r1", "kind": "RULE", "ruleId": "A" }, { "id": "r2", "kind": "RULE", "ruleId": "B" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e1", "from": "start", "to": "r1" }, { "id": "e2", "from": "r1", "to": "end" }, { "id": "e3", "from": "r2", "to": "end" }] },
      "ids": ["A", "B"],
      "rules": {
        "A": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RA" }] },
        "B": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RB" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["A", "B"] }], "results": [{ "name": "RA", "by": ["A"], "readers": [] }, { "name": "RB", "by": ["B"], "readers": [] }] },
        "deps": { "A": [], "B": [] },
        "checks": [{ "code": "FLOW_STRUCTURE", "severity": "REJECT", "message": "r2의 들어오는 선이 0개다. 1개 이상이어야 한다", "nodeId": "r2" }]
      }
    },
    {
      "name": "흐름 — IF 에 옛 합류가 둘이다(N18)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "if1", "kind": "IF" }, { "id": "a", "kind": "RULE", "ruleId": "A" }, { "id": "b", "kind": "RULE", "ruleId": "B" },
          { "id": "c", "kind": "RULE", "ruleId": "C" }, { "id": "m1", "kind": "MERGE", "splitId": "if1" }, { "id": "m2", "kind": "MERGE", "splitId": "if1" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e1", "from": "start", "to": "if1" }, { "id": "b1", "from": "if1", "to": "a", "order": 1, "cond": "X > 1" },
          { "id": "b2", "from": "if1", "to": "b", "order": 2, "cond": "X > 2" }, { "id": "bo", "from": "if1", "to": "c", "otherwise": true },
          { "id": "ea", "from": "a", "to": "m1" }, { "id": "eb", "from": "b", "to": "m1" }, { "id": "ec", "from": "c", "to": "m2" }, { "id": "em", "from": "m1", "to": "m2" },
          { "id": "ee", "from": "m2", "to": "end" }] },
      "ids": ["A", "B", "C"],
      "rules": {
        "A": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RA" }] },
        "B": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RB" }] },
        "C": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RC" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["A", "B", "C"] }],
          "results": [{ "name": "RA", "by": ["A"], "readers": [] }, { "name": "RB", "by": ["B"], "readers": [] }, { "name": "RC", "by": ["C"], "readers": [] }] },
        "deps": { "A": [], "B": [], "C": [] },
        "checks": [{ "code": "FLOW_STRUCTURE", "severity": "REJECT", "message": "IF if1를 닫는 합류가 2개다. IF 는 합류를 두지 않는다", "nodeId": "if1" }]
      }
    },
    {
      "name": "흐름 — 모든 갈래가 따로 END 로 가는데 그 외가 END 직행이면 조건 갈래가 이어진다(N20)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "if1", "kind": "IF" }, { "id": "a", "kind": "RULE", "ruleId": "A" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e1", "from": "start", "to": "if1" }, { "id": "b1", "from": "if1", "to": "a", "order": 1, "cond": "X > 0" },
          { "id": "bo", "from": "if1", "to": "end", "otherwise": true }, { "id": "ea", "from": "a", "to": "end" }] },
      "condIo": { "b1": { "ok": true, "message": null, "vars": [{ "name": "X", "source": "DICT" }] } },
      "ids": ["A"],
      "rules": { "A": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RA" }] } },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["A"] }], "results": [{ "name": "RA", "by": ["A"], "readers": [] }] },
        "deps": { "A": [] },
        "checks": []
      }
    },
    {
      "name": "흐름 — 병렬 갈래 안 IF 의 그 외에 몸을 두어 END 로 보내면 조건 갈래가 끝내는 갈래가 되어 합류를 지난다(N21, S5)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "p1", "kind": "PARALLEL" }, { "id": "if1", "kind": "IF" }, { "id": "a", "kind": "RULE", "ruleId": "A" },
          { "id": "e", "kind": "RULE", "ruleId": "E" }, { "id": "k", "kind": "RULE", "ruleId": "K" }, { "id": "pm", "kind": "MERGE", "splitId": "p1" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e0", "from": "start", "to": "p1" }, { "id": "pa", "from": "p1", "to": "if1", "order": 1 }, { "id": "pb", "from": "p1", "to": "k", "order": 2 },
          { "id": "d1", "from": "if1", "to": "a", "order": 1, "cond": "X > 0" }, { "id": "do", "from": "if1", "to": "e", "otherwise": true },
          { "id": "ea", "from": "a", "to": "pm" }, { "id": "ee", "from": "e", "to": "end" }, { "id": "ek", "from": "k", "to": "pm" }, { "id": "ep", "from": "pm", "to": "end" }] },
      "ids": ["A", "E", "K"],
      "rules": {
        "A": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RA" }] },
        "E": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RE" }] },
        "K": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RK" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["A", "E", "K"] }],
          "results": [{ "name": "RA", "by": ["A"], "readers": [] }, { "name": "RE", "by": ["E"], "readers": [] }, { "name": "RK", "by": ["K"], "readers": [] }] },
        "deps": { "A": [], "E": [], "K": [] },
        "checks": [{ "code": "FLOW_STRUCTURE", "severity": "REJECT", "message": "갈래가 end에서 닫히지 않고 pm로 나간다", "nodeId": "pm" }]
      }
    },
    {
      "name": "받는 노드 — 처리 갈래가 아직 지나지 않은 다른 병렬의 합류를 지나면 돌아올 자리 문구로 멈춘다(N25, S9)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "if1", "kind": "IF" }, { "id": "r1", "kind": "RULE", "ruleId": "A" },
          { "id": "c1", "kind": "CATCH", "attachTo": "r1", "catches": ["NO_RESULT"] }, { "id": "h", "kind": "RULE", "ruleId": "B" }, { "id": "p3", "kind": "PARALLEL" },
          { "id": "a", "kind": "RULE", "ruleId": "C" }, { "id": "pm3", "kind": "MERGE", "splitId": "p3" }, { "id": "j", "kind": "RULE", "ruleId": "D" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e1", "from": "start", "to": "if1" }, { "id": "b1", "from": "if1", "to": "r1", "order": 1, "cond": "X > 0" },
          { "id": "bo", "from": "if1", "to": "p3", "otherwise": true }, { "id": "e2", "from": "r1", "to": "j" }, { "id": "ec", "from": "c1", "to": "h" },
          { "id": "eh", "from": "h", "to": "pm3" }, { "id": "pa", "from": "p3", "to": "a", "order": 1 }, { "id": "pb", "from": "p3", "to": "pm3", "order": 2 },
          { "id": "ea", "from": "a", "to": "pm3" }, { "id": "ep", "from": "pm3", "to": "j" }, { "id": "ej", "from": "j", "to": "end" }] },
      "ids": ["A", "B", "C", "D"],
      "rules": {
        "A": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RA" }] },
        "B": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RB" }] },
        "C": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RC" }] },
        "D": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RD" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["A", "B", "C", "D"] }],
          "results": [{ "name": "RA", "by": ["A"], "readers": [] }, { "name": "RB", "by": ["B"], "readers": [] }, { "name": "RC", "by": ["C"], "readers": [] },
            { "name": "RD", "by": ["D"], "readers": [] }] },
        "deps": { "A": [], "B": [], "C": [], "D": [] },
        "checks": [{ "code": "FLOW_STRUCTURE", "severity": "REJECT", "message": "처리 갈래 c1가 돌아올 자리 j나 끝에 닿지 않고 pm3로 나간다", "nodeId": "pm3" }]
      }
    },
    {
      "name": "흐름 — 바깥 새 형식 IF 안에서 안쪽 IF 의 그 외를 END 로 보내면 바깥 갈래도 끝내는 갈래가 되어 뒤에서 두 번 지난다(N26, 편차 F3)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "if1", "kind": "IF" }, { "id": "if2", "kind": "IF" }, { "id": "a", "kind": "RULE", "ruleId": "A" },
          { "id": "e", "kind": "RULE", "ruleId": "E" }, { "id": "c", "kind": "RULE", "ruleId": "C" }, { "id": "x", "kind": "RULE", "ruleId": "F" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e0", "from": "start", "to": "if1" }, { "id": "b1", "from": "if1", "to": "if2", "order": 1, "cond": "X > 0" },
          { "id": "bo", "from": "if1", "to": "c", "otherwise": true }, { "id": "d1", "from": "if2", "to": "a", "order": 1, "cond": "X > 1" },
          { "id": "do", "from": "if2", "to": "e", "otherwise": true }, { "id": "ea", "from": "a", "to": "x" }, { "id": "ee", "from": "e", "to": "end" },
          { "id": "ec", "from": "c", "to": "x" }, { "id": "ex", "from": "x", "to": "end" }] },
      "ids": ["A", "E", "C", "F"],
      "rules": {
        "A": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RA" }] },
        "E": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RE" }] },
        "C": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RC" }] },
        "F": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RF" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["A", "E", "C", "F"] }],
          "results": [{ "name": "RA", "by": ["A"], "readers": [] }, { "name": "RE", "by": ["E"], "readers": [] }, { "name": "RC", "by": ["C"], "readers": [] },
            { "name": "RF", "by": ["F"], "readers": [] }] },
        "deps": { "A": [], "E": [], "C": [], "F": [] },
        "checks": [{ "code": "FLOW_STRUCTURE", "severity": "REJECT", "message": "x를 두 번 지난다. 순환이 있거나 갈래가 모이는 자리 밖에서 만난다", "nodeId": "x" }]
      }
    }
```
구조 오류가 있는 사례의 `ids` 는 트리가 없어 RULE 노드의 룰 ID 를 노드 배열 순서로 중복 없이 펼친 것이다(`flowRuleIds`). 기대 근거(손 유도)는 이 태스크 Step 2 의 Java 시험 주석과 같다.

두 러너의 `MIN_CASES` 를 64 → **78** 로 함께 올린다(`RuleSetCorpusTest.java:44`, `rule-set-corpus.test.ts:21`).

- [ ] **Step 13: 퍼즈 파일 다시 쓰기(생성기는 그대로, R3)**

Run: `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetFlowFuzz*' -Dfuzz.write=true --console=plain)`
Expected: PASS, `src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-fuzz.json` 이 바뀐다(구조를 깬 사례의 문구·차수 기대). 생성기 코드는 고치지 않는다.

- [ ] **Step 14: 두 러너 통과 확인**

Run: `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetCorpusTest' --tests '*RuleSetAnalyzerTest' --tests '*RuleSetPathStateTest' --tests '*RuleSetFlowFuzz*' --console=plain)` 와 `cd src/frontend/m-mdm && node scripts/test.mjs --maxWorkers=3 tests/dme/ruleSetEdit/rule-set-corpus.test.ts tests/dme/ruleSetEdit/set-model.test.ts`
Expected: 모두 PASS. Java 가 새 사례에서 다르면 Java 를 고친다(R4). TS 만 다르면 TS 를 Java 에 맞춘다. 퍼즈에서 TS 만 다르면 그 흐름을 줄여 코퍼스 사례로 옮기고 원인을 고친다.

- [ ] **Step 15: 전체 확인**

Run(차례로): `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)`, `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)`, `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSet*' --tests '*RuleLedgerChecksTest' --tests '*DmeOasisHttpTest' --console=plain)`, `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint`, `cd src/frontend/m-mdm && node scripts/test.mjs --maxWorkers=3`
Expected: 모두 PASS·오류 0. 깨지는 시험(Java·TS)마다 아래 규칙으로 판정하고 완료 보고에 "파일:시험 이름 → 규칙 번호" 표로 남긴다:
1. **구조 규칙·문구가 바뀜** — d1(들어오는 선 "1개 이상"), IF f2(합류 0개 허용·둘 이상 새 문구), f4, h1("붙은 노드")·h2("룰·빈 단계 노드에만"), S6("모이는 자리 밖에서"), 받는 노드가 없는 흐름의 END 들어오는 선 여럿 허용 → 기대를 새 규칙·문구로 고친다.
2. **이름이 바뀜** — `Guarded.rule` → `step`, `Split.mergeId` null 가능·`joinId`, `Branch.ends` 칸 → 맞춘다.
3. **받을 수 있는 종류가 넓어짐** — `CATCHABLE`·`FlowParser.catchable` 에 TASK 가 더해져 빈 단계에 받는 노드 붙이기(`addCatch`·캔버스 `catchLinkAllowed`)가 성공한다 → "빈 단계에는 붙일 수 없다" 를 기대하던 시험은 "붙는다" 로 고친다(거부 문구 상수 `CATCH_ONLY_RULE` 의 글자는 Task 4 가 바꾼다).
4. 그 밖 → 구현 결함이다. 기대를 고치지 말고 코드를 고친다(이 태스크는 편집기 변환·배치·디버거 동작을 바꾸지 않는다).

- [ ] **Step 16: 커밋**

```bash
/usr/bin/git add src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowKeys.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/FlowFixtures.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowParserTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowTreeTest.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetAnalyzer.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetPathState.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-fuzz.json src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-model.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts
/usr/bin/git commit -m "feat(mdm): 룰 세트 흐름 해석이 IF 모이는 자리·돌아오는 자리를 계산한다(D-136)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowKeys.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/FlowFixtures.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowParserTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowTreeTest.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetAnalyzer.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetPathState.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-fuzz.json src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-model.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts
```

---
### Task 2: 엔진 실행 — 새 형식 IF·끝내는 갈래·돌아오는 자리·빈 단계 블록·입력 키 검사

**등급:** capable — 끝냄 신호를 처리 갈래·병렬·중첩에서 하나로 묶고, 옛 형식 결과를 한 글자도 바꾸지 않아야 한다.
**병렬:** Task 1 병합 뒤. Task 3·4 와 함께 돌 수 있다(고치는 파일이 겹치지 않는다).

**Files:**
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java`·`FlowKeys.java`
- Create: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetIfEndTest.java`·`RuleSetLegacyMergeTest.java`
- Modify(시험): `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetCatchTest.java`, `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunnerTest.java`

**Interfaces:**
- Consumes(Task 1): `Guarded.step()`·`joinId()`·`mergeId()`·`nodeId()`, `Split.mergeId()`(새 IF 는 null), `Branch.ends()`, `TaskStep`, `FlowFixtures.task`·`ifFlowNew`.
- Produces: `FlowRun.Ended(@Nullable String catchNodeId)`(패키지 안), 실행 의미 — 새 형식 IF·돌아오는 자리는 MERGE 기록이 없다, 끝내는 IF 갈래는 `Ended(null)`(루트면 `endedBy` null), 처리 갈래 안 IF 끝냄은 `Ended(그 받는 노드)`, TASK 블록은 처리 갈래를 타지 않는다. Task 7(디버거)이 이 기록 모양을 푼다.

- [ ] **Step 1: 실패하는 시험 — 끝내는 IF 갈래(`RuleSetIfEndTest.java`, 새 파일)**

```java
package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.catchNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.par;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.pe;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult.CaughtException;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeStatus;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeTrace;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Test;

/** implicit-join spec §5·§14.1 — 끝내는 IF 갈래(B1): 루트·병렬 갈래 안·처리 갈래 안·정상 갈래 안 끝냄, 입력 키 검사, evaluateSet·traceSet 일치. */
class RuleSetIfEndTest {

    private final InMemoryDefinitionLookup lookup = FlowRules.lookup(
            RuleSetCatchTest.grade("R_G", HitPolicy.FIRST), calc("R_A", "A", "X + 1", "X"), calc("R_B", "B", "X + 2", "X"),
            calc("R_ERR", "E", "X / 0", "X"), calc("R_FILL", "G", "0"), calc("R_AFTER", "Z", "X * 2", "X"), calc("R_W", "Q", "W + 1", "W"));
    private final MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

    private RuleSetResult run(FlowDefinition f, Map<String, Object> record) {
        lookup.addSet(new RuleSetDefinition("S", List.of(), SetStatus.INUSE, f));
        return engine.evaluateSet("S", record, SampleRules.EVAL_TS);
    }

    private RunTrace trace(FlowDefinition f, Map<String, Object> record) {
        return engine.traceSet(new RuleSetDefinition("DRAFT", List.of(), SetStatus.INUSE, f), record, SampleRules.EVAL_TS);
    }

    private static List<String> path(RuleSetResult r) {
        return r.path().stream().map(p -> p.nodeId() + ":" + p.kind() + ":" + p.stepIndex()).toList();
    }

    private static List<String> kinds(RunTrace t) {
        return t.nodes().stream().map(n -> n.seq() + ":" + n.nodeId() + ":" + n.kind() + ":" + n.status()).toList();
    }

    /** start → r0(R_A) → if1 [b1 "X > 10" → k(R_B) → end](끝내는 갈래) [그 외 → n] → n(R_AFTER) → end. */
    static FlowDefinition rootEnding() {
        return flow(List.of(start(), rule("r0", "R_A"), ifNode("if1"), rule("k", "R_B"), rule("n", "R_AFTER"), end()),
                List.of(e("e1", "start", "r0"), e("e2", "r0", "if1"), br("b1", "if1", "k", 1, "X > 10"), e("ek", "k", "end"),
                        other("bo", "if1", "n"), e("en", "n", "end")));
    }

    @Test
    void 루트_IF_의_끝내는_갈래를_타면_정상_완료이고_endedBy_가_없다() {
        RuleSetResult r = run(rootEnding(), rec("X", new BigDecimal("20")));
        assertNull(r.endedBy());
        assertEquals(List.of(), r.caught());
        assertEquals(List.of("start:START:null", "r0:RULE:0", "if1:IF:null", "k:RULE:1", "end:END:null"), path(r));
        assertEquals("b1", r.path().get(2).chosenEdgeId());
        assertNum("21", r.finalValues().get("A"));
        assertNum("22", r.finalValues().get("B"));
        assertFalse(r.finalValues().containsKey("Z"));
        RunTrace t = trace(rootEnding(), rec("X", new BigDecimal("20")));
        assertNull(t.endedBy());
        assertNull(t.violations());
        assertEquals(List.of("1:start:START:OK", "2:r0:RULE:OK", "3:if1:IF:OK", "4:k:RULE:OK", "5:end:END:OK"), kinds(t));
    }

    @Test
    void 끝내는_갈래를_타지_않으면_모이는_자리로_이어지고_합류_기록이_없다() {
        RuleSetResult r = run(rootEnding(), rec("X", new BigDecimal("5")));
        assertEquals(List.of("start:START:null", "r0:RULE:0", "if1:IF:null", "n:RULE:1", "end:END:null"), path(r));
        assertNum("10", r.finalValues().get("Z"));
    }

    @Test
    void 병렬_갈래_안_IF_끝냄은_남은_형제를_돌리지_않고_끝난_형제와_지금_갈래까지_합친다() {
        // start → p1 [1 → a(R_A) → pm] [2 → if1 [b1 "X > 0" → k(R_AFTER) → end] [그 외 → pm]] [3 → b(R_B) → pm] → pm → end
        FlowDefinition f = flow(List.of(start(), par("p1"), rule("a", "R_A"), ifNode("if1"), rule("k", "R_AFTER"), rule("b", "R_B"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), pe("p1a", "p1", "a", 1), pe("p1i", "p1", "if1", 2), pe("p1b", "p1", "b", 3), e("ea", "a", "pm"),
                        br("b1", "if1", "k", 1, "X > 0"), e("ek", "k", "end"), other("bo", "if1", "pm"), e("eb", "b", "pm"), e("ee", "pm", "end")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("5")));
        assertNull(r.endedBy());
        assertEquals(List.of("A", "Z"), List.copyOf(r.finalValues().keySet()));
        assertNum("6", r.finalValues().get("A"));
        assertNum("10", r.finalValues().get("Z"));
        assertEquals(List.of("R_A", "R_AFTER"), r.steps().stream().map(RuleResult::ruleId).toList());
        RunTrace t = trace(f, rec("X", new BigDecimal("5")));
        assertEquals(r.path().stream().map(RuleSetResult.PathStep::nodeId).toList(), t.nodes().stream().map(NodeTrace::nodeId).toList());
        assertEquals(r.finalValues().keySet(), t.finalValues().keySet());
    }

    /** start → r1(R_G) → n(R_AFTER) → end. c1(NO_RESULT) → if1 [b1 "X > 0" → f(R_FILL) → end] [그 외 → h(R_A)] → h → n. */
    static FlowDefinition handlerEnding() {
        return flow(List.of(start(), rule("r1", "R_G"), catchNode("c1", "r1", "NO_RESULT"), ifNode("if1"), rule("f", "R_FILL"), rule("h", "R_A"),
                        rule("n", "R_AFTER"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "n"), e("e3", "c1", "if1"), br("b1", "if1", "f", 1, "X > 0"), e("ef", "f", "end"),
                        other("bo", "if1", "h"), e("eh", "h", "n"), e("en", "n", "end")));
    }

    @Test
    void 처리_갈래_안_IF_끝냄은_그_받는_노드가_endedBy_다() {
        RuleSetResult r = run(handlerEnding(), rec("X", new BigDecimal("5")));
        assertEquals("c1", r.endedBy());
        assertEquals(List.of("c1"), r.caught().stream().map(CaughtException::catchNodeId).toList());
        assertNum("0", r.finalValues().get("G"));
        assertFalse(r.finalValues().containsKey("Z"));
        for (String k : r.finalValues().keySet()) {
            assertFalse(k.startsWith("CATCH_"), k);
        }
        RunTrace t = trace(handlerEnding(), rec("X", new BigDecimal("5")));
        assertEquals("c1", t.endedBy());
        assertEquals(List.of("1:start:START:OK", "2:r1:RULE:CAUGHT", "3:c1:CATCH:OK", "4:if1:IF:OK", "5:f:RULE:OK", "6:end:END:OK"), kinds(t));
        // 끝내는 갈래를 타지 않으면 돌아오는 처리 갈래다.
        RuleSetResult back = run(handlerEnding(), rec("X", new BigDecimal("-5")));
        assertNull(back.endedBy());
        assertNum("-4", back.finalValues().get("A"));
        assertNum("-10", back.finalValues().get("Z"));
    }

    @Test
    void 중첩_처리_갈래_안_IF_끝냄은_가장_안쪽_받는_노드가_endedBy_다() {
        // r1(R_ERR) → end, c1 EVAL_ERROR → h1(R_G) → end, c9(h1) NO_RESULT → if9 [b "X > 0" → f(R_FILL) → end] [그 외 → q(R_A) → end]
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_ERR"), catchNode("c1", "r1", "EVAL_ERROR"), rule("h1", "R_G"), catchNode("c9", "h1", "NO_RESULT"),
                        ifNode("if9"), rule("f", "R_FILL"), rule("q", "R_A"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "end"), e("e3", "c1", "h1"), e("e4", "h1", "end"), e("e5", "c9", "if9"),
                        br("b", "if9", "f", 1, "X > 0"), e("ef", "f", "end"), other("bo", "if9", "q"), e("eq", "q", "end")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("5")));
        assertEquals("c9", r.endedBy());
        assertEquals(List.of("c1", "c9"), r.caught().stream().map(CaughtException::catchNodeId).toList());
    }

    @Test
    void 받는_노드_정상_갈래_안_IF_끝냄은_endedBy_가_없다() {
        // r1(R_G) → if1 [b "X > 10" → k(R_B) → end] [그 외 → n(R_AFTER)] → n → j(R_A) → end. c1(NO_RESULT) → h(R_FILL) → j.
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_G"), ifNode("if1"), rule("k", "R_B"), rule("n", "R_AFTER"), rule("j", "R_A"),
                        catchNode("c1", "r1", "NO_RESULT"), rule("h", "R_FILL"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "if1"), br("b", "if1", "k", 1, "X > 10"), e("ek", "k", "end"), other("bo", "if1", "n"),
                        e("en", "n", "j"), e("ej", "j", "end"), e("ec", "c1", "h"), e("eh", "h", "j")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("50")));
        assertNull(r.endedBy());
        assertEquals(List.of(), r.caught());
        assertEquals("HI", r.finalValues().get("G"));
        assertNum("52", r.finalValues().get("B"));
        assertFalse(r.finalValues().containsKey("A"));
    }

    @Test
    void 끝내는_갈래로_들어갈_때도_입력_키를_본다() {
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("k", "R_W"), rule("n", "R_AFTER"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "k", 1, "X > 0"), e("ek", "k", "end"), other("bo", "if1", "n"), e("en", "n", "end")));
        EngineEvaluationException ex = assertThrows(EngineEvaluationException.class, () -> run(f, rec("X", new BigDecimal("5"))));
        assertEquals(Code.MISSING_KEY, ex.violations().get(0).code());
        assertEquals("W", ex.violations().get(0).name());
        RunTrace t = trace(f, rec("X", new BigDecimal("5")));
        NodeTrace last = t.nodes().get(t.nodes().size() - 1);
        assertEquals("if1", last.nodeId());
        assertEquals(NodeStatus.ERROR, last.status());
    }
}
```

- [ ] **Step 2: 실패하는 시험 — 쌍둥이(`RuleSetLegacyMergeTest.java`, 새 파일)**

```java
package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.catchNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.guardMerge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifFlow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.task;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.flow.Branch;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.flow.Split;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeTrace;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Test;

/**
 * implicit-join spec §5 결과 불변·§14.1 쌍둥이 — 옛 형식 흐름과 편집기 변환(§12.2) 결과 모양의 새 형식 짝을 같은 입력으로 돌려
 * steps·finalValues·caught·endedBy·warnings 가 같고, path·기록은 MERGE 항목(과 J-D10 의 빈 단계 항목)만 다름을 본다.
 */
class RuleSetLegacyMergeTest {

    private final InMemoryDefinitionLookup lookup = FlowRules.lookup(
            RuleSetCatchTest.grade("R_G", HitPolicy.FIRST), calc("R_A", "A", "X + 1", "X"), calc("R_B", "B", "X + 2", "X"),
            calc("R_C", "C", "X + 3", "X"), calc("R_FILL", "G", "0"), calc("R_AFTER", "Z", "X * 2", "X"));
    private final MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

    private record Run(RuleSetResult result, RunTrace trace) {}

    private Run both(FlowDefinition f, Map<String, Object> record) {
        lookup.addSet(new RuleSetDefinition("S", List.of(), SetStatus.INUSE, f));
        return new Run(engine.evaluateSet("S", record, SampleRules.EVAL_TS),
                engine.traceSet(new RuleSetDefinition("DRAFT", List.of(), SetStatus.INUSE, f), record, SampleRules.EVAL_TS));
    }

    private static List<String> path(RuleSetResult r, Predicate<RuleSetResult.PathStep> keep) {
        return r.path().stream().filter(keep).map(p -> p.nodeId() + ":" + p.kind() + ":" + p.chosenEdgeId() + ":" + p.stepIndex()).toList();
    }

    private static List<String> nodes(RunTrace t, Predicate<NodeTrace> keep) {
        return t.nodes().stream().filter(keep).map(n -> n.nodeId() + ":" + n.kind() + ":" + n.status()).toList();
    }

    /** 결과 다섯 칸이 같고, 옛 형식은 MERGE 를, 새 형식은 taskIds 빈 단계를 빼면 path·기록 노드가 같다. 옛 형식에는 MERGE 기록이 있어야 한다. */
    private void same(FlowDefinition legacy, FlowDefinition fresh, Set<String> taskIds, Map<String, Object> record) {
        Run a = both(legacy, record);
        Run b = both(fresh, record);
        assertEquals(a.result().steps(), b.result().steps());
        assertEquals(a.result().finalValues(), b.result().finalValues());
        assertEquals(a.result().caught(), b.result().caught());
        assertEquals(a.result().endedBy(), b.result().endedBy());
        assertEquals(a.result().warnings(), b.result().warnings());
        assertTrue(a.result().path().stream().anyMatch(p -> p.kind() == NodeKind.MERGE), "옛 형식은 MERGE 를 기록한다");
        assertTrue(b.result().path().stream().noneMatch(p -> p.kind() == NodeKind.MERGE), "새 형식은 MERGE 기록이 없다");
        assertEquals(path(a.result(), p -> p.kind() != NodeKind.MERGE),
                path(b.result(), p -> !(p.kind() == NodeKind.TASK && taskIds.contains(p.nodeId()))));
        assertEquals(nodes(a.trace(), n -> n.kind() != NodeKind.MERGE), nodes(b.trace(), n -> !(n.kind() == NodeKind.TASK && taskIds.contains(n.nodeId()))));
        assertEquals(a.trace().finalValues(), b.trace().finalValues());
        assertEquals(a.trace().endedBy(), b.trace().endedBy());
    }

    @Test
    void IF_합류가_룰_앞에_있던_흐름은_합류만_빠진다() {
        FlowDefinition legacy = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), merge("m1", "if1"),
                        rule("n", "R_AFTER"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 10"), br("b2", "if1", "b", 2, "X > 0"), other("bo", "if1", "c"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ec", "c", "m1"), e("em", "m1", "n"), e("en", "n", "end")));
        FlowDefinition fresh = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), rule("n", "R_AFTER"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 10"), br("b2", "if1", "b", 2, "X > 0"), other("bo", "if1", "c"),
                        e("ea", "a", "n"), e("eb", "b", "n"), e("ec", "c", "n"), e("en", "n", "end")));
        for (String x : List.of("20", "5", "-5")) {
            same(legacy, fresh, Set.of(), rec("X", new BigDecimal(x)));
        }
    }

    @Test
    void END_앞_IF_합류를_빈_단계로_바꾼_짝은_끝내는_갈래가_생기지_않는다() {
        FlowDefinition fresh = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), task("m1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 10"), br("b2", "if1", "b", 2, "X > 0"), other("bo", "if1", "c"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
        Split s = (Split) FlowParser.parse(fresh).tree().root().items().get(0);
        assertEquals("m1", s.joinId());
        assertTrue(s.branches().stream().noneMatch(Branch::ends));
        for (String x : List.of("20", "5", "-5")) {
            same(ifFlow(), fresh, Set.of("m1"), rec("X", new BigDecimal(x)));
        }
    }

    @Test
    void 돌아오는_합류가_룰_앞에_있던_흐름은_합류만_빠진다() {
        FlowDefinition fresh = flow(List.of(start(), rule("r1", "R_G"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "R_FILL"), rule("after", "R_AFTER"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "after"), e("e3", "c1", "h"), e("e4", "h", "after"), e("e6", "after", "end")));
        for (String x : List.of("5", "50")) {
            same(RuleSetCatchTest.returning("R_G", "R_FILL", "NO_RESULT"), fresh, Set.of(), rec("X", new BigDecimal(x)));
        }
    }

    @Test
    void END_앞_돌아오는_합류를_빈_단계로_바꾼_짝은_끝냄이_되지_않는다() {
        FlowDefinition legacy = flow(List.of(start(), rule("r1", "R_G"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "R_FILL"), guardMerge("mr", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "h"), e("e4", "h", "mr"), e("e5", "mr", "end")));
        FlowDefinition fresh = flow(List.of(start(), rule("r1", "R_G"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "R_FILL"), task("mr"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "h"), e("e4", "h", "mr"), e("e5", "mr", "end")));
        same(legacy, fresh, Set.of("mr"), rec("X", new BigDecimal("5")));
        assertNull(both(fresh, rec("X", new BigDecimal("5"))).result().endedBy());
    }
}
```

- [ ] **Step 3: 실패하는 시험 — 받는 노드 실행(`RuleSetCatchTest.java` 끝에 더한다)**

`FlowFixtures` 의 `br`·`ifNode`·`other`·`task` 를 static import 에 더한다.
```java
    // ── implicit-join spec §5 — 돌아오는 자리·빈 단계 블록 ──

    @Test
    void 빈_단계에_붙은_받는_노드는_처리_갈래를_타지_않는다() {
        // start → t1(빈 단계) → n(R_AFTER) → end. c1(NO_RESULT) → h(R_FILL) → n.
        FlowDefinition f = flow(List.of(start(), task("t1"), catchNode("c1", "t1", "NO_RESULT"), rule("h", "R_FILL"), rule("n", "R_AFTER"), end()),
                List.of(e("e1", "start", "t1"), e("e2", "t1", "n"), e("e3", "c1", "h"), e("e4", "h", "n"), e("e5", "n", "end")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("5")));
        assertEquals(List.of("start:START:null", "t1:TASK:null", "n:RULE:0", "end:END:null"), path(r));
        assertEquals(List.of(), r.caught());
        assertFalse(r.finalValues().containsKey("G"));
        assertNum("10", r.finalValues().get("Z"));
        RunTrace t = trace(f, rec("X", new BigDecimal("5")));
        assertEquals(List.of("1:start:START:OK", "2:t1:TASK:OK", "3:n:RULE:OK", "4:end:END:OK"), kinds(t));
    }

    /** 새 형식 중첩 — r1(R_ERR) → after(R_AFTER) → end. c1 EVAL_ERROR → h1(R_G) → k(R_CODE) → after. c9(h1) NO_RESULT → f(R_FILL) → k. */
    static FlowDefinition nestedReturn() {
        return flow(List.of(start(), rule("r1", "R_ERR"), catchNode("c1", "r1", "EVAL_ERROR"), rule("h1", "R_G"), catchNode("c9", "h1", "NO_RESULT"),
                        rule("f", "R_FILL"), rule("k", "R_CODE"), rule("after", "R_AFTER"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "after"), e("e3", "c1", "h1"), e("e4", "h1", "k"), e("e5", "c9", "f"), e("e6", "f", "k"),
                        e("e7", "k", "after"), e("e8", "after", "end")));
    }

    @Test
    void 새_형식_중첩_처리_갈래는_돌아오는_자리에서_바깥_CATCH_값을_되찾고_합류_기록이_없다() {
        RuleSetResult r = run(nestedReturn(), rec("X", new BigDecimal("5")));
        assertEquals("EVALUATION_ERROR", r.finalValues().get("CODE"));
        assertNum("10", r.finalValues().get("Z"));
        assertNull(r.endedBy());
        assertEquals(List.of("start", "r1", "c1", "h1", "c9", "f", "k", "after", "end"), r.path().stream().map(RuleSetResult.PathStep::nodeId).toList());
    }

    @Test
    void 돌아오는_자리에_건_고친_값은_CATCH_를_되돌린_뒤에_들어간다() {
        // 순번 1 start, 2 r1(CAUGHT), 3 c1, 4 h1(CAUGHT), 5 c9, 6 f, 7 k, 8 after, 9 end. k 직전 고친 값이 안쪽 블록 되돌림에 지워지지 않는다(R3).
        RunTrace t = engine.traceSet(new RuleSetDefinition("DRAFT", List.of(), SetStatus.INUSE, nestedReturn()), rec("X", new BigDecimal("5")),
                SampleRules.EVAL_TS, List.of(new TraceEdit(7, "k", Map.of("CATCH_CODE", "EDITED"))));
        assertNull(t.violations());
        assertEquals("EDITED", t.finalValues().get("CODE"));
    }

    @Test
    void 돌아오는_자리가_IF_모이는_자리와_같으면_CATCH_를_되돌린_뒤_IF_도_닫힌다() {
        // if1 [b1 "X > 0" → r1(R_G) → j] [그 외 → x(R_B) → j] → j(R_AFTER) → end. r1 c1 NO_RESULT → h(R_CODE) → j.
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("r1", "R_G"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "R_CODE"), rule("x", "R_B"),
                        rule("j", "R_AFTER"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "r1", 1, "X > 0"), other("bo", "if1", "x"), e("e2", "r1", "j"), e("ec", "c1", "h"),
                        e("eh", "h", "j"), e("ex", "x", "j"), e("ej", "j", "end")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("5")));
        assertEquals("NO_RESULT", r.finalValues().get("CODE"));
        assertNum("10", r.finalValues().get("Z"));
        assertEquals(List.of("start", "if1", "r1", "c1", "h", "j", "end"), r.path().stream().map(RuleSetResult.PathStep::nodeId).toList());
        for (String k : r.finalValues().keySet()) {
            assertFalse(k.startsWith("CATCH_"), k);
        }
    }

    @Test
    void 병렬_갈래_안_처리_갈래가_병렬_합류로_돌아오면_갈래_범위에서_되돌린_뒤_합친다() {
        // p1 [1 → r1(R_G) → pm] [2 → y(R_B) → pm] → pm → end. r1 c1 NO_RESULT → h(R_FILL) → pm.
        FlowDefinition f = flow(List.of(start(), par("p1"), rule("r1", "R_G"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "R_FILL"), rule("y", "R_B"),
                        merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), pe("pa", "p1", "r1", 1), pe("pb", "p1", "y", 2), e("e2", "r1", "pm"), e("ec", "c1", "h"),
                        e("eh", "h", "pm"), e("ey", "y", "pm"), e("ee", "pm", "end")));
        RunTrace t = trace(f, rec("X", new BigDecimal("5")));
        NodeTrace pm = t.nodes().stream().filter(n -> n.nodeId().equals("pm")).findFirst().orElseThrow();
        assertEquals(List.of("G", "B"), pm.merged());
        assertEquals(List.of("G", "B"), List.copyOf(t.finalValues().keySet()));
    }
```

- [ ] **Step 4: 실패하는 시험 — 서버 기록 실행(`RuleSetRunnerTest.java`)**

`IF_FLOW` 상수 아래에 더한다:
```java
    /** 새 형식(합류 없음) — if1 [e2 "COIL_THK >= 3" → end](끝내는 갈래) [그 외 e3 → r1] → r1 → end. */
    static final String IF_FLOW_NEW = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"if1\",\"kind\":\"IF\"},"
            + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"QLTY_GRD_JDG\"},{\"id\":\"end\",\"kind\":\"END\"}],\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"if1\"},"
            + "{\"id\":\"e2\",\"from\":\"if1\",\"to\":\"end\",\"order\":1,\"cond\":\"COIL_THK >= 3\"},"
            + "{\"id\":\"e3\",\"from\":\"if1\",\"to\":\"r1\",\"otherwise\":true},{\"id\":\"e4\",\"from\":\"r1\",\"to\":\"end\"}]}";
```
`저장하지_않은_흐름도_기록_실행한다` 뒤에 더한다:
```java
    @Test
    void 새_형식_흐름은_합류_기록_없이_실행하고_IF_갈래로_끝내면_정상_완료다() {
        RunTrace t = runner.trace(IF_FLOW_NEW, RECORD, TS);
        assertNull(t.violations());
        assertNull(t.endedBy());
        assertEquals(List.of("start", "if1", "r1", "end"), t.nodes().stream().map(RunTrace.NodeTrace::nodeId).toList());
        assertEquals("A", t.finalValues().get("QLTY_GRD"));
        RunTrace ended = runner.trace(IF_FLOW_NEW, Map.of("COIL_THK", new BigDecimal("3.5"), "COIL_WID", new BigDecimal("1200"), "SURF_GRD", "A"), TS);
        assertNull(ended.violations());
        assertNull(ended.endedBy());
        assertEquals(List.of("start", "if1", "end"), ended.nodes().stream().map(RunTrace.NodeTrace::nodeId).toList());
        assertEquals(Map.of(), ended.finalValues());
    }
```

- [ ] **Step 5: 실패 확인**

Run: `(cd src/backend/maru-mdm-engine && ../gradlew test --tests '*RuleSetIfEndTest' --tests '*RuleSetLegacyMergeTest' --tests '*RuleSetCatchTest' --console=plain)`
Expected: FAIL — 끝내는 갈래 뒤 노드가 실행되거나(END 로 가는 갈래 몸이 끝나면 `seq` 가 그대로 끝나 모이는 자리를 이어 돈다), 빈 단계 블록에서 `ClassCastException`(SEAM(T2)), 새 형식 돌아오는 자리에서 `CATCH_*` 가 남아 `CODE` 가 `NO_RESULT` 로 나온다.

- [ ] **Step 6: `FlowRun.java` 구현**

클래스 Javadoc 둘째 문단을 바꾼다:
```java
 * <p>받는 노드 블록(받는 노드 spec §4, implicit-join spec §5): 단계가 실패했거나 결과가 없는데 그 종류를 받는 노드가 있으면 결과를 ctx 에 쓰지 않고
 * 룰 직전 ctx 로 되돌린 뒤 CATCH_* 넷을 넣고 처리 갈래를 실행한다. 블록이 돌아오는 자리(joinId)로 끝나면 CATCH_* 를 룰 직전 값으로 되돌리고
 * (중첩이면 바깥 값, R4) 옛 형식이면 MERGE 를 기록한다. 처리 갈래가 END 에 닿으면 {@link Ended} 로 세트를 끝낸다. 빈 단계 블록은 처리 갈래를 타지 않는다.
 * 끝내는 IF 갈래는 몸을 실행한 뒤 {@code Ended(null)} 을 던진다 — 처리 갈래 안이면 그 받는 노드의 끝냄으로 바꾼다(J-D18).
```
`Ended` 를 바꾼다:
```java
    /** 끝냄 신호 — 위반이 아닌 제어 신호(R5, implicit-join R6). 처리 갈래 안 끝냄이면 그 받는 노드 ID, 끝내는 IF 갈래면 null. {@link #run} 이 받는다. */
    static final class Ended extends RuntimeException {
        private static final long serialVersionUID = 1L;
        final String catchNodeId;

        Ended(@Nullable String catchNodeId) {
            super(null, null, false, false);
            this.catchNodeId = catchNodeId;
        }
    }
```
(`import kr.dongkuk.maru.mdm.engine.spi.Nullable;` 를 더한다. `endedBy` 필드 주석은 "처리 갈래 안에서 끝냈으면 그 받는 노드 ID(끝내는 IF 갈래로 끝나면 null)" 로.)

`plain` 을 기록 부분과 나눈다:
```java
    /** 칸 없는 노드(START·END·TASK). */
    private void plain(String nodeId, NodeKind kind, Map<String, Object> ctx, Map<String, Object> made) {
        begin(nodeId, kind);
        edit(ctx, made);
        record(nodeId, kind);
    }

    /** 칸 없는 노드의 path·기록. */
    private void record(String nodeId, NodeKind kind) {
        path.add(new PathStep(nodeId, kind, null, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, nodeId, kind, NodeStatus.OK, null, null, null, null, null, null, null,
                    null, null, null, null, null, null));
        }
    }
```
`guarded` 를 둘로 나눈다(SEAM(T2) 줄을 없앤다):
```java
    /** 받는 노드 블록(받는 노드 spec §4, implicit-join spec §5). */
    private void guarded(Guarded g, Map<String, Object> ctx, Map<String, Object> made) {
        Map<String, Object> outer = catchValues(ctx);
        if (g.step() instanceof TaskStep t) {
            // 빈 단계는 실패하지 않는다 — 처리 갈래를 타지 않는다(J-D4). 정상 갈래 입력 키는 기록 전에 본다(R5).
            begin(t.nodeId(), NodeKind.TASK);
            edit(ctx, made);
            List<Violation> missing = keys.check(g.normal(), ctx.keySet());
            if (!missing.isEmpty()) {
                throw new EngineEvaluationException(missing);
            }
            record(t.nodeId(), NodeKind.TASK);
            seq(g.normal(), ctx, made);
        } else {
            guardedRule((RuleStep) g.step(), g, ctx, made);
        }
        if (g.joinId() != null) {
            restoreCatch(ctx, outer); // R3·R4 — 돌아오는 자리를 시작하기 전에 룰 직전 값으로(중첩이면 바깥 값)
            if (g.mergeId() != null) { // 옛 형식 돌아오는 MERGE 만 기록한다
                begin(g.mergeId(), NodeKind.MERGE);
                edit(ctx, made);
                path.add(new PathStep(g.mergeId(), NodeKind.MERGE, null, null));
                if (tracing) {
                    nodes.add(new NodeTrace(nodes.size() + 1, g.mergeId(), NodeKind.MERGE, NodeStatus.OK, null, null, null, null, null,
                            null, null, g.nodeId(), null, null, null, null, null));
                }
            }
        }
    }

    /** 룰이 받는 노드 블록의 단계일 때 — 받기 판정·정상 갈래·처리 갈래. */
    private void guardedRule(RuleStep r, Guarded g, Map<String, Object> ctx, Map<String, Object> made) {
        RuleDefinition def = startRule(r, ctx, made);
        Map<String, Object> before = new LinkedHashMap<>(ctx);
        RuleResult ok = null;
        Caught c;
        try {
            throwMissing(r, def, ctx);
            RuleResult result = evaluator.evaluate(def, ctx, ts);
            c = noResult(g, result);
            if (c == null) {
                ok = result;
            }
        } catch (EngineEvaluationException e) {
            c = caughtOf(g, e);
            if (c == null) {
                throw e;
            }
        }
        if (ok != null) {
            // 정상 갈래 입력 키(R6) — 결과를 넣기 전에 "ctx 키 ∪ 결과 이름" 으로 본다. 실패하면 이 룰 노드가 ERROR 다(받기 try 밖).
            Set<String> available = new HashSet<>(ctx.keySet());
            available.addAll(ok.results().keySet());
            List<Violation> missing = keys.check(g.normal(), available);
            if (!missing.isEmpty()) {
                throw new EngineEvaluationException(missing);
            }
            accept(r, ok, ctx, made);
            seq(g.normal(), ctx, made);
            return;
        }
        ctx.clear();
        ctx.putAll(before); // 룰이 바꿔 넣은 입력 타입을 되돌린다(편차 F6)
        caughtRule(r, c);
        catchNode(r, c, ctx, made);
        try {
            seq(c.handler.body(), ctx, made);
        } catch (Ended e) {
            // 처리 갈래 안 IF 끝냄(Ended(null))은 이 받는 노드의 끝냄이다(J-D18). 안쪽 받는 노드 끝냄은 그대로 던진다.
            throw e.catchNodeId == null ? new Ended(c.handler.catchNodeId()) : e;
        }
        if (c.handler.ends()) {
            throw new Ended(c.handler.catchNodeId());
        }
    }
```
`ifSplit` 끝(`seq(chosen.body(), ctx, made);` 뒤)을 바꾼다:
```java
        seq(chosen.body(), ctx, made);
        if (chosen.ends()) {
            throw new Ended(null); // 끝내는 IF 갈래 — 정상 완료(J-D17)
        }
        if (s.mergeId() != null) {
            merge(s, null, ctx, made); // 옛 형식 IF 합류만 기록한다
        }
```

- [ ] **Step 7: `FlowKeys.java` — 이어지는 갈래만 센다**

`walk` 의 IF 가지에서 교집합·합집합을 이어지는 갈래로만 낸다(조건식 변수 검사는 모든 조건 갈래 그대로):
```java
                    Set<String> inter = null;
                    Set<String> any = new HashSet<>();
                    for (Branch br : s.branches()) {
                        if (br.ends()) {
                            continue; // 끝내는 갈래는 블록 뒤로 이어지지 않는다(implicit-join spec §5)
                        }
                        Set<String> made = sureProduced(br.body());
                        if (inter == null) {
                            inter = new HashSet<>(made);
                        } else {
                            inter.retainAll(made);
                        }
                        any.addAll(allProduced(br.body()));
                    }
                    if (inter != null) {
                        sure.addAll(inter);
                        maybe.removeAll(inter);
                    }
                    any.removeAll(sure);
                    maybe.addAll(any);
```
`sureProduced` 의 IF 가지 반복 첫 줄에 `if (br.ends()) { continue; }` 를 더한다. `allProduced` 의 `case Split s ->` 를 둘로 나눈다:
```java
                case Split s when s.kind() == NodeKind.IF ->
                        s.branches().stream().filter(br -> !br.ends()).forEach(br -> out.addAll(allProduced(br.body())));
                case Split s -> s.branches().forEach(br -> out.addAll(allProduced(br.body())));
```
클래스 Javadoc 끝에 한 문장을 더한다: `IF 의 반드시·있을 수 있는 이름은 이어지는 갈래만 센다 — 끝내는 IF 갈래는 블록 뒤로 이어지지 않는다(implicit-join spec §5).`

- [ ] **Step 8: 통과 확인**

Run: `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)` 와 `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetRunnerTest' --tests '*RuleSetSimulateTest' --tests '*DmeOasisHttpTest' --console=plain)`
Expected: 모두 PASS. `RuleSetSimulateTest` 골든(옛 형식)·`rule-set-trace-golden.json` 이 바뀌면 옛 형식 결과가 바뀐 것이므로 구현을 고친다(골든을 고치지 않는다). `grep -rn "SEAM(T2)" src/backend` → 0건. OASIS BPMN 은 `path` 의 MERGE 항목에 기대지 않는다 — `grep -n "path" src/backend/mdm/api/src/main/resources/services/dme/ruleSetEdit.bpmn src/backend/mdm/api/src/test/resources/services/probe/ruleSetRunProbe.bpmn` → 0건(계획 작성 때 확인, 스펙 §5 마지막 줄).

- [ ] **Step 9: 커밋**

```bash
/usr/bin/git add src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowKeys.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetIfEndTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetLegacyMergeTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetCatchTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunnerTest.java
/usr/bin/git commit -m "feat(mdm): 룰 세트 엔진이 끝내는 IF 갈래·돌아오는 자리·빈 단계 받는 노드를 실행한다(D-136)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowKeys.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetIfEndTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetLegacyMergeTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetCatchTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunnerTest.java
```

---

### Task 3: 정적 검사 — 끝내는 IF 갈래·TASK 블록 경로 상태, 경로 코퍼스, 새 형식 퍼즈 생성기

**등급:** capable — Java 분석기·확정 검사·TS 분석기를 같은 규칙으로 바꾸고 퍼즈 생성기를 새 형식으로 다시 쓴다.
**병렬:** Task 1 병합 뒤. Task 2·4 와 함께 돌 수 있다.

**Files:**
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetAnalyzer.java`(`PathWalk.split`)·`RuleSetPathState.java`(`Walk.seq` 의 Split 가지·클래스 Javadoc)·`check/ledger/RuleSetOrderCheck.java`(`collectPairs`·`ruleNodes`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts`(`walk` 의 분기 가지)
- Modify: `src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json`·`rule-set-fuzz.json`, `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowFuzz.java`·`RuleSetCorpusTest.java`·`RuleSetPathStateTest.java`, `src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts`

**Interfaces:**
- Consumes(Task 1): `Branch.ends()`/`ends`, `Guarded.step()`/`step`, `RuleStep`.
- Produces: 분석 규칙 — IF 블록 뒤 상태(`defined`·`maybe`·`prodBy`)는 이어지는 갈래만 합친다. 퍼즈 파일은 새 형식 IF(끝내는 갈래 15%)와 옛 형식 IF(20%)를 섞는다.

- [ ] **Step 1: 실패하는 시험 — 경로 상태(`RuleSetPathStateTest.java` 끝에 더한다)**

```java
    @Test
    void 끝내는_IF_갈래는_블록_뒤_상태에_들지_않는다() {
        EDGES.clear();
        // start → if1 [b1 "X > 0" → r1(R_A) → end](끝내는 갈래) [그 외 → r2(R_B)] → r2 → r3 → end
        String e = String.join(",", edge("start", "if1", ""), edge("if1", "r1", "\"order\":1,\"cond\":\"X > 0\""), edge("if1", "r2", "\"otherwise\":true"),
                edge("r1", "end", ""), edge("r2", "r3", ""), edge("r3", "end", ""));
        Map<String, At> b = before(String.join(",", split("if1", "IF"), rule("r1", "R_A"), rule("r2", "R_B"), rule("r3", "R_C")), e);

        assertEquals(at(Set.of(), Set.of()), b.get("r1"));
        assertEquals(at(Set.of(), Set.of()), b.get("r2"), "끝내는 갈래(r1)의 Y·Z 는 블록 뒤에 없다");
        assertEquals(at(Set.of("Y"), Set.of()), b.get("r3"));
    }
```

- [ ] **Step 2: 경로 코퍼스 사례 12개(N1·N4·N8·N9·N11·N12·N13·N14·N19·N22·N23·N24)**

`rule-set-corpus.json` `cases` 끝에 더한다. N19·N22·N23 은 끝내는 갈래 규칙 없이는 기대와 다르다(각각 FLOW_PARTIAL·DUP_RESULT·FLOW_PARTIAL 이 난다) — 지금 실패해야 한다.
```json
    {
      "name": "흐름 — 새 형식 IF 정상, 갈래가 다음 노드로 바로 모이고 갈래마다 같은 결과 이름(N1)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "if1", "kind": "IF" }, { "id": "r1", "kind": "RULE", "ruleId": "D1" }, { "id": "r2", "kind": "RULE", "ruleId": "D2" },
          { "id": "r3", "kind": "RULE", "ruleId": "D3" }, { "id": "r4", "kind": "RULE", "ruleId": "FIN" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e1", "from": "start", "to": "if1" }, { "id": "e2", "from": "if1", "to": "r1", "order": 1, "cond": "DESIGN_NEED == \"N\"" },
          { "id": "e3", "from": "if1", "to": "r2", "order": 2, "cond": "REPEAT_YN == \"Y\"" }, { "id": "e4", "from": "if1", "to": "r3", "otherwise": true },
          { "id": "e5", "from": "r1", "to": "r4" }, { "id": "e6", "from": "r2", "to": "r4" }, { "id": "e7", "from": "r3", "to": "r4" }, { "id": "e9", "from": "r4", "to": "end" }] },
      "condIo": { "e2": { "ok": true, "message": null, "vars": [{ "name": "DESIGN_NEED", "source": "DICT" }] },
        "e3": { "ok": true, "message": null, "vars": [{ "name": "REPEAT_YN", "source": "DICT" }] } },
      "ids": ["D1", "D2", "D3", "FIN"],
      "rules": {
        "D1": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "DESIGN_NEED", "source": "DICT" }], "results": [{ "name": "PLAN" }] },
        "D2": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "REPEAT_YN", "source": "DICT" }], "results": [{ "name": "PLAN" }] },
        "D3": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "ORDER_TYPE", "source": "DICT" }], "results": [{ "name": "PLAN" }] },
        "FIN": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "PLAN", "source": "NONE" }], "results": [{ "name": "CONFIRMED" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "DESIGN_NEED", "source": "DICT", "users": ["D1"] }, { "name": "REPEAT_YN", "source": "DICT", "users": ["D2"] },
            { "name": "ORDER_TYPE", "source": "DICT", "users": ["D3"] }],
          "results": [{ "name": "PLAN", "by": ["D1", "D2", "D3"], "readers": ["FIN"] }, { "name": "CONFIRMED", "by": ["FIN"], "readers": [] }] },
        "deps": { "D1": [], "D2": [], "D3": [], "FIN": ["D1", "D2", "D3"] },
        "checks": []
      }
    },
    {
      "name": "흐름 — 중첩 IF 두 개가 같은 노드에서 모이고 모인 뒤 읽기는 교집합 규칙(N4)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "if1", "kind": "IF" }, { "id": "if2", "kind": "IF" }, { "id": "a", "kind": "RULE", "ruleId": "A" },
          { "id": "b", "kind": "RULE", "ruleId": "B" }, { "id": "c", "kind": "RULE", "ruleId": "C" }, { "id": "z", "kind": "RULE", "ruleId": "Z" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e0", "from": "start", "to": "if1" }, { "id": "b1", "from": "if1", "to": "if2", "order": 1, "cond": "X > 0" },
          { "id": "bo", "from": "if1", "to": "c", "otherwise": true }, { "id": "d1", "from": "if2", "to": "a", "order": 1, "cond": "X > 1" },
          { "id": "do", "from": "if2", "to": "b", "otherwise": true }, { "id": "ea", "from": "a", "to": "z" }, { "id": "eb", "from": "b", "to": "z" },
          { "id": "ec", "from": "c", "to": "z" }, { "id": "ez", "from": "z", "to": "end" }] },
      "condIo": { "b1": { "ok": true, "message": null, "vars": [{ "name": "X", "source": "DICT" }] }, "d1": { "ok": true, "message": null, "vars": [{ "name": "X", "source": "DICT" }] } },
      "ids": ["A", "B", "C", "Z"],
      "rules": {
        "A": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "R1" }] },
        "B": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "R1" }] },
        "C": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "R2" }] },
        "Z": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "R1", "source": "NONE" }], "results": [{ "name": "ZZ" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["A", "B", "C"] }],
          "results": [{ "name": "R1", "by": ["A", "B"], "readers": ["Z"] }, { "name": "R2", "by": ["C"], "readers": [] }, { "name": "ZZ", "by": ["Z"], "readers": [] }] },
        "deps": { "A": [], "B": [], "C": [], "Z": ["A", "B"] },
        "checks": [{ "code": "FLOW_PARTIAL", "severity": "WARN", "ruleId": "Z", "varName": "R1", "message": "Z가 읽는 R1는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다", "nodeId": "z" }]
      }
    },
    {
      "name": "받는 노드 — 처리 갈래가 룰 바로 뒤 노드로 돌아오면 정상 갈래가 비고 교집합 뒤 DUP_RESULT 가 아니다(N8)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "r1", "kind": "RULE", "ruleId": "G" }, { "id": "c1", "kind": "CATCH", "attachTo": "r1", "catches": ["NO_RESULT"] },
          { "id": "h", "kind": "RULE", "ruleId": "H" }, { "id": "n", "kind": "RULE", "ruleId": "F" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e1", "from": "start", "to": "r1" }, { "id": "e2", "from": "r1", "to": "n" }, { "id": "e3", "from": "c1", "to": "h" }, { "id": "e4", "from": "h", "to": "n" },
          { "id": "e5", "from": "n", "to": "end" }] },
      "ids": ["G", "H", "F"],
      "rules": {
        "G": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "H": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "F": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "V", "source": "NONE" }], "results": [{ "name": "W" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["G", "H"] }], "results": [{ "name": "V", "by": ["G", "H"], "readers": ["F"] }, { "name": "W", "by": ["F"], "readers": [] }] },
        "deps": { "G": [], "H": [], "F": ["G", "H"] },
        "checks": []
      }
    },
    {
      "name": "받는 노드 — 처리 갈래가 정상 경로 중간 노드로 돌아오면 정상 갈래에서만 만든 이름은 일부 갈래다(N9)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "r1", "kind": "RULE", "ruleId": "G" }, { "id": "n1", "kind": "RULE", "ruleId": "K" },
          { "id": "c1", "kind": "CATCH", "attachTo": "r1", "catches": ["NO_RESULT"] }, { "id": "h", "kind": "RULE", "ruleId": "H" }, { "id": "n2", "kind": "RULE", "ruleId": "F" },
          { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e1", "from": "start", "to": "r1" }, { "id": "e2", "from": "r1", "to": "n1" }, { "id": "e3", "from": "n1", "to": "n2" }, { "id": "e4", "from": "c1", "to": "h" },
          { "id": "e5", "from": "h", "to": "n2" }, { "id": "e6", "from": "n2", "to": "end" }] },
      "ids": ["G", "K", "H", "F"],
      "rules": {
        "G": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "K": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "U" }] },
        "H": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "F": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "V", "source": "NONE" }, { "name": "U", "source": "NONE" }], "results": [{ "name": "W" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["G", "K", "H"] }],
          "results": [{ "name": "V", "by": ["G", "H"], "readers": ["F"] }, { "name": "U", "by": ["K"], "readers": ["F"] }, { "name": "W", "by": ["F"], "readers": [] }] },
        "deps": { "G": [], "K": [], "H": [], "F": ["G", "K", "H"] },
        "checks": [{ "code": "FLOW_PARTIAL", "severity": "WARN", "ruleId": "F", "varName": "U", "message": "F가 읽는 U는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다", "nodeId": "n2" }]
      }
    },
    {
      "name": "받는 노드 — 처리 갈래 안 IF 의 한 갈래만 END 로 가고 나머지는 돌아오는 자리로 간다(N11)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "r1", "kind": "RULE", "ruleId": "G" }, { "id": "c1", "kind": "CATCH", "attachTo": "r1", "catches": ["NO_RESULT"] },
          { "id": "if1", "kind": "IF" }, { "id": "e", "kind": "RULE", "ruleId": "E" }, { "id": "h", "kind": "RULE", "ruleId": "H" }, { "id": "n", "kind": "RULE", "ruleId": "F" },
          { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e1", "from": "start", "to": "r1" }, { "id": "e2", "from": "r1", "to": "n" }, { "id": "e3", "from": "c1", "to": "if1" },
          { "id": "b1", "from": "if1", "to": "e", "order": 1, "cond": "X > 0" }, { "id": "bo", "from": "if1", "to": "h", "otherwise": true },
          { "id": "ee", "from": "e", "to": "end" }, { "id": "eh", "from": "h", "to": "n" }, { "id": "en", "from": "n", "to": "end" }] },
      "condIo": { "b1": { "ok": true, "message": null, "vars": [{ "name": "X", "source": "DICT" }] } },
      "ids": ["G", "E", "H", "F"],
      "rules": {
        "G": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "E": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "Q" }] },
        "H": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "F": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "V", "source": "NONE" }], "results": [{ "name": "W" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["G", "E", "H"] }],
          "results": [{ "name": "V", "by": ["G", "H"], "readers": ["F"] }, { "name": "Q", "by": ["E"], "readers": [] }, { "name": "W", "by": ["F"], "readers": [] }] },
        "deps": { "G": [], "E": [], "H": [], "F": ["G", "H"] },
        "checks": []
      }
    },
    {
      "name": "받는 노드 — 처리 갈래 안 IF 의 모든 갈래가 따로 END 로 가면 끝내는 처리 갈래이고 교집합에서 뺀다(N12)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "r1", "kind": "RULE", "ruleId": "G" }, { "id": "c1", "kind": "CATCH", "attachTo": "r1", "catches": ["NO_RESULT"] },
          { "id": "if1", "kind": "IF" }, { "id": "e", "kind": "RULE", "ruleId": "E" }, { "id": "h", "kind": "RULE", "ruleId": "H" }, { "id": "n", "kind": "RULE", "ruleId": "F" },
          { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e1", "from": "start", "to": "r1" }, { "id": "e2", "from": "r1", "to": "n" }, { "id": "e3", "from": "c1", "to": "if1" },
          { "id": "b1", "from": "if1", "to": "e", "order": 1, "cond": "X > 0" }, { "id": "bo", "from": "if1", "to": "h", "otherwise": true },
          { "id": "ee", "from": "e", "to": "end" }, { "id": "eh", "from": "h", "to": "end" }, { "id": "en", "from": "n", "to": "end" }] },
      "condIo": { "b1": { "ok": true, "message": null, "vars": [{ "name": "X", "source": "DICT" }] } },
      "ids": ["G", "E", "H", "F"],
      "rules": {
        "G": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "E": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "EE" }] },
        "H": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "HH" }] },
        "F": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "V", "source": "NONE" }], "results": [{ "name": "W" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["G", "E", "H"] }],
          "results": [{ "name": "V", "by": ["G"], "readers": ["F"] }, { "name": "EE", "by": ["E"], "readers": [] }, { "name": "HH", "by": ["H"], "readers": [] },
            { "name": "W", "by": ["F"], "readers": [] }] },
        "deps": { "G": [], "E": [], "H": [], "F": ["G"] },
        "checks": []
      }
    },
    {
      "name": "받는 노드 — 돌아오는 자리가 IF 의 모이는 자리와 같다(N13)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "if1", "kind": "IF" }, { "id": "r1", "kind": "RULE", "ruleId": "G" },
          { "id": "c1", "kind": "CATCH", "attachTo": "r1", "catches": ["NO_RESULT"] }, { "id": "h", "kind": "RULE", "ruleId": "H" }, { "id": "x", "kind": "RULE", "ruleId": "K" },
          { "id": "j", "kind": "RULE", "ruleId": "F" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e0", "from": "start", "to": "if1" }, { "id": "b1", "from": "if1", "to": "r1", "order": 1, "cond": "X > 0" },
          { "id": "bo", "from": "if1", "to": "x", "otherwise": true }, { "id": "e2", "from": "r1", "to": "j" }, { "id": "ec", "from": "c1", "to": "h" },
          { "id": "eh", "from": "h", "to": "j" }, { "id": "ex", "from": "x", "to": "j" }, { "id": "ej", "from": "j", "to": "end" }] },
      "condIo": { "b1": { "ok": true, "message": null, "vars": [{ "name": "X", "source": "DICT" }] } },
      "ids": ["G", "H", "K", "F"],
      "rules": {
        "G": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "H": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "K": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "F": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "V", "source": "NONE" }], "results": [{ "name": "W" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["G", "H", "K"] }], "results": [{ "name": "V", "by": ["G", "H", "K"], "readers": ["F"] }, { "name": "W", "by": ["F"], "readers": [] }] },
        "deps": { "G": [], "H": [], "K": [], "F": ["G", "H", "K"] },
        "checks": []
      }
    },
    {
      "name": "받는 노드 — 병렬 갈래 안 받는 노드가 병렬 합류로 돌아온다(N14)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "p1", "kind": "PARALLEL" }, { "id": "r1", "kind": "RULE", "ruleId": "G" },
          { "id": "c1", "kind": "CATCH", "attachTo": "r1", "catches": ["NO_RESULT"] }, { "id": "h", "kind": "RULE", "ruleId": "H" }, { "id": "y", "kind": "RULE", "ruleId": "K" },
          { "id": "pm", "kind": "MERGE", "splitId": "p1" }, { "id": "z", "kind": "RULE", "ruleId": "F" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e0", "from": "start", "to": "p1" }, { "id": "pa", "from": "p1", "to": "r1", "order": 1 }, { "id": "pb", "from": "p1", "to": "y", "order": 2 },
          { "id": "e2", "from": "r1", "to": "pm" }, { "id": "ec", "from": "c1", "to": "h" }, { "id": "eh", "from": "h", "to": "pm" }, { "id": "ey", "from": "y", "to": "pm" },
          { "id": "ep", "from": "pm", "to": "z" }, { "id": "ez", "from": "z", "to": "end" }] },
      "ids": ["G", "H", "K", "F"],
      "rules": {
        "G": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "H": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "K": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "U" }] },
        "F": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "V", "source": "NONE" }, { "name": "U", "source": "NONE" }], "results": [{ "name": "W" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["G", "H", "K"] }],
          "results": [{ "name": "V", "by": ["G", "H"], "readers": ["F"] }, { "name": "U", "by": ["K"], "readers": ["F"] }, { "name": "W", "by": ["F"], "readers": [] }] },
        "deps": { "G": [], "H": [], "K": [], "F": ["G", "H", "K"] },
        "checks": []
      }
    },
    {
      "name": "흐름 — 끝내는 갈래(몸 있음) 하나와 이어지는 갈래 둘, 끝내는 갈래에서만 만든 이름을 블록 뒤에서 읽으면 NONE 은 UNKNOWN_INPUT·PROG 는 통과(N19)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "if1", "kind": "IF" }, { "id": "e", "kind": "RULE", "ruleId": "E" }, { "id": "a", "kind": "RULE", "ruleId": "A" },
          { "id": "b", "kind": "RULE", "ruleId": "B" }, { "id": "x", "kind": "RULE", "ruleId": "F" }, { "id": "y", "kind": "RULE", "ruleId": "G" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e0", "from": "start", "to": "if1" }, { "id": "b1", "from": "if1", "to": "e", "order": 1, "cond": "X > 0" },
          { "id": "b2", "from": "if1", "to": "a", "order": 2, "cond": "X > 1" }, { "id": "bo", "from": "if1", "to": "b", "otherwise": true },
          { "id": "ee", "from": "e", "to": "end" }, { "id": "ea", "from": "a", "to": "x" }, { "id": "eb", "from": "b", "to": "x" }, { "id": "ex", "from": "x", "to": "y" },
          { "id": "ey", "from": "y", "to": "end" }] },
      "condIo": { "b1": { "ok": true, "message": null, "vars": [{ "name": "X", "source": "DICT" }] }, "b2": { "ok": true, "message": null, "vars": [{ "name": "X", "source": "DICT" }] } },
      "ids": ["E", "A", "B", "F", "G"],
      "rules": {
        "E": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "Q" }] },
        "A": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "B": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "F": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "Q", "source": "NONE" }, { "name": "V", "source": "NONE" }], "results": [{ "name": "FF" }] },
        "G": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "Q", "source": "PROG" }], "results": [{ "name": "GG" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["E", "A", "B"] }],
          "results": [{ "name": "Q", "by": ["E"], "readers": ["F", "G"] }, { "name": "V", "by": ["A", "B"], "readers": ["F"] }, { "name": "FF", "by": ["F"], "readers": [] },
            { "name": "GG", "by": ["G"], "readers": [] }] },
        "deps": { "E": [], "A": [], "B": [], "F": ["E", "A", "B"], "G": ["E"] },
        "checks": [{ "code": "UNKNOWN_INPUT", "severity": "REJECT", "ruleId": "F", "varName": "Q", "message": "F의 조건 변수 Q는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다", "nodeId": "x" }]
      }
    },
    {
      "name": "흐름 — 끝내는 갈래와 IF 뒤가 같은 결과 변수를 써도 DUP_RESULT 가 아니다(N22)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "if1", "kind": "IF" }, { "id": "e", "kind": "RULE", "ruleId": "E" }, { "id": "a", "kind": "RULE", "ruleId": "A" },
          { "id": "z", "kind": "RULE", "ruleId": "Z" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e0", "from": "start", "to": "if1" }, { "id": "b1", "from": "if1", "to": "e", "order": 1, "cond": "X > 0" },
          { "id": "bo", "from": "if1", "to": "a", "otherwise": true }, { "id": "ee", "from": "e", "to": "end" }, { "id": "ea", "from": "a", "to": "z" },
          { "id": "ez", "from": "z", "to": "end" }] },
      "condIo": { "b1": { "ok": true, "message": null, "vars": [{ "name": "X", "source": "DICT" }] } },
      "ids": ["E", "A", "Z"],
      "rules": {
        "E": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "A": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "RA" }] },
        "Z": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["E", "A", "Z"] }], "results": [{ "name": "V", "by": ["E", "Z"], "readers": [] }, { "name": "RA", "by": ["A"], "readers": [] }] },
        "deps": { "E": [], "A": [], "Z": [] },
        "checks": []
      }
    },
    {
      "name": "흐름 — 병렬 갈래 안 IF 의 끝내는 갈래는 구조 정상이고 병렬 합류 뒤 상태에 끝내는 갈래 결과가 없다(N23)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "p1", "kind": "PARALLEL" }, { "id": "if1", "kind": "IF" }, { "id": "e", "kind": "RULE", "ruleId": "E" },
          { "id": "a", "kind": "RULE", "ruleId": "A" }, { "id": "b", "kind": "RULE", "ruleId": "B" }, { "id": "pm", "kind": "MERGE", "splitId": "p1" },
          { "id": "z", "kind": "RULE", "ruleId": "F" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e0", "from": "start", "to": "p1" }, { "id": "pa", "from": "p1", "to": "if1", "order": 1 }, { "id": "pb", "from": "p1", "to": "b", "order": 2 },
          { "id": "d1", "from": "if1", "to": "e", "order": 1, "cond": "X > 0" }, { "id": "do", "from": "if1", "to": "a", "otherwise": true },
          { "id": "ee", "from": "e", "to": "end" }, { "id": "ea", "from": "a", "to": "pm" }, { "id": "eb", "from": "b", "to": "pm" }, { "id": "ep", "from": "pm", "to": "z" },
          { "id": "ez", "from": "z", "to": "end" }] },
      "condIo": { "d1": { "ok": true, "message": null, "vars": [{ "name": "X", "source": "DICT" }] } },
      "ids": ["E", "A", "B", "F"],
      "rules": {
        "E": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "Q" }] },
        "A": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "B": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "U" }] },
        "F": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "V", "source": "NONE" }, { "name": "Q", "source": "NONE" }], "results": [{ "name": "W" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["E", "A", "B"] }],
          "results": [{ "name": "Q", "by": ["E"], "readers": ["F"] }, { "name": "V", "by": ["A"], "readers": ["F"] }, { "name": "U", "by": ["B"], "readers": [] },
            { "name": "W", "by": ["F"], "readers": [] }] },
        "deps": { "E": [], "A": [], "B": [], "F": ["E", "A"] },
        "checks": [{ "code": "UNKNOWN_INPUT", "severity": "REJECT", "ruleId": "F", "varName": "Q", "message": "F의 조건 변수 Q는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다", "nodeId": "z" }]
      }
    },
    {
      "name": "흐름 — 끝날 것 같은 두 갈래가 한 노드를 함께 지난 뒤 END 로 가면 이어지는 갈래로 보고 모이는 자리를 계산한다(N24)",
      "flow": { "version": 1,
        "nodes": [{ "id": "start", "kind": "START" }, { "id": "if1", "kind": "IF" }, { "id": "a", "kind": "RULE", "ruleId": "A" }, { "id": "b", "kind": "RULE", "ruleId": "B" },
          { "id": "c", "kind": "RULE", "ruleId": "C" }, { "id": "s", "kind": "RULE", "ruleId": "S" }, { "id": "end", "kind": "END" }],
        "edges": [{ "id": "e0", "from": "start", "to": "if1" }, { "id": "b1", "from": "if1", "to": "a", "order": 1, "cond": "X > 0" },
          { "id": "b2", "from": "if1", "to": "b", "order": 2, "cond": "X > 1" }, { "id": "bo", "from": "if1", "to": "c", "otherwise": true },
          { "id": "ea", "from": "a", "to": "s" }, { "id": "eb", "from": "b", "to": "s" }, { "id": "ec", "from": "c", "to": "end" }, { "id": "es", "from": "s", "to": "end" }] },
      "condIo": { "b1": { "ok": true, "message": null, "vars": [{ "name": "X", "source": "DICT" }] }, "b2": { "ok": true, "message": null, "vars": [{ "name": "X", "source": "DICT" }] } },
      "ids": ["A", "B", "C", "S"],
      "rules": {
        "A": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "B": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "C": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "X", "source": "DICT" }], "results": [{ "name": "V" }] },
        "S": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "V", "source": "NONE" }], "results": [{ "name": "W" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "X", "source": "DICT", "users": ["A", "B", "C"] }], "results": [{ "name": "V", "by": ["A", "B", "C"], "readers": ["S"] }, { "name": "W", "by": ["S"], "readers": [] }] },
        "deps": { "A": [], "B": [], "C": [], "S": ["A", "B", "C"] },
        "checks": []
      }
    }
```
두 러너의 `MIN_CASES` 를 78 → **90** 으로 함께 올린다.

- [ ] **Step 3: 실패 확인**

Run: `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetCorpusTest' --tests '*RuleSetPathStateTest' --console=plain)`
Expected: FAIL — N19(`FLOW_PARTIAL` 이 대신 남), N22(`DUP_RESULT E와 Z가…`), N23(`FLOW_PARTIAL`), `끝내는_IF_갈래는_블록_뒤_상태에_들지_않는다`. 나머지 새 사례는 통과해도 된다(Task 1 규칙만으로 맞는 사례).

- [ ] **Step 4: Java 분석기 — 이어지는 갈래만 합친다**

`RuleSetAnalyzer.PathWalk.split` 의 갈래 반복을 바꾼다:
```java
            List<State> outs = new ArrayList<>();
            for (Branch br : sp.branches()) {
                State b = st.copy();
                seq(br.body(), b);
                if (!br.ends()) {
                    outs.add(b); // 끝내는 IF 갈래는 블록 뒤로 이어지지 않는다(implicit-join spec §6) — 조건식·몸 검사는 했다
                }
            }
```
`RuleSetPathState.Walk.seq` 의 `Split` 가지도 같게 바꾼다(`seq(br.body(), copy);` 뒤 `if (!br.ends()) { outs.add(copy); }`). 클래스 Javadoc 의 IF 줄 끝에 `끝내는 IF 갈래(implicit-join spec §2.2)는 합치지 않는다.` 를 더한다.

`RuleSetOrderCheck`(R16) — `collectPairs` 의 `Guarded` 가지와 `ruleNodes` 를 바꾼다:
```java
        } else if (b instanceof Guarded g) {
            collectPairs(g.normal(), out);
            for (Guarded.Handler h : g.handlers()) {
                if (g.step() instanceof RuleStep) {
                    List<String> inside = new ArrayList<>();
                    ruleNodes(h.body(), inside);
                    inside.forEach(id -> out.add(new NodePair(g.nodeId(), id)));
                }
                collectPairs(h.body(), out);
            }
        }
```
```java
        } else if (b instanceof Guarded g) {
            if (g.step() instanceof RuleStep) {
                out.add(g.nodeId());
            }
            ruleNodes(g.normal(), out);
            g.handlers().forEach(h -> ruleNodes(h.body(), out));
        }
```

- [ ] **Step 5: TS 분석기 — `set-model.ts` `walk` 분기 가지**

```ts
      else {
        if (b.kind === "IF") for (const br of b.branches) if (!br.otherwise) cond(b.nodeId, br.edgeId, s);
        const ends: PathState[] = [];
        for (const br of b.branches) {
          const sb = copyState(s);
          walk(br.body, sb);
          if (!br.ends) ends.push(sb); // 끝내는 IF 갈래는 블록 뒤로 이어지지 않는다(implicit-join spec §6)
        }
        mergeState(b.kind, s, ends);
      }
```
머리 주석 끝에 `IF 블록 뒤 상태는 이어지는 갈래만 합친다 — 끝내는 IF 갈래·끝내는 처리 갈래는 세지 않는다(implicit-join spec §6).` 를 더한다.

- [ ] **Step 6: 통과 확인**

Run: `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetCorpusTest' --tests '*RuleSetPathStateTest' --tests '*RuleSetAnalyzerTest' --console=plain)` 와 `cd src/frontend/m-mdm && node scripts/test.mjs --maxWorkers=3 tests/dme/ruleSetEdit/rule-set-corpus.test.ts tests/dme/ruleSetEdit/set-model.test.ts`
Expected: PASS(아직 퍼즈 파일은 Task 1 이 다시 쓴 것 — 그대로 통과).

- [ ] **Step 7: 퍼즈 생성기를 새 형식으로(`RuleSetFlowFuzz.java`)**

클래스 Javadoc 의 흐름 줄을 바꾼다:
```java
 *   <li>흐름: 깊이 3 이하 블록 트리(순차·IF 2~3갈래·병렬 2~3갈래, 같은 룰 반복 허용)를 노드·선으로 펼친다. 갈래 순서 값은 섞고 IF 의
 *       "그 외" 자리도 무작위다. IF 의 20% 는 옛 형식(짝 MERGE), 나머지는 새 형식(implicit-join spec §14.3) — 갈래 끝 선은 보류했다가 다음에 놓이는
 *       노드(없으면 END)가 한꺼번에 받고, 빈 갈래는 한 IF 에 하나까지(B2), "그 외" 아닌 갈래의 15% 는 끝내는 갈래(몸 끝에서 END)다.
 *       병렬은 늘 합류를 만든다. 사례의 10% 는 구조를 깨뜨린다(선 하나 지우기 / 선의 to 바꾸기 / IF 에 "그 외" 선 하나 더 — 짝 합류나 모이는 자리로).</li>
```
`caseOf` 의 흐름 만들기 두 줄을 바꾼다:
```java
        Emit emit = new Emit(rnd, poolIds);
        List<Pending> tail = emit.seq(blocks(rnd, 0, 1 + rnd.nextInt(4), poolIds), List.of(new Pending("start", Map.of(), List.of())));
        emit.land(tail, "end");
```
`Pending` 과 `Emit` 을 아래로 바꾼다(`GenRule`·`GenSplit`·`blocks` 는 그대로):
```java
    /** 다음 선의 출발 노드와 그 선에 붙일 칸(갈래 선의 order·cond·otherwise), 이 선을 갈래 끝 선으로 내보낸 새 형식 IF 들(안쪽부터). */
    private record Pending(String from, Map<String, Object> extra, List<String> ifs) {

        Pending withIf(String ifId) {
            List<String> out = new ArrayList<>(ifs);
            out.add(ifId);
            return new Pending(from, extra, List.copyOf(out));
        }
    }

    private static final class Emit {

        final Random rnd;
        final List<String> poolIds;
        final List<Map<String, Object>> nodes = new ArrayList<>();
        final List<Map<String, Object>> edges = new ArrayList<>();
        /** IF ID → 옛 형식이면 짝 합류, 새 형식이면 갈래 끝 선을 받은 노드(모이는 자리) — 구조 깨뜨리기 셋째 방법이 쓴다. */
        final Map<String, String> ifTarget = new LinkedHashMap<>();
        int rules;
        int ifs;
        int pars;
        int merges;
        int edgeSeq;

        Emit(Random rnd, List<String> poolIds) {
            this.rnd = rnd;
            this.poolIds = poolIds;
        }

        List<Pending> seq(List<Gen> items, List<Pending> p) {
            for (Gen g : items) {
                p = place(g, p);
            }
            return p;
        }

        /** 보류 선을 모두 to 로 잇고, 그 선을 내보낸 새 형식 IF 의 모이는 자리로 to 를 적는다(처음 한 번). */
        void land(List<Pending> ps, String to) {
            for (Pending p : ps) {
                edge(p, to);
                for (String ifId : p.ifs()) {
                    ifTarget.putIfAbsent(ifId, to);
                }
            }
        }

        List<Pending> place(Gen g, List<Pending> p) {
            if (g instanceof GenRule r) {
                String id = "r" + (++rules);
                Map<String, Object> n = node(id, "RULE");
                n.put("ruleId", r.ruleId());
                nodes.add(n);
                land(p, id);
                return List.of(new Pending(id, Map.of(), List.of()));
            }
            GenSplit s = (GenSplit) g;
            boolean legacy = s.ifSplit() && rnd.nextInt(5) == 0;
            boolean fresh = s.ifSplit() && !legacy;
            String id = s.ifSplit() ? "if" + (++ifs) : "p" + (++pars);
            String mergeId = fresh ? null : "m" + (++merges);
            nodes.add(node(id, s.ifSplit() ? "IF" : "PARALLEL"));
            land(p, id);
            int k = s.branches().size();
            int otherwise = s.ifSplit() ? rnd.nextInt(k) : -1;
            List<Integer> orders = new ArrayList<>();
            for (int o = 1; o <= (s.ifSplit() ? k - 1 : k); o++) {
                orders.add(o);
            }
            Collections.shuffle(orders, rnd);
            boolean[] ending = new boolean[k];
            boolean emptyCont = false;
            if (fresh) {
                for (int b = 0; b < k; b++) {
                    ending[b] = b != otherwise && rnd.nextInt(100) < 15; // "그 외" 는 끝내지 않는다 — 이어지는 갈래가 늘 남는다
                    if (!ending[b] && s.branches().get(b).isEmpty()) {
                        emptyCont = true;
                    }
                }
            }
            int next = 0;
            boolean emptyUsed = false;
            boolean endDirect = false;
            List<Pending> tails = new ArrayList<>();
            for (int b = 0; b < k; b++) {
                Map<String, Object> extra = new LinkedHashMap<>();
                if (b == otherwise) {
                    extra.put("otherwise", true);
                } else {
                    extra.put("order", orders.get(next++));
                    if (s.ifSplit()) {
                        extra.put("cond", "");                         // condIo 를 정할 때 채운다
                    }
                }
                List<Gen> body = new ArrayList<>(s.branches().get(b));
                if (fresh && body.isEmpty()) {
                    // 같은 도착으로 가는 IF 선은 하나(f4·B2): 빈 이어지는 갈래는 하나까지, END 로 바로 가는 끝내는 갈래도 하나까지이고
                    // 빈 이어지는 갈래가 있으면 두지 않는다(IF 가 루트 끝이면 둘 다 END 로 간다). 걸리면 룰 하나를 넣는다.
                    boolean taken = ending[b] ? emptyCont || endDirect : emptyUsed;
                    if (taken) {
                        body.add(new GenRule(poolIds.get(rnd.nextInt(poolIds.size()))));
                    } else if (ending[b]) {
                        endDirect = true;
                    } else {
                        emptyUsed = true;
                    }
                }
                List<Pending> end = seq(body, List.of(new Pending(id, extra, List.of())));
                if (!fresh) {
                    land(end, mergeId);
                } else if (ending[b]) {
                    land(end, "end");
                } else {
                    end.forEach(q -> tails.add(q.withIf(id)));
                }
            }
            if (fresh) {
                return tails;
            }
            Map<String, Object> m = node(mergeId, "MERGE");
            m.put("splitId", id);
            nodes.add(m);
            if (legacy) {
                ifTarget.put(id, mergeId);
            }
            return List.of(new Pending(mergeId, Map.of(), List.of()));
        }

        void edge(Pending p, String to) {
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("id", "e" + (++edgeSeq));
            e.put("from", p.from());
            e.put("to", to);
            e.putAll(p.extra());
            edges.add(e);
        }

        /** 선 하나 지우기 / 선의 to 를 다른 노드로 / IF 에 "그 외" 선 하나 더 — 짝 합류나 모이는 자리로(IF 가 없으면 지우기). */
        void breakStructure() {
            int mode = rnd.nextInt(3);
            if (mode == 2 && !ifTarget.isEmpty()) {
                List<String> ifIds = List.copyOf(ifTarget.keySet());
                String ifId = ifIds.get(rnd.nextInt(ifIds.size()));
                edge(new Pending(ifId, Map.of("otherwise", true), List.of()), ifTarget.get(ifId));
            } else if (mode == 1) {
                Map<String, Object> e = edges.get(rnd.nextInt(edges.size()));
                List<String> others = new ArrayList<>();
                nodes.forEach(n -> {
                    if (!n.get("id").equals(e.get("to"))) {
                        others.add((String) n.get("id"));
                    }
                });
                e.put("to", others.get(rnd.nextInt(others.size())));
            } else {
                edges.remove(rnd.nextInt(edges.size()));
            }
        }
    }
```
(`emit.nodes.add(0, node("start", "START")); emit.nodes.add(node("end", "END"));` 와 그 뒤는 그대로다. `land(…, "end")` 는 END 노드를 아직 넣기 전이지만 선은 ID 로만 잇는다.)

- [ ] **Step 8: 퍼즈 다시 쓰기와 두 언어 차분**

Run: `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetFlowFuzz*' -Dfuzz.write=true --console=plain)` 뒤 `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)`·`(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleLedgerChecksTest' --console=plain)`·`cd src/frontend/m-mdm && node scripts/test.mjs --maxWorkers=3 tests/dme/ruleSetEdit/rule-set-corpus.test.ts`
Expected: 모두 PASS. 퍼즈 파일에 `"kind": "IF"` 사례 가운데 짝 MERGE 없는 것과 있는 것이 둘 다 있는지 `grep -c '"splitId": "if' src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-fuzz.json` 로 본다(1 이상). TS 만 다른 퍼즈 사례가 있으면 그 흐름을 줄여 코퍼스 사례로 옮기고(두 러너 `MIN_CASES` 함께 +1) 원인을 고친다.

- [ ] **Step 9: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetAnalyzer.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetPathState.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/check/ledger/RuleSetOrderCheck.java src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-fuzz.json src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowFuzz.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetPathStateTest.java src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts
/usr/bin/git commit -m "feat(mdm): 룰 세트 검사가 끝내는 IF 갈래를 블록 뒤 상태에서 빼고 퍼즈가 새 형식을 섞는다(D-136)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetAnalyzer.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetPathState.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/check/ledger/RuleSetOrderCheck.java src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-fuzz.json src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowFuzz.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetPathStateTest.java src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts
```

---
### Task 4: 편집 모델 — 옛 형식 변환·블록 도우미·분기·노드·받는 노드 연산·접기 보기·열기 알림

**등급:** capable — 순수 함수 수십 개를 새 모델로 바꾸고, 변환이 바꾸는 화면 시험 기대를 판정 규칙대로 옮긴다.
**병렬:** Task 1 병합 뒤. Task 2·3 과 함께 돌 수 있다(화면 패키지만 고친다).

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts`, `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/collapse.ts`, `src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts`(`load`)
- Create: `src/frontend/m-mdm/tests/dme/ruleSetEdit/legacy-upgrade.test.ts`, `src/frontend/m-mdm/tests/dme/ruleSetEdit/implicit-join-edit.test.ts`
- Modify(시험): `collapse.test.ts`·`rule-set-edit-page.test.ts` 와 Step 13 판정 규칙에 걸리는 기존 시험(알려진 후보: `flow-edit.test.ts`·`flow-edit-3.test.ts`·`branch-order.test.ts`·`catch-edit.test.ts`·`catch-return.test.ts`·`flow-connect.test.ts`·`flow-reconnect.test.ts`·`flow-canvas.test.ts`·`browser-fix.test.ts`·`addons-fix.test.ts`·`task-node.test.ts`·`node-desc-model.test.ts`·`snap-canvas.test.ts`·`flow-menu.test.ts`·`flow-layout.test.ts`·`catch-layout.test.ts`·`node-style-layout.test.ts`)

**Interfaces:**
- Consumes(Task 1): `joinOf`·`endingBranches`·`handlerTarget`·`returnOf`·`CATCHABLE`(RULE·TASK)·`catchesOf`·`parseFlow`.
- Produces(`flow-edit.ts`):
  - `upgradeLegacyMerges(f: EditFlow): { flow: EditFlow; upgraded: number }`, `toEditFlowCounted(raw, ruleIds): { flow: EditFlow; upgraded: number }`, `toEditFlow(raw, ruleIds): EditFlow`(변환 포함)
  - `tailsOf(f: EditFlow, splitId: string): FlowEdge[] | null`, `blockMembers(f, splitId): string[] | null`(새 IF 는 분기 + 안쪽 — 모이는 자리 제외)
  - `Fragment.exit: string | null`, `Fragment.tails?: string[]`, `Fragment.endTails?: string[]`(R7)
  - 문구 상수 `IF_EMPTY_TWICE`·`KEEP_ENDING`·`ENDING_TO_PARALLEL`·`RETURN_JOIN_END`·`RETURN_TO_END`·`MERGE_ONLY_BY_SPLIT`·`UPGRADE_NOTICE`(문구 표). `RETURN_MERGE_NOT_ONE`·`RETURN_MERGE_STUCK` 은 없어진다.
- Produces(`canvas/collapse.ts`): `FOLD_EDGE_PREFIX = "fold:"`, 접힌 새 형식 IF 는 꼬리·끝 선 대신 대표 선 `{id: "fold:{s}", from: s, to: 모이는 자리}` 하나, `blocks[s].count` = IF 멤버 수 − 1·병렬 − 2.

- [ ] **Step 1: 실패하는 시험 — 변환(`legacy-upgrade.test.ts`, 새 파일)**

```ts
// implicit-join spec §12.2·§14.4 — 편집기 옛 형식 변환(upgradeLegacyMerges·toEditFlowCounted)과,
// 코퍼스·퍼즈의 옛 형식 흐름 전부의 변환 전후 계산 동치(결정 A5 의 가장 강한 확인, 편차 F5 의 비교 규칙).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { FlowEdge, FlowNode, RuleSetFlow } from "../../../src/contract/engine-contract.generated";
import { TASK_LABEL, flowJsonOf, toEditFlow, toEditFlowCounted, upgradeLegacyMerges } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { CATCHABLE, catchesOf, parseFlow, type Seq } from "../../../pages/dme/ruleSetEdit/flow-model";
import { flowChecks, flowDeps, flowIo } from "../../../pages/dme/ruleSetEdit/set-model";
import type { CondIo, IoName, IoSource, RuleIo, RuleSetCheck } from "../../../pages/dme/ruleSetEdit/types";
import { RULE_SET_CORPUS_PATH } from "../../helpers/engine-paths";

const N = (id: string, kind: FlowNode["kind"], over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: null, splitId: null, label: null, ...over });
const C = (id: string, attachTo: string, ...catches: string[]): FlowNode => ({ ...N(id, "CATCH"), attachTo, catches });
const E = (id: string, from: string, to: string, over: Partial<FlowEdge> = {}): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null, ...over });
const raw = (nodes: FlowNode[], edges: FlowEdge[], view?: unknown) => ({ version: 1, nodes, edges, ...(view ? { view } : {}) }) as RuleSetFlow & { view?: unknown };
const edgesOf = (f: { edges?: FlowEdge[] | null }) => (f.edges ?? []).map((e) => `${e.id}:${e.from}>${e.to}`);

/** e2e 시드 E2S_FLOW — r1 → if1 [e3 → r2] [e4 그 외 → m1] → m1 → r3 → end. */
const E2S_FLOW = raw(
  [N("start", "START"), N("r1", "RULE", { ruleId: "E2S_GRD" }), N("if1", "IF"), N("r2", "RULE", { ruleId: "E2S_FCT" }), N("m1", "MERGE", { splitId: "if1" }),
    N("r3", "RULE", { ruleId: "E2S_SPD" }), N("end", "END")],
  [E("e1", "start", "r1"), E("e2", "r1", "if1"), E("e3", "if1", "r2", { order: 1, cond: 'S_GRD = "A"', label: "등급 A" }),
    E("e4", "if1", "m1", { otherwise: true, label: "그 외" }), E("e5", "r2", "m1"), E("e6", "m1", "r3"), E("e7", "r3", "end")],
);

describe("upgradeLegacyMerges(implicit-join spec §12.2)", () => {
  it("시드 E2S_FLOW 는 m1 이 빠지고 들어오던 선이 r3 로 간다(선 ID·칸 그대로, 노드 7 → 6)", () => {
    const { flow, upgraded } = toEditFlowCounted(E2S_FLOW, []);
    expect(upgraded).toBe(1);
    expect(flow.nodes.map((n) => n.id)).toEqual(["start", "r1", "if1", "r2", "r3", "end"]);
    expect(edgesOf(flow)).toEqual(["e1:start>r1", "e2:r1>if1", "e3:if1>r2", "e4:if1>r3", "e5:r2>r3", "e7:r3>end"]);
    expect(flow.edges.find((e) => e.id === "e4")).toMatchObject({ otherwise: true, label: "그 외" });
    expect(flow.edges.find((e) => e.id === "e3")).toMatchObject({ order: 1, cond: 'S_GRD = "A"', label: "등급 A" });
    expect(parseFlow(flow).issues).toEqual([]);
  });

  it("END 로 바로 나가는 합류는 빈 단계가 되고, 합류 연쇄면 END 앞 합류 하나만 빈 단계다(J-D10)", () => {
    // if1 [b1 → r1] [그 외 → m1], r1(c1 → h → mr) → mr(돌아오는 합류) → m1(IF 합류) → end
    const f = raw(
      [N("start", "START"), N("if1", "IF"), N("r1", "RULE", { ruleId: "A" }), C("c1", "r1", "NO_RESULT"), N("h", "RULE", { ruleId: "H" }),
        N("mr", "MERGE", { splitId: "r1" }), N("m1", "MERGE", { splitId: "if1" }), N("end", "END")],
      [E("e0", "start", "if1"), E("b1", "if1", "r1", { order: 1, cond: "X > 0" }), E("bo", "if1", "m1", { otherwise: true }), E("e1", "r1", "mr"),
        E("ec", "c1", "h"), E("eh", "h", "mr"), E("em", "mr", "m1"), E("ee", "m1", "end")],
      { positions: { m1: { x: 10, y: 20 }, mr: { x: 1, y: 2 } } },
    );
    const { flow, upgraded } = toEditFlowCounted(f, []);
    expect(upgraded).toBe(2);
    expect(flow.nodes.find((n) => n.id === "m1")).toMatchObject({ kind: "TASK", splitId: null, label: TASK_LABEL });
    expect(flow.nodes.some((n) => n.id === "mr")).toBe(false);
    expect(edgesOf(flow)).toEqual(["e0:start>if1", "b1:if1>r1", "bo:if1>m1", "e1:r1>m1", "ec:c1>h", "eh:h>m1", "ee:m1>end"]);
    expect(flow.view.positions).toEqual({});
    const s = parseFlow(flow).tree!.root.items[0];
    expect(s.type === "SPLIT" && s.joinId).toBe("m1");
    expect(s.type === "SPLIT" && s.branches.every((b) => !b.ends)).toBe(true);
  });

  it("빈 갈래가 여럿인 옛 IF(옛 insertSplit 모양)는 실행 순서 마지막 갈래만 빈 갈래로 두고 나머지에 빈 단계를 채운다(B2)", () => {
    const f = raw(
      [N("start", "START"), N("r1", "RULE", { ruleId: "A" }), N("if1", "IF"), N("m1", "MERGE", { splitId: "if1" }), N("r2", "RULE", { ruleId: "B" }), N("end", "END")],
      [E("e1", "start", "r1"), E("e2", "r1", "if1"), E("e3", "if1", "m1", { order: 1, label: "갈래 1" }), E("e4", "if1", "m1", { otherwise: true, label: "그 외" }),
        E("e5", "m1", "r2"), E("e6", "r2", "end")],
    );
    const { flow, upgraded } = toEditFlowCounted(f, []);
    expect(upgraded).toBe(1);
    expect(flow.nodes.map((n) => `${n.id}:${n.kind}`)).toEqual(["start:START", "r1:RULE", "if1:IF", "r3:TASK", "r2:RULE", "end:END"]);
    expect(flow.nodes.find((n) => n.id === "r3")!.label).toBe(TASK_LABEL);
    expect(edgesOf(flow)).toEqual(["e1:start>r1", "e2:r1>if1", "e3:if1>r3", "e5:r3>r2", "e4:if1>r2", "e6:r2>end"]);
  });

  it("병렬 합류와 짝이 맞지 않는 MERGE 는 그대로 둔다", () => {
    const f = raw(
      [N("start", "START"), N("p1", "PARALLEL"), N("a", "RULE", { ruleId: "A" }), N("b", "RULE", { ruleId: "B" }), N("pm", "MERGE", { splitId: "p1" }),
        N("zm", "MERGE", { splitId: "zz" }), N("end", "END")],
      [E("e0", "start", "p1"), E("pa", "p1", "a", { order: 1 }), E("pb", "p1", "b", { order: 2 }), E("ea", "a", "pm"), E("eb", "b", "pm"), E("ep", "pm", "zm"), E("ez", "zm", "end")],
    );
    const { flow, upgraded } = toEditFlowCounted(f, []);
    expect(upgraded).toBe(0);
    expect(flow.nodes.map((n) => n.id)).toEqual(["start", "p1", "a", "b", "pm", "zm", "end"]);
  });

  it("옮긴 선의 꺾는 점은 지우고 이름표 오프셋은 남기며, 지운 합류는 그룹·메모에서 빠진다", () => {
    const f = { ...E2S_FLOW, view: {
      positions: { m1: { x: 5, y: 5 } }, notes: [{ id: "n1", text: "합류", x: 0, y: 0, w: 10, h: 10, attach: "m1" }],
      groups: [{ id: "g1", title: "묶음", nodeIds: ["m1", "r3"] }, { id: "g2", title: "합류만", nodeIds: ["m1"] }],
      routes: { e4: [{ x: 1, y: 1 }], e5: [{ x: 2, y: 2 }], e6: [{ x: 3, y: 3 }] }, labels: { e4: { label: { dx: 5, dy: 5 } } },
    } };
    const v = toEditFlow(f, []).view;
    expect(v.routes).toEqual({});
    expect(v.labels).toEqual({ e4: { label: { dx: 5, dy: 5 } } });
    expect(v.groups).toEqual([{ id: "g1", title: "묶음", nodeIds: ["r3"] }]);
    expect(v.notes[0].attach).toBeNull();
    expect(v.positions).toEqual({});
  });

  it("같은 입력이면 같은 결과이고, 새 형식은 더 바뀌지 않는다(멱등)", () => {
    const once = toEditFlow(E2S_FLOW, []);
    expect(flowJsonOf(toEditFlow(E2S_FLOW, []))).toBe(flowJsonOf(once));
    const again = upgradeLegacyMerges(once);
    expect(again.upgraded).toBe(0);
    expect(flowJsonOf(again.flow)).toBe(flowJsonOf(once));
  });
});

// ── 코퍼스·퍼즈 동치 ──

interface CorpusCase {
  name: string;
  flow?: { version: number; nodes: Array<Partial<FlowNode> & { id: string; kind: FlowNode["kind"] }>; edges: Array<Partial<FlowEdge> & { id: string; from: string; to: string }> };
  condIo?: Record<string, { ok: boolean; message?: string | null; vars?: Array<{ name: string; source?: IoSource | null }> }>;
  rules?: Record<string, { exists?: boolean; status?: string | null; releasedVer?: number | null; hitPolicy?: string | null; hasDefault?: boolean;
    conds?: Array<{ name: string; source?: IoSource | null }>; results?: Array<{ name: string }> }>;
}

const ioName = (name: string, source: IoSource | null): IoName => ({ name, source, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });

function flowOf(f: NonNullable<CorpusCase["flow"]>): RuleSetFlow {
  return {
    version: f.version,
    nodes: f.nodes.map((n) => {
      const base: FlowNode = { id: n.id, kind: n.kind, ruleId: n.ruleId ?? null, splitId: n.splitId ?? null, label: n.label ?? null };
      return n.kind === "CATCH" ? { ...base, attachTo: n.attachTo ?? null, catches: n.catches ?? null } : base;
    }),
    edges: f.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, order: e.order ?? null, cond: e.cond ?? null, otherwise: e.otherwise ?? false, label: e.label ?? null })),
  };
}

function rulesOf(c: CorpusCase): Record<string, RuleIo> {
  const out: Record<string, RuleIo> = {};
  for (const [id, r] of Object.entries(c.rules ?? {})) {
    out[id] = {
      ruleId: id, ruleName: null, ruleKind: null, status: r.status ?? null, exists: r.exists ?? false, releasedVer: r.releasedVer ?? null, hitPolicy: r.hitPolicy ?? null,
      conds: (r.conds ?? []).map((x) => ioName(x.name, x.source ?? null)), results: (r.results ?? []).map((x) => ioName(x.name, null)), hasDefault: r.hasDefault ?? false,
    };
  }
  return out;
}

function condIoOf(c: CorpusCase): Record<string, CondIo> {
  const out: Record<string, CondIo> = {};
  for (const [id, x] of Object.entries(c.condIo ?? {})) out[id] = { ok: x.ok, message: x.message ?? null, vars: (x.vars ?? []).map((v) => ioName(v.name, v.source ?? null)) };
  return out;
}

/** 옛 형식 — IF 를 가리키는 MERGE 또는 받는 노드가 붙은 노드를 가리키는 MERGE 가 있다. */
function hasLegacyMerge(f: RuleSetFlow): boolean {
  const kind = new Map((f.nodes ?? []).map((n) => [n.id, n.kind] as const));
  return (f.nodes ?? []).some((m) => m.kind === "MERGE" && m.splitId != null
    && (kind.get(m.splitId) === "IF" || (CATCHABLE.has(kind.get(m.splitId) ?? "START") && catchesOf(f, m.splitId).length > 0)));
}

const withoutEmpty = (cs: RuleSetCheck[]) => cs.filter((k) => k.code !== "EMPTY_TASK" && k.code !== "EMPTY");

/** 블록 트리의 끝내는 IF 갈래 선 ID(정렬). 퍼즈의 새 형식 IF 는 변환 전에도 끝내는 갈래를 가질 수 있다 — 변환이 더하거나 빼지 않는지만 본다(J-D10). */
function endingEdges(f: RuleSetFlow): string[] {
  const out: string[] = [];
  const walk = (s: Seq) => {
    for (const b of s.items) {
      if (b.type === "SEQ") walk(b);
      else if (b.type === "SPLIT") {
        for (const br of b.branches) {
          if (br.ends) out.push(br.edgeId);
          walk(br.body);
        }
      } else if (b.type === "GUARDED") {
        walk(b.normal);
        for (const h of b.handlers) walk(h.body);
      }
    }
  };
  walk(parseFlow(f).tree!.root);
  return out.sort();
}

describe("코퍼스·퍼즈 옛 형식 흐름의 변환 전후 io·deps·checks 동치(A5, 편차 F5)", () => {
  const files = [RULE_SET_CORPUS_PATH, path.join(path.dirname(RULE_SET_CORPUS_PATH), "rule-set-fuzz.json")];
  const legacy = files
    .flatMap((p) => (JSON.parse(fs.readFileSync(p, "utf8")) as { cases: CorpusCase[] }).cases)
    .filter((c) => c.flow && parseFlow(flowOf(c.flow)).issues.length === 0 && hasLegacyMerge(flowOf(c.flow)));

  it("옛 형식 흐름이 20개 이상이다", () => {
    expect(legacy.length).toBeGreaterThanOrEqual(20);
  });

  it.each(legacy.map((c) => [c.name, c] as const))("%s", (name, c) => {
    const before = flowOf(c.flow!);
    const after = toEditFlow(before, []);
    const rules = rulesOf(c);
    const condIo = condIoOf(c);
    expect(parseFlow(after).issues, `${name} 변환 뒤 구조`).toEqual([]);
    expect(hasLegacyMerge(after), `${name} 옛 합류가 남지 않는다`).toBe(false);
    expect(endingEdges(after), `${name} 변환은 끝내는 갈래를 더하거나 빼지 않는다(J-D10)`).toEqual(endingEdges(before));
    expect(flowIo(after, rules), `${name} io`).toEqual(flowIo(before, rules));
    expect(flowDeps(after, rules), `${name} deps`).toEqual(flowDeps(before, rules));
    const a = flowChecks(before, rules, condIo);
    const b = flowChecks(after, rules, condIo);
    expect(withoutEmpty(b), `${name} checks`).toEqual(withoutEmpty(a));
    if (b.some((k) => k.code === "EMPTY")) expect(a.some((k) => k.code === "EMPTY"), `${name} EMPTY 는 사라지기만 한다`).toBe(true);
    if (a.some((k) => k.code === "EMPTY_TASK")) expect(b.some((k) => k.code === "EMPTY_TASK"), `${name} EMPTY_TASK 는 남는다`).toBe(true);
  });
});
```

- [ ] **Step 2: 실패하는 시험 — 편집 연산(`implicit-join-edit.test.ts`, 새 파일)**

```ts
// implicit-join spec §8 — 새 형식 편집 연산: IF 끼우기·갈래·풀기·종류 바꾸기·지우기·옮기기·복사·복제, 받는 노드 붙이기·돌아오기, 빈 갈래 둘 막기.
import { describe, expect, it } from "vitest";

import type { FlowEdge, FlowNode } from "../../../src/contract/engine-contract.generated";
import {
  ENDING_TO_PARALLEL, IF_EMPTY_TWICE, KEEP_ENDING, MERGE_ONLY_BY_SPLIT, MOVE_GUARDED, RETURN_JOIN_END, RETURN_TO_END,
  addBranch, addCatch, changeSplitKind, copyFragment, dissolveSplit, duplicateNode, insertSplit, moveNode, pasteFragment, reconnectEdge,
  removeBranch, removeNode, returnCatch, tailsOf, toEditFlow, updateEdge, type EditFlow, type EditResult, type Fragment,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { joinOf, parseFlow, returnOf } from "../../../pages/dme/ruleSetEdit/flow-model";

const N = (id: string, kind: FlowNode["kind"], over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: null, splitId: null, label: null, ...over });
const R = (id: string, ruleId = id.toUpperCase()) => N(id, "RULE", { ruleId });
const C = (id: string, attachTo: string, ...catches: string[]): FlowNode => ({ ...N(id, "CATCH"), attachTo, catches });
const E = (id: string, from: string, to: string, over: Partial<FlowEdge> = {}): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null, ...over });
const ef = (nodes: FlowNode[], edges: FlowEdge[]): EditFlow => toEditFlow({ version: 1, nodes, edges }, []);
const ok = (r: EditResult): EditFlow => {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
};
const edgesOf = (f: EditFlow) => f.edges.map((e) => `${e.id}:${e.from}>${e.to}`);
const ids = (f: EditFlow) => f.nodes.map((n) => n.id);

/** F2 — start → if1 [b1 "X > 0" → x → j] [bo 그 외 → j] → j → end. */
const F2 = () => ef([N("start", "START"), N("if1", "IF"), R("x"), R("j"), N("end", "END")],
  [E("e0", "start", "if1"), E("b1", "if1", "x", { order: 1, cond: "X > 0", label: "갈래 1" }), E("bo", "if1", "j", { otherwise: true, label: "그 외" }),
    E("ex", "x", "j"), E("ej", "j", "end")]);
/** F3 — start → if1 [b1 → k → end](끝내는 갈래) [b2 → z → a] [bo 그 외 → a] → a → end. */
const F3 = () => ef([N("start", "START"), N("if1", "IF"), R("k"), R("z"), R("a"), N("end", "END")],
  [E("e0", "start", "if1"), E("b1", "if1", "k", { order: 1, cond: "X > 0" }), E("b2", "if1", "z", { order: 2, cond: "X > 1" }), E("bo", "if1", "a", { otherwise: true }),
    E("ek", "k", "end"), E("ez", "z", "a"), E("ea", "a", "end")]);

describe("IF 끼우기·갈래(implicit-join spec §8.2)", () => {
  it("IF 를 끼우면 합류 없이 「갈래 1」 빈 단계와 「그 외」 빈 갈래가 생긴다", () => {
    const base = toEditFlow(null, ["R_A"]); // start → r1 → end, e1·e2
    const f = ok(insertSplit(base, "e1", "IF"));
    expect(f.nodes.map((n) => `${n.id}:${n.kind}`)).toEqual(["start:START", "if1:IF", "r2:TASK", "r1:RULE", "end:END"]);
    expect(f.nodes.some((n) => n.kind === "MERGE")).toBe(false);
    expect(edgesOf(f)).toEqual(["e1:start>if1", "e3:if1>r2", "e4:if1>r1", "e5:r2>r1", "e2:r1>end"]);
    expect(f.edges.find((e) => e.id === "e3")).toMatchObject({ order: 1, label: "갈래 1", otherwise: false });
    expect(f.edges.find((e) => e.id === "e4")).toMatchObject({ order: null, label: "그 외", otherwise: true });
    expect(parseFlow(f).issues.map((i) => i.code)).toEqual(["FLOW_IF_ELSE"]);
    const g = ok(updateEdge(f, "e3", { cond: "X > 0" }));
    expect(parseFlow(g).issues).toEqual([]);
    expect(joinOf(g, "if1")).toBe("r1");
  });

  it("갈래를 더하면 빈 단계 하나와 모이는 자리로 가는 선이 그 외 앞에 들어간다", () => {
    const f = ok(addBranch(F2(), "if1"));
    expect(ids(f)).toEqual(["start", "if1", "r1", "x", "j", "end"]);
    expect(edgesOf(f)).toEqual(["e0:start>if1", "b1:if1>x", "e1:if1>r1", "e2:r1>j", "bo:if1>j", "ex:x>j", "ej:j>end"]);
    expect(f.edges.find((e) => e.id === "e1")).toMatchObject({ order: 2, label: "갈래 2" });
  });

  it("갈래를 지우면 이어지는 갈래는 모이는 자리까지, 끝내는 갈래는 END 까지 안쪽을 지운다", () => {
    expect(edgesOf(ok(removeBranch(F3(), "if1", "b1")))).toEqual(["e0:start>if1", "b2:if1>z", "bo:if1>a", "ez:z>a", "ea:a>end"]);
    expect(edgesOf(ok(removeBranch(F3(), "if1", "b2")))).toEqual(["e0:start>if1", "b1:if1>k", "bo:if1>a", "ek:k>end", "ea:a>end"]);
  });
});

describe("분기 풀기·종류 바꾸기", () => {
  it("이어지는 갈래·빈 갈래를 남기면 들어오는 선이 그 갈래로 가고, 끝내는 갈래만 남기기는 거부한다", () => {
    expect(edgesOf(ok(dissolveSplit(F3(), "if1", "b2")))).toEqual(["e0:start>z", "ez:z>a", "ea:a>end"]);
    expect(edgesOf(ok(dissolveSplit(F3(), "if1", "bo")))).toEqual(["e0:start>a", "ea:a>end"]);
    expect(dissolveSplit(F3(), "if1", "b1")).toEqual({ ok: false, reason: KEEP_ENDING });
  });

  it("안쪽 IF 를 풀어 바깥 IF 에 같은 도착 선이 둘 생기면 거부한다(B2)", () => {
    // o [b1 → i [d1 → y][그 외 → j]] [그 외 → j] → j → end
    const f = ef([N("start", "START"), N("o", "IF"), N("i", "IF"), R("y"), R("j"), N("end", "END")],
      [E("e0", "start", "o"), E("b1", "o", "i", { order: 1, cond: "X > 0" }), E("bo", "o", "j", { otherwise: true }), E("d1", "i", "y", { order: 1, cond: "X > 1" }),
        E("do", "i", "j", { otherwise: true }), E("ey", "y", "j"), E("ej", "j", "end")]);
    expect(dissolveSplit(f, "i", "do")).toEqual({ ok: false, reason: IF_EMPTY_TWICE("o") });
  });

  it("IF → 병렬은 모이는 자리 앞에 합류를 넣고 꼬리를 모은다, 병렬 → IF 는 합류를 없애고 같은 도착 갈래에 빈 단계를 채운다", () => {
    const p = ok(changeSplitKind(F2(), "if1", "PARALLEL"));
    expect(p.nodes.map((n) => `${n.id}:${n.kind}`)).toEqual(["start:START", "if1:PARALLEL", "x:RULE", "m1:MERGE", "j:RULE", "end:END"]);
    expect(p.nodes.find((n) => n.id === "m1")!.splitId).toBe("if1");
    expect(edgesOf(p)).toEqual(["e0:start>if1", "b1:if1>x", "bo:if1>m1", "ex:x>m1", "e1:m1>j", "ej:j>end"]);
    expect(parseFlow(p).issues).toEqual([]);
    const back = ok(changeSplitKind(p, "if1", "IF"));
    expect(back.nodes.some((n) => n.kind === "MERGE")).toBe(false);
    expect(edgesOf(back)).toEqual(["e0:start>if1", "b1:if1>x", "bo:if1>j", "ex:x>j", "ej:j>end"]);
    expect(changeSplitKind(F3(), "if1", "PARALLEL")).toEqual({ ok: false, reason: ENDING_TO_PARALLEL });
    // 병렬 빈 갈래 둘 → IF: 실행 순서 마지막(pb)만 빈 갈래로 둔다.
    const par = ef([N("start", "START"), N("p1", "PARALLEL"), R("a"), N("pm", "MERGE", { splitId: "p1" }), R("z"), N("end", "END")],
      [E("e0", "start", "p1"), E("pa", "p1", "pm", { order: 1 }), E("pb", "p1", "pm", { order: 2 }), E("pc", "p1", "a", { order: 3 }), E("ea", "a", "pm"),
        E("ep", "pm", "z"), E("ez", "z", "end")]);
    const iff = ok(changeSplitKind(par, "p1", "IF"));
    const outs = iff.edges.filter((e) => e.from === "p1");
    expect(new Set(outs.map((e) => e.to)).size).toBe(outs.length);
    expect(iff.edges.find((e) => e.id === "pb")!.to).toBe("z");
    expect(iff.nodes.find((n) => n.id === iff.edges.find((e) => e.id === "pa")!.to)!.kind).toBe("TASK");
  });
});

describe("노드 지우기·옮기기(implicit-join spec §8.2)", () => {
  it("IF 를 지우면 들어오는 선이 모이는 자리로 가고 끝내는 갈래 몸까지 블록으로 지운다", () => {
    expect(edgesOf(ok(removeNode(F3(), "if1")))).toEqual(["e0:start>a", "ea:a>end"]);
  });

  it("들어오는 선이 여럿인 모이는 자리 룰을 지우면 모두 다음 노드로 옮기고, 그 결과 빈 갈래가 둘이면 거부한다", () => {
    expect(edgesOf(ok(removeNode(F2(), "j")))).toEqual(["e0:start>if1", "b1:if1>x", "bo:if1>end", "ex:x>end"]);
    expect(removeNode(F2(), "x")).toEqual({ ok: false, reason: IF_EMPTY_TWICE("if1") });
  });

  it("돌아오는 자리이고 다음이 END 인 노드는 지우거나 옮기지 않는다, 합류 노드는 분기로 지운다", () => {
    const f = ef([N("start", "START"), R("r1"), C("c1", "r1", "NO_RESULT"), R("h"), R("n"), N("end", "END")],
      [E("e1", "start", "r1"), E("e2", "r1", "n"), E("e3", "c1", "h"), E("e4", "h", "n"), E("e5", "n", "end")]);
    expect(returnOf(f, "r1")).toBe("n");
    expect(removeNode(f, "n")).toEqual({ ok: false, reason: RETURN_JOIN_END });
    expect(moveNode(f, "n", "e1")).toEqual({ ok: false, reason: RETURN_JOIN_END });
    expect(moveNode(f, "r1", "e5")).toEqual({ ok: false, reason: MOVE_GUARDED });
    const par = ef([N("start", "START"), N("p1", "PARALLEL"), R("a"), R("b"), N("pm", "MERGE", { splitId: "p1" }), N("end", "END")],
      [E("e0", "start", "p1"), E("pa", "p1", "a", { order: 1 }), E("pb", "p1", "b", { order: 2 }), E("ea", "a", "pm"), E("eb", "b", "pm"), E("ep", "pm", "end")]);
    expect(removeNode(par, "pm")).toEqual({ ok: false, reason: MERGE_ONLY_BY_SPLIT });
  });

  it("들어오는 선이 여럿인 룰을 옮기면 들어오는 선을 모두 다음 노드로 잇는다", () => {
    expect(edgesOf(ok(moveNode(F2(), "j", "e0")))).toEqual(["e0:start>j", "e1:j>if1", "b1:if1>x", "bo:if1>end", "ex:x>end"]);
  });

  it("IF 블록을 옮기면 꼬리를 놓는 선의 도착으로 잇고 새 선을 만들지 않는다", () => {
    const f = ef([N("start", "START"), N("if1", "IF"), R("x"), R("j"), R("y"), N("end", "END")],
      [E("e0", "start", "if1"), E("b1", "if1", "x", { order: 1, cond: "X > 0" }), E("bo", "if1", "j", { otherwise: true }), E("ex", "x", "j"), E("ej", "j", "y"),
        E("ey", "y", "end")]);
    const g = ok(moveNode(f, "if1", "ej"));
    expect(edgesOf(g)).toEqual(["e0:start>j", "b1:if1>x", "bo:if1>y", "ex:x>y", "ej:j>if1", "ey:y>end"]);
    expect(parseFlow(g).issues).toEqual([]);
  });
});

describe("복사·붙여넣기·복제(R7)", () => {
  it("IF 블록 조각은 꼬리·끝 선을 to 빈 문자열로 담고 출구가 없다", () => {
    const frag = copyFragment(F3(), "if1") as Fragment;
    expect(frag.exit).toBeNull();
    expect(frag.nodes.map((n) => n.id)).toEqual(["if1", "k", "z"]);
    expect(frag.edges.map((e) => `${e.id}:${e.from}>${e.to}`)).toEqual(["b1:if1>k", "b2:if1>z", "bo:if1>", "ek:k>", "ez:z>"]);
    expect(frag.tails).toEqual(["bo", "ez"]);
    expect(frag.endTails).toEqual(["ek"]);
  });

  it("붙여 넣으면 꼬리는 놓는 선의 도착, 끝 선은 END 로 잇는다", () => {
    const frag = copyFragment(F3(), "if1") as Fragment;
    const g = ok(pasteFragment(F2(), "ej", frag));
    const s = g.edges.find((e) => e.id === "ej")!.to;
    expect(g.nodes.find((n) => n.id === s)!.kind).toBe("IF");
    const outs = g.edges.filter((e) => e.from === s);
    expect(outs.find((e) => e.otherwise)!.to).toBe("end");
    const k = outs.find((e) => e.order === 1)!.to;
    expect(g.edges.find((e) => e.from === k)!.to).toBe("end");
  });

  it("IF 블록을 복제하면 원래 꼬리가 복제 분기로 가고 복제 꼬리가 원래 모이는 자리로 간다", () => {
    const g = ok(duplicateNode(F2(), "if1"));
    expect(ids(g)).toEqual(["start", "if1", "x", "if2", "r1", "j", "end"]);
    expect(edgesOf(g)).toEqual(["e0:start>if1", "b1:if1>x", "bo:if1>if2", "ex:x>if2", "e1:if2>r1", "e2:if2>j", "e3:r1>j", "ej:j>end"]);
    expect(joinOf(g, "if1")).toBe("if2");
    expect(joinOf(g, "if2")).toBe("j");
    expect(tailsOf(g, "if2")!.map((e) => e.id)).toEqual(["e2", "e3"]);
  });
});

describe("받는 노드 연산(implicit-join spec §8.2)", () => {
  it("빈 단계에도 받는 노드를 붙이고 정상 다음 노드로 놓으면 합류 없이 바로 돌아온다", () => {
    const f = ef([N("start", "START"), N("t1", "TASK", { label: "빈 단계" }), R("n"), N("end", "END")], [E("e1", "start", "t1"), E("e2", "t1", "n"), E("e3", "n", "end")]);
    const g = ok(addCatch(f, "t1", "n"));
    expect(g.nodes.some((n) => n.kind === "MERGE")).toBe(false);
    expect(edgesOf(g)).toEqual(["e1:start>t1", "e2:t1>n", "e3:n>end", "e4:c1>n"]);
    expect(returnOf(g, "t1")).toBe("n");
  });

  it("처리 갈래 선 끝을 정상 경로 노드로 옮기면 그 선이 곧 돌아오는 선이다", () => {
    const f = ef([N("start", "START"), R("r1"), C("c1", "r1", "NO_RESULT"), R("n"), N("end", "END")],
      [E("e1", "start", "r1"), E("e2", "r1", "n"), E("e3", "c1", "end"), E("e4", "n", "end")]);
    const g = ok(reconnectEdge(f, "e3", { to: "n" }));
    expect(edgesOf(g)).toEqual(["e1:start>r1", "e2:r1>n", "e3:c1>n", "e4:n>end"]);
  });

  it("「흐름으로 돌아오기」는 맨 바깥 끝 선을 돌아올 자리로 옮기고 처리 갈래 안 IF 의 끝내는 갈래 끝 선은 그대로 둔다", () => {
    // r1 → n → end, c1 → if9 [b "X > 0" → f → end] [그 외 → q → end]
    const f = ef([N("start", "START"), R("r1"), C("c1", "r1", "NO_RESULT"), N("if9", "IF"), R("f"), R("q"), R("n"), N("end", "END")],
      [E("e1", "start", "r1"), E("e2", "r1", "n"), E("e3", "c1", "if9"), E("b", "if9", "f", { order: 1, cond: "X > 0" }), E("ef", "f", "end"),
        E("bo", "if9", "q", { otherwise: true }), E("eq", "q", "end"), E("en", "n", "end")]);
    const g = ok(returnCatch(f, "c1"));
    expect(g.edges.find((e) => e.id === "eq")!.to).toBe("n");
    expect(g.edges.find((e) => e.id === "ef")!.to).toBe("end");
    expect(returnOf(g, "r1")).toBe("n");
    const atEnd = ef([N("start", "START"), R("r1"), C("c1", "r1", "NO_RESULT"), R("h"), N("end", "END")],
      [E("e1", "start", "r1"), E("e2", "r1", "end"), E("e3", "c1", "h"), E("e4", "h", "end")]);
    expect(returnCatch(atEnd, "c1")).toEqual({ ok: false, reason: RETURN_TO_END });
  });
});
```
`collapse.test.ts` 에 `import type { FlowEdge, FlowNode } from "../../../src/contract/engine-contract.generated";` 를 더하고 끝에 더한다:
```ts
describe("collapseView — 새 형식 IF(implicit-join spec §8.4, R20)", () => {
  const N = (id: string, kind: FlowNode["kind"], ruleId: string | null = null): FlowNode => ({ id, kind, ruleId, splitId: null, label: null });
  const E = (id: string, from: string, to: string, over: Partial<FlowEdge> = {}): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null, ...over });

  it("꼬리·끝 선을 빼고 대표 선 fold:{s} 하나를 첫 꼬리 자리에 두며, 안쪽 수는 멤버 − 1 이다", () => {
    const f = toEditFlow({ version: 1, nodes: [N("start", "START"), N("if1", "IF"), N("k", "RULE", "K"), N("z", "RULE", "Z"), N("a", "RULE", "A"), N("end", "END")],
      edges: [E("e0", "start", "if1"), E("b1", "if1", "k", { order: 1, cond: "X > 0" }), E("b2", "if1", "z", { order: 2, cond: "X > 1" }), E("bo", "if1", "a", { otherwise: true }),
        E("ek", "k", "end"), E("ez", "z", "a"), E("ea", "a", "end")] }, []);
    const v = collapseView(f, new Set(["if1"]));
    expect([...v.hidden].sort()).toEqual(["k", "z"]);
    expect(v.blocks.if1.count).toBe(2);
    expect(v.flow.edges.map((e) => `${e.id}:${e.from}>${e.to}`)).toEqual(["e0:start>if1", "fold:if1:if1>a", "ea:a>end"]);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd src/frontend/m-mdm && node scripts/test.mjs --maxWorkers=3 tests/dme/ruleSetEdit/legacy-upgrade.test.ts tests/dme/ruleSetEdit/implicit-join-edit.test.ts tests/dme/ruleSetEdit/collapse.test.ts`
Expected: FAIL — `toEditFlowCounted`·`upgradeLegacyMerges`·`tailsOf`·문구 상수가 없다(import 오류), IF 끼우기가 합류를 만든다.

- [ ] **Step 4: `flow-edit.ts` — 머리 주석·import·문구**

머리 주석 끝에 한 문단을 더한다:
```ts
 * 합류 없애기(implicit-join spec §8, D-136): IF 와 처리 갈래는 합류 없이 모이는 자리·돌아오는 자리로 바로 간다. MERGE 는 병렬 합류에만 쓴다.
 * `toEditFlow` 는 옛 형식(IF 합류·돌아오는 합류)을 `upgradeLegacyMerges` 로 바꿔 연다. IF 블록의 출구는 선 하나가 아니라 꼬리 선 목록(`tailsOf`)이고,
 * 끝내는 갈래 몸(END 로 가는 갈래)도 블록에 든다. 연산 결과에 짝 합류 없는 IF 의 같은 from→to 선이 둘 생기면 거부한다(`IF_EMPTY_TWICE`, B2).
```
import 를 바꾼다:
```ts
import { CATCHABLE, CATCH_KINDS, catchesOf, endingBranches, handlerTarget, joinOf, linearFlow, returnOf } from "./flow-model";
```
`RULE_EDGES_NOT_ONE` 상수를 문구 표 값으로 바꾸고, 그 아래에 더한다:
```ts
/** 짝 합류 없는 IF 의 같은 도착 갈래 선 둘(B2, R10). */
export const IF_EMPTY_TWICE = (s: string) => `IF ${s}에 같은 노드로 가는 갈래가 이미 있다. 빈 갈래는 하나만 둔다`;
const NO_JOIN_BRANCH = (s: string) => `분기 ${s}의 갈래가 모이는 자리를 찾지 못했다`;
const NO_JOIN_REMOVE = (s: string) => `분기 ${s}의 갈래가 모이는 자리를 찾지 못해 지울 수 없다`;
const NO_JOIN_MOVE = (s: string) => `분기 ${s}의 갈래가 모이는 자리를 찾지 못해 옮길 수 없다`;
const NO_JOIN_DISSOLVE = (s: string) => `분기 ${s}의 갈래가 모이는 자리를 찾지 못해 풀 수 없다`;
export const KEEP_ENDING = "끝내는 갈래만 남기면 뒤 흐름에 닿을 수 없다";
export const ENDING_TO_PARALLEL = "끝내는 갈래가 있는 IF 는 병렬로 바꿀 수 없다. 병렬 갈래는 모두 합류로 모여야 한다";
export const MERGE_ONLY_BY_SPLIT = "합류 노드는 분기를 지워서 없앤다";
/** 열 때 옛 합류를 바꿨다는 알림(R14). */
export const UPGRADE_NOTICE = (n: number) => `옛 합류 노드 ${n}개를 없앤 형식으로 바꿔 열었다. 저장하면 새 형식으로 남는다.`;
const NO_IDS: ReadonlySet<string> = new Set<string>();
```
파일 뒤쪽 받는 노드 상수에서 `CATCH_ONLY_RULE` 를 `"룰·빈 단계 노드에만 예외 받기를 붙인다"` 로, `RULE_EDGES_NOT_ONE_MOVE` 를 문구 표 값으로, `NO_COPY` 를 문구 표 값으로 바꾸고 `RETURN_MERGE_NOT_ONE`·`RETURN_MERGE_STUCK` 을 지운 뒤 더한다:
```ts
export const RETURN_JOIN_END = "처리 갈래가 돌아오는 자리라 지우면 그 처리 갈래가 끝내기로 바뀐다. 앞에 빈 단계를 두거나 선을 먼저 정리한다";
export const RETURN_TO_END = "노드 다음이 끝 노드라 흐름으로 돌아올 자리가 없다. 노드 뒤에 빈 단계를 넣은 뒤 다시 한다";
```

- [ ] **Step 5: `flow-edit.ts` — 구조 도우미**

`reach` 에 끝내는 갈래 시작점을 받는 인자를 더한다(서명과 큐 초기화만 바뀐다):
```ts
function reach(
  f: EditFlow, from: readonly string[], stop: string, splitId: string, entry: (e: FlowEdge) => boolean, ending: ReadonlySet<string> = NO_IDS,
): Set<string> | null {
  const seen = new Set<string>();
  /** handler = 받는 노드에서 시작한 처리 갈래·끝내는 IF 갈래 경로 — END 에 닿으면 그 경로만 멈춘다. */
  const queue: { id: string; handler: boolean }[] = from.map((id) => ({ id, handler: ending.has(id) }));
```
(나머지 본문 그대로.) `blockNodes`·`branchNodes` 를 바꾸고 도우미를 더한다(`blockNodes` 자리):
```ts
const endIdOf = (f: EditFlow): string | null => f.nodes.find((n) => n.kind === "END")?.id ?? null;

/**
 * 분기 안 노드 집합(모이는 자리·짝 합류 제외) — 분기의 나가는 선들에서 joinId 직전까지. 새 형식 IF 의 끝내는 갈래는 END 에서 그 경로만 멈춘다.
 * 병렬·옛 IF 는 합류로 들어오는 선도 분기·안쪽에서만 와야 한다. 새 IF 의 모이는 자리는 블록 밖에서도 선을 받는다(implicit-join spec §8.1).
 */
function blockNodes(f: EditFlow, splitId: string, joinId: string): Set<string> | null {
  const s = findNode(f, splitId);
  if (!s) return null;
  const fromSplit = (e: FlowEdge) => e.from === splitId;
  const outs = outOf(f, splitId);
  const endingIds = new Set(s.kind === "IF" ? (endingBranches(f, splitId) ?? []) : []);
  const endingStarts = new Set(outs.filter((e) => endingIds.has(e.id)).map((e) => e.to));
  const inner = reach(f, outs.map((e) => e.to), joinId, splitId, fromSplit, endingStarts);
  if (!inner) return null;
  const merged = s.kind === "PARALLEL" || mergeOf(f, splitId) !== null;
  return !merged || inOf(f, joinId).every((e) => fromSplit(e) || inner.has(e.from)) ? inner : null;
}

/** 갈래 선 하나의 안쪽 노드 집합(e.to 에서 모이는 자리 전까지, 끝내는 갈래는 END 전까지). 안쪽 노드로는 그 갈래 선과 안쪽 선만 들어와야 한다. */
function branchNodes(f: EditFlow, splitId: string, edgeId: string): Set<string> | null {
  const e = findEdge(f, edgeId);
  const join = joinOf(f, splitId);
  if (!e || join == null) return null;
  const ending = (endingBranches(f, splitId) ?? []).includes(edgeId);
  return reach(f, [e.to], join, splitId, (x) => x.id === edgeId, ending ? new Set([e.to]) : NO_IDS);
}

/** id 가 어떤 받는 노드 블록의 돌아오는 자리인가. */
const isReturnPlace = (f: EditFlow, id: string): boolean =>
  f.nodes.some((n) => CATCHABLE.has(n.kind) && catchesOf(f, n.id).length > 0 && returnOf(f, n.id) === id);

/** 선들의 도착을 to 로 바꾼다(선 ID·칸·이름표 그대로). */
const retarget = (edges: readonly FlowEdge[], to: string) => {
  for (const e of edges) e.to = to;
};

/** 짝 MERGE 없는 IF 의 같은 from→to 선이 둘 이상이면 그 IF ID(B2, R10). */
function emptyTwice(f: EditFlow): string | null {
  for (const s of f.nodes) {
    if (s.kind !== "IF" || f.nodes.some((m) => m.kind === "MERGE" && m.splitId === s.id)) continue;
    const seen = new Set<string>();
    for (const e of outOf(f, s.id)) {
      if (seen.has(e.to)) return s.id;
      seen.add(e.to);
    }
  }
  return null;
}

/** 결과 흐름을 B2 로 확인한 뒤 done. */
const checked = (g: EditFlow): EditResult => {
  const s = emptyTwice(g);
  return s ? fail(IF_EMPTY_TWICE(s)) : done(g);
};

/** 꺾는 점을 지운다(끝점이 바뀐 선). */
function dropRoutes(g: EditFlow, edges: readonly FlowEdge[]): void {
  const routes = { ...g.view.routes };
  for (const e of edges) delete routes[e.id];
  g.view.routes = routes;
}

/** 합류 m 으로 들어오는 선을 모두 m 의 출구 도착으로 옮기고(선 ID·칸·이름표 유지, 꺾는 점 지움) m 과 출구 선을 지운다(§8.1). 출구가 하나가 아니면 null. g 는 복사본이다. */
function dissolveMerge(g: EditFlow, mId: string): EditFlow | null {
  const exits = outOf(g, mId);
  if (exits.length !== 1 || exits[0].to === mId) return null;
  const ins = inOf(g, mId);
  retarget(ins, exits[0].to);
  dropRoutes(g, ins);
  return dropNodes(g, new Set([mId]));
}

/** 짝 합류 없는 IF s 의 같은 도착 갈래 선이 둘 이상이면 실행 순서 마지막 선만 남기고 나머지마다 빈 단계를 끼운다(B2, R8). g 는 복사본이다. 끼운 수. */
function fillEmptyBranches(g: EditFlow, s: string, taken: Set<string>): number {
  const byTo = new Map<string, FlowEdge[]>();
  for (const e of outOf(g, s)) byTo.set(e.to, [...(byTo.get(e.to) ?? []), e]);
  let added = 0;
  for (const group of byTo.values()) {
    if (group.length < 2) continue;
    const ordered = branchesInOrder(group);
    const keep = ordered[ordered.length - 1];
    for (const e of group) {
      if (e === keep) continue;
      const t = node(fresh(taken, "r"), "TASK", null, null, TASK_LABEL);
      insertAfter(g.nodes, g.nodes.findIndex((n) => n.id === s) + added, t);
      const to = e.to;
      e.to = t.id;
      dropRoutes(g, [e]);
      insertAfter(g.edges, g.edges.indexOf(e), edge(fresh(taken, "e"), t.id, to));
      added++;
    }
  }
  return added;
}
```
`blockMembers` 를 바꾸고 `tailsOf` 를 더한다(3단계 연산 절의 `blockMembers` 자리):
```ts
/** 분기 + 안쪽(+ 병렬·옛 IF 의 짝 합류) 노드 ID(흐름 노드 배열 순서). 새 IF 의 모이는 자리는 블록 밖이다. 분기가 아니거나 블록이 닫히지 않으면 null. */
export function blockMembers(f: EditFlow, splitId: string): string[] | null {
  const s = findNode(f, splitId);
  if (!s || !isSplitKind(s.kind)) return null;
  const join = joinOf(f, splitId);
  const inner = join == null ? null : blockNodes(f, splitId, join);
  if (join == null || !inner) return null;
  const withMerge = s.kind === "PARALLEL" || mergeOf(f, splitId) !== null;
  const members = new Set([splitId, ...inner, ...(withMerge ? [join] : [])]);
  return f.nodes.filter((n) => members.has(n.id)).map((n) => n.id);
}

/** 새 형식 IF 블록의 꼬리 선 — 블록 멤버(분기 포함)에서 모이는 자리로 가는 선, 선 배열 순서(§8.1). 새 IF 가 아니거나 블록을 못 정하면 null. */
export function tailsOf(f: EditFlow, splitId: string): FlowEdge[] | null {
  const s = findNode(f, splitId);
  if (!s || s.kind !== "IF" || mergeOf(f, splitId) !== null) return null;
  const join = joinOf(f, splitId);
  const members = blockMembers(f, splitId);
  if (join == null || !members) return null;
  const inside = new Set(members);
  return f.edges.filter((e) => inside.has(e.from) && e.to === join);
}
```
`splitAndMerge` 를 아래로 바꾸고 부르는 곳(`addBranch`·`removeBranch`·`moveBranch`)을 맞춘다:
```ts
/** 분기와 그 모이는 자리(병렬은 짝 합류). */
function splitAndJoin(g: EditFlow, splitId: string): { split: FlowNode; join: string } | string {
  const split = findNode(g, splitId);
  if (!split || !isSplitKind(split.kind)) return `노드 ${splitId}는 분기가 아니다`;
  const join = joinOf(g, splitId);
  if (join == null) return split.kind === "IF" ? NO_JOIN_BRANCH(splitId) : `분기 ${splitId}의 짝 합류를 찾지 못했다`;
  return { split, join };
}
```

- [ ] **Step 6: `flow-edit.ts` — 옛 형식 변환과 `toEditFlow`**

`toEditFlow` 를 아래 셋으로 바꾼다:
```ts
/**
 * 옛 형식 합류 없애기(implicit-join spec §12.2) — 순수 함수이고 같은 입력이면 같은 결과다.
 * 대상 = splitId 가 IF 인 MERGE, splitId 가 받는 노드가 붙은 RULE·TASK 인 MERGE. 1) END 로 바로 나가는 대상은 빈 단계로 바꾼다(ID 그대로, 위치 지움, J-D10).
 * 2) 나머지 대상은 노드 배열 순서로 dissolveMerge(나가는 선이 하나가 아니면 둔다). 3) 짝 합류 없는 IF 의 같은 도착 갈래는 빈 단계를 채운다(B2).
 * upgraded = 1) 의 수 + 2) 에서 지운 수.
 */
export function upgradeLegacyMerges(f: EditFlow): { flow: EditFlow; upgraded: number } {
  let g = clone(f);
  const isTarget = (m: FlowNode): boolean => {
    if (m.kind !== "MERGE" || m.splitId == null) return false;
    const s = findNode(g, m.splitId);
    return !!s && (s.kind === "IF" || (CATCHABLE.has(s.kind) && catchesOf(g, s.id).length > 0));
  };
  const targets = g.nodes.filter(isTarget).map((n) => n.id);
  const endId = endIdOf(g);
  let upgraded = 0;
  const rest: string[] = [];
  for (const id of targets) {
    const outs = outOf(g, id);
    if (endId !== null && outs.length === 1 && outs[0].to === endId) {
      const m = findNode(g, id)!;
      m.kind = "TASK";
      m.splitId = null;
      m.label = TASK_LABEL;
      const positions = { ...g.view.positions };
      delete positions[id];
      g.view.positions = positions;
      upgraded++;
    } else rest.push(id);
  }
  for (const id of rest) {
    const next = dissolveMerge(g, id);
    if (next) {
      g = next;
      upgraded++;
    }
  }
  const taken = takenIds(g);
  for (const s of g.nodes.filter((n) => n.kind === "IF" && mergeOf(g, n.id) === null).map((n) => n.id)) fillEmptyBranches(g, s, taken);
  const r = done(g);
  return { flow: r.ok ? r.flow : g, upgraded };
}

/** null 이면 `linearFlow(ruleIds)` + 빈 view. raw 가 있으면 칸을 채워 복사하고 모양이 맞는 view 항목만 남긴 뒤 옛 합류를 바꾼다(R15). */
export function toEditFlowCounted(raw: (RuleSetFlow & { view?: unknown }) | null, ruleIds: readonly string[]): { flow: EditFlow; upgraded: number } {
  const src = raw ?? linearFlow(ruleIds);
  const nodes = (Array.isArray(src.nodes) ? src.nodes : []).map(copyNode);
  const edges = (Array.isArray(src.edges) ? src.edges : []).map(copyEdge);
  const view: FlowView = raw ? sanitizeView(raw.view) : { positions: {}, notes: [], groups: [], routes: {}, labels: {} };
  const base: EditFlow = {
    version: 1,
    nodes,
    edges,
    view: withStyles({ ...view, routes: routesFor(edges, view.routes), labels: labelsFor(edges, view.labels) }, stylesFor(nodes, view.styles), descsFor(nodes, view.descs)),
  };
  return upgradeLegacyMerges(base);
}

/** toEditFlowCounted 의 흐름 — 기준 흐름(baseJson)과 편집 흐름이 같은 변환을 거쳐 열기만 해서는 dirty 가 아니다(J-D12). */
export function toEditFlow(raw: (RuleSetFlow & { view?: unknown }) | null, ruleIds: readonly string[]): EditFlow {
  return toEditFlowCounted(raw, ruleIds).flow;
}
```

- [ ] **Step 7: `flow-edit.ts` — IF 끼우기·갈래 연산**

`insertSplit` 를 바꾼다:
```ts
/**
 * 선 e(A→B) 위에 분기를 끼운다. IF 는 합류 없이 갈래 `{s→t, 갈래 1}`·`{s→B, 그 외}`·선 `{t→B}`(t = 새 빈 단계)를 e 바로 뒤에, 노드는 A 뒤에 s, t.
 * 병렬은 짝 합류 m 과 갈래 두 개·합류 출구 {m→B} 를 만든다.
 */
export function insertSplit(f: EditFlow, edgeId: string, kind: "IF" | "PARALLEL"): EditResult {
  const g = clone(f);
  const ei = g.edges.findIndex((e) => e.id === edgeId);
  if (ei < 0) return fail(`선 ${edgeId}를 찾지 못했다`);
  const e = g.edges[ei];
  const taken = takenIds(g);
  const s = node(fresh(taken, SPLIT_PREFIX[kind]), kind, null, null, SPLIT_LABEL[kind]);
  const at = g.nodes.findIndex((n) => n.id === e.from);
  if (kind === "IF") {
    const t = node(fresh(taken, "r"), "TASK", null, null, TASK_LABEL);
    const b1 = edge(fresh(taken, "e"), s.id, t.id, { order: 1, label: IF_BRANCH_LABEL(1) });
    const bo = edge(fresh(taken, "e"), s.id, e.to, { otherwise: true, label: OTHERWISE_LABEL });
    const te = edge(fresh(taken, "e"), t.id, e.to);
    insertAfter(g.nodes, at, s, t);
    e.to = s.id;
    insertAfter(g.edges, ei, b1, bo, te);
    return done(g);
  }
  const m = node(fresh(taken, "m"), "MERGE", null, s.id);
  const branches = [
    edge(fresh(taken, "e"), s.id, m.id, { order: 1, label: IF_BRANCH_LABEL(1) }),
    edge(fresh(taken, "e"), s.id, m.id, { order: 2, label: IF_BRANCH_LABEL(2) }),
  ];
  const exit = edge(fresh(taken, "e"), m.id, e.to);
  insertAfter(g.nodes, at, s, m);
  e.to = s.id;
  insertAfter(g.edges, ei, ...branches, exit);
  return done(g);
}
```
`addBranch`·`removeBranch`·`moveBranch` 를 바꾼다:
```ts
/** 갈래를 더한다. IF 는 새 빈 단계 t 와 `s→t`(order = 최대 + 1)·`t→모이는 자리` 를 "그 외" 앞에(t 는 분기 바로 뒤, R8), 병렬은 빈 갈래 `s→합류` 를 끝 갈래 뒤에. */
export function addBranch(f: EditFlow, splitId: string): EditResult {
  const g = clone(f);
  const sj = splitAndJoin(g, splitId);
  if (typeof sj === "string") return fail(sj);
  const outs = outOf(g, splitId);
  const order = maxOrder(outs) + 1;
  const taken = takenIds(g);
  const after = outs.length > 0 ? g.edges.indexOf(outs[outs.length - 1]) : -1;
  if (sj.split.kind === "IF") {
    const t = node(fresh(taken, "r"), "TASK", null, null, TASK_LABEL);
    const b = edge(fresh(taken, "e"), splitId, t.id, { order, label: IF_BRANCH_LABEL(order) });
    const te = edge(fresh(taken, "e"), t.id, sj.join);
    insertAfter(g.nodes, g.nodes.findIndex((n) => n.id === splitId), t);
    const other = outs.find((e) => e.otherwise);
    if (other) g.edges.splice(g.edges.indexOf(other), 0, b, te);
    else insertAfter(g.edges, after, b, te);
    return done(g);
  }
  insertAfter(g.edges, after, edge(fresh(taken, "e"), splitId, sj.join, { order, label: IF_BRANCH_LABEL(order) }));
  return done(g);
}

/** 갈래 선 e 와 그 안 노드·선을 지운다(이어지는 갈래는 모이는 자리까지, 끝내는 갈래는 END 까지). "그 외" 는 지우지 않고, 갈래는 2개 이상 남긴다. */
export function removeBranch(f: EditFlow, splitId: string, edgeId: string): EditResult {
  const g = clone(f);
  const sj = splitAndJoin(g, splitId);
  if (typeof sj === "string") return fail(sj);
  const e = branchEdge(g, splitId, edgeId);
  if (typeof e === "string") return fail(e);
  if (e.otherwise) return fail('"그 외" 갈래는 지울 수 없다');
  if (outOf(g, splitId).length - 1 < 2) return fail("분기에는 갈래가 2개 이상 있어야 한다");
  const inner = branchNodes(g, splitId, edgeId);
  if (!inner) return fail(sj.split.kind === "IF" ? NO_JOIN_REMOVE(splitId) : `분기 ${splitId}의 짝 합류를 찾지 못해 지울 수 없다`);
  g.edges = g.edges.filter((x) => x !== e);
  return done(dropNodes(g, inner));
}
```
`moveBranch` 의 `const sm = splitAndMerge(g, splitId); if (typeof sm === "string") return fail(sm);` 두 줄을 `const sj = splitAndJoin(g, splitId); if (typeof sj === "string") return fail(sj);` 로 바꾼다.

`changeSplitKind` 를 바꾼다:
```ts
/**
 * IF ↔ 병렬. 노드 ID·선 배열 순서는 그대로다(§8.2).
 * - 병렬로: 끝내는 갈래가 있으면 거부. 새 합류 m(splitId = s)을 모이는 자리 바로 앞에 넣고 꼬리를 m 으로(꺾는 점 지움), 출구 {m → 모이는 자리} 를 마지막 꼬리 뒤에.
 *   갈래를 실행 순서대로 order 1..n, 조건식·그 외 없앰.
 * - IF 로: 갈래를 order 순으로 두고 마지막을 "그 외"(order·조건식 null), 나머지는 order 1..n-1. 짝 합류를 dissolveMerge 하고 같은 도착 갈래에 빈 단계를 채운다.
 * - 라벨은 기본 라벨(분기 `조건`·`병렬`, 갈래 `갈래 N`·`그 외`)이거나 비었을 때만 새 규칙으로 다시 붙인다.
 */
export function changeSplitKind(f: EditFlow, splitId: string, kind: "IF" | "PARALLEL"): EditResult {
  let g = clone(f);
  const s = findNode(g, splitId);
  if (!s) return fail(notFound(splitId));
  if (!isSplitKind(s.kind)) return fail("분기 노드만 바꾼다");
  if (s.kind === kind) return fail(`이미 ${KIND_NAME[kind]} 분기다`);
  if (kind === "PARALLEL" && mergeOf(g, splitId) === null) {
    const join = joinOf(g, splitId);
    if (join == null) return fail(NO_JOIN_BRANCH(splitId));
    if ((endingBranches(g, splitId) ?? []).length > 0) return fail(ENDING_TO_PARALLEL);
    const tails = tailsOf(g, splitId);
    if (!tails || tails.length === 0) return fail(NO_JOIN_BRANCH(splitId));
    const taken = takenIds(g);
    const m = node(fresh(taken, "m"), "MERGE", null, splitId);
    g.nodes.splice(g.nodes.findIndex((n) => n.id === join), 0, m);
    retarget(tails, m.id);
    dropRoutes(g, tails);
    insertAfter(g.edges, g.edges.indexOf(tails[tails.length - 1]), edge(fresh(taken, "e"), m.id, join));
  } else if (!mergeOf(g, splitId)) return fail(`분기 ${splitId}의 짝 합류를 찾지 못했다`);
  const branches = branchesInOrder(outOf(g, splitId));
  branches.forEach((e, i) => {
    const last = i === branches.length - 1;
    if (kind === "PARALLEL") {
      e.order = i + 1;
      e.cond = null;
      e.otherwise = false;
    } else {
      e.order = last ? null : i + 1;
      if (last) e.cond = null;
      e.otherwise = last;
    }
    if (e.label == null || AUTO_BRANCH_LABEL.test(e.label) || e.label === OTHERWISE_LABEL) {
      e.label = e.otherwise ? OTHERWISE_LABEL : IF_BRANCH_LABEL(e.order as number);
    }
  });
  if (s.label == null || s.label === SPLIT_LABEL.IF || s.label === SPLIT_LABEL.PARALLEL) s.label = SPLIT_LABEL[kind];
  s.kind = kind;
  if (kind === "IF") {
    const next = dissolveMerge(g, mergeOf(g, splitId)!.id);
    if (!next) return fail(`분기 ${splitId}의 짝 합류를 찾지 못했다`);
    g = next;
    fillEmptyBranches(g, splitId, takenIds(g));
  }
  return done(g);
}
```
`dissolveSplit` 를 바꾼다:
```ts
/**
 * 분기를 풀어 고른 갈래만 남긴다(§8.2). 분기로 들어오는 선(여럿 가능, R9)을 남길 갈래 첫 노드(빈 갈래면 모이는 자리)로 옮기고 분기·다른 갈래 안쪽
 * (끝내는 갈래 몸 포함)·다른 갈래 선을 dropNodes 로 지운다. 끝내는 갈래만 남기기는 거부한다. 병렬(과 옛 IF)은 짝 합류도 지우고 남긴 갈래 꼬리를 합류 출구 도착으로 옮긴다.
 */
export function dissolveSplit(f: EditFlow, splitId: string, keepEdgeId: string): EditResult {
  const g = clone(f);
  const s = findNode(g, splitId);
  if (!s) return fail(notFound(splitId));
  if (!isSplitKind(s.kind)) return fail("분기 노드만 푼다");
  const keep = findEdge(g, keepEdgeId);
  if (!keep || keep.from !== splitId) return fail(`분기 ${splitId}의 갈래가 아니다`);
  const ins = inOf(g, splitId);
  if (s.kind === "IF" && mergeOf(g, splitId) === null) {
    const join = joinOf(g, splitId);
    const inner = join == null ? null : blockNodes(g, splitId, join);
    if (join == null || !inner) return fail(NO_JOIN_DISSOLVE(splitId));
    if ((endingBranches(g, splitId) ?? []).includes(keepEdgeId)) return fail(KEEP_ENDING);
    const drop = new Set([splitId, ...inner]);
    if (keep.to !== join) {
      const kept = branchNodes(g, splitId, keep.id);
      if (!kept) return fail(NO_JOIN_DISSOLVE(splitId));
      for (const id of kept) drop.delete(id);
    }
    retarget(ins, keep.to);
    return checked(dropNodes(g, drop));
  }
  const cannot = `분기 ${splitId}의 짝 합류를 찾지 못해 풀 수 없다`;
  const m = mergeOf(g, splitId);
  const inner = m ? blockNodes(g, splitId, m.id) : null;
  if (!m || !inner) return fail(cannot);
  const exits = outOf(g, m.id);
  if (exits.length !== 1) return fail(cannot);
  const drop = new Set([splitId, m.id, ...inner]);
  if (keep.to === m.id) {
    retarget(ins, exits[0].to);
  } else {
    const kept = branchNodes(g, splitId, keep.id);
    if (!kept) return fail(cannot);
    retarget(ins, keep.to);
    for (const e of g.edges) if (e.to === m.id && kept.has(e.from)) e.to = exits[0].to;
    for (const id of kept) drop.delete(id);
  }
  return checked(dropNodes(g, drop));
}
```

- [ ] **Step 8: `flow-edit.ts` — 노드 지우기·옮기기**

`removeNode` 를 바꾸고 `unwindReturnMerge`·`removeCatch` 를 지운다:
```ts
/**
 * 노드를 지운다(§8.2). RULE·TASK: 들어오는 선이 없으면 나가는 선과 함께, 있으면 모두 나가는 선 도착으로 옮기고(선 ID 유지) 노드·붙은 받는 노드·그 나가는 선을 지운다
 * (처리 갈래 안 노드는 남긴다). 돌아오는 자리이고 다음이 END 면 거부(RETURN_JOIN_END). IF 는 들어오는 선을 모이는 자리로 옮기고 블록(끝내는 갈래 몸 포함)을 지운다.
 * 병렬은 짝 합류까지 지우고 들어오는 선을 합류 출구 도착으로(R9). 합류는 분기로 지운다. 받는 노드는 자기와 나가는 선만. 결과에 빈 갈래가 둘이면 거부(B2).
 */
export function removeNode(f: EditFlow, nodeId: string): EditResult {
  const g = clone(f);
  const n = findNode(g, nodeId);
  if (!n) return fail(`노드 ${nodeId}를 찾지 못했다`);
  if (n.kind === "START") return fail("시작 노드는 지울 수 없다");
  if (n.kind === "END") return fail("끝 노드는 지울 수 없다");
  if (n.kind === "MERGE") return fail(MERGE_ONLY_BY_SPLIT);
  if (n.kind === "CATCH") return done(dropNodes(g, new Set([nodeId])));
  const endId = endIdOf(g);
  const ins = inOf(g, nodeId);
  if (isStep(n.kind)) {
    const outs = outOf(g, nodeId);
    const drop = new Set([nodeId, ...catchesOf(g, nodeId).map((c) => c.id)]);
    if (ins.length === 0) return done(dropNodes(g, drop));
    if (outs.length !== 1) return fail(RULE_EDGES_NOT_ONE);
    if (outs[0].to === endId && isReturnPlace(g, nodeId)) return fail(RETURN_JOIN_END);
    retarget(ins, outs[0].to);
    g.edges = g.edges.filter((e) => e !== outs[0]);
    return checked(dropNodes(g, drop));
  }
  if (n.kind === "IF" && mergeOf(g, nodeId) === null) {
    const join = joinOf(g, nodeId);
    const members = blockMembers(g, nodeId);
    if (join == null || !members) return fail(NO_JOIN_REMOVE(nodeId));
    if (join === endId && isReturnPlace(g, nodeId)) return fail(RETURN_JOIN_END);
    retarget(ins, join);
    return checked(dropNodes(g, new Set(members)));
  }
  const cannot = `분기 ${nodeId}의 짝 합류를 찾지 못해 지울 수 없다`;
  const m = mergeOf(g, nodeId);
  const exits = m ? outOf(g, m.id) : [];
  const inner = m ? blockNodes(g, nodeId, m.id) : null;
  if (!m || exits.length !== 1 || !inner) return fail(cannot);
  if (exits[0].to === endId && isReturnPlace(g, nodeId)) return fail(RETURN_JOIN_END);
  retarget(ins, exits[0].to);
  return checked(dropNodes(g, new Set([nodeId, ...inner, m.id])));
}
```
`moveExcludedEdges` 의 첫 가지에서 `mergeOf(f, nodeId)?.id ?? null` 를 `returnOf(f, nodeId)` 로 바꾼다(처리 갈래 범위 = 돌아오는 자리 직전까지).

`moveNode` 를 바꾼다:
```ts
/**
 * 룰·빈 단계 또는 분기 블록을 선 t(X→Y) 로 옮긴다(§8.2). 떼어 낼 때 들어오는 선(여럿 가능)을 모두 옮긴다 — 룰은 나가는 선 도착, 새 IF 는 모이는 자리,
 * 병렬은 합류 출구 도착(R9). 룰은 새 선 {룰 → Y} 를 t 뒤에, 새 IF 는 꼬리를 모두 Y 로(꺾는 점 지움) 옮기고 새 선을 만들지 않으며, 병렬은 {합류 → Y} 를 t 뒤에.
 * t.to = 노드. t 의 칸은 그대로. 돌아오는 처리 갈래가 있는 룰은 옮기지 않는다(MOVE_GUARDED). 돌아오는 자리이고 다음이 END 면 거부(RETURN_JOIN_END).
 */
export function moveNode(f: EditFlow, nodeId: string, edgeId: string): EditResult {
  const g = clone(f);
  const n = findNode(g, nodeId);
  if (!n) return fail(notFound(nodeId));
  const fixed = MOVE_FIXED[n.kind];
  if (fixed) return fail(fixed);
  if (!findEdge(g, edgeId)) return fail(`선 ${edgeId}를 찾지 못했다`);
  if (isStep(n.kind) && returnOf(g, nodeId) !== null) return fail(MOVE_GUARDED);
  if (moveExcludedEdges(g, nodeId).has(edgeId)) return fail(MOVE_INTO_SELF);
  const endId = endIdOf(g);
  const taken = takenIds(g); // 떼기 전에 모은다 — 방금 지운 선 ID 를 새 선에 다시 쓰지 않는다
  const ins = inOf(g, nodeId);
  const place = (exitId: string, out: FlowEdge | null): EditResult => {
    if (out) g.edges = g.edges.filter((e) => e !== out); // 들어오는 선을 고친 뒤에 나가는 선만 지운다
    const ti = g.edges.findIndex((e) => e.id === edgeId);
    const t = g.edges[ti];
    insertAfter(g.edges, ti, edge(fresh(taken, "e"), exitId, t.to));
    t.to = nodeId;
    return checked(g);
  };
  if (isStep(n.kind)) {
    const outs = outOf(g, nodeId);
    if (outs.length !== 1) return fail(RULE_EDGES_NOT_ONE_MOVE);
    if (outs[0].to === endId && isReturnPlace(g, nodeId)) return fail(RETURN_JOIN_END);
    retarget(ins, outs[0].to);
    return place(nodeId, outs[0]);
  }
  if (n.kind === "IF" && mergeOf(g, nodeId) === null) {
    const join = joinOf(g, nodeId);
    const tails = tailsOf(g, nodeId);
    if (join == null || !tails || tails.length === 0) return fail(NO_JOIN_MOVE(nodeId));
    if (join === endId && isReturnPlace(g, nodeId)) return fail(RETURN_JOIN_END);
    retarget(ins, join);
    const t = findEdge(g, edgeId)!;
    retarget(tails, t.to);
    dropRoutes(g, tails);
    t.to = nodeId;
    return checked(g);
  }
  const cannot = `분기 ${nodeId}의 짝 합류를 찾지 못해 옮길 수 없다`;
  const m = mergeOf(g, nodeId);
  if (!m || !blockNodes(g, nodeId, m.id)) return fail(cannot);
  const exits = outOf(g, m.id);
  if (exits.length !== 1) return fail(cannot);
  if (exits[0].to === endId && isReturnPlace(g, nodeId)) return fail(RETURN_JOIN_END);
  retarget(ins, exits[0].to);
  return place(m.id, exits[0]);
}
```

- [ ] **Step 9: `flow-edit.ts` — 조각·복제(R7)**

`Fragment` 를 바꾼다:
```ts
/** 복사한 조각 — 노드들과 그 안의 선. entry 로 들어가 exit 로 나온다(룰 하나면 entry = exit, 병렬은 짝 합류). 새 IF 블록은 exit 이 null 이고 꼬리·끝 선을 담는다(R7). */
export interface Fragment {
  nodes: FlowNode[];
  /** 조각 선 — 원래 선 배열 순서. tails·endTails 의 선은 `to` 가 빈 문자열이다. */
  edges: FlowEdge[];
  entry: string;
  exit: string | null;
  /** 새 IF 블록의 꼬리 선 ID(edges 안) — 붙일 때 놓는 선의 도착으로 잇는다. */
  tails?: string[];
  /** 새 IF 블록의 끝 선 ID(edges 안) — 붙일 때 붙여 넣는 흐름의 END 로 잇는다. */
  endTails?: string[];
  /** 조각 노드의 외관(S-D10 — 붙여 넣을 때 새 ID 로 옮긴다). 없으면 키가 없다. */
  styles?: Record<string, NodeStyle>;
  /** 조각 노드의 설명(붙여 넣을 때 새 ID 로 옮긴다). 없으면 키가 없다. */
  descs?: Record<string, string>;
}
```
`copyFragment` 의 분기 가지(받는 노드 확인 뒤)를 바꾼다:
```ts
  const nodes = f.nodes.filter((x) => inside.has(x.id)).map(copyNode);
  const styles = fragmentStyles(f, nodes);
  const descs = fragmentDescs(f, nodes);
  const extra = { ...(styles ? { styles } : {}), ...(descs ? { descs } : {}) };
  if (n.kind === "IF" && mergeOf(f, nodeId) === null) {
    const join = joinOf(f, nodeId)!;
    const endId = endIdOf(f);
    const tails: string[] = [];
    const endTails: string[] = [];
    const edges = f.edges
      .filter((e) => inside.has(e.from) && (inside.has(e.to) || e.to === join || e.to === endId))
      .map((e) => {
        const c = copyEdge(e);
        if (inside.has(e.to)) return c;
        (e.to === join ? tails : endTails).push(e.id);
        return { ...c, to: "" };
      });
    return { nodes, edges, entry: nodeId, exit: null, tails, endTails, ...extra };
  }
  return {
    nodes,
    edges: f.edges.filter((e) => inside.has(e.from) && inside.has(e.to)).map(copyEdge),
    entry: nodeId,
    exit: mergeOf(f, nodeId)!.id,
    ...extra,
  };
```
`wellFormed`·`pasteFragment`·`duplicateNode` 를 바꾼다:
```ts
/** copyFragment 가 만든 모양인가 — ID 가 겹치지 않고, entry·exit(없으면 꼬리 하나 이상)·선 끝이 조각 안이고(꼬리·끝 선은 to 빈 문자열), MERGE 의 짝은 조각 안 병렬이다. */
function wellFormed(frag: Fragment): boolean {
  const byId = new Map(frag.nodes.map((n) => [n.id, n] as const));
  const loose = new Set([...(frag.tails ?? []), ...(frag.endTails ?? [])]);
  const exitOk = frag.exit === null ? (frag.tails ?? []).length > 0 : byId.has(frag.exit);
  return (
    byId.size === frag.nodes.length &&
    byId.has(frag.entry) &&
    exitOk &&
    frag.nodes.every((n) => NODE_PREFIX[n.kind] !== undefined && (n.kind !== "MERGE" || byId.get(n.splitId ?? "")?.kind === "PARALLEL")) &&
    frag.edges.every((e) => byId.has(e.from) && (loose.has(e.id) ? e.to === "" : byId.has(e.to)))
  );
}

/**
 * 조각을 새 ID 로 g 에 넣는다 — 노드는 nodeIndex 뒤, 선은 edgeIndex 뒤(조각 선 순서 그대로, 출구 선은 끝). 꼬리는 tailTo, 끝 선은 g 의 END,
 * 출구(있으면) {출구 → tailTo}. 라벨·조건식·order·otherwise 를 복사하고 합류 splitId 는 새 분기 ID 로, 외관·설명은 새 ID 로 옮긴다. 새 entry ID. g 는 복사본이다.
 */
function instantiate(g: EditFlow, frag: Fragment, nodeIndex: number, tailTo: string, edgeIndex: number): string {
  const taken = takenIds(g);
  const idOf = new Map<string, string>();
  for (const n of frag.nodes) idOf.set(n.id, fresh(taken, NODE_PREFIX[n.kind]!));
  const nid = (id: string) => idOf.get(id)!;
  const endId = endIdOf(g) ?? "";
  const tails = new Set(frag.tails ?? []);
  const endTails = new Set(frag.endTails ?? []);
  const nodes = frag.nodes.map((n) => node(nid(n.id), n.kind, str(n.ruleId), n.kind === "MERGE" ? nid(n.splitId!) : str(n.splitId), str(n.label)));
  const edges = frag.edges.map((e) =>
    edge(fresh(taken, "e"), nid(e.from), tails.has(e.id) ? tailTo : endTails.has(e.id) ? endId : nid(e.to), {
      order: int(e.order), cond: str(e.cond), otherwise: e.otherwise === true, label: str(e.label),
    }),
  );
  const exit = frag.exit === null ? [] : [edge(fresh(taken, "e"), nid(frag.exit), tailTo)];
  insertAfter(g.nodes, nodeIndex, ...nodes);
  insertAfter(g.edges, edgeIndex, ...edges, ...exit);
  if (frag.styles) {
    const styles: Record<string, NodeStyle> = { ...g.view.styles };
    for (const [oldId, s] of Object.entries(frag.styles)) if (idOf.has(oldId)) styles[nid(oldId)] = s;
    g.view = { ...g.view, styles }; // done 이 노드 순서·정규화로 다시 맞춘다
  }
  if (frag.descs) {
    const descs: Record<string, string> = { ...g.view.descs };
    for (const [oldId, d] of Object.entries(frag.descs)) if (idOf.has(oldId)) descs[nid(oldId)] = d;
    g.view = { ...g.view, descs };
  }
  return nid(frag.entry);
}

/** 조각을 선 t(X→Y) 에 붙여 넣는다. t.to = 새 entry, 꼬리·출구는 Y 로, 끝 선은 END 로. 노드는 X 뒤, 조각 선은 t 바로 뒤. 배치는 넣지 않는다(P-D18). */
export function pasteFragment(f: EditFlow, edgeId: string, frag: Fragment): EditResult {
  if (f.nodes.length + frag.nodes.length > MAX_NODES) return fail(NODE_LIMIT_MESSAGE);
  const g = clone(f);
  const ti = g.edges.findIndex((e) => e.id === edgeId);
  if (ti < 0) return fail(`선 ${edgeId}를 찾지 못했다`);
  if (!wellFormed(frag) || ((frag.endTails ?? []).length > 0 && endIdOf(g) === null)) return fail(BAD_FRAGMENT);
  const t = g.edges[ti];
  t.to = instantiate(g, frag, g.nodes.findIndex((n) => n.id === t.from), t.to, ti);
  return done(g);
}

/** 원본 바로 뒤에 복제한다 — 룰은 자기에서 나가는 선, 병렬은 짝 합류에서 나가는 선에 붙여 넣는다. 새 IF 는 원래 꼬리를 복제 분기로, 복제 꼬리를 원래 모이는 자리로(§8.2). */
export function duplicateNode(f: EditFlow, nodeId: string): EditResult {
  const frag = copyFragment(f, nodeId);
  if (typeof frag === "string") return fail(frag);
  if (frag.exit === null) {
    if (f.nodes.length + frag.nodes.length > MAX_NODES) return fail(NODE_LIMIT_MESSAGE);
    const g = clone(f);
    const join = joinOf(g, nodeId);
    const tails = tailsOf(g, nodeId);
    const members = blockMembers(g, nodeId);
    if (join == null || !tails || tails.length === 0 || !members) return fail(`분기 ${nodeId}의 갈래가 모이는 자리를 찾지 못해 복제할 수 없다`);
    const lastMember = g.nodes.findIndex((n) => n.id === members[members.length - 1]);
    const copy = instantiate(g, frag, lastMember, join, g.edges.indexOf(tails[tails.length - 1]));
    retarget(tails, copy);
    dropRoutes(g, tails);
    return checked(g);
  }
  const outs = outOf(f, frag.exit);
  if (outs.length !== 1) {
    return fail(frag.entry === frag.exit ? "룰 노드의 선이 하나씩이 아니라 복제할 수 없다" : `분기 ${nodeId}의 짝 합류를 찾지 못해 복제할 수 없다`);
  }
  return pasteFragment(f, outs[0].id, frag);
}
```

- [ ] **Step 10: `flow-edit.ts` — 받는 노드 연산(돌아오는 합류 기계 없애기)**

`connect` 첫 두 줄(`const back = returnRuleFor(…); if (back) return connectReturn(…);`)을 지우고 Javadoc 둘째 줄("처리 갈래(…)에서 그 룰의 정상 다음 노드로 이으면 돌아오는 합류로 잇는다…")을 "받는 노드·처리 갈래 노드에서 정상 경로 노드로 이으면 그 선이 곧 돌아오는 선이다(implicit-join spec §8.2)." 로 바꾼다.
`reconnectEdge` 에서 `let to` 를 `const to` 로, `const back = returnRuleFor(g, from, to, edgeId); if (back) to = ensureReturnMerge(g, back, takenIds(g)).id;` 두 줄을 지우고 Javadoc 의 "처리 갈래에서 그 룰의 정상 다음 노드로 옮기면 돌아오는 합류로 간다(connect 와 같다)." 를 지운다.
`addCatch` 에서 `const back = …;`·`const target = …;` 두 줄을 지우고 선을 `g.edges.push(edge(fresh(usedIds, "e"), c.id, t.id));` 로, Javadoc 의 "룰 노드에" 를 "룰·빈 단계 노드에" 로, 마지막 문장을 "정상 다음 노드로 놓으면 빈 돌아오는 갈래다." 로 바꾼다.
`handlerTrail`·`returnTargetOf`·`returnRuleFor`·`ensureReturnMerge`·`connectReturn` 을 지우고 `returnCatch` 를 아래 둘로 바꾼다:
```ts
/**
 * 처리 갈래의 맨 바깥 순차에서 END 로 들어가는 선(빈 갈래면 받는 노드의 선) — 분기는 모이는 자리로(병렬은 합류 출구로), 돌아오는 자리가 있는 단계는 그 자리로
 * 건너뛴다(안쪽 갈래는 보지 않는다). 순환·나가는 선이 하나가 아닌 노드·모이는 자리를 못 정하면 null.
 */
function outerEndEdge(g: EditFlow, c: FlowNode): FlowEdge | null {
  const endId = endIdOf(g);
  const seen = new Set<string>();
  let cur: FlowNode | undefined = c;
  while (cur) {
    if (seen.has(cur.id)) return null;
    seen.add(cur.id);
    let via: FlowEdge | null = null;
    let next: string;
    if (isSplitKind(cur.kind)) {
      const j = joinOf(g, cur.id);
      if (j == null) return null;
      if (cur.kind === "PARALLEL" || mergeOf(g, cur.id) !== null) {
        const exits = outOf(g, j);
        if (exits.length !== 1) return null;
        via = exits[0];
        next = via.to;
      } else next = j;
    } else {
      const back = isStep(cur.kind) ? returnOf(g, cur.id) : null;
      if (back !== null) next = back;
      else {
        const outs = outOf(g, cur.id);
        if (outs.length !== 1) return null;
        via = outs[0];
        next = via.to;
      }
    }
    if (next === endId) return via;
    cur = findNode(g, next);
  }
  return null;
}

/**
 * 받는 노드 우클릭 「흐름으로 돌아오기」(§8.2) — 끝내는 처리 갈래의 맨 바깥 끝 선을 돌아올 자리로 옮긴다. 처리 갈래 안 IF 의 끝내는 갈래 끝 선은 그대로다.
 * 돌아올 자리는 그 노드의 돌아오는 자리(있으면), 없으면 노드의 나가는 선 도착. 그 도착이 END 면 거부(RETURN_TO_END, J-D10). 메뉴는 이 연산이 될 때만 항목을 보인다.
 */
export function returnCatch(f: EditFlow, catchId: string): EditResult {
  const g = clone(f);
  const c = findNode(g, catchId);
  if (!c || c.kind !== "CATCH") return fail(`받는 노드 ${catchId}를 찾지 못했다`);
  const host = c.attachTo == null ? undefined : findNode(g, c.attachTo);
  if (!host || !CATCHABLE.has(host.kind)) return fail(CATCH_ONLY_RULE);
  const endId = endIdOf(g);
  const target = handlerTarget(g, catchId);
  if (target === null) return fail(RETURN_OPEN);
  if (target !== endId) return fail(RETURN_ALREADY);
  const outs = outOf(g, host.id);
  const place = returnOf(g, host.id) ?? (outs.length === 1 ? outs[0].to : null);
  if (place === null) return fail(RETURN_NO_EXIT);
  if (place === endId) return fail(RETURN_TO_END);
  const tail = outerEndEdge(g, c);
  if (!tail) return fail(RETURN_OPEN);
  tail.to = place;
  dropRoutes(g, [tail]);
  return done(g);
}
```
`grep -n "returnRuleFor\|ensureReturnMerge\|handlerTrail\|returnTargetOf\|connectReturn\|unwindReturnMerge\|removeCatch\|RETURN_MERGE\|splitAndMerge" src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts` → 0건.

- [ ] **Step 11: 접기 보기 — `canvas/collapse.ts`**

파일 전체를 바꾼다:
```ts
/**
 * 블록 접기 보기(3단계 계획 D16, implicit-join spec §8.4) — 접힌 분기의 안쪽 노드를 감추고 선을 다시 잇는 캔버스용 흐름을 만든다(저장 흐름은 그대로).
 * 병렬(과 옛 형식 IF)은 짝 합류를 감추고 합류에서 나가던 선(같은 ID)이 분기에서 나간다. 새 형식 IF 는 모이는 자리가 블록 밖이라 남고, 블록에서 모이는 자리로 가는
 * 꼬리·빈 갈래와 끝 선을 빼는 대신 그리기 전용 대표 선 `fold:{분기}` 하나를 첫 꼬리 자리에 둔다(J-D14 — 캔버스는 이 선에 손잡이를 주지 않는다). React 의존이 없다.
 */
import type { FlowEdge } from "@/contract/engine-contract.generated";

import { blockMembers, type EditFlow } from "../flow-edit";
import { joinOf } from "../flow-model";

/** 접힌 새 형식 IF 의 대표 선 ID 접두어(R20). */
export const FOLD_EDGE_PREFIX = "fold:";

export interface CollapsedView {
  /** 캔버스에 그릴 흐름. */
  flow: EditFlow;
  /** 감춘 노드 ID. */
  hidden: ReadonlySet<string>;
  /** 접힌 분기 ID → 안쪽 노드 수·멤버. */
  blocks: Readonly<Record<string, { count: number; members: string[] }>>;
}

const NONE: ReadonlySet<string> = new Set<string>();
const NO_BLOCKS: Readonly<Record<string, { count: number; members: string[] }>> = {};

const foldEdge = (s: string, to: string): FlowEdge => ({ id: `${FOLD_EDGE_PREFIX}${s}`, from: s, to, order: null, cond: null, otherwise: false, label: null });

/**
 * 접힌 분기 가운데 다른 접힌 분기 안에 있지 않은 것(바깥이 이긴다)만 쓴다. 닫히지 않은 블록·없는 ID 는 무시한다.
 * `blocks[분기].members` 는 분기 자신을 포함한 블록 멤버 전체(초점 이동 대상 찾기용), `count` 는 IF 가 멤버 − 1(분기), 병렬·옛 IF 가 − 2(분기·합류)다.
 */
export function collapseView(flow: EditFlow, collapsed: ReadonlySet<string>): CollapsedView {
  if (collapsed.size === 0) return { flow, hidden: NONE, blocks: NO_BLOCKS };
  const closed = new Map<string, string[]>();
  for (const id of collapsed) {
    const members = blockMembers(flow, id);
    if (members) closed.set(id, members);
  }
  const top: string[] = [];
  for (const [id] of closed) {
    let inside = false;
    for (const [other, members] of closed) if (other !== id && members.includes(id)) inside = true;
    if (!inside) top.push(id);
  }
  if (top.length === 0) return { flow, hidden: NONE, blocks: NO_BLOCKS };

  const hidden = new Set<string>();
  const blocks: Record<string, { count: number; members: string[] }> = {};
  const mergeToSplit = new Map<string, string>();
  /** 접힌 새 IF 멤버(분기 포함) → [분기, 모이는 자리]. */
  const foldOf = new Map<string, readonly [string, string]>();
  for (const id of top) {
    const members = closed.get(id)!;
    for (const m of members) if (m !== id) hidden.add(m);
    const merge = flow.nodes.find((n) => n.kind === "MERGE" && n.splitId === id && members.includes(n.id));
    blocks[id] = { count: members.length - (merge ? 2 : 1), members };
    if (merge) mergeToSplit.set(merge.id, id);
    else {
      const join = joinOf(flow, id);
      if (join != null) for (const m of members) foldOf.set(m, [id, join]);
    }
  }
  const edges: FlowEdge[] = [];
  const folded = new Set<string>();
  for (const e of flow.edges) {
    const split = mergeToSplit.get(e.from);
    if (split) {
      if (!hidden.has(e.to)) edges.push({ ...e, from: split });
      continue;
    }
    const fold = foldOf.get(e.from);
    if (fold) {
      // 블록 멤버에서 나가는 선 — 꼬리(모이는 자리로)는 대표 선 하나로, 갈래·안쪽·끝 선은 뺀다.
      if (e.to === fold[1] && !folded.has(fold[0])) {
        folded.add(fold[0]);
        edges.push(foldEdge(fold[0], fold[1]));
      }
      continue;
    }
    if (!hidden.has(e.from) && !hidden.has(e.to)) edges.push(e);
  }
  return { flow: { ...flow, nodes: flow.nodes.filter((n) => !hidden.has(n.id)), edges }, hidden, blocks };
}
```

- [ ] **Step 12: 열기 알림 — `state/useRuleSetEdit.ts`(R14)**

import 에 `toEditFlowCounted, UPGRADE_NOTICE` 를 더한다. `load` 안의 `replaceFlow(toEditFlow(next.set.flow, next.set.ruleIds ?? []), { refetchCond: false });` 를 아래로 바꾸고, `editFailShown.current = false;` 다음(`return true;` 앞)에 알림을 둔다:
```ts
        const loaded = toEditFlowCounted(next.set.flow, next.set.ruleIds ?? []);
        replaceFlow(loaded.flow, { refetchCond: false });
```
```ts
        if (loaded.upgraded > 0) setMessage({ kind: "info", text: UPGRADE_NOTICE(loaded.upgraded) });
```
`rule-set-edit-page.test.ts` 의 describe 안에 더한다:
```ts
  it("옛 합류가 있는 세트를 열면 없앤 형식으로 그리고 알림을 한 번 보이며 dirty 가 아니다(implicit-join R14·J-D12)", async () => {
    await openChain(branchedView());
    expect(canvasNodeIds()).not.toContain("m1");
    expect(visibleText(byTestId("set-message"))).toContain("옛 합류 노드 1개를 없앤 형식으로 바꿔 열었다. 저장하면 새 형식으로 남는다.");
    await click("flow-mode-edit");
    expect(saveButton().disabled).toBe(true);
  });
```

- [ ] **Step 13: 기존 시험 판정 규칙대로 기대 옮기기**

Run: `cd src/frontend/m-mdm && node scripts/test.mjs --maxWorkers=3`
실패한 시험마다 아래 규칙으로 판정한다(완료 보고에 "파일:시험 이름 → 규칙 번호" 표로 남긴다):
1. **IF 합류가 사라짐** — 기대가 IF 의 짝 MERGE(`m1`·`splitId: "if1"`·합류 노드 수·합류 출구 선·`insertSplit`(IF) 결과의 MERGE)에 기댄다 → 새 형식 기대로 고친다(합류 대신 모이는 자리, `insertSplit` IF 는 「갈래 1」 빈 단계, 노드 수는 같거나 −1).
2. **돌아오는 합류가 사라짐** — 처리 갈래가 `splitId` = 룰인 MERGE 로 간다고 기대한다 → 정상 경로 노드로 바로 가는 기대로 고친다. `RETURN_MERGE_*` 기대는 `RETURN_JOIN_END`·`RETURN_TO_END` 사례로 바꾼다.
3. **문구가 바뀜** — `RULE_EDGES_NOT_ONE`·`RULE_EDGES_NOT_ONE_MOVE`·`CATCH_ONLY_RULE`·`NO_COPY`·"짝 합류 밖에서"(→ "모이는 자리 밖에서") → 새 문구.
4. **변환이 픽스처를 바꿈** — `toEditFlow` 로 연 옛 형식 픽스처의 노드·선·배치·접기 개수 기대 → 변환 결과 기준으로 고친다(배치 좌표는 그 시험이 보는 노드만 다시 잰다).
5. 그 밖 → 구현 결함이다. 기대를 고치지 말고 코드를 고친다.
`grep -rln "RETURN_MERGE_NOT_ONE\|RETURN_MERGE_STUCK" src/frontend/m-mdm/tests` → 0건이 될 때까지 규칙 2 를 적용한다.

- [ ] **Step 14: 통과 확인**

Run: `cd src/frontend/m-mdm && node scripts/test.mjs --maxWorkers=3`, `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint`, `python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/collapse.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts`, `python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit` (같은 파일)
Expected: `[m-mdm test 합계]` 실패 0, lint 오류 0, audit 0건.

- [ ] **Step 15: 커밋**

`/usr/bin/git status --porcelain src/frontend/m-mdm` 으로 고친 파일 목록을 얻어 그 경로만 지정한다(아래 `<고친 시험 파일들>` 은 Step 13 표의 파일 목록 그대로).
```bash
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/collapse.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/legacy-upgrade.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/implicit-join-edit.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/collapse.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-edit-page.test.ts <고친 시험 파일들>
/usr/bin/git commit -m "feat(mdm): 룰 세트 편집기가 옛 합류를 바꿔 열고 IF·받는 노드를 합류 없이 편집한다(D-136)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/collapse.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/legacy-upgrade.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/implicit-join-edit.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/collapse.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-edit-page.test.ts <고친 시험 파일들>
```

---
### Task 5: 자동 배치 — 모이는 자리·끝내는 IF 갈래 비켜 놓기·병렬 합류 막대 크기

**등급:** standard — 정해진 규칙(§9)을 지금 배치 단계에 얹는다.
**병렬:** Task 1 병합 뒤(Task 4 보다 먼저 열어도 된다 — `flow-layout.ts` 만 고친다).

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts`
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-layout.test.ts`·`catch-layout.test.ts`

**Interfaces:**
- Consumes(Task 1): `Split.joinId`·`Branch.ends`·`Guarded.step`·`Handler.body`, `parseFlow`.
- Produces: `NODE_SIZE.MERGE = { w: 200, h: 14 }`(Task 6 의 이중선 막대가 이 크기로 그린다), `endingRoutes` 가 끝내는 IF 갈래 끝 선에도 경로를 낸다.

- [ ] **Step 1: 실패하는 시험**

`flow-layout.test.ts` 끝에 더한다(`toEditFlow`·`autoLayout`·`endingRoutes`·`clearLayoutCache`·`NODE_SIZE` import 가 없으면 더한다):
```ts
describe("자동 배치 — 합류 없애기(implicit-join spec §9)", () => {
  const N = (id: string, kind: "START" | "END" | "RULE" | "IF") => ({ id, kind, ruleId: kind === "RULE" ? id.toUpperCase() : null, splitId: null, label: null });
  const E = (id: string, from: string, to: string, over: { order?: number; cond?: string; otherwise?: boolean } = {}) =>
    ({ id, from, to, order: over.order ?? null, cond: over.cond ?? null, otherwise: over.otherwise ?? false, label: null });
  /** start → r0 → if1 [b1 "X > 0" → e1 → e2 → end](끝내는 갈래) [그 외 → a] → a → b → end */
  const ending = () => toEditFlow({ version: 1,
    nodes: [N("start", "START"), N("r0", "RULE"), N("if1", "IF"), N("e1", "RULE"), N("e2", "RULE"), N("a", "RULE"), N("b", "RULE"), N("end", "END")],
    edges: [E("s0", "start", "r0"), E("s1", "r0", "if1"), E("b1", "if1", "e1", { order: 1, cond: "X > 0" }), E("ee1", "e1", "e2"), E("ee2", "e2", "end"),
      E("bo", "if1", "a", { otherwise: true }), E("ea", "a", "b"), E("eb", "b", "end")] }, []);

  it("병렬 합류는 병렬 분기와 같은 200×14 막대다", () => {
    expect(NODE_SIZE.MERGE).toEqual({ w: 200, h: 14 });
  });

  it("끝내는 IF 갈래 몸은 같은 높이의 IF 뒤 노드 오른쪽으로 비켜 놓는다", () => {
    clearLayoutCache();
    const pos = autoLayout(ending());
    const overlapY = (p: string, q: string) => pos[p].y < pos[q].y + 68 && pos[q].y < pos[p].y + 68;
    expect(overlapY("e1", "a")).toBe(true);
    expect(pos.e1.x).toBeGreaterThanOrEqual(pos.a.x + 232 + 40 - 1);
    expect(pos.e2.x).toBeGreaterThanOrEqual(pos.b.x + 232 + 40 - 1);
  });

  it("끝내는 IF 갈래 끝 선도 기본 꺾은선이 다른 노드를 지나면 비켜 가는 경로를 만든다", () => {
    const pos = { start: { x: 56, y: -200 }, r0: { x: 0, y: -120 }, if1: { x: 28, y: 0 }, e1: { x: 300, y: 100 }, e2: { x: 300, y: 200 },
      a: { x: 0, y: 150 }, b: { x: 0, y: 300 }, end: { x: 56, y: 400 } };
    expect(Object.keys(endingRoutes(ending(), pos))).toEqual(["ee2"]);
  });
});
```
`catch-layout.test.ts` 끝에 더한다:
```ts
describe("빈 처리 갈래 판정(implicit-join spec §9)", () => {
  const N = (id: string, kind: "START" | "END" | "RULE") => ({ id, kind, ruleId: kind === "RULE" ? id.toUpperCase() : null, splitId: null, label: null });
  const E = (id: string, from: string, to: string) => ({ id, from, to, order: null, cond: null, otherwise: false, label: null });
  it("정상 경로 중간 노드로 바로 돌아오는 빈 처리 갈래는 가상 선을 넣지 않아 받는 노드 없는 흐름과 배치가 같다", () => {
    const nodes = [N("start", "START"), N("r1", "RULE"), N("x", "RULE"), N("n", "RULE"), N("end", "END")];
    const edges = [E("e1", "start", "r1"), E("e2", "r1", "x"), E("e3", "x", "n"), E("e4", "n", "end")];
    const base = toEditFlow({ version: 1, nodes, edges }, []);
    const guarded = toEditFlow({ version: 1, nodes: [...nodes, { ...N("c1", "RULE"), kind: "CATCH" as const, ruleId: null, attachTo: "r1", catches: ["NO_RESULT"] }],
      edges: [...edges, E("e5", "c1", "n")] }, []);
    clearLayoutCache();
    const a = autoLayout(base);
    const b = autoLayout(guarded);
    for (const id of ["start", "r1", "x", "n", "end"]) expect(b[id], id).toEqual(a[id]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd src/frontend/m-mdm && node scripts/test.mjs --maxWorkers=3 tests/dme/ruleSetEdit/flow-layout.test.ts tests/dme/ruleSetEdit/catch-layout.test.ts`
Expected: FAIL — MERGE 크기 28×28, 끝내는 갈래 몸이 IF 뒤 노드와 겹치는 자리, `endingRoutes` 가 받는 노드 없는 흐름에서 빈 결과, 빈 돌아오는 처리 갈래가 r1→n 가상 선을 넣어 배치가 달라짐.

- [ ] **Step 3: 구현 — `flow-layout.ts`**

1. `NODE_SIZE` 의 MERGE 줄: `MERGE: { w: 200, h: 14 }, // 병렬 합류 — 병렬 분기와 같은 크기의 이중선 막대(implicit-join spec §10)`.
2. `runLayout` 의 받는 노드 가상 선 판정을 블록 트리로 바꾼다. `const slots = catchSlots(f);` 위에 더한다:
```ts
  const tree = parseFlow(layoutCopy(f)).tree;
  /** 빈 처리 갈래(몸 없음)의 받는 노드 — 트리가 없으면 도착이 END 인 것만 빈 갈래로 본다(implicit-join spec §9). */
  const emptyHandlers = new Set<string>();
  if (tree) collectEmptyHandlers(tree.root, emptyHandlers);
```
`const empty = !to || to.kind === "END" || (to.kind === "MERGE" && to.splitId === s.attachTo);` 를 `const empty = !to || (tree ? emptyHandlers.has(e.from) : to.kind === "END");` 로 바꾸고, 그 위 주석의 "빈 처리 갈래(받는 노드 → 끝·돌아오는 합류)" 를 "빈 처리 갈래(몸 없이 끝·돌아오는 자리로 바로 가는 갈래)" 로 바꾼다. 파일 아래 도우미 자리에 더한다:
```ts
/** 몸이 빈 처리 갈래의 받는 노드 ID(중첩 포함). */
function collectEmptyHandlers(seq: Seq, out: Set<string>): void {
  for (const b of seq.items) {
    if (b.type === "SEQ") collectEmptyHandlers(b, out);
    else if (b.type === "SPLIT") for (const br of b.branches) collectEmptyHandlers(br.body, out);
    else if (b.type === "GUARDED") {
      collectEmptyHandlers(b.normal, out);
      for (const h of b.handlers) {
        if (h.body.items.length === 0) out.add(h.catchNodeId);
        collectEmptyHandlers(h.body, out);
      }
    }
  }
}
```
3. `hasGuarded` 를 `hasSideBody` 로 바꾸고(이름·부르는 곳 모두) 끝내는 갈래도 센다:
```ts
/** 몸에 받는 노드 블록(GUARDED)이나 끝내는 IF 갈래가 하나라도 있는가(중첩 포함) — 있으면 안쪽부터 맞추고 오른쪽으로 비켜 놓는다. */
function hasSideBody(seq: Seq): boolean {
  return seq.items.some(
    (b) => b.type === "GUARDED" || (b.type === "SEQ" && hasSideBody(b)) || (b.type === "SPLIT" && b.branches.some((br) => br.ends || hasSideBody(br.body))),
  );
}
```
4. `placeSplit` 의 갈래 목록을 이어지는 갈래로만 만든다 — `const lanes = b.branches.map((br) => {` 를 아래 두 줄로 바꾼다(본문 그대로, `g.edge(b.nodeId, b.joinId)`·`g.node(b.joinId)` 는 Task 1 이 바꿨다):
```ts
    // 끝내는 갈래는 갈래 자리 나누기에서 뺀다 — 몸은 아래 pushRight 가 오른쪽으로 비켜 놓는다(implicit-join spec §9).
    const lanes = b.branches.filter((br) => !br.ends).map((br) => {
```
5. `placeGuarded` 의 마지막 줄 `if (b.mergeId && cx.has(b.mergeId)) cx.set(b.mergeId, ruleX);` 와 Javadoc 의 ", 돌아오는 MERGE 는 룰 가운데 아래" 를 지운다(돌아오는 자리는 바깥 순차 노드라 dagre 자리 그대로).
6. 끝내기 비켜 놓기를 일반화한다 — `if (!hasGuarded(tree.root)) return;` 를 `if (!hasSideBody(tree.root)) return;` 로, `clearEnding` 을 아래로 바꾸고 `walk` 의 SPLIT 가지에 IF 를 더한다:
```ts
  /**
   * 몸들을 순서대로 오른쪽으로 민다 — 앞 몸 오른쪽 끝 + NODESEP 을 넘고, ends 인 몸은 세로 범위가 겹치는 다른 노드(받는 노드·자기 몸·뒤 몸 제외) 전부의
   * 오른쪽 끝 + NODESEP 너머로(끝내는 처리 갈래·끝내는 IF 갈래가 END 바로 위까지 늘어나 뒤 흐름과 겹치지 않게). 움직이지 않은 노드는 그대로다.
   */
  const pushRight = (bodies: readonly string[][], ends: readonly boolean[]) => {
    let prevRight = -Infinity;
    bodies.forEach((ids, k) => {
      if (ids.length === 0) return;
      const { x1, x2, boxes } = spanOf(ids);
      let need = prevRight + NODESEP - x1;
      if (ends[k]) {
        const y1 = Math.min(...boxes.map((x) => x.y1));
        const y2 = Math.max(...boxes.map((x) => x.y2));
        const skip = new Set([...ids, ...bodies.slice(k + 1).flat()]);
        for (const id of others) {
          if (skip.has(id)) continue;
          const o = boxOf(id);
          if (o.y1 < y2 && y1 < o.y2) need = Math.max(need, o.x2 + NODESEP - x1);
        }
      }
      const d = need > 0.5 ? need : 0; // dagre 좌표의 소수 오차로 움직이지 않게
      shift(ids, d);
      prevRight = x2 + d;
    });
  };
  const clearEnding = (b: Guarded) =>
    pushRight(b.handlers.map((h) => bodyIds(h.body).filter((id) => cx.has(id))), b.handlers.map((h) => h.ends));
  const clearEndingIf = (b: Split) => {
    const ending = b.branches.filter((br) => br.ends);
    pushRight(ending.map((br) => bodyIds(br.body).filter((id) => cx.has(id))), ending.map(() => true));
  };
```
```ts
      else if (b.type === "SPLIT") {
        for (const br of b.branches) walk(br.body);
        if (b.kind === "IF") clearEndingIf(b);
      }
```
7. `endingRoutes` 첫 줄 `if (!(f.nodes ?? []).some((n) => n.kind === "CATCH")) return out;` 를 `if (!(f.nodes ?? []).some((n) => n.kind === "CATCH" || n.kind === "IF")) return out;` 로, `walk` 의 SPLIT 가지를 바꾼다:
```ts
      else if (b.type === "SPLIT") {
        for (const br of b.branches) {
          walk(br.body);
          if (br.ends) tails.push(lastExit(br.body) ?? b.nodeId); // 끝내는 IF 갈래 끝 선(몸이 없으면 IF 에서 END 로 가는 갈래 선)
        }
      }
```
Javadoc 첫 줄을 "끝내는 처리 갈래·끝내는 IF 갈래가 END 로 들어가는 선(빈 갈래면 받는 노드·IF 의 선)의 자동 꺾는 점" 으로 바꾼다.

- [ ] **Step 4: 통과 확인**

Run: `cd src/frontend/m-mdm && node scripts/test.mjs --maxWorkers=3`, `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint`, `python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts`, `python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts`
Expected: 실패 0·오류 0·audit 0건. 받는 노드·병렬 배치 시험(`catch-layout`·`node-style-layout`·`layout-cache`)에서 좌표가 바뀌면 원인이 MERGE 크기(28 → 200)·돌아오는 합류 자리 줄 삭제인지 확인하고 그 기대만 고친다(완료 보고에 목록).

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-layout.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/catch-layout.test.ts
/usr/bin/git commit -m "feat(mdm): 룰 세트 자동 배치가 끝내는 IF 갈래를 비켜 놓고 병렬 합류를 막대 크기로 둔다(D-136)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-layout.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/catch-layout.test.ts
```
(Step 4 에서 다른 시험 기대를 고쳤으면 그 파일도 두 명령에 더한다.)

---

### Task 6: 캔버스·패널 — 이중선 병렬 합류·빈 단계 예외 연결점·접기 대표 선·분기 풀기 메뉴·IF 패널·받는 노드 패널·가이드

**등급:** standard — 정해진 표시·testid 를 기존 컴포넌트에 얹는다.
**병렬:** Task 4·5 병합 뒤. Task 7 과 함께 돌 수 있다.

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx`·`canvas/FlowCanvas.tsx`·`canvas/menus/edit-menu.ts`, `styles/base.ts`, `panels/PropertyPanel.tsx`·`panels/PanelHeader.tsx`
- Modify: `docs/guide/FrontEnd/Local-Rules.md`(§19 끝에 한 줄)
- Create: `src/frontend/m-mdm/tests/dme/ruleSetEdit/implicit-join-ui.test.ts`

**Interfaces:**
- Consumes(Task 1·4·5): `endingBranches`·`joinOf`(`flow-model`), `KEEP_ENDING`(`flow-edit`), `FOLD_EDGE_PREFIX`(`canvas/collapse`), `NODE_SIZE.MERGE`.
- Produces(testid): `flow-prop-branch-{edgeId}-ending`(끝냄 표지), `flow-prop-if-ending-help`(이어지는 갈래 안내), `flow-prop-catch-never-task`(TASK 받는 노드 경고), `flow-menu-item-dissolve-{edgeId}`(끝내는 갈래는 `disabled`), 빈 단계 우클릭 `flow-menu-item-catch-add`, 빈 단계 `flow-catch-handle-{id}`.

- [ ] **Step 1: 실패하는 시험(`implicit-join-ui.test.ts`, 새 파일)**

```ts
/** @vitest-environment happy-dom */
// implicit-join spec §8.3·§8.4·§10 — 이중선 병렬 합류·빈 단계 예외 연결점·접기 대표 선 손잡이 없음·분기 풀기 메뉴·IF 패널 끝냄 표지·안내·빈 단계 받는 노드 경고.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import type { FlowEdge, FlowNode } from "../../../src/contract/engine-contract.generated";
import type { RuleSetCheck } from "../../../pages/dme/ruleSetEdit/types";
import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { handlesOf } from "../../../pages/dme/ruleSetEdit/canvas/nodes";
import { editMenu } from "../../../pages/dme/ruleSetEdit/canvas/menus/edit-menu";
import { insertSplit, toEditFlow, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { PropertyPanel, type PropertyPanelProps } from "../../../pages/dme/ruleSetEdit/panels/PropertyPanel";
import type { SectionMemory } from "../../../pages/dme/ruleSetEdit/panels/Section";
import { BASE_CSS } from "../../../pages/dme/ruleSetEdit/styles/base";
import { flush, installDomStorage } from "../helpers/render";

const N = (id: string, kind: FlowNode["kind"], over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: kind === "RULE" ? id.toUpperCase() : null, splitId: null, label: null, ...over });
const E = (id: string, from: string, to: string, over: Partial<FlowEdge> = {}): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null, ...over });
/** start → if1 [b1 "X > 0" → k → end](끝내는 갈래) [b2 "X > 1" → z → a] [그 외 → a] → a → end */
const F3 = (): EditFlow => toEditFlow({ version: 1,
  nodes: [N("start", "START"), N("if1", "IF"), N("k", "RULE"), N("z", "RULE"), N("a", "RULE"), N("end", "END")],
  edges: [E("e0", "start", "if1"), E("b1", "if1", "k", { order: 1, cond: "X > 0", label: "단가 없음" }), E("b2", "if1", "z", { order: 2, cond: "X > 1" }),
    E("bo", "if1", "a", { otherwise: true, label: "그 외" }), E("ek", "k", "end"), E("ez", "z", "a"), E("ea", "a", "end")] }, []);

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  installDomStorage();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const noop = () => {};

describe("이중선 병렬 합류·빈 단계 예외 연결점(§10·§8.3)", () => {
  it("병렬 합류 스타일은 배경 없이 위·아래 두 줄이다", () => {
    expect(BASE_CSS).toMatch(/\.rsf-merge \{[^}]*border-top: 4px solid var\(--rsf-par-bar\);[^}]*border-bottom: 4px solid var\(--rsf-par-bar\);/);
    expect(BASE_CSS).not.toMatch(/\.rsf-merge \{[^}]*border-radius: 50%/);
  });

  it("빈 단계에도 예외 연결점 손잡이가 있다", () => {
    expect(handlesOf("TASK").some((h) => h.id === "catch")).toBe(true);
  });
});

describe("편집 메뉴(§8.3)", () => {
  const ctx = (flow: EditFlow) => ({ mode: "edit", flow, act: new Proxy({}, { get: () => noop }), hasClipboard: false, selection: [] }) as unknown as Parameters<typeof editMenu>[1];

  it("분기 풀기 하위 항목 — 빈 갈래는 (빈 갈래), 끝내는 갈래는 (끝냄) 이고 흐리다", () => {
    const items = editMenu({ kind: "node", nodeId: "if1" } as Parameters<typeof editMenu>[0], ctx(F3()));
    const dissolve = items.find((i) => i.id === "dissolve")!.children!;
    expect(dissolve.map((i) => [i.label, !!i.disabled])).toEqual([["단가 없음 (끝냄)", true], ["갈래 2", false], ["그 외 (빈 갈래)", false]]);
  });

  it("빈 단계 우클릭에도 「예외 받기 추가」 가 있다", () => {
    const f = toEditFlow({ version: 1, nodes: [N("start", "START"), N("t1", "TASK", { label: "빈 단계" }), N("end", "END")],
      edges: [E("e1", "start", "t1"), E("e2", "t1", "end")] }, []);
    const items = editMenu({ kind: "node", nodeId: "t1" } as Parameters<typeof editMenu>[0], ctx(f));
    expect(items.map((i) => i.id)).toContain("catch-add");
  });
});

describe("접기 대표 선(J-D14, R20)", () => {
  const props = (over: Partial<FlowCanvasProps>): FlowCanvasProps => ({
    flow: F3(), rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null, overlay: null, focusId: null, focusSeq: 0,
    onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop, onDropPalette: noop, onNoteChange: noop, breakpoints: new Set(),
    collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null, onMoveNode: noop, onDropRule: noop, onContextMenu: noop, onEditCond: noop,
    onEditCondClose: noop, onToggleBreakpoint: noop, ...over,
  });
  const draw = async (p: FlowCanvasProps) => {
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
    });
    await flush();
  };

  it("고른 대표 선에는 [+] 가 없고, 고른 실제 선에는 있다", async () => {
    await draw(props({ collapsed: new Set(["if1"]), selectedEdgeId: "fold:if1" }));
    expect(document.querySelector('[data-testid="flow-edge-add-fold:if1"]')).toBeNull();
    await draw(props({ collapsed: new Set(["if1"]), selectedEdgeId: "ea" }));
    expect(q("flow-edge-add-ea")).not.toBeNull();
  });
});

describe("속성 패널(§8.3)", () => {
  const OPEN: SectionMemory = { isOpen: () => true, toggle: () => {}, open: () => {} };
  const render = async (flow: EditFlow, selectedId: string, checks: RuleSetCheck[] = []) => {
    const p: PropertyPanelProps = { flow, rules: {}, checks, selectedId, editable: true, editing: true, sections: OPEN, onOpenRule: () => {}, onEdit: () => null };
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement(PropertyPanel, p)));
    });
    await flush();
  };

  it("IF 갈래 목록에서 끝내는 갈래 옆에 「끝냄」 을, 목록 아래에 이어지는 갈래 안내를 보인다", async () => {
    await render(F3(), "if1");
    expect(q("flow-prop-branch-b1-ending")!.textContent).toBe("끝냄");
    expect(q("flow-prop-branch-b2-ending")).toBeNull();
    expect(q("flow-prop-if-ending-help")!.textContent).toBe("흐름을 이어 갈 갈래는 「그 외」로 둔다. 끝낼 갈래는 조건 갈래로 두고 끝 노드로 잇는다.");
  });

  it("END 앞에 끼운 IF 는 END 직행 「그 외」 에 「끝냄」 만 보이고 안내는 숨긴다(R21, 편차 F9)", async () => {
    const r = insertSplit(toEditFlow(null, ["R_A"]), "e2", "IF");
    if (!r.ok) throw new Error(r.reason);
    await render(r.flow, "if1");
    const other = r.flow.edges.find((e) => e.from === "if1" && e.otherwise)!;
    expect(q(`flow-prop-branch-${other.id}-ending`)).not.toBeNull();
    expect(q("flow-prop-if-ending-help")).toBeNull();
  });

  it("빈 단계에 붙은 받는 노드는 「붙은 노드」 와 빈 단계 경고 한 줄을 보인다", async () => {
    const f = toEditFlow({ version: 1, nodes: [N("start", "START"), N("t1", "TASK", { label: "빈 단계" }), { ...N("c1", "CATCH"), attachTo: "t1", catches: ["NO_RESULT"] },
      N("end", "END")], edges: [E("e1", "start", "t1"), E("e2", "t1", "end"), E("e3", "c1", "end")] }, []);
    const never: RuleSetCheck = { code: "CATCH_NEVER", severity: "WARN", ruleId: null, otherRuleId: null, varName: null,
      message: "t1는 빈 단계라 c1가 받는 예외가 일어나지 않는다", nodeId: "c1", edgeId: null };
    await render(f, "c1", [never]);
    expect(q("flow-prop-catch")!.textContent).toContain("붙은 노드");
    expect(q("flow-prop-catch-never-task")!.textContent).toBe("t1는 빈 단계라 c1가 받는 예외가 일어나지 않는다");
  });
});
```
(`PropertyPanelProps`·`SectionMemory` 모양은 `catch-panel.test.ts:21·36-50` 과 같다. `BASE_CSS` 는 `styles/base.ts:6` 의 export 다.)

- [ ] **Step 2: 실패 확인**

Run: `cd src/frontend/m-mdm && node scripts/test.mjs --maxWorkers=3 tests/dme/ruleSetEdit/implicit-join-ui.test.ts`
Expected: FAIL — 둥근 합류 스타일, TASK 에 예외 손잡이 없음, 메뉴 (끝냄) 없음, 대표 선에 [+], 끝냄 표지·안내·TASK 경고 줄 없음.

- [ ] **Step 3: 노드 그리기 — `canvas/nodes.tsx`·`styles/base.ts`**

`FlowNodeView` 루트 `<div>` 에 `title={kind === "MERGE" ? "병렬 합류" : undefined}` 를 더한다. `{data.linkable && kind === "RULE" && !collapsed && <CatchHandle … />}` 를 `{data.linkable && (kind === "RULE" || kind === "TASK") && !collapsed && <CatchHandle node={node} isConnectable={isConnectable} />}` 로, `CatchHandle` Javadoc 의 "룰 노드" 를 "룰·빈 단계 노드" 로 바꾼다. `handlesOf` 의 `if (kind === "RULE") {` 를 `if (kind === "RULE" || kind === "TASK") {` 로 바꾼다.
`styles/base.ts` 의 `/* 병렬 막대 · 합류 원 */` 절 마지막 두 줄(`.rsf-merge …`)을 바꾼다:
```css
/* 병렬 합류 — 병렬 분기와 같은 크기의 이중선 막대(implicit-join spec §10). 배경 없이 위·아래 4px 두 줄, 가운데 6px 빈 줄 */
.rsf-merge { background: transparent; border: 0; border-top: 4px solid var(--rsf-par-bar); border-bottom: 4px solid var(--rsf-par-bar); border-radius: 0; box-shadow: none; box-sizing: border-box; }
.rsf-merge[data-selected="true"] { outline: 2px solid var(--color-primary); outline-offset: 3px; box-shadow: none; }
.rsf-merge[data-state="run"], .rsf-merge[data-state="current"] { background: transparent; border-top-color: var(--color-success); border-bottom-color: var(--color-success); box-shadow: none; }
```
(절 제목 주석은 `/* 병렬 막대 · 병렬 합류 이중선 */` 로.)

- [ ] **Step 4: 접기 대표 선 손잡이 — `canvas/FlowCanvas.tsx`**

import 에 `FOLD_EDGE_PREFIX` 를 더한다(`import { FOLD_EDGE_PREFIX, collapseView } from "./collapse";`). `rawEdges` 의 map 안 `const folded = …` 다음 줄에 `const rep = e.id.startsWith(FOLD_EDGE_PREFIX); // 접힌 IF 의 대표 선 — 그리기 전용(J-D14)` 를 두고 `insertable: editable,` 를 `insertable: editable && !rep,` 로 바꾼다. `onEdgeClick` 과 `onEdgeContextMenu` 를 바꾼다:
```ts
  const onEdgeContextMenu = useCallback((e: ReactMouseEvent, ed: Edge) => {
    if (ed.id.startsWith(FOLD_EDGE_PREFIX)) {
      e.preventDefault(); // 대표 선은 메뉴가 없다(J-D14)
      return;
    }
    openMenu(e, { kind: "edge", edgeId: ed.id, via: "context" });
  }, [openMenu]);
```
```ts
  const onEdgeClick = useCallback((_e: ReactMouseEvent, ed: Edge) => {
    if (!ed.id.startsWith(FOLD_EDGE_PREFIX)) onSelectEdge(ed.id);
  }, [onSelectEdge]);
```
(지금 `onEdgeContextMenu` 의 deps 배열을 그대로 쓴다.) 머리 주석에 한 문단을 더한다: `접힌 새 형식 IF 는 꼬리 대신 그리기 전용 대표 선 fold:{분기} 로 이어진다 — 고르기·우클릭·[+]·끝 손잡이를 주지 않는다(implicit-join spec §8.4, J-D14).`

- [ ] **Step 5: 편집 메뉴 — `canvas/menus/edit-menu.ts`**

```ts
import { KEEP_ENDING, returnCatch, type EditFlow } from "../../flow-edit";
import { endingBranches, joinOf } from "../../flow-model";

const EMPTY_BRANCH = "(빈 갈래)";
const ENDING_BRANCH = "(끝냄)";

/** 분기 풀기 갈래 항목 — 라벨 = 갈래 이름(없으면 "갈래 N"), 모이는 자리로 바로 가는 빈 갈래면 "(빈 갈래)", 끝내는 갈래면 "(끝냄)" 이고 흐리다(§8.3). */
function dissolveChildren(f: EditFlow, splitId: string, run: (edgeId: string) => void): MenuItem[] {
  const join = joinOf(f, splitId);
  const ending = new Set(endingBranches(f, splitId) ?? []);
  return f.edges
    .filter((e) => e.from === splitId)
    .map((e, i) => {
      const name = e.label && e.label.trim() !== "" ? e.label : `갈래 ${i + 1}`;
      if (ending.has(e.id)) return { id: `dissolve-${e.id}`, label: `${name} ${ENDING_BRANCH}`, disabled: true, title: KEEP_ENDING, run: () => run(e.id) };
      return { id: `dissolve-${e.id}`, label: join != null && e.to === join ? `${name} ${EMPTY_BRANCH}` : name, run: () => run(e.id) };
    });
}
```
빈 단계 메뉴(`if (n.kind === "TASK")`)의 `복제` 다음에 `{ id: "catch-add", label: "예외 받기 추가", run: () => act.addCatch(id) },` 를 더한다.

- [ ] **Step 6: 속성 패널 — `panels/PropertyPanel.tsx`·`panels/PanelHeader.tsx`**

`PropertyPanel.tsx` import 에 `import { endingBranches } from "../flow-model";` 를 더한다(이미 `flow-model` import 가 있으면 거기에). `SplitProps` 에서 `const ordered = …` 다음에 둔다:
```tsx
  const ending = new Set(isIf ? (endingBranches(flow, node.id) ?? []) : []);
  const endId = flow.nodes.find((n) => n.kind === "END")?.id;
  /** 몸 있는 끝내는 갈래가 있을 때만 안내한다(R21 — END 앞에 끼운 IF 의 END 직행 「그 외」 는 고칠 것이 없다). */
  const endingHelp = [...ending].some((id) => flow.edges.find((x) => x.id === id)?.to !== endId);
```
그리고 갈래 머리의 `<Input data-testid={`flow-prop-branch-${e.id}-label`} … />` 바로 뒤에 더한다:
```tsx
                  {ending.has(e.id) && (
                    <span data-testid={`flow-prop-branch-${e.id}-ending`} style={badgeStyle("neutral")} title="이 갈래를 타면 세트를 여기서 끝낸다">
                      끝냄
                    </span>
                  )}
```
갈래 목록 `</div>`(`rsf-branches`) 바로 뒤에 더한다:
```tsx
        {isIf && endingHelp && (
          <p className="rsf-panel-note rsf-muted" data-testid="flow-prop-if-ending-help">
            흐름을 이어 갈 갈래는 「그 외」로 둔다. 끝낼 갈래는 조건 갈래로 두고 끝 노드로 잇는다.
          </p>
        )}
```
`CatchProps` 에서 `const own = …` 다음에 둔다:
```tsx
  const host = node.attachTo ? flow.nodes.find((n) => n.id === node.attachTo) : undefined;
  const onTask = host?.kind === "TASK";
  /** 빈 단계에 붙은 받는 노드 경고(implicit-join spec §6) — 종류 이름이 없어 종류 옆이 아니라 섹션 머리에 한 줄씩 보인다(R19). */
  const taskNever = own.filter((c) => c.code === "CATCH_NEVER" && c.ruleId == null);
```
「붙은 룰」 `<th>` 를 `{onTask ? "붙은 노드" : "붙은 룰"}` 로, 「받을 예외」 섹션의 `<div className="rsf-catch-kinds">` 바로 앞에 더한다:
```tsx
        {taskNever.map((c) => (
          <p key={c.message} className="rsf-panel-note" data-testid="flow-prop-catch-never-task" style={badgeStyle("warning")}>
            {c.message}
          </p>
        ))}
```
`PlainNodeProps` 의 MERGE 문구를 `` `병렬 합류 — 병렬 ${node.splitId ?? "-"}의 갈래가 모두 끝나면 결과를 갈래 순서대로 합친다. 병렬 분기를 지우면 함께 없어진다` `` 로, `KIND_TEXT.MERGE` 를 `"병렬 합류"` 로 바꾼다. `PanelHeader.tsx` 의 `PANEL_KIND.MERGE` 라벨을 `"병렬 합류"` 로, 머리 기본 이름 `` `분기 ${n.splitId ?? n.id} 합류` `` 를 `` `병렬 ${n.splitId ?? n.id} 합류` `` 로 바꾼다.

- [ ] **Step 7: 영역 가이드 — `docs/guide/FrontEnd/Local-Rules.md`**

§19(React Flow 캔버스) 끝에 한 줄을 더한다:
```markdown
- **룰 세트 IF 의 끝내는 갈래(D-136, implicit-join spec J-D19)** — 흐름을 이어 갈 갈래는 「그 외」로 두고, 끝낼 갈래는 조건 갈래로 두어 끝 노드로 잇는다. 모든 갈래가 따로 END 로 가면 실행 순서 마지막 갈래(END 직행 제외)가 이어지는 갈래로 정해지므로, 안쪽 IF 에서 반대로 그리면(조건 갈래가 바깥 모이는 자리로, 「그 외」 에 몸을 두고 END 로) 구조 오류(S5·S6)로 거부된다. 화면은 IF 패널 갈래 목록 아래 안내(`flow-prop-if-ending-help`)로 같은 규칙을 보인다.
```

- [ ] **Step 8: 통과 확인**

Run: `cd src/frontend/m-mdm && node scripts/test.mjs --maxWorkers=3`, `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint`, audit 두 개(바꾼 `.ts`·`.tsx` 다섯 파일), `grep -rnE "import ['\"]\.{1,2}/[^'\"]*\.css['\"]" src/frontend/m-mdm/pages/dme/ruleSetEdit`
Expected: 실패 0·오류 0·audit 0건·`.css` import 0건. `catch-canvas.test.ts`·`flow-menu.test.ts`·`catch-panel.test.ts`·`side-panel.test.ts` 의 기대가 TASK 손잡이·메뉴 항목 수·"합류" 문구 때문에 바뀌면 그 기대만 새 동작으로 고친다(완료 보고에 목록).

- [ ] **Step 9: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowCanvas.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/menus/edit-menu.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/base.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PanelHeader.tsx docs/guide/FrontEnd/Local-Rules.md src/frontend/m-mdm/tests/dme/ruleSetEdit/implicit-join-ui.test.ts
/usr/bin/git commit -m "feat(mdm): 룰 세트 캔버스에 이중선 병렬 합류·끝냄 표지·빈 단계 예외 받기를 더한다(D-136)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowCanvas.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/menus/edit-menu.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/base.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PanelHeader.tsx docs/guide/FrontEnd/Local-Rules.md src/frontend/m-mdm/tests/dme/ruleSetEdit/implicit-join-ui.test.ts
```
(Step 8 에서 기대를 고친 시험 파일도 두 명령에 더한다.)

---

### Task 7: 디버거 — 돌아오는 자리에서 CATCH_* 되돌림·끝낸 갈래 표시

**등급:** capable — 엔진 순서(R3·R4·R5)를 화면 프레임 계산에 그대로 옮긴다.
**병렬:** Task 1·2 병합 뒤. Task 6 과 함께 돌 수 있다.

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts`(`scopePaths`·`frames`), `debugger/debug-model.ts`(`endedBranchText`·`baseStatus`), `debugger/TraceDetail.tsx`(END 줄), `debugger/VariablePanel.tsx`(prop 전달)
- Create: `src/frontend/m-mdm/tests/dme/ruleSetEdit/implicit-join-debug.test.ts`

**Interfaces:**
- Consumes(Task 1·2): `Guarded.step`·`joinId`·`mergeId`, `endingBranches`, 엔진 기록 모양(새 형식은 MERGE 기록 없음, IF 끝냄은 `endedBy` 없음).
- Produces: `endedBranchText(trace: RunTrace, flow: RuleSetFlow): string | null`(R12), `TraceDetailProps.endedBranch?: string | null`, testid `sim-detail-ended-branch`.

- [ ] **Step 1: 실패하는 시험(`implicit-join-debug.test.ts`, 새 파일)**

```ts
/** @vitest-environment happy-dom */
// implicit-join spec §11 — 돌아오는 자리에서 CATCH_* 되돌림(안쪽 블록부터, 고친 값보다 먼저), 병렬 안 IF 끝냄의 END 프레임, 끝낸 갈래 표시.
// 기록은 엔진 RuleSetCatchTest.nestedReturn·RuleSetIfEndTest 의 실행 기록을 손으로 옮겼다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import type { FlowEdge, FlowNode, FlowNodeKind, NodeTrace, RuleSetFlow, RunTrace, TypedValue } from "../../../src/contract/engine-contract.generated";
import { debugStatus, endedBranchText } from "../../../pages/dme/ruleSetEdit/debugger/debug-model";
import { TraceDetail } from "../../../pages/dme/ruleSetEdit/debugger/TraceDetail";
import { frames } from "../../../pages/dme/ruleSetEdit/trace-view";
import { flush, installDomStorage } from "../helpers/render";

const S = (v: string): TypedValue => ({ type: "STRING", value: v });
const N = (v: string): TypedValue => ({ type: "NUMBER", value: v });
const fn = (id: string, kind: FlowNodeKind, over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: null, splitId: null, label: null, ...over });
const fe = (id: string, from: string, to: string, over: Partial<FlowEdge> = {}): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null, ...over });
const nt = (seq: number, nodeId: string, kind: FlowNodeKind, over: Partial<NodeTrace> = {}): NodeTrace => ({
  seq, nodeId, kind, status: "OK", ruleId: null, ver: null, reads: null, branches: null, chosenEdgeId: null, order: null, splitId: null, merged: null,
  violations: null, ...over,
});
const res = (ruleId: string, results: Record<string, TypedValue>) => ({
  ruleId, ver: 1, evalTs: "2026-06-01T09:00:00", hits: [{ rowId: 1, seq: 1, groupChoices: {} }], defaultApplied: false, results, trace: [], warnings: [],
});
const run = (nodes: NodeTrace[], finalValues: Record<string, TypedValue>, extra: Partial<RunTrace> = {}): RunTrace =>
  ({ setId: "(저장 전)", evalTs: "2026-06-01T09:00:00", input: { X: N("5") }, violations: null, finalValues, nodes, ...extra });

/** 새 형식 중첩 — r1(R_ERR) → after → end. c1 EVAL_ERROR → h1(R_G) → k(R_CODE) → after. c9(h1) NO_RESULT → f(R_FILL) → k. */
const nested: RuleSetFlow = {
  version: 1,
  nodes: [fn("start", "START"), fn("r1", "RULE", { ruleId: "R_ERR" }), fn("c1", "CATCH", { attachTo: "r1", catches: ["EVAL_ERROR"] }), fn("h1", "RULE", { ruleId: "R_G" }),
    fn("c9", "CATCH", { attachTo: "h1", catches: ["NO_RESULT"] }), fn("f", "RULE", { ruleId: "R_FILL" }), fn("k", "RULE", { ruleId: "R_CODE" }),
    fn("after", "RULE", { ruleId: "R_AFTER" }), fn("end", "END")],
  edges: [fe("e1", "start", "r1"), fe("e2", "r1", "after"), fe("e3", "c1", "h1"), fe("e4", "h1", "k"), fe("e5", "c9", "f"), fe("e6", "f", "k"),
    fe("e7", "k", "after"), fe("e8", "after", "end")],
};
const nestedNodes = (): NodeTrace[] => [
  nt(1, "start", "START"),
  nt(2, "r1", "RULE", { status: "CAUGHT", ruleId: "R_ERR", ver: 1, reads: { X: N("5") }, violations: [] }),
  nt(3, "c1", "CATCH", { ruleId: "R_ERR", catchKind: "EVAL_ERROR", code: "EVALUATION_ERROR", message: "나누기 오류" }),
  nt(4, "h1", "RULE", { status: "CAUGHT", ruleId: "R_G", ver: 1, reads: { X: N("5") }, violations: [] }),
  nt(5, "c9", "CATCH", { ruleId: "R_G", catchKind: "NO_RESULT", code: "NO_RESULT", message: "맞는 행과 기본 행이 없다" }),
  nt(6, "f", "RULE", { ruleId: "R_FILL", ver: 1, reads: {}, result: res("R_FILL", { G: N("0") }) }),
  nt(7, "k", "RULE", { ruleId: "R_CODE", ver: 1, reads: {}, result: res("R_CODE", { CODE: S("EVALUATION_ERROR") }) }),
  nt(8, "after", "RULE", { ruleId: "R_AFTER", ver: 1, reads: { X: N("5") }, result: res("R_AFTER", { Z: N("10") }) }),
  nt(9, "end", "END"),
];

describe("frames — 돌아오는 자리(implicit-join spec §11)", () => {
  it("돌아오는_자리에서_안쪽_블록부터_CATCH_를_되돌린다", () => {
    const fr = frames(run(nestedNodes(), { G: N("0"), CODE: S("EVALUATION_ERROR"), Z: N("10") }), nested);
    expect(fr[5].before.CATCH_CODE).toEqual(S("NO_RESULT")); // f — 안쪽 처리 갈래
    expect(fr[6].before.CATCH_CODE).toEqual(S("EVALUATION_ERROR")); // k — 안쪽 블록 되돌림 뒤 바깥 값
    expect(fr[6].before.CATCH_KIND).toEqual(S("EVAL_ERROR"));
    expect(fr[7].before.CATCH_CODE).toBeUndefined(); // after — 바깥 블록도 닫혔다
  });

  it("돌아오는 자리에 건 고친 값은 되돌림 뒤에 들어간다(R3)", () => {
    const fr = frames(run(nestedNodes(), {}, { edits: [{ beforeSeq: 7, nodeId: "k", values: { CATCH_CODE: S("EDITED") } }] }), nested);
    expect(fr[6].before.CATCH_CODE).toEqual(S("EDITED"));
    expect(fr[6].edited).toEqual(["CATCH_CODE"]);
  });

  it("병렬_갈래_안_IF_끝냄_기록의_END_프레임은_열린_갈래를_합친다", () => {
    // p1 [p1a → a → pm] [p1i → if1 [b1 "X > 0" → k → end] [그 외 → pm]] [p1b → b → pm] → pm → end
    const flow: RuleSetFlow = {
      version: 1,
      nodes: [fn("start", "START"), fn("p1", "PARALLEL"), fn("a", "RULE", { ruleId: "R_A" }), fn("if1", "IF"), fn("k", "RULE", { ruleId: "R_AFTER" }),
        fn("b", "RULE", { ruleId: "R_B" }), fn("pm", "MERGE", { splitId: "p1" }), fn("end", "END")],
      edges: [fe("e0", "start", "p1"), fe("p1a", "p1", "a", { order: 1 }), fe("p1i", "p1", "if1", { order: 2 }), fe("p1b", "p1", "b", { order: 3 }), fe("ea", "a", "pm"),
        fe("b1", "if1", "k", { order: 1, cond: "X > 0" }), fe("ek", "k", "end"), fe("bo", "if1", "pm", { otherwise: true }), fe("eb", "b", "pm"), fe("ee", "pm", "end")],
    };
    const trace = run([
      nt(1, "start", "START"),
      nt(2, "p1", "PARALLEL", { order: ["p1a", "p1i", "p1b"] }),
      nt(3, "a", "RULE", { ruleId: "R_A", ver: 1, reads: { X: N("5") }, result: res("R_A", { A: N("6") }) }),
      nt(4, "if1", "IF", { chosenEdgeId: "b1" }),
      nt(5, "k", "RULE", { ruleId: "R_AFTER", ver: 1, reads: { X: N("5") }, result: res("R_AFTER", { Z: N("10") }) }),
      nt(6, "end", "END"),
    ], { A: N("6"), Z: N("10") });
    const fr = frames(trace, flow);
    expect(fr[5].ctx.A).toEqual(N("6"));
    expect(fr[5].ctx.Z).toEqual(N("10"));
  });
});

describe("끝낸 갈래 표시(R12)", () => {
  /** start → r0 → if1(단가 확인) [b1 "X > 10" 「단가 없음」 → k → end] [그 외 → n] → n → end */
  const flow: RuleSetFlow = {
    version: 1,
    nodes: [fn("start", "START"), fn("r0", "RULE", { ruleId: "R_A" }), fn("if1", "IF", { label: "단가 확인" }), fn("k", "RULE", { ruleId: "R_B" }),
      fn("n", "RULE", { ruleId: "R_AFTER" }), fn("end", "END")],
    edges: [fe("e1", "start", "r0"), fe("e2", "r0", "if1"), fe("b1", "if1", "k", { order: 1, cond: "X > 10", label: "단가 없음" }), fe("ek", "k", "end"),
      fe("bo", "if1", "n", { otherwise: true }), fe("en", "n", "end")],
  };
  const ended = run([nt(1, "start", "START"), nt(2, "r0", "RULE", { ruleId: "R_A", ver: 1, reads: {}, result: res("R_A", { A: N("21") }) }),
    nt(3, "if1", "IF", { chosenEdgeId: "b1" }), nt(4, "k", "RULE", { ruleId: "R_B", ver: 1, reads: {}, result: res("R_B", { B: N("22") }) }), nt(5, "end", "END")],
    { A: N("21"), B: N("22") });

  it("끝내는 갈래로 끝난 실행은 완료 뒤에 「IF {제목}의 「{갈래}」 갈래에서 끝냈다」 를 붙인다", () => {
    expect(endedBranchText(ended, flow)).toBe("IF 단가 확인의 「단가 없음」 갈래에서 끝냈다");
    expect(debugStatus(ended, 5, 0, flow)).toBe("완료 · 5단계 · 결과 변수 2개 · IF 단가 확인의 「단가 없음」 갈래에서 끝냈다");
    const through = run([nt(1, "start", "START"), nt(2, "r0", "RULE"), nt(3, "if1", "IF", { chosenEdgeId: "bo" }), nt(4, "n", "RULE"), nt(5, "end", "END")], { A: N("6"), Z: N("10") });
    expect(endedBranchText(through, flow)).toBeNull();
    expect(debugStatus(through, 5, 0, flow)).toBe("완료 · 5단계 · 결과 변수 2개");
    expect(endedBranchText({ ...ended, endedBy: "c1" }, flow)).toBeNull();
  });

  describe("END 노드 상세", () => {
    let host: HTMLDivElement;
    let root: Root;
    beforeEach(() => {
      installDomStorage();
      host = document.createElement("div");
      document.body.appendChild(host);
      root = createRoot(host);
    });
    afterEach(() => {
      act(() => root.unmount());
      host.remove();
    });
    it("끝낸 갈래 문장을 보인다", async () => {
      await act(async () => {
        root.render(createElement(DmesUiProvider, null, createElement(TraceDetail, {
          nodeId: "end", node: ended.nodes[4], flow, traceViolations: [], onOpenRule: () => {}, endedBranch: endedBranchText(ended, flow),
        })));
      });
      await flush();
      expect(document.querySelector('[data-testid="sim-detail-ended-branch"]')!.textContent).toBe("IF 단가 확인의 「단가 없음」 갈래에서 끝냈다");
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd src/frontend/m-mdm && node scripts/test.mjs --maxWorkers=3 tests/dme/ruleSetEdit/implicit-join-debug.test.ts`
Expected: FAIL — `endedBranchText` 없음, 새 형식에서 돌아오는 자리에 CATCH_* 가 남는다(`fr[6].before.CATCH_CODE` 가 `NO_RESULT`).

- [ ] **Step 3: `trace-view.ts` — `guardJoins`**

머리 주석의 받는 노드 문장을 바꾼다: `받는 노드(받는 노드 spec §4·§9, implicit-join spec §11): CATCH 노드는 CATCH_* 넷을 그 범위 ctx 에 넣고(made 에는 넣지 않는다), 받는 노드 블록의 돌아오는 자리(옛 형식이면 돌아오는 합류) 기록은 고친 값 전에 그 자리를 끝으로 하는 블록을 안쪽부터 블록 직전 값으로 되돌리며, END 는 지운다. 병렬 갈래 안에서 끝냈으면(받는 노드·IF 끝냄 모두) END 앞에서 열린 갈래를 합류 규칙대로 합친다. CAUGHT 룰은 겹침 상태 caught 다.`
`scopePaths` 를 바꾼다:
```ts
/** 노드 → 병렬 갈래 경로. MERGE 는 짝 분기와 같은 경로, START·END·트리에 없는 노드는 루트([]). 받는 노드 블록의 단계·돌아오는 자리도 함께 모은다. */
function scopePaths(flow: RuleSetFlow): {
  paths: Map<string, ScopePath>;
  branchEdges: Map<string, string[]>;
  /** 돌아오는 자리(옛 형식이면 돌아오는 합류) → 그 자리를 끝으로 하는 받는 노드 블록의 단계 ID(안쪽 블록이 먼저). */
  guardJoins: Map<string, string[]>;
  /** 받는 노드가 붙은 단계 ID(RULE·TASK). */
  guardSteps: Set<string>;
} {
  const paths = new Map<string, ScopePath>();
  const branchEdges = new Map<string, string[]>();
  const guardJoins = new Map<string, string[]>();
  const guardSteps = new Set<string>();
  const tree = parseFlow(flow).tree;
  if (!tree) return { paths, branchEdges, guardJoins, guardSteps };
  const walk = (s: Seq, path: ScopePath) => {
    for (const b of s.items) {
      if (b.type === "RULE" || b.type === "TASK") paths.set(b.nodeId, path);
      else if (b.type === "SEQ") walk(b, path);
      else if (b.type === "GUARDED") {
        paths.set(b.step.nodeId, path);
        guardSteps.add(b.step.nodeId);
        if (b.mergeId) paths.set(b.mergeId, path);
        walk(b.normal, path);
        for (const h of b.handlers) {
          paths.set(h.catchNodeId, path);
          walk(h.body, path);
        }
        // 안쪽을 다 걸은 뒤에 넣으므로 같은 자리를 닫는 블록은 안쪽이 먼저다.
        if (b.joinId) guardJoins.set(b.joinId, [...(guardJoins.get(b.joinId) ?? []), b.step.nodeId]);
      } else {
        paths.set(b.nodeId, path);
        if (b.mergeId) paths.set(b.mergeId, path);
        if (b.kind === "PARALLEL") branchEdges.set(b.nodeId, b.branches.map((br) => br.edgeId));
        for (const br of b.branches) walk(br.body, b.kind === "PARALLEL" ? [...path, { split: b.nodeId, edge: br.edgeId }] : path);
      }
    }
  };
  walk(tree.root, []);
  return { paths, branchEdges, guardJoins, guardSteps };
}
```
`frames` 에서 `const { paths, branchEdges, guardMerges, guardRules } = scopePaths(flow);` 를 `const { paths, branchEdges, guardJoins, guardSteps } = scopePaths(flow);` 로, `outerCatch` 주석의 "받는 룰" 을 "받는 노드가 붙은 단계" 로, 아래 세 줄
```ts
    if (node.kind === "RULE" && guardRules.has(node.nodeId)) outerCatch.set(node.nodeId, pickCatch(scope.ctx));
    const guardOf = node.kind === "MERGE" ? guardMerges.get(node.nodeId) : undefined;
    if (guardOf !== undefined) restoreCatch(scope.ctx, outerCatch.get(guardOf) ?? {});
```
를 바꾼다:
```ts
    if ((node.kind === "RULE" || node.kind === "TASK") && guardSteps.has(node.nodeId)) outerCatch.set(node.nodeId, pickCatch(scope.ctx));
    // 돌아오는 자리 — 그 자리를 끝으로 하는 블록을 안쪽부터, 블록 단계 직전 CATCH_* 가 적힌 것만 되돌린다. 범위는 받는 노드 블록의 범위다
    // (병렬 갈래 안 블록이 병렬 합류로 돌아오면 엔진은 갈래 범위에서 되돌린 뒤 합친다).
    for (const step of guardJoins.get(node.nodeId) ?? []) {
      const saved = outerCatch.get(step);
      if (saved === undefined) continue;
      restoreCatch(scopeOf(paths.get(step) ?? []), saved);
      outerCatch.delete(step);
    }
```

- [ ] **Step 4: 끝낸 갈래 표시 — `debug-model.ts`·`TraceDetail.tsx`·`VariablePanel.tsx`**

`debug-model.ts` import 에 `import { endingBranches } from "../flow-model";` 를 더하고 `baseStatus` 위에 둔다:
```ts
/**
 * 끝내는 IF 갈래로 끝난 실행의 표시 문장(R12, implicit-join spec §11) — `endedBy` 가 없고 마지막 기록이 END 일 때, 기록의 IF 가운데 고른 선이
 * 끝내는 갈래인 마지막 IF. 제목은 IF label(없으면 "조건"), 갈래는 선 label(없으면 "그 외"·"갈래 {order}"). 아니면 null. 계약 칸이 아니라 화면 계산이다(J-D17).
 */
export function endedBranchText(trace: RunTrace, flow: RuleSetFlow): string | null {
  const n = trace.nodes.length;
  if (trace.endedBy || n === 0 || trace.nodes[n - 1].kind !== "END") return null;
  for (let i = n - 1; i >= 0; i--) {
    const t = trace.nodes[i];
    if (t.kind !== "IF" || !t.chosenEdgeId) continue;
    if (!(endingBranches(flow, t.nodeId) ?? []).includes(t.chosenEdgeId)) continue;
    const title = flow.nodes.find((x) => x.id === t.nodeId)?.label ?? "조건";
    const e = flow.edges.find((x) => x.id === t.chosenEdgeId);
    const branch = e?.label ?? (e?.otherwise ? "그 외" : `갈래 ${e?.order ?? ""}`.trim());
    return `IF ${title}의 「${branch}」 갈래에서 끝냈다`;
  }
  return null;
}
```
`baseStatus` 의 마지막 줄 `return \`완료 · ${tail}\`;` 를 바꾼다:
```ts
  const ended = flow ? endedBranchText(trace, flow) : null;
  return `완료 · ${tail}${ended ? ` · ${ended}` : ""}`;
```
`debugStatus` Javadoc 의 완료 줄 끝에 `, 끝내는 IF 갈래로 끝났으면 뒤에 ` · IF {제목}의 「{갈래}」 갈래에서 끝냈다`(R12)` 를 더한다.
`TraceDetail.tsx` 의 props 인터페이스에 `/** END 노드에 보일 끝낸 갈래 문장(R18). */ endedBranch?: string | null;` 를 더하고, 함수 인자에 `endedBranch` 를, `{node.kind === "TASK" && (…)}` 블록 앞에 더한다:
```tsx
      {node.kind === "END" && endedBranch && (
        <p className="rsf-panel-note" data-testid="sim-detail-ended-branch">
          {endedBranch}
        </p>
      )}
```
`VariablePanel.tsx` 의 `<TraceDetail …>` 에 `endedBranch={endedBranchText(last.trace, last.flow)}` 를 더하고 `debug-model` import 에 `endedBranchText` 를 더한다.

- [ ] **Step 5: 통과 확인**

Run: `cd src/frontend/m-mdm && node scripts/test.mjs --maxWorkers=3`, `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint`, audit 두 개(바꾼 네 파일)
Expected: 실패 0·오류 0·audit 0건. 기존 `catch-debug.test.ts`(옛 형식 돌아오는 합류 `mr`)는 그대로 통과해야 한다 — 옛 형식은 `joinId = mergeId` 라 같은 자리에서 되돌린다.

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/debug-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/VariablePanel.tsx src/frontend/m-mdm/tests/dme/ruleSetEdit/implicit-join-debug.test.ts
/usr/bin/git commit -m "feat(mdm): 룰 세트 디버거가 돌아오는 자리에서 CATCH 값을 되돌리고 끝낸 IF 갈래를 보인다(D-136)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/debug-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/VariablePanel.tsx src/frontend/m-mdm/tests/dme/ruleSetEdit/implicit-join-debug.test.ts
```

---
### Task 8: 문서·계약 설명·결정 D-136

**등급:** cheap — 정해진 내용을 정해진 자리에 옮겨 적는다.
**병렬:** Task 1~7 병합 뒤. Task 9 와 함께 돌 수 있다(Task 9 가 `$W` 에서 서버를 띄운 동안 이 태스크는 gradle 을 돌리지 않는다 — 하위 워크트리에서 한다).

**Files:**
- Modify: `docs/mdm/decisions.md`(끝에 D-136, append-only), `docs/mdm/engine-contract.md`, `docs/superpowers/specs/2026-10-01-rule-set-flow-catch-design.md`(머리 한 줄), `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`
- Modify: `src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json`(설명 4곳), `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/DefinitionLookup.java`(`FlowNode` Javadoc), `…/rule/RuleSetResult.java`·`…/rule/RunTrace.java`(Javadoc), `src/frontend/m-mdm/src/contract/engine-contract.generated.ts`(생성)

**Interfaces:**
- Consumes: Task 1~7 병합 커밋, 진행 장부의 Ruling, 각 태스크 완료 보고(바뀐 동작·testid·고친 시험 목록).
- Produces: 없음(문서·설명).

- [ ] **Step 1: 결정 기록 D-136 — `docs/mdm/decisions.md`**

Run: `tail -n 8 docs/mdm/decisions.md` — 마지막 항목 형식(`## D-NNN (…)` 다음 `- **Phase**:`·`- **Decision needed**:`·`- **Decision made**:`·`- **Rationale**:`·`- **Reversible**:`·`- **Source**:` 여섯 줄)을 확인한다. 번호는 A6 대로 **D-136** 이다(D-135 가 아직 없어도 D-136 을 쓴다 — D-135 는 하위 세트 호출 스펙 예약). 파일 끝에 붙인다:
```markdown

## D-136 (2026-10-02T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 — IF·예외 합류 노드 없애기, 모이는 자리 계산)
- **Decision needed**: IF 와 받는 노드의 합류(MERGE) 노드를 계속 둘지, 갈래가 다음 노드로 바로 모이게 할지(스펙 `2026-10-02-rule-set-flow-implicit-join-design.md` §0, 사용자 승인 A1~A6·B1·B2)
- **Decision made**: J-D1 MERGE 는 병렬에만 두고 같은 크기의 이중선 막대로 그린다 · J-D2 IF 의 모이는 자리는 실행 순서 첫 이어지는 갈래 줄기 기준 첫 공통 노드이고 블록 트리를 만들다 그 IF 에 닿을 때 계산한다 · J-D3 처리 갈래는 정상 줄기 위 노드로 바로 돌아오고 한 노드의 돌아오는 갈래는 같은 노드로 간다, END 는 끝냄, CATCH_* 는 블록 끝에서 뺀다 · J-D4 받는 노드를 빈 단계(TASK)에도 붙이고 TASK 인 동안 받는 노드마다 CATCH_NEVER 경고 · J-D5 엔진·TS 해석기는 옛 형식을 받고 편집기는 열 때 바꾼다 · J-D6 "들어오는 선 2개 이상은 모이는 자리만" 을 따로 검사하지 않는다 · J-D7 새 형식 IF 는 같은 도착 갈래 선을 하나만 둔다(f4, 빈 갈래 하나) · J-D8 돌아오는 자리는 둘러싼 끝이어도 된다 · J-D9 IF 갈래 중간 끝내기(끝내는 갈래 = 다른 갈래와 노드를 함께 지나지 않고 END 로 가는 갈래)를 허용하고 받는 노드 X-D6 을 없앤다 · J-D10 정상 다음 노드가 END 인 노드에는 돌아올 자리가 없고 변환은 END 로 바로 나가는 옛 합류를 빈 단계로 바꾼다 · J-D11 블록 트리에 Step(RULE·TASK)·Guarded.step·Split/Guarded.joinId · J-D12 변환은 toEditFlow 안에서 하고 열기만 해서는 dirty 가 아니다 · J-D13 IF 지우기·접기·복사·옮기기는 끝내는 갈래 몸을 블록에 넣고, 끝내는 갈래만 남기기와 끝내는 갈래가 있는 IF 의 병렬 바꾸기는 거부 · J-D14 접힌 IF 의 대표 선은 그리기 전용 · J-D15 version 1 유지 · J-D16 문구 "모이는 자리 밖에서"·S7·S8·f4 · J-D17 끝내는 IF 갈래로 끝난 실행은 정상 완료(endedBy 없음, 계약 칸 없음) · J-D18 처리 갈래 안 IF 끝냄의 endedBy 는 가장 안쪽 처리 갈래의 받는 노드, 병렬 갈래 안 IF 끝냄은 남은 형제를 돌리지 않는다 · J-D19 모든 갈래가 따로 END 로 가면 실행 순서 마지막의 END 직행 아닌 갈래가 이어진다. 받는 노드 결정 D-134 의 X-D5(돌아오는 MERGE 의 splitId = 룰 노드 ID)·X-D6(처리 갈래 안 IF 갈래 END 금지)은 이 결정으로 바뀐다. 구현 세부(계획 Rulings R1~R21): 코퍼스 사례 26개(N25 S9 셋째 문구, N26 바깥 새 형식 IF 의 S6), 끝냄 신호 Ended(null), TASK 블록은 입력 키 검사 뒤 기록, 조각 꼬리·끝 선은 선 ID 목록, 열기 알림 문구, 끝낸 갈래 표시 문구, 받는 노드 패널의 「붙은 노드」·TASK 경고 줄, 접기 대표 선 fold:{분기}
- **Rationale**: IF 합류는 실행 의미가 없는 이음 노드라 그림만 복잡하게 했고, 병렬 합류만 "모두 기다려 합침" 의미가 있다. 모이는 자리·돌아오는 자리를 그래프에서 계산하면 Java·TS 가 같은 알고리즘으로 같은 블록 트리를 만들고(코퍼스·퍼즈가 고정), 옛 형식 세트도 같은 블록 트리로 돌아 결과가 바뀌지 않는다(변환 동치 시험). 끝내는 갈래는 "조건이면 끝내고 그 외는 계속" 을 합류 없이 그리게 한다
- **Reversible**: no(편집기가 새 형식으로 저장하므로 저장된 세트가 합류 없는 흐름이 된다. 엔진은 두 형식을 모두 받는다)
- **Source**: 스펙 `docs/superpowers/specs/2026-10-02-rule-set-flow-implicit-join-design.md`(J-D1~J-D19), 계획 `docs/superpowers/plans/2026-10-02-rule-set-flow-implicit-join.md`(편차 F1~F9·Rulings R1~R21), 사용자 승인(팀장 전달 2026-10-02). 영향: 엔진 흐름 해석·실행(FlowParser·FlowRun·FlowKeys), 서버 검사(RuleSetAnalyzer·RuleSetPathState·RuleSetOrderCheck), 코퍼스·퍼즈, 화면 편집기·배치·캔버스·디버거, e2e E3·E11·E13·E14·E15·E17·E18. 병합 커밋:
```
`병합 커밋:` 뒤에 `/usr/bin/git log --oneline --merges feat/rule-set-join` 에서 찾은 Task 1~7 병합 커밋을 `Task 1 <해시>, Task 2 <해시>, …` 꼴로 이어 적는다(실행 때 생기는 값).

- [ ] **Step 2: 받는 노드 스펙 머리 — `2026-10-01-rule-set-flow-catch-design.md`**

`- 뒤 문서:` 줄 바로 아래에 한 줄을 더한다:
```markdown
- 바뀜: §2·§3·§4·§8 의 "돌아오는 MERGE" 는 D-136(`2026-10-02-rule-set-flow-implicit-join-design.md`)으로 바뀌었다 — 처리 갈래는 합류 없이 정상 경로 노드(돌아오는 자리)로 바로 돌아오고, 처리 갈래 안 IF 갈래도 END 로 갈 수 있다(X-D5·X-D6 대체). 옛 형식은 엔진이 그대로 받는다
```

- [ ] **Step 3: 엔진 계약 설명 — 스키마·Javadoc·`engine-contract.md`(R17)**

스키마 정본 `engine-contract.schema.json` 의 `description` 네 곳을 바꾼다(모양은 그대로):
- `RuleSetResult`: 문장 끝 "endedBy 는 처리 갈래가 END 로 끝냈을 때 그 CATCH 노드 ID." 를 "endedBy 는 처리 갈래 안에서 END 에 닿아 끝났을 때(처리 갈래 안 IF 의 끝내는 갈래 포함) 가장 안쪽 처리 갈래의 받는 노드 ID 이고, 끝내는 IF 갈래로 끝난 실행(정상 완료)은 null 이다(D-136). path 는 START·RULE·CATCH·TASK·IF·PARALLEL·END 와 병렬 합류 MERGE(옛 형식이면 IF·돌아오는 합류도)다." 로.
- `RunTrace`: "endedBy 는 받는 노드 처리 갈래가 END 로 끝냈을 때만 있고, 없으면 키를 뺀다." 를 "endedBy 는 처리 갈래 안에서 끝냈을 때만(가장 안쪽 처리 갈래의 받는 노드 ID) 있고, 없으면 키를 뺀다. 새 형식 흐름은 IF·돌아오는 자리의 MERGE 기록이 없다(D-136)." 로.
- `NodeTrace`: "MERGE: splitId·merged" 를 "MERGE: splitId(짝 PARALLEL, 옛 형식이면 IF 또는 받는 노드가 붙은 노드)·merged(병렬 합류에서 합친 이름)" 로.
- `FlowNode`: "splitId 는 MERGE 만 쓴다(받는 룰로 돌아오는 MERGE 는 그 룰 노드 ID)." 를 "splitId 는 MERGE 만 쓴다(짝 PARALLEL. 옛 형식은 IF·받는 노드가 붙은 노드). IF 와 처리 갈래는 합류 없이 모이는 자리·돌아오는 자리로 바로 간다(D-136)." 로, "attachTo(붙은 룰 노드 ID)" 를 "attachTo(붙은 RULE·TASK 노드 ID)" 로.

Run: `pnpm --dir src/frontend --filter @dk-oasis/m-mdm gen:contract` → `src/frontend/m-mdm/src/contract/engine-contract.generated.ts` 의 주석만 바뀐다(`git diff --stat` 로 확인).

Javadoc: `DefinitionLookup.FlowNode`(159~162줄)의 "돌아오는 MERGE 의 {@code splitId} 는 그 룰 노드 ID 다." 를 "{@code splitId} 는 짝 PARALLEL(옛 형식은 IF·받는 노드가 붙은 노드)이고, IF 와 처리 갈래는 합류 없이 모이는 자리·돌아오는 자리로 바로 간다(D-136). {@code attachTo} 는 RULE·TASK." 로. `RuleSetResult` `@param endedBy` 와 `RunTrace` `@param endedBy` 를 "처리 갈래 안에서 END 에 닿아 끝났으면(처리 갈래 안 IF 의 끝내는 갈래 포함) 가장 안쪽 처리 갈래의 받는 노드 ID, 아니면 null(끝내는 IF 갈래로 끝난 실행 포함, D-136)" 로, `RunTrace.NodeTrace` 의 MERGE 줄을 "MERGE: splitId(짝 PARALLEL, 옛 형식이면 IF·받는 노드가 붙은 노드)·merged(병렬 합류에서 합친 결과 이름)" 로 바꾼다.

`engine-contract.md`:
- 60줄 「룰 세트 흐름」 문단 끝(받는 노드 D-134 문장 뒤)에 붙인다: ` **합류 없애기(2026-10-02, D-136).** MERGE 는 PARALLEL 의 합류만 쓴다. IF 갈래와 돌아오는 처리 갈래는 모이는 자리(갈래가 처음 다시 만나는 노드)·돌아오는 자리(받는 노드가 붙은 노드의 정상 경로 위 노드)로 바로 간다. IF 갈래는 END 로 가서 세트를 끝낼 수 있다(끝내는 갈래 — 정상 완료이고 endedBy 없음, 처리 갈래 안이면 그 받는 노드가 endedBy). 병렬 갈래 안에서 끝내면 받는 노드 끝냄과 같이 남은 형제를 실행하지 않는다. 옛 형식(IF·받는 노드가 붙은 노드를 가리키는 MERGE)도 받는다. 받는 노드는 RULE·TASK 에 붙는다(TASK 는 실패하지 않아 처리 갈래를 타지 않는다). 블록 트리는 flow.Step(RuleStep·TaskStep)·Split.joinId·Branch.ends·Guarded(step, normal, handlers, mergeId, joinId) 다.`
- 165줄 예약 이름 표의 "돌아오는 MERGE 에서 룰 직전 값으로 되돌리고" 를 "돌아오는 자리에 들어가기 전에(옛 형식이면 돌아오는 MERGE 에서) 룰 직전 값으로 되돌리고" 로.
- 218줄 세트 결과 문단의 `endedBy` 설명을 Step 3 스키마 문장과 같게, `path` 설명에 "병렬 합류 MERGE(옛 형식이면 IF·돌아오는 합류도)" 를 넣는다.
- 220줄 실행 기록 문단 끝에 ` 새 형식 흐름은 IF·돌아오는 자리의 MERGE 기록이 없어 그만큼 seq 가 당겨진다(D-136).` 를 붙인다.

Run: `(cd src/backend/maru-mdm-engine && ../gradlew test --tests '*EngineContractSchemaTest' --tests '*CorpusShapeTest' --console=plain)` → PASS. `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint` → 오류 0.

- [ ] **Step 4: 기능설계서 — `ruleSetEdit_기능설계서.md`**

- §3.2 캔버스 노드 표 `MERGE` 행(133줄): 모양 「작은 점」 → 「이중선 막대(200×14, 병렬 분기와 같은 크기)」, 설명 → `병렬 합류(splitId = 병렬 분기 ID). IF 와 받는 노드에는 합류가 없다 — 갈래가 모이는 자리로 바로 간다(D-136). 툴팁 「병렬 합류」`.
- §5.3 「팔레트로 끼우기」 행: "[IF]·[병렬]은 분기+짝 합류(갈래 2개)를" 를 "[IF]는 분기와 「갈래 1」 빈 단계(「그 외」는 끼운 선의 도착으로 바로), [병렬]은 분기+짝 합류(갈래 2개)를" 로. 「블록 접기(D16)」 행 끝에 ` 접힌 IF 는 모이는 자리가 블록 밖이라 남고, 블록에서 모이는 자리로 가는 선들 대신 그리기 전용 대표 선(fold:{분기}) 하나로 잇는다 — 고르기·우클릭·[+] 가 없다(D-136).` 를 붙인다. 「분기 편집」 행 끝에 ` IF→병렬은 끝내는 갈래가 있으면 거부, 병렬→IF 는 합류를 없애고 같은 도착 빈 갈래에 빈 단계를 채운다(D-136).` 를 붙인다. 표 끝에 행을 더한다: `| 옛 형식 열기(D-136) | 저장된 흐름에 IF 합류·돌아오는 합류가 있으면 열 때 없앤 형식으로 바꿔 그리고(END 로 바로 나가는 합류는 빈 단계로) 메시지 줄에 「옛 합류 노드 {n}개를 없앤 형식으로 바꿔 열었다. 저장하면 새 형식으로 남는다.」 를 한 번 보인다. 열기만 해서는 dirty 가 아니다 |` 와 `| 끝내는 갈래(D-136) | IF 갈래의 마지막 선을 끝 노드로 이으면 그 갈래는 세트를 끝내는 갈래가 된다. IF 속성 패널 갈래 목록에 「끝냄」(\`flow-prop-branch-{edgeId}-ending\`)과 안내 한 줄(\`flow-prop-if-ending-help\`)이 보이고, 자동 정렬은 끝내는 갈래 몸을 오른쪽에 비켜 놓는다 |`.
- §5.5 우클릭 메뉴: 분기 「분기 풀기」 항목 설명에 ` — 빈 갈래는 「(빈 갈래)」, 끝내는 갈래는 「(끝냄)」 이고 흐려 고를 수 없다` 를, 빈 단계 편집 행 항목에 `· 예외 받기 추가(\`catch-add\`, D-136)` 를 `복제` 뒤에 더한다. 받는 노드 행의 「흐름으로 돌아오기」 설명(없으면 더한다): `끝내는 처리 갈래의 맨 바깥 끝 선을 노드의 돌아오는 자리(없으면 정상 다음 노드)로 옮긴다. 다음이 끝 노드면 숨긴다`.
- §6.2 XV-013 조건 끝에 ` · 새 형식(D-136): 같은 도착 IF 갈래 선 둘(f4), IF 합류 둘 이상, 두 처리 갈래가 다른 노드로 돌아옴(S7), 처리 갈래가 정상 갈래 노드로 들어감(S8)` 을, 문구 예시 끝에 ` / IF {s}의 갈래 {e}가 갈래 {e0}와 같은 노드 {X}로 간다. 같은 노드로 가는 갈래는 하나만 둔다 / {R}의 처리 갈래 {c}가 {Y}로 돌아온다. 앞 처리 갈래 {c0}처럼 {X}로 돌아와야 한다 / 처리 갈래 {c}가 {R}의 정상 갈래 노드 {cur}로 들어간다. 처리 갈래는 한 노드로 돌아오거나 끝 노드로 가야 한다 / 처리 갈래 {c}가 돌아올 자리 {J}나 끝에 닿지 않고 {cur}로 나간다 / {id}를 두 번 지난다. 순환이 있거나 갈래가 모이는 자리 밖에서 만난다` 를 더한다(옛 문구 "짝 합류 밖에서" 는 지운다). XV-024 문구의 "붙은 룰 {r}가 없다" → "붙은 노드 {r}가 없다", "룰 노드에만 붙일 수 있다" → "룰·빈 단계 노드에만 붙일 수 있다". XV-025 조건 끝에 ` / 받는 노드가 빈 단계에 붙음(받는 노드마다 한 줄, ruleId 없음)` 을, 문구 끝에 ` / {t}는 빈 단계라 {c}가 받는 예외가 일어나지 않는다` 를 더한다.
- §5.3 「받는 노드 디버그(D-134)」 행 끝에 ` 끝내는 IF 갈래로 끝난 실행은 툴바 상태가 「완료 · {n}단계 · 결과 변수 {m}개 · IF {제목}의 「{갈래}」 갈래에서 끝냈다」 이고 END 노드 상세에 같은 문장(\`sim-detail-ended-branch\`)이 보인다(D-136).` 를 붙인다.
- §10 LV-005 는 그대로(`MERGE` 는 남는다). §11 표 끝에 `| N-32 | **합류 없애기(D-136)** — IF·받는 노드 합류를 없애고 모이는 자리·돌아오는 자리를 계산한다. 병렬 합류만 남고 이중선 막대다. 끝내는 IF 갈래·빈 단계 받는 노드를 더한다. 옛 형식은 엔진이 받고 편집기가 열 때 바꾼다(결정 J-D1~J-D19, 계획 Rulings R1~R21) |` 를 더한다.

- [ ] **Step 5: 확인**

Run: `grep -c "^## D-136" docs/mdm/decisions.md` → 1. `grep -n "D-136" docs/mdm/engine-contract.md docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md docs/superpowers/specs/2026-10-01-rule-set-flow-catch-design.md` → 세 파일 모두 한 줄 이상.

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add docs/mdm/decisions.md docs/mdm/engine-contract.md docs/superpowers/specs/2026-10-01-rule-set-flow-catch-design.md docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/DefinitionLookup.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetResult.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RunTrace.java src/frontend/m-mdm/src/contract/engine-contract.generated.ts
/usr/bin/git commit -m "docs(mdm): 룰 세트 합류 없애기 결정 D-136 과 엔진 계약 설명·기능설계서를 갱신한다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- docs/mdm/decisions.md docs/mdm/engine-contract.md docs/superpowers/specs/2026-10-01-rule-set-flow-catch-design.md docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/DefinitionLookup.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetResult.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RunTrace.java src/frontend/m-mdm/src/contract/engine-contract.generated.ts
```

---

### Task 9: e2e 시나리오 — E3·E11·E13·E14·E15 고치기, E17(옛 형식 열기)·E18(끝내는 갈래) 더하기, 새 포트·새 DB 로 실제 실행

**등급:** standard — 기존 도우미로 시나리오를 고치고 더한 뒤, 정해진 절차로 격리 서버를 띄워 돌린다.
**병렬:** Task 1~7 병합 뒤, `$W`(feat 워크트리)에서 한다. Task 8 과 함께 돌 수 있다.

**Files:**
- Modify: `src/frontend/e2e/mdm-ruleSetEdit.spec.ts`, `src/frontend/e2e/fixtures/mdm-ruleSet-data.sql`

**Interfaces:**
- Consumes: testid `flow-node-{id}`·`set-message`·`set-save`·`set-name`·`flow-prop-branch-{edgeId}-ending`·`flow-prop-if-ending-help`(Task 6)·`dbg-status`(Task 7), React Flow 선 `rf__edge-{id}`·끝 손잡이 `.react-flow__edgeupdater-target`, 픽스처 세트 `E2S_FLOW`(옛 형식)·`E2S_IFEND`(새 형식, 이 태스크가 더한다).
- Produces: e2e E17·E18.

- [ ] **Step 1: 픽스처 세트 `E2S_IFEND`(R13)**

`mdm-ruleSet-data.sql` 머리 주석의 `세트 8` 을 `세트 9` 로, 세트 목록 끝에 `· E2S_IFEND(새 형식 IF — 합류 없음, e2e E18)` 를 더한다. `TB_MDM_RULE_SET` INSERT 의 마지막 행(`E2S_CATCHSET` … `0);`)의 `0);` 를 `0),` 로 바꾸고 그 뒤에 넣는다(키 순서·null 쓰기는 `E2S_FLOW` 정규 JSON 과 같다):
```sql
    -- 새 형식 분기 세트(D-136): start → r1(E2S_GRD) → if1(등급 확인) { e3 order1 'S_GRD = "A"' 「등급 A」 → r2(E2S_FCT) ; e4 그 외 → r3 } , r2 → r3(E2S_NODEF) → end. 합류 노드가 없다.
    ('E2S_IFEND', 'E2E 끝내는 갈래 세트', '["E2S_GRD","E2S_FCT","E2S_NODEF"]',
     '{"version":1,"nodes":[{"id":"start","kind":"START","ruleId":null,"splitId":null,"label":null},{"id":"r1","kind":"RULE","ruleId":"E2S_GRD","splitId":null,"label":null},{"id":"if1","kind":"IF","ruleId":null,"splitId":null,"label":"등급 확인"},{"id":"r2","kind":"RULE","ruleId":"E2S_FCT","splitId":null,"label":null},{"id":"r3","kind":"RULE","ruleId":"E2S_NODEF","splitId":null,"label":null},{"id":"end","kind":"END","ruleId":null,"splitId":null,"label":null}],"edges":[{"id":"e1","from":"start","to":"r1","order":null,"cond":null,"otherwise":false,"label":null},{"id":"e2","from":"r1","to":"if1","order":null,"cond":null,"otherwise":false,"label":null},{"id":"e3","from":"if1","to":"r2","order":1,"cond":"S_GRD = \"A\"","otherwise":false,"label":"등급 A"},{"id":"e4","from":"if1","to":"r3","order":null,"cond":null,"otherwise":true,"label":"그 외"},{"id":"e5","from":"r2","to":"r3","order":null,"cond":null,"otherwise":false,"label":null},{"id":"e6","from":"r3","to":"end","order":null,"cond":null,"otherwise":false,"label":null}],"view":{"positions":{},"notes":[],"groups":[]}}',
     '등급이 A 면 계수를 구하고, 아니면 두께 등급을 정한다(새 형식 IF)', 'INUSE', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0);
```
(`mdm-ruleSetMng.spec.ts` 는 `E2S_` 세트 건수를 단언하지 않고, 룰 `E2S_OLD` 로 좁힌 1건 단언에는 이 세트가 들지 않는다 — 확인했다.)

- [ ] **Step 2: 기존 시나리오 고치기**

- 머리 주석 고유 목록 끝에 `E17 옛 형식 열기(E2S_FLOW 를 열면 합류 없이 그려지고 알림, dirty 아님, 저장 뒤 다시 열면 알림 없음), E18 끝내는 갈래(갈래 마지막 선을 끝으로 옮겨 저장 → 디버그에서 그 갈래로 끝냄).` 를 더하고, 「화면 구조」 문단 끝에 ` IF 는 합류 노드가 없다 — 갈래가 모이는 자리로 바로 간다(D-136). 저장된 옛 형식 세트(E2S_FLOW)는 열 때 바꿔 그린다.` 를 붙인다. `flowNodes` 주석의 "(시작·끝·룰·IF·병렬·합류)" 는 "(시작·끝·룰·빈 단계·IF·병렬·병렬 합류)" 로.
- E3: 주석 `// 고른 선이 없으면 END 로 들어가는 선(e4)에 끼운다 — IF if1 · 합류 m1, 새 갈래 e5(조건식 칸)·e6(그 외).` 를 `// 고른 선이 없으면 END 로 들어가는 선(e4)에 끼운다 — IF if1 과 「갈래 1」 빈 단계 r4(합류 없음), 새 갈래 e5(조건식 칸)·e6(그 외), 선 e7(r4 → 끝).` 로, `await expect(page.getByTestId("flow-node-m1")).toBeVisible();` 를 `await expect(page.getByTestId("flow-node-r4")).toBeVisible();` 로 바꾸고 `await expect(flowNodes(page)).toHaveCount(7);` 다음에 `await expect(page.getByTestId("flow-canvas").locator('[data-kind="MERGE"]')).toHaveCount(0);` 를 더한다. 조건식을 넣은 뒤(`not.toContainText("갈래 e5에 조건식이 없다")` 다음)에 `await expect(page.getByTestId("set-checks")).toContainText("빈 단계 1개 — 실행 때 그냥 지나간다");` 를 더한다.
- E11: 주석 `// 분기 세트도 캔버스로 그려진다: 시작 · r1 · if1 · r2 · m1 · r3 · 끝.` 을 `// 분기 세트도 캔버스로 그려진다(옛 합류 m1 은 열 때 없앤다): 시작 · r1 · if1 · r2 · r3 · 끝.` 으로, `toHaveCount(7, { timeout: 20_000 })` 를 `toHaveCount(6, { timeout: 20_000 })` 로.
- E13: `// 선의 [+] → 메뉴 [IF 넣기] → IF 와 합류가 생긴다.` 를 `// 선의 [+] → 메뉴 [IF 넣기] → IF 와 「갈래 1」 빈 단계가 생긴다(합류 없음).` 로 바꾸고 `await expect(flowNodes(page)).toHaveCount(8);` 다음에 `await expect(page.getByTestId("flow-canvas").locator('[data-kind="MERGE"]')).toHaveCount(0);` 를, [병렬로 바꾸기] 단언 뒤에 `await expect(page.getByTestId("flow-canvas").locator('[data-kind="MERGE"]')).toHaveCount(1); // 병렬 합류(이중선 막대)` 와 `await expect(flowNodes(page)).toHaveCount(9);` 를, Ctrl+Z 단언 뒤에 `await expect(page.getByTestId("flow-canvas").locator('[data-kind="MERGE"]')).toHaveCount(0);` 와 `await expect(flowNodes(page)).toHaveCount(8);` 를 더한다.
- E14·E15: `pickSet(page, "E2S_FLOW")` 다음의 `toHaveCount(7, { timeout: 20_000 })` 를 `toHaveCount(6, { timeout: 20_000 })` 로(편차 F1).

- [ ] **Step 3: E17·E18 더하기(파일의 마지막 `test(…)` 블록 뒤, `test.describe` 닫는 괄호 앞)**

```ts
  test("E17 옛 형식 열기: E2S_FLOW 를 열면 합류 없이 그려지고 알림이 보이며 dirty 가 아니고, 저장 뒤 다시 열면 같은 그림에 알림이 없다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_FLOW");
    await expect(flowNodes(page)).toHaveCount(6, { timeout: 20_000 });
    await expect(page.getByTestId("flow-node-m1")).toHaveCount(0);
    await expect(page.getByTestId("set-message")).toContainText("옛 합류 노드 1개를 없앤 형식으로 바꿔 열었다. 저장하면 새 형식으로 남는다.");
    await enterEditMode(page);
    await expect(page.getByTestId("set-save")).toBeDisabled();

    // 세트명을 고쳐 저장하면 새 형식(합류 없음)으로 남는다.
    await page.getByTestId("set-name").fill("E2E 분기 흐름 세트(새 형식)");
    await expect(page.getByTestId("set-save")).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId("set-save").click();
    await expect(page.getByTestId("set-message")).toContainText(/저장 · row_version \d+/, { timeout: 20_000 });

    // 다른 세트를 거쳐 다시 열면 같은 그림이고 알림이 없다.
    await pickSet(page, "E2S_CHAIN");
    await pickSet(page, "E2S_FLOW");
    await expect(flowNodes(page)).toHaveCount(6, { timeout: 20_000 });
    await expect(page.getByTestId("set-name")).toHaveValue("E2E 분기 흐름 세트(새 형식)");
    await expect(page.getByText("옛 합류 노드")).toHaveCount(0);
  });

  test("E18 끝내는 갈래: 「등급 A」 갈래의 마지막 선을 끝으로 옮겨 저장하고 그 갈래를 타는 입력으로 실행하면 완료·끝낸 갈래 표시가 보이고 IF 뒤 노드는 돌지 않는다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_IFEND");
    await expect(flowNodes(page)).toHaveCount(6, { timeout: 20_000 });
    await expect(page.getByText("옛 합류 노드")).toHaveCount(0);
    await enterEditMode(page);

    // 선 e5(r2 → r3)를 골라 도착 끝 손잡이를 끝 노드 몸통에 놓는다(R13 — 선 끝 옮기기 R1).
    await page.locator('[data-testid="rf__edge-e5"] .react-flow__edge-interaction').dispatchEvent("click");
    const handle = page.locator('[data-testid="rf__edge-e5"] .react-flow__edgeupdater-target');
    await expect(handle).toBeAttached({ timeout: 10_000 });
    const hb = await handle.boundingBox();
    const eb = await page.getByTestId("flow-node-end").boundingBox();
    if (!hb || !eb) throw new Error("끝 손잡이나 끝 노드가 안 보인다");
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2, { steps: 15 });
    await page.mouse.up();

    // IF 를 고르면 「등급 A」 갈래 옆에 「끝냄」 과 이어지는 갈래 안내가 보인다.
    await page.getByTestId("flow-node-if1").click();
    await expect(page.getByTestId("flow-prop-branch-e3-ending")).toHaveText("끝냄");
    await expect(page.getByTestId("flow-prop-if-ending-help")).toBeVisible();

    await expect(page.getByTestId("set-save")).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId("set-save").click();
    await expect(page.getByTestId("set-save")).toBeDisabled({ timeout: 30_000 });

    // E2S_GRD 는 언제나 "A" 라 「등급 A」 갈래를 타고 r2(E2S_FCT) 뒤 끝난다 — 기록 start·r1·if1·r2·end, 결과 변수 S_GRD·S_FCT.
    await enterDebugMode(page);
    await fillDebugInputs(page);
    await page.getByTestId("dbg-finish").click();
    await expect(page.getByTestId("dbg-status")).toHaveText("완료 · 5단계 · 결과 변수 2개 · IF 등급 확인의 「등급 A」 갈래에서 끝냈다", { timeout: 30_000 });
    await expect(page.getByTestId("flow-node-r2")).toHaveAttribute("data-state", "run");
    await expect(page.getByTestId("flow-node-r3")).toHaveAttribute("data-state", "dim");
  });
```
도구 손잡이 끌기가 이 환경에서 끝을 옮기지 못하면(저장 단추가 켜지지 않음) 같은 시험 안에서 대신 선 `e5` 우클릭 「선 삭제」(`flow-menu-item-edge-delete`) 뒤 `flow-handle-r2-bottom` 을 끝 노드로 끌어 잇는 방법으로 바꾸고, 그 사실을 완료 보고에 적는다(편집 결과 흐름은 같다 — 선 ID 만 새로 생긴다).

- [ ] **Step 4: 목록 확인**

Run: `pnpm --dir src/frontend exec playwright test --list e2e/mdm-ruleSetEdit.spec.ts`
Expected: E1~E18 이름이 오류 없이 나온다.

- [ ] **Step 5: 새 포트·새 DB 로 실제 실행(본체 서버 5100·8100·8096 은 건드리지 않는다)**

TSK-08-06 「E2E 서버 절차」(`docs/mdm/tasks/TSK-08-06/design.md` 547~601줄)를 이 워크트리 값으로 옮긴다. 명령은 한 줄씩 차례로 실행하고, 포트는 실행 때 비어 있는 번호로 다시 고른다(셋 다 LISTEN 이 없어야 한다).
```bash
W=/Users/jji/project/dmes-standard-wt/rule-set-join
SP=<이 실행자의 scratchpad>
J=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
lsof -iTCP:18213 -sTCP:LISTEN; lsof -iTCP:18306 -sTCP:LISTEN; lsof -iTCP:15213 -sTCP:LISTEN
cd $W && .claude/skills/dflow-dev/scripts/heavy.sh acquire e2e-rule-set-join
mkdir -p $W/src/backend/data
[ -f $W/src/backend/data/mcm.db ] && mv $W/src/backend/data/mcm.db $W/src/backend/data/mcm.db.bak-$(date +%Y%m%d%H%M%S)
[ -f $W/src/backend/data/mdm.db ] && mv $W/src/backend/data/mdm.db $W/src/backend/data/mdm.db.bak-$(date +%Y%m%d%H%M%S)
cd $W/src/backend/mcm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain --args='--spring.profiles.active=local --server.port=18213 --mcm.bff.invalidate-role-url=http://127.0.0.1:15213/api/mcm/internal/cache/invalidate-role --cactus.notify.publish-url=http://127.0.0.1:18213/notify/publish' > $SP/be-mcm.log 2>&1 &
cd $W/src/backend/mdm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain --args='--spring.profiles.active=local --server.port=18306' > $SP/be-mdm.log 2>&1 &
```
두 로그에서 sqlite 경로가 `$W/src/backend/data/mcm.db`·`mdm.db` 인지, mdm 은 Flyway 적용 로그 뒤 기동 완료인지 확인한다(아니면 즉시 중단·정리). 그다음:
```bash
cd $W/src/frontend && sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-seed-check.sql | diff - e2e/fixtures/mdm-rbac-seed-check.expected.txt
sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-users.sql
sqlite3 $W/src/backend/data/mdm.db < e2e/fixtures/mdm-ruleSet-data.sql
cd $W/src/frontend && pnpm build:libs
cd $W/src/frontend/m-mcm && AUTH_SECRET=$(openssl rand -hex 32) NEXTAUTH_URL=http://127.0.0.1:15213 OIDC_ISSUER=http://127.0.0.1:15213 MCM_WAS_URL=http://127.0.0.1:18213 MDM_WAS_URL=http://127.0.0.1:18306 BACKEND_API_URL=http://127.0.0.1:18213 BACKEND_CLIENT_KEY=dmes-bff-local-client-key-2026 pnpm exec next dev --turbopack --port 15213 > $SP/fe.log 2>&1 &
cd $W/src/frontend && SMOKE_MCM_BASE_URL=http://127.0.0.1:15213 SMOKE_LOGIN_PASSWORD=admin123 $W/.claude/skills/dflow-dev/scripts/heavy.sh pnpm exec playwright test e2e/mdm-ruleSetMng.spec.ts e2e/mdm-ruleSetEdit.spec.ts --workers=1
```
Expected: 두 스펙 passed, skipped·failed 0, 시드 대조 `diff` 출력 없음. 실패하면 화면·서버 로그(`$SP/*.log`)와 Playwright trace 로 원인을 찾아 고치고 **새 DB 로 처음부터** 다시 돌린다(스펙이 세트를 고치므로 같은 mdm.db 로 다시 돌릴 수 없다).
정리(성공·실패와 상관없이, 자기 PID·자기 포트만):
```bash
lsof -tiTCP:15213 -sTCP:LISTEN | xargs -r kill
lsof -tiTCP:18306 -sTCP:LISTEN | xargs -r kill
lsof -tiTCP:18213 -sTCP:LISTEN | xargs -r kill
cd $W && .claude/skills/dflow-dev/scripts/heavy.sh release
cd $W && /usr/bin/git checkout -- docs/mdm/tasks/TSK-08-06/screens/
cd $W && /usr/bin/git status --porcelain docs/mdm/tasks/
```
스펙이 덮어쓴 스크린샷(`docs/mdm/tasks/TSK-08-06/screens/*.png`)은 되돌리고 커밋하지 않는다(마지막 `git status` 출력이 비어야 한다). 전역 `gradlew --stop`·`pkill`·`killall` 은 쓰지 않는다.

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add src/frontend/e2e/mdm-ruleSetEdit.spec.ts src/frontend/e2e/fixtures/mdm-ruleSet-data.sql
/usr/bin/git commit -m "test(e2e): 룰 세트 합류 없애기 시나리오 E17·E18 과 새 형식 픽스처 세트를 더한다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/frontend/e2e/mdm-ruleSetEdit.spec.ts src/frontend/e2e/fixtures/mdm-ruleSet-data.sql
```
완료 보고에 실제 실행 결과(통과 수·걸린 시간·포트·DB 경로)를 적는다.

---

## 최종 검증(컨트롤러)

- [ ] feat 트리(`$W`, e2e 서버가 내려간 뒤)에서 엔진 전체·lib 전체·api(`'*RuleSet*'` `'*RuleLedgerChecksTest'` `'*DmeOasisHttpTest'`)·`cd src/frontend/m-mdm && node scripts/test.mjs --maxWorkers=3` 의 `[m-mdm test 합계]`·`rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint` 를 돌려 기준선 대비 증감을 장부에 적는다.
- [ ] `grep -rn "SEAM(T" src/frontend/m-mdm/pages/dme/ruleSetEdit src/backend` → 0건.
- [ ] 골든 무변경: `/usr/bin/git diff --stat dev -- '*golden*.json'` → 변경 없음.
- [ ] 코퍼스 변경 범위: `/usr/bin/git diff dev -- src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json` 에서 지운 줄(`-`)이 §14.2 의 여섯 사례·편차 F4 의 두 이름·`]` 직전 쉼표뿐인지 본다. 두 러너 `MIN_CASES` 가 같다(`grep -n "MIN_CASES =" src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts`).
- [ ] Task 9 의 e2e 실제 실행이 통과했는지 보고서로 확인한다(통과 수·실행 포트가 본체 서버와 다름).
- [ ] 가장 강한 모델로 브랜치 전체 리뷰(`superpowers:requesting-code-review`)를 한 번 받고, 지적은 한 번의 고침 + 범위 재리뷰로 닫는다. 리뷰 요청에 Review Focus 다섯 줄을 그대로 넣는다.

## 수동 브라우저 확인(컨트롤러, ego-browser, dev 병합 뒤 본체 화면)

서버가 내려가 있으면 묻지 않고 재시작하지 않는다(사용자에게 알린다). 테스트용 세트는 새로 만들지 말고 기존 테스트 세트(`ZZ_BROWSER_CHECK_1` 등)를 쓴다.

1. IF 합류가 저장된 옛 세트를 열면 합류 원 없이 갈래가 다음 노드로 바로 들어가고, 메시지 줄에 「옛 합류 노드 n개를 없앤 형식으로 바꿔 열었다…」 가 한 번 보이며, 편집 모드에서 저장 단추가 꺼져 있다(dirty 아님).
2. 편집 모드: 선에 IF 를 넣으면 「갈래 1」 에 빈 단계가 생기고 합류는 없다. 그 IF 를 「병렬로 바꾸기」 하면 병렬 분기와 같은 너비의 이중선 막대(가는 두 줄)가 생기고, 되돌리면 사라진다. 밝은·어두운 테마 모두 두 줄이 보인다.
3. IF 갈래의 마지막 선 끝을 끝 노드로 옮기면 IF 속성 패널 갈래 옆에 「끝냄」 과 안내 한 줄이 보이고, [자동 정렬] 하면 끝내는 갈래 몸이 오른쪽에 비켜 서며 끝으로 가는 선이 다른 노드를 지나지 않는다. 「분기 풀기」 메뉴에서 그 갈래는 「(끝냄)」 으로 흐리다.
4. 빈 단계 노드에 마우스를 올리면 번개 연결점이 보이고, 우클릭 「예외 받기 추가」 가 있다. 받는 노드를 고르면 「붙은 노드」 와 「…빈 단계라 …가 받는 예외가 일어나지 않는다」 경고가 보인다.
5. IF 블록을 접으면 블록에서 모이는 자리로 선 하나만 보이고, 그 선에는 [+]·우클릭 메뉴·끝 손잡이가 없다.
6. 디버그 모드: 끝내는 갈래를 타는 입력으로 [끝내기] 하면 툴바가 「완료 · … · IF {제목}의 「{갈래}」 갈래에서 끝냈다」 이고 END 노드를 누르면 같은 문장이 상세에 보인다. 처리 갈래가 정상 경로 노드로 돌아오는 세트에서는 그 노드부터 변수 표에 CATCH_* 가 없다.
