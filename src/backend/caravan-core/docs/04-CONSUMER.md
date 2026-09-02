# 04. 메시지 수신 (Consumer)

## 파일 목록

| 파일 | 역할 |
|------|------|
| `consumer/KafkaListenerConfig.java` | Listener 동적 등록 |
| `consumer/KafkaMessageConsumer.java` | 메시지 소비 및 핸들러 라우팅 (핵심) |
| `consumer/KafkaDltConsumer.java` | Dead Letter Topic 메시지 처리 |

---

## KafkaListenerConfig

**경로**: `consumer/KafkaListenerConfig.java`

`KafkaListenerConfigurer`를 구현하며, 애플리케이션 시작 시 Spring Kafka가 `configureKafkaListeners()`를 호출한다.

### 동작 순서

```
1. caravan.kafka.consumer.enabled 확인 (false면 등록 안 함)
2. KafkaTopicRepository.getTopics()로 DB에서 토픽 목록 조회
3. 각 토픽에 대해:
   ├── registerMainListener()  → 원본 토픽 Listener 등록
   └── registerDltListener()   → DLT 토픽 Listener 등록
```

### Listener 등록 상세

`MethodKafkaListenerEndpoint`를 사용하여 프로그래밍 방식으로 등록한다.
`@KafkaListener` 어노테이션을 사용하지 않는다.

#### 메인 Listener

```java
endpoint.setId("listener-" + topicId);        // Listener ID
endpoint.setGroupId(topic.getGroupId());       // DB의 GROUP_ID
endpoint.setTopics(topicId);                   // 구독 토픽
endpoint.setBean(messageConsumer);             // KafkaMessageConsumer
endpoint.setMethod(getConsumeMethod());        // consume(ConsumerRecord, Consumer, Acknowledgment)
```

#### DLT Listener

```java
endpoint.setId("listener-" + topicId + ".dlt");    // Listener ID
endpoint.setGroupId(topic.getGroupId() + "-dlt");  // GROUP_ID + "-dlt"
endpoint.setTopics(topicId + ".dlt");              // 토픽명.dlt
endpoint.setBean(dltConsumer);                     // KafkaDltConsumer
endpoint.setMethod(getDltConsumeMethod());
```

### 리플렉션으로 메서드 참조

```java
private Method getConsumeMethod() throws NoSuchMethodException {
    return KafkaMessageConsumer.class.getMethod("consume",
        ConsumerRecord.class, Consumer.class, Acknowledgment.class);
}
```

DLT도 마찬가지로 `KafkaDltConsumer.consume`의 Method를 리플렉션으로 가져온다.

### 주의사항

- DB 조회 실패 시 Listener가 등록되지 않는다
- 개별 토픽 등록 실패는 해당 토픽만 건너뛰고 나머지는 계속 등록된다 (try-catch)

---

## KafkaMessageConsumer

**경로**: `consumer/KafkaMessageConsumer.java`

`@Component`로 등록되며, Kafka 메시지 소비의 핵심 로직을 담당한다.

### 의존성

```java
private final KafkaInterfaceHandlerRegistry handlerRegistry;
private final ContainerController containerController;
private final KafkaErrorRepository errorRepository;
private final CaravanProperties properties;
```

### consume() 메서드

Listener가 호출하는 진입점이다.

```java
public void consume(ConsumerRecord<String, String> record,
                    Consumer<?, ?> consumer,
                    Acknowledgment acknowledgment)
```

#### 처리 흐름

```
1. parseMessage(record) → KafkaMessageContext 생성
   ├── JSON 파싱 (JsonUtil.parseMap)
   ├── 표준 필드 매핑 (TRANSACTION_CODE, INTERFACE_ID, INTERFACE_MSG, INTERFACE_PROTOCOL, KAFKA_KEYDATA)
   └── Kafka 메타데이터 설정 (topic, partition, offset, timestamp)

2. transactionCode 추출
   └── context.getTransactionCode()가 null/empty면 에러 로그 후 커밋하고 리턴

3. handler 조회 (bizSystem에 따라 분기)
   ├── bizSystem이 "serai"로 시작 → handlerRegistry.getHandler("SeraiConsumeHandler")
   │   └── 모든 메시지가 SeraiConsumeHandler 전용 핸들러로 라우팅
   └── 그 외 → handlerRegistry.getHandler(transactionCode)
       ├── Bean 있으면 해당 KafkaInterfaceHandler 반환
       └── Bean 없으면 DefaultKafkaInterfaceHandler 반환

4. executeWithRetry(handler, context, record, consumer, acknowledgment)
```

### SERAI 시스템 예외 라우팅

`caravan.kafka.biz-system`이 `serai`로 시작하는 경우(대소문자 무관), TRANSACTION_CODE와 관계없이 모든 메시지가 Bean 이름 `SeraiConsumeHandler`로 등록된 단일 핸들러로 라우팅된다.

```
일반 시스템 (biz-system: DMES):
  TRANSACTION_CODE "PQR02012" → Bean("PQR02012") → PQR02012 핸들러
  TRANSACTION_CODE "ABC01234" → Bean("ABC01234") → ABC01234 핸들러

SERAI 시스템 (biz-system: serai_prod):
  TRANSACTION_CODE "PQR02012" → Bean("SeraiConsumeHandler") → SeraiConsumeHandler 핸들러
  TRANSACTION_CODE "ABC01234" → Bean("SeraiConsumeHandler") → SeraiConsumeHandler 핸들러
```

