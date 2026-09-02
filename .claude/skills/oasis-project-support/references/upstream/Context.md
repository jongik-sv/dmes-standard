# Context

OASIS의 런타임 컨텍스트는 크게 `ApplicationContext`, `ServiceContext`, `ProcessContext`, `ExecutableContext` 로 나뉜다. 상위 컨텍스트는 하위 컨텍스트를 모르고, 하위 컨텍스트가 상위 컨텍스트를 읽는 방향으로 구성된다.

# ApplicationContext

애플리케이션 전역에서 사용하는 인스턴스를 보관한다.

- 대표 구현은 `DefaultApplicationContext`, `SpringApplicationContext` 이다.
- `PlatformTransactionManager`, `TopicLoader`, `TopicStructureLoader`, DAO/Repository, 외부 API 어댑터 같은 공용 의존성을 넣는다.

# ServiceContext

서비스 실행을 위해 사용자가 입력한 데이터와 요청 범위 정보를 보관한다.

- 대표 구현은 `DefaultServiceContext` 이다.
- 내부 저장소는 `Map<String, TypedObject>` 이며 읽기 중심으로 사용한다.
- 조회 순서는 `serviceInput(key)` 를 먼저 찾고, 없으면 `applicationContext.get(key)` 로 내려간다.
- `createSubServiceContext()` 로 하위 서비스 컨텍스트를 만들면 루트 서비스 입력을 이어받는다.
- `setClassToObjectMap()` 을 이용하면 테스트에서 태스크 클래스를 목 객체로 치환할 수 있다.
- `requestTag`, `Audit`, `EventBus` 도 함께 운반한다.

# ProcessContext

프로세스 흐름 중 생성된 결과를 보관한다.

- 태스크가 `output` 프로퍼티로 저장한 값이 최종 `ServiceResult.results()` 와 `result(key)` 의 소스가 된다.
- 메시지 태스크가 만든 메시지와 실행 경로도 최종 서비스 결과로 모인다.

# ExecutableContext

태스크 실행기가 상위 컨텍스트와 현재 실행 상태를 함께 읽기 위한 게이트웨이이다.

- 이름 조회와 타입 조회를 모두 지원하므로 태스크 구현은 컨텍스트의 실제 저장 위치를 직접 알 필요가 없다.
- 일반적으로 자체 저장소를 가지기보다 상위 컨텍스트를 조합해 보여준다.

# MethodInvokerContext

Plain Java Service Task가 생성자와 메소드를 바인딩할 때 사용하는 내부 컨텍스트이다.

- 파라미터 이름, 타입, optional 속성 같은 바인딩 규칙이 이 계층에서 해석된다.

# WowContext

`Wow` 인터페이스 기반 실행에서 부가 정보를 전달할 때 사용하는 컨텍스트이다.