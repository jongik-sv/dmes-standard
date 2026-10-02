# 룰 세트 흐름도 — 하위 세트 호출(SET 노드)과 편집 화면 안 세트 탭

- 날짜: 2026-10-01
- 갱신 2026-10-02: C-D2·§0·§1.1·§6·§8·§14 를 룰 세트 버전 관리(D-144 2단계, docs/superpowers/plans/2026-10-02-mdm-versioning-phase2-rule-set.md)에 맞췄다. D-136 모델 반영은 따로 한다.
- 앞 문서: `2026-10-01-rule-set-flow-catch-design.md`(받는 노드 `CATCH` — 이 문서는 받는 노드를 `SET` 노드에도 붙인다), `2026-09-29-rule-set-flow-design.md`(흐름 모델 §3·실행 의미 §4·검사 §5·OASIS §6)
- 엔진: `src/backend/maru-mdm-engine`(`spi/DefinitionLookup`·`flow/*`·`rule/MdmRuleEngine`·`rule/RuleSetResult`·`rule/RunTrace`·`expr/EngineEvaluationException`)
- 서버: `src/backend/mdm/lib`(`common/rule/RuleSetAnalyzer`·`RuleSetPathState`·`RuleIoReader`·`RuleSetRunner`·`definition/StoredDefinitionLookup`·`check/ledger/RuleSetOrderCheck`, `dme/ruleSetEdit/service/RuleSetEditService`·`RuleSetWrites`, `entity/MdmRuleSet`)
- DB: `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/`(`TB_MDM_RULE_SET` 은 V8 생성·V14 재생성, 세트 버전 표 `TB_MDM_RULE_SET_VER` 는 D-144 2단계 V18. 새 번호는 착수 시 확인)
- 화면: `src/frontend/m-mdm/pages/dme/ruleSetEdit/`(`page.tsx`·`state/useRuleSetEdit.ts`·`state/edit-history.ts`·`canvas/shortcuts.ts`·`set-model.ts`·`flow-model.ts`·`links.ts`·디버거)

## 0. 범위와 사용자 요청

| ID | 기능 | 사용자 요청(원문) |
|---|---|---|
| C1 | 룰 세트에서 다른 룰 세트 호출 | "또 룰 세트에서 또 다른 룰 세트를 호출하게 하려면 어떻게 해야할까? 너무 복잡해질까?" |
| C2 | 룰 세트 편집 화면 안에 세트 탭 여러 개 | "그럼 룰 세트편집 화면이 여러개 떠야 할 수도 있겠네. 안에 탭으로 여러개 뜨게 하는게 좋겠지?" "룰세트 편집 안에 여러개의 탭을 의미하는거야" |

사용자는 받는 노드(CATCH) 스펙 다음에 이 스펙을 쓰는 순서를 승인했다("응 그 순서로 스펙 써줘."). 사용자에게 제시하고 승인받은 방향은 다음과 같다.

- 하위 세트를 **룰 하나처럼 다루는 블랙박스 노드**로 만든다. 입력은 하위 세트의 입력이고, 돌려받는 값은 하위 세트의 **최종 결과**(세트 안에서 아무도 읽지 않는 결과, `set-model.ts` `isFinalResult`)뿐이다.
- 하위 세트는 **판정 시각에 유효한 RELEASED 버전**을 쓰고(2026-10-02 D-144 2단계, 세트 버전 관리), 폐기(DEPRECATED)하지 않은 세트만 부른다.
- 하위 세트를 고칠 때 부르는 세트가 깨지지 않게 저장 때 다시 검사한다. 세트끼리의 순환은 저장 때 막고 실행 때는 깊이를 제한한다.
- 하위 세트에서 처리되지 않은 exception 은 부모의 `SET` 노드에서 난 것으로 올라와, 부모가 받는 노드로 받을 수 있다.
- 실행 기록에 하위 기록을 품고, 디버거는 "안으로 들어가기"로 하위 흐름을 따라간다.

제외(§14): 변수 이름 바꿔 넘기기(매핑), 캔버스에서 하위 세트 펼쳐 보이기, 재귀 호출, 편집 화면 밖(포털 탭)으로 세트를 여러 개 여는 방식.

## 1. 노드와 저장 형식

`FLOW_JSON` 의 `nodes` 에 `SET` 노드를 더한다. 흐름 구조에서는 RULE 과 같다(들어오는 선 1, 나가는 선 1, 갈래 안·밖 어디든).

```json
{ "id": "s1", "type": "SET", "setId": "QD_S_PRICE", "label": "단가 결정" }
```

- `setId`: 부르는 세트 ID. `label`: 화면 표시용.
- 받는 노드(`CATCH`)의 `attachTo` 는 RULE 또는 SET 을 가리킬 수 있다. 돌아오는 MERGE 의 `splitId` 도 SET 노드 ID 일 수 있다(CATCH 스펙 §2·§3 의 RULE 자리에 SET 을 함께 둔다).
- `version` 은 1 그대로 둔다(CATCH 스펙 X-D7, D-125 와 같은 판단).
- Java `FlowNode` 에 `setId`(SET 만 씀)를 더하고 `NodeKind` 에 `SET` 을 더한다. 기존 생성자는 null 로 위임한다.

