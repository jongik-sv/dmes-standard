# Messaging

이 페이지는 모델러 속성 패널 스크린샷 대신 실제 BPMN 예시와 테스트 기준으로 다시 정리한 버전이다.

# 개요

OASIS의 메시징은 Message Send Task가 실행 시점의 데이터를 묶어 두었다가, 서비스가 정상 종료되면 `ServiceResult.messages()` 로 반환하는 방식이다.

중요한 점은 다음과 같다.

- OASIS가 메시지를 실제 외부 시스템으로 전송하지는 않는다.
- HTTP 전송, MQ 발행, DB 적재 같은 실제 전달은 서비스 결과를 받은 애플리케이션이 수행한다.
- 메시지는 `Topic` 으로 구분한다.

# 가장 단순한 Message Send Task

가장 단순한 형태는 `camunda:type="external"` 과 `camunda:topic` 만 지정하는 Send Task 이다.

```xml
<bpmn:sendTask id="Activity_0crqd2l" name="메시지" camunda:type="external" camunda:topic="m1" />
```

이 경우 OASIS는 `TopicLoader`, `TopicStructureLoader` 를 이용해 사전 구조화 메시지(`PreStructuredMessage`)를 만든다.

대표 테스트:

- `PreStructuredMessageSendTaskServiceTest#service_having_SendTask_return_service_results_with_message()`

# Topic 과 구조 정의

메시지를 사용하려면 `ApplicationContext` 에 다음 구성요소를 넣는다.

- `TopicLoader`
- 필요 시 `TopicStructureLoader`

예시:

```java
DefaultApplicationContext applicationContext = new DefaultApplicationContext();
applicationContext.put("topicLoader", new TypedObject((TopicLoader) topicId -> (Topic) () -> topicId));
applicationContext.put("topicStructureLoader", new TypedObject(topicStructureLoader));
```

사전 정의된 구조를 쓰지 않는다면 `TopicStructureLoader` 는 생략할 수 있다.

# `messageObject` / `msgObj` 사용하기

메시지를 특정 객체 하나로 만들고 싶다면 Send Task 에 `messageObject` 또는 약식 `msgObj` 프로퍼티를 준다.

```xml
<bpmn:sendTask id="Activity_0crqd2l" name="메시지" camunda:type="external" camunda:topic="m1">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="messageObject" value="msg" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:sendTask>

<bpmn:serviceTask id="Activity_1yde9w9" name="DTO 만들기" camunda:class="oasis.service.MessageObjectGenerator#generate">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="output" value="msg" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:serviceTask>
```

이 방식은 `MessageObjectMessage` 를 만든다.

대표 테스트:

- `PlainObjectMessageSendTaskServiceTest#service_having_MessageObjectSendTask_return_service_results_with_message_object()`

# PropertyEL 로 특정 요소 선택하기

`messageObject` 는 PropertyEL 도 사용할 수 있다. 리스트에서 첫 번째 요소만 메시지로 만들고 싶다면 다음처럼 지정한다.

```xml
<camunda:property name="messageObject" value="msgs[0]" />
```

대표 테스트:

- `PlainObjectMessageSendTaskServiceTest#given_object_list_and_resolve_a_message_with_property_el()`

# SQL / 컨텍스트 결과를 사전 구조 메시지로 바인딩하기

사전 구조 메시지는 주로 `input` 으로 컨텍스트 값을 바인딩해 만든다.

- `Map` 은 전체 항목을 바인딩 대상으로 올린다.
- `Collection` 은 요소가 1개일 때 첫 번째 요소를 기준으로 해석한다.
- 일반 객체는 내부적으로 `Map` 으로 변환해 바인딩한다.

SQL Script Task 결과를 다음 메시지 태스크에서 사용하는 패턴도 지원한다.

대표 테스트:

- `PreStructuredMessageSendTaskServiceTest#service_having_SendTask_with_sql_task_result_binding_values_returns_bind_message()`

# 서비스 결과에서 메시지 받기

메시지는 서비스 실행이 끝난 뒤 `ServiceResult.messages()` 에서 꺼낸다.

```java
ServiceResult serviceResult = serviceStarter.start("xxx", serviceContext);
List<Message> messages = serviceResult.messages();
```

# 빌더 전략

OASIS는 메시지 생성 전략을 두 갈래로 나눈다.

- `messageObject` 가 있으면 `MessageObjectMessageBuilder` 계열 사용
- 없으면 `PreStructuredMessageBuilder` 계열 사용

기본 구현은 다음과 같다.

- 객체 메시지: `SerializedMessageObjectMessageBuilder`
- 사전 구조 메시지: `CaseInsensitivePreStructuredMessageBuilder`

필요하면 애플리케이션 컨텍스트에 커스텀 구현체를 등록해 교체할 수 있다.

# 참고 소스

- BPMN 예시: `service/MessageSendTaskServiceTest/*.bpmn`
- 객체 메시지 테스트: `PlainObjectMessageSendTaskServiceTest`
- 사전 구조 메시지 테스트: `PreStructuredMessageSendTaskServiceTest`

# 실무 팁

- 외부 전송 책임은 OASIS 밖에 둔다.
- 전송 대상 시스템 스키마가 고정돼 있으면 `TopicStructureLoader` 기반의 사전 구조 메시지가 편하다.
- 전송 객체를 그대로 유지하고 싶으면 `messageObject` 를 사용한다.
- 메시지 수와 내용은 항상 `ServiceResult.messages()` 로 테스트에 고정해 두는 것이 좋다.