# 룰 세트 흐름도 — 예외 받는 노드(CATCH)

- 날짜: 2026-10-01
- 앞 문서: `2026-09-29-rule-set-flow-design.md`(흐름 모델 §3·실행 의미 §4·검사 §5), `2026-10-01-rule-set-flow-phase4-design.md`(TASK·E4 값 고치기)
- 뒤 문서: `2026-10-01-rule-set-flow-subset-call-design.md`(하위 세트 호출 — 이 문서의 받는 노드를 `SET` 노드에도 붙인다)
- 엔진: `src/backend/maru-mdm-engine`(`spi/DefinitionLookup`·`flow/*`·`rule/MdmRuleEngine`·`rule/RunTrace`·`expr/ReservedNames`)
- 서버: `src/backend/mdm/lib`(`common/rule/RuleSetAnalyzer`·`RuleSetRunner`·`check/ledger/RuleSetOrderCheck`)
- 화면: `src/frontend/m-mdm/pages/dme/ruleSetEdit/`(`flow-model.ts`·`set-model.ts`·캔버스·디버거)

## 0. 범위와 사용자 요청

| ID | 기능 | 사용자 요청(원문) |
|---|---|---|
| X1 | 룰에서 난 exception 을 받는 노드 | "룰에 대한 exception이 없어 exception 노드가 필요해." "받는 노드가 있어야 하잖아. 룰세트에서 오류가 발생했을때 처리를 해줘야 할 것 같아." |
| X2 | 받은 뒤 끝으로 가거나 다른 처리 | "예를 들어 처리 결과가 없으면 끝으로 가던지 아니면 다른 처리를 하게 하던지" |

지금은 룰 하나가 실패하면 세트 전체가 `EngineEvaluationException` 으로 중단되고, 결과가 없으면(맞는 행도 기본 행도 없음) 결과 변수가 조용히 NULL 이 된 채 다음 룰로 간다. 작성자가 흐름 안에서 이 두 경우를 처리할 방법이 없다.

이 문서는 룰 노드에 붙는 **받는 노드 `CATCH`** 를 더한다. Camunda 의 Boundary Error Event 와 같은 구조다. 받는 노드 뒤 처리 갈래는 끝(END)으로 가거나 원래 흐름으로 돌아온다.

제외(§12): IF 조건식 오류 받기, 여러 룰을 묶는 구간(TRY) 받기, 세트 전체 처리기, 작성자가 거부를 내는 THROW 노드, 하위 세트 호출(뒤 문서).

## 1. 받는 exception 종류

받는 노드마다 아래 종류 가운데 받을 것을 고른다(`catches`, 하나 이상).

| 종류 키 | 화면 이름 | 언제 생기나 | 해당 오류 코드 |
|---|---|---|---|
| `NO_RESULT` | 결과 없음 | 룰 결과의 `hits` 가 비고 `defaultApplied=false` | — (엔진이 `CATCH_CODE` 에 `NO_RESULT` 를 넣는다) |
| `INPUT_ERROR` | 입력 오류 | 그 룰의 입력 키 검사·조건 검사에서 어긋남 | `MISSING_KEY`, `REQUIRED_NULL`, `TYPE_CONVERSION` |
| `EVAL_ERROR` | 계산 오류 | 식 평가 실패(MASTER 조회 실패, 0으로 나누기 등) | `EVALUATION_ERROR` |
| `HIT_CONFLICT` | 판정 충돌 | UNIQUE 둘 이상 적중, ANY 결과 어긋남 | `UNIQUE_MULTIPLE_HITS`, `ANY_CONFLICT` |