### 1.1 DB: `CALL_SET_IDS` 칸(세트 버전 행)

`TB_MDM_RULE_SET_VER`(D-144 2단계 V18 이 만든 세트 버전 표 — 흐름이 버전마다 다르므로 부르는 세트 목록도 버전마다다)에 `CALL_SET_IDS`(TEXT, NOT NULL, 기본 `'[]'`, `json_valid` CHECK)를 더한다. 흐름의 SET 노드를 깊이 우선으로 펼친 **중복 없는 세트 ID 목록**이다. 서버가 저장할 때 흐름에서 계산해 채우고, 화면은 보내지 않는다.

- 쓰는 곳: "이 세트를 부르는 세트" 조회(§6 연쇄 재검사, 폐기 거부, 속성 패널의 부르는 세트 목록).
- `RULE_IDS` 는 지금처럼 **이 세트 흐름의 RULE 노드만** 담는다. 하위 세트 안의 룰은 넣지 않는다. 그래서 "이 룰을 담은 세트" 조회(`RuleSetOrderCheck`, 세트 목록 화면)의 뜻은 바뀌지 않고, 간접 포함은 `CALL_SET_IDS` 로 따라간다.
- 마이그레이션: 번호는 착수 시 `flyway-migration-add` 로 다시 정한다(V16·V17·V18 은 이미 쓰였다). MDM 은 SQLite 방언만 있다(ADR-0004). `flyway-migration-add` 스킬의 무조건 적용 조건은 aps-core·mcm-core 라 해당하지 않는다. V14 와 같은 방식으로 쓴다.
  - ADD COLUMN 대신 테이블을 다시 만든다. 칼럼 순서 불변식(업무 칼럼 + 감사 칼럼, `MdmBusinessRuleMigrationTest`) 때문에 `CALL_SET_IDS` 를 `FLOW_JSON` 바로 뒤에 둔다.
  - 재생성 순서는 V17·V18 의 `_BAK` 경유 순서를 따른다.
  - `INSERT ... SELECT` 는 칼럼명을 모두 적고 `CALL_SET_IDS` 에 `'[]'` 를 넣는다. 지금 SET 노드가 있는 세트는 없으므로 데이터 이관은 없다. PRAGMA 를 쓰지 않는다.
  - `MdmRuleSetVer` 엔티티, `RuleSetWrites.updateDraft`, `MdmBusinessRuleMigrationTest` 기대 칼럼, `mdm/sample/mdm-local-sample.sql` 을 함께 고친다.

## 2. 하위 세트의 겉모양(interface)

부모가 보는 하위 세트는 입력과 출력뿐이다. 이것을 **겉모양** `SetCallIo` 라 부른다.

```
SetCallIo(setId, exists, status, inputs: List<IoName>, outputs: List<OutputName>)
OutputName = IoName + always(boolean)
```

- `inputs`: 하위 세트 흐름의 입력 변수(`RuleSetAnalyzer.io(flow, rules).inputs`, 화면 `flowIo` 와 같은 값). 일부 IF 갈래에서만 읽는 입력도 넣는다.
- `outputs`: 하위 세트의 최종 결과(같은 `io` 의 결과 가운데 readers 가 빈 것). 중간 결과는 넣지 않는다.
- `always`: END 에서 반드시 정의되는가. 하위 세트 흐름을 `RuleSetPathState` 로 END 까지 돌려, END 직전 상태의 `defined` 에 있으면 true, `maybe` 에만 있으면 false 다. END 로 가는 모든 경로를 센다. 받는 노드의 처리 갈래가 END 로 가는 경로도 포함한다.
- 하위 세트가 다시 SET 노드를 가지면 그 손주 세트의 겉모양을 먼저 구해 RULE 처럼 끼운다(깊이 상한 §3.3 안에서 끝난다).
- **겉모양은 서버에서만 계산한다**(`RuleSetInterface`, `mdm/lib common/rule`). 화면은 서버가 준 `SetCallIo` 를 받아 부모 흐름의 검사(`flowChecks`)에 넣기만 한다. 실행도 저장된 하위 세트를 쓰므로, 화면이 저장 안 한 하위 세트로 겉모양을 다시 계산하면 실행과 어긋난다. 동치 코퍼스는 "SET 노드가 있는 부모 흐름 + 주어진 `SetCallIo`" 사례로 분석기 두 벌을 고정한다.

## 3. 실행 의미

| 상황 | 실행 |
|---|---|
| SET 노드에 닿음 | 조회기 `ruleSet(setId)` 로 하위 세트를 읽는다. 없으면 `SET_NOT_FOUND`, 폐기면 `SET_DEPRECATED`(둘 다 받지 않는 코드, 세트 중단) |
| 하위 세트 실행 | 부모 `ctx` 의 **사본**을 입력 레코드로 하고, 같은 `evalTs` 로 하위 흐름을 실행한다 |
| 하위 세트가 끝까지 감 | 하위 세트 `ctx` 에서 겉모양 `outputs` 이름 가운데 **값이 있는 이름만** 부모 `ctx` 에 덮어쓴다. 중간 결과와 하위 세트의 `CATCH_*` 는 넘기지 않는다 |
| 하위 세트에서 처리되지 않은 exception | §4 |

