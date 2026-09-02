# Real-Project Patterns

이 문서는 운영 환경에서 OASIS 를 비즈니스 ERP 로 활용한 코드에서 추출한 패턴 카탈로그다. 각 절은 `references/pattern-map.md` 의 카테고리에 1:1 로 대응하며, 모든 인용 코드/BPMN/매퍼는 스킬 안의 `references/examples/` 에 그대로 들어 있다 (외부 경로 의존 없음). 비슷한 요청을 만나면 가장 가까운 절을 찾아 그대로 응용한다.

## 0. 임베드된 예제 인덱스

```
references/examples/
├── services/
│   ├── state_actor_validation.bpmn      # boolean task + Error End Event 분기
│   ├── state_router_subprocess.bpmn     # 공용 상태 천이 BPMN (callActivity 대상)
│   ├── multi_action_screen.bpmn         # 큰 exclusive gateway + multi-instance + callActivity
│   ├── lov_test.bpmn                    # inline SQL + /*resultType=*/
│   ├── transaction_test.bpmn            # multi-instance + insert, DML + tx
│   └── mybatis_select_and_loop.bpmn     # subProcess + multi-instance + 외부 mapper
├── mappers/
│   ├── orders_mapper.xml                # 운영 매퍼 (#{} 바인딩, resultType=map / lov)
│   └── myBatisSelectAndLoop.xml         # 테스트용 매퍼 (resultMap 사용)
└── java/
    ├── BpmnServiceLoaderForTest.java    # 표준 ServiceStarter 셋업
    ├── MyBatisSelectAndLoopTest.java    # SQL + multi-instance 통합 테스트
    ├── TransactionTest.java             # 트랜잭션 + JPA flush 테스트
    ├── Item_excerpt.java                # state-change + boolean 검증 예제
    ├── Order_excerpt.java               # aggregate 생성 + multi-instance 원소 처리
    ├── HoldChecker_excerpt.java         # `$type{}` 주입을 받는 boolean 검증
    └── Package_excerpt.java             # 단순 `isXxx` 검증
```

## 0-1. 운영 적용 한눈에 보기

- BPMN 파일명 규칙
  - 비즈니스 서비스: `screen001^^주문관리.bpmn` 처럼 `^^` 로 service ID 와 한글명을 구분
  - 상태 천이 액터: `state_actor_validation.bpmn`, `C1D1_link_actor.bpmn` 처럼 `이전상태_다음상태_actor` 패턴
  - 공용 서브프로세스: `state_router_subprocess.bpmn`, `event_handler` 등 process ID 로 호출
- 로더 설정: `ClassPathFileServiceLoader("/services", "bpmn", "^^")` — `^^` 앞이 service ID
- 트랜잭션 매니저: 기본 단일 매니저 (`txBiz` 같은 이름) — 다중 매니저 가능
- BPMN 기능 사용 비중(운영 ~158개 BPMN 기준)
  - Service Task(Java 클래스 호출) > Script Task(SQL) > Call Activity > Multi-Instance Loop ≫ Exclusive Gateway ≫ Error End Event
  - 거의 안 쓰는 기능: Parallel Gateway, Send Task, Timer Event

## 1. 최소 테스트 구성 — `BpmnServiceLoaderForTest`

전체 파일: [`examples/java/BpmnServiceLoaderForTest.java`](examples/java/BpmnServiceLoaderForTest.java).
운영 코드의 표준 테스트 시작점이다. Spring `ApplicationContext` 를 받아 OASIS `ServiceStarter` 를 만들고, 트랜잭션 매니저 이름을 배열로 넘긴다. 그래서 통합 테스트는 곧바로 트랜잭션 안에서 BPMN 을 실행한다.

