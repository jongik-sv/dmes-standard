# Source And BPMN Examples

이 문서는 OASIS 참고 구현에서 실제로 사용된 Java source와 BPMN XML 조각을 뽑아 놓은 예제 모음이다. 사용 프로젝트가 OASIS 라이브러리 의존성만 가지고 있어도, 여기 적힌 패턴을 그대로 참고해서 비슷한 테스트나 BPMN 속성을 구성할 수 있다.

## 1. BPMN 하나를 직접 실행하는 최소 테스트

OASIS 테스트의 기본 패턴은 “BPMN 하나를 로드해서 `ServiceStarter` 로 실행하고 `ServiceResult` 를 검증하는 것”이다.

```java
public static ServiceStarter getServiceStarter(String filePath) {
    return new StopWatchServiceStarter(
            new CoreServiceStarter(
                    serviceId -> getService(filePath),
                    new ProcessStaterAndElementExecutorFactory(
                            new NonModifyClassNameResolver(), 10, 50
                    ).generateProcessStarter(),
                    new SpringTransactionHandler(new DefaultApplicationContext(null))
            )
    );
}
```

```java
@Test
void parallelProcessExecution() {
    ServiceStarter serviceStarter = getServiceStarter("/usecase/parallel/parallel.bpmn");
    ServiceContext serviceContext =
            new DefaultServiceContext(mock(ApplicationContext.class), new HashMap<>());

    ServiceResult serviceResult = serviceStarter.start("parallel", serviceContext);
    List<PathElement> path = serviceResult.path();

    assertThat(path).hasSize(31);
    assertThat(path.get(0).getId()).isEqualTo("s1");
}
```

## 2. 실제 task 대신 목 객체를 주입하는 테스트 모드

외부 의존성이 큰 Java task는 `setClassToObjectMap()` 으로 대체할 수 있다.

```java
@Test
void givenClassToObjectMapUseTheObjectInsteadSpecifiedClassOnTheTask() {
    ServiceStarter serviceStarter = getServiceStarter("/usecase/testmode/testmode.bpmn");

    DefaultServiceContext serviceContext =
            new DefaultServiceContext(mock(ApplicationContext.class), new HashMap<>());

    TaskClassToRun mock = mock(TaskClassToRun.class);
    when(mock.run()).thenReturn("test");

    Map<String, Object> classToTestObjectMap = new HashMap<>();
    classToTestObjectMap.put(TaskClassToRun.class.getName(), mock);
    serviceContext.setClassToObjectMap(classToTestObjectMap);

    ServiceResult serviceResult = serviceStarter.start("testmode", serviceContext);
    assertThat(serviceResult.result("result").getObject(String.class)).isEqualTo("test");
}
```

## 3. `PropertyEL` / output alias 예제

아래 BPMN 조각은 task 결과에서 리스트나 맵의 일부만 꺼내서 `result` 에 다시 바인딩하는 패턴이다.

```xml
<bpmn:serviceTask id="Activity_0oo5g6a"
                  name="stringList and pick index 0"
                  camunda:class="oasis.process.VarietyReturnMethods">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="method" value="stringList" />
      <camunda:property name="output" value="[0] -&gt; result" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:serviceTask>
```

```xml
<bpmn:serviceTask id="Activity_0uida5a"
                  name="helloMap and pick key greeting"
                  camunda:class="oasis.process.VarietyReturnMethods">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="method" value="helloMap" />
      <camunda:property name="output" value="['greeting'] -&gt; result" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:serviceTask>
```

```java
@Test
void accessIndex() {
    ServiceStarter serviceStarter =
            BpmnServiceLoaderForTest.getServiceStarter("/process/OutputExpressionTest/outputExpression.bpmn");

    ServiceResult result = serviceStarter.start(
            "outputExpression",
            new DefaultServiceContext(
                    new DefaultApplicationContext(new HashMap<>()),
                    new MapBuilder<String, TypedObject>()
                            .addEntity("action", new TypedObject("index0"))
                            .build()
            )
    );

    assertThat(result.result("result").getObject(String.class)).isEqualTo("hi");
}
```

## 4. `MethodBinding` / `inputParameter` 예제

아래 BPMN 조각은 Java method 파라미터를 BPMN 쪽에서 직접 채워 넣는 패턴이다.

