# 09. 모델 / DTO

## 파일 목록

| 파일 | 계층 | 용도 |
|------|------|------|
| `model/KafkaMessage.java` | Producer | 전송할 메시지 |
| `model/KafkaMessageContext.java` | Consumer | 수신된 메시지 컨텍스트 (핸들러에 전달) |
| `model/TopicInfo.java` | Repository | DB 토픽 정보 |
| `model/KafkaErrorLog.java` | Repository | DB 에러 로그 |
| `model/BrowseResult.java` | Offset | 메시지 조회 결과 |
| `producer/SendResult.java` | Producer | 전송 결과 |
| `offset/OffsetInfo.java` | Offset | Offset Skip 결과 |
| `handler/HandleResult.java` | Handler | 핸들러 실행 결과 |

---

## 데이터 흐름별 모델 사용

### Producer 흐름

```
호스트 코드 → KafkaMessage → KafkaMessageProducer → SendResult → 호스트 코드
```

### Consumer 흐름

```
Kafka → ConsumerRecord → KafkaMessageConsumer.parseMessage() → KafkaMessageContext → Handler → HandleResult
```

### 에러 흐름

```
에러 발생 → KafkaErrorRepository → KafkaErrorLog → KafkaMapper → TB_MCM_MOM_TC_ERROR
```

---

## KafkaMessage (전송용)

**경로**: `model/KafkaMessage.java`

호스트 프로젝트에서 Producer에게 전달하는 메시지 객체이다.

```java
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class KafkaMessage {
    private String transactionCode;   // TRANSACTION_CODE (필수)
    private String interfaceMsg;      // INTERFACE_MSG (필수)
}
```

나머지 3개 필드(KAFKA_KEYDATA, INTERFACE_ID, INTERFACE_PROTOCOL)는 `KafkaMessageProducer.buildMessageJson()`에서 자동으로 채워진다.

---

## KafkaMessageContext (수신용)

**경로**: `model/KafkaMessageContext.java`

`KafkaMessageConsumer.parseMessage()`에서 생성되어 핸들러의 `businessHandle()`에 전달된다.

```java
@Data
public class KafkaMessageContext {
    // 표준 메시지 필드
    private String transactionCode;      // TRANSACTION_CODE
    private String interfaceId;          // INTERFACE_ID (= 토픽명)
    private String interfaceMsg;         // INTERFACE_MSG (파이프 구분자)
    private String interfaceProtocol;    // INTERFACE_PROTOCOL ("IF_KAFKA")
    private String kafkaKeyData;         // KAFKA_KEYDATA (UUID)

    // 원본 메시지
    private String rawMessage;           // 원본 JSON 문자열
    private Map<String, Object> rawMessageMap;  // Map으로 파싱된 원본

    // Kafka 메타데이터
    private String topic;
    private int partition;
    private long offset;
    private long timestamp;

    // 처리 정보
    private int attemptCount;            // 현재 재시도 횟수 (1부터 시작)
}
```

### 주요 메서드

| 메서드 | 설명 |
|--------|------|
| `getInterfaceMsgArray()` | `interfaceMsg.split("\\|")` — 파이프 구분자로 분리한 배열 |
| `getString(String key)` | `rawMessageMap.get(key).toString()` — 원본 Map에서 값 조회 |

### getInterfaceMsgArray() 사용 예시

메시지: `"PQR02012|P|S|5A|20260130111245|JCM_TEST|MMPPMERPTT01|||||20250808|00011|C|"`

```java
String[] arr = context.getInterfaceMsgArray();
// arr[0] = "PQR02012"       (TRANSACTION_CODE)
// arr[1] = "P"              (타입)
// arr[2] = "S"              (상태)
// arr[3] = "5A"
// arr[4] = "20260130111245" (일시)
// ...
```

---

## HandleResult (핸들러 결과)

**경로**: `handler/HandleResult.java`

> 상세 설명은 `05-HANDLER.md` 참조

```java
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class HandleResult {
    private boolean success;
    private boolean retryable;
    private String errorCode;
    private String errorMessage;
    private Object data;
}
```

---

## SendResult (전송 결과)

**경로**: `producer/SendResult.java`

> 상세 설명은 `03-PRODUCER.md` 참조

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

---

## TopicInfo (토픽 정보)

**경로**: `model/TopicInfo.java`

> 상세 설명은 `08-DATABASE.md` 참조

```java
@Data
public class TopicInfo {
    private String topicId;        // TOPIC_ID (= Kafka 토픽명)
    private String topicDesc;      // TOPIC_DESC
    private String groupId;        // GROUP_ID
    private String bizSystem;      // BIZ_SYSTEM
    private String sendModuleId;   // SEND_MODULE_ID
    private String recvModuleId;   // RECV_MODULE_ID
    private String useTp;          // USE_TP
    private String status;         // STATUS
}
```

---

## KafkaErrorLog (에러 로그)

**경로**: `model/KafkaErrorLog.java`

> 상세 설명은 `08-DATABASE.md` 참조

```java
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class KafkaErrorLog {
    private String interfaceProtocol;   // "IF_KAFKA"
    private String transactionCode;
    private String interfaceId;         // 토픽명
    private String interfaceMsg;        // 전문 또는 "offset:{offset}"
    private String errorType;           // "S" 또는 "R"
    private String errorCode;
    private String errorMsg;
    private String createdObjectId;     // bizSystem
    private String createdProgramId;    // "CARAVAN"
}
```

---

## BrowseResult (메시지 조회 결과)

**경로**: `model/BrowseResult.java`

> 상세 설명은 `06-CONTAINER-OFFSET.md` 참조

```java
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class BrowseResult {
    private long offset;
    private int partition;
    private String topic;
    private String key;
    private String value;          // JSON 문자열
    private long timestamp;
    private String timestampStr;   // "yyyy-MM-dd HH:mm:ss"
}
```

---

## OffsetInfo (Offset Skip 결과)

**경로**: `offset/OffsetInfo.java`

> 상세 설명은 `06-CONTAINER-OFFSET.md` 참조

```java
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class OffsetInfo {
    private long beforeOffset;
    private long afterOffset;
    private long maxOffset;
    private int partition;
    private String topic;
    private String groupId;
}
```
