# 룰 세트 흐름도(분기형 룰 세트)와 디버거 설계

- 작성: 2026-09-29, 개정: 2026-09-30(OASIS 연동·디버거·실행 기록 계약 반영)
- 상태: 승인(2026-09-30). A8 유지, 룰 박스 클릭 동작은 사용자가 정정(§7)
- 범위: MDM 룰 세트(`TB_MDM_RULE_SET`, `MdmRuleEngine.evaluateSet`, 화면 `dme/ruleSetEdit`)와 OASIS 업무 서비스에서의 호출
- 출발점: `docs/idea.md:39-42` "룰 세트 편집을 비주얼하게", 사용자 화이트보드(품질설계 흐름)
- 시안: 클릭해 볼 수 있는 HTML 시안 `docs/mdm/design/basic/html/06-rule-set-flow.html` (외부 링크 폴더 — `docs/mdm/screens/README.md`)

## 1. 목적과 결정 사항

지금의 룰 세트는 룰 ID 를 순서대로 담은 목록이고, 엔진은 그 목록을 앞에서부터 한 번씩 실행한다. 이 설계는 룰 세트를 **흐름도**로 바꿔 담당자가 화이트보드에 그리던 업무 흐름을 그대로 룰 세트로 만들고, 그 흐름대로 실행되게 한다. 그리고 **노드(태스크) 단위로 실행 결과를 보고 따라가는 디버거**를 함께 만든다. 디버깅과 태스크 단위 결과 보기는 OASIS 에 없는 기능이라, 이것이 룰 세트 실행을 OASIS 가 아닌 룰 엔진에 두는 가장 큰 이유다(§2).

| # | 항목 | 결정 | 결정한 사람 |
|---|---|---|---|
| A1 | 갈래의 실행 의미 | IF 분기(조건에 맞는 한 갈래만 실행)와 병렬 분기(모든 갈래 실행)를 모두 둔다 | 사용자 |
| A2 | IF 조건 표현 | 갈래마다 불린 식을 적고 위에서부터 평가한다. 참인 갈래가 없으면 "그 외" 갈래로 간다 | 사용자 |
| A3 | 반복 | 이번 범위에서 제외한다. 흐름은 순환이 없어야 하고, 저장 모델만 나중에 반복 노드를 더할 수 있게 열어 둔다 | 사용자 |
| A4 | 부가 기능 | 시뮬레이션(디버거), 메모, 그룹 틀, 변수 흐름 표시를 모두 넣는다 | 사용자 |
| A5 | 화면 도구 | React Flow(`@xyflow/react` 12.x, MIT) + `@dagrejs/dagre`(MIT) 자동 배치 + 자체 흐름 모델 | 사용자 승인 |
| A6 | 룰 박스 동작 | 룰 박스의 링크 아이콘을 누르면 기존 `openRuleEdit(ruleId)` 로 룰 편집 탭이 열린다. 박스 자체를 누르면 선택·편집이다(§7) | 사용자(2026-09-30 정정) |
| A7 | 실행 위치 | 룰 세트는 `maru-mdm-engine` 이 실행한다. OASIS 업무 서비스는 태스크 하나에서 룰 세트 실행 클래스를 부른다 | 사용자 합의 |
| A8 | 디버깅 범위 | 화면 시뮬레이션(디버거)을 만들고 **실행 기록 형식은 지금 확정**한다. 운영 실행 기록을 저장해 캔버스에서 다시 보는 기능은 뒤로 미룬다. 형식이 이미 정해져 있으므로 나중에 붙일 때 엔진 계약을 다시 열지 않는다 | 사용자(2026-09-30 확인) |

### 1.1 화면 도구 선택 근거

| 후보 | 판단 |
|---|---|
| React Flow + dagre | **채택.** 노드를 Mantine 컴포넌트로 직접 그릴 수 있어 기존 화면과 룩을 맞추기 쉽다. 라이선스가 MIT 이고 peer 의존성이 `react>=17` 이라 React 19 와 맞는다 |
| bpmn-js | 제외. 라이선스가 bpmn.io 워터마크를 지우거나 가리지 못하게 한다. 캔버스 기호(마름모 게이트웨이, 병렬 막대)는 BPMN 모양을 빌려 쓰되 라이브러리는 쓰지 않는다 |
| SVG 직접 개발 | 제외. 끌기·확대·연결·자동 배치를 모두 새로 만들어야 해 기간이 몇 배로 는다 |
| elkjs | 제외. 라이선스가 EPL-2.0 / GPL-3.0 이다. 배치 품질이 필요해지면 다시 검토한다 |

## 2. 실행 위치: 룰 엔진과 OASIS 의 역할 나누기 (A7)

