# 03. INBOUND - HTTP

## 관련 파일

```
inbound/http/controller/HttpIntegrationController.java
common/dto/IntegrationRequest.java
common/dto/IntegrationResponse.java
```

---

## 동작 흐름

```
외부 시스템  →  POST /seraiApi/v1/send  →  KafkaMessageProducer.send()  →  Kafka
```

외부 시스템이 HTTP로 메시지를 보내면, SERAI가 Kafka로 전달한다.

---

## HttpIntegrationController.java

### 엔드포인트

```
POST /seraiApi/v1/send
Content-Type: application/json
```

### 요청 파라미터 (IntegrationRequest)

| 필드 | 필수 | 설명 |
|------|------|------|
| INTERFACE_ID | O | Kafka 토픽 ID |
| TRANSACTION_CODE | O | 트랜잭션 코드 (Caravan 핸들러 라우팅 키) |
| INTERFACE_MSG | O | 파이프(|) 구분 메시지 본문 |

### 처리 순서

```java
1. validateRequest()     // 필수 파라미터 검증 (null, 빈 문자열)
2. kafkaMessageProducer.send(topic, transactionCode, interfaceMsg)
   // Caravan이 내부적으로 UUID, INTERFACE_ID, INTERFACE_PROTOCOL 자동 생성
3. IntegrationResponse.success() 반환
```

### 응답

성공:
```json
{
  "resultCode": "SUCCESS",
  "KAFKA_KEYDATA": "TOPIC_ID",
  "INTERFACE_ID": "TOPIC_ID",
  "timestamp": "2026-02-05T10:30:00"
}
```

실패 (파라미터 오류 → 400):
```json
{
  "resultCode": "ERROR",
  "errorCode": "INVALID_PARAMETER",
  "errorMessage": "INTERFACE_ID는 필수입니다.",
  "timestamp": "2026-02-05T10:30:00"
}
```

실패 (시스템 오류 → 500):
```json
{
  "resultCode": "ERROR",
  "errorCode": "SYSTEM_ERROR",
  "errorMessage": "...",
  "timestamp": "2026-02-05T10:30:00"
}
```

### 레거시 대비 변경점

기존(cactus 프레임워크):
```java
// KafkaMessage 객체 직접 생성, UUID 직접 생성, ObjectMapper로 JSON 직렬화
String kafkaKeydata = UUID.randomUUID().toString();
KafkaMessage kafkaMessage = KafkaMessage.builder()
    .TRANSACTION_CODE(transactionCode)
    .KAFKA_KEYDATA(kafkaKeydata)
    .INTERFACE_ID(topic)
    .INTERFACE_PROTOCOL("IF_KAFKA_HTTP")
    .build();
String jsonMessage = objectMapper.writeValueAsString(kafkaMessage);
kafkaProducerService.send(context, topic, transactionCode, jsonMessage);
```

현재(Caravan):
```java
// 한 줄로 끝. UUID, INTERFACE_ID, INTERFACE_PROTOCOL은 Caravan이 자동 처리
kafkaMessageProducer.send(topic, transactionCode, interfaceMsg);
```

---

## IntegrationRequest.java / IntegrationResponse.java

단순 DTO다. Jackson `@JsonProperty`로 대문자 JSON 키를 매핑한다. Lombok `@Data`로 getter/setter 자동 생성.

IntegrationResponse는 `@Builder` 패턴이고, `success()` / `error()` 정적 팩토리 메서드를 제공한다.
