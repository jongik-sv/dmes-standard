# Part B: BPMN 표준 개발 가이드

> 상위 문서: [BackEnd 표준 개발 가이드 V2](../BackEnd_표준_통합_개발가이드_v2.md)



## 1. 문서 사용 규칙

### 1-1. 규칙 등급
| 등급 | 의미 |
|---|---|
| MUST | 반드시 지켜야 하는 규칙. 위반 시 표준 위반으로 간주한다. |
| SHOULD | 특별한 사유가 없으면 따라야 하는 규칙. |
| MAY | 필요한 경우 선택적으로 적용할 수 있는 규칙. |

### 1-2. BPMN의 역할
- BPMN은 **요청 라우팅, 분기, 호출 순서, 오류 종료**만 담당한다.
- 비즈니스 규칙과 데이터 처리의 본체는 **Service**에 둔다.
- 기본 선택은 항상 **ServiceTask**이며, 다른 Task는 필요가 명확할 때만 사용한다.

### 1-3. 표준 우선 원칙
- MUST: 이 문서에 없는 BPMN 패턴을 임의로 도입하지 않는다.
- MUST: 템플릿을 벗어나는 속성, 분기 방식, 호출 방식을 추가하지 않는다.
- SHOULD: 하나의 BPMN은 하나의 기능 단위(serviceId)로 유지한다.

---

## 2. 시작 전 결정 항목

아래 값이 확정되기 전에는 BPMN을 작성하지 않는다.

| 항목 | 설명 |
|---|---|
| serviceId | BPMN 파일명(확장자 제외) 및 process id 와 동일한 값 |
| beanName | `@Service("beanName")` 의 값 |
| method | Service 메서드명 |
| action 목록 | `search`, `save`, `delete` 등 Gateway 분기값 |
| dto FQCN | 조회 API일 때 사용할 SearchRequest DTO 전체 경로 |

---

## 3. 핵심 일치 규칙

다음 6개는 MUST 이다.

| 검증 항목 | BPMN 기준 | BackEnd 기준 |
|---|---|---|
| 파일명 | `{serviceId}.bpmn` | API URL 의 `serviceId` |
| process id | `<bpmn:process id="{serviceId}">` | BPMN 파일명(확장자 제외) |
| Bean 이름 | `camunda:class="beanName"` | `@Service("beanName")` |
| 메서드명 | `property name="method"` | Service 메서드명 |
| DTO | `property name="dto"` | DTO FQCN |
| action 분기 | `conditionExpression` 값 | API URL 의 `action` |

**표준 URL**

```text
# BE 매핑 (cactus OasisController, 단일 컨벤션)
POST /oasis/{serviceId}/{action}

# UI→BFF (Next.js BFF)
POST /api/{moduleId}/oasis/{serviceId}/{action}
```

| URL 구성요소 | BPMN 측 값 | BackEnd 측 값 | 예시 |
|---|---|---|---|
| `moduleId` | (해당 없음) | UI 측 모듈 prefix. BFF→BE 호출 시 제거된다 | `mpp` / `mqc` / `aps` |
| `serviceId` | 파일명 = `<process id>` | 서비스 도메인 식별자 | `product` |
| `action` | `conditionExpression` | BPMN actionGateway 에서 분기 (Service 가 직접 해석 안 함) | `search` / `save` |

- MUST: URL `serviceId` 는 **단수 camelCase** 로 통일한다. 복수형, 하이픈 형태 금지.
- MUST: BPMN 파일이 존재하지 않는 URL 은 라우팅되지 않는다. 새 `serviceId` 도입 시 BPMN 파일을 먼저 생성한다.
- MUST: BE 매핑은 cactus `OasisController` 의 `/oasis/{serviceId}/{action}` 단일 컨벤션을 사용한다. `serviceGroup` placeholder 는 더 이상 존재하지 않는다.

---

## 4. 위치와 명명 규칙

### 4-1. 파일 위치
```text
src/main/resources/services/{module}/{serviceId}.bpmn
```

### 4-2. 명명 규칙
| 대상 | 규칙 | 예시 |
|---|---|---|
| 파일명 | `{serviceId}.bpmn` | `product.bpmn` |
| process id | 파일명과 동일 | `product` |
| Gateway id | `{기준}Gateway` 또는 `{기준}Gw` | `actionGateway`, `holdGw` |
| ServiceTask id | `{action}Task` | `searchTask`, `saveTask` |
| Checker id | `{대상}Check` | `holdCheck` |
| Flow id | `flow_{의미}` | `flow_search`, `flow_save_end` |
| Error id | `Error_{의미}` | `Error_hold` |