룰 세트는 입력값에서 결과값을 계산하는 **판정**이고, OASIS 는 조회·저장·트랜잭션·외부 호출을 묶는 **업무 처리**다. Camunda 가 DMN(결정)과 BPMN(프로세스)을 나누고 BPMN 의 Business Rule Task 가 DMN 을 부르는 구조와 같다.

| 룰 세트를 OASIS BPMN 으로 실행하지 않는 이유 | 근거 |
|---|---|
| 룰 세트는 화면에서 저장하면 바로 반영되는 데이터다. OASIS 서비스는 `services/{group}/{id}.bpmn` 파일로 앱과 함께 배포된다 | `PRD.md` AC-4, `TRD.md:38` |
| 엔진은 EvalEx 하나에만 의존하는 독립 jar 이고 DB·네트워크를 직접 부르지 않는다. 화면 `set-model.ts` 는 서버 분석기와 같은 알고리즘을 한 벌 더 갖는다 | `TRD.md:13`, `TRD.md:134`, `rule-set-corpus.json` |
| IF 조건은 룰 식과 같은 EvalEx 문법·함수 사전·평가 시각·NULL 규칙을 써야 한다. OASIS 게이트웨이 조건은 SpEL/PropertyEL 이다 | `RuleEvaluator.java:285-308` |
| 흐름 검사(뒤 룰 결과 읽기, 형제 갈래 읽기 등)는 룰 입출력을 알아야 하므로 OASIS 를 써도 따로 만들어야 한다 | §5 |
| OASIS 에는 노드 단위 실행 결과 보기와 디버깅이 없다 | 사용자 확인 |

OASIS 가 맞는 일은 흐름 중간에 DB 조회·저장, 트랜잭션, 외부 호출, 메시지 발행이 필요한 업무다. 그런 업무는 지금처럼 OASIS BPMN 으로 만들고, 판정이 필요한 자리에서 룰 세트를 부른다(§6).

이 결정은 되돌리기 어려우므로 스펙 승인 뒤 `adr-write` 로 mdm ADR 을 남긴다.

## 3. 흐름 모델

### 3.1 노드와 선

| 노드 종류 | 뜻 | 들어오는 선 | 나가는 선 |
|---|---|---|---|
| `START` | 세트 시작. 세트마다 1개 | 0 | 1 |
| `END` | 세트 끝. 세트마다 1개 | 1 | 0 |
| `RULE` | 룰 하나 실행(`ruleId`) | 1 | 1 |
| `IF` | 배타 분기. 갈래 선마다 조건식과 순서가 있고, 조건 없는 "그 외" 선이 정확히 1개 | 1 | 2 이상 |
| `PARALLEL` | 병렬 분기. 모든 갈래를 실행 | 1 | 2 이상 |
| `MERGE` | 분기 하나를 닫는 합류. `splitId` 로 짝이 되는 분기를 가리킨다 | 2 이상 | 1 |

- 갈래에는 룰이 하나도 없어도 된다(분기에서 합류로 바로 가는 선). 예: "그 외에는 아무것도 하지 않는다".
- 메모와 그룹 틀은 실행과 무관한 화면 요소라 노드가 아니다(§3.3 `view`).

### 3.2 구조 규칙: 중첩 블록

흐름은 **중첩 블록**이어야 한다. 모든 `IF`·`PARALLEL` 은 짝이 되는 `MERGE` 하나로 닫히고, 한 분기의 갈래 안에서 시작한 분기는 그 갈래 안에서 닫힌다. 갈래 밖으로 빠져나가거나 다른 갈래로 건너가는 선은 허용하지 않는다.

- 합류 노드에서 "모든 갈래를 기다리는지, 실행된 한 갈래만 받는지"가 분기 종류로 정해진다. 자유 그래프에서는 이것이 모호하다.
- 흐름을 블록 트리(`순차 / IF / 병렬`)로 바꿀 수 있어서 엔진 실행, 도달 분석, 입력 누락 검사가 트리를 한 번 도는 것으로 끝난다.
- 서버 `RuleSetAnalyzer` 와 화면 `set-model.ts` 가 같은 알고리즘을 유지해야 한다(`rule-set-corpus.json` 이 동치를 고정한다). 블록 트리 위의 검사는 두 언어로 똑같이 구현하기 쉽다.

캔버스에서는 선을 자유롭게 그을 수 있다. 구조를 어긴 흐름은 검사에서 오류로 표시하고 저장을 막는다.

### 3.3 저장 형식

`TB_MDM_RULE_SET` 에 `FLOW_JSON` 컬럼(TEXT, NULL 허용, `json_valid` CHECK)을 더한다.

