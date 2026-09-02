# BPMN Skill Integration

이 문서는 `oasis-project-support` 와 설치된 `bpmn-skill` 사이의 역할 분리와 handoff 계약을 정리한 것이다.

## 한 줄 요약

- `bpmn-skill` 은 `.bpmn` 파일을 안전하게 만들고 고치는 스킬이다.
- `oasis-project-support` 는 그 BPMN이 OASIS에서 실제로 어떻게 실행되는지 해석하고 검증하는 스킬이다.

## `bpmn-skill` 이 맡는 일

- `bpmn-tool` 을 사용한 `.bpmn` 생성
- 기존 `.bpmn` 구조 수정
- BPMN parse / preview / validate
- 직접 XML 편집 없이 semantic + DI 를 보존하는 파일 수정
- 일반 BPMN 2.0 관점의 요소 선택과 구조 정리

## `oasis-project-support` 가 맡는 일

- OASIS 서비스 ID와 실행 진입점 해석
- OASIS에서 사용하는 Camunda/OASIS 속성 해석
  - `input`
  - `output`
  - `class`
  - `method`
  - `tx`
  - send-task 관련 binding
- `PropertyEL`, `MethodBinding`, Java task 계약 검토
- `ServiceResult`, `path()`, `messages()` 기준 테스트 설계
- transaction, message, multi-datasource, error handling 같은 런타임 부작용 검토

## 함께 쓰는 표준 순서

1. `bpmn-skill` 로 BPMN 구조를 만든다.
2. `bpmn-skill` 로 `.bpmn` 파일을 validate 한다.
3. `oasis-project-support` 가 OASIS 속성과 실행 의미를 점검한다.
4. `oasis-project-support` 가 필요한 Java task 수정점과 테스트 전략을 정한다.
5. 구조 변경이 더 필요하면 그 변경 요청을 다시 `bpmn-skill` 로 돌린다.

## 새 기능 추가 시 연결 방식

- `bpmn-skill` 에 넘길 요청
  - 프로세스의 주요 단계
  - 필요한 gateway / event / subprocess 형태
  - 생성하거나 수정할 `.bpmn` 파일 경로
- `oasis-project-support` 에 넘길 요청
  - 각 task에 붙여야 할 OASIS 속성
  - 결과 alias, input/output contract
  - 어떤 Java task class/method 를 기대하는지
  - 어떤 테스트로 성공을 증명할지

## Worked Example: 제조오더 상태 변경 서비스

원본 프롬프트 예시:

```text
제조오더상태를 변경하는 서비스를 작성한다.
제조오더번호와 이벤트와 파라미터를 받아서 적절한 상태로 변경하는 서비스를 작성한다.
시작이벤트에서 게이트웨이를 통과하고 이 게이트웨이에서 이벤트별 분기를 한다.
이벤트의 파라미터가 확정이면 제조오더번호로 제조오더 디비를 조회해서 제조오더 디비 상태를 변경한다.
상태값은 status 필드에 A로 변경한다.
```

이 프롬프트를 받으면 두 스킬은 아래 순서로 협력한다.

### 1. `bpmn-skill` 이 먼저 만드는 것

- executable process 뼈대
- start event
- `event` 기준 exclusive gateway
- 제조오더 상태 변경을 수행하는 주 branch
- 지원하지 않는 이벤트용 default branch
- 필요하면 조회 task 와 상태 변경 task 를 분리한 service task 두 개

### 2. `oasis-project-support` 가 그다음 정하는 것

- 입력 계약
  - `manufacturingOrderNo`
  - `event`
  - `params`
- 게이트웨이 의미
  - `input=event`
- branch-local 조건
  - 상태 변경은 `params.confirmed == true` 또는 이에 준하는 “확정” 조건일 때만 수행
- DB 동작
  - 제조오더번호로 조회
  - `status` 필드를 `"A"` 로 갱신
- fallback
  - 이벤트가 지원 대상이 아니면 default branch
  - 파라미터가 확정이 아니면 no-op 또는 user error path

### 3. 이 예시에서 `bpmn-skill` 에 넘길 구조 요청 예시

```text
Executable BPMN service를 만든다.
입력은 manufacturingOrderNo, event, params 이다.
StartEvent 뒤에 ExclusiveGateway를 두고 event 기준으로 분기한다.
`confirm` 이벤트 branch 에서는 제조오더 조회 task 와 status=A 업데이트 task 를 배치한다.
지원하지 않는 이벤트는 default end 또는 error branch 로 보낸다.
```

### 4. 이 예시에서 `oasis-project-support` 가 추가해야 할 런타임 계약

- 조회 task 입력에 제조오더번호가 정확히 전달되는지
- 상태 변경 task 입력에 조회 결과 또는 제조오더번호가 정확히 전달되는지
- 변경 task 가 실제로 `status = "A"` 를 쓰는지
- `confirmed` 조건이 false 인 경우 update 가 일어나지 않는지
- `ServiceResult` 나 DB assertion 으로 변경 여부를 증명하는지

### 5. 기본 해석 규칙

- 프롬프트가 이벤트 목록 전체를 주지 않으면, 설명된 이벤트 branch 하나와 default branch 하나만 만든다.
- 프롬프트가 조건부 변경만 정의하고 else 를 주지 않으면, 임의의 다른 상태 변경을 만들지 않는다.
- 상태 변경 서비스 요청은 BPMN 구조 작성과 OASIS 실행 계약 정의가 모두 필요하므로 두 스킬을 함께 쓴다.

## 장애 분석 시 연결 방식

- 증상이 “BPMN이 깨졌다” 또는 “파일을 고쳐야 한다”에 가깝다
  - `bpmn-skill` 우선
- 증상이 “OASIS에서 실행 결과가 이상하다”에 가깝다
  - `oasis-project-support` 우선
- 증상이 둘 다 섞여 있다
  - `oasis-project-support` 가 먼저 실패 원인을 분류
  - 구조 수정이 필요한 경우에만 `bpmn-skill` 로 구조 변경을 요청

## `oasis-project-support` 가 `bpmn-skill` 에 넘겨야 하는 최소 계약

- 변경할 요소와 연결 관계
- 유지해야 하는 OASIS 속성 이름과 값
- 유지해야 하는 boundary event / path behavior
- 수정 후에도 살아 있어야 하는 서비스 ID, task ID, alias 이름

예시:

```text
`taskA` 와 `gateway1` 사이에 `ServiceTask` 하나를 추가하되,
`input=userId`, `output=validatedUser`, `class=com.foo.UserTask`, `method=validate`
속성은 유지하고, 예외 발생 시 `boundaryError1` 경로는 그대로 유지한다.
```

## `bpmn-skill` 결과물을 받은 뒤 이 스킬이 반드시 확인할 것

- `.bpmn` 파일이 여전히 OASIS에서 사용하는 서비스/태스크 식별자를 유지하는지
- 새로 추가된 task에 필요한 OASIS 속성이 누락되지 않았는지
- alias 이름이 Java task 계약과 맞는지
- 구조 변경 때문에 기존 테스트 assertion 이 깨지지 않는지
- 필요하면 `references/pattern-map.md` 기준으로 가장 가까운 회귀 샘플이 무엇인지

## 금지 사항

- 구조 변경을 위해 BPMN XML을 수동 편집하지 않는다.
- `bpmn-skill` 이 할 수 있는 `.bpmn` 파일 수정 작업을 이 스킬에서 대신하지 않는다.
- 반대로 런타임 바인딩, OASIS 속성 의미, 테스트 전략을 `bpmn-skill` 에 맡기지 않는다.