- 하위 세트의 입력 키 검사는 하위 세트가 평소처럼 스스로 한다(1단계 스펙 §4).
- 부모의 **입력 키 사전 검사**에는, 부모에서 반드시 실행되는 SET 노드라면 하위 세트의 반드시 실행되는 입력을 포함한다. 그 SET 노드에 `INPUT_ERROR` 를 받는 노드가 있으면 빼고 SET 노드 실행 직전에 검사한다(CATCH 스펙 X-D9 와 같은 이유).
- 결정적 실행은 그대로다. 하위 세트도 같은 입력·같은 평가 시각이면 같은 결과를 낸다.

### 3.1 운영 결과

- `RuleSetResult` 에 `calls`(실행한 SET 노드마다 `SetCall(nodeId, setId, result: RuleSetResult)`, 실행 순서)를 더한다. `steps` 는 지금처럼 이 세트의 RULE 결과만 담는다.
- `PathStep` 에 `callIndex`(SET 노드 결과가 `calls` 의 몇 번째인지)를 더한다. RULE 의 `stepIndex` 와 같은 방식이다.
- `finalValues` 는 지금 정의(마지막 노드 뒤 결과 변수 전체, 입력 키 제외)를 그대로 쓴다. 하위 세트에서 넘겨받은 출력도 이 세트의 결과 변수로 센다.

### 3.2 실행 기록

- `NodeTrace` 에 `sub`(하위 세트의 `RunTrace`)를 더한다. SET 노드만 쓴다. `reads`(부모 `ctx` 에서 하위 입력 이름의 값)와 `outputs`(넘겨받은 이름 → 값)도 SET 노드에 채운다.
- 하위 기록 안의 E4 값 고치기(4단계)는 이번에 하지 않는다. 고치기는 최상위 세트의 노드에만 쓴다(§14).

### 3.3 순환과 깊이

- 실행 중인 호출 경로(세트 ID 목록)에 같은 세트가 다시 나오면 `SET_CALL_CYCLE` 로 중단한다.
- 최상위 세트에서 하위로 들어가는 단계가 **5 를 넘으면** `SET_CALL_DEPTH` 로 중단한다.
- 둘 다 받지 않는 코드다. 저장 때 검사(§5)가 먼저 막으므로, 실행 때 검사는 동시 수정 같은 예외 상황의 안전장치다.

## 4. exception 과 받는 노드

### 4.1 하위 세트에서 처리되지 않은 exception

- 하위 세트 안에서 받는 노드 없이 난 위반은 SET 노드에서 난 것으로 본다. 종류는 CATCH 스펙 §1 의 코드 → 종류 표를 그대로 쓴다(`INPUT_ERROR`·`EVAL_ERROR`·`HIT_CONFLICT`).
- 받는 노드가 있으면 하위 세트의 출력은 부모 `ctx` 에 쓰지 않고, 처리 갈래를 실행한다. `CATCH_RULE` 은 하위 세트 안에서 실패한 룰 ID, `CATCH_CODE`·`CATCH_MSG` 는 그 위반의 코드·메시지다.
- 처리 갈래가 실패 위치를 알 수 있게 예약 이름 **`CATCH_SET`**(위반이 난 가장 안쪽 세트 ID)을 더한다. RULE 에 붙은 받는 노드에서는 그 룰을 담은 세트(지금 세트) ID 다. CATCH 스펙 §4 표와 §6 `ReservedNames` 에 한 줄씩 더해야 한다(§13 C-D7).
- 받지 않는 코드(CATCH 스펙 §1, 그리고 §3.3 의 두 코드)는 하위 세트에서 나도 세트 전체를 중단한다.
- 중단될 때 던지는 `Violation` 에 `setPath`(최상위에서 위반 세트까지 거친 SET 노드 ID 목록, 이 세트에서 났으면 빈 목록)를 더한다. `RuleErrorText` 는 `setPath` 가 있으면 문구 앞에 "세트 A › 단가 결정(s1) › " 처럼 경로를 붙인다.

### 4.2 하위 세트가 처리 갈래로 끝남: `SUBSET_ENDED`

하위 세트가 자기 받는 노드의 처리 갈래로 END 에 닿으면(`endedBy` 가 있음), 부모에게 어떻게 보일지 정해야 한다.

- **새 종류 `SUBSET_ENDED`(화면 이름 "하위 세트 예외 끝")** 를 둔다. SET 노드에 붙은 받는 노드만 고를 수 있다.
- **받는 노드가 있을 때만 exception 이다.** `SUBSET_ENDED` 를 받는 노드가 없으면 하위 세트는 정상 완료로 보이고, 출력도 §3 대로 넘긴다. 결과 없음(CATCH 스펙 X-D3)과 같은 opt-in 규칙이다.
- 받는 노드가 있으면 출력을 넘기지 않고 처리 갈래를 실행한다. `CATCH_CODE` 는 `SUBSET_ENDED`, `CATCH_RULE`·`CATCH_SET` 은 하위 세트를 끝낸 받는 노드가 받은 룰과 세트, `CATCH_MSG` 는 그 받는 노드의 `label`(없으면 노드 ID)이다.
- 기본안(늘 정상 완료로 보고 `caught` 에만 남김)에서 바꾼 이유: 기본안이면 부모 작성자가 하위 세트의 조기 종료에 대응할 방법이 없다. opt-in 으로 두면 받는 노드가 없을 때의 동작은 기본안과 같고, 필요한 부모만 처리할 수 있다.
- `NO_RESULT` 는 SET 노드에 붙일 수 없다. 하위 세트 안 룰의 결과 없음은 하위 세트의 일이고, 처리되지 않으면 NULL 로 진행하므로 부모까지 오지 않는다.