---

## 5. 허용 요소와 속성

### 5-1. 기본 선택 순서
1. **ServiceTask**: 기본값. 대부분의 API는 이 방식으로 작성한다.
2. **ScriptTask**: 공통 SQL, 프로시저, 트랜잭션 제어가 명확할 때만 사용한다.
3. **Task(Checker)**: 검증 결과를 boolean 으로 분기할 때 사용한다.
4. **CallActivity**: 기존 BPMN 재사용이 필요한 경우만 사용한다.
5. **SendTask**: 외부 비동기 발행이 필요한 경우만 사용한다.

### 5-2. 표준 BPMN 요소 (사용 가능 요소)

본 가이드에서 사용 가능한 BPMN 요소이다. 표 외 요소는 사용하지 않는다.

> 각 요소의 BPMN 2.0 일반 시맨틱·기본 크기·eventDefinition 종류·게이트웨이 동작은 [bpmn-skill SKILL.md](../../../../.claude/skills/bpmn-skill/SKILL.md) §"BPMN 2.0 요소 타입 레퍼런스" / §"게이트웨이 시맨틱 가이드" 를 참조한다. 본 표는 그 일반 카탈로그에서 {CLIENT} 가 **사용 허용**하는 요소만 추린 화이트리스트이다 (§9 금지사항과 짝).

| 요소 | 용도 |
|---|---|
| `bpmn:definitions` | 최상위 루트, 네임스페이스 선언 |
| `bpmn:process` | 프로세스 정의 |
| `bpmn:startEvent` | 시작점 |
| `bpmn:endEvent` | 종료점 (정상 / 에러) |
| `bpmn:exclusiveGateway` | 분기 |
| `bpmn:sequenceFlow` | 노드 간 연결 |
| `bpmn:serviceTask` | Spring Bean 호출 |
| `bpmn:scriptTask` | SQL / 프로시저 / 트랜잭션 제어 |
| `bpmn:task` | Generic Task (Checker 용) |
| `bpmn:callActivity` | 다른 BPMN 호출 |
| `bpmn:sendTask` | 외부 메시지 발행 |
| `bpmn:error` | 에러 정의 |
| `bpmn:errorEventDefinition` | endEvent 의 에러 종료 정의 |
| `bpmn:documentation` | Checker 클래스#메서드 지정 |
| `bpmn:incoming` / `bpmn:outgoing` | sequenceFlow 참조 |
| `bpmn:conditionExpression` | sequenceFlow 분기 조건 |
| `bpmn:extensionElements` | 확장 속성 컨테이너 |
| `bpmn:script` | scriptTask 의 SQL/명령 본문 |

### 5-3. 요소별 표준 속성

각 요소에서 본 가이드가 사용하는 표준 속성이다.

| 요소 | 표준 속성 |
|---|---|
| `bpmn:process` | `id`, `name`, `isExecutable` |
| `bpmn:serviceTask` | `id`, `name`, `camunda:class` |
| `bpmn:scriptTask` | `id`, `name`, `scriptFormat`, `camunda:resource` |
| `bpmn:sendTask` | `id`, `name`, `camunda:type`, `camunda:topic` |
| `bpmn:callActivity` | `id`, `name`, `calledElement` |
| `bpmn:error` | `id`, `name`, `camunda:errorMessage` |
| `bpmn:errorEventDefinition` | `errorRef` |
| `bpmn:sequenceFlow` | `id`, `name`, `sourceRef`, `targetRef` |
| `bpmn:task` | `id`, `name` |

### 5-4. `extensionElements` 내부 구성

확장 속성은 다음 두 가지 형태로 작성한다.

- `camunda:properties` 컨테이너 + `camunda:property name="..." value="..."` 항목들
- `camunda:inputOutput` 컨테이너 + `camunda:inputParameter` / `camunda:outputParameter` 항목들

### 5-5. `camunda:property name` 허용 목록

아래 목록 외 값은 사용하지 않는다.