```java
public static ServiceStarter getServiceStarter(org.springframework.context.ApplicationContext ac,
                                               String[] transactionManagerNames) {
    return new StopWatchServiceStarter(
            new SpringServiceStarter(
                    new CoreServiceStarter(
                            new CamundaBpmnServiceProvider(
                                    new ClassPathFileServiceLoader("/services", "bpmn", "^^")
                            ),
                            new ProcessStaterAndElementExecutorFactory(new NonModifyClassNameResolver(), 10, 50)
                                    .generateProcessStarter(),
                            new SpringTransactionHandler(
                                    new SpringApplicationContext(ac), transactionManagerNames)),
                    ac));
}
```

전체 파일: [`examples/java/MyBatisSelectAndLoopTest.java`](examples/java/MyBatisSelectAndLoopTest.java).

```java
@ExtendWith(SpringExtension.class)
@ActiveProfiles({"local"})
@ContextConfiguration(classes = {IntegrationTestConfig.class})
public class MyBatisSelectAndLoopTest {
    @Autowired
    private org.springframework.context.ApplicationContext applicationContext;

    @Test
    void myBatisSelectAndLoop() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter(
                applicationContext, new String[]{"txBiz"}
        );
        ApplicationContext oac = new SpringApplicationContext(applicationContext);

        DefaultServiceContext serviceContext = new DefaultServiceContext(oac, new TypedMapBuilder().build());
        serviceContext.setAudit(AuditHolder.getAudit());

        ServiceResult result = serviceStarter.start("mybatis_select_and_loop", serviceContext);
        Assertions.assertThat(result.serviceResultCode()).isEqualTo(ServiceResultCode.SUCCESS);
    }
}
```

핵심 포인트:
- `SpringApplicationContext` 로 Spring AC 를 OASIS `ApplicationContext` 로 감싼다.
- `setAudit(AuditHolder.getAudit())` 으로 감사 컬럼을 채운다 — 실 DB 쓰기 작업을 BPMN 안에서 하기 위해 필수.
- 단일 BPMN 파일을 직접 로드하고 싶을 때는 `getServiceStarter("/services/...bpmn")` 오버로드 사용.

새 테스트를 제안할 때는 항상 이 두 클래스의 패턴을 그대로 재현한다. 테스트 BPMN 의 service ID 는 `^^` 분리자를 따르지 않으면 파일명 그대로(`mybatis_select_and_loop` 식)가 된다.

## 2. Branching — exclusive gateway with `input`

전체 파일: [`examples/services/state_router_subprocess.bpmn`](examples/services/state_router_subprocess.bpmn), [`examples/services/multi_action_screen.bpmn`](examples/services/multi_action_screen.bpmn).

운영 BPMN 의 분기는 거의 전부 “이벤트(코드)별 분기”다. `Gateway` 의 `input` 으로 변수 하나(`eventName` 또는 `action`)를 지정하고, 각 sequenceFlow 의 `name` 이 그 변수 값과 매칭된다. 별도 `conditionExpression` 없이 flow 이름만으로 라우팅된다.

```xml
<!-- state_router_subprocess.bpmn -->
<bpmn:exclusiveGateway id="gPending" name="pending state">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="input" value="eventName" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:exclusiveGateway>
<bpmn:sequenceFlow id="fLink"        name="link"
                   sourceRef="gPending" targetRef="link" />
<bpmn:sequenceFlow id="fAssignOrder" name="assignOrder"
                   sourceRef="gPending" targetRef="assignOrder" />
```

```xml
<!-- multi_action_screen.bpmn — 한 게이트웨이에 여러 outgoing flow -->
<bpmn:exclusiveGateway id="gAction">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="input" value="action" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:exclusiveGateway>
<bpmn:sequenceFlow id="fRun"          name="run"          .../>
<bpmn:sequenceFlow id="fRunCancel"    name="runCancel"    .../>
<bpmn:sequenceFlow id="fList"         name="list"         .../>
```

