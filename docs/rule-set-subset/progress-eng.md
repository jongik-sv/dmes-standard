# eng 진행 기록

조정 세션: dmes-standard-90 · 회차 rule-set-subset-call-2026-10-06 · 브랜치 `feat/rule-set-subset-engine` · 워크트리 `/Users/jji/project/dmes-standard-wt/rssc-eng`

## 지금 상태
- eng:1·eng:2 dev 머지 `8192debe`, eng:4 dev 머지 `3efb56fe`, eng:c 완료(머지 요청 준비)
- 남은 순서: eng:c 머지 → 레인 정리(조정 지시 뒤)

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

## eng:4. 엔진 실행(하위 세트 준비 재귀·SetShape·SET 노드 실행·받는 노드·setPath·calls·sub·CATCH_SET·준비 캐시)
- 커밋: `e2b8455b`(SetShape·PreparedSet·FlowKeys SET 갈래·SubsetShapeTest·SubsetFlows), `c03fe9b0`(MdmRuleEngine 재귀 준비·준비 캐시, FlowRun SET 실행·받는 노드·CATCH_SET, 시험 넷 + 준비 캐시 사례), `11977bee`(룰 처리 갈래가 SET 노드로 돌아오는 사례·문구)
- 시험 결과: 엔진 1686(1685 통과·1 건너뜀·실패 0, eng:2 1657 대비 +29: SubsetCall 11·SubsetShape 6·SubsetCatch 8·SubsetCycleDepth 3·준비 캐시 1) · mdm :lib:test 1689 통과 · mdm :api:test 1740 통과(SQLite) · cactus-core compileJava·compileTestJava 통과
- 벤치(`MDM_BENCH=1 … --rerun --tests '*RuleSetPrepareBenchTest'`, 전후 3번씩, perCall 중앙값의 중앙값, µs):
  - 전(be56cdf7): A_hit N=1/5/20 = 385.1/440.1/444.7, B_miss = 412.5/471.0/496.3, C(준비 기준값, 바뀌지 않은 코드) = 19.9/22.4/23.0, load 3.3~5.0
  - 뒤(c03fe9b0): A_hit = 297.0/299.4/302.5, B_miss = 312.1/312.7/317.7, C = 15.7/15.6/15.9, load 1.8~2.8
  - 판정: 숫자가 준 것은 PC 부하 차이다(코드가 같은 C 도 22~31% 줄었다). C 로 나눈 A_hit 비는 N=1 19.3→18.9, N=5 19.6→19.2, N=20 19.3→19.0 — 느려지지 않았다(10% 안). SET 없는 세트는 겉모양·받는 노드 label 을 만들지 않고, 적중 경로에 더한 것은 빈 setSteps 확인 하나다.
- 결정:
  - 준비 캐시는 최상위 세트 ID 마다 `PreparedSet` 하나다. 판정마다 룰·하위 세트(손주까지)를 `ruleSet(id, ts)`·`rule(id, ts)` 로 다시 조회해 앞 준비와 정의 객체가 모두 같으면 그 준비를 그대로 쓴다(같은 세트 정의 객체면 흐름 트리도 다시 쓴다). 위반은 조회 때마다 다시 만들어지므로 위반이 있는 준비도 기억한다(옛 동작과 같다). 하위 세트 정의가 바뀌면 부모 흐름 트리는 그대로, 준비(검사기 원본)는 새로 만든다.
  - 기억한 준비의 `FlowKeys` 는 원본이고, 실행은 늘 `forRun()` 사본을 쓴다(하위 세트도 runChild 에서 사본). 지연 목록이 레코드·스레드끼리 섞이지 않는다.
  - 겉모양·받는 노드 label 은 하위 세트로 불리는 준비에만 만든다(최상위는 null·빈 맵).
  - 순환·깊이 위반의 `Violation.name` 은 부르려던 세트 ID. 깊이 판정은 `chain.size() > SetShape.MAX_CALL_DEPTH`(chain = 최상위부터 부르는 세트까지).
  - 하위 세트 안 구조 오류·룰 없음의 setPath 는 그 하위 세트까지(SET 노드 ID 포함), SET_NOT_FOUND·SET_DEPRECATED·순환·깊이는 그 SET 노드를 가진 세트까지.
  - `CATCH_SET` 은 RULE 받는 노드에도 넣는다(값 = 지금 세트 ID). `CATCH_ORDER` 가 다섯이라 저장·복원·END 삭제에 함께 든다.
  - 기록 실행의 하위 기록(`sub`)은 멈췄으면 멈춘 노드를 ERROR 로 덧붙이고 위반은 하위 세트 기준 setPath(빈 목록부터), 그때 `endedBy` 는 null.
