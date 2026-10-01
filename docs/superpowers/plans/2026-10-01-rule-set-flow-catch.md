# 룰 세트 흐름도 — 예외 받는 노드(CATCH) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 룰 노드에 붙는 받는 노드(`CATCH`)를 더한다. 룰이 실패하거나 결과가 없을 때 그 종류를 받는 노드가 있으면 처리 갈래를 실행하고, 처리 갈래는 끝(END)으로 가서 세트를 끝내거나 원래 흐름(MERGE)으로 돌아온다. 엔진·계약·서버 검사·화면 편집기·디버거를 함께 바꾼다.

**Architecture:** 엔진 계약(Task 1)을 넓히고 흐름 구조 해석에 `Guarded` 블록을 더한 뒤(Task 2), 실행(Task 3)·정적 검사(Task 4)·화면 편집 연산(Task 6)·배치(Task 7)를 병렬로 진행한다. 받는 노드는 선이 아니라 `attachTo` 로 룰에 붙고, 처리 갈래는 IF 갈래처럼 블록 트리의 한 칸이 된다(돌아오는 MERGE 의 `splitId` = 그 룰 노드 ID). Java(`flow`·`rule`·`RuleSetAnalyzer`)와 TS(`flow-model.ts`·`set-model.ts`)는 같은 알고리즘·같은 문구를 갖고, 한 벌 코퍼스 `rule-set-corpus.json` 이 두 구현을 묶는다. 화면은 지금 구조(순수 함수 `flow-edit.ts`·`flow-layout.ts`, 캔버스 안 저장소, 단축키 디스패처 하나)를 그대로 따른다.

**Tech Stack:** Java 21, Spring Boot + OASIS(BPMN), SQLite, JUnit 5, ArchUnit, TypeScript + React 19 + Mantine 9(`@dk-oasis/shared` 래퍼), `@xyflow/react` 12, `@dagrejs/dagre`, `@tabler/icons-react` 3.46, Vitest(happy-dom), json-schema-to-typescript(`gen:contract`).

**Spec:** `docs/superpowers/specs/2026-10-01-rule-set-flow-catch-design.md`(정본, 결정 X-D1~X-D12 는 바꾸지 않는다). 앞 스펙 `2026-09-29-rule-set-flow-design.md`(흐름 모델 §3·실행 의미 §4·검사 §5)·`2026-10-01-rule-set-flow-phase4-design.md`(TASK·E4 값 고치기). 뒤 스펙 `2026-10-01-rule-set-flow-subset-call-design.md` 가 이 계획의 `Produces` 이름을 넓혀 쓴다(Task 1·2·3 의 Interfaces 참고).

**작업 위치:** 워크트리 `.claude/worktrees/rule-set-flow-catch`, 브랜치 `feat/rule-set-flow-catch`(dev 에서 분기, 이 계획 커밋 포함). 태스크마다 하위 워크트리 `.claude/worktrees/rsfc-tN`(브랜치 `rsfc-tN`, 그때의 feat 끝에서 분기)에서 구현하고, 리뷰 통과 뒤 feat 에 `--no-ff` 로 병합한다. 모든 명령은 해당 워크트리 루트 기준이다.

**병렬 순서:** 동시에 도는 구현 에이전트는 셋까지. 경로 접두어 `src/frontend/m-mdm/pages/dme/ruleSetEdit/` 는 표에서 `rse/` 로 줄인다.

| 태스크 | 권장 모델 | 먼저 병합돼야 할 태스크 | 고치는 곳(요약) | 함께 못 도는 태스크 |
|---|---|---|---|---|
| 1 계약 네 벌·호출부·TS 자리 채움 | sonnet | — | 엔진 spi·expr·rule 계약 타입, 스키마, 생성 TS, `RunTraceJson`, `RuleSetRunner`(생성자 인자만), `rse/` Record 4곳 | 전부(첫 물결 단독) |
| 2 흐름 구조 해석(`Guarded`)·FLOW_JSON 코덱·구조 코퍼스 | opus | 1 | 엔진 `flow/*`·`rule/FlowRun`·`rule/FlowKeys`(SEAM(T3) 한 줄씩), lib `RuleSetFlowJson`·`RuleSetCheck`, `rse/flow-model.ts`·`rse/types.ts`, `rse/trace-view.ts`·`rse/flow-layout.ts`(블록 걷기만), `rse/set-model.ts`(SEAM(T4)), 코퍼스 | 3·4·6·7 |
| 3 엔진 실행 | opus | 2 | 엔진 `rule/FlowRun`·`FlowKeys`·`MdmRuleEngine`·`RecordKeys` | 5 |
| 4 정적 검사·`hasDefault`·검사 코퍼스 | opus | 2 | lib `RuleSetAnalyzer`·`RuleSetPathState`·`RuleSetCheck`·`RuleIo`·`RuleIoReader`, `rse/set-model.ts`·`rse/types.ts`, 코퍼스·두 러너 | 2 |
| 5 서버 `execute` DTO | sonnet | 3 | lib `RuleSetRunner`·`dto/RuleSetRunResult`, api 시험 | 3 |
| 6 화면 편집 연산 | opus | 2 | `rse/flow-edit.ts` | 2 |
| 7 화면 자동 배치·받는 노드 자리 | opus | 2 | `rse/flow-layout.ts` | 2 |
| 8 캔버스(받는 노드 그리기·연결점·메뉴·지우기) | sonnet | 6, 7 | `rse/canvas/nodes.tsx`·`FlowCanvas.tsx`·`context-menu.ts`·`menus/edit-menu.ts`, `rse/state/useEditActions.ts`·`useRuleSetEdit.ts`, `rse/page.tsx`, `rse/panels/PanelHeader.tsx`, `rse/catch-text.ts`(새), `rse/styles/catch.ts`(새), `rse/rsf-styles.ts` | 9(`PanelHeader.tsx`)·10(`nodes.tsx`·`styles/catch.ts`) |
| 9 속성 패널·변수 칩 | sonnet | 4, 6, 8 | `rse/panels/PropertyPanel.tsx`·`PanelHeader.tsx`, `rse/flow-vars.ts`, `rse/styles/props.ts` | — (10 과 함께 돌 수 있다) |
| 10 디버거 | opus | 3, 8 | `rse/trace-view.ts`, `rse/canvas/overlay.ts`·`nodes.tsx`, `rse/debugger/debug-model.ts`·`DebugToolbar.tsx`·`TraceDetail.tsx`, `rse/styles/catch.ts` | — (9 와 함께 돌 수 있다) |
| 11 e2e 시나리오(목록 확인까지) | sonnet | 8, 9, 10 | `src/frontend/e2e/mdm-ruleSetEdit.spec.ts`, `src/frontend/e2e/fixtures/mdm-ruleSet-data.sql` | — |
| 12 문서·결정 D-134·계약 문서·기능설계서 | haiku | 1~11 | `docs/mdm/decisions.md`, `docs/mdm/engine-contract.md`, `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md` | — |

첫 물결은 1 단독. 그다음 2 단독(코퍼스·`flow-model.ts`·`Guarded` 가 3·4·6·7 의 바탕이다). 2 가 병합되면 3·4·6 을 열고, 자리가 나면 7 → 5 → 8 → (9 ∥ 10) → 11 → 12 순으로 앞 조건이 모두 병합된 것을 연다. 서버 분석기(4)와 화면 모델(2·4 의 `flow-model.ts`·`set-model.ts`)은 코퍼스를 함께 고치는 관계라 같은 태스크 안에서 Java·TS 를 함께 바꾼다. 같은 파일(`page.tsx`·`nodes.tsx`·`FlowCanvas.tsx`·`set-model.ts`·코퍼스)을 고치는 태스크가 겹쳐 병합 충돌이 나면 나중에 병합하는 쪽에서 컨트롤러가 푼다.

---

## 스펙 대비 편차(코드로 확인한 근거)

| # | 스펙 | 코드 사실(근거) | 이 계획의 처리 |
|---|---|---|---|
| F1 | §2 예시의 노드 종류 키가 `"type"` | FLOW_JSON 코덱은 `kind` 를 읽고 쓴다(`src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJson.java:169` `required(n, "kind", where)`, `:53` `o.put("kind", …)`), 코퍼스도 `"kind"` 다 | 저장 키는 `kind`. 받는 노드는 `{"id","kind":"CATCH","ruleId":null,"splitId":null,"label","attachTo","catches"}` 모양이다 |
| F2 | §2 "기존 생성자는 두 칸을 null 로 위임해 호출부를 깨지 않는다" | 엔진 계약 record 는 위임 생성자를 둘 수 없다(`src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch/ContractTypeShapeTest.java:157-176` `계약_record_생성자는_Record_생성자만_부른다` — 영구 규칙) | `FlowNode` 를 7칸으로 넓히고 호출부 15곳(FlowParser 3, FlowParserTest 4, FlowFixtures 7, RuleSetFlowJson 1)에 `, null, null` 을 더한다(Task 1) |
| F3 | §5 `SET_ORDER`·`SET_DUP_RESULT` | 검사 코드 이름은 `ORDER`·`DUP_RESULT` 다(`RuleSetCheck.java:24·27`, `set-model.ts:285·314`). 처리 갈래 밖에서 룰이 `CATCH_*` 를 읽으면 지금 코드는 `UNKNOWN_INPUT`(NONE) 이거나 아무 검사도 없다(PROG, `RuleSetAnalyzer.java:332-335`) | 룰 조건은 `ORDER`(REJECT, otherRuleId null)를 명시 검사로 낸다(Ruling R13). 조건식은 기존 `FLOW_COND` 경로가 그대로 잡는다 |
| F4 | §6 `CatchKind`(새 enum) — 엔진 한 곳 | `spi` 는 다른 엔진 패키지를 못 보고 `flow` 는 `spi` 만 본다(`EnginePackageDependencyTest.java:23-41`). 구조 검사(`FLOW_CATCH` 모르는 키)는 `flow` 의 `FlowParser` 가 한다 | `FlowNode.catches` 는 `List<String>`. `CatchKind` 는 `kr.dongkuk.maru.mdm.engine.flow` 에 두고 코드 → 종류 표를 **코드 이름 문자열**로 갖는다. `rule` 패키지 시험이 문자열마다 `EngineEvaluationException.Code` 가 있는지 본다(Task 1) |
| F5 | §6 계약 칸 추가 | 기존 골든(`rule-set-trace-golden.json`, HTTP 골든)·정규 FLOW_JSON 글자를 바꾸지 않아야 한다. 같은 방식이 이미 있다(`RunTraceJson.java:49-51` `edits` 는 null 이면 키를 뺀다) | 새 칸은 스키마에서 required 밖 선택 칸이고 JSON 에서 null 이면 키를 뺀다: `RunTrace.endedBy`, `NodeTrace.catchKind·code·message`. `FlowNode.attachTo·catches` 는 CATCH 노드만 쓴다(정규 JSON 도 CATCH 노드에만 싣는다) |
| F6 | §4 "처리 갈래가 읽는 값: 그 RULE 직전의 ctx" | 룰 평가는 ctx 를 제자리에서 바꾼다 — 입력을 선언 타입으로 바꿔 넣는다(`RuleEvaluator.java:139-150` `convertInto`) | 받는 노드로 넘길 때 룰 직전 ctx 사본으로 되돌린다(Task 3) |
| F7 | §5 `FLOW_STRUCTURE` "END 로 들어오는 비처리 선이 1개가 아님" | 2단계 트리 만들기에서 비처리 경로가 END 로 가면 이미 `갈래가 {합류}에서 닫히지 않고 end로 나간다` 또는 `{노드}에 도달할 수 없다` 로 멈춘다(`FlowParser.java:199-208·191-195`). 따로 낼 자리가 없다 | 1단계 차수 규칙만 바꾼다 — 받는 노드가 있으면 END 들어오는 선은 "1개 이상", 없으면 지금처럼 "1개". 비처리 선 문제는 위 두 문구로 나오고 코퍼스 사례가 그 문구를 고정한다(Task 2) |
| F8 | §5 `hasDefault` 를 서버 `RuleIo`·화면 타입·코퍼스에 더함 | `new RuleIo(` 18곳(lib 3+4+1, api 2+8), TS `RuleIo` 리터럴 109곳. 두 코퍼스 러너는 지금 `hitPolicy` 를 읽지 않고 null 로 둔다(`RuleSetCorpusTest.java:132-133`, `rule-set-corpus.test.ts:119`) | Java `RuleIo` 끝에 `boolean hasDefault` + 9칸 위임 생성자(엔진 계약 타입이 아니라 허용), TS 는 `hasDefault?: boolean`. 두 러너가 `hitPolicy`·`hasDefault` 를 읽게 한다(Task 4) |
| F9 | §6 `RunTrace` 에 `caught` 없음 | 스펙 표대로 `RunTrace` 에는 `endedBy` 만 더한다 | 디버거의 "caught 건수·목록"은 기록의 CATCH 노드(`catchKind` 가 있는 NodeTrace)에서 만든다(Task 10) |

## Rulings(스펙이 정하지 않은 세부 — 이 계획이 정했다)

- **R1 CATCH 노드 기록:** `NodeTrace(kind=CATCH, status=OK, ruleId=실패한 룰 ID, ver=null, catchKind, code, message)`. 화면이 `CATCH_RULE` 을 기록만으로 알 수 있게 `ruleId` 를 채운다.
- **R2 CAUGHT 룰 기록:** `status=CAUGHT`, `ruleId`·`ver`·`reads` 는 지금처럼, `result` 는 null(결과는 OK 인 RULE 에만 — 스키마 설명 그대로), `violations` 는 받은 위반 전부(결과 없음이면 빈 목록). `steps` 에 넣지 않고 `PathStep.stepIndex=null`.
- **R3 실행 순서:** CATCH 노드는 `begin → edit(E4 고친 값) → CATCH_* 넣기 → 처리 갈래 입력 키 검사 → path·기록`. 돌아오는 MERGE 는 `CATCH_* 를 룰 직전 값으로 되돌림 → begin → edit → 기록`. END 는 `CATCH_* 지움 → begin → edit → 기록`. 화면 `trace-view.ts` 도 같은 순서로 푼다(Task 10).
- **R4 중첩:** 처리 갈래 안의 룰에 붙은 받는 노드가 돌아오면, 그 MERGE 는 `CATCH_*` 를 지우지 않고 **안쪽 룰 직전 값**(바깥 처리 갈래의 값)으로 되돌린다. 맨 바깥이면 직전 값이 없으므로 지워진다.
- **R5 끝냄:** 처리 갈래가 END 에 닿으면 `FlowRun.Ended`(위반이 아닌 제어 신호)를 던지고 `run()` 이 받아 END 노드를 기록한다. 정상 완료로 보므로 `unusedEdits` 검사를 그대로 한다. 병렬 갈래는 신호를 받아 끝난 형제 + 지금 갈래의 `made` 를 합류 규칙대로 합친 뒤 다시 던진다.
- **R6 입력 키 검사:** 정상 갈래·처리 갈래 본문은 IF 갈래처럼 세트 시작 때 보지 않고 들어갈 때 본다(`FlowKeys.check(body, ctx.keySet())`). 정상 갈래는 룰이 성공한 뒤, 처리 갈래는 `CATCH_*` 를 넣은 뒤 본다. 실패하면 각각 룰·CATCH 노드가 ERROR 다.
- **R7 성공한 받는 룰:** 결과가 있으면 받는 노드 없는 RULE 과 같은 기록·경로·`steps` 를 낸다. 결과 없음인데 `NO_RESULT` 받는 노드가 없으면 지금처럼 NULL 결과로 진행한다(X-D3).
- **R8 노드 관계:** `FlowTree` 의 위치 사슬에 (받는 룰 ID, 0=정상 갈래 / k+1=k번째 처리 갈래) 를 넣는다. 관계는 사슬에서 갈래 번호가 처음 갈린 분기가 PARALLEL 이면 PARALLEL, 그 밖(IF·받는 룰)이면 EXCLUSIVE 다. `splitKinds` 에는 넣지 않아 `branched()` 는 지금 그대로다. CATCH 노드 자신은 위치가 없다(`relation` 대상 아님).
- **R9 펼친 룰 순서(`RULE_IDS`):** 받는 룰 → 정상 갈래 → 처리 갈래(받는 노드의 노드 배열 순서) → 그 뒤 흐름.
- **R10 1단계 오류 순서:** 지금의 a·b·c·d·e·f1(노드별)·f2~g5(분기별) 뒤에 h(받는 노드, 노드 배열 순서), 그다음 받는 룰별 종류 중복·돌아오는 합류 수를 더한다. 문구는 Task 2 의 표가 정본이다.
- **R11 정규 JSON:** CATCH 노드만 `label` 뒤에 `attachTo`·`catches` 를 쓴다(서버 `canonical`·화면 `flowJsonOf` 같은 키 순서). `catches` 는 받은 순서 그대로 쓰고, 화면 편집 연산이 늘 `NO_RESULT`·`INPUT_ERROR`·`EVAL_ERROR`·`HIT_CONFLICT` 순으로 정렬해 넣는다.
- **R12 `CATCH_NEVER` 문구·위치:** 받는 룰의 룰 검사 바로 뒤, 처리 갈래 순서·종류 저장 순서대로. `{ruleId}에 기본 행이 있어 {catchId}가 받는 결과 없음이 일어나지 않는다`, `{ruleId}의 적중 정책 {hitPolicy|-}에서는 {catchId}가 받는 판정 충돌이 일어나지 않는다`. WARN, `nodeId` = 받는 노드. 룰이 있고 RELEASED 가 있을 때만.
- **R13 처리 갈래 밖 `CATCH_*`:** 룰 조건이 읽으면 `ORDER`(REJECT, ruleId=그 룰, otherRuleId=null, varName=이름) `{ruleId}가 읽는 {name}는 받는 노드의 처리 갈래 안에서만 있다`. 경로 상태는 `CATCH_KIND`·`CATCH_RULE`·`CATCH_CODE`·`CATCH_MSG` 대문자 이름으로 센다.
- **R14 편집기:** 연결점·우클릭으로 만든 받는 노드는 그 룰에서 아직 아무도 받지 않는 첫 종류를 받고 `label=null` 이다. 우클릭 「예외 받기 추가」는 끝(END)으로 가는 처리 갈래를 만든다. 받는 노드가 든 분기 블록 복사는 거부한다(`받는 노드가 든 블록은 복사하지 않는다`). 받는 노드 위치는 저장하지 않는다(`setPositions`·`pinDrawn`·`shiftSpace` 가 건너뛴다).
- **R15 받는 노드 자리:** 크기 28×28, 룰 아래 테두리 가운데 높이에 걸치고 왼쪽부터 `x = 룰.x + 16 + k × 36`, `y = 룰.y + 룰.h − 14`(k = 그 룰의 받는 노드 순번, 노드 배열 순서).
- **R16 디버거 표시:** 겹침 상태 `caught`(주황 점선 테두리), 칩 = 바로 뒤 CATCH 기록의 종류 이름. 툴바 상태 끝 문구는 `endedBy` 가 있으면 `예외로 끝남: {받는 노드 label, 없으면 ID}`, 받은 예외가 있으면 `받은 예외 {n}건` 단추가 목록을 연다.
- **R17 중단점:** CATCH 노드는 중단점 대상(`BREAKABLE`)에 넣지 않는다(스펙 밖). 한 단계 실행은 기록 노드마다 멈추므로 CATCH 에서도 멈춘다.
- **R18 문구 재사용:** 받는 룰 합류 뒤 일부 갈래에서만 만든 변수를 읽으면 기존 `FLOW_PARTIAL` 문구(`… IF 의 일부 갈래에서만 만들어진다 …`)를, 정상 갈래 룰과 처리 갈래 룰 사이 읽기는 관계가 EXCLUSIVE 라 기존 `IF_SIBLING`(룰 확정 검사는 `SET_IF_SIBLING`) 문구를 그대로 쓴다. 스펙이 문구를 정하지 않았고, 기존 코퍼스·퍼즈 54+200 사례의 글자를 바꾸지 않기 위해서다(새 문구가 필요하면 별도 결정으로 바꾼다).
- **R19 구성 지침:** 받는 노드가 있는 흐름에는 구성 지침(한 줄 순서 제안) 적용을 막는다. 적용은 흐름을 `linearFlow(order)` 로 통째로 바꾸므로(`state/useRuleSetEdit.ts:342-348`) 받는 노드·처리 갈래를 잃는다. 분기·빈 단계와 같은 방식이다(Task 8).

## Global Constraints

- 공개 엔진 계약(`engine-contract.schema.json`·Java 계약 타입·`engine-contract.generated.ts`·`RunTraceJson`)의 **모양**은 Task 1 만 바꾼다. 다른 태스크가 계약 파일을 고쳐야 하면 BLOCKED 로 보고한다(Task 3 의 `FlowRun`·`MdmRuleEngine` 동작 변경은 계약 모양이 아니다).
- 저장 형식: FLOW_JSON 의 노드 종류에 `CATCH` 가 더해지고 CATCH 노드만 `attachTo`·`catches` 를 갖는다. `version` 은 1 그대로다(X-D7). view 는 바꾸지 않는다 — 받는 노드 위치는 저장하지 않는다(R14).
- 받는 노드가 없는 세트의 동작·기록·정규 JSON 글자는 한 글자도 바뀌지 않는다(X-D3). 기존 골든(`rule-set-trace-golden.json`·HTTP 골든)·기존 코퍼스 54사례·퍼즈 200사례의 기대값은 고치지 않는다 — 고치게 되면 구현이 틀린 것이다.
- 받지 않는 코드(`RULE_NOT_FOUND`·`SET_NOT_FOUND`·`SET_DEPRECATED`·`FLOW_INVALID`·`CONSTANT_KEY`·`RESERVED_KEY`·`EVAL_TS_KEY`·`BRANCH_EVAL_ERROR`·`EDIT_POINT_MISMATCH`)는 받는 노드가 있어도 세트를 중단한다(X-D2).
- 새 action 동사를 만들지 않는다(ADR-0003 D5). `ruleSetEdit` 는 search·view·save·delete·restore·validate·execute 그대로다.
- DB 검증은 SQLite 만 한다. 도커를 쓰지 않는다. 구현 태스크는 서버(bootRun·local-run·fe-run)를 띄우지 않는다. e2e(`mdm-ruleSetEdit.spec`)는 `--list` 까지만 돌리고 실제 실행은 **사용자 승인 뒤**다. 브라우저 확인은 계획 끝 「수동 브라우저 확인」에서 컨트롤러만 한다(ego-browser).
- 화면 태스크(6~11)는 RULE.md 무조건 적용 스킬 **`mantine-aggrid-ui`** 를 따른다: `.claude/skills/mantine-aggrid-ui/SKILL.md` 를 끝까지 읽고, 화면 모듈은 `@mantine/*` 를 import 하지 않고 `@dk-oasis/shared/*` 만 쓴다(shared 래퍼 추가는 사용자 승인 사항이라 하지 않는다). 바꾼 `.ts`·`.tsx` 파일은 커밋 전 audit 두 개가 **0건**이어야 한다: `python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit <파일…>`, `python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit <파일…>`.
- 화면 규칙 정본 `docs/guide/FrontEnd/Local-Rules.md`: §8 한 변 색 바 금지, §16 무거운 계산 의존성(끄는 동안 page·dagre 를 다시 돌리지 않는다), §17 로컬 `.css` import 금지(새 CSS 는 `styles/*.ts` TS 문자열 상수 + `rsf-styles.ts`), §19 React Flow 캔버스 함정(memo 의존성을 더하면 그 prop 하나만 바꾼 시험, 누름을 받는 표시에 `nodrag nopan`). 색은 의미 토큰(`var(--color-*)`)만 쓴다.
- 단축키는 `canvas/shortcuts.ts` 디스패처 하나뿐이다. 편집 한 번 = `page.tsx` 의 `edit(f => …)` 한 번 = 되돌리기 한 칸.
- 컴포넌트 시험은 `src/frontend/m-mdm/tests/**/*.test.ts` 에 `createElement` 로 쓴다(vitest include 가 `.ts` 만 본다). 렌더 시험은 파일 첫 줄 `/** @vitest-environment happy-dom */`.
- `docs/mdm/decisions.md` 는 append-only 이고 **Task 12 만** 쓴다. `docs/mdm/engine-contract.md`·기능설계서도 Task 12 만 쓴다.
- git: 워크트리 루트에서 `/usr/bin/git` 단순 한 줄 명령만(cd 결합·파이프 금지). 자기가 만든·고친 파일만 경로로 지정해 `/usr/bin/git add <paths>` 뒤 `/usr/bin/git commit -m "..." -- <paths>`. `add -A`·`add .`·`stash`·`reset --hard`·브랜치 전환 금지. 메시지는 `type(scope): 한국어 요약` + 빈 줄 + 트레일러 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- 테스트 명령(워크트리 루트 기준):
  - 공통 환경: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home PATH=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin:$PATH`
  - 엔진: `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)` / 한 클래스 `--tests '*이름'`
  - mdm/lib: `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)` / 한 클래스 `(cd src/backend/mdm && ../gradlew :lib:test --tests '*이름' --console=plain)`
  - mdm/api: `(cd src/backend/mdm && ../gradlew :api:test --tests '<패턴>' --console=plain)`
  - 화면 준비(워크트리 첫 회): `pnpm --dir src/frontend install --frozen-lockfile=false` 뒤 `pnpm --dir src/frontend --filter @dk-oasis/shared build`.
  - 화면 시험: `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit` / 파일 하나 `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm exec vitest run <m-mdm 기준 경로>`. 완료 게이트: `cd src/frontend/m-mdm && rtk proxy pnpm run test` 의 `[m-mdm test 합계]` 줄.
  - 타입 검사: `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint`(tsc --noEmit, 오류 0. `rtk proxy` 를 붙이지 않으면 rtk 가 eslint 로 바꿔 실패한다).
  - 계약 생성: `pnpm --dir src/frontend --filter @dk-oasis/m-mdm gen:contract`(스크립트 `src/frontend/m-mdm/scripts/gen-engine-contract.mjs`, json-schema-to-typescript 로 엔진 resources 스키마 정본에서 `src/contract/engine-contract.generated.ts` 를 만든다. 생성 파일은 손으로 고치지 않는다).
  - `.css` import 없음: `grep -rnE "import ['\"]\.{1,2}/[^'\"]*\.css['\"]" src/frontend/m-mdm/pages/dme/ruleSetEdit` 0건.
  - e2e 목록(실행 금지): `pnpm --dir src/frontend exec playwright test --list e2e/mdm-ruleSetEdit.spec.ts`.
  - `pnpm build`(모든 `--filter … build` 포함)는 본체 checkout 에서 local-run·fe-run 이 떠 있을 때 돌리지 않는다.
- 기준선: 착수 때 컨트롤러가 엔진·lib·api(룰 세트 관련 4클래스)·화면 테스트 수를 한 번 돌려 진행 장부에 적는다. 각 태스크 완료 보고는 그 기준선 대비 증감을 적는다.

## Review Focus

1. **받는 노드 없는 기존 세트가 그대로인가** — 결과 없는 룰은 NULL 결과로 다음 노드로 가고, 실패는 세트 중단이며, 기록 JSON·정규 FLOW_JSON·기존 코퍼스·퍼즈 기대가 한 글자도 바뀌지 않는다. 담당: Task 1(골든 무변경 단계), Task 3(`받는_노드_없으면_결과_없음은_NULL_로_진행한다`·`받는_노드_없으면_실패는_세트를_멈춘다`), Task 2·4(기존 코퍼스·퍼즈 그대로 통과).
2. **처리 갈래가 읽는 ctx 가 "룰 직전 ctx" 인가** — 실패한 룰이 바꿔 넣은 입력 타입(문자열 "5" → 숫자)이 처리 갈래로 새지 않고, `CATCH_*` 는 MERGE·END 뒤와 `finalValues` 에 없으며, 중첩 처리 갈래는 안쪽 MERGE 뒤 바깥 값을 되찾는다. 담당: Task 3(`처리_갈래는_룰_직전_ctx_를_읽는다`·`중첩_처리_갈래는_안쪽_합류_뒤_바깥_CATCH_값을_되찾는다`), Task 10(`frames` 같은 사례).
3. **병렬 갈래 안에서 끝낼 때** — 남은 형제 갈래는 실행하지 않고, `finalValues` 는 분기 전 결과 + 끝난 형제 + 지금 갈래 결과이며, `evaluateSet` 의 `path` 와 `traceSet` 의 노드 순서가 같다. 담당: Task 3(`병렬_갈래_안에서_끝내면_남은_형제는_돌지_않고_finalValues_는_끝난_형제와_지금_갈래다`).
4. **Java 와 TS 의 구조·검사가 같은가** — 끝내는 처리 갈래를 뺀 교집합, 처리 갈래 밖 `CATCH_*` 읽기, `CATCH_NEVER`, 펼친 룰 순서(정상 갈래 먼저), `FLOW_CATCH` 문구·순서. 담당: Task 2(구조 코퍼스 5사례)·Task 4(검사 코퍼스 5사례, 두 러너 하한 64).
5. **편집 연산이 받는 노드를 잃거나 남기지 않는가** — `clone`·`flowJsonOf` 가 `attachTo`·`catches` 를 지키고 서버 정규 JSON 과 같은 글자를 내며, 룰을 지우면 붙은 받는 노드와 그 나가는 선이 함께 지워지고, 받는 룰이 든 IF 블록 지우기·접기에 처리 갈래가 함께 들어가며, 받는 노드 위치는 저장되지 않는다. 담당: Task 6.

## 태스크 사이 조건(해당 태스크 구현자는 반드시 지킨다)

- **줄 번호 기준:** 이 계획의 줄 번호·코드 발췌는 커밋된 dev `5e6b5459` 기준이다(`2e02d29d` 뒤 두 커밋은 portal-shell·ruleSetMng 만 바꿔 이 계획이 인용한 파일과 겹치지 않는다). 계획을 쓰는 동안 본체 checkout 에 다른 작업의 미커밋 변경이 있었다 — 자동 배치 캐시(`flow-layout.ts` `autoLayout` 의 `layoutKey`·`layoutCache`), `RuleIoReader`·`RuleSetRunner`·`StoredDefinitionLookup` 조회 묶기, `FlowCanvas.tsx`·`useRuleSetEdit.ts` 일부. 그 작업이 이 계획보다 먼저 dev 에 들어오면 각 태스크는 줄 번호를 다시 찾고(`grep -n`), 특히 **Task 7 은 `layoutKey` 의 노드 칸에 `attachTo`·`catches` 를 더한다** — 빠지면 받는 노드를 다른 룰로 옮겨 붙여도 캐시된 옛 배치가 나온다. Task 4 의 `RuleIoReader.compute` 변경은 그때의 행 읽기 자리에 `hasDefault` 를 얹는다(행을 한 번만 읽는다는 뜻은 같다).
- Task 1 은 `CatchKind`·`Guarded` 가 없어도 컴파일되게 TS 쪽 `Record<FlowNodeKind, …>` 네 곳(`flow-model.ts` 차수표 둘, `flow-layout.ts` `NODE_SIZE`, `PropertyPanel.tsx`·`TraceDetail.tsx` `KIND_TEXT`)에 `CATCH` 값을 넣는다. 차수표 값(in 0·out 1)과 `NODE_SIZE.CATCH`(28×28)는 최종 값이다. 문구 자리에는 `// SEAM(T9)` 를 단다.
- Task 2 는 `set-model.ts` 의 걷기에 `GUARDED` 갈래를 넣되 받는 룰을 보통 룰처럼만 보고 처리 갈래는 건너뛰는 임시 처리를 하고 `// SEAM(T4)` 를 단다. Task 4 가 `grep -rn "SEAM(T4)"` 로 모두 바꾼다. 같은 이유로 `RuleSetAnalyzer.PathWalk.seq`·`RuleSetPathState.Walk.seq` 는 Task 2 에서 건드리지 않는다(`instanceof` 사슬이라 `Guarded` 를 조용히 건너뛴다 — Task 2 는 받는 노드가 있는 **올바른** 흐름을 코퍼스에 넣지 않는다).
- Task 2 가 `flow-layout.ts` 의 `bodyIds`·`orderBranches` 에 넣는 `GUARDED` 처리는 "블록 몸 ID 모으기"까지다. 처리 갈래를 오른쪽에 두는 배치는 Task 7 이 한다.
- Task 3 과 Task 4 는 같은 파일을 고치지 않는다(Task 3 = 엔진 `rule` 패키지, Task 4 = mdm/lib 분석기·화면 `set-model.ts`·코퍼스). 둘 다 Task 2 의 `Guarded`·`CatchKind` 이름만 쓴다.
- 코퍼스 `rule-set-corpus.json` 은 Task 2(구조 오류 5사례, 하한 59)와 Task 4(올바른 흐름 검사 5사례, 하한 64)만 고친다. 사례를 더할 때 Java `RuleSetCorpusTest.MIN_CASES` 와 TS `rule-set-corpus.test.ts` `MIN_CASES` 를 같은 값으로 올린다.
- Task 6 은 `flow-edit.ts` 만, Task 7 은 `flow-layout.ts` 만 고친다(둘 다 Task 2 위에서 병렬). Task 8 이 둘을 캔버스에 잇는다.
- Task 8·9·10 은 `page.tsx`·`nodes.tsx` 를 차례로 이어 고친다. `FlowCanvas.tsx` 머리 주석에 각자 문단을 더하고 나중에 병합하는 쪽이 모든 문단을 남긴다.
- 기능설계서(`docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`)는 Task 12 만 쓴다. 화면 태스크(6~11)는 완료 보고에 바꾼 동작·testid 를 적고 Task 12 가 옮긴다.

---

### Task 1: 계약 네 벌 — `CATCH`·`attachTo`·`catches`·`CatchKind`·`CaughtException`·`endedBy`·`CAUGHT`·`CATCH_*`

**권장 모델:** sonnet — 네 벌(Java·스키마·생성 TS·`RunTraceJson`)과 record 호출부를 같은 이름으로 맞추는 기계적 다파일 작업이다. 실행 의미는 Task 3, 구조 해석은 Task 2 가 맡는다.
**병렬:** 단독(첫 물결). 이 태스크가 병합돼야 나머지가 시작한다.

**이 태스크가 정한 것(Task 1 과 Task 2·3 의 경계):**
- Java `NodeKind` 분기는 모두 `default` 가 있어(`FlowParser.java:256-270` `inRule`·`outRule`) `CATCH` 를 더해도 컴파일 오류가 없다. 이 태스크 뒤 Task 2 전까지 Java `FlowParser` 는 CATCH 노드를 "들어오는 선 1개여야 한다"로 거부하지만, 그 사이에 CATCH 를 만드는 코드·사례가 없으므로 시험은 모두 초록이다.
- `CatchKind` 는 `flow` 패키지의 enum 이다(편차 F4). 이 태스크는 종류·코드 표·`parse`·`ofCode` 까지 만들고, 쓰는 곳(`FlowParser`·`FlowRun`)은 Task 2·3 이 만든다.
- 새 JSON 칸은 null 이면 키를 뺀다(편차 F5). 그래서 골든 파일은 다시 쓰지 않는다 — 이 태스크의 Step 8 이 그것을 확인한다.

**Files:**
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/DefinitionLookup.java:158-171`(`FlowNode` 7칸, `NodeKind.CATCH`)
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/CatchKind.java`
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/ReservedNames.java:24`(`CATCH_*` 상수)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RunTrace.java`(전체 — `endedBy`, `NodeTrace` 세 칸, `NodeStatus.CAUGHT`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetResult.java`(전체 — `caught`·`endedBy`·`CaughtException`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java:95,165,209,260,272,302`(`new NodeTrace(` 여섯 곳 끝에 `, null, null, null`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java:79,100,107,112`(생성자 인자)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowParser.java:33,37,41`(`new FlowNode(` 끝에 `, null, null`)
- Modify: `src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json`(340-352 `RuleSetResult`, 366-379 `RunTrace`, 381-401 `NodeTrace`, 425 `NodeStatus`, 438-449 `FlowNode`, 466 `FlowNodeKind`, 새 `CatchKind`·`CaughtException`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJson.java:176`(`new FlowNode(` 끝에 `, null, null` — 읽기는 Task 2)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java:112-113`(`RunTrace` 끝 인자 `, null`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RunTraceJson.java:21-27,37-53,63-82`(`endedBy`·NodeTrace 세 칸, null 이면 키 생략)
- Modify(생성): `src/frontend/m-mdm/src/contract/engine-contract.generated.ts`(`gen:contract` 로만)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts:70-71`(차수표 `CATCH`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts:14-22`(`NODE_SIZE.CATCH`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx:67-75`(`KIND_TEXT.CATCH`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx:22-30`(`KIND_TEXT.CATCH`)
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch/ContractTypeShapeTest.java:73`(`rule.RuleSetResult$CaughtException`)
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/contract/EngineContractSchemaTest.java`(ENUMS E12, RECORDS R20, 주석 `R1-R19` → `R1-R20`, `E1-E11` → `E1-E12`)
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/contract/EngineContractConstantsTest.java:113-120`
- Create(Test): `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/CatchKindTableTest.java`
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/FlowFixtures.java:15-40`(7곳), `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowParserTest.java:319-324`(4곳), `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetTraceTest.java:246`(NodeTrace 1곳)
- Test: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RunTraceJsonTest.java`(생성자 2곳, 새 사례 2개)
- Test: `src/frontend/m-mdm/tests/engine-contract.generated.test.ts:13-63`(`EXPECTED_EXPORTS` 에 `"CatchKind"`·`"CaughtException"`, 주석 `(50개)` → `(52개)`)

**Interfaces:**
- Consumes: 없음(첫 물결).
- Produces(뒤 태스크와 하위 세트 호출 계획이 이 이름을 그대로 쓴다):
  - Java `DefinitionLookup.NodeKind { START, END, RULE, TASK, IF, PARALLEL, MERGE, CATCH }`
  - Java `DefinitionLookup.FlowNode(String id, NodeKind kind, @Nullable String ruleId, @Nullable String splitId, @Nullable String label, @Nullable String attachTo, @Nullable List<String> catches)` — `attachTo`·`catches` 는 CATCH 만 쓴다. 하위 세트 호출 계획이 `setId` 칸을 끝에 더한다.
  - Java `kr.dongkuk.maru.mdm.engine.flow.CatchKind { NO_RESULT, INPUT_ERROR, EVAL_ERROR, HIT_CONFLICT }` — `List<String> codes()`, `static Optional<CatchKind> parse(String key)`, `static Optional<CatchKind> ofCode(String codeName)`, 상수 `CatchKind.NO_RESULT_CODE = "NO_RESULT"`·`CatchKind.NO_RESULT_MESSAGE = "맞는 행과 기본 행이 없다"`. 하위 세트 호출 계획이 `SUBSET_ENDED` 를 끝에 더한다.
  - Java `RuleSetResult(String setId, Instant evalTs, List<RuleResult> steps, Map<String, Object> finalValues, List<PathStep> path, List<EngineWarning> warnings, List<CaughtException> caught, @Nullable String endedBy)`
  - Java `RuleSetResult.CaughtException(String ruleNodeId, String ruleId, String catchNodeId, CatchKind kind, String code, String message)` — `code` 는 첫 위반 코드 이름, 결과 없음이면 `"NO_RESULT"`. 하위 세트 호출 계획이 `setPath` 를 끝에 더한다.
  - Java `RunTrace(..., @Nullable List<TraceEdit> edits, @Nullable String endedBy)` — 받는 노드 처리 갈래로 끝났으면 그 CATCH 노드 ID.
  - Java `RunTrace.NodeTrace(..., @Nullable List<Violation> violations, @Nullable CatchKind catchKind, @Nullable String code, @Nullable String message)` — 세 칸은 CATCH 노드 기록만 쓴다.
  - Java `RunTrace.NodeStatus { OK, ERROR, CAUGHT }`
  - Java `ReservedNames.CATCH_KIND = "CATCH_KIND"`, `CATCH_RULE = "CATCH_RULE"`, `CATCH_CODE = "CATCH_CODE"`, `CATCH_MSG = "CATCH_MSG"`, `Set<String> CATCH_NAMES`(넷). 하위 세트 호출 계획이 `CATCH_SET` 을 더하고 `CATCH_NAMES` 에 넣는다.
  - 스키마 `$defs/FlowNodeKind` 끝에 `"CATCH"`, `$defs/NodeStatus` 끝에 `"CAUGHT"`, 새 `$defs/CatchKind`·`$defs/CaughtException`, `FlowNode.attachTo`·`catches`(선택), `RunTrace.endedBy`(선택), `NodeTrace.catchKind`·`code`·`message`(선택), `RuleSetResult.caught`(필수)·`endedBy`(필수, null 허용).
  - 생성 TS: `FlowNodeKind` 에 `"CATCH"`, `NodeStatus` 에 `"CAUGHT"`, `export type CatchKind = "NO_RESULT" | "INPUT_ERROR" | "EVAL_ERROR" | "HIT_CONFLICT"`, `export interface CaughtException`, `FlowNode.attachTo?: string | null`·`catches?: string[] | null`, `RunTrace.endedBy?: string`, `NodeTrace.catchKind?: CatchKind`·`code?: string`·`message?: string`.
  - JSON(`RunTraceJson.toMap`): `endedBy` 는 null 이면 키를 빼고 있으면 `edits` 뒤(없으면 `violations` 뒤). NodeTrace 의 `catchKind`·`code`·`message` 는 null 이면 키를 빼고 있으면 `violations` 뒤 그 순서.

- [ ] **Step 1: Java 계약 실패 시험** — 네 파일을 고친다.

`ContractTypeShapeTest.java:73` 의 rule 줄에 `"rule.RuleSetResult$CaughtException"` 를 더한다.

```java
                    "rule.RuleSetResult", "rule.RuleSetResult$PathStep", "rule.RuleSetResult$CaughtException",
```

`EngineContractSchemaTest.java` — 주석의 `R1-R19` 를 모두 `R1-R20` 으로, `E1-E11` 을 `E1-E12` 로 바꾼다(`expr_rule_패키지의_record_enum_은…` 시험 안 주석 `E1·E4-E8·E10-E11` 은 그대로 둔다 — E12 는 flow 패키지라 그 전수 검사 밖이고, R20 `CaughtException` 은 rule 패키지라 `RECORDS` 에서 자동으로 들어간다). `ENUMS` 끝과 `RECORDS` 끝에 한 줄씩 더한다.

```java
            new EnumPair("E11", "BranchOutcome", () -> enumNames(RunTrace.BranchOutcome.class), () -> enumOf("BranchOutcome")),
            // 받는 노드 종류(받는 노드 spec §1) — flow 패키지라 expr·rule 전수 검사 밖이지만 스키마 짝은 맞춘다.
            new EnumPair("E12", "CatchKind", () -> enumNames(CatchKind.class), () -> enumOf("CatchKind")));
```
```java
            new RecordPair("R19", RunTrace.TraceEdit.class, "TraceEdit", Set.of(), Set.of()),
            // 받는 노드가 받아 처리한 exception(받는 노드 spec §6).
            new RecordPair("R20", RuleSetResult.CaughtException.class, "CaughtException", Set.of(), Set.of()));
```
같은 파일 import 에 `import kr.dongkuk.maru.mdm.engine.flow.CatchKind;` 를 더한다.

`EngineContractConstantsTest.java` 의 `예약_키_상수가_06_422_424_와_같다` 뒤에 사례를 더한다.

```java
    @Test
    void 받는_노드_예약_이름은_CATCH_네_개다() {
        assertEquals(new TreeSet<>(Set.of("CATCH_KIND", "CATCH_RULE", "CATCH_CODE", "CATCH_MSG")), new TreeSet<>(ReservedNames.CATCH_NAMES));
        assertAll(
                () -> assertEquals("CATCH_KIND", ReservedNames.CATCH_KIND),
                () -> assertEquals("CATCH_RULE", ReservedNames.CATCH_RULE),
                () -> assertEquals("CATCH_CODE", ReservedNames.CATCH_CODE),
                () -> assertEquals("CATCH_MSG", ReservedNames.CATCH_MSG));
    }
```
(`Set`·`TreeSet` 은 이미 import 돼 있다.)

`CatchKindTableTest.java` 를 만든다.

```java
package kr.dongkuk.maru.mdm.engine.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.flow.CatchKind;
import org.junit.jupiter.api.Test;

/** 받는 노드 spec §1 — 코드 → 종류 표. flow 패키지는 expr 를 못 보므로 코드 이름 문자열로 두고, 여기서 실제 Code 와 맞춘다. */
class CatchKindTableTest {

    @Test
    void 표의_코드_이름은_모두_실제_위반_코드다() {
        Set<String> real = new TreeSet<>(Arrays.stream(Code.values()).map(Enum::name).toList());
        for (CatchKind k : CatchKind.values()) {
            for (String code : k.codes()) {
                assertTrue(real.contains(code), k + " 의 " + code + " 가 Code 에 없다");
            }
        }
    }

    @Test
    void 받는_코드와_받지_않는_코드() {
        assertEquals(Optional.of(CatchKind.INPUT_ERROR), CatchKind.ofCode("MISSING_KEY"));
        assertEquals(Optional.of(CatchKind.INPUT_ERROR), CatchKind.ofCode("REQUIRED_NULL"));
        assertEquals(Optional.of(CatchKind.INPUT_ERROR), CatchKind.ofCode("TYPE_CONVERSION"));
        assertEquals(Optional.of(CatchKind.EVAL_ERROR), CatchKind.ofCode("EVALUATION_ERROR"));
        assertEquals(Optional.of(CatchKind.HIT_CONFLICT), CatchKind.ofCode("UNIQUE_MULTIPLE_HITS"));
        assertEquals(Optional.of(CatchKind.HIT_CONFLICT), CatchKind.ofCode("ANY_CONFLICT"));
        for (String no : List.of("RULE_NOT_FOUND", "SET_NOT_FOUND", "SET_DEPRECATED", "FLOW_INVALID", "CONSTANT_KEY", "RESERVED_KEY",
                "EVAL_TS_KEY", "BRANCH_EVAL_ERROR", "EDIT_POINT_MISMATCH")) {
            assertEquals(Optional.empty(), CatchKind.ofCode(no), no);
        }
    }

    @Test
    void 저장_키는_이름_그대로이고_모르는_키는_비었다() {
        assertEquals(Optional.of(CatchKind.NO_RESULT), CatchKind.parse("NO_RESULT"));
        assertEquals(Optional.empty(), CatchKind.parse("no_result"));
        assertEquals(Optional.empty(), CatchKind.parse("BOOM"));
        assertEquals(Optional.empty(), CatchKind.parse(null));
    }
}
```

- [ ] **Step 2: 실패 확인** — 공통 환경 뒤 `(cd src/backend/maru-mdm-engine && ../gradlew test --tests '*ContractTypeShapeTest' --tests '*EngineContractSchemaTest' --tests '*EngineContractConstantsTest' --tests '*CatchKindTableTest' --console=plain)` → 컴파일 오류(`CatchKind`·`CaughtException`·`CATCH_NAMES` 없음).

- [ ] **Step 3: Java 계약 구현**

`DefinitionLookup.java:158-171` 을 아래로 바꾼다.

```java
    /**
     * {@code ruleId} 는 RULE 만, {@code splitId}(짝 분기 노드 ID)는 MERGE 만 쓴다. {@code label} 은 화면 표시용이다.
     * TASK(빈 단계, 4단계 spec §1.1)는 {@code label} 만 쓰고 실행 때 아무것도 읽거나 만들지 않고 지나간다.
     * CATCH(받는 노드, 받는 노드 spec §2)는 {@code attachTo}(붙은 룰 노드 ID)·{@code catches}(받을 종류 키)를 쓴다. 돌아오는 MERGE 의
     * {@code splitId} 는 그 룰 노드 ID 다. 두 칸은 CATCH 가 아니면 null 이다.
     */
    record FlowNode(String id, NodeKind kind, @Nullable String ruleId, @Nullable String splitId, @Nullable String label,
            @Nullable String attachTo, @Nullable List<String> catches) {}
```
```java
    enum NodeKind { START, END, RULE, TASK, IF, PARALLEL, MERGE, CATCH }
```

`CatchKind.java` 를 만든다.

```java
package kr.dongkuk.maru.mdm.engine.flow;

import java.util.List;
import java.util.Optional;

/**
 * 받는 노드가 받는 exception 종류(받는 노드 spec §1). 코드 → 종류 표는 엔진에서 여기 한 곳이다. flow 패키지는 spi 만 보므로
 * 위반 코드는 {@code EngineEvaluationException.Code} 이름 문자열로 둔다(rule 패키지 {@code CatchKindTableTest} 가 실제 Code 와 맞춘다).
 * 표에 없는 코드(정의·설정 오류)는 받지 않는다(X-D2). 선언 순서가 저장 순서다(NO_RESULT·INPUT_ERROR·EVAL_ERROR·HIT_CONFLICT).
 */
public enum CatchKind {
    /** 룰 결과의 hits 가 비고 기본 행도 쓰지 않았다. 받는 노드가 있을 때만 exception 이다(X-D3). */
    NO_RESULT(List.of()),
    INPUT_ERROR(List.of("MISSING_KEY", "REQUIRED_NULL", "TYPE_CONVERSION")),
    EVAL_ERROR(List.of("EVALUATION_ERROR")),
    HIT_CONFLICT(List.of("UNIQUE_MULTIPLE_HITS", "ANY_CONFLICT"));

    /** 결과 없음일 때 CATCH_CODE 값. */
    public static final String NO_RESULT_CODE = "NO_RESULT";
    /** 결과 없음일 때 CATCH_MSG 값. */
    public static final String NO_RESULT_MESSAGE = "맞는 행과 기본 행이 없다";

    private final List<String> codes;

    CatchKind(List<String> codes) {
        this.codes = codes;
    }

    /** 이 종류에 드는 위반 코드 이름. */
    public List<String> codes() {
        return codes;
    }

    /** 저장 키(대소문자 그대로) → 종류. 모르는 키·null 은 빈 값. */
    public static Optional<CatchKind> parse(String key) {
        if (key == null) {
            return Optional.empty();
        }
        for (CatchKind k : values()) {
            if (k.name().equals(key)) {
                return Optional.of(k);
            }
        }
        return Optional.empty();
    }

    /** 위반 코드 이름 → 종류. 받지 않는 코드는 빈 값. */
    public static Optional<CatchKind> ofCode(String codeName) {
        for (CatchKind k : values()) {
            if (k.codes.contains(codeName)) {
                return Optional.of(k);
            }
        }
        return Optional.empty();
    }
}
```

`ReservedNames.java:24` `DOMAIN_VALUE` 뒤에 더한다(import `java.util.Set` 은 이미 있다).

```java
    /** 받는 노드 처리 갈래가 읽는 예약 이름(받는 노드 spec §4·X-D8). 처리 갈래 안에서만 ctx 에 있고, 레코드 키로 오면 RESERVED_KEY 다. */
    public static final String CATCH_KIND = "CATCH_KIND";
    public static final String CATCH_RULE = "CATCH_RULE";
    public static final String CATCH_CODE = "CATCH_CODE";
    public static final String CATCH_MSG = "CATCH_MSG";
    public static final Set<String> CATCH_NAMES = Set.of(CATCH_KIND, CATCH_RULE, CATCH_CODE, CATCH_MSG);
```

`RunTrace.java` 를 아래로 바꾼다(기존 javadoc 유지, 칸만 더한다).

```java
package kr.dongkuk.maru.mdm.engine.rule;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.flow.CatchKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 룰 세트 실행 기록(룰 세트 흐름도 spec §4.2, plan C5) — 디버거와 나중의 운영 기록 재생이 같은 형식을 쓴다.
 * 판정 오류는 던지지 않고 {@code violations} 에 담는다(plan D7 — 스키마 전용 EngineError 대신 목록).
 *
 * @param input       받은 레코드 사본
 * @param nodes       실행 순서대로 노드 기록. 실행 전(구조·존재·입력 키) 오류면 빈 목록
 * @param finalValues 멈춘 시점(또는 끝)까지 최상위에서 만든 결과 변수
 * @param violations  멈췄으면 위반 목록, 끝까지 갔으면 null
 * @param edits       고친 값을 끼워 다시 실행했으면 받은 고친 값 그대로(4단계 spec §2.3), 아니면 null. JSON 에서는 null 이면 키를 뺀다
 * @param endedBy     받는 노드 처리 갈래가 END 에 닿아 끝났으면 그 CATCH 노드 ID(받는 노드 spec §4), 아니면 null. JSON 에서는 null 이면 키를 뺀다
 */
public record RunTrace(String setId, Instant evalTs, Map<String, Object> input, List<NodeTrace> nodes,
        Map<String, Object> finalValues, @Nullable List<Violation> violations, @Nullable List<TraceEdit> edits,
        @Nullable String endedBy) {

    /**
     * 노드 하나의 기록. 종류마다 쓰는 칸만 채우고 나머지는 null 이다.
     * RULE: ruleId·ver·reads(실행 직전 ctx 에서 이 룰이 읽은 값)·result(OK 인 RULE 에만 있다. 없으면 JSON 에서 키를 뺀다).
     * IF: branches·chosenEdgeId. PARALLEL: order.
     * MERGE: splitId(짝 분기 또는 받는 룰 노드 ID)·merged(병렬 합류에서 합친 결과 이름). TASK: 칸 없이 status 만. ERROR 노드: violations.
     * CAUGHT RULE(받는 노드로 넘긴 룰): ruleId·ver·reads·violations(결과 없음이면 빈 목록), result 는 null.
     * CATCH: ruleId(실패한 룰 ID)·catchKind·code·message, status 는 OK. 세 칸은 CATCH 가 아니면 null 이고 JSON 에서 키를 뺀다.
     *
     * @param seq 1부터
     */
    public record NodeTrace(int seq, String nodeId, NodeKind kind, NodeStatus status,
            @Nullable String ruleId, @Nullable Integer ver, @Nullable Map<String, Object> reads, @Nullable RuleResult result,
            @Nullable List<BranchTrace> branches, @Nullable String chosenEdgeId,
            @Nullable List<String> order, @Nullable String splitId, @Nullable List<String> merged,
            @Nullable List<Violation> violations, @Nullable CatchKind catchKind, @Nullable String code, @Nullable String message) {}

    /** IF 갈래 선 하나의 평가. {@code message} 는 ERROR 일 때 원인. */
    public record BranchTrace(String edgeId, BranchOutcome outcome, @Nullable String message) {}

    /**
     * 디버거에서 고친 값 하나(4단계 spec §2.2). {@code beforeSeq} 번째 노드(1부터, {@link NodeTrace#seq} 와 같은 수)를 시작하기 직전에
     * 그 노드 범위의 ctx 에 {@code values} 를 넣는다. 값이 null 이면 비우기, ctx 에 없던 이름이면 추가다. {@code values} 의 값은 null 일 수 있다.
     */
    public record TraceEdit(int beforeSeq, String nodeId, Map<String, Object> values) {}

    /** CAUGHT = 받는 노드로 넘긴 RULE(받는 노드 spec §6). 처리되지 않은 실패는 ERROR. */
    public enum NodeStatus { OK, ERROR, CAUGHT }

    /**
     * NOT_EVALUATED = 앞 갈래가 참이었거나 앞 갈래 평가가 오류로 멈춰 평가하지 않았다(그 외 선은 안 골랐을 때 포함).
     * 그래서 IF 의 branches 는 늘 나가는 선마다 하나씩, 실행 순서대로 있다.
     */
    public enum BranchOutcome { TRUE, FALSE, NULL, ERROR, NOT_EVALUATED }
}
```

`RuleSetResult.java` 를 아래로 바꾼다.

```java
package kr.dongkuk.maru.mdm.engine.rule;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.flow.CatchKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 룰 세트 판정 결과 — 룰마다 중간 결과와 최종 ctx(06-business-rule.md:429, wbs TSK-03-03 "최종·중간 결과 반환"),
 * 흐름에서 방문한 노드(룰 세트 흐름도 spec §4.1)와 세트 경고, 받는 노드가 받아 처리한 exception(받는 노드 spec §6).
 *
 * @param steps       실행 순서대로 룰마다 결과(실제로 결과를 쓴 룰만 — 받는 노드로 넘긴 룰은 없다)
 * @param finalValues 마지막 룰 뒤 결과 변수 전체(입력 레코드 키는 뺀다)
 * @param path        방문한 노드(START·RULE·CATCH·IF·PARALLEL·MERGE·END) 순서
 * @param warnings    세트 경고 — IF 조건식 NULL({@code BRANCH_COND_NULL}). 룰 경고는 steps 의 RuleResult 에 있다
 * @param caught      받는 노드가 받아 처리 갈래로 넘긴 exception, 실행 순서. 없으면 빈 목록
 * @param endedBy     처리 갈래가 END 에 닿아 끝났으면 그 CATCH 노드 ID, 아니면 null(X-D10)
 */
public record RuleSetResult(String setId, Instant evalTs, List<RuleResult> steps, Map<String, Object> finalValues,
        List<PathStep> path, List<EngineWarning> warnings, List<CaughtException> caught, @Nullable String endedBy) {

    /**
     * 방문한 노드 하나.
     *
     * @param chosenEdgeId IF 에서 고른 선. 그 밖은 null
     * @param stepIndex    RULE 이면 그 결과가 {@code steps} 의 몇 번째인지. 받는 노드로 넘긴 RULE·그 밖은 null
     */
    public record PathStep(String nodeId, NodeKind kind, @Nullable String chosenEdgeId, @Nullable Integer stepIndex) {}

    /**
     * 받아 처리한 exception 하나(받는 노드 spec §6).
     *
     * @param code    첫 위반 코드 이름. 결과 없음이면 {@code NO_RESULT}
     * @param message 첫 위반 문구. 결과 없음이면 {@link CatchKind#NO_RESULT_MESSAGE}
     */
    public record CaughtException(String ruleNodeId, String ruleId, String catchNodeId, CatchKind kind, String code, String message) {}
}
```

`FlowRun.java` 의 `new NodeTrace(` 여섯 곳(95·165·209·260·272·302행) 마지막 인자 뒤에 `, null, null, null` 을 더한다. 예(95행):

```java
        return new NodeTrace(nodes.size() + 1, curNodeId, curKind, NodeStatus.ERROR, curRuleId, curVer, curReads, null,
                curBranches == null ? null : List.copyOf(curBranches), curChosen, null, null, null, List.copyOf(violations), null, null, null);
```

`MdmRuleEngine.java` — 79행:

```java
        return new RuleSetResult(setId, ts, List.copyOf(run.steps), Collections.unmodifiableMap(run.finalValues),
                List.copyOf(run.path), List.copyOf(run.warnings), List.of(), null);
```
100·107·112행 `new RunTrace(` 의 마지막 인자 `echo` 뒤에 `, null` 을 더한다(받는 노드 실행은 Task 3 이 채운다).

`FlowParser.java:33,37,41` 의 `new FlowNode(… , null)` 끝에 `, null, null` 을 더한다.

`engine-contract.schema.json` — 일곱 곳.

`RuleSetResult`(340-352):
```json
    "RuleSetResult": {
      "description": "룰 세트 판정 결과(Java RuleSetResult, 06:429 + 룰 세트 흐름도 spec §4.1 + 받는 노드 spec §6). steps 는 결과를 쓴 룰마다 결과, finalValues 는 마지막 룰 뒤 결과 변수 전체, path 는 방문한 노드, warnings 는 세트 경고(BRANCH_COND_NULL), caught 는 받는 노드가 받아 처리한 exception(실행 순서), endedBy 는 처리 갈래가 END 로 끝냈을 때 그 CATCH 노드 ID.",
      "type": "object",
      "properties": {
        "setId": { "type": "string" },
        "evalTs": { "$ref": "#/$defs/LocalDateTime" },
        "steps": { "type": "array", "items": { "$ref": "#/$defs/RuleResult" } },
        "finalValues": { "type": "object", "additionalProperties": { "$ref": "#/$defs/TypedValue" } },
        "path": { "type": "array", "items": { "$ref": "#/$defs/PathStep" } },
        "warnings": { "type": "array", "items": { "$ref": "#/$defs/EngineWarning" } },
        "caught": { "type": "array", "items": { "$ref": "#/$defs/CaughtException" } },
        "endedBy": { "type": ["string", "null"] }
      },
      "required": ["setId", "evalTs", "steps", "finalValues", "path", "warnings", "caught", "endedBy"],
      "additionalProperties": false
    },
```
`RunTrace` 의 `properties` 끝(`edits` 뒤)에 `"endedBy": { "type": "string" }` 를 더하고(required 밖), `description` 끝에 ` endedBy 는 받는 노드 처리 갈래가 END 로 끝냈을 때만 있고, 없으면 키를 뺀다.` 를 붙인다.

`NodeTrace` 의 `properties` 끝(`violations` 뒤)에 세 칸을 더하고(required 밖), `description` 의 `ERROR: violations.` 뒤에 ` CAUGHT RULE(받는 노드로 넘긴 룰): violations(결과 없음이면 빈 목록). CATCH: ruleId(실패한 룰)·catchKind·code·message 이고 셋은 CATCH 노드에만 있으며 없으면 키를 뺀다.` 를 붙인다.

```json
        "violations": { "type": ["array", "null"], "items": { "$ref": "#/$defs/Violation" } },
        "catchKind": { "$ref": "#/$defs/CatchKind" },
        "code": { "type": "string" },
        "message": { "type": "string" }
```

`NodeStatus`(425):
```json
    "NodeStatus": { "description": "노드 실행 상태(Java RunTrace.NodeStatus). CAUGHT = 받는 노드로 넘긴 RULE(받는 노드 spec §6).", "enum": ["OK", "ERROR", "CAUGHT"] },
```
`NodeStatus` 바로 뒤에 새 정의 둘을 넣는다.

```json
    "CatchKind": { "description": "받는 노드가 받는 exception 종류(Java flow.CatchKind, 받는 노드 spec §1). NO_RESULT = 결과 없음, INPUT_ERROR = MISSING_KEY·REQUIRED_NULL·TYPE_CONVERSION, EVAL_ERROR = EVALUATION_ERROR, HIT_CONFLICT = UNIQUE_MULTIPLE_HITS·ANY_CONFLICT.", "enum": ["NO_RESULT", "INPUT_ERROR", "EVAL_ERROR", "HIT_CONFLICT"] },
    "CaughtException": {
      "description": "받는 노드가 받아 처리한 exception 하나(Java RuleSetResult.CaughtException). code 는 첫 위반 코드, 결과 없음이면 NO_RESULT.",
      "type": "object",
      "properties": {
        "ruleNodeId": { "type": "string" },
        "ruleId": { "type": "string" },
        "catchNodeId": { "type": "string" },
        "kind": { "$ref": "#/$defs/CatchKind" },
        "code": { "type": "string" },
        "message": { "type": "string" }
      },
      "required": ["ruleNodeId", "ruleId", "catchNodeId", "kind", "code", "message"],
      "additionalProperties": false
    },
```

`FlowNode`(438-449):
```json
    "FlowNode": {
      "description": "흐름 노드(Java DefinitionLookup.FlowNode). ruleId 는 RULE 만, splitId 는 MERGE 만 쓴다(받는 룰로 돌아오는 MERGE 는 그 룰 노드 ID). TASK(빈 단계)는 label 만 쓰고 실행 때 그냥 지나간다. CATCH(받는 노드)는 attachTo(붙은 룰 노드 ID)·catches(받을 종류 키)를 쓰고, 두 칸은 CATCH 노드에만 있다.",
      "type": "object",
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "kind": { "$ref": "#/$defs/FlowNodeKind" },
        "ruleId": { "type": ["string", "null"] },
        "splitId": { "type": ["string", "null"] },
        "label": { "type": ["string", "null"] },
        "attachTo": { "type": ["string", "null"] },
        "catches": { "type": ["array", "null"], "items": { "type": "string" } }
      },
      "required": ["id", "kind", "ruleId", "splitId", "label"],
      "additionalProperties": false
    },
```
`catches` 의 항목은 `CatchKind` 가 아니라 문자열이다 — 모르는 키를 저장 검사(`FLOW_CATCH`)가 알려야 하므로 읽기에서 거르지 않는다.

`FlowNodeKind`(466):
```json
    "FlowNodeKind": { "description": "흐름 노드 종류(Java DefinitionLookup.NodeKind). TASK = 빈 단계(4단계 spec §1.1), CATCH = 받는 노드(받는 노드 spec §2).", "enum": ["START", "END", "RULE", "TASK", "IF", "PARALLEL", "MERGE", "CATCH"] },
```

- [ ] **Step 4: 엔진 시험 호출부 고치기** — `FlowFixtures.java:15-40` 의 `new FlowNode(` 일곱 곳, `FlowParserTest.java:319-324` 네 곳 끝에 `, null, null` 을 더한다. `RuleSetTraceTest.java:246` 의 기대 `new NodeTrace(… , null)` 끝에 `, null, null, null` 을 더한다. `FlowFixtures` 끝(`nestedFlow` 앞)에 받는 노드 조립 도우미를 더한다(Task 2·3 이 쓴다).

```java
    /** 받는 노드(받는 노드 spec §2). kinds 는 저장 키(CatchKind 이름). */
    public static FlowNode catchNode(String id, String attachTo, String... kinds) {
        return new FlowNode(id, NodeKind.CATCH, null, null, null, attachTo, List.of(kinds));
    }

    /** 받는 룰로 돌아오는 합류 — splitId 가 룰 노드 ID 다. */
    public static FlowNode guardMerge(String id, String ruleNodeId) {
        return new FlowNode(id, NodeKind.MERGE, null, ruleNodeId, null, null, null);
    }
```

- [ ] **Step 5: 엔진 통과 확인** — `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)` → PASS. 늘어난 수: `CatchKindTableTest` 3, `EngineContractConstantsTest` 1, 매개변수 시험의 E12·R20 대응쌍(enum 1 + record 3) 4. mdm lib 은 아직 `RunTrace`·`FlowNode` 생성자 때문에 컴파일되지 않는다(다음 단계).

- [ ] **Step 6: `RunTraceJson` 실패 시험** — `RunTraceJsonTest.java` 의 생성자 두 곳(23·34행) 끝에 `, null` 을 더하고, 클래스 끝에 사례 둘을 더한다(import `kr.dongkuk.maru.mdm.engine.flow.CatchKind`·`kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind`·`static org.junit.jupiter.api.Assertions.assertTrue`).

```java
    @Test
    void endedBy_는_있으면_마지막_키이고_없으면_싣지_않는다() {
        RunTrace ended = new RunTrace("S", TS, Map.of(), List.of(), Map.of(), null, null, "c1");
        assertEquals(List.of("setId", "evalTs", "input", "nodes", "finalValues", "violations", "endedBy"),
                List.copyOf(RunTraceJson.toMap(ended).keySet()));
        assertEquals("c1", RunTraceJson.toMap(ended).get("endedBy"));
        RunTrace plain = new RunTrace("S", TS, Map.of(), List.of(), Map.of(), null, null, null);
        assertFalse(RunTraceJson.toMap(plain).containsKey("endedBy"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void CATCH_노드_기록은_violations_뒤에_catchKind_code_message_를_싣고_다른_노드는_싣지_않는다() {
        RunTrace.NodeTrace caught = new RunTrace.NodeTrace(2, "r1", NodeKind.RULE, RunTrace.NodeStatus.CAUGHT, "R1", 1, Map.of(), null,
                null, null, null, null, null, List.of(), null, null, null);
        RunTrace.NodeTrace c = new RunTrace.NodeTrace(3, "c1", NodeKind.CATCH, RunTrace.NodeStatus.OK, "R1", null, null, null,
                null, null, null, null, null, null, CatchKind.NO_RESULT, "NO_RESULT", "맞는 행과 기본 행이 없다");
        Map<String, Object> m = RunTraceJson.toMap(new RunTrace("S", TS, Map.of(), List.of(caught, c), Map.of(), null, null, null));
        List<Map<String, Object>> nodes = (List<Map<String, Object>>) m.get("nodes");
        assertEquals("CAUGHT", nodes.get(0).get("status"));
        assertFalse(nodes.get(0).containsKey("catchKind"));
        assertEquals(List.of("seq", "nodeId", "kind", "status", "ruleId", "ver", "reads", "branches", "chosenEdgeId", "order", "splitId", "merged",
                "violations", "catchKind", "code", "message"), List.copyOf(nodes.get(1).keySet()));
        assertEquals("NO_RESULT", nodes.get(1).get("catchKind"));
        assertTrue(nodes.get(1).containsKey("message"));
    }
```

- [ ] **Step 7: lib 구현** — `RuleSetRunner.java:112-113` 의 `new RunTrace(…, echo)` 끝에 `, null` 을 더한다. `RuleSetFlowJson.java:176` 을 아래로 바꾼다(읽기는 Task 2).

```java
            nodes.add(new FlowNode(id, k, text(n, "ruleId", where), text(n, "splitId", where), text(n, "label", where), null, null));
```

`RunTraceJson.java` — 머리 javadoc 목록 끝에 `<li>{@code endedBy}: null 이면 키를 뺀다(받는 노드 spec §6). 있으면 마지막 키.</li>` 와 `<li>NodeTrace 의 {@code catchKind}·{@code code}·{@code message}: null 이면 키를 뺀다. 있으면 violations 뒤 그 순서.</li>` 를 더하고, `toMap` 끝과 `node` 끝을 아래처럼 쓴다.

```java
        m.put("violations", violations(t.violations()));
        if (t.edits() != null) {
            m.put("edits", t.edits().stream().map(RunTraceJson::edit).toList());
        }
        if (t.endedBy() != null) {
            m.put("endedBy", t.endedBy());
        }
        return m;
    }
```
```java
        m.put("violations", violations(n.violations()));
        if (n.catchKind() != null) {
            m.put("catchKind", n.catchKind().name());
        }
        if (n.code() != null) {
            m.put("code", n.code());
        }
        if (n.message() != null) {
            m.put("message", n.message());
        }
        return m;
    }
```

- [ ] **Step 8: lib·api 통과와 골든 무변경 확인** — `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)` → PASS(기준선 + 2). `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetSimulateTest' --tests '*DmeOasisHttpTest' --tests '*RuleSetRunnerTest' --tests '*RuleSetCaseRunTest' --tests '*RuleSetRunnerOasisTest' --console=plain)` → PASS. 골든 파일(`rule-set-trace-golden.json` 등)을 다시 쓰지 않았는데 골든 비교가 통과해야 한다 — 새 키가 새지 않았다는 증거다. `/usr/bin/git status --short` 에 골든 파일이 없어야 한다.

- [ ] **Step 9: 생성 TS·생성 시험** — 화면 준비(워크트리 첫 회) 뒤 `pnpm --dir src/frontend --filter @dk-oasis/m-mdm gen:contract`. `/usr/bin/git diff -- src/frontend/m-mdm/src/contract/engine-contract.generated.ts` 로 `FlowNodeKind` 에 `"CATCH"`, `NodeStatus` 에 `"CAUGHT"`, `export type CatchKind`, `export interface CaughtException`, `FlowNode` 의 `attachTo?`·`catches?`, `RunTrace.endedBy?`, `NodeTrace.catchKind?`·`code?`·`message?`, `RuleSetResult.caught`·`endedBy` 가 생겼는지 본다. `tests/engine-contract.generated.test.ts` 의 주석 `(50개)` 를 `(52개)` 로, `EXPECTED_EXPORTS` 의 `"NodeStatus",` 뒤에 `"CatchKind",` `"CaughtException",` 을 더한다.

- [ ] **Step 10: TS 자리 채우기** — 생성 타입에 `"CATCH"` 가 들어오면서 `Record<FlowNodeKind, …>` 네 곳이 tsc 오류다. 아래처럼 채운다.

`flow-model.ts:70-71`:
```ts
const IN_DEGREE: Record<FlowNodeKind, Degree> = { START: NONE, END: ONE, RULE: ONE, TASK: ONE, IF: ONE, PARALLEL: ONE, MERGE: MANY, CATCH: NONE };
const OUT_DEGREE: Record<FlowNodeKind, Degree> = { START: ONE, END: NONE, RULE: ONE, TASK: ONE, IF: MANY, PARALLEL: MANY, MERGE: ONE, CATCH: ONE };
```
`flow-layout.ts` `NODE_SIZE` 의 `MERGE` 줄 뒤:
```ts
  CATCH: { w: 28, h: 28 }, // 받는 노드 — 룰 아래 테두리에 걸친 작은 원(받는 노드 spec §8, Ruling R15)
```
`PropertyPanel.tsx` `KIND_TEXT` 의 `MERGE` 줄 뒤:
```ts
  CATCH: "받는 노드 — 붙은 룰이 실패하거나 결과가 없을 때 처리 갈래를 실행한다", // SEAM(T9): 받는 노드 속성 섹션은 Task 9
```
`TraceDetail.tsx` `KIND_TEXT` 의 `MERGE` 줄 뒤:
```ts
  CATCH: "받는 노드",
```

- [ ] **Step 11: TS 통과 확인** — `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint` → 오류 0. `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/engine-contract.generated.test.ts tests/dme/ruleSetEdit` → PASS(새 사례 없음, 기준선 그대로). 바꾼 `.tsx` 두 파일·`.ts` 두 파일에 mantine-aggrid-ui audit 두 개 → 0건.

- [ ] **Step 12: 전체 확인** — 엔진·lib 전체, `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test` 의 `[m-mdm test 합계]` 줄 → 모두 PASS. 기준선 대비 증감을 완료 보고에 적는다.

- [ ] **Step 13: 커밋** — 계약 네 벌이 한 커밋에 들어가야 중간 커밋에서도 생성 TS 시험이 깨지지 않는다.

```
/usr/bin/git add src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/DefinitionLookup.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/CatchKind.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/ReservedNames.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RunTrace.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetResult.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowParser.java src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch/ContractTypeShapeTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/contract/EngineContractSchemaTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/contract/EngineContractConstantsTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/CatchKindTableTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/FlowFixtures.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowParserTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetTraceTest.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJson.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RunTraceJson.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RunTraceJsonTest.java src/frontend/m-mdm/src/contract/engine-contract.generated.ts src/frontend/m-mdm/tests/engine-contract.generated.test.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx
/usr/bin/git commit -m "feat(mdm-engine): 받는 노드 계약 — CATCH·attachTo·catches·CatchKind·CaughtException·endedBy·CAUGHT·CATCH_* 예약 이름" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/DefinitionLookup.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/CatchKind.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/ReservedNames.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RunTrace.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetResult.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowParser.java src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch/ContractTypeShapeTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/contract/EngineContractSchemaTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/contract/EngineContractConstantsTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/CatchKindTableTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/FlowFixtures.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowParserTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetTraceTest.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJson.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RunTraceJson.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RunTraceJsonTest.java src/frontend/m-mdm/src/contract/engine-contract.generated.ts src/frontend/m-mdm/tests/engine-contract.generated.test.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx
```

---

### Task 2: 흐름 구조 해석 — `Guarded` 블록·`FLOW_CATCH`·FLOW_JSON 코덱·구조 코퍼스(Java·TS 한 벌)

**권장 모델:** opus — 1단계(모두 모으기)·2단계(첫 오류에서 멈춤) 문구·순서를 Java 와 TS 가 글자까지 같게 내야 하고, 노드 관계·펼친 룰 순서가 뒤 태스크 전부의 바탕이다.
**병렬:** 단독(Task 1 뒤). 이 태스크가 병합되면 3·4·6·7 을 연다.

**이 태스크가 정한 것:**
- 구조 규칙(스펙 §3)은 `FlowParser`·`flow-model.ts` 두 곳에만 있다. 분석기·화면은 트리(`Guarded`)만 받는다.
- 받는 노드가 하나라도 있으면 END 의 들어오는 선 규칙이 "1개 이상"이 된다(편차 F7). 없으면 지금 그대로라 기존 사례·퍼즈 문구가 바뀌지 않는다.
- 관계(R8): 사슬 프레임 `(받는 룰 ID, 0)` = 정상 갈래, `(받는 룰 ID, k+1)` = k번째 처리 갈래. 갈래 번호가 처음 갈린 프레임이 PARALLEL 분기면 PARALLEL, 아니면 EXCLUSIVE. Java 는 `splitKinds.get(..) == PARALLEL` 로, TS 는 사슬 `kind` 에 `"GUARD"` 를 더해 판정한다.
- `RuleSetAnalyzer.PathWalk.seq`·`RuleSetPathState.Walk.seq` 는 `instanceof` 사슬이라 `Guarded` 를 조용히 건너뛴다. 이 태스크는 그 둘을 건드리지 않고 Task 4 가 고친다. 그래서 이 태스크의 코퍼스 사례는 모두 **구조 오류**(트리가 없어 경로 검사를 하지 않는) 흐름이다.

**Files:**
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/Guarded.java`
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/Block.java:3-4`
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowParser.java`(전체)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowTree.java:70-94`(관계 판정·javadoc)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/package-info.java`(받는 노드 한 줄)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java:172-178`·`src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowKeys.java:112-188,196-222,231-243`(패턴 `switch` 네 곳에 `Guarded` 자리만 — `// SEAM(T3)`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJson.java:50-57,163-177`(CATCH 칸 읽기·쓰기)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCheck.java:36-38`(`FLOW_CATCH` 상수)
- Modify: `src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json`(사례 5개)
- Modify: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java:43`(`MIN_CASES = 59`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts`(타입·1단계 h·2단계 받는 룰·`FlowTree`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts:60-76`(`RuleSetCheckCode` 에 `"FLOW_CATCH"`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts:321-336`(`GUARDED` 임시 처리 `// SEAM(T4)`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts:103-114`(`scopePaths` 의 `GUARDED`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts:74-83,96-129`(`bodyIds`·`orderBranches` 의 `GUARDED` 걷기)
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowParserTest.java`(사례 추가)
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowTreeTest.java`(사례 추가)
- Test: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJsonTest.java`(사례 추가)
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-model.test.ts`(사례 추가)
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts:20,36-42,79-91`(`MIN_CASES = 59`, CATCH 칸 읽기)

**Interfaces:**
- Consumes(Task 1): `NodeKind.CATCH`, `FlowNode.attachTo()`·`catches()`, `CatchKind.parse`, TS 생성 `CatchKind`·`FlowNode.attachTo?`·`catches?`, `FlowFixtures.catchNode`·`guardMerge`.
- Produces:
  - Java `public record Guarded(RuleStep rule, Seq normal, List<Guarded.Handler> handlers, @Nullable String mergeId) implements Block` — `String nodeId()`(= `rule.nodeId()`), `@Nullable Guarded.Handler handlerFor(CatchKind kind)`. 돌아오는 처리 갈래가 없으면 `normal` 은 빈 `Seq`, `mergeId` 는 null 이고 룰의 나가는 선은 바깥 순차가 그대로 잇는다. 하위 세트 호출 계획은 `rule` 자리를 SET 단계로 넓히고 `nodeId()` 를 그대로 쓴다.
  - Java `public record Guarded.Handler(String catchNodeId, List<CatchKind> kinds, Seq body, boolean ends)` — `ends=true` 면 처리 갈래가 END 로 간다.
  - Java `public sealed interface Block permits Seq, RuleStep, TaskStep, Split, Guarded`
  - Java `FlowParser.CATCH = "FLOW_CATCH"`, `static boolean FlowParser.catchable(NodeKind k)`(지금은 RULE 만 true — 하위 세트 호출 계획이 SET 을 더하는 한 자리)
  - Java `FlowTree.ruleSteps()` 는 받는 룰 → 정상 갈래 → 처리 갈래(받는 노드 배열 순서) 순서로 처리 갈래 안 룰을 포함한다. `FlowTree.relation` 은 정상 갈래·처리 갈래 사이를 EXCLUSIVE 로 낸다.
  - lib `RuleSetCheck.FLOW_CATCH = "FLOW_CATCH"`
  - TS `flow-model.ts`: `export interface Handler { catchNodeId: string; kinds: CatchKind[]; body: Seq; ends: boolean }`, `export interface Guarded { type: "GUARDED"; rule: RuleStep; normal: Seq; handlers: Handler[]; mergeId: string | null }`, `export type Block = Seq | RuleStep | TaskStep | Split | Guarded`, `export type FlowIssueCode = "FLOW_STRUCTURE" | "FLOW_IF_ELSE" | "FLOW_CATCH"`, `export const CATCH_KINDS: readonly CatchKind[]`(저장 순서), `export const CATCHABLE: ReadonlySet<FlowNodeKind>`(지금 `RULE` 하나), `export function catchesOf(flow: RuleSetFlow, nodeId: string): FlowNode[]`(그 노드에 붙은 CATCH, 노드 배열 순서, 겹친 ID 는 첫 노드만). `Guarded` 는 맨 위에 `nodeId` 가 없다 — 블록을 걷는 TS 코드가 `GUARDED` 를 빼먹으면 tsc 가 막는다.
  - TS `types.ts`: `RuleSetCheckCode` 에 `"FLOW_CATCH"`.

**구조 오류 문구(정본 — Java·TS·코퍼스가 이 글자를 쓴다):**

| 단계 | 코드 | nodeId | 문구 |
|---|---|---|---|
| 1 d | FLOW_STRUCTURE | 끝 노드 | `{id}의 들어오는 선이 {n}개다. 1개 이상이어야 한다` (받는 노드가 있는 흐름의 END, 0개일 때) |
| 1 e | FLOW_STRUCTURE | 합류 | `합류 {m}의 짝 분기 {splitId}가 없다` — 지금 문구. `splitId` 가 받는 노드 붙은 RULE 이면 오류 아님 |
| 1 h1 | FLOW_CATCH | 받는 노드 | `받는 노드 {c}가 붙은 룰 {attachTo|-}가 없다` |
| 1 h2 | FLOW_CATCH | 받는 노드 | `받는 노드 {c}는 룰 노드에만 붙일 수 있다({attachTo}는 {kind})` |
| 1 h3 | FLOW_CATCH | 받는 노드 | `받는 노드 {c}에 받을 예외 종류가 없다` |
| 1 h4 | FLOW_CATCH | 받는 노드 | `받는 노드 {c}의 예외 종류 {key}를 모른다` |
| 1 h5 | FLOW_CATCH | 받는 노드 | `받는 노드 {c}에 예외 종류 {key}가 겹친다` |
| 1 h6 | FLOW_CATCH | 뒤 받는 노드 | `룰 노드 {r}에서 예외 종류 {key}를 {앞 c}와 {뒤 c}가 함께 받는다` |
| 1 h7 | FLOW_STRUCTURE | 룰 | `룰 {r}로 돌아오는 합류가 {n}개다. 1개까지 둔다` |
| 2 | FLOW_STRUCTURE | 닿은 노드 | `처리 갈래 {c}가 합류 {m}나 끝에 닿지 않고 {cur}로 나간다`(돌아오는 합류가 있을 때) / `처리 갈래 {c}가 끝에 닿지 않고 {cur}로 나간다`(없을 때) |

1단계 순서: 지금의 a → b → c → d·e·f1(노드 배열 순서) → f2~g5(분기 노드 배열 순서) → h1~h5(받는 노드 배열 순서, 한 노드 안에서 h1·h2 다음 h3·h4·h5) → h6·h7(받는 룰마다, 그 룰에 처음 붙은 받는 노드의 배열 순서). 2단계는 지금처럼 첫 오류에서 멈춘다 — 처리 갈래 안 IF·PARALLEL 갈래가 END 로 가면 지금 문구 `갈래가 {합류}에서 닫히지 않고 end로 나간다`, 처리 갈래가 다른 갈래·룰 앞으로 가면 `{노드}를 두 번 지난다. …`, 정상 갈래가 합류에 닿지 않으면 `갈래가 {합류}에서 닫히지 않고 …` 다.

- [ ] **Step 1: Java 실패 시험** — `FlowParserTest.java` 끝(마지막 `}` 앞)에 사례를 더한다. import 에 `static …FlowFixtures.catchNode`, `static …FlowFixtures.guardMerge` 를 더한다.

```java
    // ── 받는 노드(받는 노드 spec §3) ──

    /** start → r1(R_A) → mr → r2(R_B) → end. c1(NO_RESULT) → r9(R_C) → mr, c2(INPUT_ERROR·EVAL_ERROR) → end. */
    static FlowDefinition guardedFlow() {
        return flow(List.of(start(), rule("r1", "R_A"), catchNode("c1", "r1", "NO_RESULT"), rule("r9", "R_C"),
                        catchNode("c2", "r1", "INPUT_ERROR", "EVAL_ERROR"), guardMerge("mr", "r1"), rule("r2", "R_B"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "r9"), e("e4", "r9", "mr"), e("e5", "c2", "end"),
                        e("e6", "mr", "r2"), e("e7", "r2", "end")));
    }

    @Test
    void 받는_룰은_Guarded_블록이고_처리_갈래는_돌아옴과_끝냄을_안다() {
        FlowParse p = FlowParser.parse(guardedFlow());
        assertEquals(List.of(), p.issues());
        Guarded g = (Guarded) p.tree().root().items().get(0);
        assertEquals(new RuleStep("r1", "R_A"), g.rule());
        assertEquals("r1", g.nodeId());
        assertEquals("mr", g.mergeId());
        assertEquals(List.of(), g.normal().items());
        assertEquals(new Guarded.Handler("c1", List.of(CatchKind.NO_RESULT), new Seq(List.of(new RuleStep("r9", "R_C"))), false),
                g.handlers().get(0));
        assertEquals(new Guarded.Handler("c2", List.of(CatchKind.INPUT_ERROR, CatchKind.EVAL_ERROR), new Seq(List.of()), true),
                g.handlers().get(1));
        assertEquals(g.handlers().get(1), g.handlerFor(CatchKind.EVAL_ERROR));
        assertNull(g.handlerFor(CatchKind.HIT_CONFLICT));
        assertEquals(new RuleStep("r2", "R_B"), p.tree().root().items().get(1));
        assertEquals(List.of("R_A", "R_C", "R_B"), p.tree().ruleIds());
        assertFalse(p.tree().branched());
    }

    @Test
    void 돌아오는_처리_갈래가_없으면_정상_갈래가_비고_룰의_나가는_선이_그대로_이어진다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_A"), catchNode("c1", "r1", "EVAL_ERROR"), rule("r2", "R_B"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "r2"), e("e3", "c1", "end"), e("e4", "r2", "end")));
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        Guarded g = (Guarded) p.tree().root().items().get(0);
        assertNull(g.mergeId());
        assertEquals(List.of(), g.normal().items());
        assertTrue(g.handlers().get(0).ends());
        assertEquals(new RuleStep("r2", "R_B"), p.tree().root().items().get(1));
    }

    @Test
    void 정상_갈래에_노드가_있고_처리_갈래_안_룰에도_받는_노드를_붙일_수_있다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_A"), rule("n1", "R_B"), catchNode("c1", "r1", "NO_RESULT"), rule("h1", "R_C"),
                        catchNode("c9", "h1", "EVAL_ERROR"), guardMerge("mr", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "n1"), e("e3", "n1", "mr"), e("e4", "c1", "h1"), e("e5", "h1", "mr"),
                        e("e6", "c9", "end"), e("e7", "mr", "end")));
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        Guarded g = (Guarded) p.tree().root().items().get(0);
        assertEquals(List.of(new RuleStep("n1", "R_B")), g.normal().items());
        Guarded inner = (Guarded) g.handlers().get(0).body().items().get(0);
        assertEquals("h1", inner.nodeId());
        assertNull(inner.mergeId());
        assertTrue(inner.handlers().get(0).ends());
        assertEquals(List.of("R_A", "R_B", "R_C"), p.tree().ruleIds());
    }

    @Test
    void 받는_노드_오류는_FLOW_CATCH_로_모두_모은다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_A"), task("t1"), catchNode("c0", "zz", "NO_RESULT"), catchNode("c1", "t1", "NO_RESULT"),
                        new FlowNode("c2", NodeKind.CATCH, null, null, null, "r1", List.of()), catchNode("c3", "r1", "NO_RESULT", "BOOM", "NO_RESULT"),
                        catchNode("c4", "r1", "NO_RESULT"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "t1"), e("e3", "t1", "end"), e("e4", "c0", "end"), e("e5", "c1", "end"),
                        e("e6", "c2", "end"), e("e7", "c3", "end"), e("e8", "c4", "end")));
        assertEquals(List.of(
                "FLOW_CATCH|c0|null|받는 노드 c0가 붙은 룰 zz가 없다",
                "FLOW_CATCH|c1|null|받는 노드 c1는 룰 노드에만 붙일 수 있다(t1는 TASK)",
                "FLOW_CATCH|c2|null|받는 노드 c2에 받을 예외 종류가 없다",
                "FLOW_CATCH|c3|null|받는 노드 c3의 예외 종류 BOOM를 모른다",
                "FLOW_CATCH|c3|null|받는 노드 c3에 예외 종류 NO_RESULT가 겹친다",
                "FLOW_CATCH|c4|null|룰 노드 r1에서 예외 종류 NO_RESULT를 c3와 c4가 함께 받는다"), issues(f));
    }

    @Test
    void 받는_노드가_있으면_END_는_들어오는_선이_여럿이어도_되고_없으면_지금처럼_하나다() {
        FlowDefinition withCatch = flow(List.of(start(), rule("r1", "R_A"), catchNode("c1", "r1", "NO_RESULT"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "end"), e("e3", "c1", "end")));
        assertEquals(List.of(), issues(withCatch));
        FlowDefinition without = flow(List.of(start(), rule("r1", "R_A"), rule("r2", "R_B"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "end"), e("e3", "r2", "end")));
        assertTrue(issues(without).contains("FLOW_STRUCTURE|end|null|end의 들어오는 선이 2개다. 1개여야 한다"), issues(without).toString());
    }

    @Test
    void 돌아오는_합류는_받는_룰마다_하나까지이고_받는_노드_없는_룰은_짝이_아니다() {
        FlowDefinition two = flow(List.of(start(), rule("r1", "R_A"), catchNode("c1", "r1", "NO_RESULT"), guardMerge("m1", "r1"), guardMerge("m2", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "m1"), e("e3", "c1", "m1"), e("e4", "m1", "m2"), e("e5", "c1", "m2"), e("e6", "m2", "end")));
        assertTrue(issues(two).contains("FLOW_STRUCTURE|r1|null|룰 r1로 돌아오는 합류가 2개다. 1개까지 둔다"), issues(two).toString());
        FlowDefinition bare = flow(List.of(start(), rule("r1", "R_A"), guardMerge("m1", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "m1"), e("e3", "m1", "end")));
        assertTrue(issues(bare).contains("FLOW_STRUCTURE|m1|null|합류 m1의 짝 분기 r1가 없다"), issues(bare).toString());
    }

    @Test
    void 처리_갈래가_다른_합류로_가면_멈추고_처리_갈래_안_IF_갈래는_END_로_못_간다() {
        // start → if9 [b1 → r1 → m9][그 외 → m9] → end. r1 에 c1 → m9(if9 의 합류).
        FlowDefinition jump = flow(List.of(start(), ifNode("if9"), rule("r1", "R_A"), catchNode("c1", "r1", "NO_RESULT"), merge("m9", "if9"), end()),
                List.of(e("e0", "start", "if9"), br("b1", "if9", "r1", 1, "X > 0"), other("bo", "if9", "m9"), e("e1", "r1", "m9"),
                        e("e2", "c1", "m9"), e("e3", "m9", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|m9|null|처리 갈래 c1가 끝에 닿지 않고 m9로 나간다"), issues(jump));
        // start → r1 → mr → end. c1 → if1 [b1 → end][b2 → m2][그 외 → m2] → m2 → mr.
        FlowDefinition nested = flow(List.of(start(), rule("r1", "R_A"), catchNode("c1", "r1", "NO_RESULT"), ifNode("if1"), merge("m2", "if1"),
                        guardMerge("mr", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "if1"), br("b1", "if1", "end", 1, "X > 0"),
                        br("b2", "if1", "m2", 2, "X > 1"), other("bo", "if1", "m2"), e("e4", "m2", "mr"), e("e5", "mr", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|end|null|갈래가 m2에서 닫히지 않고 end로 나간다"), issues(nested));
    }
```
`FlowParserTest` import 에 `kr.dongkuk.maru.mdm.engine.flow.Guarded` 는 같은 패키지라 필요 없다. `CatchKind` 도 같은 패키지다.

`FlowTreeTest.java` 끝에:

```java
    @Test
    void 정상_갈래와_처리_갈래는_EXCLUSIVE_이고_받는_룰보다_뒤이며_branched_는_그대로다() {
        FlowTree t = tree(FlowParserTest.guardedFlow());
        assertEquals(Relation.BEFORE, t.relation("r1", "r9"));
        assertEquals(Relation.AFTER, t.relation("r9", "r1"));
        assertEquals(Relation.BEFORE, t.relation("r9", "r2"));
        assertFalse(t.branched());
        FlowTree n = tree(kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow(
                List.of(start(), rule("r1", "R_A"), rule("n1", "R_B"), catchNode("c1", "r1", "NO_RESULT"), rule("h1", "R_C"), guardMerge("mr", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "n1"), e("e3", "n1", "mr"), e("e4", "c1", "h1"), e("e5", "h1", "mr"), e("e6", "mr", "end"))));
        assertEquals(Relation.EXCLUSIVE, n.relation("n1", "h1"));
        assertEquals(Relation.EXCLUSIVE, n.relation("h1", "n1"));
    }
```
(`FlowTreeTest` import 에 `catchNode`·`guardMerge`·`start`·`rule`·`e`·`end` 정적 import 와 `assertFalse` 가 없으면 더한다.)

`RuleSetFlowJsonTest.java` 끝에:

```java
    @Test
    void 받는_노드는_attachTo_catches_를_읽고_정규_JSON_은_CATCH_노드에만_두_칸을_쓴다() {
        String in = """
            {"version":1,"nodes":[{"id":"start","kind":"START"},{"id":"r1","kind":"RULE","ruleId":"A"},
             {"id":"c1","kind":"CATCH","attachTo":"r1","catches":["NO_RESULT","BOOM"],"label":"단가 없음"},{"id":"end","kind":"END"}],
             "edges":[{"id":"e1","from":"start","to":"r1"},{"id":"e2","from":"r1","to":"end"},{"id":"e3","from":"c1","to":"end"}]}""";
        FlowDefinition f = RuleSetFlowJson.parse(in);
        assertEquals("r1", f.nodes().get(2).attachTo());
        assertEquals(List.of("NO_RESULT", "BOOM"), f.nodes().get(2).catches());
        assertNull(f.nodes().get(1).attachTo());
        assertNull(f.nodes().get(1).catches());
        String c = RuleSetFlowJson.canonical(in);
        assertTrue(c.contains("{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"A\",\"splitId\":null,\"label\":null},"), c);
        assertTrue(c.contains("{\"id\":\"c1\",\"kind\":\"CATCH\",\"ruleId\":null,\"splitId\":null,\"label\":\"단가 없음\",\"attachTo\":\"r1\",\"catches\":[\"NO_RESULT\",\"BOOM\"]}"), c);
    }

    @Test
    void catches_는_문자열_배열이어야_한다() {
        String bad = """
            {"version":1,"nodes":[{"id":"c1","kind":"CATCH","attachTo":"r1","catches":"NO_RESULT"}],"edges":[]}""";
        assertEquals("nodes[0].catches 는 문자열 배열이어야 한다",
                assertThrows(IllegalArgumentException.class, () -> RuleSetFlowJson.parse(bad)).getMessage());
        String badItem = """
            {"version":1,"nodes":[{"id":"c1","kind":"CATCH","attachTo":"r1","catches":[1]}],"edges":[]}""";
        assertEquals("nodes[0].catches 는 문자열 배열이어야 한다",
                assertThrows(IllegalArgumentException.class, () -> RuleSetFlowJson.parse(badItem)).getMessage());
    }
```

- [ ] **Step 2: 실패 확인** — `(cd src/backend/maru-mdm-engine && ../gradlew test --tests '*FlowParserTest' --tests '*FlowTreeTest' --console=plain)` → 컴파일 오류(`Guarded` 없음). `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetFlowJsonTest' --console=plain)` → 새 두 사례 FAIL(attachTo null).

- [ ] **Step 3: Java 구현**

`Block.java`:
```java
/** 블록 트리 한 칸 — 순차·룰·빈 단계·분기·받는 룰(받는 노드 spec §3). */
public sealed interface Block permits Seq, RuleStep, TaskStep, Split, Guarded {}
```

`Guarded.java` 를 만든다.

```java
package kr.dongkuk.maru.mdm.engine.flow;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 받는 노드가 붙은 룰(받는 노드 spec §3). 룰이 성공하면 {@code normal} 을, 실패하거나 결과가 없는데 그 종류를 받는 노드가 있으면 그
 * 처리 갈래를 실행한다. 처리 갈래는 {@code mergeId} 로 돌아오거나({@code ends=false}) END 로 가서 세트를 끝낸다({@code ends=true}).
 * 돌아오는 처리 갈래가 없으면 {@code normal} 은 비고 {@code mergeId} 는 null 이며, 룰의 나가는 선은 바깥 순차가 그대로 잇는다.
 * {@code handlers} 는 받는 노드의 노드 배열 순서다. m-mdm {@code flow-model.ts} 의 {@code Guarded} 짝.
 */
public record Guarded(RuleStep rule, Seq normal, List<Handler> handlers, @Nullable String mergeId) implements Block {

    /** 처리 갈래 하나 — 받는 노드 ID·받는 종류(저장 순서)·본문·END 로 끝내는가. */
    public record Handler(String catchNodeId, List<CatchKind> kinds, Seq body, boolean ends) {}

    /** 받는 노드가 붙은 노드 ID. */
    public String nodeId() {
        return rule.nodeId();
    }

    /** kind 를 받는 처리 갈래. 없으면 null(한 룰에서 한 종류는 한 받는 노드만 받는다 — FLOW_CATCH). */
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

`FlowParser.java` 를 아래로 바꾼다(기존 a~g 는 그대로, h·2단계 받는 룰·END 차수만 더한다).

```java
package kr.dongkuk.maru.mdm.engine.flow;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
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
 * 흐름 구조 검사와 블록 트리 만들기(plan C3, 받는 노드 spec §3). 1단계는 어긋난 것을 모두 모으고, 하나라도 있으면 트리를 만들지 않는다.
 * 2단계(트리 만들기)는 첫 오류에서 멈춘다. 문구·순서를 바꾸면 m-mdm flow-model.ts 와 rule-set-corpus.json 을 함께 바꾼다.
 */
public final class FlowParser {

    public static final String STRUCTURE = "FLOW_STRUCTURE";
    public static final String IF_ELSE = "FLOW_IF_ELSE";
    /** 받는 노드 붙임·종류 오류(받는 노드 spec §5). */
    public static final String CATCH = "FLOW_CATCH";

    private FlowParser() {}

    /** 받는 노드를 붙일 수 있는 노드 종류(받는 노드 spec §3). 하위 세트 호출 스펙이 SET 을 더한다. */
    public static boolean catchable(NodeKind k) {
        return k == NodeKind.RULE;
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
        boolean hasCatch = byId.values().stream().anyMatch(n -> n.kind() == NodeKind.CATCH);
        // 받는 룰 → 붙은 받는 노드(노드 배열 순서). 붙임이 맞는 것만 — h 가 채우고 e·2단계가 쓴다.
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
            degree(issues, n.id(), "들어오는", i, inRule(n.kind(), hasCatch));
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
        // f2·g1..g5 — 분기별
        for (FlowNode n : byId.values()) {
            if (n.kind() != NodeKind.IF && n.kind() != NodeKind.PARALLEL) {
                continue;
            }
            long merges = byId.values().stream().filter(m -> m.kind() == NodeKind.MERGE && n.id().equals(m.splitId())).count();
            if (merges != 1) {
                issues.add(structure(n.id(), null, "분기 " + n.id() + "를 닫는 합류가 " + merges + "개다. 정확히 1개여야 한다"));
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
        }
        // h1..h5 — 받는 노드별(받는 노드 spec §5 FLOW_CATCH)
        for (FlowNode n : byId.values()) {
            if (n.kind() != NodeKind.CATCH) {
                continue;
            }
            FlowNode target = blank(n.attachTo()) ? null : byId.get(n.attachTo());
            if (target == null) {
                issues.add(new FlowIssue(CATCH, n.id(), null, "받는 노드 " + n.id() + "가 붙은 룰 " + (blank(n.attachTo()) ? "-" : n.attachTo()) + "가 없다"));
            } else if (!catchable(target.kind())) {
                issues.add(new FlowIssue(CATCH, n.id(), null, "받는 노드 " + n.id() + "는 룰 노드에만 붙일 수 있다(" + target.id() + "는 " + target.kind() + ")"));
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
        // h6·h7 — 받는 룰별
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

    private static final class Builder {
        final Map<String, FlowNode> nodes;
        final Map<String, List<FlowEdge>> out;
        final Map<String, List<FlowNode>> catchesOf;
        final Map<String, String> mergeOf = new HashMap<>();
        final Set<String> visited = new HashSet<>();
        final List<RuleStep> steps = new ArrayList<>();
        final Map<String, Position> positions = new HashMap<>();
        final Map<String, NodeKind> splitKinds = new HashMap<>();
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
            Seq root = seq(next(start.id()), end.id(), List.of());
            visited.add(end.id());
            for (FlowNode n : nodes.values()) {
                if (!visited.contains(n.id())) {
                    throw new Stop(structure(n.id(), null, n.id() + "에 도달할 수 없다"));
                }
            }
            return new FlowTree(root, start.id(), end.id(), steps, positions, splitKinds);
        }

        Seq seq(String cur, String stop, List<Frame> chain) {
            List<Block> items = new ArrayList<>();
            while (!cur.equals(stop)) {
                cur = step(cur, items, chain, "갈래가 " + stop + "에서 닫히지 않고 ");
            }
            return new Seq(List.copyOf(items));
        }

        /** 노드 하나를 블록으로 만들어 items 에 넣고 다음 노드 ID 를 돌려준다. notClosed 는 START·END·MERGE 에 닿았을 때 문구 앞부분. */
        String step(String cur, List<Block> items, List<Frame> chain, String notClosed) {
            FlowNode n = nodes.get(cur);
            if (visited.contains(cur)) {
                throw new Stop(structure(cur, null, cur + "를 두 번 지난다. 순환이 있거나 갈래가 짝 합류 밖에서 만난다"));
            }
            if (n.kind() == NodeKind.START || n.kind() == NodeKind.END || n.kind() == NodeKind.MERGE) {
                throw new Stop(structure(cur, null, notClosed + cur + "로 나간다"));
            }
            visited.add(cur);
            positions.put(cur, new Position(chain, order++));
            if (n.kind() == NodeKind.RULE) {
                RuleStep s = new RuleStep(cur, n.ruleId());
                steps.add(s);
                List<FlowNode> catches = catchesOf.getOrDefault(cur, List.of());
                if (catches.isEmpty()) {
                    items.add(s);
                    return next(cur);
                }
                Guarded g = guarded(s, catches, chain);
                items.add(g);
                return g.mergeId() == null ? next(cur) : next(g.mergeId());
            }
            if (n.kind() == NodeKind.TASK) {
                items.add(new TaskStep(cur));
                return next(cur);
            }
            String mergeId = mergeOf.get(cur);
            splitKinds.put(cur, n.kind());
            List<FlowEdge> ordered = ordered(n.kind(), out.get(cur));
            List<Branch> branches = new ArrayList<>();
            for (int b = 0; b < ordered.size(); b++) {
                FlowEdge e = ordered.get(b);
                branches.add(new Branch(e.id(), e.cond(), e.otherwise(), e.label(), seq(e.to(), mergeId, FlowTree.extend(chain, cur, b))));
            }
            visited.add(mergeId);
            items.add(new Split(cur, n.kind(), mergeId, List.copyOf(branches)));
            return next(mergeId);
        }

        /** 받는 룰(R8·R9) — 정상 갈래(사슬 0) 다음 처리 갈래(사슬 k+1, 받는 노드 배열 순서). */
        Guarded guarded(RuleStep rule, List<FlowNode> catches, List<Frame> chain) {
            String id = rule.nodeId();
            String mergeId = mergeOf.get(id);
            Seq normal = mergeId == null ? new Seq(List.of()) : seq(next(id), mergeId, FlowTree.extend(chain, id, 0));
            List<Guarded.Handler> handlers = new ArrayList<>();
            for (int k = 0; k < catches.size(); k++) {
                FlowNode c = catches.get(k);
                visited.add(c.id());
                handlers.add(handler(c, mergeId, FlowTree.extend(chain, id, k + 1)));
            }
            if (mergeId != null) {
                visited.add(mergeId);
            }
            return new Guarded(rule, normal, List.copyOf(handlers), mergeId);
        }

        /** 처리 갈래 — 받는 노드에서 나가는 선부터 돌아오는 합류(있으면) 또는 END 까지. */
        Guarded.Handler handler(FlowNode c, String mergeId, List<Frame> chain) {
            List<Block> items = new ArrayList<>();
            String notClosed = "처리 갈래 " + c.id() + "가 " + (mergeId == null ? "끝" : "합류 " + mergeId + "나 끝") + "에 닿지 않고 ";
            String cur = next(c.id());
            while (!cur.equals(endId) && !cur.equals(mergeId)) {
                cur = step(cur, items, chain, notClosed);
            }
            List<CatchKind> kinds = c.catches().stream().map(k -> CatchKind.parse(k).orElseThrow()).toList();
            return new Guarded.Handler(c.id(), kinds, new Seq(List.copyOf(items)), cur.equals(endId));
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

    /** 개수 규칙: 0 = 없어야, 1 = 1개, 2 = 2개 이상, 3 = 1개 이상. */
    private static int inRule(NodeKind k, boolean hasCatch) {
        return switch (k) {
            case START, CATCH -> 0;
            case MERGE -> 2;
            case END -> hasCatch ? 3 : 1;
            default -> 1;
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
주의: 2단계 `step()` 의 첫 두 검사(방문 → 종류) 순서와 문구는 지금 코드(`FlowParser.java:203-208`)와 같다. 처리 갈래가 END 에 닿으면 END 는 `step()` 에 들어가기 전에 멈추므로 방문 표시를 하지 않는다(END 는 루트 순차 뒤에 표시한다).

`FlowTree.java` 의 `relation` 판정(89-91행)과 javadoc(70-75행)을 아래로 바꾼다.

```java
    /**
     * 두 노드(RULE·TASK·IF·PARALLEL)의 관계. 두 ID 가 같으면(a==b) 노드를 찾지 않고 바로 SAME 을 낸다. 지나온 분기 목록을 앞에서부터 비교해 같은 분기에서 갈래 번호가
     * 처음 달라지면 그 분기가 PARALLEL 이면 PARALLEL, 그 밖(IF, 받는 룰의 정상 갈래·처리 갈래 — 받는 노드 spec §3)이면 EXCLUSIVE 를 낸다. 달라지는 곳이 없으면
     * 같은 경로이고 깊이 우선 순번으로 BEFORE·AFTER 다.
     *
     * @throws IllegalArgumentException 트리에 없는 노드(START·END·MERGE·CATCH 포함)
     */
```
```java
            if (fa.branch() != fb.branch()) {
                return splitKinds.get(fa.splitId()) == NodeKind.PARALLEL ? Relation.PARALLEL : Relation.EXCLUSIVE;
            }
```
`FlowTree` 의 `ruleSteps()` javadoc 을 `모든 RULE 노드, 깊이 우선(갈래 실행 순서, 받는 룰은 정상 갈래 다음 처리 갈래) 순서.` 로 고친다. `package-info.java` 끝 문장 앞에 `받는 노드(CATCH)는 붙은 룰과 함께 {@link kr.dongkuk.maru.mdm.engine.flow.Guarded} 한 칸이 된다(받는 노드 spec §3).` 를 더한다.

`RuleSetFlowJson.java` — `read` 의 노드 줄(176행, Task 1 이 `, null, null` 로 둔 곳)과 `canonical` 의 노드 쓰기(50-57행), 새 도우미:

```java
            nodes.add(new FlowNode(id, k, text(n, "ruleId", where), text(n, "splitId", where), text(n, "label", where),
                    text(n, "attachTo", where), strings(n, "catches", where)));
```
```java
        for (FlowNode n : f.nodes()) {
            ObjectNode o = ns.addObject();
            o.put("id", n.id());
            o.put("kind", n.kind().name());
            o.put("ruleId", n.ruleId());
            o.put("splitId", n.splitId());
            o.put("label", n.label());
            // 받는 노드만 두 칸을 쓴다 — 받는 노드 없는 세트의 정규 글자는 그대로다(Ruling R11).
            if (n.kind() == NodeKind.CATCH) {
                o.put("attachTo", n.attachTo());
                if (n.catches() == null) {
                    o.putNull("catches");
                } else {
                    ArrayNode cs = o.putArray("catches");
                    n.catches().forEach(cs::add);
                }
            }
        }
```
```java
    /** 문자열 배열 칸 — 없거나 null 이면 null, 배열이 아니거나 문자열이 아닌 원소가 있으면 형식 오류. */
    private static List<String> strings(JsonNode node, String field, String where) {
        JsonNode v = node.get(field);
        if (v == null || v.isNull()) {
            return null;
        }
        if (!v.isArray()) {
            throw new IllegalArgumentException(where + "." + field + " 는 문자열 배열이어야 한다");
        }
        List<String> out = new ArrayList<>();
        for (JsonNode x : v) {
            if (!x.isTextual()) {
                throw new IllegalArgumentException(where + "." + field + " 는 문자열 배열이어야 한다");
            }
            out.add(x.textValue());
        }
        return List.copyOf(out);
    }
```
머리 javadoc 의 `노드 종류 키는 {@code kind}` 뒤에 `, 받는 노드(CATCH)는 {@code attachTo}·{@code catches} 를 더 갖는다` 를 넣는다.

`RuleSetCheck.java` 의 `EMPTY_TASK` 상수 뒤:
```java
    /** 받는 노드 붙임·종류 오류(REJECT, 받는 노드 spec §5). 흐름 구조 검사(`FlowParser`)가 낸다. */
    public static final String FLOW_CATCH = "FLOW_CATCH";
```

`Block` 이 sealed 라 `Guarded` 를 더하면 엔진 `rule` 패키지의 패턴 `switch` 네 곳(`FlowRun.java:172-178` `seq`, `FlowKeys.java:112-188` `walk`·`196-222` `sureProduced`·`231-243` `allProduced`)이 컴파일되지 않는다. 각 `switch` 에 아래 한 줄을 넣고 두 파일에 import `kr.dongkuk.maru.mdm.engine.flow.Guarded` 를 더한다. 받는 노드가 있는 흐름을 실행하는 시험이 이 태스크에 없으므로 초록이다. Task 3 이 `grep -rn "SEAM(T3)" src/backend` 로 모두 바꾼다.

```java
                case Guarded g -> throw new UnsupportedOperationException("받는 룰 실행은 Task 3 이 한다"); // SEAM(T3)
```
`sureProduced`·`allProduced` 의 `switch` 는 문장 `switch` 이므로 같은 줄을 그대로 넣는다(`walk` 도 같다).

- [ ] **Step 4: Java 통과 확인** — `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)` → PASS(기준선 + 8). `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetFlowJsonTest' --tests '*RuleSetCorpusTest' --tests '*RuleSetAnalyzerTest' --console=plain)` → PASS(코퍼스는 아직 그대로).

- [ ] **Step 5: TS 실패 시험** — `tests/dme/ruleSetEdit/flow-model.test.ts` 끝에 Java 와 같은 사례를 더한다. 파일의 기존 도우미 `node(id, kind, over)`·`edge(id, from, to, over)`·`flow(nodes, edges)`·`S(nodeId, message)`(FLOW_STRUCTURE 이슈) 를 쓴다.

```ts
describe("받는 노드(CATCH) — 받는 노드 spec §3", () => {
  const cnode = (id: string, attachTo: string, ...catches: string[]) => node(id, "CATCH", { attachTo, catches });
  const C = (nodeId: string, message: string) => ({ code: "FLOW_CATCH", nodeId, edgeId: null, message });
  /** start → r1(R_A) → mr → r2(R_B) → end. c1(NO_RESULT) → r9(R_C) → mr, c2(INPUT_ERROR·EVAL_ERROR) → end. */
  const guardedFlow = (): RuleSetFlow =>
    flow(
      [node("start", "START"), node("r1", "RULE", { ruleId: "R_A" }), cnode("c1", "r1", "NO_RESULT"), node("r9", "RULE", { ruleId: "R_C" }),
        cnode("c2", "r1", "INPUT_ERROR", "EVAL_ERROR"), node("mr", "MERGE", { splitId: "r1" }), node("r2", "RULE", { ruleId: "R_B" }), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "mr"), edge("e3", "c1", "r9"), edge("e4", "r9", "mr"), edge("e5", "c2", "end"),
        edge("e6", "mr", "r2"), edge("e7", "r2", "end")],
    );

  it("받는 룰은 GUARDED 블록이고 처리 갈래는 돌아옴과 끝냄을 안다", () => {
    const p = parseFlow(guardedFlow());
    expect(p.issues).toEqual([]);
    expect(p.tree!.root.items).toEqual([
      {
        type: "GUARDED",
        rule: { type: "RULE", nodeId: "r1", ruleId: "R_A" },
        normal: { type: "SEQ", items: [] },
        handlers: [
          { catchNodeId: "c1", kinds: ["NO_RESULT"], body: { type: "SEQ", items: [{ type: "RULE", nodeId: "r9", ruleId: "R_C" }] }, ends: false },
          { catchNodeId: "c2", kinds: ["INPUT_ERROR", "EVAL_ERROR"], body: { type: "SEQ", items: [] }, ends: true },
        ],
        mergeId: "mr",
      },
      { type: "RULE", nodeId: "r2", ruleId: "R_B" },
    ]);
    expect(p.tree!.ruleIds()).toEqual(["R_A", "R_C", "R_B"]);
    expect(p.tree!.relation("r1", "r9")).toBe("BEFORE");
    expect(p.tree!.relation("r9", "r2")).toBe("BEFORE");
    expect(p.tree!.branched()).toBe(false);
    expect(catchesOf(guardedFlow(), "r1").map((n) => n.id)).toEqual(["c1", "c2"]);
  });

  it("정상 갈래와 처리 갈래는 EXCLUSIVE, 처리 갈래 안 룰의 받는 노드는 안쪽 GUARDED 다", () => {
    const f = flow(
      [node("start", "START"), node("r1", "RULE", { ruleId: "R_A" }), node("n1", "RULE", { ruleId: "R_B" }), cnode("c1", "r1", "NO_RESULT"),
        node("h1", "RULE", { ruleId: "R_C" }), cnode("c9", "h1", "EVAL_ERROR"), node("mr", "MERGE", { splitId: "r1" }), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "n1"), edge("e3", "n1", "mr"), edge("e4", "c1", "h1"), edge("e5", "h1", "mr"),
        edge("e6", "c9", "end"), edge("e7", "mr", "end")],
    );
    const p = parseFlow(f);
    expect(p.issues).toEqual([]);
    expect(p.tree!.relation("n1", "h1")).toBe("EXCLUSIVE");
    expect(p.tree!.ruleIds()).toEqual(["R_A", "R_B", "R_C"]);
    const g = p.tree!.root.items[0];
    if (g.type !== "GUARDED") throw new Error("GUARDED 가 아니다");
    const inner = g.handlers[0].body.items[0];
    expect(inner.type).toBe("GUARDED");
  });

  it("받는 노드 오류는 FLOW_CATCH 로 모두 모은다(Java 와 같은 순서·문구)", () => {
    const f = flow(
      [node("start", "START"), node("r1", "RULE", { ruleId: "R_A" }), node("t1", "TASK"), cnode("c0", "zz", "NO_RESULT"), cnode("c1", "t1", "NO_RESULT"),
        cnode("c2", "r1"), cnode("c3", "r1", "NO_RESULT", "BOOM", "NO_RESULT"), cnode("c4", "r1", "NO_RESULT"), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "t1"), edge("e3", "t1", "end"), edge("e4", "c0", "end"), edge("e5", "c1", "end"),
        edge("e6", "c2", "end"), edge("e7", "c3", "end"), edge("e8", "c4", "end")],
    );
    expect(parseFlow(f).issues).toEqual([
      C("c0", "받는 노드 c0가 붙은 룰 zz가 없다"),
      C("c1", "받는 노드 c1는 룰 노드에만 붙일 수 있다(t1는 TASK)"),
      C("c2", "받는 노드 c2에 받을 예외 종류가 없다"),
      C("c3", "받는 노드 c3의 예외 종류 BOOM를 모른다"),
      C("c3", "받는 노드 c3에 예외 종류 NO_RESULT가 겹친다"),
      C("c4", "룰 노드 r1에서 예외 종류 NO_RESULT를 c3와 c4가 함께 받는다"),
    ]);
  });

  it("받는 노드가 있으면 END 는 들어오는 선이 여럿이어도 된다", () => {
    const f = flow(
      [node("start", "START"), node("r1", "RULE", { ruleId: "R_A" }), cnode("c1", "r1", "NO_RESULT"), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "end"), edge("e3", "c1", "end")],
    );
    expect(parseFlow(f).issues).toEqual([]);
  });

  it("돌아오는 합류는 하나까지, 처리 갈래가 다른 합류로 가거나 처리 갈래 안 IF 갈래가 END 로 가면 멈춘다", () => {
    const two = flow(
      [node("start", "START"), node("r1", "RULE", { ruleId: "R_A" }), cnode("c1", "r1", "NO_RESULT"), node("m1", "MERGE", { splitId: "r1" }),
        node("m2", "MERGE", { splitId: "r1" }), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "m1"), edge("e3", "c1", "m1"), edge("e4", "m1", "m2"), edge("e5", "c1", "m2"), edge("e6", "m2", "end")],
    );
    expect(parseFlow(two).issues).toContainEqual(S("r1", "룰 r1로 돌아오는 합류가 2개다. 1개까지 둔다"));
    const jump = flow(
      [node("start", "START"), node("if9", "IF"), node("r1", "RULE", { ruleId: "R_A" }), cnode("c1", "r1", "NO_RESULT"),
        node("m9", "MERGE", { splitId: "if9" }), node("end", "END")],
      [edge("e0", "start", "if9"), edge("b1", "if9", "r1", { order: 1, cond: "X > 0" }), edge("bo", "if9", "m9", { otherwise: true }),
        edge("e1", "r1", "m9"), edge("e2", "c1", "m9"), edge("e3", "m9", "end")],
    );
    expect(parseFlow(jump).issues).toEqual([S("m9", "처리 갈래 c1가 끝에 닿지 않고 m9로 나간다")]);
    const nested = flow(
      [node("start", "START"), node("r1", "RULE", { ruleId: "R_A" }), cnode("c1", "r1", "NO_RESULT"), node("if1", "IF"),
        node("m2", "MERGE", { splitId: "if1" }), node("mr", "MERGE", { splitId: "r1" }), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "mr"), edge("e3", "c1", "if1"), edge("b1", "if1", "end", { order: 1, cond: "X > 0" }),
        edge("b2", "if1", "m2", { order: 2, cond: "X > 1" }), edge("bo", "if1", "m2", { otherwise: true }), edge("e4", "m2", "mr"), edge("e5", "mr", "end")],
    );
    expect(parseFlow(nested).issues).toEqual([S("end", "갈래가 m2에서 닫히지 않고 end로 나간다")]);
  });
});
```
파일 머리 import(5행)에 `catchesOf` 를 더한다. 파일의 `node(id, kind, over: Partial<FlowNode>)` 도우미(7-14행)는 Task 1 뒤 생성 `FlowNode` 의 선택 칸 `attachTo`·`catches` 를 그대로 받는다.

- [ ] **Step 6: 실패 확인** — `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/flow-model.test.ts` → 새 사례 FAIL(`catchesOf` 없음, CATCH 를 도달 불가로 봄).

- [ ] **Step 7: TS 구현** — `flow-model.ts`.

import 와 타입(19-60행 근처):
```ts
import type { CatchKind, FlowEdge, FlowNode, FlowNodeKind, RuleSetFlow } from "@/contract/engine-contract.generated";

export type FlowIssueCode = "FLOW_STRUCTURE" | "FLOW_IF_ELSE" | "FLOW_CATCH";
```
```ts
/** 처리 갈래 하나(받는 노드 spec §3) — 엔진 `flow.Guarded.Handler` 짝. ends = END 로 가서 세트를 끝낸다. */
export interface Handler {
  catchNodeId: string;
  kinds: CatchKind[];
  body: Seq;
  ends: boolean;
}

/**
 * 받는 노드가 붙은 룰(받는 노드 spec §3) — 엔진 `flow.Guarded` 짝. 돌아오는 처리 갈래가 없으면 normal 은 비고 mergeId 는 null 이다.
 * 맨 위에 nodeId 를 두지 않는다 — 블록을 걷는 코드가 GUARDED 를 빼먹으면 tsc 가 `b.kind`·`b.nodeId` 에서 막는다.
 */
export interface Guarded {
  type: "GUARDED";
  rule: RuleStep;
  normal: Seq;
  handlers: Handler[];
  mergeId: string | null;
}

export type Block = Seq | RuleStep | TaskStep | Split | Guarded;

/** 받는 종류의 저장 순서(엔진 `CatchKind` 선언 순서). */
export const CATCH_KINDS: readonly CatchKind[] = ["NO_RESULT", "INPUT_ERROR", "EVAL_ERROR", "HIT_CONFLICT"];
/** 받는 노드를 붙일 수 있는 노드 종류(엔진 `FlowParser.catchable`). 하위 세트 호출 스펙이 SET 을 더한다. */
export const CATCHABLE: ReadonlySet<FlowNodeKind> = new Set<FlowNodeKind>(["RULE"]);
const isCatchKind = (k: string): k is CatchKind => (CATCH_KINDS as readonly string[]).includes(k);

/** nodeId 에 붙은 받는 노드(노드 배열 순서, 겹친 ID 는 첫 노드만). 붙은 노드가 받을 수 있는 종류인지는 보지 않는다. */
export function catchesOf(flow: RuleSetFlow, nodeId: string): FlowNode[] {
  const seen = new Set<string>();
  const out: FlowNode[] = [];
  for (const n of flow.nodes ?? []) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    if (n.kind === "CATCH" && n.attachTo === nodeId) out.push(n);
  }
  return out;
}
```
차수표 아래에 END 규칙을 더한다(차수표 자체는 Task 1 값 그대로):
```ts
const AT_LEAST_ONE: Degree = { min: 1, max: Number.POSITIVE_INFINITY };
const degreeText = (d: Degree) => (d.max === 0 ? "없어야 한다" : d.max === 1 ? "1개여야 한다" : d.min === 1 ? "1개 이상이어야 한다" : "2개 이상이어야 한다");
```
(기존 `degreeText` 줄을 위 줄로 바꾼다.)

`parseFlow` — a 단계 뒤, b 단계 앞에 받는 룰 표를 만든다.
```ts
  const hasCatch = unique.some((n) => n.kind === "CATCH");
  /** 받는 룰 → 붙은 받는 노드(노드 배열 순서). 붙임이 맞는 것만 — e·h6·h7·2단계가 쓴다. */
  const catchMap = new Map<string, FlowNode[]>();
  for (const n of unique) {
    if (n.kind !== "CATCH" || isBlankJava(n.attachTo)) continue;
    const t = byId.get(n.attachTo as string);
    if (t && CATCHABLE.has(t.kind)) {
      if (!catchMap.has(t.id)) catchMap.set(t.id, []);
      catchMap.get(t.id)!.push(n);
    }
  }
```
d·e 루프의 차수와 MERGE 짝 검사를 아래로 바꾼다.
```ts
    const di = n.kind === "END" && hasCatch ? AT_LEAST_ONE : IN_DEGREE[n.kind];
```
```ts
    if (n.kind === "MERGE") {
      const splitId = orNull(n.splitId);
      const s = splitId == null ? undefined : byId.get(splitId);
      if (!s || (!isSplit(s.kind) && !catchMap.has(s.id))) issues.push(issue("FLOW_STRUCTURE", n.id, null, `합류 ${n.id}의 짝 분기 ${splitId ?? "-"}가 없다`));
    }
```
f2~g5 루프 뒤, `if (issues.length > 0)` 앞에 h 단계를 넣는다.
```ts
  // h1~h5 — 받는 노드별(FLOW_CATCH)
  for (const n of unique) {
    if (n.kind !== "CATCH") continue;
    const at = orNull(n.attachTo);
    const target = isBlankJava(at) ? undefined : byId.get(at as string);
    if (!target) issues.push(issue("FLOW_CATCH", n.id, null, `받는 노드 ${n.id}가 붙은 룰 ${isBlankJava(at) ? "-" : at}가 없다`));
    else if (!CATCHABLE.has(target.kind)) issues.push(issue("FLOW_CATCH", n.id, null, `받는 노드 ${n.id}는 룰 노드에만 붙일 수 있다(${target.id}는 ${target.kind})`));
    const keys = n.catches ?? [];
    if (keys.length === 0) issues.push(issue("FLOW_CATCH", n.id, null, `받는 노드 ${n.id}에 받을 예외 종류가 없다`));
    const seenKeys = new Set<string>();
    for (const k of keys) {
      if (!isCatchKind(k)) issues.push(issue("FLOW_CATCH", n.id, null, `받는 노드 ${n.id}의 예외 종류 ${k}를 모른다`));
      else if (seenKeys.has(k)) issues.push(issue("FLOW_CATCH", n.id, null, `받는 노드 ${n.id}에 예외 종류 ${k}가 겹친다`));
      else seenKeys.add(k);
    }
  }
  // h6·h7 — 받는 룰별
  for (const [ruleNode, cs] of catchMap) {
    const owner = new Map<string, string>();
    for (const c of cs) {
      for (const k of c.catches ?? []) {
        if (!isCatchKind(k)) continue;
        const prev = owner.get(k);
        if (prev === undefined) owner.set(k, c.id);
        else if (prev !== c.id) issues.push(issue("FLOW_CATCH", c.id, null, `룰 노드 ${ruleNode}에서 예외 종류 ${k}를 ${prev}와 ${c.id}가 함께 받는다`));
      }
    }
    const merges = unique.filter((m) => m.kind === "MERGE" && orNull(m.splitId) === ruleNode).length;
    if (merges > 1) issues.push(issue("FLOW_STRUCTURE", ruleNode, null, `룰 ${ruleNode}로 돌아오는 합류가 ${merges}개다. 1개까지 둔다`));
  }
```
`build(unique, byId, outOf)` 호출을 `build(unique, byId, outOf, catchMap)` 로 바꾸고 `build` 를 아래로 바꾼다.
```ts
function build(
  unique: readonly FlowNode[],
  byId: ReadonlyMap<string, FlowNode>,
  outOf: (id: string) => FlowEdge[],
  catchMap: ReadonlyMap<string, readonly FlowNode[]>,
): FlowTree {
  const visited = new Set<string>();
  const mergeOf = new Map<string, string>();
  for (const m of unique) if (m.kind === "MERGE" && m.splitId != null) mergeOf.set(m.splitId, m.id);
  const next = (id: string) => outOf(id)[0].to;
  const end = unique.find((n) => n.kind === "END")!;

  /** 노드 하나를 블록으로 만들어 items 에 넣고 다음 노드 ID 를 돌려준다(Java `Builder.step`). */
  const step = (cur: string, items: Block[], notClosed: string): string => {
    if (visited.has(cur)) {
      throw new ParseStop(issue("FLOW_STRUCTURE", cur, null, `${cur}를 두 번 지난다. 순환이 있거나 갈래가 짝 합류 밖에서 만난다`));
    }
    const node = byId.get(cur)!;
    if (node.kind === "START" || node.kind === "END" || node.kind === "MERGE") {
      throw new ParseStop(issue("FLOW_STRUCTURE", cur, null, `${notClosed}${cur}로 나간다`));
    }
    visited.add(cur);
    if (node.kind === "RULE") {
      const rule: RuleStep = { type: "RULE", nodeId: cur, ruleId: node.ruleId as string };
      const cs = catchMap.get(cur) ?? [];
      if (cs.length === 0) {
        items.push(rule);
        return next(cur);
      }
      const g = guarded(rule, cs);
      items.push(g);
      return g.mergeId == null ? next(cur) : next(g.mergeId);
    }
    if (node.kind === "TASK") {
      items.push({ type: "TASK", nodeId: cur });
      return next(cur);
    }
    const splitId = cur;
    const mergeId = mergeOf.get(splitId)!;
    const branches = sortBranches(node.kind, outOf(splitId)).map((e) => ({
      edgeId: e.id,
      cond: orNull(e.cond),
      otherwise: e.otherwise === true,
      label: orNull(e.label),
      body: seq(e.to, mergeId),
    }));
    visited.add(mergeId);
    items.push({ type: "SPLIT", nodeId: splitId, kind: node.kind as "IF" | "PARALLEL", mergeId, branches });
    return next(mergeId);
  };

  const seq = (from: string, stop: string): Seq => {
    const items: Block[] = [];
    let cur = from;
    while (cur !== stop) cur = step(cur, items, `갈래가 ${stop}에서 닫히지 않고 `);
    return { type: "SEQ", items };
  };

  const guarded = (rule: RuleStep, cs: readonly FlowNode[]): Guarded => {
    const mergeId = mergeOf.get(rule.nodeId) ?? null;
    const normal: Seq = mergeId == null ? { type: "SEQ", items: [] } : seq(next(rule.nodeId), mergeId);
    const handlers = cs.map((c): Handler => {
      visited.add(c.id);
      const items: Block[] = [];
      const notClosed = `처리 갈래 ${c.id}가 ${mergeId == null ? "끝" : `합류 ${mergeId}나 끝`}에 닿지 않고 `;
      let cur = next(c.id);
      while (cur !== end.id && cur !== mergeId) cur = step(cur, items, notClosed);
      return { catchNodeId: c.id, kinds: (c.catches ?? []).filter(isCatchKind), body: { type: "SEQ", items }, ends: cur === end.id };
    });
    if (mergeId != null) visited.add(mergeId);
    return { type: "GUARDED", rule, normal, handlers, mergeId };
  };

  const start = unique.find((n) => n.kind === "START")!;
  visited.add(start.id);
  const root = seq(next(start.id), end.id);
  visited.add(end.id);
  for (const n of unique) {
    if (!visited.has(n.id)) {
      throw new ParseStop(issue("FLOW_STRUCTURE", n.id, null, `${n.id}에 도달할 수 없다`));
    }
  }
  return new FlowTree(root, start.id, end.id);
}
```
주의: 처리 갈래 `handlers` 를 `map` 안에서 순서대로 만드는 것은 Java 의 `for` 와 같은 순서(노드 배열 순서)다. Java 는 정상 갈래 → 처리 갈래 순으로 방문하므로 TS 도 `normal` 을 먼저 만든다(위 코드 순서 그대로).

`Position` 과 `FlowTree` 생성자·`relation`:
```ts
interface Position {
  /** 루트에서 이 노드까지 지나는 (분기 또는 받는 룰, 갈래 번호). 받는 룰은 0 = 정상 갈래, k+1 = k번째 처리 갈래(Ruling R8). */
  chain: ReadonlyArray<{ split: string; kind: "IF" | "PARALLEL" | "GUARD"; branch: number }>;
  /** 깊이 우선 순번(RULE·TASK·분기 노드). */
  order: number;
}
```
생성자 `walk` 의 `else if (b.type === "SPLIT") {…}` 앞에 넣는다.
```ts
        } else if (b.type === "GUARDED") {
          this.positions.set(b.rule.nodeId, { chain, order: counter++ });
          this.steps.push(b.rule);
          walk(b.normal, [...chain, { split: b.rule.nodeId, kind: "GUARD", branch: 0 }]);
          b.handlers.forEach((h, i) => walk(h.body, [...chain, { split: b.rule.nodeId, kind: "GUARD", branch: i + 1 }]));
```
`relation` 의 갈림 판정:
```ts
      if (x.branch !== y.branch) return x.kind === "PARALLEL" ? "PARALLEL" : "EXCLUSIVE";
```
주의: Java `step()` 은 RULE 의 `positions.put` 을 RULE·TASK·분기 공통으로 노드를 방문할 때 하고, TS 는 `FlowTree` 생성자가 트리를 걸으며 순번을 매긴다. 받는 룰은 두 쪽 모두 "룰 → 정상 갈래 → 처리 갈래" 순서로 번호를 받으므로 순번이 같다.

`types.ts` `RuleSetCheckCode` 의 `"EMPTY_TASK"` 앞에:
```ts
  /** 받는 노드 붙임·종류 오류(REJECT, 받는 노드 spec §5). `flow-model.ts` 구조 검사가 낸다. */
  | "FLOW_CATCH"
```

`set-model.ts` `pathChecks` 의 `walk`(321-336행) — `TASK` 줄 뒤에 임시 처리를 넣는다.
```ts
      else if (b.type === "GUARDED") {
        // SEAM(T4): 받는 룰의 정상·처리 갈래 경로 검사는 Task 4 가 넣는다. 지금은 룰만 보통 룰처럼 보고 갈래를 건너뛴다.
        rule(b.rule, s);
        walk(b.normal, s);
      }
```

`trace-view.ts` `scopePaths` 의 `walk`(103-114행) — `SEQ` 줄 뒤에 넣는다(받는 룰은 범위를 만들지 않는다 — IF 와 같다).
```ts
      else if (b.type === "GUARDED") {
        paths.set(b.rule.nodeId, path);
        if (b.mergeId) paths.set(b.mergeId, path);
        walk(b.normal, path);
        for (const h of b.handlers) {
          paths.set(h.catchNodeId, path);
          walk(h.body, path);
        }
      }
```

`flow-layout.ts` `bodyIds`(74-83행)와 `orderBranches` 의 `visit`(96-129행) — 받는 룰의 몸도 갈래 몸 ID 에 들고, 안쪽 분기도 정렬되게 걷는다.
```ts
function bodyIds(seq: Seq, out: string[] = []): string[] {
  for (const b of seq.items) {
    if (b.type === "SEQ") bodyIds(b, out);
    else if (b.type === "SPLIT") {
      out.push(b.nodeId, b.mergeId);
      for (const br of b.branches) bodyIds(br.body, out);
    } else if (b.type === "GUARDED") {
      out.push(b.rule.nodeId);
      if (b.mergeId) out.push(b.mergeId);
      bodyIds(b.normal, out);
      for (const h of b.handlers) {
        out.push(h.catchNodeId);
        bodyIds(h.body, out);
      }
    } else out.push(b.nodeId);
  }
  return out;
}
```
`orderBranches` 의 `visit` 첫 줄들:
```ts
    for (const b of seq.items) {
      if (b.type === "SEQ") visit(b);
      if (b.type === "GUARDED") {
        // 처리 갈래를 오른쪽에 두는 배치는 Task 7. 여기서는 안쪽 분기의 갈래 순서만 맞춘다.
        visit(b.normal);
        for (const h of b.handlers) visit(h.body);
        continue;
      }
      if (b.type !== "SPLIT") continue;
```

`rule-set-corpus.test.ts` — `CorpusFlowNode`(36-42행)에 `attachTo?: string | null; catches?: string[] | null;` 를 더하고, `flowOf`(79-91행)의 노드 만들기를 아래로 바꾼다.
```ts
  const nodes: FlowNode[] = f.nodes.map((n) => {
    const base: FlowNode = { id: n.id, kind: n.kind, ruleId: n.ruleId ?? null, splitId: n.splitId ?? null, label: n.label ?? null };
    return n.kind === "CATCH" ? { ...base, attachTo: n.attachTo ?? null, catches: n.catches ?? null } : base;
  });
```

- [ ] **Step 8: TS 통과 확인** — `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/flow-model.test.ts` → PASS. `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint` → 오류 0(`GUARDED` 를 빼먹은 걷기가 있으면 여기서 드러난다 — `grep -rn "b.type === \"SPLIT\"\|\.type === \"RULE\"" src/frontend/m-mdm/pages/dme/ruleSetEdit` 로 찾은 곳을 모두 본다).

- [ ] **Step 9: 구조 코퍼스 5사례** — `rule-set-corpus.json` 의 `cases` 끝에 아래 다섯을 더한다(모두 1단계·2단계 구조 오류라 트리가 없고 경로 검사를 하지 않는다). `rules` 의 룰은 모두 있고 RELEASED 라 존재 검사가 나오지 않는다. 트리가 없으므로 `ids` 는 RULE 노드 배열 순서다.

```json
    {
      "name": "받는 노드 — 붙은 룰이 없다(FLOW_CATCH)",
      "flow": {
        "version": 1,
        "nodes": [
          { "id": "start", "kind": "START" },
          { "id": "r1", "kind": "RULE", "ruleId": "C1" },
          { "id": "c1", "kind": "CATCH", "attachTo": "zz", "catches": ["NO_RESULT"] },
          { "id": "end", "kind": "END" }
        ],
        "edges": [
          { "id": "e1", "from": "start", "to": "r1" },
          { "id": "e2", "from": "r1", "to": "end" },
          { "id": "e3", "from": "c1", "to": "end" }
        ]
      },
      "ids": ["C1"],
      "rules": { "C1": { "exists": true, "status": "INUSE", "releasedVer": 1 } },
      "expect": {
        "io": { "inputs": [], "results": [] },
        "deps": { "C1": [] },
        "checks": [
          { "code": "FLOW_CATCH", "severity": "REJECT", "message": "받는 노드 c1가 붙은 룰 zz가 없다", "nodeId": "c1" }
        ]
      }
    },
    {
      "name": "받는 노드 — 빈 종류·모르는 키·한 룰에서 같은 종류 둘(FLOW_CATCH 순서)",
      "flow": {
        "version": 1,
        "nodes": [
          { "id": "start", "kind": "START" },
          { "id": "r1", "kind": "RULE", "ruleId": "C1" },
          { "id": "c1", "kind": "CATCH", "attachTo": "r1", "catches": [] },
          { "id": "c2", "kind": "CATCH", "attachTo": "r1", "catches": ["NO_RESULT", "BOOM"] },
          { "id": "c3", "kind": "CATCH", "attachTo": "r1", "catches": ["NO_RESULT"] },
          { "id": "end", "kind": "END" }
        ],
        "edges": [
          { "id": "e1", "from": "start", "to": "r1" },
          { "id": "e2", "from": "r1", "to": "end" },
          { "id": "e3", "from": "c1", "to": "end" },
          { "id": "e4", "from": "c2", "to": "end" },
          { "id": "e5", "from": "c3", "to": "end" }
        ]
      },
      "ids": ["C1"],
      "rules": { "C1": { "exists": true, "status": "INUSE", "releasedVer": 1 } },
      "expect": {
        "io": { "inputs": [], "results": [] },
        "deps": { "C1": [] },
        "checks": [
          { "code": "FLOW_CATCH", "severity": "REJECT", "message": "받는 노드 c1에 받을 예외 종류가 없다", "nodeId": "c1" },
          { "code": "FLOW_CATCH", "severity": "REJECT", "message": "받는 노드 c2의 예외 종류 BOOM를 모른다", "nodeId": "c2" },
          { "code": "FLOW_CATCH", "severity": "REJECT", "message": "룰 노드 r1에서 예외 종류 NO_RESULT를 c2와 c3가 함께 받는다", "nodeId": "c3" }
        ]
      }
    },
    {
      "name": "받는 노드 — 빈 단계에는 붙일 수 없다(FLOW_CATCH)",
      "flow": {
        "version": 1,
        "nodes": [
          { "id": "start", "kind": "START" },
          { "id": "t1", "kind": "TASK", "label": "빈 단계" },
          { "id": "c1", "kind": "CATCH", "attachTo": "t1", "catches": ["EVAL_ERROR"] },
          { "id": "end", "kind": "END" }
        ],
        "edges": [
          { "id": "e1", "from": "start", "to": "t1" },
          { "id": "e2", "from": "t1", "to": "end" },
          { "id": "e3", "from": "c1", "to": "end" }
        ]
      },
      "ids": [],
      "rules": {},
      "expect": {
        "io": { "inputs": [], "results": [] },
        "deps": {},
        "checks": [
          { "code": "EMPTY_TASK", "severity": "WARN", "message": "빈 단계 1개 — 실행 때 그냥 지나간다" },
          { "code": "FLOW_CATCH", "severity": "REJECT", "message": "받는 노드 c1는 룰 노드에만 붙일 수 있다(t1는 TASK)", "nodeId": "c1" }
        ]
      }
    },
    {
      "name": "받는 노드 — 처리 갈래가 다른 분기의 합류로 간다(FLOW_STRUCTURE 2단계)",
      "flow": {
        "version": 1,
        "nodes": [
          { "id": "start", "kind": "START" },
          { "id": "if9", "kind": "IF" },
          { "id": "r1", "kind": "RULE", "ruleId": "C1" },
          { "id": "c1", "kind": "CATCH", "attachTo": "r1", "catches": ["NO_RESULT"] },
          { "id": "m9", "kind": "MERGE", "splitId": "if9" },
          { "id": "end", "kind": "END" }
        ],
        "edges": [
          { "id": "e0", "from": "start", "to": "if9" },
          { "id": "b1", "from": "if9", "to": "r1", "order": 1, "cond": "X > 0" },
          { "id": "bo", "from": "if9", "to": "m9", "otherwise": true },
          { "id": "e1", "from": "r1", "to": "m9" },
          { "id": "e2", "from": "c1", "to": "m9" },
          { "id": "e3", "from": "m9", "to": "end" }
        ]
      },
      "ids": ["C1"],
      "rules": { "C1": { "exists": true, "status": "INUSE", "releasedVer": 1 } },
      "expect": {
        "io": { "inputs": [], "results": [] },
        "deps": { "C1": [] },
        "checks": [
          { "code": "FLOW_STRUCTURE", "severity": "REJECT", "message": "처리 갈래 c1가 끝에 닿지 않고 m9로 나간다", "nodeId": "m9" }
        ]
      }
    },
    {
      "name": "받는 노드 — 처리 갈래 안 IF 갈래는 END 로 못 간다(지금 문구, 편차 F7)",
      "flow": {
        "version": 1,
        "nodes": [
          { "id": "start", "kind": "START" },
          { "id": "r1", "kind": "RULE", "ruleId": "C1" },
          { "id": "c1", "kind": "CATCH", "attachTo": "r1", "catches": ["NO_RESULT"] },
          { "id": "if1", "kind": "IF" },
          { "id": "m2", "kind": "MERGE", "splitId": "if1" },
          { "id": "mr", "kind": "MERGE", "splitId": "r1" },
          { "id": "end", "kind": "END" }
        ],
        "edges": [
          { "id": "e1", "from": "start", "to": "r1" },
          { "id": "e2", "from": "r1", "to": "mr" },
          { "id": "e3", "from": "c1", "to": "if1" },
          { "id": "b1", "from": "if1", "to": "end", "order": 1, "cond": "X > 0" },
          { "id": "b2", "from": "if1", "to": "m2", "order": 2, "cond": "X > 1" },
          { "id": "bo", "from": "if1", "to": "m2", "otherwise": true },
          { "id": "e4", "from": "m2", "to": "mr" },
          { "id": "e5", "from": "mr", "to": "end" }
        ]
      },
      "ids": ["C1"],
      "rules": { "C1": { "exists": true, "status": "INUSE", "releasedVer": 1 } },
      "expect": {
        "io": { "inputs": [], "results": [] },
        "deps": { "C1": [] },
        "checks": [
          { "code": "FLOW_STRUCTURE", "severity": "REJECT", "message": "갈래가 m2에서 닫히지 않고 end로 나간다", "nodeId": "end" }
        ]
      }
    }
```
세 번째 사례(빈 단계): `flowRuleIds` 가 빈 목록이라 `ids`·`deps` 가 비고, 존재 검사가 없으며, RULE 은 없지만 TASK 가 있어 `EMPTY` 는 나지 않고 `EMPTY_TASK` 가 먼저 나온 뒤 구조 오류다(`RuleSetAnalyzer.checks` 순서: 존재 → EMPTY → EMPTY_TASK → 구조).

`RuleSetCorpusTest.java:43` 과 `rule-set-corpus.test.ts:20` 의 `MIN_CASES` 를 `59` 로 올린다.

- [ ] **Step 10: 코퍼스 통과 확인(두 언어)** — `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetCorpusTest' --console=plain)` → PASS(사례 59 + 퍼즈 200). `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/rule-set-corpus.test.ts` → PASS. 둘 중 하나만 실패하면 그 언어의 문구·순서를 위 표에 맞춘다(코퍼스 기대를 고치지 않는다).

- [ ] **Step 11: 전체 확인** — 엔진·lib 전체, `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test` 의 합계 줄, lint 0, 바꾼 화면 `.ts` 파일(`flow-model.ts`·`set-model.ts`·`trace-view.ts`·`flow-layout.ts`·`types.ts`)에 mantine-aggrid-ui audit 두 개 0건.

- [ ] **Step 12: 커밋**

```
/usr/bin/git add src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/Guarded.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/Block.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowParser.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowTree.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/package-info.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowKeys.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowParserTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowTreeTest.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJson.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCheck.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJsonTest.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-model.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts
/usr/bin/git commit -m "feat(mdm-engine): 받는 노드 구조 해석 — Guarded 블록·FLOW_CATCH·FLOW_JSON attachTo/catches·구조 코퍼스" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/Guarded.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/Block.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowParser.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowTree.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/package-info.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowKeys.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowParserTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowTreeTest.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJson.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCheck.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJsonTest.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-model.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts
```

---

### Task 3: 엔진 실행 — 받기·처리 갈래·돌아옴·끝냄·`CATCH_*`·`caught`·`endedBy`·입력 키 사전 검사

**권장 모델:** opus — ctx 범위(직전 ctx 되돌림·`CATCH_*` 넣고 되찾기)·병렬 갈래 사본·끝냄 신호·기록 시점·E4 고친 값이 얽힌 실행 의미다.
**병렬:** Task 2 뒤. Task 4·6·7 과 함께 돌 수 있다(겹치는 파일 없음). Task 5 는 이 태스크 뒤.

**이 태스크가 정한 것:**
- `rule` 패키지에 새 **record·enum 을 만들지 않는다.** `EngineContractSchemaTest.expr_rule_패키지의_record_enum_은…`(237-257행)가 rule 패키지의 모든 record·enum 을 계약 대조표와 견주므로, 내부 값 묶음(`Caught`)·신호(`Ended`)는 `final class` 다(`MdmRuleEngine.Prepared` 와 같은 방식).
- 받는 룰이 성공하면 받는 노드 없는 룰과 같은 경로·기록·`steps` 를 낸다(R7). 받아 처리하면 `steps` 에 넣지 않는다.
- 정상 갈래 입력 키 검사는 **룰 결과를 넣기 전** 에 "ctx 키 ∪ 결과 이름" 으로 한다. 그래서 실패하면 그 룰 노드가 ERROR 로 한 번만 남고, 받는 노드의 `INPUT_ERROR` 로 잘못 넘어가지 않는다(검사는 받기 `try` 밖이다).

**Files:**
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java`(전체)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowKeys.java:33-39,110-246`(머리 javadoc, `walk`·`sureProduced`·`allProduced`, 새 `ruleKeys`·`guardSure`·`produced`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java:72-114`(`caught`·`endedBy` 싣기)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RecordKeys.java:30-39`(`CATCH_*` 레코드 키 → `RESERVED_KEY`)
- Create(Test): `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetCatchTest.java`

**Interfaces:**
- Consumes(Task 1·2): `Guarded`·`Guarded.Handler`·`handlerFor`, `CatchKind.ofCode`·`NO_RESULT_CODE`·`NO_RESULT_MESSAGE`, `RuleSetResult.CaughtException`, `RunTrace.NodeStatus.CAUGHT`, `NodeTrace` 의 `catchKind`·`code`·`message`, `ReservedNames.CATCH_*`, `FlowFixtures.catchNode`·`guardMerge`.
- Produces:
  - `MdmRuleEngine.evaluateSet` → `RuleSetResult.caught`(실행 순서)·`endedBy`.
  - `MdmRuleEngine.traceSet` → `RunTrace.endedBy`, 노드 기록 `CAUGHT` 룰·`CATCH` 노드(R1·R2), 돌아오는 MERGE 기록 `splitId` = 받는 룰 노드 ID, `merged` = null.
  - 레코드 키 `CATCH_KIND`·`CATCH_RULE`·`CATCH_CODE`·`CATCH_MSG`(대소문자 무시) → `SET_CHECK/RESERVED_KEY`(문구 `레코드 키 '{키}' 는 받는 노드 예약 이름이다`).
  - 패키지 내부(하위 세트 호출 계획이 넓힌다): `FlowRun.Ended`(끝냄 신호, `catchNodeId`), `FlowRun.Caught`(받을 실패 묶음), `FlowRun.guarded(Guarded, ctx, made)`.

- [ ] **Step 1: 실패 시험** — `RuleSetCatchTest.java` 를 만든다.

```java
package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.condVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.contract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.decision;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.derive;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.expr;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.op;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.resultVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.row;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rowContract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.val;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.vt;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.vts;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.catchNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.guardMerge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.par;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.pe;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.flow.CatchKind;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult.CaughtException;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeStatus;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeTrace;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.TraceEdit;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Test;

/** 받는 노드 spec §4·§10 — 받기·처리 갈래·돌아옴·끝냄·CATCH_*·caught·endedBy·입력 키 사전 검사. evaluateSet 과 traceSet 을 함께 본다. */
class RuleSetCatchTest {

    /** X(NUMBER) > 9 이면 G="HI", 아니면 맞는 행 없음(기본 행 없음 → 결과 없음). */
    static RuleDefinition grade(String id, HitPolicy policy) {
        return CellTextGenerator.withTexts(decision(id, 1, policy, FlowRules.FROM,
                List.of(condVar(1, DispType.ONE, "X", DataType.NUMBER, 1), resultVar(2, DispType.VALUE, "G", DataType.STRING, 2)),
                contract(vts("X", DataType.NUMBER)),
                row(1, 1, 1, op("GT", "9"), 2, val("HI")),
                row(2, 2, 1, op("GT", "99"), 2, val("TOP"))), d -> null);
    }

    /** {@code result = input}(STRING) — 처리 갈래가 CATCH_* 를 읽는지 본다. */
    static RuleDefinition echo(String id, String result, String input) {
        return CellTextGenerator.withTexts(derive(id, 1, FlowRules.FROM,
                List.of(resultVar(1, DispType.EXPRESSION, result, DataType.STRING, 1)),
                contract(List.of(), rowContract(1, List.of(vt(input, DataType.STRING)))),
                row(1, 1, 1, expr(input))), d -> null);
    }

    private final InMemoryDefinitionLookup lookup = FlowRules.lookup(
            grade("R_G", HitPolicy.FIRST), grade("R_U", HitPolicy.UNIQUE), calc("R_A", "A", "X + 1", "X"), calc("R_B", "B", "X + 2", "X"),
            calc("R_ERR", "E", "X / 0", "X"), calc("R_FILL", "G", "0"), calc("R_AFTER", "Z", "X * 2", "X"),
            echo("R_CODE", "CODE", "CATCH_CODE"), echo("R_KIND", "KIND", "CATCH_KIND"));
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

    /** start → r1(ruleId) → mr → after(R_AFTER) → end. c1(kinds) → h(handler) → mr. */
    static FlowDefinition returning(String ruleId, String handler, String... kinds) {
        return flow(List.of(start(), rule("r1", ruleId), catchNode("c1", "r1", kinds), rule("h", handler), guardMerge("mr", "r1"),
                        rule("after", "R_AFTER"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "h"), e("e4", "h", "mr"), e("e5", "mr", "after"),
                        e("e6", "after", "end")));
    }

    // ── 돌아옴 ──

    @Test
    void 결과_없음을_받아_처리_갈래가_기본값을_채우고_돌아온다() {
        RuleSetResult r = run(returning("R_G", "R_FILL", "NO_RESULT"), rec("X", new BigDecimal("5")));
        assertNum("0", r.finalValues().get("G"));
        assertNum("10", r.finalValues().get("Z"));
        assertEquals(List.of(new CaughtException("r1", "R_G", "c1", CatchKind.NO_RESULT, "NO_RESULT", "맞는 행과 기본 행이 없다")), r.caught());
        assertNull(r.endedBy());
        assertEquals(List.of("start:START:null", "r1:RULE:null", "c1:CATCH:null", "h:RULE:0", "mr:MERGE:null", "after:RULE:1", "end:END:null"), path(r));
        assertEquals(List.of("R_FILL", "R_AFTER"), r.steps().stream().map(RuleResult::ruleId).toList());
    }

    @Test
    void 결과가_있으면_받는_노드_없는_룰과_같고_정상_갈래로_간다() {
        RuleSetResult r = run(returning("R_G", "R_FILL", "NO_RESULT"), rec("X", new BigDecimal("50")));
        assertEquals("HI", r.finalValues().get("G"));
        assertEquals(List.of(), r.caught());
        assertEquals(List.of("start:START:null", "r1:RULE:0", "mr:MERGE:null", "after:RULE:1", "end:END:null"), path(r));
        RunTrace t = trace(returning("R_G", "R_FILL", "NO_RESULT"), rec("X", new BigDecimal("50")));
        assertEquals(List.of("1:start:START:OK", "2:r1:RULE:OK", "3:mr:MERGE:OK", "4:after:RULE:OK", "5:end:END:OK"), kinds(t));
        assertEquals("r1", t.nodes().get(2).splitId());
        assertNull(t.nodes().get(2).merged());
    }

    @Test
    void 받는_노드_없으면_결과_없음은_NULL_로_진행한다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_G"), rule("after", "R_AFTER"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "after"), e("e3", "after", "end")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("5")));
        assertTrue(r.finalValues().containsKey("G"));
        assertNull(r.finalValues().get("G"));
        assertEquals(List.of(), r.caught());
    }

    @Test
    void 받는_노드_없으면_실패는_세트를_멈춘다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_ERR"), end()), List.of(e("e1", "start", "r1"), e("e2", "r1", "end")));
        EngineEvaluationException ex = assertThrows(EngineEvaluationException.class, () -> run(f, rec("X", BigDecimal.ONE)));
        assertEquals(Code.EVALUATION_ERROR, ex.violations().get(0).code());
    }

    // ── 종류별 받기 ──

    @Test
    void 계산_오류는_EVAL_ERROR_로_받는다() {
        RuleSetResult r = run(returning("R_ERR", "R_FILL", "EVAL_ERROR"), rec("X", BigDecimal.ONE));
        CaughtException c = r.caught().get(0);
        assertEquals(CatchKind.EVAL_ERROR, c.kind());
        assertEquals("EVALUATION_ERROR", c.code());
        assertFalse(r.finalValues().containsKey("E"));
    }

    @Test
    void 판정_충돌은_HIT_CONFLICT_로_받는다() {
        RuleSetResult r = run(returning("R_U", "R_FILL", "HIT_CONFLICT"), rec("X", new BigDecimal("500")));
        assertEquals(CatchKind.HIT_CONFLICT, r.caught().get(0).kind());
        assertEquals("UNIQUE_MULTIPLE_HITS", r.caught().get(0).code());
    }

    @Test
    void 타입_변환_오류는_INPUT_ERROR_로_받는다() {
        // 뒤 R_AFTER 도 X 를 숫자로 바꾸므로 뒤 룰 없는 흐름으로 본다.
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_G"), catchNode("c1", "r1", "INPUT_ERROR"), rule("h", "R_FILL"), guardMerge("mr", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "h"), e("e4", "h", "mr"), e("e5", "mr", "end")));
        RuleSetResult r = run(f, rec("X", "abc"));
        assertEquals(CatchKind.INPUT_ERROR, r.caught().get(0).kind());
        assertEquals("TYPE_CONVERSION", r.caught().get(0).code());
    }

    @Test
    void INPUT_ERROR_를_받는_룰의_입력은_사전_검사에서_빠지고_실행_직전에_MISSING_KEY_로_받는다() {
        // R_A 는 X 를 읽는다. 레코드에 X 가 없다. 받는 노드 없이는 세트 시작 때 SET_CHECK/MISSING_KEY 로 멈춘다.
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_A"), catchNode("c1", "r1", "INPUT_ERROR"), rule("h", "R_FILL"), guardMerge("mr", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "h"), e("e4", "h", "mr"), e("e5", "mr", "end")));
        RuleSetResult r = run(f, rec("Y", BigDecimal.ONE));
        assertEquals(CatchKind.INPUT_ERROR, r.caught().get(0).kind());
        assertEquals("MISSING_KEY", r.caught().get(0).code());
        assertNum("0", r.finalValues().get("G"));
        // 같은 이름(X)을 받는 노드 없는 다른 룰도 반드시 읽으면 사전 검사에 남는다.
        FlowDefinition both = flow(List.of(start(), rule("r1", "R_A"), catchNode("c1", "r1", "INPUT_ERROR"), rule("h", "R_FILL"), guardMerge("mr", "r1"),
                        rule("r2", "R_B"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "h"), e("e4", "h", "mr"), e("e5", "mr", "r2"), e("e6", "r2", "end")));
        EngineEvaluationException ex = assertThrows(EngineEvaluationException.class, () -> run(both, rec("Y", BigDecimal.ONE)));
        assertEquals("SET_CHECK/MISSING_KEY/R_B", ex.violations().get(0).stage() + "/" + ex.violations().get(0).code() + "/" + ex.violations().get(0).ruleId());
    }

    @Test
    void 받지_않는_종류는_받는_노드가_있어도_멈춘다() {
        EngineEvaluationException ex = assertThrows(EngineEvaluationException.class,
                () -> run(returning("R_U", "R_FILL", "EVAL_ERROR"), rec("X", new BigDecimal("500"))));
        assertEquals(Code.UNIQUE_MULTIPLE_HITS, ex.violations().get(0).code());
        FlowDefinition missing = returning("R_NONE", "R_FILL", "INPUT_ERROR", "EVAL_ERROR");
        EngineEvaluationException nf = assertThrows(EngineEvaluationException.class, () -> run(missing, rec("X", BigDecimal.ONE)));
        assertEquals(Code.RULE_NOT_FOUND, nf.violations().get(0).code());
    }

    @Test
    void 한_룰에_받는_노드_둘이면_종류로_고른다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_G"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "R_FILL"),
                        catchNode("c2", "r1", "INPUT_ERROR", "EVAL_ERROR"), guardMerge("mr", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "h"), e("e4", "h", "mr"), e("e5", "c2", "end"), e("e6", "mr", "end")));
        RuleSetResult noResult = run(f, rec("X", new BigDecimal("5")));
        assertEquals("c1", noResult.caught().get(0).catchNodeId());
        assertNull(noResult.endedBy());
        RuleSetResult bad = run(f, rec("X", "abc"));
        assertEquals("c2", bad.caught().get(0).catchNodeId());
        assertEquals("c2", bad.endedBy());
    }

    // ── 끝냄 ──

    @Test
    void 처리_갈래가_END_에_닿으면_세트를_끝내고_endedBy_를_남긴다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_ERR"), catchNode("c1", "r1", "EVAL_ERROR"), rule("h", "R_FILL"), rule("after", "R_AFTER"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "after"), e("e3", "c1", "h"), e("e4", "h", "end"), e("e5", "after", "end")));
        RuleSetResult r = run(f, rec("X", BigDecimal.ONE));
        assertEquals("c1", r.endedBy());
        assertEquals(List.of("start:START:null", "r1:RULE:null", "c1:CATCH:null", "h:RULE:0", "end:END:null"), path(r));
        assertFalse(r.finalValues().containsKey("Z"));
        RunTrace t = trace(f, rec("X", BigDecimal.ONE));
        assertEquals("c1", t.endedBy());
        assertNull(t.violations());
        assertEquals(List.of("1:start:START:OK", "2:r1:RULE:CAUGHT", "3:c1:CATCH:OK", "4:h:RULE:OK", "5:end:END:OK"), kinds(t));
    }

    @Test
    void 병렬_갈래_안에서_끝내면_남은_형제는_돌지_않고_finalValues_는_끝난_형제와_지금_갈래다() {
        // start → p1 [1 → a(R_A)] [2 → g(R_G, c1 NO_RESULT → f(R_FILL) → end)] [3 → b(R_B)] → pm → end
        FlowDefinition f = flow(List.of(start(), par("p1"), rule("a", "R_A"), rule("g", "R_G"), catchNode("c1", "g", "NO_RESULT"), rule("f", "R_FILL"),
                        rule("b", "R_B"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), pe("p1a", "p1", "a", 1), pe("p1g", "p1", "g", 2), pe("p1b", "p1", "b", 3), e("ea", "a", "pm"),
                        e("eg", "g", "pm"), e("ec", "c1", "f"), e("ef", "f", "end"), e("eb", "b", "pm"), e("ee", "pm", "end")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("5")));
        assertEquals("c1", r.endedBy());
        assertEquals(List.of("A", "G"), List.copyOf(r.finalValues().keySet()));
        assertNum("6", r.finalValues().get("A"));
        assertNum("0", r.finalValues().get("G"));
        assertEquals(List.of("R_A", "R_FILL"), r.steps().stream().map(RuleResult::ruleId).toList());
        RunTrace t = trace(f, rec("X", new BigDecimal("5")));
        assertEquals(r.path().stream().map(RuleSetResult.PathStep::nodeId).toList(), t.nodes().stream().map(NodeTrace::nodeId).toList());
        assertEquals(r.finalValues().keySet(), t.finalValues().keySet());
    }

    // ── ctx ──

    @Test
    void 처리_갈래는_룰_직전_ctx_를_읽는다() {
        // R_G 는 X 를 NUMBER 로 바꿔 ctx 에 넣는다. 받으면 처리 갈래는 바꾸기 전 값("5" 문자열)을 읽어야 한다.
        RunTrace t = trace(returning("R_G", "R_A", "NO_RESULT"), rec("X", "5"));
        NodeTrace h = t.nodes().stream().filter(n -> n.nodeId().equals("h")).findFirst().orElseThrow();
        assertInstanceOf(String.class, h.reads().get("X"));
        assertEquals("5", h.reads().get("X"));
    }

    @Test
    void CATCH_값은_처리_갈래에서만_있고_finalValues_에_없다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_G"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "R_CODE"), guardMerge("mr", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "h"), e("e4", "h", "mr"), e("e5", "mr", "end")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("5")));
        assertEquals("NO_RESULT", r.finalValues().get("CODE"));
        for (String k : r.finalValues().keySet()) {
            assertFalse(k.startsWith("CATCH_"), k);
        }
    }

    @Test
    void 중첩_처리_갈래는_안쪽_합류_뒤_바깥_CATCH_값을_되찾는다() {
        // r1(R_ERR) c1 EVAL_ERROR → h1(R_G) [c9 NO_RESULT → f(R_FILL) → mi] → mi → k(R_CODE) → mr → end
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_ERR"), catchNode("c1", "r1", "EVAL_ERROR"), rule("h1", "R_G"), catchNode("c9", "h1", "NO_RESULT"),
                        rule("f", "R_FILL"), guardMerge("mi", "h1"), rule("k", "R_CODE"), guardMerge("mr", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "h1"), e("e4", "h1", "mi"), e("e5", "c9", "f"), e("e6", "f", "mi"),
                        e("e7", "mi", "k"), e("e8", "k", "mr"), e("e9", "mr", "end")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("5")));
        assertEquals("EVALUATION_ERROR", r.finalValues().get("CODE"));
        assertEquals(List.of("c1", "c9"), r.caught().stream().map(CaughtException::catchNodeId).toList());
    }

    @Test
    void 기록은_CAUGHT_룰과_CATCH_노드를_남긴다() {
        RunTrace t = trace(returning("R_G", "R_FILL", "NO_RESULT"), rec("X", new BigDecimal("5")));
        assertEquals(List.of("1:start:START:OK", "2:r1:RULE:CAUGHT", "3:c1:CATCH:OK", "4:h:RULE:OK", "5:mr:MERGE:OK", "6:after:RULE:OK", "7:end:END:OK"), kinds(t));
        NodeTrace r1 = t.nodes().get(1);
        assertEquals("R_G", r1.ruleId());
        assertNull(r1.result());
        assertEquals(List.of(), r1.violations());
        NodeTrace c1 = t.nodes().get(2);
        assertEquals(NodeKind.CATCH, c1.kind());
        assertEquals("R_G", c1.ruleId());
        assertEquals(CatchKind.NO_RESULT, c1.catchKind());
        assertEquals("NO_RESULT", c1.code());
        assertEquals("맞는 행과 기본 행이 없다", c1.message());
        assertNull(t.endedBy());
        RunTrace bad = trace(returning("R_ERR", "R_FILL", "EVAL_ERROR"), rec("X", BigDecimal.ONE));
        assertEquals(NodeStatus.CAUGHT, bad.nodes().get(1).status());
        assertEquals(Code.EVALUATION_ERROR, bad.nodes().get(1).violations().get(0).code());
    }

    @Test
    void 고친_값은_CATCH_노드_직전에도_넣을_수_있고_처리_갈래가_그_값을_읽는다() {
        // 고친 값 X=100 을 CATCH 노드(seq 3) 직전에 넣으면 처리 갈래 R_A 가 A=101 을 만든다.
        RunTrace t = engine.traceSet(new RuleSetDefinition("DRAFT", List.of(), SetStatus.INUSE, returning("R_G", "R_A", "NO_RESULT")),
                rec("X", new BigDecimal("5")), SampleRules.EVAL_TS, List.of(new TraceEdit(3, "c1", Map.of("X", new BigDecimal("100")))));
        assertNull(t.violations());
        assertNum("101", t.finalValues().get("A"));
    }

    @Test
    void CATCH_예약_이름은_레코드_키로_오면_RESERVED_KEY_다() {
        EngineEvaluationException ex = assertThrows(EngineEvaluationException.class,
                () -> run(returning("R_G", "R_FILL", "NO_RESULT"), rec("X", BigDecimal.ONE, "catch_kind", "x")));
        assertEquals(Code.RESERVED_KEY, ex.violations().get(0).code());
        assertEquals("레코드 키 'catch_kind' 는 받는 노드 예약 이름이다", ex.violations().get(0).message());
    }
}
```

- [ ] **Step 2: 실패 확인** — `(cd src/backend/maru-mdm-engine && ../gradlew test --tests '*RuleSetCatchTest' --console=plain)` → 컴파일은 된다(Task 1·2 의 이름만 쓴다). 받는 노드가 있는 사례는 Task 2 가 넣어 둔 `// SEAM(T3)` 의 `UnsupportedOperationException` 으로 FAIL, `RESERVED_KEY` 사례는 검사가 아직 없어 FAIL, 받는 노드 없는 두 사례(`받는_노드_없으면_…`)는 지금도 PASS 다.

- [ ] **Step 3: `FlowRun.java` 를 아래로 바꾼다.**

```java
package kr.dongkuk.maru.mdm.engine.rule;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.flow.Block;
import kr.dongkuk.maru.mdm.engine.flow.Branch;
import kr.dongkuk.maru.mdm.engine.flow.CatchKind;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.flow.Guarded;
import kr.dongkuk.maru.mdm.engine.flow.RuleStep;
import kr.dongkuk.maru.mdm.engine.flow.Seq;
import kr.dongkuk.maru.mdm.engine.flow.Split;
import kr.dongkuk.maru.mdm.engine.flow.TaskStep;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult.CaughtException;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult.PathStep;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.BranchOutcome;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.BranchTrace;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeStatus;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeTrace;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.TraceEdit;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;

/**
 * 흐름 실행 한 번(룰 세트 흐름도 spec §4, plan C5). 블록 트리를 따라가며 ctx 에 룰 결과를 덮어쓴다. IF 는 처음 참인 갈래 하나,
 * 병렬은 분기 직전 ctx 사본에서 갈래를 order 순으로 하나씩 실행하고 끝나면 갈래 순서대로 합친다(같은 이름이면 뒤 갈래가 이긴다).
 * 빈 단계(TASK)는 아무것도 읽거나 만들지 않고 지나간다(4단계 spec §1.1).
 * 실행 중 위반은 {@link EngineEvaluationException} 으로 던진다. {@code tracing} 이면 노드마다 {@link NodeTrace} 를 남기고,
 * 던지기 직전 처리 중이던 노드를 {@link #failed} 로 ERROR 기록할 수 있게 둔다.
 *
 * <p>받는 룰(받는 노드 spec §4): 룰이 실패했거나 결과가 없는데 그 종류를 받는 노드가 있으면 룰 결과를 ctx 에 쓰지 않고 룰 직전 ctx 로
 * 되돌린 뒤 CATCH_* 넷을 넣고 처리 갈래를 실행한다. 돌아오는 MERGE 에서 CATCH_* 를 룰 직전 값으로 되돌리고(중첩이면 바깥 값, R4), 처리 갈래가
 * END 에 닿으면 {@link Ended} 로 세트를 끝낸다(R5). 받는 노드가 없으면 지금처럼 실패는 멈춤, 결과 없음은 NULL 결과로 진행한다(X-D3).
 *
 * <p>고친 값(4단계 spec §2.2): 노드를 시작할 때 다음 순번({@code nodes.size() + 1})이 {@code beforeSeq} 인 고친 값을 그 노드 범위의 ctx 에
 * {@link RecordKeys#putReplacing} 으로 넣고, 같은 이름(대소문자 무시)이 그 범위 made 에 있으면 made 도 같은 방법으로 바꾼다. 자리의 노드 ID 가
 * 다르면 {@code EDIT_POINT_MISMATCH} 로 멈춘다. 순번은 기록 노드 수로 세므로 고친 값은 {@code tracing} 에서만 받는다.
 */
final class FlowRun {

    /** CATCH_* 넷의 고정 순서 — ctx 에 넣고 되돌릴 때 이 순서로 쓴다. */
    private static final List<String> CATCH_ORDER =
            List.of(ReservedNames.CATCH_KIND, ReservedNames.CATCH_RULE, ReservedNames.CATCH_CODE, ReservedNames.CATCH_MSG);

    /** 처리 갈래가 END 에 닿았다 — 위반이 아닌 제어 신호(R5). {@link #run} 이 받는다. */
    static final class Ended extends RuntimeException {
        private static final long serialVersionUID = 1L;
        final String catchNodeId;

        Ended(String catchNodeId) {
            super(null, null, false, false);
            this.catchNodeId = catchNodeId;
        }
    }

    /** 받는 노드로 넘길 실패 하나. record 가 아니다 — rule 패키지 record 는 계약 대조표(EngineContractSchemaTest)에 올라야 한다. */
    static final class Caught {
        final Guarded.Handler handler;
        final CatchKind kind;
        final String code;
        final String message;
        final List<Violation> violations;

        Caught(Guarded.Handler handler, CatchKind kind, String code, String message, List<Violation> violations) {
            this.handler = handler;
            this.kind = kind;
            this.code = code;
            this.message = message;
            this.violations = violations;
        }
    }

    private final RuleEvaluator evaluator;
    private final ExpressionRunner runner;
    private final FlowTree tree;
    private final Map<String, RuleDefinition> defs;
    private final FlowKeys keys;
    private final Instant ts;
    private final boolean tracing;
    private final List<TraceEdit> edits;
    /** edits 와 같은 자리 — 그 고친 값을 넣었는가. */
    private final boolean[] used;

    final Map<String, Object> ctx;
    /** 최상위에서 만든 결과 = RuleSetResult.finalValues / RunTrace.finalValues. */
    final Map<String, Object> finalValues = new LinkedHashMap<>();
    final List<RuleResult> steps = new ArrayList<>();
    final List<PathStep> path = new ArrayList<>();
    final List<EngineWarning> warnings = new ArrayList<>();
    final List<NodeTrace> nodes = new ArrayList<>();
    /** 받아 처리한 exception, 실행 순서(받는 노드 spec §6). */
    final List<CaughtException> caught = new ArrayList<>();
    /** 처리 갈래가 END 로 끝냈으면 그 CATCH 노드 ID. */
    String endedBy;

    // 지금 처리 중인 노드 — 실행 중 위반이 나면 traceSet 이 ERROR 노드로 남긴다.
    private String curNodeId;
    private NodeKind curKind;
    private String curRuleId;
    private Integer curVer;
    private Map<String, Object> curReads;
    private List<BranchTrace> curBranches;
    private String curChosen;

    FlowRun(RuleEvaluator evaluator, ExpressionRunner runner, FlowTree tree, Map<String, RuleDefinition> defs, FlowKeys keys,
            Map<String, Object> record, Instant ts, boolean tracing, List<TraceEdit> edits) {
        if (!tracing && !edits.isEmpty()) {
            throw new IllegalArgumentException("고친 값은 기록 실행(traceSet)에서만 쓴다");
        }
        this.evaluator = evaluator;
        this.runner = runner;
        this.tree = tree;
        this.defs = defs;
        this.keys = keys;
        this.ts = ts;
        this.tracing = tracing;
        this.edits = List.copyOf(edits);
        this.used = new boolean[this.edits.size()];
        this.ctx = new LinkedHashMap<>(record);
    }

    void run() {
        plain(tree.startId(), NodeKind.START, ctx, finalValues);
        try {
            seq(tree.root(), ctx, finalValues);
        } catch (Ended e) {
            endedBy = e.catchNodeId;
        }
        restoreCatch(ctx, Map.of()); // END 에 닿으면 CATCH_* 를 뺀다(R3)
        plain(tree.endId(), NodeKind.END, ctx, finalValues);
    }

    /** 처리 중이던 노드의 ERROR 기록. */
    NodeTrace failed(List<Violation> violations) {
        return new NodeTrace(nodes.size() + 1, curNodeId, curKind, NodeStatus.ERROR, curRuleId, curVer, curReads, null,
                curBranches == null ? null : List.copyOf(curBranches), curChosen, null, null, null, List.copyOf(violations), null, null, null);
    }

    /** 정상 완료 뒤 쓰이지 않은 고친 값마다 위반 하나(없으면 빈 목록). 실행 중 오류로 멈춘 경우에는 부르지 않는다. 끝냄(R5)은 정상 완료다. */
    List<Violation> unusedEdits() {
        List<Violation> out = new ArrayList<>();
        for (int i = 0; i < edits.size(); i++) {
            if (!used[i]) {
                TraceEdit e = edits.get(i);
                out.add(editViolation(e, "고친 값이 쓰이지 않았다: " + e.beforeSeq() + "번째 노드(" + e.nodeId() + ") 앞에 닿기 전에 실행이 끝났다"));
            }
        }
        return out;
    }

    private void begin(String nodeId, NodeKind kind) {
        curNodeId = nodeId;
        curKind = kind;
        curRuleId = null;
        curVer = null;
        curReads = null;
        curBranches = null;
        curChosen = null;
    }

    /** 지금 시작한 노드(순번 nodes.size()+1)에 걸린 고친 값을 그 범위 ctx·made 에 넣는다(4단계 spec §2.2 퍼짐 규칙). */
    private void edit(Map<String, Object> ctx, Map<String, Object> made) {
        if (edits.isEmpty()) {
            return;
        }
        int seq = nodes.size() + 1;
        for (int i = 0; i < edits.size(); i++) {
            TraceEdit e = edits.get(i);
            if (e.beforeSeq() != seq) {
                continue;
            }
            if (!curNodeId.equals(e.nodeId())) {
                throw new EngineEvaluationException(List.of(editViolation(e, "고친 값 자리가 어긋났다: " + seq + "번째 노드는 " + curNodeId
                        + " 인데 고친 값은 " + e.nodeId() + " 앞에 걸려 있다")));
            }
            used[i] = true;
            for (Map.Entry<String, Object> v : e.values().entrySet()) {
                RecordKeys.putReplacing(ctx, v.getKey(), v.getValue());
                if (hasIgnoreCase(made, v.getKey())) {
                    RecordKeys.putReplacing(made, v.getKey(), v.getValue());
                }
            }
        }
    }

    private static boolean hasIgnoreCase(Map<String, Object> m, String name) {
        for (String k : m.keySet()) {
            if (k.equalsIgnoreCase(name)) {
                return true;
            }
        }
        return false;
    }

    private static Violation editViolation(TraceEdit e, String message) {
        return new Violation(Stage.INPUT_CHECK, Code.EDIT_POINT_MISMATCH, null, null, e.nodeId(), message);
    }

    /** 칸 없는 노드(START·END·TASK). */
    private void plain(String nodeId, NodeKind kind, Map<String, Object> ctx, Map<String, Object> made) {
        begin(nodeId, kind);
        edit(ctx, made);
        path.add(new PathStep(nodeId, kind, null, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, nodeId, kind, NodeStatus.OK, null, null, null, null, null, null, null,
                    null, null, null, null, null, null));
        }
    }

    private void seq(Seq seq, Map<String, Object> ctx, Map<String, Object> made) {
        for (Block b : seq.items()) {
            switch (b) {
                case RuleStep r -> rule(r, ctx, made);
                case TaskStep t -> plain(t.nodeId(), NodeKind.TASK, ctx, made);
                case Guarded g -> guarded(g, ctx, made);
                case Split s when s.kind() == NodeKind.IF -> ifSplit(s, ctx, made);
                case Split s -> parallel(s, ctx, made);
                case Seq inner -> seq(inner, ctx, made);
            }
        }
    }

    private void rule(RuleStep r, Map<String, Object> ctx, Map<String, Object> made) {
        RuleDefinition def = startRule(r, ctx, made);
        throwMissing(r, def, ctx);
        accept(r, evaluator.evaluate(def, ctx, ts), ctx, made);
    }

    /** 룰 노드 시작 — begin·고친 값·읽은 값(기록). */
    private RuleDefinition startRule(RuleStep r, Map<String, Object> ctx, Map<String, Object> made) {
        RuleDefinition def = defs.get(r.ruleId());
        begin(r.nodeId(), NodeKind.RULE);
        curRuleId = r.ruleId();
        curVer = def.ver();
        edit(ctx, made);
        if (tracing) {
            curReads = FlowKeys.reads(def, ctx);
        }
        return def;
    }

    /** 지연 입력 키(IF 일부 갈래에서만 만든 이름, INPUT_ERROR 를 받는 룰의 입력)가 ctx 에 없으면 SET_CHECK/MISSING_KEY. */
    private void throwMissing(RuleStep r, RuleDefinition def, Map<String, Object> ctx) {
        List<Violation> missing = new ArrayList<>();
        for (String name : keys.deferred(r.nodeId())) {
            if (!ctx.containsKey(name)) {
                missing.add(FlowKeys.missing(def.ruleId(), name));
            }
        }
        if (!missing.isEmpty()) {
            throw new EngineEvaluationException(missing);
        }
    }

    /** 룰 결과를 ctx·made 에 쓰고 steps·path·기록에 남긴다. */
    private void accept(RuleStep r, RuleResult result, Map<String, Object> ctx, Map<String, Object> made) {
        int index = steps.size();
        steps.add(result);
        for (Map.Entry<String, Object> e : result.results().entrySet()) {
            RecordKeys.putReplacing(ctx, e.getKey(), e.getValue());
            RecordKeys.putReplacing(made, e.getKey(), e.getValue());
        }
        path.add(new PathStep(r.nodeId(), NodeKind.RULE, null, index));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, r.nodeId(), NodeKind.RULE, NodeStatus.OK, curRuleId, curVer, curReads, result,
                    null, null, null, null, null, null, null, null, null));
        }
    }

    /** 받는 룰(받는 노드 spec §4). */
    private void guarded(Guarded g, Map<String, Object> ctx, Map<String, Object> made) {
        RuleStep r = g.rule();
        Map<String, Object> outer = catchValues(ctx);
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
        } else {
            ctx.clear();
            ctx.putAll(before); // 룰이 바꿔 넣은 입력 타입을 되돌린다(편차 F6)
            caughtRule(r, c);
            catchNode(r, c, ctx, made);
            seq(c.handler.body(), ctx, made);
            if (c.handler.ends()) {
                throw new Ended(c.handler.catchNodeId());
            }
        }
        if (g.mergeId() != null) {
            restoreCatch(ctx, outer); // R3·R4
            begin(g.mergeId(), NodeKind.MERGE);
            edit(ctx, made);
            path.add(new PathStep(g.mergeId(), NodeKind.MERGE, null, null));
            if (tracing) {
                nodes.add(new NodeTrace(nodes.size() + 1, g.mergeId(), NodeKind.MERGE, NodeStatus.OK, null, null, null, null, null,
                        null, null, r.nodeId(), null, null, null, null, null));
            }
        }
    }

    /** 결과 없음(hits 비고 기본 행 안 씀)인데 NO_RESULT 를 받는 노드가 있으면 그 실패. 없으면 null(지금처럼 NULL 결과로 진행, X-D3). */
    private static Caught noResult(Guarded g, RuleResult result) {
        if (!result.hits().isEmpty() || result.defaultApplied()) {
            return null;
        }
        Guarded.Handler h = g.handlerFor(CatchKind.NO_RESULT);
        return h == null ? null : new Caught(h, CatchKind.NO_RESULT, CatchKind.NO_RESULT_CODE, CatchKind.NO_RESULT_MESSAGE, List.of());
    }

    /** 첫 위반 코드의 종류를 받는 노드가 있으면 그 실패. 받지 않는 코드·받는 노드 없음이면 null(던진다). */
    private static Caught caughtOf(Guarded g, EngineEvaluationException e) {
        if (e.violations().isEmpty()) {
            return null;
        }
        Violation first = e.violations().get(0);
        Optional<CatchKind> kind = CatchKind.ofCode(first.code().name());
        if (kind.isEmpty()) {
            return null;
        }
        Guarded.Handler h = g.handlerFor(kind.get());
        return h == null ? null : new Caught(h, kind.get(), first.code().name(), first.message(), e.violations());
    }

    /** 받은 룰 — path(stepIndex 없음)·caught·CAUGHT 기록(R2). begin 은 startRule 이 이미 했다. */
    private void caughtRule(RuleStep r, Caught c) {
        path.add(new PathStep(r.nodeId(), NodeKind.RULE, null, null));
        caught.add(new CaughtException(r.nodeId(), r.ruleId(), c.handler.catchNodeId(), c.kind, c.code, c.message));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, r.nodeId(), NodeKind.RULE, NodeStatus.CAUGHT, curRuleId, curVer, curReads, null,
                    null, null, null, null, null, List.copyOf(c.violations), null, null, null));
        }
    }

    /** CATCH 노드 — begin → 고친 값 → CATCH_* 넣기 → 처리 갈래 입력 키 → path·기록(R1·R3). */
    private void catchNode(RuleStep r, Caught c, Map<String, Object> ctx, Map<String, Object> made) {
        String id = c.handler.catchNodeId();
        begin(id, NodeKind.CATCH);
        curRuleId = r.ruleId();
        edit(ctx, made);
        RecordKeys.putReplacing(ctx, ReservedNames.CATCH_KIND, c.kind.name());
        RecordKeys.putReplacing(ctx, ReservedNames.CATCH_RULE, r.ruleId());
        RecordKeys.putReplacing(ctx, ReservedNames.CATCH_CODE, c.code);
        RecordKeys.putReplacing(ctx, ReservedNames.CATCH_MSG, c.message);
        List<Violation> missing = keys.check(c.handler.body(), ctx.keySet());
        if (!missing.isEmpty()) {
            throw new EngineEvaluationException(missing);
        }
        path.add(new PathStep(id, NodeKind.CATCH, null, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, id, NodeKind.CATCH, NodeStatus.OK, r.ruleId(), null, null, null, null, null, null,
                    null, null, null, c.kind, c.code, c.message));
        }
    }

    /** ctx 에 있는 CATCH_* 값(고정 순서). */
    private static Map<String, Object> catchValues(Map<String, Object> ctx) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (String n : CATCH_ORDER) {
            if (ctx.containsKey(n)) {
                out.put(n, ctx.get(n));
            }
        }
        return out;
    }

    /** CATCH_* 를 지우고 saved 를 넣는다(saved 가 비면 지우기만). */
    private static void restoreCatch(Map<String, Object> ctx, Map<String, Object> saved) {
        CATCH_ORDER.forEach(ctx::remove);
        ctx.putAll(saved);
    }

    private void ifSplit(Split s, Map<String, Object> ctx, Map<String, Object> made) {
        begin(s.nodeId(), NodeKind.IF);
        edit(ctx, made);
        curBranches = new ArrayList<>();
        Branch chosen = null;
        for (int i = 0; i < s.branches().size(); i++) {
            Branch br = s.branches().get(i);
            if (br.otherwise()) {
                continue;
            }
            if (chosen != null) {
                curBranches.add(new BranchTrace(br.edgeId(), BranchOutcome.NOT_EVALUATED, null));
                continue;
            }
            BranchCondition c = BranchCondition.test(runner, br.cond(), ctx, keys.condTypes(br.cond()), ts);
            if (c.outcome == BranchCondition.TRUE) {
                curBranches.add(new BranchTrace(br.edgeId(), BranchOutcome.TRUE, null));
                chosen = br;
            } else if (c.outcome == BranchCondition.FALSE) {
                curBranches.add(new BranchTrace(br.edgeId(), BranchOutcome.FALSE, null));
            } else if (c.outcome == BranchCondition.NULL) {
                curBranches.add(new BranchTrace(br.edgeId(), BranchOutcome.NULL, null));
                warnings.add(new EngineWarning(EngineWarning.Code.BRANCH_COND_NULL, null, null, null,
                        "IF " + s.nodeId() + " 갈래 " + br.edgeId() + " 조건식 결과가 NULL 이라 거짓으로 봤다"));
            } else {
                curBranches.add(new BranchTrace(br.edgeId(), BranchOutcome.ERROR, c.message));
                // 뒤 선(그 외 포함)은 평가하지 않았다 — branches 는 늘 나가는 선마다 하나씩, 실행 순서대로 둔다.
                for (Branch rest : s.branches().subList(i + 1, s.branches().size())) {
                    curBranches.add(new BranchTrace(rest.edgeId(), BranchOutcome.NOT_EVALUATED, null));
                }
                throw new EngineEvaluationException(List.of(new Violation(Stage.BRANCH_SELECT, Code.BRANCH_EVAL_ERROR, null, null,
                        br.edgeId(), "IF " + s.nodeId() + " 갈래 " + br.edgeId() + " 조건식을 평가하지 못했다: " + c.message)));
            }
        }
        Branch other = s.branches().get(s.branches().size() - 1); // 그 외는 늘 마지막(plan C3)
        if (chosen == null) {
            chosen = other;
        }
        curBranches.add(new BranchTrace(other.edgeId(), chosen == other ? BranchOutcome.TRUE : BranchOutcome.NOT_EVALUATED, null));
        curChosen = chosen.edgeId();
        List<Violation> missing = keys.check(chosen.body(), ctx.keySet());
        if (!missing.isEmpty()) {
            throw new EngineEvaluationException(missing);
        }
        path.add(new PathStep(s.nodeId(), NodeKind.IF, chosen.edgeId(), null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, s.nodeId(), NodeKind.IF, NodeStatus.OK, null, null, null, null,
                    List.copyOf(curBranches), curChosen, null, null, null, null, null, null, null));
        }
        seq(chosen.body(), ctx, made);
        merge(s, null, ctx, made);
    }

    private void parallel(Split s, Map<String, Object> ctx, Map<String, Object> made) {
        begin(s.nodeId(), NodeKind.PARALLEL);
        edit(ctx, made);
        path.add(new PathStep(s.nodeId(), NodeKind.PARALLEL, null, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, s.nodeId(), NodeKind.PARALLEL, NodeStatus.OK, null, null, null, null, null,
                    null, s.branches().stream().map(Branch::edgeId).toList(), null, null, null, null, null, null));
        }
        Map<String, Object> base = new LinkedHashMap<>(ctx);
        List<Map<String, Object>> outs = new ArrayList<>();
        for (Branch br : s.branches()) {
            Map<String, Object> branchCtx = new LinkedHashMap<>(base);
            Map<String, Object> branchMade = new LinkedHashMap<>();
            try {
                seq(br.body(), branchCtx, branchMade);
            } catch (Ended e) {
                // 갈래 안에서 끝냄(X-D11) — 남은 형제는 돌지 않고, 끝난 형제 + 지금 갈래 결과를 합류 규칙대로 합친 뒤 끝낸다.
                outs.add(branchMade);
                mergeOuts(outs, ctx, made);
                throw e;
            }
            outs.add(branchMade);
        }
        merge(s, mergeOuts(outs, ctx, made), ctx, made);
    }

    /** 갈래 결과를 갈래 순서대로 바깥 범위에 덮어쓴다(같은 이름이면 뒤 갈래가 이긴다). 합친 이름 목록(처음 나온 순서). */
    private static List<String> mergeOuts(List<Map<String, Object>> outs, Map<String, Object> ctx, Map<String, Object> made) {
        List<String> merged = new ArrayList<>();
        for (Map<String, Object> out : outs) {
            for (Map.Entry<String, Object> e : out.entrySet()) {
                RecordKeys.putReplacing(ctx, e.getKey(), e.getValue());
                RecordKeys.putReplacing(made, e.getKey(), e.getValue());
                if (!merged.contains(e.getKey())) {
                    merged.add(e.getKey());
                }
            }
        }
        return merged;
    }

    /** 합류 노드. merged 는 병렬 합류에서만(IF 는 null). ctx·made 는 분기를 감싼 범위다 — 병렬은 갈래를 합친 뒤라 고친 값이 합친 값을 덮는다. */
    private void merge(Split s, List<String> merged, Map<String, Object> ctx, Map<String, Object> made) {
        begin(s.mergeId(), NodeKind.MERGE);
        edit(ctx, made);
        path.add(new PathStep(s.mergeId(), NodeKind.MERGE, null, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, s.mergeId(), NodeKind.MERGE, NodeStatus.OK, null, null, null, null, null,
                    null, null, s.nodeId(), merged == null ? null : List.copyOf(merged), null, null, null, null));
        }
    }
}
```
기존 동작과 달라진 점은 `guarded`·`run` 의 끝냄 처리·`parallel` 의 끝냄 처리·`rule` 을 세 도우미로 나눈 것뿐이다. `rule()` 의 순서(시작 → 고친 값 → 읽은 값 → 지연 키 → 평가 → 결과 쓰기 → 기록)는 그대로다.

- [ ] **Step 4: `FlowKeys.java`** — 머리 javadoc(33-39행) 끝에 `<p>받는 룰(받는 노드 spec §4): 룰 자신의 입력은 보통 룰처럼 보되 INPUT_ERROR 를 받는 룰이면 없는 이름을 사전 검사에서 빼고 지연 목록에 넣는다(실행 직전 검사). 정상 갈래·처리 갈래는 IF 갈래처럼 들어갈 때 본다. 뒤로는 (룰 결과 ∪ 정상 갈래) ∩ 돌아오는 처리 갈래가 반드시 있고, 끝내는 처리 갈래는 세지 않는다.` 를 더한다. import 에 `kr.dongkuk.maru.mdm.engine.flow.CatchKind`·`kr.dongkuk.maru.mdm.engine.flow.Guarded` 를 더한다. `walk` 의 `RuleStep` 갈래를 도우미 호출로 바꾸고 `Guarded` 갈래를 더한다.

```java
                case RuleStep r -> ruleKeys(r, false, available, sure, maybe, reported, out);
                case Guarded g -> {
                    Set<String> sureBefore = new HashSet<>(sure);
                    Set<String> maybeBefore = new HashSet<>(maybe);
                    ruleKeys(g.rule(), g.handlerFor(CatchKind.INPUT_ERROR) != null, available, sure, maybe, reported, out);
                    // ruleKeys 가 룰 결과를 sure 에 넣었다 — 받는 룰은 갈래 합류 규칙으로 다시 정한다.
                    sure.clear();
                    sure.addAll(sureBefore);
                    maybe.clear();
                    maybe.addAll(maybeBefore);
                    Set<String> inter = guardSure(g);
                    Set<String> any = guardAll(g);
                    sure.addAll(inter);
                    maybe.removeAll(inter);
                    any.removeAll(sure);
                    maybe.addAll(any);
                }
```
`walk` 아래에 도우미를 더한다(`RuleStep` 갈래에 있던 코드를 옮기고 `late` 만 더했다).

```java
    /** 룰 하나의 입력 키 — late 면 없는 이름을 보고하지 않고 지연 목록에 넣는다(INPUT_ERROR 를 받는 룰, X-D9). 결과는 sure 에 넣는다. */
    private void ruleKeys(RuleStep r, boolean late, Set<String> available, Set<String> sure, Set<String> maybe, Set<String> reported,
            List<Violation> out) {
        RuleDefinition def = defs.get(r.ruleId());
        if (def == null) {
            return;
        }
        List<String> later = new ArrayList<>();
        for (String name : needed(def)) {
            if (available.contains(name) || sure.contains(name)) {
                continue;
            }
            if (maybe.contains(name) || late) {
                if (!later.contains(name)) {
                    later.add(name);
                }
                continue;
            }
            if (reported.add(name)) {
                out.add(missing(def.ruleId(), name));
            }
        }
        if (!later.isEmpty()) {
            deferred.put(r.nodeId(), List.copyOf(later));
        }
        List<String> results = RuleEvaluator.resultNames(def);
        sure.addAll(results);
        maybe.removeAll(results);
    }

    /** 룰 결과 이름(정의가 없으면 빈 집합). */
    private Set<String> produced(RuleStep r) {
        RuleDefinition def = defs.get(r.ruleId());
        return def == null ? new HashSet<>() : new HashSet<>(RuleEvaluator.resultNames(def));
    }

    /** 받는 룰 뒤에 반드시 있는 이름 — (룰 결과 ∪ 정상 갈래) ∩ 돌아오는 처리 갈래(끝내는 갈래는 세지 않는다). */
    private Set<String> guardSure(Guarded g) {
        Set<String> inter = produced(g.rule());
        inter.addAll(sureProduced(g.normal()));
        for (Guarded.Handler h : g.handlers()) {
            if (!h.ends()) {
                inter.retainAll(sureProduced(h.body()));
            }
        }
        return inter;
    }

    /** 받는 룰 뒤에 있을 수 있는 이름 — 룰 결과·정상 갈래·돌아오는 처리 갈래가 만들 수 있는 모든 이름. */
    private Set<String> guardAll(Guarded g) {
        Set<String> any = produced(g.rule());
        any.addAll(allProduced(g.normal()));
        for (Guarded.Handler h : g.handlers()) {
            if (!h.ends()) {
                any.addAll(allProduced(h.body()));
            }
        }
        return any;
    }
```
`sureProduced` 의 `switch` 에 `case Guarded g -> out.addAll(guardSure(g));`, `allProduced` 의 `switch` 에 `case Guarded g -> out.addAll(guardAll(g));` 를 더한다(Task 2 가 넣은 `// SEAM(T3)` 줄을 바꾼다).

- [ ] **Step 5: `MdmRuleEngine.java`** — 79행과 traceSet 의 정상 완료 반환(112행)을 아래로 바꾼다.

```java
        return new RuleSetResult(setId, ts, List.copyOf(run.steps), Collections.unmodifiableMap(run.finalValues),
                List.copyOf(run.path), List.copyOf(run.warnings), List.copyOf(run.caught), run.endedBy);
```
```java
        List<Violation> unused = run.unusedEdits();
        return new RunTrace(set.setId(), ts, input, List.copyOf(run.nodes), Collections.unmodifiableMap(run.finalValues),
                unused.isEmpty() ? null : List.copyOf(unused), echo, run.endedBy);
```
(실행 전 오류 100행·실행 중 오류 107행은 Task 1 의 `null` 그대로다.) `evaluateSet` 의 javadoc(`RuleEngine.java:23-28`)은 바꾸지 않는다 — 계약 문서는 Task 12 가 쓴다.

- [ ] **Step 6: `RecordKeys.java`(rule 패키지)** — `check` 의 `EVAL_TS` 갈래 뒤, `_` 갈래 앞에 넣는다.

```java
            } else if (ReservedNames.CATCH_NAMES.contains(upper)) {
                out.add(new Violation(stage, Code.RESERVED_KEY, ruleId, null, key,
                        "레코드 키 '" + key + "' 는 받는 노드 예약 이름이다"));
```

- [ ] **Step 7: 통과 확인** — `(cd src/backend/maru-mdm-engine && ../gradlew test --tests '*RuleSetCatchTest' --console=plain)` → 18 PASS. `grep -rn "SEAM(T3)" src/backend` → 0건. 엔진 전체 `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)` → PASS — 특히 `RuleSetFlowEvaluationTest`·`RuleSetTraceTest`·`RuleSetTraceEditTest`·`EngineContractSchemaTest`(rule 패키지에 새 record·enum 이 없어야 한다)가 기존 기대 그대로 통과해야 한다(Review Focus 1). `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)` 와 `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetSimulateTest' --tests '*RuleSetRunnerTest' --tests '*DmeOasisHttpTest' --console=plain)` → PASS(골든 무변경).

- [ ] **Step 8: 커밋**

```
/usr/bin/git add src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowKeys.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RecordKeys.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetCatchTest.java
/usr/bin/git commit -m "feat(mdm-engine): 받는 노드 실행 — 처리 갈래 돌아옴·끝냄, CATCH_* 예약 이름, caught·endedBy, INPUT_ERROR 사전 검사 제외" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowKeys.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RecordKeys.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetCatchTest.java
```

---

### Task 4: 정적 검사 — 처리 갈래 경로 상태·`CATCH_NEVER`·처리 갈래 밖 `CATCH_*`·`hasDefault`·검사 코퍼스(Java·TS 한 벌)

**권장 모델:** opus — 서버 분석기와 화면 `set-model.ts` 가 같은 순서·문구로 검사를 내야 하고(코퍼스 동치), 교집합(끝내는 갈래 제외)·중첩 처리 갈래의 `CATCH_*` 정의가 미묘하다.
**병렬:** Task 2 뒤. Task 3·6·7 과 함께 돌 수 있다(겹치는 파일 없음). Task 9 가 이 태스크 뒤.

**이 태스크가 정한 것:**
- 경로 상태(스펙 §5): 처리 갈래 시작 = 받는 룰 **직전** 상태 + `CATCH_*` 넷(대문자 이름). 처리 갈래가 끝나면 `CATCH_*` 를 빼고, 돌아오는 MERGE 뒤 = IF 합류 규칙(정상 갈래 끝 ∩ 돌아오는 처리 갈래 끝, 나머지는 maybe)이다. 끝내는 처리 갈래는 세지 않는다. 바깥에 이미 `CATCH_*` 가 정의돼 있으면(중첩) 합류 규칙의 바탕(base)에 남는다.
- 처리 갈래 밖 `CATCH_*`: 룰 조건이 읽으면 `ORDER`(Ruling R13). 처리 갈래 안이면 `CATCH_*` 조건은 출처와 상관없이 지나간다(대소문자 무시). IF 조건식은 기존 `FLOW_COND` 경로 그대로다.
- `CATCH_NEVER`(R12)는 받는 룰의 룰 검사 바로 뒤에 낸다.
- `RuleSetPathState`(룰 확정 시 세트 순서 검사 `RuleSetOrderCheck` 의 바탕)도 같은 규칙으로 받는 룰을 걷는다.

**Files:**
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetAnalyzer.java:14-26,217-227,289-336`(import, `seq`, 새 `guarded`·`never`, `rule` 의 `CATCH_*` 검사)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetPathState.java:10-16,94-118`(받는 룰 걷기)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCheck.java`(`CATCH_NEVER` 상수)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleIo.java`(전체 — `hasDefault`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleIoReader.java:150-227`(`compute` 의 행 읽기·`hasDefault`)
- Modify: `src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json`(사례 5개)
- Modify: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java:43,126-134`(`MIN_CASES = 64`, `hitPolicy`·`hasDefault` 읽기)
- Test: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetPathStateTest.java`(사례 추가)
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleIoReaderTest.java`(사례 추가)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts`(`CATCH_NAMES` export)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts:12,219-338`(import, `rule` 의 `CATCH_*` 검사, `guarded`·`never`, `walk` 의 SEAM(T4) 바꾸기)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts:28-40,60-76`(`RuleIo.hasDefault?`, `RuleSetCheckCode` 에 `"CATCH_NEVER"`)
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts:20,28-34,111-123`(`MIN_CASES = 64`, `hitPolicy`·`hasDefault` 읽기)
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/set-model.test.ts`(사례 추가)

**Interfaces:**
- Consumes(Task 2): `Guarded`·`Guarded.Handler`(Java·TS), `CatchKind`, `FlowTree.ruleSteps()` 의 처리 갈래 룰 포함·`relation` EXCLUSIVE, `RuleSetCheck.FLOW_CATCH`. Engine `ReservedNames.CATCH_NAMES`(Task 1).
- Produces:
  - lib `RuleIo(…, List<IoName> results, boolean hasDefault)` + 9칸 생성자(`hasDefault=false`). `RuleIoReader.read` 는 최신 RELEASED 버전에 DEFAULT 행이 있으면 `hasDefault=true`.
  - lib `RuleSetCheck.CATCH_NEVER = "CATCH_NEVER"`(WARN, `nodeId` = 받는 노드).
  - TS `types.ts`: `RuleIo.hasDefault?: boolean`, `RuleSetCheckCode` 에 `"CATCH_NEVER"`.
  - TS `flow-model.ts`: `export const CATCH_NAMES: readonly string[] = ["CATCH_KIND", "CATCH_RULE", "CATCH_CODE", "CATCH_MSG"]` — Task 9(변수 칩)·Task 10(디버거)이 쓴다.
  - `RuleSetAnalyzer.checks`·`flowChecks` 의 받는 룰 검사(문구는 Rulings R12·R13).

- [ ] **Step 1: 실패 시험(Java)** — `RuleSetPathStateTest.java` 끝에 사례를 더한다.

```java
    private static String catchNode(String node, String attachTo, String kinds) {
        return "{\"id\":\"" + node + "\",\"kind\":\"CATCH\",\"attachTo\":\"" + attachTo + "\",\"catches\":[" + kinds + "]}";
    }

    @Test
    void 받는_룰_처리_갈래는_룰_직전_상태에_CATCH_를_더해_시작하고_합류_뒤는_교집합이다() {
        EDGES.clear();
        // start → r1(R_A: Y,Z) → mr → r3(R_C) → end. c1 → r2(R_B: Y) → mr, c2 → end(끝냄 — 세지 않는다).
        String e = String.join(",", edge("start", "r1", ""), edge("r1", "mr", ""), edge("c1", "r2", ""), edge("r2", "mr", ""), edge("c2", "end", ""),
                edge("mr", "r3", ""), edge("r3", "end", ""));
        Map<String, At> b = before(String.join(",", rule("r1", "R_A"), catchNode("c1", "r1", "\"NO_RESULT\""), rule("r2", "R_B"),
                catchNode("c2", "r1", "\"EVAL_ERROR\""), merge("mr", "r1"), rule("r3", "R_C")), e);

        assertEquals(List.of("r1", "r2", "r3"), List.copyOf(b.keySet()));
        assertEquals(at(Set.of(), Set.of()), b.get("r1"));
        assertEquals(at(Set.of("CATCH_KIND", "CATCH_RULE", "CATCH_CODE", "CATCH_MSG"), Set.of()), b.get("r2"), "실패한 룰 결과(Y,Z)는 없다");
        assertEquals(at(Set.of("Y"), Set.of("Z")), b.get("r3"), "Y 는 정상·돌아오는 처리 갈래 모두, Z 는 정상 갈래에서만");
    }
```

`RuleIoReaderTest.java`(api) 끝에:

```java
    @Test
    void 최신_RELEASED_에_기본_행이_있으면_hasDefault_가_참이다() {
        assertTrue(reader.read(List.of("R_MAIN")).get("R_MAIN").hasDefault());
        assertFalse(reader.read(List.of("R_NOREL")).get("R_NOREL").hasDefault());
    }
```
(`R_MAIN` 은 이 시험 준비 60-62행에서 VER 1 에 DEFAULT 행을 넣는다. `assertFalse` import 가 없으면 더한다.)

- [ ] **Step 2: 실패 확인(Java)** — `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetPathStateTest' --console=plain)` → 새 사례 FAIL(`instanceof` 사슬이 `Guarded` 를 건너뛰어 r2·r3 가 없다). `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleIoReaderTest' --console=plain)` → 컴파일 오류(`hasDefault()` 없음).

- [ ] **Step 3: Java 구현**

`RuleIo.java` 를 아래로 바꾼다(javadoc 의 `@param` 끝에 `hasDefault` 한 줄을 더한다).

```java
public record RuleIo(
        String ruleId,
        String ruleName,
        String ruleKind,
        String status,
        boolean exists,
        Integer releasedVer,
        String hitPolicy,
        List<IoName> conds,
        List<IoName> results,
        boolean hasDefault) {

    /** 컬럼 사전에 그 물리명이 있다. */
    public static final String DICT = "DICT";
    /** 컬럼 사전에는 없고 룰이 조건 열에 도메인·데이터 타입을 선언했다(호출 프로그램이 넣는 값). */
    public static final String PROG = "PROG";
    /** 어디에도 없다. */
    public static final String NONE = "NONE";

    /** 기본 행 여부를 따지지 않는 곳(없는 룰·RELEASED 없는 룰·시험) — hasDefault=false. */
    public RuleIo(String ruleId, String ruleName, String ruleKind, String status, boolean exists, Integer releasedVer, String hitPolicy,
            List<IoName> conds, List<IoName> results) {
        this(ruleId, ruleName, ruleKind, status, exists, releasedVer, hitPolicy, conds, results, false);
    }

    /** 읽거나 만드는 이름 하나와 그 타입·표시명. NONE 이면 타입·표시명은 null 이다. */
    public record IoName(String name, String source, String label, String dataType, Integer scale, boolean dateString, String maruCodeId) {
    }
}
```
javadoc 에 `@param hasDefault 최신 RELEASED 버전에 기본(DEFAULT) 행이 있는가 — 받는 노드 검사 CATCH_NEVER(받는 노드 spec §5)가 쓴다` 를 더한다.

`RuleIoReader.java` `compute`(150-227행) — 행을 처음에 한 번 읽어 `Expression` 셀 읽기와 `hasDefault` 에 함께 쓴다.

```java
    private RuleIo compute(MdmRule rule, int ver, String hitPolicy, Map<String, Boolean> dictionary) {
        String id = rule.getMaruRuleId();
        List<MdmRuleVar> vars = queries.vars(id, ver);
        List<MdmRuleRow> rows = queries.rows(id, ver);
        boolean hasDefault = rows.stream().anyMatch(r -> "DEFAULT".equals(r.getRowKind()));
```
`if (!expressionColumns.isEmpty()) { for (MdmRuleRow row : queries.rows(id, ver)) {` 를 `for (MdmRuleRow row : rows) {` 로 바꾸고, 마지막 반환을 아래로 바꾼다.

```java
        return new RuleIo(id, rule.getMaruRuleName(), rule.getRuleKind(), rule.getStatus(), true, ver, hitPolicy, List.copyOf(condOut),
                List.copyOf(resultOut), hasDefault);
```

`RuleSetCheck.java` 의 `FLOW_CATCH` 뒤:
```java
    /** 받는 노드가 받는 종류가 그 룰에서 일어날 수 없다(WARN, 받는 노드 spec §5) — 결과 없음인데 기본 행이 있음, 판정 충돌인데 UNIQUE·ANY 가 아님. */
    public static final String CATCH_NEVER = "CATCH_NEVER";
```

`RuleSetAnalyzer.java` — import 에 `java.util.Locale`(이미 있음), `kr.dongkuk.maru.mdm.engine.expr.ReservedNames`, `kr.dongkuk.maru.mdm.engine.flow.CatchKind`, `kr.dongkuk.maru.mdm.engine.flow.Guarded` 를 더한다. `PathWalk.seq`(217-227행):

```java
        void seq(Seq s, State st) {
            for (Block b : s.items()) {
                if (b instanceof RuleStep r) {
                    rule(r, st);
                } else if (b instanceof Guarded g) {
                    guarded(g, st);
                } else if (b instanceof Split sp) {
                    split(sp, st);
                } else if (b instanceof Seq q) {
                    seq(q, st);
                }
            }
        }

        /**
         * 받는 룰(받는 노드 spec §5) — 룰 검사, CATCH_NEVER, 정상 갈래(룰 결과 뒤), 처리 갈래(룰 직전 상태 + CATCH_*, 끝나면 CATCH_* 를 뺀다).
         * 합류 뒤는 IF 합류 규칙 — 정상 갈래 끝과 돌아오는 처리 갈래 끝의 교집합이 defined, 나머지는 maybe. 끝내는 처리 갈래는 세지 않는다.
         */
        void guarded(Guarded g, State st) {
            State before = st.copy();
            rule(g.rule(), st);
            never(g);
            State normal = st.copy();
            seq(g.normal(), normal);
            List<State> back = new ArrayList<>(List.of(normal));
            for (Guarded.Handler h : g.handlers()) {
                State hs = before.copy();
                hs.defined().addAll(ReservedNames.CATCH_NAMES);
                seq(h.body(), hs);
                hs.defined().removeAll(ReservedNames.CATCH_NAMES);
                if (!h.ends()) {
                    back.add(hs);
                }
            }
            RuleSetPathState.At merged = RuleSetPathState.mergeIf(before.at(), back.stream().map(State::at).toList());
            Map<String, RuleStep> over = new LinkedHashMap<>();
            for (State b : back) {
                b.prodBy().forEach((k, v) -> {
                    if (!v.equals(before.prodBy().get(k))) {
                        over.putIfAbsent(k, v);
                    }
                });
            }
            st.defined().clear();
            st.defined().addAll(merged.defined());
            st.maybe().clear();
            st.maybe().addAll(merged.maybe());
            st.prodBy().clear();
            st.prodBy().putAll(before.prodBy());
            st.prodBy().putAll(over);
        }

        /** CATCH_NEVER(R12) — 처리 갈래 순서·받는 종류 저장 순서. 룰이 있고 RELEASED 가 있을 때만. */
        void never(Guarded g) {
            String id = g.rule().ruleId();
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
`rule()`(289행)의 조건 루프 첫머리에 넣는다.

```java
            for (IoName c : conds(rules, id)) {
                // 받는 노드 예약 이름(R13) — 처리 갈래 안이면 지나가고, 밖이면 ORDER 다.
                if (ReservedNames.CATCH_NAMES.contains(c.name().toUpperCase(Locale.ROOT))) {
                    if (!st.defined().contains(c.name().toUpperCase(Locale.ROOT))) {
                        out.add(new RuleSetCheck(RuleSetCheck.ORDER, RuleSetCheck.REJECT, id, null, c.name(),
                                id + "가 읽는 " + c.name() + "는 받는 노드의 처리 갈래 안에서만 있다", node, null));
                    }
                    continue;
                }
                if (RuleIo.DICT.equals(c.source()) || st.defined().contains(c.name())) {
```

`RuleSetPathState.java` — import 에 `kr.dongkuk.maru.mdm.engine.expr.ReservedNames`, `kr.dongkuk.maru.mdm.engine.flow.Guarded` 를 더하고 javadoc 의 분기 합치기 목록 끝에 `<li>받는 룰: 정상 갈래는 룰 결과 뒤, 처리 갈래는 룰 직전 상태 + CATCH_* 에서 시작하고 끝나면 CATCH_* 를 뺀다. 합류는 IF 규칙(끝내는 처리 갈래 제외).</li>` 를 더한다. `Walk.seq`(94-118행)의 `else if (b instanceof Split sp)` 앞에 넣는다.

```java
                } else if (b instanceof Guarded g) {
                    At before = new At(new HashSet<>(st.defined()), new HashSet<>(st.maybe()));
                    out.putIfAbsent(g.rule().nodeId(), new At(Set.copyOf(st.defined()), Set.copyOf(st.maybe())));
                    At normal = new At(new HashSet<>(st.defined()), new HashSet<>(st.maybe()));
                    Set<String> made = produces.apply(g.rule().ruleId());
                    if (made != null) {
                        normal.defined().addAll(made);
                    }
                    seq(g.normal(), normal);
                    List<At> back = new ArrayList<>(List.of(normal));
                    for (Guarded.Handler h : g.handlers()) {
                        At hs = new At(new HashSet<>(before.defined()), new HashSet<>(before.maybe()));
                        hs.defined().addAll(ReservedNames.CATCH_NAMES);
                        seq(h.body(), hs);
                        hs.defined().removeAll(ReservedNames.CATCH_NAMES);
                        if (!h.ends()) {
                            back.add(hs);
                        }
                    }
                    At merged = mergeIf(before, back);
                    st.defined().clear();
                    st.defined().addAll(merged.defined());
                    st.maybe().clear();
                    st.maybe().addAll(merged.maybe());
```
(바로 뒤가 기존 `} else if (b instanceof Split sp) {` 다.)

- [ ] **Step 4: Java 통과 확인** — `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetPathStateTest' --tests '*RuleSetAnalyzerTest' --tests '*RuleSetCorpusTest' --console=plain)` → PASS. `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleIoReaderTest' --tests '*RuleLedgerChecksTest' --console=plain)` → PASS.

- [ ] **Step 5: TS 실패 시험** — `tests/dme/ruleSetEdit/set-model.test.ts` 끝에 더한다(`FlowNode`·`FlowEdge`·`FlowNodeKind`·`RuleSetFlow` import 는 5행에 이미 있다).

```ts
describe("flowChecks — 받는 노드(CATCH, 받는 노드 spec §5)", () => {
  const tn = (id: string, kind: FlowNodeKind, over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: null, splitId: null, label: null, ...over });
  const te = (id: string, from: string, to: string): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null });
  /** start → r1(R1) → mr → r2(R2) → end. c1(kinds) → (handler 가 있으면 h1(handler)) → mr. */
  const guarded = (kinds: string[], handler: string | null): RuleSetFlow => ({
    version: 1,
    nodes: [
      tn("start", "START"), tn("r1", "RULE", { ruleId: "R1" }), tn("c1", "CATCH", { attachTo: "r1", catches: kinds }),
      ...(handler ? [tn("h1", "RULE", { ruleId: handler })] : []),
      tn("mr", "MERGE", { splitId: "r1" }), tn("r2", "RULE", { ruleId: "R2" }), tn("end", "END"),
    ],
    edges: [
      te("e1", "start", "r1"), te("e2", "r1", "mr"), ...(handler ? [te("e3", "c1", "h1"), te("e4", "h1", "mr")] : [te("e3", "c1", "mr")]),
      te("e5", "mr", "r2"), te("e6", "r2", "end"),
    ],
  });

  it("처리 갈래가 같은 결과를 채우면 합류 뒤 정의되고 DUP_RESULT 가 아니다", () => {
    const rules = byId(rule("R1", [n("A", "DICT")], [n("P")]), rule("R9", [], [n("P")]), rule("R2", [n("P")], [n("Q")]));
    expect(flowChecks(guarded(["NO_RESULT"], "R9"), rules, {})).toEqual([]);
  });

  it("처리 갈래가 결과를 채우지 않으면 뒤에서 읽을 때 FLOW_PARTIAL", () => {
    const rules = byId(rule("R1", [n("A", "DICT")], [n("P")]), rule("R2", [n("P")], [n("Q")]));
    expect(flowChecks(guarded(["NO_RESULT"], null), rules, {}).map((c) => c.code)).toEqual(["FLOW_PARTIAL"]);
  });

  it("처리 갈래 밖에서 CATCH_* 를 읽으면 ORDER, 안에서는 지나간다", () => {
    const rules = byId(rule("R1", [n("A", "DICT")], [n("P")]), rule("R9", [n("CATCH_CODE", "PROG")], [n("P")]), rule("R2", [n("CATCH_MSG")], [n("Q")]));
    const out = flowChecks(guarded(["NO_RESULT"], "R9"), rules, {});
    expect(out).toEqual([
      { code: "ORDER", severity: "REJECT", ruleId: "R2", otherRuleId: null, varName: "CATCH_MSG", message: "R2가 읽는 CATCH_MSG는 받는 노드의 처리 갈래 안에서만 있다", nodeId: "r2", edgeId: null },
    ]);
  });

  it("CATCH_NEVER — 기본 행이 있는 룰의 결과 없음, UNIQUE·ANY 아닌 룰의 판정 충돌", () => {
    const r1 = { ...rule("R1", [n("A", "DICT")], [n("P")]), hitPolicy: "FIRST", hasDefault: true };
    const rules = byId(r1, rule("R9", [], [n("P")]), rule("R2", [], [n("Q")]));
    expect(flowChecks(guarded(["NO_RESULT", "HIT_CONFLICT"], "R9"), rules, {}).map((c) => [c.code, c.nodeId, c.message])).toEqual([
      ["CATCH_NEVER", "c1", "R1에 기본 행이 있어 c1가 받는 결과 없음이 일어나지 않는다"],
      ["CATCH_NEVER", "c1", "R1의 적중 정책 FIRST에서는 c1가 받는 판정 충돌이 일어나지 않는다"],
    ]);
  });
});
```
파일 머리 도우미 `n(name, source?)`(9-18행)·`rule(ruleId, conds, results, over?)`(20-33행)·`byId(...)`(35행)를 그대로 쓴다. `rule()` 이 돌려주는 `RuleIo` 에는 `hasDefault` 칸이 없어도 된다(`hasDefault?` 선택 칸).

- [ ] **Step 6: 실패 확인(TS)** — `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/set-model.test.ts` → 새 사례 FAIL(SEAM(T4) 가 처리 갈래를 건너뛴다).

- [ ] **Step 7: TS 구현**

`flow-model.ts` 의 `CATCHABLE` 뒤:
```ts
/** 처리 갈래 안에서만 있는 예약 이름(엔진 `ReservedNames.CATCH_NAMES`, 받는 노드 spec §4). */
export const CATCH_NAMES: readonly string[] = ["CATCH_KIND", "CATCH_RULE", "CATCH_CODE", "CATCH_MSG"];
```

`types.ts` — `RuleIo` 의 `results` 뒤:
```ts
  /** 최신 RELEASED 버전에 기본 행이 있는가(서버 `RuleIoReader`). 받는 노드 검사 CATCH_NEVER 가 쓴다. 옛 응답·시험 리터럴은 없을 수 있다(없으면 false). */
  hasDefault?: boolean;
```
`RuleSetCheckCode` 의 `"FLOW_CATCH"` 뒤:
```ts
  /** 받는 노드가 받는 종류가 그 룰에서 일어날 수 없다(WARN, 받는 노드 spec §5). nodeId = 받는 노드. */
  | "CATCH_NEVER"
```

`set-model.ts` — import(12행)를 `import { CATCH_NAMES, flowRuleIds, isBlankJava, linearFlow, parseFlow, type FlowTree, type Guarded, type RuleStep, type Seq } from "./flow-model";` 로 바꾼다. `pathChecks` 의 `rule`(269행) 루프 첫머리:

```ts
    for (const c of conds(rules, id)) {
      // 받는 노드 예약 이름(R13) — 처리 갈래 안이면 지나가고, 밖이면 ORDER 다.
      if (CATCH_NAMES.includes(c.name.toUpperCase())) {
        if (!s.defined.has(c.name.toUpperCase())) {
          out.push(check("ORDER", "REJECT", id, null, c.name, `${id}가 읽는 ${c.name}는 받는 노드의 처리 갈래 안에서만 있다`, n.nodeId));
        }
        continue;
      }
      if (c.source === DICT || s.defined.has(c.name)) continue;
```
`rule` 정의 뒤(`walk` 앞)에 둘을 더한다.

```ts
  /** CATCH_NEVER(R12) — 처리 갈래 순서·받는 종류 저장 순서. 룰이 있고 RELEASED 가 있을 때만. */
  const never = (g: Guarded) => {
    const id = g.rule.ruleId;
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

  /** 받는 룰 — 서버 `RuleSetAnalyzer.PathWalk.guarded` 와 같은 순서·합류 규칙. */
  const guarded = (g: Guarded, s: PathState) => {
    const before = copyState(s);
    rule(g.rule, s);
    never(g);
    const normal = copyState(s);
    walk(g.normal, normal);
    const back: PathState[] = [normal];
    for (const h of g.handlers) {
      const hs = copyState(before);
      for (const x of CATCH_NAMES) hs.defined.add(x);
      walk(h.body, hs);
      for (const x of CATCH_NAMES) hs.defined.delete(x);
      if (!h.ends) back.push(hs);
    }
    // s 를 룰 직전 상태로 되돌린 뒤 IF 합류 규칙(defined·maybe·prodBy)으로 합친다.
    s.defined.clear();
    for (const x of before.defined) s.defined.add(x);
    s.maybe.clear();
    for (const x of before.maybe) s.maybe.add(x);
    s.prodBy.clear();
    for (const [k, v] of before.prodBy) s.prodBy.set(k, v);
    mergeState("IF", s, back);
  };
```
`walk` 의 Task 2 임시 처리(`// SEAM(T4)` 세 줄)를 `else if (b.type === "GUARDED") guarded(b, s);` 한 줄로 바꾼다. `walk` 는 `const` 화살표 함수라 `guarded` 가 `walk` 보다 앞에 정의돼도 호출 시점에 `walk` 가 있으므로 문제없다.

`rule-set-corpus.test.ts` — `CorpusRule`(28-34행)에 `hitPolicy?: string | null; hasDefault?: boolean;` 을 더하고, `rule()`(111-123행)의 `hitPolicy: null,` 을 `hitPolicy: r.hitPolicy ?? null,` 로, `results` 뒤에 `hasDefault: r.hasDefault ?? false,` 를 더한다. `RuleSetCorpusTest.java` 의 `rule()`(126-134행)을 아래로 바꾼다.

```java
    static RuleIo rule(String id, JsonNode r) {
        List<IoName> conds = new ArrayList<>();
        r.path("conds").forEach(n -> conds.add(new IoName(text(n, "name"), text(n, "source"), null, null, null, false, null)));
        List<IoName> results = new ArrayList<>();
        r.path("results").forEach(n -> results.add(new IoName(text(n, "name"), null, null, null, null, false, null)));
        JsonNode ver = r.path("releasedVer");
        return new RuleIo(id, null, null, text(r, "status"), r.path("exists").asBoolean(false),
                ver.isNull() || ver.isMissingNode() ? null : ver.asInt(), text(r, "hitPolicy"), conds, results, r.path("hasDefault").asBoolean(false));
    }
```
머리 javadoc 의 읽기 규칙 문장에 `hitPolicy`·`hasDefault`(빠지면 null·false)를 더한다(TS 파일 머리 주석도 같게).

- [ ] **Step 8: 검사 코퍼스 5사례** — `rule-set-corpus.json` 의 `cases` 끝에 더한다. 기대값은 위 규칙에서 손으로 유도했다(사례 이름 끝 괄호가 보는 규칙).

```json
    {
      "name": "받는 노드 — 결과 없음 처리 갈래가 같은 결과를 채우고 돌아온다(교집합·DUP_RESULT 아님·펼친 순서)",
      "flow": {
        "version": 1,
        "nodes": [
          { "id": "start", "kind": "START" },
          { "id": "r1", "kind": "RULE", "ruleId": "D1" },
          { "id": "c1", "kind": "CATCH", "attachTo": "r1", "catches": ["NO_RESULT"] },
          { "id": "r9", "kind": "RULE", "ruleId": "D9" },
          { "id": "mr", "kind": "MERGE", "splitId": "r1" },
          { "id": "r2", "kind": "RULE", "ruleId": "D2" },
          { "id": "end", "kind": "END" }
        ],
        "edges": [
          { "id": "e1", "from": "start", "to": "r1" },
          { "id": "e2", "from": "r1", "to": "mr" },
          { "id": "e3", "from": "c1", "to": "r9" },
          { "id": "e4", "from": "r9", "to": "mr" },
          { "id": "e5", "from": "mr", "to": "r2" },
          { "id": "e6", "from": "r2", "to": "end" }
        ]
      },
      "ids": ["D1", "D9", "D2"],
      "rules": {
        "D1": { "exists": true, "status": "INUSE", "releasedVer": 1, "hitPolicy": "FIRST", "conds": [{ "name": "A", "source": "DICT" }], "results": [{ "name": "P" }] },
        "D9": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [], "results": [{ "name": "P" }] },
        "D2": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "P", "source": "NONE" }], "results": [{ "name": "Q" }] }
      },
      "expect": {
        "io": {
          "inputs": [{ "name": "A", "source": "DICT", "users": ["D1"] }],
          "results": [{ "name": "P", "by": ["D1", "D9"], "readers": ["D2"] }, { "name": "Q", "by": ["D2"], "readers": [] }]
        },
        "deps": { "D1": [], "D9": [], "D2": ["D1", "D9"] },
        "checks": []
      }
    },
    {
      "name": "받는 노드 — 처리 갈래가 결과를 채우지 않으면 뒤에서 읽을 때 FLOW_PARTIAL, 끝내는 갈래는 세지 않는다",
      "flow": {
        "version": 1,
        "nodes": [
          { "id": "start", "kind": "START" },
          { "id": "r1", "kind": "RULE", "ruleId": "D1" },
          { "id": "c1", "kind": "CATCH", "attachTo": "r1", "catches": ["NO_RESULT"] },
          { "id": "c2", "kind": "CATCH", "attachTo": "r1", "catches": ["EVAL_ERROR"] },
          { "id": "mr", "kind": "MERGE", "splitId": "r1" },
          { "id": "r2", "kind": "RULE", "ruleId": "D2" },
          { "id": "end", "kind": "END" }
        ],
        "edges": [
          { "id": "e1", "from": "start", "to": "r1" },
          { "id": "e2", "from": "r1", "to": "mr" },
          { "id": "e3", "from": "c1", "to": "mr" },
          { "id": "e4", "from": "c2", "to": "end" },
          { "id": "e5", "from": "mr", "to": "r2" },
          { "id": "e6", "from": "r2", "to": "end" }
        ]
      },
      "ids": ["D1", "D2"],
      "rules": {
        "D1": { "exists": true, "status": "INUSE", "releasedVer": 1, "hitPolicy": "FIRST", "conds": [{ "name": "A", "source": "DICT" }], "results": [{ "name": "P" }] },
        "D2": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "P", "source": "NONE" }], "results": [{ "name": "Q" }] }
      },
      "expect": {
        "io": {
          "inputs": [{ "name": "A", "source": "DICT", "users": ["D1"] }],
          "results": [{ "name": "P", "by": ["D1"], "readers": ["D2"] }, { "name": "Q", "by": ["D2"], "readers": [] }]
        },
        "deps": { "D1": [], "D2": ["D1"] },
        "checks": [
          { "code": "FLOW_PARTIAL", "severity": "WARN", "ruleId": "D2", "varName": "P", "message": "D2가 읽는 P는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다", "nodeId": "r2" }
        ]
      }
    },
    {
      "name": "받는 노드 — CATCH_NEVER: 기본 행이 있는 룰의 결과 없음, FIRST 룰의 판정 충돌",
      "flow": {
        "version": 1,
        "nodes": [
          { "id": "start", "kind": "START" },
          { "id": "r1", "kind": "RULE", "ruleId": "D1" },
          { "id": "c1", "kind": "CATCH", "attachTo": "r1", "catches": ["NO_RESULT", "HIT_CONFLICT"] },
          { "id": "end", "kind": "END" }
        ],
        "edges": [
          { "id": "e1", "from": "start", "to": "r1" },
          { "id": "e2", "from": "r1", "to": "end" },
          { "id": "e3", "from": "c1", "to": "end" }
        ]
      },
      "ids": ["D1"],
      "rules": {
        "D1": { "exists": true, "status": "INUSE", "releasedVer": 1, "hitPolicy": "FIRST", "hasDefault": true, "conds": [{ "name": "A", "source": "DICT" }], "results": [{ "name": "P" }] }
      },
      "expect": {
        "io": { "inputs": [{ "name": "A", "source": "DICT", "users": ["D1"] }], "results": [{ "name": "P", "by": ["D1"], "readers": [] }] },
        "deps": { "D1": [] },
        "checks": [
          { "code": "CATCH_NEVER", "severity": "WARN", "ruleId": "D1", "message": "D1에 기본 행이 있어 c1가 받는 결과 없음이 일어나지 않는다", "nodeId": "c1" },
          { "code": "CATCH_NEVER", "severity": "WARN", "ruleId": "D1", "message": "D1의 적중 정책 FIRST에서는 c1가 받는 판정 충돌이 일어나지 않는다", "nodeId": "c1" }
        ]
      }
    },
    {
      "name": "받는 노드 — 처리 갈래 밖 CATCH_* 를 룰이 읽으면 ORDER, 조건식이 읽으면 FLOW_COND, 안에서는 지나간다",
      "flow": {
        "version": 1,
        "nodes": [
          { "id": "start", "kind": "START" },
          { "id": "r1", "kind": "RULE", "ruleId": "D1" },
          { "id": "c1", "kind": "CATCH", "attachTo": "r1", "catches": ["NO_RESULT"] },
          { "id": "r9", "kind": "RULE", "ruleId": "D9" },
          { "id": "mr", "kind": "MERGE", "splitId": "r1" },
          { "id": "if1", "kind": "IF" },
          { "id": "r3", "kind": "RULE", "ruleId": "D3" },
          { "id": "m2", "kind": "MERGE", "splitId": "if1" },
          { "id": "end", "kind": "END" }
        ],
        "edges": [
          { "id": "e1", "from": "start", "to": "r1" },
          { "id": "e2", "from": "r1", "to": "mr" },
          { "id": "e3", "from": "c1", "to": "r9" },
          { "id": "e4", "from": "r9", "to": "mr" },
          { "id": "e5", "from": "mr", "to": "if1" },
          { "id": "b1", "from": "if1", "to": "r3", "order": 1, "cond": "CATCH_KIND = \"NO_RESULT\"" },
          { "id": "bo", "from": "if1", "to": "m2", "otherwise": true },
          { "id": "e6", "from": "r3", "to": "m2" },
          { "id": "e7", "from": "m2", "to": "end" }
        ]
      },
      "condIo": { "b1": { "ok": true, "message": null, "vars": [{ "name": "CATCH_KIND", "source": "NONE" }] } },
      "ids": ["D1", "D9", "D3"],
      "rules": {
        "D1": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "A", "source": "DICT" }], "results": [{ "name": "P" }] },
        "D9": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "CATCH_CODE", "source": "PROG" }], "results": [{ "name": "P" }] },
        "D3": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "CATCH_MSG", "source": "NONE" }], "results": [{ "name": "Q" }] }
      },
      "expect": {
        "io": {
          "inputs": [
            { "name": "A", "source": "DICT", "users": ["D1"] },
            { "name": "CATCH_CODE", "source": "PROG", "users": ["D9"] },
            { "name": "CATCH_MSG", "source": "NONE", "users": ["D3"] }
          ],
          "results": [{ "name": "P", "by": ["D1", "D9"], "readers": [] }, { "name": "Q", "by": ["D3"], "readers": [] }]
        },
        "deps": { "D1": [], "D9": [], "D3": [] },
        "checks": [
          { "code": "FLOW_COND", "severity": "REJECT", "varName": "CATCH_KIND", "message": "b1 갈래 조건식이 읽는 CATCH_KIND는 이 지점에서 정의되지 않았다", "nodeId": "if1", "edgeId": "b1" },
          { "code": "ORDER", "severity": "REJECT", "ruleId": "D3", "varName": "CATCH_MSG", "message": "D3가 읽는 CATCH_MSG는 받는 노드의 처리 갈래 안에서만 있다", "nodeId": "r3" }
        ]
      }
    },
    {
      "name": "받는 노드 — 정상 갈래 먼저 펼치고, 끝내는 처리 갈래 안 룰도 RULE_IDS 에 넣으며 같은 결과 변수를 써도 경고가 없다",
      "flow": {
        "version": 1,
        "nodes": [
          { "id": "start", "kind": "START" },
          { "id": "r1", "kind": "RULE", "ruleId": "D1" },
          { "id": "r2", "kind": "RULE", "ruleId": "D2" },
          { "id": "c1", "kind": "CATCH", "attachTo": "r1", "catches": ["INPUT_ERROR"] },
          { "id": "r9", "kind": "RULE", "ruleId": "D9" },
          { "id": "c2", "kind": "CATCH", "attachTo": "r1", "catches": ["EVAL_ERROR"] },
          { "id": "r8", "kind": "RULE", "ruleId": "D8" },
          { "id": "mr", "kind": "MERGE", "splitId": "r1" },
          { "id": "end", "kind": "END" }
        ],
        "edges": [
          { "id": "e1", "from": "start", "to": "r1" },
          { "id": "e2", "from": "r1", "to": "r2" },
          { "id": "e3", "from": "r2", "to": "mr" },
          { "id": "e4", "from": "c1", "to": "r9" },
          { "id": "e5", "from": "r9", "to": "mr" },
          { "id": "e6", "from": "c2", "to": "r8" },
          { "id": "e7", "from": "r8", "to": "end" },
          { "id": "e8", "from": "mr", "to": "end" }
        ]
      },
      "ids": ["D1", "D2", "D9", "D8"],
      "rules": {
        "D1": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "A", "source": "DICT" }], "results": [{ "name": "P" }] },
        "D2": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "P", "source": "NONE" }], "results": [{ "name": "Q" }] },
        "D9": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [], "results": [{ "name": "P" }] },
        "D8": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [], "results": [{ "name": "P" }] }
      },
      "expect": {
        "io": {
          "inputs": [{ "name": "A", "source": "DICT", "users": ["D1"] }],
          "results": [{ "name": "P", "by": ["D1", "D9", "D8"], "readers": ["D2"] }, { "name": "Q", "by": ["D2"], "readers": [] }]
        },
        "deps": { "D1": [], "D2": ["D1", "D9", "D8"], "D9": [], "D8": [] },
        "checks": []
      }
    }
```
`RuleSetCorpusTest.java:43` 과 `rule-set-corpus.test.ts:20` 의 `MIN_CASES` 를 `64` 로 올린다.

손 유도 근거(리뷰어가 볼 것): 첫 사례 `ids` 는 받는 룰 → 처리 갈래(R9) → 합류 뒤(R2) 순이고(R9), R2 가 읽는 P 는 정상 갈래(D1 결과)와 돌아오는 처리 갈래(D9 결과) 모두에서 정의돼 defined 다. 둘째 사례는 돌아오는 처리 갈래 c1 이 비어 P 가 maybe 가 되고, c2 는 끝내므로 세지 않는다. 넷째 사례의 조건식 검사는 IF 갈래 검사(`split` 의 `cond`)가 룰 검사보다 먼저다. 다섯째 사례 io 는 펼친 목록 `[D1, D2, D9, D8]` 순서로 계산해 D2 가 P 를 읽을 때 D1 만 만든 뒤이므로 `readers: ["D2"]`, deps 는 목록 전체에서 P 를 만드는 룰(D1·D9·D8)이다.

- [ ] **Step 9: 코퍼스 통과 확인(두 언어)** — `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetCorpusTest' --console=plain)` → PASS(64 + 퍼즈 200). `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/rule-set-corpus.test.ts tests/dme/ruleSetEdit/set-model.test.ts` → PASS. `grep -rn "SEAM(T4)" src/frontend/m-mdm` → 0건.

- [ ] **Step 10: 전체 확인** — lib 전체, api `'*RuleIoReaderTest' '*RuleLedgerChecksTest' '*RuleSetEditServiceTest' '*DmeOasisHttpTest'`, 화면 `[m-mdm test 합계]`, lint 0, 바꾼 화면 `.ts` 파일 audit 두 개 0건.

- [ ] **Step 11: 커밋**

```
/usr/bin/git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetAnalyzer.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetPathState.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCheck.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleIo.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleIoReader.java src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetPathStateTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleIoReaderTest.java src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/set-model.test.ts
/usr/bin/git commit -m "feat(mdm): 받는 노드 정적 검사 — 처리 갈래 경로 상태·CATCH_NEVER·처리 갈래 밖 CATCH_*·hasDefault·검사 코퍼스" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetAnalyzer.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetPathState.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCheck.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleIo.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleIoReader.java src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetPathStateTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleIoReaderTest.java src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/set-model.test.ts
```

---

### Task 5: 서버 `execute` DTO — `RuleSetRunResult.endedBy`·`caught`

**권장 모델:** sonnet — 엔진 결과를 DTO 에 옮겨 싣는 작은 작업이다.
**병렬:** Task 3 뒤. Task 4·6·7 과 함께 돌 수 있다.

**Files:**
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/dto/RuleSetRunResult.java`(전체)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java:143-156`(`execute` 결과 싣기)
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunnerTest.java`(사례 추가)

**Interfaces:**
- Consumes(Task 3): `RuleSetResult.caught()`·`endedBy()`, `CaughtException`.
- Produces: `RuleSetRunResult.getEndedBy(): String`(없으면 null), `getCaught(): List<Map<String, Object>>`(원소 키 순서 `ruleNodeId, ruleId, catchNodeId, kind, code, message`, 없으면 빈 목록). OASIS BPMN 은 `endedBy` 로 게이트웨이를 나눌 수 있다(스펙 §7). `run`·`trace` 는 엔진 결과를 그대로 돌려준다(바꾸지 않는다).

- [ ] **Step 1: 실패 시험** — `RuleSetRunnerTest.java` 끝에 더한다(import `com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunRequest`·`RuleSetRunResult` 는 이미 있다).

```java
    static final String CATCH_FLOW = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},"
            + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"QLTY_GRD_JDG\"},"
            + "{\"id\":\"c1\",\"kind\":\"CATCH\",\"attachTo\":\"r1\",\"catches\":[\"INPUT_ERROR\"],\"label\":\"입력 부족\"},{\"id\":\"end\",\"kind\":\"END\"}],"
            + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"r1\"},{\"id\":\"e2\",\"from\":\"r1\",\"to\":\"end\"},{\"id\":\"e3\",\"from\":\"c1\",\"to\":\"end\"}]}";

    @Test
    void execute_는_받는_노드로_끝난_실행의_endedBy_와_caught_를_싣는다() {
        DmeTestSupport.ruleSet(jdbc, "RS_CATCH", "받는 노드", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "RS_CATCH", CATCH_FLOW);
        RuleSetRunRequest req = new RuleSetRunRequest();
        req.setSetId("RS_CATCH");
        req.setRecordJson("{}");
        req.setEvalTs("2026-03-01 09:00:00");

        RuleSetRunResult out = runner.execute(req);

        assertEquals("c1", out.getEndedBy());
        assertEquals(1, out.getCaught().size());
        Map<String, Object> c = out.getCaught().get(0);
        assertEquals(List.of("ruleNodeId", "ruleId", "catchNodeId", "kind", "code", "message"), List.copyOf(c.keySet()));
        assertEquals("r1", c.get("ruleNodeId"));
        assertEquals("QLTY_GRD_JDG", c.get("ruleId"));
        assertEquals("INPUT_ERROR", c.get("kind"));
        assertEquals("MISSING_KEY", c.get("code"));
        assertEquals(List.of("start", "r1", "c1", "end"), out.getPath().stream().map(p -> p.get("nodeId")).toList());
        assertEquals(Map.of(), out.getFinalValues());
    }

    @Test
    void execute_는_받는_노드_없는_세트에서_endedBy_null_caught_빈_목록이다() {
        RuleSetRunRequest req = new RuleSetRunRequest();
        req.setSetId("RS_LINE");
        req.setRecordJson("{\"COIL_THK\":2.0,\"COIL_WID\":1200,\"SURF_GRD\":\"A\"}");
        req.setEvalTs("2026-03-01 09:00:00");

        RuleSetRunResult out = runner.execute(req);

        assertNull(out.getEndedBy());
        assertEquals(List.of(), out.getCaught());
    }
```

- [ ] **Step 2: 실패 확인** — `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetRunnerTest' --console=plain)` → 컴파일 오류(`getEndedBy`·`getCaught` 없음).

- [ ] **Step 3: 구현** — `RuleSetRunResult.java` 를 아래로 바꾼다.

```java
package com.dongkuk.dmes.mdm.common.rule.dto;

import java.util.List;
import java.util.Map;

/**
 * 룰 세트 실행 응답 — 결과 변수 전체와 방문 경로(노드 ID·종류·고른 선·결과 자리). 시각은 KST 문자열.
 *
 * <p>{@code warnings} — 판정을 막지 않은 경고 목록({@code {code, ruleId, message}}, 없으면 빈 목록). 먼저 폐기 룰 경고
 * ({@code RULE_DEPRECATED}, 세트 흐름에서 룰 ID 가 처음 나온 순서, 판정에 실제로 쓰였는지와 무관), 다음에 엔진 경고
 * ({@code EXPR_CELL_NULL}·{@code GRP_COND_NULL}·{@code BRANCH_COND_NULL}, 엔진이 낸 순서 — 세트 경고, 이어서 룰 경고).
 * 엔진 경고의 ruleId 는 null 일 수 있다.
 *
 * <p>{@code endedBy} — 받는 노드 처리 갈래가 END 로 세트를 끝냈으면 그 CATCH 노드 ID, 아니면 null(받는 노드 spec §7). OASIS BPMN 은 이 값으로
 * 게이트웨이를 나눈다 — 끝냈으면 {@code finalValues} 의 비어 있는 결과를 정상 결과로 쓰지 않는다(X-D10).
 * {@code caught} — 받는 노드가 받아 처리한 exception {@code {ruleNodeId, ruleId, catchNodeId, kind, code, message}}, 실행 순서(없으면 빈 목록).
 */
public class RuleSetRunResult {

    private String setId;
    private String evalTs;
    private Map<String, Object> finalValues;
    private List<Map<String, Object>> path;
    private List<Map<String, Object>> warnings = List.of();
    private String endedBy;
    private List<Map<String, Object>> caught = List.of();

    public String getSetId() { return setId; }
    public String getEvalTs() { return evalTs; }
    public Map<String, Object> getFinalValues() { return finalValues; }
    public List<Map<String, Object>> getPath() { return path; }
    public List<Map<String, Object>> getWarnings() { return warnings; }
    public String getEndedBy() { return endedBy; }
    public List<Map<String, Object>> getCaught() { return caught; }

    public void setSetId(String v) { this.setId = v; }
    public void setEvalTs(String v) { this.evalTs = v; }
    public void setFinalValues(Map<String, Object> v) { this.finalValues = v; }
    public void setPath(List<Map<String, Object>> v) { this.path = v; }
    public void setWarnings(List<Map<String, Object>> v) { this.warnings = v; }
    public void setEndedBy(String v) { this.endedBy = v; }
    public void setCaught(List<Map<String, Object>> v) { this.caught = v; }
}
```

`RuleSetRunner.java` — `execute` 의 `out.setWarnings(warnings(request.getSetId(), r));`(155행) 뒤에 더한다.

```java
        out.setEndedBy(r.endedBy());
        out.setCaught(r.caught().stream().map(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ruleNodeId", c.ruleNodeId());
            m.put("ruleId", c.ruleId());
            m.put("catchNodeId", c.catchNodeId());
            m.put("kind", c.kind().name());
            m.put("code", c.code());
            m.put("message", c.message());
            return m;
        }).toList());
```
머리 javadoc 의 `OASIS BPMN 은 …` 문단 끝에 `받는 노드로 받은 실패는 던지지 않고 {@code RuleSetRunResult.endedBy}·{@code caught} 로 싣는다.` 를 더한다.

- [ ] **Step 4: 통과 확인** — `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetRunnerTest' --tests '*RuleSetRunnerOasisTest' --tests '*DmeOasisHttpTest' --console=plain)` → PASS. `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)` → PASS.

- [ ] **Step 5: 커밋**

```
/usr/bin/git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/dto/RuleSetRunResult.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunnerTest.java
/usr/bin/git commit -m "feat(mdm): 룰 세트 execute 응답에 받는 노드 endedBy·caught 를 싣는다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/dto/RuleSetRunResult.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunnerTest.java
```

---

### Task 6: 화면 편집 연산 — 받는 노드 보존·만들기·종류 바꾸기·지우기·블록 걷기·위치 미저장

**권장 모델:** opus — 복사·정규 JSON·블록 걷기(`reach`)·지우기 연쇄가 기존 연산 전부에 퍼져 있어, 하나라도 받는 노드 칸을 흘리면 저장 글자·dirty·되돌리기가 조용히 틀어진다.
**병렬:** Task 2 뒤. Task 3·4·7 과 함께 돌 수 있다(`flow-edit.ts` 만 고친다). Task 8·9 가 이 태스크 뒤.

**이 태스크가 정한 것:**
- 노드 복사(`copyNode`)는 CATCH 노드만 `label` 뒤에 `attachTo`·`catches` 를 둔다. 그래서 받는 노드 없는 흐름의 `flowJsonOf` 글자·`NODE_KEYS` 기대는 그대로다(Review Focus 1·5).
- 받는 노드 만들기는 `addCatch(f, 룰 노드 ID, 처리 갈래 첫 노드 ID | null)` 한 연산이다. null 이면 END 로 간다(우클릭 「예외 받기 추가」, R14). 캔버스 연결점 끌기(Task 8)는 놓은 노드 ID 를 넘긴다.
- 블록 걷기(`reach`)는 모은 RULE 에 붙은 CATCH 와 그 처리 갈래도 블록에 넣는다. 처리 갈래가 END 에 닿으면 그 경로만 멈추고 블록은 닫힌 것으로 본다. 그래서 받는 룰이 든 분기를 지우기·접기·풀기·갈래 지우기에 처리 갈래가 함께 들어간다.
- 받는 노드가 든 분기 블록 복사는 거부한다(R14). 룰 하나 복사·복제는 받는 노드 없이 룰만 복사한다.
- 받는 노드 위치는 저장하지 않는다 — `setPositions` 가 CATCH ID 를 건너뛴다(그래서 `pinDrawn`·`shiftSpace`·`autoArrange` 도 저장하지 않는다).

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts`(12-15 import, 120 `copyNode`, 303-326 `reach`, 463-489 `removeNode`, 574-581 `connect`, 588-606 `reconnectEdge`, 689-698 `setPositions`, 914-937 `copyFragment`, 파일 끝 새 연산)
- Create(Test): `src/frontend/m-mdm/tests/dme/ruleSetEdit/catch-edit.test.ts`

**Interfaces:**
- Consumes(Task 1·2): 생성 `FlowNode.attachTo?`·`catches?`, `CatchKind`; `flow-model.ts` 의 `CATCH_KINDS`·`CATCHABLE`·`catchesOf`·`parseFlow`.
- Produces(Task 8·9 가 쓴다):
  - `export function addCatch(f: EditFlow, ruleNodeId: string, to: string | null): EditResult & { id?: string }` — 새 받는 노드 ID 는 `c1`, `c2`, …(다른 노드·선·메모·그룹 ID 와 겹치지 않는 가장 작은 것), 받는 종류는 그 룰에서 아직 아무도 받지 않는 첫 종류(`CATCH_KINDS` 순서), `label=null`, 노드 배열에서 그 룰의 마지막 받는 노드(없으면 룰) 바로 뒤, 선 `{c → to}` 는 선 배열 끝.
  - `export function setCatchKinds(f: EditFlow, catchId: string, kinds: readonly CatchKind[]): EditResult` — `CATCH_KINDS` 순서로 정렬·중복 제거해 넣는다.
  - 거부 문구 상수: `export const CATCH_FULL = "이 룰의 예외 종류 네 가지를 모두 받고 있다"`, `export const CATCH_KINDS_EMPTY = "받을 예외 종류를 하나 이상 고른다"`, `export const CATCH_ONLY_RULE = "룰 노드에만 예외 받기를 붙인다"`, `export const CATCH_BAD_TARGET = "처리 갈래는 시작·받는 노드·자기 룰로 갈 수 없다"`, `export const NO_COPY_CATCH = "받는 노드가 든 블록은 복사하지 않는다"`, `export const CATCH_TAKEN = (kind: CatchKind, owner: string) => \`예외 종류 ${kind}는 ${owner}가 이미 받는다\``, `export const CATCH_NO_IN = "받는 노드로 들어가는 선은 둘 수 없다"`, `export const CATCH_ONE_OUT = "받는 노드에서 나가는 선은 하나다"`.
  - `removeNode(f, 룰)` 은 붙은 받는 노드와 그 나가는 선을 함께 지운다. `removeNode(f, 받는 노드)` 는 받는 노드와 그 나가는 선만 지운다(처리 갈래 안 노드는 남긴다 — 스펙 §8).
  - `connect`·`reconnectEdge` 는 받는 노드로 들어가는 선(`CATCH_NO_IN`)과 이미 나가는 선이 있는 받는 노드에서 나가는 선(`CATCH_ONE_OUT`)을 거부한다. 처리 갈래 첫 선의 도착 끝 옮기기는 된다(캔버스 R1).

- [ ] **Step 1: 실패 시험** — `catch-edit.test.ts` 를 만든다.

```ts
import { describe, expect, it } from "vitest";

import type { FlowNode } from "../../../src/contract/engine-contract.generated";
import {
  CATCH_BAD_TARGET, CATCH_FULL, CATCH_KINDS_EMPTY, CATCH_NO_IN, CATCH_ONE_OUT, CATCH_TAKEN, NO_COPY_CATCH, addCatch, blockMembers, connect,
  copyFragment, flowJsonOf, reconnectEdge, removeNode, setCatchKinds, setPositions, toEditFlow, type EditFlow, type EditResult,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { parseFlow } from "../../../pages/dme/ruleSetEdit/flow-model";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const reason = (r: EditResult) => (r.ok ? null : r.reason);
const ids = (f: EditFlow) => f.nodes.map((n) => n.id);
const catchOf = (f: EditFlow, id: string) => f.nodes.find((n) => n.id === id) as FlowNode;

/** start → r1(R_A) → end. */
const base = () => toEditFlow(null, ["R_A"]);

describe("받는 노드 편집 연산(받는 노드 spec §8)", () => {
  it("addCatch 는 끝으로 가는 처리 갈래를 만들고 첫 빈 종류를 받으며 룰 바로 뒤에 놓인다", () => {
    const f = ok(addCatch(base(), "r1", null));
    expect(ids(f)).toEqual(["start", "r1", "c1", "end"]);
    expect(catchOf(f, "c1")).toEqual({ id: "c1", kind: "CATCH", ruleId: null, splitId: null, label: null, attachTo: "r1", catches: ["NO_RESULT"] });
    expect(f.edges.at(-1)).toMatchObject({ from: "c1", to: "end" });
    expect(parseFlow(f).issues).toEqual([]);
    const g = ok(addCatch(f, "r1", "end"));
    expect(ids(g)).toEqual(["start", "r1", "c1", "c2", "end"]);
    expect(catchOf(g, "c2").catches).toEqual(["INPUT_ERROR"]);
  });

  it("네 종류를 모두 받으면 더 붙이지 못하고, 룰이 아닌 노드·시작·자기 룰로는 만들지 않는다", () => {
    let f = base();
    for (let i = 0; i < 4; i++) f = ok(addCatch(f, "r1", null));
    expect(reason(addCatch(f, "r1", null))).toBe(CATCH_FULL);
    expect(reason(addCatch(base(), "end", null))).toBe("룰 노드에만 예외 받기를 붙인다");
    expect(reason(addCatch(base(), "r1", "start"))).toBe(CATCH_BAD_TARGET);
    expect(reason(addCatch(base(), "r1", "r1"))).toBe(CATCH_BAD_TARGET);
  });

  it("정규 JSON 은 CATCH 노드에만 attachTo·catches 를 label 뒤에 쓰고 다시 읽어도 같다", () => {
    const f = ok(addCatch(base(), "r1", null));
    const json = flowJsonOf(f);
    expect(json).toContain('{"id":"r1","kind":"RULE","ruleId":"R_A","splitId":null,"label":null},');
    expect(json).toContain('{"id":"c1","kind":"CATCH","ruleId":null,"splitId":null,"label":null,"attachTo":"r1","catches":["NO_RESULT"]}');
    expect(flowJsonOf(toEditFlow(JSON.parse(json), []))).toBe(json);
    expect(flowJsonOf(base())).not.toContain("attachTo");
  });

  it("setCatchKinds 는 정해진 순서로 정렬하고, 비거나 같은 룰의 다른 받는 노드가 받는 종류면 거부한다", () => {
    const f = ok(addCatch(ok(addCatch(base(), "r1", null)), "r1", null)); // c1: NO_RESULT, c2: INPUT_ERROR
    expect(catchOf(ok(setCatchKinds(f, "c1", ["HIT_CONFLICT", "NO_RESULT", "NO_RESULT"])), "c1").catches).toEqual(["NO_RESULT", "HIT_CONFLICT"]);
    expect(reason(setCatchKinds(f, "c1", []))).toBe(CATCH_KINDS_EMPTY);
    expect(reason(setCatchKinds(f, "c1", ["INPUT_ERROR"]))).toBe(CATCH_TAKEN("INPUT_ERROR", "c2"));
  });

  it("룰을 지우면 붙은 받는 노드와 그 선이 함께 지워지고 처리 갈래 안 노드는 남는다", () => {
    const f = ok(addCatch(toEditFlow(null, ["R_A", "R_B"]), "r1", "r2")); // c1 → r2(뒤 룰을 처리 갈래 첫 노드로)
    const g = ok(removeNode(f, "r1"));
    expect(ids(g)).toEqual(["start", "r2", "end"]);
    expect(g.edges.some((e) => e.from === "c1")).toBe(false);
  });

  it("받는 노드만 지우면 그 나가는 선만 지운다", () => {
    const f = ok(addCatch(base(), "r1", null));
    const g = ok(removeNode(f, "c1"));
    expect(ids(g)).toEqual(["start", "r1", "end"]);
    expect(g.edges.map((e) => [e.from, e.to])).toEqual([["start", "r1"], ["r1", "end"]]);
  });

  /** start → if1 [b1 → r1(R_A) → mr → m1][그 외 → m1] → end. r1 에 c1 → r9(R_C) → mr, c2 → end. */
  const ifWithGuard = (): EditFlow =>
    toEditFlow(
      {
        version: 1,
        nodes: [
          { id: "start", kind: "START", ruleId: null, splitId: null, label: null },
          { id: "if1", kind: "IF", ruleId: null, splitId: null, label: null },
          { id: "r1", kind: "RULE", ruleId: "R_A", splitId: null, label: null },
          { id: "c1", kind: "CATCH", ruleId: null, splitId: null, label: null, attachTo: "r1", catches: ["NO_RESULT"] },
          { id: "r9", kind: "RULE", ruleId: "R_C", splitId: null, label: null },
          { id: "c2", kind: "CATCH", ruleId: null, splitId: null, label: null, attachTo: "r1", catches: ["EVAL_ERROR"] },
          { id: "mr", kind: "MERGE", ruleId: null, splitId: "r1", label: null },
          { id: "m1", kind: "MERGE", ruleId: null, splitId: "if1", label: null },
          { id: "end", kind: "END", ruleId: null, splitId: null, label: null },
        ],
        edges: [
          { id: "e1", from: "start", to: "if1", order: null, cond: null, otherwise: false, label: null },
          { id: "b1", from: "if1", to: "r1", order: 1, cond: "X > 0", otherwise: false, label: null },
          { id: "bo", from: "if1", to: "m1", order: null, cond: null, otherwise: true, label: null },
          { id: "e2", from: "r1", to: "mr", order: null, cond: null, otherwise: false, label: null },
          { id: "e3", from: "c1", to: "r9", order: null, cond: null, otherwise: false, label: null },
          { id: "e4", from: "r9", to: "mr", order: null, cond: null, otherwise: false, label: null },
          { id: "e5", from: "c2", to: "end", order: null, cond: null, otherwise: false, label: null },
          { id: "e6", from: "mr", to: "m1", order: null, cond: null, otherwise: false, label: null },
          { id: "e7", from: "m1", to: "end", order: null, cond: null, otherwise: false, label: null },
        ],
      },
      [],
    );

  it("받는 룰이 든 IF 블록은 받는 노드·처리 갈래(끝으로 가는 것 포함)까지 한 블록이라 지우기·접기 대상이다", () => {
    const f = ifWithGuard();
    expect(parseFlow(f).issues).toEqual([]);
    expect(blockMembers(f, "if1")).toEqual(["if1", "r1", "c1", "r9", "c2", "mr", "m1"]);
    const g = ok(removeNode(f, "if1"));
    expect(ids(g)).toEqual(["start", "end"]);
  });

  it("받는 노드가 든 블록은 복사하지 않는다", () => {
    expect(copyFragment(ifWithGuard(), "if1")).toBe(NO_COPY_CATCH);
  });

  it("받는 노드 위치는 저장하지 않는다", () => {
    const f = ok(addCatch(base(), "r1", null));
    expect(setPositions(f, { c1: { x: 1, y: 2 }, r1: { x: 3, y: 4 } }).view.positions).toEqual({ r1: { x: 3, y: 4 } });
  });

  it("받는 노드로 들어가는 선·받는 노드에서 두 번째로 나가는 선은 만들지 않는다", () => {
    const f = ok(addCatch(base(), "r1", null));
    expect(reason(connect(f, "r1", "c1"))).toBe(CATCH_NO_IN);
    expect(reason(connect(f, "c1", "r1"))).toBe(CATCH_ONE_OUT);
  });

  it("처리 갈래 첫 선의 도착 끝은 옮길 수 있고, 받는 노드로 옮기거나 선이 있는 받는 노드에서 나가게 옮기는 것은 막는다", () => {
    // start → r1 → r2 → end(e1 e2 e3), c1 → end(e4), c2 → end(e5)
    const f = ok(addCatch(ok(addCatch(toEditFlow(null, ["R_A", "R_B"]), "r1", null)), "r1", null));
    expect(ok(reconnectEdge(f, "e4", { to: "r2" })).edges.find((e) => e.id === "e4")).toMatchObject({ from: "c1", to: "r2" });
    expect(reason(reconnectEdge(f, "e4", { to: "c2" }))).toBe(CATCH_NO_IN);
    expect(reason(reconnectEdge(f, "e2", { from: "c2" }))).toBe(CATCH_ONE_OUT);
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/catch-edit.test.ts` → import 오류(`addCatch` 등 없음).

- [ ] **Step 3: 구현** — `flow-edit.ts`.

import(12-15행 — 15행 `node-style` import 는 그대로 둔다):
```ts
import type { CatchKind, FlowEdge, FlowNode, FlowNodeKind, RuleSetFlow } from "@/contract/engine-contract.generated";

import { CATCHABLE, CATCH_KINDS, catchesOf, linearFlow } from "./flow-model";
```
머리 javadoc 끝에 ` * 받는 노드(받는 노드 spec §8): CATCH 노드만 attachTo·catches 를 label 뒤에 갖는다. 만들기 addCatch·종류 setCatchKinds(파일 끝), 룰을 지우면 붙은 받는 노드도 지운다. 위치는 저장하지 않는다(setPositions).` 를 더한다.

`copyNode`(120행):
```ts
/** 모든 칸을 채운 노드 복사. 받는 노드(CATCH)만 attachTo·catches 를 label 뒤에 둔다(서버 정규 JSON 과 같은 키 순서, Ruling R11). */
const copyNode = (n: FlowNode): FlowNode => {
  const base = node(n.id, n.kind, str(n.ruleId), str(n.splitId), str(n.label));
  if (n.kind !== "CATCH") return base;
  return { ...base, attachTo: str(n.attachTo), catches: Array.isArray(n.catches) ? n.catches.filter((k): k is string => typeof k === "string") : null };
};
```

`reach`(303-326행) — 받는 노드·처리 갈래를 블록에 넣는다.
```ts
function reach(f: EditFlow, from: readonly string[], stop: string, splitId: string, entry: (e: FlowEdge) => boolean): Set<string> | null {
  const seen = new Set<string>();
  /** handler = 받는 노드에서 시작한 처리 갈래 경로 — END 에 닿으면 그 경로만 멈춘다. */
  const queue: { id: string; handler: boolean }[] = from.map((id) => ({ id, handler: false }));
  while (queue.length > 0) {
    const { id, handler } = queue.shift()!;
    if (id === stop || seen.has(id)) continue;
    if (id === splitId) return null;
    const n = findNode(f, id);
    if (!n || n.kind === "START") return null;
    if (n.kind === "END") {
      if (handler) continue;
      return null;
    }
    seen.add(id);
    for (const e of outOf(f, id)) queue.push({ id: e.to, handler: handler || n.kind === "CATCH" });
    if (CATCHABLE.has(n.kind)) for (const c of catchesOf(f, id)) queue.push({ id: c.id, handler: true });
  }
  for (const id of seen) {
    if (!inOf(f, id).every((e) => entry(e) || seen.has(e.from))) return null;
  }
  return seen;
}
```
(받는 노드는 들어오는 선이 없으므로 들어오는 쪽 검사를 그대로 지난다. 처리 갈래가 돌아오는 MERGE(`splitId` = 룰)는 일반 노드처럼 모여 그 들어오는 선이 모두 블록 안에서 온다.)

`removeNode`(463-489행) — `if (n.kind === "MERGE") …` 줄 뒤에 받는 노드 갈래를 넣고, 룰 갈래의 마지막 줄을 바꾼다.
```ts
  if (n.kind === "CATCH") return done(dropNodes(g, new Set([nodeId])));
  const ins = inOf(g, nodeId);
  if (isStep(n.kind)) {
    const outs = outOf(g, nodeId);
    if (ins.length !== 1 || outs.length !== 1) return fail(RULE_EDGES_NOT_ONE);
    ins[0].to = outs[0].to;
    g.edges = g.edges.filter((e) => e !== outs[0]);
    // 붙은 받는 노드와 그 나가는 선도 지운다 — 처리 갈래 안 노드는 남긴다(스펙 §8, 검사가 연결 끊김을 알린다).
    return done(dropNodes(g, new Set([nodeId, ...catchesOf(g, nodeId).map((c) => c.id)])));
  }
```

`connect`(574-581행) — 같은 선 검사 뒤에 넣는다.
```ts
  const target = findNode(g, to);
  if (target?.kind === "CATCH") return fail(CATCH_NO_IN);
  if (findNode(g, from)?.kind === "CATCH" && g.edges.some((e) => e.from === from)) return fail(CATCH_ONE_OUT);
```

`reconnectEdge`(588-606행) — `if (from === to) …` 줄 뒤에 넣는다.
```ts
  if (findNode(g, to)!.kind === "CATCH") return fail(CATCH_NO_IN);
  if (from !== e.from && findNode(g, from)!.kind === "CATCH" && g.edges.some((x) => x.id !== edgeId && x.from === from)) return fail(CATCH_ONE_OUT);
```

`setPositions`(689-698행) — 흐름 노드 ID 집합에서 받는 노드를 뺀다.
```ts
  const ids = new Set(g.nodes.filter((n) => n.kind !== "CATCH").map((n) => n.id)); // 받는 노드 위치는 저장하지 않는다(R14)
```
javadoc 끝에 ` 받는 노드(CATCH) 위치는 적지 않는다 — 룰 기준으로 그린다(flow-layout catchSpot).` 를 더한다.

`copyFragment`(914-937행) — `const inside = new Set(members);` 뒤에:
```ts
  if (f.nodes.some((x) => inside.has(x.id) && x.kind === "CATCH")) return NO_COPY_CATCH;
```

파일 끝(`setNodesColor` 뒤)에 더한다.
```ts
// ───────────────────────── 받는 노드(받는 노드 spec §8) ─────────────────────────

/** 새 받는 노드 ID 접두어. */
const CATCH_PREFIX = "c";
export const CATCH_FULL = "이 룰의 예외 종류 네 가지를 모두 받고 있다";
export const CATCH_KINDS_EMPTY = "받을 예외 종류를 하나 이상 고른다";
export const CATCH_ONLY_RULE = "룰 노드에만 예외 받기를 붙인다";
export const CATCH_BAD_TARGET = "처리 갈래는 시작·받는 노드·자기 룰로 갈 수 없다";
export const NO_COPY_CATCH = "받는 노드가 든 블록은 복사하지 않는다";
export const CATCH_NO_IN = "받는 노드로 들어가는 선은 둘 수 없다";
export const CATCH_ONE_OUT = "받는 노드에서 나가는 선은 하나다";
export const CATCH_TAKEN = (kind: CatchKind, owner: string) => `예외 종류 ${kind}는 ${owner}가 이미 받는다`;

/**
 * 룰 노드에 받는 노드를 붙인다(연결점 끌기·우클릭 「예외 받기 추가」, Ruling R14). to 는 처리 갈래 첫 노드(null 이면 END).
 * 받는 종류는 그 룰에서 아직 아무도 받지 않는 첫 종류, label 은 null. 노드는 그 룰의 마지막 받는 노드(없으면 룰) 바로 뒤, 선은 끝에 넣는다.
 */
export function addCatch(f: EditFlow, ruleNodeId: string, to: string | null): EditResult & { id?: string } {
  const g = clone(f);
  const r = findNode(g, ruleNodeId);
  if (!r) return fail(notFound(ruleNodeId));
  if (!CATCHABLE.has(r.kind)) return fail(CATCH_ONLY_RULE);
  if (g.nodes.length >= MAX_NODES) return fail(NODE_LIMIT_MESSAGE);
  const siblings = catchesOf(g, ruleNodeId);
  const taken = new Set(siblings.flatMap((c) => c.catches ?? []));
  const kind = CATCH_KINDS.find((k) => !taken.has(k));
  if (!kind) return fail(CATCH_FULL);
  const targetId = to ?? g.nodes.find((n) => n.kind === "END")?.id ?? null;
  const t = targetId == null ? undefined : findNode(g, targetId);
  if (!t) return fail(notFound(targetId ?? "END"));
  if (t.kind === "START" || t.kind === "CATCH" || t.id === ruleNodeId) return fail(CATCH_BAD_TARGET);
  const taken2 = takenIds(g);
  const c: FlowNode = { ...node(fresh(taken2, CATCH_PREFIX), "CATCH"), attachTo: ruleNodeId, catches: [kind] };
  const anchor = siblings.length > 0 ? siblings[siblings.length - 1].id : ruleNodeId;
  insertAfter(
    g.nodes,
    g.nodes.findIndex((n) => n.id === anchor),
    c,
  );
  g.edges.push(edge(fresh(taken2, "e"), c.id, t.id));
  const res = done(g);
  return res.ok ? { ...res, id: c.id } : res;
}

/** 받는 노드의 받는 종류를 바꾼다(속성 패널). CATCH_KINDS 순서로 정렬하고 겹친 것은 하나로. 비거나 같은 룰의 다른 받는 노드가 받는 종류면 거부한다. */
export function setCatchKinds(f: EditFlow, catchId: string, kinds: readonly CatchKind[]): EditResult {
  const g = clone(f);
  const c = findNode(g, catchId);
  if (!c || c.kind !== "CATCH") return fail(`받는 노드 ${catchId}를 찾지 못했다`);
  const sorted = CATCH_KINDS.filter((k) => kinds.includes(k));
  if (sorted.length === 0) return fail(CATCH_KINDS_EMPTY);
  if (c.attachTo) {
    for (const other of catchesOf(g, c.attachTo)) {
      if (other.id === catchId) continue;
      const clash = sorted.find((k) => (other.catches ?? []).includes(k));
      if (clash) return fail(CATCH_TAKEN(clash, other.id));
    }
  }
  c.catches = [...sorted];
  return done(g);
}
```
`fail`·`notFound`·`findNode`·`fresh`·`takenIds`·`insertAfter`·`node`·`edge`·`clone`·`done` 은 이 파일 안 도우미다(`notFound` 는 801행 근처 상수 — 모듈이 다 읽힌 뒤 부르므로 앞에서 써도 된다).

- [ ] **Step 4: 통과 확인** — `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/catch-edit.test.ts tests/dme/ruleSetEdit/flow-edit.test.ts tests/dme/ruleSetEdit/flow-edit-3.test.ts tests/dme/ruleSetEdit/collapse.test.ts` → PASS(기존 사례 기대를 고치지 않는다). lint 0, `flow-edit.ts`·시험 파일 audit 두 개 0건.

- [ ] **Step 5: 커밋**

```
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/catch-edit.test.ts
/usr/bin/git commit -m "feat(m-mdm): 받는 노드 편집 연산 — 보존·만들기·종류·지우기·블록 걷기·위치 미저장" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/catch-edit.test.ts
```

---

### Task 7: 화면 자동 배치 — 받는 노드 자리·처리 갈래 오른쪽·돌아오는 합류는 정상 갈래 아래

**권장 모델:** opus — dagre 결과를 고쳐 쓰는 배치 계산이라 겹침·갈래 순서·저장 위치와 맞물린다.
**병렬:** Task 2 뒤. Task 3·4·6 과 함께 돌 수 있다(`flow-layout.ts` 만 고친다). Task 8 이 이 태스크 뒤.

**이 태스크가 정한 것:**
- 받는 노드 자리는 늘 붙은 룰의 그린 자리·크기에서 계산한다(`catchSpot`, R15). dagre 에는 룰 → 받는 노드 가상 선으로 넣어 처리 갈래가 룰 아래 층으로 오게 하고, 끝에 받는 노드 자리만 룰 테두리로 다시 놓는다(스펙 §8).
- 처리 갈래는 받는 노드 순서대로 정상 갈래(룰 가운데 아래)의 오른쪽에 `NODESEP` 간격으로 둔다. 돌아오는 MERGE 는 룰 가운데 아래(= 정상 갈래 아래)다.
- 겹침 풀기(`resolveOverlaps`)는 받는 노드를 상자로 보지 않는다(룰 테두리에 걸쳐 있는 것이 정상이다).

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts`(10-12 import, 49-71 `autoLayout`, 93-130 `orderBranches`, 273-278 `drawnPositions`, 새 `CATCH_LEFT`·`CATCH_STEP`·`catchSpot`·`catchSlots`·`placeCatches`)
- Create(Test): `src/frontend/m-mdm/tests/dme/ruleSetEdit/catch-layout.test.ts`

**Interfaces:**
- Consumes(Task 1·2): `NODE_SIZE.CATCH`, `Guarded`·`Handler`, `CATCHABLE`.
- Produces(Task 8 이 쓴다):
  - `export const CATCH_LEFT = 16`, `export const CATCH_STEP = 36`
  - `export function catchSpot(rule: FlowPos, ruleSize: NodeSize, k: number): FlowPos` — `{ x: rule.x + 16 + k × 36, y: rule.y + ruleSize.h − 14 }`
  - `export function catchSlots(f: RuleSetFlow): Map<string, { attachTo: string; k: number }>` — 받는 노드 ID → 붙은 노드·순번(노드 배열 순서). 붙은 노드가 없거나 받을 수 없는 종류면 빠진다.
  - `export function placeCatches(f: RuleSetFlow & StyledFlow, pos: Readonly<Record<string, FlowPos>>, blocks?: Readonly<Record<string, unknown>>): Record<string, FlowPos>` — 받는 노드 자리를 다시 정한 새 객체. 붙은 룰 자리가 없으면 그 받는 노드 키를 뺀다. 받는 노드가 없으면 입력을 그대로 돌려준다.
  - `autoLayout`·`drawnPositions` 결과의 받는 노드 자리는 `catchSpot` 이다.

- [ ] **Step 1: 실패 시험** — `catch-layout.test.ts` 를 만든다.

```ts
import { describe, expect, it } from "vitest";

import type { FlowEdge, FlowNode, FlowNodeKind, RuleSetFlow } from "../../../src/contract/engine-contract.generated";
import { toEditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { NODE_SIZE, autoLayout, catchSlots, catchSpot, drawnPositions } from "../../../pages/dme/ruleSetEdit/flow-layout";

const nd = (id: string, kind: FlowNodeKind, over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: null, splitId: null, label: null, ...over });
const ed = (id: string, from: string, to: string): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null });
const cx = (p: { x: number }, w: number) => p.x + w / 2;

/** start → r1 → n1 → mr → end. c1 → h1 → mr, c2 → h2 → end. */
const guarded = (): RuleSetFlow => ({
  version: 1,
  nodes: [
    nd("start", "START"), nd("r1", "RULE", { ruleId: "R1" }), nd("n1", "RULE", { ruleId: "N1" }),
    nd("c1", "CATCH", { attachTo: "r1", catches: ["NO_RESULT"] }), nd("h1", "RULE", { ruleId: "H1" }),
    nd("c2", "CATCH", { attachTo: "r1", catches: ["EVAL_ERROR"] }), nd("h2", "RULE", { ruleId: "H2" }),
    nd("mr", "MERGE", { splitId: "r1" }), nd("end", "END"),
  ],
  edges: [ed("e1", "start", "r1"), ed("e2", "r1", "n1"), ed("e3", "n1", "mr"), ed("e4", "c1", "h1"), ed("e5", "h1", "mr"),
    ed("e6", "c2", "h2"), ed("e7", "h2", "end"), ed("e8", "mr", "end")],
});

describe("받는 노드 배치(받는 노드 spec §8, Ruling R15)", () => {
  it("받는 노드는 룰 아래 테두리에 걸쳐 왼쪽부터 순번대로 놓인다", () => {
    expect(catchSpot({ x: 100, y: 200 }, { w: 232, h: 68 }, 0)).toEqual({ x: 116, y: 254 });
    expect(catchSpot({ x: 100, y: 200 }, { w: 232, h: 68 }, 1)).toEqual({ x: 152, y: 254 });
    expect([...catchSlots(guarded())]).toEqual([["c1", { attachTo: "r1", k: 0 }], ["c2", { attachTo: "r1", k: 1 }]]);
  });

  it("자동 배치 — 정상 갈래는 룰 아래, 처리 갈래는 그 오른쪽 순서대로, 돌아오는 합류는 룰 가운데 아래", () => {
    const pos = autoLayout(guarded());
    const W = NODE_SIZE.RULE.w;
    expect(cx(pos.n1, W)).toBeCloseTo(cx(pos.r1, W), 0);
    expect(cx(pos.mr, NODE_SIZE.MERGE.w)).toBeCloseTo(cx(pos.r1, W), 0);
    expect(pos.h1.x).toBeGreaterThanOrEqual(pos.n1.x + W);
    expect(pos.h2.x).toBeGreaterThanOrEqual(pos.h1.x + W);
    expect(pos.c1).toEqual(catchSpot(pos.r1, NODE_SIZE.RULE, 0));
    expect(pos.c2).toEqual(catchSpot(pos.r1, NODE_SIZE.RULE, 1));
  });

  it("그린 위치에서 받는 노드는 저장 위치가 있는 룰을 따라가고, 받는 노드의 저장 위치(옛 값)는 무시한다", () => {
    const f = toEditFlow({ ...guarded(), view: { positions: { r1: { x: 500, y: 40 }, c1: { x: 0, y: 0 } } } } as never, []);
    const pos = drawnPositions(f);
    expect(pos.r1).toEqual({ x: 500, y: 40 });
    expect(pos.c1).toEqual({ x: 516, y: 94 });
    expect(pos.c2).toEqual({ x: 552, y: 94 });
  });

  it("받는 노드 없는 흐름의 자동 배치는 그대로다", () => {
    const plain: RuleSetFlow = { version: 1, nodes: [nd("start", "START"), nd("r1", "RULE", { ruleId: "R1" }), nd("end", "END")],
      edges: [ed("e1", "start", "r1"), ed("e2", "r1", "end")] };
    expect(Object.keys(autoLayout(plain))).toEqual(["start", "r1", "end"]);
    expect(catchSlots(plain).size).toBe(0);
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/catch-layout.test.ts` → import 오류(`catchSpot` 없음).

- [ ] **Step 3: 구현** — `flow-layout.ts`.

import(10-12행)에 `CATCHABLE` 을 더한다: `import { CATCHABLE, isBlankJava, parseFlow, type Seq } from "./flow-model";`

`NODESEP` 상수 뒤에 받는 노드 자리 함수들을 더한다.
```ts
/** 받는 노드 가로 자리(Ruling R15) — 룰 왼쪽 테두리에서 처음 16, 받는 노드마다 36씩 오른쪽. */
export const CATCH_LEFT = 16;
export const CATCH_STEP = 36;

/** 받는 노드 좌상단 — 룰 아래 테두리에 걸친다(세로 가운데가 테두리). k 는 그 룰의 받는 노드 순번(노드 배열 순서). */
export function catchSpot(rule: FlowPos, ruleSize: NodeSize, k: number): FlowPos {
  return { x: rule.x + CATCH_LEFT + k * CATCH_STEP, y: rule.y + ruleSize.h - Math.round(NODE_SIZE.CATCH.h / 2) };
}

/** 받는 노드 ID → 붙은 노드 ID·순번(노드 배열 순서). 붙은 노드가 없거나 받을 수 없는 종류면 넣지 않는다. */
export function catchSlots(f: RuleSetFlow): Map<string, { attachTo: string; k: number }> {
  const out = new Map<string, { attachTo: string; k: number }>();
  const kindOf = new Map((f.nodes ?? []).map((n) => [n.id, n.kind] as const));
  const count = new Map<string, number>();
  for (const n of f.nodes ?? []) {
    if (n.kind !== "CATCH" || !n.attachTo) continue;
    const k = kindOf.get(n.attachTo);
    if (!k || !CATCHABLE.has(k)) continue;
    const i = count.get(n.attachTo) ?? 0;
    count.set(n.attachTo, i + 1);
    out.set(n.id, { attachTo: n.attachTo, k: i });
  }
  return out;
}

/** 받는 노드 자리를 붙은 룰의 자리·크기에서 다시 정한다. 붙은 룰 자리가 없으면(접힌 블록 안 등) 그 키를 뺀다. 받는 노드가 없으면 입력을 그대로 돌려준다. */
export function placeCatches(
  f: RuleSetFlow & StyledFlow, pos: Readonly<Record<string, FlowPos>>, blocks: Readonly<Record<string, unknown>> = {},
): Record<string, FlowPos> {
  const slots = catchSlots(f);
  if (slots.size === 0) return pos as Record<string, FlowPos>;
  const byId = new Map((f.nodes ?? []).map((n) => [n.id, n] as const));
  const out: Record<string, FlowPos> = { ...pos };
  for (const [id, s] of slots) {
    const at = pos[s.attachTo];
    if (!at) {
      delete out[id];
      continue;
    }
    out[id] = catchSpot(at, nodeSizeOf(f, byId.get(s.attachTo)!, blocks), s.k);
  }
  return out;
}
```

`autoLayout`(49-71행) — 선을 넣는 줄(59행) 뒤에 가상 선을 넣고, 반환 직전에 받는 노드 자리를 정한다.
```ts
  for (const e of f.edges ?? []) g.setEdge(e.from, e.to);
  // 받는 노드는 선이 아니라 attachTo 로 붙는다 — 룰에서 나가는 가상 선으로 넣어 처리 갈래가 룰 아래 층에 오게 한다(스펙 §8).
  for (const [id, s] of catchSlots(f)) g.setEdge(s.attachTo, id);
```
```ts
  return placeCatches(f, out, blocks);
```
(기존 `return out;` 을 바꾼다.)

`orderBranches`(93-130행)의 `visit`(96-129행)을 아래로 바꾼다 — `boxOf` 를 분기 밖으로 올리고 받는 룰 갈래를 더한다(Task 2 가 넣은 임시 `GUARDED` 처리를 바꾼다).
```ts
  const boxOf = (id: string): LaneBox => {
    const s = sizeOf(id);
    const x = cx.get(id)!;
    const y = (g.node(id) as { y: number }).y; // dagre 가 놓은 가운데 y
    return { x1: x - s.w / 2, x2: x + s.w / 2, y1: y - s.h / 2, y2: y + s.h / 2 };
  };
  const shift = (ids: readonly string[], d: number) => {
    if (d !== 0) for (const id of ids) cx.set(id, cx.get(id)! + d);
  };
  const visit = (seq: Seq) => {
    for (const b of seq.items) {
      if (b.type === "SEQ") visit(b);
      if (b.type === "GUARDED") {
        // 받는 노드 spec §8 — 정상 갈래는 룰 가운데 아래, 처리 갈래는 받는 노드 순서로 그 오른쪽, 돌아오는 MERGE 는 룰 가운데 아래.
        const ruleX = cx.get(b.rule.nodeId)!;
        const normalIds = bodyIds(b.normal).filter((id) => cx.has(id));
        let right = ruleX + sizeOf(b.rule.nodeId).w / 2;
        if (normalIds.length > 0) {
          const boxes = normalIds.map(boxOf);
          shift(normalIds, ruleX - (Math.min(...boxes.map((x) => x.x1)) + Math.max(...boxes.map((x) => x.x2))) / 2);
          right = Math.max(right, ...normalIds.map((id) => boxOf(id).x2));
        }
        for (const h of b.handlers) {
          const ids = bodyIds(h.body).filter((id) => cx.has(id));
          if (ids.length === 0) continue;
          const boxes = ids.map(boxOf);
          const x1 = Math.min(...boxes.map((x) => x.x1));
          const x2 = Math.max(...boxes.map((x) => x.x2));
          shift(ids, right + NODESEP - x1);
          right += NODESEP + (x2 - x1);
        }
        if (b.mergeId && cx.has(b.mergeId)) cx.set(b.mergeId, ruleX);
        visit(b.normal);
        for (const h of b.handlers) visit(h.body);
        continue;
      }
      if (b.type !== "SPLIT") continue;
      const lanes = b.branches.map((br) => {
        const ids = bodyIds(br.body).filter((id) => cx.has(id));
        if (ids.length > 0) {
          const boxes = ids.map(boxOf);
          return { ids, at: (Math.min(...boxes.map((x) => x.x1)) + Math.max(...boxes.map((x) => x.x2))) / 2, boxes };
        }
        const pts = (g.edge(b.nodeId, b.mergeId) as { points?: { x: number }[] } | undefined)?.points ?? [];
        const at = pts.length > 0 ? pts[Math.floor(pts.length / 2)].x : cx.get(b.nodeId)!;
        const half = NODE_SIZE.RULE.w / 2;
        const y1 = (g.node(b.nodeId) as { y: number }).y;
        const y2 = (g.node(b.mergeId) as { y: number }).y;
        return { ids, at, boxes: [{ x1: at - half, x2: at + half, y1, y2 }] as LaneBox[] };
      });
      const slots = spreadLanes(lanes, lanes.map((l) => l.at).sort((a, c) => a - c), NODESEP);
      lanes.forEach((l, i) => shift(l.ids, slots[i] - l.at));
      for (const br of b.branches) visit(br.body);
    }
  };
  visit(tree.root);
```
(기존 빈 갈래 주석 두 줄 — "빈 갈래(선만 지나는 자리)도 룰 하나 너비만큼…" — 은 그대로 옮겨 둔다.) 처리 갈래 몸 ID 에는 받는 노드(`bodyIds` 가 넣지 않는다 — 처리 갈래 `body` 에는 받는 노드가 없다)가 없으므로 받는 노드는 옮기지 않는다. 받는 노드 자리는 `autoLayout` 끝의 `placeCatches` 가 정한다.

`drawnPositions`(273-278행) — 겹침 상자에서 받는 노드를 빼고 끝에 자리를 정한다.
```ts
export function drawnPositions(f: EditFlow, blocks: Readonly<Record<string, unknown>> = {}): Record<string, FlowPos> {
  const saved = f.view?.positions ?? {};
  const nodes = (f.nodes ?? []).filter((n) => n.kind !== "CATCH"); // 받는 노드는 룰 테두리에 걸친다 — 겹침으로 보지 않는다(R15)
  const pinned = new Set(nodes.filter((n) => saved[n.id]).map((n) => n.id));
  const boxes = nodes.map((n) => ({ id: n.id, ...nodeSizeOf(f, n, blocks) }));
  return placeCatches(f, resolveOverlaps(boxes, positionsOf(f, blocks), pinned), blocks);
}
```
javadoc 끝에 ` 받는 노드(CATCH)는 마지막에 붙은 룰 자리에서 다시 정한다(저장 위치를 쓰지 않는다).` 를 더한다.

- [ ] **Step 4: 통과 확인** — `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/catch-layout.test.ts tests/dme/ruleSetEdit/flow-layout.test.ts tests/dme/ruleSetEdit/branch-order.test.ts tests/dme/ruleSetEdit/node-style-layout.test.ts tests/dme/ruleSetEdit/final-fix.test.ts` → PASS(기존 배치 사례 기대를 고치지 않는다 — 받는 노드 없는 흐름은 `placeCatches` 가 입력을 그대로 돌려준다). lint 0, audit 0건.

- [ ] **Step 5: 커밋**

```
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/catch-layout.test.ts
/usr/bin/git commit -m "feat(m-mdm): 받는 노드 자동 배치 — 룰 테두리 자리·처리 갈래 오른쪽·돌아오는 합류는 정상 갈래 아래" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/catch-layout.test.ts
```

---

### Task 8: 캔버스 — 받는 노드 그리기·예외 연결점·빨간 점선·우클릭 「예외 받기 추가」·지우기

**권장 모델:** sonnet — Task 6·7 의 순수 함수를 캔버스·메뉴·page 에 잇는 작업이다. React Flow 함정(memo·`nodrag nopan`·연결점 목록)은 아래 단계가 짚는다.
**병렬:** Task 6·7 뒤. Task 9·10 과 `nodes.tsx`·`page.tsx` 가 겹치므로 그 둘보다 먼저 병합한다.

**이 태스크가 정한 것:**
- 받는 노드는 React Flow 노드(`rsfFlow`, `kind=CATCH`)로 그리되 끌 수 없고(`draggable: false`) 자리는 늘 붙은 룰의 **지금 그린 자리**(끌기 중 위치 포함)에서 `catchSpot` 으로 계산한다 — 룰을 끌면 같은 렌더에서 함께 움직인다. 들어오는 연결점·네 변 잇기 손잡이·몸통 받기는 없다.
- 룰 노드에는 편집 모드에서 오른쪽 아래 "예외" 연결점(`CATCH_HANDLE = "catch"`, 빨간 번개)을 둔다. 거기서 끌어 놓으면 `onAddCatch(룰, 놓은 노드)` 를 한 번 부른다(그 사이 page·dagre 를 다시 그리지 않는다 — 연결 상태는 React Flow 내부 저장소에 있다). 보기·디버그 모드에서는 연결점이 없다(`linkable=false`).
- 받는 노드에서 나가는 선은 빨간 점선이다. 선 상태(실행·선택) 색이 이기되 점선은 남는다.
- 잇기 규칙: 받는 노드로 들어가는 선은 막는다(`linkAllowed`). 받는 노드에는 잇기 손잡이가 없어 새 선이 그곳에서 시작하지 못하고, 처리 갈래 첫 선(`c → X`)의 도착 끝은 선 끝 옮기기(R1)로 바꿀 수 있다. 예외 연결점은 `catchLinkAllowed`(룰 → 시작·받는 노드·자기 자신이 아닌 노드).
- 스냅 후보에서 받는 노드를 뺀다(작은 원이 이웃 노드 정렬을 흔들지 않게).

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx`(15-29 import, 74-82 `KIND_CLASS`, 323-368 연결점, 376-440 `FlowNodeView`, 496-509 `handlesOf`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowCanvas.tsx`(머리 주석 문단, 66-67 import, 205-300 props, 337-343 `linkAllowed`·새 `catchLinkAllowed`, 352-385 `EdgeData`, 787 선 모양, 1213-1260 nodes memo, 1273-1330 edges memo, 1448-1470 스냅 후보, 1633-1636 `onConnectCb`·`isValidLink`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/context-menu.ts:55-100`(`CanvasActions.addCatch`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/menus/edit-menu.ts:47-84`(룰 「예외 받기 추가」, 받는 노드 「삭제」)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useEditActions.ts:14-40,355-399`(`addCatch` 동작)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx:44,302,585-593,729,777`(`onAddCatch`, 구성 지침 막는 이유)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts:128-130,342-348`(새 `guideBlockReason`, `applyGuide` 가드 — R19)
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/catch.ts`
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/rsf-styles.ts`(`CATCH_CSS` 를 맨 뒤에 잇기, 머리 주석 영역 목록에 `catch 받는 노드`)
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/catch-text.ts`(받는 종류 화면 이름·받는 노드 제목 — React 의존 없음)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PanelHeader.tsx:15-31`(`PanelKind`·`PANEL_KIND` 에 `CATCH` — 새 받는 노드를 고르면 머리글이 이 표를 읽는다)
- Create(Test): `src/frontend/m-mdm/tests/dme/ruleSetEdit/catch-canvas.test.ts`

**Interfaces:**
- Consumes(Task 6·7): `addCatch`, `removeNode`, `nextId`, `catchSlots`·`catchSpot`, `NODE_SIZE.CATCH`.
- Produces(Task 9·10 이 쓴다):
  - `nodes.tsx`: `export const CATCH_HANDLE = "catch"`, `KIND_CLASS.CATCH = "rsf-catch"`, 받는 노드 루트 testid `flow-node-{id}`(다른 노드와 같다), 받는 노드 제목 `title` = `label ?? 종류 이름 묶음`, 예외 연결점 testid `flow-catch-handle-{룰 노드 ID}`.
  - `FlowCanvas.tsx`: props `onAddCatch?: (ruleNodeId: string, to: string) => void`, `export function catchLinkAllowed(flow: Pick<EditFlow, "nodes">, from, to): boolean`, `EdgeData.fromCatch: boolean`.
  - `context-menu.ts`: `CanvasActions.addCatch(ruleNodeId: string): void`. 메뉴 항목 id `catch-add`(룰 노드).
  - `state/useRuleSetEdit.ts`: `export function guideBlockReason(f: EditFlow): string | null` — 분기·빈 단계·받는 노드가 있으면 이유 문구(`받는 노드가 있는 흐름에는 적용하지 않는다` 등), 없으면 null.
  - `styles/catch.ts`: `export const CATCH_CSS`(Task 10 이 `caught` 상태 규칙을 덧붙인다).
  - `catch-text.ts`(React 의존 없음 — 순수 모듈 `trace-view.ts` 도 쓴다): `export const CATCH_KIND_LABEL: Readonly<Record<CatchKind, string>> = { NO_RESULT: "결과 없음", INPUT_ERROR: "입력 오류", EVAL_ERROR: "계산 오류", HIT_CONFLICT: "판정 충돌" }`, `export function catchTitle(n: FlowNode): string`(label, 없으면 받는 종류 이름을 ` · ` 로 이은 것).
  - `PanelHeader.tsx`: `PanelKind` 에 `"CATCH"`, `PANEL_KIND.CATCH = { label: "받는 노드", icon: IconBolt }`.

- [ ] **Step 1: 실패 시험** — `catch-canvas.test.ts` 를 만든다(렌더 시험 — 파일 첫 줄 happy-dom).

```ts
/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";

import { catchLinkAllowed, linkAllowed } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { CATCH_HANDLE, handlesOf } from "../../../pages/dme/ruleSetEdit/canvas/nodes";
import { CATCH_KIND_LABEL } from "../../../pages/dme/ruleSetEdit/catch-text";
import { editMenu } from "../../../pages/dme/ruleSetEdit/canvas/menus/edit-menu";
import type { CanvasActions, MenuContext } from "../../../pages/dme/ruleSetEdit/canvas/context-menu";
import { addCatch, toEditFlow, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { guideBlockReason } from "../../../pages/dme/ruleSetEdit/state/useRuleSetEdit";

const withCatch = (): EditFlow => {
  const r = addCatch(toEditFlow(null, ["R_A"]), "r1", null);
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
};

describe("받는 노드 캔버스 규칙(받는 노드 spec §8)", () => {
  it("룰 노드 연결점 목록에 예외 연결점이 있고 받는 노드는 나가는 그리기 연결점만 있다", () => {
    expect(handlesOf("RULE").map((h) => h.id)).toContain(CATCH_HANDLE);
    expect(handlesOf("CATCH").map((h) => h.id)).toEqual(["out"]);
    expect(handlesOf("TASK").map((h) => h.id)).not.toContain(CATCH_HANDLE);
  });

  it("받는 노드로 들어가는 선은 막고, 예외 연결점은 룰에서 시작·받는 노드·자기 자신이 아닌 곳으로만", () => {
    const f = withCatch();
    expect(linkAllowed(f, "r1", "c1")).toBe(false);
    expect(linkAllowed(f, "c1", "r1")).toBe(true); // 처리 갈래 첫 선의 끝 옮기기(R1) — 새 선은 받는 노드에 잇기 손잡이가 없어 시작하지 못한다
    expect(catchLinkAllowed(f, "r1", "end")).toBe(true);
    expect(catchLinkAllowed(f, "r1", "start")).toBe(false);
    expect(catchLinkAllowed(f, "r1", "c1")).toBe(false);
    expect(catchLinkAllowed(f, "r1", "r1")).toBe(false);
    expect(catchLinkAllowed(f, "end", "r1")).toBe(false);
  });

  it("룰 우클릭에 「예외 받기 추가」, 받는 노드 우클릭에 「삭제」 가 있다(편집 모드만)", () => {
    const calls: string[] = [];
    const actions = new Proxy({}, { get: (_t, k) => (...a: unknown[]) => calls.push(`${String(k)}:${a.join(",")}`) }) as unknown as CanvasActions;
    const ctx = (mode: "edit" | "view"): MenuContext => ({
      flow: withCatch(), rules: {}, mode, hasClipboard: false, selectedEdgeId: null, collapsed: new Set(), breakpoints: new Set(), canRun: true, act: actions,
    });
    const ruleItems = editMenu({ kind: "node", nodeId: "r1" }, ctx("edit"));
    ruleItems.find((i) => i.id === "catch-add")!.run!();
    expect(calls).toEqual(["addCatch:r1"]);
    expect(editMenu({ kind: "node", nodeId: "c1" }, ctx("edit")).map((i) => i.id)).toEqual(["delete"]);
    expect(editMenu({ kind: "node", nodeId: "r1" }, ctx("view"))).toEqual([]);
  });

  it("받는 노드가 있는 흐름에는 구성 지침을 적용하지 않는다(R19)", () => {
    expect(guideBlockReason(withCatch())).toBe("받는 노드가 있는 흐름에는 적용하지 않는다");
    expect(guideBlockReason(toEditFlow(null, ["R_A"]))).toBeNull();
  });

  it("종류 이름은 결과 없음·입력 오류·계산 오류·판정 충돌이다", () => {
    expect(CATCH_KIND_LABEL).toEqual({ NO_RESULT: "결과 없음", INPUT_ERROR: "입력 오류", EVAL_ERROR: "계산 오류", HIT_CONFLICT: "판정 충돌" });
  });
});
```
같은 파일 끝에 캔버스 렌더 사례 둘을 더한다. 렌더 준비는 `tests/dme/ruleSetEdit/flow-canvas.test.ts` 의 1-66행(`installDomStorage`·`host`·`root`·`beforeEach`/`afterEach`·`props(over)`·`draw(p)`·`q(id)`)과 같다 — 그 블록을 이 파일 머리(첫 줄 주석 뒤)에 옮겨 적고, `props()` 의 기본 `flow` 를 `withCatch()` 로, `rules` 를 `{}` 로 바꾼다(그 블록의 import — `createElement`·`act`·`createRoot`·`Root`·`vi`·`DmesUiProvider`·`FlowCanvas`·`FlowCanvasProps`·`flush`·`installDomStorage` — 도 함께 옮기고, `vi.mock(...api…)` 은 필요 없으면 뺀다).

```ts
describe("받는 노드 캔버스 그리기", () => {
  it("받는 노드는 룰 아래 테두리 자리에 그려지고 끌 수 없으며, 나가는 선은 빨간 점선이다", async () => {
    await draw(props({ mode: "edit" }));
    const c1 = q("flow-node-c1")!;
    expect(c1.classList.contains("rsf-catch")).toBe(true);
    expect((c1.closest(".react-flow__node") as HTMLElement).classList.contains("draggable")).toBe(false);
    const edge = document.querySelector('.react-flow__edge[data-id="e3"]')!;
    const path = edge.querySelector("path.react-flow__edge-path") as SVGPathElement;
    expect(path.style.strokeDasharray).toBe("6 4");
  });

  it("예외 연결점은 편집 모드의 룰 노드에만 그린다", async () => {
    await draw(props({ mode: "edit" }));
    expect(q("flow-catch-handle-r1")).not.toBeNull();
    await draw(props({ mode: "view" }));
    expect(q("flow-catch-handle-r1")).toBeNull();
  });
});
```
(`withCatch()` 의 선 ID 는 `e1`(start→r1)·`e2`(r1→end)·`e3`(c1→end) 다.)

- [ ] **Step 2: 실패 확인** — `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/catch-canvas.test.ts` → import 오류(`catchLinkAllowed`·`CATCH_HANDLE`·`CATCH_KIND_LABEL` 없음).

- [ ] **Step 3: `nodes.tsx`**

import 에 `IconBolt` 를 더한다: `import { IconBolt, IconExternalLink, IconPencil } from "@tabler/icons-react";`.

`KIND_CLASS` 에 `CATCH: "rsf-catch",` 를 더한다. 연결점 상수 묶음(323-336행) 뒤에:
```ts
/** 룰 노드의 "예외" 연결점 id — 끌어 놓으면 받는 노드와 처리 갈래 첫 선을 함께 만든다(받는 노드 spec §8). */
export const CATCH_HANDLE = "catch";
```
import 에 `import { catchTitle } from "../catch-text";` 를 더한다(`CatchKind` 타입 import 는 필요 없다).

`catch-text.ts` 를 만든다.
```ts
/**
 * 받는 노드 화면 글(받는 노드 spec §1·§8) — 종류 이름과 받는 노드 제목. React 의존이 없어 순수 모듈(`trace-view.ts`)도 쓴다.
 * 노드 그리기·속성 패널·디버거 배지·상태 문구가 같은 이름을 쓴다.
 */
import type { CatchKind, FlowNode } from "@/contract/engine-contract.generated";

export const CATCH_KIND_LABEL: Readonly<Record<CatchKind, string>> = {
  NO_RESULT: "결과 없음",
  INPUT_ERROR: "입력 오류",
  EVAL_ERROR: "계산 오류",
  HIT_CONFLICT: "판정 충돌",
};

/** 받는 노드 표시 제목 — label, 없으면 받는 종류 이름을 " · " 로 잇는다(모르는 키는 그대로). */
export function catchTitle(n: Pick<FlowNode, "label" | "catches">): string {
  return n.label ?? (n.catches ?? []).map((k) => CATCH_KIND_LABEL[k as CatchKind] ?? k).join(" · ");
}
```

`PanelHeader.tsx` — `PanelKind`(15행)에 `| "CATCH"` 를 더하고(`"MERGE"` 뒤), `PANEL_KIND` 에 `CATCH: { label: "받는 노드", icon: IconBolt },` 를 더한다(`@tabler/icons-react` import 에 `IconBolt`). 새 받는 노드를 고르면(Step 6 의 `select(id)`) 머리글이 `PANEL_KIND[target.kind]` 를 읽으므로 이 줄이 없으면 그리기가 깨진다. 이름(`panelTargetOf` 의 대체 제목)은 Task 9 가 `catchTitle` 로 바꾼다.

`LinkHandles` 뒤에 예외 연결점을 더한다.
```ts
/** 룰 노드 오른쪽 아래 "예외" 연결점(편집 모드만, 받는 노드 spec §8). 노드에 마우스를 올리면 보인다. */
function CatchHandle({ node, isConnectable }: { node: FlowNode; isConnectable: boolean }) {
  return (
    <Handle
      id={CATCH_HANDLE}
      type="source"
      position={Position.Bottom}
      className="rsf-catch-link"
      isConnectable={isConnectable}
      data-testid={`flow-catch-handle-${node.id}`}
      title="끌어서 놓으면 예외를 받는 노드와 처리 갈래를 만든다"
    >
      <IconBolt size={10} aria-hidden="true" />
    </Handle>
  );
}
```

`FlowNodeView` — 받는 노드 본문·연결점을 고친다.
```tsx
      {kind !== "START" && kind !== "CATCH" && <Handle id={ANCHOR_IN} type="target" position={Position.Top} className="rsf-anchor" isConnectableStart={false} />}
```
```tsx
      {!collapsed && kind === "CATCH" && (
        <span className="rsf-catch-icon" title={catchTitle(node)} aria-label={`받는 노드 ${catchTitle(node)}`}>
          <IconBolt size={14} aria-hidden="true" />
        </span>
      )}
```
(위 줄은 `kind === "MERGE"` 줄 뒤에 둔다.)
```tsx
      {data.linkable && kind !== "CATCH" && <LinkHandles node={node} isConnectable={isConnectable} />}
      {data.linkable && kind === "RULE" && !collapsed && <CatchHandle node={node} isConnectable={isConnectable} />}
```
(기존 `{data.linkable && <LinkHandles … />}` 를 위 두 줄로 바꾼다.)

`handlesOf`(496-509행) — 받는 노드와 룰의 예외 연결점을 목록에 둔다(React Flow 는 끌기를 시작한 연결점을 이 목록에서 id 로 찾는다).
```ts
  const sides = [side("top", w / 2, 0), side("right", w, h / 2), side("bottom", w / 2, h), side("left", 0, h / 2)];
  if (kind === "START") return [out, ...sides];
  if (kind === "END") return [into, body];
  if (kind === "CATCH") return [out];
  if (kind === "RULE") {
    const catchHandle = { id: CATCH_HANDLE, type: "source" as const, position: Position.Bottom, x: w - g * 2, y: h - g / 2, width: g, height: g };
    return [into, body, out, ...sides, catchHandle];
  }
  return [into, body, out, ...sides];
```

- [ ] **Step 4: `styles/catch.ts`·`rsf-styles.ts`**

```ts
/**
 * 받는 노드(받는 노드 spec §8) — 룰 아래 테두리에 걸친 작은 원(번개), 룰 노드 오른쪽 아래 "예외" 연결점. 색은 의미 토큰만, 한 변 색 바 없음(Local-Rules §8).
 * 받는 노드에서 나가는 선의 빨간 점선은 선 그리기(FlowCanvas 의 선 style)가 정한다. 디버거 상태(caught)는 Task 10 이 이 파일에 덧붙인다.
 */
export const CATCH_CSS = `
.rsf-node.rsf-catch {
  width: 28px; height: 28px; min-width: 0; padding: 0; border-radius: 50%; border: 2px solid var(--color-danger);
  background: var(--color-bg); color: var(--color-danger); display: flex; align-items: center; justify-content: center;
}
.rsf-node.rsf-catch .rsf-catch-icon { display: flex; }
.rsf-canvas .react-flow__handle.rsf-catch-link {
  width: 14px; height: 14px; min-width: 0; min-height: 0; z-index: 6; opacity: 0; cursor: crosshair; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; left: auto; right: 6px; transform: translateY(50%);
  background: var(--color-bg); border: 2px solid var(--color-danger); color: var(--color-danger); transition: opacity 0.12s;
}
.rsf-canvas[data-mode="edit"] .react-flow__node:hover .rsf-catch-link,
.rsf-canvas .react-flow__handle.rsf-catch-link.connectingfrom { opacity: 1; }
.rsf-canvas .react-flow__handle.rsf-catch-link:hover { background: var(--color-danger); color: var(--color-bg); }
`;
```
`rsf-styles.ts` 에 `import { CATCH_CSS } from "./styles/catch";` 를 더하고 `RSF_CSS` 배열 끝에 `CATCH_CSS` 를 더한다. 머리 주석의 영역 목록 끝에 `· catch 받는 노드` 를 더한다.

- [ ] **Step 5: `FlowCanvas.tsx`**

머리 주석 끝에 문단을 더한다.
```
 * 받는 노드(받는 노드 spec §8): CATCH 노드는 끌 수 없고 자리는 붙은 룰의 지금 그린 자리(끌기 중 포함)에서 `catchSpot` 으로 정한다 — 룰을 끌면 같은 렌더에서 따라간다.
 * 편집 모드 룰 노드의 "예외" 연결점(`CATCH_HANDLE`)을 끌어 놓으면 `onAddCatch(룰, 놓은 노드)` 를 놓을 때 한 번 부른다. 받는 노드에서 나가는 선은 빨간 점선이다.
 * 받는 노드로 들어가는 선은 `linkAllowed` 가 막는다(받는 노드에는 잇기 손잡이가 없어 새 선이 시작하지 않고, 처리 갈래 첫 선의 끝 옮기기는 된다). 스냅 후보에서 받는 노드를 뺀다.
```
import: `import { beyondLine, catchSlots, catchSpot, drawnPositions, foldOffsetX, NODE_SIZE, nodeSizeOf, spaceMinDelta, type SpaceAxis, type SpaceBlocks } from "../flow-layout";` 와 `import { ANCHOR_IN, ANCHOR_OUT, CATCH_HANDLE, GroupNodeData, NODE_TYPES, NoteNodeData, FlowNodeData, handlesOf, type CollapsedBlockInfo } from "./nodes";`, `import { CATCHABLE } from "../flow-model";`.

`FlowCanvasProps` 의 `onConnect` 뒤에:
```ts
  /** 룰 노드 "예외" 연결점을 끌어 다른 노드에 놓음(받는 노드 spec §8) — page 가 `addCatch(f, 룰, 놓은 노드)` 로 편집 한 번을 만든다. 편집 모드에서만 부른다. */
  onAddCatch?: (ruleNodeId: string, to: string) => void;
```
`linkAllowed` 를 받는 노드까지 막도록 바꾸고 `catchLinkAllowed` 를 더한다.
```ts
export function linkAllowed(flow: Pick<EditFlow, "nodes">, from: string | null | undefined, to: string | null | undefined): boolean {
  if (!from || !to || from === to) return false;
  const kindOf = (id: string) => flow.nodes.find((n) => n.id === id)?.kind;
  const a = kindOf(from);
  const b = kindOf(to);
  // 받는 노드는 선이 아니라 attachTo 로 붙는다 — 들어오는 선은 막는다(받는 노드 spec §3). 받는 노드에는 잇기 손잡이가 없어 새 선이 그곳에서
  // 시작하지 못하고, 처리 갈래 첫 선의 끝 옮기기(R1)는 출발이 받는 노드인 채 허용된다(두 번째 나가는 선은 connect·reconnectEdge 가 막는다).
  return !!a && !!b && a !== "END" && b !== "START" && b !== "CATCH";
}

/** 룰 노드 "예외" 연결점에서 이을 수 있는가 — 받을 수 있는 노드(지금은 룰)에서 시작·받는 노드·자기 자신이 아닌 노드로. */
export function catchLinkAllowed(flow: Pick<EditFlow, "nodes">, from: string | null | undefined, to: string | null | undefined): boolean {
  if (!from || !to || from === to) return false;
  const a = flow.nodes.find((n) => n.id === from)?.kind;
  const b = flow.nodes.find((n) => n.id === to)?.kind;
  return !!a && !!b && CATCHABLE.has(a) && b !== "START" && b !== "CATCH";
}
```
`EdgeData` 에 `/** 받는 노드에서 나가는 처리 갈래 첫 선 — 빨간 점선(받는 노드 spec §8). */ fromCatch: boolean;` 을 더한다. 선 그리기(787행)의 기본 style 바로 뒤에:
```ts
  if (data?.fromCatch) {
    style.stroke = "var(--color-danger)";
    style.strokeDasharray = "6 4";
  }
```
(선택·끼우기·실행 상태는 아래에서 stroke 를 덮어쓰고 점선은 남는다.)

nodes memo(1213-1260행) — `sizes` 만들기 뒤에 받는 노드 자리표를 두고, 흐름 노드 반복에서 받는 노드는 붙은 룰 자리에서 정한다.
```ts
    const slots = catchSlots(vflow);
```
```ts
    for (const n of vflow.nodes) {
      const slot = n.kind === "CATCH" ? slots.get(n.id) : undefined;
      const rulePos = slot ? pos[slot.attachTo] : undefined;
      if (n.kind === "CATCH" && !rulePos) continue; // 붙은 룰이 안 보이면(접힌 블록 안) 받는 노드도 그리지 않는다
      const p = rulePos && slot ? catchSpot(rulePos, sizes.get(slot.attachTo)!, slot.k) : (pos[n.id] ?? { x: 0, y: 0 });
```
같은 반복의 `out.push({...})` 에서 `draggable: editable` 을 `draggable: editable && n.kind !== "CATCH"` 로 바꾼다. `sizes` 는 `nodeSizeOf` 가 `NODE_SIZE.CATCH`(28×28)를 돌려준다(Task 1).

edges memo(1273-1330행)의 `data` 에 `fromCatch: kindOf.get(e.from) === "CATCH",` 를 더한다.

스냅 후보(1463-1466행):
```ts
    for (const n of nodesRef.current) {
      const isCatch = n.type === "rsfFlow" && (n.data as FlowNodeData).node.kind === "CATCH";
      if ((n.type === "rsfFlow" || n.type === "rsfNote") && !skip.has(n.id) && !isCatch) others.push(boxOf(n));
    }
```

`onConnectCb`·`isValidLink`(1633-1636행):
```ts
  const onConnectCb = useCallback((c: Connection) => {
    if (!editable) return;
    if (c.sourceHandle === CATCH_HANDLE) {
      if (catchLinkAllowed(flowRef.current, c.source, c.target)) onAddCatch?.(c.source, c.target);
      return;
    }
    if (linkAllowed(flowRef.current, c.source, c.target)) onConnect(c.source, c.target);
  }, [editable, onConnect, onAddCatch]);
  const isValidLink = useCallback(
    (c: Connection | Edge) =>
      c.sourceHandle === CATCH_HANDLE ? catchLinkAllowed(flowRef.current, c.source, c.target) : linkAllowed(flowRef.current, c.source, c.target),
    [],
  );
```
`Inner` 의 props 구조 분해(1086-1090행)에 `onAddCatch` 를 더한다.

- [ ] **Step 6: 메뉴·편집 동작·page**

`context-menu.ts` 의 `CanvasActions` 에 `duplicate` 뒤:
```ts
  /** 룰 노드에 받는 노드를 붙인다 — 끝으로 가는 처리 갈래(받는 노드 spec §8, R14). */
  addCatch(ruleNodeId: string): void;
```
`edit-menu.ts` — 룰 갈래의 `duplicate` 항목 뒤에 `{ id: "catch-add", label: "예외 받기 추가", run: () => act.addCatch(id) },` 를 넣고, 빈 단계 갈래 뒤에 받는 노드 갈래를 넣는다.
```ts
    if (n.kind === "CATCH") {
      return [{ id: "delete", label: "삭제", danger: true, run: () => act.removeNode(id) }];
    }
```
`useEditActions.ts` — import 에 `addCatch` 를 더하고, `actions` 의 `duplicate` 뒤에:
```ts
      addCatch: (ruleNodeId: string) => {
        if (editing) edit((f) => addCatch(f, ruleNodeId, null));
      },
```
`page.tsx` — `flow-edit` import(44행)에 `addCatch`·`nextId` 를 더하고, `onConnect`(302행) 뒤에:
```ts
  // 예외 연결점 끌기(받는 노드 spec §8) — 받는 노드와 처리 갈래 첫 선을 편집 한 번으로 만들고 새 받는 노드를 고른다(속성 패널이 열린다).
  const onAddCatch = useCallback(
    (ruleNodeId: string, to: string) => {
      const cur = flowRef.current; // 흐름을 의존성에 넣지 않는다 — 콜백 참조가 바뀌면 캔버스 memo 가 다시 돈다(Local-Rules §19)
      if (!editing || !cur) return;
      const id = nextId(cur, "c");
      if (edit((f) => addCatch(f, ruleNodeId, to)) === null) select(id);
    },
    [editing, edit, select],
  );
```
`useRuleSetEdit.ts` — `hasSplit`·`hasEmptyStep`(128-130행) 뒤에 이유 함수를 더하고 `applyGuide`(342-348행)의 가드를 바꾼다.
```ts
/**
 * 구성 지침(한 줄 순서 제안)을 적용할 수 없는 흐름이면 그 이유(화면 안내 문구), 아니면 null. 적용은 흐름을 `linearFlow(order)` 로 통째로 바꾸므로
 * 분기·빈 단계·받는 노드(R19)를 잃는다.
 */
export function guideBlockReason(f: EditFlow): string | null {
  if (hasSplit(f)) return "분기가 있는 흐름에는 적용하지 않는다";
  if (hasEmptyStep(f)) return "빈 단계가 있는 흐름에는 적용하지 않는다";
  if (f.nodes.some((n) => n.kind === "CATCH")) return "받는 노드가 있는 흐름에는 적용하지 않는다";
  return null;
}
```
```ts
      if (!cur || guideBlockReason(cur)) return;
```
`page.tsx`(585-593행)의 안내와 777행의 `canApplyGuide` 를 같은 함수로 바꾼다(import `guideBlockReason` from `./state/useRuleSetEdit`).
```ts
  const guideBlock = flow ? guideBlockReason(flow) : null;
  const guideHint = !editing ? "편집 모드에서 적용한다" : (guideBlock ?? undefined);
```
```tsx
                        canApplyGuide={editing && !guideBlock && !state.loading}
```
`isBranched`·`hasEmptyStep`(585-586행)과 87행의 `branched` 도우미는 이 안내·`canApplyGuide` 에서만 쓰이므로 함께 지운다(2026-10-01 기준 쓰는 곳은 87·585·586·589·591·777행뿐이다).

(`select` 는 `page.tsx:193` 의 노드 고르기 함수로 `<FlowCanvas onSelect={select}>`(716행)에 넘기는 것과 같다. `flowRef` 는 `page.tsx:134` 의 지금 흐름 ref 다.) `<FlowCanvas … onConnect={onConnect}`(729행) 뒤에 `onAddCatch={onAddCatch}` 를 넘긴다.

- [ ] **Step 7: 통과 확인** — `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/catch-canvas.test.ts tests/dme/ruleSetEdit/flow-connect.test.ts tests/dme/ruleSetEdit/flow-menu.test.ts tests/dme/ruleSetEdit/flow-canvas.test.ts tests/dme/ruleSetEdit/snap.test.ts tests/dme/ruleSetEdit/final-fix.test.ts` → PASS. `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit` → PASS. lint 0. 바꾼 `.ts`·`.tsx` 전부 audit 두 개 0건. `.css` import 0건. `final-fix.test.ts` 의 "끄는 동안 dagre 호출이 늘지 않는다" 류 시험이 그대로 통과해야 한다(받는 노드 자리는 memo 안 계산이라 dagre 를 다시 부르지 않는다).

- [ ] **Step 8: 커밋**

```
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowCanvas.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/context-menu.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/menus/edit-menu.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useEditActions.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/catch.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/rsf-styles.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/catch-text.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PanelHeader.tsx src/frontend/m-mdm/tests/dme/ruleSetEdit/catch-canvas.test.ts
/usr/bin/git commit -m "feat(m-mdm): 받는 노드 캔버스 — 룰 테두리 원·예외 연결점·빨간 점선·우클릭 예외 받기 추가·삭제" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowCanvas.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/context-menu.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/menus/edit-menu.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useEditActions.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/catch.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/rsf-styles.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/catch-text.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PanelHeader.tsx src/frontend/m-mdm/tests/dme/ruleSetEdit/catch-canvas.test.ts
```

---

### Task 9: 속성 패널 「받는 노드」 섹션·처리 갈래 첫 선 `CATCH_*` 칩

**권장 모델:** sonnet — Task 6 의 편집 연산과 Task 4 의 `CATCH_NEVER` 검사를 패널에 잇는 화면 작업이다.
**병렬:** Task 4·6·8 뒤(`page.tsx`·`PanelHeader.tsx` 를 Task 8 다음에 이어 고친다). Task 10 과 함께 돌 수 있다(겹치는 파일 없음 — Task 10 은 디버거·`trace-view.ts`·`nodes.tsx`).

**이 태스크가 정한 것:**
- 받는 노드를 고르면 오른쪽 패널은 「받는 노드」(제목·붙은 룰·`CATCH_*` 안내)와 「받을 예외」(종류 네 개 체크) 두 섹션이다. 같은 룰의 다른 받는 노드가 받는 종류는 끄고 "{받는 노드}가 받는다" 를 보인다. 체크 하나 = `setCatchKinds` 편집 한 번(되돌리기 한 칸). 마지막 하나를 끄려 하면 편집이 거부되고 실패 알림이 뜬다(`CATCH_KINDS_EMPTY`).
- 종류 옆 `CATCH_NEVER` 경고는 그 받는 노드의 검사 가운데 문구에 그 종류 이름(`결과 없음`·`판정 충돌`)이 든 것이다(문구는 Ruling R12 로 고정).
- 처리 갈래 첫 선(받는 노드에서 나가는 선)의 변수 칩은 `CATCH_KIND`·`CATCH_RULE`·`CATCH_CODE`·`CATCH_MSG` 다(스펙 §8).
- 머리글 이름은 `catchTitle`(label, 없으면 종류 이름)이다.

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx`(import, 67-75 `KIND_TEXT` 의 SEAM(T9) 지우기, 새 `CatchProps`, 445-453 `PropertyPanel` 분기)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PanelHeader.tsx:48`(받는 노드 대체 제목)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-vars.ts:11-22`(`edgeChips`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/props.ts`(받는 노드 섹션 한 줄 규칙)
- Create(Test): `src/frontend/m-mdm/tests/dme/ruleSetEdit/catch-panel.test.ts`

**Interfaces:**
- Consumes: `setCatchKinds`·`updateNodeLabel`·`removeNode`·`CATCH_KINDS_EMPTY`(Task 6), `CATCH_KINDS`·`CATCH_NAMES`·`catchesOf`(Task 2·4), `CATCH_KIND_LABEL`·`catchTitle`(Task 8), `RuleSetCheck.code === "CATCH_NEVER"`(Task 4).
- Produces: testid `flow-prop-catch`(패널 루트), `flow-prop-catch-title`(제목 칸), `flow-prop-catch-kind-{종류}`(체크를 감싼 줄 — 체크는 그 안 `input[aria-label="{종류 이름} 받기"]`), `flow-prop-catch-owner-{종류}`(다른 받는 노드가 받음), `flow-prop-catch-never-{종류}`(경고). `edgeChips` 는 받는 노드에서 나가는 선에 `CATCH_NAMES` 를 싣는다.

- [ ] **Step 1: 실패 시험** — `catch-panel.test.ts` 를 만든다.

```ts
/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { addCatch, toEditFlow, type EditFlow, type EditResult } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { edgeChips } from "../../../pages/dme/ruleSetEdit/flow-vars";
import { PropertyPanel, type PropertyPanelProps } from "../../../pages/dme/ruleSetEdit/panels/PropertyPanel";
import type { SectionMemory } from "../../../pages/dme/ruleSetEdit/panels/Section";
import type { RuleSetCheck } from "../../../pages/dme/ruleSetEdit/types";
import { installDomStorage } from "../helpers/render";

function must(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
/** start → r1 → end, c1(NO_RESULT) → end, c2(INPUT_ERROR) → end. */
const twoCatches = () => must(addCatch(must(addCatch(toEditFlow(null, ["R_A"]), "r1", null)), "r1", null));
const OPEN: SectionMemory = { isOpen: () => true, toggle: () => {}, open: () => {} };

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

async function draw(over: Partial<PropertyPanelProps> = {}) {
  const edits: EditFlow[] = [];
  const base: PropertyPanelProps = {
    flow: twoCatches(), rules: {}, checks: [], selectedId: "c1", editable: true, editing: true, sections: OPEN, onOpenRule: () => {},
    onEdit: (fn) => {
      const r = fn(base.flow);
      if ("ok" in r && !r.ok) return r.reason;
      edits.push("ok" in r ? r.flow : r);
      return null;
    },
    ...over,
  };
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement(PropertyPanel, base)));
  });
  return edits;
}
const box = (k: string) => document.querySelector(`[data-testid="flow-prop-catch-kind-${k}"] input[type="checkbox"]`) as HTMLInputElement;

describe("속성 패널 — 받는 노드(받는 노드 spec §8)", () => {
  it("받는 종류 네 개를 체크로 보이고, 같은 룰의 다른 받는 노드가 받는 종류는 끈다", async () => {
    await draw();
    expect(document.querySelector('[data-testid="flow-prop-catch"]')).not.toBeNull();
    expect(box("NO_RESULT").checked).toBe(true);
    expect(box("INPUT_ERROR").disabled).toBe(true);
    expect(document.querySelector('[data-testid="flow-prop-catch-owner-INPUT_ERROR"]')!.textContent).toBe("c2가 받는다");
    expect(box("EVAL_ERROR").checked).toBe(false);
  });

  it("체크를 켜면 편집 한 번으로 종류를 정해진 순서로 넣는다", async () => {
    const edits = await draw();
    await act(async () => {
      box("HIT_CONFLICT").click();
    });
    expect(edits).toHaveLength(1);
    expect(edits[0].nodes.find((n) => n.id === "c1")!.catches).toEqual(["NO_RESULT", "HIT_CONFLICT"]);
  });

  it("종류 옆에 그 종류의 CATCH_NEVER 경고를 보인다", async () => {
    const never: RuleSetCheck = {
      code: "CATCH_NEVER", severity: "WARN", ruleId: "R_A", otherRuleId: null, varName: null,
      message: "R_A에 기본 행이 있어 c1가 받는 결과 없음이 일어나지 않는다", nodeId: "c1", edgeId: null,
    };
    await draw({ checks: [never] });
    expect(document.querySelector('[data-testid="flow-prop-catch-never-NO_RESULT"]')!.textContent).toBe(never.message);
    expect(document.querySelector('[data-testid="flow-prop-catch-never-HIT_CONFLICT"]')).toBeNull();
  });

  it("처리 갈래 첫 선의 변수 칩은 CATCH_* 넷이다", () => {
    const f = twoCatches();
    const first = f.edges.find((e) => e.from === "c1")!;
    expect(edgeChips(f, {})[first.id]).toEqual(["CATCH_KIND", "CATCH_RULE", "CATCH_CODE", "CATCH_MSG"]);
  });
});
```
(shared `Checkbox`(`src/frontend/shared/src/components/form/Checkbox.tsx`)는 `data-testid` 를 받지 않으므로 testid 는 감싼 `div` 에 두고 그 안의 `input[type="checkbox"]` 를 찾는다.)

- [ ] **Step 2: 실패 확인** — `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/catch-panel.test.ts` → FAIL(받는 노드는 아직 `PlainNodeProps` 로 그려져 `flow-prop-catch` 가 없다, 칩 없음).

- [ ] **Step 3: 구현**

`PropertyPanel.tsx` — import 에 `Checkbox`(`@dk-oasis/shared/form` 묶음), `setCatchKinds`(`../flow-edit` 묶음), `CATCH_KINDS`·`catchesOf`(`../flow-model`), `CATCH_KIND_LABEL`·`catchTitle`(`../catch-text`), `import type { CatchKind } from "@/contract/engine-contract.generated";` 를 더한다. `KIND_TEXT.CATCH` 줄 끝의 `// SEAM(T9): …` 주석을 지운다. 머리 javadoc 목록에 `- 받는 노드: 제목·붙은 룰·CATCH_* 안내, 받을 예외 네 개 체크(같은 룰의 다른 받는 노드가 받는 종류는 꺼짐)·CATCH_NEVER 경고, [지우기].` 를 더한다. `TaskProps` 뒤에 더한다.

```tsx
/** 받는 노드(받는 노드 spec §8) — 제목·붙은 룰·CATCH_* 안내, 받을 예외 네 개 체크, 종류 옆 CATCH_NEVER 경고, 검사 문구·[지우기]. */
function CatchProps({ node, props }: { node: FlowNode; props: PropertyPanelProps }) {
  const { flow, checks, editable, onEdit, sections } = props;
  const mine = (node.catches ?? []) as CatchKind[];
  const owners = new Map<CatchKind, string>();
  for (const other of node.attachTo ? catchesOf(flow, node.attachTo) : []) {
    if (other.id === node.id) continue;
    for (const k of (other.catches ?? []) as CatchKind[]) owners.set(k, other.id);
  }
  const own = checks.filter((c) => c.nodeId === node.id);
  const neverOf = (k: CatchKind) => own.find((c) => c.code === "CATCH_NEVER" && c.message.includes(CATCH_KIND_LABEL[k]));
  return (
    <div className="rsf-panel" data-testid="flow-prop-catch">
      <Section kind="CATCH" id="catch-basic" title="받는 노드" memory={sections}>
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <tr>
              <th style={DETAIL_LABEL_CELL}>제목</th>
              <td style={DETAIL_VALUE_CELL}>
                <Input
                  data-testid="flow-prop-catch-title"
                  value={node.label ?? ""}
                  placeholder={catchTitle({ label: null, catches: node.catches })}
                  readOnly={!editable}
                  onChange={(v) => onEdit((f) => updateNodeLabel(f, node.id, blankToNull(v)), { mergeKey: `nlabel:${node.id}` })}
                />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>붙은 룰</th>
              <td style={DETAIL_VALUE_CELL}>
                <code>{node.attachTo ?? "-"}</code>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="rsf-panel-note">
          붙은 룰이 받는 예외로 실패하면(결과 없음은 받을 때만) 룰 결과를 쓰지 않고 처리 갈래를 실행한다. 처리 갈래에서 CATCH_KIND·CATCH_RULE·CATCH_CODE·CATCH_MSG 를 읽을 수 있다
        </p>
      </Section>
      <Section kind="CATCH" id="catch-kinds" title="받을 예외" memory={sections}>
        <div className="rsf-catch-kinds">
          {CATCH_KINDS.map((k) => {
            const owner = owners.get(k);
            const never = neverOf(k);
            return (
              <div key={k} className="rsf-catch-kind" data-testid={`flow-prop-catch-kind-${k}`}>
                <Checkbox
                  label={CATCH_KIND_LABEL[k]}
                  aria-label={`${CATCH_KIND_LABEL[k]} 받기`}
                  checked={mine.includes(k)}
                  disabled={!editable || owner != null}
                  onChange={(on) => onEdit((f) => setCatchKinds(f, node.id, on ? [...mine, k] : mine.filter((x) => x !== k)))}
                />
                {owner && <span className="rsf-muted" data-testid={`flow-prop-catch-owner-${k}`}>{`${owner}가 받는다`}</span>}
                {never && (
                  <p className="rsf-panel-note" data-testid={`flow-prop-catch-never-${k}`} style={badgeStyle("warning")}>
                    {never.message}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <CheckLines checks={own.filter((c) => c.code !== "CATCH_NEVER")} />
        {editable && (
          <div className="rsf-panel-actions">
            <DeleteButton onClick={() => onEdit((f) => removeNode(f, node.id))} />
          </div>
        )}
      </Section>
    </div>
  );
}
```
`PropertyPanel` 의 분기(450행 근처)에 `if (node.kind === "CATCH") return <CatchProps node={node} props={props} />;` 를 `TASK` 줄 뒤에 더한다.

`PanelHeader.tsx:48` 의 대체 제목에 받는 노드를 더한다(import `catchTitle`).
```ts
      const fallback = n.kind === "TASK" ? TASK_LABEL : n.kind === "CATCH" ? catchTitle({ label: null, catches: n.catches }) : n.kind === "MERGE" ? `분기 ${n.splitId ?? n.id} 합류` : n.kind === "START" || n.kind === "END" ? PANEL_KIND[n.kind].label : n.id;
```

`flow-vars.ts` `edgeChips`(11-22행) — 받는 노드에서 나가는 선에 `CATCH_*` 를 싣는다(import `CATCH_NAMES` from `./flow-model`).
```ts
export function edgeChips(f: RuleSetFlow, rules: RuleIoMap): Record<string, string[]> {
  const ruleOf = new Map<string, string>();
  const catches = new Set<string>();
  for (const n of f.nodes ?? []) {
    if (n.kind === "RULE" && n.ruleId) ruleOf.set(n.id, n.ruleId);
    if (n.kind === "CATCH") catches.add(n.id);
  }
  const out: Record<string, string[]> = {};
  for (const e of f.edges ?? []) {
    // 처리 갈래 첫 선 — 받는 노드가 넣는 예약 이름(받는 노드 spec §8)
    if (catches.has(e.from)) {
      out[e.id] = [...CATCH_NAMES];
      continue;
    }
    const rid = ruleOf.get(e.from);
    if (rid === undefined) continue;
    const names = (rules[rid]?.results ?? []).map((r) => r.name);
    if (names.length > 0) out[e.id] = names;
  }
  return out;
}
```

`styles/props.ts` 의 상수 끝에 두 줄을 더한다.
```css
.rsf-catch-kinds { display: flex; flex-direction: column; gap: var(--spacing-xs); }
.rsf-catch-kind { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); }
```

- [ ] **Step 4: 통과 확인** — `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/catch-panel.test.ts tests/dme/ruleSetEdit/flow-vars.test.ts tests/dme/ruleSetEdit/var-display.test.ts tests/dme/ruleSetEdit/node-style-panel.test.ts` → PASS. `grep -rn "SEAM(T9)" src/frontend/m-mdm` → 0건. lint 0, 바꾼 파일 audit 두 개 0건.

- [ ] **Step 5: 커밋**

```
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PanelHeader.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-vars.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/props.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/catch-panel.test.ts
/usr/bin/git commit -m "feat(m-mdm): 받는 노드 속성 패널 — 받을 예외 체크·CATCH_NEVER 경고·처리 갈래 첫 선 CATCH_* 칩" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PanelHeader.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-vars.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/props.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/catch-panel.test.ts
```

---

### Task 10: 디버거 — 처리 갈래 값 풀기·CAUGHT 표시·종류 배지·예외로 끝남·받은 예외 목록·노드 상세

**권장 모델:** opus — `trace-view.ts` 가 엔진 `FlowRun` 의 ctx 규칙(R3·R4 — CATCH_* 넣기·되찾기·지우기 순서, E4 고친 값 자리)을 글자 그대로 따라야 한다(Review Focus 2).
**병렬:** Task 3·8 뒤. Task 9 와 함께 돌 수 있다.

**이 태스크가 정한 것:**
- `frames`: 받는 룰(성공·CAUGHT 모두) 직전에 그 범위의 `CATCH_*` 값을 적어 두고, 돌아오는 MERGE 는 **고친 값을 넣기 전에** 그 값으로 되돌리고, END 는 고친 값을 넣기 전에 `CATCH_*` 를 지운다. CATCH 노드는 고친 값을 넣은 뒤 `CATCH_*` 넷을 그 범위 ctx 에 넣고(`made` 에는 넣지 않는다) 바뀐 이름으로 표시한다.
- 겹침 상태 `caught` 를 더한다. 칩은 CAUGHT 룰이면 바로 뒤 CATCH 기록의 종류 이름, CATCH 노드면 자기 종류 이름이다(R16). 안 탄 받는 노드는 지금처럼 pending(흐림)이다.
- 툴바 상태 문구: 끝까지 갔는데 `endedBy` 가 있으면 `예외로 끝남: {받는 노드 제목} · {n}단계 · 결과 변수 {m}개`. 기록에 CATCH 노드가 있으면 `받은 예외 {n}건` 단추가 목록을 연다.
- 노드 상세: CATCH 노드는 종류·코드·메시지와 `CATCH_*` 값, CAUGHT 룰은 위반 목록(`violations` 가 비면 "맞는 행과 기본 행이 없다")과 [룰 편집 열기].
- E4 값 고치기는 처리 갈래 안 노드에도 그대로 쓴다(별도 코드 없음 — `frames` 가 같은 순서로 푸므로 고친 지점 표시·값 표가 맞는다).

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts`(10-15 import, 98-117 `scopePaths`, 120-199 `frames`, 202-210 `chipOf`, 212-275 겹침 두 함수)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/overlay.ts`(`NodeState` 에 `"caught"`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx:126-135,277`(`Badges` 순번, `STATE_CLASS`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/debug-model.ts:120-146`(`debugStatus` 에 흐름 인자, 예외로 끝남)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/DebugToolbar.tsx`(상태 문구 인자, 받은 예외 단추·목록)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx`(CATCH·CAUGHT 상세)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/catch.ts`(`caught` 상태·받은 예외 목록)
- Create(Test): `src/frontend/m-mdm/tests/dme/ruleSetEdit/catch-debug.test.ts`

**Interfaces:**
- Consumes: Task 1 `RunTrace.endedBy`·`NodeTrace.catchKind`·`code`·`message`·`NodeStatus "CAUGHT"`, Task 2 `Guarded`, Task 4 `CATCH_NAMES`, Task 8 `CATCH_KIND_LABEL`·`catchTitle`.
- Produces: `NodeState` 에 `"caught"`(data-state, CSS `.rsf-node[data-state="caught"]`), `debugStatus(trace, cursor, pending?, flow?)`, testid `dbg-caught-toggle`·`dbg-caught-list`·`dbg-caught-{받는 노드 ID}`, `sim-detail-catch`(CATCH 상세)·`sim-detail-catch-values`.

- [ ] **Step 1: 실패 시험** — `catch-debug.test.ts` 를 만든다. 기록은 엔진 `RuleSetCatchTest` 의 `returning("R_G", "R_FILL", "NO_RESULT")` 실행 기록을 손으로 옮긴 것이다(엔진과 같은 순서·값).

```ts
import { describe, expect, it } from "vitest";

import type { FlowEdge, FlowNode, FlowNodeKind, NodeTrace, RuleSetFlow, RunTrace, TypedValue } from "../../../src/contract/engine-contract.generated";
import { debugStatus } from "../../../pages/dme/ruleSetEdit/debugger/debug-model";
import { debugOverlay, frames, overlayAt } from "../../../pages/dme/ruleSetEdit/trace-view";

const S = (v: string): TypedValue => ({ type: "STRING", value: v });
const N = (v: string): TypedValue => ({ type: "NUMBER", value: v });
const fn = (id: string, kind: FlowNodeKind, over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: null, splitId: null, label: null, ...over });
const fe = (id: string, from: string, to: string): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null });
const nt = (seq: number, nodeId: string, kind: FlowNodeKind, over: Partial<NodeTrace> = {}): NodeTrace => ({
  seq, nodeId, kind, status: "OK", ruleId: null, ver: null, reads: null, branches: null, chosenEdgeId: null, order: null, splitId: null, merged: null,
  violations: null, ...over,
});
const res = (ruleId: string, results: Record<string, TypedValue>) => ({
  ruleId, ver: 1, evalTs: "2026-06-01T09:00:00", hits: [{ rowId: 1, seq: 1, groupChoices: {} }], defaultApplied: false, results, trace: [], warnings: [],
});

/** start → r1(R_G) → mr → after(R_AFTER) → end. c1(NO_RESULT) → h(R_FILL) → mr. */
const flow: RuleSetFlow = {
  version: 1,
  nodes: [fn("start", "START"), fn("r1", "RULE", { ruleId: "R_G" }), fn("c1", "CATCH", { attachTo: "r1", catches: ["NO_RESULT"], label: "단가 없음" }),
    fn("h", "RULE", { ruleId: "R_FILL" }), fn("mr", "MERGE", { splitId: "r1" }), fn("after", "RULE", { ruleId: "R_AFTER" }), fn("end", "END")],
  edges: [fe("e1", "start", "r1"), fe("e2", "r1", "mr"), fe("e3", "c1", "h"), fe("e4", "h", "mr"), fe("e5", "mr", "after"), fe("e6", "after", "end")],
};
const trace: RunTrace = {
  setId: "(저장 전)", evalTs: "2026-06-01T09:00:00", input: { X: N("5") }, violations: null, finalValues: { G: N("0"), Z: N("10") },
  nodes: [
    nt(1, "start", "START"),
    nt(2, "r1", "RULE", { status: "CAUGHT", ruleId: "R_G", ver: 1, reads: { X: N("5") }, violations: [] }),
    nt(3, "c1", "CATCH", { ruleId: "R_G", catchKind: "NO_RESULT", code: "NO_RESULT", message: "맞는 행과 기본 행이 없다" }),
    nt(4, "h", "RULE", { ruleId: "R_FILL", ver: 1, reads: {}, result: res("R_FILL", { G: N("0") }) }),
    nt(5, "mr", "MERGE", { splitId: "r1" }),
    nt(6, "after", "RULE", { ruleId: "R_AFTER", ver: 1, reads: { X: N("5") }, result: res("R_AFTER", { Z: N("10") }) }),
    nt(7, "end", "END"),
  ],
};

describe("디버거 — 받는 노드(받는 노드 spec §9)", () => {
  it("CATCH 노드가 CATCH_* 를 넣고 돌아오는 합류에서 빠진다", () => {
    const fr = frames(trace, flow);
    expect(fr[2].changed).toEqual(["CATCH_KIND", "CATCH_RULE", "CATCH_CODE", "CATCH_MSG"]);
    expect(fr[2].ctx.CATCH_RULE).toEqual(S("R_G"));
    expect(fr[3].before.CATCH_CODE).toEqual(S("NO_RESULT"));
    expect(fr[4].before.CATCH_KIND).toBeUndefined();
    expect(fr[5].before.G).toEqual(N("0"));
  });

  it("CAUGHT 룰은 caught 상태와 종류 배지, 탄 받는 노드·처리 갈래는 실행 표시", () => {
    const o = overlayAt(trace, flow, trace.nodes.length - 1);
    expect(o.nodes.r1).toMatchObject({ state: "caught", chip: "결과 없음" });
    expect(o.nodes.c1).toMatchObject({ state: "run", chip: "결과 없음" });
    expect(o.nodes.h.state).toBe("run");
    expect(o.edges.e3).toBe("run");
    expect(o.edges.e2).not.toBe("run");
    expect(debugOverlay(trace, flow, 3).nodes.r1.state).toBe("caught");
  });

  it("끝냄 기록이면 상태 문구가 예외로 끝남이다", () => {
    const ended: RunTrace = { ...trace, endedBy: "c1" };
    expect(debugStatus(ended, ended.nodes.length, 0, flow)).toBe("예외로 끝남: 단가 없음 · 7단계 · 결과 변수 2개");
    expect(debugStatus(trace, trace.nodes.length, 0, flow)).toBe("완료 · 7단계 · 결과 변수 2개");
  });

  it("중첩 처리 갈래의 안쪽 합류는 바깥 CATCH_* 를 되찾는다", () => {
    // r1(R_ERR) c1 EVAL_ERROR → h1(R_G) [c9 NO_RESULT → f(R_FILL) → mi] → k(R_CODE) → mr → end
    const nf: RuleSetFlow = {
      version: 1,
      nodes: [fn("start", "START"), fn("r1", "RULE", { ruleId: "R_ERR" }), fn("c1", "CATCH", { attachTo: "r1", catches: ["EVAL_ERROR"] }),
        fn("h1", "RULE", { ruleId: "R_G" }), fn("c9", "CATCH", { attachTo: "h1", catches: ["NO_RESULT"] }), fn("f", "RULE", { ruleId: "R_FILL" }),
        fn("mi", "MERGE", { splitId: "h1" }), fn("k", "RULE", { ruleId: "R_CODE" }), fn("mr", "MERGE", { splitId: "r1" }), fn("end", "END")],
      edges: [fe("e1", "start", "r1"), fe("e2", "r1", "mr"), fe("e3", "c1", "h1"), fe("e4", "h1", "mi"), fe("e5", "c9", "f"), fe("e6", "f", "mi"),
        fe("e7", "mi", "k"), fe("e8", "k", "mr"), fe("e9", "mr", "end")],
    };
    const nt2: RunTrace = {
      setId: "(저장 전)", evalTs: "2026-06-01T09:00:00", input: { X: N("5") }, violations: null, finalValues: {},
      nodes: [
        nt(1, "start", "START"),
        nt(2, "r1", "RULE", { status: "CAUGHT", ruleId: "R_ERR", ver: 1, violations: [] }),
        nt(3, "c1", "CATCH", { ruleId: "R_ERR", catchKind: "EVAL_ERROR", code: "EVALUATION_ERROR", message: "0 으로 나눔" }),
        nt(4, "h1", "RULE", { status: "CAUGHT", ruleId: "R_G", ver: 1, violations: [] }),
        nt(5, "c9", "CATCH", { ruleId: "R_G", catchKind: "NO_RESULT", code: "NO_RESULT", message: "맞는 행과 기본 행이 없다" }),
        nt(6, "f", "RULE", { ruleId: "R_FILL", ver: 1, result: res("R_FILL", { G: N("0") }) }),
        nt(7, "mi", "MERGE", { splitId: "h1" }),
        nt(8, "k", "RULE", { ruleId: "R_CODE", ver: 1, result: res("R_CODE", { CODE: S("EVALUATION_ERROR") }) }),
        nt(9, "mr", "MERGE", { splitId: "r1" }),
        nt(10, "end", "END"),
      ],
    };
    const fr = frames(nt2, nf);
    expect(fr[7].before.CATCH_CODE).toEqual(S("EVALUATION_ERROR")); // 안쪽 합류(mi) 뒤 k 는 바깥 값을 본다
    expect(fr[9].before.CATCH_CODE).toBeUndefined(); // 바깥 합류(mr) 뒤 END
  });
});
```
같은 파일에 툴바·상세 렌더 사례를 더한다. 파일 첫 줄을 `/** @vitest-environment happy-dom */` 로 하고, import 에 `act`·`createElement`(react), `createRoot`·`Root`(react-dom/client), `afterEach`·`beforeEach`(vitest), `DmesUiProvider`(`@dk-oasis/shared/ui-provider`), `DebugToolbar`(`../../../pages/dme/ruleSetEdit/debugger/DebugToolbar`), `TraceDetail`(`…/debugger/TraceDetail`), `type Simulation`(`…/debugger/useSimulation`), `installDomStorage`(`../helpers/render`)를 더한다.

```ts
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
/** DebugToolbar 가 읽는 칸만 채운 시뮬레이션(실행 함수는 아무것도 하지 않는다). */
const simOf = (t: RunTrace): Simulation =>
  ({
    running: false, last: { trace: t, flow, warnings: [], flowVersion: 1, input: {} }, cursor: t.nodes.length, pendingEdit: null, appliedEdits: [],
    notice: null, error: null, stale: false,
    resume: async () => {}, next: async () => {}, prev: () => {}, runTo: async () => {}, restart: async () => {}, finish: async () => {},
  }) as unknown as Simulation;
async function drawToolbar(t: RunTrace) {
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement(DebugToolbar, { sim: simOf(t), canRun: true, selectedId: null })));
  });
}
async function drawDetail(nodeId: string) {
  const node = trace.nodes.find((x) => x.nodeId === nodeId) ?? null;
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement(TraceDetail, { nodeId, node, flow, traceViolations: [], onOpenRule: () => {} })));
  });
}

describe("디버거 화면 — 받는 노드", () => {
  it("툴바 — 받은 예외 단추를 누르면 목록이 열린다", async () => {
    await drawToolbar({ ...trace, endedBy: "c1" });
    expect(document.querySelector('[data-testid="dbg-status"]')!.textContent).toContain("예외로 끝남: 단가 없음");
    const toggle = document.querySelector('[data-testid="dbg-caught-toggle"]') as HTMLButtonElement;
    expect(toggle.textContent).toContain("받은 예외 1건");
    await act(async () => toggle.click());
    expect(document.querySelector('[data-testid="dbg-caught-c1"]')!.textContent).toBe("R_G → 단가 없음 · 결과 없음 · NO_RESULT");
  });

  it("노드 상세 — CATCH 노드는 종류·코드·메시지와 CATCH_* 값, CAUGHT 룰은 '맞는 행과 기본 행이 없다'와 [룰 편집 열기]", async () => {
    await drawDetail("c1");
    expect(document.querySelector('[data-testid="sim-detail-catch"]')!.textContent).toContain("결과 없음");
    expect(document.querySelector('[data-testid="sim-detail-catch-values"]')!.textContent).toContain("CATCH_RULE");
    await drawDetail("r1");
    expect(document.querySelector('[data-testid="sim-detail-errors"]')!.textContent).toContain("맞는 행과 기본 행이 없다");
    expect(document.querySelector('[data-testid="sim-detail-open-rule"]')).not.toBeNull();
  });
});
```
(shared `Button` 은 나머지 props 를 Mantine 버튼 루트(`<button>`)에 넘기므로 `data-testid` 가 버튼 자체에 붙는다 — `Button.tsx:41·58`.)

- [ ] **Step 2: 실패 확인** — `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/catch-debug.test.ts` → FAIL(CATCH 노드가 값을 넣지 않음, 상태 `caught` 없음, 문구 없음).

- [ ] **Step 3: `trace-view.ts`**

import 에 `import { CATCH_NAMES, parseFlow, type Seq } from "./flow-model";`(기존 `parseFlow, type Seq` 줄을 바꾼다)와 `import { CATCH_KIND_LABEL } from "./catch-text";`, 생성 타입 import 에 `CatchKind` 를 더한다.

`scopePaths` 가 받는 룰 정보를 함께 돌려주게 바꾼다(Task 2 가 넣은 `GUARDED` 갈래를 확장).
```ts
function scopePaths(flow: RuleSetFlow): {
  paths: Map<string, ScopePath>;
  branchEdges: Map<string, string[]>;
  /** 돌아오는 합류 ID → 받는 룰 노드 ID. */
  guardMerges: Map<string, string>;
  /** 받는 룰 노드 ID(받는 노드가 붙은 룰). */
  guardRules: Set<string>;
} {
  const paths = new Map<string, ScopePath>();
  const branchEdges = new Map<string, string[]>();
  const guardMerges = new Map<string, string>();
  const guardRules = new Set<string>();
  const tree = parseFlow(flow).tree;
  if (!tree) return { paths, branchEdges, guardMerges, guardRules };
  const walk = (s: Seq, path: ScopePath) => {
    for (const b of s.items) {
      if (b.type === "RULE" || b.type === "TASK") paths.set(b.nodeId, path);
      else if (b.type === "SEQ") walk(b, path);
      else if (b.type === "GUARDED") {
        paths.set(b.rule.nodeId, path);
        guardRules.add(b.rule.nodeId);
        if (b.mergeId) {
          paths.set(b.mergeId, path);
          guardMerges.set(b.mergeId, b.rule.nodeId);
        }
        walk(b.normal, path);
        for (const h of b.handlers) {
          paths.set(h.catchNodeId, path);
          walk(h.body, path);
        }
      } else {
        paths.set(b.nodeId, path);
        paths.set(b.mergeId, path);
        if (b.kind === "PARALLEL") branchEdges.set(b.nodeId, b.branches.map((br) => br.edgeId));
        for (const br of b.branches) walk(br.body, b.kind === "PARALLEL" ? [...path, { split: b.nodeId, edge: br.edgeId }] : path);
      }
    }
  };
  walk(tree.root, []);
  return { paths, branchEdges, guardMerges, guardRules };
}
```

`frames` — 머리 javadoc 끝에 ` 받는 노드(받는 노드 spec §4, R3·R4): 받는 룰 직전 그 범위의 CATCH_* 를 적어 두고, 돌아오는 합류는 고친 값 전에 그 값으로 되돌리며, END 는 고친 값 전에 CATCH_* 를 지운다. CATCH 노드는 고친 값 뒤 CATCH_* 를 ctx 에만 넣는다.` 를 더한다. 본문을 아래처럼 고친다(나머지는 그대로).

```ts
export function frames(trace: RunTrace, flow: RuleSetFlow): TraceFrame[] {
  if (trace.nodes.length === 0) return [];
  const { paths, branchEdges, guardMerges, guardRules } = scopePaths(flow);
  const root: Scope = { ctx: { ...trace.input }, made: {} };
  const editsAt = new Map(validEdits(trace).map((e) => [e.beforeSeq, e] as const));
  const branchScopes = new Map<string, Map<string, Scope>>();
  const mergeOrder = new Map<string, string[]>();
  /** 받는 룰 노드 ID → 그 룰 직전 그 범위의 CATCH_* 값(엔진 FlowRun.guarded 의 outer). */
  const outerCatch = new Map<string, Ctx>();
```
`trace.nodes.map(…)` 콜백 첫머리(`const scope = scopeOf(path);` 바로 뒤, 고친 값 넣기 앞)에:
```ts
    // R3·R4 — 엔진은 받는 룰을 시작하기 전에 CATCH_* 를 적고, 돌아오는 합류·END 는 고친 값을 넣기 전에 CATCH_* 를 되돌리거나 지운다.
    if (node.kind === "RULE" && guardRules.has(node.nodeId)) outerCatch.set(node.nodeId, pickCatch(scope.ctx));
    const guardOf = node.kind === "MERGE" ? guardMerges.get(node.nodeId) : undefined;
    if (guardOf !== undefined) restoreCatch(scope.ctx, outerCatch.get(guardOf) ?? {});
    if (node.kind === "END") restoreCatch(scope.ctx, {});
```
`if (node.status === "OK") {` 안의 `RULE` 갈래 뒤에 CATCH 갈래를 더한다.
```ts
      } else if (node.kind === "CATCH") {
        for (const [name, value] of Object.entries(catchValues(node))) {
          note(name, lookup(scope.ctx, name), value);
          putReplacing(scope.ctx, name, value); // CATCH_* 는 made(최종 결과)에 넣지 않는다
        }
```
파일 값 도우미 구역(`putReplacing` 뒤)에 셋을 더한다.
```ts
/** ctx 에 있는 CATCH_* 값. */
function pickCatch(ctx: Ctx): Ctx {
  const out: Ctx = {};
  for (const n of CATCH_NAMES) if (Object.prototype.hasOwnProperty.call(ctx, n)) out[n] = ctx[n];
  return out;
}

/** CATCH_* 를 지우고 saved 를 넣는다(엔진 FlowRun.restoreCatch). */
function restoreCatch(ctx: Ctx, saved: Ctx): void {
  for (const n of CATCH_NAMES) delete ctx[n];
  Object.assign(ctx, saved);
}

/** CATCH 노드 기록이 넣는 네 값(엔진 FlowRun.catchNode 순서). */
function catchValues(node: NodeTrace): Ctx {
  return {
    CATCH_KIND: { type: "STRING", value: node.catchKind ?? "" },
    CATCH_RULE: { type: "STRING", value: node.ruleId ?? "" },
    CATCH_CODE: { type: "STRING", value: node.code ?? "" },
    CATCH_MSG: { type: "STRING", value: node.message ?? "" },
  };
}
```
`chipOf` 와 두 겹침 함수 — 칩과 상태를 고친다.
```ts
function chipOf(node: NodeTrace, next?: NodeTrace): string | null {
  if (node.status === "ERROR") return node.violations?.[0]?.code ?? null;
  if (node.status === "CAUGHT") return next?.kind === "CATCH" && next.catchKind ? CATCH_KIND_LABEL[next.catchKind as CatchKind] : null;
  if (node.kind === "CATCH" && node.catchKind) return CATCH_KIND_LABEL[node.catchKind as CatchKind];
  if (node.kind === "RULE" && node.result) {
    const first = Object.entries(node.result.results)[0];
    return first ? `${first[0]}=${typedText(first[1])}` : null;
  }
  return null;
}

const doneState = (t: NodeTrace): NodeOverlay["state"] => (t.status === "ERROR" ? "error" : t.status === "CAUGHT" ? "caught" : "run");
```
`overlayAt` 의 노드 상태 줄과 선 상태 반복:
```ts
    const state = t.status === "ERROR" ? "error" : t.status === "CAUGHT" ? "caught" : i === k ? "current" : "run";
    nodes[t.nodeId] = { state, seq: t.seq, chip: chipOf(t, trace.nodes[i + 1]) };
```
```ts
  for (const e of flow.edges) {
    const from = done.get(e.from);
    if (from && from.status === "CAUGHT") edges[e.id] = last ? "dim" : "idle"; // 받은 룰의 정상 갈래 선은 타지 않았다
    else if (from && from.kind === "IF") edges[e.id] = e.id === from.chosenEdgeId ? "chosen" : "dim";
    else if (from && done.has(e.to)) edges[e.id] = "run";
    else edges[e.id] = last ? "dim" : "idle";
  }
```
`debugOverlayAt` 의 실행된 노드 줄과 선 상태 반복:
```ts
    nodes[t.nodeId] = { state: doneState(t), seq: t.seq, chip: chipOf(t, trace.nodes[i + 1]) };
```
```ts
  for (const e of flow.edges) {
    const from = done.get(e.from);
    if (from && from.status === "CAUGHT") edges[e.id] = "idle";
    else if (from && from.kind === "IF") edges[e.id] = e.id === from.chosenEdgeId ? "chosen" : "dim";
    else if (from && (done.has(e.to) || e.to === currentId)) edges[e.id] = "run";
    else edges[e.id] = "idle";
  }
```
(받은 룰의 나가는 선은 정상 갈래 선이다. 돌아오는 합류도 실행됐으므로 이 줄이 없으면 "실행된 선" 으로 칠해진다.)

`canvas/overlay.ts` 의 `NodeState` 에 `"caught"` 를 더하고 주석에 `받는 노드 spec §9: caught = 받는 노드로 넘긴 룰(주황 점선).` 을 단다.
```ts
export type NodeState = "run" | "error" | "caught" | "current" | "next" | "pending" | "dim";
```
`nodes.tsx` — `Badges` 의 `showSeq` 조건에 `|| overlay.state === "caught"` 를 더하고, `STATE_CLASS` 에 `caught: "rsf-node-caught"` 를 더한다.

`styles/catch.ts` 의 `CATCH_CSS` 끝에 더한다(상태 규칙은 base 의 `data-state` 규칙과 같은 우선순위이고 이 파일이 뒤에 붙어 이긴다).
```css
.rsf-node[data-state="caught"] { border-color: var(--color-warning); border-style: dashed; border-width: 2px; }
.rsf-node[data-state="caught"] .rsf-chip { background: var(--color-warning-soft); color: var(--color-warning); border-color: var(--color-warning); }
.rsf-dbg-caught { position: relative; }
.rsf-dbg-caught-list { position: absolute; top: 100%; left: 0; z-index: 20; min-width: 320px; margin: var(--spacing-xs) 0 0; padding: var(--spacing-xs);
  list-style: none; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
.rsf-dbg-caught-list li { padding: 2px var(--spacing-xs); }
```


- [ ] **Step 4: `debug-model.ts`·`DebugToolbar.tsx`**

`debug-model.ts` — import 에 `RuleSetFlow` 타입과 `catchTitle`(`../catch-text`)을 더하고 `debugStatus`·`baseStatus` 를 바꾼다.
```ts
export function debugStatus(trace: RunTrace | null, cursor: number, pending = 0, flow?: RuleSetFlow): string {
  if (!trace) return NO_RECORD_STATUS;
  const edited = editCount(validEdits(trace));
  return `${baseStatus(trace, cursor, flow)}${edited > 0 ? ` · 고친 값 ${edited}건` : ""}${pending > 0 ? ` · 고침 대기 ${pending}건` : ""}`;
}

function baseStatus(trace: RunTrace, cursor: number, flow?: RuleSetFlow): string {
  const n = trace.nodes.length;
  const firstOf = (own: readonly { message: string }[] | null | undefined) => own?.[0]?.message ?? trace.violations?.[0]?.message ?? "";
  if (n === 0) return `실행 전 오류 — ${firstOf(null)}`;
  const k = Math.max(0, Math.trunc(cursor));
  if (k < n) return `${k + 1}/${n} · ${trace.nodes[k].nodeId} 실행 전`;
  const lastNode = trace.nodes[n - 1];
  if (lastNode.status === "ERROR") return `오류로 멈춤 — ${lastNode.nodeId}: ${firstOf(lastNode.violations)}`;
  const tail = `${n}단계 · 결과 변수 ${Object.keys(trace.finalValues ?? {}).length}개`;
  if (trace.endedBy) {
    const c = flow?.nodes.find((x) => x.id === trace.endedBy);
    return `예외로 끝남: ${c ? catchTitle(c) || c.id : trace.endedBy} · ${tail}`;
  }
  return `완료 · ${tail}`;
}
```
javadoc 의 문구 목록에 `endedBy 가 있으면 \`예외로 끝남: {받는 노드 제목} · {n}단계 · 결과 변수 {m}개\`` 를 더한다.

`DebugToolbar.tsx` — import 에 `useState`(`react`), `CATCH_KIND_LABEL`·`catchTitle`(`../catch-text`), `IconBolt` 를 더한다. 상태 문구에 흐름을 넘기고, 받은 예외 단추·목록을 상태 문구 뒤에 둔다.
```tsx
  const status = debugStatus(sim.last?.trace ?? null, sim.cursor, pendingCount, sim.last?.flow);
  const caught = (sim.last?.trace.nodes ?? []).filter((x) => x.kind === "CATCH" && x.status === "OK");
  const [caughtOpen, setCaughtOpen] = useState(false);
```
```tsx
      {caught.length > 0 && (
        <span className="rsf-dbg-caught">
          <Button size="sm" data-testid="dbg-caught-toggle" ariaLabel="받은 예외 목록" aria-expanded={caughtOpen} onClick={() => setCaughtOpen((v) => !v)}>
            <IconBolt size={14} aria-hidden="true" />
            {`받은 예외 ${caught.length}건`}
          </Button>
          {caughtOpen && (
            <ul className="rsf-dbg-caught-list" data-testid="dbg-caught-list">
              {caught.map((c) => {
                const fnode = sim.last?.flow.nodes.find((x) => x.id === c.nodeId);
                const title = fnode ? catchTitle(fnode) || c.nodeId : c.nodeId;
                return (
                  <li key={`${c.seq}`} data-testid={`dbg-caught-${c.nodeId}`} title={c.message ?? ""}>
                    {`${c.ruleId ?? "-"} → ${title} · ${c.catchKind ? CATCH_KIND_LABEL[c.catchKind] : "-"} · ${c.code ?? ""}`}
                  </li>
                );
              })}
            </ul>
          )}
        </span>
      )}
```
(`end` 계산은 그대로다 — 끝냄은 정상 완료라 `"done"` 이다.) 머리 주석에 `받는 노드(spec §9): 끝냄이면 상태 문구가 "예외로 끝남", 받은 예외가 있으면 [받은 예외 N건] 이 목록을 연다.` 를 더한다.

- [ ] **Step 5: `TraceDetail.tsx`**

import 에 `CATCH_KIND_LABEL`(`../catch-text`), `CATCH_NAMES`(`../flow-model`), `CatchKind` 타입을 더한다. 머리 배지의 상태 배지를 바꾼다.
```tsx
          <span style={node.status === "ERROR" ? REJECT_BADGE : node.status === "CAUGHT" ? badgeStyle("warning") : badgeStyle("success")}>
            {node.status === "ERROR" ? "오류" : node.status === "CAUGHT" ? "받음" : "정상"}
          </span>
```
`violations` 계산을 아래로 바꾼다 — CAUGHT 룰은 받은 위반, 결과 없음이면 고정 문구 한 줄.
```tsx
  const violations =
    node.violations && node.violations.length > 0
      ? node.violations
      : node.status === "ERROR"
        ? [...traceViolations]
        : node.status === "CAUGHT"
          ? [{ stage: "ROW_SELECT", code: "NO_RESULT", ruleId: node.ruleId, rowId: null, name: null, message: "맞는 행과 기본 행이 없다" } as unknown as Violation]
          : [];
```
`node.kind === "TASK"` 블록 뒤에 CATCH 상세를 더한다.
```tsx
      {node.kind === "CATCH" && (
        <div data-testid="sim-detail-catch">
          <p className="rsf-panel-note">
            {`${node.catchKind ? CATCH_KIND_LABEL[node.catchKind as CatchKind] : "-"} · ${node.code ?? ""} — ${node.message ?? ""}`}
          </p>
          <Sub>처리 갈래가 읽는 값</Sub>
          <Pairs
            testId="sim-detail-catch-values"
            values={Object.fromEntries(
              CATCH_NAMES.map((n, i) => [n, { type: "STRING", value: [node.catchKind, node.ruleId, node.code, node.message][i] ?? "" } as TypedValue]),
            )}
            empty="값이 없다"
          />
        </div>
      )}
```
(`CATCH_NAMES` 순서 = KIND·RULE·CODE·MSG — 위 배열과 같은 순서다.) CAUGHT 룰은 `node.kind === "RULE"` 블록을 그대로 타므로 [룰 편집 열기]·읽은 입력값이 보이고, `result` 가 없어 결과 표는 없다. `KIND_TEXT.CATCH`(Task 1)는 그대로다.

- [ ] **Step 6: 통과 확인** — `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/catch-debug.test.ts tests/dme/ruleSetEdit/trace-view.test.ts tests/dme/ruleSetEdit/debug-model.test.ts tests/dme/ruleSetEdit/debug-mode.test.ts tests/dme/ruleSetEdit/debug-edit.test.ts tests/dme/ruleSetEdit/flow-debug-view.test.ts` → PASS(기존 기록 사례 기대를 고치지 않는다 — 받는 노드 없는 기록은 `guardRules`·`guardMerges` 가 비어 지금과 같다). lint 0, 바꾼 파일 audit 두 개 0건.

- [ ] **Step 7: 커밋**

```
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/overlay.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/debug-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/DebugToolbar.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/catch.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/catch-debug.test.ts
/usr/bin/git commit -m "feat(m-mdm): 받는 노드 디버거 — 처리 갈래 값·CAUGHT 표시·종류 배지·예외로 끝남·받은 예외 목록·상세" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/overlay.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/debug-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/DebugToolbar.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/catch.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/catch-debug.test.ts
```

---

### Task 11: e2e 시나리오 — 받는 노드를 만들어 저장하고 결과 없음 처리 갈래를 탄다(목록 확인까지)

**권장 모델:** sonnet — 기존 스펙 파일의 도우미로 시나리오 하나를 더하고 픽스처에 결과 없음 룰·세트를 더한다.
**병렬:** Task 8·9·10 뒤. Task 12 와 함께 돌 수 있다.

**이 태스크가 정한 것:**
- 기존 e2e 픽스처 룰은 모두 DEFAULT 행이 있어 결과 없음이 나지 않는다(`src/frontend/e2e/fixtures/mdm-ruleSet-data.sql:6` 주석 "NORMAL 행 1 + DEFAULT 행 1"). 그래서 기본 행 없는 룰 `E2S_NODEF`(SET_THK > 9 → "HI")와 그 한 줄 세트 `E2S_CATCHSET` 을 픽스처에 더한다(INSERT 만 — 픽스처 규칙 그대로).
- 실행은 하지 않는다. `--list` 로 목록이 깨지지 않는 것만 본다. 실제 실행은 **사용자 승인 뒤** 컨트롤러가 한다(Global Constraints).

**Files:**
- Modify: `src/frontend/e2e/fixtures/mdm-ruleSet-data.sql`(머리 주석 룰·세트 수, 룰·버전·변수·행·세트 INSERT 각 한 줄)
- Modify: `src/frontend/e2e/mdm-ruleSetEdit.spec.ts`(머리 주석 고유 목록에 E16, 마지막 `test(` 뒤에 E16)

**Interfaces:**
- Consumes: testid `flow-node-{id}`·`flow-menu-item-catch-add`(Task 8), `flow-panel-kind` 문구 「받는 노드」(Task 8 `PANEL_KIND.CATCH`), `dbg-status`·`dbg-caught-toggle`(Task 10), `data-state="caught"`(Task 10), 픽스처 세트 `E2S_CATCHSET`.
- Produces: e2e `E16`.

- [ ] **Step 1: 픽스처** — `mdm-ruleSet-data.sql`.

머리 주석의 `룰 7` 을 `룰 8`, 룰 목록 끝에 `· E2S_NODEF(SET_THK → S_NOD, 기본 행 없음 — 받는 노드 결과 없음 e2e E16)` 를, `세트 7` 을 `세트 8`, 세트 목록 끝에 `· E2S_CATCHSET(E2S_NODEF 한 줄)` 을 더한다. 각 INSERT 의 값 목록 끝(마지막 `;` 앞)에 한 줄씩 더한다.

`TB_MDM_RULE`:
```sql
    ('E2S_NODEF', 'E2S 기본 행 없음', 'DECISION', 'INUSE', 'MDM', '두께가 9 보다 크면 HI, 아니면 결과 없음', NULL, 2, 1, 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0)
```
`TB_MDM_RULE_VER`:
```sql
    ('E2S_NODEF', 1, 'RELEASED', NULL, NULL, 'FIRST', '2026-01-01 00:00:00', '9999-12-31 00:00:00', '2026-01-01 00:00:00', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0)
```
`TB_MDM_RULE_VAR`:
```sql
    ('E2S_NODEF', 1, 1, 'COND', '1', 'SET_THK', NULL, 1, '두께', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_NODEF', 1, 2, 'RESULT', 'Value', 'S_NOD', 'STRING', 1, '두께 등급', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0)
```
`TB_MDM_RULE_ROW`(DEFAULT 행을 넣지 않는다):
```sql
    ('E2S_NODEF', 1, 1, 1, 'NORMAL', '{"1":{"op":"GT","left":"9"},"2":{"val":"HI"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0)
```
`TB_MDM_RULE_SET`(마지막 값 뒤):
```sql
    ('E2S_CATCHSET', 'E2E 받는 노드 세트', '["E2S_NODEF"]', NULL, '결과 없음을 받는 노드로 처리한다', 'INUSE', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0)
```
(앞 줄 끝의 `;` 를 `,` 로 바꾸는 것을 잊지 않는다. `E2S_FLOW` 행은 여러 줄이므로 그 행 끝 `0);` 를 `0),` 로 바꾼 뒤 새 행을 넣는다.)

- [ ] **Step 2: E16 시나리오** — 스펙 머리 주석 고유 목록 끝에 `E16 받는 노드(룰 우클릭 「예외 받기 추가」 → 저장 → 디버그에서 결과 없음 처리 갈래로 끝냄).` 을 더하고, 파일의 마지막 `test(…)` 블록 뒤(`test.describe` 닫는 괄호 앞)에 더한다.

```ts
  test("E16 받는 노드: 룰에 예외 받기를 붙여 저장하고, 결과 없는 입력으로 실행하면 처리 갈래로 끝나고 받은 예외가 1건이다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_CATCHSET");
    await enterEditMode(page);

    await page.getByTestId("flow-node-r1").click({ button: "right" });
    await page.getByTestId("flow-menu-item-catch-add").click();
    await expect(page.getByTestId("flow-node-c1")).toBeVisible();
    await page.getByTestId("flow-node-c1").click();
    await expect(page.getByTestId("flow-panel-kind")).toHaveText("받는 노드");
    await expect(page.getByTestId("flow-prop-catch")).toBeVisible();

    await page.getByTestId("set-save").click();
    await expect(page.getByTestId("set-save")).toBeDisabled({ timeout: 30_000 });

    await enterDebugMode(page);
    await page.getByTestId("dbg-input-SET_THK").fill("1");
    await page.getByTestId("dbg-finish").click();
    await expect(page.getByTestId("dbg-status")).toHaveText("예외로 끝남: 결과 없음 · 4단계 · 결과 변수 0개", { timeout: 30_000 });
    await expect(page.getByTestId("flow-node-r1")).toHaveAttribute("data-state", "caught");
    await expect(page.getByTestId("dbg-caught-toggle")).toContainText("받은 예외 1건");
  });
```
기대 근거: 한 줄 세트 start → r1(E2S_NODEF) → end 에 받는 노드 c1(NO_RESULT → END)을 붙이면, SET_THK=1 은 맞는 행도 기본 행도 없어 c1 처리 갈래가 바로 END 로 간다 — 기록 노드 start·r1(CAUGHT)·c1·end 4개, 결과 변수 없음.

- [ ] **Step 3: 목록 확인(실행 금지)** — `pnpm --dir src/frontend exec playwright test --list e2e/mdm-ruleSetEdit.spec.ts` → 오류 없이 E1~E16 이름을 낸다. 실제 실행은 **사용자 승인 뒤** 컨트롤러가 새 mdm.db(픽스처 포함)로 한다.

- [ ] **Step 4: 커밋**

```
/usr/bin/git add src/frontend/e2e/fixtures/mdm-ruleSet-data.sql src/frontend/e2e/mdm-ruleSetEdit.spec.ts
/usr/bin/git commit -m "test(e2e): 룰 세트 받는 노드 시나리오 E16 과 기본 행 없는 픽스처 룰을 더한다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/frontend/e2e/fixtures/mdm-ruleSet-data.sql src/frontend/e2e/mdm-ruleSetEdit.spec.ts
```

---

### Task 12: 문서·결정 — D-134(X-D1~X-D12)·엔진 계약 문서·기능설계서

**권장 모델:** haiku — 정해진 내용을 정해진 자리에 옮겨 적는 문서 작업이다.
**병렬:** 마지막(Task 1~11 병합 뒤). Task 11 과 함께 돌 수 있다.

**Files:**
- Modify: `docs/mdm/decisions.md`(끝에 D-134, append-only)
- Modify: `docs/mdm/engine-contract.md`(§3 흐름 문단, §6 예약 이름 표, §8 세트 결과·실행 기록·오류 코드 문단)
- Modify: `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`(§3.2 캔버스 노드, §5.5 우클릭 메뉴, §6.2 세트 검사, §4.1·§5.3 디버거 줄)

**Interfaces:**
- Consumes: Task 1~11 의 병합 커밋, 진행 장부의 Ruling, 각 태스크 보고서의 편차.
- Produces: 없음(문서).

- [ ] **Step 1: decisions.md 끝 형식 확인**

Run: `tail -n 12 docs/mdm/decisions.md`
Expected: 마지막 항목이 `## D-133 (2026-10-01T00:00:00Z)` 이고, 항목마다 `- **Phase**:`·`- **Decision needed**:`·`- **Decision made**:`·`- **Rationale**:`·`- **Reversible**:`·`- **Source**:` 여섯 줄이다. 마지막이 D-133 이 아니면(다른 작업이 먼저 더했으면) 다음 번호를 쓰고 이 계획의 "D-134" 를 모두 그 번호로 읽는다.

- [ ] **Step 2: D-134 를 끝에 더한다** — **Source** 끝에 태스크 병합 커밋 해시를 덧붙인다(`/usr/bin/git log --oneline --merges feat/rule-set-flow-catch` 에서 찾는다). 진행 장부에 이 기능에 관한 Ruling 이 더 있으면 결정 줄 끝에 "(Ruling N)" 으로 덧붙인다.

```markdown
## D-134 (2026-10-01T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 — 예외 받는 노드 CATCH)
- **Decision needed**: 룰이 실패하거나 결과가 없을 때 흐름 안에서 처리하는 방법(스펙 `2026-10-01-rule-set-flow-catch-design.md` §11, 사용자 요청 "룰에 대한 exception이 없어 exception 노드가 필요해", "처리 결과가 없으면 끝으로 가던지 아니면 다른 처리를 하게 하던지")
- **Decision made**: X-D1 받는 노드(CATCH)는 RULE 에 붙이고 세트 전체 처리기는 두지 않는다 · X-D2 받는 종류는 결과 없음(NO_RESULT)·입력 오류(INPUT_ERROR = MISSING_KEY·REQUIRED_NULL·TYPE_CONVERSION)·계산 오류(EVAL_ERROR = EVALUATION_ERROR)·판정 충돌(HIT_CONFLICT = UNIQUE_MULTIPLE_HITS·ANY_CONFLICT) 넷이고 정의·설정 오류(RULE_NOT_FOUND·SET_NOT_FOUND·SET_DEPRECATED·FLOW_INVALID·CONSTANT_KEY·RESERVED_KEY·EVAL_TS_KEY·BRANCH_EVAL_ERROR·EDIT_POINT_MISMATCH)는 받지 않는다 · X-D3 결과 없음은 그 종류를 받는 노드가 있을 때만 exception 이고 없으면 지금처럼 NULL 결과로 진행한다 · X-D4 RULE 과 CATCH 는 선이 아니라 `attachTo` 로 잇는다(BPMN attachedToRef) · X-D5 돌아오는 MERGE 의 `splitId` 는 그 RULE 노드 ID 다 · X-D6 처리 갈래는 맨 바깥 순차에서만 END 로 간다 · X-D7 FLOW_JSON `version` 은 1 그대로다 · X-D8 처리 갈래가 읽는 값은 예약 이름 `CATCH_KIND`·`CATCH_RULE`·`CATCH_CODE`·`CATCH_MSG`(레코드 키로 오면 RESERVED_KEY) · X-D9 INPUT_ERROR 를 받는 룰의 입력은 사전 검사에서 빼고 실행 직전에 본다 · X-D10 `RuleSetResult`·`RunTrace` 에 `endedBy`, `RuleSetResult` 에 `caught`, 노드 상태 `CAUGHT` · X-D11 병렬 갈래 안에서 끝내면 남은 형제 갈래는 실행하지 않는다 · X-D12 받는 노드는 팔레트에 두지 않고 룰의 "예외" 연결점·우클릭 「예외 받기 추가」로만 만든다. 구현 세부(계획 Rulings R1~R17): CATCH 기록에 실패한 룰 ID, CAUGHT 룰 기록에 result 없음, CATCH 노드는 고친 값 뒤 CATCH_* 넣기, 돌아오는 합류는 룰 직전 CATCH_* 로 되돌림(중첩이면 바깥 값), 받는 노드 위치는 저장하지 않고 룰 테두리에 계산, 받는 노드가 든 분기 블록 복사 거부
- **Rationale**: 세트 전체 처리기는 끝내기만 할 수 있어 "결과 없으면 기본값 채우고 계속"을 그릴 수 없다. RULE + 처리 갈래 + MERGE 는 IF 블록과 같은 모양이라 교집합 규칙·노드 관계를 그대로 쓴다. 정의 오류를 흐름에서 처리하면 설정 실수가 감춰진다. 받는 노드 없는 세트의 동작·기록·저장 글자는 그대로다(기존 골든·코퍼스·퍼즈 무변경으로 확인). ADR-0005 Consequences 의 "흐름 안에 DB 저장·외부 호출·메시지 발행 노드가 없다"는 그대로 유효하다 — CATCH 는 판정 흐름 안의 분기이고 저장·호출을 하지 않는다
- **Reversible**: no(FLOW_JSON 에 CATCH 노드가 저장되고 엔진 계약이 늘었다)
- **Source**: 스펙 `docs/superpowers/specs/2026-10-01-rule-set-flow-catch-design.md` §11, 계획 `docs/superpowers/plans/2026-10-01-rule-set-flow-catch.md`(편차 F1~F9·Rulings R1~R17), 사용자 요청. 영향: 엔진 계약(NodeKind·FlowNode·CatchKind·RuleSetResult·RunTrace·NodeStatus·ReservedNames), 서버 검사(FLOW_CATCH·CATCH_NEVER·RuleIo.hasDefault), execute 응답(endedBy·caught), 화면 편집기·디버거, e2e E16. 뒤 스펙 `2026-10-01-rule-set-flow-subset-call-design.md` 가 attachTo 를 SET 노드로 넓힌다. 병합 커밋:
```
**Source** 끝의 `병합 커밋:` 뒤에는 Step 2 첫 문장의 명령으로 찾은 Task 1~11 병합 커밋을 `Task 1 <해시>, Task 2 <해시>, …` 꼴로 이어 적는다(실행 때 생기는 값이라 계획에는 적을 수 없다 — 4단계 계획 Task 12 와 같은 방식).

- [ ] **Step 3: engine-contract.md**

§3 「룰 세트 흐름」 문단(`- **룰 세트 흐름(2026-09-30, …)**` 줄) 끝에 붙인다.
```markdown
 **받는 노드(2026-10-01, D-134).** `NodeKind` 에 `CATCH` 가 더해졌다. `FlowNode(id, kind, ruleId, splitId, label, attachTo, catches)` 의 `attachTo`(붙은 룰 노드 ID)·`catches`(받을 종류 키 `NO_RESULT`·`INPUT_ERROR`·`EVAL_ERROR`·`HIT_CONFLICT`)는 CATCH 노드만 쓰고, 스키마에서 선택 칸이며 FLOW_JSON 정규 글자에도 CATCH 노드에만 있다. 받는 노드는 선이 아니라 `attachTo` 로 룰에 붙고(들어오는 선 0, 나가는 선 1), 처리 갈래가 돌아오는 MERGE 의 `splitId` 는 그 룰 노드 ID 다. 구조 해석은 받는 룰을 `flow.Guarded(rule, normal, handlers, mergeId)` 블록으로 만들고, 받는 종류·코드 표는 `flow.CatchKind` 한 곳에 있다(`flow` 는 `spi` 만 보므로 코드는 이름 문자열로 둔다).
```
§6 예약 이름 표에 한 줄을 더한다.
```markdown
| `CATCH_KIND` `CATCH_RULE` `CATCH_CODE` `CATCH_MSG` | 받는 노드 처리 갈래 안에서만 ctx 에 있다(종류 키·실패한 룰 ID·첫 위반 코드 또는 `NO_RESULT`·첫 위반 문구 또는 `맞는 행과 기본 행이 없다`). 돌아오는 MERGE 에서 룰 직전 값으로 되돌리고 END 에서 지운다. `finalValues` 에 넣지 않는다. 대소문자를 무시하고 레코드 키로 오면 판정 오류다 | `RESERVED_KEY` | 받는 노드 spec §4·§6, D-134 |
```
§8 의 세트 결과 문단 첫 문장 `**룰 세트 결과 `RuleSetResult(setId, evalTs, steps, finalValues, path, warnings)`**` 를 `RuleSetResult(setId, evalTs, steps, finalValues, path, warnings, caught, endedBy)` 로 고치고, 문단 끝에 붙인다.
```markdown
 받는 노드(D-134): 룰이 실패했거나 결과가 없는데 그 종류를 받는 노드가 있으면 그 룰 결과를 쓰지 않고(`steps` 에 넣지 않고 `PathStep.stepIndex` 는 null) 룰 직전 ctx 로 처리 갈래를 실행한다. `path` 에 CATCH 노드도 든다. `caught` 는 받아 처리한 exception `CaughtException(ruleNodeId, ruleId, catchNodeId, kind, code, message)` 목록(실행 순서)이고, 처리 갈래가 END 에 닿아 끝났으면 `endedBy` 가 그 CATCH 노드 ID 다(아니면 null). 병렬 갈래 안에서 끝내면 남은 형제 갈래는 실행하지 않고 `finalValues` 는 끝난 형제와 지금 갈래의 결과까지다. INPUT_ERROR 를 받는 룰의 입력은 세트 입력 키 사전 검사에서 빠지고 그 룰 실행 직전에 본다. 받는 노드가 없으면 지금처럼 실패는 판정 오류, 결과 없음은 NULL 결과로 진행한다.
```
실행 기록 문단 끝에 붙인다.
```markdown
 받는 노드(D-134): `RunTrace` 에 `endedBy`(없으면 JSON 에서 키를 뺀다), 노드 상태 `CAUGHT`(받는 노드로 넘긴 룰 — `violations` 는 받은 위반, 결과 없음이면 빈 목록, `result` 없음), CATCH 노드 기록은 `status=OK`·`ruleId`(실패한 룰)·`catchKind`·`code`·`message`(세 칸은 CATCH 노드에만 있고 JSON 에서 null 이면 키를 뺀다). 돌아오는 MERGE 기록의 `splitId` 는 받는 룰 노드 ID 이고 `merged` 는 null 이다.
```
오류 코드 문단(`코드(Code) 14종: …`)은 지금 코드 수(`EDIT_POINT_MISMATCH` 포함 15종)와 다르면 맞추고, 문단 끝에 `받는 노드가 받을 수 있는 코드는 MISSING_KEY·REQUIRED_NULL·TYPE_CONVERSION(INPUT_ERROR)·EVALUATION_ERROR(EVAL_ERROR)·UNIQUE_MULTIPLE_HITS·ANY_CONFLICT(HIT_CONFLICT)뿐이다(D-134).` 를 붙인다.

- [ ] **Step 4: 기능설계서** — 아래 행을 더한다(번호는 그 표의 다음 번호 — 겹치면 뒤 번호로).

§5.5 우클릭 메뉴 표의 룰 노드 편집 행 항목에 `· 예외 받기 추가(\`catch-add\` — 끝으로 가는 처리 갈래와 받는 노드를 만든다, 받을 종류는 그 룰에서 아직 아무도 받지 않는 첫 종류, D-134)` 를 `복제` 뒤에 넣고, 표 끝에 행을 더한다.
```markdown
| 받는 노드 | 삭제(`delete` — 받는 노드와 그 나가는 선만, 처리 갈래 안 노드는 남는다) | 편집 |
```
§6.2 세트 검사 표 끝(XV-009 앞)에 두 행을 더하고, XV-005 `ORDER` 의 조건 끝에 ` / 받는 노드 처리 갈래 밖에서 CATCH_* 를 읽는다` 와 문구 끝에 ` / {id}가 읽는 {name}는 받는 노드의 처리 갈래 안에서만 있다` 를 더한다.
```markdown
| XV-024 | `FLOW_CATCH` | 거부 | 받는 노드의 `attachTo` 가 없거나 룰이 아니다, `catches` 가 비었거나 모르는 키·겹친 키가 있다, 한 룰에서 같은 종류를 두 받는 노드가 받는다(문구·순서 정본은 `FlowParser`·`flow-model.ts`·코퍼스) | 받는 노드 {c}가 붙은 룰 {r}가 없다 / 받는 노드 {c}는 룰 노드에만 붙일 수 있다({r}는 {kind}) / 받는 노드 {c}에 받을 예외 종류가 없다 / 받는 노드 {c}의 예외 종류 {k}를 모른다 / 받는 노드 {c}에 예외 종류 {k}가 겹친다 / 룰 노드 {r}에서 예외 종류 {k}를 {c1}와 {c2}가 함께 받는다 (D-134) |
| XV-025 | `CATCH_NEVER` | 경고 | 받는 종류가 그 룰에서 일어날 수 없다 — 결과 없음인데 최신 RELEASED 에 기본 행이 있음, 판정 충돌인데 적중 정책이 UNIQUE·ANY 가 아님 | {id}에 기본 행이 있어 {c}가 받는 결과 없음이 일어나지 않는다 / {id}의 적중 정책 {정책}에서는 {c}가 받는 판정 충돌이 일어나지 않는다 (D-134) |
```
XV-013 `FLOW_STRUCTURE` 의 조건 끝에 ` · 받는 노드: 처리 갈래가 돌아오는 합류나 끝이 아닌 곳으로 감, 돌아오는 합류가 둘 이상, 처리 갈래 안 IF·병렬 갈래가 끝으로 감(받는 노드가 있으면 END 들어오는 선은 1개 이상)` 을, 문구 예시 끝에 ` / 처리 갈래 {c}가 합류 {m}나 끝에 닿지 않고 {cur}로 나간다 / 룰 {r}로 돌아오는 합류가 {n}개다. 1개까지 둔다` 를 더한다.

§3.2 캔버스 노드 표(118행 아래)에 받는 노드 행을 더한다 — 내용: `CATCH`(받는 노드) — 룰 아래 테두리에 걸친 빨간 원(번개), 룰을 따라 움직이고 위치는 저장하지 않는다. 나가는 선은 빨간 점선. 편집 모드 룰 노드 오른쪽 아래 "예외" 연결점을 끌어 다른 노드에 놓으면 받는 노드와 처리 갈래 첫 선이 함께 생긴다. 고르면 오른쪽 패널 「받는 노드」·「받을 예외」 섹션(종류 네 개 체크, 같은 룰의 다른 받는 노드가 받는 종류는 꺼짐, 종류 옆 CATCH_NEVER 경고). 처리 갈래 첫 선의 변수 칩은 CATCH_* 넷 (D-134). 표의 열 모양은 그 표의 기존 행을 그대로 따른다.

§4.1 디버그 모드 필드 또는 §5.3 캔버스 동작의 디버그 줄에 더한다 — 받은 룰은 주황 점선 테두리와 종류 배지(결과 없음·입력 오류·계산 오류·판정 충돌), 탄 받는 노드·처리 갈래는 실행 표시, 안 탄 받는 노드는 흐림. 툴바 상태 문구 `예외로 끝남: {받는 노드 제목} · {n}단계 · 결과 변수 {m}개`, [받은 예외 N건] 목록(`dbg-caught-toggle`). 노드 상세: 받는 노드는 종류·코드·메시지·CATCH_* 값, 받은 룰은 위반 목록과 [룰 편집 열기] (D-134).

- [ ] **Step 5: 확인**

Run: `grep -n "D-134" docs/mdm/decisions.md docs/mdm/engine-contract.md docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`
Expected: 세 파일 모두 한 줄 이상. `grep -c "^## D-134" docs/mdm/decisions.md` → 1.

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add docs/mdm/decisions.md docs/mdm/engine-contract.md docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md
/usr/bin/git commit -m "docs(mdm): 룰 세트 받는 노드 결정 D-134 와 엔진 계약 문서·기능설계서를 갱신한다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- docs/mdm/decisions.md docs/mdm/engine-contract.md docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md
```

---

## 최종 검증(컨트롤러)

- [ ] feat 트리에서 엔진 전체·lib 전체·api(`'*RuleSet*'` `'*DmeOasisHttpTest'` `'*RuleIoReaderTest'` `'*RuleLedgerChecksTest'`)·화면 `[m-mdm test 합계]`·`rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint` 를 돌려 기준선 대비 증감을 장부에 적는다.
- [ ] `grep -rn "SEAM(T" src/frontend/m-mdm/pages/dme/ruleSetEdit src/backend` → 0건.
- [ ] 골든·코퍼스 무변경 확인: `/usr/bin/git diff --stat dev -- '*golden*.json' src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-fuzz.json` → 변경 없음. 코퍼스 `rule-set-corpus.json` 은 사례 10개 추가만(기존 54사례 기대 무변경) — `git diff dev -- …rule-set-corpus.json` 에서 지운 줄(`-`)이 `]` 직전 쉼표 한 줄뿐이어야 한다.
- [ ] e2e 는 `pnpm --dir src/frontend exec playwright test --list e2e/mdm-ruleSetEdit.spec.ts` 만 돌려 목록이 깨지지 않았는지 본다. 실제 실행은 **사용자 승인 뒤**다.
- [ ] 가장 강한 모델로 브랜치 전체 리뷰(`superpowers:requesting-code-review`)를 한 번 받고, 지적은 한 번의 고침 + 범위 재리뷰로 닫는다. 리뷰 요청에 Review Focus 다섯 줄을 그대로 넣는다.

## 수동 브라우저 확인(컨트롤러, ego-browser, dev 병합 뒤 본체 재기동)

서버가 내려가 있으면 묻지 않고 재시작하지 않는다(사용자에게 알린다). 테스트용 세트는 새로 만들지 말고 기존 테스트 세트(`ZZ_BROWSER_CHECK_1` 등)를 쓴다.

1. 편집 모드: 룰 노드에 마우스를 올리면 오른쪽 아래 빨간 번개 연결점이 보인다. 끌어 다른 룰·끝에 놓으면 룰 아래 테두리에 빨간 원이 생기고 그 원에서 빨간 점선이 놓은 노드로 간다. 보기·디버그 모드에서는 연결점이 없다.
2. 룰을 끌면 받는 노드가 함께 움직인다. 저장 뒤 다시 열어도 받는 노드 자리가 룰 테두리다(위치를 저장하지 않는다).
3. 받는 노드를 고르면 오른쪽 패널에 「받는 노드」·「받을 예외」가 보인다. 같은 룰의 다른 받는 노드가 받는 종류는 꺼져 있고 "{c}가 받는다" 가 보인다. 기본 행 있는 룰에 결과 없음을 받으면 종류 옆에 경고가 보인다.
4. 룰 우클릭 「예외 받기 추가」 는 끝으로 가는 처리 갈래를 만든다. 룰을 지우면 받는 노드와 그 선이 함께 지워진다. [자동 정렬] 하면 처리 갈래가 룰 오른쪽, 돌아오는 합류가 룰 아래에 놓인다.
5. 디버그 모드: 결과 없는 입력으로 실행하면 받은 룰이 주황 점선 테두리와 "결과 없음" 배지, 처리 갈래가 초록, 안 탄 받는 노드가 흐림이다. 끝냄이면 툴바가 "예외로 끝남: …" 이고 [받은 예외 1건] 이 목록을 연다. 받는 노드를 누르면 상세에 CATCH_* 값이 보인다. 처리 갈래 안 노드에서 값을 고쳐 [계속] 하면 고친 값이 반영된다.
