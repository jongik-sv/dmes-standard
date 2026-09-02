---
name: bpmn-skill
description: BPMN 2.0 다이어그램을 bpmn-tool CLI로 작성, 해석, 수정, 검증합니다. .bpmn 파일을 다루거나 BPMN 다이어그램 관련 작업 시 사용합니다.
---

# BPMN Skill — bpmn-js 기반 BPMN 작성·해석·수정

BPMN 2.0 다이어그램을 프로그래밍 방식으로 작성, 해석, 수정하는 스킬.
bpmn-moddle 기반 CLI 도구(`@cothe/bpmn-tool`)를 사용하여 스키마 안전한 XML 조작을 수행한다.

TRIGGER when: 사용자가 BPMN 다이어그램 작성, 해석, 수정, 분석을 요청하거나, .bpmn 파일을 다룰 때

## 핵심 원칙

1. **직접 XML 편집 금지** — 반드시 `bpmn-tool`을 통해 조작한다. 직접 편집하면 DI(좌표)·네임스페이스·id 참조가 깨질 수 있다.
2. **Semantic + DI 동기화** — bpmn-tool이 노드 생성/삭제 시 BPMNShape/BPMNEdge를 자동 관리한다.
3. **확장 구조 보존** — 미인식 네임스페이스/확장 요소는 bpmn-moddle이 자동 보존(pass-through)한다.
4. **Round-trip 안정성** — 모든 변경 후 validate로 검증한다.

## 설치 및 사용법

- **패키지명**: `@cothe/bpmn-tool` (v1.3.0)
- **Node.js 요구사항**: `>=18`
- **의존성**: `bpmn-moddle ^10`, `camunda-bpmn-moddle ^7`, `modeler-moddle ^0.2`

```bash
# npm 글로벌 설치
npm install -g @cothe/bpmn-tool
```

```bash
# 구조 분석 (JSON 출력)
bpmn-tool parse <file.bpmn>

# 스키마 검증
bpmn-tool validate <file.bpmn>

# JSON 스펙으로 새 BPMN 생성
echo '<json>' | bpmn-tool create > output.bpmn

# 기존 BPMN 수정 (stdout 출력)
echo '<ops-json>' | bpmn-tool modify <file.bpmn> > output.bpmn

# 기존 BPMN 수정 (직접 덮어쓰기 + 검증/미리보기 출력, -i 또는 --in-place)
echo '<ops-json>' | bpmn-tool modify <file.bpmn> -i

# 정리된 XML 출력
bpmn-tool export <file.bpmn>

# 텍스트 흐름 미리보기
bpmn-tool preview <file.bpmn>
```

## 작업 패턴

### 1. 새 BPMN 작성 (create)

사용자의 자연어 요청을 아래 JSON 스펙으로 변환 후 create 명령 실행:

```json
{
  "definitions": {
    "id": "Definitions_1",
    "targetNamespace": "http://bpmn.io/schema/bpmn",
    "exporter": "bpmn-tool",
    "exporterVersion": "1.3.0",
    "modeler": {
      "executionPlatform": "Camunda Platform",
      "executionPlatformVersion": "7.15.0"
    }
  },
  "process": {
    "id": "Process_1", "name": "프로세스명", "isExecutable": true,
    "documentation": "프로세스 설명",
    "camunda": {
      "properties": [{ "name": "input", "value": "mtlId" }]
    }
  },
  "errors": [
    { "id": "Error_1", "name": "에러명", "errorMessage": "에러 메시지" }
  ],
  "nodes": [
    { "id": "고유ID", "type": "bpmn:타입", "name": "표시 이름" }
  ],
  "flows": [
    { "id": "고유ID", "source": "노드ID", "target": "노드ID" }
  ],
  "annotations": [
    { "id": "anno1", "text": "설명 텍스트", "x": 300, "y": 80, "width": 200, "height": 30 }
  ],
  "associations": [
    { "id": "assoc1", "source": "노드ID", "target": "anno1" }
  ]
}
```

**definitions 블록** (생략 시 기본값 사용):
- `id`, `targetNamespace` — BPMN 루트 식별자
- `exporter`, `exporterVersion` — 생성 도구 정보 (기본: `bpmn-tool` / `1.3.0`)
- `modeler.executionPlatform` — 실행 플랫폼 (기본: `Camunda Platform`)
- `modeler.executionPlatformVersion` — 플랫폼 버전 (기본: `7.15.0`)

