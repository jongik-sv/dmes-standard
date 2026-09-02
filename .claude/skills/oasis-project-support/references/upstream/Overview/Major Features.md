# Major Features

# 핵심 기능

- BPMN 서비스 문서를 `/services` 디렉토리에서 로드하고 서비스 ID로 실행한다.
- 일반 Java 클래스를 직접 실행한다. 별도의 인터페이스 구현이나 프레임워크 상속이 필수는 아니다.
- Service / Process / Task 수준에서 `input`, `output`, `dto`, `method` 같은 프로퍼티로 실행을 제어한다.
- Script Task로 SQL 실행과 트랜잭션 제어(`commit`, `rollback`)를 처리할 수 있다.
- 순차/병렬 Multi Instance를 지원하며 `iter`, `thread`, `timeout` 프로퍼티로 동작을 조정한다.
- Message Send Task로 메시지를 생성하고 `ServiceResult.messages()` 로 수집할 수 있다.
- Sub Service / Sub Process 호출, Error Boundary, UserException End Event 같은 업무 흐름 제어를 제공한다.
- 테스트 모드에서 `DefaultServiceContext.setClassToObjectMap()` 으로 태스크 구현을 목 객체로 치환할 수 있다.

# 왜 유용한가

- 설계와 실행 사이의 간극을 BPMN 문서 하나로 줄일 수 있다.
- 서비스 결과, 실행 경로, 메시지, 예외를 `ServiceResult` 하나로 회수할 수 있다.
- 스프링 기반 프로젝트는 `SpringServiceStarterFactory`, 간단한 단독 실행은 `NonTransactionalServiceStarterFactory` 로 빠르게 시작할 수 있다.
- 병렬, 메시징, 멀티 데이터소스, 트랜잭션 경계 같은 복잡한 시나리오를 테스트 자산과 함께 유지할 수 있다.