운영 함의:
- “이벤트별로 다른 처리” 요청은 거의 항상 이 패턴이다. flow `name` 은 클라이언트가 보내는 코드 값과 같아야 한다.
- 게이트웨이 한 개에 outgoing flow 가 10개 이상 붙는 운영 사례도 정상 — 새 이벤트 추가는 flow 하나만 늘리면 끝.
- 디폴트 분기가 필요하면 BPMN 의 `default` 속성을 따로 둔다 (운영 코드는 명시적 default 를 거의 안 쓰고 매칭 실패 시 예외).

## 3. Error End Event — boolean 반환으로 검증 분기

전체 파일: [`examples/services/state_actor_validation.bpmn`](examples/services/state_actor_validation.bpmn). `#root = false` 조건식을 sequenceFlow 에 걸어 task 의 boolean 결과를 그대로 에러 경로로 보낸다. 검증 로직은 별도 task(`isReady`, `isPacked`, `HoldChecker#check`)로 잘게 쪼갠다.

```xml
<bpmn:serviceTask id="checkReady"
                  name="check ready"
                  camunda:class="sample.biz.master.Item#isReady">
  <bpmn:outgoing>f2</bpmn:outgoing>
  <bpmn:outgoing>fNotReady</bpmn:outgoing>
</bpmn:serviceTask>
<bpmn:sequenceFlow id="fNotReady" name="not ready"
                   sourceRef="checkReady" targetRef="endNotReady">
  <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">#root = false</bpmn:conditionExpression>
</bpmn:sequenceFlow>
<bpmn:endEvent id="endNotReady">
  <bpmn:errorEventDefinition errorRef="errNotReady" />
</bpmn:endEvent>
<bpmn:error id="errNotReady" name="itemStatus"
            camunda:errorMessage="Item is not in ready state." />
```

```xml
<!-- 같은 파일: 입력을 BPMN 변수에서 타입으로 캐스팅 -->
<bpmn:serviceTask id="checkNotHeld"
                  name="check not held"
                  camunda:class="sample.biz.master.checker.HoldChecker#check">
  <bpmn:extensionElements>
    <camunda:inputOutput>
      <camunda:inputParameter name="item">$type{sample.biz.master.Item}</camunda:inputParameter>
    </camunda:inputOutput>
  </bpmn:extensionElements>
</bpmn:serviceTask>
```

대응되는 Java 발췌: [`examples/java/Item_excerpt.java`](examples/java/Item_excerpt.java), [`examples/java/HoldChecker_excerpt.java`](examples/java/HoldChecker_excerpt.java), [`examples/java/Package_excerpt.java`](examples/java/Package_excerpt.java).

운영 함의:
- 검증 메서드 이름은 항상 `isXxx` / `checkXxx` 로 통일되어 있고, 시그니처는 `boolean` 또는 `boolean check(Domain x)`.
- `$type{...}` 는 같은 BPMN 안에서 만든/저장된 객체를 다음 task 의 파라미터 타입에 맞게 가져오는 표기. “Spring bean + 도메인 객체” 묶음에서 자주 쓴다.
- `#root = true` 면 본 흐름, `#root = false` 면 에러 경로 — 두 sequenceFlow 모두 같은 task 의 outgoing 으로 묶여 있다.
- 새 검증 분기를 추가할 때는 “1. boolean 반환 task → 2. `name` 이 의미를 담은 sequenceFlow → 3. `<bpmn:error>` 정의 → 4. error end event” 4개를 한 묶음으로 만든다.

## 4. Service Task — 클래스#메서드 와 PropertyEL 매핑

Service task 는 `camunda:class="패키지.클래스#메서드"` 를 쓴다. 메서드 파라미터는 (1) 같은 이름의 BPMN 변수에서 자동 매핑, (2) `<camunda:inputParameter>` 로 리터럴/표현식 주입, (3) `nextStatus->status` 처럼 화살표로 변수를 다른 이름의 파라미터에 매핑 중 하나로 채운다.