### 4.3 `caught`·`endedBy` 전달

- 하위 세트의 `caught` 항목은 부모 `caught` 에도 이어 붙인다. `CaughtException` 에 `setPath` 를 더해(이 세트에서 받았으면 빈 목록) 어느 세트에서 받았는지 남긴다. 그래서 OASIS 는 최상위 결과의 `caught` 하나만 보면 된다.
- `endedBy` 는 **그 세트 자신의** 받는 노드만 가리킨다. 하위 세트의 `endedBy` 는 `calls[i].result.endedBy` 에 있다. 부모가 `SUBSET_ENDED` 를 받으면 그 받는 노드가 부모의 `caught` 에 한 항목으로 따로 들어간다.

## 5. 정적 검사

서버 `RuleSetAnalyzer` 와 화면 `set-model.ts` 를 함께 고치고 `rule-set-corpus.json` 에 사례를 더한다. 분석기는 SET 노드를 **RULE 처럼** 본다. 읽는 이름은 `SetCallIo.inputs`, 만드는 이름은 `outputs` 다. 그래서 `ORDER`·`CYCLE`·`IF_SIBLING`·`PAR_SIBLING`·`DUP_RESULT` 검사는 노드 종류만 넓히면 그대로 돈다.

- `always=false` 인 출력은 그 SET 노드 뒤에서 `maybe` 로 센다. 뒤에서 읽으면 `FLOW_PARTIAL` 경고다.
- 받는 노드가 붙은 SET 노드의 정의된 변수 규칙은 CATCH 스펙 §5 와 같다(RULE 자리에 SET).

| 코드(`RuleSetCheck`) | 수준 | 내용 |
|---|---|---|
| `CALL_MISSING` | 거부 | `setId` 가 없거나, 세트가 없거나, 폐기 세트다 |
| `CALL_CYCLE` | 거부 | 저장된 세트들의 `CALL_SET_IDS` 와 이 흐름을 합친 호출 그래프에 순환이 있다(자기 자신 호출 포함) |
| `CALL_DEPTH` | 거부 | 이 세트에서 가장 깊은 하위 세트까지 단계가 5 를 넘는다. 이 세트를 부르는 부모까지 합친 깊이도 본다 |
| `CALLER_BROKEN` | 거부 | 이 저장으로 겉모양이 바뀌어, 부르는 세트에 없던 거부 검사가 새로 생긴다(§6) |
| `FLOW_CATCH`(CATCH 스펙) | 거부 | SET 노드 받는 노드에 `NO_RESULT`, RULE 노드 받는 노드에 `SUBSET_ENDED` |
| `CATCH_NEVER`(CATCH 스펙) | 경고 | `SUBSET_ENDED` 인데 하위 세트에 END 로 가는 처리 갈래가 없다 |

- `CALL_CYCLE`·`CALL_DEPTH`·`CALLER_BROKEN` 은 저장된 다른 세트를 읽어야 하므로 서버만 판정한다. 화면은 저장 응답의 거부 목록으로 보인다. `CALL_MISSING` 은 화면이 가진 `SetCallIo.exists`·`status` 로 미리 보인다.

## 6. 연쇄 재검사

하위 세트나 그 안의 룰을 바꾸면 부르는 세트의 동작이 즉시 바뀐다. 그래서 겉모양이 바뀌는 저장은 부르는 세트를 다시 검사한다.

### 6.1 세트 S 저장(`RuleSetEditService.save`)

1. S 흐름의 검사(지금의 `RuleSetAnalyzer.checks` + §5)를 돌린다.
2. S 의 새 겉모양 I′ 을 계산해 저장된 겉모양 I 와 비교한다. 비교 대상은 입력의 이름·타입, 출력의 이름·타입·`always` 다. 같으면 끝이다.
3. 다르면 `CALL_SET_IDS` 에 S 를 담은 **폐기하지 않은 부모의 RELEASED 버전**(저장 기준 시각 이후 유효한 것) P 마다, P 흐름을 S 의 겉모양만 I′ 으로 바꿔 다시 검사한다. 저장 전 P 검사 결과에 없던 거부 항목이 생기면 S 저장을 거부한다(`CALLER_BROKEN`, 문구 "세트 P: {P 의 새 거부 문구}").
4. P 의 겉모양도 바뀌면 P 를 부르는 세트로 3 을 되풀이한다. 깊이 상한(5) 안에서 끝난다.
5. 경고(`FLOW_PARTIAL` 등)가 새로 생기는 것은 막지 않는다. 저장 결과 메시지에 "부르는 세트에 경고가 생겼다"와 세트 목록을 싣는다.

### 6.2 세트 S 폐기(`delete`)·되살리기(`restore`)