SERAI 핸들러는 `context.getTransactionCode()`로 원본 TRANSACTION_CODE에 접근할 수 있으므로, 핸들러 내부에서 분기 처리가 가능하다.

### executeWithRetry() 메서드

재시도 루프를 관리한다.

```
maxAttempts = properties.getRetry().getMaxAttempts()  // 기본: 3
delayMs     = properties.getRetry().getDelayMs()      // 기본: 2000
skipOnMaxRetry = false

for (attempt = 1; attempt <= maxAttempts; attempt++) {
    context.setAttemptCount(attempt)
    result = handler.businessHandle(context)

    if (result.isSuccess()) {
        acknowledgment.acknowledge()  // offset 커밋
        return
    }

    if (!result.isRetryable()) {
        saveError(...)                // DB에 에러 기록
        acknowledgment.acknowledge()  // offset 커밋 (스킵)
        return
    }

    // retryable=true → 스킵 여부 보관
    skipOnMaxRetry = result.isSkipOnMaxRetry()

    if (attempt < maxAttempts) {
        sleep(delayMs)                // 대기 후 재시도
    }
}

// 최대 재시도 초과
if (skipOnMaxRetry) {
    handleMaxRetrySkip(...)           // 에러 기록 후 다음 메시지
} else {
    handleMaxRetryExceeded(...)       // 컨테이너 일시정지
}
```

### handleMaxRetryExceeded() 메서드

최대 재시도 횟수를 초과하면 (failRetryable 사용 시):

```
1. saveError(...)                     // DB에 에러 기록 (ERROR_CODE: MAX_RETRY_EXCEEDED)
2. containerController.pause(listenerId)  // 컨테이너 일시정지
3. consumer.seek(topicPartition, offset)  // offset 롤백 (같은 메시지로 되돌림)
4. acknowledgment.acknowledge() 호출하지 않음
```

**컨테이너가 일시정지(PAUSED) 상태가 되므로**, 운영자가 REST API(`/kafkaApi/resume` 또는 `/kafkaApi/skipOffset`)로 복구해야 한다.

### handleMaxRetrySkip() 메서드

최대 재시도 횟수를 초과하면 (failRetryableSkip 사용 시):

```
1. saveError(...)                     // DB에 에러 기록 (ERROR_CODE: MAX_RETRY_SKIP)
2. acknowledgment.acknowledge()       // offset 커밋 (메시지 스킵)
```

**컨테이너가 계속 실행(RUNNING)되며**, 다음 메시지 처리를 자동으로 계속한다. 운영자 개입이 불필요하다.

### failRetryable vs failRetryableSkip 비교

```
failRetryable()     → 재시도 → 최대 초과 → 컨테이너 PAUSE + offset 롤백 (운영자 개입)
failRetryableSkip() → 재시도 → 최대 초과 → 에러 DB 기록 + ack (자동 스킵)
```

### parseMessage() 메서드

```java
private KafkaMessageContext parseMessage(ConsumerRecord<String, String> record) {
    Map<String, Object> map = JsonUtil.parseMap(record.value());

    KafkaMessageContext context = new KafkaMessageContext();
    context.setTransactionCode(getStringValue(map, "TRANSACTION_CODE"));
    context.setInterfaceId(getStringValue(map, "INTERFACE_ID"));
    context.setInterfaceMsg(getStringValue(map, "INTERFACE_MSG"));
    context.setInterfaceProtocol(getStringValue(map, "INTERFACE_PROTOCOL"));
    context.setKafkaKeyData(getStringValue(map, "KAFKA_KEYDATA"));
    context.setRawMessage(record.value());
    context.setRawMessageMap(map);
    context.setTopic(record.topic());
    context.setPartition(record.partition());
    context.setOffset(record.offset());
    context.setTimestamp(record.timestamp());
    return context;
}
```

---

## KafkaDltConsumer

**경로**: `consumer/KafkaDltConsumer.java`

`.dlt` 토픽에 들어온 메시지를 처리한다.

### consume() 메서드 시그니처

```java
public void consume(
    String message,
    Acknowledgment acknowledgment,
    @Header("kafka_dlt-exception-message") String exceptionMessage,
    @Header("kafka_dlt-exception-fqcn") String exceptionClass,
    @Header("kafka_dlt-original-topic") String originalTopic,
    @Header("kafka_dlt-original-partition") Integer originalPartition,
    @Header("kafka_dlt-original-offset") Long originalOffset)
```

### 처리 로직

```
1. DLT 메시지 정보를 로그로 출력
   - 원본 토픽, 파티션, 오프셋
   - 예외 클래스, 예외 메시지
   - 메시지 본문
2. acknowledgment.acknowledge() — 항상 커밋 (무한 루프 방지)
```

현재 TODO 상태인 부분:
- 알림 발송 (이메일, 슬랙 등)
- 메시지 재처리 로직
- DLT 전용 DB 기록

---

## Consumer 비활성화

```yaml
caravan:
  kafka:
    consumer:
      enabled: false
```

`KafkaListenerConfig.configureKafkaListeners()`에서 `properties.getConsumer().isEnabled()`를 체크하여, `false`이면 Listener 등록을 전부 건너뛴다. Producer만 사용하는 경우에 설정한다.