```xml
<!-- state_actor_validation.bpmn — 리터럴 인자 + 자동 매핑 -->
<bpmn:serviceTask id="changeStatus"
                  name="change status"
                  camunda:class="sample.biz.master.Item#changeStatus">
  <bpmn:extensionElements>
    <camunda:inputOutput>
      <camunda:inputParameter name="nextStatus">K1</camunda:inputParameter>
    </camunda:inputOutput>
  </bpmn:extensionElements>
</bpmn:serviceTask>
```

```java
// Item_excerpt.java
public void changeStatus(String itemId, String nextStatus) {
    ItemMasterEntity entity = findById(itemId);
    entity.changeStatus(nextStatus);
    log.info("item {} status -> {}", itemId, nextStatus);
    itemRepo.flush();
}
```

- `itemId` 는 BPMN context 에 이미 있는 변수에서 그대로 매핑.
- `nextStatus` 는 inputParameter 로 `"K1"` 리터럴 주입 — 같은 클래스/메서드를 BPMN 마다 다른 상태값으로 재사용한다.

```xml
<!-- multi_action_screen.bpmn — multi-instance + output alias + 리스트 결과 누적 -->
<bpmn:serviceTask id="cancelOne"
                  name="cancel one order"
                  camunda:class="sample.biz.order.Order#cancelRun">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="output" value="target" />
    </camunda:properties>
  </bpmn:extensionElements>
  <bpmn:multiInstanceLoopCharacteristics isSequential="true"
                                         camunda:collection="orderIds"
                                         camunda:elementVariable="orderId" />
</bpmn:serviceTask>
```

```java
// Order_excerpt.java
public void cancelRun(String orderId) {
    OrderEntity entity = orderRepository.findById(orderId).orElseThrow();
    if (!entity.getStatus().equals(MCC.ORDER_PRG_STS.IN_PROGRESS))
        throw new BizException("Order is not in cancellable state. current=" + entity.getStatus());
    ...
}
```

- `orderIds` (List<String>) 를 순회하면서 각 원소를 `orderId` 변수로 바인딩 → 메서드 시그니처가 `cancelRun(String orderId)`.
- `BizException` 을 던지면 OASIS 가 `UserException` 으로 받아 service result 의 exception 메시지로 노출 — 클라이언트는 공통 예외 변환기를 통해 사용자 메시지를 본다.

```xml
<!-- 화살표 매핑: 변수 nextStatus 를 method 파라미터 status 로 -->
<camunda:property name="input" value="nextStatus->status" />
```

운영 함의:
- 새 task 만들 때 메서드 파라미터 이름과 BPMN 변수 이름을 “일치시키는 것” 이 1순위. 다르면 `->` 매핑.
- 도메인 변경 함수(`changeXxx`)는 거의 모두 “entity 조회 → 상태 변경 → flush” 3단계로 통일되어 있다.
- 사용자 표시 메시지가 필요한 비즈니스 검증은 `BizException` (UserException 서브클래스) 으로 던진다 — Error End Event 와 함께 쓸 수도, 단독으로 쓸 수도 있다.

## 5. Script Task (SQL) — 외부 mapper / inline / `insert,` 접두사

SQL 은 두 갈래로 쓴다.

(A) `camunda:resource="namespace.id"` 로 MyBatis 매퍼 참조 — 전체 BPMN [`examples/services/multi_action_screen.bpmn`](examples/services/multi_action_screen.bpmn), 매퍼 [`examples/mappers/orders_mapper.xml`](examples/mappers/orders_mapper.xml).

```xml
<bpmn:scriptTask id="loadList"
                 name="load list"
                 scriptFormat="sql"
                 camunda:resource="orders.list.byBuyer">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="output" value="orders" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:scriptTask>
```

```xml
<!-- orders_mapper.xml -->
<mapper namespace="orders.list">
  <select id="byBuyer" resultType="map">
    <![CDATA[
      SELECT ORDER_ID, BUYER_ID, ITEM_CODE, QTY, STATUS, ORDER_DATE
        FROM TB_ORDER
       WHERE BUYER_ID LIKE #{buyerId} || '%'
         AND ITEM_CODE LIKE #{itemCode} || '%'
         AND STATUS IN ('A','B')
         AND ORDER_DATE BETWEEN NVL(#{from}, '00000000') AND NVL(#{to}, '99999999')
    ]]>
  </select>
</mapper>
```