```json
{
  "version": 1,
  "nodes": [
    { "id": "start", "type": "START", "label": "주문 접수" },
    { "id": "if1", "type": "IF", "label": "주문 유형" },
    { "id": "r1", "type": "RULE", "ruleId": "QD_R_DIRECT_CONFIRM" },
    { "id": "r2", "type": "RULE", "ruleId": "QD_R_COPY_DESIGN" },
    { "id": "r3", "type": "RULE", "ruleId": "QD_R_DESIGN_KEY" },
    { "id": "m1", "type": "MERGE", "splitId": "if1" },
    { "id": "end", "type": "END", "label": "설계 확정" }
  ],
  "edges": [
    { "id": "e1", "from": "start", "to": "if1" },
    { "id": "e2", "from": "if1", "to": "r1", "order": 1, "label": "설계 불필요", "cond": "DESIGN_NEED = \"N\"" },
    { "id": "e3", "from": "if1", "to": "r2", "order": 2, "label": "반복 주문", "cond": "REPEAT_YN = \"Y\" && DAYS_SINCE_LAST <= 180" },
    { "id": "e4", "from": "if1", "to": "r3", "else": true, "label": "신규 설계" },
    { "id": "e5", "from": "r1", "to": "m1" },
    { "id": "e6", "from": "r2", "to": "m1" },
    { "id": "e7", "from": "r3", "to": "m1" },
    { "id": "e8", "from": "m1", "to": "end" }
  ],
  "view": {
    "positions": { "start": { "x": 0, "y": 0 } },
    "notes":  [ { "id": "n1", "text": "…", "x": 0, "y": 0, "w": 220, "h": 120, "attach": "r3" } ],
    "groups": [ { "id": "g1", "title": "기준 결정실", "nodeIds": ["r3"] } ]
  }
}
```

- `nodes`·`edges` 가 실행 정의이고, `view` 는 화면 전용이다. 엔진과 분석기는 `view` 를 읽지 않는다.
- `cond` 는 기존 룰 식과 같은 EvalEx 문법의 불린 식이다. 변수는 세트 입력(컬럼 사전 이름)과 앞 룰의 결과 이름을 쓸 수 있다.
- 병렬 분기의 갈래 순서는 나가는 선의 `order` 다. IF 와 같은 필드를 쓴다.
- `version` 은 형식 버전이다. 반복 노드처럼 새 노드 종류가 생기면 올린다.

**하위 호환**

- `RULE_IDS` 는 없애지 않는다. 저장할 때 흐름의 룰 노드를 깊이 우선 순서로 펼친 **중복 없는 룰 ID 목록**으로 계속 채운다. 그래서 룰을 확정할 때 "이 룰을 담은 INUSE 세트"를 찾는 조회와 세트 목록 화면은 바뀌지 않는다. 다만 찾은 세트에 대해 수행하는 검사 자체(`RuleSetOrderCheck`)는 펼친 목록이 아니라 §5 의 흐름 기준 검사로 바꾼다. 펼친 목록으로 검사하면 서로 다른 IF 갈래가 같은 결과를 쓰는 정상 흐름이 `SET_DUP_RESULT` 에 걸리기 때문이다.
- `FLOW_JSON` 이 NULL 인 기존 세트는 `START → RULE_IDS 순서의 룰들 → END` 인 한 줄 흐름으로 읽는다. 데이터 마이그레이션은 필요 없다.

## 4. 실행 의미

엔진은 저장된 흐름을 블록 트리로 바꾼 뒤 트리를 따라 실행한다. 실행 컨텍스트(`ctx`)는 지금처럼 입력 레코드에 룰 결과를 덮어써 가며 이어 간다.

| 블록 | 실행 |
|---|---|
| 순차 | 자식 블록을 차례로 실행한다 |
| RULE | 지금과 같다. `evaluator.evaluate(def, ctx, ts)` 후 결과를 `ctx` 에 덮어쓴다 |
| IF | 갈래 선을 `order` 순으로 평가해 처음 참인 갈래 하나만 실행한다. 참이 없으면 "그 외" 갈래를 실행한다 |
| 병렬 | 갈래를 `order` 순으로 **하나씩** 실행한다. 스레드를 쓰지 않는다. 각 갈래는 분기 직전 `ctx` 의 사본에서 실행하고, 끝나면 갈래들의 결과를 모두 `ctx` 에 합친다 |