**노드 좌표**: 기본적으로 자동 배치(가로 순차). 분기가 있으면 `"x"`, `"y"` 명시:
- 주 흐름: y=200 기준 가로 배치
- 분기 경로: y를 100 또는 300으로 변경

### Camunda 확장 속성 (노드별)

모든 노드에 `"camunda"` 객체를 추가하여 Camunda 확장 속성을 설정할 수 있다:

```json
{
  "id": "task1", "type": "bpmn:ServiceTask", "name": "상태검증",
  "camunda": {
    "class": "com.foo.Bar#method",
    "resource": "path.to.query",
    "type": "external",
    "topic": "TOPIC_NAME",
    "properties": [{ "name": "output", "value": "result" }],
    "inputParameters": [{ "name": "param1", "value": "value1" }],
    "outputParameters": [{ "name": "result", "value": "#{result}" }]
  }
}
```

| camunda 속성 | 설명 | 주요 대상 |
|---|---|---|
| `class` | Java 클래스#메서드 | ServiceTask, SendTask |
| `resource` | 외부 리소스 참조 | ScriptTask |
| `type` | 태스크 타입 (`"external"`) | SendTask |
| `topic` | 외부 워커 토픽명 | SendTask |
| `properties` | 커스텀 프로퍼티 [{name, value}] | 모든 요소 |
| `inputParameters` | 입력 매개변수 [{name, value}] | FlowNode, CallActivity |
| `outputParameters` | 출력 매개변수 [{name, value}] | FlowNode, CallActivity |

### 노드 타입별 추가 속성

| 속성 | 설명 | 대상 |
|---|---|---|
| `scriptFormat` | 스크립트 형식 (예: `"sql"`) | ScriptTask |
| `script` | 인라인 스크립트 내용 | ScriptTask |
| `calledElement` | 호출할 프로세스 ID | CallActivity |
| `multiInstance` | 다중 인스턴스 설정 | SubProcess, Task |
| `attachedToRef` | 부착 대상 노드 ID | BoundaryEvent |
| `cancelActivity` | 인터럽트 여부 (기본 true) | BoundaryEvent |
| `documentation` | 노드 문서화 텍스트 | 모든 요소 |
| `children` | 내장 서브프로세스 자식 요소 | SubProcess |
| `width`, `height` | SubProcess 크기 (내장 시 필수) | SubProcess |

#### multiInstance 형식:
```json
{ "isSequential": true, "collection": "items", "elementVariable": "item:com.foo.Dto" }
```

#### eventDefinitions 확장 (errorRef 포함):
```json
"eventDefinitions": [{ "type": "bpmn:ErrorEventDefinition", "errorRef": "Error_1" }]
```

#### SubProcess 내장 자식 요소 (children):

SubProcess를 컨테이너로 사용하여 내부에 노드와 흐름을 포함할 수 있다:

```json
{
  "id": "Sub_1", "type": "bpmn:SubProcess", "name": "생산 실행",
  "x": 500, "y": 100, "width": 450, "height": 200,
  "children": {
    "nodes": [
      { "id": "SubStart", "type": "bpmn:StartEvent", "x": 530, "y": 182 },
      { "id": "SubTask", "type": "bpmn:ServiceTask", "name": "작업 실행", "x": 600, "y": 160 },
      { "id": "SubEnd", "type": "bpmn:EndEvent", "x": 850, "y": 182 }
    ],
    "flows": [
      { "id": "SF1", "source": "SubStart", "target": "SubTask" },
      { "id": "SF2", "source": "SubTask", "target": "SubEnd" }
    ]
  }
}
```

**주의**: 자식 노드의 x, y 좌표는 **다이어그램 전체 좌표계** 기준이다 (SubProcess 내부 상대좌표가 아님). 자식 노드 좌표는 SubProcess의 bounds 영역 안에 위치해야 한다.

내장 SubProcess를 사용하지 않고 외부 프로세스를 참조하려면 `bpmn:CallActivity`에 `calledElement`를 사용한다.

### Collaboration / Pool 생성

프로세스를 Pool(참여자)로 감싸려면 `collaboration` 블록을 추가한다:

```json
{
  "collaboration": {
    "id": "Collaboration_1",
    "participants": [
      {
        "id": "Participant_1",
        "name": "MES 시스템",
        "processRef": "Process_1"
      }
    ],
    "messageFlows": [
      { "id": "MF_1", "name": "생산요청", "source": "Task_A", "target": "Task_B" }
    ]
  },
  "process": { "id": "Process_1", "name": "MES 생산" },
  "nodes": [...],
  "flows": [...]
}
```