- 부모의 유효한 RELEASED 버전이 S 를 부르면 폐기를 거부한다(`CALLER_BROKEN`, 문구에 부모 목록). 부모를 먼저 고치거나 폐기해야 한다.
- 되살리기는 S 자신의 검사만 돈다(지금과 같다). 순환·깊이는 §5 가 본다.

### 6.3 룰 R 저장·상신(`RuleSetOrderCheck` 와 같은 지점: TABLE·COLUMNS·STORED)

- 새 검사 `RuleSetCallerCheck`(`RuleSaveCheck`, `@Order(2)`)를 더한다. R 을 `RULE_IDS` 에 담은, 폐기하지 않은 세트의 RELEASED 버전(저장 기준 시각 이후 유효한 것) S 마다, R 만 저장하려는 정의로 바꿔 S 의 겉모양을 다시 계산한다(다른 룰은 `RuleSetOrderCheck` 처럼 최신 RELEASED).
- S 의 겉모양이 바뀌면 §6.1 의 3·4 를 그대로 돈다. 부모에 새 거부 항목이 생기면 룰 저장 검사 오류 `SET_CALLER_BROKEN`(`RuleSaveIssueCode`)으로 막는다.
- 연쇄: 룰 R → R 을 담은 세트 S → S 를 부르는 부모 P → P 를 부르는 세트 … 순으로 올라간다.
- 공용 계산은 `SetCallerRecheck`(mdm/lib `common/rule`) 한 곳에 두고 세트 저장·폐기와 룰 검사가 함께 쓴다.

## 7. 엔진 계약 변경

계약 네 벌(`docs/mdm/engine-contract.md`, 엔진 스키마, 엔진 Java, `m-mdm/src/contract/engine-contract.generated.ts`)과 코퍼스를 한 번에 고친다. CATCH 스펙 §6 변경 위에 더한다.

| 대상 | 변경 |
|---|---|
| `DefinitionLookup.NodeKind` | `SET` 추가 |
| `DefinitionLookup.FlowNode` | `setId` 추가(SET 만 씀) |
| `CatchKind` | `SUBSET_ENDED` 추가 |
| `EngineEvaluationException.Code` | `SET_CALL_CYCLE`, `SET_CALL_DEPTH` 추가(받지 않는 코드) |
| `Violation` | `setPath` 추가(빈 목록이 기본) |
| `RuleSetResult` | `calls`(`SetCall(nodeId, setId, result)`) 추가 |
| `PathStep` | `callIndex` 추가 |
| `CaughtException` | `setPath` 추가 |
| `NodeTrace` | SET 노드의 `sub`(하위 `RunTrace`)·`reads`·`outputs` |
| `ReservedNames` | `CATCH_SET` 추가 |

엔진은 지금처럼 DB 를 부르지 않는다. 하위 세트도 `DefinitionLookup.ruleSet` 으로 받는다(ADR-0005 D1·D3 그대로).

## 8. 서버·OASIS

- `RuleSetRunner.run`·`execute` 는 바뀐 `RuleSetResult` 를 그대로 싣는다. `RuleSetRunResult` 에 `calls` 요약(노드 ID·세트 ID·하위 `endedBy`)을 더한다.
- `StoredDefinitionLookup.ruleSet(setId, evalTs)` 는 D-144 2단계에서 (세트, 판정 시각) 캐시를 이미 갖는다. 하위 세트도 같은 `evalTs` 로 고른다. 한 실행에서 같은 하위 세트를 여러 번 부를 수 있고, 인스턴스는 호출마다 만들므로 다른 실행과 캐시를 나누지 않는다.
- `ruleSetEdit.bpmn` 에 action 두 개를 더한다.
  - `callIo`: 세트 ID 목록 → `SetCallIo` 목록. 팔레트로 SET 노드를 놓을 때와 다른 탭이 저장했을 때 쓴다.
  - `callers`: 세트 ID → 그 세트를 부르는, 폐기하지 않은 세트 목록(유효한 RELEASED 버전이 부르는 것, 속성 패널).
- `view` 응답(`RuleSetViewResult`)에 흐름의 SET 노드들의 `SetCallIo` 를 싣는다. 룰 입출력을 싣는 방식과 같다.
- `simulate` 응답(`RuleSetSimulateResult`)에 `calledFlows`(실행 중 부른 세트 ID → 판정 시각의 RELEASED 버전 `FLOW_JSON`, `view` 포함)를 싣는다. 디버거가 하위 흐름을 그릴 때 쓴다(§11).

## 9. 편집기: SET 노드

- **놓기**: 도구 상자(`FlowToolbox`)와 우클릭·[+] 메뉴에 「룰 세트」를 더한다. 검색 팝업은 폐기하지 않은 세트만 보이고, 지금 세트 자신은 뺀다. 순환이 될 세트는 저장 때 `CALL_CYCLE` 로 거부하므로 팝업에서 미리 거르지는 않는다.
- **모양**: 룰 노드와 같은 크기에 굵은 테두리(BPMN call activity)와 세트 아이콘. 제목은 `label`, 없으면 세트 이름이다. 입력·출력 개수 칩을 보인다. 외관 옵션(`view.styles`)은 이번에 SET 에 열지 않는다.
- **링크 아이콘**: 하위 세트를 **같은 화면 안의 새 탭**으로 연다(§10). 룰 노드의 링크 아이콘이 `openRuleEdit` 로 포털 탭을 여는 것과 다르다.
- **속성 패널**: 세트 ID·이름·상태, 겉모양 표(입력, 출력과 "항상 / 일부 경로" 표시), 이 세트를 부르는 세트 목록(`callers`, 누르면 탭으로 열기).
- **받는 노드**: 룰 노드와 같은 연결점·우클릭으로 붙인다. 고를 수 있는 종류는 `INPUT_ERROR`·`EVAL_ERROR`·`HIT_CONFLICT`·`SUBSET_ENDED` 다.
- **변수 칩·경고 점**: 룰 노드와 같다. 겉모양의 출력을 다음 선의 칩으로 보이고, 입력이 모자라면 경고 점을 찍는다.