- **조건식 평가.** 의사결정표 열 조건과 같은 경로(`runner.run(text, values, evalTs)`, `RuleEvaluator.java:285-308`)와 같은 규칙을 쓴다. 결과가 NULL 이면 거짓으로 보고 경고(`BRANCH_COND_NULL`)를 남긴다. 불린이 아니거나 평가에 실패하면 판정 오류다.
- **결정적 실행.** 갈래 순서가 고정이고 병렬 갈래는 분기 직전 값만 보므로, 같은 입력과 같은 평가 시각은 늘 같은 결과와 같은 경로를 낸다. 디버거가 중단점 없이 "끝까지 실행한 기록을 앞뒤로 넘겨 보는" 방식으로 동작할 수 있는 근거다(§8).
- **오류 처리.** 운영 실행에서는 지금처럼 룰 하나 또는 조건식 하나가 실패하면 세트 전체를 중단하고 `EngineEvaluationException` 을 던진다. 기록 실행(§4.2)은 던지지 않고 멈춘 지점까지의 기록과 오류를 돌려준다.
- **입력 키 사전 검사**(`missingInputKeys`)는 다음처럼 나눈다.
  - 세트 시작 전에 **반드시 실행되는 부분**을 검사한다. 어떤 IF 갈래에도 들어 있지 않은 룰(병렬 갈래 안의 룰 포함)과, 어떤 IF 갈래에도 들어 있지 않은 IF 의 조건식 변수가 여기에 해당한다.
  - IF 갈래에 들어갈 때 그 갈래가 필요로 하는 키를 한꺼번에 검사한다.
  - IF 합류 뒤의 룰이 일부 갈래에서만 만들어지는 변수(§5 `FLOW_PARTIAL`)를 읽으면, 그 변수는 사전 검사에서 빼고 그 룰을 실행하기 직전에 검사한다. 실제로 탄 갈래가 만들었으면 통과하고, 아니면 `MISSING_KEY` 다.
  - 이렇게 나누면 타지 않은 갈래만 필요로 하는 입력이 없다는 이유로 세트가 실패하는 일이 없다.

### 4.1 엔진 계약 변경

| 대상 | 변경 |
|---|---|
| `DefinitionLookup.RuleSetDefinition` | `flow` 필드(흐름 정의, NULL 이면 한 줄 흐름)를 더한다. 기존 생성자는 한 줄 흐름으로 위임해 호출부를 깨지 않는다 |
| `RuleEngine.evaluateSet(setId, record, evalTs)` | 서명을 바꾸지 않는다. 흐름대로 실행하고 `RuleSetResult` 를 돌려준다 |
| `RuleSetResult` | `path` 를 더한다. 방문한 노드마다 `PathStep(nodeId, kind, chosenEdgeId, stepIndex)` 이다. `chosenEdgeId` 는 IF 에서 고른 선이고, `stepIndex` 는 룰 노드의 결과가 `steps` 의 몇 번째인지다. `steps`·`finalValues` 는 그대로 둔다. 노드 ID 만 담으므로 운영 실행에서도 비용이 작다 |
| `RuleEngine.traceSet(...)` | **새 입구.** §4.2 |
| 판정 오류 | 단계 `BRANCH_SELECT` 와 코드 `BRANCH_EVAL_ERROR` 를 더한다 |
| 경고 | `BRANCH_COND_NULL` 을 더한다 |
| 문서·생성물 | `docs/mdm/engine-contract.md` 룰 세트 절, `engine-contract/{java,schema,ts}`, `m-mdm/src/contract/engine-contract.generated.ts` 를 함께 갱신한다 |

### 4.2 실행 기록(trace) 계약

디버거와 나중의 운영 기록 재생이 같은 형식을 쓰도록 **지금 확정**한다. 이 형식은 엔진 계약에 들어가므로 뒤에 바꾸면 계약 네 벌(java, schema, ts, generated)과 동치 코퍼스를 다시 열어야 한다.

- **입구**: `RunTrace traceSet(RuleSetDefinition set, Map<String,Object> record, Instant evalTs)`.
  - 저장된 세트 ID 가 아니라 정의를 직접 받는다. 그래서 화면에서 **저장하지 않은 흐름**도 실행해 볼 수 있다.
  - 판정 오류를 던지지 않는다. 멈춘 노드까지의 기록과 오류를 담아 돌려준다.
  - 운영 경로 `evaluateSet` 은 기록을 모으지 않는다. 레코드마다 호출되는 MES 판정에 입력값 사본 비용을 붙이지 않기 위해서다. 기록은 호출자가 이 입구를 골라야만 켜진다.
- **`RunTrace(setId, evalTs, input, nodes, finalValues, error)`**
  - `input`: 받은 레코드 그대로.
  - `nodes`: 실행 순서대로 `NodeTrace` 목록.
  - `finalValues`: 멈춘 시점(또는 끝)의 결과 변수 전체.
  - `error`: 멈췄으면 `EngineError`(기존 `Violation` 목록), 끝까지 갔으면 null.
- **`NodeTrace(seq, nodeId, kind, status, …)`** — `status` 는 `OK` / `ERROR`. 종류별 내용은 다음과 같다.

| 종류 | 담는 내용 |
|---|---|
| RULE | `ruleId`, `ver`(판정 시점의 확정 버전), `reads`(이 룰이 읽은 입력 변수 → 실행 직전 `ctx` 값), `result`(기존 `RuleResult` 전체: `hits` 맞은 행, `defaultApplied`, `results` 결과값, `trace` 행마다 평가 여부·적중·처음 거짓이 된 셀, `warnings`) |
| IF | `branches`: 갈래 선마다 `edgeId`, `outcome`(`TRUE` / `FALSE` / `NULL` / `ERROR` / `NOT_EVALUATED` — 앞 갈래가 참이라 평가하지 않음), 오류 메시지. `chosenEdgeId` |
| PARALLEL | `order`: 실제로 실행한 갈래 선 순서 |
| MERGE | `splitId`. 병렬 합류면 합친 결과 변수 이름 목록 |
| START / END | 없음 |
| 오류 노드 | `status=ERROR`, 그 노드에서 난 `Violation` 목록 |