| name | 적용 대상 | 용도 |
|---|---|---|
| method | serviceTask | 호출 메서드명 |
| output | task 전반 | 결과 저장 키 |
| dto | serviceTask, process | 조회 DTO FQCN |
| input | gateway, task | 분기 기준 또는 입력 매핑 |
| ds | scriptTask | DataSource 이름 |
| tx | process, task | 트랜잭션 매니저 |
| commitTx | process | 강제 커밋 대상 |
| iter | task 전반 | 반복 실행 컬렉션 |
| thread | task 전반 | 병렬 스레드 수 |
| timeout | task 전반 | 타임아웃(초) |
| log | task 전반 | 디버그 로깅 표현식 |
| new | serviceTask, callActivity | 독립 실행/트랜잭션 |
| object | task | 결과 객체 원형 사용 |
| optional | serviceTask | 생략 가능한 파라미터 |
| inputOnly | serviceTask | input 값만 전달 |
| adapter | serviceTask | ServiceContext 어댑터 |

### 5-6. 표준 해석 규칙
- MUST: `camunda:class` 는 **Bean 이름만** 사용한다.
- MUST NOT: `camunda:class` 에 FQCN 또는 `FQCN#method` 형식을 쓰지 않는다.
- MUST: 조회 API 의 `dto` 는 **FQCN** 으로 작성한다.
- SHOULD: `output` 키는 응답 의미가 드러나는 이름으로 작성한다.

---

## 6. 분기 규칙

### 6-1. action 분기
- 기본 Gateway 는 `action` 값으로 분기한다.
- action 분기는 **문자열 비교형**을 표준으로 사용한다.

```xml
<bpmn:exclusiveGateway id="actionGateway">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="input" value="action" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:exclusiveGateway>

<bpmn:sequenceFlow id="flow_search" sourceRef="actionGateway" targetRef="searchTask">
  <bpmn:conditionExpression>search</bpmn:conditionExpression>
</bpmn:sequenceFlow>
```

### 6-2. boolean / 값 기반 분기
- Checker 결과 또는 컨텍스트 값 분기에는 `tFormalExpression` 을 사용한다.

```xml
<bpmn:sequenceFlow id="flow_true" sourceRef="holdGw" targetRef="holdError">
  <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">#root == true</bpmn:conditionExpression>
</bpmn:sequenceFlow>
```

> JUEL/FEEL 표현식 문법 (`${...}` 비교/논리/변수 참조 등) 은 [bpmn-skill SKILL.md](../../../../.claude/skills/bpmn-skill/SKILL.md) §"조건식 가이드" 참조. 본 가이드는 {CLIENT} 한정 분기 패턴만 명시한다.

### 6-3. 분기 사용 기준
| 상황 | 기준 |
|---|---|
| CRUD 액션 분기 | action 문자열 비교 |
| Checker 결과 분기 | boolean formal expression |
| 컨텍스트 값 비교 | formal expression |
| 복잡한 비즈니스 판단 | BPMN이 아니라 Service 로 이동 |

---

## 7. 표준 템플릿

아래 템플릿은 **복사 후 값만 치환하는 표준 골격**이다.

### 7-1. 기본 CRUD 템플릿

bpmn-tool create 입력 JSON 스펙 (DI 좌표·BPMNShape/BPMNEdge 는 자동 생성):

```json
{
  "definitions": {
    "id": "Definitions_1",
    "targetNamespace": "http://bpmn.io/schema/bpmn"
  },
  "process": {
    "id": "{serviceId}",
    "name": "{serviceName}",
    "isExecutable": true
  },
  "nodes": [
    { "id": "start", "type": "bpmn:StartEvent" },
    {
      "id": "actionGateway",
      "type": "bpmn:ExclusiveGateway",
      "camunda": {
        "properties": [{ "name": "input", "value": "action" }]
      }
    },
    {
      "id": "searchTask",
      "type": "bpmn:ServiceTask",
      "name": "조회",
      "camunda": {
        "class": "{beanName}",
        "properties": [
          { "name": "method", "value": "{searchMethod}" },
          { "name": "dto",    "value": "{dtoFQCN}" },
          { "name": "output", "value": "{gridKey}" }
        ]
      }
    },
    {
      "id": "saveTask",
      "type": "bpmn:ServiceTask",
      "name": "저장",
      "camunda": {
        "class": "{beanName}",
        "properties": [
          { "name": "method", "value": "{saveMethod}" },
          { "name": "output", "value": "{dataKey}" }
        ]
      }
    },
    { "id": "end", "type": "bpmn:EndEvent" }
  ],
  "flows": [
    { "id": "flow_to_action",  "source": "start",         "target": "actionGateway" },
    { "id": "flow_search",     "source": "actionGateway", "target": "searchTask", "condition": "search" },
    { "id": "flow_save",       "source": "actionGateway", "target": "saveTask",   "condition": "save" },
    { "id": "flow_search_end", "source": "searchTask",    "target": "end" },
    { "id": "flow_save_end",   "source": "saveTask",      "target": "end" }
  ]
}
```

