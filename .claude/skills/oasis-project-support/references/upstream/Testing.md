# Testing

테스트는 BPMN 문서와 Java 태스크를 함께 검증하는 방식으로 작성하는 것이 가장 안전하다. 최신 저장소에서는 `~/oasis/oasis-core/src/test/java` 와 `~/oasis/oasis-core/src/test/resources` 에서 대부분의 샘플을 확인할 수 있다.

# 1. BPMN 파일 하나를 대상으로 서비스 실행하기

`BpmnServiceLoaderForTest` 는 클래스패스의 BPMN 파일 하나를 직접 읽어 `ServiceStarter` 로 감싸는 테스트용 헬퍼이다.

```java
ServiceStarter serviceStarter = getServiceStarter("/usecase/parallel/parallel.bpmn");
ServiceContext serviceContext = new DefaultServiceContext(mock(ApplicationContext.class), new HashMap<>());

ServiceResult serviceResult = serviceStarter.start("parallel", serviceContext);
assertThat(serviceResult.path()).isNotEmpty();
```

이 패턴은 병렬, 분기, 예외, 메시징 같은 시나리오를 BPMN 단위로 빠르게 회귀 테스트할 때 유용하다.

# 2. 결과와 경로를 함께 검증하기

`ServiceResult` 는 단순 성공/실패뿐 아니라 실행 경로와 산출물까지 돌려준다.

- `serviceResultCode()` : 성공, 사용자 예외, 시스템 예외 구분
- `results()` / `result(key)` : `output` 으로 저장한 결과 조회
- `path()` : 실제로 지나간 BPMN 요소 목록
- `messages()` : Message Send Task가 만든 메시지 목록

```java
ServiceResult serviceResult = serviceStarter.start("parallel", serviceContext);
assertThat(serviceResult.path().get(0).getId()).isEqualTo("s1");
```

# 3. 태스크 구현을 목 객체로 치환하기

테스트 모드에서는 `DefaultServiceContext.setClassToObjectMap()` 으로 BPMN에 적어 둔 클래스를 테스트 대역으로 바꿀 수 있다.

```java
DefaultServiceContext serviceContext = new DefaultServiceContext(mock(ApplicationContext.class), new HashMap<>());
TaskClassToRun taskMock = mock(TaskClassToRun.class);
when(taskMock.run()).thenReturn("test");
serviceContext.setClassToObjectMap(Map.of(TaskClassToRun.class.getName(), taskMock));

ServiceResult serviceResult = serviceStarter.start("testmode", serviceContext);
assertThat(serviceResult.result("result").getObject(String.class)).isEqualTo("test");
```

이 방식은 태스크 구현체를 직접 생성하지 않고도 BPMN 흐름 자체를 검증할 수 있어 빠르고 안정적이다.

# 4. 스프링 트랜잭션과 함께 통합 테스트하기

트랜잭션이 포함된 테스트에서는 `SpringTransactionHandler` 와 실제 `PlatformTransactionManager` 를 `ApplicationContext` 에 넣어 검증한다. 저장소의 `SpringTransactionHandlerTest`, `TransactionalSubServiceTest`, `MultiDataSourceTest` 가 대표 예제다.

- 기본 흐름: 트랜잭션 시작 -> BPMN 실행 -> 성공 시 commit / 예외 시 rollback
- 강제 제어: Script Task에서 `transaction` 포맷으로 `commit`, `rollback`
- 멀티 데이터소스: 프로세스의 `tx` 프로퍼티로 대상 매니저를 지정

# 5. 메시지 태스크 검증하기

Message Send Task는 실제 외부 전송을 수행하지 않고 메시지 객체를 결과에 모아 둔다. 테스트에서는 `TopicLoader`, `TopicStructureLoader` 를 주입하고 `serviceResult.messages()` 로 검증한다.

```java
DefaultApplicationContext applicationContext = new DefaultApplicationContext();
applicationContext.put("topicLoader", new TypedObject((TopicLoader) topicId -> (Topic) () -> topicId));
applicationContext.put("topicStructureLoader", new TypedObject(topicStructureLoader));

ServiceResult serviceResult = serviceStarter.start("xxx", new DefaultServiceContext(applicationContext));
assertThat(serviceResult.messages()).hasSize(1);
```

# 추천 규칙

- BPMN 파일과 테스트 클래스를 같은 시나리오 이름으로 맞춘다.
- 성공 코드뿐 아니라 `path()` 와 `result(key)` 를 함께 검증한다.
- 병렬/트랜잭션/메시징은 단위 테스트보다 시나리오 테스트를 우선한다.
- 새 기능을 추가할 때는 `usecase` 패키지에 재현 가능한 BPMN + 테스트 한 쌍을 같이 남긴다.