- **받지 않는 코드**: `RULE_NOT_FOUND`, `SET_NOT_FOUND`, `SET_DEPRECATED`, `FLOW_INVALID`, `CONSTANT_KEY`, `RESERVED_KEY`, `EVAL_TS_KEY`, `BRANCH_EVAL_ERROR`, `EDIT_POINT_MISMATCH`. 정의·설정이 잘못됐다는 뜻이라 흐름 안에서 처리하면 실수가 감춰진다. 지금처럼 세트를 중단한다(`BRANCH_EVAL_ERROR` 는 §12 로 미룬다).
- **결과 없음은 받는 노드가 있을 때만 exception 이다.** 그 룰에 `NO_RESULT` 를 받는 노드가 없으면 지금처럼 결과가 NULL 인 채로 다음 노드로 간다. 그래서 기존 세트의 동작은 바뀌지 않는다.
- 한 번에 여러 위반이 모이면(같은 단계에서 모아 던지는 기존 규칙) **첫 위반**의 코드로 종류를 정한다. 같은 단계의 위반은 늘 같은 종류이므로 실제로 갈리지 않는다.

## 2. 저장 형식

`FLOW_JSON` 의 `nodes` 에 `CATCH` 노드를 더한다. 룰과 받는 노드는 **선이 아니라 `attachTo` 로 잇는다**(BPMN `attachedToRef` 와 같음). 그래서 RULE 의 들고 나는 선 수 규칙(1·1)은 바뀌지 않는다.

```json
{
  "version": 1,
  "nodes": [
    { "id": "start", "type": "START" },
    { "id": "r1", "type": "RULE", "ruleId": "QD_R_PRICE" },
    { "id": "c1", "type": "CATCH", "attachTo": "r1", "catches": ["NO_RESULT"], "label": "단가 없음" },
    { "id": "r9", "type": "RULE", "ruleId": "QD_R_PRICE_DEFAULT" },
    { "id": "c2", "type": "CATCH", "attachTo": "r1", "catches": ["INPUT_ERROR", "EVAL_ERROR"], "label": "판정 불가" },
    { "id": "m1", "type": "MERGE", "splitId": "r1" },
    { "id": "r2", "type": "RULE", "ruleId": "QD_R_AMOUNT" },
    { "id": "end", "type": "END" }
  ],
  "edges": [
    { "id": "e1", "from": "start", "to": "r1" },
    { "id": "e2", "from": "r1", "to": "m1" },
    { "id": "e3", "from": "c1", "to": "r9" },
    { "id": "e4", "from": "r9", "to": "m1" },
    { "id": "e5", "from": "c2", "to": "end" },
    { "id": "e6", "from": "m1", "to": "r2" },
    { "id": "e7", "from": "r2", "to": "end" }
  ]
}
```

- `attachTo`: 받는 노드가 붙은 RULE 노드 ID. `catches`: §1 종류 키 목록(중복 없음, 정해진 순서 `NO_RESULT`·`INPUT_ERROR`·`EVAL_ERROR`·`HIT_CONFLICT` 로 저장). `label`: 화면 표시용.
- 처리 갈래가 원래 흐름으로 돌아오면, 돌아오는 MERGE 의 `splitId` 는 **그 RULE 노드 ID** 다(위 `m1`). 지금 `splitId` 는 IF·PARALLEL 만 가리키는데, 받는 노드가 있는 RULE 도 가리킬 수 있게 넓힌다.
- `version` 은 1 그대로 둔다. 4단계에서 `TASK` 를 더할 때도 올리지 않았다(D-125). 읽는 쪽이 엔진·화면 한 벌씩뿐이고 함께 배포되므로, 형식 버전으로 갈라 읽을 대상이 없다.
- Java `FlowNode` 에 `attachTo`·`catches`(둘 다 CATCH 만 씀)를 더하고 `NodeKind` 에 `CATCH` 를 더한다. 기존 생성자는 두 칸을 null 로 위임해 호출부를 깨지 않는다.

## 3. 구조 규칙

1단계 스펙 §3.2 의 중첩 블록 규칙을 다음처럼 넓힌다.

