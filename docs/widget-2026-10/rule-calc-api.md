# 조업 계산기 API 계약: `ruleCalc` (A0)

2026-10-06 확정. 조업 계산기 위젯(`rule-calc`)이 룰·룰 세트를 입력 칸 자동 생성과 계산에 쓰기 위한 MDM 서비스의 요청·응답 계약이다. 위젯 레인(`rule-calc-widget`)은 이 문서만 보고 일한다. 키·타입·코드를 바꾸면 조정 세션에 알린다.

## 0. 공통

- 서비스: `POST /api/mdm/oasis/ruleCalc/{view|execute|search}`, action 은 `view`(입출력 모양 조회)·`execute`(계산)·`search`(룰·세트 찾기, §1.1) 세 가지다. 액션 이름은 MDM 공통 액션 어휘(RBAC 키)이고, 서비스의 자바 메서드명(`io`·`run`·`search`)과는 별개다. 세 액션 모두 인증만 요구한다(AUTH_ONLY). 구현은 `RuleIoReader`·`RuleSetRunner`·`SetCallIoReader` 를 감싸며, 기존 `ruleEdit`·`ruleSetEdit` 의 execute 는 건드리지 않는다.
- 요청·응답은 JSON 객체이고, OASIS 공통 응답 규칙에 따라 업무 오류(권한·형식 오류)는 HTTP 오류와 메시지로 나간다. 계산을 못 하는 사유(확정 버전 없음, 입력 누락, 평가 오류)는 오류가 아니라 응답 본문의 `messages` 로 돌려준다.
- 버전 선택: **RELEASED 만 쓴다**(룰마다 판정 시각에 적용되는 RELEASED, `RuleVersionPick.RELEASED`). `preview=true` 일 때만 로그인 사용자의 DRAFT(`RuleVersionPick.myDraft`, 상태가 정확히 DRAFT 이고 소유자가 본인인 버전, 없으면 RELEASED)를 쓴다. 사용자 ID 는 요청이 아니라 서버의 `MdmCurrentUser` 에서만 얻으며 요청 본문에 사용자 키를 두지 않는다.
- 숫자 값은 소수 자리를 보존하도록 **문자열**(BigDecimal `toPlainString`)로 주고받는다. 단 너무 큰 출력은 `toString` 으로 과학 표기(`"1E+5000"`)가 된다. 세부는 §4.
- 버전 문자열은 `scale 3` 문자열이다(`"1.001"`).

## 1. 대상 지정

| 키 | 타입 | 설명 |
|---|---|---|
| `targetTp` | `"RULE"` \| `"SET"` | 룰 또는 룰 세트 |
| `targetId` | string | 룰 ID(예 `M47C0001`) 또는 룰 세트 ID(예 `M47_COAT_WT`) |
| `preview` | boolean, 기본 `false` | `true` 이면 내 DRAFT 를 우선 사용(관리 화면 미리보기 전용) |

## 1.1 `search`: 룰·세트 찾기(메서드 `search`)

조업 계산기 편집기에서 룰·세트 ID 를 고르는 용도다. 계산할 수 있는(지금 적용 중인 RELEASED 가 있는) 룰·세트만 찾는다. 읽기 전용이고 인증만 요구한다(AUTH_ONLY, `view`·`execute` 와 같다).

요청: `POST /api/mdm/oasis/ruleCalc/search` `{"targetTp":"ALL","keyword":"M47","preview":false,"limit":50}`