**participants 속성**:

| 속성 | 설명 | 필수 |
|---|---|---|
| `id` | 참여자 고유 ID | O |
| `name` | Pool 표시 이름 | O |
| `processRef` | 연결할 프로세스 ID | O |
| `x`, `y` | Pool 위치 (미지정 시 자동 계산) | - |
| `width`, `height` | Pool 크기 (미지정 시 자동 계산) | - |

**messageFlows 속성**:

| 속성 | 설명 |
|---|---|
| `id` | 메시지 흐름 고유 ID |
| `name` | 표시 라벨 |
| `source` | 송신 노드 ID |
| `target` | 수신 노드 ID |

Pool 크기를 지정하지 않으면 내부 노드의 bounding box로부터 자동 계산된다 (좌측 50px, 기타 30~40px 패딩).

**현재 제한**: 단일 프로세스의 Pool 래핑만 지원. 다중 Pool(다중 프로세스)은 미지원 — 별도 BPMN 파일을 생성하고 Pool 간 참조로 대체한다.

### 2. 기존 BPMN 해석 (parse)

```bash
bpmn-tool parse file.bpmn
```

출력을 분석해 사용자에게 한국어로 설명:
- definitions 메타데이터 (exporter, modeler 실행 플랫폼 등)
- 프로세스 이름과 구성 요소
- 실행 흐름 (시작 → ... → 종료)
- 분기 조건과 합류 지점
- Camunda 확장 정보 (class, resource, properties 등)
- ScriptTask의 scriptFormat, 인라인 스크립트
- CallActivity의 calledElement
- 다중 인스턴스 설정 (collection, elementVariable)
- 에러 정의 및 참조
- 협업(Collaboration) — 참여자(Participant)와 메시지흐름(MessageFlow)
- 주석(TextAnnotation)과 연관(Association)
- 누락된 연결이나 구조적 문제

#### parse 출력 JSON 키 맵핑

출력 JSON은 **한국어 키**를 사용한다. 구조를 이해하고 후속 작업에 활용할 때 아래 매핑을 참고:

| JSON 키 | 의미 | 비고 |
|---|---|---|
| `파일` | 입력 파일 경로 | |
| `definitions` | 루트 메타데이터 | id, targetNamespace, exporter, modeler 등 |
| `경고` | bpmn-moddle 파싱 경고 | 배열 |
| `프로세스` | 프로세스 목록 | 배열 |
| `협업` | Collaboration 정보 | `참여자`, `메시지흐름` 포함 |
| `에러정의` | bpmn:Error 목록 | `이름`, `에러메시지` |

**프로세스 내부:**

| JSON 키 | 의미 |
|---|---|
| `이름` | name 속성 |
| `실행가능` | isExecutable |
| `문서` | documentation 텍스트 |
| `노드` | FlowNode 목록 |
| `흐름` | SequenceFlow 목록 |
| `주석` | TextAnnotation 목록 |
| `연관` | Association 목록 |
| `camunda` | 프로세스 레벨 Camunda 확장 |

**노드(FlowNode):**

| JSON 키 | 의미 |
|---|---|
| `타입` | `$type` (예: `bpmn:ServiceTask`) |
| `이름` | name |
| `기본흐름` | 게이트웨이의 default flow ID |
| `이벤트정의` | eventDefinitions 배열 (`타입`, `errorRef`) |
| `부착대상` | BoundaryEvent의 attachedToRef ID |
| `인터럽트` | cancelActivity 여부 |
| `스크립트형식` | ScriptTask scriptFormat |
| `스크립트` | ScriptTask script 내용 |
| `호출프로세스` | CallActivity calledElement |
| `다중인스턴스` | `순차`, `컬렉션`, `요소변수` |
| `문서` | documentation |
| `camunda` | class, resource, type, topic, properties, inputParameters, outputParameters |
| `incoming` | 들어오는 흐름 ID 배열 |
| `outgoing` | 나가는 흐름 ID 배열 |

**흐름(SequenceFlow):**

| JSON 키 | 의미 |
|---|---|
| `이름` | name (라벨) |
| `source` | sourceRef ID |
| `target` | targetRef ID |
| `조건` | conditionExpression body |

### 3. BPMN 수정 (modify)

수정 작업 JSON:

