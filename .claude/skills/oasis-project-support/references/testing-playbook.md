# Testing Playbook

이 문서는 OASIS 테스트 패턴을 요약한 스냅샷이다. 사용 프로젝트가 OASIS 라이브러리 의존성만 가지고 있어도 이해할 수 있도록, 전략 중심으로 정리한다. 실제 Java source/BPMN XML 조각은 `source-bpmn-examples.md` 를 같이 보고, 리스트/루프 관련 구체 규칙은 `list-loop-guide.md` 를 같이 본다.

## 기본 원칙

- BPMN 문서와 Java task를 함께 검증하는 시나리오 테스트를 우선한다.
- 성공 여부만 보지 말고 `path()`, `result(key)`, `messages()` 까지 같이 본다.
- 새 기능을 추가할 때는 가능한 한 BPMN 파일과 테스트 클래스를 같은 시나리오 이름으로 남긴다.

## 1. BPMN 하나를 바로 실행하는 가장 작은 테스트

가장 먼저 떠올릴 패턴은 “BPMN 파일 하나를 직접 실행하는 가장 작은 시나리오 테스트”다.

실제 Java source 예제:
- `source-bpmn-examples.md` 의 “BPMN 하나를 직접 실행하는 최소 테스트”

핵심 구성:
- `getServiceStarter("/usecase/parallel/parallel.bpmn")`
- `new DefaultServiceContext(...)`
- `serviceStarter.start("parallel", serviceContext)`

이 패턴은 분기, 병렬, 예외, 메시징처럼 특정 BPMN 시나리오를 빠르게 재현할 때 가장 유용하다.

## 2. `ServiceResult` 로 실제 동작을 증명하기

결과 검증은 기능별로 아래 우선순위를 따른다.

- 라우팅과 분기
  - `path()` 를 본다.
  - 대표 패턴: 병렬 경로, 분기 선택, 서브프로세스 진입/복귀
- 산출물과 output alias
  - `result(key)` 또는 `results()` 를 본다.
  - 대표 패턴: output expression, 결과 alias, DTO 결과 추출
- 메시지 태스크
  - `messages()` 를 본다.
  - 대표 패턴: pre-structured message, object message, subprocess message aggregation
- 오류 경계
  - `serviceResultCode()` 와 `exception()` 을 본다.
  - 대표 패턴: 사용자 예외 종료, boundary event 분기, 시스템 예외 전파

## 3. 태스크 구현체를 목 객체로 교체하기

실제 Java task 구현을 실행하지 않고 BPMN 흐름만 검증하고 싶다면 `DefaultServiceContext.setClassToObjectMap()` 을 쓴다.

실제 Java source 예제:
- `source-bpmn-examples.md` 의 “실제 task 대신 목 객체를 주입하는 테스트 모드”

언제 쓰는가:
- 외부 의존성이 큰 task를 우회하고 싶을 때
- 분기/루프/결과 바인딩만 검증하고 싶을 때
- 재현 테스트를 최소 비용으로 먼저 만들고 싶을 때

## 4. 서브프로세스와 DTO 전달 검증

서브프로세스에서 DTO 변환 또는 결과 전달이 핵심이면 `SubProcessResult` 와 output alias를 같이 본다.

대표 패턴:
- inline subprocess 와 offline subprocess 비교
- subprocess 결과를 DTO나 result alias로 끌어올리기
- nested subprocess 에서 path 검증하기

## 5. 메시지 태스크 검증

Send Task 류는 외부 전송 자체보다 `ServiceResult.messages()` 에 쌓인 메시지 내용을 검증한다.

필수 준비:
- `topicLoader`
- `topicStructureLoader`
- 필요 시 transaction handler

## 6. SQL Script/Transaction 통합 테스트

`ScriptTask` 나 `transaction` 포맷이 개입되면 내장 DB를 띄워 실제 side effect를 확인한다.

실제 Java source 예제:
- `source-bpmn-examples.md` 의 “Transaction Script Task 예제”

핵심 패턴:
- `EmbeddedDatabaseBuilder`
- `DefaultApplicationContext` 에 datasource / transaction manager 주입
- `SpringTransactionHandler`
- DB row count 또는 query 결과로 commit / rollback 검증

## 7. 추천 응답 패턴

디버깅 요청을 받으면 아래 순서로 테스트 전략을 제안한다.

1. 가장 작은 BPMN 재현 테스트를 만든다.
2. `path()` 또는 `result(key)` 중 무엇이 본질 assertion인지 정한다.
3. 외부 의존성이 크면 `setClassToObjectMap()` 으로 task를 대체한다.
4. 메시지/트랜잭션 문제면 통합 테스트로 올린다.

## 자주 인용할 대표 패턴 이름

- parallel execution
- output expression
- test mode with mocked task
- subprocess DTO passing
- pre-structured message send
- transaction script task
- multi-datasource transaction