- **SetShape 알고리즘(srv:6 `RuleSetInterface`·`SetCallIoEngineAgreementTest` 가 맞춰야 한다)**:
  - 훑는 순서: 단계(RULE·SET)를 깊이 우선 — 순차는 차례로, 분기는 갈래 실행 순서, 받는 노드 블록은 단계 → 정상 갈래 → 처리 갈래(배열 순). RULE 과 SET 이 섞인다(서버 `RuleSetFlowJson.ruleIds` 의 RULE 만 목록과 다름). 받는 노드가 붙은 TASK 는 단계를 건너뛰고 갈래만 훑는다. 중복 키 `rule:<ruleId>`·`set:<setId>` 는 처음 것만.
  - inputs: 앞에서 아직 만들지 않은 이름을 읽으면 입력(첫 등장 순). RULE 이 읽는 이름 = `FlowKeys.needed`(계약 always + DERIVE 행 required·optional), SET = 하위 inputs. IF 조건식 변수는 넣지 않는다.
  - outputs: 만든 이름 가운데 만든 뒤 어떤 단계도 읽지 않은 것(첫 생산 순). RULE 이 만드는 이름 = `RuleEvaluator.resultNames`, SET = 하위 outputs.
  - mustInputs: 그 세트 `FlowKeys.check(root, ∅)` 가 모자란다고 보는 이름 — IF 조건식 변수 포함, INPUT_ERROR 를 받는 단계의 입력 제외, IF·처리 갈래 안은 제외.
  - always: `RuleSetPathState` 합치기 규칙의 "반드시 정의됨"만 따라간다 — IF 는 이어지는 갈래 교집합(끝내는 갈래 제외), PARALLEL 은 합집합, 받는 노드 블록(TASK 포함)은 정상(직전 + 단계 결과 + 정상 갈래)과 돌아오는 처리 갈래(직전 상태에서 본문)의 교집합. SET 단계가 만드는 이름은 하위 always. 끝냄 지점 = 끝내는 IF 갈래 본문 끝(처리 갈래·병렬 갈래 안 포함, 병렬 갈래 안이면 그 갈래 사본 = 분기 직전 + 그 갈래), 끝내는 처리 갈래 본문 끝. always = outputs ∩ (루트 순차 끝 상태 ∩ 모든 끝냄 지점 상태).
  - 어긋날 수 있는 곳: 엔진 `FlowKeys.needed`·`resultNames` 와 서버 `RuleIo` 조건·결과 이름(DICT 출처 등). srv:6 합의 시험에서 확인한다.
- 계획 조정:
  - `CallStep`·`callSteps()` 없음 — `Step` 에 `instanceof` 로 가르고 깊이 우선 훑기를 `SetShape` 안에 직접 둔다. `g.rule()` 대신 `g.step()`.
  - `SetShape` 는 `public final class`(`public static final int MAX_CALL_DEPTH = 5`, eng:c 용), 나머지 접근자는 패키지 전용. `PreparedSet` 은 패키지 전용 `final class`.
  - `FlowRun(evaluator, runner, PreparedSet, FlowKeys 실행 사본, record, ts, tracing, edits)` — 본문의 `FlowRun(…, PreparedSet, …)` 와 달리 검사기 사본을 따로 받는다(기억한 준비를 스레드끼리 나눠 쓴다).
  - `FlowKeys` 2인자 생성자는 남긴다(`mdm/api` 시험 `FlowKeysProbe`·벤치 C 경로가 쓴다). 3인자 `(defs, shapes, expressions)` 를 더했다.
  - 본문의 `enterHandler` 는 뽑았다(처리 갈래 안 IF 끝냄 → 받는 노드 끝냄 바꾸기 J-D18 포함). `closeGuard` 는 뽑지 않았다 — 지금 `guarded` 꼬리가 RULE·TASK·SET 공통으로 joinId 복원·옛 형식 MERGE 기록을 한다(본문 판은 mergeId 가 없으면 CATCH_* 복원을 건너뛰어 새 형식에서 틀린다).
  - 하위 세트 조회는 `ruleSet(id, ts)`(본문은 1인자).
  - `SubsetCatchTest` 는 새 형식으로 다시 썼다 — 본문의 `merge("m1","s1")`(splitId 가 SET 노드인 돌아오는 MERGE)는 eng:2 에서 구조 오류다. 처리 갈래는 정상 경로 위 빈 단계 j 로 돌아온다.
  - `SubsetCallTest` 기록 시험의 입력은 BigDecimal 이다 — SET 노드 `reads` 는 부모 ctx 값 그대로라 문자열 "1" 이면 숫자가 아니다.
  - `assertNum` 은 2인자라 본문의 설명 인자는 주석으로 옮겼다.
  - 본문 밖 시험을 더했다: 하위 세트 안 RULE_NOT_FOUND·FLOW_INVALID 의 setPath, 하위 always 가 부모 사전 검사의 반드시 만드는 이름, SET 이 IF 모이는 자리·병렬 갈래·룰 처리 갈래의 돌아오는 자리, 받은 하위 위반의 기록(SET CAUGHT·CATCH), 끝내는 IF 갈래로 끝난 하위 세트는 SUBSET_ENDED 가 아님, 하위 받는 노드의 새 CATCH_*·부모 CATCH_* 유지, always 의 끝내는 IF 갈래·끝내는 처리 갈래·돌아오는 처리 갈래·손주 겉모양, 손주 세트·손주 룰 교체와 폐기·되살리기의 준비 캐시 무효화.