```json
{
  "operations": [
    { "op": "addNode", "id": "ID", "type": "bpmn:타입", "name": "이름", "x": 400, "y": 200,
      "camunda": { "class": "com.foo.Bar#method", "properties": [...] },
      "scriptFormat": "sql", "script": "SELECT ...",
      "calledElement": "SubProcess",
      "multiInstance": { "isSequential": true, "collection": "items" },
      "documentation": "설명"
    },
    { "op": "addFlow", "id": "ID", "source": "소스ID", "target": "타겟ID", "name": "라벨", "condition": "조건식", "isDefault": true },
    { "op": "updateProps", "target": "대상ID", "properties": { "name": "새 이름" }, "camunda": { ... } },
    { "op": "removeNode", "target": "삭제할ID" },
    { "op": "removeFlow", "target": "삭제할흐름ID" },
    { "op": "addAnnotation", "id": "anno1", "text": "설명", "x": 300, "y": 80, "width": 200, "height": 30 },
    { "op": "addAssociation", "id": "assoc1", "source": "노드ID", "target": "anno1" },
    { "op": "addError", "id": "Error_1", "name": "에러명", "errorMessage": "메시지" },
    { "op": "updateDefinitions", "properties": {
        "id": "Definitions_1", "exporter": "bpmn-tool", "exporterVersion": "1.3.0",
        "modeler": { "executionPlatform": "Camunda Platform", "executionPlatformVersion": "7.15.0" }
      }
    }
  ]
}
```

**camunda 확장 업데이트 시맨틱**: `updateProps`의 `camunda.properties`, `camunda.inputParameters`, `camunda.outputParameters`는 **replace** 시맨틱이다. 전달된 배열이 해당 컨테이너의 전체 내용을 대체한다 (append가 아님). 기존 `camunda:Properties` / `camunda:InputOutput` 컨테이너를 재사용하여 중복을 방지한다.

**updateProps DI 위치 동기화**: `updateProps`에 `x`, `y`를 지정하면 노드의 DI shape bounds가 업데이트되고, 연결된 모든 엣지의 웨이포인트가 자동 재계산된다:
```json
{ "op": "updateProps", "target": "Task_1", "properties": { "name": "새 이름" }, "x": 500, "y": 300 }
```

**중요**: removeNode는 연결된 흐름도 자동 삭제한다.

**BoundaryEvent 자동 배치**: addNode으로 BoundaryEvent 추가 시 x/y를 생략하면 호스트 노드의 우하단에 자동 배치된다 (create와 동일한 동작). `attachedToRef`가 필수.

**Pool 자동 리사이즈**: modify 완료 후 Pool(Participant) bounds가 내부 모든 shape의 bounding box 기준으로 자동 재계산된다. 별도 조정 불필요.

**루프백 흐름**: `addFlow`에서 target이 source보다 왼쪽에 있는 역방향 흐름은 자동으로 하단 우회 웨이포인트를 생성한다 (create와 동일한 라우팅 적용).

**`-i` (in-place) 옵션**: `bpmn-tool modify <file.bpmn> -i`로 실행하면 원본 파일에 직접 덮어쓰고, **검증(validate) + 미리보기(preview) 결과를 JSON으로 stdout에 출력**한다. 별도 validate/preview 호출 없이 수정 결과를 즉시 확인 가능.

### 4. 검증 (validate)

```bash
bpmn-tool validate file.bpmn
```

검증 항목:
- XML 파싱 유효성
- 프로세스 존재 여부
- Start/End Event 존재 여부
- 연결 무결성 (sourceRef/targetRef 누락)
- 노드 연결 상태 — 들어오는 흐름 누락(경고), **나가는 흐름 누락(오류)**: 모든 활동·게이트웨이는 종료이벤트까지 연결 필수
- **EventBasedGateway 시맨틱** — 뒤에 IntermediateCatchEvent 또는 ReceiveTask만 허용
- **ExclusiveGateway default flow** — 분기 2개 이상 시 default flow 설정 권장
- DI(BPMNDiagram) 존재 여부
- **Shape 겹침 검사** — 노드 간 bounds가 겹치면 경고 (Participant 제외, 5px 허용)
- Round-trip 안정성 (직렬화→역직렬화 무손실)

#### validate 출력 JSON 구조

```json
{
  "유효": true,
  "요약": { "치명": 0, "오류": 0, "경고": 0 },
  "문제": [
    { "수준": "경고", "메시지": "프로세스 Process_1: EndEvent 없음" }
  ]
}
```