- 값은 기존 JSON 규약대로 `TypedValue` 로 싣고 숫자는 문자열이다(`engine-contract.md` §11).
- 운영 기록 저장(A8 에서 미룸)은 이 `RunTrace` JSON 을 그대로 저장하면 된다. 저장 테이블, 보관 기간, 켜고 끄는 설정은 그때 정한다.

## 5. 정적 검사

서버 `RuleSetAnalyzer`·`RuleSetOrderCheck` 와 화면 `set-model.ts` 를 흐름 기준으로 다시 정의한다. 두 구현이 같은 결과를 내는지는 `rule-set-corpus.json` 에 흐름 사례를 더해 고정한다.

| 코드 | 수준 | 내용 |
|---|---|---|
| `FLOW_STRUCTURE` | 오류 | START·END 가 1개가 아니거나, 분기가 짝 합류로 닫히지 않거나, 갈래 밖으로 선이 나가거나, 도달할 수 없는 노드가 있거나, 순환이 있다 |
| `FLOW_IF_ELSE` | 오류 | IF 에 "그 외" 선이 없거나 2개 이상이다 |
| `FLOW_COND` | 오류 | 조건식을 파싱할 수 없거나, 그 지점에서 정의되지 않은 변수를 읽거나, 불린 식이 아니다 |
| `SET_ORDER` | 오류 | 경로상 뒤에서 만들어지는 결과를 앞 룰이 읽는다(기존 규칙의 흐름판) |
| `SET_PAR_SIBLING` | 오류 | 병렬 갈래가 형제 갈래의 결과를 읽거나, 형제 갈래들이 같은 결과 변수를 쓴다 |
| `SET_IF_SIBLING` | 오류 | IF 갈래 안의 룰이 같은 IF 의 **다른 갈래에서만** 만들어지는 결과를 읽는다. 그 갈래를 탈 때는 이 값이 절대 만들어지지 않으므로 실행하면 반드시 `MISSING_KEY` 가 난다 |
| `SET_DUP_RESULT` | 오류 | 한 경로 위에서 같은 결과 변수를 두 번 쓴다. IF 의 서로 다른 갈래가 같은 이름을 쓰는 것은 정상이다 |
| `FLOW_PARTIAL` | 경고 | IF 합류 뒤의 룰이 일부 갈래에서만 만들어지는 변수를 읽는다 |

- "정의된 변수"는 경로 기준으로 센다. IF 합류 뒤에는 **모든 갈래**가 만든 변수만 정의된 것으로 보고, 병렬 합류 뒤에는 **어느 갈래든** 만든 변수를 정의된 것으로 본다.
- 같은 룰은 서로 다른 IF 갈래에 여러 번 둘 수 있다. 같은 경로에 두 번 두면 `SET_DUP_RESULT` 에 걸린다.
- 기존 "위상 정렬 제안"(PRD FR-E5)은 한 줄 흐름에서만 제공한다.

## 6. OASIS 연동

### 6.1 운영 정의 조회기 (선행 조건)

OASIS 에서 룰 세트를 부르려면 DB 에서 **판정 시점의 확정(RELEASED) 룰 정의**와 세트 정의를 읽는 `DefinitionLookup` 구현이 있어야 한다. 지금은 값 테스트용 `SingleRuleDefinitionLookup`(룰 1개)과 빈 조회기(`MdmEngineConfig.EMPTY_DEFINITIONS`)만 있고, 정의 조회 API 는 PRD 규칙 7(배포 보류)에 따라 담당 Task 가 없다(`wbs.md:1436`).

- 이 설계에서 `mdm/lib` 에 **MDM 앱 안에서 DB 를 직접 읽는** 조회기를 만든다. 룰은 `evalTs` 시점에 유효한 RELEASED 버전, 세트는 INUSE 인 현재 행을 돌려준다.
- 외부 시스템으로 정의를 배포·수신하는 일은 계속 보류한다. 이 조회기는 MDM 앱 프로세스 안에서만 쓴다.
- 엔진은 순수하게 둔다(`TRD.md:134`). 조회기와 아래 실행 클래스는 `mdm/lib` 에 있다.

### 6.2 실행 클래스

`mdm/lib` 에 스프링 빈 `RuleSetRunner` 를 둔다.