```xml
<bpmn:serviceTask id="t1"
                  name="String"
                  camunda:class="oasis.process.VarietyReturnMethods">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="method" value="greeting" />
      <camunda:property name="output" value="result" />
    </camunda:properties>
    <camunda:inputOutput>
      <camunda:inputParameter name="name">sister</camunda:inputParameter>
    </camunda:inputOutput>
  </bpmn:extensionElements>
</bpmn:serviceTask>
```

```xml
<camunda:inputOutput>
  <camunda:inputParameter name="param">
    <camunda:map>
      <camunda:entry key="data">1</camunda:entry>
    </camunda:map>
  </camunda:inputParameter>
  <camunda:outputParameter name="result">success</camunda:outputParameter>
</camunda:inputOutput>
```

```java
@Test
void inputStringBind() {
    Service service = getService("/process/MethodParameterBindTest/inputBinding.bpmn");

    DefaultServiceContext defaultServiceContext =
            new DefaultServiceContext(
                    new EmptyApplicationContext(),
                    new MapBuilder<String, TypedObject>()
                            .addEntity("action", new TypedObject("string"))
                            .build()
            );

    ProcessContext processContext = new DefaultProcessContext(defaultServiceContext);
    processStarter.start(service.getInitialProcess(), processContext);

    assertThat(processContext.elementOutput("result").getObject(String.class))
            .isEqualTo("hello sister");
}
```

```java
@Test
void stringBindFails() {
    processContext.add("wrongName", new TypedObject("sister"));

    assertThatExceptionOfType(RuntimeException.class).isThrownBy(() ->
            processStarter.start(process, processContext)
    );
}
```

## 5. Error End Event 와 `UserException` 예제

아래 BPMN 조각은 Error End Event 로 사용자 오류 메시지를 직접 반환하는 패턴이다.

```xml
<bpmn:endEvent id="Event_1mxb8tz" name="error">
  <bpmn:incoming>Flow_1189a9h</bpmn:incoming>
  <bpmn:errorEventDefinition id="ErrorEventDefinition_03iruo7"
                             errorRef="Error_17kc1w2" />
</bpmn:endEvent>

<bpmn:error id="Error_17kc1w2"
            name="userException"
            errorCode="abc"
            camunda:errorMessage="사용자 예외가 발생했습니다." />
```

```java
@Test
void userExceptionMessageBindingWithoutInput() {
    ServiceStarter serviceStarter =
            getServiceStarter("/usecase/userException/userExceptionEventPlainMessage.bpmn");

    ServiceResult serviceResult = serviceStarter.start(
            "userExceptionEvent",
            new DefaultServiceContext(mock(ApplicationContext.class), new HashMap<>())
    );

    PlainServiceResult plainServiceResult = new PlainServiceResult(serviceResult);
    assertThat(plainServiceResult.getExceptionMessage()).isEqualTo("사용자 예외가 발생했습니다.");
}
```

## 6. Error Boundary Event 와 메시지 바인딩 예제

아래 BPMN 조각은 task 예외를 boundary event 에서 잡고, 메시지를 output 으로 넘긴 뒤 후속 task에서 소비하는 패턴이다.

```xml
<bpmn:boundaryEvent id="Event_1yl54dp" attachedToRef="recordOrder">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="input" value="abc" />
      <camunda:property name="output" value="messageOutput" />
    </camunda:properties>
  </bpmn:extensionElements>
  <bpmn:errorEventDefinition id="ErrorEventDefinition_15xkh1a"
                             errorRef="Error_0yl6qlg" />
</bpmn:boundaryEvent>

<bpmn:error id="Error_0yl6qlg"
            name="context"
            camunda:errorMessage="#{abc} 메시지" />
```

```xml
<bpmn:task id="Activity_0x5y4zm" name="메시지">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="input" value="messageOutput" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:task>
```

```java
@Test
void errorBoundaryEventMessageBinding() {
    ServiceStarter serviceStarter =
            getServiceStarter("/usecase/errorBoundary/error_boundary_with_exception_message.bpmn");

    Map<String, TypedObject> build = new TypedMapBuilder().addEntity("abc", "kakao").build();
    ServiceContext serviceContext = new DefaultServiceContext(new DefaultApplicationContext(null), build);

    ServiceResult result = serviceStarter.start("sid", serviceContext);

    assertThat(result.path().get(result.path().size() - 1).getId()).isEqualTo("Event_0o0tjtl");
    assertThat(result.exception()).isNull();
}
```