> **사용**: 위 JSON 을 `{serviceId}.spec.json` 으로 저장 후 `bpmn-tool create < {serviceId}.spec.json > services/{module}/{serviceId}.bpmn` 으로 schema-safe BPMN 생성. `{serviceId}`, `{beanName}`, `{searchMethod}`, `{saveMethod}`, `{dtoFQCN}`, `{gridKey}`, `{dataKey}` 의 6자 일치는 §3 과 §10 체크리스트로 검증.

### 7-2. 조회 전용 Task 템플릿

기존 process 에 조회 ServiceTask 한 개를 추가하는 modify ops:

```json
{
  "operations": [
    {
      "op": "addNode",
      "id": "searchTask",
      "type": "bpmn:ServiceTask",
      "name": "조회",
      "camunda": {
        "class": "{beanName}",
        "properties": [
          { "name": "method", "value": "{searchMethod}" },
          { "name": "dto",    "value": "{dtoFQCN}" },
          { "name": "output", "value": "{gridKey}" }
        ]
      }
    }
  ]
}
```

> **사용**: `bpmn-tool modify {serviceId}.bpmn -i < ops.json` (in-place 수정 + validate/preview 자동 출력). 조회 API 만 따로 두는 케이스(7-1 의 saveTask 가 불필요할 때) 또는 기존 BPMN 에 조회 분기를 추가할 때 사용.

### 7-3. 저장/삭제 Task 템플릿

기존 process 에 저장/삭제 ServiceTask 한 개를 추가하는 modify ops:

```json
{
  "operations": [
    {
      "op": "addNode",
      "id": "saveTask",
      "type": "bpmn:ServiceTask",
      "name": "저장",
      "camunda": {
        "class": "{beanName}",
        "properties": [
          { "name": "method", "value": "{method}" },
          { "name": "output", "value": "{dataKey}" }
        ]
      }
    }
  ]
}
```

> **사용**: `bpmn-tool modify {serviceId}.bpmn -i < ops.json`. 저장 또는 삭제 API 만 별도 분기로 둘 때, 또는 7-1 골격에 새 action 분기를 추가할 때.
> **MUST NOT**: 저장/삭제에는 `dto` 프로퍼티를 넣지 않는다 (§8-3).

### 7-4. Checker + Error 종료 템플릿

검증 → Gateway → 실패 시 Error End Event 의 전체 흐름 골격. 기존 process 에 검증 분기를 추가하는 modify ops:

```json
{
  "operations": [
    {
      "op": "addError",
      "id": "Error_validation",
      "name": "검증오류",
      "errorMessage": "{message}"
    },
    {
      "op": "addNode",
      "id": "validationCheck",
      "type": "bpmn:Task",
      "name": "검증",
      "documentation": "{checkerFQCN}#{method}",
      "camunda": {
        "properties": [{ "name": "output", "value": "{resultKey}" }]
      }
    },
    {
      "op": "addNode",
      "id": "validationGw",
      "type": "bpmn:ExclusiveGateway"
    },
    {
      "op": "addNode",
      "id": "validationError",
      "type": "bpmn:EndEvent",
      "eventDefinitions": [{ "type": "bpmn:ErrorEventDefinition", "errorRef": "Error_validation" }]
    },
    { "op": "addFlow", "id": "flow_to_validationGw", "source": "validationCheck", "target": "validationGw" },
    { "op": "addFlow", "id": "flow_validation_fail", "source": "validationGw",   "target": "validationError", "condition": "#root == true" },
    { "op": "addFlow", "id": "flow_validation_pass", "source": "validationGw",   "target": "{nextTaskId}",    "condition": "#root == false" }
  ]
}
```

- Checker 결과(`#root`) 가 `true` 이면 검증 실패 → Error End Event 로 종료한다.
- `false` 이면 다음 Task 로 진행한다.