## 10. 편집 화면 안 세트 탭

### 10.1 지금 구조(2026-10-01 코드 확인)

- `page.tsx` 의 `RuleSetEditPage({ tabId })` 가 세트 **하나**를 맡는다. 세트 상태는 `useRuleSetEdit()` 한 벌이다(`view`·`flow`·`rules`·`condIo`·`mode`·`setName`·`description`·`dirty`·`flowVersion`·`viewEpoch`, 되돌리기 `EditHistory`).
- 같은 컴포넌트에 화면 상태가 있다. 선택(`selectedId`·`selectedEdgeId`·`multiSel`), 도구(`tool`), 메뉴, 즉석 편집(`editingCond`·`editingLabel`), 초점·맞추기 신호, 아래 탭(`bottomTab`·`bottomCollapsed`)이다. 디버거는 `useSimulation`, 테스트 케이스는 `useTestCases` 다.
- 보는 사람 설정은 localStorage 다. `loadVarDisplay`, `storeKeys.miniMap`, 분할 크기 `STORAGE_KEY = "mdm.dme.ruleSetEdit"` 가 있다.
- 캔버스 밖 ⌘Z(`outsideUndoRef`)는 `document` keydown 으로 받고, `isShown(canvasHostRef)`(`canvas/shortcuts.ts`)로 화면이 보이지 않으면 무시한다. 포털이 고르지 않은 탭을 `display:none` 으로 숨기므로, 다른 포털 탭의 ⌘Z 가 숨은 흐름을 되돌리지 않는다(I1).
- 저장 안 한 변경이 있으면 `beforeunload` 확인을 건다(`useRuleSetEdit`). 세트 열기는 위 바의 `IdPicker` 와 포털 파라미터(`useMdmPageParams` → `open(setId)`)다.

### 10.2 나누는 방식

- 지금 `RuleSetEditPage` 본문을 **`RuleSetEditor`**(세트 탭 하나) 컴포넌트로 옮긴다. 페이지는 탭 틀(`RuleSetTabs`)이 되고, Mantine `Tabs` 에 `keepMounted` 를 켜서 탭마다 `RuleSetEditor` 를 하나씩 띄운다.
- **탭마다 따로 두는 상태**: `useRuleSetEdit` 전부(되돌리기 스택 포함), 모드, 선택·도구·메뉴·즉석 편집·초점, 아래 탭, `useSimulation`, `useTestCases`. 근거: 이들은 모두 "어느 세트를 편집 중인가"에 매인 상태다. 세트를 오갈 때 섞이면 되돌리기가 다른 세트의 흐름을 덮는다.
- **함께 쓰는 상태**: 보는 사람 설정(변수 표시·미니맵·분할 크기), RBAC, 세트 검색. 근거: 화면 단위 취향이라 탭마다 다르면 오히려 혼란스럽다. localStorage 키는 바꾸지 않는다.
- **숨은 탭의 ⌘Z**: 고르지 않은 탭 패널이 `display:none` 으로 숨으면 지금의 `isShown` 판정이 그대로 막는다. 구현 때 `mantine-aggrid-ui` 스킬로 Mantine 9.6 `Tabs` `keepMounted` 가 숨은 패널을 `display:none` 으로 두는지 확인하고, 아니면 숨은 패널에 `display:none` 을 직접 준다. 캔버스 안 단축키는 초점이 있는 탭에서만 받으므로 바꿀 것이 없다.
- `beforeunload` 는 탭마다의 `useRuleSetEdit` 가 각자 건다. 하나라도 dirty 면 확인이 뜬다.

### 10.3 탭 열기·닫기

- **위 바 세트 고르기(`IdPicker`)**: 지금 탭에서 연다. 동작은 지금과 같다(dirty 면 확인).
- **SET 노드 링크·속성 패널의 세트 링크**: 그 세트가 이미 열린 탭이 있으면 그 탭으로 간다. 없으면 지금 탭 오른쪽에 새 탭을 연다.
- **포털 파라미터(`setId`)**: 링크와 같다. 단, 세트를 아직 안 연 빈 탭 하나뿐이면 그 탭에서 연다.
- **탭 수 상한 8개**. 넘으면 열지 않고 메시지 줄에 "세트 탭은 8개까지 연다. 다른 탭을 닫고 다시 연다"를 보인다. 탭마다 캔버스(React Flow)와 디버거를 띄우므로 수를 묶는다.
- **탭 머리**: 세트 ID(이름은 툴팁), 저장 안 한 변경 점(●), 닫기 버튼. 마지막 탭은 닫기 버튼이 없다.
- **닫기**: 저장 안 한 변경이 있으면 확인 창(`modals.openConfirmModal`)을 띄운다. "저장하지 않은 변경이 있다. 닫으면 변경을 버린다."