## 7. Transaction Script Task 예제

트랜잭션이 개입되면 테스트는 datasource 와 transaction manager 를 애플리케이션 컨텍스트에 직접 주입하는 패턴으로 올라간다.

```java
private SpringTransactionHandler transactionHandler(TransactionManagerInfoHolder... holders) {
    for (TransactionManagerInfoHolder holder : holders) {
        PlatformTransactionManager tm = new DataSourceTransactionManager(holder.getDataSource());
        this.applicationContext.put(holder.getTransactionManagerName(), new TypedObject(tm));
    }

    return new SpringTransactionHandler(
            applicationContext,
            Arrays.stream(holders)
                    .map(TransactionManagerInfoHolder::getTransactionManagerName)
                    .toArray(String[]::new)
    );
}
```

```java
ServiceContext serviceContext = new DefaultServiceContext(
        applicationContext,
        new MapBuilder<String, TypedObject>()
                .addEntity("id", new TypedObject("4"))
                .addEntity("firstName", new TypedObject("jeongjin"))
                .addEntity("lastName", new TypedObject("kim"))
                .addEntity("action", new TypedObject("commit"))
                .build()
);

serviceStarter.start("commitAndRestart", serviceContext);
```

```java
List<Map<String, Object>> rows =
        jdbcTemplate1.queryForList("select id from users", new HashMap<>());
assertThat(rows).hasSize(4);
```

## 8. 제조오더 상태 변경 서비스 예제

아래는 자연어 서비스 요청을 `bpmn-skill` 과 `oasis-project-support` 로 나눠 처리할 때의 예시다.

원본 요청:

```text
제조오더상태를 변경하는 서비스를 작성한다.
제조오더번호와 이벤트와 파라미터를 받아서 적절한 상태로 변경한다.
시작이벤트에서 게이트웨이를 통과하고 이벤트별 분기를 한다.
파라미터가 확정이면 제조오더번호로 제조오더 디비를 조회해서 status 필드를 A로 변경한다.
```

### BPMN 구조 초안 예시

`bpmn-skill` 에게는 아래와 같은 구조를 요청한다.

```json
{
  "process": {
    "id": "changeManufacturingOrderStatus",
    "name": "제조오더 상태 변경",
    "isExecutable": true,
    "camunda": {
      "properties": [
        { "name": "input", "value": "manufacturingOrderNo,event,params" }
      ]
    }
  },
  "nodes": [
    { "id": "StartEvent_1", "type": "bpmn:StartEvent", "name": "시작" },
    { "id": "Gateway_Event", "type": "bpmn:ExclusiveGateway", "name": "이벤트 분기",
      "camunda": { "properties": [{ "name": "input", "value": "event" }] } },
    { "id": "Task_LoadOrder", "type": "bpmn:ServiceTask", "name": "제조오더 조회" },
    { "id": "Task_UpdateStatus", "type": "bpmn:ServiceTask", "name": "상태 A 변경" },
    { "id": "EndEvent_Noop", "type": "bpmn:EndEvent", "name": "변경 없음" },
    { "id": "EndEvent_Done", "type": "bpmn:EndEvent", "name": "완료" }
  ],
  "flows": [
    { "id": "F1", "source": "StartEvent_1", "target": "Gateway_Event" },
    { "id": "F2", "source": "Gateway_Event", "target": "Task_LoadOrder" },
    { "id": "F3", "source": "Task_LoadOrder", "target": "Task_UpdateStatus" },
    { "id": "F4", "source": "Task_UpdateStatus", "target": "EndEvent_Done" },
    { "id": "F5", "source": "Gateway_Event", "target": "EndEvent_Noop" }
  ]
}
```

### OASIS 속성 보강 예시

구조가 만들어진 뒤에는 이 스킬이 OASIS 실행 속성을 붙인다.

```xml
<camunda:property name="input" value="manufacturingOrderNo,event,params" />
```

```xml
<camunda:property name="input" value="manufacturingOrderNo" />
<camunda:property name="output" value="manufacturingOrder" />
```

```xml
<camunda:property name="input" value="manufacturingOrder" />
<camunda:property name="output" value="updatedOrder" />
```