- `#{buyerId}`, `#{itemCode}` 같은 바인딩 파라미터는 service context 의 변수에서 자동 주입.
- 결과는 `output="orders"` 로 List<Map> 형태로 BPMN 컨텍스트에 저장.

(B) inline SQL: `<bpmn:script>` 안에 SQL 직접 작성 — 전체 파일 [`examples/services/lov_test.bpmn`](examples/services/lov_test.bpmn).

```xml
<bpmn:scriptTask id="inlineSqlDto"
                 name="inline sql with resultType"
                 scriptFormat="sql">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="output" value="lov" />
    </camunda:properties>
  </bpmn:extensionElements>
  <bpmn:script>/*resultType=sample.cmn.inbound.Lov*/
select '1' as "value", 'hi' as "displayValue" from dual
union all
select '2', 'hello' from dual</bpmn:script>
</bpmn:scriptTask>
```

- 첫 줄의 `/*resultType=...*/` 주석으로 결과를 List<DTO> 로 자동 매핑.
- 컬럼 alias 는 DTO 필드명에 맞춰 큰따옴표로 감싸 대소문자 보존.

(C) DML 은 resource 앞에 `insert,` 또는 `update,` 접두사 사용 — 전체 파일 [`examples/services/transaction_test.bpmn`](examples/services/transaction_test.bpmn).

```xml
<bpmn:scriptTask id="seedRow"
                 name="seed row (DML)"
                 scriptFormat="sql"
                 camunda:resource="insert,transaction.new" />
```

- 접두사가 없으면 OASIS 는 “SELECT” 로 보고 결과를 가져오려 한다. 쓰기 작업은 반드시 `insert,` 또는 `update,` 를 붙여야 한다.

(D) 단일행 / 단일컬럼만 꺼내는 PropertyEL

```xml
<camunda:property name="output" value="[0]['cnt']->stepCount" />
<camunda:property name="output" value="[0]['maxAge']->maxAge" />
<camunda:property name="output" value="[0]['age'] -> age" />
```

운영 함의:
- 새 SQL 추가 요청은 “mapper namespace 가 모듈명” + “id 가 비즈니스 의미” 규칙을 그대로 따른다. 예: `orders.list.byBuyerForCancel`.
- “SELECT 결과의 첫 행 한 컬럼만” 패턴이 매우 흔하다 — `[0]['col']->alias`.
- 같은 task 에 input 변수가 여러 개여도 `<camunda:inputParameter>` 를 따로 추가할 필요 없이 service context 에 있으면 `#{name}` 으로 바인딩된다.

## 6. Multi-Instance Loop — `subProcess` / `serviceTask` / `callActivity`

루프는 거의 multi-instance 만 쓰고, 대부분 `isSequential="true"` 다 (병렬 없음).

전체 파일: [`examples/services/mybatis_select_and_loop.bpmn`](examples/services/mybatis_select_and_loop.bpmn), 같은 디렉토리의 매퍼 [`examples/mappers/myBatisSelectAndLoop.xml`](examples/mappers/myBatisSelectAndLoop.xml).

```xml
<!-- (a) subProcess + collection 만: elementVariable 없으면 자식 컨텍스트에 자동으로 풀린다 -->
<bpmn:subProcess id="loop" name="loop">
  <bpmn:multiInstanceLoopCharacteristics isSequential="true" camunda:collection="ids" />
  ...
  <bpmn:scriptTask id="lookupAge" scriptFormat="sql" camunda:resource="test.selectBind">
    <bpmn:extensionElements>
      <camunda:properties>
        <camunda:property name="output" value="[0]['age'] -> age" />
      </camunda:properties>
    </bpmn:extensionElements>
  </bpmn:scriptTask>
  <bpmn:serviceTask id="callConsumer"
                    camunda:class="integration.MyBatisSelectAndLoopTest$Consumer#hello" />
</bpmn:subProcess>
```

