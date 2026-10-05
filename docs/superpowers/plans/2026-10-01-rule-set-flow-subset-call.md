# 룰 세트 흐름도 — 하위 세트 호출(SET 노드)·편집 화면 안 세트 탭 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **갱신 2026-10-06(조정 회차 rule-set-subset-call-2026-10-06, 항목 plan:0):** 이 계획은 2026-10-01 에 커밋 `2e02d29d`(CATCH 구현 전) 기준으로 썼다. 그 뒤 CATCH(D-134)·D-136(IF·예외 합류 노드 없애기)·D-144(세트 버전 관리)가 dev 에 들어갔다. plan:0 은 **공통부**(머리말·선행 조건·편차·레인 표·Global Constraints·Review Focus·Rulings)와 Task 0(이름 대조표)·Task 3(DB)·Task c(cactus)·Task 10(문서)을 지금 dev 에 맞췄다. **Task 1·2·4·5·6·7·8·9 의 본문은 옛 코드 기준 그대로다.** 각 Task 머리의 「갱신 메모」 와 Task 0 대조표를 먼저 읽고, 레인이 착수 첫 단계에서 자기 Task 를 현재 코드에 맞춰 읽는다. 레인은 이 계획 파일을 고치지 않는다(세 레인이 한 파일을 고치면 머지 충돌이 난다). 본문과 다르게 한 것은 자기 기록 문서 `docs/rule-set-subset/progress-<레인>.md` 의 「계획 조정」 에 적는다.

**Goal:** 룰 세트 흐름에 다른 룰 세트를 블랙박스처럼 부르는 `SET` 노드를 더하고(엔진 실행·정적 검사·확정 검사의 연쇄 재검사·디버거 "안으로 들어가기"), 룰 세트 편집 화면 안에 세트 탭을 여러 개(최대 8) 띄운다. cactus 모듈 저장 검증의 미리 받기가 하위 세트를 재귀로 받는다.

**Architecture:** 엔진 계약(Task 1)과 흐름 구조(Task 2)를 먼저 넓힌 뒤, 엔진 실행(Task 4)·cactus 미리 받기(Task c)와 서버·화면 분석기(Task 5)를 나란히, DB(Task 3)와 그 둘이 모이면 서비스·확정 검사·연쇄 재검사(Task 6)를 한다. 화면은 세트 탭 분리(Task 7)를 백엔드와 나란히 먼저 하고, SET 노드 화면(Task 8)과 디버거 들어가기(Task 9)를 그 위에 얹는다. 엔진은 지금처럼 DB 를 부르지 않고 하위 세트도 `DefinitionLookup.ruleSet` 으로 받는다(ADR-0005 D1·D3). 겉모양(`SetCallIo`)은 서버가 계산해 화면에 주고, 엔진은 실행에 필요한 같은 값을 같은 알고리즘으로 스스로 계산한다(편차 8). 실행은 판정 시각의 RELEASED 버전만 쓰므로 하위 세트 변경이 부모를 깨는지는 **확정 검사**에서 막고 DRAFT 저장은 경고만 한다(U2).

**Tech Stack:** Java 21, Spring Boot + OASIS(BPMN), SQLite(Flyway), JUnit 5, TypeScript + React 19, `@dk-oasis/shared`(Mantine 9.6 래퍼), `@xyflow/react` 12, Vitest(happy-dom), json-schema-to-typescript(`gen:contract`), Playwright(e2e 목록 확인만).

**Spec:** `docs/superpowers/specs/2026-10-01-rule-set-flow-subset-call-design.md`(정본, 2026-10-06 갱신판. 결정 C-D1~C-D19 — C-D10·C-D11 은 U2 판). 앞 스펙 `2026-10-02-rule-set-flow-implicit-join-design.md`(D-136, 특히 §13), `2026-10-01-rule-set-flow-catch-design.md`(받는 노드 CATCH), `2026-09-29-rule-set-flow-design.md`(흐름 모델 §3·실행 의미 §4·검사 §5). 이 계획의 편차·Ruling 은 스펙이 코드와 어긋나거나 정하지 않은 세부만 정한다.

**작업 위치:** 레인 3개가 각자 워크트리에서 한다(사용자 결정 U1). 기준은 dev 최신 커밋이다. 아래 명령은 모두 해당 워크트리 루트 기준이다. 레인 공통 규칙은 `docs/rule-set-subset/README.md` 가 정본이다.

| 레인 | 브랜치 | 워크트리 | 항목(= 이 계획의 Task) |
|---|---|---|---|
| eng | `feat/rule-set-subset-engine` | `/Users/jji/project/dmes-standard-wt/rssc-eng` | eng:1(Task 1) → eng:2(Task 2 의 Java) → eng:4(Task 4), eng:c(Task c) |
| srv | `feat/rule-set-subset-server` | `/Users/jji/project/dmes-standard-wt/rssc-srv` | srv:3(Task 3), srv:5(Task 5 의 서버·코퍼스 JSON·Task 2 의 구조 코퍼스 사례), srv:6(Task 6) |
| ui | `feat/rule-set-subset-ui` | `/Users/jji/project/dmes-standard-wt/rssc-ui` | ui:7(Task 7), ui:5t(Task 2·5 의 TS 짝), ui:8(Task 8), ui:9(Task 9) |

plan:0(이 갱신)과 Task 10(문서·결정 D-135)은 조정 세션이 한다.

**기준점:** 본문의 줄 번호는 모두 `2e02d29d` 기준이라 지금 코드와 맞지 않는다. **줄 번호를 쓰지 말고 메서드·레코드·상수 이름을 기준점으로 grep 해서 찾는다.** 이름이 바뀐 것은 Task 0 대조표를 따른다.

---

## 선행 조건: dev 반영 상태(2026-10-06 확인)

다음이 모두 dev 에 있다. 이 계획은 그 위에서 시작한다.

| 선행 | dev 상태 | 이 계획에 주는 영향 |
|---|---|---|
| CATCH(D-134, 받는 노드) | 병합 | 받는 노드 블록 `Guarded`·`CatchKind`·`CATCH_*` 예약 이름·`FLOW_CATCH`·`CATCH_NEVER` 가 있다 |
| D-136(IF·예외 합류 노드 없애기) | 병합 | 합류는 병렬에만. 블록은 `Step`(RULE·TASK)·`Guarded(step, normal, handlers, mergeId, joinId)`·`Split(…, joinId, …)`. TASK 에도 받는 노드. 끝내는 IF 갈래. 편집기는 열 때 옛 형식을 바꾼다. 스펙 §13 이 SET 에 주는 영향을 정했다 |
| D-144 2단계(룰 세트 버전) | 병합 | 흐름·`RULE_IDS` 는 버전 행 `TB_MDM_RULE_SET_VER` 에 있다. 저장은 소유 DRAFT 에만(`RuleSetWrites.updateDraft`), 확정은 `RuleSetConfirmCheck`(`VersionConfirmCheckSpi`). 실행은 판정 시각의 RELEASED |
| 엔진 준비 캐시(`d56dde59`) | 병합 | `MdmRuleEngine.plans`(세트 ID 키, `sameDefs`) — 하위 세트 정의도 동일성 비교에 넣어야 한다(Task 4) |
| evalex shared 이동(`f057bdb8`) | 병합 | 생성 TS 정본은 `src/frontend/shared/src/evalex/engine-contract.generated.ts`, `m-mdm/src/contract/engine-contract.generated.ts` 는 재내보내기다. 생성기 `gen:contract` 는 shared 쪽에 쓴다. 고친 뒤 shared 를 다시 빌드한다 |
| FlowParser 메서드 분할(`50c5d09e`) | 병합 | Task 2 의 고칠 자리는 나뉜 메서드 이름으로 찾는다 |
| 캔버스 변경(D-140 자동 배치, D-142·D-143 받는 노드 위치, `aac858aa` 이동 한계) | 병합 | Task 8·9 의 그리기·배치 자리가 바뀌었다 |

---

## 편차(스펙과 실제 코드가 어긋나 코드에 맞춘 것)

| # | 스펙 | 실제 코드·근거 | 이 계획 |
|---|---|---|---|
| 1 | §8 `ruleSetEdit.bpmn` 에 action `callIo`·`callers` 를 더한다 | 권한 action 은 `allActions` 에 없으면 SYSADMIN 도 403 이다(`docs/mdm/adr/0003-module-boundary-screens-roles.md`). `MdmOasisActionVocabularyTest` 가 BPMN action 을 정해진 어휘(`ALLOWED_ACTIONS`)로 묶는다. 이 화면은 새 조회를 `search` 의 `target` 으로 가른다(`RuleSetEditSearchRequest` 머리 주석) | `search` 에 `target=CALL_IO`(`setIdsJson`: 세트 ID JSON 배열 문자열)와 `target=CALLERS`(`setId`)를 더한다. BPMN 은 고치지 않는다. 목록은 JSON 문자열로 받는다(OASIS params 는 List DTO 칸을 묶지 못한다) |
| 2 | §8 "`simulate` 응답(`RuleSetSimulateResult`)" | action 이름은 `execute` 이고 서비스 메서드가 `simulate()` 다 | `execute` action·`simulate()` 메서드·`RuleSetSimulateResult` 에 `calledFlows` 를 더한다 |
| 3 | (옛) §6.3 `RuleSetCallerCheck` 는 `@Order(2)` | **U2 로 바뀜.** 룰 쪽 거부는 확정 검사(`RuleConfirmCheck` → `RuleConfirmChecks`)로 옮겼고, 룰 DRAFT 저장 검사(`RuleSaveCheck`)는 경고만 낸다 | 옛 판단 "`@Order(9)`(맨 뒤)" 는 폐기한다. 저장 검사 순서 번호는 srv:6 이 지금 쓰는 번호를 다시 세어 정한다(이슈 순서만 바뀌는지 확인) |
| 4 | (옛) V16 이 세트 표를 다시 만들며 케이스 표(V15 FK)를 함께 옮긴다 | **없어짐.** `CALL_SET_IDS` 는 VER 표 `TB_MDM_RULE_SET_VER` 칸이다. 그 표를 가리키는 FK 는 없다 | V23 은 VER 표만 V22 방식(`_BAK`)으로 다시 만든다(Task 3) |
| 5 | §1 예시 `{ "type": "SET", ... }` | 저장 JSON 의 종류 키는 `kind` 다(`RuleSetFlowJson`, 코퍼스도 `kind`). 스펙은 2026-10-06 에 고쳤다 | `{ "id": "s1", "kind": "SET", "setId": "QD_S_PRICE", "label": "단가 결정" }`. 정규 JSON 은 `setId` 를 **SET 노드에만** 쓴다 — SET 없는 세트의 정규 문자열과 저장된 흐름의 dirty 기준이 흔들리지 않게 한다(CATCH 의 `attachTo`·`catches` 와 같은 원칙) |
| 6 | §10.2 Mantine `Tabs` `keepMounted` 로 탭마다 `RuleSetEditor` 를 띄우고, §10.3 닫기 확인은 `modals.openConfirmModal` | 화면 모듈은 `@mantine/*` 를 import 하지 않는다(`mantine-aggrid-ui` SKILL §3). shared `Tabs`(`shared/src/components/tabs/`)는 탭 머리만 그리고 패널·`keepMounted`·닫기 단추가 없다 | **2026-10-06 조정자 판단으로 바뀜:** 세트 탭 틀(탭 머리 + 닫기 단추 + 숨김 패널)은 **shared 새 컴포넌트**로 등록한다(CLAUDE.md 공통 컴포넌트 행동강령, Part B §18 — 새 등록은 승인 없이, 같은 작업 안에서 `mantine-aggrid-ui` 컴포넌트 문서·색인 갱신). 기존 `shared/src/components/tabs/**` 는 고치지 않는다(props·동작 변경은 승인 대상). 고르지 않은 패널은 `display:none` 으로 숨긴다(스펙 §10.2 대안). 닫기 확인은 이 화면의 기존 dirty 확인과 같은 방식으로 한다 |
| 7 | §3 "SET 노드에 닿음 → 조회기로 하위 세트를 읽는다" | 부모의 입력 키 사전 검사는 실행 전에 하위 세트의 반드시 읽는 입력을 알아야 하고, 순환·깊이도 하위 세트를 읽어야 안다. 룰은 이미 준비 단계에서 모두 읽고 없으면 `RULE_NOT_FOUND` 로 실행 전에 멈춘다 | 하위 세트는 **준비 단계**(`prepare`)에서 재귀로 모두 읽고, 없음·폐기·순환·깊이 초과를 그때 `SET_CHECK` 단계 위반으로 낸다. 네 코드 모두 받지 않는 코드라 스펙의 결과(세트 중단)는 같다 |
| 8 | §2 "겉모양은 서버에서만 계산한다(C-D4)" | 엔진은 `RuleIo` 를 모르고 DB 를 부르지 않는다. 실행 때 "넘겨받을 출력 이름"·"반드시 정의되는가"·"부모 사전 검사에 넣을 입력"을 알아야 한다 | 엔진이 실행용 겉모양 `SetShape`(입력·반드시 읽는 입력·출력·출력별 always)를 같은 알고리즘으로 계산한다. always 는 정상 끝 + 모든 끝냄 지점(끝내는 처리 갈래·끝내는 IF 갈래) 상태의 합(D-136 §13). 화면은 서버 `SetCallIo` 만 쓴다. 두 계산이 같은 이름을 내는지 SQLite 시험 하나로 묶는다(Task 6) |
| 9 | §1 "기존 생성자는 null 로 위임한다"(스펙은 2026-10-06 에 고쳤다) | 계약 record 의 생성자는 `Record` 생성자만 부를 수 있다(`ContractTypeShapeTest`) | 새 칸을 더한 계약 record 는 **모든 호출부**에 새 인자를 적는다. 호출부는 grep 이 정본이다(2026-10-06 `new FlowNode(` 는 5개 파일) |
| 10 | §2 `SetCallIo(setId, exists, status, inputs, outputs)` | `CATCH_NEVER`(SUBSET_ENDED 인데 END 로 가는 처리 갈래가 없다)를 화면·서버가 판정하려면 그 정보가 겉모양에 있어야 한다 | `SetCallIo` 를 `(setId, setName, exists, status, inputs, outputs, endsEarly)` 로 둔다. `endsEarly` = `endedBy` 를 남기는 끝냄이 있는가(처리 갈래가 END 로 감 + 처리 갈래 안 IF 갈래가 END 로 감, 스펙 §4.2). 끝내는 IF 갈래(처리 갈래 밖)는 세지 않는다. 둘 다 연쇄 재검사의 겉모양 비교에는 넣지 않는다 |
| 11 | §3 "부모 `ctx` 의 사본을 입력 레코드로" | 처리 갈래 안의 `ctx` 에는 `CATCH_*` 가 있고, 예약 이름은 레코드 키로 오면 `RESERVED_KEY` 다 | 하위 세트 입력 = 부모 `ctx` 사본에서 `CATCH_*` 다섯 이름(대소문자 무시)을 뺀 것(Ruling 3, Review Focus 3) |
| 12 | §6.3 폐기 때 부르는 부모가 있으면 거부 | 지금 폐기는 "검사를 돌리지 않는다(I14)" | 스펙대로 부르는 세트 검사를 넣는다. I14 가 "폐기는 경로 검사를 돌리지 않고, 지금 이후 유효한 RELEASED 버전이 이 세트를 부르는 폐기하지 않은 세트가 있으면 거부한다" 로 바뀐다(D-135 에 적는다) |
| 13 | §5 네 코드(`CALL_*`·`CALLER_BROKEN`)의 수준 | U2: 확정·되살리기에서 거부, DRAFT 저장에서 경고. 코퍼스는 Java·TS 분석기의 수준 문자열까지 묶는다 | 분석기 두 벌은 `CALL_MISSING` 을 WARN 으로 낸다. 확정 검사·되살리기 검사가 네 코드를 수준과 상관없이 거부로 본다(`RuleSetCheck` 에 네 코드 모음 상수) |

---

## 레인 표와 의존 쌍

레인과 항목은 머리말 표와 같다. 의존 쌍 `A → B` 는 "B 는 A 가 dev 에 머지된 뒤(같은 레인이면 A 가 끝난 뒤) 시작한다" 는 뜻이다. 다른 레인 항목을 받으려면 dev 최신을 자기 브랜치에 합친다.

| 의존 쌍 | 까닭 |
|---|---|
| eng:1 → eng:2 | 흐름 구조가 `NodeKind.SET`·`FlowNode.setId` 를 쓴다 |
| eng:2 → eng:4 | 실행이 `SetStep`·`Guarded.step` 의 SET 을 쓴다 |
| eng:2 → eng:c | cactus 가 `FlowNode.setId` 와 흐름 해석을 쓴다 |
| eng:2 → srv:5 | 서버 분석기가 SET 블록을 쓴다 |
| eng:1 → ui:5t | TS 짝이 생성 TS 의 `SET`·`SUBSET_ENDED` 를 쓴다 |
| srv:5 → ui:5t | TS 분석기가 코퍼스 JSON(srv 소유)의 새 사례로 묶인다 |
| srv:3 → srv:6 | 서비스가 `CALL_SET_IDS` 칸을 쓴다 |
| srv:5 → srv:6 | 서비스가 `SetCallIo`·`RuleSetInterface` 를 쓴다 |
| eng:4 → srv:6 | `RuleSetRunner`·`SetCallIoEngineAgreementTest` 가 엔진 실행을 쓴다 |
| ui:7 → ui:8 | SET 노드 화면이 세트 탭 틀을 쓴다 |
| ui:5t → ui:8 | SET 노드 화면이 TS 검사를 쓴다 |
| srv:6 → ui:8 | 화면이 `CALL_IO`·`CALLERS`·`view.calls` 응답을 쓴다 |
| ui:8 → ui:9 | 디버거가 `RuleSetEditor`·`TraceDetail` 을 함께 고친다 |
| srv:6 → ui:9 | 디버거가 `calledFlows` 를 쓴다 |

처음 바로 시작할 수 있는 항목: eng:1, srv:3, ui:7.

파일 소유(겹침 방지):
- 생성 TS 두 벌(`shared/src/evalex/engine-contract.generated.ts`·`m-mdm/src/contract/engine-contract.generated.ts`)과 `flow-edit.ts`·`flow-layout.ts`·`flow-model.ts` 는 **eng:1 동안 eng 소유**, eng:1 머지 뒤로는 **ui 소유**다. 그래서 Task 2·5 의 TS 부분(`flow-model.ts` 의 `SetStep`·`CATCHABLE`·h2 문구, `set-model.ts`·`types.ts`, TS 시험)은 ui:5t 가 한다. eng:2 는 Java 만 한다.
- 코퍼스 JSON(`mdm/lib/src/test/resources/…/rule-set-corpus.json`)은 **srv 소유**다. Task 2 의 구조 코퍼스 사례와 Task 5 의 분석 사례를 srv:5 가 넣는다. `MIN_CASES`(Java `RuleSetCorpusTest`·TS `rule-set-corpus.test.ts`, 지금 둘 다 90)는 srv:5 가 Java 쪽을, ui:5t 가 TS 쪽을 같은 값으로 올린다.
- `src/frontend/m-mdm/tests/helpers/engine-paths.ts` 는 어느 레인 소유 목록에도 없다. ui:5t 가 고치되 조정 세션에 먼저 알린다.

---

## Global Constraints

- **스펙 2026-10-06 판이 정본이다.** 이름은 Task 0 대조표의 지금 이름을 쓴다. 줄 번호 대신 메서드·레코드·상수 이름으로 찾는다.
- 공개 엔진 계약(`engine-contract.schema.json`·Java 계약 타입·생성 TS·`RunTraceJson`)의 **모양**은 Task 1(eng:1)만 바꾼다. 다른 항목은 계약 파일의 모양을 고치지 않는다(필요하면 조정 세션에 알리고 BLOCKED). `docs/mdm/engine-contract.md` 문서는 Task 10 이 갱신한다.
- 저장 형식: `FLOW_JSON` 노드에 `"kind": "SET"` 과 `setId` 가 더해진다. `version` 은 1 그대로다(C-D16). `RULE_IDS` 는 버전 행에서 지금처럼 이 세트의 RULE 노드만 담는다(C-D3). 새 칸 `TB_MDM_RULE_SET_VER.CALL_SET_IDS` 는 서버가 흐름에서 계산해 채우고 화면은 보내지 않는다.
- 계약 record 에 칸을 더할 때는 위임 생성자를 만들지 않고 호출부를 모두 고친다(편차 9). 새 칸의 JSON 은 기존 골든이 한 글자도 바뀌지 않게 쓴다: `Violation.setPath`·`CaughtException.setPath` 는 빈 목록이면 키를 빼고, `NodeTrace.outputs`·`sub` 와 `PathStep.callIndex` 는 null 이면 키를 뺀다.
- 깊이 상한은 **5**(최상위에서 하위로 들어가는 단계 수 5 까지 허용, 6 부터 거부)다. 엔진 `SET_CALL_DEPTH`·서버 `CALL_DEPTH`·cactus 미리 받기가 같은 값을 쓴다. 엔진 상수 `SetShape.MAX_CALL_DEPTH = 5`, 서버 상수 `RuleSetCallGraph.MAX_DEPTH = 5`. cactus 는 엔진 상수가 공개면 그것을 쓰고, 아니면 같은 값 5 를 상수로 둔다.
- 확정·저장 수준(U2): §5 의 네 코드는 DRAFT 저장에서 WARN, 확정·되살리기에서 거부다(편차 13). 폐기 거부(C-D12)는 그대로다.
- 세트 탭 상한 **8**. 문구: `"세트 탭은 8개까지 연다. 다른 탭을 닫고 다시 연다"`, 닫기 확인 `"저장하지 않은 변경이 있다. 닫으면 변경을 버린다."`, 디버거 경고 `"하위 세트 {S}에 확정하지 않은 변경이 있다. 실행은 판정 시각의 RELEASED 로 한다."`(스펙 §10.3·§10.4, C-D18).
- 새 action 동사를 만들지 않는다(편차 1). `ruleSetEdit` 의 지금 action 그대로다.
- DB 검증은 SQLite 와 단위 시험으로만 한다. 도커를 쓰지 않는다. 레인은 서버(bootRun·local-run·fe-run)를 띄우지 않고 브라우저를 열지 않는다 — 서버 기동·브라우저 확인은 조정 세션만 한다. e2e 는 `--list` 로 목록에 잡히는지만 확인하고, 실제 실행은 **사용자 승인 뒤** 조정 세션이 한다.
- 마이그레이션 번호 V23 은 머지 직전에 dev 의 마지막 번호를 다시 확인한다(`outOfOrder=false`). 겹치면 다음 빈 번호로 옮기고 시험·주석의 번호를 함께 고친다.
- 화면 작업은 `.claude/skills/mantine-aggrid-ui/SKILL.md` 를 끝까지 읽고 따른다. 화면 모듈은 `@mantine/*` 를 import 하지 않고 `@dk-oasis/shared/*` 만 쓴다. **새 shared 컴포넌트 등록은 승인 없이** 하고 같은 작업 안에서 스킬의 컴포넌트 문서·색인을 갱신한다(Part B §18). **기존 shared 컴포넌트의 props·동작·모습 변경은 조정 세션 승인 뒤**에 한다. 바꾼 파일은 커밋 전 스킬의 audit 두 개가 0건이어야 한다. 규칙 정본 `docs/guide/FrontEnd/Local-Rules.md`(§8 한 변 색 바 금지, §11 늦은 응답 버리기, §16 무거운 계산 의존성, §17 로컬 `.css` import 금지, §19 React Flow 캔버스 함정). 새 CSS 는 `styles/*.ts` 의 TS 문자열 상수로만 넣는다. 색은 의미 토큰(`var(--color-*)`)만 쓴다. 아이콘은 `@tabler/icons-react`.
- 컴포넌트 시험은 `src/frontend/m-mdm/tests/**/*.test.ts` 에 `createElement` 로 쓴다(vitest include 가 `.ts` 만 본다). 렌더 시험은 파일 첫 줄 `/** @vitest-environment happy-dom */`.
- `docs/mdm/decisions.md` 는 append-only 이고 **Task 10(조정 세션)만** 쓴다.
- git: 워크트리 루트에서 `/usr/bin/git` 단순 한 줄 명령만(cd 결합·파이프·변수·`$(…)`·heredoc 금지). 자기가 만든·고친 파일만 경로로 지정해 `/usr/bin/git add <paths>` 뒤 `/usr/bin/git commit -m "..." -- <paths>`. `add -A`·`add .`·`stash`·`reset --hard`·브랜치 전환 금지. 메시지는 `type(scope): 한국어 요약` + 빈 줄 + 트레일러 한 줄 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- 프론트 의존성: **`pnpm install` 은 자기 워크트리 안에서만** 한다. 먼저 `ls -la src/frontend/node_modules` 로 메인 저장소를 가리키는 심링크인지 확인하고, 심링크면 install 하지 않는다(심링크 안에서 install 하면 메인의 `@dk-oasis/*` 링크가 바뀌어 사용자의 포털이 깨진다 — 2026-10-05 사고). 형제 패키지 dist 가 없으면 그 패키지 폴더에서 `npx tsup` 을 한 번 돌린다. shared 빌드가 exit 144 로 끝나면 dev watch 대기다 — 실패가 아니니 dist 를 grep 으로 확인한다.
- 명령(워크트리 루트 기준):
  - 공통 환경: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home PATH=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin:$PATH`
  - 엔진: `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)` / 한 클래스 `--tests '*이름'`
  - cactus-core: `(cd src/backend && ./gradlew :cactus-core:test --console=plain -q)`(프로젝트 경로는 착수 때 `settings.gradle` 로 확인)
  - mdm/lib: `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)` / 한 클래스 `--tests '*이름'`
  - mdm/api(SQLite): `(cd src/backend/mdm && ../gradlew :api:test --tests '<패턴>' --console=plain)`
  - 화면: 시험 파일 하나 `pnpm --dir src/frontend --filter @dk-oasis/m-mdm exec vitest run <m-mdm 기준 경로>`, 화면 묶음 `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit`, 완료 게이트 `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test` 의 `[m-mdm test 합계]` 줄.
  - 타입 검사: `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint`(tsc --noEmit). 오류 0.
  - 계약 생성: `pnpm --dir src/frontend --filter @dk-oasis/m-mdm gen:contract`(shared 쪽 생성 파일을 쓴다) 뒤 `pnpm --dir src/frontend --filter @dk-oasis/shared build`.
  - audit: `python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit <바꾼 파일…>` 와 `python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit <바꾼 파일…>` 0건.
  - `.css` import 없음: `grep -rnE "import ['\"]\.{1,2}/[^'\"]*\.css['\"]" src/frontend/m-mdm/pages/dme/ruleSetEdit` 0건.
  - e2e 목록: `pnpm --dir src/frontend exec playwright test e2e/mdm-ruleSetEdit.spec.ts --list`(실행 아님).
- 기준선: 각 레인이 착수 때 자기 영역 시험 수를 한 번 돌려 `progress-<레인>.md` 에 적는다. 항목 완료 보고는 기준선 대비 증감과 audit·lint 결과를 적는다.

## Review Focus

1. **하위 세트가 넘기는 이름이 엔진과 서버에서 같은가** — 엔진 `SetShape.outputs` 와 서버 `SetCallIo.outputs` 가 같은 저장 세트에 대해 같은 이름·같은 `always` 를 낸다. "앞 룰이 입력으로 읽고 뒤 룰이 같은 이름을 만드는" 경우는 최종 결과다. `always` 는 끝내는 IF 갈래 끝 상태까지 합친다(D-136 §13). 담당: eng:4(`SubsetShapeTest`)·srv:6(`SetCallIoEngineAgreementTest`).
2. **하위 세트가 부모 값을 바꾸지 못하고, 값 없는 출력은 덮지 않는다** — 담당: eng:4(`SubsetCallTest` 「중간 결과는 넘기지 않는다」「안 만든 출력은 부모 값을 남긴다」).
3. **처리 갈래 안의 SET 노드** — 처리 갈래 안(`ctx` 에 `CATCH_*`)에서 SET 노드를 불러도 하위 세트가 `RESERVED_KEY` 로 멈추지 않고, 하위 세트 안의 받는 노드가 새 `CATCH_*` 를 쓰며, 돌아온 뒤 부모 처리 갈래의 `CATCH_*` 는 그대로다. 처리 갈래는 돌아오는 자리로 돌아온다(D-136). 담당: eng:4(`SubsetCatchTest`).
4. **깊이 경계가 엔진·서버·cactus 에서 같다** — 단계 5 짜리 사슬(세트 6개)은 통과, 단계 6 짜리(세트 7개)는 확정 `CALL_DEPTH`·실행 `SET_CALL_DEPTH` 로 막히고 DRAFT 저장은 경고다. cactus 미리 받기는 단계 5 까지 받는다. 담당: eng:4(`SubsetCycleDepthTest`)·srv:6(`RuleSetCallGraphTest`)·eng:c.
5. **연쇄 재검사가 새 거부만 막고, 막는 자리는 확정이다** — 부모 P 에 원래 있던 거부는 하위 세트 S 확정을 막지 않는다. 새 경고만 생기면 확정은 되고 결과에 부모 목록이 실린다. 조부모까지 3단 연쇄도 막는다. 같은 경우 DRAFT 저장은 막지 않고 경고만 낸다. 두 DRAFT 가 순환을 반씩 만들면 나중 확정이 `CALL_CYCLE` 로 막힌다. 담당: srv:6.
6. **D-136 위에서 SET 이 RULE·TASK 와 같은 단계인가** — SET 이 모이는 자리·돌아오는 자리가 될 수 있고, SET 받는 노드의 처리 갈래가 돌아오는 자리로 돌아오며, 하위 세트가 끝내는 IF 갈래로 끝나면 부모는 정상 완료다. 담당: eng:2·eng:4·srv:5(코퍼스).

## Rulings(스펙이 정하지 않은 세부 — 이 계획이 정했다)

1. **블록 타입(2026-10-06 재정의):** 엔진 `flow` 패키지에 `SetStep(nodeId, setId) implements Step` 을 두고 `Step` 의 permits 에 더한다(지금 `RuleStep`·`TaskStep`). `Guarded.step` 이 그대로 받는다(D-136 J-D11). 옛 `CallStep` 봉인 인터페이스는 두지 않는다 — `Step` 이 이미 그 자리다. RULE·SET 만 고르는 곳은 `instanceof` 로 가른다. TS `flow-model.ts` 는 `SetStep { type: "SET"; nodeId; setId }` 를 `Step` 합에 더한다.
2. **`FlowTree` 새 질의:** `setSteps()`(모든 SET 노드, 깊이 우선), `setIds()`(처음 나온 순서로 중복 없이 = `CALL_SET_IDS`). `ruleSteps()`·`ruleIds()` 는 RULE 만 그대로다(C-D3). 옛 `callSteps()` 는 쓰는 곳이 생길 때만 eng:2 가 판단해 둔다. SET 노드도 `relation()` 의 대상이다.
3. **하위 세트 입력:** 부모 `ctx` 사본에서 예약 이름 `CATCH_KIND`·`CATCH_RULE`·`CATCH_CODE`·`CATCH_MSG`·`CATCH_SET`(대소문자 무시)을 뺀 맵(편차 11). 엔진 상수 `ReservedNames.CATCH_NAMES`(지금 넷, Task 1 이 다섯으로)에 모은다.
4. **`CATCH_SET` 값:** RULE 에 붙은 받는 노드에서는 지금 실행 중인 세트 ID(기록 실행의 저장 전 흐름이면 `RuleSetRunner.UNSAVED`), SET 에 붙은 받는 노드에서는 위반이 실제로 난 가장 안쪽 세트 ID, `SUBSET_ENDED` 면 하위 세트를 끝낸 받는 노드가 있는 세트 ID.
5. **`SUBSET_ENDED` 의 `CATCH_RULE`·`CATCH_MSG`:** 하위 세트를 끝낸 받는 노드가 받은 `CaughtException` 의 `ruleId`, 그 받는 노드의 `label`(없으면 노드 ID). 하위 세트가 다시 하위 세트의 `SUBSET_ENDED` 를 받아 끝났으면 그 `CaughtException` 의 `ruleId` 를 그대로 쓴다. 하위 세트가 끝내는 IF 갈래로 끝나면(`endedBy` 없음) `SUBSET_ENDED` 가 아니다(스펙 §4.2).
6. **분석기 안 세트 키:** 서버·화면 분석기는 SET 노드의 겉모양을 룰 입출력 맵에 `"set:" + setId` 키로 넣어 RULE 처럼 돈다. 검사 문구에서는 `세트 {setId}` 로, `RuleSetCheck.ruleId`·`otherRuleId` 칸에는 `setId` 그대로 쓴다. RULE 만 있는 흐름의 문구·순서는 한 글자도 바뀌지 않는다(기존 코퍼스 불변).
7. **`always=false` 출력:** 분석기는 SET 노드 뒤에서 그 이름이 이미 `defined` 가 아니면 `maybe` 에 넣는다. `prodBy` 는 always 와 무관하게 갱신한다(`DUP_RESULT` 판정).
8. **`CALL_MISSING` 문구**(서버·화면 같은 문구, 노드 배열에서 그 세트 ID 의 첫 SET 노드에 건다, 수준 WARN — 편차 13): `setId` 비었음 `"세트 노드 {nodeId}에 세트 ID가 없다"`, 겉모양 맵에 없거나 `exists=false` `"{setId}는 없는 세트다"`, `status=DEPRECATED` `"{setId}는 폐기된 세트다"`. 화면은 `callIo` 응답이 오기 전에도 같은 규칙을 쓴다.
9. **`FLOW_CATCH`·`CATCH_NEVER` 의 SET 문구:** SET 노드 받는 노드에 `NO_RESULT` `"받는 노드 {catchId}: 세트 노드에는 결과 없음(NO_RESULT)을 붙일 수 없다"`, RULE·TASK 노드 받는 노드에 `SUBSET_ENDED` `"받는 노드 {catchId}: 룰 노드에는 하위 세트 예외 끝(SUBSET_ENDED)을 붙일 수 없다"`(TASK 문구는 ui:5t·srv:5 가 지금 TASK 문구 방식에 맞춰 함께 정한다), `CATCH_NEVER` `"받는 노드 {catchId}: 세트 {setId}에는 END 로 가는 처리 갈래가 없어 하위 세트 예외 끝이 일어나지 않는다"`.
10. **`CALL_CYCLE`·`CALL_DEPTH`·`CALLER_BROKEN` 문구:** 순환 `"세트 호출이 순환한다: A › B › A"`, 깊이 `"세트 호출이 {n}단계다. 5단계까지 부른다: A › B › …"`(가장 긴 사슬 하나), 부모 거부 `"세트 {P}: {P 의 새 거부 문구}"`, 폐기 거부 `"사용 중인 세트 {P1, P2}가 이 세트를 불러 폐기할 수 없다. 부르는 세트를 먼저 고치거나 폐기한다"`, 새 경고 알림 `"부르는 세트에 경고가 생겼다: {P1, P2}"`.
11. **`RuleSaveIssueCode.SET_CALLER_BROKEN`** 이슈 문구는 `"세트 {S} 를 부르는 세트 {P}: {P 의 새 거부 문구}"`. 수준은 룰 DRAFT 저장에서 WARN, 룰 확정 검사에서는 거부 항목이다(U2).
12. **탭 상태 위치:** 탭 목록은 탭 틀의 `useState`(순수 함수 `tabs-model.ts` 로 열기·닫기·고르기). 탭마다 `RuleSetEditor` 하나가 `useRuleSetEdit()` 한 벌(자동 저장·DRAFT 선점 포함)을 갖는다. 탭 머리의 dirty 점과 세트 ID 는 편집기가 `onStatus(tabKey, {setId, setName, dirty})` 로 알린다. 탭 머리·닫기·숨김 패널 틀 자체는 shared 새 컴포넌트다(편차 6).
13. **포털 파라미터:** `useMdmPageParams` 는 탭 틀에서만 부른다. 열린 탭이 세트 없는 빈 탭 하나뿐이면 그 탭에서, 아니면 링크와 같이 연다.
14. **위 바 `IdPicker`:** 탭 틀 위 바에 두고 고른 세트를 **지금 탭**에서 연다(dirty 확인은 그 탭 편집기의 `open` 이 지금처럼 한다).
15. **디버거 들어가기 상태:** `useSimulation` 밖의 작은 훅 `useCallStack(last)` 가 `frames: {nodeId, setId, trace, flow}[]` 를 갖고, 캔버스·값 표·노드 상세는 맨 위 프레임을 본다. 새 기록이 오거나 모드를 나가면 비운다. 하위 프레임에서는 편집·E4 고치기·중단점을 끈다.
16. **`always` 판정:** END 에 닿는 모든 경로에서 END 직전에 반드시 정의된 출력만 `always=true` 다. 루트 순차 끝 상태와, 모든 끝냄 지점(끝내는 처리 갈래 끝·처리 갈래 안 IF 끝냄·끝내는 IF 갈래 끝) 상태를 교집합한다(D-136 §13). 엔진 `SetShape` 과 서버 `RuleSetInterface` 가 같은 알고리즘이다.
17. **NULL 출력도 덮는다:** 하위 `finalValues` 에 키가 있으면 값이 NULL 이어도 부모 `ctx` 에 덮어쓴다. 키가 없으면 덮지 않는다.
18. **`EMPTY`:** RULE·TASK·SET 노드가 하나도 없을 때만 낸다. SET 노드만 있는 세트도 저장할 수 있다.
19. **`SetCallIo` 의 `setName`·`endsEarly`:** SET 노드 제목(세트명)과 `CATCH_NEVER` 판정을 위해 서버가 겉모양에 세트명과 `endsEarly`(편차 10)를 함께 싣는다. 화면은 이 값을 그대로 쓰고 세트명을 따로 조회하지 않는다.
20. **`COND_UNTYPED` 의 선언 이름:** 지금처럼 이 세트의 룰 선언만 센다.
21. **단계 실행은 최상위만:** 툴바의 단계 실행·중단점은 최상위 기록에만 쓴다. 하위 프레임에서는 경로 표시 줄의 ‹ › 로 그 하위 기록의 커서만 옮긴다.
22. **보는 사람 설정 공유:** 변수 표시·미니맵은 각 편집기가 localStorage 에서 읽고 쓰되, 바꿀 때 탭 틀에 알리고(`publishPrefs`) 다른 탭은 디버그 모드가 아니면 바로 따른다. 분할 크기는 같은 `storageKey` 라 새로 여는 탭이 따른다.
23. **오른쪽 머리글 종류:** SET 노드 속성 패널의 `PanelKind` 는 `CALL`(라벨 "하위 세트")이다. 기존 `"SET"` 은 세트 전체 패널이 이미 쓴다.
24. **겉모양 기준 시각(2026-10-06):** `view`·`callIo`·`callers` 와 DRAFT 저장 경고는 지금, 확정 검사는 apply_from, 실행은 판정 시각이다. 기준 시각에 RELEASED 가 없는 세트는 `exists=false` 다(DRAFT 만 있음 = 없음).
25. **부르는 쪽 행(2026-10-06):** 호출 그래프와 `callers` 는 `STATUS = 'RELEASED'` 이고 기준 시각 이후에도 유효한(`APPLY_TO` 가 기준 시각보다 뒤) VER 행의 `CALL_SET_IDS` 만 센다. 부모 세트가 폐기면 세지 않는다. DRAFT 행은 그 DRAFT 자신의 저장 경고·확정 검사에서만 쓴다.

---
### Task 0: 이름 대조표 갱신

**담당:** plan:0 이 2026-10-06 dev(`f169accb`)로 채웠다. 각 레인은 착수 첫 단계에서 자기 Task 에 걸린 줄만 Step 1 의 grep 으로 다시 확인하고, 달라졌으면 `progress-<레인>.md` 「계획 조정」 에 적는다. 코드는 고치지 않는다.

**대조표(본문 이름 → 2026-10-06 dev 이름):**

| 구분 | 계획 본문(2e02d29d·CATCH 계획 기준) | 2026-10-06 dev | 쓰는 Task |
|---|---|---|---|
| 엔진 spi | `FlowNode(id, kind, ruleId, splitId, label, attachTo, catches)` | 같다. 새 칸 `setId` 는 끝(8번째)에 둔다 | 1·2 |
| 엔진 spi | `NodeKind { …, CATCH }` | `START, END, RULE, TASK, IF, PARALLEL, MERGE, CATCH` — `SET` 은 맨 끝 | 1 |
| 엔진 블록 | `Guarded(RuleStep rule, Seq normal, List<Handler> handlers, String mergeId)` | `Guarded(Step step, Seq normal, List<Handler> handlers, @Nullable String mergeId, @Nullable String joinId)`. `mergeId` 는 옛 형식만, 새 형식은 `joinId`(돌아오는 자리) | 2·4·5·9 |
| 엔진 블록 | `CallStep permits RuleStep, SetStep` | 없음 — `Step permits RuleStep, TaskStep` 에 `SetStep` 을 더한다(Ruling 1) | 2·4·5 |
| 엔진 블록 | `Split(…, mergeId, …)` | `Split(nodeId, kind, @Nullable mergeId, joinId, branches)` | 2·4 |
| 엔진 블록 | `Guarded.Handler(catchNodeId, kinds, body, ends)` | 같다 | 4 |
| 엔진 흐름 | `FlowParser.catchable(NodeKind)` = RULE | `FlowParser.catchable` = RULE·TASK. SET 을 더한다. `FlowParser` 는 `50c5d09e` 로 메서드가 나뉘었다 | 2 |
| 엔진 실행 | `FlowRun.guarded`·`catchNode`·`CATCH_ORDER`·`Caught`·`Ended`·`endedBy` | 같은 이름이 있다. `catchNode(RuleStep r, …)` 는 지금 RULE 만 받는다 | 4 |
| 엔진 실행 | `MdmRuleEngine.Prepared` | 준비 캐시 `MdmRuleEngine.plans`(세트 ID 키, `Plan.sameDefs`)가 더해졌다 — 하위 세트 정의(손주까지)를 동일성 비교에 넣는다 | 4 |
| 엔진 결과 | `RuleSetResult(…, caught, endedBy)`·`PathStep(nodeId, kind, chosenEdgeId, stepIndex)`·`CaughtException(ruleNodeId, ruleId, catchNodeId, kind, code, message)` | 같다 | 1·4 |
| 엔진 기록 | `NodeTrace(…, violations, catchKind, code, message)` | 같다. 새 칸 `outputs`·`sub` 는 이 셋 뒤 | 1·4·9 |
| 예약 이름 | `ReservedNames.CATCH_NAMES`(넷) | 같다(`CATCH_KIND`·`CATCH_RULE`·`CATCH_CODE`·`CATCH_MSG`) | 1·4 |
| 엔진 enum | `CatchKind { NO_RESULT, INPUT_ERROR, EVAL_ERROR, HIT_CONFLICT }` | 같다. `SUBSET_ENDED(List.of())` 를 끝에 | 1 |
| 계약 호출부 | `new FlowNode(` 15곳 | 5개 파일(`FlowParser`·`RuleSetFlowJson`·시험 `FlowFixtures`·`FlowParserTest`·`FlowParserStageOneCharacterizationTest`) — grep 이 정본 | 1 |
| 생성 TS | `m-mdm/src/contract/engine-contract.generated.ts` | 정본은 `shared/src/evalex/engine-contract.generated.ts`, m-mdm 쪽은 재내보내기(`f057bdb8`) | 1 |
| TS 맵 | `Record<FlowNodeKind>` 맵 | `flow-edit.ts`·`flow-layout.ts`·`flow-model.ts` 세 파일 | 1 |
| TS 모델 | `CATCHABLE` = RULE | `CATCHABLE` = RULE·TASK, `CATCH_KINDS`·`CATCH_NAMES`(넷)·`Step = RuleStep \| TaskStep`·`Guarded` 가 `flow-model.ts` 에 있다 | 2·5(ui:5t) |
| 서버 검사 | `RuleSetCheck.FLOW_CATCH`·`CATCH_NEVER` | 같다. TASK 받는 노드 `CATCH_NEVER`(D-136 A4)가 있다 | 5 |
| 서버 표 | `TB_MDM_RULE_SET.CALL_SET_IDS`·`MdmRuleSet`·`RuleSetWrites.update`·`SetState` | `TB_MDM_RULE_SET_VER.CALL_SET_IDS`·`MdmRuleSetVer`·`RuleSetWrites.updateDraft(setId, ver, ruleIdsJson, flowJson)`·새 버전 복사 `RuleSetVersionService` | 3·6 |
| 서버 확정 | (없음) | `RuleSetConfirmCheck`·`RuleSetConfirmChecks.report(draft, applyFrom)`·`RuleConfirmCheck`·`RuleConfirmChecks`(`VersionConfirmCheckSpi`) | 6 |
| 코퍼스 | `MIN_CASES = 64` | Java `RuleSetCorpusTest.MIN_CASES = 90`, TS `rule-set-corpus.test.ts` `MIN_CASES = 90` | 5(srv:5·ui:5t) |
| 시험 도우미 | `FlowFixtures.catchNode(id, attachTo, String... kinds)`·`guardMerge` | `catchNode` 는 같다. 새 형식 시험은 돌아오는 MERGE 없이 쓴다 | 2·4 |
| 화면 | `page.tsx` 812줄 | 872줄(`SetVersionRow`·`useAutoSave`·`ViewportGuard` 가 더해졌다) | 7 |
| DB 번호 | V16 | V23(마지막 V22, V19 비어 있음, `outOfOrder=false`) | 3 |

- [ ] **Step 1: 대조 확인(레인 착수 때, 자기 Task 줄만)**

Run(필요한 줄만):
```bash
grep -n "record Guarded\|record Handler" src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/Guarded.java
grep -n "permits" src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/Step.java
grep -n "record FlowNode\|enum NodeKind" -A2 src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/DefinitionLookup.java
grep -n "CATCH_NAMES" src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/ReservedNames.java
grep -rln "new FlowNode(" src/backend
grep -n "MIN_CASES =" src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts
grep -n "CATCHABLE\|CATCH_KINDS\|CATCH_NAMES\|export type Step" src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts
ls src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/
```
Expected: 대조표와 같다. 다르면 지금 이름을 쓰고 `progress-<레인>.md` 에 적는다.

- [ ] **Step 2: 기준선**

자기 레인 영역 시험만 돌린다(공통 환경 뒤). eng: 엔진·cactus-core, srv: mdm `:lib:test`·`:api:test`, ui: `[m-mdm test 합계]`·lint. 모두 초록이어야 하고 시험 수를 `progress-<레인>.md` 에 적는다. 빨강이 있으면 착수하지 않고 조정 세션에 보고한다.

---


### Task 1: 엔진 계약 — `SET` 노드·`setId`·`SUBSET_ENDED`·호출 오류 두 코드·`setPath`·`calls`·`callIndex`·`outputs`/`sub`·`CATCH_SET`

> **갱신 메모(레인이 착수 때 반영, 2026-10-06 plan:0)** — 아래 본문은 `2e02d29d` 기준이다. 본문보다 이 메모와 Task 0 대조표가 앞선다.
> - 담당 eng:1. 이 항목 동안 생성 TS 두 벌과 `flow-edit.ts`·`flow-layout.ts`·`flow-model.ts` 는 eng 소유다(머지 뒤 ui 소유).
> - `Guarded` 는 지금 `(Step step, Seq normal, handlers, @Nullable mergeId, @Nullable joinId)`, `Step` 은 `RuleStep | TaskStep` 이다. `SetStep` 은 `Step` 에 더한다(Ruling 1 재정의 — `CallStep` 을 두지 않는다). 계약 타입 쪽(이 Task)은 `NodeKind.SET`·`FlowNode.setId` 만 넓히고 블록은 eng:2 가 한다. `callSteps()` 가 필요한지는 eng:2 가 판단한다.
> - 생성 TS 정본은 `shared/src/evalex/engine-contract.generated.ts`(`f057bdb8`), `m-mdm/src/contract/engine-contract.generated.ts` 는 재내보내기다. `gen:contract` 뒤 shared 를 다시 빌드한다.
> - `Record<FlowNodeKind, …>` 맵은 `flow-edit.ts`·`flow-layout.ts`·`flow-model.ts` 세 파일에 있다. SET 항목을 더한다(동작은 RULE·TASK 와 같은 단계로).
> - `new FlowNode(` 호출 파일은 5개다(Task 0). `ReservedNames.CATCH_NAMES` 는 지금 넷 → 다섯.

**모델:** sonnet — 네 벌(Java·스키마·생성 TS·`RunTraceJson`)과 코덱을 같은 이름으로 맞추고 호출부를 기계적으로 고치는 다파일 작업이다. 실행 의미는 Task 4 가 맡는다.

**이 태스크가 정한 것(Task 1 과 Task 2·4 의 경계):**
- `NodeKind.SET` 은 enum **맨 끝**(CATCH 가 더한 `CATCH` 뒤)에 둔다. Java 의 `NodeKind` 분기는 `default` 가 있거나 `==` 비교라 컴파일 오류가 나지 않는다. `FlowParser` 의 SET 처리(차수·`setId` 빈 값·블록 `SetStep`)는 **Task 2** 가 한다. Task 1 과 Task 2 사이의 feat 위에서 Java·TS 파서는 SET 을 분기로 잘못 읽지만, 이 사이에 SET 을 만드는 코드와 사례가 없으므로 시험은 모두 초록이다.
- 계약 record 의 새 칸은 위임 생성자 없이 모든 호출부를 고친다(편차 9). 호출부 목록은 Step 3 의 grep 이 정본이다.
- JSON 은 기존 골든이 바뀌지 않게 쓴다: `Violation.setPath`·`CaughtException.setPath` 는 빈 목록이면 키를 빼고, `NodeTrace.outputs`·`sub` 는 null 이면 키를 뺀다. 스키마에서 `setPath` 는 required 가 아니고 Java 는 null 이 아닌 목록이라 `EngineContractSchemaTest` 의 대응표에서 `nullableExempt` 로 둔다(AstNode `params` 와 같은 처리).
- `PathStep.callIndex` 는 `stepIndex` 와 같이 required + null 허용이다(`RuleSetResult` 의 JSON 골든은 없다).
- `ReservedNames.CATCH_NAMES` 는 CATCH 의 네 이름 + `CATCH_SET`. CATCH 계획이 예약 키 검사에 쓰는 모음을 이 상수로 바꾼다.

**Files:**
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/DefinitionLookup.java`(`FlowNode` 마지막 칸 `setId`, `NodeKind.SET`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/EngineEvaluationException.java:200-228`(`Code.SET_CALL_CYCLE`·`SET_CALL_DEPTH`, `Violation.setPath`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/ReservedNames.java`(`CATCH_SET`, `CATCH_NAMES`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/CatchKind.java`(CATCH 계획 Task 1 이 만든 파일 — `SUBSET_ENDED`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetResult.java`(`calls`, `SetCall`, `PathStep.callIndex`, `CaughtException.setPath`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RunTrace.java`(`NodeTrace.outputs`·`sub`)
- Modify(호출부): `MdmRuleEngine.java`, `FlowRun.java`, `FlowKeys.java`, `RecordKeys.java`(rule·expr 두 곳), `RuleEvaluator.java`, `domain/DefaultDomainValidator.java`, `flow/FlowParser.java`, CATCH 가 `new Violation(`·`new NodeTrace(`·`new PathStep(`·`new CaughtException(` 을 더한 곳
- Modify: `src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json`(`ErrorCode`·`FlowNodeKind`·`FlowNode`·`Violation`·`RuleSetResult`·새 `SetCall`·`PathStep`·`NodeTrace`·CATCH 의 `CaughtException`·`CatchKind`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RunTraceJson.java`(`node`·`violations`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJson.java:50-57, 176`(`setId` 읽기·정규 JSON)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java:113`(`new Violation(` 인자)
- Modify(생성): `src/frontend/m-mdm/src/contract/engine-contract.generated.ts`(`gen:contract` 로만)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts:70-71`(`IN_DEGREE`·`OUT_DEGREE` 에 `SET: ONE`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts:14-22`(`NODE_SIZE.SET`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx:67-75`(`KIND_TEXT.SET`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx:22-30`(`KIND_TEXT.SET`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/catch-text.ts`(CATCH 계획 Task 8 이 만든 파일 — `CATCH_KIND_LABEL.SUBSET_ENDED`)
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch/ContractTypeShapeTest.java:74-76`(`rule.RuleSetResult$SetCall`)
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/contract/EngineContractSchemaTest.java`(R6 `nullableExempt`, `SetCall` 짝, CATCH `CaughtException` 짝 `nullableExempt`)
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/FlowFixtures.java`(새 `set(id, setId)`)
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/contract/EngineContractConstantsTest.java`(CATCH 의 `받는_노드_예약_이름은_CATCH_네_개다` → 다섯)
- Create(Test): `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/SubsetContractTest.java`
- Test: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RunTraceJsonTest.java`(사례 셋 추가)
- Test: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJsonTest.java`(사례 둘 추가)
- Test: `src/frontend/m-mdm/tests/engine-contract.generated.test.ts`(`EXPECTED_EXPORTS` 에 `SetCall`)

**Interfaces:**
- Consumes: CATCH 계약(CATCH 계획 Task 1 의 Produces).
- Produces(뒤 태스크가 이 이름을 그대로 쓴다):
  - Java `DefinitionLookup.NodeKind { …CATCH 까지 그대로…, SET }`
  - Java `record FlowNode(String id, NodeKind kind, @Nullable String ruleId, @Nullable String splitId, @Nullable String label, @Nullable String attachTo, @Nullable List<…> catches, @Nullable String setId)` — `setId` 는 SET 만 쓴다(`catches` 의 원소 타입은 CATCH 그대로).
  - Java `CatchKind.SUBSET_ENDED`(맨 끝).
  - Java `EngineEvaluationException.Code.SET_CALL_CYCLE`, `SET_CALL_DEPTH`(맨 끝, 단계는 늘 `Stage.SET_CHECK`).
  - Java `record Violation(Stage stage, Code code, @Nullable String ruleId, @Nullable Integer rowId, @Nullable String name, String message, List<String> setPath)` — `setPath` 는 이 세트에서 났으면 `List.of()`, 하위 세트에서 올라왔으면 최상위에서 그 세트까지 거친 SET 노드 ID(바깥부터).
  - Java `ReservedNames.CATCH_SET = "CATCH_SET"`, `ReservedNames.CATCH_NAMES`(다섯 이름, `Set<String>`).
  - Java `record RuleSetResult(String setId, Instant evalTs, List<RuleResult> steps, Map<String, Object> finalValues, List<PathStep> path, List<EngineWarning> warnings, List<CaughtException> caught, @Nullable String endedBy, List<SetCall> calls)`, `record RuleSetResult.SetCall(String nodeId, String setId, RuleSetResult result)`, `record RuleSetResult.PathStep(String nodeId, NodeKind kind, @Nullable String chosenEdgeId, @Nullable Integer stepIndex, @Nullable Integer callIndex)`, `CaughtException` 끝에 `List<String> setPath`.
  - Java `RunTrace.NodeTrace` 끝에 `@Nullable Map<String, Object> outputs, @Nullable RunTrace sub` — SET 노드만 쓴다.
  - JSON(`RunTraceJson`): 노드의 `outputs`(TypedValue 맵)·`sub`(같은 `RunTrace` 모양)는 있을 때만 CATCH 칸들 뒤에, 위반의 `setPath` 는 비지 않을 때만 `message` 뒤에.
  - JSON(`RuleSetFlowJson`): 노드 `setId` 읽기(문자열), 정규 JSON 은 SET 노드에만 `setId` 를 CATCH 칸들 뒤에 쓴다.
  - 생성 TS: `FlowNodeKind` 에 `"SET"`, `FlowNode.setId?: string | null`, `ErrorCode` 에 두 값, `Violation.setPath?: string[]`, `RuleSetResult.calls: SetCall[]`, `export interface SetCall { nodeId: string; setId: string; result: RuleSetResult }`, `PathStep.callIndex: number | null`, `NodeTrace.outputs?: {[k: string]: TypedValue}`, `NodeTrace.sub?: RunTrace`.
  - 시험 도우미: `FlowFixtures.set(String id, String setId)`(label null).

- [ ] **Step 1: Java 계약 실패 시험** — 네 파일을 고친다.

`ContractTypeShapeTest.java` 의 rule 줄(`"rule.RuleSetResult", "rule.RuleSetResult$PathStep",`)을 다음으로 바꾼다(CATCH 가 더한 `$CaughtException` 등은 그대로 둔다).

```java
                    "rule.RuleSetResult", "rule.RuleSetResult$PathStep", "rule.RuleSetResult$SetCall",
```

`EngineContractSchemaTest.java` 의 `RECORDS` 에서 R6 줄을 바꾸고, 맨 끝 짝 뒤에 `SetCall` 짝을 더한다(번호는 CATCH 가 쓴 마지막 R 번호 + 1 이다. CATCH 계획 Task 1 은 `R20 CaughtException` 까지 쓰므로 `R21` 이다. 대응표 주석 `R1-R20` 을 모두 `R1-R21` 로 올린다). CATCH 의 `CaughtException` 짝의 `nullableExempt` 를 `Set.of("setPath")` 로 바꾼다.

```java
            // setPath: Java 는 빈 목록(null 아님), JSON 은 이 세트에서 난 위반이면 키를 뺀다(하위 세트 spec §4.1) — 표지 대조에서 뺀다.
            new RecordPair("R6", EngineEvaluationException.Violation.class, "Violation", Set.of(), Set.of("setPath")),
```
```java
            // 하위 세트 호출 결과(하위 세트 spec §3.1).
            new RecordPair("R21", RuleSetResult.SetCall.class, "SetCall", Set.of(), Set.of()));
```

`FlowFixtures.java` 의 `task(...)` 뒤에 도우미를 더한다. 같은 파일의 다른 `new FlowNode(` 들에는 끝 인자 `null` 을 하나 더한다(Step 3).

```java
    /** 하위 세트 호출(SET, 하위 세트 spec §1). */
    public static FlowNode set(String id, String setId) {
        return new FlowNode(id, NodeKind.SET, null, null, null, null, null, setId);
    }
```

`SubsetContractTest.java` 를 만든다.

```java
package kr.dongkuk.maru.mdm.engine.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Test;

/** 하위 세트 spec §7 — 계약에 더한 이름(실행 의미는 SubsetCallTest 등 Task 4). */
class SubsetContractTest {

    @Test
    void SET_노드_종류와_호출_오류_두_코드가_있다() {
        assertEquals(NodeKind.SET, NodeKind.valueOf("SET"));
        assertEquals(Code.SET_CALL_CYCLE, Code.valueOf("SET_CALL_CYCLE"));
        assertEquals(Code.SET_CALL_DEPTH, Code.valueOf("SET_CALL_DEPTH"));
    }

    @Test
    void 위반의_setPath_는_이_세트에서_난_위반이면_빈_목록이다() {
        Violation v = new Violation(Stage.SET_CHECK, Code.SET_NOT_FOUND, null, null, "QD_S_X", "세트가 없다: QD_S_X", List.of());
        assertEquals(List.of(), v.setPath());
    }

    @Test
    void CATCH_SET_은_예약_이름이라_레코드_키로_오면_RESERVED_KEY() {
        assertEquals(5, ReservedNames.CATCH_NAMES.size());
        assertTrue(ReservedNames.CATCH_NAMES.contains(ReservedNames.CATCH_SET));
        InMemoryDefinitionLookup lookup = FlowRules.lookup(FlowRules.calc("R_K", "K", "1"));
        lookup.addSet(new RuleSetDefinition("S", List.of("R_K"), SetStatus.INUSE, null));
        MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("CATCH_SET", "S");
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class, () -> engine.evaluateSet("S", record, SampleRules.EVAL_TS));
        assertEquals(Code.RESERVED_KEY, e.violations().get(0).code());
    }

    @Test
    void 하위_세트가_없는_한_줄_세트의_calls_는_비고_path_의_callIndex_는_null() {
        InMemoryDefinitionLookup lookup = FlowRules.lookup(FlowRules.calc("R_K", "K", "1"));
        lookup.addSet(new RuleSetDefinition("S", List.of("R_K"), SetStatus.INUSE, null));
        MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);
        RuleSetResult r = engine.evaluateSet("S", Map.of(), SampleRules.EVAL_TS);
        assertEquals(List.of(), r.calls());
        assertTrue(r.path().stream().allMatch(p -> p.callIndex() == null));
    }
}
```

`MdmEvaluatorFixtures`·`TestExpressionConfig` 의 패키지는 `RuleSetFlowEvaluationTest.java` 의 import 와 같게 맞춘다(Step 2 의 컴파일 오류가 알려 준다).

- [ ] **Step 2: 실패 확인**

Run(공통 환경 뒤): `(cd src/backend/maru-mdm-engine && ../gradlew test --tests '*ContractTypeShapeTest' --tests '*EngineContractSchemaTest' --tests '*SubsetContractTest' --console=plain)`
Expected: 컴파일 오류 — `NodeKind.SET`·`Code.SET_CALL_CYCLE`·`ReservedNames.CATCH_SET`·`RuleSetResult.SetCall`·`calls()`·`callIndex()`·7인자 `Violation`·8인자 `FlowNode` 가 없다.

- [ ] **Step 3: Java 계약 구현**

`DefinitionLookup.java` — `FlowNode` javadoc 첫 문장 뒤에 한 줄을 더하고, 마지막 칸 뒤에 `setId` 를 둔다. `NodeKind` 끝에 `SET`.

```java
    /**
     * {@code ruleId} 는 RULE 만, {@code splitId}(짝 분기 노드 ID)는 MERGE 만 쓴다. {@code label} 은 화면 표시용이다.
     * TASK(빈 단계, 4단계 spec §1.1)는 {@code label} 만 쓰고 실행 때 아무것도 읽거나 만들지 않고 지나간다.
     * SET(하위 세트 호출, 하위 세트 spec §1)은 {@code setId}(부르는 세트 ID)와 {@code label} 만 쓴다.
     */
```
`record FlowNode(...)` 의 마지막 칸(`catches`) 뒤에 `, @Nullable String setId` 를 더한다. `enum NodeKind` 의 마지막 상수 뒤에 `, SET` 을 더한다.

`EngineEvaluationException.java` — `EDIT_POINT_MISMATCH` 뒤:

```java
        EDIT_POINT_MISMATCH,
        /** 세트 호출 경로에 같은 세트가 다시 나왔다(하위 세트 spec §3.3). 저장 검사 CALL_CYCLE 이 먼저 막는다. 단계는 늘 {@link Stage#SET_CHECK}. */
        SET_CALL_CYCLE,
        /** 최상위 세트에서 하위로 들어가는 단계가 5 를 넘었다(하위 세트 spec §3.3). 단계는 늘 {@link Stage#SET_CHECK}. */
        SET_CALL_DEPTH
    }

    /**
     * @param name    변수 이름(키 없음·NULL·타입 변환) 또는 함수 이름(평가 오류). 세트 호출 오류는 부르는 세트 ID
     * @param setPath 최상위 세트에서 이 위반이 난 세트까지 거친 SET 노드 ID(바깥부터). 이 세트에서 났으면 빈 목록(하위 세트 spec §4.1)
     */
    public record Violation(
            Stage stage, Code code, @Nullable String ruleId, @Nullable Integer rowId, @Nullable String name, String message,
            List<String> setPath) {}
```

`ReservedNames.java` — CATCH 가 둔 `CATCH_MSG` 상수 뒤에 `CATCH_SET` 을 더하고, CATCH 가 둔 `CATCH_NAMES`(네 이름) 줄을 다섯 이름으로 바꾼다:

```java
    /** 위반이 난 가장 안쪽 세트 ID(하위 세트 spec §4.1, C-D7). 처리 갈래 안에서만 ctx 에 있다. */
    public static final String CATCH_SET = "CATCH_SET";

    /** 처리 갈래가 읽는 예약 이름 다섯. 레코드 키로 오면 RESERVED_KEY 이고 하위 세트 입력으로 넘기지 않는다. */
    public static final Set<String> CATCH_NAMES = Set.of(CATCH_KIND, CATCH_RULE, CATCH_CODE, CATCH_MSG, CATCH_SET);
```

CATCH 의 `RecordKeys` 예약 키 검사는 `CATCH_NAMES` 를 쓰므로 `CATCH_SET` 레코드 키도 자동으로 `RESERVED_KEY` 가 된다(문구 `레코드 키 '{키}' 는 받는 노드 예약 이름이다` 그대로). 네 이름을 따로 적은 자리가 남아 있으면 `CATCH_NAMES` 로 바꾼다.

CATCH 의 `EngineContractConstantsTest.받는_노드_예약_이름은_CATCH_네_개다` 는 네 이름 집합을 단언하므로 이름과 기대값을 바꾼다:

```java
    @Test
    void 받는_노드_예약_이름은_CATCH_다섯_개다() {
        assertEquals(new TreeSet<>(Set.of("CATCH_KIND", "CATCH_RULE", "CATCH_CODE", "CATCH_MSG", "CATCH_SET")),
                new TreeSet<>(ReservedNames.CATCH_NAMES));
        assertAll(
                () -> assertEquals("CATCH_KIND", ReservedNames.CATCH_KIND),
                () -> assertEquals("CATCH_RULE", ReservedNames.CATCH_RULE),
                () -> assertEquals("CATCH_CODE", ReservedNames.CATCH_CODE),
                () -> assertEquals("CATCH_MSG", ReservedNames.CATCH_MSG),
                () -> assertEquals("CATCH_SET", ReservedNames.CATCH_SET));
    }
```

CATCH 의 `flow/CatchKind.java` — 상수마다 코드 이름 목록을 받는 생성자가 있다. 마지막 상수 `HIT_CONFLICT(List.of("UNIQUE_MULTIPLE_HITS", "ANY_CONFLICT"));` 의 `;` 를 `,` 로 바꾸고 그 뒤에 더한다:

```java
    /** 하위 세트가 자기 받는 노드의 처리 갈래로 END 에 닿았다(하위 세트 spec §4.2). SET 노드에 붙은 받는 노드만 고른다. 오류 코드와 짝이 없다. */
    SUBSET_ENDED(List.of());
```
`parse("SUBSET_ENDED")` 는 `values()` 를 돌므로 바로 받고, `ofCode` 는 코드 목록이 비어 있어 어떤 코드로도 이 종류를 내지 않는다. CATCH 의 `CatchKindTableTest` 는 그대로 통과한다. 스키마 `$defs/CatchKind` 의 enum 끝에도 `"SUBSET_ENDED"` 를 더한다(E12 짝이 맞춘다).

CATCH 의 "오류 코드 → 종류" 표에는 `SUBSET_ENDED` 를 넣지 않는다(오류 코드가 아니다). `SET_CALL_CYCLE`·`SET_CALL_DEPTH` 도 넣지 않는다(받지 않는 코드).

`RuleSetResult.java` — 레코드 머리와 중첩 타입을 다음으로 바꾼다(CATCH 의 `caught`·`endedBy`·`CaughtException` javadoc 은 그대로 두고 `setPath`·`calls`·`SetCall`·`callIndex` 만 더한다).

```java
/**
 * …(기존 javadoc 그대로, CATCH 의 caught·endedBy 설명 포함)…
 * @param calls 실행한 SET 노드마다 하위 세트 결과(실행 순서, 하위 세트 spec §3.1). steps 는 이 세트의 RULE 결과만 담는다
 */
public record RuleSetResult(String setId, Instant evalTs, List<RuleResult> steps, Map<String, Object> finalValues,
        List<PathStep> path, List<EngineWarning> warnings, List<CaughtException> caught, @Nullable String endedBy, List<SetCall> calls) {

    /**
     * 방문한 노드 하나.
     *
     * @param chosenEdgeId IF 에서 고른 선. 그 밖은 null
     * @param stepIndex    RULE 이면 그 결과가 {@code steps} 의 몇 번째인지. 그 밖은 null
     * @param callIndex    SET 이면 그 결과가 {@code calls} 의 몇 번째인지. 그 밖은 null
     */
    public record PathStep(String nodeId, NodeKind kind, @Nullable String chosenEdgeId, @Nullable Integer stepIndex,
            @Nullable Integer callIndex) {}

    /** SET 노드 한 번의 실행 — 하위 세트의 결과 전체(하위의 calls·caught·endedBy 포함). */
    public record SetCall(String nodeId, String setId, RuleSetResult result) {}
```

CATCH 의 `CaughtException` 레코드 마지막 칸 뒤에 다음을 더하고 javadoc 에 한 줄을 붙인다.

```java
            , List<String> setPath
```
```java
     * @param setPath 이 예외를 받은 세트까지 거친 SET 노드 ID(바깥부터). 이 세트에서 받았으면 빈 목록(하위 세트 spec §4.3)
```

`RunTrace.java` — `NodeTrace` 의 마지막 칸(CATCH 의 `message`) 뒤에 두 칸을 더하고 javadoc 에 한 줄을 붙인다.

```java
            , @Nullable Map<String, Object> outputs, @Nullable RunTrace sub
```
```java
     * SET: setId 는 ruleId 칸이 아니라 sub.setId 로 본다. reads(부모 ctx 에서 하위 입력 이름의 값)·outputs(넘겨받은 이름 → 값)·sub(하위 세트 기록).
```

호출부 고치기 — 아래 grep 결과마다 새 인자를 더한다.

```bash
grep -rn --include='*.java' -F "new Violation(" src/backend | grep -v /build/
grep -rn --include='*.java' -F "new FlowNode(" src/backend | grep -v /build/
grep -rn --include='*.java' -F "new NodeTrace(" src/backend | grep -v /build/
grep -rn --include='*.java' -F "new PathStep(" src/backend | grep -v /build/
grep -rn --include='*.java' -F "new RuleSetResult(" src/backend | grep -v /build/
grep -rn --include='*.java' "new CaughtException(\|CaughtException(" src/backend | grep -v /build/
```

- `new Violation(…, message)` → `new Violation(…, message, List.of())`(`java.util.List` import 가 없으면 더한다).
- `new FlowNode(…)` → 끝에 `, null`. `RuleSetFlowJson` 의 것은 Step 4 가 `text(n, "setId", where)` 로 바꾼다.
- `new NodeTrace(…)` → 끝에 `, null, null`.
- `new PathStep(…)` → 끝에 `, null`.
- `new RuleSetResult(…)`(`MdmRuleEngine.evaluateSet`) → 끝에 `, List.of()`(Task 4 가 `List.copyOf(run.calls)` 로 바꾼다).
- `new CaughtException(…)` → 끝에 `, List.of()`.

- [ ] **Step 4: 코덱·JSON 구현**

`RuleSetFlowJson.java` 의 `read(...)` 에서 노드를 만드는 줄의 마지막 인자를 `text(n, "setId", where)` 로 둔다(CATCH 의 `attachTo`·`catches` 읽기 뒤). `canonical(...)` 의 노드 쓰기 끝(CATCH 칸들 뒤)에 다음을 더한다.

```java
            // setId 는 SET 노드에만 쓴다 — SET 없는 세트의 정규 문자열이 그대로여야 한다(편차 5, 저장 흐름 dirty 기준).
            if (n.setId() != null) {
                o.put("setId", n.setId());
            }
```

`RunTraceJson.java` — `node(...)` 의 마지막(CATCH 칸들 뒤)에, `violations(...)` 의 `m.put("message", v.message());` 뒤에 다음을 더한다.

```java
        if (n.outputs() != null) {
            m.put("outputs", values(n.outputs()));
        }
        if (n.sub() != null) {
            m.put("sub", toMap(n.sub()));
        }
```
```java
            if (!v.setPath().isEmpty()) {
                m.put("setPath", List.copyOf(v.setPath()));
            }
```

클래스 javadoc 목록에 한 줄을 더한다: `<li>{@code outputs}·{@code sub}: SET 노드에만, null 이면 키를 뺀다. 위반의 {@code setPath} 는 비었으면 키를 뺀다(하위 세트 spec §3.2·§4.1).</li>`.

- [ ] **Step 5: 스키마 구현**

`engine-contract.schema.json` 의 `$defs` 를 고친다(속성 순서는 Java 컴포넌트 순서).

- `ErrorCode.enum` 끝에 `"SET_CALL_CYCLE", "SET_CALL_DEPTH"`.
- `FlowNodeKind.enum` 끝에 `"SET"`, description 끝에 ` SET = 하위 세트 호출(하위 세트 spec §1).`
- `FlowNode.properties` 끝에 `"setId": {"type": ["string", "null"]}`(required 에 넣지 않는다), description 끝에 ` setId 는 SET 만 쓴다.`
- `Violation.properties` 끝에 `"setPath": {"type": "array", "items": {"type": "string"}}`(required 밖), description 끝에 ` setPath 는 하위 세트에서 올라온 위반의 SET 노드 경로(바깥부터)이고, 이 세트에서 난 위반이면 키를 뺀다.`
- `RuleSetResult.properties` 끝에 `"calls": {"type": "array", "items": {"$ref": "#/$defs/SetCall"}}`, `required` 끝에 `"calls"`.
- 새 정의(`RuleSetResult` 바로 뒤):

```json
    "SetCall": {
      "description": "SET 노드 한 번의 실행(Java RuleSetResult.SetCall, 하위 세트 spec §3.1). result 는 하위 세트의 결과 전체다.",
      "type": "object",
      "properties": {
        "nodeId": {"type": "string"},
        "setId": {"type": "string"},
        "result": {"$ref": "#/$defs/RuleSetResult"}
      },
      "required": ["nodeId", "setId", "result"],
      "additionalProperties": false
    },
```

- `PathStep.properties` 끝에 `"callIndex": {"type": ["integer", "null"]}`, `required` 끝에 `"callIndex"`, description 끝에 ` callIndex 는 SET 결과의 calls 자리.`
- `NodeTrace.properties` 끝(CATCH 칸들 뒤)에 `"outputs": {"type": "object", "additionalProperties": {"$ref": "#/$defs/TypedValue"}}`, `"sub": {"$ref": "#/$defs/RunTrace"}`(둘 다 required 밖), description 끝에 ` SET: reads·outputs·sub(하위 세트 기록), 없으면 키를 뺀다.`
- CATCH 의 `CaughtException.properties` 끝에 `"setPath": {"type": "array", "items": {"type": "string"}}`(required 밖).
- CATCH 의 종류 enum 정의 끝에 `"SUBSET_ENDED"`.

- [ ] **Step 6: Java 통과 확인**

Run: `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)`
Expected: PASS(엔진 전체 — 호출부를 빠뜨렸으면 컴파일 오류).

- [ ] **Step 7: lib 시험 추가와 실패 확인**

`RunTraceJsonTest.java` 끝(마지막 `}` 앞)에 더한다. `RunTrace` 는 CATCH 계획 Task 1 이 끝에 `endedBy` 를 더한 모양이다(`…, edits, endedBy`).

```java
    @Test
    void SET_노드는_reads_뒤_CATCH_칸들_뒤에_outputs_sub_를_싣고_RULE_노드에는_싣지_않는다() {
        RunTrace sub = new RunTrace("QD_S_PRICE", TS, Map.of("X", BigDecimal.ONE), List.of(), Map.of("P", BigDecimal.TEN), null, null, null);
        RunTrace.NodeTrace set = new RunTrace.NodeTrace(2, "s1", kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind.SET,
                RunTrace.NodeStatus.OK, null, null, Map.of("X", BigDecimal.ONE), null, null, null, null, null, null, null, null, null, null,
                Map.of("P", BigDecimal.TEN), sub);
        Map<String, Object> m = RunTraceJson.toMap(new RunTrace("S", TS, Map.of(), List.of(set), Map.of(), null, null, null));

        @SuppressWarnings("unchecked")
        Map<String, Object> node = ((List<Map<String, Object>>) m.get("nodes")).get(0);
        List<String> keys = List.copyOf(node.keySet());
        assertEquals("sub", keys.get(keys.size() - 1));
        assertEquals("outputs", keys.get(keys.size() - 2));
        assertEquals(Map.of("P", Map.of("type", "NUMBER", "value", "10")), node.get("outputs"));
        @SuppressWarnings("unchecked")
        Map<String, Object> subMap = (Map<String, Object>) node.get("sub");
        assertEquals("QD_S_PRICE", subMap.get("setId"));
    }

    @Test
    void 위반의_setPath_는_비었으면_키를_빼고_있으면_message_뒤에_싣는다() {
        var here = new kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation(
                kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage.INPUT_CHECK,
                kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code.MISSING_KEY, "R1", null, "X", "없다", List.of());
        var deep = new kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation(
                kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage.INPUT_CHECK,
                kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code.MISSING_KEY, "R1", null, "X", "없다", List.of("s1", "s9"));
        Map<String, Object> m = RunTraceJson.toMap(new RunTrace("S", TS, Map.of(), List.of(), Map.of(), List.of(here, deep), null, null));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> vs = (List<Map<String, Object>>) m.get("violations");
        assertFalse(vs.get(0).containsKey("setPath"));
        assertEquals(List.of("stage", "code", "ruleId", "rowId", "name", "message", "setPath"), List.copyOf(vs.get(1).keySet()));
        assertEquals(List.of("s1", "s9"), vs.get(1).get("setPath"));
    }
```

`NodeTrace` 생성 인자는 `seq, nodeId, kind, status, ruleId, ver, reads, result, branches, chosenEdgeId, order, splitId, merged, violations, (CATCH 3칸), outputs, sub` 순서다 — CATCH 칸 수가 장부와 다르면 null 개수를 맞춘다.

`RuleSetFlowJsonTest.java` 끝에 더한다.

```java
    @Test
    void SET_노드의_setId_를_읽고_정규_JSON_은_SET_노드에만_setId_를_쓴다() throws Exception {
        String in = """
            {"version":1,"nodes":[{"id":"start","kind":"START"},{"id":"s1","kind":"SET","setId":"QD_S_PRICE","label":"단가 결정"},
             {"id":"end","kind":"END"}],"edges":[{"id":"e1","from":"start","to":"s1"},{"id":"e2","from":"s1","to":"end"}]}""";
        var f = RuleSetFlowJson.parse(in);
        assertEquals("QD_S_PRICE", f.nodes().get(1).setId());
        assertEquals(null, f.nodes().get(0).setId());
        String out = RuleSetFlowJson.canonical(in);
        assertEquals(1, out.split("\"setId\"", -1).length - 1, "setId 는 SET 노드 하나에만 쓴다: " + out);
        assertTrue(out.contains("\"setId\":\"QD_S_PRICE\""));
    }

    @Test
    void setId_가_문자열이_아니면_형식_오류() {
        String in = """
            {"version":1,"nodes":[{"id":"s1","kind":"SET","setId":3}],"edges":[]}""";
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> RuleSetFlowJson.parse(in));
        assertEquals("nodes[0].setId 는 문자열이어야 한다", e.getMessage());
    }
```

기존 시험 `정규_JSON_은_모든_칸을_고정_순서로_쓰고_view_를_보존한다`(146-155행)는 **고치지 않는다** — SET 없는 흐름의 정규 문자열이 그대로여야 한다(이 시험이 깨지면 Step 4 구현이 틀린 것이다).

Run: `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RunTraceJsonTest' --tests '*RuleSetFlowJsonTest' --console=plain)`
Expected: Step 4 를 아직 안 했으면 FAIL, 했으면 PASS. (Step 4 를 먼저 했다면 이 단계에서 PASS 를 확인한다.)

- [ ] **Step 8: 생성 TS 와 화면 타입 맵**

Run: `pnpm --dir src/frontend --filter @dk-oasis/m-mdm gen:contract`
Expected: `engine-contract.generated.ts` 에 `"SET"`·`setId`·`SetCall`·`callIndex`·`outputs`·`sub`·`setPath`·`SUBSET_ENDED` 가 생긴다(손으로 고치지 않는다).

`tests/engine-contract.generated.test.ts` 의 `EXPECTED_EXPORTS` 에서 `"RuleSetResult",` 뒤에 `"SetCall",` 을 더하고 주석의 개수를 CATCH 가 올린 `(52개)` 에서 `(53개)` 로 올린다.

tsc 가 막는 `Record<FlowNodeKind, …>` 네 곳에 SET 을 더한다.

`flow-model.ts:70-71`:
```ts
const IN_DEGREE: Record<FlowNodeKind, Degree> = { START: NONE, END: ONE, RULE: ONE, TASK: ONE, IF: ONE, PARALLEL: ONE, MERGE: MANY, /* CATCH 칸 그대로 */ SET: ONE };
const OUT_DEGREE: Record<FlowNodeKind, Degree> = { START: ONE, END: NONE, RULE: ONE, TASK: ONE, IF: MANY, PARALLEL: MANY, MERGE: ONE, /* CATCH 칸 그대로 */ SET: ONE };
```
(주석 자리는 CATCH 가 넣은 `CATCH: …` 항목을 그대로 둔다는 뜻이다. 주석 글자는 넣지 않는다.)

`flow-layout.ts` `NODE_SIZE` 의 `TASK` 줄 뒤:
```ts
  SET: { w: 232, h: 68 }, // 하위 세트 호출 — 룰과 같은 크기(하위 세트 spec §9)
```

`panels/PropertyPanel.tsx` `KIND_TEXT` 의 `TASK` 줄 뒤:
```ts
  SET: "룰 세트 — 다른 룰 세트를 부른다. 입력은 하위 세트의 입력, 돌려받는 값은 하위 세트의 최종 결과뿐이다",
```

`debugger/TraceDetail.tsx` `KIND_TEXT` 의 `TASK` 줄 뒤:
```ts
  SET: "룰 세트",
```

생성 TS 의 `CatchKind` 에 `"SUBSET_ENDED"` 가 들어오므로 CATCH 계획 Task 8 의 `catch-text.ts` `CATCH_KIND_LABEL`(`Readonly<Record<CatchKind, string>>`)도 tsc 가 막는다. `HIT_CONFLICT` 줄 뒤에 더한다:
```ts
  SUBSET_ENDED: "하위 세트 예외 끝",
```

CATCH 의 뒤 태스크(8·10)가 이런 전수 맵을 더 만들었을 수 있다. 다음으로 모두 찾는다.
```bash
grep -rn "Record<FlowNodeKind\|Record<CatchKind\|Record<NodeTrace\[\"kind\"\]" src/frontend/m-mdm/pages src/frontend/m-mdm/tests
grep -rn "switch (.*kind())\|switch (k)" src/backend/maru-mdm-engine/src/main/java src/backend/mdm/lib/src/main/java | grep -v "/test/"
```
Expected: 위 다섯 곳(`IN_DEGREE`·`OUT_DEGREE`·`NODE_SIZE`·`KIND_TEXT` 둘)과 `CATCH_KIND_LABEL` 밖에 `Record<FlowNodeKind|CatchKind>` 맵이 없다. 더 있으면 tsc(lint) 출력과 함께 보고, 값은 RULE 과 같게 두고 줄 끝에 `// SEAM(T8)` 을 단다(Task 8 이 `grep -rn "SEAM(T8)"` 로 채운다). Java `switch` 는 `default` 갈래가 없는 `NodeKind`·`CatchKind` 전수 switch 만 컴파일 오류로 드러난다(CATCH `FlowParser.inRule`·`outRule` 은 `default` 가 있어 SET 이 RULE 과 같은 1·1 이 된다).

- [ ] **Step 9: 전체 확인**

Run(차례로):
```bash
(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)
(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)
(cd src/backend/mdm && ../gradlew :api:test --console=plain -q)
rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint
pnpm --dir src/frontend --filter @dk-oasis/m-mdm test
python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/catch-text.ts
python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/catch-text.ts
```
Expected: 모두 PASS·오류 0·audit 0건. 골든(`RunTraceJson` HTTP 골든, `rule-set-golden.ts`)이 한 글자도 바뀌지 않았다(`/usr/bin/git status --short` 에 골든 파일이 없다).

- [ ] **Step 10: 커밋**

```bash
/usr/bin/git add src/backend/maru-mdm-engine src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RunTraceJson.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJson.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RunTraceJsonTest.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJsonTest.java src/frontend/m-mdm/src/contract/engine-contract.generated.ts src/frontend/m-mdm/tests/engine-contract.generated.test.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/catch-text.ts
/usr/bin/git commit -m "feat(mdm): 룰 세트 계약에 하위 세트 호출(SET 노드·setPath·calls·sub)을 더한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/backend/maru-mdm-engine src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RunTraceJson.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJson.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RunTraceJsonTest.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJsonTest.java src/frontend/m-mdm/src/contract/engine-contract.generated.ts src/frontend/m-mdm/tests/engine-contract.generated.test.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/catch-text.ts
```

---

### Task 2: 흐름 구조 — `SetStep`·`CallStep`·`FlowTree.setSteps/setIds/callSteps`·TS 짝·`RuleSetFlowJson.setIds`

> **갱신 메모(레인이 착수 때 반영, 2026-10-06 plan:0)** — 아래 본문은 `2e02d29d` 기준이다. 본문보다 이 메모와 Task 0 대조표가 앞선다.
> - 담당: Java 는 eng:2, TS 짝(`flow-model.ts`·`flow-edit.ts` 의 SET 처리, TS 시험)은 ui:5t, 구조 코퍼스 사례(`rule-set-corpus.json`)는 srv:5 다(레인 표의 파일 소유).
> - D-136 §13 을 따른다: "돌아오는 MERGE `splitId`=SET" 은 **지운다**(옛 형식에 SET 이 없다). SET 의 들어오는 선은 1 이상(2 이상은 모이는 자리·돌아오는 자리만), 나가는 선 1 — 지금 RULE·TASK 의 d1 규칙에 SET 을 넣는다.
> - `catchable`·`CATCHABLE` 은 RULE·TASK·SET. h2 문구 "받는 노드 {c}는 룰·빈 단계·룰 세트 노드에만 붙일 수 있다({t}는 {KIND})".
> - 끝내는 IF 갈래(B1)와 처리 갈래 안 끝냄(J-D9·J-D18)이 SET 받는 노드에도 그대로 쓰이는지 시험한다.
> - `FlowParser` 는 `50c5d09e` 로 메서드가 나뉘었다. 본문의 줄 번호·메서드 위치 대신 지금 메서드 이름으로 찾는다. `Guarded.rule` → 지금 `Guarded.step`(타입 `Step`), `CallStep` 대신 `Step` 에 `SetStep` 을 더한다(Ruling 1).

**모델:** sonnet — Java·TS 파서 두 벌에 같은 블록을 더하는 일이고, 받는 노드 처리는 CATCH 가 만든 자리를 넓히기만 한다.

**이 태스크가 정한 것:**
- SET 노드는 구조에서 RULE 과 같다(들어오는 선 1, 나가는 선 1, 갈래 안·밖 어디든 — Task 1 이 차수표를 넣었다). **파서는 빈 `setId` 를 구조 오류로 보지 않는다.** 스펙 §5 가 그것을 `CALL_MISSING`(Task 5)으로 정했다. 그래서 `SetStep.setId()` 는 null·빈 문자열일 수 있다.
- 받는 노드: CATCH 가 "RULE 노드에 붙은 받는 노드를 모아 `Guarded` 를 만드는" 갈래를 SET 노드에도 탄다. `Guarded.rule` 의 타입을 `RuleStep` 에서 `CallStep` 으로 넓힌다. 돌아오는 MERGE 의 `splitId` 가 SET 노드를 가리키는 경우도 RULE 과 같이 받는다(CATCH 가 `splitId` 대상 종류를 검사하는 곳을 RULE·SET 으로 넓힌다). `attachTo` 대상 종류 검사가 파서에 있으면 그것도 RULE·SET 으로 넓힌다(분석기 `FLOW_CATCH` 에 있으면 Task 5 가 한다).
- 받는 노드를 붙일 수 있는 종류는 CATCH 가 한 자리로 모아 두었다: Java `FlowParser.catchable(NodeKind k)` 와 TS `flow-model.ts` 의 `CATCHABLE`(둘 다 지금 RULE 하나). 이 둘에 SET 을 더한다 — `return k == NodeKind.RULE || k == NodeKind.SET;`, `export const CATCHABLE: ReadonlySet<FlowNodeKind> = new Set<FlowNodeKind>(["RULE", "SET"]);`.
- TS `CATCH_NAMES`(CATCH 계획 Task 4 가 `flow-model.ts` 에 둔 네 이름) 끝에 `"CATCH_SET"` 을 더한다. Java `ReservedNames.CATCH_NAMES`(Task 1)와 같은 다섯 이름이 되어 두 분석기의 처리 갈래 상태가 같아진다.
- TS `CATCH_KINDS`(저장 순서, Java `CatchKind` 선언 순서와 같다) 끝에 `"SUBSET_ENDED"` 를 더한다. 그러면 CATCH 의 `flow-edit.ts` `addCatch`(그 룰에서 아직 받지 않는 첫 종류를 `CATCH_KINDS` 에서 고른다)가 네 종류를 다 받은 룰에 `SUBSET_ENDED` 를 골라 CATCH 시험(`addCatch` 가 `CATCH_FULL` 로 거부)이 깨진다. 그래서 이 태스크가 대상 종류별 목록을 함께 둔다. `flow-model.ts` 의 `CATCH_KINDS` 아래에:
```ts
/** 받는 노드가 고를 수 있는 종류(하위 세트 spec §9) — SET 은 결과 없음 대신 하위 세트 예외 끝. 순서는 CATCH_KINDS 와 같다. */
export const CATCH_KINDS_FOR: Readonly<Record<"RULE" | "SET", readonly CatchKind[]>> = {
  RULE: ["NO_RESULT", "INPUT_ERROR", "EVAL_ERROR", "HIT_CONFLICT"],
  SET: ["INPUT_ERROR", "EVAL_ERROR", "HIT_CONFLICT", "SUBSET_ENDED"],
};
```
  `flow-edit.ts` `addCatch` 의 `const kind = CATCH_KINDS.find((k) => !taken.has(k));` 를 `const kind = CATCH_KINDS_FOR[r.kind as "RULE" | "SET"].find((k) => !taken.has(k));` 로 바꾼다(앞 줄 `CATCHABLE.has(r.kind)` 검사가 RULE·SET 만 통과시킨다). `setCatchKinds` 의 정렬은 그대로 `CATCH_KINDS` 순서다(CATCH R11). Java `CatchKind.parse` 가 `SUBSET_ENDED` 를 받으므로 TS 의 모르는 키 판정(`isCatchKind`)도 같아야 구조 코퍼스가 두 벌에서 같다. 대상 노드 종류와 맞지 않는 종류(SET 의 `NO_RESULT`, RULE 의 `SUBSET_ENDED`)는 구조 오류가 아니라 Task 5 의 `FLOW_CATCH` 검사(Ruling 9)가 낸다.
- 엔진 `FlowRun.seq`·`FlowKeys` 의 봉인 switch 와 화면 `set-model.ts` 걷기에는 이 태스크가 자리만 만든다(`// SEAM(T4)`·`// SEAM(T5)`). 실제 실행·검사는 Task 4·5 가 `grep -rn "SEAM(T4)"`·`grep -rn "SEAM(T5)"` 로 찾아 채운다.

**Files:**
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/SetStep.java`
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/CallStep.java`
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/Block.java:4`(허용 목록에 `SetStep`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/RuleStep.java:4`(`implements Block, CallStep`)
- Modify: CATCH 의 `flow/Guarded.java`(`rule` 타입 `CallStep`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowParser.java`(`Builder` 의 `seq`·`build`, CATCH 의 `catchable`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowTree.java`(생성자·`setSteps`·`setIds`·`callSteps`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java`(`seq` 의 switch — `SEAM(T4)`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowKeys.java`(`walk`·`sureProduced`·`allProduced` 의 switch — `SEAM(T4)`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJson.java`(새 `setIds(flow)`·`setIds(flow, parse)`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts`(타입 19-53, `build` 의 RULE 갈래 옆, `FlowTree` 걷기·질의, 새 `flowSetIds`, CATCH 의 `CATCHABLE`·`CATCH_KINDS`·`CATCH_NAMES`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts`(`pathChecks` 의 `walk` — `SEAM(T5)`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts`(CATCH 의 `addCatch` 종류 고르기 한 줄)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts`(`scopePaths` 의 RULE·TASK 줄에 SET)
- Create(Test): `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowParserSetTest.java`
- Test: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJsonTest.java`(`setIds` 사례)
- Create(Test): `src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-model-set.test.ts`

**Interfaces:**
- Consumes: Task 1 의 `NodeKind.SET`·`FlowNode.setId`·`FlowFixtures.set`.
- Produces:
  - Java `public sealed interface CallStep permits RuleStep, SetStep { String nodeId(); }`
  - Java `public record SetStep(String nodeId, @Nullable String setId) implements Block, CallStep {}`
  - Java `Block permits Seq, RuleStep, TaskStep, Split, /* CATCH 의 Guarded */ SetStep`
  - Java `FlowTree.setSteps(): List<SetStep>`(깊이 우선), `FlowTree.setIds(): List<String>`(처음 나온 순서·중복 없음·빈 ID 제외), `FlowTree.callSteps(): List<CallStep>`(RULE·SET 깊이 우선). `relation()` 은 SET 노드도 받는다.
  - Java `RuleSetFlowJson.setIds(FlowDefinition): List<String>` — 트리가 있으면 `tree.setIds()`, 구조 오류면 SET 노드의 `setId` 를 노드 배열 순서로 중복 없이(빈 ID 제외).
  - TS `export interface SetStep { type: "SET"; nodeId: string; setId: string | null }`, `export type CallStep = RuleStep | SetStep`, `Block` 합집합에 `SetStep`, `FlowTree.setSteps(): SetStep[]`, `FlowTree.setIds(): string[]`, `FlowTree.callSteps(): CallStep[]`, `export function flowSetIds(flow: RuleSetFlow, parsed?: FlowParse): string[]`.

- [ ] **Step 1: Java 실패 시험 — `FlowParserSetTest.java`**

받는 노드 도우미는 CATCH 계획 Task 1 이 `FlowFixtures` 에 둔 `catchNode(String id, String attachTo, String... kinds)` 를 쓴다.

```java
package kr.dongkuk.maru.mdm.engine.flow;

import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.set;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree.Relation;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import org.junit.jupiter.api.Test;

/** 하위 세트 spec §1 — SET 노드는 구조에서 RULE 과 같다. 빈 setId 는 구조 오류가 아니다(CALL_MISSING 은 분석기). */
class FlowParserSetTest {

    /** start → r1(R1) → s1(QD_S_A) → if1 [b1 X > 1 → s2(QD_S_B)] [그 외 → s3(QD_S_A)] → m1 → end. */
    private static FlowDefinition withSets() {
        return flow(List.of(start(), rule("r1", "R1"), set("s1", "QD_S_A"), ifNode("if1"), set("s2", "QD_S_B"), set("s3", "QD_S_A"),
                        merge("m1", "if1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "s1"), e("e3", "s1", "if1"), br("b1", "if1", "s2", 1, "X > 1"),
                        other("bo", "if1", "s3"), e("e4", "s2", "m1"), e("e5", "s3", "m1"), e("e6", "m1", "end")));
    }

    @Test
    void SET_노드는_한_줄_블록이고_setSteps_setIds_callSteps_가_깊이_우선이다() {
        FlowParse p = FlowParser.parse(withSets());
        assertEquals(List.of(), p.issues());
        FlowTree t = p.tree();
        SetStep s1 = assertInstanceOf(SetStep.class, t.root().items().get(1));
        assertEquals("QD_S_A", s1.setId());
        assertEquals(List.of("s1", "s2", "s3"), t.setSteps().stream().map(SetStep::nodeId).toList());
        assertEquals(List.of("QD_S_A", "QD_S_B"), t.setIds());
        assertEquals(List.of("r1", "s1", "s2", "s3"), t.callSteps().stream().map(CallStep::nodeId).toList());
        assertEquals(List.of("R1"), t.ruleIds());
    }

    @Test
    void SET_노드도_관계를_답한다() {
        FlowTree t = FlowParser.parse(withSets()).tree();
        assertEquals(Relation.BEFORE, t.relation("r1", "s1"));
        assertEquals(Relation.EXCLUSIVE, t.relation("s2", "s3"));
        assertEquals(Relation.AFTER, t.relation("s2", "s1"));
    }

    @Test
    void 빈_setId_는_구조_오류가_아니고_setIds_에서_빠진다() {
        FlowDefinition f = flow(List.of(start(), set("s1", null), end()), List.of(e("e1", "start", "s1"), e("e2", "s1", "end")));
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        assertNull(((SetStep) p.tree().root().items().get(0)).setId());
        assertEquals(List.of(), p.tree().setIds());
    }

    @Test
    void SET_노드에_들어오는_선이_둘이면_RULE_과_같은_문구의_구조_오류() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "R1"), set("s1", "QD_S_A"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "s1"), e("e3", "start", "s1"), e("e4", "s1", "end")));
        List<String> msgs = FlowParser.parse(f).issues().stream().map(FlowIssue::message).toList();
        assertEquals(true, msgs.contains("s1의 들어오는 선이 2개다. 1개여야 한다"), msgs.toString());
    }

    @Test
    void SET_노드에_받는_노드가_붙으면_Guarded_의_rule_이_SetStep_이다() {
        // start → s1(QD_S_A) → m1 → end, c1(attachTo s1, INPUT_ERROR) → r9(R9) → m1(splitId s1)
        FlowDefinition f = flow(List.of(start(), set("s1", "QD_S_A"), catchNode("c1", "s1", "INPUT_ERROR"), rule("r9", "R9"),
                        merge("m1", "s1"), end()),
                List.of(e("e1", "start", "s1"), e("e2", "s1", "m1"), e("e3", "c1", "r9"), e("e4", "r9", "m1"), e("e5", "m1", "end")));
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        Guarded g = assertInstanceOf(Guarded.class, p.tree().root().items().get(0));
        assertInstanceOf(SetStep.class, g.rule());
        assertEquals(List.of("s1", "r9"), p.tree().callSteps().stream().map(CallStep::nodeId).toList());
    }
}
```

static import 에 `import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.catchNode;` 를 더한다.

- [ ] **Step 2: 실패 확인**

Run(공통 환경 뒤): `(cd src/backend/maru-mdm-engine && ../gradlew test --tests '*FlowParserSetTest' --console=plain)`
Expected: 컴파일 오류 — `SetStep`·`CallStep`·`setSteps()`·`setIds()`·`callSteps()` 가 없다.

- [ ] **Step 3: Java 구현**

`CallStep.java`:
```java
package kr.dongkuk.maru.mdm.engine.flow;

/** 실행하면 결과를 만드는 노드 — RULE 과 SET(하위 세트 spec §1). 받는 노드(CATCH)를 붙일 수 있는 노드이기도 하다. */
public sealed interface CallStep permits RuleStep, SetStep {
    String nodeId();
}
```

`SetStep.java`:
```java
package kr.dongkuk.maru.mdm.engine.flow;

import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 하위 세트를 부르는 SET 노드 하나(하위 세트 spec §1). {@code setId} 가 비어 있어도 구조 오류가 아니다 — 분석기 CALL_MISSING 과 엔진 준비 단계
 * SET_NOT_FOUND 가 막는다. m-mdm {@code flow-model.ts} 의 {@code SetStep} 짝.
 */
public record SetStep(String nodeId, @Nullable String setId) implements Block, CallStep {}
```

`RuleStep.java`: `public record RuleStep(String nodeId, String ruleId) implements Block, CallStep {}`.

`Block.java`: `permits` 목록 끝에 `, SetStep` 을 더한다. 주석 `/** 블록 트리 한 칸 — 순차·룰·빈 단계·분기·(CATCH 의 받는 노드 블록)·하위 세트 호출. */`.

CATCH 의 `Guarded.java`: `rule` 칸 타입을 `RuleStep` → `CallStep` 으로 바꾼다. `g.rule()` 을 `RuleStep` 으로 쓰던 곳은 컴파일 오류로 드러난다. CATCH 계획 기준 엔진에서는 `FlowRun.guarded` 의 `RuleStep r = g.rule();`, `FlowKeys` 의 `walk` `case Guarded` 안 `ruleKeys(g.rule(), …)`, `guardSure`·`guardAll` 의 `produced(g.rule())` 네 곳이다. 각 자리 앞에 `if (g.rule() instanceof SetStep) { throw new IllegalStateException("SET 받는 노드는 하위 세트 계획 Task 4 가 넣는다"); } // SEAM(T4)` 를 두고 `(RuleStep) g.rule()` 로 캐스트한다. 서버 분석기(`RuleSetAnalyzer`)·TS(`flow-model.ts`·`set-model.ts`·`trace-view.ts`)에서 `Guarded.rule` 을 룰로 쓰는 곳도 같은 방식으로 `// SEAM(T5)`(서버·`set-model.ts`)·`// SEAM(T9)`(`trace-view.ts` 기록 풀이, 없으면 생략)로 막는다. Task 4·5·9 가 `grep -rn "SEAM(T4)\|SEAM(T5)\|SEAM(T9)"` 로 찾아 바꾼다.

`FlowParser.java` `Builder`:
- 필드 추가: `final List<SetStep> sets = new ArrayList<>();`, `final List<CallStep> calls = new ArrayList<>();`
- `seq(...)` 의 `if (n.kind() == NodeKind.TASK) {` 앞에 SET 갈래를 둔다. CATCH 가 받는 노드를 찾아 `Guarded` 를 만드는 코드는 `catchable(n.kind())` 로 조건을 건다(지금 `n.kind() == NodeKind.RULE` 으로 직접 쓴 곳이 있으면 `catchable` 로 바꾼다). 그 안에서 만들던 `RuleStep` 을 아래 `step(n, cur)` 로 바꾼다. `catchable` 은 `return k == NodeKind.RULE || k == NodeKind.SET;` 이다.

```java
                if (n.kind() == NodeKind.SET) {
                    // 받는 노드가 붙은 SET 은 위 RULE·SET 공통의 Guarded 갈래가 먼저 처리한다(CATCH 와 같은 규칙).
                    items.add(step(n, cur));
                    cur = next(cur);
                    continue;
                }
```
```java
        /** RULE·SET 노드의 블록 — steps·sets·calls 에 깊이 우선으로 적는다. */
        CallStep step(FlowNode n, String id) {
            if (n.kind() == NodeKind.SET) {
                SetStep s = new SetStep(id, n.setId());
                sets.add(s);
                calls.add(s);
                return s;
            }
            RuleStep r = new RuleStep(id, n.ruleId());
            steps.add(r);
            calls.add(r);
            return r;
        }
```

  RULE 갈래에서 `RuleStep s = new RuleStep(cur, n.ruleId()); items.add(s); steps.add(s);` 로 쓰던 곳도 `items.add(step(n, cur));` 로 바꾼다.
- `build()` 의 `return new FlowTree(...)` 에 `sets, calls` 를 더한다.
- CATCH 가 "돌아오는 MERGE 의 `splitId` 는 RULE 노드" 를 검사하는 조건(`s.kind() != NodeKind.IF && s.kind() != NodeKind.PARALLEL && s.kind() != NodeKind.RULE` 꼴)에 `&& s.kind() != NodeKind.SET` 을 더한다. `attachTo` 대상 종류 검사가 파서에 있으면 같은 방식으로 SET 을 더한다.

`FlowTree.java`:
```java
    private final List<SetStep> setSteps;
    private final List<CallStep> callSteps;
```
생성자 인자 끝에 `List<SetStep> setSteps, List<CallStep> callSteps` 를 더하고 `this.setSteps = List.copyOf(setSteps); this.callSteps = List.copyOf(callSteps);`. 질의를 `ruleIds()` 뒤에 더한다.

```java
    /** 모든 SET 노드, 깊이 우선(갈래 실행 순서). */
    public List<SetStep> setSteps() {
        return setSteps;
    }

    /** setSteps 의 setId 를 처음 나온 순서로 중복 없이(빈 ID 는 뺀다) — CALL_SET_IDS 로 저장할 목록(하위 세트 spec §1.1). */
    public List<String> setIds() {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (SetStep s : setSteps) {
            if (s.setId() != null && !s.setId().isBlank()) {
                ids.add(s.setId());
            }
        }
        return List.copyOf(ids);
    }

    /** RULE·SET 노드를 깊이 우선 한 목록으로 — 분석기가 이름을 만드는 노드를 찾을 때 쓴다. */
    public List<CallStep> callSteps() {
        return callSteps;
    }
```
`relation` 의 javadoc `두 노드(RULE·TASK·IF·PARALLEL)` 를 `두 노드(RULE·SET·TASK·IF·PARALLEL)` 로 고친다.

`FlowRun.java` `seq(...)` 의 switch 에 `case TaskStep t -> …` 다음 줄로:
```java
                case SetStep s -> throw new IllegalStateException("SET 실행은 하위 세트 계획 Task 4 가 넣는다: " + s.nodeId()); // SEAM(T4)
```

`FlowKeys.java` 의 세 switch(`walk`·`sureProduced`·`allProduced`)에 `case TaskStep t -> {…}` 다음으로:
```java
                case SetStep s -> {
                    // SEAM(T4) — 하위 세트 입력·출력은 Task 4 가 넣는다.
                }
```
(필요한 import `kr.dongkuk.maru.mdm.engine.flow.SetStep` 을 더한다.)

`RuleSetFlowJson.java` — `ruleIds(flow, p)` 아래:
```java
    /** 하위 세트 spec §1.1 — CALL_SET_IDS. 트리가 있으면 {@code tree.setIds()}, 없으면 SET 노드의 setId 를 노드 배열 순서로 중복 없이(빈 ID 는 뺀다). */
    public static List<String> setIds(FlowDefinition flow) {
        return setIds(flow, FlowParser.parse(flow));
    }

    static List<String> setIds(FlowDefinition flow, FlowParse p) {
        if (p.tree() != null) {
            return p.tree().setIds();
        }
        Set<String> seenNodes = new HashSet<>();
        Set<String> out = new LinkedHashSet<>();
        for (FlowNode n : flow.nodes()) {
            if (seenNodes.add(n.id()) && n.kind() == NodeKind.SET && n.setId() != null && !n.setId().isBlank()) {
                out.add(n.setId());
            }
        }
        return List.copyOf(out);
    }
```

`RuleSetFlowJsonTest.java` 끝에:
```java
    @Test
    void setIds_는_트리가_있으면_깊이_우선_중복_없이_구조_오류면_노드_순서() {
        String ok = """
            {"version":1,"nodes":[{"id":"start","kind":"START"},{"id":"s1","kind":"SET","setId":"B"},{"id":"s2","kind":"SET","setId":"A"},
             {"id":"s3","kind":"SET","setId":"B"},{"id":"end","kind":"END"}],
             "edges":[{"id":"e1","from":"start","to":"s1"},{"id":"e2","from":"s1","to":"s2"},{"id":"e3","from":"s2","to":"s3"},{"id":"e4","from":"s3","to":"end"}]}""";
        assertEquals(List.of("B", "A"), RuleSetFlowJson.setIds(RuleSetFlowJson.parse(ok)));
        String broken = """
            {"version":1,"nodes":[{"id":"s2","kind":"SET","setId":"A"},{"id":"s1","kind":"SET","setId":"B"},{"id":"s9","kind":"SET","setId":" "}],"edges":[]}""";
        assertEquals(List.of("A", "B"), RuleSetFlowJson.setIds(RuleSetFlowJson.parse(broken)));
    }
```

- [ ] **Step 4: Java 통과 확인**

Run: `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)` 그리고 `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)`
Expected: PASS(기존 `FlowParserTest`·`FlowTreeTest`·코퍼스 포함 — RULE 만 있는 흐름의 트리·문구는 바뀌지 않는다).

- [ ] **Step 5: TS 실패 시험 — `tests/dme/ruleSetEdit/flow-model-set.test.ts`**

받는 노드 노드 모양은 CATCH 계획의 TS 시험이 쓰는 모양(`attachTo`·`catches`)을 따른다.

```ts
// 하위 세트 spec §1 — SET 노드 구조(엔진 FlowParserSetTest 의 TS 짝).
import { describe, expect, it } from "vitest";

import type { FlowEdge, FlowNode, FlowNodeKind, RuleSetFlow } from "../../../src/contract/engine-contract.generated";
import { flowSetIds, parseFlow, type SetStep } from "../../../pages/dme/ruleSetEdit/flow-model";

const node = (id: string, kind: FlowNodeKind, over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: null, splitId: null, label: null, ...over });
const edge = (id: string, from: string, to: string, over: Partial<FlowEdge> = {}): FlowEdge => ({
  id, from, to, order: null, cond: null, otherwise: false, label: null, ...over,
});
const flow = (nodes: FlowNode[], edges: FlowEdge[]): RuleSetFlow => ({ version: 1, nodes, edges });

/** start → r1(R1) → s1(QD_S_A) → if1 [b1 X > 1 → s2(QD_S_B)] [그 외 → s3(QD_S_A)] → m1 → end. */
function withSets(): RuleSetFlow {
  return flow(
    [
      node("start", "START"),
      node("r1", "RULE", { ruleId: "R1" }),
      node("s1", "SET", { setId: "QD_S_A" }),
      node("if1", "IF"),
      node("s2", "SET", { setId: "QD_S_B" }),
      node("s3", "SET", { setId: "QD_S_A" }),
      node("m1", "MERGE", { splitId: "if1" }),
      node("end", "END"),
    ],
    [
      edge("e1", "start", "r1"),
      edge("e2", "r1", "s1"),
      edge("e3", "s1", "if1"),
      edge("b1", "if1", "s2", { order: 1, cond: "X > 1" }),
      edge("bo", "if1", "s3", { otherwise: true }),
      edge("e4", "s2", "m1"),
      edge("e5", "s3", "m1"),
      edge("e6", "m1", "end"),
    ],
  );
}

describe("flow-model — SET 노드", () => {
  it("SET 은 한 줄 블록이고 setSteps·setIds·callSteps 가 깊이 우선이다", () => {
    const p = parseFlow(withSets());
    expect(p.issues).toEqual([]);
    const t = p.tree!;
    expect(t.root.items[1]).toEqual({ type: "SET", nodeId: "s1", setId: "QD_S_A" } satisfies SetStep);
    expect(t.setSteps().map((s) => s.nodeId)).toEqual(["s1", "s2", "s3"]);
    expect(t.setIds()).toEqual(["QD_S_A", "QD_S_B"]);
    expect(t.callSteps().map((s) => s.nodeId)).toEqual(["r1", "s1", "s2", "s3"]);
    expect(t.ruleIds()).toEqual(["R1"]);
  });

  it("SET 노드도 관계를 답한다", () => {
    const t = parseFlow(withSets()).tree!;
    expect(t.relation("r1", "s1")).toBe("BEFORE");
    expect(t.relation("s2", "s3")).toBe("EXCLUSIVE");
  });

  it("빈 setId 는 구조 오류가 아니고 setIds 에서 빠진다", () => {
    const f = flow([node("start", "START"), node("s1", "SET"), node("end", "END")], [edge("e1", "start", "s1"), edge("e2", "s1", "end")]);
    const p = parseFlow(f);
    expect(p.issues).toEqual([]);
    expect(p.tree!.setIds()).toEqual([]);
  });

  it("flowSetIds — 구조 오류면 노드 배열 순서로 중복 없이", () => {
    const broken = flow([node("s2", "SET", { setId: "A" }), node("s1", "SET", { setId: "B" }), node("s9", "SET", { setId: "A" })], []);
    expect(flowSetIds(broken)).toEqual(["A", "B"]);
  });

  it("SET 에 받는 노드가 붙으면 Guarded 의 rule 이 SET 블록이다", () => {
    const f = flow(
      [
        node("start", "START"),
        node("s1", "SET", { setId: "QD_S_A" }),
        node("c1", "CATCH", { attachTo: "s1", catches: ["INPUT_ERROR"] } as Partial<FlowNode>),
        node("r9", "RULE", { ruleId: "R9" }),
        node("m1", "MERGE", { splitId: "s1" }),
        node("end", "END"),
      ],
      [edge("e1", "start", "s1"), edge("e2", "s1", "m1"), edge("e3", "c1", "r9"), edge("e4", "r9", "m1"), edge("e5", "m1", "end")],
    );
    const p = parseFlow(f);
    expect(p.issues).toEqual([]);
    const g = p.tree!.root.items[0];
    expect(g.type).toBe("GUARDED");
    expect((g as { rule: { type: string } }).rule.type).toBe("SET");
    expect(p.tree!.callSteps().map((s) => s.nodeId)).toEqual(["s1", "r9"]);
  });

  it("받는 노드는 RULE·SET 에 붙고 SUBSET_ENDED 는 아는 종류다", () => {
    expect([...CATCHABLE].sort()).toEqual(["RULE", "SET"]);
    expect(CATCH_KINDS).toEqual(["NO_RESULT", "INPUT_ERROR", "EVAL_ERROR", "HIT_CONFLICT", "SUBSET_ENDED"]);
    expect(CATCH_NAMES).toEqual(["CATCH_KIND", "CATCH_RULE", "CATCH_CODE", "CATCH_MSG", "CATCH_SET"]);
    expect(CATCH_KINDS_FOR.SET).not.toContain("NO_RESULT");
    expect(CATCH_KINDS_FOR.RULE).not.toContain("SUBSET_ENDED");
  });
});
```

import 줄에 `CATCHABLE`·`CATCH_KINDS`·`CATCH_KINDS_FOR`·`CATCH_NAMES` 를 더한다(`import { CATCH_KINDS, CATCH_KINDS_FOR, CATCH_NAMES, CATCHABLE, flowSetIds, parseFlow, type SetStep } from …`). `"GUARDED"` 는 CATCH 계획 Task 2 가 TS `Guarded` 블록에 준 `type` 값이다.

- [ ] **Step 6: 실패 확인**

Run: `pnpm --dir src/frontend --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/flow-model-set.test.ts`
Expected: FAIL — `flowSetIds` 가 없고, SET 이 분기로 읽혀 `build` 가 던진다.

- [ ] **Step 7: TS 구현 — `flow-model.ts`**

`TaskStep` 인터페이스 뒤:
```ts
/** 하위 세트를 부르는 SET 노드 하나(하위 세트 spec §1). 엔진 `flow.SetStep` 의 짝. setId 가 비어도 구조 오류가 아니다(CALL_MISSING 은 set-model). */
export interface SetStep {
  type: "SET";
  nodeId: string;
  setId: string | null;
}

/** 실행하면 결과를 만드는 노드 — RULE·SET. 받는 노드를 붙일 수 있다. 엔진 `flow.CallStep` 의 짝. */
export type CallStep = RuleStep | SetStep;
```
`Block` 합집합 끝에 `| SetStep` 을 더한다. CATCH 의 `Guarded.rule` 타입을 `RuleStep` → `CallStep` 으로 넓힌다.

`build(...)` 의 `seq` 안 `if (node.kind === "TASK") {` 앞에 SET 갈래를 둔다(CATCH 의 RULE 받는 노드 갈래 조건은 `node.kind === "RULE" || node.kind === "SET"` 으로 넓히고 안에서 만드는 블록을 `stepOf(node, cur)` 로 바꾼다).
```ts
      if (node.kind === "SET") {
        items.push(stepOf(node, cur));
        cur = next(cur);
        continue;
      }
```
`build` 안 `next` 정의 아래:
```ts
  /** RULE·SET 노드의 블록. */
  const stepOf = (node: FlowNode, id: string): CallStep =>
    node.kind === "SET" ? { type: "SET", nodeId: id, setId: orNull(node.setId) } : { type: "RULE", nodeId: id, ruleId: node.ruleId as string };
```
RULE 갈래의 `items.push({ type: "RULE", nodeId: cur, ruleId: node.ruleId as string });` 도 `items.push(stepOf(node, cur));` 로 바꾼다. CATCH 가 MERGE `splitId` 대상 종류를 검사하는 조건에 `"SET"` 을 더한다.

`FlowTree`:
```ts
  private readonly sets: SetStep[] = [];
  private readonly calls: CallStep[] = [];
```
걷기에서 RULE 갈래에 `this.calls.push(b);` 를 더하고, RULE 갈래 뒤에 SET 갈래를 둔다(CATCH 의 Guarded 걷기가 `b.rule` 을 위치에 적는 곳에서도 `rule.type` 에 따라 같은 두 목록에 넣는다).
```ts
        } else if (b.type === "SET") {
          this.positions.set(b.nodeId, { chain, order: counter++ });
          this.sets.push(b);
          this.calls.push(b);
```
질의(`ruleIds()` 뒤):
```ts
  /** 모든 SET 노드, 깊이 우선. */
  setSteps(): SetStep[] {
    return [...this.sets];
  }

  /** setSteps 의 setId 를 처음 나온 순서로 중복 없이(빈 ID 제외) = CALL_SET_IDS. */
  setIds(): string[] {
    return [...new Set(this.sets.map((s) => s.setId).filter((id): id is string => !isBlankJava(id)))];
  }

  /** RULE·SET 노드를 깊이 우선 한 목록으로. */
  callSteps(): CallStep[] {
    return [...this.calls];
  }
```
`Position.order` 주석을 `깊이 우선 순번(RULE·SET·TASK·분기 노드)` 로 고친다. 파일 끝에:
```ts
/** 흐름의 하위 세트 목록(CALL_SET_IDS) — 트리가 있으면 `tree.setIds()`, 구조 오류면 SET 노드의 setId 를 노드 배열 순서로 중복 없이(빈 ID 제외). */
export function flowSetIds(flow: RuleSetFlow, parsed: FlowParse = parseFlow(flow)): string[] {
  if (parsed.tree) return parsed.tree.setIds();
  const out: string[] = [];
  const seenNodes = new Set<string>();
  for (const n of flow.nodes ?? []) {
    if (seenNodes.has(n.id)) continue;
    seenNodes.add(n.id);
    if (n.kind === "SET" && !isBlankJava(n.setId) && !out.includes(n.setId as string)) out.push(n.setId as string);
  }
  return out;
}
```

`set-model.ts` `pathChecks` 의 `walk` — `else if (b.type === "TASK") continue;` 다음 줄:
```ts
      else if (b.type === "SET") continue; // SEAM(T5) — 하위 세트 겉모양 검사는 Task 5 가 넣는다
```
`trace-view.ts` `scopePaths` — `if (b.type === "RULE" || b.type === "TASK")` 를 `if (b.type === "RULE" || b.type === "TASK" || b.type === "SET")` 로.

- [ ] **Step 8: TS 통과·전체 확인**

Run(차례로):
```bash
pnpm --dir src/frontend --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/flow-model-set.test.ts
pnpm --dir src/frontend --filter @dk-oasis/m-mdm test
rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint
python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts
python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts
```
Expected: m-mdm 시험 전체 PASS(CATCH 의 `catch-edit.test.ts` 「네 종류를 다 받으면 CATCH_FULL」 포함)·tsc 오류 0·audit 0건. `rule-set-corpus.test.ts` 와 퍼즈 차분이 그대로 초록이다.

- [ ] **Step 9: 커밋**

```bash
/usr/bin/git add src/backend/maru-mdm-engine src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJson.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJsonTest.java src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-model-set.test.ts
/usr/bin/git commit -m "feat(mdm): 룰 세트 흐름 구조에 SET 노드 블록(SetStep·CallStep)을 더한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/backend/maru-mdm-engine src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJson.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJsonTest.java src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-model-set.test.ts
```

---

### Task 3: DB — `TB_MDM_RULE_SET_VER.CALL_SET_IDS` 칸(V23)·엔티티·DRAFT 쓰기·새 버전 복사·샘플·마이그레이션 시험

**담당:** srv:3. **모델:** sonnet — 정해진 순서의 SQL 과 기대값 표를 맞추는 일이다. (2026-10-06 plan:0 이 현재 dev 기준으로 다시 썼다.)

**이 태스크가 정한 것:**
- `CALL_SET_IDS TEXT NOT NULL DEFAULT '[]' CONSTRAINT CK_TB_MDM_RULE_SET_VER_CALL_SET_IDS_JSON CHECK (json_valid(CALL_SET_IDS))` 를 VER 표의 `FLOW_JSON` 바로 뒤에 둔다(칼럼 순서 불변식). 지금 SET 노드가 있는 버전은 없어 이관 값은 모두 `'[]'` 다.
- **VER 표만** V22 방식으로 다시 만든다: `_BAK` 복사(제약 없음) → 옛 표 DROP → 최종 이름으로 V18 정의 + 새 칸 생성 → 칼럼명을 모두 적어 복사 → `_BAK` DROP. RENAME·PRAGMA 를 쓰지 않는다. `TB_MDM_RULE_SET_VER` 를 가리키는 FK 가 없고(V18·V20~V22) V18 은 이 표에 인덱스·트리거를 두지 않았으므로 다시 만들 것이 없다. 부모 `TB_MDM_RULE_SET`·케이스 `TB_MDM_RULE_SET_TEST_CASE` 는 건드리지 않는다(옛 편차 4 는 없어졌다).
- `RuleSetWrites.updateDraft` 가 `callSetIdsJson` 인자를 받는다. 이 태스크에서는 호출자(`RuleSetEditService.save`)가 늘 `"[]"` 를 넘긴다(`// SEAM(T6)` — Task 6 이 흐름에서 계산한 목록으로 바꾼다).
- 엔티티 `MdmRuleSetVer` 에 `callSetIds` 필드(기본값 `"[]"`)를 둔다. 등록(`RuleSetMngService.reg`)의 1.000 DRAFT 는 생성자를 쓰므로 이 기본값으로 NOT NULL 을 지킨다. 새 버전 만들기(`RuleSetVersionService`, 원본 버전의 `ruleIds`·`flowJson` 복사 자리)는 `callSetIds` 도 복사한다.
- 샘플 SQL 에 SET 노드 시연 세트 `SHIP_PLAN`(PKG_WGT 와 PACK_TYPE_SET 를 차례로 부름)을 더한다(로컬 브라우저 확인용). 지금 샘플의 세트 적재 방식(`TMP_RULE_SET` 임시 표 → 부모 행 + 1.000 MAJOR RELEASED 버전 행)을 따른다.
- 번호 V23 은 머지 직전에 dev 의 마지막 번호를 다시 확인한다. 겹치면 다음 빈 번호로 옮기고 파일 이름·시험의 번호를 함께 고친다(Global Constraints).

**Files:**
- Create: `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V23__rule_set_ver_call_set_ids.sql`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmRuleSetVer.java`(`flowJson` 필드 뒤 `callSetIds`, getter·setter)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetWrites.java`(`updateDraft`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetEditService.java`(`save` 의 `writes.updateDraft` 인자 — `SEAM(T6)`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetVersionService.java`(새 버전 복사)
- Modify: `src/backend/mdm/sample/mdm-local-sample.sql`(06 룰 세트 `TMP_RULE_SET` 블록 — 임시 표에 `CALL_SET_IDS` 칸, `SHIP_PLAN` 행)
- Modify(Test): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmBusinessRuleExpectations.java`(`BUSINESS_COLUMNS`·`JSON_COLUMNS`·`CONSTRAINTS` 의 `TB_MDM_RULE_SET_VER`)
- Modify(Test): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmBusinessRuleMigrationTest.java`(JSON CHECK 시험의 `inserts`·칼럼 수·`jsonParams`, 기본값 시험)
- Modify(Test): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmSharedContractMigrationTest.java`(적용 버전 목록에 `"23"`, 메서드 이름·주석)
- Create(Test): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmRuleSetVerCallSetIdsMigrationTest.java`
- Modify(Test): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/DmeTestSupport.java`(새 `ruleSetCalls`)
- Modify(Test): 새 버전 복사 시험이 있는 클래스(`grep -rln "copy\|newVersion" src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit` 로 찾는다)

**Interfaces:**
- Consumes: 없음(첫 물결).
- Produces:
  - DB `TB_MDM_RULE_SET_VER.CALL_SET_IDS`(JSON 배열 문자열, 기본 `'[]'`).
  - Java `MdmRuleSetVer.getCallSetIds(): String`, `setCallSetIds(String)`.
  - Java `RuleSetWrites.updateDraft(String setId, BigDecimal ver, String ruleIdsJson, String flowJson, String callSetIdsJson): int`
  - 시험 도우미 `DmeTestSupport.ruleSetCalls(JdbcTemplate jdbc, String setId, String ver, String callSetIdsJson)`(+ `ver` 를 뺀 1.000 판).

- [ ] **Step 1: 마이그레이션 실패 시험**

`MdmBusinessRuleExpectations.java`:
- `JSON_COLUMNS` 머리 주석의 칼럼 설명에 `+ 하위 세트 CALL_SET_IDS` 를 더한다.
- `BUSINESS_COLUMNS.put("TB_MDM_RULE_SET_VER", …)` 의 `"FLOW_JSON"` 뒤에 `"CALL_SET_IDS"`.
- `JSON_COLUMNS.put("TB_MDM_RULE_SET_VER", List.of("RULE_IDS", "FLOW_JSON", "CALL_SET_IDS"));`
- `CONSTRAINTS.put("TB_MDM_RULE_SET_VER", …)` 끝에 `"CK_TB_MDM_RULE_SET_VER_CALL_SET_IDS_JSON"`(목록 순서를 보는지 시험 코드로 확인하고, 보면 DDL 등장 순서에 맞춘다).

`MdmBusinessRuleMigrationTest.java`:
- JSON CHECK 시험(`JSON_CHECK_는_10칼럼에서_…`)의 이름을 `JSON_CHECK_는_11칼럼에서_부정형을_거부하고_NULL_허용_칼럼만_NULL_을_통과시킨다` 로, `assertEquals(10, checked, …)` 를 `assertEquals(11, checked, "JSON 칼럼은 정확히 11개다(F5 + FLOW_JSON + CALL_SET_IDS + 세트 케이스 2개)")` 로 바꾼다. `inserts.put("FLOW_JSON", …)` 뒤에:
```java
                inserts.put("CALL_SET_IDS", "INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, RULE_IDS, CALL_SET_IDS) VALUES (?, ?, '[]', ?)");
```
- `jsonParams` 의 `case "RULE_IDS", "FLOW_JSON"` 줄을 `case "RULE_IDS", "FLOW_JSON", "CALL_SET_IDS" -> new Object[] {ruleId, n, json};` 로 넓힌다(소유자 갈래는 이미 VER 표면 세트 ID 를 고른다). `CALL_SET_IDS` 는 NOT NULL 이므로 `NULLABLE_JSON_COLUMNS` 에 넣지 않는다.
- 기본값 시험 `칼럼을_생략한_INSERT_는_기본값을_쓴다` 의 VER 행 확인 SELECT 에 `|| '|' || CALL_SET_IDS` 를 더하고 기대 문자열 끝에 `|[]` 를 더한다.

`MdmSharedContractMigrationTest.java`: 적용 버전 집합에 `"23"` 을 더하고, 메서드 이름 끝 `…_V22_를_적용했다` 를 `…_V22_V23_를_적용했다` 로, 주석에 `하위 세트 호출 — V23(세트 버전 행 CALL_SET_IDS) 추가 반영.` 한 줄을 더한다.

`MdmRuleSetVerCallSetIdsMigrationTest.java` 를 만든다(Spring 없이 Flyway API — `MdmLayoutItemPinMigrationTest` 와 같은 방식).

```java
package com.dongkuk.dmes.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * 하위 세트 호출(D-135) — V23: 세트 버전 표 TB_MDM_RULE_SET_VER 에 CALL_SET_IDS 칸을 FLOW_JSON 뒤에 더한다(표 재생성, V22 방식).
 * 버전 행·케이스 행이 든 DB 에 foreign_keys=ON 으로 적용해 행·칼럼 순서·제약이 남는지 본다.
 */
class MdmRuleSetVerCallSetIdsMigrationTest {

    @TempDir
    Path dir;

    private Flyway flyway(String url, String target) {
        return Flyway.configure().dataSource(url, null, null)
                .locations("classpath:db/migration/mdm/sqlite").target(target).load();
    }

    @Test
    void existingVersionRowsKeepTheirValuesAndGetAnEmptyCallList() throws Exception {
        String url = "jdbc:sqlite:" + dir.resolve("m.db") + "?foreign_keys=true";
        flyway(url, "22").migrate();
        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            s.execute("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME) VALUES ('S_A', '세트 A')");
            s.execute("INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, VER_KIND, STATUS, APPLY_FROM, APPLY_TO, RULE_IDS, FLOW_JSON, ROW_VERSION) "
                    + "VALUES ('S_A', 1, 'MAJOR', 'RELEASED', '2000-01-01 00:00:00', '9999-12-31 00:00:00', '[\"R1\"]', NULL, 4)");
            s.execute("INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, RULE_IDS) VALUES ('S_A', 2, '[\"R1\",\"R2\"]')");
            s.execute("INSERT INTO TB_MDM_RULE_SET_TEST_CASE (MARU_RULE_SET_ID, CASE_ID, CASE_NAME, INPUT_JSON) VALUES ('S_A', 1, '케이스', '{}')");
        }

        flyway(url, "23").migrate();

        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            List<String> rows = new ArrayList<>();
            try (ResultSet rs = s.executeQuery("SELECT VER, STATUS, RULE_IDS, CALL_SET_IDS, ROW_VERSION FROM TB_MDM_RULE_SET_VER "
                    + "WHERE MARU_RULE_SET_ID = 'S_A' ORDER BY VER")) {
                while (rs.next()) {
                    rows.add(rs.getInt(1) + "|" + rs.getString(2) + "|" + rs.getString(3) + "|" + rs.getString(4) + "|" + rs.getLong(5));
                }
            }
            assertThat(rows).containsExactly("1|RELEASED|[\"R1\"]|[]|4", "2|DRAFT|[\"R1\",\"R2\"]|[]|0");
            assertThat(columns(s, "TB_MDM_RULE_SET_VER")).containsExactly(
                    "MARU_RULE_SET_ID", "VER", "VER_KIND", "STATUS", "BASE_VER", "OWNER_ID", "APPLY_FROM", "APPLY_TO", "RULE_IDS", "FLOW_JSON",
                    "CALL_SET_IDS", "REQUESTED_BY", "REQUESTED_AT", "RELEASED_AT", "ROW_VERSION",
                    "C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID", "AUD_VER");
            assertThrows(SQLException.class, () -> s.execute(
                    "INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, RULE_IDS, CALL_SET_IDS) VALUES ('S_A', 3, '[]', '{bad')"),
                    "CALL_SET_IDS JSON CHECK");
            assertThrows(SQLException.class, () -> s.execute(
                    "INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, RULE_IDS) VALUES ('NOPE', 1, '[]')"),
                    "부모 세트 FK 가 다시 걸려 있어야 한다");
            try (ResultSet rs = s.executeQuery("SELECT COUNT(*) FROM TB_MDM_RULE_SET_TEST_CASE WHERE MARU_RULE_SET_ID = 'S_A'")) {
                rs.next();
                assertThat(rs.getInt(1)).isEqualTo(1);
            }
            try (ResultSet rs = s.executeQuery("SELECT COUNT(*) FROM sqlite_master WHERE name LIKE '%_BAK'")) {
                rs.next();
                assertThat(rs.getInt(1)).as("임시 표가 남았다").isZero();
            }
        }
    }

    private static List<String> columns(Statement s, String table) throws SQLException {
        List<String> out = new ArrayList<>();
        try (ResultSet rs = s.executeQuery("PRAGMA table_info(" + table + ")")) {
            while (rs.next()) {
                out.add(rs.getString("name"));
            }
        }
        return out;
    }
}
```
(시험 안의 `PRAGMA table_info` 는 확인용이다. 마이그레이션 SQL 은 PRAGMA 를 쓰지 않는다.)

- [ ] **Step 2: 실패 확인**

Run(공통 환경 뒤): `(cd src/backend/mdm && ../gradlew :api:test --tests '*MdmBusinessRuleMigrationTest' --tests '*MdmRuleSetVerCallSetIdsMigrationTest' --tests '*MdmSharedContractMigrationTest' --console=plain)`
Expected: FAIL — V23 이 없어 `CALL_SET_IDS` 칼럼과 `version=23` 행이 없다.

- [ ] **Step 3: V23 작성**

먼저 `ls src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/` 로 마지막 번호가 V22 인지 본다. `V18__rule_set_version.sql` 의 `CREATE TABLE TB_MDM_RULE_SET_VER` 정의를 글자 그대로 옮기고 `FLOW_JSON` 줄 뒤에 새 칸 한 줄만 더한다.

`V23__rule_set_ver_call_set_ids.sql`:
```sql
-- 2026-10-06 — 룰 세트 버전 행에 부르는 하위 세트 목록 CALL_SET_IDS 를 더한다(D-135, 하위 세트 호출).
--
-- 왜: 룰 세트 흐름에 다른 세트를 부르는 SET 노드가 생긴다(spec docs/superpowers/specs/2026-10-01-rule-set-flow-subset-call-design.md §1.1).
--   "이 세트를 부르는 세트" 를 모든 FLOW_JSON 을 해석하지 않고 찾으려고, 서버가 DRAFT 저장 때 흐름의 SET 노드를 깊이 우선으로 펼친
--   중복 없는 세트 ID 목록(JSON 배열)을 채운다. 흐름이 버전마다 다르므로 목록도 버전 행에 둔다. RULE_IDS 는 지금처럼 이 버전 흐름의
--   RULE 노드만 담는다. 지금 SET 노드가 있는 버전은 없어 기존 행은 '[]' 다.
-- 칼럼: CALL_SET_IDS TEXT NOT NULL DEFAULT '[]', json_valid CHECK. FLOW_JSON 바로 뒤 — 칼럼 순서 불변식(업무 칼럼 + 감사 칼럼,
--   MdmBusinessRuleExpectations).
-- 표 재생성: ADD COLUMN 대신 다시 만든다(V22 와 같은 판단). TB_MDM_RULE_SET_VER 를 가리키는 FK 는 없고(V18·V20~V22 확인),
--   V18 은 이 표에 인덱스·트리거를 두지 않았다. 그래서 V22 처럼 _BAK 복사 → DROP → 최종 이름으로 생성 → 칼럼명을 모두 적어 복사 →
--   _BAK DROP 순서로 한다. RENAME 과 PRAGMA 를 쓰지 않는다(V13 주석). 부모 TB_MDM_RULE_SET 와 케이스 표는 건드리지 않는다.
--
-- 되돌리려면: 새 마이그레이션에서 같은 _BAK 방식으로 CALL_SET_IDS 를 뺀 V18 정의의 표를 다시 만든다. SET 노드는 FLOW_JSON 에 남는다.

-- ① 임시 복사(제약 없음)
CREATE TABLE TB_MDM_RULE_SET_VER_BAK AS SELECT * FROM TB_MDM_RULE_SET_VER;

-- ② 옛 표 삭제 — 이 표를 가리키는 FK 가 없어 위반·연쇄 삭제가 없다
DROP TABLE TB_MDM_RULE_SET_VER;

-- ③ 새 표 — V18 정의 + CALL_SET_IDS(FLOW_JSON 뒤)
CREATE TABLE TB_MDM_RULE_SET_VER (
    MARU_RULE_SET_ID VARCHAR(50) NOT NULL,
    VER NUMERIC(7,3) NOT NULL,
    VER_KIND VARCHAR(20) NOT NULL DEFAULT 'MAJOR',
    STATUS VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    BASE_VER NUMERIC(7,3),
    OWNER_ID VARCHAR(50),
    APPLY_FROM TEXT,
    APPLY_TO TEXT,
    RULE_IDS TEXT NOT NULL CONSTRAINT CK_TB_MDM_RULE_SET_VER_RULE_IDS_JSON CHECK (json_valid(RULE_IDS)),
    FLOW_JSON TEXT CONSTRAINT CK_TB_MDM_RULE_SET_VER_FLOW_JSON CHECK (FLOW_JSON IS NULL OR json_valid(FLOW_JSON)),
    CALL_SET_IDS TEXT NOT NULL DEFAULT '[]' CONSTRAINT CK_TB_MDM_RULE_SET_VER_CALL_SET_IDS_JSON CHECK (json_valid(CALL_SET_IDS)),
    REQUESTED_BY VARCHAR(50),
    REQUESTED_AT TEXT,
    RELEASED_AT TEXT,
    ROW_VERSION BIGINT NOT NULL DEFAULT 0,
    C_USR_ID VARCHAR(100),
    C_AT TIMESTAMP,
    C_SVC_ID VARCHAR(100),
    C_PGM_ID VARCHAR(100),
    U_USR_ID VARCHAR(100),
    U_AT TIMESTAMP,
    U_SVC_ID VARCHAR(100),
    U_PGM_ID VARCHAR(100),
    AUD_VER BIGINT,
    CONSTRAINT PK_TB_MDM_RULE_SET_VER PRIMARY KEY (MARU_RULE_SET_ID, VER),
    CONSTRAINT FK_TB_MDM_RULE_SET_VER_SET FOREIGN KEY (MARU_RULE_SET_ID) REFERENCES TB_MDM_RULE_SET (MARU_RULE_SET_ID),
    CONSTRAINT CK_TB_MDM_RULE_SET_VER_STATUS CHECK (STATUS IN ('DRAFT','REQUESTED','APPROVED','RELEASED','CANCELLED')),
    CONSTRAINT CK_TB_MDM_RULE_SET_VER_KIND CHECK (VER_KIND IN ('MAJOR','MINOR')),
    CONSTRAINT CK_TB_MDM_RULE_SET_VER_APPLY CHECK (STATUS = 'DRAFT' OR (APPLY_FROM IS NOT NULL AND APPLY_TO IS NOT NULL))
);

-- ④ 복사 — 칼럼명을 모두 적는다(SELECT * 금지). 새 칸은 기본값 '[]'
INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, VER_KIND, STATUS, BASE_VER, OWNER_ID, APPLY_FROM, APPLY_TO, RULE_IDS, FLOW_JSON,
    REQUESTED_BY, REQUESTED_AT, RELEASED_AT, ROW_VERSION, C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, AUD_VER)
SELECT MARU_RULE_SET_ID, VER, VER_KIND, STATUS, BASE_VER, OWNER_ID, APPLY_FROM, APPLY_TO, RULE_IDS, FLOW_JSON,
    REQUESTED_BY, REQUESTED_AT, RELEASED_AT, ROW_VERSION, C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, AUD_VER
FROM TB_MDM_RULE_SET_VER_BAK;

DROP TABLE TB_MDM_RULE_SET_VER_BAK;
```
V18 정의를 옮길 때 V18 파일과 한 줄씩 대조한다(위는 2026-10-06 V18 그대로다). V20~V22 가 이 표를 바꾸지 않았는지 `grep -n "TB_MDM_RULE_SET_VER" src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V2*.sql` 로 확인한다(2026-10-06 결과 없음).

- [ ] **Step 4: 엔티티·쓰기·복사 구현**

`MdmRuleSetVer.java` — `flowJson` 필드 뒤:
```java
    /** 흐름의 SET 노드를 깊이 우선으로 펼친 중복 없는 세트 ID JSON 배열(하위 세트 spec §1.1). 서버가 DRAFT 저장 때 계산한다. */
    @Column(name = "CALL_SET_IDS", nullable = false, updatable = false)
    private String callSetIds = "[]";
```
`updatable = false` 는 `RULE_IDS`·`FLOW_JSON` 과 같게 맞춘다(쓰기는 네이티브 `updateDraft` 몫 — 그 두 칸의 지금 `@Column` 설정을 보고 같게 둔다). getter·setter 를 `getFlowJson`·`setFlowJson` 옆에 둔다.

`RuleSetWrites.updateDraft`:
```java
    /** DRAFT 의 흐름·룰 목록·부르는 세트 목록. row_version 은 호출 직전 공통 가드({@code beginDraftWrite})가 올렸다. DRAFT 가 아니면 0행. */
    public int updateDraft(String setId, BigDecimal ver, String ruleIdsJson, String flowJson, String callSetIdsJson) {
        NativeQuery<?> q = audited("UPDATE TB_MDM_RULE_SET_VER SET RULE_IDS = :ids, FLOW_JSON = :flow, CALL_SET_IDS = :calls, " + AUDIT_SET
                + ", AUD_VER = COALESCE(AUD_VER, 0) + 1 WHERE MARU_RULE_SET_ID = :id AND VER = :ver AND STATUS = 'DRAFT'")
                .setParameter("id", setId).setParameter("ver", VersionNumbers.scaled(ver)).setParameter("ids", ruleIdsJson)
                .setParameter("calls", callSetIdsJson);
        q.setParameter("flow", flowJson, String.class);
        return q.executeUpdate();
    }
```

`RuleSetEditService.save` 의 `writes.updateDraft(...)` 호출:
```java
            // SEAM(T6) — Task 6 이 흐름에서 계산한 CALL_SET_IDS 로 바꾼다.
            if (writes.updateDraft(setId, ver, DomainJson.write(ids), flowJson, "[]") == 0) {
```
다른 `updateDraft` 호출부가 있으면(`grep -rn "updateDraft(" src/backend/mdm/lib/src`) 모두 같은 방식으로 고친다.

`RuleSetVersionService` — 새 버전을 만드는 자리(`new MdmRuleSetVer(...)` 뒤 원본의 `getFlowJson()` 을 복사하는 줄) 옆에 `created.setCallSetIds(s.getCallSetIds());` 를 더한다(원본이 없으면 엔티티 기본값 `"[]"`).

`DmeTestSupport.java` — `ruleSetFlow(...)` 두 판 뒤:
```java
    /** 이미 넣은 세트 버전 행의 CALL_SET_IDS 를 바꾼다(하위 세트 픽스처). 흐름의 SET 노드와 맞춰 둔다. */
    public static void ruleSetCalls(JdbcTemplate jdbc, String setId, String callSetIdsJson) {
        ruleSetCalls(jdbc, setId, "1.000", callSetIdsJson);
    }

    public static void ruleSetCalls(JdbcTemplate jdbc, String setId, String ver, String callSetIdsJson) {
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET CALL_SET_IDS = ? WHERE MARU_RULE_SET_ID = ? AND VER = ?",
                callSetIdsJson, setId, new java.math.BigDecimal(ver));
    }
```
(`ruleSetFlow` 가 VER 를 묶는 방식을 그대로 따른다 — 그 메서드의 바인딩을 보고 맞춘다.)

새 버전 복사 시험(Files 의 grep 으로 찾은 클래스)에 "원본 버전의 `CALL_SET_IDS` 가 새 DRAFT 에 복사된다" 단언 한 줄을 더한다(`DmeTestSupport.ruleSetCalls` 로 원본에 `["S_B"]` 를 넣고 새 버전 행을 읽는다).

- [ ] **Step 5: 샘플 SQL**

`mdm-local-sample.sql` 의 「06 룰 세트」 블록:
- `CREATE TEMP TABLE TMP_RULE_SET (...)` 에 `CALL_SET_IDS TEXT` 칸을 더하고, `INSERT INTO TB_MDM_RULE_SET_VER (...) SELECT ...` 의 칼럼 목록 `FLOW_JSON` 뒤에 `CALL_SET_IDS` 를, SELECT 목록에 `COALESCE(CALL_SET_IDS, '[]')` 를 더한다.
- 그 블록의 `INSERT INTO TMP_RULE_SET` 이 끝난 뒤(부모·버전 적재 전)에 `SHIP_PLAN` 을 임시 표에 넣는다. `PKG_WGT`·`PACK_TYPE_SET` 세트가 샘플에서 이 블록보다 뒤에 적재되면, `SHIP_PLAN` 은 파일 끝 `COMMIT;` 앞에 같은 임시 표 방식으로 따로 둔다(부르는 세트가 먼저 있어야 로컬 확인 때 `CALL_MISSING` 이 안 난다 — FK 는 없으니 순서는 확인용이다).
```sql
-- 하위 세트 호출 데모(D-135): SHIP_PLAN 은 룰 없이 두 세트를 SET 노드로 차례로 부른다 — PKG_WGT(출하 중량)·PACK_TYPE_SET(포장 방식).
-- CALL_SET_IDS 는 서버가 저장 때 계산하는 값과 같게 적는다. 흐름은 D-136 새 형식(합류 없음)이다.
    ('SHIP_PLAN', '출하 계획(하위 세트 데모)', '[]',
     '{"version":1,"nodes":[{"id":"start","kind":"START","ruleId":null,"splitId":null,"label":null},{"id":"s1","kind":"SET","ruleId":null,"splitId":null,"label":"출하 중량","setId":"PKG_WGT"},{"id":"s2","kind":"SET","ruleId":null,"splitId":null,"label":"포장 방식","setId":"PACK_TYPE_SET"},{"id":"end","kind":"END","ruleId":null,"splitId":null,"label":null}],"edges":[{"id":"e1","from":"start","to":"s1","order":null,"cond":null,"otherwise":false,"label":null},{"id":"e2","from":"s1","to":"s2","order":null,"cond":null,"otherwise":false,"label":null},{"id":"e3","from":"s2","to":"end","order":null,"cond":null,"otherwise":false,"label":null}],"view":{"positions":{},"notes":[],"groups":[]}}',
     '["PKG_WGT","PACK_TYPE_SET"]', '하위 세트 호출 데모 — SET 노드 두 개', 'INUSE', 0, 'kim', '2026-10-06 10:00:00', 'mdm-local-sample', 'kim', '2026-10-06 10:00:00', 'mdm-local-sample', 0)
```
위 값 행의 칼럼 순서는 그 자리 `INSERT INTO TMP_RULE_SET (...)` 의 칼럼 목록에 맞춘다(`FLOW_JSON`·`CALL_SET_IDS` 를 목록에 넣는다). 정규 JSON 은 지금 `RuleSetFlowJson` 이 쓰는 모양과 같아야 한다 — 시연 세트의 흐름 JSON 을 서버로 한 번 정규화해 볼 수 없으므로, 샘플의 다른 흐름 세트(FLOW_JSON 이 있는 행)의 키 모양을 보고 맞춘다. `setId` 는 Task 1 이 정규 JSON 에 SET 노드에만 쓰기로 했다(편차 5).

- [ ] **Step 6: 통과 확인**

Run(차례로, 공통 환경 뒤):
```bash
(cd src/backend/mdm && ../gradlew :api:test --tests '*MdmBusinessRuleMigrationTest' --tests '*MdmRuleSetVerCallSetIdsMigrationTest' --tests '*MdmSharedContractMigrationTest' --tests '*MdmLocalSample*' --tests '*RuleSetEdit*' --tests '*RuleSetMng*' --tests '*RuleSetVersion*' --console=plain)
(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)
(cd src/backend/mdm && ../gradlew :api:test --console=plain -q)
```
Expected: PASS. `MdmLocalSampleStrictTest`(OR IGNORE 를 뗀 엄격 적재)가 `SHIP_PLAN` 행을 넣는다. 엔진 eng:1 이 dev 에 들어가기 전이면 `SHIP_PLAN` 흐름의 `"kind":"SET"` 을 해석하는 시험이 없어야 한다 — 샘플 적재 시험이 흐름을 해석하면 `SHIP_PLAN` 행 추가는 srv:6 으로 미룬다(`progress-srv.md` 에 적는다).

- [ ] **Step 7: 커밋**

```bash
/usr/bin/git add src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V23__rule_set_ver_call_set_ids.sql src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmRuleSetVer.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetWrites.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetEditService.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetVersionService.java src/backend/mdm/sample/mdm-local-sample.sql src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmBusinessRuleExpectations.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmBusinessRuleMigrationTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmSharedContractMigrationTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmRuleSetVerCallSetIdsMigrationTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/DmeTestSupport.java
/usr/bin/git commit -m "feat(mdm): 룰 세트 버전 행에 부르는 하위 세트 목록 CALL_SET_IDS 칸을 더한다(V23)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- <위 add 와 같은 경로들 + 새 버전 복사 시험 파일>
```
(새 버전 복사 시험 파일도 add 와 commit 경로에 함께 넣는다.)

---


### Task 4: 엔진 실행 — 하위 세트 준비(재귀)·`SetShape`·SET 노드 실행·받는 노드·`setPath`·`calls`·`sub`

> **갱신 메모(레인이 착수 때 반영, 2026-10-06 plan:0)** — 아래 본문은 `2e02d29d` 기준이다. 본문보다 이 메모와 Task 0 대조표가 앞선다.
> - 담당 eng:4.
> - `d56dde59` 준비 캐시 `MdmRuleEngine.plans`(세트 ID 키, `Plan.sameDefs`)가 있다. 하위 세트 정의(손주까지)의 동일성을 비교에 넣는다 — 하위 세트 버전이 바뀌면 부모 계획을 다시 만든다. `RuleSetPreparePlanCacheTest` 에 그 사례를 더한다.
> - `always` = 루트 순차 끝 상태 + 모든 끝냄 지점(끝내는 처리 갈래·처리 갈래 안 IF 끝냄·끝내는 IF 갈래) 상태의 교집합(Ruling 16, D-136 §13).
> - 하위 세트가 끝내는 IF 갈래로 끝나면(`endedBy` 없음) 부모에는 정상 완료다 — `SUBSET_ENDED` 받는 노드를 타지 않는다(J-D17).
> - `FlowRun` 의 `mergeId` 는 nullable(옛 형식만)이다. 처리 갈래가 끝난 뒤 이어 갈 자리는 `Guarded.joinId`(돌아오는 자리) 기준으로 잡는다. 본문의 `enterHandler`·`closeGuard` 추출은 지금 `guarded`·`catchNode` 모양을 보고 다시 판단한다. `catchNode(RuleStep r, …)` 는 SET 도 받게 넓힌다.

**모델:** opus — 준비 단계 재귀, 입력 키 사전 검사, 받는 노드(CATCH)와의 맞물림, 기록 실행이 한꺼번에 바뀐다. 결정적 실행·기존 기록 모양을 깨지 않아야 한다.

**이 태스크가 정한 것:**
- 하위 세트는 **준비 단계에서 SET 노드마다 재귀로** 준비한다(편차 7). 같은 세트를 두 SET 노드가 불러도 노드마다 따로 준비한다 — 깊이 판정이 경로마다 다르기 때문이다(노드 수 ≤ 200, 깊이 ≤ 5 라 비용은 작다). 준비 단계의 새 위반: `SET_NOT_FOUND`(빈 setId 포함)·`SET_DEPRECATED`·`SET_CALL_CYCLE`·`SET_CALL_DEPTH`, 그리고 하위 세트 안의 `FLOW_INVALID`·`RULE_NOT_FOUND`. 모두 `Stage.SET_CHECK`, `setPath` 는 그 SET 노드를 가진 세트까지의 경로다.
- `SetShape`·`PreparedSet` 은 record 가 아닌 `final class` 다. `EngineContractSchemaTest.expr_rule_패키지의_record_enum_은…` 가 rule 패키지의 모든 record·enum 을 계약 대조표와 견주고, 그 시험의 `JAVA_ONLY` 는 `Class` 집합이라 패키지 전용 타입을 넣지 못한다(CATCH 계획 Task 3 의 `FlowRun.Caught`·`Ended` 와 같은 방식).
- 준비된 세트는 새 클래스 `PreparedSet`(엔진 `rule` 패키지, 패키지 전용)에 담는다. 지금 `MdmRuleEngine.Prepared` 를 대신한다. `FlowRun` 은 `PreparedSet` 하나를 받는다.
- 실행용 겉모양 `SetShape`(편차 8): `inputs`(깊이 우선 순서로 앞에서 만들지 않은 이름을 읽으면 입력, 첫 등장 순), `mustInputs`(하위 세트 `FlowKeys.check(root, ∅)` 가 모자란다고 보고한 이름 — 반드시 실행되는 부분의 입력), `outputs`(만든 이름 가운데 만든 뒤 아무도 읽지 않는 것), `always`(END 에 닿는 모든 경로의 END 직전 상태에 반드시 있는 출력 — Ruling 16). 같은 룰·같은 세트가 두 번 나오면 처음 것만 센다(서버 `io` 의 중복 없는 목록과 같다).
- 부모 `FlowKeys` 는 SET 노드를 RULE 처럼 본다: 읽는 이름 = `mustInputs`, 반드시 만드는 이름 = `always`, 만들 수 있는 이름 = `outputs`. 모자란 입력 문구는 `"세트 입력 키가 레코드에 없다: {name} (세트 {setId})"`.
- 하위 세트 입력 = 부모 `ctx` 사본에서 `ReservedNames.CATCH_NAMES` 를 뺀 것(편차 11). 하위 세트의 입력 키 사전 검사는 SET 노드 실행 때 하위 세트가 스스로 한다(1단계 spec §4).
- 출력 쓰기: `shape.outputs` 가운데 하위 `finalValues` 에 키가 있는 이름만(값이 NULL 이어도 — RULE 이 NULL 결과를 덮어쓰는 것과 같다, Ruling 17) `ctx`·`made` 에 덮어쓴다.
- 받는 노드: CATCH 계획 Task 3 은 처리 갈래 실행과 돌아오는 MERGE 를 `FlowRun.guarded` 안에 풀어 썼다. 이 태스크가 그 둘을 `enterHandler`·`closeGuard` 로 뽑아 RULE·SET 이 함께 쓴다(Step 9). SET 의 정상 갈래 입력 키 검사도 CATCH R6 과 같이 출력을 쓰기 전에 "ctx 키 ∪ 넘길 출력 이름" 으로 본다.
- `CATCH_SET` 은 CATCH 의 `catchNode` 가 `ctx` 에 네 값을 넣는 자리에서 함께 넣는다(Ruling 4). 처리 갈래 밖에서 빼는 자리는 CATCH 의 `CATCH_ORDER`(`catchValues`·`restoreCatch`)에 `CATCH_SET` 을 더해 맞춘다(이 태스크 Step 9).

**Files:**
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/PreparedSet.java`
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/SetShape.java`
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java`(`evaluateSet`·`traceSet`·`Prepared` 삭제·`prepare` 재작성·새 `prepareSet`·`prepareCall`·`rules`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java`(생성자, `seq` 의 `SEAM(T4)`, CATCH 의 Guarded 처리 메서드의 `SEAM(T4)`, 새 `setCall`·`guardedSet`·`runChild`·`applyOutputs`·`completed`·`childTrace`·`result`·`started`, `begin`·`failed`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowKeys.java`(생성자 `shapes`, 세 switch 의 `SEAM(T4)`, 새 `callKeys`·`setKeys`·`produced(CallStep)`·`producible`·`missingForSet`, CATCH 의 `case Guarded`·`guardSure`·`guardAll`)
- Create(Test): `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/fixture/SubsetFlows.java`
- Create(Test): `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/SubsetShapeTest.java`
- Create(Test): `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/SubsetCallTest.java`
- Create(Test): `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/SubsetCycleDepthTest.java`
- Create(Test): `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/SubsetCatchTest.java`

**Interfaces:**
- Consumes: Task 1(계약), Task 2(`SetStep`·`CallStep`·`FlowTree.setSteps/callSteps`), CATCH(`Guarded`·`CatchKind`·`CaughtException`·`endedBy`·처리 갈래 도우미).
- Produces:
  - 엔진 동작: `RuleSetResult.calls`·`PathStep.callIndex`, `RunTrace.NodeTrace` 의 SET 기록(`reads`·`outputs`·`sub`, 상태 OK·ERROR·CAUGHT), `Violation.setPath`, `CaughtException.setPath`, 준비 단계 네 코드.
  - 패키지 전용 `final class SetShape`(접근자 `inputs()`·`mustInputs()`·`outputs()`·`always()` — record 가 아닌 까닭은 아래 「이 태스크가 정한 것」) + `static final int MAX_CALL_DEPTH = 5` + `static SetShape of(FlowTree, Map<String, RuleDefinition>, Map<String, SetShape>, FlowKeys)` + `static Set<String> endSure(Seq, Function<CallStep, Set<String>>)`.
  - 패키지 전용 `final class PreparedSet { final String setId; final FlowTree tree; final Map<String, RuleDefinition> defs; final FlowKeys keys; final Map<String, PreparedSet> calls /* SET 노드 ID → */; final SetShape shape; final Map<String, String> catchLabels /* CATCH 노드 ID → label */ }`
  - `FlowKeys(Map<String, RuleDefinition> defs, Map<String, SetShape> shapes, MdmEvaluator expressions)` — `shapes` 키는 SET 노드 ID.
  - 시험 도우미 `SubsetFlows.line(FlowNode... mids): FlowDefinition`(start → mids → end, 선 `e1…`).

- [ ] **Step 1: 시험 도우미 — `rule/fixture/SubsetFlows.java`**

```java
package kr.dongkuk.maru.mdm.engine.rule.fixture;

import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;

import java.util.ArrayList;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;

/** 하위 세트 시험용 흐름(하위 세트 계획 Task 4). */
public final class SubsetFlows {

    private SubsetFlows() {}

    /** start → mids(차례로) → end. 선 ID 는 e1, e2, … */
    public static FlowDefinition line(FlowNode... mids) {
        List<FlowNode> nodes = new ArrayList<>();
        nodes.add(start());
        nodes.addAll(List.of(mids));
        nodes.add(end());
        List<FlowEdge> edges = new ArrayList<>();
        for (int i = 0; i + 1 < nodes.size(); i++) {
            edges.add(e("e" + (i + 1), nodes.get(i).id(), nodes.get(i + 1).id()));
        }
        return flow(nodes, edges);
    }

    /** 사용 중 세트(흐름만, RULE_IDS 는 비움 — 엔진은 흐름이 있으면 RULE_IDS 를 보지 않는다). */
    public static RuleSetDefinition inuse(String setId, FlowDefinition f) {
        return new RuleSetDefinition(setId, List.of(), SetStatus.INUSE, f);
    }

    public static RuleSetDefinition deprecated(String setId, FlowDefinition f) {
        return new RuleSetDefinition(setId, List.of(), SetStatus.DEPRECATED, f);
    }

    /** 라벨이 있는 받는 노드. CATCH 의 {@code FlowFixtures.catchNode(id, attachTo, String... kinds)} 는 라벨을 받지 않는다. */
    public static FlowNode labeledCatch(String id, String attachTo, String label, String... kinds) {
        return new FlowNode(id, NodeKind.CATCH, null, null, label, attachTo, List.of(kinds), null);
    }
}
```

- [ ] **Step 2: 실패 시험 — `SubsetCallTest.java`**

```java
package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.SubsetFlows.deprecated;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.SubsetFlows.inuse;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.SubsetFlows.line;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.set;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import org.junit.jupiter.api.Test;

/** 하위 세트 spec §3·§3.1·§3.2 — SET 노드 실행·출력 넘기기·운영 결과·기록. */
class SubsetCallTest {

    private final InMemoryDefinitionLookup lookup = FlowRules.lookup(
            calc("C_A", "A", "Y + 1", "Y"), calc("C_B", "Y", "A + 1", "A"),
            calc("K_X", "X", "Y * 10", "Y"), calc("K_Z", "Z", "X + 1", "X"), calc("P_W", "W", "X + Z", "X", "Z"),
            calc("R_P", "P", "Y + 100", "Y"), calc("R_PP", "PP", "P + 1", "P"), calc("R_Q", "Q2", "Q + 1", "Q"),
            calc("R_ERR", "E", "X / 0", "X"), calc("R_K", "K", "1"));
    private final MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

    private RuleSetResult run(String setId, Map<String, Object> record) {
        return engine.evaluateSet(setId, record, SampleRules.EVAL_TS);
    }

    private EngineEvaluationException fail(String setId, Map<String, Object> record) {
        return assertThrows(EngineEvaluationException.class, () -> run(setId, record));
    }

    @Test
    void 앞에서_읽고_뒤에서_만든_이름은_최종_결과로_넘기고_중간_결과는_넘기지_않는다() {
        lookup.addSet(inuse("C", line(rule("a", "C_A"), rule("b", "C_B"))));      // A = Y+1(중간), Y = A+1(최종)
        lookup.addSet(inuse("P", line(set("s1", "C"))));

        RuleSetResult r = run("P", rec("Y", "1"));

        assertEquals(List.of("Y"), List.copyOf(r.finalValues().keySet()));
        assertNum("3", r.finalValues().get("Y"));
        assertEquals(1, r.calls().size());
        assertEquals("s1", r.calls().get(0).nodeId());
        assertEquals("C", r.calls().get(0).setId());
        assertNum("2", r.calls().get(0).result().finalValues().get("A"));
        assertEquals(List.of(), r.steps(), "steps 는 이 세트의 RULE 결과만");
        assertEquals(List.of("start:START:null", "s1:SET:0", "end:END:null"),
                r.path().stream().map(p -> p.nodeId() + ":" + p.kind() + ":" + p.callIndex()).toList());
    }

    @Test
    void 하위_세트는_부모_값을_바꾸지_못한다() {
        lookup.addSet(inuse("K", line(rule("x", "K_X"), rule("z", "K_Z"))));     // X = Y*10(중간), Z = X+1(최종)
        lookup.addSet(inuse("P", line(set("s1", "K"), rule("w", "P_W"))));        // W = X + Z

        RuleSetResult r = run("P", rec("X", "5", "Y", "1"));

        assertNum("11", r.finalValues().get("Z"));
        assertNum("16", r.finalValues().get("W"), "부모 X 는 5 그대로다");
        assertFalse(r.finalValues().containsKey("X"));
    }

    @Test
    void 안_만든_출력은_부모_값을_남긴다() {
        // IFP: start → if1 [Y > 0 → rp(R_P)] [그 외 → 빈 갈래] → m1 → end. P 는 always=false 출력이다.
        FlowDefinition ifp = flow(List.of(start(), ifNode("if1"), rule("rp", "R_P"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "rp", 1, "Y > 0"), other("bo", "if1", "m1"), e("ep", "rp", "m1"),
                        e("ee", "m1", "end")));
        lookup.addSet(inuse("IFP", ifp));
        lookup.addSet(inuse("P", line(set("s1", "IFP"), rule("pp", "R_PP"))));

        assertNum("8", run("P", rec("Y", "-1", "P", "7")).finalValues().get("PP"));
        assertNum("102", run("P", rec("Y", "1", "P", "7")).finalValues().get("PP"));
    }

    @Test
    void 없는_세트_빈_세트_ID_폐기_세트는_준비_단계에서_멈춘다() {
        lookup.addSet(inuse("P1", line(set("s1", "NOPE"))));
        Violation v = fail("P1", rec()).violations().get(0);
        assertEquals(List.of(Stage.SET_CHECK, Code.SET_NOT_FOUND, "NOPE", List.of()), List.of(v.stage(), v.code(), v.name(), v.setPath()));
        assertEquals("세트가 없다: NOPE (SET 노드 s1)", v.message());

        lookup.addSet(inuse("P2", line(set("s1", null))));
        assertEquals("세트 노드 s1에 세트 ID가 없다", fail("P2", rec()).violations().get(0).message());

        lookup.addSet(deprecated("OLD", line(rule("k", "R_K"))));
        lookup.addSet(inuse("P3", line(set("s1", "OLD"))));
        Violation d = fail("P3", rec()).violations().get(0);
        assertEquals(Code.SET_DEPRECATED, d.code());
        assertEquals("폐기된 세트는 부르지 않는다: OLD (SET 노드 s1)", d.message());
    }

    @Test
    void 하위_세트의_처리되지_않은_위반은_setPath_를_붙여_올라온다() {
        lookup.addSet(inuse("E", line(rule("r1", "R_ERR"))));
        lookup.addSet(inuse("P", line(set("s1", "E"))));
        lookup.addSet(inuse("G", line(set("s9", "P"))));

        Violation v = fail("P", rec("X", "1")).violations().get(0);
        assertEquals(List.of(Code.EVALUATION_ERROR, "R_ERR", List.of("s1")), List.of(v.code(), v.ruleId(), v.setPath()));
        assertEquals(List.of("s9", "s1"), fail("G", rec("X", "1")).violations().get(0).setPath());
    }

    @Test
    void 부모_사전_검사에_하위_세트의_반드시_읽는_입력이_든다() {
        lookup.addSet(inuse("SQ", line(rule("q", "R_Q"))));
        lookup.addSet(inuse("P", line(set("s1", "SQ"))));

        Violation v = fail("P", rec()).violations().get(0);
        assertEquals(List.of(Stage.SET_CHECK, Code.MISSING_KEY, "Q"), List.of(v.stage(), v.code(), v.name()));
        assertEquals("세트 입력 키가 레코드에 없다: Q (세트 SQ)", v.message());
        RunTrace t = engine.traceSet(inuse("P", line(set("s1", "SQ"))), rec(), SampleRules.EVAL_TS);
        assertEquals(List.of(), t.nodes(), "실행 전에 멈춘다");
    }

    @Test
    void 기록_실행은_SET_노드에_reads_outputs_sub_를_남기고_운영_경로와_노드_순서가_같다() {
        lookup.addSet(inuse("C", line(rule("a", "C_A"), rule("b", "C_B"))));
        RuleSetDefinition p = inuse("P", line(rule("k", "R_K"), set("s1", "C")));
        lookup.addSet(p);

        RunTrace t = engine.traceSet(p, rec("Y", "1"), SampleRules.EVAL_TS);
        RuleSetResult r = run("P", rec("Y", "1"));

        assertNull(t.violations());
        assertEquals(r.path().stream().map(RuleSetResult.PathStep::nodeId).toList(), t.nodes().stream().map(RunTrace.NodeTrace::nodeId).toList());
        RunTrace.NodeTrace s = t.nodes().get(2);
        assertEquals(List.of(NodeKind.SET, RunTrace.NodeStatus.OK), List.of(s.kind(), s.status()));
        assertNum("1", s.reads().get("Y"));
        assertEquals(List.of("Y"), List.copyOf(s.outputs().keySet()));
        assertNum("3", s.outputs().get("Y"));
        assertEquals("C", s.sub().setId());
        assertEquals(List.of(NodeKind.START, NodeKind.RULE, NodeKind.RULE, NodeKind.END), s.sub().nodes().stream().map(RunTrace.NodeTrace::kind).toList());
    }

    @Test
    void 기록_실행에서_하위_세트가_멈추면_SET_노드가_ERROR_이고_sub_에_멈춘_룰이_있다() {
        lookup.addSet(inuse("E", line(rule("r1", "R_ERR"))));
        RuleSetDefinition p = inuse("P", line(set("s1", "E")));
        lookup.addSet(p);

        RunTrace t = engine.traceSet(p, rec("X", "1"), SampleRules.EVAL_TS);

        RunTrace.NodeTrace s = t.nodes().get(t.nodes().size() - 1);
        assertEquals(List.of("s1", RunTrace.NodeStatus.ERROR), List.of(s.nodeId(), s.status()));
        assertEquals(List.of("s1"), t.violations().get(0).setPath());
        RunTrace.NodeTrace last = s.sub().nodes().get(s.sub().nodes().size() - 1);
        assertEquals(List.of("r1", RunTrace.NodeStatus.ERROR), List.of(last.nodeId(), last.status()));
        assertEquals(List.of(), s.sub().violations().get(0).setPath(), "하위 기록 안의 위반은 하위 세트 기준 경로");
    }
}
```

- [ ] **Step 3: 실패 시험 — `SubsetCycleDepthTest.java`·`SubsetShapeTest.java`**

```java
package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.SubsetFlows.inuse;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.SubsetFlows.line;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.set;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import org.junit.jupiter.api.Test;

/** 하위 세트 spec §3.3·C-D10 — 순환·깊이(5 통과, 6 거부). 서버 RuleSetCallGraphTest 와 같은 경계다(Review Focus 4). */
class SubsetCycleDepthTest {

    private final InMemoryDefinitionLookup lookup = FlowRules.lookup(calc("R_K", "K", "1"));
    private final MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

    private Violation first(String setId) {
        return assertThrows(EngineEvaluationException.class, () -> engine.evaluateSet(setId, rec(), SampleRules.EVAL_TS)).violations().get(0);
    }

    @Test
    void 세트끼리_서로_부르면_SET_CALL_CYCLE() {
        lookup.addSet(inuse("A", line(set("s1", "B"))));
        lookup.addSet(inuse("B", line(set("s1", "A"))));
        Violation v = first("A");
        assertEquals(List.of(Code.SET_CALL_CYCLE, "세트 호출이 순환한다: A › B › A", List.of("s1")), List.of(v.code(), v.message(), v.setPath()));
    }

    @Test
    void 자기_자신을_부르면_SET_CALL_CYCLE() {
        lookup.addSet(inuse("A", line(set("s1", "A"))));
        Violation v = first("A");
        assertEquals(List.of(Code.SET_CALL_CYCLE, "세트 호출이 순환한다: A › A", List.of()), List.of(v.code(), v.message(), v.setPath()));
    }

    @Test
    void 다섯_단계는_돌고_여섯_단계는_SET_CALL_DEPTH() {
        for (int i = 0; i < 5; i++) {
            lookup.addSet(inuse("S" + i, line(set("s1", "S" + (i + 1)))));
        }
        lookup.addSet(inuse("S5", line(rule("k", "R_K"))));
        assertEquals(1, engine.evaluateSet("S0", rec(), SampleRules.EVAL_TS).calls().size(), "S0 → … → S5 는 5단계");

        lookup.addSet(inuse("S5", line(set("s1", "S6"))));
        lookup.addSet(inuse("S6", line(rule("k", "R_K"))));
        Violation v = first("S0");
        assertEquals(Code.SET_CALL_DEPTH, v.code());
        assertEquals("세트 호출이 6단계다. 5단계까지 부른다: S0 › S1 › S2 › S3 › S4 › S5 › S6", v.message());
        assertEquals(List.of("s1", "s1", "s1", "s1", "s1"), v.setPath());
    }
}
```

`SubsetShapeTest.java`(엔진 겉모양 단위 — Review Focus 1):
```java
package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.SubsetFlows.line;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import org.junit.jupiter.api.Test;

/** 하위 세트 계획 편차 8 — 엔진 실행용 겉모양(서버 SetCallIo 와 같은 알고리즘). */
class SubsetShapeTest {

    private static SetShape shape(FlowDefinition f, RuleDefinition... rules) {
        Map<String, RuleDefinition> defs = new LinkedHashMap<>();
        for (RuleDefinition d : rules) {
            defs.put(d.ruleId(), d);
        }
        FlowTree tree = FlowParser.parse(f).tree();
        FlowKeys keys = new FlowKeys(defs, Map.of(), MdmEvaluatorFixtures.of(TestExpressionConfig.create()));
        return SetShape.of(tree, defs, Map.of(), keys);
    }

    @Test
    void 앞에서_읽고_뒤에서_만든_이름은_최종_결과_만든_뒤_읽힌_이름은_중간_결과() {
        SetShape s = shape(line(rule("a", "C_A"), rule("b", "C_B")), calc("C_A", "A", "Y + 1", "Y"), calc("C_B", "Y", "A + 1", "A"));
        assertEquals(List.of("Y"), s.inputs());
        assertEquals(List.of("Y"), s.mustInputs());
        assertEquals(List.of("Y"), s.outputs());
        assertEquals(Set.of("Y"), s.always());
    }

    @Test
    void IF_한_갈래에서만_만든_출력은_always_가_아니다() {
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("rp", "R_P"), rule("rq", "R_Q0"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "rp", 1, "Y > 0"), other("bo", "if1", "rq"), e("ep", "rp", "m1"),
                        e("eq", "rq", "m1"), e("ee", "m1", "end")));
        SetShape s = shape(f, calc("R_P", "P", "Y + 100", "Y"), calc("R_Q0", "Q0", "1"));
        assertEquals(List.of("P", "Q0"), s.outputs());
        assertEquals(Set.of(), s.always());
        assertEquals(List.of("Y"), s.inputs(), "입력은 룰이 읽는 이름만 센다(서버 io 와 같다)");
        assertEquals(List.of("Y"), s.mustInputs(), "IF 조건식 변수는 갈래에 들어가기 전에 읽으므로 반드시 읽는 입력이다");
    }
}
```

- [ ] **Step 4: 실패 시험 — `SubsetCatchTest.java`(CATCH 맞물림)**

받는 노드 도우미는 CATCH 의 `FlowFixtures.catchNode(id, attachTo, kinds...)` 와 라벨이 필요한 곳에 쓰는 `SubsetFlows.labeledCatch(id, attachTo, label, kinds...)`(Step 1)다. 돌아오는 MERGE 는 `merge(id, splitId)` 로 만든다(CATCH 의 `guardMerge(id, ruleNodeId)` 와 같은 노드다). 처리 갈래가 END 로 가는 선은 보통 선(`e(…)`)이다.

```java
package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.SubsetFlows.inuse;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.SubsetFlows.labeledCatch;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.SubsetFlows.line;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.catchNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.set;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import org.junit.jupiter.api.Test;

/** 하위 세트 spec §4 — 하위 세트의 처리되지 않은 위반·SUBSET_ENDED·caught 전달·처리 갈래 안 SET 노드(Review Focus 3). */
class SubsetCatchTest {

    private final InMemoryDefinitionLookup lookup = FlowRules.lookup(
            calc("R_Q", "Q2", "Q + 1", "Q"), calc("R_ERR", "E", "X / 0", "X"), calc("R_9", "NINE", "9"), calc("R_K", "K", "1"),
            calc("R_YES", "YES", "1"), calc("R_NO", "NO", "1"), calc("K_X", "X2", "Y * 10", "Y"), calc("K_Z", "Z", "X2 + 1", "X2"));
    private final MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

    private RuleSetResult run(String setId, java.util.Map<String, Object> record) {
        return engine.evaluateSet(setId, record, SampleRules.EVAL_TS);
    }

    /** start → s1(setId) [c1 kind → (처리 갈래 if: cond → YES / 그 외 NO) → m1(splitId s1)] s1 → m1 → end. */
    private static FlowDefinition guardedCall(String setId, String kind, String cond) {
        return flow(List.of(start(), set("s1", setId), catchNode("c1", "s1", kind), ifNode("if9"), rule("ry", "R_YES"), rule("rn", "R_NO"),
                        merge("m9", "if9"), merge("m1", "s1"), end()),
                List.of(e("e1", "start", "s1"), e("e2", "s1", "m1"), e("e3", "c1", "if9"), br("b9", "if9", "ry", 1, cond),
                        other("o9", "if9", "rn"), e("e4", "ry", "m9"), e("e5", "rn", "m9"), e("e6", "m9", "m1"), e("e7", "m1", "end")));
    }

    @Test
    void INPUT_ERROR_를_받는_SET_노드는_하위_입력을_사전_검사에서_빼고_하위_위반을_받는다() {
        lookup.addSet(inuse("SQ", line(rule("q", "R_Q"))));
        lookup.addSet(inuse("P", guardedCall("SQ", "INPUT_ERROR", "CATCH_SET == \"SQ\" && CATCH_RULE == \"R_Q\" && CATCH_CODE == \"MISSING_KEY\"")));

        RuleSetResult r = run("P", rec());

        assertTrue(r.finalValues().containsKey("YES"), "CATCH_SET·CATCH_RULE·CATCH_CODE 가 하위 세트 위반을 가리킨다");
        var c = r.caught().get(0);
        assertEquals(List.of("s1", "R_Q", "c1", "MISSING_KEY", List.of()), List.of(c.ruleNodeId(), c.ruleId(), c.catchNodeId(), c.code(), c.setPath()));
        assertEquals(List.of(), r.calls(), "하위 세트가 멈췄으면 calls 에 넣지 않는다");
    }

    @Test
    void 받지_않는_종류의_하위_위반은_setPath_를_붙여_다시_던진다() {
        lookup.addSet(inuse("E", line(rule("r1", "R_ERR"))));
        lookup.addSet(inuse("P", guardedCall("E", "HIT_CONFLICT", "1 == 1")));

        EngineEvaluationException e = assertThrows(EngineEvaluationException.class, () -> run("P", rec("X", "1")));
        assertEquals(List.of(Code.EVALUATION_ERROR, "R_ERR", List.of("s1")),
                List.of(e.violations().get(0).code(), e.violations().get(0).ruleId(), e.violations().get(0).setPath()));
    }

    /** 하위 세트 END1: start → r1(R_ERR) → end, c1(attachTo r1, EVAL_ERROR, "계산 불가") → end — X 가 있으면 늘 처리 갈래로 끝난다. */
    private void endingChild() {
        lookup.addSet(inuse("END1", flow(List.of(start(), rule("r1", "R_ERR"), labeledCatch("c1", "r1", "계산 불가", "EVAL_ERROR"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "end"), e("e3", "c1", "end")))));
    }

    @Test
    void SUBSET_ENDED_를_받는_노드가_없으면_하위_세트의_끝냄은_정상_완료다() {
        endingChild();
        lookup.addSet(inuse("P", line(set("s1", "END1"), rule("k", "R_K"))));

        RuleSetResult r = run("P", rec("X", "1"));

        assertNum("1", r.finalValues().get("K"));
        assertEquals("c1", r.calls().get(0).result().endedBy());
        assertEquals(null, r.endedBy(), "endedBy 는 그 세트 자신의 받는 노드만");
        assertEquals(List.of("c1", List.of("s1")), List.of(r.caught().get(0).catchNodeId(), r.caught().get(0).setPath()));
    }

    @Test
    void SUBSET_ENDED_를_받으면_출력을_넘기지_않고_처리_갈래로_간다() {
        endingChild();
        lookup.addSet(inuse("P", guardedCall("END1", "SUBSET_ENDED",
                "CATCH_CODE == \"SUBSET_ENDED\" && CATCH_RULE == \"R_ERR\" && CATCH_MSG == \"계산 불가\" && CATCH_SET == \"END1\"")));

        RuleSetResult r = run("P", rec("X", "1"));

        assertTrue(r.finalValues().containsKey("YES"));
        assertEquals(2, r.caught().size());
        assertEquals(List.of("c1", List.of("s1")), List.of(r.caught().get(0).catchNodeId(), r.caught().get(0).setPath()), "하위 caught 가 먼저");
        var mine = r.caught().get(1);
        assertEquals(List.of("s1", "R_ERR", "c1", "SUBSET_ENDED", "계산 불가", List.of()),
                List.of(mine.ruleNodeId(), mine.ruleId(), mine.catchNodeId(), mine.code(), mine.message(), mine.setPath()));
        assertEquals(0, r.path().stream().filter(p -> "s1".equals(p.nodeId())).findFirst().orElseThrow().callIndex(), "끝까지 간 하위 세트는 calls 에 남는다");
    }

    @Test
    void 처리_갈래_안의_SET_노드는_CATCH_이름을_넘기지_않고_돌아온다() {
        lookup.addSet(inuse("K", line(rule("x", "K_X"), rule("z", "K_Z"))));
        // start → r1(R_ERR) → m1 → end, c1(attachTo r1, EVAL_ERROR) → s2(K) → m1(splitId r1)
        RuleSetDefinition p = inuse("P", flow(List.of(start(), rule("r1", "R_ERR"), catchNode("c1", "r1", "EVAL_ERROR"), set("s2", "K"),
                        merge("m1", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "m1"), e("e3", "c1", "s2"), e("e4", "s2", "m1"), e("e5", "m1", "end"))));
        lookup.addSet(p);

        RuleSetResult r = run("P", rec("X", "1", "Y", "1"));
        assertNum("11", r.finalValues().get("Z"));

        RunTrace t = engine.traceSet(p, rec("X", "1", "Y", "1"), SampleRules.EVAL_TS);
        RunTrace.NodeTrace s2 = t.nodes().stream().filter(n -> "s2".equals(n.nodeId())).findFirst().orElseThrow();
        assertFalse(s2.sub().input().keySet().stream().anyMatch(k -> k.startsWith("CATCH_")), s2.sub().input().keySet().toString());
    }
}
```

- [ ] **Step 5: 실패 확인**

Run(공통 환경 뒤): `(cd src/backend/maru-mdm-engine && ../gradlew test --tests '*Subset*' --console=plain)`
Expected: 컴파일 오류(`SetShape`·`SubsetFlows` 없음) 또는 `IllegalStateException: SET 실행은 하위 세트 계획 Task 4 가 넣는다`.

- [ ] **Step 6: `SetShape.java`·`PreparedSet.java`**

```java
package kr.dongkuk.maru.mdm.engine.rule;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.flow.Block;
import kr.dongkuk.maru.mdm.engine.flow.Branch;
import kr.dongkuk.maru.mdm.engine.flow.CallStep;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.flow.Guarded;
import kr.dongkuk.maru.mdm.engine.flow.RuleStep;
import kr.dongkuk.maru.mdm.engine.flow.Seq;
import kr.dongkuk.maru.mdm.engine.flow.SetStep;
import kr.dongkuk.maru.mdm.engine.flow.Split;
import kr.dongkuk.maru.mdm.engine.flow.TaskStep;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;

/**
 * 하위 세트의 실행용 겉모양(하위 세트 계획 편차 8). 서버 {@code RuleSetInterface}(mdm/lib) 가 화면용 {@code SetCallIo} 를 같은 알고리즘으로
 * {@code RuleIo} 에서 계산한다 — 알고리즘을 바꾸면 그쪽과 {@code SetCallIoEngineAgreementTest} 를 함께 바꾼다.
 *
 * @param inputs     깊이 우선 순서로 앞에서 만들지 않은 이름을 읽은 것(첫 등장 순)
 * @param mustInputs 반드시 실행되는 부분에서 읽는 입력 — 부모 입력 키 사전 검사에 넣는다
 * @param outputs    만든 이름 가운데 만든 뒤 아무도 읽지 않는 것(첫 생산 순) = 최종 결과
 * @param always     END 에 닿는 모든 경로의 END 직전에 반드시 정의된 출력(Ruling 16)
 *
 * <p>record 가 아니다: {@code EngineContractSchemaTest} 가 rule 패키지의 모든 record·enum 을 계약 대조표와 견주는데, 그 시험의
 * {@code JAVA_ONLY} 는 {@code Class} 집합이라 패키지 전용 타입을 넣지 못한다. CATCH 의 {@code FlowRun.Caught}·{@code Ended} 와 같은 방식이다.
 */
final class SetShape {

    private final List<String> inputs;
    private final List<String> mustInputs;
    private final List<String> outputs;
    private final Set<String> always;

    SetShape(List<String> inputs, List<String> mustInputs, List<String> outputs, Set<String> always) {
        this.inputs = inputs;
        this.mustInputs = mustInputs;
        this.outputs = outputs;
        this.always = always;
    }

    List<String> inputs() {
        return inputs;
    }

    List<String> mustInputs() {
        return mustInputs;
    }

    List<String> outputs() {
        return outputs;
    }

    Set<String> always() {
        return always;
    }

    /** 최상위 세트에서 하위로 들어가는 단계 상한(하위 세트 spec §3.3). 서버 RuleSetCallGraph.MAX_DEPTH 와 같다. */
    static final int MAX_CALL_DEPTH = 5;

    /**
     * @param shapes SET 노드 ID → 손주 세트의 겉모양(준비에 실패한 노드는 없다)
     * @param keys   이 세트 전용 입력 키 검사기 — check(root, ∅) 로 반드시 읽는 입력을 얻는다(실행용 검사기와 따로 만든다)
     */
    static SetShape of(FlowTree tree, Map<String, RuleDefinition> defs, Map<String, SetShape> shapes, FlowKeys keys) {
        Set<String> made = new LinkedHashSet<>();
        Set<String> mid = new HashSet<>();
        Set<String> inputs = new LinkedHashSet<>();
        Set<String> seen = new HashSet<>();
        for (CallStep c : tree.callSteps()) {
            String key = c instanceof RuleStep r ? r.ruleId() : "set:" + ((SetStep) c).setId();
            if (!seen.add(key)) {
                continue;
            }
            for (String n : reads(c, defs, shapes)) {
                if (made.contains(n)) {
                    mid.add(n);
                } else {
                    inputs.add(n);
                }
            }
            made.addAll(produces(c, defs, shapes));
        }
        List<String> outputs = made.stream().filter(n -> !mid.contains(n)).toList();
        Set<String> end = endSure(tree.root(), c -> sure(c, defs, shapes));
        Set<String> always = new LinkedHashSet<>();
        outputs.stream().filter(end::contains).forEach(always::add);
        List<String> must = keys.check(tree.root(), Set.of()).stream().map(Violation::name).filter(Objects::nonNull).distinct().toList();
        return new SetShape(List.copyOf(inputs), must, outputs, Set.copyOf(always));
    }

    private static List<String> reads(CallStep c, Map<String, RuleDefinition> defs, Map<String, SetShape> shapes) {
        if (c instanceof RuleStep r) {
            RuleDefinition d = defs.get(r.ruleId());
            return d == null ? List.of() : FlowKeys.needed(d);
        }
        SetShape s = shapes.get(c.nodeId());
        return s == null ? List.of() : s.inputs();
    }

    private static List<String> produces(CallStep c, Map<String, RuleDefinition> defs, Map<String, SetShape> shapes) {
        if (c instanceof RuleStep r) {
            RuleDefinition d = defs.get(r.ruleId());
            return d == null ? List.of() : RuleEvaluator.resultNames(d);
        }
        SetShape s = shapes.get(c.nodeId());
        return s == null ? List.of() : s.outputs();
    }

    /** 이 노드를 지나면 반드시 정의되는 이름 — RULE 은 결과 전부, SET 은 always 출력. */
    private static Set<String> sure(CallStep c, Map<String, RuleDefinition> defs, Map<String, SetShape> shapes) {
        if (c instanceof RuleStep r) {
            RuleDefinition d = defs.get(r.ruleId());
            return d == null ? Set.of() : new HashSet<>(RuleEvaluator.resultNames(d));
        }
        SetShape s = shapes.get(c.nodeId());
        return s == null ? Set.of() : s.always();
    }

    /**
     * END 에 닿는 모든 경로에서 반드시 정의된 이름(Ruling 16) — 정상 끝 상태와, 처리 갈래로 끝내는 경로마다 그 처리 갈래 끝 상태의 교집합.
     * IF 는 갈래 교집합, PARALLEL 은 합집합, 받는 노드 블록 뒤는 정상 갈래 끝(룰 결과 포함)과 돌아오는 처리 갈래 끝(룰 직전 상태 + 처리 갈래)의 교집합이다.
     * 병렬 갈래 안에서 끝내는 경로는 그 갈래를 돌기 직전 상태 + 그 갈래 안에서 만든 것으로 센다(앞 형제 갈래 결과는 세지 않는다 — 보수적으로).
     */
    static Set<String> endSure(Seq root, Function<CallStep, Set<String>> sure) {
        List<Set<String>> ends = new ArrayList<>();
        Set<String> st = new HashSet<>();
        walk(root, st, sure, ends);
        ends.add(st);
        Set<String> out = new HashSet<>(ends.get(0));
        for (Set<String> e : ends) {
            out.retainAll(e);
        }
        return out;
    }

    private static void walk(Seq seq, Set<String> st, Function<CallStep, Set<String>> sure, List<Set<String>> ends) {
        for (Block b : seq.items()) {
            switch (b) {
                case RuleStep r -> st.addAll(sure.apply(r));
                case SetStep s -> st.addAll(sure.apply(s));
                case TaskStep t -> {
                    // 빈 단계 — 만드는 이름이 없다.
                }
                case Seq q -> walk(q, st, sure, ends);
                case Split sp -> {
                    List<Set<String>> outs = new ArrayList<>();
                    for (Branch br : sp.branches()) {
                        Set<String> b2 = new HashSet<>(st);
                        walk(br.body(), b2, sure, ends);
                        outs.add(b2);
                    }
                    if (sp.kind() == NodeKind.IF) {
                        st.addAll(intersect(outs));
                    } else {
                        outs.forEach(st::addAll);
                    }
                }
                case Guarded g -> {
                    Set<String> base = new HashSet<>(st);
                    Set<String> normal = new HashSet<>(base);
                    normal.addAll(sure.apply(g.rule()));
                    walk(g.normal(), normal, sure, ends);
                    List<Set<String>> back = new ArrayList<>(List.of(normal));
                    for (Guarded.Handler h : g.handlers()) {
                        Set<String> hs = new HashSet<>(base);
                        walk(h.body(), hs, sure, ends);
                        if (h.ends()) {
                            ends.add(hs);
                        } else {
                            back.add(hs);
                        }
                    }
                    st.clear();
                    st.addAll(intersect(back));
                }
            }
        }
    }

    private static Set<String> intersect(List<Set<String>> sets) {
        Set<String> out = new HashSet<>(sets.get(0));
        for (Set<String> s : sets) {
            out.retainAll(s);
        }
        return out;
    }
}
```
(`Guarded`·`Guarded.Handler` 의 접근자 이름 `rule()`·`normal()`·`handlers()`·`body()`·`ends()` 는 CATCH 스펙 §3 의 이름이다. 장부와 다르면 맞춘다. `Guarded` 가 `Block` 의 허용 목록에 있으므로 switch 가 빠짐없이 덮는다.)

```java
package kr.dongkuk.maru.mdm.engine.rule;

import java.util.Map;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;

/**
 * 판정 준비된 세트 하나(하위 세트 계획 Task 4) — {@code MdmRuleEngine} 이 만들고 {@code FlowRun} 이 실행한다. 하위 세트는 SET 노드 ID 마다
 * 따로 준비한다(깊이 판정이 경로마다 다르다).
 */
final class PreparedSet {
    final String setId;
    final FlowTree tree;
    final Map<String, RuleDefinition> defs;
    final FlowKeys keys;
    /** SET 노드 ID → 준비된 하위 세트. */
    final Map<String, PreparedSet> calls;
    final SetShape shape;
    /** 받는 노드 ID → label(없으면 노드 ID) — SUBSET_ENDED 의 CATCH_MSG(Ruling 5). */
    final Map<String, String> catchLabels;

    PreparedSet(String setId, FlowTree tree, Map<String, RuleDefinition> defs, FlowKeys keys, Map<String, PreparedSet> calls,
            SetShape shape, Map<String, String> catchLabels) {
        this.setId = setId;
        this.tree = tree;
        this.defs = defs;
        this.keys = keys;
        this.calls = calls;
        this.shape = shape;
        this.catchLabels = catchLabels;
    }
}
```

`SetShape`·`PreparedSet` 은 record·enum 이 아니므로 `EngineContractSchemaTest` 는 고치지 않는다.

- [ ] **Step 7: `FlowKeys.java`**

- 필드·생성자:
```java
    private final Map<String, RuleDefinition> defs;
    /** SET 노드 ID → 하위 세트 겉모양(하위 세트 계획 Task 4). 준비에 실패한 노드는 없다. */
    private final Map<String, SetShape> shapes;
    private final MdmEvaluator expressions;
```
```java
    FlowKeys(Map<String, RuleDefinition> defs, Map<String, SetShape> shapes, MdmEvaluator expressions) {
        this.defs = defs;
        this.shapes = shapes;
        this.expressions = expressions;
        for (RuleDefinition def : defs.values()) {
            declare(def);
        }
    }
```
- `walk(...)` 의 `case SetStep s -> { // SEAM(T4) }` 를 `case SetStep s -> setKeys(s, false, available, sure, maybe, reported, out);` 로 바꾼다.
- `sureProduced(...)`: `case SetStep s -> { SetShape sh = shapes.get(s.nodeId()); if (sh != null) { out.addAll(sh.always()); } }`
- `allProduced(...)`: `case SetStep s -> { SetShape sh = shapes.get(s.nodeId()); if (sh != null) { out.addAll(sh.outputs()); } }`
- CATCH 계획 Task 3 의 받는 룰 처리는 `g.rule()` 을 `RuleStep` 으로 쓴다: `walk` 의 `case Guarded g` 가 `ruleKeys(g.rule(), g.handlerFor(CatchKind.INPUT_ERROR) != null, …)`, `guardSure`·`guardAll` 이 `produced(g.rule())`. Task 2 가 이 자리를 `SEAM(T4)` 로 막아 두었다. `ruleKeys(g.rule(), …)` 를 `callKeys(g.rule(), …)` 로, `guardSure` 의 `produced(g.rule())` 를 `produced(g.rule())`(인자 타입만 `CallStep`)로, `guardAll` 의 `produced(g.rule())` 를 `producible(g.rule())` 로 바꾸고 아래 도우미를 둔다. `ruleKeys`·`walk` 의 `RuleStep` 갈래는 그대로다.
```java
    /** 받는 노드가 붙을 수 있는 노드의 입력 키(RULE·SET). late 면 없는 이름을 보고하지 않고 지연 목록에 넣는다(INPUT_ERROR 를 받는 노드, CATCH X-D9). */
    private void callKeys(CallStep c, boolean late, Set<String> available, Set<String> sure, Set<String> maybe, Set<String> reported,
            List<Violation> out) {
        switch (c) {
            case RuleStep r -> ruleKeys(r, late, available, sure, maybe, reported, out);
            case SetStep s -> setKeys(s, late, available, sure, maybe, reported, out);
        }
    }

    /** SET 노드의 입력 키 — 반드시 읽는 하위 입력(mustInputs)을 RULE 의 needed 처럼 본다. 출력은 always 를 sure 에, 나머지를 maybe 에. */
    private void setKeys(SetStep s, boolean late, Set<String> available, Set<String> sure, Set<String> maybe, Set<String> reported,
            List<Violation> out) {
        SetShape shape = shapes.get(s.nodeId());
        if (shape == null) {
            return; // 준비 실패 — 위반은 준비 단계가 이미 모았다
        }
        List<String> later = new ArrayList<>();
        for (String name : shape.mustInputs()) {
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
                out.add(missingForSet(s.setId(), name));
            }
        }
        if (!later.isEmpty()) {
            deferred.put(s.nodeId(), List.copyOf(later));
        }
        sure.addAll(shape.always());
        maybe.removeAll(shape.always());
        for (String o : shape.outputs()) {
            if (!sure.contains(o)) {
                maybe.add(o);
            }
        }
    }

    /** 반드시 만드는 이름 — RULE 은 결과 이름, SET 은 always 출력(정의·겉모양이 없으면 빈 집합). */
    private Set<String> produced(CallStep c) {
        return switch (c) {
            case RuleStep r -> {
                RuleDefinition def = defs.get(r.ruleId());
                yield def == null ? new HashSet<>() : new HashSet<>(RuleEvaluator.resultNames(def));
            }
            case SetStep s -> {
                SetShape sh = shapes.get(s.nodeId());
                yield sh == null ? new HashSet<>() : new HashSet<>(sh.always());
            }
        };
    }

    /** 만들 수 있는 이름 — RULE 은 결과 이름, SET 은 모든 출력. */
    private Set<String> producible(CallStep c) {
        if (c instanceof SetStep s) {
            SetShape sh = shapes.get(s.nodeId());
            return sh == null ? new HashSet<>() : new HashSet<>(sh.outputs());
        }
        return produced(c);
    }
```
  import 에 `kr.dongkuk.maru.mdm.engine.flow.CallStep` 을 더한다.
- 새 도우미(`missing(...)` 아래):
```java
    /** SET 노드의 반드시 읽는 입력이 모자람(하위 세트 spec §3). */
    static Violation missingForSet(String setId, String name) {
        return new Violation(Stage.SET_CHECK, Code.MISSING_KEY, null, null, name,
                "세트 입력 키가 레코드에 없다: " + name + " (세트 " + setId + ")", List.of());
    }
```

- [ ] **Step 8: `MdmRuleEngine.java`**

`Prepared` 중첩 클래스를 지우고 `prepare` 를 다음으로 바꾼다. `evaluateSet`·`traceSet` 은 `PreparedSet` 을 쓴다.
```java
    @Override
    public RuleSetResult evaluateSet(String setId, Map<String, Object> record, Instant evalTs) {
        Objects.requireNonNull(setId, "setId");
        Objects.requireNonNull(record, "record");
        Instant ts = truncate(evalTs);
        PreparedSet p = prepare(set(setId), record, ts);
        FlowRun run = new FlowRun(evaluator, runner, p, record, ts, false, List.of());
        run.run();
        return run.result();
    }
```
`traceSet(…, edits)` 의 `Prepared p;` → `PreparedSet p;`, `new FlowRun(evaluator, runner, p.tree, p.defs, p.keys, record, ts, true, edits)` → `new FlowRun(evaluator, runner, p, record, ts, true, edits)`. 나머지(CATCH 의 `endedBy` 를 실어 `RunTrace` 를 만드는 줄)는 그대로다.

```java
    /**
     * 상태 → 흐름 구조(최상위는 바로 FLOW_INVALID) → 레코드 키 → 세트 준비(룰·하위 세트 재귀) → 입력 키 사전 검사(하위 세트 spec §3). 구조 오류 밖의
     * 위반은 모아 한 번에 던진다. 폐기 세트는 룰을 조회하지 않는다.
     */
    private PreparedSet prepare(RuleSetDefinition set, Map<String, Object> record, Instant ts) {
        if (set.status() == SetStatus.DEPRECATED) {
            throw new EngineEvaluationException(List.of(new Violation(Stage.SET_CHECK, Code.SET_DEPRECATED, null, null,
                    null, "폐기된 세트는 판정하지 않는다: " + set.setId(), List.of())));
        }
        FlowParse parsed = FlowParser.parse(flowOf(set));
        if (parsed.tree() == null) {
            throw new EngineEvaluationException(parsed.issues().stream()
                    .map(i -> new Violation(Stage.SET_CHECK, Code.FLOW_INVALID, null, null, i.nodeId(),
                            "세트 " + set.setId() + " 의 흐름이 올바르지 않다: " + i.message(), List.of()))
                    .toList());
        }
        List<Violation> violations = new ArrayList<>(RecordKeys.check(record.keySet(), Stage.SET_CHECK, null));
        PreparedSet p = prepareSet(set, List.of(set.setId()), List.of(), ts, violations);
        if (p != null) {
            violations.addAll(p.keys.check(p.tree.root(), record.keySet()));
        }
        if (!violations.isEmpty()) {
            throw new EngineEvaluationException(violations);
        }
        return p;
    }

    private static FlowDefinition flowOf(RuleSetDefinition set) {
        return set.flow() == null ? FlowParser.linear(set.ruleIds()) : set.flow();
    }

    /**
     * 세트 하나 준비 — 구조 → 룰 조회 → SET 노드마다 하위 세트(재귀) → 입력 키 검사기·겉모양. 문제는 out 에 모은다(setPath = nodePath).
     *
     * @param chain    최상위부터 이 세트까지의 세트 ID(순환·깊이)
     * @param nodePath 최상위부터 이 세트까지 거친 SET 노드 ID(위반의 setPath)
     * @return 구조 오류면 null
     */
    private PreparedSet prepareSet(RuleSetDefinition set, List<String> chain, List<String> nodePath, Instant ts, List<Violation> out) {
        FlowDefinition flow = flowOf(set);
        FlowParse parsed = FlowParser.parse(flow);
        if (parsed.tree() == null) {
            parsed.issues().forEach(i -> out.add(new Violation(Stage.SET_CHECK, Code.FLOW_INVALID, null, null, i.nodeId(),
                    "세트 " + set.setId() + " 의 흐름이 올바르지 않다: " + i.message(), nodePath)));
            return null;
        }
        FlowTree tree = parsed.tree();
        Map<String, RuleDefinition> defs = new LinkedHashMap<>();
        for (String ruleId : tree.ruleIds()) {
            Optional<RuleDefinition> def = definitions.rule(ruleId, ts);
            if (def.isEmpty()) {
                out.add(new Violation(Stage.SET_CHECK, Code.RULE_NOT_FOUND, ruleId, null, null,
                        "세트 " + set.setId() + " 의 룰이 없다: " + ruleId + " @ " + ts, nodePath));
            } else {
                defs.put(ruleId, def.get());
            }
        }
        Map<String, PreparedSet> calls = new LinkedHashMap<>();
        Map<String, SetShape> shapes = new LinkedHashMap<>();
        for (SetStep s : tree.setSteps()) {
            PreparedSet child = prepareCall(s, chain, nodePath, ts, out);
            if (child != null) {
                calls.put(s.nodeId(), child);
                shapes.put(s.nodeId(), child.shape);
            }
        }
        FlowKeys keys = new FlowKeys(defs, shapes, expressions);
        SetShape shape = SetShape.of(tree, defs, shapes, new FlowKeys(defs, shapes, expressions));
        Map<String, String> labels = new LinkedHashMap<>();
        for (FlowNode n : flow.nodes()) {
            if (n.kind() == NodeKind.CATCH) {
                labels.put(n.id(), n.label() == null || n.label().isBlank() ? n.id() : n.label());
            }
        }
        return new PreparedSet(set.setId(), tree, defs, keys, calls, shape, labels);
    }

    /** SET 노드 하나의 하위 세트 — 빈 ID·순환·깊이·없음·폐기를 거른 뒤 재귀 준비(하위 세트 spec §3·§3.3, 편차 7). */
    private PreparedSet prepareCall(SetStep s, List<String> chain, List<String> nodePath, Instant ts, List<Violation> out) {
        String id = s.setId();
        if (id == null || id.isBlank()) {
            out.add(new Violation(Stage.SET_CHECK, Code.SET_NOT_FOUND, null, null, null, "세트 노드 " + s.nodeId() + "에 세트 ID가 없다", nodePath));
            return null;
        }
        if (chain.contains(id)) {
            out.add(new Violation(Stage.SET_CHECK, Code.SET_CALL_CYCLE, null, null, id,
                    "세트 호출이 순환한다: " + String.join(" › ", chain) + " › " + id, nodePath));
            return null;
        }
        if (chain.size() > SetShape.MAX_CALL_DEPTH) {
            out.add(new Violation(Stage.SET_CHECK, Code.SET_CALL_DEPTH, null, null, id, "세트 호출이 " + chain.size() + "단계다. "
                    + SetShape.MAX_CALL_DEPTH + "단계까지 부른다: " + String.join(" › ", chain) + " › " + id, nodePath));
            return null;
        }
        Optional<RuleSetDefinition> def = definitions.ruleSet(id);
        if (def.isEmpty()) {
            out.add(new Violation(Stage.SET_CHECK, Code.SET_NOT_FOUND, null, null, id, "세트가 없다: " + id + " (SET 노드 " + s.nodeId() + ")", nodePath));
            return null;
        }
        if (def.get().status() == SetStatus.DEPRECATED) {
            out.add(new Violation(Stage.SET_CHECK, Code.SET_DEPRECATED, null, null, id,
                    "폐기된 세트는 부르지 않는다: " + id + " (SET 노드 " + s.nodeId() + ")", nodePath));
            return null;
        }
        return prepareSet(def.get(), append(chain, id), append(nodePath, s.nodeId()), ts, out);
    }

    private static List<String> append(List<String> list, String x) {
        List<String> out = new ArrayList<>(list);
        out.add(x);
        return List.copyOf(out);
    }
```
깊이 판정: `chain` 은 최상위부터 지금 세트까지라 `chain.size()` 가 부르려는 하위 세트의 깊이다(최상위가 깊이 0). 깊이 6 이면 `chain.size() == 6 > 5` 로 막힌다. `SubsetCycleDepthTest` 의 기대 문구가 이 식을 고정한다. import 에 `FlowNode`·`NodeKind`·`FlowTree`·`SetStep` 을 더한다(`NodeKind.CATCH` 는 CATCH 가 더한 상수).

- [ ] **Step 9: `FlowRun.java`**

생성자를 `PreparedSet` 하나로 받게 바꾼다(CATCH 가 더한 필드·초기화는 그대로).
```java
    private final RuleEvaluator evaluator;
    private final ExpressionRunner runner;
    private final PreparedSet p;
    private final FlowTree tree;
    private final Map<String, RuleDefinition> defs;
    private final FlowKeys keys;
    …
    /** 실행한 SET 노드마다 하위 결과(RuleSetResult.calls, 하위 세트 spec §3.1). */
    final List<SetCall> callResults = new ArrayList<>();
    /** 하위 세트에서 올라온 처리되지 않은 위반이 실제로 난 가장 안쪽 세트 ID. 이 세트의 노드에서 났으면 null(Ruling 4). */
    String failedSetId;
    private RunTrace curSub;

    FlowRun(RuleEvaluator evaluator, ExpressionRunner runner, PreparedSet p, Map<String, Object> record, Instant ts, boolean tracing,
            List<TraceEdit> edits) {
        if (!tracing && !edits.isEmpty()) {
            throw new IllegalArgumentException("고친 값은 기록 실행(traceSet)에서만 쓴다");
        }
        this.evaluator = evaluator;
        this.runner = runner;
        this.p = p;
        this.tree = p.tree;
        this.defs = p.defs;
        this.keys = p.keys;
        this.ts = ts;
        this.tracing = tracing;
        this.edits = List.copyOf(edits);
        this.used = new boolean[this.edits.size()];
        this.ctx = new LinkedHashMap<>(record);
    }
```
`begin(...)` 끝에 `curSub = null;`. `failed(...)` 의 `new NodeTrace(…)` 끝 두 인자를 `null, curSub` 로(CATCH 칸 뒤). 새 메서드:
```java
    /** 노드를 하나라도 시작했는가 — 하위 세트가 입력 키 사전 검사에서 멈췄으면 거짓(기록에 멈춘 노드를 덧붙이지 않는다). */
    boolean started() {
        return curNodeId != null;
    }

    /** 이 실행의 운영 결과(evaluateSet·하위 세트 calls). */
    RuleSetResult result() {
        return new RuleSetResult(p.setId, ts, List.copyOf(steps), Collections.unmodifiableMap(new LinkedHashMap<>(finalValues)),
                List.copyOf(path), List.copyOf(warnings), List.copyOf(caught), endedBy, List.copyOf(callResults));
    }
```
(`caught`·`endedBy` 는 CATCH 계획 Task 3 이 `FlowRun` 에 둔 필드 이름이다.) `seq` 의 `SEAM(T4)` 줄을 `case SetStep s -> setCall(s, ctx, made);` 로 바꾼다.

CATCH 의 받는 노드 처리(CATCH 계획 Task 3 의 `guarded`·`catchNode`·`CATCH_ORDER`)를 RULE·SET 이 함께 쓰게 나눈다. 동작은 RULE 쪽에서 한 글자도 바뀌지 않는다.
- `CATCH_ORDER` 끝에 `ReservedNames.CATCH_SET` 을 더한다. `catchValues`·`restoreCatch` 와 END 에서 `CATCH_*` 를 지우는 자리가 이 목록을 쓰므로 `CATCH_SET` 도 같이 저장·복원·삭제된다(CATCH R3·R4).
- `catchNode(RuleStep r, Caught c, …)` 의 첫 인자를 `String ruleId, String catchSet` 로 바꾸고 `r.ruleId()` 두 곳을 `ruleId` 로, `CATCH_MSG` 를 넣는 줄 뒤에 `RecordKeys.putReplacing(ctx, ReservedNames.CATCH_SET, catchSet);` 를 더한다(Ruling 4).
- `guarded` 의 처리 갈래 부분과 MERGE 부분을 `enterHandler`·`closeGuard` 로 뽑고, 맨 앞에서 Task 2 가 둔 `SEAM(T4)` 갈래를 `guardedSet` 호출로 바꾼다:
```java
    private void guarded(Guarded g, Map<String, Object> ctx, Map<String, Object> made) {
        if (g.rule() instanceof SetStep s) {
            guardedSet(g, s, ctx, made);
            return;
        }
        RuleStep r = (RuleStep) g.rule();
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
            // 정상 갈래 입력 키(CATCH R6) — 결과를 넣기 전에 "ctx 키 ∪ 결과 이름" 으로 본다. 실패하면 이 룰 노드가 ERROR 다(받기 try 밖).
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
            ctx.putAll(before); // 룰이 바꿔 넣은 입력 타입을 되돌린다(CATCH 편차 F6)
            caughtRule(r, c);
            enterHandler(c, r.ruleId(), p.setId, ctx, made);
        }
        closeGuard(g, outer, ctx, made);
    }

    /** CATCH 노드 기록·CATCH_* 넣기·처리 갈래 실행·끝냄 신호(CATCH R1·R3·R5). RULE·SET 이 함께 쓴다. */
    private void enterHandler(Caught c, String ruleId, String catchSet, Map<String, Object> ctx, Map<String, Object> made) {
        catchNode(ruleId, catchSet, c, ctx, made);
        seq(c.handler.body(), ctx, made);
        if (c.handler.ends()) {
            throw new Ended(c.handler.catchNodeId());
        }
    }

    /** 돌아오는 MERGE(CATCH R3·R4). 기록의 splitId 는 받는 RULE·SET 노드 ID 다. */
    private void closeGuard(Guarded g, Map<String, Object> outer, Map<String, Object> ctx, Map<String, Object> made) {
        if (g.mergeId() == null) {
            return;
        }
        restoreCatch(ctx, outer);
        begin(g.mergeId(), NodeKind.MERGE);
        edit(ctx, made);
        path.add(new PathStep(g.mergeId(), NodeKind.MERGE, null, null, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, g.mergeId(), NodeKind.MERGE, NodeStatus.OK, null, null, null, null, null,
                    null, null, g.nodeId(), null, null, null, null, null, null, null));
        }
    }
```

하위 세트 실행 묶음(`merge(...)` 뒤에 둔다):
```java
    // ── 하위 세트(하위 세트 spec §3·§4) ──────────────────────────────────────────

    /** 하위 세트 한 번의 실행. error 가 있으면 sub 는 멈춘 시점까지다. */
    private static final class Called {
        final FlowRun sub;
        final Map<String, Object> input;
        final EngineEvaluationException error;
        final String innerSetId;

        Called(FlowRun sub, Map<String, Object> input, EngineEvaluationException error, String innerSetId) {
            this.sub = sub;
            this.input = input;
            this.error = error;
            this.innerSetId = innerSetId;
        }
    }

    /** 받는 노드 없는 SET 노드. 하위의 처리되지 않은 위반은 setPath 를 붙여 다시 던지고, 하위가 처리 갈래로 끝났어도 정상 완료로 본다(C-D8). */
    private void setCall(SetStep s, Map<String, Object> ctx, Map<String, Object> made) {
        PreparedSet child = beginSet(s, ctx, made, true);
        Called c = runChild(s, child, ctx);
        if (c.error != null) {
            failedSetId = c.innerSetId;
            throw rethrown(s, c.error);
        }
        completed(s, child, c, applyOutputs(child, c.sub, ctx, made));
    }

    /**
     * 받는 노드가 붙은 SET 노드(하위 세트 spec §4). 하위의 처리되지 않은 위반은 CATCH 종류 표로, 하위가 처리 갈래로 끝났으면 SUBSET_ENDED 로 종류를
     * 정한다. 그 종류를 받는 노드가 있으면 출력을 쓰지 않고 처리 갈래로 간다. 없으면 위반은 다시 던지고 끝냄은 정상 완료로 본다.
     */
    private void guardedSet(Guarded g, SetStep s, Map<String, Object> ctx, Map<String, Object> made) {
        Map<String, Object> outer = catchValues(ctx);
        // INPUT_ERROR 를 받으면 지연 키를 여기서 보지 않는다 — 하위 세트가 runChild 안의 사전 검사로 MISSING_KEY 를 내고 받기로 넘어간다.
        PreparedSet child = beginSet(s, ctx, made, g.handlerFor(CatchKind.INPUT_ERROR) == null);
        Called c = runChild(s, child, ctx);
        if (c.error != null) {
            Violation first = c.error.violations().get(0);
            CatchKind kind = CatchKind.ofCode(first.code().name()).orElse(null);
            Guarded.Handler h = kind == null ? null : g.handlerFor(kind);
            if (h == null) {
                failedSetId = c.innerSetId;
                throw rethrown(s, c.error);
            }
            List<Violation> vs = rethrown(s, c.error).violations();
            propagateCaught(s, c.sub);
            caught.add(new CaughtException(s.nodeId(), first.ruleId(), h.catchNodeId(), kind, first.code().name(), first.message(), List.of()));
            path.add(new PathStep(s.nodeId(), NodeKind.SET, null, null, null));
            trace(s, NodeStatus.CAUGHT, vs, null);
            enterHandler(new Caught(h, kind, first.code().name(), first.message(), vs), first.ruleId(), c.innerSetId, ctx, made);
            closeGuard(g, outer, ctx, made);
            return;
        }
        Guarded.Handler ended = c.sub.endedBy == null ? null : g.handlerFor(CatchKind.SUBSET_ENDED);
        if (ended != null) {
            String rule = endingRule(c.sub);
            String msg = child.catchLabels.getOrDefault(c.sub.endedBy, c.sub.endedBy);
            propagateCaught(s, c.sub);
            int index = addCall(s, child, c.sub);
            caught.add(new CaughtException(s.nodeId(), rule, ended.catchNodeId(), CatchKind.SUBSET_ENDED, "SUBSET_ENDED", msg, List.of()));
            path.add(new PathStep(s.nodeId(), NodeKind.SET, null, null, index));
            trace(s, NodeStatus.CAUGHT, List.of(), null);
            enterHandler(new Caught(ended, CatchKind.SUBSET_ENDED, "SUBSET_ENDED", msg, List.of()), rule, child.setId, ctx, made);
            closeGuard(g, outer, ctx, made);
            return;
        }
        // 정상 갈래 입력 키(CATCH R6) — 출력을 쓰기 전에 "ctx 키 ∪ 넘길 출력 이름" 으로 본다. 실패하면 이 SET 노드가 ERROR 다.
        Set<String> available = new HashSet<>(ctx.keySet());
        for (String name : child.shape.outputs()) {
            if (c.sub.finalValues.containsKey(name)) {
                available.add(name);
            }
        }
        List<Violation> missing = keys.check(g.normal(), available);
        if (!missing.isEmpty()) {
            throw new EngineEvaluationException(missing);
        }
        completed(s, child, c, applyOutputs(child, c.sub, ctx, made));
        seq(g.normal(), ctx, made);
        closeGuard(g, outer, ctx, made);
    }

    /** SET 노드 시작 — 기록 칸·고친 값·지연 입력 키(부모 IF 일부 갈래에서만 만든 하위 입력, checkDeferred 일 때만). */
    private PreparedSet beginSet(SetStep s, Map<String, Object> ctx, Map<String, Object> made, boolean checkDeferred) {
        PreparedSet child = p.calls.get(s.nodeId());
        begin(s.nodeId(), NodeKind.SET);
        edit(ctx, made);
        if (tracing) {
            Map<String, Object> reads = new LinkedHashMap<>();
            for (String name : child.shape.inputs()) {
                if (ctx.containsKey(name)) {
                    reads.put(name, ctx.get(name));
                }
            }
            curReads = Collections.unmodifiableMap(reads);
        }
        List<Violation> missing = new ArrayList<>();
        for (String name : checkDeferred ? keys.deferred(s.nodeId()) : List.<String>of()) {
            if (!ctx.containsKey(name)) {
                missing.add(FlowKeys.missingForSet(child.setId, name));
            }
        }
        if (!missing.isEmpty()) {
            throw new EngineEvaluationException(missing);
        }
        return child;
    }

    /** 하위 세트를 부모 ctx 사본(CATCH_* 제외, 편차 11)으로 실행한다. 하위 입력 키 사전 검사도 여기서 한다. 기록 실행이면 curSub 를 채운다. */
    private Called runChild(SetStep s, PreparedSet child, Map<String, Object> ctx) {
        Map<String, Object> input = new LinkedHashMap<>();
        ctx.forEach((k, v) -> {
            if (!ReservedNames.CATCH_NAMES.contains(k.toUpperCase(java.util.Locale.ROOT))) {
                input.put(k, v);
            }
        });
        FlowRun sub = new FlowRun(evaluator, runner, child, input, ts, tracing, List.of());
        Called c;
        try {
            List<Violation> missing = child.keys.check(child.tree.root(), input.keySet());
            if (!missing.isEmpty()) {
                throw new EngineEvaluationException(missing);
            }
            sub.run();
            c = new Called(sub, input, null, null);
        } catch (EngineEvaluationException e) {
            c = new Called(sub, input, e, sub.failedSetId != null ? sub.failedSetId : child.setId);
        }
        if (tracing) {
            curSub = childTrace(c);
        }
        return c;
    }

    /** 겉모양 출력 가운데 하위 finalValues 에 키가 있는 이름만 ctx·made 에 덮어쓴다(값이 NULL 이어도, Ruling 17). 넘긴 이름 → 값. */
    private static Map<String, Object> applyOutputs(PreparedSet child, FlowRun sub, Map<String, Object> ctx, Map<String, Object> made) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (String name : child.shape.outputs()) {
            if (sub.finalValues.containsKey(name)) {
                Object v = sub.finalValues.get(name);
                RecordKeys.putReplacing(ctx, name, v);
                RecordKeys.putReplacing(made, name, v);
                out.put(name, v);
            }
        }
        return out;
    }

    /** 끝까지 간 SET 노드 — calls·caught·path·기록. */
    private void completed(SetStep s, PreparedSet child, Called c, Map<String, Object> outputs) {
        propagateCaught(s, c.sub);
        int index = addCall(s, child, c.sub);
        path.add(new PathStep(s.nodeId(), NodeKind.SET, null, null, index));
        trace(s, NodeStatus.OK, null, outputs);
    }

    private int addCall(SetStep s, PreparedSet child, FlowRun sub) {
        callResults.add(new SetCall(s.nodeId(), child.setId, sub.result()));
        return callResults.size() - 1;
    }

    /** 하위 세트가 받아 처리한 예외를 이 세트의 caught 에 이어 붙인다 — setPath 앞에 이 SET 노드 ID(하위 세트 spec §4.3, C-D9). */
    private void propagateCaught(SetStep s, FlowRun sub) {
        for (CaughtException x : sub.caught) {
            caught.add(new CaughtException(x.ruleNodeId(), x.ruleId(), x.catchNodeId(), x.kind(), x.code(), x.message(), prefixed(s.nodeId(), x.setPath())));
        }
    }

    /** 하위 세트를 끝낸 받는 노드가 받은 룰 ID(Ruling 5) — 하위 caught 가운데 그 받는 노드의 마지막 항목. */
    private static String endingRule(FlowRun sub) {
        for (int i = sub.caught.size() - 1; i >= 0; i--) {
            CaughtException x = sub.caught.get(i);
            if (x.setPath().isEmpty() && x.catchNodeId().equals(sub.endedBy)) {
                return x.ruleId();
            }
        }
        return null;
    }

    private void trace(SetStep s, NodeStatus status, List<Violation> violations, Map<String, Object> outputs) {
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, s.nodeId(), NodeKind.SET, status, null, null, curReads, null, null, null, null, null, null,
                    violations == null ? null : List.copyOf(violations), null, null, null,
                    outputs == null ? null : Collections.unmodifiableMap(outputs), curSub));
        }
    }

    /** 하위 세트 기록(하위 세트 spec §3.2) — 멈췄으면 멈춘 노드를 ERROR 로 덧붙인다(MdmRuleEngine.traceSet 과 같은 모양). */
    private RunTrace childTrace(Called c) {
        List<NodeTrace> list = new ArrayList<>(c.sub.nodes);
        List<Violation> vs = null;
        if (c.error != null) {
            if (c.sub.started()) {
                list.add(c.sub.failed(c.error.violations()));
            }
            vs = List.copyOf(c.error.violations());
        }
        return new RunTrace(c.sub.p.setId, ts, Collections.unmodifiableMap(new LinkedHashMap<>(c.input)), List.copyOf(list),
                Collections.unmodifiableMap(new LinkedHashMap<>(c.sub.finalValues)), vs, null, c.sub.endedBy);
    }

    private static EngineEvaluationException rethrown(SetStep s, EngineEvaluationException e) {
        List<Violation> out = new ArrayList<>();
        for (Violation v : e.violations()) {
            out.add(new Violation(v.stage(), v.code(), v.ruleId(), v.rowId(), v.name(), v.message(), prefixed(s.nodeId(), v.setPath())));
        }
        return new EngineEvaluationException(out);
    }

    private static List<String> prefixed(String nodeId, List<String> rest) {
        List<String> out = new ArrayList<>();
        out.add(nodeId);
        out.addAll(rest);
        return List.copyOf(out);
    }
```
- `trace(...)` 의 `NodeTrace` 인자 순서는 Task 1 Step 7 과 같다(CATCH 칸 3개 자리 `null, null, null`).
- `Caught`·`Ended`·`catchValues`·`restoreCatch`·`CatchKind.ofCode`·`Guarded.handlerFor` 는 CATCH 계획 Task 1~3 의 이름 그대로다. `SET_CALL_CYCLE`·`SET_CALL_DEPTH` 는 `CatchKind` 의 코드 목록에 없으므로 `ofCode` 가 빈 값을 돌려 받지 않는다.
- 처리 갈래(CATCH)·정상 갈래·MERGE 처리는 CATCH 그대로다. SET 이 받는 노드로 넘어가면 CATCH 의 처리 갈래 입구가 CATCH 노드 기록(`status=OK`, `catchKind`·`code`·`message`)을 남긴다.

- [ ] **Step 10: 통과 확인**

Run(공통 환경 뒤): `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)`
Expected: PASS — 새 시험 넷과 기존 시험 전부(`RuleSetFlowEvaluationTest`·`RuleSetTraceTest`·`RuleSetTraceEditTest`·CATCH 시험·계약 시험). 실패하면 실패 문구를 보고 구현을 고친다(기대값을 바꾸지 않는다).

Run: `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)` 와 `(cd src/backend/mdm && ../gradlew :api:test --console=plain -q)`
Expected: PASS(서버는 아직 SET 을 쓰지 않는다).

- [ ] **Step 11: 커밋**

```bash
/usr/bin/git add src/backend/maru-mdm-engine
/usr/bin/git commit -m "feat(mdm): 엔진이 SET 노드로 하위 세트를 실행하고 받는 노드·setPath·calls·sub 를 남긴다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/backend/maru-mdm-engine
```

---

### Task 5: 분석기 — `SetCallIo`·`RuleSetInterface`·SET 노드 검사(서버·화면 두 벌)·`CALL_MISSING`·받는 노드 SET 규칙·코퍼스

> **갱신 메모(레인이 착수 때 반영, 2026-10-06 plan:0)** — 아래 본문은 `2e02d29d` 기준이다. 본문보다 이 메모와 Task 0 대조표가 앞선다.
> - 담당: 서버(`SetCallIo`·`RuleSetInterface`·`RuleSetAnalyzer`·`RuleSetPathState`)와 코퍼스 JSON 은 srv:5, TS(`set-model.ts`·`types.ts`, `flow-model.test.ts`·`set-model.test.ts`·`helpers/engine-paths.ts`)는 ui:5t. 코퍼스 JSON 은 Java·TS 공용이고 srv 소유다. `MIN_CASES` 는 지금 90 이다(Java·TS 같은 값으로 올린다).
> - `SetCallIo.exists` = 기준 시각에 RELEASED 가 있음(DRAFT 만 있으면 없음, Ruling 24). `CALL_MISSING` 수준은 WARN(편차 13).
> - TASK 받는 노드의 `CATCH_NEVER`(D-136 A4) 옆에 SET 규칙(`SUBSET_ENDED` + `endsEarly=false`)을 둔다. `endsEarly` 는 편차 10 의 정의를 쓴다.
> - 구조 코퍼스 사례(Task 2 몫)도 srv:5 가 함께 넣는다: SET 이 모이는 자리·돌아오는 자리, SET 받는 노드 처리 갈래의 돌아옴·끝냄·끝내는 IF 갈래, h2 문구.

**모델:** opus — 서버·화면 두 분석기를 같은 문구·같은 순서로 넓히고, 코퍼스로 두 벌을 묶는다. 기존 RULE 만 있는 흐름의 문구·순서가 한 글자도 바뀌면 안 된다.

**이 태스크가 정한 것:**
- 분석기는 SET 노드의 겉모양을 룰 입출력 맵에 키 `set:{setId}` 로 넣고 RULE 처럼 돈다(Ruling 6). 입출력 표(`io`)의 `users`·`by`·`readers` 와 `deps` 의 키에도 `set:{setId}` 가 그대로 나온다(화면 표는 Task 8 이 `세트 {setId}` 로 보인다).
- 검사 문구에서 세트는 `세트 {setId}`, `RuleSetCheck.ruleId`·`otherRuleId` 칸은 `setId` 다. RULE 의 문구는 그대로다.
- `always=false` 출력은 그 이름이 아직 `defined` 가 아니면 `maybe` 에 넣는다(Ruling 7).
- `EMPTY` 는 RULE·TASK·SET 노드가 하나도 없을 때다(Ruling 18 — SET 만 있는 세트도 저장할 수 있다).
- COND_UNTYPED 의 "선언한 이름"은 지금처럼 이 세트의 룰만 센다(엔진 `FlowKeys.condTypes` 가 하위 세트 선언을 쓰지 않으므로 — Ruling 20).
- `CALL_MISSING` 은 룰 존재 검사 바로 뒤, `EMPTY` 앞에 노드 배열 순서로 낸다(Ruling 8).
- `FLOW_CATCH`·`CATCH_NEVER` 의 SET 규칙(Ruling 9)은 CATCH 계획 Task 4 의 `PathWalk.never(Guarded)`(TS `never`)에 더한다. 칸 규칙은 CATCH 와 같다: `CATCH_NEVER` 는 `ruleId` = 대상 ID(SET 이면 `setId`), `nodeId` = 받는 노드. 종류·대상 불일치 `FLOW_CATCH` 는 `ruleId` null, `nodeId` = 받는 노드.
- 서버 `RuleSetPathState.before` 는 SET 노드의 always 출력을 정의된 이름으로 센다(룰 확정 때 세트 순서 검사가 SET 노드 뒤 룰을 잘못 문제 삼지 않게). 함수 인자로 받고, `RuleSetOrderCheck` 연결은 Task 6 이 한다.

**Files:**
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/SetCallIo.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetInterface.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCheck.java:20-38`(코드 넷)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetAnalyzer.java`(`io`·`deps`·`checks` 겹정의, 새 `callKeys`·`keyOf`·`withCalls`·`disp`·`callMissing`, `PathWalk` 의 `rule` → `step`·`producers`·`parallelEarlier`·`prodBy`, CATCH 받는 노드 검사 자리)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetPathState.java:46-50, 92-118`(`before` 겹정의·`Walk`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts`(`SetCallIo`·`SetCallOutput`·`SetCallIoMap`, `RuleSetCheckCode` 넷)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts`(`flowIo`·`flowDeps`·`flowChecks` 인자, 새 `setKey`·`isSetKey`·`setIdOfKey`·`flowCallKeys`·`withCalls`·`callRuleIo`, `pathChecks` 의 `rule` → `step`, `SEAM(T5)`, CATCH 받는 노드 검사 자리)
- Modify(Test): `src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json`(사례 9개)
- Modify(Test): `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java`(`calls` 읽기, `MIN_CASES`)
- Modify(Test): `src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts`(`calls` 읽기, `MIN_CASES`)
- Create(Test): `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetInterfaceTest.java`
- Modify(Test): `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetPathStateTest.java`(사례 하나)

**Interfaces:**
- Consumes: Task 2(`SetStep`·`CallStep`·`FlowTree.callSteps`·TS `flowSetIds`·`CallStep`), CATCH(`Guarded`·`FLOW_CATCH`·`CATCH_NEVER`·`RuleIo.hasDefault`).
- Produces:
  - Java `public record SetCallIo(String setId, String setName, boolean exists, String status, List<IoName> inputs, List<OutputName> outputs, boolean endsEarly)`, `record SetCallIo.OutputName(String name, String dataType, Integer scale, boolean dateString, String maruCodeId, boolean always)`, `static SetCallIo missing(String setId)`, `static String key(String setId)`(= `"set:" + setId`), `static boolean isKey(String)`, `static String idOf(String key)`(접두 뗀 ID, 키가 아니면 그대로), `RuleIo asRuleIo()`, `boolean sameShape(SetCallIo other)`(입력 이름·타입, 출력 이름·타입·always 를 집합으로 비교).
  - Java `RuleSetInterface.of(String setId, String setName, boolean exists, String status, FlowDefinition flow, Map<String, RuleIo> rules, Map<String, SetCallIo> calls): SetCallIo`
  - Java `RuleSetAnalyzer.checks(FlowDefinition, Map<String, RuleIo>, Map<String, CondIo>, Map<String, SetCallIo>)`, `io(FlowDefinition, Map<String, RuleIo>, Map<String, SetCallIo>)`, `deps(FlowDefinition, Map<String, RuleIo>, Map<String, SetCallIo>)` — 3인자·2인자는 빈 맵으로 위임. 패키지 전용 `callKeys(FlowDefinition, FlowParse)`·`withCalls(...)`.
  - Java `RuleSetCheck.CALL_MISSING`·`CALL_CYCLE`·`CALL_DEPTH`·`CALLER_BROKEN`(모두 REJECT 로 쓴다).
  - Java `RuleSetPathState.before(FlowTree, Function<String, Set<String>> produces, Function<String, Set<String>> setProduces)` — `setProduces` 는 세트 ID → always 출력. 2인자는 빈 집합 함수로 위임.
  - TS `export interface SetCallOutput { name: string; dataType: string | null; scale: number | null; dateString: boolean; maruCodeId: string | null; always: boolean }`, `export interface SetCallIo { setId: string; setName: string | null; exists: boolean; status: string | null; inputs: IoName[]; outputs: SetCallOutput[]; endsEarly: boolean }`, `export type SetCallIoMap = Readonly<Record<string, SetCallIo | undefined>>`.
  - TS `flowChecks(flow, rules, condIo, calls: SetCallIoMap = {})`, `flowIo(flow, rules, calls = {})`, `flowDeps(flow, rules, calls = {})`, `export const setKey = (setId: string) => "set:" + setId`, `export const isSetKey`, `export const setIdOfKey`, `export function flowCallKeys(flow, parsed?)`.

- [ ] **Step 1: 코퍼스 사례 9개 — `rule-set-corpus.json` 의 `cases` 끝에 더한다**

받는 노드 노드 모양(`attachTo`·`catches`)은 CATCH 코퍼스 사례와 같게 쓴다.

```json
    {
      "name": "하위 세트 — 앞 룰이 뒤 SET 노드의 출력을 읽으면 ORDER",
      "flow": {"version": 1,
        "nodes": [{"id": "start", "kind": "START"}, {"id": "r1", "kind": "RULE", "ruleId": "R_USE"}, {"id": "s1", "kind": "SET", "setId": "SP"}, {"id": "end", "kind": "END"}],
        "edges": [{"id": "e1", "from": "start", "to": "r1"}, {"id": "e2", "from": "r1", "to": "s1"}, {"id": "e3", "from": "s1", "to": "end"}]},
      "ids": ["R_USE"],
      "rules": {"R_USE": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "P", "source": "NONE"}], "results": [{"name": "U"}]}},
      "calls": {"SP": {"exists": true, "status": "INUSE", "inputs": [{"name": "X", "source": "DICT"}], "outputs": [{"name": "P", "always": true}], "endsEarly": false}},
      "expect": {
        "io": {"inputs": [{"name": "P", "source": "NONE", "users": ["R_USE"]}, {"name": "X", "source": "DICT", "users": ["set:SP"]}],
               "results": [{"name": "U", "by": ["R_USE"], "readers": []}, {"name": "P", "by": ["set:SP"], "readers": []}]},
        "deps": {"R_USE": ["set:SP"], "set:SP": []},
        "checks": [{"code": "ORDER", "severity": "REJECT", "ruleId": "R_USE", "otherRuleId": "SP", "varName": "P",
                    "message": "R_USE가 뒤에 도는 세트 SP의 결과 변수 P를 읽는다. 세트 SP를 R_USE 앞으로 옮긴다", "nodeId": "r1"}]
      }
    },
    {
      "name": "하위 세트 — SET 출력과 뒤 룰 결과가 같은 이름이면 DUP_RESULT",
      "flow": {"version": 1,
        "nodes": [{"id": "start", "kind": "START"}, {"id": "s1", "kind": "SET", "setId": "SP"}, {"id": "r2", "kind": "RULE", "ruleId": "R_P2"}, {"id": "end", "kind": "END"}],
        "edges": [{"id": "e1", "from": "start", "to": "s1"}, {"id": "e2", "from": "s1", "to": "r2"}, {"id": "e3", "from": "r2", "to": "end"}]},
      "ids": ["R_P2"],
      "rules": {"R_P2": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [], "results": [{"name": "P"}]}},
      "calls": {"SP": {"exists": true, "status": "INUSE", "inputs": [], "outputs": [{"name": "P", "always": true}], "endsEarly": false}},
      "expect": {
        "io": {"inputs": [], "results": [{"name": "P", "by": ["set:SP", "R_P2"], "readers": []}]},
        "deps": {"set:SP": [], "R_P2": []},
        "checks": [{"code": "DUP_RESULT", "severity": "WARN", "ruleId": "R_P2", "otherRuleId": "SP", "varName": "P",
                    "message": "세트 SP와 R_P2가 같은 결과 변수 P에 대입한다", "nodeId": "r2"}]
      }
    },
    {
      "name": "하위 세트 — 일부 경로에서만 만드는 출력(always=false)을 뒤에서 읽으면 FLOW_PARTIAL",
      "flow": {"version": 1,
        "nodes": [{"id": "start", "kind": "START"}, {"id": "s1", "kind": "SET", "setId": "SQ"}, {"id": "r2", "kind": "RULE", "ruleId": "R_RQ"}, {"id": "end", "kind": "END"}],
        "edges": [{"id": "e1", "from": "start", "to": "s1"}, {"id": "e2", "from": "s1", "to": "r2"}, {"id": "e3", "from": "r2", "to": "end"}]},
      "ids": ["R_RQ"],
      "rules": {"R_RQ": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "Q", "source": "NONE"}], "results": [{"name": "W"}]}},
      "calls": {"SQ": {"exists": true, "status": "INUSE", "inputs": [], "outputs": [{"name": "Q", "always": false}], "endsEarly": false}},
      "expect": {
        "io": {"inputs": [], "results": [{"name": "Q", "by": ["set:SQ"], "readers": ["R_RQ"]}, {"name": "W", "by": ["R_RQ"], "readers": []}]},
        "deps": {"set:SQ": [], "R_RQ": ["set:SQ"]},
        "checks": [{"code": "FLOW_PARTIAL", "severity": "WARN", "ruleId": "R_RQ", "varName": "Q",
                    "message": "R_RQ가 읽는 Q는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다", "nodeId": "r2"}]
      }
    },
    {
      "name": "하위 세트 — 같은 IF 다른 갈래의 SET 출력을 읽으면 IF_SIBLING",
      "flow": {"version": 1,
        "nodes": [{"id": "start", "kind": "START"}, {"id": "if1", "kind": "IF"}, {"id": "s1", "kind": "SET", "setId": "SP"},
                  {"id": "r2", "kind": "RULE", "ruleId": "R_USE2"}, {"id": "m1", "kind": "MERGE", "splitId": "if1"}, {"id": "end", "kind": "END"}],
        "edges": [{"id": "e1", "from": "start", "to": "if1"}, {"id": "b1", "from": "if1", "to": "s1", "order": 1, "cond": "A == 1"},
                  {"id": "bo", "from": "if1", "to": "r2", "otherwise": true}, {"id": "e2", "from": "s1", "to": "m1"}, {"id": "e3", "from": "r2", "to": "m1"},
                  {"id": "e4", "from": "m1", "to": "end"}]},
      "condIo": {"b1": {"ok": true, "message": null, "vars": [{"name": "A", "source": "DICT"}]}},
      "ids": ["R_USE2"],
      "rules": {"R_USE2": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "A", "source": "DICT"}, {"name": "P", "source": "NONE"}], "results": [{"name": "U"}]}},
      "calls": {"SP": {"exists": true, "status": "INUSE", "inputs": [], "outputs": [{"name": "P", "always": true}], "endsEarly": false}},
      "expect": {
        "io": {"inputs": [{"name": "A", "source": "DICT", "users": ["R_USE2"]}],
               "results": [{"name": "P", "by": ["set:SP"], "readers": ["R_USE2"]}, {"name": "U", "by": ["R_USE2"], "readers": []}]},
        "deps": {"set:SP": [], "R_USE2": ["set:SP"]},
        "checks": [{"code": "IF_SIBLING", "severity": "REJECT", "ruleId": "R_USE2", "otherRuleId": "SP", "varName": "P",
                    "message": "R_USE2가 읽는 P는 같은 IF 의 다른 갈래(세트 SP)에서만 만들어진다. 이 갈래를 타면 값이 없다", "nodeId": "r2"}]
      }
    },
    {
      "name": "하위 세트 — 세트 ID 없음·없는 세트·폐기 세트는 CALL_MISSING, 같은 세트는 첫 노드에만",
      "flow": {"version": 1,
        "nodes": [{"id": "start", "kind": "START"}, {"id": "s1", "kind": "SET"}, {"id": "s2", "kind": "SET", "setId": "NOPE"},
                  {"id": "s3", "kind": "SET", "setId": "OLD"}, {"id": "s4", "kind": "SET", "setId": "NOPE"}, {"id": "end", "kind": "END"}],
        "edges": [{"id": "e1", "from": "start", "to": "s1"}, {"id": "e2", "from": "s1", "to": "s2"}, {"id": "e3", "from": "s2", "to": "s3"},
                  {"id": "e4", "from": "s3", "to": "s4"}, {"id": "e5", "from": "s4", "to": "end"}]},
      "ids": [],
      "rules": {},
      "calls": {"NOPE": {"exists": false}, "OLD": {"exists": true, "status": "DEPRECATED", "inputs": [], "outputs": [], "endsEarly": false}},
      "expect": {
        "io": {"inputs": [], "results": []},
        "deps": {"set:NOPE": [], "set:OLD": []},
        "checks": [
          {"code": "CALL_MISSING", "severity": "REJECT", "message": "세트 노드 s1에 세트 ID가 없다", "nodeId": "s1"},
          {"code": "CALL_MISSING", "severity": "REJECT", "ruleId": "NOPE", "message": "NOPE는 없는 세트다", "nodeId": "s2"},
          {"code": "CALL_MISSING", "severity": "REJECT", "ruleId": "OLD", "message": "OLD는 폐기된 세트다", "nodeId": "s3"}]
      }
    },
    {
      "name": "하위 세트 — SET 노드에 결과 없음(NO_RESULT)을 받는 노드는 FLOW_CATCH",
      "flow": {"version": 1,
        "nodes": [{"id": "start", "kind": "START"}, {"id": "s1", "kind": "SET", "setId": "SP"}, {"id": "c1", "kind": "CATCH", "attachTo": "s1", "catches": ["NO_RESULT"]},
                  {"id": "end", "kind": "END"}],
        "edges": [{"id": "e1", "from": "start", "to": "s1"}, {"id": "e2", "from": "s1", "to": "end"}, {"id": "e3", "from": "c1", "to": "end"}]},
      "ids": [],
      "rules": {},
      "calls": {"SP": {"exists": true, "status": "INUSE", "inputs": [], "outputs": [], "endsEarly": false}},
      "expect": {
        "io": {"inputs": [], "results": []},
        "deps": {"set:SP": []},
        "checks": [{"code": "FLOW_CATCH", "severity": "REJECT", "message": "받는 노드 c1: 세트 노드에는 결과 없음(NO_RESULT)을 붙일 수 없다", "nodeId": "c1"}]
      }
    },
    {
      "name": "하위 세트 — 룰 노드에 하위 세트 예외 끝(SUBSET_ENDED)을 받는 노드는 FLOW_CATCH",
      "flow": {"version": 1,
        "nodes": [{"id": "start", "kind": "START"}, {"id": "r1", "kind": "RULE", "ruleId": "R_K"}, {"id": "c1", "kind": "CATCH", "attachTo": "r1", "catches": ["SUBSET_ENDED"]},
                  {"id": "end", "kind": "END"}],
        "edges": [{"id": "e1", "from": "start", "to": "r1"}, {"id": "e2", "from": "r1", "to": "end"}, {"id": "e3", "from": "c1", "to": "end"}]},
      "ids": ["R_K"],
      "rules": {"R_K": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [], "results": [{"name": "K"}]}},
      "expect": {
        "io": {"inputs": [], "results": [{"name": "K", "by": ["R_K"], "readers": []}]},
        "deps": {"R_K": []},
        "checks": [{"code": "FLOW_CATCH", "severity": "REJECT", "message": "받는 노드 c1: 룰 노드에는 하위 세트 예외 끝(SUBSET_ENDED)을 붙일 수 없다", "nodeId": "c1"}]
      }
    },
    {
      "name": "하위 세트 — SUBSET_ENDED 인데 하위 세트에 END 로 가는 처리 갈래가 없으면 CATCH_NEVER",
      "flow": {"version": 1,
        "nodes": [{"id": "start", "kind": "START"}, {"id": "s1", "kind": "SET", "setId": "SP"}, {"id": "c1", "kind": "CATCH", "attachTo": "s1", "catches": ["SUBSET_ENDED"]},
                  {"id": "end", "kind": "END"}],
        "edges": [{"id": "e1", "from": "start", "to": "s1"}, {"id": "e2", "from": "s1", "to": "end"}, {"id": "e3", "from": "c1", "to": "end"}]},
      "ids": [],
      "rules": {},
      "calls": {"SP": {"exists": true, "status": "INUSE", "inputs": [], "outputs": [], "endsEarly": false}},
      "expect": {
        "io": {"inputs": [], "results": []},
        "deps": {"set:SP": []},
        "checks": [{"code": "CATCH_NEVER", "severity": "WARN", "ruleId": "SP", "message": "받는 노드 c1: 세트 SP에는 END 로 가는 처리 갈래가 없어 하위 세트 예외 끝이 일어나지 않는다", "nodeId": "c1"}]
      }
    },
    {
      "name": "하위 세트 — SUBSET_ENDED 를 받을 수 있고 SET 노드만 있어도 EMPTY 가 아니다",
      "flow": {"version": 1,
        "nodes": [{"id": "start", "kind": "START"}, {"id": "s1", "kind": "SET", "setId": "SP"}, {"id": "c1", "kind": "CATCH", "attachTo": "s1", "catches": ["SUBSET_ENDED"]},
                  {"id": "end", "kind": "END"}],
        "edges": [{"id": "e1", "from": "start", "to": "s1"}, {"id": "e2", "from": "s1", "to": "end"}, {"id": "e3", "from": "c1", "to": "end"}]},
      "ids": [],
      "rules": {},
      "calls": {"SP": {"exists": true, "status": "INUSE", "inputs": [], "outputs": [], "endsEarly": true}},
      "expect": {"io": {"inputs": [], "results": []}, "deps": {"set:SP": []}, "checks": []}
    }
```

- [ ] **Step 2: 러너 두 벌이 `calls` 를 읽게 한다**

`RuleSetCorpusTest.java`:
- `MIN_CASES` 를 CATCH 계획 Task 4 가 올린 `64` 에 이 계획 사례 9 를 더한 `73` 으로 올린다(TS 러너도 같은 값). Task 0 장부의 값이 64 가 아니면 그 값 + 9 다.
- 클래스 javadoc 읽기 규칙에 한 줄: `{@code calls} 원소(세트 ID → 겉모양)의 빠진 칸은 false·null·빈 목록이다. flow 사례의 io·deps·checks 는 calls 를 넘기는 겹정의로 계산한다.`
- 사례 본문의 계산 세 줄을 바꾼다.
```java
        Map<String, SetCallIo> calls = new LinkedHashMap<>();
        c.path("calls").properties().forEach(e -> calls.put(e.getKey(), call(e.getKey(), e.getValue())));
```
```java
        SetIo io = flow == null ? RuleSetAnalyzer.io(ids, rules) : RuleSetAnalyzer.io(flow, rules, calls);
```
```java
        Map<String, List<String>> actualDeps = flow == null ? RuleSetAnalyzer.deps(ids, rules) : RuleSetAnalyzer.deps(flow, rules, calls);
```
```java
        List<RuleSetCheck> actual = flow == null ? RuleSetAnalyzer.checks(ids, rules) : RuleSetAnalyzer.checks(flow, rules, condIo(c.path("condIo")), calls);
```
- 도우미(`rule(...)` 아래):
```java
    static SetCallIo call(String id, JsonNode n) {
        List<IoName> inputs = new ArrayList<>();
        n.path("inputs").forEach(i -> inputs.add(new IoName(text(i, "name"), text(i, "source"), null, null, null, false, null)));
        List<SetCallIo.OutputName> outputs = new ArrayList<>();
        n.path("outputs").forEach(o -> outputs.add(new SetCallIo.OutputName(text(o, "name"), null, null, false, null, o.path("always").asBoolean(false))));
        return new SetCallIo(id, null, n.path("exists").asBoolean(false), text(n, "status"), inputs, outputs, n.path("endsEarly").asBoolean(false));
    }
```

`rule-set-corpus.test.ts`:
- `MIN_CASES` 를 Java 와 같은 값으로.
- 타입·도우미(파일 위 `CorpusRule` 뒤):
```ts
interface CorpusCall {
  exists?: boolean;
  status?: string | null;
  inputs?: Array<{ name: string; source?: IoSource | null }>;
  outputs?: Array<{ name: string; always?: boolean }>;
  endsEarly?: boolean;
}
```
  `CorpusFlowNode` 에 `setId?: string | null;` 를, `CorpusCase` 에 `calls?: Record<string, CorpusCall>;` 를 더한다. `flowOf` 의 노드 매핑에 `...(n.setId != null ? { setId: n.setId } : {})` 를 더한다(CATCH 가 `attachTo`·`catches` 를 같은 방식으로 더했으면 그 옆).
```ts
function call(id: string, c: CorpusCall): SetCallIo {
  return {
    setId: id,
    setName: null,
    exists: c.exists ?? false,
    status: c.status ?? null,
    inputs: (c.inputs ?? []).map((i) => ioName(i.name, i.source ?? null)),
    outputs: (c.outputs ?? []).map((o) => ({ name: o.name, dataType: null, scale: null, dateString: false, maruCodeId: null, always: o.always ?? false })),
    endsEarly: c.endsEarly ?? false,
  };
}
```
- 사례 본문:
```ts
    const calls: Record<string, SetCallIo> = {};
    for (const [id, x] of Object.entries(c.calls ?? {})) calls[id] = call(id, x);
```
  `flowIo(flow, rules)` → `flowIo(flow, rules, calls)`, `flowDeps(flow, rules)` → `flowDeps(flow, rules, calls)`, `flowChecks(flow, rules, condIoOf(c.condIo))` → `flowChecks(flow, rules, condIoOf(c.condIo), calls)`. import 에 `SetCallIo` 를 더한다.

- [ ] **Step 3: 서버 단위 시험 — `RuleSetInterfaceTest.java`·`RuleSetPathStateTest`**

```java
package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 하위 세트 spec §2 — 겉모양(입력·최종 결과·always·endsEarly). 엔진 SetShape 와 같은 알고리즘(편차 8). */
class RuleSetInterfaceTest {

    private static RuleIo rule(String id, List<String> conds, List<String> results) {
        return RuleSetCorpusTest.rule(id, json(conds, results));
    }

    private static com.fasterxml.jackson.databind.JsonNode json(List<String> conds, List<String> results) {
        var m = new com.fasterxml.jackson.databind.ObjectMapper();
        var n = m.createObjectNode();
        n.put("exists", true);
        n.put("status", "INUSE");
        n.put("releasedVer", 1);
        var cs = n.putArray("conds");
        conds.forEach(c -> cs.addObject().put("name", c).put("source", "NONE"));
        var rs = n.putArray("results");
        results.forEach(r -> rs.addObject().put("name", r));
        return n;
    }

    private static String flow(String nodes, String edges) {
        return "{\"version\":1,\"nodes\":[" + nodes + "],\"edges\":[" + edges + "]}";
    }

    @Test
    void 앞에서_읽고_뒤에서_만든_이름은_최종_결과이고_만든_뒤_읽힌_이름은_중간_결과() {
        var f = RuleSetFlowJson.parse(flow(
                "{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"a\",\"kind\":\"RULE\",\"ruleId\":\"C_A\"},{\"id\":\"b\",\"kind\":\"RULE\",\"ruleId\":\"C_B\"},{\"id\":\"end\",\"kind\":\"END\"}",
                "{\"id\":\"e1\",\"from\":\"start\",\"to\":\"a\"},{\"id\":\"e2\",\"from\":\"a\",\"to\":\"b\"},{\"id\":\"e3\",\"from\":\"b\",\"to\":\"end\"}"));
        SetCallIo io = RuleSetInterface.of("C", "C 세트", true, "INUSE", f,
                Map.of("C_A", rule("C_A", List.of("Y"), List.of("A")), "C_B", rule("C_B", List.of("A"), List.of("Y"))), Map.of());
        assertEquals(List.of("Y"), io.inputs().stream().map(IoName::name).toList());
        assertEquals(List.of("Y"), io.outputs().stream().map(SetCallIo.OutputName::name).toList());
        assertTrue(io.outputs().get(0).always());
        assertFalse(io.endsEarly());
    }

    @Test
    void IF_한_갈래에서만_만든_출력은_always_가_아니고_손주_세트의_always_false_도_이어진다() {
        var f = RuleSetFlowJson.parse(flow(
                "{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"if1\",\"kind\":\"IF\"},{\"id\":\"rp\",\"kind\":\"RULE\",\"ruleId\":\"R_P\"},"
                        + "{\"id\":\"s1\",\"kind\":\"SET\",\"setId\":\"G\"},{\"id\":\"m1\",\"kind\":\"MERGE\",\"splitId\":\"if1\"},{\"id\":\"end\",\"kind\":\"END\"}",
                "{\"id\":\"e0\",\"from\":\"start\",\"to\":\"if1\"},{\"id\":\"b1\",\"from\":\"if1\",\"to\":\"rp\",\"order\":1,\"cond\":\"Y > 0\"},"
                        + "{\"id\":\"bo\",\"from\":\"if1\",\"to\":\"s1\",\"otherwise\":true},{\"id\":\"e1\",\"from\":\"rp\",\"to\":\"m1\"},"
                        + "{\"id\":\"e2\",\"from\":\"s1\",\"to\":\"m1\"},{\"id\":\"e3\",\"from\":\"m1\",\"to\":\"end\"}"));
        SetCallIo g = new SetCallIo("G", "G 세트", true, "INUSE", List.of(), List.of(new SetCallIo.OutputName("P", null, null, false, null, true),
                new SetCallIo.OutputName("H", null, null, false, null, false)), false);
        SetCallIo io = RuleSetInterface.of("S", "S 세트", true, "INUSE", f, Map.of("R_P", rule("R_P", List.of("Y"), List.of("P"))), Map.of("G", g));
        assertEquals(List.of("P:true", "H:false"), io.outputs().stream().map(o -> o.name() + ":" + o.always()).toList(),
                "P 는 두 갈래 모두에서 반드시 만들어진다(R_P, 손주 G 의 always P)");
    }

    @Test
    void 없는_세트의_겉모양은_빈_목록이고_겉모양_비교는_이름_타입_always_만_본다() {
        SetCallIo none = SetCallIo.missing("X");
        assertFalse(none.exists());
        SetCallIo a = new SetCallIo("S", "S 세트", true, "INUSE", List.of(new IoName("Y", "DICT", "와이", "NUMBER", 0, false, null)),
                List.of(new SetCallIo.OutputName("P", "NUMBER", 0, false, null, true)), false);
        SetCallIo b = new SetCallIo("S", "다른 이름", true, "DEPRECATED", List.of(new IoName("Y", "NONE", "다른 표시명", "NUMBER", 2, false, null)),
                List.of(new SetCallIo.OutputName("P", "NUMBER", 2, false, null, true)), true);
        assertTrue(a.sameShape(b), "이름·출처·표시명·소수 자리·상태·endsEarly 는 보지 않는다");
        SetCallIo c = new SetCallIo("S", "S 세트", true, "INUSE", a.inputs(), List.of(new SetCallIo.OutputName("P", "NUMBER", 0, false, null, false)), false);
        assertFalse(a.sameShape(c), "always 가 바뀌면 다르다");
    }
}
```
`RuleSetCorpusTest.rule(...)` 은 CATCH 계획 Task 4 이후 `hitPolicy`·`hasDefault` 를 읽는다. 그대로 쓴다(정적 패키지 메서드다).

`RuleSetPathStateTest.java` 끝에:
```java
    @Test
    void SET_노드는_setProduces_가_준_출력을_정의된_이름으로_센다() {
        var f = RuleSetFlowJson.parse("{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"s1\",\"kind\":\"SET\",\"setId\":\"G\"},"
                + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"R1\"},{\"id\":\"end\",\"kind\":\"END\"}],\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"s1\"},"
                + "{\"id\":\"e2\",\"from\":\"s1\",\"to\":\"r1\"},{\"id\":\"e3\",\"from\":\"r1\",\"to\":\"end\"}]}");
        var tree = kr.dongkuk.maru.mdm.engine.flow.FlowParser.parse(f).tree();
        var before = RuleSetPathState.before(tree, id -> java.util.Set.of(), setId -> "G".equals(setId) ? java.util.Set.of("P") : java.util.Set.of());
        assertTrue(before.get("r1").defined().contains("P"));
    }
```
(`assertTrue` import 가 없으면 더한다.)

- [ ] **Step 4: 실패 확인**

Run(공통 환경 뒤): `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetCorpusTest' --tests '*RuleSetInterfaceTest' --tests '*RuleSetPathStateTest' --console=plain)` 와 `pnpm --dir src/frontend --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/rule-set-corpus.test.ts`
Expected: 컴파일 오류(`SetCallIo` 없음) / TS 타입 오류·사례 9개 FAIL.

- [ ] **Step 5: 서버 구현 — `SetCallIo.java`·`RuleSetCheck`·`RuleSetInterface.java`**

```java
package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 하위 세트의 겉모양(하위 세트 spec §2, 편차 10) — 부모가 보는 입력·최종 결과(출력마다 always)·처리 갈래로 끝낼 수 있는가. 서버만 계산하고
 * ({@link RuleSetInterface}, C-D4) 화면은 받아서 검사에 넣는다. 분석기는 이것을 키 {@code set:{setId}} 의 룰 입출력처럼 본다(Ruling 6).
 *
 * @param setName   세트명(화면 SET 노드 제목·속성 패널). 없는 세트면 null
 * @param status    세트 상태(INUSE·DEPRECATED). 없는 세트면 null
 * @param endsEarly 하위 세트 흐름에 END 로 가는 처리 갈래가 있는가(CATCH_NEVER — SUBSET_ENDED)
 */
public record SetCallIo(String setId, String setName, boolean exists, String status, List<IoName> inputs, List<OutputName> outputs, boolean endsEarly) {

    /** 최종 결과 하나 — always 는 END 에 닿는 모든 경로에서 반드시 만들어지는가. */
    public record OutputName(String name, String dataType, Integer scale, boolean dateString, String maruCodeId, boolean always) {
    }

    public static final String KEY_PREFIX = "set:";

    public static SetCallIo missing(String setId) {
        return new SetCallIo(setId, null, false, null, List.of(), List.of(), false);
    }

    /** 분석기 맵 키(룰 ID 와 겹치지 않는다 — 소문자 접두는 ID 정규식에 없다). */
    public static String key(String setId) {
        return KEY_PREFIX + setId;
    }

    public static boolean isKey(String key) {
        return key != null && key.startsWith(KEY_PREFIX);
    }

    /** 키에서 세트 ID. 세트 키가 아니면 그대로(룰 ID). */
    public static String idOf(String key) {
        return isKey(key) ? key.substring(KEY_PREFIX.length()) : key;
    }

    /** 분석기용 룰 입출력 — 입력은 조건, 출력은 결과. 없는 세트면 exists=false(조건·결과 없음). */
    public RuleIo asRuleIo() {
        List<IoName> results = outputs.stream()
                .map(o -> new IoName(o.name(), null, null, o.dataType(), o.scale(), o.dateString(), o.maruCodeId()))
                .toList();
        return new RuleIo(key(setId), null, null, status, exists, exists ? 1 : null, null, inputs, results); // hasDefault=false 인 9칸 생성자
    }

    /** 연쇄 재검사 판단(하위 세트 spec §6.1-2) — 입력의 이름·타입, 출력의 이름·타입·always 가 집합으로 같은가. 세트명·상태·출처·표시명·endsEarly 는 보지 않는다. */
    public boolean sameShape(SetCallIo other) {
        return shapeOf(this).equals(shapeOf(other));
    }

    private static Set<List<Object>> shapeOf(SetCallIo io) {
        Set<List<Object>> out = new HashSet<>();
        io.inputs().forEach(i -> out.add(java.util.Arrays.asList("in", i.name(), i.dataType())));
        io.outputs().forEach(o -> out.add(java.util.Arrays.asList("out", o.name(), o.dataType(), o.always())));
        return out;
    }
}
```
`asRuleIo` 는 CATCH 계획 Task 4 가 남긴 9칸 위임 생성자(`…, hitPolicy, conds, results`, `hasDefault=false`)를 쓴다. 정식 생성자는 `hasDefault` 가 끝 칸이다.

`RuleSetCheck.java` 의 `EMPTY_TASK` 뒤에:
```java
    /** SET 노드의 세트 ID 가 없거나, 세트가 없거나, 폐기 세트다(REJECT, 하위 세트 spec §5). 화면도 낸다. */
    public static final String CALL_MISSING = "CALL_MISSING";
    /** 저장된 세트 호출 그래프에 순환이 있다(REJECT, 서버만). */
    public static final String CALL_CYCLE = "CALL_CYCLE";
    /** 세트 호출 단계가 5 를 넘는다(REJECT, 서버만). */
    public static final String CALL_DEPTH = "CALL_DEPTH";
    /** 이 저장·폐기로 부르는 세트에 없던 거부가 생긴다(REJECT, 서버만, 하위 세트 spec §6). */
    public static final String CALLER_BROKEN = "CALLER_BROKEN";
```

`RuleSetInterface.java`:
```java
package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import com.dongkuk.dmes.mdm.common.rule.RuleSetAnalyzer.SetIo;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import kr.dongkuk.maru.mdm.engine.flow.Block;
import kr.dongkuk.maru.mdm.engine.flow.Branch;
import kr.dongkuk.maru.mdm.engine.flow.CallStep;
import kr.dongkuk.maru.mdm.engine.flow.FlowParse;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.flow.Guarded;
import kr.dongkuk.maru.mdm.engine.flow.RuleStep;
import kr.dongkuk.maru.mdm.engine.flow.Seq;
import kr.dongkuk.maru.mdm.engine.flow.SetStep;
import kr.dongkuk.maru.mdm.engine.flow.Split;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;

/**
 * 세트의 겉모양 계산(하위 세트 spec §2) — 스프링·DB 없는 순수 함수. 입력·최종 결과는 {@link RuleSetAnalyzer#io} 의 것이고, always 는 END 에 닿는 모든
 * 경로의 END 직전 상태로 정한다(Ruling 16). 엔진 {@code SetShape} 가 같은 알고리즘을 실행용으로 갖는다 — 바꾸면 함께 바꾸고
 * {@code SetCallIoEngineAgreementTest} 로 확인한다.
 */
public final class RuleSetInterface {

    private RuleSetInterface() {
    }

    /**
     * @param flow  세트 흐름(FLOW_JSON 이 없는 세트는 {@code FlowParser.linear(ruleIds)})
     * @param rules 흐름의 룰 입출력(RuleIoReader 결과, 룰 저장 검사는 저장하려는 정의로 한 항목을 바꾼 맵)
     * @param calls 흐름의 SET 노드가 부르는 세트의 겉모양(세트 ID →, 손주는 호출자가 먼저 계산한다)
     */
    public static SetCallIo of(String setId, String setName, boolean exists, String status, FlowDefinition flow, Map<String, RuleIo> rules,
            Map<String, SetCallIo> calls) {
        if (!exists) {
            return SetCallIo.missing(setId);
        }
        FlowParse p = FlowParser.parse(flow);
        Map<String, RuleIo> all = RuleSetAnalyzer.withCalls(rules, calls);
        SetIo io = RuleSetAnalyzer.io(RuleSetAnalyzer.callKeys(flow, p), all);
        Set<String> end = p.tree() == null ? Set.of() : endSure(p.tree().root(), c -> sure(c, all, calls));
        List<IoName> inputs = io.inputs().stream()
                .map(i -> new IoName(i.name(), i.source(), i.label(), i.dataType(), i.scale(), i.dateString(), i.maruCodeId()))
                .toList();
        List<SetCallIo.OutputName> outputs = io.results().stream().filter(RuleSetAnalyzer.ResultRow::finalResult)
                .map(r -> new SetCallIo.OutputName(r.name(), r.dataType(), r.scale(), r.dateString(), r.maruCodeId(), end.contains(r.name())))
                .toList();
        return new SetCallIo(setId, setName, true, status, inputs, outputs, p.tree() != null && endsEarly(p.tree().root()));
    }

    private static Set<String> sure(CallStep c, Map<String, RuleIo> all, Map<String, SetCallIo> calls) {
        if (c instanceof RuleStep r) {
            RuleIo io = all.get(r.ruleId());
            Set<String> out = new HashSet<>();
            if (io != null && io.exists() && io.results() != null) {
                io.results().forEach(x -> out.add(x.name()));
            }
            return out;
        }
        SetCallIo s = calls.get(((SetStep) c).setId());
        Set<String> out = new HashSet<>();
        if (s != null) {
            s.outputs().stream().filter(SetCallIo.OutputName::always).forEach(o -> out.add(o.name()));
        }
        return out;
    }

    /** 엔진 SetShape.endSure 와 같은 걷기(Ruling 16). */
    static Set<String> endSure(Seq root, Function<CallStep, Set<String>> sure) {
        List<Set<String>> ends = new ArrayList<>();
        Set<String> st = new HashSet<>();
        walk(root, st, sure, ends);
        ends.add(st);
        Set<String> out = new HashSet<>(ends.get(0));
        ends.forEach(out::retainAll);
        return out;
    }

    private static void walk(Seq seq, Set<String> st, Function<CallStep, Set<String>> sure, List<Set<String>> ends) {
        for (Block b : seq.items()) {
            if (b instanceof RuleStep r) {
                st.addAll(sure.apply(r));
            } else if (b instanceof SetStep s) {
                st.addAll(sure.apply(s));
            } else if (b instanceof Seq q) {
                walk(q, st, sure, ends);
            } else if (b instanceof Split sp) {
                List<Set<String>> outs = new ArrayList<>();
                for (Branch br : sp.branches()) {
                    Set<String> b2 = new HashSet<>(st);
                    walk(br.body(), b2, sure, ends);
                    outs.add(b2);
                }
                if (sp.kind() == NodeKind.IF) {
                    Set<String> inter = new HashSet<>(outs.get(0));
                    outs.forEach(inter::retainAll);
                    st.addAll(inter);
                } else {
                    outs.forEach(st::addAll);
                }
            } else if (b instanceof Guarded g) {
                Set<String> base = new HashSet<>(st);
                Set<String> normal = new HashSet<>(base);
                normal.addAll(sure.apply(g.rule()));
                walk(g.normal(), normal, sure, ends);
                List<Set<String>> back = new ArrayList<>(List.of(normal));
                for (Guarded.Handler h : g.handlers()) {
                    Set<String> hs = new HashSet<>(base);
                    walk(h.body(), hs, sure, ends);
                    if (h.ends()) {
                        ends.add(hs);
                    } else {
                        back.add(hs);
                    }
                }
                Set<String> inter = new HashSet<>(back.get(0));
                back.forEach(inter::retainAll);
                st.clear();
                st.addAll(inter);
            }
        }
    }

    /** 흐름 어디든 END 로 가는 처리 갈래가 있는가(편차 10). */
    static boolean endsEarly(Seq seq) {
        for (Block b : seq.items()) {
            if (b instanceof Seq q && endsEarly(q)) {
                return true;
            }
            if (b instanceof Split sp && sp.branches().stream().anyMatch(br -> endsEarly(br.body()))) {
                return true;
            }
            if (b instanceof Guarded g && (endsEarly(g.normal())
                    || g.handlers().stream().anyMatch(h -> h.ends() || endsEarly(h.body())))) {
                return true;
            }
        }
        return false;
    }
}
```

- [ ] **Step 6: 서버 구현 — `RuleSetAnalyzer.java`**

겹정의(기존 2·3인자는 빈 맵으로 위임):
```java
    /** 흐름 입력의 입출력 표 — 펼친 목록 기준(D10). 하위 세트는 키 set:{setId} 의 룰처럼 센다(하위 세트 Ruling 6). */
    public static SetIo io(FlowDefinition flow, Map<String, RuleIo> rules) {
        return io(flow, rules, Map.of());
    }

    public static SetIo io(FlowDefinition flow, Map<String, RuleIo> rules, Map<String, SetCallIo> calls) {
        return io(callKeys(flow, FlowParser.parse(flow)), withCalls(rules, calls));
    }

    public static Map<String, List<String>> deps(FlowDefinition flow, Map<String, RuleIo> rules) {
        return deps(flow, rules, Map.of());
    }

    public static Map<String, List<String>> deps(FlowDefinition flow, Map<String, RuleIo> rules, Map<String, SetCallIo> calls) {
        return deps(callKeys(flow, FlowParser.parse(flow)), withCalls(rules, calls));
    }

    public static List<RuleSetCheck> checks(FlowDefinition flow, Map<String, RuleIo> rules, Map<String, CondIo> condIo) {
        return checks(flow, rules, condIo, Map.of());
    }
```
(기존 `io(flow, rules)`·`deps(flow, rules)` 가 `RuleSetFlowJson.ruleIds(flow)` 를 쓰던 몸체를 위 위임으로 바꾼다. SET 이 없으면 `callKeys` = `ruleIds` 라 결과가 같다.)

새 도우미(클래스 아래쪽 `reaches` 앞):
```java
    /** 흐름의 RULE·SET 노드 키(룰 ID, SET 은 set:{setId})를 깊이 우선으로 중복 없이(빈 ID 제외). 구조 오류면 노드 배열 순서(Ruling 6). */
    static List<String> callKeys(FlowDefinition flow, FlowParse p) {
        Set<String> out = new LinkedHashSet<>();
        if (p.tree() != null) {
            for (CallStep c : p.tree().callSteps()) {
                String k = keyOf(c);
                if (k != null) {
                    out.add(k);
                }
            }
            return List.copyOf(out);
        }
        Set<String> seenNodes = new HashSet<>();
        for (FlowNode n : flow.nodes()) {
            if (!seenNodes.add(n.id())) {
                continue;
            }
            if (n.kind() == NodeKind.RULE && n.ruleId() != null && !n.ruleId().isBlank()) {
                out.add(n.ruleId());
            } else if (n.kind() == NodeKind.SET && n.setId() != null && !n.setId().isBlank()) {
                out.add(SetCallIo.key(n.setId()));
            }
        }
        return List.copyOf(out);
    }

    /** RULE 은 룰 ID, SET 은 set:{setId}(빈 ID 면 null). */
    static String keyOf(CallStep c) {
        if (c instanceof RuleStep r) {
            return r.ruleId();
        }
        String id = ((SetStep) c).setId();
        return id == null || id.isBlank() ? null : SetCallIo.key(id);
    }

    /** 룰 입출력 맵에 세트 겉모양을 키 set:{setId} 로 더한 사본(calls 가 비면 rules 그대로). */
    static Map<String, RuleIo> withCalls(Map<String, RuleIo> rules, Map<String, SetCallIo> calls) {
        if (calls.isEmpty()) {
            return rules;
        }
        Map<String, RuleIo> all = new LinkedHashMap<>(rules);
        calls.forEach((id, c) -> all.put(SetCallIo.key(id), c.asRuleIo()));
        return all;
    }

    /** 검사 문구의 이름 — 세트 키면 "세트 {setId}". */
    static String disp(String key) {
        return SetCallIo.isKey(key) ? "세트 " + SetCallIo.idOf(key) : key;
    }

    /** 하위 세트 spec §5 CALL_MISSING(Ruling 8) — 노드 배열 순서, 같은 세트 ID 는 첫 노드에만, 빈 ID 는 노드마다. */
    private static void callMissing(FlowDefinition flow, Map<String, SetCallIo> calls, List<RuleSetCheck> out) {
        Set<String> seenNodes = new HashSet<>();
        Set<String> seenSets = new HashSet<>();
        for (FlowNode n : flow.nodes()) {
            if (!seenNodes.add(n.id()) || n.kind() != NodeKind.SET) {
                continue;
            }
            String id = n.setId();
            if (id == null || id.isBlank()) {
                out.add(new RuleSetCheck(RuleSetCheck.CALL_MISSING, RuleSetCheck.REJECT, null, null, null, "세트 노드 " + n.id() + "에 세트 ID가 없다", n.id(), null));
                continue;
            }
            if (!seenSets.add(id)) {
                continue;
            }
            SetCallIo c = calls.get(id);
            if (c == null || !c.exists()) {
                out.add(new RuleSetCheck(RuleSetCheck.CALL_MISSING, RuleSetCheck.REJECT, id, null, null, id + "는 없는 세트다", n.id(), null));
            } else if ("DEPRECATED".equals(c.status())) {
                out.add(new RuleSetCheck(RuleSetCheck.CALL_MISSING, RuleSetCheck.REJECT, id, null, null, id + "는 폐기된 세트다", n.id(), null));
            }
        }
    }
```

`checks(flow, rules, condIo, calls)` — 지금 `checks(flow, rules, condIo)` 의 몸체를 이 이름으로 옮기고 셋을 고친다.
1. 룰 존재 검사 `for (String id : ids) {…}` 바로 뒤에 `callMissing(flow, calls, out);`
2. `EMPTY` 조건: `n.kind() == NodeKind.RULE || n.kind() == NodeKind.TASK || n.kind() == NodeKind.SET`
3. 경로 검사 줄:
```java
        Map<String, RuleIo> all = withCalls(rules, calls);
        new PathWalk(parse.tree(), all, condIo, calls, deps(callKeys(flow, parse), all), out).seq(parse.tree().root(), new State());
```

`PathWalk`:
- 생성자에 `Map<String, SetCallIo> calls` 를 받아 필드로 둔다. `declared` 를 채우는 루프는 `tree.ruleIds()` 그대로(Ruling 20).
- `State.prodBy` 타입을 `Map<String, CallStep>` 으로(사본·합치기 코드의 `RuleStep` 도 `CallStep` 으로).
- `seq(...)`: `if (b instanceof RuleStep r) { step(r, r.ruleId(), st); } else if (b instanceof SetStep s) { String k = keyOf(s); if (k != null) { step(s, k, st); } }`. CATCH 의 `Guarded` 갈래가 `rule(g.rule(), …)` 를 부르던 곳은 `String k = keyOf(g.rule()); if (k != null) { step(g.rule(), k, st); }` 로 바꾼다.
- `rule(RuleStep n, State st)` 를 아래 `step` 으로 바꾼다.
```java
        /** RULE·SET 노드 하나 — id 는 룰 ID 또는 set:{setId}. 문구의 이름은 disp(id), 검사 칸은 SetCallIo.idOf(id)(하위 세트 Ruling 6). */
        void step(CallStep n, String id, State st) {
            String node = n.nodeId();
            String me = disp(id);
            String meId = SetCallIo.idOf(id);
            for (IoName c : conds(rules, id)) {
                if (RuleIo.DICT.equals(c.source()) || st.defined().contains(c.name())) {
                    continue;
                }
                if (st.maybe().contains(c.name())) {
                    out.add(new RuleSetCheck(RuleSetCheck.FLOW_PARTIAL, RuleSetCheck.WARN, meId, null, c.name(),
                            me + "가 읽는 " + c.name() + "는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다", node, null));
                    continue;
                }
                List<String> later = producers(node, c.name(), Relation.BEFORE, id);
                if (!later.isEmpty()) {
                    String cyc = null;
                    for (String j : later) {
                        if (reaches(j, id, d) || overlaps(results(rules, id), conds(rules, j))) {
                            cyc = j;
                            break;
                        }
                    }
                    if (cyc != null) {
                        out.add(new RuleSetCheck(RuleSetCheck.CYCLE, RuleSetCheck.REJECT, meId, SetCallIo.idOf(cyc), c.name(),
                                me + "와 " + disp(cyc) + "가 서로의 결과 변수를 읽는다(순환). 순서를 바꿔서는 풀리지 않는다", node, null));
                    } else {
                        out.add(new RuleSetCheck(RuleSetCheck.ORDER, RuleSetCheck.REJECT, meId, SetCallIo.idOf(later.get(0)), c.name(),
                                me + "가 뒤에 도는 " + String.join(", ", later.stream().map(RuleSetAnalyzer::disp).toList()) + "의 결과 변수 " + c.name()
                                        + "를 읽는다. " + disp(later.get(0)) + "를 " + me + " 앞으로 옮긴다", node, null));
                    }
                    continue;
                }
                List<String> excl = producers(node, c.name(), Relation.EXCLUSIVE, null);
                if (!excl.isEmpty()) {
                    out.add(new RuleSetCheck(RuleSetCheck.IF_SIBLING, RuleSetCheck.REJECT, meId, SetCallIo.idOf(excl.get(0)), c.name(), me + "가 읽는 " + c.name()
                            + "는 같은 IF 의 다른 갈래(" + String.join(", ", excl.stream().map(RuleSetAnalyzer::disp).toList()) + ")에서만 만들어진다. 이 갈래를 타면 값이 없다",
                            node, null));
                    continue;
                }
                List<String> par = producers(node, c.name(), Relation.PARALLEL, null);
                if (!par.isEmpty()) {
                    out.add(new RuleSetCheck(RuleSetCheck.PAR_SIBLING, RuleSetCheck.REJECT, meId, SetCallIo.idOf(par.get(0)), c.name(), me + "가 병렬 형제 갈래의 "
                            + disp(par.get(0)) + "가 만드는 " + c.name() + "를 읽는다. 병렬 갈래끼리는 결과를 읽을 수 없다", node, null));
                    continue;
                }
                if (!RuleIo.PROG.equals(c.source())) {
                    out.add(new RuleSetCheck(RuleSetCheck.UNKNOWN_INPUT, RuleSetCheck.REJECT, meId, null, c.name(),
                            me + "의 조건 변수 " + c.name() + "는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다", node, null));
                }
            }
            Set<String> partial = partial(id);
            for (IoName x : results(rules, id)) {
                CallStep sib = parallelEarlier(n, x.name());
                if (sib != null) {
                    out.add(new RuleSetCheck(RuleSetCheck.PAR_SIBLING, RuleSetCheck.REJECT, meId, SetCallIo.idOf(keyOf(sib)), x.name(),
                            "병렬 갈래의 " + disp(keyOf(sib)) + "와 " + me + "가 같은 결과 변수 " + x.name() + "에 대입한다", node, null));
                } else {
                    CallStep prev = st.prodBy().get(x.name());
                    if (prev != null) {
                        out.add(new RuleSetCheck(RuleSetCheck.DUP_RESULT, RuleSetCheck.WARN, meId, SetCallIo.idOf(keyOf(prev)), x.name(),
                                disp(keyOf(prev)) + "와 " + me + "가 같은 결과 변수 " + x.name() + "에 대입한다", node, null));
                    }
                }
                st.prodBy().put(x.name(), n);
                if (partial.contains(x.name()) && !st.defined().contains(x.name())) {
                    st.maybe().add(x.name());
                } else {
                    st.defined().add(x.name());
                }
            }
        }

        /** 세트 키면 always=false 출력 이름(Ruling 7). 룰이면 빈 집합. */
        private Set<String> partial(String id) {
            SetCallIo c = SetCallIo.isKey(id) ? calls.get(SetCallIo.idOf(id)) : null;
            Set<String> out = new HashSet<>();
            if (c != null) {
                c.outputs().stream().filter(o -> !o.always()).forEach(o -> out.add(o.name()));
            }
            return out;
        }

        /** relation(node, m) == rel 이고 name 을 만드는 RULE·SET 노드 m 의 키(깊이 우선, 중복 없음). exceptId 가 있으면 그 키는 뺀다. */
        private List<String> producers(String node, String name, Relation rel, String exceptId) {
            List<String> ids = new ArrayList<>();
            for (CallStep m : tree.callSteps()) {
                String k = keyOf(m);
                if (k == null || m.nodeId().equals(node) || (exceptId != null && k.equals(exceptId)) || ids.contains(k)) {
                    continue;
                }
                if (tree.relation(node, m.nodeId()) == rel && produces(rules, k, name)) {
                    ids.add(k);
                }
            }
            return ids;
        }

        /** 깊이 우선으로 n 보다 앞에 있고 n 과 병렬 형제이며 name 을 만드는 첫 RULE·SET 노드. */
        private CallStep parallelEarlier(CallStep n, String name) {
            for (CallStep m : tree.callSteps()) {
                if (m.nodeId().equals(n.nodeId())) {
                    return null;
                }
                String k = keyOf(m);
                if (k != null && tree.relation(n.nodeId(), m.nodeId()) == Relation.PARALLEL && produces(rules, k, name)) {
                    return m;
                }
            }
            return null;
        }
```
(`PathWalk` 의 `rules` 필드는 이제 `all` 이다. `split(...)` 의 `prodBy` 합치기 코드는 타입만 `CallStep` 으로 바뀌고 그대로다.)

CATCH 계획 Task 4 의 `PathWalk.never(Guarded g)`(`guarded` 가 `rule(g.rule(), st)` 바로 뒤에 부른다)를 다음으로 바꾼다. RULE 쪽 두 경고의 글자·칸은 그대로이고, 종류와 대상이 맞지 않는 받는 노드(Ruling 9)는 `FLOW_CATCH` 거부로, SET 의 `SUBSET_ENDED` 가 일어날 수 없으면 `CATCH_NEVER` 경고로 낸다. `CATCH_NEVER` 의 `ruleId` 칸은 CATCH 처럼 대상 ID(SET 이면 `setId`, Ruling 6), `nodeId` 는 받는 노드다. `FLOW_CATCH` 는 구조 오류처럼 `ruleId` 가 null 이다.
```java
        /** CATCH_NEVER(CATCH R12)와 종류·대상 불일치(하위 세트 Ruling 9) — 처리 갈래 순서·받는 종류 저장 순서. */
        void never(Guarded g) {
            if (g.rule() instanceof SetStep s) {
                neverSet(g, s);
                return;
            }
            String id = ((RuleStep) g.rule()).ruleId();
            for (Guarded.Handler h : g.handlers()) {
                if (h.kinds().contains(CatchKind.SUBSET_ENDED)) {
                    out.add(new RuleSetCheck(RuleSetCheck.FLOW_CATCH, RuleSetCheck.REJECT, null, null, null,
                            "받는 노드 " + h.catchNodeId() + ": 룰 노드에는 하위 세트 예외 끝(SUBSET_ENDED)을 붙일 수 없다", h.catchNodeId(), null));
                }
            }
            RuleIo r = all.get(id); // CATCH 원문의 rules — 이 태스크가 PathWalk 의 맵을 all 로 바꿨다
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

        private void neverSet(Guarded g, SetStep s) {
            SetCallIo call = s.setId() == null ? null : calls.get(s.setId());
            for (Guarded.Handler h : g.handlers()) {
                for (CatchKind k : h.kinds()) {
                    if (k == CatchKind.NO_RESULT) {
                        out.add(new RuleSetCheck(RuleSetCheck.FLOW_CATCH, RuleSetCheck.REJECT, null, null, null,
                                "받는 노드 " + h.catchNodeId() + ": 세트 노드에는 결과 없음(NO_RESULT)을 붙일 수 없다", h.catchNodeId(), null));
                    } else if (k == CatchKind.SUBSET_ENDED && call != null && call.exists() && !call.endsEarly()) {
                        out.add(new RuleSetCheck(RuleSetCheck.CATCH_NEVER, RuleSetCheck.WARN, s.setId(), null, null,
                                "받는 노드 " + h.catchNodeId() + ": 세트 " + s.setId() + "에는 END 로 가는 처리 갈래가 없어 하위 세트 예외 끝이 일어나지 않는다",
                                h.catchNodeId(), null));
                    }
                }
            }
        }
```
`PathWalk` 의 `calls`(세트 ID → `SetCallIo`) 필드는 위 생성자 변경에서 이미 받는다. 
TS `set-model.ts` — CATCH 의 `pathChecks` 안 `never` 를 다음으로 바꾼다(`calls` 는 `pathChecks` 가 받는 `SetCallIoMap`).
```ts
  /** CATCH_NEVER(CATCH R12)와 종류·대상 불일치(하위 세트 Ruling 9) — 서버 PathWalk.never 와 같은 순서·문구·칸. */
  const never = (g: Guarded) => {
    if (g.rule.type === "SET") {
      neverSet(g, g.rule);
      return;
    }
    const id = g.rule.ruleId;
    for (const h of g.handlers) {
      if (h.kinds.includes("SUBSET_ENDED")) {
        out.push(check("FLOW_CATCH", "REJECT", null, null, null, `받는 노드 ${h.catchNodeId}: 룰 노드에는 하위 세트 예외 끝(SUBSET_ENDED)을 붙일 수 없다`, h.catchNodeId));
      }
    }
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

  const neverSet = (g: Guarded, s: SetStep) => {
    const call = s.setId == null ? undefined : calls[s.setId];
    for (const h of g.handlers) {
      for (const k of h.kinds) {
        if (k === "NO_RESULT") {
          out.push(check("FLOW_CATCH", "REJECT", null, null, null, `받는 노드 ${h.catchNodeId}: 세트 노드에는 결과 없음(NO_RESULT)을 붙일 수 없다`, h.catchNodeId));
        } else if (k === "SUBSET_ENDED" && call && call.exists && !call.endsEarly) {
          out.push(
            check("CATCH_NEVER", "WARN", s.setId, null, null, `받는 노드 ${h.catchNodeId}: 세트 ${s.setId}에는 END 로 가는 처리 갈래가 없어 하위 세트 예외 끝이 일어나지 않는다`, h.catchNodeId),
          );
        }
      }
    }
  };
```
import 에 `type SetStep`(flow-model)을 더한다. `check(...)` 의 인자 순서는 CATCH 의 `never` 가 쓰는 것과 같다(`code, severity, ruleId, otherRuleId, varName, message, nodeId`).

`RuleSetPathState.java`:
```java
    public static Map<String, At> before(FlowTree tree, Function<String, Set<String>> produces) {
        return before(tree, produces, setId -> Set.of());
    }

    /** setProduces — 세트 ID → 그 세트의 always 출력(하위 세트 spec §2). SET 노드를 지나면 정의된 이름에 더한다. */
    public static Map<String, At> before(FlowTree tree, Function<String, Set<String>> produces, Function<String, Set<String>> setProduces) {
        Map<String, At> out = new LinkedHashMap<>();
        new Walk(produces, setProduces, out).seq(tree.root(), new At(new HashSet<>(), new HashSet<>()));
        return out;
    }
```
`Walk` 레코드에 `Function<String, Set<String>> setProduces` 칸을 더하고 `seq(...)` 에 SET 갈래를 둔다(CATCH 의 Guarded 갈래가 `g.rule()` 을 RULE 로 다루는 곳도 SET 이면 같은 처리).
```java
                } else if (b instanceof SetStep s) {
                    if (s.setId() != null && !s.setId().isBlank()) {
                        st.defined().addAll(setProduces.apply(s.setId()));
                    }
```

- [ ] **Step 7: 화면 구현 — `types.ts`·`set-model.ts`**

`types.ts` — `RuleSetCheckCode` 의 `"EMPTY_TASK"` 뒤(CATCH 의 두 코드 뒤)에:
```ts
  /** 하위 세트 spec §5 — SET 노드 세트 없음·폐기(REJECT, 화면도 낸다). */
  | "CALL_MISSING"
  /** 하위 세트 spec §5 — 서버만 낸다(저장 응답 거부 목록). */
  | "CALL_CYCLE"
  | "CALL_DEPTH"
  | "CALLER_BROKEN"
```
`SetIo` 뒤에:
```ts
/** 하위 세트의 최종 결과 하나 — always 는 END 에 닿는 모든 경로에서 반드시 만들어지는가(서버 `SetCallIo.OutputName`). */
export interface SetCallOutput {
  name: string;
  dataType: string | null;
  scale: number | null;
  dateString: boolean;
  maruCodeId: string | null;
  always: boolean;
}

/** 하위 세트의 겉모양(하위 세트 spec §2, 서버 `SetCallIo`) — 서버만 계산하고 화면은 검사에 넣기만 한다(C-D4). */
export interface SetCallIo {
  setId: string;
  /** 세트명 — SET 노드 제목(라벨이 없을 때)·속성 패널. 없는 세트면 null. */
  setName: string | null;
  exists: boolean;
  status: string | null;
  inputs: IoName[];
  outputs: SetCallOutput[];
  /** 하위 세트에 END 로 가는 처리 갈래가 있는가(CATCH_NEVER — SUBSET_ENDED). */
  endsEarly: boolean;
}

/** 세트 ID → 겉모양. 없는 키는 아직 받지 않았거나 없는 세트다(검사는 CALL_MISSING 으로 본다, Ruling 8). */
export type SetCallIoMap = Readonly<Record<string, SetCallIo | undefined>>;
```

`set-model.ts` — import 에 `flowSetIds`·`type CallStep`(flow-model)과 `SetCallIo`·`SetCallIoMap`(types) 를 더하고, 도우미를 `produces` 정의 아래에 둔다.
```ts
/** 분석기 맵 키(하위 세트 Ruling 6) — 룰 ID 와 겹치지 않게 소문자 접두를 붙인다. */
export const setKey = (setId: string) => `set:${setId}`;
export const isSetKey = (key: string | null | undefined): key is string => !!key && key.startsWith("set:");
/** 세트 키면 세트 ID, 아니면 그대로(룰 ID). */
export const setIdOfKey = (key: string) => (isSetKey(key) ? key.slice(4) : key);
const disp = (key: string) => (isSetKey(key) ? `세트 ${setIdOfKey(key)}` : key);
const keyOf = (c: CallStep): string | null => (c.type === "RULE" ? c.ruleId : isBlankJava(c.setId) ? null : setKey(c.setId as string));

/** 하위 세트 겉모양 → 분석기용 룰 입출력(입력 = 조건, 출력 = 결과). 서버 `SetCallIo.asRuleIo` 와 같다. */
export function callRuleIo(c: SetCallIo): RuleIo {
  return {
    ruleId: setKey(c.setId),
    ruleName: null,
    ruleKind: null,
    status: c.status,
    exists: c.exists,
    releasedVer: c.exists ? 1 : null,
    hitPolicy: null,
    hasDefault: false,
    conds: c.inputs,
    results: c.outputs.map((o) => ({ name: o.name, source: null, label: null, dataType: o.dataType, scale: o.scale, dateString: o.dateString, maruCodeId: o.maruCodeId })),
  };
}

function withCalls(rules: RuleIoMap, calls: SetCallIoMap): RuleIoMap {
  const entries = Object.entries(calls).filter((e): e is [string, SetCallIo] => !!e[1]);
  if (entries.length === 0) return rules;
  const all: Record<string, RuleIo | undefined> = { ...rules };
  for (const [id, c] of entries) all[setKey(id)] = callRuleIo(c);
  return all;
}

/** 흐름의 RULE·SET 노드 키를 깊이 우선으로 중복 없이(빈 ID 제외). 구조 오류면 노드 배열 순서(서버 `RuleSetAnalyzer.callKeys`). */
export function flowCallKeys(flow: RuleSetFlow, parsed = parseFlow(flow)): string[] {
  const out: string[] = [];
  const add = (k: string | null) => {
    if (k != null && !out.includes(k)) out.push(k);
  };
  if (parsed.tree) {
    for (const c of parsed.tree.callSteps()) add(keyOf(c));
    return out;
  }
  const seenNodes = new Set<string>();
  for (const n of flow.nodes ?? []) {
    if (seenNodes.has(n.id)) continue;
    seenNodes.add(n.id);
    if (n.kind === "RULE" && !isBlankJava(n.ruleId)) add(n.ruleId as string);
    else if (n.kind === "SET" && !isBlankJava(n.setId)) add(setKey(n.setId as string));
  }
  return out;
}
```
(`hasDefault` 는 CATCH 계획 Task 4 가 `RuleIo` 에 더한 칸이다.)

`flowIo`·`flowDeps`·`flowChecks`:
```ts
export function flowIo(flow: RuleSetFlow, rules: RuleIoMap, calls: SetCallIoMap = {}): SetIo {
  return setIo(flowCallKeys(flow), withCalls(rules, calls));
}

export function flowDeps(flow: RuleSetFlow, rules: RuleIoMap, calls: SetCallIoMap = {}): Record<string, string[]> {
  return setDeps(flowCallKeys(flow), withCalls(rules, calls));
}
```
`flowChecks(flow, rules, condIo)` → `flowChecks(flow, rules, condIo, calls: SetCallIoMap = {})`. 몸체에서:
1. 룰 존재 검사 루프 바로 뒤에 CALL_MISSING:
```ts
  // 하위 세트 spec §5 CALL_MISSING(Ruling 8) — 노드 배열 순서, 같은 세트 ID 는 첫 노드에만, 빈 ID 는 노드마다.
  const seenSetNodes = new Set<string>();
  const seenSets = new Set<string>();
  for (const n of flow.nodes ?? []) {
    if (seenSetNodes.has(n.id)) continue;
    seenSetNodes.add(n.id);
    if (n.kind !== "SET") continue;
    if (isBlankJava(n.setId)) {
      out.push(check("CALL_MISSING", "REJECT", null, null, null, `세트 노드 ${n.id}에 세트 ID가 없다`, n.id));
      continue;
    }
    const id = n.setId as string;
    if (seenSets.has(id)) continue;
    seenSets.add(id);
    const c = Object.prototype.hasOwnProperty.call(calls, id) ? calls[id] : undefined;
    if (!c || !c.exists) out.push(check("CALL_MISSING", "REJECT", id, null, null, `${id}는 없는 세트다`, n.id));
    else if (c.status === "DEPRECATED") out.push(check("CALL_MISSING", "REJECT", id, null, null, `${id}는 폐기된 세트다`, n.id));
  }
```
2. EMPTY: `(n) => n.kind === "RULE" || n.kind === "TASK" || n.kind === "SET"`.
3. `pathChecks(parsed.tree, rules, condIo, out)` → `pathChecks(parsed.tree, withCalls(rules, calls), condIo, calls, out)`.

`pathChecks(tree, rules, condIo, calls, out)`:
- 위쪽:
```ts
  const steps = tree.callSteps();
  const index = new Map(steps.map((s, i) => [s.nodeId, i] as const));
  const d = setDeps(flowKeysOf(tree), rules);
  const makers = (name: string) => steps.filter((m) => keyOf(m) != null && produces(rules, keyOf(m)!, name));
```
  (`flowKeysOf(tree)` = `[...new Set(tree.callSteps().map(keyOf).filter((k): k is string => k != null))]` 를 지역 함수로 둔다.) `declared` 루프는 `tree.ruleIds()` 그대로다.
- `PathState.prodBy` 타입 `Map<string, CallStep>`.
- `rule` 함수를 `step` 으로 바꾼다.
```ts
  const partial = (id: string): Set<string> => {
    const c = isSetKey(id) ? calls[setIdOfKey(id)] : undefined;
    return new Set((c?.outputs ?? []).filter((o) => !o.always).map((o) => o.name));
  };

  const step = (n: CallStep, id: string, s: PathState) => {
    const me = disp(id);
    const meId = setIdOfKey(id);
    for (const c of conds(rules, id)) {
      if (c.source === DICT || s.defined.has(c.name)) continue;
      if (s.maybe.has(c.name)) {
        out.push(check("FLOW_PARTIAL", "WARN", meId, null, c.name, `${me}가 읽는 ${c.name}는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다`, n.nodeId));
        continue;
      }
      const mk = makers(c.name);
      const later = uniq(mk.filter((m) => keyOf(m) !== id && tree.relation(n.nodeId, m.nodeId) === "BEFORE").map((m) => keyOf(m)!));
      if (later.length) {
        const cyc = later.find((j) => reaches(j, id, d) || overlaps(results(rules, id), conds(rules, j))) ?? null;
        if (cyc != null) {
          out.push(check("CYCLE", "REJECT", meId, setIdOfKey(cyc), c.name, `${me}와 ${disp(cyc)}가 서로의 결과 변수를 읽는다(순환). 순서를 바꿔서는 풀리지 않는다`, n.nodeId));
        } else {
          out.push(
            check(
              "ORDER",
              "REJECT",
              meId,
              setIdOfKey(later[0]),
              c.name,
              `${me}가 뒤에 도는 ${later.map(disp).join(", ")}의 결과 변수 ${c.name}를 읽는다. ${disp(later[0])}를 ${me} 앞으로 옮긴다`,
              n.nodeId,
            ),
          );
        }
        continue;
      }
      const excl = uniq(mk.filter((m) => tree.relation(n.nodeId, m.nodeId) === "EXCLUSIVE").map((m) => keyOf(m)!));
      if (excl.length) {
        out.push(
          check("IF_SIBLING", "REJECT", meId, setIdOfKey(excl[0]), c.name, `${me}가 읽는 ${c.name}는 같은 IF 의 다른 갈래(${excl.map(disp).join(", ")})에서만 만들어진다. 이 갈래를 타면 값이 없다`, n.nodeId),
        );
        continue;
      }
      const par = uniq(mk.filter((m) => tree.relation(n.nodeId, m.nodeId) === "PARALLEL").map((m) => keyOf(m)!));
      if (par.length) {
        out.push(check("PAR_SIBLING", "REJECT", meId, setIdOfKey(par[0]), c.name, `${me}가 병렬 형제 갈래의 ${disp(par[0])}가 만드는 ${c.name}를 읽는다. 병렬 갈래끼리는 결과를 읽을 수 없다`, n.nodeId));
        continue;
      }
      if (c.source !== PROG) {
        out.push(check("UNKNOWN_INPUT", "REJECT", meId, null, c.name, `${me}의 조건 변수 ${c.name}는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다`, n.nodeId));
      }
    }
    const part = partial(id);
    for (const x of results(rules, id)) {
      const sib = steps.find(
        (m) => index.get(m.nodeId)! < index.get(n.nodeId)! && tree.relation(n.nodeId, m.nodeId) === "PARALLEL" && keyOf(m) != null && produces(rules, keyOf(m)!, x.name),
      );
      if (sib) {
        out.push(check("PAR_SIBLING", "REJECT", meId, setIdOfKey(keyOf(sib)!), x.name, `병렬 갈래의 ${disp(keyOf(sib)!)}와 ${me}가 같은 결과 변수 ${x.name}에 대입한다`, n.nodeId));
      } else {
        const prev = s.prodBy.get(x.name);
        if (prev) out.push(check("DUP_RESULT", "WARN", meId, setIdOfKey(keyOf(prev)!), x.name, `${disp(keyOf(prev)!)}와 ${me}가 같은 결과 변수 ${x.name}에 대입한다`, n.nodeId));
      }
      s.prodBy.set(x.name, n);
      if (part.has(x.name) && !s.defined.has(x.name)) s.maybe.add(x.name);
      else s.defined.add(x.name);
    }
  };
```
- `walk` 의 `if (b.type === "RULE") rule(b, s);` → `if (b.type === "RULE") step(b, b.ruleId, s);`, Task 2 의 `SEAM(T5)` 줄 → `else if (b.type === "SET") { const k = keyOf(b); if (k) step(b, k, s); }`, CATCH 의 Guarded 갈래에서 `rule(g.rule, …)` → `{ const k = keyOf(g.rule); if (k) step(g.rule, k, s); }`.
- CATCH 의 받는 노드 검사 자리에 서버와 같은 SET 규칙을 넣는다(문구·칸·순서 Ruling 9, 서버 Step 6 코드와 한 줄씩 같게).

- [ ] **Step 8: 통과 확인**

Run(차례로):
```bash
(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)
(cd src/backend/mdm && ../gradlew :api:test --console=plain -q)
pnpm --dir src/frontend --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/rule-set-corpus.test.ts tests/dme/ruleSetEdit/set-model.test.ts
pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit
rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint
python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts
python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts
```
Expected: 모두 PASS, 퍼즈 차분(`rule-set-fuzz.json`) 그대로 초록 — SET 없는 흐름의 결과가 바뀌지 않았다는 증거다. tsc 0·audit 0건.

- [ ] **Step 9: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule src/backend/mdm/lib/src/test src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts
/usr/bin/git commit -m "feat(mdm): 세트 분석기가 SET 노드 겉모양으로 검사하고 CALL_MISSING 을 낸다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule src/backend/mdm/lib/src/test src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts
```

---

### Task 6: 서비스·연쇄 재검사 — `CALL_SET_IDS` 저장·호출 그래프·부르는 세트 재검사·폐기 거부·룰 저장 검사·조회·실행 응답

> **갱신 메모(레인이 착수 때 반영, 2026-10-06 plan:0)** — 아래 본문은 `2e02d29d` 기준이다. 본문보다 이 메모와 Task 0 대조표가 앞선다.
> - 담당 srv:6. **크게 바뀐다(U2).** 연쇄 재검사의 거부 자리는 저장이 아니라 **확정 검사**다: 세트는 `RuleSetConfirmCheck` → `RuleSetConfirmChecks.report(draft, applyFrom)`, 룰은 `RuleConfirmCheck` → `RuleConfirmChecks`(둘 다 `VersionConfirmCheckSpi`). 기준 시각은 확정하려는 apply_from 이다. 네 코드(`CALLER_BROKEN`·`CALL_CYCLE`·`CALL_DEPTH`·`CALL_MISSING`)를 거부로 본다(스펙 §5·§6.1·§6.4).
> - DRAFT 저장(`RuleSetEditService.save`)은 같은 계산을 지금 기준으로 돌려 네 코드를 **경고**로만 돌려준다. 다른 흐름 거부는 지금처럼 `rejectIfAny` 로 막는다. 룰 DRAFT 저장 검사(`RuleSaveCheck`)도 `SET_CALLER_BROKEN` 을 경고 이슈로만 낸다. `@Order` 는 지금 쓰는 번호를 다시 세어 정한다(편차 3).
> - 폐기는 그대로 거부(C-D12), 되살리기는 네 코드를 거부로 본다(스펙 §6.3).
> - 부르는 쪽 행은 RELEASED 이고 기준 시각 이후 유효한 VER 행만 센다(Ruling 25). `callIo`·`callers`·`view.calls` 의 기준 시각은 지금(Ruling 24).
> - 필수 시험: 두 DRAFT 가 순환을 반씩 만든 뒤 각자 저장은 경고로 통과하고, 먼저 확정은 통과, 나중 확정이 `CALL_CYCLE` 로 막힌다. 같은 부모 깨짐이 DRAFT 저장에서는 경고, 확정에서는 거부다.
> - `SEAM(T6)`(Task 3)을 흐름에서 계산한 `CALL_SET_IDS` 로 바꾼다. `RuleSetVersionService` 복사는 Task 3 이 했다.

**모델:** opus — 저장·폐기·되살리기·룰 저장 네 경로가 같은 재검사를 함께 쓰고, OASIS 응답·오류 문구·DB 시험이 얽힌다.

**이 태스크가 정한 것:**
- 저장된 세트의 겉모양은 `SetCallIoReader`(스프링 빈)가 읽는다 — 손주까지 재귀하고, 한 번의 `read` 안에서 세트마다 한 번만 계산한다. 순환·깊이 초과로 더 내려갈 수 없는 세트는 "없는 세트"로 본다(저장 검사가 먼저 막으므로 정상 데이터에서는 일어나지 않는다).
- 호출 그래프는 **사용 중(INUSE) 세트**의 `CALL_SET_IDS` 에 저장하려는 세트의 새 목록을 덮어 만든다. 순환은 "저장하려는 세트에서 닿는 순환" 하나를, 깊이는 "이 세트를 지나는 가장 긴 사슬(위로 부르는 쪽 + 아래로 부르는 쪽)" 하나를 낸다(Ruling 10 문구).
- 연쇄 재검사(`SetCallerRecheck.recheck`)는 겉모양이 바뀐 세트를 부르는 INUSE 부모마다 "저장 전 검사"와 "바뀐 겉모양으로 한 검사"를 견줘, 뒤에만 있는 **거부**를 `CALLER_BROKEN("세트 P: …")` 로 모은다. 비교 키는 `code·message·nodeId·edgeId`. 뒤에만 있는 **경고**가 있으면 그 부모 ID 를 모은다. 부모의 겉모양도 바뀌면 그 부모를 부르는 세트로 이어 가며, 단계는 `RuleSetCallGraph.MAX_DEPTH` 까지다. 부모의 룰은 최신 RELEASED 로 읽는다(룰 저장 검사도 저장하려는 정의는 그 룰을 담은 세트에만 적용한다).
- 저장 순서: 경로 검사(`CALL_MISSING` 포함) → 호출 그래프(`CALL_CYCLE`·`CALL_DEPTH`) → (앞에 거부가 없을 때만) 겉모양 비교·연쇄 재검사 → 새 경고가 생긴 부모가 있으면 WARN 한 건 `CALLER_WARN`("부르는 세트에 경고가 생겼다: P1, P2"). 목록 저장(FLOW_JSON 없는 세트)도 같은 재검사를 한다(목록 세트도 SET 노드로 불릴 수 있다 — 흐름은 `FlowParser.linear`).
- 폐기: 부르는 INUSE 세트가 있으면 거부한다(편차 12). 되살리기: 그 세트의 검사(`CALL_MISSING` 포함)와 호출 그래프 검사를 한다(스펙 §6.2 "순환·깊이는 §5 가 본다").
- 새 조회는 `search` 의 `target=CALL_IO`(`setIdsJson`)·`target=CALLERS`(`setId`) 다(편차 1). `CALLERS` 는 기존 `RuleSetPickResult` 모양(`sets`)으로 돌려준다.
- 실행(`execute` action = `simulate()`) 응답에 `calledFlows`(기록의 `sub` 를 따라 모은 세트 ID → `{setId, setName, flow, ruleIds, rules}`, FLOW_JSON 이 없으면 `flow=null`, `rules` 는 그 흐름 룰들의 입출력)를 싣는다(편차 2). 화면은 `flow` 가 null 이면 `linearFlow(ruleIds)` 로 그리고 룰 노드 제목에 `rules` 를 쓴다.
- `RuleSetRunner.execute`: 경로 맵에 `callIndex`, 응답에 `calls`(노드 ID·세트 ID·하위 `endedBy`), CATCH 의 `caught` 맵에 `setPath`, 오류 문구는 `setPath` 가 있으면 `"세트 {최상위} › {label 또는 세트 ID}({노드 ID}) › …"` 를 앞에 붙인다. 엔진 경고는 하위 세트 결과(`calls`)의 경고까지 실행 순서로 모은다.
- `StoredDefinitionLookup.ruleSet` 에 인스턴스 안 캐시를 둔다(스펙 §8).
- `RuleSetOrderCheck` 는 SET 노드의 always 출력을 정의된 이름으로 센다(Task 5 의 `RuleSetPathState` 3인자).

**Files:**
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/SetCallIoReader.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCallGraph.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/SetCallerRecheck.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/check/ledger/RuleSetCallerCheck.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetCallIoResult.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleIoReader.java:146-228`(`compute` → `compute`+`fromVars`, 새 `draft`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCheck.java`(`CALLER_WARN`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/check/RuleSaveIssueCode.java:43-49`(`SET_CALLER_BROKEN`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleErrorText.java`(새 `withSetPath`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java`(`execute`·`warnings`, 새 `pathText`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/dto/RuleSetRunResult.java`(`calls`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/definition/StoredDefinitionLookup.java:43, 62-65`(세트 캐시)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/check/ledger/RuleSetOrderCheck.java:47-51, 109-110`(`SetCallIoReader` 주입, `before` 3인자)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetEditService.java`(생성자, `search`·`view`·`save`·`delete`·`restore`·`simulate`·`flowChecks`, 새 `callIo`·`callers`·`calledFlows`·`graphChecks`·`callerChecks`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetEditSearchRequest.java`(`setId`·`setIdsJson`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetViewResult.java`(`calls`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetSimulateResult.java`(`calledFlows`)
- Create(Test): `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCallGraphTest.java`
- Create(Test): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetSubsetServiceTest.java`
- Create(Test): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleEdit/RuleSetCallerCheckTest.java`
- Create(Test): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunnerSubsetTest.java`
- Create(Test): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/SetCallIoEngineAgreementTest.java`

**Interfaces:**
- Consumes: Task 3(`CALL_SET_IDS`·`RuleSetWrites.update` 7인자·`SetState.callSetIds`·`DmeTestSupport.ruleSetCalls`), Task 4(엔진 동작), Task 5(`SetCallIo`·`RuleSetInterface`·`RuleSetAnalyzer` 4인자·`RuleSetPathState.before` 3인자·`RuleSetCheck` 네 코드), CATCH(`RuleSetRunResult.caught`).
- Produces(Task 8·9 가 쓰는 서버 응답):
  - `search` `target=CALL_IO`, 요청 `setIdsJson`(JSON 배열 문자열) → `RuleSetCallIoResult { List<SetCallIo> calls }`(요청 순서, 중복 없음).
  - `search` `target=CALLERS`, 요청 `setId` → `RuleSetPickResult { sets: [{setId, setName, status}] }`(부르는 INUSE 세트, 세트 ID 순).
  - `view` 응답 `calls: { [setId]: SetCallIo }`(흐름의 SET 노드가 부르는 세트, 깊이 우선 순서).
  - `save` 응답 `checks` 에 WARN `CALLER_WARN` 이 올 수 있다. 거부 코드 `CALL_MISSING`·`CALL_CYCLE`·`CALL_DEPTH`·`CALLER_BROKEN` 은 기존 MDM024 거부 모양(`code` 와 문구)으로 온다.
  - `execute` 응답 `calledFlows: { [setId]: {setId, setName, flow: object | null, ruleIds: string[], rules: RuleIo[]} }`.
  - Java `SetCallIoReader.read(Collection<String>): Map<String, SetCallIo>`, `callsOf(FlowDefinition)`, `of(String setId, String setName, String status, FlowDefinition flow, Map<String, RuleIo> rules)`, `callers(String setId): List<MdmRuleSet>`, `inuseEdges(): Map<String, List<String>>`, `static FlowDefinition flowOf(MdmRuleSet)`.
  - Java `RuleSetCallGraph.MAX_DEPTH = 5`, `RuleSetCallGraph.check(String setId, Map<String, List<String>> edges): List<RuleSetCheck>`.
  - Java `SetCallerRecheck.recheck(String setId, SetCallIo newIo): SetCallerRecheck.Outcome(List<RuleSetCheck> rejects, List<String> warnedCallers)`.
  - Java `RuleIoReader.draft(MdmRule rule, int ver, String hitPolicy, List<MdmRuleVar> vars, List<StoredRow> rows): RuleIo`.
  - Java `RuleSaveIssueCode.SET_CALLER_BROKEN`, `RuleSetCheck.CALLER_WARN`(WARN).

- [ ] **Step 1: 호출 그래프 실패 시험 — `RuleSetCallGraphTest.java`(lib, 순수)**

```java
package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 하위 세트 spec §5 CALL_CYCLE·CALL_DEPTH — 엔진 SubsetCycleDepthTest 와 같은 경계(5 통과, 6 거부, Review Focus 4). */
class RuleSetCallGraphTest {

    private static Map<String, List<String>> chain(String... ids) {
        Map<String, List<String>> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < ids.length; i++) {
            m.put(ids[i], List.of(ids[i + 1]));
        }
        return m;
    }

    private static List<String> messages(List<RuleSetCheck> checks) {
        return checks.stream().map(c -> c.code() + " " + c.message()).toList();
    }

    @Test
    void 자기_자신을_부르면_순환() {
        assertEquals(List.of("CALL_CYCLE 세트 호출이 순환한다: S › S"), messages(RuleSetCallGraph.check("S", Map.of("S", List.of("S")))));
    }

    @Test
    void 이_세트에서_닿는_순환을_경로로_적는다() {
        Map<String, List<String>> g = new LinkedHashMap<>(chain("S", "A", "B"));
        g.put("B", List.of("A"));
        assertEquals(List.of("CALL_CYCLE 세트 호출이 순환한다: S › A › B › A"), messages(RuleSetCallGraph.check("S", g)));
    }

    @Test
    void 다섯_단계는_통과하고_여섯_단계는_거부한다() {
        assertEquals(List.of(), RuleSetCallGraph.check("S0", chain("S0", "S1", "S2", "S3", "S4", "S5")));
        assertEquals(List.of("CALL_DEPTH 세트 호출이 6단계다. 5단계까지 부른다: S0 › S1 › S2 › S3 › S4 › S5 › S6"),
                messages(RuleSetCallGraph.check("S0", chain("S0", "S1", "S2", "S3", "S4", "S5", "S6"))));
    }

    @Test
    void 이_세트를_부르는_쪽_깊이를_합친다() {
        Map<String, List<String>> g = new LinkedHashMap<>(chain("P0", "P1", "P2", "S"));
        g.putAll(chain("S", "C1", "C2", "C3"));
        assertEquals(List.of("CALL_DEPTH 세트 호출이 6단계다. 5단계까지 부른다: P0 › P1 › P2 › S › C1 › C2 › C3"), messages(RuleSetCallGraph.check("S", g)));
        g.put("C2", List.of());
        assertEquals(List.of(), RuleSetCallGraph.check("S", g), "P0 › P1 › P2 › S › C1 › C2 는 5단계");
    }
}
```

Run(공통 환경 뒤): `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetCallGraphTest' --console=plain)` → 컴파일 오류(`RuleSetCallGraph` 없음).

- [ ] **Step 2: `RuleSetCallGraph.java`**

```java
package com.dongkuk.dmes.mdm.common.rule;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 세트 호출 그래프 검사(하위 세트 spec §5 CALL_CYCLE·CALL_DEPTH, C-D10) — 스프링·DB 없는 순수 함수. 저장된 세트들의 CALL_SET_IDS 를 저장하려는
 * 세트의 새 목록으로 덮은 그래프를 받는다. 엔진 SetShape.MAX_CALL_DEPTH 와 같은 상한이다.
 */
public final class RuleSetCallGraph {

    /** 최상위 세트에서 하위로 들어가는 단계 상한. */
    public static final int MAX_DEPTH = 5;

    private RuleSetCallGraph() {
    }

    /** 순환이 있으면 CALL_CYCLE 하나(깊이는 보지 않는다), 없으면 이 세트를 지나는 가장 긴 사슬이 상한을 넘을 때 CALL_DEPTH 하나. */
    public static List<RuleSetCheck> check(String setId, Map<String, List<String>> edges) {
        List<String> cycle = cycleFrom(setId, edges, new ArrayList<>(List.of(setId)), new HashSet<>());
        if (cycle != null) {
            return List.of(new RuleSetCheck(RuleSetCheck.CALL_CYCLE, RuleSetCheck.REJECT, setId, null, null,
                    "세트 호출이 순환한다: " + String.join(" › ", cycle)));
        }
        List<String> up = up(setId, reverse(edges), new HashSet<>());
        List<String> down = down(setId, edges, new HashSet<>());
        int depth = up.size() - 1 + down.size() - 1;
        if (depth <= MAX_DEPTH) {
            return List.of();
        }
        List<String> chain = new ArrayList<>(up);
        chain.addAll(down.subList(1, down.size()));
        return List.of(new RuleSetCheck(RuleSetCheck.CALL_DEPTH, RuleSetCheck.REJECT, setId, null, null,
                "세트 호출이 " + depth + "단계다. " + MAX_DEPTH + "단계까지 부른다: " + String.join(" › ", chain)));
    }

    private static List<String> cycleFrom(String cur, Map<String, List<String>> edges, List<String> path, Set<String> done) {
        for (String next : edges.getOrDefault(cur, List.of())) {
            if (path.contains(next)) {
                List<String> out = new ArrayList<>(path);
                out.add(next);
                return out;
            }
            if (done.contains(next)) {
                continue;
            }
            path.add(next);
            List<String> found = cycleFrom(next, edges, path, done);
            if (found != null) {
                return found;
            }
            path.remove(path.size() - 1);
            done.add(next);
        }
        return null;
    }

    /** cur 에서 아래로 가장 긴 사슬 [cur, …]. onPath 는 위쪽 순환에 대한 안전장치. */
    private static List<String> down(String cur, Map<String, List<String>> edges, Set<String> onPath) {
        onPath.add(cur);
        List<String> best = List.of(cur);
        for (String next : edges.getOrDefault(cur, List.of())) {
            if (onPath.contains(next)) {
                continue;
            }
            List<String> sub = down(next, edges, onPath);
            if (sub.size() + 1 > best.size()) {
                List<String> b = new ArrayList<>();
                b.add(cur);
                b.addAll(sub);
                best = b;
            }
        }
        onPath.remove(cur);
        return best;
    }

    /** cur 로 내려오는 가장 긴 사슬 [꼭대기, …, cur]. */
    private static List<String> up(String cur, Map<String, List<String>> rev, Set<String> onPath) {
        onPath.add(cur);
        List<String> best = List.of(cur);
        for (String parent : rev.getOrDefault(cur, List.of())) {
            if (onPath.contains(parent)) {
                continue;
            }
            List<String> sub = up(parent, rev, onPath);
            if (sub.size() + 1 > best.size()) {
                List<String> b = new ArrayList<>(sub);
                b.add(cur);
                best = b;
            }
        }
        onPath.remove(cur);
        return best;
    }

    private static Map<String, List<String>> reverse(Map<String, List<String>> edges) {
        Map<String, List<String>> rev = new LinkedHashMap<>();
        edges.forEach((from, tos) -> tos.forEach(to -> rev.computeIfAbsent(to, k -> new ArrayList<>()).add(from)));
        return rev;
    }
}
```
Run: `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetCallGraphTest' --console=plain)` → PASS.

- [ ] **Step 3: 서비스 실패 시험 — `RuleSetSubsetServiceTest.java`(api, SQLite)**

```java
package com.dongkuk.dmes.mdm.dme.ruleSetEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.audit.AuditHolder;
import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import com.dongkuk.dmes.mdm.common.rule.SetCallIo;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetCallIoResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetEditSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetPickResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetStatusRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 하위 세트 spec §5·§6·§8 — 저장(CALL_SET_IDS·CALL_MISSING·CALL_CYCLE·연쇄 재검사)·폐기 거부·되살리기·조회(calls)·search CALL_IO·CALLERS.
 *
 * <p>룰(모두 VER 1 RELEASED, 조건은 이름 조건 열, 결과 하나): 사전 SET_THK·SET_WID. R_GRD(SET_THK → S_GRD), R_OTH(SET_THK → S_OTH), R_FCT(S_GRD·SET_WID → S_FCT),
 * R_DEP(DEPRECATED, SET_THK → S_DEP). 세트: C(R_GRD 한 줄, S_GRD 를 낸다), P(SET C → R_FCT), M(SET C 만 — C 의 출력을 그대로 넘긴다), G(SET M → R_FCT).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetSubsetServiceTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleSetEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        AuditHolder.setAudit(new CactusAudit("kim", "ruleSetEditMenu", "ruleSetEdit"));
        DmeTestSupport.column(jdbc, "SET_THK", DmeTestSupport.domain(jdbc, "SET_THK_D", "QTY", "NUMBER", 2));
        DmeTestSupport.column(jdbc, "SET_WID", DmeTestSupport.domain(jdbc, "SET_WID_D", "QTY", "NUMBER", 0));
        rule("R_GRD", "INUSE", "S_GRD", "SET_THK");
        rule("R_OTH", "INUSE", "S_OTH", "SET_THK");
        rule("R_FCT", "INUSE", "S_FCT", "S_GRD", "SET_WID");
        rule("R_DEP", "DEPRECATED", "S_DEP", "SET_THK");
        set("C", "[\"R_GRD\"]", "[]", line(ruleNode("r1", "R_GRD")));
        set("P", "[\"R_FCT\"]", "[\"C\"]", line(setNode("s1", "C"), ruleNode("r2", "R_FCT")));
        set("M", "[]", "[\"C\"]", line(setNode("s1", "C")));
        set("G", "[\"R_FCT\"]", "[\"M\"]", line(setNode("s1", "M"), ruleNode("r2", "R_FCT")));
    }

    @AfterEach
    void clearAudit() {
        AuditHolder.remove();
    }

    // ── 도우미 ──

    private void rule(String id, String status, String result, String... conds) {
        DmeTestSupport.rule(jdbc, id, id + " 룰", "DECISION", status);
        DmeTestSupport.released(jdbc, id, 1, "FIRST", "2026-01-01 00:00:00", null);
        int varId = 1;
        for (String c : conds) {
            DmeTestSupport.var(jdbc, id, 1, varId, "COND", "1", c, varId);
            varId++;
        }
        DmeTestSupport.var(jdbc, id, 1, varId, "RESULT", "Value", result, 1, "STRING");
    }

    private void set(String id, String ruleIds, String callIds, String flow) {
        DmeTestSupport.ruleSet(jdbc, id, id + " 세트", ruleIds, "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, id, flow);
        DmeTestSupport.ruleSetCalls(jdbc, id, callIds);
    }

    static String ruleNode(String id, String ruleId) {
        return "{\"id\":\"" + id + "\",\"kind\":\"RULE\",\"ruleId\":\"" + ruleId + "\"}";
    }

    static String setNode(String id, String setId) {
        return "{\"id\":\"" + id + "\",\"kind\":\"SET\",\"setId\":\"" + setId + "\"}";
    }

    /** start → 노드들 → end(선 e1…). 노드 문자열은 ruleNode·setNode. */
    static String line(String... nodes) {
        StringBuilder ns = new StringBuilder("{\"id\":\"start\",\"kind\":\"START\"}");
        StringBuilder es = new StringBuilder();
        String prev = "start";
        int e = 1;
        for (String n : nodes) {
            ns.append(',').append(n);
            String id = n.replaceAll(".*\"id\":\"([^\"]+)\".*", "$1");
            es.append(es.length() == 0 ? "" : ",").append("{\"id\":\"e").append(e++).append("\",\"from\":\"").append(prev).append("\",\"to\":\"").append(id).append("\"}");
            prev = id;
        }
        ns.append(",{\"id\":\"end\",\"kind\":\"END\"}");
        es.append(",{\"id\":\"e").append(e).append("\",\"from\":\"").append(prev).append("\",\"to\":\"end\"}");
        return "{\"version\":1,\"nodes\":[" + ns + "],\"edges\":[" + es + "]}";
    }

    private RuleSetSaveResult save(String setId, String flow) {
        RuleSetSaveRequest r = new RuleSetSaveRequest();
        r.setSetId(setId);
        r.setSetName(setId + " 세트");
        r.setRowVersion(jdbc.queryForObject("SELECT ROW_VERSION FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = ?", Long.class, setId));
        r.setFlowJson(flow);
        return service.save(r);
    }

    private String rejectText(String setId, String flow) {
        BusinessException e = assertThrows(BusinessException.class, () -> save(setId, flow));
        return e.getMessage();
    }

    // ── 저장 ──

    @Test
    void 저장하면_CALL_SET_IDS_를_흐름에서_깊이_우선으로_계산해_쓰고_RULE_IDS_는_룰만_담는다() {
        save("P", line(setNode("s1", "C"), ruleNode("r2", "R_FCT"), setNode("s3", "C")));
        assertEquals("[\"C\"]", jdbc.queryForObject("SELECT CALL_SET_IDS FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'P'", String.class));
        assertEquals("[\"R_FCT\"]", jdbc.queryForObject("SELECT RULE_IDS FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'P'", String.class));
    }

    @Test
    void 없는_세트를_부르면_CALL_MISSING_으로_거부한다() {
        String msg = rejectText("P", line(setNode("s1", "NOPE"), ruleNode("r2", "R_FCT")));
        assertTrue(msg.contains("CALL_MISSING") && msg.contains("NOPE는 없는 세트다"), msg);
    }

    @Test
    void 부르는_세트를_다시_부르면_CALL_CYCLE_로_거부한다() {
        String msg = rejectText("C", line(setNode("s1", "P")));
        assertTrue(msg.contains("CALL_CYCLE") && msg.contains("세트 호출이 순환한다: C › P › C"), msg);
    }

    @Test
    void 겉모양이_바뀌어_부르는_세트에_새_거부가_생기면_CALLER_BROKEN() {
        // C 가 S_GRD 대신 S_OTH 를 내면 P 의 R_FCT 가 읽는 S_GRD 를 아무도 만들지 않는다.
        String msg = rejectText("C", line(ruleNode("r1", "R_OTH")));
        assertTrue(msg.contains("CALLER_BROKEN") && msg.contains("세트 P: R_FCT의 조건 변수 S_GRD는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다"), msg);
    }

    @Test
    void 연쇄로_조부모까지_올라가_새_거부를_막는다() {
        jdbc.update("DELETE FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'P'");
        // C → M(그대로 넘김, 거부 없음·겉모양 바뀜) → G(R_FCT 가 S_GRD 를 못 읽음)
        String msg = rejectText("C", line(ruleNode("r1", "R_OTH")));
        assertTrue(msg.contains("세트 G: R_FCT의 조건 변수 S_GRD는"), msg);
    }

    @Test
    void 부모에_원래_있던_거부는_새_거부가_아니다() {
        set("BAD", "[\"R_DEP\",\"R_FCT\"]", "[\"C\"]", line(ruleNode("r0", "R_DEP"), setNode("s1", "C"), ruleNode("r2", "R_FCT")));
        jdbc.update("DELETE FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID IN ('P', 'G', 'M')");
        // C 가 출력을 하나 더 낸다(겉모양 바뀜) — BAD 의 RULE_DEPRECATED 는 원래 있던 거부다.
        save("C", line(ruleNode("r1", "R_GRD"), ruleNode("r2", "R_OTH")));
        assertEquals(1L, jdbc.queryForObject("SELECT ROW_VERSION FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'C'", Long.class), "저장됐다");
    }

    @Test
    void 부르는_세트에_새_경고만_생기면_저장하고_CALLER_WARN_으로_알린다() {
        // C 를 IF 로 바꿔 S_GRD 를 한 갈래에서만 만들면 P 의 R_FCT 가 FLOW_PARTIAL 경고다.
        String ifFlow = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"if1\",\"kind\":\"IF\"},"
                + ruleNode("r1", "R_GRD") + "," + ruleNode("r2", "R_OTH") + ",{\"id\":\"m1\",\"kind\":\"MERGE\",\"splitId\":\"if1\"},{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"if1\"},{\"id\":\"b1\",\"from\":\"if1\",\"to\":\"r1\",\"order\":1,\"cond\":\"SET_THK > 1\"},"
                + "{\"id\":\"bo\",\"from\":\"if1\",\"to\":\"r2\",\"otherwise\":true},{\"id\":\"e2\",\"from\":\"r1\",\"to\":\"m1\"},{\"id\":\"e3\",\"from\":\"r2\",\"to\":\"m1\"},"
                + "{\"id\":\"e4\",\"from\":\"m1\",\"to\":\"end\"}]}";
        RuleSetSaveResult r = save("C", ifFlow);
        RuleSetCheck warn = r.getChecks().stream().filter(c -> RuleSetCheck.CALLER_WARN.equals(c.code())).findFirst().orElseThrow();
        assertEquals("WARN", warn.severity());
        assertTrue(warn.message().startsWith("부르는 세트에 경고가 생겼다: ") && warn.message().contains("P"), warn.message());
    }

    // ── 폐기·되살리기 ──

    @Test
    void 사용_중인_세트가_부르면_폐기를_거부한다() {
        RuleSetStatusRequest r = new RuleSetStatusRequest();
        r.setSetId("C");
        r.setRowVersion(0L);
        BusinessException e = assertThrows(BusinessException.class, () -> service.delete(r));
        assertTrue(e.getMessage().contains("CALLER_BROKEN") && e.getMessage().contains("사용 중인 세트 M, P가 이 세트를 불러 폐기할 수 없다"), e.getMessage());
    }

    @Test
    void 되살리기는_호출_그래프도_본다() {
        jdbc.update("UPDATE TB_MDM_RULE_SET SET STATUS = 'DEPRECATED' WHERE MARU_RULE_SET_ID = 'G'");
        DmeTestSupport.ruleSetFlow(jdbc, "G", line(setNode("s1", "G")));
        DmeTestSupport.ruleSetCalls(jdbc, "G", "[\"G\"]");
        RuleSetStatusRequest r = new RuleSetStatusRequest();
        r.setSetId("G");
        r.setRowVersion(0L);
        BusinessException e = assertThrows(BusinessException.class, () -> service.restore(r));
        assertTrue(e.getMessage().contains("CALL_CYCLE"), e.getMessage());
    }

    // ── 조회 ──

    @Test
    void 조회는_SET_노드가_부르는_세트의_겉모양을_싣고_검사에_넣는다() {
        RuleSetViewRequest r = new RuleSetViewRequest();
        r.setSetId("P");
        var v = service.view(r);
        SetCallIo c = v.getCalls().get("C");
        assertEquals(List.of("S_GRD"), c.outputs().stream().map(SetCallIo.OutputName::name).toList());
        assertTrue(c.outputs().get(0).always());
        assertEquals(List.of(), v.getChecks().stream().filter(RuleSetCheck::rejected).toList());
    }

    @Test
    void search_CALL_IO_와_CALLERS() {
        RuleSetEditSearchRequest io = new RuleSetEditSearchRequest();
        io.setTarget("CALL_IO");
        io.setSetIdsJson("[\"C\",\"NOPE\"]");
        RuleSetCallIoResult calls = (RuleSetCallIoResult) service.search(io);
        assertEquals(List.of("C:true", "NOPE:false"), calls.getCalls().stream().map(c -> c.setId() + ":" + c.exists()).toList());

        RuleSetEditSearchRequest who = new RuleSetEditSearchRequest();
        who.setTarget("CALLERS");
        who.setSetId("C");
        RuleSetPickResult callers = (RuleSetPickResult) service.search(who);
        assertEquals(List.of("M", "P"), callers.getSets().stream().map(RuleSetPickResult.Pick::getSetId).toList());
    }
}
```
(`RuleSetPickResult.getSets()`·`Pick.getSetId()` 는 그 DTO 의 실제 getter 이름으로 맞춘다 — `sed -n 1,45p src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetPickResult.java`.)

- [ ] **Step 4: 룰 저장 검사 실패 시험 — `RuleSetCallerCheckTest.java`(api)**

```java
package com.dongkuk.dmes.mdm.dme.ruleEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveContext;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveTarget;
import com.dongkuk.dmes.mdm.common.rule.check.ledger.RuleSetCallerCheck;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.RuleSetSubsetServiceTest;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** 하위 세트 spec §6.3 — 룰 저장 검사 RuleSetCallerCheck(@Order(9)): 룰 → 그 룰을 담은 세트 → 부르는 세트 → 조부모(Review Focus 5). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetCallerCheckTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleSetCallerCheck check;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        DmeTestSupport.column(jdbc, "SET_THK", DmeTestSupport.domain(jdbc, "SET_THK_D", "QTY", "NUMBER", 2));
        rule("R_GRD", "S_GRD", "SET_THK");
        rule("R_FCT", "S_FCT", "S_GRD");
        set("C", "[\"R_GRD\"]", "[]", RuleSetSubsetServiceTest.line(RuleSetSubsetServiceTest.ruleNode("r1", "R_GRD")));
        set("M", "[]", "[\"C\"]", RuleSetSubsetServiceTest.line(RuleSetSubsetServiceTest.setNode("s1", "C")));
        set("G", "[\"R_FCT\"]", "[\"M\"]", RuleSetSubsetServiceTest.line(RuleSetSubsetServiceTest.setNode("s1", "M"),
                RuleSetSubsetServiceTest.ruleNode("r2", "R_FCT")));
    }

    private void rule(String id, String result, String cond) {
        DmeTestSupport.rule(jdbc, id, id + " 룰", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, id, 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, id, 1, 1, "COND", "1", cond, 1);
        DmeTestSupport.var(jdbc, id, 1, 2, "RESULT", "Value", result, 1, "STRING");
    }

    private void set(String id, String ruleIds, String callIds, String flow) {
        DmeTestSupport.ruleSet(jdbc, id, id + " 세트", ruleIds, "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, id, flow);
        DmeTestSupport.ruleSetCalls(jdbc, id, callIds);
    }

    /** R_GRD 를 저장하려는 정의 — 조건 SET_THK, 결과 이름만 바꾼다. */
    private static RuleSaveContext draft(String result) {
        MdmRuleVar cond = new MdmRuleVar("R_GRD", 2, 1, "COND", 1);
        cond.setDispType("1");
        cond.setVarName("SET_THK");
        MdmRuleVar res = new MdmRuleVar("R_GRD", 2, 2, "RESULT", 1);
        res.setDispType("Value");
        res.setVarName(result);
        res.setDataType("STRING");
        return new RuleSaveContext("R_GRD", 2, "DECISION", "FIRST", List.of(cond, res), List.of(), List.of(), List.of(), RuleSaveTarget.TABLE);
    }

    @Test
    void 결과_이름을_바꾸면_룰_세트_부모_조부모를_따라가_SET_CALLER_BROKEN() {
        List<Map<String, Object>> issues = check.check(draft("S_X"));
        assertEquals(List.of("SET_CALLER_BROKEN"), issues.stream().map(i -> i.get("code")).toList());
        // C 의 출력이 S_GRD → S_X 로 바뀌면 M 은 거부 없이 겉모양만 바뀌고(그대로 넘긴다), G 의 R_FCT 가 S_GRD 를 못 읽는 새 거부가 생긴다.
        assertEquals("세트 C 를 부르는 세트 G: R_FCT의 조건 변수 S_GRD는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다", issues.get(0).get("message"));
    }

    @Test
    void 겉모양이_그대로면_아무것도_내지_않는다() {
        assertEquals(List.of(), check.check(draft("S_GRD")));
    }
}
```

- [ ] **Step 5: 실행기 실패 시험 — `RuleSetRunnerSubsetTest.java`·`SetCallIoEngineAgreementTest.java`(api)**

```java
package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunRequest;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunResult;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.RuleSetSubsetServiceTest;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** 하위 세트 spec §8·§4.1 — OASIS 입구 execute 의 callIndex·calls·setPath 문구. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetRunnerSubsetTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleSetRunner runner;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.ruleSet(jdbc, "RS_LINE", "한 줄", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
        DmeTestSupport.ruleSet(jdbc, "RS_PARENT", "부모", "[]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "RS_PARENT", RuleSetSubsetServiceTest.line(
                "{\"id\":\"s1\",\"kind\":\"SET\",\"setId\":\"RS_LINE\",\"label\":\"품질 판정\"}"));
        DmeTestSupport.ruleSetCalls(jdbc, "RS_PARENT", "[\"RS_LINE\"]");
    }

    private static RuleSetRunRequest req(String recordJson) {
        RuleSetRunRequest r = new RuleSetRunRequest();
        r.setSetId("RS_PARENT");
        r.setRecordJson(recordJson);
        r.setEvalTs("2026-03-01 09:00:00");
        return r;
    }

    @Test
    void 경로에_callIndex_응답에_calls_요약을_싣는다() {
        RuleSetRunResult r = runner.execute(req("{\"COIL_THK\":\"2.0\",\"COIL_WID\":\"1200\",\"SURF_GRD\":\"A\"}"));
        assertEquals("A", r.getFinalValues().get("QLTY_GRD"));
        assertEquals(List.of(Map.of("nodeId", "s1", "setId", "RS_LINE")),
                r.getCalls().stream().map(c -> Map.of("nodeId", c.get("nodeId"), "setId", c.get("setId"))).toList());
        assertTrue(r.getCalls().get(0).containsKey("endedBy"));
        assertEquals(0, r.getPath().stream().filter(p -> "s1".equals(p.get("nodeId"))).findFirst().orElseThrow().get("callIndex"));
    }

    @Test
    void 하위_세트_위반_문구_앞에_세트_경로를_붙인다() {
        // 키는 모두 있어 부모 사전 검사를 지나고, 하위 세트의 룰이 숫자 칸 COIL_THK 를 바꾸다 TYPE_CONVERSION 으로 멈춘다(setPath = [s1]).
        BusinessException e = assertThrows(BusinessException.class,
                () -> runner.execute(req("{\"COIL_THK\":\"두껍다\",\"COIL_WID\":\"1200\",\"SURF_GRD\":\"A\"}")));
        assertTrue(e.getMessage().contains("세트 RS_PARENT › 품질 판정(s1) › [QLTY_GRD_JDG] "), e.getMessage());
    }
}
```

```java
package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.RuleSetSubsetServiceTest;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** 하위 세트 계획 편차 8·Review Focus 1 — 서버 SetCallIo.outputs 와 엔진이 실제로 넘긴 이름이 같다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class SetCallIoEngineAgreementTest extends AbstractMdmSharedDbTest {

    @Autowired
    SetCallIoReader reader;
    @Autowired
    RuleSetRunner runner;
    @Autowired
    JdbcTemplate jdbc;

    @Test
    void 저장된_하위_세트의_겉모양_출력과_엔진이_넘긴_출력이_같다() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.ruleSet(jdbc, "RS_LINE", "한 줄", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
        String parent = RuleSetSubsetServiceTest.line(RuleSetSubsetServiceTest.setNode("s1", "RS_LINE"));

        RunTrace t = runner.trace(parent, Map.of("COIL_THK", new BigDecimal("2.0"), "COIL_WID", new BigDecimal("1200"), "SURF_GRD", "A"),
                Instant.parse("2026-03-01T00:00:00Z"));
        RunTrace.NodeTrace s1 = t.nodes().stream().filter(n -> "s1".equals(n.nodeId())).findFirst().orElseThrow();

        Set<String> server = new LinkedHashSet<>(reader.read(List.of("RS_LINE")).get("RS_LINE").outputs().stream().map(SetCallIo.OutputName::name).toList());
        assertEquals(server, s1.outputs().keySet());
        assertEquals(Set.of("QLTY_GRD", "PRC_FCT"), server);
    }
}
```

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetSubsetServiceTest' --tests '*RuleSetCallerCheckTest' --tests '*RuleSetRunnerSubsetTest' --tests '*SetCallIoEngineAgreementTest' --console=plain)`
Expected: 컴파일 오류(`SetCallIoReader`·`RuleSetCallIoResult`·`RuleSetCallerCheck`·`getCalls` 없음).

- [ ] **Step 6: `SetCallIoReader.java`·`SetCallerRecheck.java`**

```java
package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import org.springframework.stereotype.Component;

/**
 * 저장된 세트의 겉모양 읽기(하위 세트 spec §2·§8) — 흐름(FLOW_JSON, 없으면 RULE_IDS 한 줄)·룰 입출력({@link RuleIoReader})·손주 세트(재귀)로
 * {@link RuleSetInterface} 를 부른다. 한 번의 read 안에서 세트마다 한 번만 계산한다. 순환·깊이 초과로 더 내려갈 수 없는 세트는 없는 세트로 본다
 * (저장 검사 CALL_CYCLE·CALL_DEPTH 가 먼저 막는다). FLOW_JSON 이 깨진 세트는 입출력이 빈 겉모양이다.
 */
@Component
public class SetCallIoReader {

    private final MdmRuleSetRepository sets;
    private final RuleQueries queries;
    private final RuleIoReader ioReader;

    public SetCallIoReader(MdmRuleSetRepository sets, RuleQueries queries, RuleIoReader ioReader) {
        this.sets = sets;
        this.queries = queries;
        this.ioReader = ioReader;
    }

    /** 세트 ID 들의 겉모양(입력 순서, 중복·빈 ID 제외). 없는 세트는 {@link SetCallIo#missing}. */
    public Map<String, SetCallIo> read(Collection<String> setIds) {
        Map<String, SetCallIo> memo = new HashMap<>();
        Map<String, SetCallIo> out = new LinkedHashMap<>();
        for (String id : setIds) {
            if (id != null && !id.isBlank() && !out.containsKey(id)) {
                out.put(id, compute(id, memo, List.of()));
            }
        }
        return out;
    }

    /** 흐름의 SET 노드가 부르는 세트의 겉모양(깊이 우선 순서). */
    public Map<String, SetCallIo> callsOf(FlowDefinition flow) {
        return read(RuleSetFlowJson.setIds(flow));
    }

    /** 저장하려는(또는 저장된) 흐름의 겉모양 — 룰은 rules, 하위 세트는 저장된 것. */
    public SetCallIo of(String setId, String setName, String status, FlowDefinition flow, Map<String, RuleIo> rules) {
        return RuleSetInterface.of(setId, setName, true, status, flow, rules, callsOf(flow));
    }

    /** CALL_SET_IDS 에 setId 를 담은 사용 중 세트(세트 ID 순). */
    public List<MdmRuleSet> callers(String setId) {
        List<MdmRuleSet> out = new ArrayList<>();
        for (MdmRuleSet s : queries.allSets()) {
            if ("INUSE".equals(s.getStatus()) && callIds(s).contains(setId)) {
                out.add(s);
            }
        }
        return out;
    }

    /** 사용 중 세트의 호출 목록(CALL_SET_IDS) — RuleSetCallGraph 입력(세트 ID 순). */
    public Map<String, List<String>> inuseEdges() {
        Map<String, List<String>> out = new LinkedHashMap<>();
        for (MdmRuleSet s : queries.allSets()) {
            if ("INUSE".equals(s.getStatus())) {
                out.put(s.getMaruRuleSetId(), callIds(s));
            }
        }
        return out;
    }

    /** 저장된 흐름 — FLOW_JSON 이 없으면 RULE_IDS 한 줄. 읽지 못하면 IllegalArgumentException(코덱). */
    public static FlowDefinition flowOf(MdmRuleSet s) {
        if (s.getFlowJson() != null) {
            return RuleSetFlowJson.parse(s.getFlowJson());
        }
        return FlowParser.linear(DomainJson.readList(s.getRuleIds()).stream().map(String::valueOf).toList());
    }

    private static List<String> callIds(MdmRuleSet s) {
        String json = s.getCallSetIds();
        return json == null || json.isBlank() ? List.of() : DomainJson.readList(json).stream().map(String::valueOf).toList();
    }

    private SetCallIo compute(String setId, Map<String, SetCallIo> memo, List<String> stack) {
        SetCallIo done = memo.get(setId);
        if (done != null) {
            return done;
        }
        if (stack.contains(setId) || stack.size() > RuleSetCallGraph.MAX_DEPTH) {
            return SetCallIo.missing(setId);
        }
        MdmRuleSet s = sets.findById(setId).orElse(null);
        SetCallIo io;
        if (s == null) {
            io = SetCallIo.missing(setId);
        } else {
            FlowDefinition flow;
            try {
                flow = flowOf(s);
            } catch (IllegalArgumentException e) {
                flow = null;
            }
            if (flow == null) {
                io = new SetCallIo(setId, s.getMaruRuleSetName(), true, s.getStatus(), List.of(), List.of(), false);
            } else {
                List<String> next = new ArrayList<>(stack);
                next.add(setId);
                Map<String, SetCallIo> calls = new LinkedHashMap<>();
                for (String c : RuleSetFlowJson.setIds(flow)) {
                    calls.put(c, compute(c, memo, List.copyOf(next)));
                }
                io = RuleSetInterface.of(setId, s.getMaruRuleSetName(), true, s.getStatus(), flow, ioReader.read(RuleSetFlowJson.ruleIds(flow)), calls);
            }
        }
        memo.put(setId, io);
        return io;
    }
}
```

```java
package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import org.springframework.stereotype.Component;

/**
 * 연쇄 재검사(하위 세트 spec §6.1 3·4, C-D11) — 겉모양이 바뀐 세트를 부르는 사용 중 세트를 다시 검사해, 저장 전 검사에 없던 거부를 CALLER_BROKEN 으로
 * 모은다. 새 경고는 막지 않고 부모 ID 만 모은다. 부모의 겉모양도 바뀌면 그 부모를 부르는 세트로 이어 간다(RuleSetCallGraph.MAX_DEPTH 단계까지).
 * 세트 저장·룰 저장 검사가 함께 쓴다.
 */
@Component
public class SetCallerRecheck {

    /** 재검사 결과 — 새 거부(부모마다 "세트 P: …")와 새 경고가 생긴 부모(처음 나온 순서). */
    public record Outcome(List<RuleSetCheck> rejects, List<String> warnedCallers) {
    }

    private final SetCallIoReader reader;
    private final RuleIoReader ioReader;

    public SetCallerRecheck(SetCallIoReader reader, RuleIoReader ioReader) {
        this.reader = reader;
        this.ioReader = ioReader;
    }

    public Outcome recheck(String setId, SetCallIo newIo) {
        List<RuleSetCheck> rejects = new ArrayList<>();
        Set<String> warned = new LinkedHashSet<>();
        Map<String, SetCallIo> changed = new LinkedHashMap<>();
        changed.put(setId, newIo);
        List<String> level = List.of(setId);
        Set<String> seen = new HashSet<>(level);
        for (int depth = 0; depth < RuleSetCallGraph.MAX_DEPTH && !level.isEmpty(); depth++) {
            List<String> next = new ArrayList<>();
            for (String child : level) {
                for (MdmRuleSet p : reader.callers(child)) {
                    String pid = p.getMaruRuleSetId();
                    FlowDefinition flow;
                    try {
                        flow = SetCallIoReader.flowOf(p);
                    } catch (IllegalArgumentException e) {
                        continue; // 깨진 흐름 — 그 세트의 저장 검사가 다룬다
                    }
                    Map<String, RuleIo> rules = ioReader.read(RuleSetFlowJson.ruleIds(flow));
                    Map<String, CondIo> condIo = ioReader.condIo(flow);
                    Map<String, SetCallIo> before = reader.callsOf(flow);
                    Map<String, SetCallIo> after = new LinkedHashMap<>(before);
                    changed.forEach((id, io) -> {
                        if (after.containsKey(id)) {
                            after.put(id, io);
                        }
                    });
                    List<RuleSetCheck> was = RuleSetAnalyzer.checks(flow, rules, condIo, before);
                    List<RuleSetCheck> now = RuleSetAnalyzer.checks(flow, rules, condIo, after);
                    Set<List<String>> wasKeys = keys(was);
                    for (RuleSetCheck c : now) {
                        if (wasKeys.contains(key(c))) {
                            continue;
                        }
                        if (c.rejected()) {
                            rejects.add(new RuleSetCheck(RuleSetCheck.CALLER_BROKEN, RuleSetCheck.REJECT, pid, null, null, "세트 " + pid + ": " + c.message()));
                        } else {
                            warned.add(pid);
                        }
                    }
                    SetCallIo pBefore = RuleSetInterface.of(pid, p.getMaruRuleSetName(), true, p.getStatus(), flow, rules, before);
                    SetCallIo pAfter = RuleSetInterface.of(pid, p.getMaruRuleSetName(), true, p.getStatus(), flow, rules, after);
                    if (!pBefore.sameShape(pAfter) && seen.add(pid)) {
                        changed.put(pid, pAfter);
                        next.add(pid);
                    }
                }
            }
            level = next;
        }
        return new Outcome(List.copyOf(rejects), List.copyOf(warned));
    }

    private static Set<List<String>> keys(List<RuleSetCheck> checks) {
        Set<List<String>> out = new HashSet<>();
        checks.forEach(c -> out.add(key(c)));
        return out;
    }

    private static List<String> key(RuleSetCheck c) {
        return java.util.Arrays.asList(c.code(), c.message(), c.nodeId(), c.edgeId());
    }
}
```

- [ ] **Step 7: `RuleIoReader` 의 `draft`·`RuleSetCallerCheck`·코드 둘**

`RuleIoReader.java` — `compute(...)` 를 둘로 나눈다(몸체는 그대로 옮긴다). CATCH 계획 Task 4 이후의 `compute` 는 첫머리에서 `List<MdmRuleRow> rows = queries.rows(id, ver);` 와 `boolean hasDefault = rows.stream().anyMatch(r -> "DEFAULT".equals(r.getRowKind()));` 를 구하고, Expression 열 루프를 `for (MdmRuleRow row : rows) {` 로 돌며, `new RuleIo(…, List.copyOf(resultOut), hasDefault)` 로 끝난다.
```java
    private RuleIo compute(MdmRule rule, int ver, String hitPolicy, Map<String, Boolean> dictionary) {
        String id = rule.getMaruRuleId();
        List<MdmRuleVar> vars = queries.vars(id, ver);
        List<MdmRuleRow> rows = queries.rows(id, ver);
        boolean hasDefault = rows.stream().anyMatch(r -> "DEFAULT".equals(r.getRowKind()));
        return fromVars(rule, ver, hitPolicy, vars, () -> rows.stream().map(r -> RuleCellsCodec.parse(r.getCells())).toList(),
                hasDefault, dictionary);
    }

    /**
     * 저장하려는 정의의 입출력(하위 세트 spec §6.3) — 룰 저장 검사가 그 룰을 담은 세트의 겉모양을 다시 계산할 때 쓴다. 규칙은 저장된 버전과 같다.
     */
    public RuleIo draft(MdmRule rule, int ver, String hitPolicy, List<MdmRuleVar> vars, List<RuleAnalysisInputMapper.StoredRow> rows) {
        boolean hasDefault = rows.stream().anyMatch(r -> "DEFAULT".equals(r.rowKind()));
        return fromVars(rule, ver, hitPolicy, vars, () -> rows.stream().map(r -> RuleCellsCodec.parse(r.cells())).toList(),
                hasDefault, new HashMap<>());
    }

    /** compute 의 몸체 — 변수, (Expression 열이 있을 때만 부르는) 행 셀 공급자, 기본 행 여부로 입출력을 만든다. */
    private RuleIo fromVars(MdmRule rule, int ver, String hitPolicy, List<MdmRuleVar> vars,
            java.util.function.Supplier<List<Map<Integer, Map<String, Object>>>> rowCells, boolean hasDefault,
            Map<String, Boolean> dictionary) {
        String id = rule.getMaruRuleId();
        // 여기에 지금 compute 의 `boolean hasDefault = …;` 다음 줄부터 끝까지를 그대로 옮긴다. 단 Expression 열 루프의
        // `for (MdmRuleRow row : rows) { Map<Integer, Map<String, Object>> cells = RuleCellsCodec.parse(row.getCells());`
        // 를 `for (Map<Integer, Map<String, Object>> cells : rowCells.get()) {` 로 바꾼다. 끝의 `new RuleIo(…, hasDefault)` 는 그대로다.
    }
```
위 주석 세 줄은 옮길 자리를 알려 주는 것이다. 실제 파일에는 `compute` 의 나머지 몸체를 붙여 넣고 주석은 지운다(`RuleIoReader` 의 기존 시험이 몸체를 그대로 옮겼는지 지킨다).

`RuleSaveIssueCode.java` 의 `SET_PAR_SIBLING,` 뒤에 `SET_CALLER_BROKEN,` 을, `RuleSetCheck.java` 의 `CALLER_BROKEN` 뒤에:
```java
    /** 이 저장으로 부르는 세트에 없던 경고가 생겼다(WARN, 서버만, 하위 세트 spec §6.1-5). 저장을 막지 않는다. */
    public static final String CALLER_WARN = "CALLER_WARN";
```

`check/ledger/RuleSetCallerCheck.java`:
```java
package com.dongkuk.dmes.mdm.common.rule.check.ledger;

import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.rule.RuleIo;
import com.dongkuk.dmes.mdm.common.rule.RuleIoReader;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleSetFlowJson;
import com.dongkuk.dmes.mdm.common.rule.RuleSetInterface;
import com.dongkuk.dmes.mdm.common.rule.SetCallIo;
import com.dongkuk.dmes.mdm.common.rule.SetCallIoReader;
import com.dongkuk.dmes.mdm.common.rule.SetCallerRecheck;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveCheck;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveContext;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveIssueCode;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveTarget;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * 룰 저장·상신 때 부르는 세트 재검사(하위 세트 spec §6.3, 편차 3 — @Order(9)). 이 룰을 RULE_IDS 에 담은 사용 중 세트 S 마다, 이 룰만 저장하려는
 * 정의로 바꿔 S 의 겉모양을 다시 계산한다. 바뀌면 {@link SetCallerRecheck} 로 S 를 부르는 세트들을 다시 검사해, 새 거부가 있으면 SET_CALLER_BROKEN 이다.
 * 부르는 세트가 없는 S 는 계산하지 않는다.
 */
@Component
@Order(9)
public class RuleSetCallerCheck implements RuleSaveCheck {

    private final RuleQueries queries;
    private final MdmRuleRepository rules;
    private final RuleIoReader ioReader;
    private final SetCallIoReader reader;
    private final SetCallerRecheck recheck;

    public RuleSetCallerCheck(RuleQueries queries, MdmRuleRepository rules, RuleIoReader ioReader, SetCallIoReader reader, SetCallerRecheck recheck) {
        this.queries = queries;
        this.rules = rules;
        this.ioReader = ioReader;
        this.reader = reader;
        this.recheck = recheck;
    }

    @Override
    public Set<RuleSaveTarget> targets() {
        return EnumSet.of(RuleSaveTarget.TABLE, RuleSaveTarget.COLUMNS, RuleSaveTarget.STORED);
    }

    @Override
    public List<Map<String, Object>> check(RuleSaveContext ctx) {
        MdmRule rule = rules.findById(ctx.ruleId()).orElse(null);
        if (rule == null) {
            return List.of();
        }
        RuleIo draft = ioReader.draft(rule, ctx.ver(), ctx.hitPolicy(), ctx.rawVars(), ctx.rows());
        List<Map<String, Object>> out = new ArrayList<>();
        for (MdmRuleSet s : queries.allSets()) {
            String sid = s.getMaruRuleSetId();
            if (!"INUSE".equals(s.getStatus()) || !DomainJson.readList(s.getRuleIds()).stream().map(String::valueOf).toList().contains(ctx.ruleId())
                    || reader.callers(sid).isEmpty()) {
                continue;
            }
            FlowDefinition flow;
            try {
                flow = SetCallIoReader.flowOf(s);
            } catch (IllegalArgumentException e) {
                continue;
            }
            Map<String, RuleIo> withDraft = new LinkedHashMap<>(ioReader.read(RuleSetFlowJson.ruleIds(flow)));
            withDraft.put(ctx.ruleId(), draft);
            SetCallIo before = reader.read(List.of(sid)).get(sid);
            SetCallIo after = RuleSetInterface.of(sid, s.getMaruRuleSetName(), true, s.getStatus(), flow, withDraft, reader.callsOf(flow));
            if (after.sameShape(before)) {
                continue;
            }
            for (RuleSetCheck r : recheck.recheck(sid, after).rejects()) {
                out.add(RuleCheckReport.issue(RuleSaveIssueCode.SET_CALLER_BROKEN.name(), RuleCheckReport.ERROR, List.of(), null,
                        "세트 " + sid + " 를 부르는 " + r.message()));
            }
        }
        return out;
    }
}
```

- [ ] **Step 8: `RuleSetEditService`·DTO**

`RuleSetEditSearchRequest.java` — 칸 둘(주석 첫 줄도 `CALL_IO(겉모양)·CALLERS(부르는 세트)` 를 더한다):
```java
    /** CALLERS 의 대상 세트 ID. */
    private String setId;
    /** CALL_IO 의 세트 ID 목록(JSON 배열 문자열 — OASIS params 는 List 칸을 묶지 못한다). */
    private String setIdsJson;

    public String getSetId() { return setId; }
    public String getSetIdsJson() { return setIdsJson; }
    public void setSetId(String v) { this.setId = v; }
    public void setSetIdsJson(String v) { this.setIdsJson = v; }
```

`dto/RuleSetCallIoResult.java`:
```java
package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

import com.dongkuk.dmes.mdm.common.rule.SetCallIo;
import java.util.List;

/** {@code ruleSetEdit} search target=CALL_IO 응답(하위 세트 spec §8) — 요청 순서의 겉모양(없는 세트는 exists=false). */
public class RuleSetCallIoResult {

    private List<SetCallIo> calls;

    public RuleSetCallIoResult() {
    }

    public RuleSetCallIoResult(List<SetCallIo> calls) {
        this.calls = calls;
    }

    public List<SetCallIo> getCalls() { return calls; }
    public void setCalls(List<SetCallIo> v) { this.calls = v; }
}
```

`RuleSetViewResult.java` — 칸·getter·setter(`cases` 옆):
```java
    /** 흐름의 SET 노드가 부르는 세트의 겉모양(세트 ID →, 깊이 우선, 하위 세트 spec §8). 없으면 빈 맵. */
    private Map<String, SetCallIo> calls = Map.of();

    public Map<String, SetCallIo> getCalls() { return calls; }
    public void setCalls(Map<String, SetCallIo> v) { this.calls = v; }
```
`RuleSetSimulateResult.java`:
```java
    /** 실행 중 부른 세트(하위 세트 spec §8, 디버거 들어가기) — 세트 ID → {setId, setName, flow(저장된 FLOW_JSON 맵, 없으면 null), ruleIds, rules(RuleIo 목록)}. */
    private Map<String, Object> calledFlows = Map.of();

    public Map<String, Object> getCalledFlows() { return calledFlows; }
    public void setCalledFlows(Map<String, Object> v) { this.calledFlows = v; }
```

`RuleSetEditService.java`:
- 생성자 인자 끝에 `SetCallIoReader callIoReader, SetCallerRecheck recheck` 를 더하고 필드로 둔다. 클래스 javadoc 의 일곱 분기 설명 뒤에 ` search 는 target CALL_IO·CALLERS(하위 세트 겉모양·부르는 세트)도 가른다.` 를 더한다.
- `search(...)`: `GUIDE` 갈래 뒤에
```java
        if ("CALL_IO".equals(target)) {
            return callIo(r.getSetIdsJson());
        }
        if ("CALLERS".equals(target)) {
            return callers(requireSetId(r.getSetId()));
        }
```
  오류 문구를 `"search target 은 SET·RULE·GUIDE·CALL_IO·CALLERS 중 하나여야 합니다: "` 로.
```java
    /** 하위 세트 겉모양(하위 세트 spec §8) — 팔레트로 SET 노드를 놓을 때·다른 탭이 저장했을 때 화면이 부른다. */
    private RuleSetCallIoResult callIo(String setIdsJson) {
        List<Object> ids = setIdsJson == null || setIdsJson.isBlank() ? List.of() : RuleCaseJudge.array(setIdsJson);
        if (ids == null) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "세트 ID 목록 JSON 은 배열이어야 합니다: " + setIdsJson);
        }
        return new RuleSetCallIoResult(List.copyOf(callIoReader.read(ids.stream().map(String::valueOf).toList()).values()));
    }

    /** 이 세트를 부르는 사용 중 세트(속성 패널). */
    private RuleSetPickResult callers(String setId) {
        return new RuleSetPickResult(callIoReader.callers(setId).stream()
                .map(s -> new RuleSetPickResult.Pick(s.getMaruRuleSetId(), s.getMaruRuleSetName(), s.getStatus())).toList());
    }
```
- `view(...)`: `FlowDefinition flow = …` 뒤에 `Map<String, SetCallIo> calls = flow == null ? Map.of() : callIoReader.callsOf(flow);`, `flowChecks(ruleIds, io, flow)` → `flowChecks(ruleIds, io, flow, calls)`, 결과를 만든 뒤 `result.setCalls(calls);` 로 싣는다(`new RuleSetViewResult(...)` 를 지역 변수로 받아서).
- `flowChecks`:
```java
    /** 흐름이 있으면 흐름 기준(하위 세트 겉모양 포함), 없으면 목록 기준 검사. */
    private List<RuleSetCheck> flowChecks(List<String> ids, Map<String, RuleIo> io, FlowDefinition flow, Map<String, SetCallIo> calls) {
        return flow == null ? RuleSetAnalyzer.checks(ids, io) : RuleSetAnalyzer.checks(flow, io, ioReader.condIo(flow), calls);
    }
```
- `save(...)` 의 세트 저장 부분을 다음으로 바꾼다(요청 검사·담당자·쓰기 순서는 그대로).
```java
        String setId = requireSetId(request.getSetId());
        long rv = requireRowVersion(request.getRowVersion());
        String name = validName(request.getSetName());
        List<String> ids;
        List<String> callIds;
        List<RuleSetCheck> checks;
        String flowJson;
        FlowDefinition shapeFlow;
        Map<String, RuleIo> rules;
        Map<String, SetCallIo> calls;
        if (request.getFlowJson() != null && !request.getFlowJson().isBlank()) {
            FlowDefinition flow = requestFlow(request.getFlowJson());
            ids = RuleSetFlowJson.ruleIds(flow);
            ids.forEach(RuleIdRules::validateRuleId);
            callIds = RuleSetFlowJson.setIds(flow);
            stewardCheck.requireSteward();
            rules = ioReader.read(ids);
            calls = callIoReader.read(callIds);
            checks = new ArrayList<>(RuleSetAnalyzer.checks(flow, rules, ioReader.condIo(flow), calls));
            flowJson = requestFlowJson(request.getFlowJson());
            shapeFlow = flow;
        } else {
            ids = requestRuleIds(request.getRules());
            callIds = List.of();
            stewardCheck.requireSteward();
            rejectListSaveOverFlow(setId);
            rules = ioReader.read(ids);
            calls = Map.of();
            checks = new ArrayList<>(RuleSetAnalyzer.checks(ids, rules));
            flowJson = null;
            shapeFlow = FlowParser.linear(ids);
        }
        checks.addAll(graphChecks(setId, callIds));
        if (checks.stream().noneMatch(RuleSetCheck::rejected)) {
            checks.addAll(callerChecks(setId, name, shapeFlow, rules, calls));
        }
        rejectIfAny(checks);
        String description = blankToNull(request.getDescription());
        String callSetIdsJson = DomainJson.write(callIds);
        tx.executeWithoutResult(status -> {
            if (writes.update(setId, name, DomainJson.write(ids), flowJson, callSetIdsJson, description, rv) == 0) {
                throw writeMissed(setId, rv, INUSE);
            }
        });
        return new RuleSetSaveResult(setId, rv + 1, warnings(checks));
```
  (Task 3 의 `SEAM(T6)` 주석과 `"[]"` 인자가 여기서 사라진다.)
```java
    /** 호출 그래프 검사(CALL_CYCLE·CALL_DEPTH) — 사용 중 세트의 CALL_SET_IDS 에 이 세트의 새 목록을 덮는다. */
    private List<RuleSetCheck> graphChecks(String setId, List<String> callIds) {
        Map<String, List<String>> edges = new LinkedHashMap<>(callIoReader.inuseEdges());
        edges.put(setId, callIds);
        return RuleSetCallGraph.check(setId, edges);
    }

    /**
     * 연쇄 재검사(하위 세트 spec §6.1) — 이 세트의 새 겉모양이 저장된 겉모양과 다르면 부르는 세트를 다시 검사한다. 새 거부는 CALLER_BROKEN,
     * 새 경고가 생긴 부르는 세트가 있으면 WARN CALLER_WARN 한 건.
     */
    private List<RuleSetCheck> callerChecks(String setId, String name, FlowDefinition flow, Map<String, RuleIo> rules, Map<String, SetCallIo> calls) {
        SetCallIo before = callIoReader.read(List.of(setId)).get(setId);
        SetCallIo after = RuleSetInterface.of(setId, name, true, INUSE, flow, rules, calls);
        if (after.sameShape(before)) {
            return List.of();
        }
        SetCallerRecheck.Outcome o = recheck.recheck(setId, after);
        List<RuleSetCheck> out = new ArrayList<>(o.rejects());
        if (!o.warnedCallers().isEmpty()) {
            out.add(new RuleSetCheck(RuleSetCheck.CALLER_WARN, RuleSetCheck.WARN, null, null, null,
                    "부르는 세트에 경고가 생겼다: " + String.join(", ", o.warnedCallers())));
        }
        return out;
    }
```
- `delete(...)`: `stewardCheck.requireSteward();` 뒤에
```java
        List<String> callers = callIoReader.callers(setId).stream().map(MdmRuleSet::getMaruRuleSetId).toList();
        if (!callers.isEmpty()) {
            throw RuleSetRejections.saveRejected(List.of(new RuleSetCheck(RuleSetCheck.CALLER_BROKEN, RuleSetCheck.REJECT, setId, null, null,
                    "사용 중인 세트 " + String.join(", ", callers) + "가 이 세트를 불러 폐기할 수 없다. 부르는 세트를 먼저 고치거나 폐기한다")));
        }
```
  주석 머리 `// action: delete(폐기) — INUSE → DEPRECATED. 검사를 돌리지 않는다(I14).` → `… 경로 검사는 돌리지 않고, 부르는 사용 중 세트가 있으면 거부한다(I14, 하위 세트 spec §6.2).`
- `restore(...)`: 트랜잭션 안의 검사를
```java
            List<String> ids = ruleIdsOf(state.ruleIds());
            FlowDefinition flow = storedFlow(setId, state.flowJson());
            List<String> callIds = flow == null ? List.of() : RuleSetFlowJson.setIds(flow);
            List<RuleSetCheck> checks = new ArrayList<>(flowChecks(ids, ioReader.read(ids), flow, callIoReader.read(callIds)));
            checks.addAll(graphChecks(setId, callIds));
            rejectIfAny(checks);
```
  로 바꾼다.
- `simulate(...)`: `return new RuleSetSimulateResult(RunTraceJson.toMap(trace), simulateWarnings(flowJson, trace));` 를
```java
        RuleSetSimulateResult result = new RuleSetSimulateResult(RunTraceJson.toMap(trace), simulateWarnings(flowJson, trace));
        result.setCalledFlows(calledFlows(trace));
        return result;
```
  로 바꾸고 도우미를 더한다.
```java
    /** 실행 중 부른 세트(기록의 sub 를 따라 모두, 처음 나온 순서) → {setId, setName, flow, ruleIds, rules}(하위 세트 spec §8, 디버거 들어가기 — rules 는 하위 흐름 룰 노드 제목용). */
    private Map<String, Object> calledFlows(RunTrace trace) {
        Set<String> ids = new java.util.LinkedHashSet<>();
        collectSubs(trace, ids);
        Map<String, Object> out = new LinkedHashMap<>();
        for (String id : ids) {
            setRepository.findById(id).ifPresent(s -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("setId", id);
                m.put("setName", s.getMaruRuleSetName());
                m.put("flow", s.getFlowJson() == null ? null : RuleSetFlowJson.toMap(s.getFlowJson()));
                List<String> ruleIds = ruleIdsOf(s.getRuleIds());
                m.put("ruleIds", ruleIds);
                m.put("rules", List.copyOf(ioReader.read(ruleIds).values()));
                out.put(id, m);
            });
        }
        return out;
    }

    private static void collectSubs(RunTrace t, Set<String> ids) {
        for (RunTrace.NodeTrace n : t.nodes()) {
            if (n.sub() != null) {
                ids.add(n.sub().setId());
                collectSubs(n.sub(), ids);
            }
        }
    }
```
  import: `SetCallIo`·`SetCallIoReader`·`SetCallerRecheck`·`RuleSetCallGraph`·`RuleSetInterface`·`RuleSetCallIoResult`·`FlowParser`·`MdmRuleSet`(이미 있다).

- [ ] **Step 9: 실행기·조회기·세트 순서 검사**

`RuleErrorText.java`(`describe` 아래):
```java
    /** 하위 세트에서 올라온 위반 — 문구 앞에 세트 경로("세트 A › 단가 결정(s1) › ")를 붙인다(하위 세트 spec §4.1). 경로가 비면 그대로. */
    public static String withSetPath(String pathText, String text) {
        return pathText == null || pathText.isEmpty() ? text : pathText + text;
    }
```

`RuleSetRunResult.java`:
```java
    /** 실행한 SET 노드마다 {nodeId, setId, endedBy(하위 세트를 끝낸 받는 노드, 없으면 null)}(실행 순서, 하위 세트 spec §8). */
    private List<Map<String, Object>> calls = List.of();

    public List<Map<String, Object>> getCalls() { return calls; }
    public void setCalls(List<Map<String, Object>> v) { this.calls = v; }
```

`RuleSetRunner.java`:
- `execute(...)` 의 판정 오류 문구:
```java
        } catch (EngineEvaluationException e) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, e.violations().stream()
                    .map(v -> RuleErrorText.withSetPath(pathText(request.getSetId(), v.setPath()), (v.ruleId() == null ? "" : "[" + v.ruleId() + "] ")
                            + RuleErrorText.describe(v.stage().name(), v.code().name(), v.rowId(), v.name(), v.message())))
                    .collect(Collectors.joining("; ")));
        }
```
- 경로 맵에 `m.put("callIndex", p.callIndex());` 를 `stepIndex` 뒤에, 응답에
```java
        out.setCalls(r.calls().stream().map(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("nodeId", c.nodeId());
            m.put("setId", c.setId());
            m.put("endedBy", c.result().endedBy());
            return m;
        }).toList());
```
  를 더한다. CATCH 가 `caught` 를 맵으로 싣는 곳에 `m.put("setPath", List.copyOf(x.setPath()));` 를 마지막 키로 더한다.
- `warnings(...)` 의 엔진 경고 모으기를 하위 결과까지:
```java
        List<EngineWarning> engine = new ArrayList<>();
        collectWarnings(r, engine);
```
```java
    /** 세트 경고 → 룰 경고(실행 순서) → 하위 세트 결과의 같은 순서(calls 순서). */
    private static void collectWarnings(RuleSetResult r, List<EngineWarning> out) {
        out.addAll(r.warnings());
        r.steps().forEach(s -> out.addAll(s.warnings()));
        r.calls().forEach(c -> collectWarnings(c.result(), out));
    }
```
- 경로 문구:
```java
    /** 위반의 setPath → "세트 {최상위} › {label 또는 세트 ID}({노드 ID}) › …"(하위 세트 spec §4.1). 비었으면 "". 노드·세트를 못 찾으면 노드 ID 만 쓴다. */
    String pathText(String setId, List<String> setPath) {
        if (setPath == null || setPath.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder("세트 ").append(setId).append(" › ");
        String cur = setId;
        for (String nodeId : setPath) {
            FlowNode n = null;
            if (cur != null) {
                MdmRuleSet s = sets.findById(cur).orElse(null);
                if (s != null && s.getFlowJson() != null) {
                    try {
                        n = RuleSetFlowJson.parse(s.getFlowJson()).nodes().stream().filter(x -> x.id().equals(nodeId)).findFirst().orElse(null);
                    } catch (IllegalArgumentException e) {
                        n = null;
                    }
                }
            }
            String label = n == null ? null : n.label() != null && !n.label().isBlank() ? n.label() : n.setId();
            sb.append(label == null ? nodeId : label + "(" + nodeId + ")").append(" › ");
            cur = n == null ? null : n.setId();
        }
        return sb.toString();
    }
```
  (import `kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode`.)

`StoredDefinitionLookup.java`:
```java
    private final Map<String, Optional<RuleSetDefinition>> setCache = new HashMap<>();
```
```java
    /** 세트 현재 행 — 한 인스턴스(한 실행) 안에서 캐시한다(같은 하위 세트를 여러 번 부를 수 있다, 하위 세트 spec §8). */
    @Override
    public Optional<RuleSetDefinition> ruleSet(String setId) {
        return setCache.computeIfAbsent(setId, k -> sets.findById(k).map(StoredDefinitionLookup::toDefinition));
    }
```

`RuleSetOrderCheck.java` — 생성자에 `SetCallIoReader reader` 를 더하고, `before` 를 3인자로:
```java
            Map<String, At> before = RuleSetPathState.before(tree, id -> id.equals(me) ? self.produces()
                    : others.containsKey(id) ? others.get(id).produces() : Set.of(), setId -> always(setId));
```
```java
    /** 하위 세트의 always 출력(세트 순서 검사가 SET 노드 뒤 룰을 잘못 문제 삼지 않게, 하위 세트 계획 Task 5·6). */
    private Set<String> always(String setId) {
        SetCallIo io = reader.read(List.of(setId)).get(setId);
        Set<String> out = new LinkedHashSet<>();
        if (io != null) {
            io.outputs().stream().filter(SetCallIo.OutputName::always).forEach(o -> out.add(o.name()));
        }
        return out;
    }
```

- [ ] **Step 10: 통과 확인**

Run(차례로):
```bash
(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)
(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetSubsetServiceTest' --tests '*RuleSetCallerCheckTest' --tests '*RuleSetRunnerSubsetTest' --tests '*SetCallIoEngineAgreementTest' --console=plain)
(cd src/backend/mdm && ../gradlew :api:test --console=plain -q)
(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)
```
Expected: 모두 PASS. 기존 `RuleSetEditServiceTest`·`RuleLedgerChecksTest`·`MdmOasisActionVocabularyTest`·HTTP 골든이 그대로 초록이다(새 action 이 없다).

- [ ] **Step 11: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib/src/main/java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCallGraphTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetSubsetServiceTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleEdit/RuleSetCallerCheckTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunnerSubsetTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/SetCallIoEngineAgreementTest.java
/usr/bin/git commit -m "feat(mdm): 룰 세트 저장이 부르는 세트를 연쇄로 다시 검사하고 하위 세트 조회·실행 응답을 싣는다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/backend/mdm/lib/src/main/java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCallGraphTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetSubsetServiceTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleEdit/RuleSetCallerCheckTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunnerSubsetTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/SetCallIoEngineAgreementTest.java
```

---

### Task 7: 화면 — 편집 화면 안 세트 탭(`RuleSetEditor`·`RuleSetTabs`·`tabs-model`)

> **갱신 메모(레인이 착수 때 반영, 2026-10-06 plan:0)** — 아래 본문은 `2e02d29d` 기준이다. 본문보다 이 메모와 Task 0 대조표가 앞선다.
> - 담당 ui:7. 본문은 사실상 다시 쓴다: `page.tsx` 는 지금 872줄이고 `SetVersionRow`·`useAutoSave`·`ViewportGuard` 가 더해졌다(D-144). 편차 6 은 **shared 새 컴포넌트 등록**으로 바뀌었다 — 세트 탭 틀(탭 머리·닫기 단추·숨김 패널)을 `@dk-oasis/shared` 새 컴포넌트로 만들고 같은 작업 안에서 `mantine-aggrid-ui` 스킬의 컴포넌트 문서와 색인을 갱신한다. 기존 `shared/src/components/tabs/**` 는 고치지 않는다.
> - 자동 저장(`useAutoSave`)·DRAFT 선점(버전 행)·버전 줄(`SetVersionRow`)은 **탭마다 독립**이다. 한 탭의 자동 저장·선점이 다른 탭 세트에 닿지 않는지 시험한다.

**모델:** opus — 812줄 `page.tsx` 를 탭 틀과 편집기로 나누면서 단축키·되돌리기·beforeunload·포털 파라미터 동작을 그대로 지켜야 한다. 백엔드 태스크와 겹치는 파일이 없어 첫 물결에서 돈다.

**이 태스크가 정한 것:**
- `page.tsx` 는 기본 내보내기 `RuleSetEditPage({ tabId })` 가 `<RuleSetTabs tabId={tabId} />` 만 그리는 얇은 파일이 된다. 탭 틀(`RuleSetTabs.tsx`)이 `<style>` 주입·`MdmPageLayout`·위 바(`IdPicker`·현재 세트·탭 메시지)·탭 머리·탭 패널을 그린다. 지금 `page.tsx` 의 나머지 본문은 `RuleSetEditor.tsx` 로 옮긴다(Ruling 12).
- 탭 목록은 순수 함수 `tabs-model.ts` 로 다룬다. 편집기는 열 세트를 `request: { setId, seq }` 로 받고(seq 가 바뀔 때만 `open`), 상태를 `onStatus(tabKey, { setId, setName, dirty })` 로 알린다.
- 패널은 탭마다 늘 그리고(마운트 유지) 고르지 않은 패널은 `hidden` + 인라인 `display:none` 으로 숨긴다(편차 6). 그러면 지금의 `isShown(canvasHostRef)` 판정이 숨은 탭의 ⌘Z 를 그대로 막는다.
- 닫기 확인은 `window.confirm(CLOSE_CONFIRM)`(이 화면의 dirty 확인과 같은 방식, 편차 6). 마지막 탭은 닫기 단추가 없다.
- 보는 사람 설정(Ruling 22): 변수 표시·미니맵은 지금처럼 각 편집기가 localStorage 에서 읽고 쓰되, 저장할 때 탭 틀에 알리고(`publishPrefs`) 다른 탭은 디버그 모드가 아니면 그 값을 바로 따른다(디버그 모드의 자동 켜기·되돌리기 P-D16 은 탭마다 그대로). 분할 크기는 같은 `storageKey` 를 쓰므로 새로 여는 탭이 따른다(열려 있는 탭끼리 실시간으로 맞추지는 않는다).
- 탭 사이 연동 틀(`RuleSetTabsContext`: `openSet`·`notifyWritten`·`written`·`dirtySetIds`·`prefs`·`publishPrefs`)을 이 태스크가 만든다. SET 노드 링크·저장 알림 반응은 Task 8 이 쓴다.

**Files:**
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/tabs-model.ts`
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/RuleSetTabs.tsx`
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/RuleSetEditor.tsx`(지금 `page.tsx` 본문을 옮긴다)
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/tabs.ts`
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx`(전체 — 얇은 기본 내보내기)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/rsf-styles.ts`(`TABS_CSS` 잇기)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts`(`save`·`deprecate`·`restore` 뒤 `onWritten` 콜백 — 인자 하나 추가)
- Create(Test): `src/frontend/m-mdm/tests/dme/ruleSetEdit/tabs-model.test.ts`
- Create(Test): `src/frontend/m-mdm/tests/dme/ruleSetEdit/set-tabs.test.ts`
- Modify(Test): `src/frontend/m-mdm/tests/dme/helpers/rule-set-page.ts`(새 도우미 `activateTab`·`inPanel`)

**Interfaces:**
- Consumes: 없음(화면 파일만).
- Produces(Task 8·9 가 쓴다):
  - `tabs-model.ts`: `MAX_SET_TABS = 8`, `TAB_LIMIT_MESSAGE`, `CLOSE_CONFIRM`, `interface OpenRequest { setId: string; seq: number }`, `interface SetTab { key: string; setId: string | null; setName: string | null; dirty: boolean; request: OpenRequest | null }`, `interface TabsState { tabs: SetTab[]; active: string; seq: number }`, `interface TabStatus { setId: string | null; setName: string | null; dirty: boolean }`, `initialTabs()`, `currentOf(t)`, `openInActive(s, setId)`, `openLinked(s, setId): { state; message }`, `openFromParams(s, setId): { state; message }`, `selectTab(s, key)`, `closeTab(s, key)`, `withStatus(s, key, status)`, `dirtySetIds(s): ReadonlySet<string>`.
  - `RuleSetTabs.tsx`: `export const RuleSetTabsContext: React.Context<RuleSetTabsApi>`, `export interface RuleSetTabsApi { openSet(setId: string): void; notifyWritten(setId: string): void; written: { setId: string; seq: number } | null; dirtySetIds: ReadonlySet<string>; prefs: ViewPrefs; publishPrefs(p: Partial<Pick<ViewPrefs, "varDisplay" | "miniMap">>): void }`, `export interface ViewPrefs { varDisplay: VarDisplay; miniMap: boolean; seq: number }`, `export function RuleSetTabs({ tabId }: { tabId?: string })`.
  - `RuleSetEditor.tsx`: `export function RuleSetEditor(props: { tabKey: string; request: OpenRequest | null; onStatus(tabKey: string, status: TabStatus): void })`.
  - `useRuleSetEdit(opts?: { onWritten?: (setId: string) => void })` — 저장·폐기·되살리기가 성공해 다시 불러온 뒤 한 번 부른다.
  - testid: `set-tabs`(탭 머리 줄), `set-tab-{key}`(탭 단추, `aria-selected`), `set-tab-dirty-{key}`(저장 안 한 변경 점), `set-tab-close-{key}`(닫기), `set-tab-panel-{key}`(패널), `set-tabs-message`(탭 메시지). 첫 탭 key 는 `t1`, 새 탭은 `t{seq}`.

- [ ] **Step 1: Mantine 9.6 `Tabs` `keepMounted` 확인(스킬 조회 스크립트)**

Run(차례로, 저장소 루트):
```bash
python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py version
python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py get Tabs --section Props
grep -n "keepMounted" src/frontend/node_modules/.pnpm/@mantine+core@9.6.0*/node_modules/@mantine/core/lib/components/Tabs/Tabs.d.ts
```
Expected: `@mantine/core 9.6.0`. `.d.ts` 에 `keepMounted?: boolean` 과 `keepMountedMode?: 'activity' | 'display-none'`(기본 `'activity'`) 가 있다(계획 작성 때 2e02d29d 의 설치본에서 확인함 — Tabs.d.ts 39-41행). 기본 `'activity'` 는 숨은 패널을 React `Activity` 로 숨겨 **효과(effect)를 내린다** — 숨은 탭의 `beforeunload`·`document` keydown 리스너가 사라져 스펙 §10.2 의 "하나라도 dirty 면 확인" 이 깨진다. 이 화면은 어차피 `@mantine/*` 를 import 하지 못하므로(편차 6) 패널을 직접 그리고 `display:none`(Mantine 의 `'display-none'` 모드와 같은 동작)으로 숨긴다. 조회 결과(두 모드와 기본값)를 태스크 보고에 적는다. 결과가 위와 다르면(예: `keepMountedMode` 가 없음) 그대로 보고하되 이 태스크의 구현 방식은 바뀌지 않는다.

- [ ] **Step 2: 순수 함수 실패 시험 — `tests/dme/ruleSetEdit/tabs-model.test.ts`**

```ts
// 하위 세트 spec §10.3 — 세트 탭 열기·닫기·상한(순수 함수).
import { describe, expect, it } from "vitest";

import {
  CLOSE_CONFIRM, MAX_SET_TABS, TAB_LIMIT_MESSAGE, closeTab, currentOf, dirtySetIds, initialTabs, openFromParams, openInActive, openLinked, selectTab,
  withStatus, type TabsState,
} from "../../../pages/dme/ruleSetEdit/tabs-model";

const loaded = (s: TabsState, key: string, setId: string, dirty = false) => withStatus(s, key, { setId, setName: `${setId} 이름`, dirty });

describe("tabs-model", () => {
  it("처음에는 세트 없는 탭 하나다", () => {
    const s = initialTabs();
    expect(s.tabs.map((t) => t.key)).toEqual(["t1"]);
    expect(s.active).toBe("t1");
    expect(currentOf(s.tabs[0])).toBeNull();
    expect(MAX_SET_TABS).toBe(8);
    expect(TAB_LIMIT_MESSAGE).toBe("세트 탭은 8개까지 연다. 다른 탭을 닫고 다시 연다");
    expect(CLOSE_CONFIRM).toBe("저장하지 않은 변경이 있다. 닫으면 변경을 버린다.");
  });

  it("위 바 고르기는 지금 탭에서 열고 매번 새 요청 번호를 준다", () => {
    const a = openInActive(initialTabs(), "S1");
    const b = openInActive(a, "S1");
    expect(a.tabs[0].request?.setId).toBe("S1");
    expect(b.tabs[0].request!.seq).toBeGreaterThan(a.tabs[0].request!.seq);
    expect(b.tabs).toHaveLength(1);
  });

  it("링크는 이미 열린 탭으로 가고, 없으면 지금 탭 오른쪽에 새 탭을 연다", () => {
    let s = loaded(openInActive(initialTabs(), "S1"), "t1", "S1");
    s = openLinked(s, "S2").state;
    expect(s.tabs.map((t) => currentOf(t))).toEqual(["S1", "S2"]);
    expect(s.active).toBe(s.tabs[1].key);
    s = selectTab(s, "t1");
    s = openLinked(s, "S3").state;
    expect(s.tabs.map((t) => currentOf(t))).toEqual(["S1", "S3", "S2"]);
    const again = openLinked(s, "S2");
    expect(again.state.tabs).toHaveLength(3);
    expect(currentOf(again.state.tabs.find((t) => t.key === again.state.active)!)).toBe("S2");
  });

  it("탭이 8개면 열지 않고 메시지를 낸다", () => {
    let s = loaded(openInActive(initialTabs(), "S0"), "t1", "S0");
    for (let i = 1; i < MAX_SET_TABS; i++) s = openLinked(s, `S${i}`).state;
    expect(s.tabs).toHaveLength(8);
    const r = openLinked(s, "S9");
    expect(r.state).toBe(s);
    expect(r.message).toBe(TAB_LIMIT_MESSAGE);
  });

  it("포털 파라미터는 세트 없는 탭 하나뿐이면 그 탭에서, 아니면 링크처럼 연다", () => {
    const first = openFromParams(initialTabs(), "S1");
    expect(first.state.tabs).toHaveLength(1);
    expect(first.state.tabs[0].request?.setId).toBe("S1");
    const second = openFromParams(loaded(first.state, "t1", "S1"), "S2");
    expect(second.state.tabs.map((t) => currentOf(t))).toEqual(["S1", "S2"]);
  });

  it("닫으면 오른쪽(없으면 왼쪽) 탭으로 가고 마지막 탭은 닫지 않는다", () => {
    let s = loaded(openInActive(initialTabs(), "S1"), "t1", "S1");
    s = openLinked(s, "S2").state;
    s = openLinked(selectTab(s, "t1"), "S3").state; // S1 · S3 · S2, 지금 S3
    const k3 = s.active;
    s = closeTab(s, k3);
    expect(s.tabs.map((t) => currentOf(t))).toEqual(["S1", "S2"]);
    expect(currentOf(s.tabs.find((t) => t.key === s.active)!)).toBe("S2");
    s = closeTab(closeTab(s, s.active), "t1");
    expect(s.tabs).toHaveLength(1);
  });

  it("상태 알림은 같은 값이면 같은 객체를 돌려주고, dirty 탭의 세트를 모은다", () => {
    const s = loaded(openInActive(initialTabs(), "S1"), "t1", "S1");
    expect(withStatus(s, "t1", { setId: "S1", setName: "S1 이름", dirty: false })).toBe(s);
    const d = withStatus(s, "t1", { setId: "S1", setName: "S1 이름", dirty: true });
    expect([...dirtySetIds(d)]).toEqual(["S1"]);
  });
});
```

Run: `pnpm --dir src/frontend --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/tabs-model.test.ts`
Expected: FAIL — 모듈이 없다.

- [ ] **Step 3: `tabs-model.ts`**

```ts
/**
 * 룰 세트 편집 화면 안 세트 탭(하위 세트 spec §10.3, C-D13) — 탭 목록 순수 함수. React 의존이 없다.
 * 탭은 열 세트를 요청(`request`)으로 받고, 편집기가 세트를 불러온 뒤 알린 상태(`setId`·`setName`·`dirty`)를 갖는다.
 */
export const MAX_SET_TABS = 8;
export const TAB_LIMIT_MESSAGE = "세트 탭은 8개까지 연다. 다른 탭을 닫고 다시 연다";
export const CLOSE_CONFIRM = "저장하지 않은 변경이 있다. 닫으면 변경을 버린다.";

export interface OpenRequest {
  setId: string;
  seq: number;
}

export interface SetTab {
  key: string;
  /** 편집기가 불러온 세트(알림 전이면 null). */
  setId: string | null;
  setName: string | null;
  dirty: boolean;
  /** 마지막으로 보낸 열기 요청. seq 가 바뀔 때만 편집기가 연다. */
  request: OpenRequest | null;
}

export interface TabsState {
  tabs: SetTab[];
  active: string;
  /** 요청 번호·새 탭 key 의 바탕. 늘 커진다. */
  seq: number;
}

export interface TabStatus {
  setId: string | null;
  setName: string | null;
  dirty: boolean;
}

export interface TabsResult {
  state: TabsState;
  message: string | null;
}

export function initialTabs(): TabsState {
  return { tabs: [{ key: "t1", setId: null, setName: null, dirty: false, request: null }], active: "t1", seq: 1 };
}

/** 탭의 세트 — 불러온 세트, 아직이면 요청한 세트, 둘 다 없으면 null. */
export const currentOf = (t: SetTab): string | null => t.setId ?? t.request?.setId ?? null;

/** 위 바 세트 고르기 — 지금 탭에서 연다(저장 안 한 변경 확인은 편집기의 open 이 한다). */
export function openInActive(s: TabsState, setId: string): TabsState {
  const seq = s.seq + 1;
  return { ...s, seq, tabs: s.tabs.map((t) => (t.key === s.active ? { ...t, request: { setId, seq } } : t)) };
}

/** SET 노드 링크·속성 패널 링크 — 그 세트가 열린 탭이 있으면 그 탭으로, 없으면 지금 탭 오른쪽에 새 탭(상한 8). */
export function openLinked(s: TabsState, setId: string): TabsResult {
  const open = s.tabs.find((t) => currentOf(t) === setId);
  if (open) return { state: open.key === s.active ? s : { ...s, active: open.key }, message: null };
  if (s.tabs.length >= MAX_SET_TABS) return { state: s, message: TAB_LIMIT_MESSAGE };
  const seq = s.seq + 1;
  const tab: SetTab = { key: `t${seq}`, setId: null, setName: null, dirty: false, request: { setId, seq } };
  const at = s.tabs.findIndex((t) => t.key === s.active);
  return { state: { tabs: [...s.tabs.slice(0, at + 1), tab, ...s.tabs.slice(at + 1)], active: tab.key, seq }, message: null };
}

/** 포털 파라미터(setId) — 세트를 아직 안 연 탭 하나뿐이면 그 탭에서, 아니면 링크와 같다. */
export function openFromParams(s: TabsState, setId: string): TabsResult {
  if (s.tabs.length === 1 && currentOf(s.tabs[0]) == null) return { state: openInActive({ ...s, active: s.tabs[0].key }, setId), message: null };
  return openLinked(s, setId);
}

export function selectTab(s: TabsState, key: string): TabsState {
  return s.active !== key && s.tabs.some((t) => t.key === key) ? { ...s, active: key } : s;
}

/** 닫기 — 마지막 탭은 닫지 않는다. 지금 탭을 닫으면 오른쪽(없으면 왼쪽) 탭으로 간다. 확인은 호출자가 한다. */
export function closeTab(s: TabsState, key: string): TabsState {
  if (s.tabs.length <= 1) return s;
  const i = s.tabs.findIndex((t) => t.key === key);
  if (i < 0) return s;
  const tabs = s.tabs.filter((t) => t.key !== key);
  const active = s.active !== key ? s.active : (tabs[i] ?? tabs[i - 1]).key;
  return { ...s, tabs, active };
}

/** 편집기 알림 — 값이 같으면 같은 객체(다시 그리기 고리를 막는다). */
export function withStatus(s: TabsState, key: string, st: TabStatus): TabsState {
  const t = s.tabs.find((x) => x.key === key);
  if (!t || (t.setId === st.setId && t.setName === st.setName && t.dirty === st.dirty)) return s;
  return { ...s, tabs: s.tabs.map((x) => (x.key === key ? { ...x, setId: st.setId, setName: st.setName, dirty: st.dirty } : x)) };
}

/** 저장하지 않은 변경이 있는 탭의 세트 ID(하위 세트 spec §10.4 디버거 경고). */
export function dirtySetIds(s: TabsState): ReadonlySet<string> {
  return new Set(s.tabs.filter((t) => t.dirty && t.setId).map((t) => t.setId as string));
}
```

Run: 같은 vitest 명령 → PASS.

- [ ] **Step 4: 화면 실패 시험 — 도우미와 `tests/dme/ruleSetEdit/set-tabs.test.ts`**

`tests/dme/helpers/rule-set-page.ts` 끝에:
```ts
/** 포털이 이 화면 탭을 다시 고른 것처럼 알린다 — 넘김 값(handoff)을 다시 읽는다(useMdmPageParams). */
export async function activateTab(tabId: string): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new CustomEvent("portal-tab-activated", { detail: { tabId } }));
  });
  await flush();
  await settle();
}

/** 세트 탭 패널 안에서 testid 를 찾는다(여러 탭이 같은 testid 를 갖는다). */
export function inPanel<T extends Element = HTMLElement>(tabKey: string, id: string): T {
  const el = byTestId(`set-tab-panel-${tabKey}`).querySelector(`[data-testid="${id}"]`) as T | null;
  if (!el) throw new Error(`탭 ${tabKey} 안에 data-testid ${id} 없음`);
  return el;
}
```

`set-tabs.test.ts`:
```ts
/** @vitest-environment happy-dom */
// 하위 세트 spec §10 — 편집 화면 안 세트 탭: 포털 파라미터·링크로 새 탭, 상한, dirty 닫기 확인, 숨은 탭 ⌘Z, 탭마다 따로인 상태.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/dme/rule-handoff", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/dme/rule-handoff")>()) }));

import type { RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush } from "../helpers/render";
import { activateTab, byTestId, click, handoff, inPanel, installServer, openSet, q, srv, uninstallServer } from "../helpers/rule-set-page";

function viewOf(setId: string): RuleSetView {
  return {
    set: { setId, setName: `${setId} 세트`, description: null, status: "INUSE", rowVersion: 0, ruleIds: [], flow: null, branched: false },
    rules: [],
    checks: [],
    editable: true,
    restorable: false,
    condIo: {},
    cases: [],
  } as unknown as RuleSetView;
}

async function openLink(setId: string): Promise<void> {
  srv.views[setId] = viewOf(setId);
  handoff(setId);
  await activateTab("T1");
}

async function key(target: EventTarget, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    target.dispatchEvent(ev);
  });
  await flush();
  return ev;
}

describe("세트 탭", () => {
  beforeEach(installServer);
  afterEach(uninstallServer);

  it("포털 파라미터는 첫 빈 탭에서 열고, 두 번째부터 새 탭으로 열어 고른다", async () => {
    await openSet("S1", viewOf("S1"), { tabId: "T1" });
    expect(byTestId("set-tab-t1").textContent).toContain("S1");
    await openLink("S2");
    const tabs = Array.from(byTestId("set-tabs").querySelectorAll('[role="tab"]'));
    expect(tabs.map((t) => t.textContent)).toEqual([expect.stringContaining("S1"), expect.stringContaining("S2")]);
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(byTestId("set-tab-panel-t1").style.display).toBe("none");
    expect(byTestId("set-tab-panel-t1").hasAttribute("hidden")).toBe(true);
  });

  it("이미 열린 세트를 다시 열면 그 탭으로 간다", async () => {
    await openSet("S1", viewOf("S1"), { tabId: "T1" });
    await openLink("S2");
    await openLink("S1");
    expect(byTestId("set-tabs").querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(byTestId("set-tab-t1").getAttribute("aria-selected")).toBe("true");
  });

  it("탭이 8개면 더 열지 않고 메시지를 보인다", async () => {
    await openSet("S0", viewOf("S0"), { tabId: "T1" });
    for (let i = 1; i < 8; i++) await openLink(`S${i}`);
    await openLink("S8");
    expect(byTestId("set-tabs").querySelectorAll('[role="tab"]')).toHaveLength(8);
    expect(byTestId("set-tabs-message").textContent).toBe("세트 탭은 8개까지 연다. 다른 탭을 닫고 다시 연다");
  });

  it("저장하지 않은 변경이 있는 탭은 닫기 전에 확인하고, 마지막 탭에는 닫기 단추가 없다", async () => {
    await openSet("S1", viewOf("S1"), { tabId: "T1" });
    expect(q("set-tab-close-t1")).toBeNull();
    await openLink("S2");
    const second = byTestId("set-tabs").querySelectorAll('[role="tab"]')[1].getAttribute("data-testid")!.replace("set-tab-", "");
    await click(`set-tab-t1`);
    await click(`flow-mode-edit`);
    await click(`flow-add-note`); // 지금(t1) 탭 흐름에 메모 하나 — dirty
    expect(q("set-tab-dirty-t1")).not.toBeNull();
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    await click("set-tab-close-t1");
    expect(window.confirm).toHaveBeenCalledWith("저장하지 않은 변경이 있다. 닫으면 변경을 버린다.");
    expect(q("set-tab-t1")).not.toBeNull();
    await click("set-tab-close-t1");
    expect(q("set-tab-t1")).toBeNull();
    expect(byTestId(`set-tab-${second}`).getAttribute("aria-selected")).toBe("true");
  });

  it("숨은 탭의 흐름은 ⌘Z 로 되돌리지 않는다", async () => {
    await openSet("S1", viewOf("S1"), { tabId: "T1" });
    await click("flow-mode-edit");
    await click("flow-add-note");
    const notes = () => byTestId("set-tab-panel-t1").querySelectorAll('[data-testid^="flow-note-"]').length;
    const before = notes();
    expect(before).toBeGreaterThan(0);
    await openLink("S2");
    const ev = await key(document.body, { key: "z", metaKey: true });
    expect(ev.defaultPrevented).toBe(false);
    expect(notes()).toBe(before);
  });

  it("탭마다 모드가 따로다", async () => {
    await openSet("S1", viewOf("S1"), { tabId: "T1" });
    await click("flow-mode-edit");
    await openLink("S2");
    const second = byTestId("set-tabs").querySelectorAll('[role="tab"]')[1].getAttribute("data-testid")!.replace("set-tab-", "");
    expect(inPanel(second, "flow-mode-view").getAttribute("aria-pressed")).toBe("true");
    expect(inPanel("t1", "flow-mode-edit").getAttribute("aria-pressed")).toBe("true");
  });
});
```
(`flow-mode-edit`·`flow-mode-view`·`flow-add-note`·`flow-note-*` 는 지금 화면의 testid 다 — `grep -rn "flow-mode-\|flow-note-" src/frontend/m-mdm/pages/dme/ruleSetEdit` 로 확인하고 다르면 맞춘다. `click`·`byTestId` 는 문서 순서로 첫 요소를 찾으므로, 두 탭이 같은 testid 를 가질 때는 `inPanel` 을 쓴다. 위 시험에서 `click("flow-mode-edit")` 등은 t1 이 첫 패널이고 지금 탭일 때만 쓴다.)

Run: `pnpm --dir src/frontend --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/set-tabs.test.ts`
Expected: FAIL — `set-tab-t1` 이 없다.

- [ ] **Step 5: `RuleSetEditor.tsx` 로 옮기기**

`page.tsx` 를 `RuleSetEditor.tsx` 로 복사한 뒤 다음을 바꾼다(그 밖의 줄은 한 글자도 바꾸지 않는다).
1. 머리 주석 첫 줄을 `ruleSetEdit 세트 탭 하나의 편집기(하위 세트 spec §10.2, C-D14) — 탭 틀(RuleSetTabs)이 탭마다 하나씩 그린다. 세트 상태·되돌리기·모드·선택·디버거는 탭마다 따로다.` 로 바꾸고, `상단 바의 세트 고르기(IdPicker)로 고르거나 … 연다(useMdmPageParams, I22).` 문장을 `열 세트는 탭 틀이 request 로 넘긴다(seq 가 바뀔 때만 연다).` 로 바꾼다.
2. import 에서 `MdmPageLayout`·`IdPicker`·`useMdmPageParams`·`IdPickRow`(`@/shell`)·`searchSets`(`./api`)·`RSF_CSS`·`RSF_STYLE_HREF` 를 빼고, `useContext` 와 `RuleSetTabsContext`(`./RuleSetTabs`)·`OpenRequest`·`TabStatus`(`./tabs-model`) 를 더한다.
3. `SCREEN_ID`·`COMPONENT_PATH`·`SET_PICK_LIMIT`·`searchSetPicks` 정의를 지운다(`SCREEN_ID` 는 `canDoButton(rbac, SCREEN_ID, action)` 이 쓰므로 `const SCREEN_ID = "ruleSetEdit";` 한 줄은 남긴다).
4. 함수 머리와 열기·알림:
```tsx
export interface RuleSetEditorProps {
  tabKey: string;
  /** 열 세트 — seq 가 바뀔 때만 연다(위 바 고르기·링크·포털 파라미터). */
  request: OpenRequest | null;
  /** 세트를 불러오거나 dirty 가 바뀌면 탭 틀에 알린다(탭 머리·닫기 확인·디버거 경고). */
  onStatus(tabKey: string, status: TabStatus): void;
}

export function RuleSetEditor({ tabKey, request, onStatus }: RuleSetEditorProps) {
  const tabsApi = useContext(RuleSetTabsContext);
  const rbac = useUserButtonRbac();
  const state = useRuleSetEdit({ onWritten: tabsApi.notifyWritten });
  const { open, edit, view, flow } = state;

  const requestSeq = request?.seq ?? null;
  useEffect(() => {
    if (request) void open(request.setId);
    // seq 가 바뀔 때만 연다 — 같은 요청을 다시 그려도 다시 열지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestSeq]);

  const statusSetId = view?.set.setId ?? null;
  const statusSetName = view?.set.setName ?? null;
  useEffect(() => {
    onStatus(tabKey, { setId: statusSetId, setName: statusSetName, dirty: state.dirty });
  }, [onStatus, tabKey, statusSetId, statusSetName, state.dirty]);
```
   (지금의 `export default function RuleSetEditPage({ tabId })`·`useMdmPageParams(...)` 세 줄을 이것으로 바꾼다.)
5. 보는 사람 설정 알림(Ruling 22): `onToggleVars` 의 `saveVarDisplay(next);` 뒤에 `tabsApi.publishPrefs({ varDisplay: next });`, `onToggleMiniMap` 의 `saveFlag(storeKeys.miniMap, next);` 뒤에 `tabsApi.publishPrefs({ miniMap: next });` 를 더하고, 다른 탭이 바꾼 값을 따르는 효과를 `onToggleMiniMap` 정의 아래에 둔다.
```tsx
  // 다른 탭이 바꾼 보는 사람 설정을 따른다(Ruling 22). 디버그 모드에서는 그 모드의 자동 켜기·되돌리기(P-D16)를 지키려고 변수 표시는 따르지 않는다.
  const prefSeq = tabsApi.prefs.seq;
  useEffect(() => {
    if (prefSeq === 0) return;
    setShowMiniMap(tabsApi.prefs.miniMap);
    if (modeRef.current !== "debug") {
      setVarDisplay(tabsApi.prefs.varDisplay);
      if (tabsApi.prefs.varDisplay !== "off") lastVarOn.current = tabsApi.prefs.varDisplay;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefSeq]);
```
6. 반환 JSX 에서 `<style …>`·`<MdmPageLayout …>`·위 바(`set-edit-topbar` div 전체)를 지우고 나머지(`{!view || !flow ? … : …}` 와 `ErrorModal`)를 `<>…</>` 로 감싸 돌려준다.

`page.tsx` 전체를 다음으로 바꾼다.
```tsx
"use client";

/**
 * ruleSetEdit — 룰 세트 편집(TSK-08-06). 정본: docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md.
 * 화면은 세트 탭 틀(`RuleSetTabs`, 하위 세트 spec §10)이고 탭마다 편집기(`RuleSetEditor`)가 하나씩 뜬다.
 */
import { RuleSetTabs } from "./RuleSetTabs";

export default function RuleSetEditPage({ tabId }: { tabId?: string }) {
  return <RuleSetTabs tabId={tabId} />;
}
```

`useRuleSetEdit.ts`:
```ts
export interface RuleSetEditOptions {
  /** 저장·폐기·되살리기가 성공해 다시 불러온 뒤 그 세트 ID 로 한 번 부른다(하위 세트 spec §10.4). */
  onWritten?: (setId: string) => void;
}
```
`export function useRuleSetEdit(): RuleSetEditState` → `export function useRuleSetEdit(opts: RuleSetEditOptions = {}): RuleSetEditState`. `const onWrittenRef = useRef(opts.onWritten); onWrittenRef.current = opts.onWritten;` 를 두고, `runWrite` 의 `setMessage(done(result));` 뒤에 `onWrittenRef.current?.(id);` 를 더한다.

- [ ] **Step 6: `RuleSetTabs.tsx`·`styles/tabs.ts`**

```tsx
"use client";

/**
 * 룰 세트 편집 화면의 세트 탭 틀(하위 세트 spec §10, C-D13·C-D14) — 위 바(세트 고르기·현재 세트·탭 메시지), 탭 머리, 탭마다 편집기(`RuleSetEditor`).
 * 패널은 탭마다 늘 그리고(상태 유지) 고르지 않은 패널은 `hidden` + `display:none` 으로 숨긴다 — 숨은 패널은 `isShown` 이 거짓이라 ⌘Z 를 받지 않는다(편차 6).
 * shared `Tabs` 는 패널·닫기 단추가 없고 화면은 `@mantine/*` 를 쓰지 않으므로 탭 머리는 네이티브 단추다(4단계 섹션 패널 선례).
 * 탭 사이 연동(`RuleSetTabsContext`): 링크로 열기(`openSet`), 저장 알림(`notifyWritten`·`written`), 저장 안 한 탭의 세트(`dirtySetIds`), 보는 사람 설정 알림(`prefs`).
 */
import { createContext, useCallback, useMemo, useRef, useState } from "react";

import { IconX } from "@tabler/icons-react";

import { ErrorModal } from "@dk-oasis/shared/layout";
import { IdPicker, MdmPageLayout, useMdmPageParams, type IdPickRow } from "@/shell";

import { searchSets } from "./api";
import { loadFlag, loadVarDisplay, storeKeys } from "./debugger/local-store";
import { RuleSetEditor } from "./RuleSetEditor";
import { RSF_CSS, RSF_STYLE_HREF } from "./rsf-styles";
import {
  CLOSE_CONFIRM, closeTab, currentOf, dirtySetIds, initialTabs, openFromParams, openInActive, openLinked, selectTab, withStatus,
  type TabStatus, type TabsResult, type TabsState,
} from "./tabs-model";
import type { VarDisplay } from "./types";

const SCREEN_ID = "ruleSetEdit";
const COMPONENT_PATH = "dme/ruleSetEdit";
/** 서버 `RuleSetEditService.PICK_LIMIT` 과 같다. */
const SET_PICK_LIMIT = 20;

export interface ViewPrefs {
  varDisplay: VarDisplay;
  miniMap: boolean;
  /** 0 이면 아직 아무 탭도 바꾸지 않았다. 바뀔 때마다 1 증가. */
  seq: number;
}

export interface RuleSetTabsApi {
  /** 링크로 연다 — 열린 탭이 있으면 그리로, 없으면 지금 탭 오른쪽 새 탭(상한 8). */
  openSet(setId: string): void;
  /** 어떤 탭이 세트를 저장·폐기·되살렸다. */
  notifyWritten(setId: string): void;
  /** 마지막 저장 알림 — seq 가 바뀌면 다른 탭이 그 세트의 겉모양을 다시 받는다(Task 8). */
  written: { setId: string; seq: number } | null;
  /** 저장하지 않은 변경이 있는 탭의 세트(디버거 경고, Task 8). */
  dirtySetIds: ReadonlySet<string>;
  prefs: ViewPrefs;
  publishPrefs(p: Partial<Pick<ViewPrefs, "varDisplay" | "miniMap">>): void;
}

const NOOP_SET: ReadonlySet<string> = new Set();

/** 탭 틀 밖(단독 시험 등)에서 편집기를 그릴 때의 기본값 — 아무것도 하지 않는다. */
export const RuleSetTabsContext = createContext<RuleSetTabsApi>({
  openSet: () => undefined,
  notifyWritten: () => undefined,
  written: null,
  dirtySetIds: NOOP_SET,
  prefs: { varDisplay: "off", miniMap: true, seq: 0 },
  publishPrefs: () => undefined,
});

async function searchSetPicks(keyword: string): Promise<IdPickRow[]> {
  const res = await searchSets(keyword);
  return (res.sets ?? []).map((s) => ({ id: s.setId, name: s.setName, status: s.status }));
}

export function RuleSetTabs({ tabId }: { tabId?: string }) {
  const [tabs, setTabs] = useState<TabsState>(initialTabs);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [written, setWritten] = useState<{ setId: string; seq: number } | null>(null);
  const [prefs, setPrefs] = useState<ViewPrefs>(() => ({ varDisplay: loadVarDisplay(), miniMap: loadFlag(storeKeys.miniMap, true), seq: 0 }));

  const apply = useCallback((r: TabsResult) => {
    tabsRef.current = r.state;
    setTabs(r.state);
    setMessage(r.message);
  }, []);

  useMdmPageParams(COMPONENT_PATH, tabId, (params) => {
    if (params.setId) apply(openFromParams(tabsRef.current, params.setId));
  });

  const openSet = useCallback((setId: string) => apply(openLinked(tabsRef.current, setId)), [apply]);
  const notifyWritten = useCallback((setId: string) => setWritten((w) => ({ setId, seq: (w?.seq ?? 0) + 1 })), []);
  const publishPrefs = useCallback(
    (p: Partial<Pick<ViewPrefs, "varDisplay" | "miniMap">>) => setPrefs((cur) => ({ ...cur, ...p, seq: cur.seq + 1 })),
    [],
  );
  const onStatus = useCallback((key: string, st: TabStatus) => {
    setTabs((s) => {
      const next = withStatus(s, key, st);
      tabsRef.current = next;
      return next;
    });
  }, []);
  const close = (key: string) => {
    const t = tabsRef.current.tabs.find((x) => x.key === key);
    if (t?.dirty && typeof window !== "undefined" && !window.confirm(CLOSE_CONFIRM)) return;
    apply({ state: closeTab(tabsRef.current, key), message: null });
  };

  const dirty = useMemo(() => dirtySetIds(tabs), [tabs]);
  const api = useMemo<RuleSetTabsApi>(
    () => ({ openSet, notifyWritten, written, dirtySetIds: dirty, prefs, publishPrefs }),
    [openSet, notifyWritten, written, dirty, prefs, publishPrefs],
  );
  const active = tabs.tabs.find((t) => t.key === tabs.active)!;
  const label = (id: string | null) => id ?? "새 탭";

  return (
    <>
      {/* 화면 스타일 — 포털이 dist 의 page.css 를 불러오지 않으므로 문서 head 에 한 번만 넣는다(React 19 precedence, href 로 중복 제거). */}
      <style href={RSF_STYLE_HREF} precedence="default">
        {RSF_CSS}
      </style>
      <MdmPageLayout group="dme" screenId={SCREEN_ID} title="룰 세트 편집">
        <div data-testid="set-edit-topbar" className="rsf-set-topbar">
          <IdPicker
            label="룰 세트"
            placeholder="세트 ID·세트명"
            noun="세트"
            testId="set-pick"
            search={searchSetPicks}
            limit={SET_PICK_LIMIT}
            onPick={(id) => apply({ state: openInActive(tabsRef.current, id), message: null })}
            onError={setError}
          />
          {active.setId && (
            <>
              <span aria-hidden className="rsf-set-topbar-sep" />
              <span data-testid="set-edit-current" style={{ fontWeight: 600 }}>
                {`${active.setId} · ${active.setName ?? ""}`}
              </span>
            </>
          )}
          {message && (
            <span data-testid="set-tabs-message" role="status" className="rsf-set-tabs-message">
              {message}
            </span>
          )}
        </div>
        <div className="rsf-set-tabs" role="tablist" aria-label="열린 룰 세트" data-testid="set-tabs">
          {tabs.tabs.map((t) => (
            <div key={t.key} className="rsf-set-tab" data-active={t.key === tabs.active ? "true" : "false"}>
              <button
                type="button"
                role="tab"
                id={`set-tab-${t.key}`}
                aria-selected={t.key === tabs.active}
                aria-controls={`set-tab-panel-${t.key}`}
                data-testid={`set-tab-${t.key}`}
                title={t.setName ?? undefined}
                onClick={() => apply({ state: selectTab(tabsRef.current, t.key), message: null })}
              >
                {label(currentOf(t))}
                {t.dirty && (
                  <span className="rsf-set-tab-dirty" data-testid={`set-tab-dirty-${t.key}`} aria-label="저장하지 않은 변경">
                    ●
                  </span>
                )}
              </button>
              {tabs.tabs.length > 1 && (
                <button
                  type="button"
                  className="rsf-set-tab-close"
                  data-testid={`set-tab-close-${t.key}`}
                  aria-label={`${label(currentOf(t))} 탭 닫기`}
                  title="탭 닫기"
                  onClick={() => close(t.key)}
                >
                  <IconX size={12} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>
        <RuleSetTabsContext.Provider value={api}>
          {tabs.tabs.map((t) => (
            <div
              key={t.key}
              role="tabpanel"
              id={`set-tab-panel-${t.key}`}
              aria-labelledby={`set-tab-${t.key}`}
              data-testid={`set-tab-panel-${t.key}`}
              className="rsf-set-tab-panel"
              hidden={t.key !== tabs.active}
              style={t.key !== tabs.active ? { display: "none" } : undefined}
            >
              <RuleSetEditor tabKey={t.key} request={t.request} onStatus={onStatus} />
            </div>
          ))}
        </RuleSetTabsContext.Provider>
        {error && <ErrorModal message={error} onClose={() => setError(null)} />}
      </MdmPageLayout>
    </>
  );
}
```
(`IdPicker` 의 `onError` 는 지금 편집기의 `state.reportError` 대신 탭 틀의 오류 창으로 간다. `ErrorModal` 의 import 경로는 지금 `page.tsx` 와 같다.)

`styles/tabs.ts`:
```ts
/** 세트 탭 틀(하위 세트 spec §10) — 위 바·탭 머리·패널. 색은 의미 토큰만, 한 변 색 바 없이 지금 탭은 배경·테두리·굵기로 보인다(Local-Rules §8). */
export const TABS_CSS = `
.rsf-set-topbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-sm) var(--spacing-md); border-bottom: 1px solid var(--color-border-light); }
.rsf-set-topbar-sep { align-self: stretch; width: 1px; margin: 2px var(--spacing-xs); background: var(--color-border); }
.rsf-set-tabs-message { color: var(--color-danger); }
.rsf-set-tabs { display: flex; flex-wrap: nowrap; gap: 2px; padding: var(--spacing-xs) var(--spacing-md) 0; border-bottom: 1px solid var(--color-border); overflow-x: auto; }
.rsf-set-tab { display: flex; align-items: center; border: 1px solid transparent; border-bottom: none; border-radius: var(--radius-sm) var(--radius-sm) 0 0; }
.rsf-set-tab[data-active="true"] { background: var(--color-bg); border-color: var(--color-border); font-weight: 600; }
.rsf-set-tab > button[role="tab"] { border: none; background: transparent; padding: var(--spacing-xs) var(--spacing-sm); cursor: pointer; color: var(--color-text); white-space: nowrap; }
.rsf-set-tab-dirty { margin-left: 4px; color: var(--color-warning); }
.rsf-set-tab-close { border: none; background: transparent; padding: 2px 4px; cursor: pointer; color: var(--color-text-secondary); display: inline-flex; align-items: center; }
.rsf-set-tab-close:hover { color: var(--color-text); }
.rsf-set-tab-panel { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
`;
```
`rsf-styles.ts` 에서 다른 상수처럼 import 해 `RSF_CSS` 끝(맨 마지막 상수 뒤)에 `TABS_CSS` 를 잇는다. 쓰인 토큰(`--color-bg`·`--color-border`·`--color-border-light`·`--color-warning`·`--color-text`·`--color-text-secondary`·`--color-danger`·`--spacing-*`·`--radius-sm`)이 shared 에 있는지 `grep -n "\-\-radius-sm\|\-\-color-text-secondary" src/frontend/shared/src/styles/*.css` 로 확인하고, 없는 토큰은 이웃 `styles/*.ts` 가 쓰는 같은 뜻의 토큰으로 바꾼다.

- [ ] **Step 7: 통과 확인**

Run(차례로):
```bash
pnpm --dir src/frontend --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/tabs-model.test.ts tests/dme/ruleSetEdit/set-tabs.test.ts
pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit
rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint
python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/RuleSetTabs.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/RuleSetEditor.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/tabs-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/tabs.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/rsf-styles.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts
python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/RuleSetTabs.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/RuleSetEditor.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/tabs-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/tabs.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/rsf-styles.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts
grep -rnE "import ['\"]\.{1,2}/[^'\"]*\.css['\"]" src/frontend/m-mdm/pages/dme/ruleSetEdit
```
Expected: 새 시험 둘 PASS, 기존 화면 시험(`rule-set-edit-page.test.ts`·`undo-tip-shortcut.test.ts`·`debug-mode.test.ts` 등) 그대로 초록(단일 탭 동작은 바뀌지 않는다), tsc 0, audit 0건, `.css` import 0건. 기존 시험이 깨지면 시험이 아니라 옮기기를 고친다 — 예외는 위 바의 `set-edit-current`·`set-pick` 이 탭 틀로 옮겨 DOM 위치가 바뀐 것뿐이고 testid 는 그대로다.

- [ ] **Step 8: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/RuleSetTabs.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/RuleSetEditor.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/tabs-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/tabs.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/rsf-styles.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/tabs-model.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/set-tabs.test.ts src/frontend/m-mdm/tests/dme/helpers/rule-set-page.ts
/usr/bin/git commit -m "feat(m-mdm): 룰 세트 편집 화면 안에 세트 탭(최대 8)을 둔다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/RuleSetTabs.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/RuleSetEditor.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/tabs-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/tabs.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/rsf-styles.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/tabs-model.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/set-tabs.test.ts src/frontend/m-mdm/tests/dme/helpers/rule-set-page.ts
```

---

### Task 8: 화면 — SET 노드(놓기·검색 팝업·그리기·속성 패널·받는 노드)·탭 연동·e2e 시나리오

> **갱신 메모(레인이 착수 때 반영, 2026-10-06 plan:0)** — 아래 본문은 `2e02d29d` 기준이다. 본문보다 이 메모와 Task 0 대조표가 앞선다.
> - 담당 ui:8. 캔버스가 바뀌었다: 받는 노드 위치(D-142·D-143), 자동 배치(D-140), 이동 한계(`aac858aa`). SET 노드는 RULE·TASK 와 같은 단계로 이 자리들에 넣는다.
> - e2e 노드 수 기대는 D-136 새 형식(IF 합류 없음) 기준이다. 하위 세트 탭의 겉모양 갱신은 RELEASED 기준이라(Ruling 24) 시나리오는 B 확정까지 하거나 확정된 고정 데이터를 쓴다(스펙 §12).
> - 디버그 모드 경고 문구는 `"하위 세트 {S}에 확정하지 않은 변경이 있다. 실행은 판정 시각의 RELEASED 로 한다."`, 조건은 하위 세트 탭에 저장 안 한 변경이 있거나 DRAFT 를 열고 있을 때다(C-D18).
> - 저장 응답의 `CALL_*`·`CALLER_BROKEN` 은 경고 목록으로 온다(확정 거부는 확정 화면 몫). 메시지 줄 부모 링크는 경고 줄에서도 뽑는다.

**모델:** opus — 편집 연산·캔버스·패널·탭 연동·서버 응답이 한꺼번에 맞물린다. 캔버스 memo 의존성(Local-Rules §16·§19)과 늦은 응답 버리기(§11)를 지켜야 한다.

**이 태스크가 정한 것:**
- 화면이 쓰는 겉모양 맵 `calls`(세트 ID → `SetCallIo`)는 `useRuleSetEdit` 가 갖는다. 세트를 열면 `view.calls` 로 채우고, 흐름에 아직 모르는 세트 ID 가 생기면(SET 노드 놓기·붙여넣기·되돌리기) `search CALL_IO` 로 그것만 받는다(받는 중인 ID 는 다시 묻지 않고, 다른 세트를 열었으면 늦은 응답을 버린다). 다른 탭이 세트 S 를 저장·폐기·되살렸다는 알림(`written`)이 오면, 흐름에 S 를 부르는 SET 노드가 있을 때 S 의 겉모양을 다시 받는다. 검사(`checks`)는 `flowChecks(flow, rules, condIo, calls)` 다.
- `structKey`(디버거가 실행 표시를 지우는 비교 키)에 노드의 `setId` 를 넣는다 — SET 노드의 세트를 바꾸면 낡은 실행 표시가 지워진다.
- SET 노드는 편집 연산에서 RULE·TASK 와 같은 "단계"다(지우기·옮기기·복사·붙여넣기). 붙여넣기 새 ID 접두어는 `s`. 외관(`view.styles`)은 열지 않는다(스펙 §9 — `setNodeStyle`·`setNodesColor` 는 RULE·TASK 만).
- 오른쪽 머리글 종류는 `CALL`(라벨 "하위 세트")이다 — `PanelKind` 의 `"SET"` 은 이미 세트 전체 패널이다(Ruling 23).
- 세트 검색 팝업은 shared `Modal` 안에 `IdPicker` 를 두고, 후보에서 INUSE 가 아닌 세트와 지금 세트를 뺀다(스펙 §9). 고르면 그 선에 SET 노드를 끼운다(되돌리기 한 칸).
- 메시지 줄의 부르는 세트 링크: 저장 거부 문구의 `CALLER_BROKEN 세트 {P}:`·`사용 중인 세트 {P1, P2}가`, 경고 줄의 `부르는 세트에 경고가 생겼다: {P1, P2}` 에서 세트 ID 를 뽑아 메시지 아래에 링크 단추로 보인다(`set-message-caller-{id}` → 탭으로 연다). 문구 안을 링크로 바꾸지 않는다(문구는 서버가 정한다).
- 디버그 모드에서 흐름의 SET 노드가 부르는 세트 가운데 다른 탭에서 저장 안 한 것이 있으면 세트마다 한 줄 경고(`sim-dirty-subsets`)를 보인다(스펙 §10.4).
- 받는 노드(CATCH UI)는 RULE 과 같은 연결점·우클릭으로 SET 에도 붙이고, 고를 수 있는 종류는 RULE `NO_RESULT·INPUT_ERROR·EVAL_ERROR·HIT_CONFLICT`, SET `INPUT_ERROR·EVAL_ERROR·HIT_CONFLICT·SUBSET_ENDED`(이름 "하위 세트 예외 끝") 다.

**Files:**
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/SetPickModal.tsx`
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/caller-links.ts`
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/set.ts`
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts`(`RuleSetView.calls`·`RuleSetCallIoResult`·`CalledFlow`·`RuleSetSimulateResult.calledFlows`·`"CALLER_WARN"`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/api.ts`(새 `callIo`·`callers`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts`(`calls`·`refreshCalls`·`structKey`·`checks`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts:108-120, 787`(`node`·`copyNode`·`isStep`·`NODE_PREFIX`, 새 `insertSet`, `setNodeStyle`·`setNodesColor` 의 종류 판정)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-vars.ts:10-22`(`edgeChips` 의 `calls`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowCanvas.tsx`(`PaletteItem`·`BREAKABLE`·props `calls`·`onOpenSet`·노드 data·`edgeChips` 인자·memo 의존성)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowPalette.tsx:20-26`(「룰 세트」)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx`(`FlowNodeData.call`·`onOpenSet`, `KIND_CLASS.SET`, 새 `SetBody`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/context-menu.ts`(`CanvasActions.pickSetFor`·`openSet`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/menus/edit-menu.ts`(SET 노드 메뉴·선 「룰 세트 넣기」)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/menus/debug-menu.ts:10`·`debugger/useSimulation.ts:146`(`BREAKABLE` 에 SET)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useEditActions.ts`(`pickPalette`·`dropPalette` 의 `"set"`, 새 `placeSet`, deps `openSetPick`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PanelHeader.tsx`(`CALL` 종류·`panelTargetOf` 의 `calls`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx`(새 `SetProps`, props `calls`·`onOpenSet`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/SidePanel.tsx`(props 넘기기)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/cards/SetIoTables.tsx:116-137`(세트 키 표시)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowToolbar.tsx`(메시지 아래 부르는 세트 링크, prop `onOpenSet`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/RuleSetEditor.tsx`(연결: `calls`·`onOpenSet`·`written`·`SetPickModal`·`sim-dirty-subsets`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/rsf-styles.ts`(`SET_CSS`)
- Modify: CATCH 의 받는 노드 화면 파일(연결점·우클릭 「예외 받기 추가」·속성 패널 종류 체크 — `grep -rln "attachTo" src/frontend/m-mdm/pages/dme/ruleSetEdit`)
- Modify: `src/frontend/e2e/mdm-ruleSetEdit.spec.ts`(E16)·`src/frontend/e2e/fixtures/mdm-ruleSet-data.sql`(룰 `E2S_TAG`·세트 `E2S_SUBA`·`E2S_SUBB`)
- Create(Test): `src/frontend/m-mdm/tests/dme/ruleSetEdit/set-node-model.test.ts`
- Create(Test): `src/frontend/m-mdm/tests/dme/ruleSetEdit/set-node-page.test.ts`

**Interfaces:**
- Consumes: Task 1(생성 TS `FlowNode.setId`·`"SET"`), Task 2(`flowSetIds`·`SetStep`), Task 5(`SetCallIo`·`SetCallIoMap`·`flowChecks` 4인자·`flowIo`·`setKey`·`isSetKey`·`setIdOfKey`), Task 6(서버 응답 — 편차 1·2), Task 7(`RuleSetTabsContext`·`useRuleSetEdit({ onWritten })`·`RuleSetEditor`).
- Produces(Task 9 가 쓴다):
  - TS `export interface CalledFlow { setId: string; setName: string | null; flow: (RuleSetFlow & { view?: unknown }) | null; ruleIds: string[]; rules: RuleIo[] }`, `RuleSetSimulateResult.calledFlows?: Record<string, CalledFlow>`.
  - TS `api.callIo(setIds: readonly string[]): Promise<RuleSetCallIoResult>`, `api.callers(setId: string): Promise<RuleSetPickResult>`.
  - TS `RuleSetEditState.calls: Record<string, SetCallIo>`, `refreshCalls(setIds: readonly string[]): void`.
  - TS `flow-edit.insertSet(f: EditFlow, edgeId: string, setId: string, label?: string | null): EditResult`.
  - TS `FlowNodeData.call?: SetCallIo`, `FlowNodeData.onOpenSet?: (setId: string) => void`, `FlowCanvasProps.calls?: SetCallIoMap`, `FlowCanvasProps.onOpenSet?: (setId: string) => void`.
  - testid: `flow-add-set`(도구 상자), `set-pick-modal`·`set-pick-modal-pick`(팝업·그 안 IdPicker testId), `flow-set-title-{id}`·`flow-set-io-{id}`·`flow-set-open-{id}`(노드), `flow-prop-set`·`flow-prop-set-open`·`flow-prop-set-caller-{id}`(속성 패널), `set-message-caller-{id}`(메시지 링크), `sim-dirty-subsets`(디버거 경고), 메뉴 `flow-menu-item-insert-set`·`flow-menu-item-set-open`.

- [ ] **Step 1: 모델 실패 시험 — `tests/dme/ruleSetEdit/set-node-model.test.ts`**

```ts
// 하위 세트 spec §9 — SET 노드 편집 연산·선 칩·부르는 세트 링크(순수 함수).
import { describe, expect, it } from "vitest";

import { callerSetIds } from "../../../pages/dme/ruleSetEdit/caller-links";
import {
  copyFragment, flowJsonOf, insertSet, pasteFragment, removeNode, setNodeStyle, toEditFlow, type EditFlow, type EditResult,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { edgeChips } from "../../../pages/dme/ruleSetEdit/flow-vars";
import type { SetCallIo } from "../../../pages/dme/ruleSetEdit/types";

const ok = (r: EditResult): EditFlow => {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
};
/** start → r1(A) → end, 선 e1 start→r1 · e2 r1→end. */
const base = () => toEditFlow(null, ["A"]);
const call = (setId: string, outputs: string[]): SetCallIo => ({
  setId, setName: `${setId} 세트`, exists: true, status: "INUSE", inputs: [], outputs: outputs.map((name) => ({ name, dataType: null, scale: null, dateString: false, maruCodeId: null, always: true })), endsEarly: false,
});

describe("SET 노드 편집 연산", () => {
  it("insertSet 은 선 위에 SET 노드(s 접두)를 끼우고 setId 를 저장 JSON 에 SET 노드에만 쓴다", () => {
    const f = ok(insertSet(base(), "e2", "QD_S_PRICE"));
    const s = f.nodes.find((n) => n.kind === "SET")!;
    expect(s.id).toBe("s1");
    expect(s.setId).toBe("QD_S_PRICE");
    expect(f.edges.find((e) => e.id === "e2")!.to).toBe("s1");
    const json = JSON.parse(flowJsonOf(f));
    expect(json.nodes.filter((n: Record<string, unknown>) => "setId" in n)).toEqual([expect.objectContaining({ id: "s1", setId: "QD_S_PRICE" })]);
  });

  it("SET 없는 세트의 저장 글자는 예전과 같다", () => {
    expect(flowJsonOf(base())).not.toContain("setId");
  });

  it("되돌리기 사본(toEditFlow)과 복사·붙여넣기가 setId 를 지킨다", () => {
    const f = ok(insertSet(base(), "e2", "QD_S_PRICE"));
    const again = toEditFlow(JSON.parse(flowJsonOf(f)), []);
    expect(again.nodes.find((n) => n.id === "s1")!.setId).toBe("QD_S_PRICE");
    const frag = copyFragment(f, "s1");
    if (typeof frag === "string") throw new Error(frag);
    const pasted = ok(pasteFragment(f, "e1", frag));
    const sets = pasted.nodes.filter((n) => n.kind === "SET");
    expect(sets.map((n) => n.setId)).toEqual(["QD_S_PRICE", "QD_S_PRICE"]);
    expect(sets.every((n) => n.id.startsWith("s"))).toBe(true);
  });

  it("SET 노드는 단계처럼 지우면 앞뒤를 잇고, 외관은 바꾸지 못한다", () => {
    const f = ok(insertSet(base(), "e2", "QD_S_PRICE"));
    const g = ok(removeNode(f, "s1"));
    expect(g.nodes.some((n) => n.kind === "SET")).toBe(false);
    expect(g.edges.some((e) => e.from === "r1" && e.to === "end")).toBe(true);
    const r = setNodeStyle(f, "s1", { color: "blue" });
    expect(r.ok).toBe(false);
  });

  it("SET 노드에서 나가는 선의 칩은 하위 세트 출력 이름이다", () => {
    const f = ok(insertSet(base(), "e2", "QD_S_PRICE"));
    const out = f.edges.find((e) => e.from === "s1")!;
    expect(edgeChips(f, {}, { QD_S_PRICE: call("QD_S_PRICE", ["P", "Q"]) })[out.id]).toEqual(["P", "Q"]);
    expect(edgeChips(f, {})[out.id]).toBeUndefined();
  });
});

describe("부르는 세트 링크", () => {
  it("거부 문구·폐기 거부·경고 줄에서 세트 ID 를 순서대로 중복 없이 뽑는다", () => {
    const err = "룰 세트를 저장할 수 없습니다: P[-] CALLER_BROKEN 세트 P: R1의 조건 변수 X는 …; G[-] CALLER_BROKEN 세트 G: R2가 …";
    expect(callerSetIds(err, [])).toEqual(["P", "G"]);
    expect(callerSetIds("C[-] CALLER_BROKEN 사용 중인 세트 M, P가 이 세트를 불러 폐기할 수 없다. 부르는 세트를 먼저 고치거나 폐기한다", [])).toEqual(["M", "P"]);
    expect(callerSetIds("저장 · row_version 3", ["부르는 세트에 경고가 생겼다: P, G", "다른 경고"])).toEqual(["P", "G"]);
    expect(callerSetIds("저장 · row_version 3", [])).toEqual([]);
  });
});
```
(`pasteFragment(f, edgeId, frag)` 의 실제 인자 순서는 `grep -n "export function pasteFragment" src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts` 로 맞춘다.)

Run: `pnpm --dir src/frontend --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/set-node-model.test.ts`
Expected: FAIL — `insertSet`·`caller-links` 가 없다.

- [ ] **Step 2: 모델 구현 — `flow-edit.ts`·`flow-vars.ts`·`caller-links.ts`**

`flow-edit.ts`:
```ts
/** 룰처럼 선 하나 들어오고 하나 나가는 단계(4단계 T1 — 빈 단계, 하위 세트 spec §1 — SET 포함). */
const isStep = (k: FlowNodeKind): boolean => k === "RULE" || k === "TASK" || k === "SET";

/** 모든 칸을 채운 노드. setId 는 SET 노드에만 둔다(SET 없는 세트의 저장 글자가 그대로여야 한다 — 편차 5). */
function node(id: string, kind: FlowNodeKind, ruleId: string | null = null, splitId: string | null = null, label: string | null = null, setId: string | null = null): FlowNode {
  return kind === "SET" ? { id, kind, ruleId, splitId, label, setId } : { id, kind, ruleId, splitId, label };
}

const copyNode = (n: FlowNode): FlowNode => node(n.id, n.kind, str(n.ruleId), str(n.splitId), str(n.label), str(n.setId));
```
(CATCH 가 `node`·`copyNode` 에 `attachTo`·`catches` 를 같은 방식으로 더했으면 그 칸들은 그대로 두고 `setId` 만 더한다.) `NODE_PREFIX` 에 `SET: "s"` 를 더한다. `setNodeStyle`(1086행 근처)의 `if (!isStep(n.kind)) return fail("룰·빈 단계 노드만 외관을 바꾼다");` 와 `setNodesColor`(1105행 근처)의 `!isStep(n.kind)` 를 `!STYLED_KINDS.has(n.kind)`(`./node-style` 의 상수, RULE·TASK)로 바꾼다. `insertTask` 아래에:
```ts
/** 선 e(A→B) 위에 SET 노드(하위 세트 spec §1)를 끼운다 — insertTask 와 같은 자리·선 규칙, ID 접두어 `s`. */
export function insertSet(f: EditFlow, edgeId: string, setId: string, label: string | null = null): EditResult {
  if (setId.trim() === "") return fail("세트 ID 가 비었다");
  const g = clone(f);
  const ei = g.edges.findIndex((e) => e.id === edgeId);
  if (ei < 0) return fail(`선 ${edgeId}를 찾지 못했다`);
  const e = g.edges[ei];
  const taken = takenIds(g);
  const s = node(fresh(taken, "s"), "SET", null, null, label, setId);
  const out = edge(fresh(taken, "e"), s.id, e.to);
  insertAfter(
    g.nodes,
    g.nodes.findIndex((n) => n.id === e.from),
    s,
  );
  e.to = s.id;
  insertAfter(g.edges, ei, out);
  return done(g);
}
```

`flow-vars.ts`:
```ts
/** RULE·SET 노드에서 나가는 선 → 그 룰 결과 이름·하위 세트 출력 이름(순서대로). 없으면 키를 만들지 않는다. */
export function edgeChips(f: RuleSetFlow, rules: RuleIoMap, calls: SetCallIoMap = {}): Record<string, string[]> {
  const namesOf = new Map<string, string[]>();
  for (const n of f.nodes ?? []) {
    if (n.kind === "RULE" && n.ruleId) namesOf.set(n.id, (rules[n.ruleId]?.results ?? []).map((r) => r.name));
    else if (n.kind === "SET" && n.setId) namesOf.set(n.id, (calls[n.setId]?.outputs ?? []).map((o) => o.name));
  }
  const out: Record<string, string[]> = {};
  for (const e of f.edges ?? []) {
    const names = namesOf.get(e.from);
    if (names && names.length > 0) out[e.id] = names;
  }
  return out;
}
```
(import 에 `SetCallIoMap` 을 더한다.)

`caller-links.ts`:
```ts
/**
 * 메시지 줄의 부르는 세트(하위 세트 spec §10.4) — 서버 거부 문구(CALLER_BROKEN)·폐기 거부·저장 경고(CALLER_WARN)에서 세트 ID 를 뽑는다.
 * 문구 자체는 서버가 정한다(RuleSetEditService·SetCallerRecheck). 순서대로, 중복 없이.
 */
const ID = "[A-Z0-9_]+";

export function callerSetIds(text: string, lines: readonly string[]): string[] {
  const out: string[] = [];
  const add = (id: string) => {
    const t = id.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  for (const m of text.matchAll(new RegExp(`CALLER_BROKEN 세트 (${ID}):`, "g"))) add(m[1]);
  for (const m of text.matchAll(new RegExp(`사용 중인 세트 ((?:${ID})(?:, ${ID})*)가`, "g"))) m[1].split(",").forEach(add);
  for (const l of lines) {
    const m = l.match(new RegExp(`^부르는 세트에 경고가 생겼다: ((?:${ID})(?:, ${ID})*)$`));
    if (m) m[1].split(",").forEach(add);
  }
  return out;
}
```

Run: 같은 vitest 명령 → PASS.

- [ ] **Step 3: 타입·API·상태 훅**

`types.ts`:
- `RuleSetCheckCode` 에 `| "CALLER_WARN"`(Task 5 의 넷 뒤, 주석 `/** 부르는 세트에 새 경고가 생겼다(WARN, 서버만 — 저장 결과). */`).
- `RuleSetView` 에:
```ts
  /** 흐름의 SET 노드가 부르는 세트의 겉모양(세트 ID →, 하위 세트 spec §8). 옛 응답에는 없을 수 있다. */
  calls?: Record<string, SetCallIo>;
```
- 새 타입:
```ts
/** search target CALL_IO 응답. */
export interface RuleSetCallIoResult {
  calls?: SetCallIo[] | null;
}

/** 실행 중 부른 세트의 저장된 흐름(디버거 들어가기, 하위 세트 spec §8). flow 가 null 이면 RULE_IDS 한 줄 흐름이다. */
export interface CalledFlow {
  setId: string;
  setName: string | null;
  flow: (RuleSetFlow & { view?: unknown }) | null;
  ruleIds: string[];
  /** 하위 흐름 룰들의 입출력 — 들어간 캔버스의 룰 노드 제목·칩. */
  rules: RuleIo[];
}
```
- `RuleSetSimulateResult` 에 `calledFlows?: Record<string, CalledFlow>;`.

`api.ts` 머리 주석의 search 목록에 `CALL_IO·CALLERS` 를 더하고:
```ts
/** 하위 세트 겉모양 — 세트 ID 목록(요청 순서). 목록은 JSON 문자열로 보낸다(OASIS params 는 List 칸을 묶지 못한다, 편차 1). */
export function callIo(setIds: readonly string[]): Promise<RuleSetCallIoResult> {
  return callOasis<RuleSetCallIoResult>(SERVICE, "search", { target: "CALL_IO", setIdsJson: JSON.stringify(setIds) });
}

/** 이 세트를 부르는 사용 중 세트(속성 패널). */
export function callers(setId: string): Promise<RuleSetPickResult> {
  return callOasis<RuleSetPickResult>(SERVICE, "search", { target: "CALLERS", setId });
}
```

`useRuleSetEdit.ts`:
- import `callIo`(api)·`flowSetIds`(flow-model)·`SetCallIo`(types).
- `RuleSetEditState` 에 `calls: Record<string, SetCallIo>;` 와 `refreshCalls(setIds: readonly string[]): void;`(주석 `/** 그 세트들의 겉모양을 다시 받는다(다른 탭 저장 알림, 하위 세트 spec §10.4). */`).
- `structKey` 의 노드 칸에 `n.setId ?? null` 을 더한다: `f.nodes.map((n) => [n.id, n.kind, n.ruleId, n.splitId, n.setId ?? null])`.
- 상태와 받기:
```ts
  const [calls, setCalls] = useState<Record<string, SetCallIo>>({});
  /** 받는 중인 세트 ID — 같은 ID 를 다시 묻지 않는다. */
  const callPending = useRef(new Set<string>());

  const fetchCalls = useCallback((ids: readonly string[]) => {
    const want = ids.filter((id) => !callPending.current.has(id));
    if (want.length === 0) return;
    want.forEach((id) => callPending.current.add(id));
    const forSet = setIdRef.current;
    callIo(want).then(
      (res) => {
        want.forEach((id) => callPending.current.delete(id));
        if (setIdRef.current !== forSet) return; // 다른 세트를 열었다 — 늦은 응답은 버린다(Local-Rules §11)
        setCalls((cur) => {
          const next = { ...cur };
          for (const c of res.calls ?? []) next[c.setId] = c;
          return next;
        });
      },
      (e: unknown) => {
        want.forEach((id) => callPending.current.delete(id));
        if (setIdRef.current === forSet) setError(errorText(e));
      },
    );
  }, []);

  // 흐름에 아직 모르는 세트가 생기면(놓기·붙여넣기·되돌리기) 그것만 받는다.
  useEffect(() => {
    if (!flow) return;
    const missing = flowSetIds(flow).filter((id) => !Object.prototype.hasOwnProperty.call(calls, id));
    if (missing.length > 0) fetchCalls(missing);
  }, [flow, calls, fetchCalls]);

  const refreshCalls = useCallback((ids: readonly string[]) => fetchCalls(ids), [fetchCalls]);
```
- `load(...)` 안 `setCondIo(next.condIo ?? {});` 뒤에 `setCalls(next.calls ?? {}); callPending.current.clear();`.
- `checks` memo: `const checks = useMemo(() => (flow ? flowChecks(flow, rules, condIo, calls) : []), [flow, rules, condIo, calls]);`
- 돌려주는 객체에 `calls, refreshCalls` 를 더한다.

- [ ] **Step 4: 도구 상자·메뉴·팝업·편집 동작**

`canvas/FlowCanvas.tsx:111`: `export type PaletteItem = "rule" | "set" | "if" | "par" | "note" | "group";`, 121행 `BREAKABLE` 과 `menus/debug-menu.ts:10`·`debugger/useSimulation.ts:146` 의 `BREAKABLE` 에 `"SET"` 을 더한다.

`canvas/FlowPalette.tsx` `PALETTE_ITEMS` 의 `rule` 줄 뒤(아이콘 import 에 `IconStack2`):
```ts
  { item: "set", testId: "flow-add-set", label: "룰 세트", icon: IconStack2 },
```

`canvas/context-menu.ts` `CanvasActions` 에:
```ts
  /** 그 선에 SET 노드를 끼우려고 세트 검색 팝업을 연다(하위 세트 spec §9). */
  pickSetFor(edgeId: string): void;
  /** 하위 세트를 같은 화면의 탭으로 연다(하위 세트 spec §10.3). */
  openSet(setId: string): void;
```

`canvas/menus/edit-menu.ts` — 노드 메뉴의 `TASK` 갈래 뒤에:
```ts
    if (n.kind === "SET") {
      return [
        ...(n.setId ? [{ id: "set-open", label: "세트 열기", run: () => act.openSet(n.setId as string) }] : []),
        { id: "copy", label: "복사", run: () => act.copy(id) },
        { id: "duplicate", label: "복제", run: () => act.duplicate(id) },
        { id: "delete", label: "삭제", danger: true, run: () => act.removeNode(id) },
      ];
    }
```
선 메뉴의 `insert-rule` 줄 뒤에 `{ id: "insert-set", label: "룰 세트 넣기", run: () => act.pickSetFor(id) },`.

`state/useEditActions.ts`:
- `EditActionsDeps` 에 `/** 세트 검색 팝업 열기 — 고르면 그 선(null 이면 고른 선, 없으면 END 앞 선)에 SET 노드를 끼운다. */ openSetPick(edgeId: string | null): void;` 와 `openSet(setId: string): void;`.
- `EditActions` 에 `/** 팝업에서 고른 세트를 끼운다 — 새 SET 노드를 고른다. */ placeSet(edgeId: string | null, setId: string): void;`.
```ts
  const placeSet = useCallback(
    (edgeId: string | null, setId: string) => {
      if (!flow || !editing) return;
      insertAt(edgeId, 1, (f, e) => insertSet(f, e, setId));
    },
    [flow, editing, insertAt],
  );
```
- `pickPalette`: `if (item === "rule") placeTask(selectedEdgeId);` 뒤에 `else if (item === "set") openSetPick(selectedEdgeId);`. `dropPalette`: `if (item === "rule") placeTask(edgeId);` 뒤에 `else if (item === "set") openSetPick(edgeId);`. 의존성 배열에 `openSetPick` 을 더한다.
- `actions` 객체에 `pickSetFor: (edgeId) => openSetPick(edgeId), openSet: deps.openSet,` 를 더하고 반환에 `placeSet` 을 더한다.

`canvas/SetPickModal.tsx`:
```tsx
"use client";

/**
 * 세트 검색 팝업(하위 세트 spec §9) — 도구 상자 「룰 세트」·선 메뉴 「룰 세트 넣기」가 연다. 사용 중(INUSE) 세트만, 지금 세트는 빼고 보인다.
 * 순환이 될 세트는 저장 때 CALL_CYCLE 로 거부하므로 여기서 미리 거르지 않는다.
 */
import { Button } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { IdPicker, type IdPickRow } from "@/shell";

import { searchSets } from "../api";

export interface SetPickModalProps {
  open: boolean;
  /** 지금 편집 중인 세트(후보에서 뺀다). */
  currentSetId: string | null;
  onPick(setId: string): void;
  onClose(): void;
  onError(message: string): void;
}

/** 서버 `RuleSetEditService.PICK_LIMIT` 과 같다. */
const LIMIT = 20;

export function SetPickModal({ open, currentSetId, onPick, onClose, onError }: SetPickModalProps) {
  const search = async (keyword: string): Promise<IdPickRow[]> => {
    const res = await searchSets(keyword);
    return (res.sets ?? [])
      .filter((s) => s.status === "INUSE" && s.setId !== currentSetId)
      .map((s) => ({ id: s.setId, name: s.setName, status: s.status }));
  };
  return (
    <Modal
      open={open}
      title="부를 룰 세트 고르기"
      size="md"
      onClose={onClose}
      footer={
        <Button data-testid="set-pick-modal-cancel" onClick={onClose}>
          닫기
        </Button>
      }
    >
      {open && (
        <div data-testid="set-pick-modal">
          <IdPicker placeholder="세트 ID·세트명" noun="세트" testId="set-pick-modal-pick" search={search} limit={LIMIT} onPick={onPick} onError={onError} />
        </div>
      )}
    </Modal>
  );
}
```
(`Modal` 의 `size` 값은 `CaseEditModal` 이 쓰는 이름(`"lg"`)과 같은 표기 집합에서 고른다 — `grep -n "size" src/frontend/shared/src/components/modal.tsx` 로 `"md"` 가 있는지 확인하고 없으면 `"lg"`.)

- [ ] **Step 5: 노드 그리기·속성 패널·머리글·입출력 표**

`canvas/nodes.tsx`:
- `FlowNodeData` 끝에:
```ts
  /** SET 노드의 하위 세트 겉모양(하위 세트 spec §9). 아직 받지 않았으면 undefined. */
  call?: SetCallIo;
  /** SET 노드 링크 아이콘 — 같은 화면의 탭으로 연다. */
  onOpenSet?: (setId: string) => void;
```
- `KIND_CLASS` 에 `SET: "rsf-set",`.
- 노드 본문 분기에 `{!collapsed && kind === "SET" && <SetBody data={data} />}` 를 TASK 줄 뒤에.
```tsx
/** SET 노드(하위 세트 spec §9) — 제목(라벨, 없으면 세트명, 없으면 세트 ID)·"룰 세트" 줄·입력·출력 개수 칩·세트 열기 링크. 굵은 테두리는 CSS(styles/set.ts). */
function SetBody({ data }: { data: FlowNodeData }) {
  const { node, call, mark, onOpenSet } = data;
  const setId = node.setId ?? "";
  const missing = !call || !call.exists;
  const title = node.label ?? (missing ? (setId || "(세트 없음)") : (call.setName ?? setId));
  const open = (e: MouseEvent) => {
    e.stopPropagation();
    if (setId) onOpenSet?.(setId);
  };
  return (
    <>
      <TitleRow nodeId={node.id} style={undefined} lines={1} titleProps={{ "data-testid": `flow-set-title-${node.id}` }}>
        <IconStack2 size={14} aria-hidden="true" style={{ marginRight: 4, verticalAlign: "-2px" }} />
        {title}
      </TitleRow>
      <div className="rsf-sub">{missing ? (call ? "없는 세트" : "세트 정보를 받는 중") : `룰 세트 ${setId}`}</div>
      {!missing && (
        <div className="rsf-set-io" data-testid={`flow-set-io-${node.id}`}>
          <span className="rsf-set-chip">{`입력 ${call.inputs.length}`}</span>
          <span className="rsf-set-chip">{`출력 ${call.outputs.length}`}</span>
        </div>
      )}
      {setId && onOpenSet && (
        <button type="button" className="rsf-open nodrag" data-testid={`flow-set-open-${node.id}`} aria-label="세트 탭으로 열기" title="세트 탭으로 열기" onClick={open}>
          <IconExternalLink size={12} />
        </button>
      )}
      {mark && <span className="rsf-mark" data-severity={mark} data-testid={`flow-node-mark-${node.id}`} title={mark === "REJECT" ? "거부 검사 있음" : "경고 검사 있음"} />}
    </>
  );
}
```
(import `IconStack2`·`SetCallIo`.)

`styles/set.ts`:
```ts
/** SET 노드(하위 세트 spec §9) — BPMN call activity 처럼 굵은 전체 테두리(한 변 색 바가 아니다, Local-Rules §8). 상태 테두리 규칙(.rsf-node[data-state])이 이 규칙보다 뒤·위라 이긴다. */
export const SET_CSS = `
.rsf-node.rsf-set { border-width: 3px; }
.rsf-set-io { display: flex; gap: 4px; margin-top: 2px; }
.rsf-set-chip { font-size: var(--font-size-xs); padding: 0 6px; border-radius: 999px; background: var(--color-bg-subtle); color: var(--color-text-secondary); }
`;
```
`rsf-styles.ts` 에서 `SET_CSS` 를 노드 기본 CSS 뒤·상태 CSS 앞(지금 `RSF_CSS` 를 잇는 순서에서 노드 기본 규칙 상수 바로 뒤)에 잇는다. 쓰인 토큰(`--font-size-xs`·`--color-bg-subtle`)이 없으면 이웃 `styles/*.ts` 의 같은 뜻 토큰으로 바꾼다.

`canvas/FlowCanvas.tsx`:
- `FlowCanvasProps` 에 `/** 하위 세트 겉모양(SET 노드 그리기·선 칩). */ calls?: SetCallIoMap;` 와 `/** SET 노드 링크 — 같은 화면의 탭으로 연다. */ onOpenSet?: (setId: string) => void;`.
- 구조 분해(1087행 근처)에 `calls`·`onOpenSet` 을 더하고, `const callMap = calls ?? NO_CALLS;`(모듈 상수 `const NO_CALLS: SetCallIoMap = {};`).
- 노드 data(1237행 근처)에 `call: n.kind === "SET" && n.setId ? callMap[n.setId] : undefined, onOpenSet,` 를 더하고 그 memo 의존성 배열에 `callMap, onOpenSet` 을 더한다.
- `const chips = useMemo(() => edgeChips(vflow as RuleSetFlow, rules), [vflow, rules]);` → `edgeChips(vflow as RuleSetFlow, rules, callMap)`, 의존성 `[vflow, rules, callMap]`.

`panels/PanelHeader.tsx`:
- `PanelKind` 에 `"CALL"`, `PANEL_KIND` 에 `CALL: { label: "하위 세트", icon: IconStack2 },`.
- `panelTargetOf(flow, rules, selectedId, selectedEdgeId, setName, calls: SetCallIoMap = {})` — RULE 갈래 뒤에:
```ts
      if (n.kind === "SET") {
        const c = n.setId ? calls[n.setId] : undefined;
        return { kind: "CALL", id: n.id, name: n.label ?? (c && c.exists ? (c.setName ?? n.setId ?? n.id) : (n.setId ?? "(세트 없음)")) };
      }
```
  (`panelTargetOf` 를 부르는 곳 — `grep -rn "panelTargetOf(" src/frontend/m-mdm/pages/dme/ruleSetEdit` — 에 `calls` 를 넘긴다.)

`panels/PropertyPanel.tsx`:
- `PropertyPanelProps` 에 `calls?: SetCallIoMap;` 와 `onOpenSet?: (setId: string) => void;`.
- `PropertyPanel` 의 분기에 `if (node.kind === "SET") return <SetProps node={node} props={props} />;` 를 TASK 줄 뒤에.
```tsx
/** SET 노드(하위 세트 spec §9) — 세트 ID·이름·상태, 겉모양(입력, 출력과 항상·일부 경로), 이 세트를 부르는 세트(누르면 탭으로). */
function SetProps({ node, props }: { node: FlowNode; props: PropertyPanelProps }) {
  const { checks, editable, onEdit, sections, onOpenSet } = props;
  const setId = node.setId ?? "";
  const call = setId ? props.calls?.[setId] : undefined;
  const mine = checks.filter((c) => c.nodeId === node.id);
  const [whoCalls, setWhoCalls] = useState<{ setId: string; list: RuleSetPick[] } | null>(null);
  useEffect(() => {
    if (!setId) return;
    let alive = true;
    callers(setId).then(
      (r) => {
        if (alive) setWhoCalls({ setId, list: r.sets ?? [] });
      },
      () => {
        if (alive) setWhoCalls({ setId, list: [] });
      },
    );
    return () => {
      alive = false; // 다른 노드를 고르면 늦은 응답은 버린다(Local-Rules §11)
    };
  }, [setId]);
  const list = whoCalls?.setId === setId ? whoCalls.list : null;
  return (
    <div className="rsf-panel" data-testid="flow-prop-set">
      <Section kind="CALL" id="set-basic" title="하위 세트" memory={sections}>
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <tr>
              <th style={DETAIL_LABEL_CELL}>이름</th>
              <td style={DETAIL_VALUE_CELL}>
                <Input
                  data-testid="flow-prop-set-label"
                  value={node.label ?? ""}
                  placeholder={call?.setName ?? setId}
                  readOnly={!editable}
                  onChange={(v) => onEdit((f) => updateNodeLabel(f, node.id, blankToNull(v)), { mergeKey: `nlabel:${node.id}` })}
                />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>세트 ID</th>
              <td style={DETAIL_VALUE_CELL}>
                <code>{setId || "-"}</code> <span className="rsf-muted">{`(노드 ${node.id})`}</span>
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>세트명·상태</th>
              <td style={DETAIL_VALUE_CELL}>
                {!call ? "-" : !call.exists ? <span style={badgeStyle("danger")}>없는 세트</span> : <>{call.setName ?? "-"} <span style={{ ...badgeStyle("neutral"), marginLeft: 4 }}>{call.status}</span></>}
              </td>
            </tr>
          </tbody>
        </table>
        <CheckLines checks={mine} />
        <div className="rsf-panel-actions">
          <Button data-testid="flow-prop-set-open" size="sm" disabled={!setId || !onOpenSet} onClick={() => onOpenSet?.(setId)}>
            <IconExternalLink size={14} aria-hidden="true" style={{ marginRight: "var(--spacing-xs)" }} />
            세트 탭으로 열기
          </Button>
          {editable && <DeleteButton onClick={() => onEdit((f) => removeNode(f, node.id))} />}
        </div>
      </Section>

      <Section kind="CALL" id="set-inputs" title={`입력 ${call?.inputs.length ?? 0}개`} memory={sections}>
        {(call?.inputs ?? []).length === 0 ? (
          <p className="rsf-muted">없음</p>
        ) : (
          <ul className="rsf-vars">
            {(call?.inputs ?? []).map((v) => (
              <li key={v.name} data-testid={`flow-prop-set-input-${v.name}`}>
                <div className="rsf-var-row">
                  <code>{v.name}</code>
                  {v.source && <span style={badgeStyle(SOURCE_TONE[v.source])}>{SOURCE_LABEL[v.source]}</span>}
                  <span className="rsf-muted">{typeText(v)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section kind="CALL" id="set-outputs" title={`출력 ${call?.outputs.length ?? 0}개`} memory={sections}>
        {(call?.outputs ?? []).length === 0 ? (
          <p className="rsf-muted">없음</p>
        ) : (
          <ul className="rsf-vars">
            {(call?.outputs ?? []).map((o) => (
              <li key={o.name} data-testid={`flow-prop-set-output-${o.name}`}>
                <div className="rsf-var-row">
                  <code>{o.name}</code>
                  <span style={badgeStyle(o.always ? "neutral" : "warning")}>{o.always ? "항상" : "일부 경로"}</span>
                  <span className="rsf-muted">{o.dataType ?? ""}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section kind="CALL" id="set-callers" title="이 세트를 부르는 세트" memory={sections}>
        {list == null ? (
          <p className="rsf-muted">불러오는 중</p>
        ) : list.length === 0 ? (
          <p className="rsf-muted">없음</p>
        ) : (
          <ul className="rsf-vars">
            {list.map((p) => (
              <li key={p.setId}>
                <button type="button" className="rsf-link" data-testid={`flow-prop-set-caller-${p.setId}`} onClick={() => onOpenSet?.(p.setId)}>
                  {`${p.setId} · ${p.setName}`}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
```
(import `useEffect`·`useState`, `callers`(`../api`), `RuleSetPick`·`SetCallIoMap`(`../types`). `rsf-link` 클래스가 없으면 `styles/set.ts` 끝에 `.rsf-link { border: none; background: none; padding: 0; color: var(--color-primary); cursor: pointer; text-align: left; }` 를 더한다. `badgeStyle("danger")` 의 색 이름은 `@/shell` 의 `badgeStyle` 이 받는 값으로 맞춘다.)

`panels/SidePanel.tsx`: `SidePanelProps` 에 `calls?: SetCallIoMap; onOpenSet?: (setId: string) => void;` 를 더해 `PropertyPanel`·`panelTargetOf` 로 넘긴다.

`cards/SetIoTables.tsx` — 표의 `users`·`by`·`readers` 칸을 만드는 곳(116-137행)에서 이름을 표시용으로 바꾼다.
```ts
const keyLabel = (k: string) => (isSetKey(k) ? `세트 ${setIdOfKey(k)}` : k);
```
`users: r.users.join(", ")` → `r.users.map(keyLabel).join(", ")`, `by: r.by.join(", ")` → `r.by.map(keyLabel).join(", ")`, `readers: … r.readers.join(", ")` → `r.readers.map(keyLabel).join(", ")`. `resultTarget(r.by)` 는 첫 생산자가 세트 키면 링크 없음(null)으로: `target: isSetKey(r.by[0] ?? "") ? null : resultTarget(r.by)`.

- [ ] **Step 6: 툴바 링크·편집기 연결·받는 노드**

`canvas/FlowToolbar.tsx`: props 에 `onOpenSet?: (setId: string) => void;` 를 더하고, 메시지(`set-message`) 블록 안 경고 줄들 뒤에:
```tsx
          {onOpenSet && callerSetIds(message.text, message.lines ?? []).length > 0 && (
            <p style={{ margin: 0 }}>
              부르는 세트:{" "}
              {callerSetIds(message.text, message.lines ?? []).map((id) => (
                <button key={id} type="button" className="rsf-link" data-testid={`set-message-caller-${id}`} onClick={() => onOpenSet(id)} style={{ marginRight: 6 }}>
                  {id}
                </button>
              ))}
            </p>
          )}
```

`RuleSetEditor.tsx`:
- `useEditActions({...})` 인자에 `openSetPick: setPickEdge`(아래 상태), `openSet: tabsApi.openSet` 를 더한다.
```tsx
  /** 세트 검색 팝업 — 열려 있으면 끼울 선(null = 고른 선, 없으면 END 앞 선), 닫혀 있으면 undefined. */
  const [pickEdge, setPickEdge] = useState<string | null | undefined>(undefined);
```
  (`openSetPick` 에는 `(edgeId: string | null) => setPickEdge(edgeId)` 를 넘긴다.)
- `FlowCanvas` 에 `calls={state.calls}`·`onOpenSet={tabsApi.openSet}`, `SidePanel` 에 같은 두 칸, `FlowToolbar` 에 `onOpenSet={tabsApi.openSet}`.
- 반환 JSX 의 `ErrorModal` 앞에:
```tsx
        <SetPickModal
          open={pickEdge !== undefined}
          currentSetId={setId}
          onPick={(id) => {
            const e = pickEdge ?? null;
            setPickEdge(undefined);
            editActions.placeSet(e, id);
          }}
          onClose={() => setPickEdge(undefined)}
          onError={state.reportError}
        />
```
- 다른 탭 저장 알림:
```tsx
  // 다른 탭이 세트 S 를 저장·폐기·되살렸다 — 흐름에 S 를 부르는 SET 노드가 있으면 S 의 겉모양을 다시 받는다(하위 세트 spec §10.4).
  const writtenSeq = tabsApi.written?.seq ?? 0;
  useEffect(() => {
    const w = tabsApi.written;
    if (!w || !flowRef.current || w.setId === setId) return;
    if (flowSetIds(flowRef.current).includes(w.setId)) state.refreshCalls([w.setId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writtenSeq]);
```
- 디버그 경고 — `{debugging && <DebugToolbar … />}` 바로 뒤에:
```tsx
            {debugging &&
              flowSetIds(flow)
                .filter((id) => tabsApi.dirtySetIds.has(id))
                .map((id) => (
                  <p key={id} className="rsf-panel-note" data-testid="sim-dirty-subsets" role="status">
                    {`하위 세트 ${id}에 저장하지 않은 변경이 있다. 실행은 저장된 정의로 한다.`}
                  </p>
                ))}
```
  (import `flowSetIds`(`./flow-model`)·`SetPickModal`(`./canvas/SetPickModal`).)

받는 노드(CATCH UI): `grep -rn "attachTo\|예외 받기 추가\|CATCH_KIND_LABEL\|kind === \"RULE\"" src/frontend/m-mdm/pages/dme/ruleSetEdit` 로 CATCH 계획이 만든 곳을 찾아 다음을 넓힌다.
- 룰 노드에 마우스를 올리면 보이는 "예외" 연결점과 우클릭 「예외 받기 추가」: 조건 `kind === "RULE"` → `kind === "RULE" || kind === "SET"`(보기 모드에서 숨기는 조건은 그대로).
- 받는 노드 속성 패널의 종류 체크 목록: 대상 노드 종류로 고른다(Task 2 의 `flow-model.ts` `CATCH_KINDS_FOR[target.kind]`).
  종류 이름표 `CATCH_KIND_LABEL` 의 `SUBSET_ENDED` 는 Task 1 이 이미 더했다. 디버거 CAUGHT 배지 이름도 같은 맵을 쓰면 따로 고칠 것이 없다.
- 룰을 지우면 붙은 받는 노드를 같이 지우는 CATCH 의 지우기 규칙이 `kind === "RULE"` 로 걸려 있으면 SET 도 포함한다(`CATCHABLE` 을 쓰면 Task 2 가 이미 넓혔다).
- `addCatch` 가 대상 종류별 목록(`CATCH_KINDS_FOR`)으로 고르는 변경은 Task 2 가 이미 했다. 속성 패널의 종류 체크 목록도 같은 `CATCH_KINDS_FOR[target.kind]` 를 쓴다.

- [ ] **Step 7: 화면 실패 시험 — `tests/dme/ruleSetEdit/set-node-page.test.ts`**

```ts
/** @vitest-environment happy-dom */
// 하위 세트 spec §9·§10.3·§10.4 — SET 노드 놓기(검색 팝업)·그리기·링크로 탭 열기·다른 탭 저장 뒤 겉모양 다시 받기·부르는 세트 링크·디버거 경고.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/dme/rule-handoff", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/dme/rule-handoff")>()) }));

import type { RuleSetView, SetCallIo } from "../../../pages/dme/ruleSetEdit/types";
import { flush, typeInto } from "../helpers/render";
import { byTestId, calls, click, inDoc, inPanel, installServer, ok, openSet, q, settle, srv, uninstallServer } from "../helpers/rule-set-page";

const callOf = (setId: string, outputs: string[], exists = true): SetCallIo => ({
  setId, setName: `${setId} 세트`, exists, status: exists ? "INUSE" : null, inputs: [],
  outputs: outputs.map((name) => ({ name, dataType: "NUMBER", scale: null, dateString: false, maruCodeId: null, always: true })), endsEarly: false,
});

function viewOf(setId: string, flow: unknown = null, callMap: Record<string, SetCallIo> = {}): RuleSetView {
  return {
    set: { setId, setName: `${setId} 세트`, description: null, status: "INUSE", rowVersion: 0, ruleIds: [], flow, branched: false },
    rules: [], checks: [], editable: true, restorable: false, condIo: {}, cases: [], calls: callMap,
  } as unknown as RuleSetView;
}

const PARENT_FLOW = {
  version: 1,
  nodes: [
    { id: "start", kind: "START", ruleId: null, splitId: null, label: null },
    { id: "s1", kind: "SET", ruleId: null, splitId: null, label: null, setId: "CHILD" },
    { id: "end", kind: "END", ruleId: null, splitId: null, label: null },
  ],
  edges: [
    { id: "e1", from: "start", to: "s1", order: null, cond: null, otherwise: false, label: null },
    { id: "e2", from: "s1", to: "end", order: null, cond: null, otherwise: false, label: null },
  ],
  view: { positions: {}, notes: [], groups: [] },
};

describe("SET 노드 화면", () => {
  beforeEach(installServer);
  afterEach(uninstallServer);

  it("SET 노드는 세트명 제목·입출력 칩을 그리고 링크는 같은 화면의 새 탭으로 연다", async () => {
    await openSet("PARENT", viewOf("PARENT", PARENT_FLOW, { CHILD: callOf("CHILD", ["P", "Q"]) }), { tabId: "T1" });
    expect(byTestId("flow-set-title-s1").textContent).toContain("CHILD 세트");
    expect(byTestId("flow-set-io-s1").textContent).toContain("출력 2");
    srv.views.CHILD = viewOf("CHILD");
    await click("flow-set-open-s1");
    await settle();
    const tabs = Array.from(byTestId("set-tabs").querySelectorAll('[role="tab"]'));
    expect(tabs).toHaveLength(2);
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].textContent).toContain("CHILD");
  });

  it("도구 상자 「룰 세트」는 팝업에서 INUSE 이고 지금 세트가 아닌 세트만 보이고, 고르면 SET 노드를 끼우고 겉모양을 받는다", async () => {
    srv.replies["search:SET"] = ok({ sets: [
      { setId: "PARENT", setName: "자기", status: "INUSE" },
      { setId: "OLD", setName: "폐기", status: "DEPRECATED" },
      { setId: "CHILD", setName: "하위", status: "INUSE" },
    ] });
    srv.replies["search:CALL_IO"] = ok({ calls: [callOf("CHILD", ["P"])] });
    await openSet("PARENT", viewOf("PARENT"), { tabId: "T1" });
    await click("flow-mode-edit");
    await click("flow-add-set");
    expect(inDoc("set-pick-modal")).toBeTruthy();
    await typeInto(inDoc<HTMLInputElement>("set-pick-modal-pick-keyword"), "");
    await settle();
    expect(document.querySelector('[data-testid="set-pick-modal-pick-PARENT"]')).toBeNull();
    expect(document.querySelector('[data-testid="set-pick-modal-pick-OLD"]')).toBeNull();
    await act(async () => {
      inDoc("set-pick-modal-pick-CHILD").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    expect(q("flow-set-title-s1")).not.toBeNull();
    expect(calls("search").some((r) => (r.body.params as Record<string, string>).target === "CALL_IO")).toBe(true);
    expect(byTestId("flow-set-io-s1").textContent).toContain("출력 1");
  });

  it("다른 탭이 하위 세트를 저장하면 부모 탭이 그 겉모양을 다시 받는다", async () => {
    await openSet("PARENT", viewOf("PARENT", PARENT_FLOW, { CHILD: callOf("CHILD", ["P"]) }), { tabId: "T1" });
    srv.views.CHILD = viewOf("CHILD");
    await click("flow-set-open-s1");
    await settle();
    const childKey = byTestId("set-tabs").querySelectorAll('[role="tab"]')[1].getAttribute("data-testid")!.replace("set-tab-", "");
    srv.replies.save = ok({ setId: "CHILD", rowVersion: 1, checks: [] });
    srv.replies["search:CALL_IO"] = ok({ calls: [callOf("CHILD", ["P", "R"])] });
    const before = calls("search").length;
    await act(async () => {
      inPanel(childKey, "flow-mode-edit").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      inPanel(childKey, "flow-add-note").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      inPanel(childKey, "set-save").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    const after = calls("search").slice(before).map((r) => (r.body.params as Record<string, string>).target);
    expect(after).toContain("CALL_IO");
    expect(inPanel("t1", "flow-set-io-s1").textContent).toContain("출력 2");
  });

  it("저장 경고의 부르는 세트는 링크 단추로 보이고 누르면 그 세트 탭을 연다", async () => {
    await openSet("CHILD", viewOf("CHILD"), { tabId: "T1" });
    srv.replies.save = ok({ setId: "CHILD", rowVersion: 1, checks: [
      { code: "CALLER_WARN", severity: "WARN", ruleId: null, otherRuleId: null, varName: null, message: "부르는 세트에 경고가 생겼다: PARENT", nodeId: null, edgeId: null },
    ] });
    await click("flow-mode-edit");
    await click("flow-add-note");
    await click("set-save");
    await settle();
    srv.views.PARENT = viewOf("PARENT");
    await click("set-message-caller-PARENT");
    await settle();
    expect(Array.from(byTestId("set-tabs").querySelectorAll('[role="tab"]')).map((t) => t.textContent)).toEqual([
      expect.stringContaining("CHILD"),
      expect.stringContaining("PARENT"),
    ]);
  });

  it("디버그 모드에서 다른 탭에 저장 안 한 하위 세트가 있으면 경고한다", async () => {
    await openSet("PARENT", viewOf("PARENT", PARENT_FLOW, { CHILD: callOf("CHILD", ["P"]) }), { tabId: "T1" });
    srv.views.CHILD = viewOf("CHILD");
    await click("flow-set-open-s1");
    await settle();
    const childKey = byTestId("set-tabs").querySelectorAll('[role="tab"]')[1].getAttribute("data-testid")!.replace("set-tab-", "");
    await act(async () => {
      inPanel(childKey, "flow-mode-edit").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      inPanel(childKey, "flow-add-note").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    await click("set-tab-t1");
    await act(async () => {
      inPanel("t1", "flow-mode-debug").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect(inPanel("t1", "sim-dirty-subsets").textContent).toBe("하위 세트 CHILD에 저장하지 않은 변경이 있다. 실행은 저장된 정의로 한다.");
  });
});
```
(`set-save`·`flow-mode-debug`·`set-pick-modal-pick-keyword`·`set-pick-modal-pick-{id}`(IdPicker 의 후보 testid 규칙 `${testId}-${id}`) 는 지금 코드의 testid 규칙이다 — `grep -rn "set-save\|flow-mode-debug" src/frontend/m-mdm/pages/dme/ruleSetEdit`·`src/frontend/m-mdm/src/shell/IdPicker.tsx` 로 확인하고 다르면 맞춘다. IdPicker 가 글자 입력 뒤 검색을 늦게 부르면 `settle()` 시간을 그 지연보다 길게 둔다.)

Run: `pnpm --dir src/frontend --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/set-node-page.test.ts`
Expected: Step 3~6 전에는 FAIL, 구현 뒤 PASS.

- [ ] **Step 8: e2e 시나리오(목록 확인까지만)**

`src/frontend/e2e/fixtures/mdm-ruleSet-data.sql` — 머리 주석의 목록에 `E2S_TAG(SET_THK → S_TAG)`·`E2S_SUBA(E2S_TAG 한 줄 — 하위 세트 시나리오의 부모)`·`E2S_SUBB(E2S_GRD 한 줄 — 하위)` 를 더하고, 룰·버전·변수·행·세트 INSERT 의 값 목록 끝에 같은 모양으로 더한다(`E2S_SPD` 줄을 본보기로).
```sql
-- TB_MDM_RULE 값 목록 끝에
    ('E2S_TAG', 'E2S 꼬리표', 'DECISION', 'INUSE', 'MDM', '두께로 꼬리표를 정한다(하위 세트 e2e E16)', NULL, 2, 2, 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0)
-- TB_MDM_RULE_VER 값 목록 끝에
    ('E2S_TAG', 1, 'RELEASED', NULL, NULL, 'FIRST', '2026-01-01 00:00:00', '9999-12-31 00:00:00', '2026-01-01 00:00:00', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0)
-- TB_MDM_RULE_VAR 값 목록 끝에
    ('E2S_TAG', 1, 1, 'COND', '1', 'SET_THK', NULL, 1, '두께', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_TAG', 1, 2, 'RESULT', 'Value', 'S_TAG', 'STRING', 1, '꼬리표', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0)
-- TB_MDM_RULE_ROW 값 목록 끝에
    ('E2S_TAG', 1, 1, 1, 'NORMAL', '{"1":{"op":"NA"},"2":{"val":"T"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_TAG', 1, 2, 0, 'DEFAULT', '{"2":{"val":"-"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0)
-- TB_MDM_RULE_SET 값 목록 끝에
    ('E2S_SUBA', 'E2E 하위 세트 부모', '["E2S_TAG"]', NULL, '하위 세트 e2e E16 — 부모', 'INUSE', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_SUBB', 'E2E 하위 세트', '["E2S_GRD"]', NULL, '하위 세트 e2e E16 — 하위', 'INUSE', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0)
```
(각 INSERT 의 앞 줄 끝 `;` 를 `,` 로 바꾸고 새 줄 끝에 `;` 를 둔다. `TB_MDM_RULE` 의 열 순서는 그 INSERT 머리 그대로다.)

`src/frontend/e2e/mdm-ruleSetEdit.spec.ts` — 머리 주석의 고유 시나리오 목록 끝에 `E16 하위 세트(SET 노드 넣기·링크로 탭·하위 세트 저장 뒤 부모 탭 검사 갱신)` 를 더하고, 마지막 `test(...)` 뒤(describe 안)에:
```ts
  test("E16 하위 세트: E2S_SUBA 에 E2S_SUBB 를 SET 노드로 넣어 저장하고, 링크로 연 E2S_SUBB 탭에서 E2S_TAG 를 더해 저장하면 E2S_SUBA 탭 검사에 중복 대입 경고가 생긴다", async ({ page }) => {
    await login(page, STEWARD);
    await openRuleSetEdit(page);
    await pickSet(page, "E2S_SUBA");
    // 탭이 둘이 되면 같은 testid 가 두 패널에 있다 — Playwright 로케이터는 엄격 모드라 늘 패널로 좁힌다.
    const panelA = page.getByTestId("set-tab-panel-t1");
    await panelA.getByTestId("flow-mode-edit").click();
    await expect(panelA.getByTestId("flow-palette")).toBeVisible();

    // 시작 → r1 선을 고르고 도구 상자 「룰 세트」 → 팝업에서 E2S_SUBB.
    await panelA.locator('[data-testid="rf__edge-e1"] .react-flow__edge-interaction').click();
    await panelA.getByTestId("flow-add-set").click();
    await page.getByTestId("set-pick-modal-pick-keyword").fill("E2S_SUBB");
    await page.getByTestId("set-pick-modal").getByRole("button", { name: "찾기" }).click();
    await page.getByTestId("set-pick-modal-pick-E2S_SUBB").click();
    await expect(panelA.getByTestId("flow-set-title-s1")).toContainText("E2E 하위 세트", { timeout: 20_000 });
    await panelA.getByTestId("set-save").click();
    await expect(panelA.getByTestId("set-message")).toContainText("저장", { timeout: 20_000 });

    // 링크 아이콘 → 같은 화면의 새 탭(E2S_SUBB).
    await panelA.getByTestId("flow-set-open-s1").click();
    const tabs = page.getByTestId("set-tabs").getByRole("tab");
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    const keyB = (await tabs.nth(1).getAttribute("data-testid"))!.replace("set-tab-", "");
    const panelB = page.getByTestId(`set-tab-panel-${keyB}`);
    await expect(panelB.getByTestId("flow-node-r1")).toContainText("E2S_GRD", { timeout: 20_000 });

    // E2S_SUBB 끝에 E2S_TAG 를 더해 저장 — 부르는 E2S_SUBA 에 S_TAG 중복 대입 경고가 생긴다(저장은 된다). addRule 도우미는 page 전역 testid 라 쓰지 않는다.
    await panelB.getByTestId("flow-mode-edit").click();
    await panelB.getByTestId("flow-add-rule").click();
    await expect(panelB.getByTestId("flow-panel-kind")).toHaveText("빈 단계");
    await panelB.getByTestId("flow-rule-panel-search").fill("E2S_TAG");
    await panelB.getByTestId("flow-rule-panel-find").click();
    await panelB.getByTestId("flow-rule-assign-E2S_TAG").click();
    await panelB.getByTestId("set-save").click();
    await expect(panelB.getByTestId("set-message")).toContainText("부르는 세트에 경고가 생겼다: E2S_SUBA", { timeout: 20_000 });
    await expect(panelB.getByTestId("set-message-caller-E2S_SUBA")).toBeVisible();

    // E2S_SUBA 탭으로 돌아가면 검사에 DUP_RESULT 가 보인다(저장 알림으로 겉모양을 다시 받았다).
    await tabs.nth(0).click();
    await expect(panelA.getByTestId("flow-tab-checks")).toContainText("검사 결과 1", { timeout: 20_000 });
    await panelA.getByTestId("flow-tab-checks").click();
    await expect(panelA).toContainText("세트 E2S_SUBB와 E2S_TAG가 같은 결과 변수 S_TAG에 대입한다");
  });
```
(`IdPicker` 의 찾기 단추 이름 "찾기" 는 위 바 `clickPick` 도우미와 같다. 선 누르기 자리(`.react-flow__edge-interaction`)는 `revealEdgeAdd` 도우미와 같다.)

Run(목록 확인만 — 실행 아님): `pnpm --dir src/frontend exec playwright test e2e/mdm-ruleSetEdit.spec.ts --list`
Expected: 목록에 `E16 하위 세트: …` 가 보이고 문법 오류가 없다. **실행은 사용자 승인 뒤 컨트롤러가 한다**(새 mcm.db·mdm.db, 픽스처 적재, 서버 기동이 필요하다 — 이 태스크에서 하지 않는다).

- [ ] **Step 9: 통과 확인**

Run(차례로):
```bash
pnpm --dir src/frontend --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/set-node-model.test.ts tests/dme/ruleSetEdit/set-node-page.test.ts
pnpm --dir src/frontend --filter @dk-oasis/m-mdm test
rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint
python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit <이 태스크가 바꾼 화면 파일 모두>
python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit <이 태스크가 바꾼 화면 파일 모두>
grep -rnE "import ['\"]\.{1,2}/[^'\"]*\.css['\"]" src/frontend/m-mdm/pages/dme/ruleSetEdit
grep -rn "SEAM(T8)" src/frontend/m-mdm/pages/dme/ruleSetEdit
```
Expected: 시험 PASS, `[m-mdm test 합계]` 가 기준선 + 이 태스크 시험 수, tsc 0, audit 0건(바꾼 파일 목록은 `/usr/bin/git status --short src/frontend/m-mdm` 로 모은다), `.css` import 0, `SEAM(T8)` 0건(Task 1 이 남긴 자리를 모두 채웠다). 캔버스 memo 의존성을 더했으므로 `final-fix.test.ts`(끄는 동안 dagre 호출 수)가 그대로 초록인지 본다.

- [ ] **Step 10: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit src/frontend/m-mdm/tests/dme/ruleSetEdit/set-node-model.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/set-node-page.test.ts src/frontend/e2e/mdm-ruleSetEdit.spec.ts src/frontend/e2e/fixtures/mdm-ruleSet-data.sql
/usr/bin/git commit -m "feat(m-mdm): 룰 세트 편집기에 하위 세트 SET 노드와 탭 연동을 더한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/frontend/m-mdm/pages/dme/ruleSetEdit src/frontend/m-mdm/tests/dme/ruleSetEdit/set-node-model.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/set-node-page.test.ts src/frontend/e2e/mdm-ruleSetEdit.spec.ts src/frontend/e2e/fixtures/mdm-ruleSet-data.sql
```

---

### Task 9: 디버거 — SET 노드 표시·노드 상세·"안으로 들어가기"(같은 캔버스, 경로 표시)

> **갱신 메모(레인이 착수 때 반영, 2026-10-06 plan:0)** — 아래 본문은 `2e02d29d` 기준이다. 본문보다 이 메모와 Task 0 대조표가 앞선다.
> - 담당 ui:9. 캔버스 변경(D-140·D-142·D-143·`aac858aa`)과 D-136 그리기(병렬 합류 속 빈 막대, IF 합류 없음, 끝낸 IF 갈래 표시 §11)를 하위 프레임에도 쓴다. 하위 흐름이 옛 형식이면 `toEditFlow` 변환을 거쳐 그린다(스펙 §11).
> - `trace-view.ts` 의 SEAM 은 지금 `Guarded.step` 을 푸는 자리에서 찾는다(`Guarded.rule` 이 아니다).

**모델:** sonnet — 순수 함수(`call-stack.ts`)와 작은 훅 하나를 두고, 편집기·패널·값 표에 "지금 보고 있는 단계(세트)"를 넘기는 일이다. 실행은 바꾸지 않는다.

**이 태스크가 정한 것(Ruling 15·21):**
- Task 2 가 `trace-view.ts` 에 `// SEAM(T9)` 를 두었으면(CATCH 의 `Guarded.rule` 을 룰로 푸는 자리) SET 이면 SET 기록 풀이(아래 Step 의 SET 갈래)로 바꾼다. `grep -rn "SEAM(T9)" src/frontend/m-mdm/pages` 가 0건이어야 한다.
- 들어가기 상태는 `useCallStack(last)` 의 `frames: CallFrame[]` 다. 새 기록이 오면 비운다. 디버그 모드를 나가면 비운다.
- 하위 프레임은 같은 캔버스에 하위 흐름(`calledFlows`)을 읽기 전용으로 그리고, 겹침은 그 하위 기록의 커서(`frame.cursor`, 들어갈 때 끝 = n)로 그린다. 경로 표시 줄(`dbg-callpath`)의 ‹ › 가 그 커서를 옮긴다. 툴바의 단계 실행(F10·F5 등)은 최상위 기록에만 쓴다(Ruling 21).
- 하위 프레임에서는 오른쪽에 값 고치기(E4)가 있는 변수 패널 대신 노드 상세만(`FrameDetail`) 보이고, 중단점·검사 표시는 끈다. 값 표는 그 프레임 기록, 실행 비교는 이전 실행에서 같은 SET 노드 경로를 따라간 하위 기록과 견준다(`subTraceAt`).
- SET 노드 상세: 세트 ID, [안으로 들어가기], 읽은 입력값, 넘겨받은 출력, 하위 `endedBy`, 받아 처리한 예외 건수(= 하위 기록에서 실행된 받는 노드 수, 그 하위 세트 안만 — `RunTrace` 에는 `caught` 가 없다).
- 값 흐름(`frames`)·칩·값 표는 OK 인 SET 노드의 `outputs` 를 RULE 의 `result.results` 처럼 쓴다.

**Files:**
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/call-stack.ts`
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/useCallStack.ts`
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/FrameDetail.tsx`
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/useSimulation.ts`(`SimResult.calledFlows`, `fresh` 의 기록)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts`(`frames`·`chipOf`·`valueTable` 의 SET)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx`(SET 갈래, prop `onEnter`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/VariablePanel.tsx`(prop `onEnterSet` 를 `TraceDetail` 로)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/ValuesTab.tsx`(prop `frame`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/RunCompare.tsx`(prop `framePath`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/RuleSetEditor.tsx`(연결·경로 표시 줄)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/debug.ts`(`.rsf-callpath`)
- Create(Test): `src/frontend/m-mdm/tests/dme/ruleSetEdit/call-stack.test.ts`
- Create(Test): `src/frontend/m-mdm/tests/dme/ruleSetEdit/debug-subset.test.ts`

**Interfaces:**
- Consumes: Task 1(생성 TS `NodeTrace.outputs`·`sub`), Task 6(`execute` 응답 `calledFlows`), Task 7(`RuleSetEditor`), Task 8(`CalledFlow`·`calls`).
- Produces:
  - `call-stack.ts`: `interface CallFrame { nodeId: string; setId: string; label: string; trace: RunTrace; flow: EditFlow; rules: Record<string, RuleIo>; cursor: number }`, `enterFrame(parentTrace, parentFlow, nodeId, called): CallFrame | null`, `callPath(rootSetId, frames): string[]`, `subTraceAt(trace, nodePath): RunTrace | null`, `caughtCount(sub): number`, `frameValueAt(frame): (name: string) => TypedValue | null | undefined`.
  - `useCallStack(last: SimResult | null): { frames: CallFrame[]; top: CallFrame | null; enter(nodeId: string): void; backTo(depth: number): void; step(delta: number): void }`.
  - testid: `sim-detail-set`·`sim-detail-enter`·`sim-detail-outputs`·`sim-detail-sub-summary`, `dbg-callpath`·`dbg-callpath-{i}`·`dbg-frame-prev`·`dbg-frame-next`·`dbg-frame-status`.

- [ ] **Step 1: 순수 함수 실패 시험 — `tests/dme/ruleSetEdit/call-stack.test.ts`**

```ts
// 하위 세트 spec §11 — 디버거 들어가기(순수 함수)와 SET 노드 값 흐름.
import { describe, expect, it } from "vitest";

import type { NodeTrace, RunTrace, TypedValue } from "../../../src/contract/engine-contract.generated";
import { callPath, caughtCount, enterFrame, frameValueAt, subTraceAt } from "../../../pages/dme/ruleSetEdit/debugger/call-stack";
import { toEditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { frames, valueTable } from "../../../pages/dme/ruleSetEdit/trace-view";
import type { CalledFlow } from "../../../pages/dme/ruleSetEdit/types";

const num = (v: string): TypedValue => ({ type: "NUMBER", value: v });
const nodeT = (seq: number, nodeId: string, kind: NodeTrace["kind"], over: Partial<NodeTrace> = {}): NodeTrace =>
  ({ seq, nodeId, kind, status: "OK", ruleId: null, ver: null, reads: null, branches: null, chosenEdgeId: null, order: null, splitId: null, merged: null, violations: null, ...over }) as NodeTrace;

/** 하위 세트 CHILD: start → r1(C_A: A = Y + 1) → end. */
const sub: RunTrace = {
  setId: "CHILD", evalTs: "2026-10-01T09:00:00", input: { Y: num("1") },
  nodes: [nodeT(1, "start", "START"), nodeT(2, "r1", "RULE", { ruleId: "C_A", result: { ruleId: "C_A", ver: 1, evalTs: "2026-10-01T09:00:00", hits: [], defaultApplied: false, results: { A: num("2") }, trace: [], warnings: [] } as never }), nodeT(3, "end", "END")],
  finalValues: { A: num("2") }, violations: null,
} as RunTrace;

/** 부모: start → s1(SET CHILD, "단가 결정") → end. */
const parentFlow = toEditFlow(
  { version: 1, nodes: [
    { id: "start", kind: "START", ruleId: null, splitId: null, label: null },
    { id: "s1", kind: "SET", ruleId: null, splitId: null, label: "단가 결정", setId: "CHILD" },
    { id: "end", kind: "END", ruleId: null, splitId: null, label: null },
  ], edges: [
    { id: "e1", from: "start", to: "s1", order: null, cond: null, otherwise: false, label: null },
    { id: "e2", from: "s1", to: "end", order: null, cond: null, otherwise: false, label: null },
  ] },
  [],
);
const parent: RunTrace = {
  setId: "PARENT", evalTs: "2026-10-01T09:00:00", input: { Y: num("1") },
  nodes: [nodeT(1, "start", "START"), nodeT(2, "s1", "SET", { reads: { Y: num("1") }, outputs: { A: num("2") }, sub } as Partial<NodeTrace>), nodeT(3, "end", "END")],
  finalValues: { A: num("2") }, violations: null,
} as RunTrace;
const called: Record<string, CalledFlow> = { CHILD: { setId: "CHILD", setName: "하위", flow: null, ruleIds: ["C_A"], rules: [] } };

describe("call-stack", () => {
  it("SET 노드로 들어가면 하위 기록·하위 흐름(없으면 RULE_IDS 한 줄)·끝 커서의 프레임이다", () => {
    const f = enterFrame(parent, parentFlow, "s1", called)!;
    expect(f.setId).toBe("CHILD");
    expect(f.label).toBe("단가 결정");
    expect(f.flow.nodes.map((n) => n.id)).toEqual(["start", "r1", "end"]);
    expect(f.cursor).toBe(3);
    expect(enterFrame(parent, parentFlow, "start", called)).toBeNull();
    expect(callPath("PARENT", [f])).toEqual(["세트 PARENT", "단가 결정(s1)"]);
  });

  it("같은 SET 노드 경로를 따라 다른 기록의 하위 기록을 찾는다", () => {
    expect(subTraceAt(parent, ["s1"])).toBe(sub);
    expect(subTraceAt(parent, ["s9"])).toBeNull();
    expect(subTraceAt(parent, [])).toBe(parent);
  });

  it("프레임 커서 자리 값과 받은 예외 건수", () => {
    const f = enterFrame(parent, parentFlow, "s1", called)!;
    expect(frameValueAt(f)("a")).toEqual(num("2"));
    expect(frameValueAt({ ...f, cursor: 0 })("A")).toBeUndefined();
    expect(caughtCount(sub)).toBe(0);
  });

  it("값 흐름·값 표는 SET 노드의 넘겨받은 출력을 결과처럼 쓴다", () => {
    const fr = frames(parent, parentFlow);
    expect(fr[1].changed).toEqual(["A"]);
    const t = valueTable(parent, parentFlow);
    expect(t.vars).toEqual(["Y", "A"]);
    expect(t.cols.map((c) => c.label)).toEqual(["세트 CHILD"]);
  });
});
```

Run: `pnpm --dir src/frontend --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/call-stack.test.ts`
Expected: FAIL — `call-stack` 이 없고 `frames` 가 SET 출력을 쓰지 않는다.

- [ ] **Step 2: `call-stack.ts`·`trace-view.ts`**

```ts
/**
 * 디버거 "안으로 들어가기"(하위 세트 spec §11, C-D15) — 같은 캔버스에서 하위 기록·하위 흐름을 읽기 전용으로 보는 프레임. React 의존이 없다.
 * 기록 재생이라 탭을 열지 않는다. 하위 세트를 고치려면 SET 노드 링크로 탭을 연다.
 */
import type { RunTrace, TypedValue } from "@/contract/engine-contract.generated";

import { toEditFlow, type EditFlow } from "../flow-edit";
import { frames } from "../trace-view";
import type { CalledFlow, RuleIo } from "../types";

export interface CallFrame {
  /** 부모 흐름의 SET 노드. */
  nodeId: string;
  setId: string;
  /** 경로 표시 — SET 노드 라벨, 없으면 세트명, 없으면 세트 ID. */
  label: string;
  /** 하위 세트 기록. */
  trace: RunTrace;
  /** 하위 세트의 저장된 흐름(실행 때 받은 것). */
  flow: EditFlow;
  /** 하위 흐름 룰들의 입출력(룰 노드 제목). */
  rules: Record<string, RuleIo>;
  /** 0..n — "노드 k 실행 전"(P-D13). 들어갈 때는 끝(n). */
  cursor: number;
}

/** 부모 기록의 SET 노드 nodeId 로 들어간다. 그 노드가 SET 이 아니거나 하위 기록이 없으면 null. */
export function enterFrame(
  parentTrace: RunTrace,
  parentFlow: { nodes: ReadonlyArray<{ id: string; label?: string | null }> },
  nodeId: string,
  called: Readonly<Record<string, CalledFlow>>,
): CallFrame | null {
  const n = parentTrace.nodes.find((x) => x.nodeId === nodeId && x.kind === "SET");
  const sub = n?.sub;
  if (!sub) return null;
  const cf = called[sub.setId];
  const label = parentFlow.nodes.find((x) => x.id === nodeId)?.label ?? cf?.setName ?? sub.setId;
  const rules: Record<string, RuleIo> = {};
  for (const r of cf?.rules ?? []) rules[r.ruleId] = r;
  return { nodeId, setId: sub.setId, label, trace: sub, flow: toEditFlow(cf?.flow ?? null, cf?.ruleIds ?? []), rules, cursor: sub.nodes.length };
}

/** 경로 표시 조각 — ["세트 {최상위}", "{라벨}({노드 ID})", …]. */
export function callPath(rootSetId: string, stack: readonly CallFrame[]): string[] {
  return [`세트 ${rootSetId}`, ...stack.map((f) => `${f.label}(${f.nodeId})`)];
}

/** 같은 SET 노드 경로를 따라 다른 실행 기록에서 하위 기록을 찾는다(실행 비교). 경로가 비면 그 기록, 없으면 null. */
export function subTraceAt(trace: RunTrace, nodePath: readonly string[]): RunTrace | null {
  let cur: RunTrace | null = trace;
  for (const id of nodePath) {
    const n = cur.nodes.find((x) => x.nodeId === id && x.kind === "SET");
    cur = n?.sub ?? null;
    if (!cur) return null;
  }
  return cur;
}

/** 받아 처리한 예외 건수 — 하위 기록에서 실행된 받는 노드 수(그 하위 세트 안만). */
export const caughtCount = (sub: RunTrace): number => sub.nodes.filter((n) => n.kind === "CATCH").length;

/** 프레임 커서 자리의 값 읽기(이름 대소문자 무시) — 캔버스 변수 칩 툴팁. */
export function frameValueAt(frame: CallFrame): (name: string) => TypedValue | null | undefined {
  const fr = frames(frame.trace, frame.flow);
  const ctx = fr.length === 0 || frame.cursor <= 0 ? frame.trace.input : fr[Math.min(frame.cursor, fr.length) - 1].ctx;
  return (name: string) => {
    const lower = name.toLowerCase();
    const k = Object.keys(ctx).find((x) => x.toLowerCase() === lower);
    return k === undefined ? undefined : ctx[k];
  };
}
```

`trace-view.ts`:
- `frames(...)` 의 `if (node.kind === "RULE" && node.result) {…}` 뒤에:
```ts
      } else if (node.kind === "SET" && node.outputs) {
        // 하위 세트 spec §3 — 넘겨받은 출력은 RULE 결과처럼 그 범위에 덮어쓴다.
        for (const [name, value] of Object.entries(node.outputs)) {
          note(name, lookup(scope.ctx, name), value);
          put(scope, name, value);
        }
```
- `chipOf(...)`: RULE 갈래 뒤에
```ts
  if (node.kind === "SET" && node.outputs) {
    const first = Object.entries(node.outputs)[0];
    return first ? `${first[0]}=${typedText(first[1])}` : null;
  }
```
- `valueTable(...)`: `colFrames` 조건에 `|| (f.node.kind === "SET" && f.node.outputs)` 를 더하고, 이름 모으기 루프를 다음으로 바꾸며(SET 노드는 `result` 가 없으므로 지금의 `!f.node.result` 거르기에 걸리지 않게),
```ts
  for (const f of fr) {
    if (f.node.status !== "OK") continue;
    for (const name of [...Object.keys(f.node.result?.results ?? {}), ...Object.keys(f.node.outputs ?? {})]) if (!vars.includes(name)) vars.push(name);
  }
```
  열 이름을 `f.node.kind === "RULE" ? (f.node.ruleId ?? f.node.nodeId) : f.node.kind === "SET" ? \`세트 ${f.node.sub?.setId ?? f.node.nodeId}\` : \`합류 ${f.node.nodeId}\`` 로 바꾼다.

Run: Step 1 명령 → PASS.

- [ ] **Step 3: 기록·훅·패널**

`debugger/useSimulation.ts`:
- `SimResult` 에 `/** 실행 중 부른 세트의 저장된 흐름(들어가기, 하위 세트 spec §8). */ calledFlows: Record<string, CalledFlow>;`.
- `fresh` 의 `const record: Stored = { trace, warnings: res.warnings ?? [], flow: f, setId: forSet, flowVersion: version, input };` 에 `calledFlows: res.calledFlows ?? {}` 를 더한다. `SimResult`·`Stored` 를 만드는 다른 곳이 있으면(`grep -n "flowVersion: version" src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/useSimulation.ts`) 같은 칸을 더한다.

`debugger/useCallStack.ts`:
```ts
/** 디버거 들어가기 상태(하위 세트 계획 Ruling 15) — 새 기록이 오면 비운다. */
import { useCallback, useEffect, useState } from "react";

import { enterFrame, type CallFrame } from "./call-stack";
import type { SimResult } from "./useSimulation";

export interface CallStack {
  frames: CallFrame[];
  top: CallFrame | null;
  /** 맨 위 프레임(없으면 최상위 기록)의 SET 노드로 들어간다. */
  enter(nodeId: string): void;
  /** 그 깊이까지 돌아간다 — 0 은 최상위. */
  backTo(depth: number): void;
  /** 맨 위 프레임의 커서를 옮긴다(0..n). */
  step(delta: number): void;
}

const NO_FRAMES: CallFrame[] = [];

export function useCallStack(last: SimResult | null): CallStack {
  const [frames, setFrames] = useState<CallFrame[]>(NO_FRAMES);
  useEffect(() => setFrames(NO_FRAMES), [last]);
  const enter = useCallback(
    (nodeId: string) => {
      if (!last) return;
      setFrames((fs) => {
        const parent = fs[fs.length - 1];
        const f = enterFrame(parent ? parent.trace : last.trace, parent ? parent.flow : last.flow, nodeId, last.calledFlows ?? {});
        return f ? [...fs, f] : fs;
      });
    },
    [last],
  );
  const backTo = useCallback((depth: number) => setFrames((fs) => (depth >= fs.length ? fs : fs.slice(0, Math.max(0, depth)))), []);
  const step = useCallback(
    (delta: number) =>
      setFrames((fs) => {
        const t = fs[fs.length - 1];
        if (!t) return fs;
        const c = Math.min(t.trace.nodes.length, Math.max(0, t.cursor + delta));
        return c === t.cursor ? fs : [...fs.slice(0, -1), { ...t, cursor: c }];
      }),
    [],
  );
  return { frames, top: frames[frames.length - 1] ?? null, enter, backTo, step };
}
```

`debugger/TraceDetail.tsx`:
- props 에 `/** SET 노드 [안으로 들어가기](하위 세트 spec §11). 없으면 단추를 그리지 않는다. */ onEnter?: (nodeId: string) => void;`.
- 본문에 TASK 갈래 뒤로:
```tsx
      {node.kind === "SET" && (
        <>
          <p className="rsf-panel-note" data-testid="sim-detail-set">
            <code>{node.sub?.setId ?? "-"}</code>
          </p>
          {node.sub && onEnter && (
            <Button size="sm" data-testid="sim-detail-enter" onClick={() => onEnter(node.nodeId)}>
              안으로 들어가기
            </Button>
          )}
          <Sub>읽은 입력값</Sub>
          <Pairs testId="sim-detail-reads" values={node.reads} empty="읽은 값이 없다" />
          <Sub>넘겨받은 출력</Sub>
          <Pairs testId="sim-detail-outputs" values={node.outputs} empty="넘겨받은 값이 없다" />
          {node.sub && (
            <p className="rsf-muted" data-testid="sim-detail-sub-summary">
              {`하위 세트 끝: ${node.sub.endedBy ? `받는 노드 ${node.sub.endedBy}` : "정상"} · 받아 처리한 예외 ${caughtCount(node.sub)}건`}
            </p>
          )}
        </>
      )}
```
  (`node.sub.endedBy` 는 CATCH 가 `RunTrace` 에 더한 칸이다. import `caughtCount`.)

`debugger/VariablePanel.tsx`: props 에 `onEnterSet?: (nodeId: string) => void;` 를 더하고 `TraceDetail` 에 `onEnter={onEnterSet}` 를 넘긴다.

`debugger/ValuesTab.tsx`:
```tsx
export interface ValuesTabProps {
  sim: Simulation;
  /** 들어간 하위 프레임 — 있으면 그 기록·커서로 값 표를 그린다(하위 세트 spec §11). */
  frame?: CallFrame | null;
}

export function ValuesTab({ sim, frame }: ValuesTabProps) {
  if (frame) {
    const n = frame.trace.nodes.length;
    return (
      <div className="rsf-values-tab">
        <ValueTable trace={frame.trace} flow={frame.flow} step={Math.min(frame.cursor, n) - 1} />
      </div>
    );
  }
  …(지금 본문 그대로)
}
```

`debugger/RunCompare.tsx`: props 에 `/** 들어간 프레임의 SET 노드 경로 — 있으면 두 실행에서 같은 경로의 하위 기록끼리 견준다. */ framePath?: readonly string[];` 를 더하고, `compareRuns(before.trace, after.trace)` 를 다음으로 바꾼다.
```tsx
  const pathKey = (framePath ?? []).join(">");
  const diff = useMemo(() => {
    if (!before || !after) return null;
    const b = subTraceAt(before.trace, framePath ?? []);
    const a = subTraceAt(after.trace, framePath ?? []);
    return b && a ? compareRuns(b, a) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [before, after, pathKey]);
```

`debugger/FrameDetail.tsx`:
```tsx
"use client";

/** 들어간 하위 프레임의 오른쪽 — 고른 노드의 기록 상세(값 고치기·조사식 없음, 하위 세트 spec §11). */
import { TraceDetail } from "./TraceDetail";
import type { CallFrame } from "./call-stack";

export interface FrameDetailProps {
  frame: CallFrame;
  selectedId: string | null;
  onOpenRule(ruleId: string): void;
  onEnter(nodeId: string): void;
}

export function FrameDetail({ frame, selectedId, onOpenRule, onEnter }: FrameDetailProps) {
  if (!selectedId || !frame.flow.nodes.some((n) => n.id === selectedId)) {
    return <p className="rsf-panel-note" data-testid="frame-detail-empty">하위 세트 노드를 고르면 실행 기록이 보인다</p>;
  }
  const node = frame.trace.nodes.slice(0, frame.cursor).find((n) => n.nodeId === selectedId) ?? null;
  return (
    <TraceDetail nodeId={selectedId} node={node} flow={frame.flow} traceViolations={frame.trace.violations ?? []} onOpenRule={onOpenRule} onEnter={onEnter} />
  );
}
```

- [ ] **Step 4: 편집기 연결**

`RuleSetEditor.tsx`:
```tsx
  const stack = useCallStack(sim.last);
  const top = debugging ? stack.top : null;
  const framePath = useMemo(() => stack.frames.map((f) => f.nodeId), [stack.frames]);
  const enterSet = useCallback(
    (nodeId: string) => {
      stack.enter(nodeId);
      select(null);
    },
    [stack, select],
  );
  // 디버그 모드를 나가면 들어간 프레임을 비운다.
  useEffect(() => {
    if (!debugging) stack.backTo(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugging]);
  const frameValue = useMemo(() => (top ? frameValueAt(top) : null), [top]);
```
- 겹침: `const overlay = useMemo(() => (top ? debugOverlay(top.trace, top.flow, top.cursor) : debugging && fresh && last ? debugOverlay(last.trace, last.flow, sim.cursor) : null), [top, debugging, fresh, last, sim.cursor]);`
- `FlowCanvas` 에 넘기는 값: `flow={top ? top.flow : flow}`, `rules={top ? top.rules : state.rules}`, `checks={top ? NO_CHECKS : state.checks}`, `breakpoints={top ? NO_BREAKPOINTS : sim.breakpoints}`, `collapsed={top ? NO_COLLAPSED : collapse.collapsed}`, `fitKey={top ? \`${setId}>${framePath.join(">")}\` : setId}`, `valueAt={top && frameValue ? frameValue : debugging && !sim.stale ? sim.valueAt : undefined}`, `focusId={top ? null : focus.id}`. 모듈 상수 `const NO_CHECKS: RuleSetCheck[] = []; const NO_BREAKPOINTS: ReadonlySet<string> = new Set(); const NO_COLLAPSED: ReadonlySet<string> = new Set();`(참조가 렌더마다 바뀌지 않게, Local-Rules §16).
- 캔버스 감싸개(`rsf-canvas-host`) 바로 앞(`<div className="rsf-body">` 안 첫 자식)에 경로 표시 줄:
```tsx
                    {top && (
                      <div className="rsf-callpath" data-testid="dbg-callpath" role="navigation" aria-label="하위 세트 경로">
                        {callPath(setId ?? "", stack.frames).map((t, i, all) => (
                          <span key={i}>
                            {i > 0 && " › "}
                            {i < all.length - 1 ? (
                              <button type="button" className="rsf-link" data-testid={`dbg-callpath-${i}`} onClick={() => stack.backTo(i)}>
                                {t}
                              </button>
                            ) : (
                              <strong data-testid={`dbg-callpath-${i}`}>{t}</strong>
                            )}
                          </span>
                        ))}
                        <span className="rsf-callpath-step">
                          <button type="button" data-testid="dbg-frame-prev" aria-label="하위 기록 이전 단계" disabled={top.cursor <= 0} onClick={() => stack.step(-1)}>‹</button>
                          <span data-testid="dbg-frame-status">{`${top.cursor}/${top.trace.nodes.length}`}</span>
                          <button type="button" data-testid="dbg-frame-next" aria-label="하위 기록 다음 단계" disabled={top.cursor >= top.trace.nodes.length} onClick={() => stack.step(1)}>›</button>
                        </span>
                      </div>
                    )}
```
- 오른쪽: `{debugging ? (top ? <FrameDetail frame={top} selectedId={selectedId} onOpenRule={openRule} onEnter={enterSet} /> : <VariablePanel … onEnterSet={enterSet} />) : <SidePanel … />}`.
- 아래 탭: `<ValuesTab sim={sim} frame={top} />`, `<RunCompare sim={sim} framePath={top ? framePath : undefined} />`.
- import `useCallStack`·`FrameDetail`·`callPath`·`frameValueAt`.

`styles/debug.ts` 끝에:
```ts
/* 하위 세트 경로 표시(하위 세트 spec §11) */
.rsf-callpath { display: flex; align-items: center; gap: var(--spacing-xs); padding: var(--spacing-xs) var(--spacing-md); border-bottom: 1px solid var(--color-border-light); background: var(--color-bg); }
.rsf-callpath-step { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; }
```
(TS 문자열 상수 안에 넣는다 — 그 파일의 상수 끝 `\`` 앞.)

- [ ] **Step 5: 화면 실패 시험 — `tests/dme/ruleSetEdit/debug-subset.test.ts`**

```ts
/** @vitest-environment happy-dom */
// 하위 세트 spec §11 — 디버거: SET 노드 상세, 안으로 들어가기(같은 캔버스·경로 표시), 돌아오기.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/dme/rule-handoff", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/dme/rule-handoff")>()) }));

import type { RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { byTestId, canvasNodeIds, click, installServer, ok, openSet, q, settle, srv, uninstallServer } from "../helpers/rule-set-page";

const PARENT_FLOW = {
  version: 1,
  nodes: [
    { id: "start", kind: "START", ruleId: null, splitId: null, label: null },
    { id: "s1", kind: "SET", ruleId: null, splitId: null, label: "단가 결정", setId: "CHILD" },
    { id: "end", kind: "END", ruleId: null, splitId: null, label: null },
  ],
  edges: [
    { id: "e1", from: "start", to: "s1", order: null, cond: null, otherwise: false, label: null },
    { id: "e2", from: "s1", to: "end", order: null, cond: null, otherwise: false, label: null },
  ],
  view: { positions: {}, notes: [], groups: [] },
};
const n = (seq: number, nodeId: string, kind: string, extra: Record<string, unknown> = {}) => ({
  seq, nodeId, kind, status: "OK", ruleId: null, ver: null, reads: null, branches: null, chosenEdgeId: null, order: null, splitId: null, merged: null, violations: null, ...extra,
});
const SUB = {
  setId: "CHILD", evalTs: "2026-10-01T09:00:00", input: {},
  nodes: [n(1, "start", "START"), n(2, "r1", "RULE", { ruleId: "C_K", ver: 1, reads: {}, result: { ruleId: "C_K", ver: 1, evalTs: "2026-10-01T09:00:00", hits: [], defaultApplied: true, results: { K: { type: "NUMBER", value: "1" } }, trace: [], warnings: [] } }), n(3, "end", "END")],
  finalValues: { K: { type: "NUMBER", value: "1" } }, violations: null,
};
const EXECUTE = {
  trace: {
    setId: "(저장 전)", evalTs: "2026-10-01T09:00:00", input: {},
    nodes: [n(1, "start", "START"), n(2, "s1", "SET", { reads: {}, outputs: { K: { type: "NUMBER", value: "1" } }, sub: SUB }), n(3, "end", "END")],
    finalValues: { K: { type: "NUMBER", value: "1" } }, violations: null,
  },
  warnings: [],
  calledFlows: { CHILD: { setId: "CHILD", setName: "하위", flow: null, ruleIds: ["C_K"], rules: [] } },
};

function view(): RuleSetView {
  return {
    set: { setId: "PARENT", setName: "부모", description: null, status: "INUSE", rowVersion: 0, ruleIds: [], flow: PARENT_FLOW, branched: false },
    rules: [], checks: [], editable: true, restorable: false, condIo: {}, cases: [],
    calls: { CHILD: { setId: "CHILD", setName: "하위", exists: true, status: "INUSE", inputs: [], outputs: [{ name: "K", dataType: "NUMBER", scale: null, dateString: false, maruCodeId: null, always: true }], endsEarly: false } },
  } as unknown as RuleSetView;
}

describe("디버거 하위 세트", () => {
  beforeEach(installServer);
  afterEach(uninstallServer);

  it("SET 노드 상세에서 들어가면 같은 캔버스가 하위 흐름을 그리고 경로를 누르면 돌아온다", async () => {
    srv.replies.execute = ok(EXECUTE);
    await openSet("PARENT", view(), { tabId: "T1" });
    await click("flow-mode-debug");
    await click("dbg-finish");
    await settle();
    await click("flow-node-s1");
    expect(byTestId("sim-detail-outputs").textContent).toContain("K");
    expect(byTestId("sim-detail-sub-summary").textContent).toBe("하위 세트 끝: 정상 · 받아 처리한 예외 0건");

    await click("sim-detail-enter");
    expect(byTestId("dbg-callpath").textContent).toContain("세트 PARENT › 단가 결정(s1)");
    expect(canvasNodeIds()).toEqual(expect.arrayContaining(["start", "r1", "end"]));
    expect(canvasNodeIds()).not.toContain("s1");
    expect(byTestId("dbg-frame-status").textContent).toBe("3/3");
    expect(q("var-panel")).toBeNull(); // 하위 프레임에서는 값 고치기 패널이 없다

    await click("dbg-callpath-0");
    expect(q("dbg-callpath")).toBeNull();
    expect(canvasNodeIds()).toContain("s1");
  });
});
```
(`dbg-finish`·`var-panel`(변수 패널 루트)의 실제 testid 는 `grep -rn "dbg-finish\|data-testid=\"var-" src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger` 로 맞춘다. 입력 칸이 없는 흐름이라 [끝내기]가 바로 실행된다 — 입력 검사로 막히면 시험 앞에 `srv.replies.validate` 와 입력 JSON 을 채우는 기존 `debug-mode.test.ts` 의 `openDebug` 순서를 따른다.)

Run: `pnpm --dir src/frontend --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/debug-subset.test.ts`
Expected: Step 3·4 전에는 FAIL, 뒤에는 PASS.

- [ ] **Step 6: 통과 확인**

Run(차례로):
```bash
pnpm --dir src/frontend --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/call-stack.test.ts tests/dme/ruleSetEdit/debug-subset.test.ts
pnpm --dir src/frontend --filter @dk-oasis/m-mdm test
rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint
python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit <이 태스크가 바꾼 화면 파일 모두>
python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit <이 태스크가 바꾼 화면 파일 모두>
```
Expected: PASS, 기존 디버거 시험(`debug-mode.test.ts`·`debug-model.test.ts`·`trace-view.test.ts`·`debug-edit.test.ts`) 그대로 초록, tsc 0, audit 0건.

- [ ] **Step 7: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit src/frontend/m-mdm/tests/dme/ruleSetEdit/call-stack.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/debug-subset.test.ts
/usr/bin/git commit -m "feat(m-mdm): 룰 세트 디버거에서 SET 노드 안으로 들어가 하위 기록을 따라간다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- src/frontend/m-mdm/pages/dme/ruleSetEdit src/frontend/m-mdm/tests/dme/ruleSetEdit/call-stack.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/debug-subset.test.ts
```

---

### Task c: cactus 미리 받기 — 하위 세트 재귀(U3)

**담당:** eng:c(eng:2 뒤). **모델:** sonnet — 미리 받기 반복 하나를 넓히고 시험을 더하는 일이다. 스펙 §8.1, C-D17.

**건드릴 곳(2026-10-06 코드 확인):**
- `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmExprRefs.java` — `ruleIds(RuleSetDefinition)` 옆에 `static Set<String> setIds(RuleSetDefinition set)` 를 둔다: 흐름 노드 가운데 `kind == SET` 이고 `setId` 가 비지 않은 것의 `setId`, 처음 나온 순서로 중복 없이. `FlowNode.setId` 는 eng:1 이 더한다.
- `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/MdmValidator.java` 의 `prefetch` — 「룰 세트와 그 룰」 블록. 지금은 `service.lookupAt(RULE_SET, setIds, ts)` 로 요청 세트만 받고 `rulesBySet` 에 그 세트의 `ruleIds` 를 모은다. 이것을 다음처럼 넓힌다.
  - 요청 세트마다 받은 정의에서 `setIds` 를 모아, 아직 받지 않은 하위 세트 ID 를 같은 `ts` 로 `lookupAt(RULE_SET, …)` 한다. 단계마다 한 번 묶어 부르고, 최상위에서 5 단계까지 되풀이한다(엔진 깊이 상한과 같은 값, Global Constraints). 이미 받은 세트 ID 는 다시 받지 않는다(순환이어도 끝난다).
  - 하위 세트의 `ruleIds`·`flowCodes`·`flowMasterAt` 를 그 하위 세트를 부른 **최상위 요청 세트 항목**(`item(RULE_SET, 최상위 ID)`)의 `rulesBySet`·`codesByItem`·`atByItem` 에 더한다. 한 하위 세트를 여러 최상위 세트가 부르면 각자에 더한다.
  - 하위 세트가 `unavailable` 이면 그 하위 세트를 부른 최상위 항목을 `skip(최상위 항목, item(RULE_SET, 하위 ID), …)` 로 검증 불가로 둔다. `missing` 이면 아무것도 빼지 않는다(엔진이 `SET_NOT_FOUND` 로 행 오류를 낸다 — 지금 룰 없음과 같은 처리).
  - 뒤따르는 룰 받기·코드 받기·`MASTER_AT` 받기는 지금 코드 그대로 넓어진 모음을 쓴다.
- 클래스 javadoc 의 순서 설명(§6.2 미리 받기)에 "하위 세트(깊이 5)" 를 더한다.

**시험(`src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/`, `FakeMetaFeed` 로 정의를 준다 — `MdmValidatorTest`·`MdmValidatorVersionedTest` 의 준비 방식을 따른다):**
- 하위·손주 세트를 미리 받는다: 최상위 A → B → C, C 의 룰을 평가 중 캐시 부재 없이 쓴다(검증 불가 없음).
- 순환 A → B → A 에서 미리 받기가 끝난다(엔진은 실행에서 `SET_CALL_CYCLE` 로 행 오류).
- 깊이 5 상한: 6 단계 아래 세트는 받지 않는다.
- 하위 세트의 룰이 `unavailable` 이면 최상위 세트 항목이 `unavailable` 에 들고 그 세트 검사를 건너뛴다.
- 없는 하위 세트는 항목을 빼지 않고, 행 오류(`SET_NOT_FOUND`)가 결과에 남는다.
- 같은 판정 시각: 하위 세트도 요청 `evalTs` 의 버전으로 고른다(`MdmValidatorVersionedTest` 방식).

**확인과 커밋:** `(cd src/backend && ./gradlew :cactus-core:test --console=plain -q)`(프로젝트 경로는 `settings.gradle` 로 확인) 초록. 커밋은 두 소스 파일과 시험 파일만 경로로 지정한다(`feat(cactus): 저장 검증 미리 받기가 하위 룰 세트를 깊이 5 까지 받는다`).

---

### Task 10: 문서·결정 — D-135(C-D1~C-D19)·엔진 계약 문서·기능설계서

> **갱신 메모(2026-10-06 plan:0)** — 담당은 조정 세션(fin)이다. `docs/mdm/decisions.md` 에서 D-135 자리는 비어 있다(D-134 다음이 D-136). 기록은 스펙 2026-10-06 판의 C-D1~C-D19 를 옮긴다 — 아래 형판의 C-D2·C-D3·C-D10·C-D11·V23·I14 는 그 판에 맞춰 고쳤다. 반드시 함께 적을 것: (1) I14 변경 — "폐기는 경로 검사를 돌리지 않고, 지금 이후 유효한 RELEASED 버전이 이 세트를 부르는 폐기하지 않은 세트가 있으면 거부한다", (2) 확정 검사 변경 — `RuleSetConfirmCheck`·`RuleConfirmCheck` 가 연쇄 재검사·호출 그래프로 네 코드를 거부하고 DRAFT 저장은 경고만 한다(U2), (3) cactus 미리 받기 재귀(U3), (4) D-136 위 SET 규칙(C-D19). 병합 커밋은 레인 머지 커밋(eng·srv·ui)으로 적는다. 기능설계서에는 확정 화면 쪽 거부 문구도 더한다.

**모델:** haiku — 정해진 문구를 정해진 자리에 옮겨 적는 일이다.

**Files:**
- Modify: `docs/mdm/decisions.md`(끝에 D-135, append-only)
- Modify: `docs/mdm/engine-contract.md`(§3 spi 흐름 문단, §6 예약 이름 표, §8 결과·기록·오류)
- Modify: `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`(§2 화면 영역, §5.1 버튼, §5.3 캔버스, §5.5 우클릭, §6.2 세트 검사, §11 설계 결정)

**Interfaces:**
- Consumes: 세 레인의 dev 머지 커밋, 레인 기록 문서 `docs/rule-set-subset/progress-<레인>.md` 의 결정·계획 조정.
- Produces: 없음(문서).

- [ ] **Step 1: decisions.md 끝 형식 확인**

Run: `tail -n 30 docs/mdm/decisions.md`
Expected: 마지막 항목이 CATCH 의 `## D-134 (…)` 이고, 항목마다 `- **Phase**:`·`- **Decision needed**:`·`- **Decision made**:`·`- **Rationale**:`·`- **Reversible**:`·`- **Source**:` 여섯 줄이다. 마지막이 D-134 가 아니면 그 다음 번호를 쓰고 이 계획·스펙의 "D-135" 언급을 그 번호로 읽는다(보고에 적는다).

- [ ] **Step 2: D-135 을 끝에 더한다**

**Source** 끝의 커밋은 `/usr/bin/git log --oneline --merges dev` 에서 세 레인(`feat/rule-set-subset-engine`·`-server`·`-ui`) 머지 커밋을 찾아 `레인 <해시>` 로 적는다.
```markdown
## D-135 (2026-10-01T00:00:00Z)
- **Phase**: plan·implement(룰 세트 흐름도 — 하위 세트 호출(SET 노드)·편집 화면 안 세트 탭, 사용자가 방향을 승인하고 세부 판단을 맡김)
- **Decision needed**: 룰 세트에서 다른 룰 세트를 부르는 방법과, 여러 세트를 한 편집 화면 안에서 함께 여는 방법(사용자 요청 "룰 세트에서 또 다른 룰 세트를 호출하게 하려면", "룰세트 편집 안에 여러개의 탭")
- **Decision made**: C-D1 하위 세트는 블랙박스 `SET` 노드(입력은 하위 입력, 출력은 최종 결과만, 이름은 그대로 주고받는다) · C-D2 하위 세트는 판정 시각에 유효한 RELEASED 버전, 폐기 아닌 세트만 · C-D3 `TB_MDM_RULE_SET_VER.CALL_SET_IDS`(버전 행, 서버가 흐름에서 계산), `RULE_IDS` 는 자기 RULE 노드만 · C-D4 겉모양(`SetCallIo`)은 서버만 계산하고 화면은 받아서 검사에 넣는다 · C-D5 출력마다 `always`, 일부 경로 출력은 `maybe`(`FLOW_PARTIAL`) · C-D6 하위 세트의 처리되지 않은 위반은 SET 노드에서 같은 종류로 받고, 받지 않는 코드는 중단 · C-D7 예약 이름 `CATCH_SET` · C-D8 하위 세트의 처리 갈래 끝냄은 opt-in 종류 `SUBSET_ENDED`(받는 노드가 없으면 정상 완료) · C-D9 `caught` 는 `setPath` 를 붙여 최상위까지 이어 붙이고 `endedBy` 는 자기 세트만 · C-D10 순환·깊이 5 초과는 확정·되살리기 때 거부, DRAFT 저장 때 경고(`CALL_CYCLE`·`CALL_DEPTH`), 실행 때 `SET_CALL_CYCLE`·`SET_CALL_DEPTH` · C-D11 겉모양이 바뀌는 확정(세트·룰, 기준 apply_from)은 부르는 세트를 연쇄 재검사해 새 거부는 막고(`CALLER_BROKEN`·`SET_CALLER_BROKEN`) DRAFT 저장은 경고만 하며 새 경고는 알린다(`CALLER_WARN`) — 2026-10-06 사용자 결정 U2 · C-D12 부르는 INUSE 세트가 있으면 폐기 거부 · C-D13 편집 화면 안 세트 탭(최대 8), SET 링크는 같은 화면의 새 탭 · C-D14 탭마다 세트 상태·되돌리기·디버거를 따로, 보는 사람 설정은 함께 · C-D15 디버거 "안으로 들어가기"는 같은 캔버스에서 경로 표시로 오가고 탭을 열지 않는다 · C-D16 흐름 `version` 1 유지 · C-D17 cactus 저장 검증 미리 받기가 하위 세트를 깊이 5 까지 재귀로 받는다(U3) · C-D18 디버거 경고 "확정하지 않은 변경, 실행은 판정 시각의 RELEASED" · C-D19 SET 은 D-136 모델의 단계(들어오는 선 1 이상, 처리 갈래는 돌아오는 자리로, `catchable` RULE·TASK·SET, 하위 세트의 끝내는 IF 갈래 끝은 부모에 정상 완료). 구현 편차(계획 `docs/superpowers/plans/2026-10-01-rule-set-flow-subset-call.md`): 새 조회는 action 이 아니라 `search` 의 `target` `CALL_IO`·`CALLERS`(ADR-0003 권한 어휘), 룰 쪽 거부는 확정 검사(`RuleConfirmChecks`)가, 룰 DRAFT 저장은 경고만, V23 은 VER 표만 `_BAK` 방식으로 다시 만든다, 분석기는 `CALL_MISSING` 을 WARN 으로 내고 확정·되살리기가 네 코드를 거부로 본다, 하위 세트는 준비 단계에서 읽고 판정한다(룰 없음과 같은 시점), 엔진은 실행용 겉모양 `SetShape` 을 같은 알고리즘으로 스스로 계산한다, 하위 세트 입력에서 `CATCH_*` 다섯 이름을 뺀다, `SetCallIo` 에 `setName`·`endsEarly` 를 더한다, 세트 탭 틀은 shared 새 컴포넌트(숨은 패널 `display:none`)다, I14 가 "폐기는 경로 검사를 하지 않고, 지금 이후 유효한 RELEASED 버전이 이 세트를 부르는 폐기하지 않은 세트가 있으면 거부한다" 로 바뀐다.
- **Rationale**: 분석기가 SET 을 RULE 처럼 보면 기존 경로 검사가 그대로 돈다. 중간 결과를 숨기면 이름 충돌이 줄어든다. 실행이 저장된 하위 세트를 쓰므로 하위 세트 수정이 부모 동작을 즉시 바꾼다 — 그래서 저장 때 부모를 다시 검사한다. 같은 화면 안 탭이라 저장 알림으로 부모 탭 검사를 바로 갱신할 수 있다. ADR-0005 의 원칙(엔진이 흐름을 실행하고 DB 를 부르지 않음, 흐름 안에 저장·외부 호출 노드 없음)은 그대로 유효하다 — SET 노드는 판정 흐름을 부르는 것이고 하위 세트도 `DefinitionLookup.ruleSet` 으로 받는다.
- **Reversible**: no(흐름 JSON 에 SET 노드, 버전 행에 CALL_SET_IDS 가 저장된다)
- **Source**: 스펙 `docs/superpowers/specs/2026-10-01-rule-set-flow-subset-call-design.md` §13, 계획 편차·Ruling, 사용자 요청. 영향: 엔진 계약(`NodeKind.SET`·`FlowNode.setId`·`CatchKind.SUBSET_ENDED`·오류 코드 둘·`Violation.setPath`·`RuleSetResult.calls`·`PathStep.callIndex`·`CaughtException.setPath`·`NodeTrace.outputs`/`sub`·`CATCH_SET`), DB V23, `ruleSetEdit` search target 둘·view `calls`·execute `calledFlows`, 세트·룰 확정 검사와 DRAFT 저장 경고, cactus 미리 받기, 화면 탭(shared 새 컴포넌트)·SET 노드·디버거. 병합 커밋: (eng·srv·ui 레인 머지 해시)
```

- [ ] **Step 3: 엔진 계약 문서**

`docs/mdm/engine-contract.md`:
- §3 의 "**룰 세트 흐름(2026-09-30 …)**" 문단 끝에 다음 문장을 잇는다: ` 하위 세트 호출(2026-10-01, D-135): 노드 종류 SET 은 FlowNode 의 setId(부르는 세트 ID)만 쓰고, 구조에서는 RULE 과 같다(들어오는 선 1·나가는 선 1). 하위 세트도 DefinitionLookup.ruleSet 으로 받는다 — 엔진은 DB 를 부르지 않는다.`
- §6 예약 이름 표 끝에 한 줄:
```markdown
| `CATCH_SET` | 처리 갈래 안에서만 ctx 에 있다 — 위반이 난 가장 안쪽 세트 ID. 레코드 키로 오면 판정 오류이고 하위 세트 입력으로 넘기지 않는다(`CATCH_*` 다섯 이름 모두) | `RESERVED_KEY` | 하위 세트 spec §4.1, D-135 |
```
- §8 의 "**룰 세트 결과 …**" 문단 끝에 다음 문단을 잇는다:
```markdown
**하위 세트 호출(D-135)**: `RuleSetResult` 끝에 `calls`(실행한 SET 노드마다 `SetCall(nodeId, setId, result)`, 실행 순서 — `result` 는 하위 세트의 `RuleSetResult` 전체)가 더해지고, `PathStep` 끝에 `callIndex`(SET 결과가 `calls` 의 몇 번째인지, 그 밖은 null)가 더해진다. `steps` 는 이 세트의 RULE 결과만 담는다. SET 노드는 부모 ctx 사본(예약 이름 `CATCH_*` 다섯은 뺀다)을 입력으로 하위 세트를 같은 평가 시각으로 실행하고, 하위 세트의 최종 결과 가운데 하위 finalValues 에 키가 있는 이름만 부모 ctx 에 덮어쓴다(값이 NULL 이어도). 하위 세트는 준비 단계에서 SET 노드마다 재귀로 읽고 없음 `SET_NOT_FOUND`·폐기 `SET_DEPRECATED`·순환 `SET_CALL_CYCLE`·최상위에서 5 단계 초과 `SET_CALL_DEPTH` 를 `SET_CHECK` 단계로 낸다(모두 받지 않는 코드). 부모의 입력 키 사전 검사에는 반드시 실행되는 SET 노드의 반드시 읽는 하위 입력이 든다(`INPUT_ERROR` 를 받는 SET 은 뺀다). 하위 세트의 처리되지 않은 위반은 `Violation.setPath`(최상위에서 위반 세트까지 거친 SET 노드 ID, 이 세트에서 났으면 빈 목록 — JSON 에서는 키를 뺀다)를 붙여 올라오고, SET 노드에 붙은 받는 노드가 CATCH 종류 표로 받을 수 있다. 하위 세트가 자기 처리 갈래로 끝나면(`endedBy`) 부모는 `SUBSET_ENDED` 를 받는 노드가 있을 때만 예외로 보고, 없으면 정상 완료다. `caught` 는 하위의 것을 `setPath` 를 붙여 이어 붙인다. 실행 기록의 SET 노드는 `reads`(부모 ctx 의 하위 입력 값)·`outputs`(넘겨받은 이름 → 값)·`sub`(하위 세트의 `RunTrace`)를 채우고, 없으면 JSON 에서 키를 뺀다.
```
- §8 의 "코드(`Code`) 14종" 문장을 실제 목록으로 고친다 — `EngineEvaluationException.Code` 를 그대로 옮겨(지금 `EDIT_POINT_MISMATCH`·`SET_CALL_CYCLE`·`SET_CALL_DEPTH` 를 포함한 수) "코드(`Code`) N종" 과 끝에 `` `EDIT_POINT_MISMATCH`(디버거 고친 값 자리 어긋남), `SET_CALL_CYCLE`(세트 호출 순환), `SET_CALL_DEPTH`(세트 호출 5 단계 초과) `` 를 잇는다. CATCH 가 더한 종류 표(`CatchKind`) 설명에 `SUBSET_ENDED`(하위 세트 예외 끝 — SET 노드 받는 노드만, 오류 코드와 짝이 없다) 를 더한다.

- [ ] **Step 4: 기능설계서**

`docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md` 의 각 절에 다음 행·문단을 더한다. 행 번호는 그 절 표의 마지막 번호 다음 번호다. 각 행 끝에 `(D-135)` 을 단다.
- §2 화면 영역: 영역 표에 `A-TABS | 세트 탭 머리(set-tabs) — 열린 세트마다 탭(세트 ID, 이름은 툴팁, 저장 안 한 변경 ●, 닫기 ×, 마지막 탭은 닫기 없음), 최대 8개 | (D-135)` 을 위 바(A-TOP) 다음에.
- §5.1 버튼: `도구 상자 「룰 세트」(flow-add-set) | 편집 모드 | 세트 검색 팝업(INUSE, 지금 세트 제외)을 열고 고른 세트를 고른 선(없으면 END 앞 선)에 SET 노드로 끼운다`, `SET 노드 링크(flow-set-open-{id})·속성 패널 「세트 탭으로 열기」(flow-prop-set-open) | 늘 | 그 세트가 열린 탭으로, 없으면 지금 탭 오른쪽 새 탭`, `탭 닫기(set-tab-close-{key}) | 탭이 둘 이상 | 저장 안 한 변경이 있으면 "저장하지 않은 변경이 있다. 닫으면 변경을 버린다." 확인`, `디버그 SET 노드 상세 「안으로 들어가기」(sim-detail-enter) | 디버그 모드·실행된 SET | 같은 캔버스가 하위 흐름을 읽기 전용으로 그리고 경로 표시(dbg-callpath)가 뜬다. 경로의 앞 단계를 누르면 돌아온다`.
- §5.3 캔버스: SET 노드 모양(룰과 같은 크기, 굵은 테두리, 제목은 라벨·세트명·세트 ID 순, "룰 세트 {ID}" 줄, 입력·출력 개수 칩), SET 노드 뒤 선의 변수 칩은 하위 세트 출력, 받는 노드는 RULE·SET 에 붙는다(SET 은 `SUBSET_ENDED` 를 고를 수 있고 `NO_RESULT` 는 없다), 외관 옵션은 SET 에 없다.
- §5.5 우클릭: SET 노드 「세트 열기」·「복사」·「복제」·「삭제」, 선 「룰 세트 넣기」.
- §6.2 세트 검사 표: `CALL_MISSING`(거부, 화면·서버 — 문구 Ruling 8), `CALL_CYCLE`·`CALL_DEPTH`·`CALLER_BROKEN`(거부, 서버만 — 저장 응답), `CALLER_WARN`(경고, 서버만 — 저장 결과), `FLOW_CATCH` 의 SET 규칙과 `CATCH_NEVER`(SUBSET_ENDED) 문구(Ruling 9), `EMPTY` 는 RULE·TASK·SET 노드가 하나도 없을 때. 세트 검사 문구에서 하위 세트는 `세트 {ID}` 로 보인다.
- §11 설계 결정: `D-135 하위 세트 호출·세트 탭 — 스펙 2026-10-01-rule-set-flow-subset-call-design.md §13(2026-10-06 판), 계획 편차 1~13` 한 줄.

- [ ] **Step 5: 확인과 커밋**

Run: `grep -n "D-135" docs/mdm/decisions.md docs/mdm/engine-contract.md docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`
Expected: 세 파일 모두에 나온다.

```bash
/usr/bin/git add docs/mdm/decisions.md docs/mdm/engine-contract.md docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md
/usr/bin/git commit -m "docs(mdm): 하위 세트 호출·세트 탭 결정 D-135 과 엔진 계약·기능설계서를 갱신한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- docs/mdm/decisions.md docs/mdm/engine-contract.md docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md
```

---

## 최종 검증(조정 세션)

세 레인 머지 뒤 dev 에서 조정 세션이 한 번 돌린다(공통 환경 뒤). cactus-core 시험도 함께 돌린다.
```bash
(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)
(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)
(cd src/backend/mdm && ../gradlew :api:test --console=plain -q)
pnpm --dir src/frontend --filter @dk-oasis/m-mdm test
rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint
grep -rn "SEAM(T4)\|SEAM(T5)\|SEAM(T6)\|SEAM(T8)\|SEAM(T9)" src/backend src/frontend/m-mdm/pages
pnpm --dir src/frontend exec playwright test e2e/mdm-ruleSetEdit.spec.ts --list
```
Expected: 모두 초록, 기준선 대비 늘어난 시험 수를 조정 기록에 적는다. `SEAM(T…)` 0건. e2e 목록에 E1~E16. 마지막으로 `superpowers:requesting-code-review` 로 브랜치 전체 리뷰를 받는다(Review Focus 다섯 줄을 리뷰어에게 넘긴다).

## 수동 브라우저 확인(조정 세션, 사용자 승인 뒤)

로컬 기동·브라우저 확인은 조정 세션만, 사용자 승인 뒤에만 한다(Local-Rules §4). 브라우저 도구는 PC 설정(CLAUDE.md)을 따른다. 로컬 샘플(`mdm-local-sample.sql`)의 `SHIP_PLAN` 으로 본다.
1. 룰 세트 편집에서 `SHIP_PLAN` 을 연다 — SET 노드 둘(출하 중량·포장 방식)에 입력·출력 칩이 보이고 검사에 거부가 없다.
2. SET 노드 링크 → `PKG_WGT` 가 같은 화면의 새 탭으로 열린다. 탭 머리·닫기·● 표시, 숨은 탭에서 ⌘Z 가 지금 탭에만 듣는지 본다.
3. 디버그 모드에서 `SHIP_PLAN` 을 실행하고 SET 노드 상세 → [안으로 들어가기] → 하위 흐름·경로 표시 → 앞 단계 눌러 돌아오기.
4. 탭 패널이 화면 높이를 채우는지(분할 막대가 끝까지 끌리는지) 본다 — `.rsf-set-tab-panel` 의 flex 설정이 PageLayout 안에서 맞는지 확인하는 항목이다.
5. e2e `mdm-ruleSetEdit.spec.ts` 실행(E16 포함)은 사용자가 승인하면 그 스펙 머리의 「E2E 서버 절차」대로 새 DB 로 돌린다.

---

## 자체 점검(계획 작성자)

> 2026-10-01 작성 당시의 점검 기록이다. 스펙 대응 표만 2026-10-06 에 고쳤고, 2·3·4 의 이름(`CallStep` 등)은 Task 0 대조표로 읽는다.

**1. 스펙 대응**

| 스펙 | 태스크 |
|---|---|
| §1 노드·저장 형식(`kind`·`setId`·`attachTo`·`splitId`·`version`) | 1(계약·코덱), 2(구조), 8(편집 연산) |
| §1.1 DB `CALL_SET_IDS`·V23·엔티티·쓰기·새 버전 복사·테스트·샘플 | 3, 6(저장 때 계산) |
| §2 겉모양 `SetCallIo`(inputs·outputs·always·손주) | 5(서버), 4(엔진 `SetShape`, 편차 8), 6(조회기) |
| §3 실행 의미·입력 사전 검사·결정적 실행 | 4 |
| §3.1 운영 결과 `calls`·`callIndex`·`finalValues` | 1, 4, 6(Runner) |
| §3.2 실행 기록 `sub`·`reads`·`outputs` | 1, 4 |
| §3.3 순환·깊이 | 4(실행), 6(저장 `RuleSetCallGraph`) |
| §4.1 하위 위반·`CATCH_SET`·`setPath`·`RuleErrorText` | 1, 4, 6(문구) |
| §4.2 `SUBSET_ENDED` | 1, 4, 5(검사), 8(화면) |
| §4.3 `caught`·`endedBy` 전달 | 4, 6(OASIS `caught.setPath`) |
| §5 정적 검사(SET 을 RULE 처럼, always=false, CALL_*·FLOW_CATCH·CATCH_NEVER) | 5, 6 |
| §6.1 세트 확정 연쇄 재검사 | 6 |
| §6.2 세트 DRAFT 저장 경고 | 6 |
| §6.3 폐기 거부·되살리기 | 6 |
| §6.4 룰 확정·저장 `SetCallerRecheck` | 6 |
| §8.1 cactus 미리 받기 | c |
| §7 엔진 계약 네 벌 | 1, 10(문서) |
| §8 서버·OASIS(`calls` 요약·조회기 캐시·조회 둘·view·simulate) | 6 |
| §9 편집기 SET 노드(놓기·모양·링크·속성 패널·받는 노드·칩) | 8 |
| §10 세트 탭(구조·나누기·열기·닫기·연동) | 7, 8 |
| §11 디버거 | 9 |
| §12 테스트(엔진·서버·코퍼스·화면·e2e) | 4, 5, 6, 7, 8, 9 |
| §13 결정 D-135(C-D1~C-D19) | 10 |
| §14 미루는 것 | 다루지 않는다(하위 기록 안 E4 는 Task 9 가 끈다) |

**2. 자리 표시 점검**: "TBD·나중에·적절히" 같은 빈 지시가 없는지 훑었다. CATCH 계획 문서(`2026-10-01-rule-set-flow-catch.md`)가 생긴 뒤 그 Produces 이름과 대조해 코드 블록에 직접 썼다(`CatchKind` 는 `flow` 패키지·코드 목록 생성자, `CATCH_NAMES` 는 CATCH 가 넷으로 만든 것을 다섯으로, `catchable`·`CATCHABLE`·`CATCH_KINDS`, `catchNode(id, attachTo, kinds...)`, R20 다음 R21). 남은 "Task 0 장부" 언급은 CATCH 구현이 계획과 다르게 병합됐을 때의 대비다. `<이 태스크가 바꾼 화면 파일 모두>` 는 `git status` 로 모으는 목록이다(파일 목록 자체가 태스크 Files 에 있다).

**3. 이름 일관성**: `SetCallIo(setId, setName, exists, status, inputs, outputs, endsEarly)`·`RuleSetInterface.of(setId, setName, exists, status, flow, rules, calls)`·`SetShape(inputs, mustInputs, outputs, always)`·`PreparedSet`·`CallStep`/`SetStep`·`FlowTree.setSteps/setIds/callSteps`·`RuleSetCallGraph.MAX_DEPTH = SetShape.MAX_CALL_DEPTH = 5`·`SetCallerRecheck.Outcome(rejects, warnedCallers)`·TS `setKey`/`isSetKey`/`setIdOfKey`·`flowSetIds`·`CallFrame`·`useCallStack` 을 태스크 사이에서 같은 이름·인자 순서로 썼다.

**4. Review Focus**: 다섯 줄 모두 담당 태스크에 시험이 있다 — 1 `SubsetShapeTest`·`SubsetCallTest`·`SetCallIoEngineAgreementTest`, 2 `SubsetCallTest`, 3 `SubsetCatchTest`, 4 `SubsetCycleDepthTest`·`RuleSetCallGraphTest`, 5 `RuleSetSubsetServiceTest`·`RuleSetCallerCheckTest`.