`수준` 값: `치명` (XML 파싱 실패), `오류` (구조적 문제), `경고` (권장 사항 위반)

### 5. 텍스트 미리보기 (preview)

```bash
bpmn-tool preview file.bpmn
```

다이어그램의 흐름을 텍스트로 시각화한다. BPMN 뷰어 없이 구조를 빠르게 확인할 때 유용하다.

**표시 아이콘:**

| 아이콘 | 의미 |
|---|---|
| `○` | StartEvent |
| `●` | EndEvent |
| `◇` | ExclusiveGateway |
| `◆` | ParallelGateway |
| `◈` | InclusiveGateway |
| `⬡` | EventBasedGateway |
| `⚙` | ServiceTask |
| `👤` | UserTask |
| `✋` | ManualTask |
| `📋` | BusinessRuleTask |
| `📜` | ScriptTask |
| `📤` | SendTask |
| `↗` | CallActivity |
| `[⊞]` | SubProcess |
| `◎` | IntermediateCatchEvent |
| `◉` | IntermediateThrowEvent |
| `⊘` | BoundaryEvent |

**이벤트 서브타입 접미사:**

| 접미사 | 의미 |
|---|---|
| `✉` | MessageEventDefinition |
| `⏱` | TimerEventDefinition |
| `⚡` | ErrorEventDefinition |
| `⚑` | SignalEventDefinition |
| `■` | TerminateEventDefinition |

**다중 인스턴스:** `⫶`(순차), `⫴`(병렬)

**출력 구조:**
- **메인**: default flow를 따른 주 경로
- **분기**: 게이트웨이 대체 경로 (조건식 포함)
- **경계이벤트**: BoundaryEvent → 후속 경로 (인터럽트/비인터럽트 구분)
- **통계**: 노드수, 게이트웨이수, 이벤트수, 경계이벤트수, 흐름수

## BPMN 2.0 요소 타입 레퍼런스

### 이벤트 (Events)
| 타입 | 설명 | 크기 |
|---|---|---|
| `bpmn:StartEvent` | 프로세스 시작점 | 36x36 |
| `bpmn:EndEvent` | 프로세스 종료점 | 36x36 |
| `bpmn:IntermediateCatchEvent` | 중간 수신 이벤트 | 36x36 |
| `bpmn:IntermediateThrowEvent` | 중간 발생 이벤트 | 36x36 |
| `bpmn:BoundaryEvent` | 경계 이벤트 (태스크에 부착) | 36x36 |

이벤트 정의 (eventDefinitions 배열로 추가):
- `bpmn:MessageEventDefinition` — 메시지
- `bpmn:TimerEventDefinition` — 타이머
- `bpmn:ErrorEventDefinition` — 오류
- `bpmn:SignalEventDefinition` — 시그널
- `bpmn:TerminateEventDefinition` — 종료(EndEvent에만)

### 태스크/액티비티 (Tasks)
| 타입 | 설명 | 크기 |
|---|---|---|
| `bpmn:Task` | 범용 태스크 | 100x80 |
| `bpmn:UserTask` | 사용자 태스크 (수동 작업) | 100x80 |
| `bpmn:ServiceTask` | 서비스 태스크 (자동 실행) | 100x80 |
| `bpmn:ScriptTask` | 스크립트 태스크 | 100x80 |
| `bpmn:BusinessRuleTask` | 비즈니스 규칙 태스크 | 100x80 |
| `bpmn:ManualTask` | 수동 태스크 | 100x80 |
| `bpmn:SendTask` | 송신 태스크 (외부 전송) | 100x80 |
| `bpmn:CallActivity` | 호출 액티비티 (서브프로세스 참조) | 100x80 |
| `bpmn:SubProcess` | 내장 서브프로세스 | 가변 |

### 게이트웨이 (Gateways)
| 타입 | 설명 | 의미론 | 크기 |
|---|---|---|---|
| `bpmn:ExclusiveGateway` | 배타적 (XOR) | 조건에 따라 하나만 선택 | 50x50 |
| `bpmn:ParallelGateway` | 병렬 (AND) | 모든 경로 동시 실행/대기 | 50x50 |
| `bpmn:InclusiveGateway` | 포괄적 (OR) | 조건 만족하는 모든 경로 | 50x50 |
| `bpmn:EventBasedGateway` | 이벤트 기반 | 먼저 발생하는 이벤트 선택 | 50x50 |
| `bpmn:ComplexGateway` | 복합 | 커스텀 조건 | 50x50 |