Java task 계약은 예를 들면 아래처럼 잡을 수 있다.

```java
public class ManufacturingOrderStatusService {
    public ManufacturingOrder load(String manufacturingOrderNo) { ... }

    public ManufacturingOrder updateStatusToA(ManufacturingOrder manufacturingOrder) {
        manufacturingOrder.setStatus("A");
        return repository.save(manufacturingOrder);
    }
}
```

또는 조회와 갱신을 분리하지 않고 한 task로 묶을 수도 있다.

```java
public class ManufacturingOrderStatusService {
    public ManufacturingOrder confirm(String manufacturingOrderNo, Map<String, Object> params) {
        if (!Boolean.TRUE.equals(params.get("confirmed"))) {
            return null;
        }
        ManufacturingOrder order = repository.findByOrderNo(manufacturingOrderNo);
        order.setStatus("A");
        return repository.save(order);
    }
}
```

### 이 예시에서 테스트가 증명해야 할 것

- `event` 가 대상 이벤트일 때만 상태 변경 branch 로 들어가는지
- `params.confirmed == true` 일 때만 update 가 일어나는지
- 제조오더번호로 대상을 조회하는지
- 최종 `status` 값이 `"A"` 로 저장되는지
- 조건이 맞지 않으면 no-op 또는 명시된 오류 경로로 빠지는지

## 9. 리스트 결과를 다음 태스크에서 소비하는 예제

리스트를 그대로 들고 갈 수도 있고, 일부만 잘라서 다음 태스크 입력으로 넘길 수도 있다.

```xml
<camunda:property name="output" value="result" />
```

- 의미: 전체 리스트를 `result` 로 저장한다.

```xml
<camunda:property name="output" value="[0] -&gt; result" />
```

- 의미: 리스트의 첫 번째 원소만 `result` 로 저장한다.

```xml
<camunda:property name="output" value="[0]['name'] -&gt; result" />
```

- 의미: 리스트 첫 원소가 맵일 때 `name` 값만 `result` 로 저장한다.

```xml
<camunda:property name="output" value="['item'][0] -&gt; result" />
```

- 의미: 맵 안의 리스트에서 첫 원소만 뽑는다.

```xml
<camunda:property name="output" value="result[0]" />
```

- 의미: alias를 먼저 정하고 그 alias의 첫 원소를 쓴다.

게이트웨이 조건에서도 같은 식으로 접근할 수 있다.

```text
#root['colorNameProcess1'][0]['colorName']=='yo-pink'
```

다음 태스크의 `input` 에서 직접 고를 수도 있다.

```xml
<bpmn:subProcess id="Activity_0peu0w9" name="0번">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="input" value="members[0] -&gt; memberInfo" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:subProcess>
```

```xml
<bpmn:subProcess id="Activity_092gpz4" name="1번">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="input" value="members[1] -&gt; memberInfo" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:subProcess>
```

## 10. `iter` 루프 예제

`standardLoopCharacteristics` 와 `iter` 속성을 같이 쓰면, 컨텍스트의 리스트를 순회하며 각 원소를 별도 입력 alias로 바인딩할 수 있다.

```xml
<bpmn:scriptTask id="recordOrder" name="실적조회" scriptFormat="sql">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="output" value="result" />
      <camunda:property name="ds" value="ds1" />
      <camunda:property name="iter" value="ids -&gt; id" />
    </camunda:properties>
  </bpmn:extensionElements>
  <bpmn:standardLoopCharacteristics />
  <bpmn:script>select id, firstName, lastName from Employee where id = :id</bpmn:script>
</bpmn:scriptTask>
```

또는 앞선 task가 리스트를 만든 뒤 그 결과를 루프 입력으로 넘길 수도 있다.

```xml
<camunda:property name="output" value="idList" />
...
<camunda:property name="iter" value="idList -&gt; id" />
```

이 패턴의 입력/출력 의미:
- 입력 리스트: `ids` 또는 `idList`
- 각 반복의 입력값: `id`
- task output 이 있으면 반복 결과가 모여 리스트 형태가 된다

## 11. `multiInstance` 루프 예제

`multiInstanceLoopCharacteristics` 는 BPMN 수준의 반복 구조를 명시적으로 표현할 때 쓴다.