- **CATCH 노드**: 들어오는 선 0, 나가는 선 정확히 1. `attachTo` 는 RULE 이어야 한다(TASK·IF·PARALLEL·MERGE·START·END 에는 붙일 수 없다). 뒤 문서(하위 세트 호출)가 `attachTo` 를 `SET` 노드로 넓히고, 예약 이름 `CATCH_SET` 과 종류 `SUBSET_ENDED` 를 더한다.
- **한 RULE 에 받는 노드 여러 개**를 붙일 수 있다. 같은 종류를 두 노드가 함께 받을 수는 없다.
- **처리 갈래**는 CATCH 에서 나가는 선부터 시작하는 순차 블록이다. 안에 RULE·TASK·IF·PARALLEL 을 평소처럼 둘 수 있고, 처리 갈래 안의 RULE 에 다시 받는 노드를 붙일 수도 있다.
- **처리 갈래의 끝**은 둘 중 하나다.
  - **돌아옴**: 그 RULE 을 `splitId` 로 가리키는 MERGE 에 닿는다.
  - **끝냄**: END 에 닿는다. 처리 갈래의 **맨 바깥 순차**에서만 END 로 갈 수 있다. 처리 갈래 안의 IF·PARALLEL 갈래는 평소처럼 자기 합류로 닫혀야 한다.
- **RULE 의 정상 갈래**: 처리 갈래 가운데 하나라도 돌아오면, RULE 의 나가는 선부터 그 MERGE 까지가 정상 갈래다. 정상 갈래에도 노드를 둘 수 있다(비어도 됨). 돌아오는 처리 갈래가 없으면 MERGE 를 두지 않고, RULE 의 나가는 선은 평소처럼 이어진다.
- **END 로 들어오는 선**: 처리 갈래가 아닌 경로에서 오는 선은 정확히 1개, 처리 갈래에서 오는 선은 몇 개든 된다.
- 처리 갈래에서 다른 갈래로 건너가거나 RULE 앞으로 되돌아가는 선은 지금처럼 `FLOW_STRUCTURE` 오류다.
- 블록 트리에 **`Guarded` 블록**을 더한다. `Guarded(rule, normal: Seq, handlers: List<Handler(catchNodeId, kinds, body: Seq, ends: boolean)>, mergeId)`. 돌아오는 처리 갈래가 없으면 `normal` 이 비고 `mergeId` 가 null 이다. Java `flow` 패키지와 `flow-model.ts` 가 같은 모양을 갖는다.

## 4. 실행 의미

| 상황 | 실행 |
|---|---|
| RULE 이 성공하고 결과가 있음 | 지금과 같다. 결과를 `ctx` 에 덮어쓰고 정상 갈래로 간다 |
| RULE 이 실패했거나 결과가 없는데, 그 종류를 받는 노드가 있음 | 그 RULE 의 결과는 `ctx` 에 쓰지 않는다. `ctx` 에 `CATCH_*` 네 값을 넣고 그 받는 노드의 처리 갈래를 실행한다 |
| 받는 노드가 없음 | 지금과 같다. 실패는 세트 중단, 결과 없음은 NULL 결과로 진행 |

- **처리 갈래가 읽는 값**: 그 RULE 직전의 `ctx` 와 다음 네 값.

| 이름 | 값 |
|---|---|
| `CATCH_KIND` | §1 종류 키(문자열) |
| `CATCH_RULE` | 실패한 룰 ID(`ruleId`, 노드 ID 아님) |
| `CATCH_CODE` | 첫 위반 코드. 결과 없음이면 `NO_RESULT` |
| `CATCH_MSG` | 첫 위반의 `Violation.message`. 결과 없음이면 `"맞는 행과 기본 행이 없다"` |

- `CATCH_*` 네 값은 처리 갈래 안에서만 있다. 돌아오는 MERGE 나 END 에 닿으면 `ctx` 에서 뺀다. `finalValues` 에도 넣지 않는다.
- **돌아옴**: MERGE 뒤는 IF 합류와 같다. 실제로 탄 갈래(정상 또는 처리)의 `ctx` 를 그대로 이어 간다.
- **끝냄**: 처리 갈래가 END 에 닿으면 세트를 끝낸다. `RuleSetResult.endedBy` 에 그 CATCH 노드 ID 를 넣는다.
  - 병렬 갈래 안에서 끝내면 남은 형제 갈래는 실행하지 않는다. `finalValues` 는 분기 직전 `ctx` + 이미 끝난 형제 갈래의 결과(합류 규칙대로 order 순) + 지금 갈래의 `ctx` 다.
