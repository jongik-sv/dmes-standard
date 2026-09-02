# 03. 메시지 송신 (Producer)

## 파일 목록

| 파일 | 역할 |
|------|------|
| `producer/KafkaMessageProducer.java` | 메시지 전송 서비스 (핵심) |
| `producer/SendResult.java` | 전송 결과 DTO |
| `producer/ProducerCallback.java` | 비동기 전송 콜백 인터페이스 |
| `model/KafkaMessage.java` | 전송할 메시지 모델 |

---

## 표준 메시지 포맷

모든 메시지는 아래 5개 필드의 JSON으로 전송된다.

```json
{
    "TRANSACTION_CODE": "PQR02012",
    "KAFKA_KEYDATA": "840d4999-196b-4740-a370-bc5eed4b30ae",
    "INTERFACE_ID": "MMPPMERPTT01",
    "INTERFACE_MSG": "PQR02012|P|S|5A|20260130111245|...",
    "INTERFACE_PROTOCOL": "IF_KAFKA"
}
```

| 필드 | 설정 주체 | 설명 |
|------|-----------|------|
| `TRANSACTION_CODE` | 사용자 | 트랜잭션 코드 (핸들러 라우팅 키) |
| `KAFKA_KEYDATA` | **라이브러리 자동** | `UUID.randomUUID()` |
| `INTERFACE_ID` | **라이브러리 자동** | 토픽명과 동일 |
| `INTERFACE_MSG` | 사용자 | 파이프(`\|`) 구분자 메시지 본문 |
| `INTERFACE_PROTOCOL` | **라이브러리 자동** | `"IF_KAFKA"` 고정 |

사용자가 설정하는 것은 `TRANSACTION_CODE`와 `INTERFACE_MSG` 두 가지뿐이다.

---

## KafkaMessageProducer

**경로**: `producer/KafkaMessageProducer.java`

`@Service`로 등록되며, 호스트 프로젝트에서 주입받아 사용한다.

### 의존성

```java
private final KafkaTemplate<String, String> kafkaTemplate;
private final CaravanProperties properties;
private final KafkaErrorRepository errorRepository;
```

### 공개 API

#### 동기 전송

```java
// 간단 전송 (필수 필드만)
SendResult send(String topic, String transactionCode, String interfaceMsg)

// KafkaMessage 객체로 전송
SendResult send(String topic, KafkaMessage message)
```

#### 비동기 전송

```java
// 간단 비동기 전송
void sendAsync(String topic, String transactionCode, String interfaceMsg, ProducerCallback callback)

// KafkaMessage 객체로 비동기 전송
void sendAsync(String topic, KafkaMessage message, ProducerCallback callback)
```

### 내부 동작

#### buildMessageJson(String topic, KafkaMessage message)

```
1. LinkedHashMap 생성 (필드 순서 보장)
2. TRANSACTION_CODE ← message.getTransactionCode()
3. KAFKA_KEYDATA    ← UUID.randomUUID().toString()
4. INTERFACE_ID     ← topic 파라미터
5. INTERFACE_MSG    ← message.getInterfaceMsg()
6. INTERFACE_PROTOCOL ← "IF_KAFKA"
7. JsonUtil.toJson(map) → JSON 문자열 반환
```

#### 동기 전송 흐름

```
1. buildMessageJson()으로 JSON 생성
2. kafkaTemplate.send(topic, json)
3. future.get(timeoutSeconds, SECONDS) — 블로킹 대기
4. 성공 → SendResult.success(metadata)
5. 실패 → logError() + SendResult.fail(errorMessage)
```

#### 비동기 전송 흐름

```
1. buildMessageJson()으로 JSON 생성
2. kafkaTemplate.send(topic, json)
3. future.addCallback(
       onSuccess → callback.onSuccess(SendResult)
       onFailure → logError() + callback.onFailure(KafkaSendException)
   )
```

#### logError(...)

전송 실패 시 `KafkaErrorRepository.logSendError()`를 호출하여 TB_MCM_MOM_TC_ERROR에 기록한다. DB 기록 자체가 실패하면 로그만 남기고 무시한다.

### 에러 처리

| 예외 | 상황 |
|------|------|
| `TimeoutException` | 브로커 응답 시간 초과 |
| `ExecutionException` | 브로커 오류, 직렬화 실패 등 |
| `InterruptedException` | 스레드 인터럽트 |

모든 예외를 catch하여 `SendResult.fail()`로 반환한다. 예외를 던지지 않는다.

---

## KafkaMessage

**경로**: `model/KafkaMessage.java`

```java
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class KafkaMessage {
    private String transactionCode;   // 필수
    private String interfaceMsg;      // 필수
}
```

`@Builder` 패턴으로 생성한다.

```java
KafkaMessage msg = KafkaMessage.builder()
    .transactionCode("PQR02012")
    .interfaceMsg("PQR02012|P|S|5A|20260130111245|...")
    .build();
```

---

## SendResult

**경로**: `producer/SendResult.java`

```java
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class SendResult {
    private boolean success;
    private String topic;
    private int partition;
    private long offset;
    private long timestamp;
    private String errorMessage;
}
```

### 팩토리 메서드

| 메서드 | 용도 |
|--------|------|
| `SendResult.success(RecordMetadata)` | 전송 성공 시 메타데이터로 생성 |
| `SendResult.fail(String errorMessage)` | 전송 실패 시 에러 메시지로 생성 |

---

## ProducerCallback

**경로**: `producer/ProducerCallback.java`

비동기 전송 결과를 수신하는 콜백 인터페이스이다.

```java
public interface ProducerCallback {
    void onSuccess(SendResult result);
    void onFailure(KafkaSendException exception);
}
```

호스트 프로젝트에서 익명 클래스 또는 람다로 구현하여 `sendAsync()`에 전달한다.

---

## Kafka Record Key

1 Topic : 1 Partition 구조이므로 Record Key를 설정하지 않는다. `kafkaTemplate.send(topic, value)`로 key 없이 전송한다.