- `ids` 의 각 원소 — `{ id: '1' }` 같은 맵 — 가 자식 컨텍스트의 변수로 풀린다. 이어지는 SQL 의 `#{id}` 가 그걸 본다.
- 자식 태스크 `Consumer#hello(String id, int age)` 처럼 **서브프로세스 안에서 만든 변수(`age`)** 도 그대로 메서드 인자로 매핑된다.

```xml
<!-- multi_action_screen.bpmn — (b) callActivity + multi-instance + input 리터럴 -->
<bpmn:callActivity id="callRun"
                   name="dispatch run event"
                   calledElement="event_handler">
  <bpmn:extensionElements>
    <camunda:inputOutput>
      <camunda:inputParameter name="event">run</camunda:inputParameter>
    </camunda:inputOutput>
  </bpmn:extensionElements>
  <bpmn:multiInstanceLoopCharacteristics isSequential="true"
                                         camunda:collection="orderIds"
                                         camunda:elementVariable="orderId" />
</bpmn:callActivity>
```

- 같은 `event_handler` 를 서로 다른 `event` 값으로 여러 분기에서 재호출.

```xml
<!-- (c) serviceTask + multi-instance — Java 메서드가 단일 원소로 호출됨 -->
<bpmn:serviceTask id="cancelOne"
                  camunda:class="sample.biz.order.Order#cancelRun">
  <bpmn:multiInstanceLoopCharacteristics isSequential="true"
                                         camunda:collection="orderIds"
                                         camunda:elementVariable="orderId" />
</bpmn:serviceTask>
```

운영 함의:
- 리스트 결과(예: SQL `output="orders"`) 를 다음 단계에서 한 건씩 처리할 때 99% 이 multi-instance 형태.
- `iter` (standardLoopCharacteristics + iter 속성) 는 운영 비즈니스 BPMN 에서는 거의 안 쓴다 — 새 코드 작성 시에도 multi-instance 로 통일하는 편이 일관성 있음.
- “1 row 만 쓰면 된다” 는 케이스는 multi-instance 가 아니라 `[0]['col']->alias` 로 끝낸다 (5절 D).

## 7. Call Activity — 상태 천이 공용 서브프로세스

전체 파일: 호출자 [`examples/services/multi_action_screen.bpmn`](examples/services/multi_action_screen.bpmn), 호출 대상 [`examples/services/state_router_subprocess.bpmn`](examples/services/state_router_subprocess.bpmn).

```xml
<!-- multi_action_screen.bpmn -->
<bpmn:callActivity id="callRunCancel"
                   name="dispatch run-cancel event"
                   calledElement="state_router">
  <bpmn:extensionElements>
    <camunda:inputOutput>
      <camunda:inputParameter name="eventName">runCancel</camunda:inputParameter>
    </camunda:inputOutput>
  </bpmn:extensionElements>
</bpmn:callActivity>
```

```xml
<!-- state_router_subprocess.bpmn — 자체 process 에 input 선언 -->
<bpmn:process id="state_router" isExecutable="true">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="input" value="itemId" />
    </camunda:properties>
  </bpmn:extensionElements>
  ...
  <bpmn:exclusiveGateway id="gLinked" name="linked state">
    <bpmn:extensionElements>
      <camunda:properties>
        <camunda:property name="input" value="eventName" />
      </camunda:properties>
    </bpmn:extensionElements>
  </bpmn:exclusiveGateway>
</bpmn:process>
```