| 메서드 | 쓰는 곳 | 동작 |
|---|---|---|
| `run(setId, record, evalTs)` → `RuleSetResult` | OASIS 업무 서비스 | 조회기로 세트·룰을 읽어 `evaluateSet` 실행. 판정 오류는 `EngineEvaluationException` 으로 올라가고, 서비스 쪽에서 기존 오류 문구 규칙(`RuleErrorText`)으로 바꾼다 |
| `trace(flow, record, evalTs)` → `RunTrace` | 룰 세트 편집 화면 디버거 | 화면이 보낸 흐름(저장 전 포함)과 조회기의 룰 정의로 `traceSet` 실행 |

- `evalTs` 를 주지 않으면 서비스 층이 현재 시각으로 채운다(엔진은 시계를 읽지 않는다, `decisions.md:161`).
- OASIS 업무 BPMN 에서는 `camunda:class` 가 이 빈(또는 이 빈을 부르는 업무 서비스 메서드)을 가리키는 serviceTask 하나로 룰 세트를 부른다. 입력은 `setId`, 레코드, 평가 시각이고 출력은 `RuleSetResult.finalValues` 다.
- 룰 세트 편집 화면의 OASIS 서비스 `ruleSetEdit.bpmn` 에 `simulate` action 을 더해 `trace` 를 노출한다. ruleSetEdit 기능설계서 N-1(설계 D2)이 "조회기가 생기면 `execute` action 으로 더한다"고 남긴 후속 조건을 이 action 이 채운다. 착수할 때 `docs/mdm/decisions.md` 에 결정을 남긴다.

## 7. 캔버스 편집기

- **위치**: `dme/ruleSetEdit` 의 룰 목록 그리드 자리를 캔버스로 바꾼다. 세트 입출력 표와 구성 지침 카드는 오른쪽 패널로 옮긴다.
- **클릭 동작**(2026-09-30 사용자 결정)
  - 룰 박스를 누르면 선택하고 속성 패널을 연다(편집). 보기 모드에서도 같고, 보기 모드의 속성 패널은 읽기 전용이다.
  - 룰 편집은 박스의 **링크 아이콘**을 눌러야만 열린다. 두 번 누르기로는 열지 않는다. 끌기·선택과 룰 편집 열기가 겹치지 않게 하려는 것이다.
- **룰 편집 열기**: 기존 `openRuleEdit(ruleId)`(`m-mdm/src/dme/rule-handoff.ts`)를 그대로 쓴다. 포털 탭으로 열리고 버전은 넘기지 않는다(세트는 판정 시점의 확정 버전을 쓰기 때문).
- **팔레트**: 룰(룰 검색 팝업, RELEASED 버전이 있는 룰만), IF 분기, 병렬 분기, 메모, 그룹. 분기를 놓으면 짝 합류와 갈래 2개를 함께 만든다.
- **속성 패널**: 룰은 입출력 변수(어디서 오는지 포함)와 확정 버전을 보여 준다. IF 는 갈래의 순서·이름·조건식을 편집한다. 병렬은 갈래 순서를 편집한다.
- **변수 흐름 표시**: 선 위에 앞 노드가 넘기는 결과 변수 이름을 칩으로 보여 주고, 입력이 모자란 룰에 경고 점을 찍는다.
- **검사 패널**: §5 검사 결과 목록. 항목을 누르면 해당 노드로 캔버스를 이동한다. 오류가 있으면 저장을 막는다.
- **자동 정렬**: dagre 로 위→아래 배치를 다시 계산한다. 사용자가 옮긴 위치는 `view.positions` 에 저장한다.
- **패키지**: `@xyflow/react`, `@dagrejs/dagre` 를 `m-mdm` 에만 넣는다. 다른 모듈이 쓰게 되면 그때 `shared` 로 올린다. React Flow 스타일시트는 캔버스 컴포넌트에서만 불러 다른 화면에 영향을 주지 않게 한다.

## 8. 디버거

캔버스 아래 패널의 "시뮬레이션" 탭이다. OASIS 에 없는 **노드 단위 실행 결과 보기**와 **따라가기**를 제공한다.

- **입력**: 세트 입력 변수(분석기가 구한 DICT 출처 이름)로 폼을 자동으로 만든다. 데이터 타입에 맞는 입력 칸을 쓰고 평가 시각을 함께 받는다. 입력값 묶음을 JSON 으로 붙여 넣는 칸도 둔다(운영에서 받은 레코드를 그대로 재현할 때).
- **실행**: [실행] 은 `simulate` action 으로 `RunTrace` 를 받아 온다. 저장하지 않은 흐름도 실행한다.
- **따라가기**: 받아 온 기록을 앞뒤로 넘겨 본다. [처음] [이전] [다음] [끝] 과 진행 막대를 둔다. 실행이 결정적이므로(§4) 중단점 없이 기록 재생만으로 디버깅한다.
- **캔버스 겹침**
  - 실행된 노드: 초록 테두리, 실행 순번, 대표 결과값 칩
  - 안 탄 노드·갈래: 흐리게
  - IF 에서 고른 선: 굵게
  - 오류가 난 노드: 빨간 테두리와 오류 코드
  - 현재 단계의 노드: 강조 테두리