- **입력 키 사전 검사**: `INPUT_ERROR` 를 받는 노드가 붙은 RULE 의 입력 이름은 세트 시작·IF 갈래 진입 때의 사전 검사에서 뺀다. 그 RULE 을 실행하기 직전에 검사해, 없으면 그 받는 노드로 간다. 사전 검사에 남겨 두면 RULE 에 닿기 전에 세트 단위 `MISSING_KEY` 로 중단되어 받는 노드가 쓸모없어진다. 같은 이름을 받는 노드 없는 다른 룰도 반드시 읽으면 그 이름은 사전 검사에 남는다.
- **결정적 실행**은 그대로다. 받는 노드 선택은 RULE 결과와 고정된 종류 표로만 정해진다.

## 5. 정적 검사

서버 `RuleSetAnalyzer`·`FlowParser` 와 화면 `set-model.ts`·`flow-model.ts` 를 함께 고치고, `rule-set-corpus.json` 에 사례를 더한다.

| 코드 | 수준 | 내용 |
|---|---|---|
| `FLOW_STRUCTURE` | 오류 | §3 위반. 받는 노드에서 나가는 선이 1개가 아님, 처리 갈래가 MERGE·END 가 아닌 곳에서 끝남, 처리 갈래 안 IF·PARALLEL 갈래에서 END 로 감, 돌아오는 MERGE 의 `splitId` 가 그 RULE 이 아님, 정상 갈래가 그 MERGE 에 닿지 않음, END 로 들어오는 비처리 선이 1개가 아님 |
| `FLOW_CATCH` | 오류 | `attachTo` 가 없거나 RULE 이 아님, `catches` 가 비었거나 모르는 키, 한 RULE 에서 같은 종류를 두 받는 노드가 받음 |
| `CATCH_NEVER` | 경고 | 그 종류가 그 룰에서 일어날 수 없음. `NO_RESULT` 인데 룰에 기본 행이 있음, `HIT_CONFLICT` 인데 적중 정책이 UNIQUE·ANY 가 아님 |

- **정의된 변수**(1단계 스펙 §5 의 경로 기준)
  - 처리 갈래 시작: RULE 직전에 정의된 변수 + `CATCH_*` 네 이름. 실패한 RULE 의 결과는 정의되지 않은 것으로 본다.
  - 돌아오는 MERGE 뒤: 정상 갈래 끝과 **돌아오는** 처리 갈래 끝에서 모두 정의된 변수(교집합). 끝내는 처리 갈래는 세지 않는다. 처리 갈래가 실패한 룰의 결과 변수를 채우지 않으면 그 변수를 뒤에서 읽을 때 `FLOW_PARTIAL` 경고다.
  - `SET_DUP_RESULT`: 정상 갈래와 처리 갈래는 서로 다른 경로다. 처리 갈래가 실패한 룰과 같은 결과 변수를 쓰는 것은 정상이다(IF 의 다른 갈래와 같음).
  - 처리 갈래 밖에서 `CATCH_*` 를 읽으면 `FLOW_COND`(조건식) 또는 `SET_ORDER`(룰 조건) 오류다.
- `CATCH_NEVER` 에 쓰는 룰 입출력(`RuleIo`)에는 `hitPolicy` 가 이미 있다(`RuleIoReader.java:225`). 기본 행이 있는지를 나타내는 `hasDefault` 만 서버 `RuleIo`·화면 타입·코퍼스에 더한다.
- `RULE_IDS` 펼치기(1단계 스펙 §3.3)에 처리 갈래 안 룰도 깊이 우선 순서로 넣는다. 정상 갈래를 먼저, 처리 갈래는 받는 노드 순서(노드 배열 순)로 넣는다.

## 6. 엔진 계약 변경

계약 네 벌(`docs/mdm/engine-contract.md`, 엔진 스키마, 엔진 Java, `m-mdm/src/contract/engine-contract.generated.ts`)과 코퍼스를 한 번에 고친다.

