# eng 진행 기록

조정 세션: dmes-standard-90 · 회차 rule-set-subset-call-2026-10-06 · 브랜치 `feat/rule-set-subset-engine` · 워크트리 `/Users/jji/project/dmes-standard-wt/rssc-eng`

## 지금 상태
- eng:1·eng:2 완료, 머지 요청 준비(dev 합치기·전체 시험)
- 남은 순서: eng:1·eng:2 머지 → eng:4 → eng:c

## 기준선
- 착수 커밋: dev `c12e99a4`
- 엔진 `maru-mdm-engine test`: 1629 통과 · 1 건너뜀 · 실패 0
- cactus-core `:cactus-core:test`: 861 통과 · 1 건너뜀 · 실패 0
- m-mdm lint(tsc): 오류 0
- m-mdm test: `[m-mdm test 합계] Test Files 232 · Tests 3603 (passed 3602 · failed 1)` — 실패 1건은 dev 에 원래 있는 `tests/ui-meta-lock.test.ts > 화면 소스의 컬럼 사전 연결 고정 > 기록과 같다`(m-mcm `commWidgetMng/WidgetDetailForm.tsx` 기록 불일치, 이 업무와 무관). 조정 세션이 dev `14ec1124` 에서 고쳤다 → 머지 요청 전 dev 합치면 통과

## eng:1. 엔진 계약(SET 노드·setId·SUBSET_ENDED·호출 오류 두 코드·setPath·calls·callIndex·outputs/sub·CATCH_SET)
- 실행 수단: D4 Workflow(구현 sonnet/high → 리뷰 opus/high → 수정)
- 커밋: `1a109e59`(엔진 계약·스키마·호출부·RunTraceJson·RuleSetFlowJson·RuleSetRunner 한 곳), `b8d54b55`(생성 TS·화면 종류 맵·catch-text·KIND_TEXT), `b6ef84e5`(fix: RuleSetPathStateTest CATCH 기대값 → `ReservedNames.CATCH_NAMES`, 조정 허가)
- 시험 결과: 엔진 1636(1635 통과·1 건너뜀, 기준선 대비 +6) · mdm api 1739 통과 · RunTraceJsonTest·RuleSetFlowJsonTest 통과 · mdm :lib:test 는 리뷰 때 RuleSetPathStateTest 3건 실패 → `b6ef84e5` 로 수정(재확인은 eng:2 시험에서) · m-mdm lint 0 · ruleSetEdit 묶음 95파일 1795 통과 · JSON 골든 불변
- 결정: 빈 `setPath`·null `outputs`/`sub` 는 키 생략, `callIndex` 는 required+null. `CatchKind.SUBSET_ENDED(List.of())` 는 어떤 코드에도 매핑되지 않는다.
- 계획 조정:
  - `flow-edit.ts` 는 고치지 않았다(`NODE_PREFIX`·`MOVE_FIXED` 가 `Partial` 이라 tsc 가 깨지지 않고, SET 붙여넣기 처리는 ui:8 몫).
  - `IN_DEGREE.SET = AT_LEAST_ONE`(지금 RULE·TASK 와 같음, 본문의 옛 `ONE` 대신), `OUT_DEGREE.SET = ONE`, `NODE_SIZE.SET {232,68}`.
  - `PropertyPanel.tsx`·`TraceDetail.tsx` 의 `KIND_TEXT` 에 SET 한 줄씩(tsc TS2741 때문, 조정 승인).
  - `RuleSetDefinition` 이 7인자라 `SubsetContractTest` 를 지금 시그니처로 썼다. `EngineContractSchemaTest` 의 SetCall 짝은 R21.
  - `RuleSetRunner` 는 조정 허가로 `new Violation(…FLOW_INVALID…)` 한 곳에 `List.of()` 만 더했다.
- 넘긴 일: TS `flow-model.ts` `CATCH_NAMES` 를 다섯으로 맞추고 set-model·debug-model·trace-view 를 서버와 맞추는 일 → ui:5t(조정 결정).

## eng:2. 흐름 구조 Java(SetStep·catchable SET·FlowTree setSteps/setIds/relation·D-136 §13)
- 실행 수단: D4 Workflow(구현 sonnet/high → 리뷰 opus/high, 지적 minor 1건은 직접 수정)
- 커밋: `cfa65ad7`(SetStep·setSteps·setIds·relation(SET)·catchable SET·h2 문구·SEAM(T4)), `0cebc83b`(`RuleSetFlowJson.setIds`), 리뷰 지적(받는 노드가 붙은 SET 경로 SEAM(T4) 주석 2곳) 커밋
- 시험 결과: 엔진 1657 통과·1 건너뜀·실패 0(+21, `FlowParserSetTest`) · mdm :lib:test 1689 통과·실패 0 · mdm api·cactus-core 컴파일 통과
- 결정:
  - `record SetStep(String nodeId, @Nullable String setId) implements Step`. 빈·공백·null `setId` 는 구조 오류가 아니다(서버 `CALL_MISSING` 몫). `setIds()` 는 빈 값을 거르고 순서를 지킨다.
  - 실행 경로의 SET 은 eng:4 전까지 `IllegalStateException`(SEAM(T4)) — 조용히 건너뛰면 하위 세트 출력이 빠진 결과가 나와 오류를 숨긴다.
- 계획 조정:
  - `CallStep`·`callSteps()` 없음(Ruling 1·2 재정의, 조정 지시). `Step` permits 에 `SetStep`.
  - 본문의 "들어오는 선 2개 → 1개여야" 시험은 쓰지 않았다(지금 RULE·TASK 기본이 1개 이상). 0개 오류·나가는 선 2개 오류·모이는 자리 SET 정상을 시험했다.
  - 옛 형식 MERGE 짝 검사에 SET 제외를 더해 `splitId=SET` 은 구조 오류(D-136 §13).
  - 본문의 `step()`/`Builder.step` 헬퍼 대신 지금 메서드 `stepNode` 에 SET 갈래를 넣었다.
  - relation 기대값 3건을 실제 트리 의미에 맞춰 BEFORE 로 썼다(처리 갈래→돌아오는 자리 등).
  - h2 문구를 "룰·빈 단계·룰 세트 노드에만" 으로 바꿨다. TS 쪽 같은 문구(flow-model·flow-edit·catch-edit.test)는 ui:5t 몫이라 그 전까지 두 벌 문구가 다르다.

## 결정
- eng:2 이름(조정 eng-2 알림): `SetStep(nodeId, setId)`·`FlowTree.setSteps()`·`FlowTree.setIds()` 를 만든다. `callSteps()` 는 만들지 않는다(srv:5 가 분석기 안에서 steps 를 거른다). 이름을 바꾸면 진행 보고에 적는다.
- eng:2 추가 요구(조정 eng-2, srv:5 용): `FlowTree.relation(a, b)` 가 SET 노드 ID 를 받는다(지금은 RULE·TASK·IF·PARALLEL 밖이면 IllegalArgumentException). `FlowParser.catchable` 에 SET.
- 프론트 의존성: 워크트리 `src/frontend` 에 `node_modules` 가 없었다(메인 심링크 아님). 워크트리 안에서 `pnpm install` 한다.