> **사용**: `bpmn-tool modify {serviceId}.bpmn -i < ops.json`. `{nextTaskId}` 는 검증 통과 시 이어질 기존 Task id 로 치환.
> **OASIS 런타임 디버깅**: 검증 결과(`#root`) 바인딩, UserException → Error End Event 흐름, `ServiceResult.path('error')` / `messages()` 테스트는 [oasis-project-support SKILL.md](../../../../.claude/skills/oasis-project-support/SKILL.md) 참조.

### 7-5. ScriptTask 사용 템플릿
ScriptTask 는 **공통 SQL / 프로시저 / 트랜잭션 제어**로 한정한다.

기존 process 에 ScriptTask 한 개를 추가하는 modify ops:

```json
{
  "operations": [
    {
      "op": "addNode",
      "id": "commonSqlTask",
      "type": "bpmn:ScriptTask",
      "name": "공통 조회",
      "scriptFormat": "sql",
      "camunda": {
        "resource": "{mapperId}",
        "properties": [{ "name": "output", "value": "{outputKey}" }]
      }
    }
  ]
}
```

> **사용**: `bpmn-tool modify {serviceId}.bpmn -i < ops.json`.
> **OASIS 런타임 디버깅**: scriptFormat / `camunda:resource` (mapperId) / PropertyEL 바인딩, ScriptTask 의 컨텍스트 변수 접근·트랜잭션 동작 디버깅은 [oasis-project-support SKILL.md](../../../../.claude/skills/oasis-project-support/SKILL.md) 참조.

### 7-6. CallActivity 템플릿

기존 process 에 다른 BPMN 호출용 CallActivity 를 추가하는 modify ops:

```json
{
  "operations": [
    {
      "op": "addNode",
      "id": "callSubProcess",
      "type": "bpmn:CallActivity",
      "name": "하위 프로세스",
      "calledElement": "{processId}",
      "camunda": {
        "properties": [
          { "name": "input",  "value": "{inputKey}" },
          { "name": "output", "value": "{outputKey}" }
        ]
      }
    }
  ]
}
```

> **사용**: `bpmn-tool modify {serviceId}.bpmn -i < ops.json`. `{processId}` 는 호출할 다른 BPMN 의 `<bpmn:process id>` (= 그 BPMN 의 serviceId).

---

## 8. 입력/출력 매핑 규칙

### 8-1. output 규칙
| 형태 | 의미 |
|---|---|
| `output="items"` | 결과 전체를 `items` 로 저장 |
| `output="[field]->key"` | 결과의 필드를 key 로 추출 |
| `output="['field']->key"` | Map 키를 key 로 추출 |
| `output="[0][field]->key"` | 첫 번째 항목의 필드 추출 |

### 8-2. input 규칙
| 형태 | 의미 |
|---|---|
| `input="dto"` | 같은 이름으로 전달 |
| `input="from->to"` | 이름 변경 전달 |
| `input="a,b,c"` | 여러 키 전달 |
| `input="a->x,b->y"` | 다중 이름 변경 전달 |

### 8-3. DTO 규칙
- MUST: 조회 API에서만 `dto` 를 사용한다.
- MUST: `dto` 값은 패키지를 포함한 FQCN 이다.
- MUST NOT: 저장/삭제 API에 불필요한 `dto` 를 넣지 않는다.

---

## 9. 금지 사항

다음은 모두 MUST NOT 이다.

- BPMN 파일명과 process id 불일치
- `camunda:class` 와 `@Service("...")` 이름 불일치
- BPMN `method` 와 실제 Service 메서드명 불일치
- `dto` 에 단순 클래스명 사용
- 5-5 허용 목록 밖의 `camunda:property name` 사용
- 5-2 표준 요소 표 외의 BPMN 요소 임의 추가
- 5-3 표준 속성 표 외의 속성 임의 추가
- BPMN 안에 비즈니스 규칙이나 도메인 계산 로직 작성
- CRUD 액션 분기에 formal expression 을 남용하는 것
- `camunda:class` 에 FQCN 사용

---

## 10. 작성 및 검증 절차