| 대상 | 변경 |
|---|---|
| `DefinitionLookup.NodeKind` | `CATCH` 추가 |
| `DefinitionLookup.FlowNode` | `attachTo`, `catches` 추가(CATCH 만 씀) |
| `CatchKind`(새 enum) | `NO_RESULT`, `INPUT_ERROR`, `EVAL_ERROR`, `HIT_CONFLICT`. 코드 → 종류 표(§1)를 엔진에 한 곳으로 둔다 |
| `RuleSetResult` | `caught`(받아서 처리한 exception 목록 `CaughtException(ruleNodeId, ruleId, catchNodeId, kind, code, message)`, 실행 순서)와 `endedBy`(처리 갈래로 끝났으면 CATCH 노드 ID, 아니면 null) 추가 |
| `PathStep` | CATCH 노드도 담는다. 실패한 RULE 의 `stepIndex` 는 null 이다(결과를 `steps` 에 넣지 않음) |
| `RunTrace.NodeStatus` | `CAUGHT` 추가. 받는 노드로 넘긴 RULE 노드의 상태다(처리되지 않은 실패는 지금처럼 `ERROR`) |
| `NodeTrace` | CAUGHT 인 RULE 은 `violations`(결과 없음이면 빈 목록)를 담는다. CATCH 노드 기록은 `catchKind`·`code`·`message` 를 새 칸으로 담고 `status=OK` 다 |
| `RunTrace` | `endedBy` 추가(`RuleSetResult` 와 같은 뜻) |
| `ReservedNames` | `CATCH_KIND`·`CATCH_RULE`·`CATCH_CODE`·`CATCH_MSG` 네 이름 추가. 레코드 키로 오면 `RESERVED_KEY` 다. 2026-10-01 로컬 `mdm.db` 의 룰 변수·컬럼 사전에 `CATCH` 로 시작하는 이름은 없다(`EXC_SPD` 가 있어 `EXC_*` 는 쓰지 않음) |

## 7. 서버·OASIS

- `RuleSetRunner.run` 은 `RuleSetResult` 를 그대로 돌려준다. `execute`(OASIS serviceTask 용 DTO)의 `RuleSetRunResult` 에 `endedBy`·`caught` 를 더한다. OASIS BPMN 은 `endedBy` 로 게이트웨이를 나눌 수 있다.
- 받는 노드가 없는 실패는 지금처럼 `EngineEvaluationException` 이고 `RuleErrorText` 문구 규칙도 그대로다.
- `simulate` action 응답은 `RunTrace` 라 엔진 계약을 따라 바뀐다.

## 8. 편집기

- **붙이기**: 룰 노드에 마우스를 올리면 오른쪽 아래에 빨간 번개 모양 "예외" 연결점이 보인다. 거기서 끌어 놓으면 받는 노드와 처리 갈래 첫 선을 함께 만든다. 룰 노드 우클릭 메뉴에도 「예외 받기 추가」를 둔다. 보기 모드에서는 둘 다 숨긴다.
- **모양**: 받는 노드는 룰 노드 아래 테두리에 걸친 작은 원(번개 아이콘)이다. 룰을 옮기면 같이 움직이므로 위치를 `view.positions` 에 저장하지 않고, 룰 기준 순번으로 왼쪽부터 늘어놓는다. 받는 노드에서 나가는 선은 빨간 점선이다.
- **속성 패널**: 받을 종류 네 개 체크(하나 이상), 제목(`label`). 종류 옆에 `CATCH_NEVER` 경고를 같이 보인다.
- **지우기**: 룰을 지우면 붙은 받는 노드와 그 노드에서 나가는 선을 같이 지운다. 처리 갈래 안의 노드는 지우지 않는다(검사가 연결 끊김을 알려 준다).
- **돌아오기**: 돌아오는 MERGE 는 따로 만들지 않고 두 가지 방법으로 생긴다. 어느 쪽이든 MERGE 가 없으면 룰의 나가는 선(ID 그대로)을 새 MERGE 로 돌리고 MERGE → 정상 다음 노드 선을 더하며, 이미 있으면 그 MERGE 를 쓴다.
  - 잇기: 받는 노드나 처리 갈래 맨 바깥 순차의 노드에서 그 룰의 정상 다음 노드(룰의 나가는 선 도착, MERGE 가 있으면 MERGE 출구 도착)로 선을 잇거나 다시 이으면, 선이 그 노드 대신 돌아오는 MERGE 로 간다. 예외 연결점을 정상 다음 노드에 놓을 때도 같다. 정상 다음 노드가 END 면 끝내는 처리 갈래로 보고 END 로 잇는다.
  - 받는 노드 우클릭 「흐름으로 돌아오기」: 끝내는 처리 갈래의 END 로 들어가는 선(빈 갈래면 받는 노드의 선)을 돌아오는 MERGE 로 옮긴다. 정상 다음 노드가 END 여도 된다(끝내기와 달리 `endedBy` 가 남지 않는다). 이미 돌아오는 갈래이거나 룰의 나가는 선이 하나가 아니거나 처리 갈래가 끝 노드까지 이어지지 않은 열린 갈래(`RETURN_OPEN`)이면 항목을 보이지 않는다.