- **노드 상세**(노드를 누르면 오른쪽 패널)
  - 룰: 읽은 입력값 표, 맞은 행 번호와 기본 행 사용 여부, 결과값 표, 행마다 처음 거짓이 된 조건 열, 경고. [룰 편집 열기] 로 그 룰의 의사결정표를 바로 연다.
  - IF: 갈래마다 조건식과 평가 결과(참 / 거짓 / NULL / 평가 안 함).
  - 병렬: 실제 실행 순서, 합류에서 합친 변수.
- **값 표 보기**: 단계마다 `ctx` 가 어떻게 바뀌었는지 변수 × 단계 표로 보여 준다. 값이 바뀐 칸을 강조한다.
- 테스트 케이스 저장(룰 편집 화면의 테스트 케이스와 같은 기능)과 운영 기록 재생은 뒤로 미룬다(A8).

## 9. 단계 구분

디버깅이 핵심 가치이고 디버거는 캔버스 위에 겹쳐 보이므로, 캔버스와 디버거를 한 단계로 묶는다.

| 단계 | 내용 | 사용자에게 보이는 것 |
|---|---|---|
| 1 | 흐름 모델(§3), 엔진 흐름 실행·`path`·`traceSet`(§4), 정적 검사와 서버·화면 동치(§5), 운영 정의 조회기와 `RuleSetRunner`(§6) | OASIS 서비스가 룰 세트를 부를 수 있다. 화면은 기존 목록 편집을 유지하고, 분기가 있는 세트는 목록 화면에서 읽기 전용으로 보인다 |
| 2 | 캔버스 편집기(§7)와 디버거(§8), `simulate` action | 룰 세트 편집 화면이 캔버스가 된다. 분기를 그리고 실행을 따라가 볼 수 있다 |
| 이후 | 운영 실행 기록 저장·재생, 세트 테스트 케이스, 반복 노드 | 따로 결정한다 |

1단계만 끝나면 담당자 화면에는 큰 변화가 없다. 분기를 그리는 화면은 2단계에 나온다.

### 9.1 2단계 착수 조건 (1단계 최종 리뷰, 2026-09-30)

1. OASIS params 로 `RuleSetSaveRequest.flow`(Map) 가 실제로 바인딩되는지 HTTP 테스트로 확인한다. 1단계는 서비스 직접 호출만 검증했다. 처리: Task 1, D-111 (`flowJson` 문자열로 받는다 — 실측 `S999 Generic type`, HTTP 스키마 테스트)
2. RunTrace 를 JSON 으로 내보낼 때 `NodeTrace.result` 가 없으면 키를 뺀다(null 금지). simulate 응답 DTO 에 직렬화 규칙을 두고, 직렬화 결과를 스키마로 검증한다. 처리: Task 4, D-116 (`RunTraceJson` — result 없으면 키 생략, 골든 7사례를 엔진 스키마로 검증)
3. 저장 JSON 을 정규화한다. 서버 코덱은 느슨하게 읽는데(`"otherwise":"true"`·숫자 id 허용) 요청 맵을 그대로 저장하므로, 파싱한 정의에 view 만 붙여 저장한다. 화면 `parseFlow` 는 정규화된 서버 응답만 받는다. 처리: Task 1, D-111 (파싱한 정의로 다시 쓴 정규 JSON 저장, 형식 오류는 MDM021)
4. 코퍼스 미덮음 경로(흐름 안 CYCLE, DEPRECATED nodeId, 존재+구조 동시, IF 안 IF maybe, 여러 later·excl 문구, 구조 c·g3·g4·g5)를 채우고, 가능하면 FlowParser·RuleSetAnalyzer 와 flow-model·set-model 의 차분 퍼즈 검사를 둔다. 화면이 flowChecks 를 쓰기 전에 한다. 처리: Task 2, 결정 기록 없음 (코퍼스 사례 34건 기대 변경·차분 퍼즈 200건 동치)
5. IF 조건식 변수 가운데 세트 안 어느 룰도 타입을 선언하지 않은 이름은 원값 그대로 비교된다(문자열 숫자면 사전순 비교, 조용한 오판정 위험 — decisions 편차·Ruling). 저장 때 "선언 타입 없는 조건식 변수" 경고를 낸다(condIo 가 이미 컬럼 사전을 조회한다). 처리: Task 2, D-115 (`COND_UNTYPED` 경고, P-D7)
6. 룰 확정 검사(`RuleSetOrderCheck`)의 `SET_IF_SIBLING`·`SET_PAR_SIBLING` 는 "그 노드 앞 경로에서 이미 정의된 이름"을 빼지 않아 세트 저장 검사보다 거칠다. 분석기의 경로 상태 계산을 재사용해 맞춘다. 처리: Task 3, D-115·D-117 (`RuleSetPathState` 재사용, 판정 변화는 기능설계서 N-17)
7. 목록 저장이 한 줄 흐름의 FLOW_JSON(view 포함)을 지운다. 캔버스가 생기면 옛 탭 저장이 배치·메모를 지우지 않도록 막는다. 처리: Task 1·Task 10, D-113 (`FLOW_READONLY` 로 거부, 목록 편집 화면 제거)
8. 흐름 크기·중첩 깊이 상한을 둔다(FlowParser 재귀 StackOverflow 방지). 처리: Task 1, D-114 (노드 200·선 400·JSON 262,144자, 깊이 상한은 따로 두지 않음)
9. simulate 입력 검증: trace 의 record null, IAE·ISE 를 넓게 잡는 범위, MDM021 대신 저장값 손상 전용 오류 코드. 처리: Task 4, D-116·D-117 (`MDM026`·`StoredDefinitionException`, view·restore 손상도 MDM026)

