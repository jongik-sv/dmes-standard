# 10. 유틸리티 & 예외

## 파일 목록

| 파일 | 역할 |
|------|------|
| `util/KafkaConstants.java` | 상수 정의 |
| `util/JsonUtil.java` | JSON 직렬화/역직렬화 |
| `exception/KafkaSendException.java` | Producer 전송 실패 예외 |
| `exception/KafkaConsumeException.java` | Consumer 처리 실패 예외 |
| `exception/KafkaOffsetException.java` | Offset 조작 실패 예외 |

---

## KafkaConstants

**경로**: `util/KafkaConstants.java`

private 생성자로 인스턴스화를 방지하는 상수 클래스이다.

### 메시지 필드명

```java
public static final String FIELD_TRANSACTION_CODE   = "TRANSACTION_CODE";
public static final String FIELD_INTERFACE_ID        = "INTERFACE_ID";
public static final String FIELD_INTERFACE_MSG       = "INTERFACE_MSG";
public static final String FIELD_INTERFACE_PROTOCOL  = "INTERFACE_PROTOCOL";
public static final String FIELD_KAFKA_KEYDATA       = "KAFKA_KEYDATA";
```

표준 메시지 JSON의 키 이름이다. `KafkaMessageProducer`(빌드 시)와 `KafkaMessageConsumer`(파싱 시)에서 사용한다.

### 프로토콜

```java
public static final String PROTOCOL_KAFKA    = "KAFKA";
public static final String PROTOCOL_IF_KAFKA = "IF_KAFKA";
```

`PROTOCOL_IF_KAFKA`가 표준 메시지의 `INTERFACE_PROTOCOL` 값이다.

### 에러 타입

```java
public static final String ERROR_TYPE_SEND    = "S";   // 송신 에러
public static final String ERROR_TYPE_RECEIVE = "R";   // 수신 에러
```

TB_MCM_MOM_TC_ERROR.ERROR_TYPE 컬럼에 기록되는 값이다.

### DLT / Listener

```java
public static final String DLT_SUFFIX      = ".dlt";       // DLT 토픽 접미사
public static final String LISTENER_PREFIX = "listener-";  // Listener ID 접두사
```

### SERAI 시스템

```java
public static final String BIZ_SYSTEM_PREFIX_SERAI = "serai";            // bizSystem 접두사 판별용
public static final String SERAI_HANDLER_BEAN_NAME = "SeraiConsumeHandler"; // SERAI 전용 핸들러 Bean 이름
```

`KafkaMessageConsumer`에서 `properties.getBizSystem()`이 `"serai"`로 시작하면 `SERAI_HANDLER_BEAN_NAME`으로 핸들러를 조회한다.

### 기본값

```java
public static final int DEFAULT_PARTITION         = 0;  // 1 Topic : 1 Partition
public static final int DEFAULT_MAX_POLL_RECORDS  = 1;
public static final int DEFAULT_CONCURRENCY       = 1;
```

### 사용처 매핑

| 상수 | 사용처 |
|------|--------|
| `FIELD_*` | KafkaMessageProducer, KafkaMessageConsumer |
| `PROTOCOL_IF_KAFKA` | KafkaMessageProducer, KafkaErrorRepository |
| `ERROR_TYPE_*` | KafkaErrorRepository |
| `DLT_SUFFIX` | KafkaListenerConfig, KafkaAdminConfig |
| `LISTENER_PREFIX` | KafkaListenerConfig, KafkaStatusController |
| `BIZ_SYSTEM_PREFIX_SERAI` | KafkaMessageConsumer |
| `SERAI_HANDLER_BEAN_NAME` | KafkaMessageConsumer |
| `DEFAULT_PARTITION` | KafkaOffsetManager |

---

## JsonUtil

**경로**: `util/JsonUtil.java`

Jackson `ObjectMapper`를 래핑한 유틸리티 클래스이다. `ObjectMapper`는 스레드 안전하므로 static final로 공유한다.

```java
private static final ObjectMapper MAPPER = new ObjectMapper();
```