- **자동 정렬**: 처리 갈래는 룰의 오른쪽에 놓고, 돌아오는 MERGE 는 정상 갈래 아래에 둔다. dagre 에서는 받는 노드를 넣지 않고 룰에서 처리 갈래 첫 노드로 가는 가상 선을 넣어 처리 갈래가 룰 바로 아래 층에 오게 한 뒤, 받는 노드는 룰 테두리 위치에 놓는다. 끝내는 처리 갈래가 END 로 들어가는 선이 다른 노드를 지나면 화면은 저장하지 않는 자동 경로로 그 선을 오른쪽으로 비켜 그린다.
- **변수 칩**: 처리 갈래 첫 선에 `CATCH_*` 를 칩으로 보인다.
- **팔레트**: 따로 항목을 두지 않는다. 받는 노드는 혼자 존재할 수 없고 늘 룰에 붙기 때문이다.

## 9. 디버거

- CAUGHT 인 룰: 주황 점선 테두리와 종류 배지(결과 없음·입력 오류·계산 오류·판정 충돌).
- 탄 받는 노드와 처리 갈래: 실행된 노드와 같은 초록 표시. 안 탄 받는 노드는 흐리게.
- 결과 머리: `endedBy` 가 있으면 "예외로 끝남: {받는 노드 제목}" 을 보인다. `caught` 가 있으면 건수를 보이고 누르면 목록이 열린다.
- 노드 상세: 받는 노드는 종류·코드·메시지와 `CATCH_*` 값을 보인다. CAUGHT 인 룰은 위반 목록과 [룰 편집 열기] 를 보인다.
- E4 값 고치기(4단계)는 처리 갈래 안 노드에도 평소처럼 쓸 수 있다. 고친 값 때문에 받는 노드를 안 타게 되면 다시 실행한 기록에 그대로 반영된다.

## 10. 테스트

- 엔진: 종류별 받기 4종, 받는 노드 없음(기존 동작 유지, 결과 없음 NULL 진행), 돌아옴·끝냄, 한 룰에 받는 노드 둘, 받지 않는 코드(`RULE_NOT_FOUND`)는 중단, 병렬 갈래 안 끝냄의 `finalValues`, 처리 갈래 안 룰의 받는 노드(중첩), `INPUT_ERROR` 받는 룰 입력의 사전 검사 제외, `CATCH_*` 가 MERGE 뒤·`finalValues` 에 없음, `RESERVED_KEY`, `evaluateSet` 과 `traceSet` 의 경로 일치.
- 구조·검사 코퍼스(`rule-set-corpus.json`): §3·§5 의 오류·경고 사례마다 하나 이상, 교집합 규칙(끝내는 갈래 제외), `CATCH_*` 를 처리 갈래 밖에서 읽음. Java·TS 두 구현이 같은 결과를 내야 한다.
- 화면: 연결점 끌기로 만들기, 룰 지울 때 같이 지움, 받는 노드가 룰을 따라 움직임, 속성 패널 체크·경고, 자동 정렬 위치, 디버거 표시.
- e2e(`mdm-ruleSetEdit.spec`): 받는 노드를 만들어 저장한 뒤 시뮬레이션으로 결과 없음 처리 갈래를 타는 시나리오 하나. 실행은 사용자 승인 뒤에 한다.