## 10. 변경 범위

| 단계 | 영역 | 파일·대상 |
|---|---|---|
| 1 | DB | Flyway sqlite 새 마이그레이션(`FLOW_JSON` 컬럼), ERD `docs/mdm/erd/06-business-rule.*` |
| 1 | 엔티티·DTO | `MdmRuleSet`, `RuleSetSaveRequest`, 조회 응답 DTO, `RuleSetWrites`(`RULE_IDS` 동시 채움) |
| 1 | 엔진 | 흐름 모델 패키지(흐름 JSON 파싱 → 블록 트리 → 구조 검사), `DefinitionLookup.RuleSetDefinition`, `MdmRuleEngine.evaluateSet`, `traceSet`, `RuleSetResult.path`, `RunTrace`·`NodeTrace`, 오류·경고 코드 |
| 1 | 분석기 | `RuleSetAnalyzer`, `RuleSetOrderCheck`, 화면 `set-model.ts`, `rule-set-corpus.json` |
| 1 | 조회기·실행 | `mdm/lib` 운영 정의 조회기, `RuleSetRunner` |
| 1 | 계약 문서 | `docs/mdm/engine-contract.md`, `engine-contract/{java,schema,ts}`, 생성 계약 ts |
| 1 | 화면(최소) | 분기가 있는 세트를 목록 화면에서 읽기 전용으로 표시 |
| 1 | 설계 문서 | `ruleSetEdit_기능설계서.md` 저장 본문 절, `docs/mdm/decisions.md`, mdm ADR(A7) |
| 2 | 화면 | `m-mdm/pages/dme/ruleSetEdit/` 캔버스·속성 패널·검사 패널·디버거, `package.json` 의존성 |
| 2 | 서비스 | `ruleSetEdit.bpmn` `simulate` action, 요청·응답 DTO, 권한 action |
| 2 | 설계 문서 | `ruleSetEdit_기능설계서.md` 화면 구성·버튼·오류 절, 식별자 사전 |

## 11. 테스트

- **엔진 단위 테스트(1단계)**: 한 줄 흐름이 기존 결과와 같은지(회귀), IF 갈래 선택(첫 참·그 외·NULL 경고·불린 아님 오류), 병렬 갈래의 사본 격리와 합치기, 중첩 분기, 갈래별 입력 키 검사, `path` 기록, `traceSet` 의 노드별 기록과 오류 시 부분 기록.
- **구조·분석 테스트(1단계)**: §5 의 코드마다 통과 사례와 실패 사례. `rule-set-corpus.json` 에 흐름 사례를 더해 서버와 화면이 같은 결과를 내는지 확인한다.
- **조회기·실행 테스트(1단계, SQLite)**: 평가 시각별 RELEASED 버전 선택, `FLOW_JSON` 저장·조회, `RULE_IDS` 동시 채움, `FLOW_JSON` NULL 인 기존 세트 읽기, `RuleSetRunner.run` 이 OASIS 서비스 테스트에서 호출되는 경로.
- **화면 테스트(2단계)**: 캔버스 편집·검사·저장, 룰 박스에서 룰 편집 열기, 디버거 따라가기의 Vitest 와 e2e `mdm-ruleSetEdit.spec.ts` 갱신.
- 도커는 쓰지 않는다. DB 검증은 SQLite 만 쓴다.

## 12. 결정하지 않은 것

- 흐름 모델 패키지는 엔진이 실행해야 하므로 엔진 모듈에 두는 것이 기본값이다. 화면 쪽 TS 구현을 공용 코퍼스로 맞추는 방식은 기존 `set-model.ts` 를 따른다. 세부는 구현 계획에서 정한다.
- 운영 기록 저장·재생(A8)을 언제 할지는 2단계 뒤에 정한다.