### 메서드

#### parseMap(String json) → Map<String, Object>

```java
public static Map<String, Object> parseMap(String json) {
    return MAPPER.readValue(json, new TypeReference<Map<String, Object>>() {});
}
```

주로 `KafkaMessageConsumer.parseMessage()`에서 수신된 JSON을 Map으로 변환할 때 사용한다.

#### toJson(Object obj) → String

```java
public static String toJson(Object obj) {
    return MAPPER.writeValueAsString(obj);
}
```

주로 `KafkaMessageProducer.buildMessageJson()`에서 LinkedHashMap을 JSON 문자열로 변환할 때 사용한다.

#### parse(String json, Class\<T\> type) → T

```java
public static <T> T parse(String json, Class<T> type) {
    return MAPPER.readValue(json, type);
}
```

제네릭 역직렬화. 현재 내부적으로는 사용하지 않지만 호스트 프로젝트에서 활용 가능하다.

#### isValidJson(String json) → boolean

```java
public static boolean isValidJson(String json) {
    try {
        MAPPER.readTree(json);
        return true;
    } catch (JsonProcessingException e) {
        return false;
    }
}
```

### 예외 처리

모든 메서드에서 `JsonProcessingException`을 catch하여 `RuntimeException`으로 래핑하여 던진다. checked exception을 unchecked로 변환한다.

---

## 예외 클래스

세 가지 커스텀 예외가 있으며, 모두 `RuntimeException`을 상속한다.

### KafkaSendException

**경로**: `exception/KafkaSendException.java`

Producer 전송 실패 시 사용된다.

```java
public class KafkaSendException extends RuntimeException {
    public KafkaSendException(String message) { ... }
    public KafkaSendException(String message, Throwable cause) { ... }
}
```

**발생 시점**:
- `KafkaMessageProducer.sendAsync()` 실패 시 `ProducerCallback.onFailure()`에 전달
- 동기 `send()`는 예외를 던지지 않고 `SendResult.fail()`로 반환

### KafkaConsumeException

**경로**: `exception/KafkaConsumeException.java`

Consumer 처리 실패 시 사용된다.

```java
public class KafkaConsumeException extends RuntimeException {
    private String transactionCode;
    private long offset;

    public KafkaConsumeException(String message) { ... }
    public KafkaConsumeException(String message, Throwable cause) { ... }
    public KafkaConsumeException(String message, Throwable cause,
                                  String transactionCode, long offset) { ... }
}
```

**추가 필드**:
- `transactionCode`: 실패한 메시지의 TRANSACTION_CODE
- `offset`: 실패한 메시지의 Offset

### KafkaOffsetException

**경로**: `exception/KafkaOffsetException.java`

Offset 조회/변경 실패 시 사용된다.

```java
public class KafkaOffsetException extends RuntimeException {
    private String topic;
    private String groupId;

    public KafkaOffsetException(String message) { ... }
    public KafkaOffsetException(String message, Throwable cause) { ... }
    public KafkaOffsetException(String message, Throwable cause,
                                 String topic, String groupId) { ... }
}
```

**발생 시점**:
- `KafkaOffsetManager.getCurrentOffset()` 실패
- `KafkaOffsetManager.getMaxOffset()` / `getMinOffset()` 실패
- `KafkaOffsetManager.skipOffset()` 실패

---

## 예외 흐름 요약

```
Producer:
  KafkaMessageProducer
  ├── 동기 send()    → 예외 catch → SendResult.fail() 반환 (예외 전파 안 함)
  └── 비동기 sendAsync() → 예외 catch → ProducerCallback.onFailure(KafkaSendException)

Consumer:
  KafkaMessageConsumer
  ├── 핸들러 실행    → HandleResult로 결과 반환 (예외 전파 안 함)
  └── 파싱 실패 등   → try-catch → 에러 로그 + acknowledge() (예외 전파 안 함)

Offset:
  KafkaOffsetManager
  └── AdminClient 호출 실패 → KafkaOffsetException throw → REST API에서 500 반환
```