### 10.4 탭 사이 연동

- 탭 틀이 `RuleSetTabsContext` 로 `openSet(setId)` 와 `notifyWritten(setId)` 를 내려 준다.
- 어떤 탭에서 세트 S 를 저장·폐기·되살리기하면 `notifyWritten(S)` 를 부른다. 흐름에 `setId=S` 인 SET 노드가 있는 다른 탭은 `callIo([S])` 로 겉모양을 다시 받고, 검사를 다시 계산한다(`checks` 는 `rules` 와 함께 SetCallIo 맵이 바뀌면 다시 계산).
- 세트 S 저장이 `CALLER_BROKEN` 으로 거부되면, 메시지 줄의 부모 세트 이름을 누를 때 `openSet` 으로 그 세트를 탭에 연다.
- 부모 탭에서 디버거를 실행할 때, 부르는 하위 세트의 탭이 저장 안 한 상태면 경고를 보인다. "하위 세트 S 에 저장하지 않은 변경이 있다. 실행은 저장된 정의로 한다."

## 11. 디버거

- SET 노드: 실행되면 초록 표시에 넘겨받은 출력 대표값 칩을 보인다. 하위 세트에서 처리되지 않은 오류로 멈췄으면 빨간 테두리, 받는 노드로 넘겼으면 CATCH 스펙의 CAUGHT 표시다.
- **안으로 들어가기**: SET 노드 상세에 [안으로 들어가기] 를 둔다. 누르면 **같은 캔버스**가 하위 세트 흐름(`calledFlows`)을 읽기 전용으로 그리고, 하위 `RunTrace` 로 겹침과 따라가기를 바꾼다. 캔버스 위에 경로 표시("세트 A › 단가 결정(s1)")를 두고, 앞 단계를 누르면 돌아온다. 새 탭을 열지 않는다. 이것은 기록 재생이지 편집이 아니라서, 탭을 열면 기록 문맥(어느 실행의 어느 호출인가)이 끊긴다. 하위 세트를 고치려면 SET 노드 링크로 탭을 연다.
- 하위 흐름 안에서는 편집·E4 값 고치기를 끈다. 값 표·실행 비교 탭은 지금 보고 있는 단계(세트)의 기록을 보인다.
- 노드 상세: SET 노드는 세트 ID, 읽은 입력값 표, 넘겨받은 출력 표, 하위 `endedBy`·`caught` 건수를 보인다.

## 12. 테스트

- 엔진: 하위 세트 출력 넘기기(최종 결과만, 중간 결과·`CATCH_*` 제외), 부모 `ctx` 사본(하위 세트가 부모 값을 바꾸지 못함), `always=false` 출력이 없을 때 넘기지 않음, `SET_NOT_FOUND`·`SET_DEPRECATED` 중단, 하위 위반을 부모 받는 노드가 받음(`CATCH_SET`·`CATCH_RULE`), `SUBSET_ENDED` 받음·안 받음, `caught`·`setPath` 전달, `SET_CALL_CYCLE`·`SET_CALL_DEPTH`, 부모 입력 사전 검사에 하위 입력 포함·`INPUT_ERROR` 받으면 제외, `evaluateSet`·`traceSet` 경로와 `calls`·`sub` 일치.
- 서버: 겉모양 계산(`always`, 손주 세트), `CALL_SET_IDS` 저장, 연쇄 재검사 3단(룰 → 세트 → 부모 → 조부모), 폐기 거부, `CALL_CYCLE`·`CALL_DEPTH`, `RuleSetCallerCheck`, 마이그레이션(§1.1)과 칼럼 순서 테스트.
- 코퍼스(`rule-set-corpus.json`): SET 노드가 있는 부모 흐름 + 주어진 `SetCallIo` 로 `ORDER`·`DUP_RESULT`·`FLOW_PARTIAL`(always=false)·`IF_SIBLING`·`CALL_MISSING`·`FLOW_CATCH`(SET 의 `NO_RESULT`) 사례. Java·TS 가 같은 결과를 내야 한다.
- 화면: SET 노드 놓기·검색, 링크로 새 탭·이미 열린 탭으로 이동, 탭 상한, dirty 탭 닫기 확인, 숨은 탭에서 ⌘Z 무시, 다른 탭 저장 뒤 부모 탭 검사 갱신, 디버거 들어가기·돌아오기.
- e2e(`mdm-ruleSetEdit.spec`): 세트 A 에 세트 B 를 SET 노드로 넣고 저장한 뒤, 링크로 B 탭을 열어 B 를 고쳐 저장하고 A 탭 검사가 바뀌는 시나리오 하나. 실행은 사용자 승인 뒤에 한다.

## 13. 결정

결정 ID 는 `C-D` 를 쓴다(node-style 스펙이 `S-D` 를 이미 쓴다).