| 키 | 타입 | 설명 |
|---|---|---|
| `targetTp` | `"RULE"` \| `"SET"` \| `"ALL"`, 기본 `"ALL"` | 찾을 종류. 대소문자 무시, 비면 `ALL`. 그 밖의 값은 `INVALID_VALUE` 오류 |
| `keyword` | string, 기본 비움 | ID·이름 부분 일치(대소문자 무시, 앞뒤 공백은 뗀다). 비면 전체. `%`·`_`·`\` 는 와일드카드가 아니라 글자 그대로다 |
| `preview` | boolean, 기본 `false` | `true` 이면 **내**(로그인 사용자) DRAFT 가 있는 룰·세트도 넣는다. 사용자 ID 는 요청이 아니라 서버가 정한다 |
| `limit` | integer, 기본 50, 최대 200 | 돌려줄 최대 건수. 1 미만은 기본, 200 초과는 200 으로 줄인다 |

응답:

```json
{
  "ok": true,
  "rows": [
    {"tp": "RULE", "id": "M47C0001", "name": "원판 중량", "ver": "1.000", "verStatus": "RELEASED", "desc": "설명"},
    {"tp": "SET", "id": "M47_COAT_WT", "name": "코팅 중량", "ver": "1.000", "verStatus": "RELEASED"}
  ],
  "messages": []
}
```

| 키 | 타입 | 규칙 |
|---|---|---|
| `ok` | boolean | 항상 `true`(결과가 0건이어도) |
| `rows[].tp` | `"RULE"` \| `"SET"` | 룰 또는 룰 세트 |
| `rows[].id`·`name` | string | 룰·세트 ID, 헤더 이름 |
| `rows[].ver` | string | `view` 가 고르는 것과 같은 버전, scale 3 문자열(`"1.000"`). `preview=false` 이면 지금 적용 중인 RELEASED, `preview=true` 이고 내 DRAFT 가 있으면 그 DRAFT |
| `rows[].verStatus` | `"RELEASED"` \| `"DRAFT"` | 위 버전의 상태 |
| `rows[].desc` | string | 룰·세트 헤더의 설명이 있을 때만. 없으면 키가 없다 |
| `messages` | array | 지금은 늘 빈 배열(§3 모양을 맞추기 위해 둔다) |

규칙:

- 대상은 **폐기(`DEPRECATED`)가 아닌** 룰·세트 가운데 **판정 시각(지금)에 적용 중인 RELEASED 가 있는 것**이다. RELEASED 가 없고 DRAFT·REQUESTED·APPROVED 만 있거나 미래 적용분만 있는 룰·세트는 빠진다. 폐기 헤더는 `preview=true` 여도 뺀다.
- `preview=true` 이면 상태가 정확히 DRAFT 이고 소유자가 본인인 버전이 있는 룰·세트도 넣는다(RELEASED 가 없어도). 남의 DRAFT 만 있는 것은 넣지 않는다. 내 DRAFT 도 있고 RELEASED 도 있으면 `ver`·`verStatus` 는 DRAFT 쪽이다(`view` 의 `preview` 선택과 같다). REQUESTED·APPROVED 는 DRAFT 가 아니므로 넣지 않는다.
- 정렬은 ID 오름차순(`ALL` 은 룰과 세트를 합쳐 ID 순, 같은 ID 면 룰이 먼저)이고 그 위에서 `limit` 으로 자른다. 정렬은 각 DB 쿼리의 ID 정렬로 limit 을 자른 뒤 `ALL` 병합에서만 자바에서 다시 정렬한다. DB 정렬 규칙이 코드 단위 순서와 다르면(예: PostgreSQL 비 C 로케일) 경계 한 건은 순서가 다를 수 있다.
- 조건과 건수 제한은 DB 쿼리에서 걸고(큰 테이블을 통째로 읽지 않는다), 버전은 돌려줄 행에 대해서만 읽는다.

한계:

- 잘렸는지 알리지 않는다(`limit` 건이 돌아오면 더 있을 수 있다). 편집기는 키워드를 더 좁혀 다시 찾는다.
- 찾은 룰·세트가 `view`·`execute` 로 끝까지 계산된다는 보장은 아니다(세트 안 룰의 RELEASED 가 빠졌거나 정의가 깨졌으면 `view` 가 `NO_RELEASED`·`MDM026` 으로 알린다). 이 액션은 대상 자신의 버전만 본다.
- 하위 세트·세트에 든 룰의 DRAFT 는 보지 않는다(`preview` 는 목록에 오를 대상의 버전만 정한다).
- 이름 검색은 헤더 이름(`MARU_RULE_NAME`·`MARU_RULE_SET_NAME`)과 ID 만 본다. 설명·결과 변수 이름은 보지 않는다.

## 2. `view`: 입력·출력 모양 조회(메서드 `io`)

요청: `POST /api/mdm/oasis/ruleCalc/view` `{"targetTp":"RULE","targetId":"M47C0001","preview":false}`

응답:

```json
{
  "ok": true,
  "target": {"tp": "RULE", "id": "M47C0001", "name": "원판 중량", "ver": "1.000", "verStatus": "RELEASED", "status": "INUSE"},
  "inputs": [
    {"name": "THK", "label": "두께", "dataType": "NUMBER", "scale": 3, "unit": "MM", "required": true}
  ],
  "outputs": [
    {"name": "COIL_WT", "label": "원판 중량", "dataType": "NUMBER", "scale": 2, "unit": "KG"}
  ],
  "steps": [],
  "messages": []
}
```

| 키 | 타입 | 출처·규칙 |
|---|---|---|
| `target.tp`·`id` | string | 요청 그대로 |
| `target.name` | string | 룰은 `RuleIo.ruleName`, 세트는 세트 이름(`SetCallIo.setName`) |
| `target.ver` | string \| null | 룰은 계산에 쓴 버전(`RuleIo.releasedVer`). 세트는 세트 버전 |
| `target.verStatus` | `"RELEASED"` \| `"DRAFT"` \| null | 실제로 고른 버전의 상태. `preview=false` 이면 항상 `RELEASED`(또는 null) |
| `target.status` | string \| null | 룰·세트 헤더의 계산 상태(`CREATED`·`INUSE`·`DEPRECATED` 등, `RuleVersions.effectiveStatus`) |
| `inputs[].name` | string | 요청 `values` 의 키로 그대로 쓴다. 대소문자는 이 응답의 표기를 지킨다 |
| `inputs[].label` | string \| null | `IoName.label`(컬럼 사전 표시명). 없으면 null 이고 위젯은 `name` 을 보인다 |
| `inputs[].dataType` | `"NUMBER"` \| `"STRING"` \| `"BOOLEAN"` \| `"DATE"` | `IoName.dataType`. 풀지 못하면 `STRING` |
| `inputs[].scale` | integer \| null | `IoName.scale`. NUMBER 가 아니거나 모르면 null |
| `inputs[].unit` | string | 단위 코드(§5). 없으면 빈 문자열 `""` |
| `inputs[].required` | boolean | 엔진이 키를 요구하면 `true`. 지금은 모든 입력이 `true`(키는 있어야 하고, 값이 비면 §3 `INPUT_MISSING`) |
| `outputs[].name`·`label`·`dataType`·`scale`·`unit` | | 위 입력과 같은 규칙. 룰은 `RuleIo.results`, 세트는 **최종 결과**(`SetCallIo.outputs`, 뒤 룰이 읽지 않는 결과)만 담는다 |
| `steps` | array | **세트일 때만** 값이 있고 룰이면 빈 배열. 실행 순서대로 `[{"ruleId","name","outputs":[{name,label,dataType,scale,unit}]}]`. 앞 룰 결과(중간값) 표시용 |
| `messages` | array | §3. `view` 도 `NO_RELEASED`·`RULE_DEPRECATED`·`NOT_FOUND` 를 돌려줄 수 있다 |

### 2.1 세트 입력에서 앞 룰 결과를 빼는 규칙

세트의 `inputs` 는 `RuleSetAnalyzer.io` 규칙으로 정한다. 세트의 룰을 흐름(실행) 순서대로 훑으면서, 룰이 읽는 이름이 **앞 룰이 이미 만든 결과 이름이면 입력에서 뺀다**(그 이름은 앞 룰 결과의 `readers` 가 된다). 앞에서 만들지 않은 이름만 입력으로 모으고, 같은 이름은 한 번만(처음 나온 룰의 타입·표시명) 낸다. 예: 코팅중량 세트(`M47C0007` 결과 → `M47C0006` 입력)에서 `M47C0006` 이 읽는 도장부착량 값은 `M47C0007` 이 만들므로 입력 칸에서 빠진다.

- 예약 이름 `CATCH_*`(받는 노드 변수)는 입력에서 뺀다(`RuleSetInterface.of` 와 같다).
- IF 갈래 조건식이 읽는 변수(`RuleIoReader.condIo`)는 **그 IF 앞에서** 만들어진 이름이 아니면 입력에 포함한다. 흐름을 실행 순서로 걸으며 지금까지 만들어진 이름(룰 결과, 하위 세트의 출력)을 쌓고 IF 를 만날 때 비교한다(엔진 `FlowKeys` 가 걸으며 정의된 이름을 추적하는 방식과 같다. 일부 갈래에서만 만들어지는 이름도 만들어진 것으로 친다). 단 **END 로 가서 세트를 끝내는 갈래**(끝내는 IF 갈래, 끝내는 받는 노드 처리 갈래)가 만든 이름은 블록 뒤로 이어지지 않으므로 만들어진 이름에 넣지 않는다(엔진 `FlowKeys.walk`·`guardAll`, `RuleSetInterface.walk` 와 같다). 그 갈래 안쪽 IF 의 조건 변수는 계속 입력으로 모은다. IF 뒤 룰이 만드는 이름을 IF 가 읽으면 그 이름은 입력이다. 시스템 변수(`EVAL_TS`·`_` 접두)와 `CATCH_*` 는 뺀다. 이 입력은 룰 입력 뒤에 붙는다.
- 타입을 풀지 못한 입력(컬럼 사전에도, **세트 안 어느 룰의 선언**(조건·결과 도메인/데이터 타입)에도 없다)의 `dataType` 은 `STRING` 으로 알리지만, `execute` 는 이 입력을 글자로 바꾸지 않고 받은 타입(숫자 BigDecimal·불린·글자) 그대로 엔진에 넘긴다(§3). 한 룰이 타입 없이 읽어도 다른 룰이 그 이름의 타입을 선언했으면 타입을 푼 입력이다(`dataType` 은 처음 읽은 룰 기준이라 `STRING` 일 수 있고, 엔진이 선언 타입으로 바꾼다). IF 조건에서만 쓰는 불린 변수가 타입 없는 입력의 대표 경우다.
- 하위 세트(SET 노드)는 `SetCallIo` 의 입력·최종 결과를 룰처럼 취급한다.
- 입력 순서는 처음 읽은 순서(첫 등장 순)다.

### 2.2 `steps` 와 `outputs` 의 관계

세트 `outputs` 는 세트 밖으로 나오는 최종 결과만이다. 중간 결과(뒤 룰이 읽는 값)는 `steps[].outputs` 에서만 볼 수 있다. 위젯이 「중간값 표시」 옵션을 켰을 때 `execute` 응답의 `steps[].outputs` 값을 이 모양으로 그린다.

## 3. `execute`: 계산(메서드 `run`)

요청: `POST /api/mdm/oasis/ruleCalc/execute`

```json
{"targetTp":"SET","targetId":"M47_COAT_WT","valuesJson":"{\"THK\":\"0.5\",\"WIDTH\":\"1000\"}","evalTs":null,"preview":false}
```

입력 값은 `valuesJson`(입력 이름 → 값의 JSON 객체를 **문자열로**)로 보낸다. 이유: OASIS 요청 변환기가 `params` 의 중첩 객체를 받지 못해(`Generic type` 거절) HTTP 로는 `values` 객체가 닿지 않는다. `values`(객체) 필드는 서비스를 자바에서 직접 부르는 경우 전용이고, 둘 다 오면 `values` 가 이긴다. `valuesJson` 이 JSON 객체가 아니면 `INVALID_VALUE` 오류다.

| 키 | 타입 | 설명 |
|---|---|---|
| `valuesJson` | string | 입력 이름 → 값의 JSON 객체 글자(HTTP 경로). 소수는 BigDecimal 로 정확히 읽는다. 값 규칙은 아래 `values` 와 같다 |
| `values` | object | (서비스 직접 호출 전용) 입력 이름 → 값. 숫자는 문자열 또는 JSON 숫자를 받고(내부 BigDecimal 로 읽는다. double 로 거치지 않는다), 불린은 `true`/`false` 또는 `"TRUE"`/`"FALSE"`, 문자열·일자는 문자열. `view` 가 알려 준 `inputs[].name` 만 의미가 있고 나머지 키는 무시한다. 타입을 풀지 못한 입력(컬럼 사전에도 세트 안 어느 룰의 선언에도 없다)은 받은 타입 그대로 넘긴다. 그중 **IF 조건에만 쓰이는 변수**는 글자가 `TRUE`/`FALSE`(앞뒤 공백 무시·대소문자 무시)이면 불린으로 읽는다. 룰이 읽는 타입 없는 입력의 글자는 늘 글자 그대로다 |
| `evalTs` | string \| null | 판정 시각 KST `yyyy-MM-dd HH:mm:ss`. null 이면 서버 시계. 형식 오류는 `INVALID_VALUE` 오류 |

응답:

```json
{
  "ok": true,
  "result": {"COAT_WT": "12.34"},
  "steps": [
    {"ruleId": "M47C0007", "inputs": {"THK": "0.5"}, "outputs": {"COAT_AMT": "0.020"}, "hit": true, "defaultApplied": false}
  ],
  "messages": [{"code": "RULE_DEPRECATED", "text": "..."}]
}
```

| 키 | 타입 | 규칙 |
|---|---|---|
| `ok` | boolean | 계산이 끝까지 성공했으면 `true`. 입력 누락·확정 버전 없음·평가 오류는 `false`(이때 `result` 는 `{}`, `steps` 는 실행한 데까지) |
| `result` | object | 최종 결과 이름 → 값(§4 규칙). 세트는 `view` 의 `outputs` 이름(세트 **최종 결과**)만 담는다. 중간값(뒤 룰이 읽는 값)은 `steps[].outputs` 에만 있고 `CATCH_*` 이름은 없다. 룰은 룰 결과 전부 |
| `steps[].ruleId` | string | 실행한 룰. 룰 대상이면 그 룰 한 건, 세트면 실행 순서대로(받는 노드로 넘긴 룰은 제외) |
| `steps[].inputs` | object | 그 룰의 입력 이름(`RuleIo.conds`, 식 칸이 읽는 변수 포함) → 그 시점 값(앞 룰 결과 포함). 엔진이 그 룰을 실행하기 직전에 기록한 읽은 값(`NodeTrace.reads`, 받는 노드 처리 갈래의 `CATCH_*` 포함)을 먼저 쓰고, 거기에 없는 이름(식 칸 변수)만 서버가 입력 레코드와 앞 단계 결과를 누적한 값 맵에서 찾는다. 둘 다 없는 이름은 담지 않는다 |
| `steps[].outputs` | object | 그 룰이 만든 결과 이름 → 값 |
| `steps[].hit` | boolean | 일반 행이 적중했으면 `true`(`RuleResult.hits` 가 비지 않음) |
| `steps[].defaultApplied` | boolean | 적중이 없어 기본 행을 썼으면 `true`(`RuleResult.defaultApplied`) |
| `messages[]` | `{code,text}` | 아래 코드표 |

### 3.1 메시지 코드

| code | 의미 | `ok` | 발생 |
|---|---|---|---|
| `NOT_FOUND` | 룰·세트가 없다 | false | view·execute |
| `NO_RELEASED` | 판정 시각에 적용되는 확정(RELEASED) 버전이 없다. 문구는 「확정 버전 없음」으로 시작한다. `preview=true` 인데 내 DRAFT 도 없으면 같은 코드 | false | view·execute |
| `RULE_DEPRECATED` | 폐기(DEPRECATED) 룰이 들어 있다. 계산은 막지 않고 경고만 한다(`RuleSetRunner.RULE_DEPRECATED` 와 같은 코드) | 유지 | view·execute |
| `INPUT_MISSING` | 필수 입력이 비어 있다(키 없음·null·빈 문자열). 문구에 입력 이름을 담는다. 엔진을 부르지 않고 돌려준다. 엔진 `MISSING_KEY`·`REQUIRED_NULL` 위반도 위반의 이름이 `inputs[].name` 일 때만 이 코드다 | false | execute |
| `INPUT_INVALID` | 값을 선언 타입으로 바꾸지 못했다(숫자 칸에 글자 등), 또는 숫자 자릿수가 너무 크다(§4). `valuesJson` 의 따옴표 없는 JSON 숫자가 1000자를 넘어도 이 코드이고 문구에 「valuesJson 숫자가 너무 큼」 이 든다. 엔진 `TYPE_CONVERSION` 위반도 위반의 이름이 `inputs[].name` 일 때만 이 코드다. 문구에 입력 이름을 담는다 | false | execute |
| `EVAL_ERROR` | 판정 중 오류(엔진 `EngineEvaluationException` 의 위반: 중복 적중, 식 평가 오류, 룰 없음 등). 키 없음·NULL·타입 변환 위반이라도 위반의 이름이 입력 이름이 아니면(앞 룰 결과·중간 값이 비었거나 타입이 안 맞음) 이 코드다. 문구는 `RuleErrorText` 의 사용자 문구를 쓴다 | false | execute |

한 요청에 여러 메시지가 올 수 있고, `RULE_DEPRECATED` 처럼 경고만 있고 `ok=true` 일 수도 있다. 저장 정의가 깨진 경우(`STORED_DEFINITION_CORRUPT`)는 오류로 나간다.

## 4. 값 표현과 소수 자리 규칙

- NUMBER: 문자열이다. 서버는 엔진이 낸 BigDecimal 을 **반올림하지 않고** `toPlainString()` 으로 낸다(과학 표기·부동소수 오차를 만들지 않는다. 단 precision 또는 \|scale\| 이 1000 을 넘는 너무 큰 출력은 펼치지 않고 `toString` 으로 과학 표기 `"1E+5000"` 를 낸다. 위젯은 지수 표기 문자열을 받을 수 있어야 하고, 그 값을 다시 `execute` 입력으로 보내면 \|scale\| 이 1000 을 넘을 때 `INPUT_INVALID` 다). 위젯은 표시할 때만 `outputs[].scale` 이 null 이 아니면 그 자리까지 `HALF_UP` 으로 맞추고, null 이면 받은 그대로 보인다. 계산·재전송에는 받은 문자열을 그대로 쓴다.
- BOOLEAN: JSON `true`/`false`. STRING·DATE: 문자열. 값이 없으면 JSON `null`.
- 결과가 목록(COLLECT LIST)이면 JSON 배열이고 각 원소에 위 규칙을 쓴다.
- 숫자 크기 방어: NUMBER 입력은 BigDecimal 의 precision 이 1000 을 넘거나 \|scale\| 이 1000 을 넘으면(예 `"1e999999999"`) `INPUT_INVALID` 로 막는다(메모리 폭주 방어. 글자 숫자는 2000자를 넘으면 파싱하지 않는다). 이 방어는 선언 타입과 관계없이 적용한다 — 받은 값이 글자이고 BigDecimal 로 읽히는 모양이면 입력 칸이 STRING·DATE·타입 없음이어도 같은 한도로 막는다(같은 이름을 다른 룰이 NUMBER 로 선언해 엔진이 바꿀 수 있기 때문이다. 2000자를 넘는 글자는 숫자 문자(`0-9 + - . e E`)로만 이루어졌을 때만 막고 파싱하지 않는다). 출력 BigDecimal 이 같은 한도를 넘으면 `toPlainString` 으로 펼치지 않고 과학 표기 `toString`(예 `"1E+5000"`)으로 낸다.
- `valuesJson` 의 따옴표 없는 JSON 숫자는 Jackson 제한으로 1000자까지만 읽는다. 넘으면 HTTP 오류가 아니라 `INPUT_INVALID`(문구에 「valuesJson 숫자가 너무 큼」)로 돌려준다. 숫자를 따옴표 글자로 보내면 위 2000자 방어를 따른다.
- 입력 NUMBER 칸의 소수 입력 허용 자릿수는 `inputs[].scale`(null 이면 제한 없음)이다. 서버는 입력을 반올림하지 않는다.

## 5. 단위(unit) 출처

단위 코드는 컬럼 사전의 해당 이름(물리명)이 가리키는 도메인의 `UNIT_CODE`(`TB_MDM_UNIT.UNIT_CODE`)다. 룰이 변수에 직접 도메인을 선언했으면(PROG 출처) 그 도메인의 `UNIT_CODE`, 컬럼 사전에도 선언에도 없으면(NONE) 빈 문자열 `""` 이다. 도메인에 단위 코드가 없을 때도 `""` 이다. 단위 코드는 표시용 글자이며 단위 환산은 하지 않는다. 룰 결과(`outputs`)도 같은 규칙으로 결과 이름의 컬럼 사전·선언 도메인에서 읽는다.

## 6. 위젯 레인이 지켜야 할 흐름

1. 정의 설정의 대상으로 `view` 를 부른다. `messages` 에 `NO_RELEASED`·`NOT_FOUND` 가 있으면 입력 칸 없이 그 문구만 보인다.
2. `inputs` 로 입력 칸을 만든다(`dataType`·`scale`·`unit`·`label`).
3. 사용자가 계산을 누르면 입력 값을 `valuesJson`(JSON 객체 글자)으로 모아 `execute` 를 부른다. `ok=false` 이면 `messages[].text` 를 보인다.
4. 세트의 「중간값 표시」 옵션이 켜져 있으면 `steps[].outputs` 를 그리고, 꺼져 있으면 `result` 만 보인다.
5. 위젯은 `preview` 를 보내지 않는다(기본 `false`). `preview=true` 는 관리 화면 미리보기 전용이다.

## 6.1 한계(알려진 것, 이번 판에서 고치지 않음)

- `preview=true` 여도 하위 세트(SET 노드)의 입출력(`view` 의 입력·최종 결과 계산)은 RELEASED 버전만 읽는다. 하위 세트의 내 DRAFT 는 반영되지 않는다(룰·상위 세트는 `preview` 를 따른다).
- `view` 의 `RULE_DEPRECATED` 경고는 최상위 룰만 본다(하위 세트 안의 폐기 룰은 경고하지 않는다). `view` 의 `steps` 도 최상위 룰만 담는다(SET 노드는 펼치지 않는다). `execute` 의 `steps` 는 하위 세트의 룰을 펼쳐 실행 순서대로 담는다.
- 하위 세트의 IF 조건에서만 읽는 변수(그 세트 룰은 읽지 않는 것)는 상위 세트의 `inputs` 에 올라오지 않는다. 그런 변수가 비면 `execute` 는 `EVAL_ERROR`(입력 이름이 아니므로)로 알린다.
- 타입을 풀지 못한 입력은 서버가 값을 글자로 바꾸지 않으므로(IF 조건에만 쓰이는 변수의 글자 `TRUE`/`FALSE` 만 불린으로 읽는다) 숫자 비교가 필요한 변수는 컬럼 사전이나 룰에 타입을 선언해야 한다.
- 입력의 `dataType`·`label` 은 그 이름을 처음 읽은 룰(또는 IF 조건) 기준이다. 다른 룰이 타입을 선언했어도 처음 읽은 곳이 타입 없음이면 `STRING` 으로 알리고, 엔진이 선언 타입으로 바꾼다(바꾸지 못하면 `INPUT_INVALID`). 다른 룰이 결과로 선언한 이름을 먼저 IF 가 읽는 입력도 `STRING` 이다.
- `result` 는 `view` 의 `outputs`(세트 최종 결과, `RuleSetInterface`·`RuleSetAnalyzer` 가 계산) 이름만 담는다. 같은 이름을 A 룰이 만들고 B 룰이 읽은 뒤 C 룰이 다시 만들면 그 이름은 B 가 읽으므로 `outputs` 에서 빠지고 C 가 만든 최종 값은 `result` 에 없다(`steps[].outputs` 에는 있다). 세트 겉모양 계산을 바꿔야 해서 이번 판에서 고치지 않는다.

## 7. 구현 근거(코드 위치)

- 룰 입출력: `mdm/lib/.../common/rule/RuleIoReader.java`, `RuleIo.java`(`IoName`)
- 세트 입출력·앞 결과 제외: `RuleSetAnalyzer.io`, `RuleSetInterface.of`, `SetCallIoReader`
- 실행: `RuleSetRunner`(`run`·`session(RuleVersionPick)`), 엔진 `MdmRuleEngine.evaluate`(룰)·`evaluateSet`(세트)
- 버전 선택: `common/rule/definition/RuleVersionPick.java`
- 서비스·BPMN: `mdm/lib/.../dme/ruleCalc/service/RuleCalcService.java`, `mdm/api/src/main/resources/services/dme/ruleCalc.bpmn`(action `view`→`io`, `execute`→`run`, `search`→`search`)
- 룰·세트 찾기 쿼리: `RuleQueries.searchCallable`(룰)·`RuleSetVersionQueries.searchCallable`(세트), 서비스 `RuleCalcService.search`, DTO `RuleCalcSearchRequest`·`RuleCalcSearchResult`
- 결과: 엔진 `RuleResult`(`hits`·`defaultApplied`·`results`), `RuleSetResult`(`steps`·`finalValues`)
- 위반 코드: 엔진 `EngineEvaluationException.Code`