운영 함의:
- `calledElement` 는 “service ID = 호출 가능한 process ID”. 운영 코드에서는 이게 보통 `^^` 앞 prefix 또는 별도 파일명(`state_router`) 이다.
- 같은 BPMN 에 input alias 를 process 레벨에 선언해 두면 호출 시 자동으로 그 변수만 챙겨 받는다.
- 새 상태 천이 요청은 “(1) `XYxx_actor.bpmn` 신설 또는 (2) 기존 공용 액터 BPMN 의 게이트웨이 + flow 추가” 두 가지 중에서 선택. 단일 도메인 액터에 새 이벤트 한 개를 추가하는 것이라면 (2), 새 도메인 자체라면 (1).

## 8. Transaction — `txBiz` 와 multi-instance + JPA flush

전체 파일: [`examples/services/transaction_test.bpmn`](examples/services/transaction_test.bpmn), [`examples/java/TransactionTest.java`](examples/java/TransactionTest.java).

```java
// TransactionTest.java 의 inner Consumer
public void incAge(Number maxAge) {
    EntityManager em = EntityManagerFactoryUtils.getTransactionalEntityManager(entityManagerFactoryBiz);

    SampleTable sampleTable = new SampleTable();
    sampleTable.setAge(maxAge.intValue() + 1);
    sampleTableRepository.save(sampleTable);
    em.flush();
    em.clear();
}
```

```xml
<!-- transaction_test.bpmn — 핵심 골격 -->
<bpmn:scriptTask id="loadTargets"
                 name="load target list"
                 scriptFormat="sql"
                 camunda:resource="transaction.list">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="output" value="targets" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:scriptTask>
<bpmn:scriptTask id="seedRow" scriptFormat="sql"
                 camunda:resource="insert,transaction.new" />
<bpmn:subProcess id="loop">
  <bpmn:multiInstanceLoopCharacteristics isSequential="true"
                                         camunda:collection="targets"
                                         camunda:elementVariable="id" />
  <bpmn:scriptTask id="readMax" scriptFormat="sql"
                   camunda:resource="transaction.max">
    <bpmn:extensionElements>
      <camunda:properties>
        <camunda:property name="output" value="[0]['maxAge']->maxAge" />
      </camunda:properties>
    </bpmn:extensionElements>
  </bpmn:scriptTask>
  <bpmn:serviceTask id="appendRow"
                    camunda:class="integration.TransactionTest$Consumer#incAge" />
</bpmn:subProcess>
```

운영 함의:
- 트랜잭션은 BPMN 시작 시점에 OASIS `SpringTransactionHandler` 가 열고, 끝까지 한 트랜잭션으로 유지된다 (예외 발생 시 롤백).
- multi-instance loop 안에서도 같은 트랜잭션이라 `flush()` 한 결과를 다음 반복의 SELECT 가 바로 본다 — `transaction.max` 가 매 반복마다 갱신된 값을 반환하는 것은 이 동작에 의존한다.
- 다중 매니저가 필요하면 `getServiceStarter(ac, new String[]{"txBiz", "txEai"})` 처럼 배열로 넘긴다. 운영 코드는 거의 항상 단일 매니저.
- DML scriptTask 에는 `insert,` 또는 `update,` 접두사가 반드시 필요 (5절 C).

## 9. PropertyEL 빠른 참조 (실제로 자주 쓰이는 형태만)

| 표기 | 의미 | 임베드된 예제 위치 |
| --- | --- | --- |
| `output="orders"` | 결과 전체를 alias 에 저장 | `services/multi_action_screen.bpmn` |
| `output="[0]['cnt']->stepCount"` | List<Map> 첫 행의 한 컬럼만 alias 에 저장 | (운영 매퍼 결과 패턴) |
| `output="[0]['age'] -> age"` | 같은 의미, 공백/이름 버전 | `services/mybatis_select_and_loop.bpmn` |
| `input="eventName"` (process/gateway 레벨) | 외부 호출자에게서 받을 변수 / 분기 키 | `services/state_router_subprocess.bpmn` |
| `input="nextStatus->status"` | 변수 이름을 메서드 파라미터 이름으로 매핑 | (상태 변경 task 표기) |
| `<camunda:inputParameter name="...">리터럴</...>` | 메서드 호출에 리터럴 주입 | `services/state_actor_validation.bpmn`, `services/multi_action_screen.bpmn` |
| `$type{full.qualified.Class}` | 컨텍스트에 있는 객체를 해당 타입으로 캐스팅해 주입 | `services/state_actor_validation.bpmn` (HoldChecker) |
| `/*resultType=Class*/` (script 첫 줄) | inline SQL 결과를 DTO/List<DTO> 로 매핑 | `services/lov_test.bpmn` |

