# Messaging Playbook

이 문서는 BPMN Send Task / Message 처리에 대한 가이드다. 권위 있는 정의는 `references/upstream/Messaging.md`, 메시지 인터페이스는 `references/upstream/미작성 카테고리/Extension/MessageSender.md`.

## 운영 사용도 — 거의 0

운영 BPMN ~158 개 중 Send Task 사용 사례 0 건. 대부분의 외부 연동은 별도 EAI / REST 클라이언트 모듈을 일반 Service Task 로 호출하는 형태로 처리한다. 이 playbook 은 “Send Task 가 필요해진 시점에만” 진입하는 가이드.

## Send Task 의 핵심 형태

```xml
<bpmn:sendTask id="publish"
               name="publish event"
               camunda:topic="orders.created">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="input" value="orderId,event" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:sendTask>
```

핵심 규칙:
- `camunda:topic` 으로 메시지 주제(topic) 를 명시.
- `input` 프로퍼티의 변수들이 메시지 payload 로 직렬화된다.
- 결과는 `result.messages()` 에 누적되어 테스트에서 검증 가능.

## 메시지 형태별 패턴

### pre-structured message
- payload 가 정해진 키 셋(`orderId`, `event`, ...)일 때.
- `input` 에 변수명 나열만으로 끝.

### object message
- 단일 도메인 객체 (DTO) 를 그대로 payload 로 보낸다.
- `input="order"` 처럼 객체 한 개를 지정. 직렬화는 OASIS `MessageSender` 구현이 담당.

### list of objects
- 컬렉션 변수 한 개를 통째로 보낸다.
- 또는 multi-instance Send Task 로 “원소마다 하나의 메시지” 발행.

권위 사례: `references/upstream/Messaging.md` 의 각 절.

## 테스트 검증

```java
ServiceResult result = serviceStarter.start("...", serviceContext);
assertThat(result.messages()).hasSize(1);
// 각 메시지의 topic, payload 검증은 messages() 의 원소 타입에 따라 달라짐.
```

`MessageSender` 를 mock 으로 주입하면 외부 broker 없이 발행 횟수와 payload 만 검증 가능.

## 안 써야 할 시점 vs 써야 할 시점

**안 써야 할 시점**
- HTTP / REST API 호출 — 일반 Service Task 가 더 직접적.
- 동기 호출이 필요한 경우 — Send Task 는 fire-and-forget 모델에 가깝다.
- 트랜잭션 안에서 즉시 commit 보장이 필요한 경우 — broker 발행은 트랜잭션 밖 이벤트.

**써야 할 시점**
- 비동기 broker (Kafka, RabbitMQ 등) 로의 이벤트 발행.
- 같은 BPMN 안에서 N 개의 메시지를 누적해 한꺼번에 발행해야 할 때 (multi-instance + Send Task).
- 도메인 이벤트 (CQRS / Event Sourcing) 발행.

## 디버깅 체크리스트

1. `camunda:topic` 이 누락되면 메시지가 어디로 가야 할지 모름 → 항상 명시.
2. `input` 변수가 service context 에 없으면 payload 가 비거나 null.
3. `result.messages()` 가 빈 리스트인데 발행을 의도했다면 — Send Task 가 아닌 일반 Service Task 로 잘못 모델링된 것.
4. broker 발행이 트랜잭션과 별개임을 잊지 말 것 — BPMN 이 rollback 되어도 이미 발행된 메시지는 회수 안 됨. transactional outbox 패턴이 필요한 경우 별도 설계.

## 자주 인용할 대표 샘플

- 권위 정의 / 모든 메시지 형태
  - `references/upstream/Messaging.md`
- MessageSender 인터페이스
  - `references/upstream/미작성 카테고리/Extension/MessageSender.md`
- inline / object / list 예제
  - `source-bpmn-examples.md` 의 messaging 절 (있다면)