### 10-1. 작성 순서
1. BackEnd 의 `beanName`, `method`, `dtoFQCN` 확정
2. `serviceId` 및 action 목록 확정
3. 7-1 기본 CRUD JSON 스펙에서 불필요한 Task 제거 (또는 7-2 ~ 7-6 modify ops 로 분기 추가)
4. 분기값과 output 키 정리
5. `bpmn-tool create < spec.json > {serviceId}.bpmn` 으로 BPMN 생성, 그 다음 `bpmn-tool validate {serviceId}.bpmn` 로 schema·연결 무결성 검증 (직접 XML 편집 금지 — §9-0 참조)
6. BackEnd 코드와 6개 일치 항목 교차 검증 (10-2 체크리스트)

### 10-2. 완료 체크리스트
- [ ] 파일명과 process id 가 같은가?
- [ ] `camunda:class == @Service("beanName")` 인가?
- [ ] `method` 가 실제 Service 메서드명과 같은가?
- [ ] 조회 Task 의 `dto` 가 FQCN 인가?
- [ ] 모든 `conditionExpression` 이 실제 action 값과 같은가?
- [ ] 모든 `sourceRef`, `targetRef`, `incoming`, `outgoing` 이 연결되는가?
- [ ] 5-2 / 5-3 / 5-5 표 밖 요소·속성을 사용하지 않았는가?
- [ ] BPMN이 라우팅/분기만 담당하고 있는가?
- [ ] `bpmn-tool validate {serviceId}.bpmn` 이 `유효: true` 로 통과하는가? (직접 XML 편집을 한 적 없는가?)

---

## 11. 케이스 선택표

| 상황 | 선택 템플릿 |
|---|---|
| 조회 + 저장 기본 API | 7-1 기본 CRUD 템플릿 |
| 조회 전용 API | 7-2 조회 전용 Task 템플릿 |
| 저장/삭제 전용 API | 7-3 저장/삭제 Task 템플릿 |
| 사전 검증 후 오류 종료 | 7-4 Checker + Error 종료 템플릿 |
| 공통 SQL/프로시저/트랜잭션 | 7-5 ScriptTask 템플릿 |
| 기존 BPMN 재사용 | 7-6 CallActivity 템플릿 |

---

## 12. 가이드 외 시나리오 대응 정책

본 가이드와 부속 문서(「Part A: BackEnd 표준 개발 가이드」, 「Part C: cactus-core 레퍼런스」) 에 명시되지 않은 BPMN 패턴은 다음 절차를 따른다.

### 12-1. 절차 (MUST)

1. 본 가이드의 「11 케이스 선택표」 와 일치하는 항목이 있는지 다시 확인한다.
2. 「7 표준 템플릿」 의 6개 템플릿으로 표현 가능한지 검토한다.
3. OASIS 런타임 동작(JavaServiceTask 바인딩, UserException/Error 흐름, ServiceResult 테스트, ScriptTask propertyEL 등) 을 확인할 필요가 있으면 [oasis-project-support SKILL.md](../../../../.claude/skills/oasis-project-support/SKILL.md) 의 디버깅 가이드를 사용한다.
4. 위 단계로 해결되지 않으면 **BPMN 작성을 멈추고** 사용자에게 처리 방향을 확인한다.
5. 결정된 사항은 본 가이드 또는 BackEnd 가이드에 추가하여 다음 작업부터 표준화한다.

### 12-2. 임의 처리 금지 (MUST NOT)

- 본 가이드 「5-5 camunda:property name 허용 목록」 외의 속성을 임의 사용하지 않는다.
- 본 가이드의 표준 템플릿 7-1 ~ 7-6 외의 BPMN 구조를 임의로 만들지 않는다.
- BPMN 안에 비즈니스 규칙이나 도메인 계산 로직을 작성하지 않는다 (Service 로 이동).
- 분기 조건을 복잡한 SpEL 표현식으로 우회하지 않는다.
- `bpmn-tool` 을 거치지 않은 직접 XML 편집은 하지 않는다 — DI 좌표·네임스페이스·id 참조가 깨질 수 있다 (§9-0 참조).

### 12-3. 본 가이드 범위 외로 알려진 시나리오

다음 항목은 현 가이드 범위 외이며, 별도 결정 없이 진행 금지.

- MultiInstance (병렬/순차 반복 실행)
- Inline SubProcess (임베디드 서브프로세스)
- Error Boundary Event (Task 부착 에러 핸들러)
- 트랜잭션 중간 커밋/롤백 (TransactionScript)
- 외부 워커 패턴 (SendTask + topic) 의 실제 메시지 발행

위 항목이 필요한 경우 사용자에게 패턴 적용 가능 여부를 먼저 확인한다.

---