| ID | 결정 | 근거 |
|---|---|---|
| C-D1 | 하위 세트는 블랙박스 `SET` 노드, 입력은 하위 입력, 출력은 최종 결과만, 이름은 그대로 주고받는다 | 분석기가 SET 을 RULE 처럼 보면 기존 경로 검사가 그대로 돈다. 중간 결과를 숨기면 이름 충돌이 줄어든다 |
| C-D2 | 하위 세트는 판정 시각에 유효한 RELEASED 버전, 폐기 아닌 세트만(2026-10-02 갱신) | 세트도 버전 단위가 되었다(D-144, ADR-0006 K1). 부모와 하위 세트가 같은 판정 시각으로 버전을 고르므로 과거 판정을 재현할 수 있다. 하위 세트 버전을 부모에 박지 않는다(K1 — 참조는 ID 만) |
| C-D3 | `CALL_SET_IDS` 칸을 더하고, `RULE_IDS` 는 자기 RULE 노드만 담는다 | 부르는 세트 조회를 모든 `FLOW_JSON` 해석 없이 한다. "이 룰을 담은 세트"의 뜻을 바꾸지 않는다 |
| C-D4 | 겉모양은 서버에서만 계산하고, 화면은 받아서 검사에 넣는다 | 실행이 저장된 하위 세트를 쓰므로 저장 안 한 하위 세트로 계산하면 실행과 어긋난다 |
| C-D5 | 출력마다 `always` 를 두고 일부 경로 출력은 `maybe` 로 센다 | 하위 세트 IF 갈래나 처리 갈래 끝냄 때문에 출력이 없을 수 있다. 부모가 `FLOW_PARTIAL` 로 알게 한다 |
| C-D6 | 하위 세트 처리되지 않은 위반은 SET 노드에서 같은 종류로 받는다. 받지 않는 코드는 그대로 중단 | CATCH 스펙의 종류 표 하나로 RULE·SET 을 함께 다룬다 |
| C-D7 | 예약 이름 `CATCH_SET` 추가(CATCH 스펙 §4·§6 보정 필요) | 하위 세트 깊은 곳의 실패를 처리 갈래가 구분할 수 있게 한다 |
| C-D8 | 하위 세트의 처리 갈래 끝냄은 opt-in 종류 `SUBSET_ENDED`. 받는 노드가 없으면 정상 완료 | 기본안(늘 정상 완료)이면 부모가 대응할 수 없다. opt-in 이면 받는 노드 없을 때 동작은 기본안과 같다(CATCH X-D3 와 같은 규칙) |
| C-D9 | `caught` 는 최상위까지 `setPath` 를 붙여 이어 붙이고, `endedBy` 는 자기 세트만 | OASIS 는 최상위 결과만 본다. `endedBy` 를 섞으면 어느 세트가 끝났는지 모호해진다 |
| C-D10 | 순환은 저장 때 거부, 깊이 5 초과도 거부. 실행 때 두 코드로 다시 막는다 | 저장 검사가 주 방어고, 실행 검사는 동시 수정 대비 안전장치다 |
| C-D11 | 겉모양이 바뀌는 저장(세트·룰)은 부르는 세트를 연쇄로 다시 검사하고, 새 거부가 생기면 막는다. 새 경고는 막지 않고 알린다 | 하위 세트 수정이 부모 동작을 즉시 바꾸므로 부모가 조용히 깨지면 안 된다 |
| C-D12 | 부모의 유효한 RELEASED 버전이 부르는 세트는 폐기를 거부한다 | 폐기하면 부모 실행이 `SET_DEPRECATED` 로 멈춘다 |
| C-D13 | 편집 화면 안에 세트 탭(최대 8)을 두고, SET 링크는 같은 화면의 새 탭으로 연다 | 사용자 요청. 같은 화면 안이라 저장 알림으로 부모 탭 검사를 바로 갱신할 수 있다 |
| C-D14 | 탭마다 세트 상태·되돌리기·디버거를 따로, 보는 사람 설정은 함께 | 세트별 상태가 섞이면 되돌리기가 다른 세트를 덮는다. 보기 취향은 화면 단위다 |
| C-D15 | 디버거 "안으로 들어가기"는 같은 캔버스에서 경로 표시로 오가고 탭을 열지 않는다 | 기록 재생이지 편집이 아니다. 탭을 열면 기록 문맥이 끊긴다 |
| C-D16 | `version` 1 유지 | CATCH X-D7, D-125 와 같은 판단 |

구현이 끝나면 `docs/mdm/decisions.md` 에 D-135 으로 C-D1~C-D16 을 남긴다. ADR-0005 의 원칙(엔진이 흐름을 실행하고 DB 를 부르지 않음, 흐름 안에 저장·외부 호출 노드 없음)은 그대로 유효하다. SET 노드는 판정 흐름을 부르는 것이고, 하위 세트도 조회기로 받는다.

## 14. 미루는 것

- 변수 이름 바꿔 넘기기(부모 `A` → 하위 `B` 매핑)
- 캔버스에서 하위 세트를 펼쳐 보이기
- 재귀 호출
- 하위 기록 안 E4 값 고치기
- SET 노드 외관 옵션(`view.styles`)
- 편집 화면 밖(포털 탭)으로 세트를 여러 개 여는 방식
- 부르는 세트 목록을 세트 목록 화면(`ruleSetMng`)에 보이기