PropertyEL 디버깅 시에는 항상 다음 4가지를 순서대로 점검한다.
1) 변수 이름이 컨텍스트에 실제로 있는가? (audit, AuditHolder 미설정도 흔한 원인)
2) 메서드 파라미터 이름과 동일한가? (다르면 `->` 매핑 필요)
3) script 결과 타입이 List<Map> 인가 List<DTO> 인가? (`[0]['col']` vs `[0].col`)
4) multi-instance 안인가? — 안이라면 elementVariable 이름과 collection 의 원소 형태 확인.

## 10. 도메인 객체 패턴 (발췌 위치)

| 발췌 위치 | 보여주는 패턴 |
| --- | --- |
| [`examples/java/Order_excerpt.java`](examples/java/Order_excerpt.java) | aggregate 생성(DTO 자동 매핑) + multi-instance 원소 단위 처리 + 비즈니스 검증에서 `BizException` |
| [`examples/java/Item_excerpt.java`](examples/java/Item_excerpt.java) | 상태 변경 (`changeXxx` 패턴: 조회 → 변경 → flush) + boolean 검증 (`isXxx`) |
| [`examples/java/HoldChecker_excerpt.java`](examples/java/HoldChecker_excerpt.java) | `$type{}` 주입을 받는 boolean check 메서드 |
| [`examples/java/Package_excerpt.java`](examples/java/Package_excerpt.java) | 단순 `isXxx` lookup-or-throw 검증 |

새 BPMN 을 제안할 때는 위 발췌의 메서드 이름과 시그니처를 우선 모방한다. 새 메서드를 추가해야만 할 때는 클래스의 다른 메서드 시그니처/네이밍과 일관되게 (`changeXxx`, `isXxx`, `record...`) 짓는다.

## 11. 새 서비스를 만들 때 운영 적용 체크리스트

1. BPMN 파일명/위치
   - 비즈니스 화면 단위면 `services/<도메인>/<screen>^^<한글명>.bpmn`
   - 상태 천이 액터면 `services/core/<entity>prg/<From><To>_actor.bpmn`
2. process 의 input 변수 1~3개 선언 (`itemId`, `orderId`, `eventName`, `action` 같은 식)
3. 분기는 exclusiveGateway + `input` + flow `name` 매칭 (2번 그대로)
4. 검증은 boolean 반환 task + `#root = false` + Error End Event (3번)
5. SQL 은 `mappers/<도메인>/<screen>_<한글명>.xml` 에 `namespace="<도메인>.<screen>"` 으로 작성, BPMN 에서 `camunda:resource="<도메인>.<screen>.<id>"` 참조
6. 비즈니스 로직은 도메인 객체 메서드(`*#cancelRun`, `*#changeStatus`)를 호출. 새 메서드면 도메인 클래스 안에 추가
7. 리스트 처리는 multi-instance + `isSequential="true"`
8. 테스트는 `BpmnServiceLoaderForTest.getServiceStarter(applicationContext, new String[]{"txBiz"})` + `setAudit(AuditHolder.getAudit())` + `serviceResultCode() == SUCCESS` 검증
9. 사용자 에러는 `BizException` 으로 던지고, 정해진 에러 분기는 Error End Event 의 `errorMessage` 로 노출

이 9개를 모두 충족시키면 운영 BPMN 들과 자연스럽게 어울리는 새 서비스가 된다.