### 연결 (Flows)
| 타입 | 설명 |
|---|---|
| `bpmn:SequenceFlow` | 실행 흐름 (같은 프로세스 내) |
| `bpmn:MessageFlow` | 메시지 흐름 (풀/참여자 간) |

## 흐름(Flow) 속성

- `condition`: 조건식 (예: `"${amount > 1000}"`) — FormalExpression으로 변환됨
- `isDefault`: true이면 기본 흐름 (게이트웨이의 default 속성에 설정)
- `name`: 흐름에 표시할 라벨

## 게이트웨이 시맨틱 가이드

### ExclusiveGateway (XOR)
- **분기**: 조건을 평가하여 **하나의 경로만** 선택
- **합류**: 먼저 도착한 토큰이 통과 (대기 없음)
- **default flow 필수**: 분기 2개 이상일 때 반드시 하나의 기본 흐름(`isDefault: true`) 지정 — 조건에 맞는 것이 없을 때의 폴백
- validate에서 default flow 미설정 시 경고 발생

### ParallelGateway (AND)
- **분기**: 모든 나가는 경로를 **동시 실행** (조건 없음)
- **합류**: **모든 들어오는 토큰**이 도착해야 통과 (동기화)
- 분기 게이트웨이와 합류 게이트웨이를 쌍으로 사용

### InclusiveGateway (OR)
- **분기**: 조건을 평가하여 **참인 경로 모두** 동시 실행. 모두 거짓이면 default flow
- **합류**: **활성화된 경로의 토큰만** 대기 후 통과 (선택적 동기화)
- 예: 합격 + 부분합격이 동시에 true → 입고 처리와 재작업 모두 실행 → 합류 게이트웨이가 둘 다 완료될 때까지 대기

### EventBasedGateway
- **분기 전용**: 나가는 흐름의 대상은 **IntermediateCatchEvent 또는 ReceiveTask만** 허용
- **먼저 발생한 이벤트의 경로만** 실행, 나머지는 취소
- 주요 패턴: 메시지 수신 vs 타이머 타임아웃
- validate에서 허용되지 않는 후속 노드 타입 시 경고 발생

```json
{
  "id": "GW_EB", "type": "bpmn:EventBasedGateway"
}
// 후속 노드: IntermediateCatchEvent만 가능
{ "id": "Evt_Msg", "type": "bpmn:IntermediateCatchEvent",
  "eventDefinitions": [{ "type": "bpmn:MessageEventDefinition" }] }
{ "id": "Evt_Timer", "type": "bpmn:IntermediateCatchEvent",
  "eventDefinitions": [{ "type": "bpmn:TimerEventDefinition" }] }
```

## 조건식 가이드

조건식은 `"${표현식}"` 형태의 JUEL(Unified Expression Language) 표현식을 사용한다:

### 비교 연산자
```
${amount > 1000}           // 숫자 비교
${status == 'APPROVED'}    // 문자열 비교 (== 사용)
${count >= 10 && count <= 100}  // 범위 검사
${priority != 'LOW'}       // 부정
```

### 논리 연산자
```
${isUrgent || amount > 5000}    // OR
${isValid && !isExpired}        // AND + NOT
```

### 변수/메서드 참조
```
${readyStatus == 'READY'}       // 프로세스 변수 참조
${qualityPass == true}          // boolean 변수
${order.type == 'EXPORT'}       // 객체 속성 접근
```

### 흐름에 조건 적용
```json
{ "id": "F1", "source": "GW1", "target": "Task_A",
  "name": "승인", "condition": "${status == 'APPROVED'}" },
{ "id": "F2", "source": "GW1", "target": "Task_B",
  "name": "반려", "isDefault": true }
```

**주의**: 조건식의 구문 검증은 수행하지 않는다. 문자열 그대로 FormalExpression.body에 저장된다.

## 자연어 → BPMN 변환 가이드

사용자 요청 분석 시 다음 매핑을 적용:

| 자연어 패턴 | BPMN 요소 |
|---|---|
| "시작", "처음" | `bpmn:StartEvent` |
| "끝", "종료", "완료" | `bpmn:EndEvent` |
| "사용자가 ~한다", "수동으로 ~" | `bpmn:UserTask` |
| "시스템이 ~한다", "자동으로 ~" | `bpmn:ServiceTask` |
| "~인 경우/아닌 경우", "분기", "판단" | `bpmn:ExclusiveGateway` |
| "동시에", "병렬로" | `bpmn:ParallelGateway` |
| "~이거나 ~이면" (복수 조건 가능) | `bpmn:InclusiveGateway` |
| "~를 기다린다", "먼저 오는 쪽" | `bpmn:EventBasedGateway` |
| "~를 기다린다", "타이머" | `bpmn:IntermediateCatchEvent` + TimerEventDefinition |
| "오류 발생 시" | `bpmn:BoundaryEvent` + ErrorEventDefinition |
| "알림 보낸다", "메시지 전달" | `bpmn:IntermediateThrowEvent` + MessageEventDefinition |
| "지연 감시", "시간 초과" | `bpmn:BoundaryEvent` + TimerEventDefinition |
| "서브프로세스 호출" | `bpmn:CallActivity` + `calledElement` |

## 작업 흐름 (Workflow)

### BPMN 작성 요청 시:
1. 사용자 요청에서 프로세스 흐름, 분기 조건, 참여자 파악
2. JSON 스펙 구성 (nodes + flows)
3. `create` 명령으로 XML 생성
4. `validate`로 검증
5. `preview`로 흐름 텍스트 확인
6. 사용자에게 구조 요약 설명

**복잡한 프로세스 단계적 작성 방법**: 노드가 20개 이상인 복잡한 다이어그램은 아래 단계로 나눠 작성하면 실수를 줄일 수 있다:
1. 메인 흐름(Happy Path)만 `create`로 생성
2. 분기 경로(게이트웨이 + 대체 경로)를 `modify`의 addNode/addFlow로 추가
3. 경계 이벤트와 에러 경로를 `modify`로 추가
4. TextAnnotation을 `modify`의 addAnnotation으로 추가

**단계적 작성 시 주의사항**:
- **경계 이벤트는 호스트 노드 생성 후** 별도 modify 단계에서 추가한다. `attachedToRef`의 대상이 이미 존재해야 호스트 우하단에 자동 배치된다.
- **모든 경로는 EndEvent로 종료** — 비인터럽트 경계이벤트의 알림 경로도 반드시 EndEvent와 연결해야 한다. Activity로 끝나는 경로는 BPMN 규칙 위반이며 validate에서 오류로 검출된다.
- **Pool 리사이즈는 자동** — modify 완료 시 Pool bounds가 내부 shape 기준으로 자동 재계산되므로 수동 조정 불필요.
- **`-i` 옵션 활용** — `bpmn-tool modify file.bpmn -i`를 사용하면 파일에 직접 덮어쓰고 검증+미리보기를 자동 출력한다. 별도 validate/preview 호출이 불필요.

### BPMN 해석 요청 시:
1. `parse` 명령으로 구조 추출
2. 시작점에서 종료점까지의 흐름 추적
3. 분기 조건, 병렬 구간, 이벤트 설명
4. 구조적 문제가 있으면 함께 보고

### BPMN 수정 요청 시:
1. `parse`로 현재 구조 파악
2. 변경 사항을 operations 목록으로 변환
3. `modify -i` 명령 실행 — 검증 + 미리보기가 자동 출력되므로 별도 validate/preview 불필요
4. 출력된 검증/미리보기 결과를 사용자에게 요약

## 템플릿 (빠른 시작)

패키지 설치 경로의 `templates/` 에 JSON 스펙 템플릿이 포함되어 있다. `npm root -g` 로 글로벌 경로를 확인하여 참조한다.
- `simple-sequence.json` — 순차 프로세스 (Start → UserTask → ServiceTask → End)
- `exclusive-gateway.json` — 배타적 분기 (승인/반려 패턴)
- `parallel-gateway.json` — 병렬 처리 (동시 작업 후 합류)
- `empty.bpmn` — 빈 BPMN (StartEvent만)

## DI(Diagram Interchange) 자동 처리