- 절차 메모: `e2b8455b` 커밋 명령에 셸 변수를 썼다(규칙 위반, 이력은 고치지 않음). 각 커밋이 혼자 컴파일되는지는 파일 내용으로 판단했고 따로 빌드하지 않았다(마지막 커밋에서 전체 시험).

## eng:c. cactus 저장 검증 미리 받기 — 하위 세트 재귀(깊이 5, U3)
- 실행 수단: D4 Workflow(구현 sonnet/high → 리뷰 opus/high, 지적 없음)
- 커밋: `df613e4a`(`MdmExprRefs.setIds`·`MdmValidator.prefetchSubsets`·`MdmValidatorSubsetTest`)
- 시험 결과: cactus-core 868 통과·1 건너뜀·실패 0(기준 861 대비 +7)
- 결정:
  - 단계마다 아직 안 받은 하위 세트 ID 를 한 번 묶어 `lookupAt(RULE_SET, ids, ts)` 하고 `SetShape.MAX_CALL_DEPTH`(5) 단계까지만 되풀이한다(최상위 + 5 단계 = 세트 6개, 엔진 `chain.size() > 5` 거부와 같은 경계).
  - 순환 방지는 최상위 세트마다 `seen` 집합, 같은 ID 는 전역으로 한 번만 받고 부른 최상위마다 룰·flowCodes·flowMasterAt 를 각자 더한다.
  - 하위 세트 unavailable → 부른 최상위 항목만 skip, 그 가지는 더 따라가지 않는다. missing·적용 버전 없음 → 빼지 않는다(엔진 `SET_NOT_FOUND` 행 오류).
  - `MdmExprRefs.setIds` 는 `kind == SET` 이고 `setId` 가 비지 않은 것만, 첫 등장 순서·중복 없이.
- 계획 조정: 「하위 세트의 룰 unavailable」 사례를 하위 룰 unavailable·하위 세트 unavailable 두 시험으로 나눴다(캐시가 첫 호출을 기억). 미리 받기 확장은 새 private 메서드 `prefetchSubsets` 로 뽑았다. 깊이 상한은 엔진 공개 상수를 쓴다.

## 결정
- eng:2 이름(조정 eng-2 알림): `SetStep(nodeId, setId)`·`FlowTree.setSteps()`·`FlowTree.setIds()` 를 만든다. `callSteps()` 는 만들지 않는다(srv:5 가 분석기 안에서 steps 를 거른다). 이름을 바꾸면 진행 보고에 적는다.
- eng:2 추가 요구(조정 eng-2, srv:5 용): `FlowTree.relation(a, b)` 가 SET 노드 ID 를 받는다(지금은 RULE·TASK·IF·PARALLEL 밖이면 IllegalArgumentException). `FlowParser.catchable` 에 SET.
- 프론트 의존성: 워크트리 `src/frontend` 에 `node_modules` 가 없었다(메인 심링크 아님). 워크트리 안에서 `pnpm install` 한다.