### 11-1. 단순 리스트 원소를 변수로 받기

```xml
<bpmn:multiInstanceLoopCharacteristics
    camunda:collection="names"
    camunda:elementVariable="name" />
```

- `names` 의 각 원소가 `name` 으로 들어간다.

### 11-2. 맵 리스트의 각 원소를 변수로 받기

```xml
<bpmn:multiInstanceLoopCharacteristics
    camunda:collection="members"
    camunda:elementVariable="memberInfo" />
```

```java
public void join(Map<String, Object> memberInfo) {
    memberRepository.join(memberInfo);
}
```

- 리스트의 각 맵이 `memberInfo` 로 들어간다.

### 11-3. 맵을 DTO로 자동 변환하기

```xml
<bpmn:multiInstanceLoopCharacteristics
    isSequential="true"
    camunda:collection="ids"
    camunda:elementVariable="spyDto:usecase.sequential.SpyDto" />
```

```java
public void consume(SpyClass spyClass, SpyDto spyDto) {
    spyClass.addData(spyDto.getName());
}
```

- 각 맵 원소를 `SpyDto` 로 변환한 뒤 `spyDto` 로 바인딩한다.

### 11-4. 객체 필드를 메서드 파라미터로 풀어 쓰기

```xml
<bpmn:multiInstanceLoopCharacteristics isSequential="true"
                                      camunda:collection="dtos" />
```

```java
public String join(String name, Number age) {
    return name + age;
}
```

- `dtos` 안의 각 DTO에서 `name`, `age` 를 꺼내 메서드 파라미터로 직접 바인딩한다.

## 12. 루프 결과 output 의 형태

루프에서 가장 헷갈리는 부분은 “최종 output 이 단일값인지, 리스트인지”다.

### `iter` 또는 반복 task가 `output` 을 가지는 경우

- 보통 각 반복 결과가 모여 리스트 비슷한 구조가 된다.
- 예를 들어 SQL loop 예제에서는 최종 `result` 가 `List<Map<String, Object>>` 로 읽힌다.

```java
TypedObject result = processContext.elementOutput("result");
List<Map<String, Object>> object =
        result.getObject(new TypeReference<List<Map<String, Object>>>() {});
assertThat(object).hasSize(3);
```

### multi-instance task가 `output="results"` 를 가지는 경우

- 반복 결과가 `List<TypedObject>` 처럼 누적될 수 있다.

```java
TypedObject results1 = results.get("results");
List<TypedObject> object = results1.getObject(new TypeReference<List<TypedObject>>() {});

assertThat(object).hasSize(2);
assertThat(object.get(0).getObject()).isEqualTo("John30");
assertThat(object.get(1).getObject()).isEqualTo("Mike10");
```

### side effect만 있고 output 이 없는 경우

- 루프 결과는 별도 output 대신 저장소, spy object, DB, message 수집 쪽에서 확인해야 한다.

## 13. 무엇을 고를지 빠르게 결정하는 기준

- 조회 결과 전체를 다음 task가 다시 처리해야 한다
  - `output="result"` 처럼 전체 리스트를 유지한다.
- 첫 번째 행 하나만 쓰면 된다
  - `[0] -&gt; alias`
- 첫 번째 행의 특정 컬럼만 쓰면 된다
  - `[0]['field'] -&gt; alias`
- 리스트를 한 원소씩 SQL/script task로 반복 처리한다
  - `standardLoopCharacteristics` + `iter`
- BPMN 상에서 반복 구조를 명시하고 싶다
  - `multiInstanceLoopCharacteristics`
- 각 원소가 맵이고 Java method는 DTO를 받는다
  - typed `elementVariable`
- 각 원소가 DTO이고 method가 개별 필드 파라미터를 받는다
  - `collection` 만 두고 파라미터 이름 매칭을 활용한다

## 14. 주의할 점

- 빈 리스트에서 `[0]` 접근은 기대한 값이 없을 수 있다.
- loop output 은 단일 scalar 가 아니라 누적 결과일 가능성이 높다.
- gateway 조건에서 loop 결과를 읽을 때는 `#root['alias'][0]['field']` 처럼 한 단계 더 들어가야 할 수 있다.
- readability 를 위해 복잡한 접근은 한 번 alias 로 꺼내고 다음 task에서 쓰는 편이 안전하다.
