# OASIS Core Overview

이 문서는 OASIS 구조를 빠르게 이해하기 위한 요약이다. 사용자 프로젝트를 읽을 때 OASIS 문제가 어느 계층의 문제인지 빠르게 분류하는 용도로 사용한다.

## OASIS를 한 문장으로

OASIS core는 BPMN으로 모델링한 업무 흐름을 런타임 컨텍스트와 Java task 실행기로 연결해 주는 실행 엔진이다.

## 런타임 계층 맵

- `factories`
  - 실행 진입점 조립 계층이다.
  - 특히 `ProcessStaterAndElementExecutorFactory` 는 테스트에서 가장 자주 보이는 조립 포인트다.
- `provider`, `loader`, `unmarshal.camunda`
  - BPMN 문서를 찾고 읽고 `Service`/`Process` 모델로 변환한다.
- `process`, `execution`, `executors`
  - 실제 흐름 제어와 요소 실행 위임을 맡는다.
  - 분기, 병렬, 루프, 서브프로세스, 스크립트 태스크 문제는 이 계층과 관련될 가능성이 크다.
- `context`, `service`, `message`, `transaction`
  - 서비스 입력, 프로세스 상태, 결과, 메시지, 트랜잭션 경계를 관리한다.
  - `ServiceResult`, `path()`, `messages()`, rollback 논의는 이 계층에서 읽으면 된다.
- `model`
  - BPMN 요소를 표현하는 추상 모델이다.
  - 태스크 타입 자체의 의미를 확인할 때 우선 본다.

## 사용자 프로젝트를 읽을 때의 해석 순서

1. `.bpmn` 과 서비스 ID를 찾는다.
2. 어떤 태스크 타입이 핵심인지 확인한다.
3. 입력값이 어디서 오는지 `ServiceContext` 와 output alias를 본다.
4. 문제가 parse 단계인지, binding 단계인지, runtime 단계인지, side-effect 단계인지 분리한다.

## 자주 나오는 문제와 1차 진단 포인트

- BPMN을 아예 못 읽는다
  - `unmarshal.camunda` 계층을 의심한다.
  - 필수 프로퍼티 누락, 잘못된 task type, invalid property value 여부를 먼저 본다.
- 태스크는 실행되는데 원하는 메서드/생성자가 안 잡힌다
  - `MethodBinding` 성격의 문제다.
  - 파라미터 이름, 컨텍스트 키, 오버로딩 여부를 본다.
- 결과는 나오는데 분기/경로가 다르다
  - `process` 와 `flow` 계층 문제다.
  - `path()` 검증이 우선이다.
- 결과는 맞는데 메시지/트랜잭션이 이상하다
  - `message` 또는 `transaction` 계층 문제다.
  - `messages()` 혹은 DB 상태 검증으로 좁힌다.

## 서비스 실행 관점의 mental model

- 클라이언트는 서비스 ID와 입력값을 `ServiceContext` 로 넣는다.
- 서비스 실행기는 해당 BPMN 서비스 모델을 불러온다.
- 프로세스 실행기는 흐름을 제어한다.
- 요소 실행기는 각 태스크 타입에 맞는 실행기로 위임한다.
- 최종 결과는 `ServiceResult` 로 정리되어 호출자에게 반환된다.

## 기억할 기준점

- 테스트는 보통 “BPMN 하나를 실행해서 결과를 검증하는 패턴”으로 구성된다.
- 경로 문제는 `path()` 성격의 결과를 확인하는 쪽에서 주로 드러난다.
- 입력 어댑터와 task 계약 문제는 서비스 시작 직전 컨텍스트 해석에서 주로 드러난다.