## 11. 결정

| ID | 결정 | 근거 |
|---|---|---|
| X-D1 | 받는 노드는 RULE 에 붙인다. 세트 전체 처리기는 두지 않는다 | 세트 전체 처리기는 끝내기만 할 수 있어 "결과 없으면 기본값 채우고 계속"을 그릴 수 없다. RULE + 처리 갈래 + MERGE 는 IF 블록과 같은 모양이라 교집합 규칙을 그대로 쓴다 |
| X-D2 | 받는 종류 4종(§1), 정의·설정 오류는 받지 않음 | 정의 오류를 흐름에서 처리하면 설정 실수가 감춰진다 |
| X-D3 | 결과 없음은 받는 노드가 있을 때만 exception | 기존 세트 동작 불변 |
| X-D4 | RULE 과 CATCH 는 선이 아니라 `attachTo` 로 잇는다 | RULE 의 선 수 규칙과 기존 구조 검사를 건드리지 않는다. BPMN `attachedToRef` 와 같다 |
| X-D5 | 돌아오는 MERGE 의 `splitId` 는 RULE 노드 ID | 기존 MERGE 짝 규칙을 넓히는 것으로 충분하다 |
| X-D6 | 처리 갈래는 맨 바깥 순차에서만 END 로 간다 | 처리 갈래 안 IF·PARALLEL 갈래가 END 로 빠지면 그 분기의 합류 규칙까지 다시 정해야 한다 |
| X-D7 | `version` 은 1 유지 | D-125(TASK)와 같은 판단. 읽는 쪽이 함께 배포된다 |
| X-D8 | exception 정보는 `CATCH_KIND`·`CATCH_RULE`·`CATCH_CODE`·`CATCH_MSG`, 예약 이름 | `_` 접두는 엔진 내부용, `EXC_` 는 기존 변수(`EXC_SPD`)와 겹친다 |
| X-D9 | `INPUT_ERROR` 를 받는 룰의 입력은 사전 검사에서 빼고 실행 직전에 검사 | 사전 검사에 남기면 받는 노드에 닿기 전에 세트가 중단된다 |
| X-D10 | `RuleSetResult`·`RunTrace` 에 `endedBy`, 결과에 `caught`, 상태 `CAUGHT` | 없으면 OASIS 가 예외로 끝난 실행의 NULL 결과를 정상으로 쓴다. 디버거가 처리된 실패와 중단을 구분한다 |
| X-D11 | 병렬 갈래 안에서 끝내면 남은 형제 갈래는 실행하지 않는다 | 끝냄은 세트 끝이다. 갈래 순서가 고정이라 결과는 결정적이다 |
| X-D12 | 받는 노드는 팔레트에 두지 않고 룰의 연결점·우클릭으로만 만든다 | 늘 룰에 붙어야 하는 노드라 혼자 놓을 수 없게 한다 |

구현이 끝나면 `docs/mdm/decisions.md` 에 D-132 로 X-D1~X-D12 를 남기고, ADR-0005 Consequences 의 "흐름 안에 저장·외부 호출 노드가 없다"는 그대로 유효함을 확인한다(CATCH 는 판정 흐름 안의 분기라 이 원칙과 어긋나지 않는다).

## 12. 미루는 것

- IF 조건식 오류(`BRANCH_EVAL_ERROR`)를 받는 노드
- 여러 룰을 묶는 구간(TRY) 받기
- 세트 전체 처리기(어디서 나든 받는 노드 하나)
- 작성자가 일부러 거부를 내는 THROW 노드(코드·메시지 템플릿)
- 처리 갈래 안 IF·PARALLEL 갈래에서 END 로 가기
- 받는 노드 위치를 사용자가 룰 테두리 위에서 옮기기