- **스마트 레이아웃**: create 시 좌표 미지정 노드를 자동 배치. 메인 경로(default flow 우선)를 가로 순차(시작 X=180, 중심 Y=200, 간격 50px), 분기 노드를 Y 오프셋(±140px 교대)으로 배치
- **ExclusiveGateway**: DI에 `isMarkerVisible=true` 자동 설정
- **BoundaryEvent**: 호스트 노드 우하단에 자동 배치 (x/y 미지정 시) — create와 modify 모두 동일 동작
- **흐름 라벨**: name이 있는 SequenceFlow에 BPMNLabel 자동 생성
- **게이트웨이 라우팅**: Y축이 다른 분기 시 소스/타겟의 상대 위치에 따라 접속 지점 자동 결정
  - **수직 정렬** (소스 center X가 타겟 x 범위 내): 소스 하단 → 타겟 상단 직결 (2 waypoints)
  - **비정렬** (소스 center X가 타겟 x 범위 밖): 소스 하단 → 수평 이동 → 타겟 좌측 진입 (L자 3 waypoints)
  - 비게이트웨이도 수직 정렬 시 상/하단 직결 적용
- **루프백 웨이포인트**: target이 source 왼쪽에 있는 역방향 흐름은 하단으로 우회하는 4-포인트 경로를 자동 생성. 경로 사이 모든 shape의 최대 하단 + 40px 마진으로 우회. create와 modify 모두 동일 로직 적용
- **SubProcess 확장**: `children`이 있는 SubProcess는 `isExpanded=true`로 설정되며, 자식 노드는 SubProcess 내부에 자동 배치
- **Pool 자동 리사이즈**: modify 완료 후 Pool(Participant) bounds가 내부 모든 shape의 bounding box 기준으로 자동 재계산 (패딩: 좌 50px, 상 40px, 우하 30~40px)
- **노드 이동 시 엣지 동기화**: updateProps에 x/y 지정 시 DI bounds 업데이트 + 연결된 엣지 웨이포인트 자동 재계산
- **확장 보존**: bioc/color 등 확장 네임스페이스 속성은 modify/export 시 보존된다 (round-trip 안전)

### 스마트 레이아웃 작동 원리

좌표가 미지정된 노드가 하나라도 있으면 자동 배치가 활성화된다:

1. **메인 경로 탐색**: StartEvent에서 시작, 게이트웨이에서는 `isDefault` flow 우선
2. **메인 경로 배치**: 가로 순차 (X 증가, Y=200 중심)
3. **분기 노드 배치**: 게이트웨이에서 분기된 노드를 Y 오프셋으로 배치
   - 첫 번째 분기: Y+140 (아래)
   - 두 번째 분기: Y-140 (위)
   - 세 번째 분기: Y+280 (더 아래)
   - X는 게이트웨이와 합류 지점의 중앙
4. **혼합 가능**: 일부 노드만 좌표 명시, 나머지는 자동 배치

**한계**: 순환(cycle) 감지 없음, 단일 StartEvent 가정. 자동 배치 시 충돌 방지는 동작하지만, 명시적 좌표를 지정한 노드 간 겹침은 자동으로 해소되지 않는다.

## 주의사항

- **id 규칙**: 영문/숫자/언더스코어, 중복 불가
- **EndEvent 연결 필수**: 모든 경로(분기, 경계이벤트 포함)는 반드시 EndEvent로 종료되어야 한다. Activity나 Gateway로 끝나는 경로는 BPMN 2.0 규칙 위반이며, validate에서 `오류`로 검출된다
- **게이트웨이 분기**: ExclusiveGateway는 반드시 하나의 default flow를 가져야 한다 (조건 없는 fallback)
- **EventBasedGateway 제약**: 후속 노드는 IntermediateCatchEvent 또는 ReceiveTask만 가능
- **DI 좌표 겹침 방지**: 분기 노드의 좌표를 명시할 때 기존 노드와 x·y 범위가 겹치지 않아야 한다. validate가 Shape 겹침을 경고로 검출한다
  - 노드 크기 참고: Task=100x80, Gateway=50x50, Event=36x36
  - **분기 노드는 메인 경로 노드와 같은 x 열에 배치하지 말 것** — 연결선이 교차할 수 있음
  - 분기 영역에 충분한 가로 공간 확보: 게이트웨이와 다음 메인 노드 사이에 분기 노드 수 × 150px 이상의 간격 필요
  - 주 흐름 y=200 기준, 첫 분기 행 y≥350 (노드 하단 간 최소 30px 간격)
- **노드 이동**: updateProps에 `x`, `y`를 지정하면 DI bounds가 업데이트되고 연결된 엣지 웨이포인트가 자동 재계산된다
- **조건식**: `"${변수 조건}"` 형태 (JUEL/Feel 표현식)
- **검증 필수**: 모든 작업 후 반드시 validate 실행
- **테스트**: `npm test` (node --test) 로 전체 테스트 실행 가능
