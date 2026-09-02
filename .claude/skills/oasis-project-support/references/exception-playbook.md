# Exception Playbook

이 문서는 OASIS 예외 처리 규칙과 대표 예외 테스트 패턴을 바탕으로 정리한 가이드다. 실제 Java source/BPMN XML 조각은 `source-bpmn-examples.md` 의 exception 섹션을 같이 본다.

## 서비스 결과 관점의 기본 규칙

- 기본 `ServiceStarter` 는 `UserException` 을 특별 취급한다.
- `UserException` 이 발생하면 클라이언트로 `ServiceResult` 를 반환하고, 메시지와 결과 코드를 정상적인 사용자 오류 흐름으로 전달한다.
- 그 외 예외는 시스템 예외로 전파되거나 `exception()` 에 담겨 돌아온다.

## Java task에서 `UserException` 쓰기

사용자 입력 문제나 비즈니스 검증 실패처럼 stack trace 없이 제어 가능한 중단이면 `UserException` 을 사용한다.

예시:

```java
throw new UserException("입력값에 문제가 있습니다.");
```

## BPMN에서 Error End Event 쓰기

태스크 결과에 따라 서비스를 중단하고 사용자 오류 메시지를 돌려주고 싶으면 종료 이벤트를 Error End Event 로 설정한다.

핵심 포인트:
- 오류 메시지를 이벤트에 설정한다.
- 필요하면 메시지 안에 `#{변수}` 바인딩을 사용한다.
- 입력 바인딩은 Extensions 의 `input` 프로퍼티에서 연결한다.

대표 패턴:
- 사용자 예외 종료 이벤트
- 커스텀 `UserException`
- 메시지 바인딩이 포함된 오류 종료

실제 BPMN XML / Java 예제:
- `source-bpmn-examples.md` 의 “Error End Event 와 `UserException` 예제”

## Error Boundary Event 쓰기

특정 태스크 또는 서브프로세스에서 발생하는 예외만 잡아 별도 경로로 보내고 싶을 때 쓴다.

핵심 규칙:
- 예외를 잡을 task 또는 subprocess 경계에 붙인다.
- `class` 속성으로 잡을 예외 클래스를 명시한다.
- 동일 task에 여러 boundary event가 있으면 `pri` 로 우선순위를 지정한다.
- 예외 메시지는 요소 결과로 흘러갈 수 있으므로 이후 분기 조건과 함께 본다.

대표 패턴:
- task exception boundary
- subprocess exception boundary
- parallel 안의 boundary event

실제 BPMN XML / Java 예제:
- `source-bpmn-examples.md` 의 “Error Boundary Event 와 메시지 바인딩 예제”

## 어떤 테스트를 먼저 볼지 정하는 기준

- `UserException` 메시지와 결과 코드가 중요하다
  - 사용자 예외 종료 이벤트 계열 패턴을 먼저 본다.
- 특정 태스크에서 예외를 잡아 경로를 바꾸는 게 중요하다
  - boundary event 계열 패턴을 먼저 본다.
- 예외가 발생했을 때 트랜잭션 경계가 핵심이다
  - transaction script, multi-datasource, transactional subservice 계열 패턴을 먼저 본다.

## 디버깅 체크리스트

1. 기대하는 것이 사용자 오류 흐름인지 시스템 예외 전파인지 먼저 정한다.
2. BPMN 종료 이벤트가 일반 End Event 인지 Error End Event 인지 확인한다.
3. boundary event 가 붙어 있다면 `class` 와 `pri` 속성을 확인한다.
4. `result.exception()` 과 `result.path()` 를 같이 본다.
5. rollback 여부가 중요하면 DB 상태 assertion 을 같이 추가한다.

## 자주 인용할 대표 샘플

- 시스템 예외가 결과에 남는 단순 케이스
  - 일반 runtime exception 전파
- 사용자 예외 종료 이벤트
  - Error End Event 로 정상적인 사용자 오류 결과를 만드는 흐름
- 커스텀 사용자 예외
  - 도메인별 `UserException` 서브클래스를 사용하는 흐름
- boundary event 경로 전환
  - 예외를 잡아 별도 경로로 보내는 흐름
