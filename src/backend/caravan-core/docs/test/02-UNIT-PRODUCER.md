# 02. 단위 테스트 - Producer

## 대상 클래스

- `producer/KafkaMessageProducer.java`
- `producer/SendResult.java`

> Mock 대상: `KafkaTemplate`, `CaravanProperties`, `KafkaErrorRepository`

---

## 사전 조건 (공통)

```
Mock:
  - KafkaTemplate<String, String> kafkaTemplate
  - CaravanProperties properties (producer.timeoutSeconds = 10)
  - KafkaErrorRepository errorRepository
```

---

## 동기 전송

### TC-PROD-001: 동기 전송 성공 - 간단 API

| 항목 | 내용 |
|------|------|
| **메서드** | `send("MMPPMERPTT01", "PQR02012", "PQR02012\|P\|S")` |
| **Mock 설정** | `kafkaTemplate.send()` → 성공 Future (RecordMetadata: partition=0, offset=10) |
| **검증** | 반환값 `success=true`, `partition=0`, `offset=10` |
| **검증** | `kafkaTemplate.send()` 호출 1회, 첫 번째 인자 = `"MMPPMERPTT01"` |

### TC-PROD-002: 동기 전송 성공 - KafkaMessage API

| 항목 | 내용 |
|------|------|
| **메서드** | `send("MMPPMERPTT01", KafkaMessage.builder().transactionCode("PQR02012").interfaceMsg("A\|B").build())` |
| **Mock 설정** | `kafkaTemplate.send()` → 성공 Future |
| **검증** | 반환값 `success=true` |
| **검증** | 전송된 JSON에 5개 필드 포함 (TRANSACTION_CODE, KAFKA_KEYDATA, INTERFACE_ID, INTERFACE_MSG, INTERFACE_PROTOCOL) |

### TC-PROD-003: 동기 전송 성공 - 표준 메시지 포맷 검증

| 항목 | 내용 |
|------|------|
| **메서드** | `send("MMPPMERPTT01", "PQR02012", "A\|B\|C")` |
| **Mock 설정** | `kafkaTemplate.send()` ArgumentCaptor로 JSON 캡처 |
| **검증 - JSON 파싱** | |
| | `TRANSACTION_CODE` == `"PQR02012"` |
| | `INTERFACE_ID` == `"MMPPMERPTT01"` (토픽명과 동일) |
| | `INTERFACE_MSG` == `"A\|B\|C"` |
| | `INTERFACE_PROTOCOL` == `"IF_KAFKA"` |
| | `KAFKA_KEYDATA` != null, UUID 형식 (36자, 하이픈 4개) |

### TC-PROD-004: 동기 전송 실패 - 타임아웃

| 항목 | 내용 |
|------|------|
| **메서드** | `send("MMPPMERPTT01", "PQR02012", "msg")` |
| **Mock 설정** | `future.get()` → `TimeoutException` |
| **검증** | 반환값 `success=false`, `errorMessage`에 타임아웃 관련 문자열 포함 |
| **검증** | `errorRepository.logSendError()` 호출 1회 |

### TC-PROD-005: 동기 전송 실패 - 브로커 오류

| 항목 | 내용 |
|------|------|
| **메서드** | `send("MMPPMERPTT01", "PQR02012", "msg")` |
| **Mock 설정** | `future.get()` → `ExecutionException` |
| **검증** | 반환값 `success=false` |
| **검증** | `errorRepository.logSendError()` 호출 1회 |

### TC-PROD-006: 동기 전송 실패 - 에러 로그 DB 기록도 실패

| 항목 | 내용 |
|------|------|
| **메서드** | `send("MMPPMERPTT01", "PQR02012", "msg")` |
| **Mock 설정** | `future.get()` → `ExecutionException`, `errorRepository.logSendError()` → 예외 |
| **검증** | 반환값 `success=false` (예외 전파 안 됨) |
| **검증** | 로그에 "에러 로그 저장 실패" 출력 |

---

## 비동기 전송

### TC-PROD-007: 비동기 전송 성공

| 항목 | 내용 |
|------|------|
| **메서드** | `sendAsync("MMPPMERPTT01", "PQR02012", "msg", callback)` |
| **Mock 설정** | `kafkaTemplate.send()` → 성공 콜백 트리거 |
| **검증** | `callback.onSuccess()` 호출 1회 |
| **검증** | SendResult 파라미터 `success=true` |

### TC-PROD-008: 비동기 전송 실패

| 항목 | 내용 |
|------|------|
| **메서드** | `sendAsync("MMPPMERPTT01", "PQR02012", "msg", callback)` |
| **Mock 설정** | `kafkaTemplate.send()` → 실패 콜백 트리거 |
| **검증** | `callback.onFailure()` 호출 1회, `KafkaSendException` 파라미터 |
| **검증** | `errorRepository.logSendError()` 호출 1회 |

---

## SendResult 팩토리

### TC-PROD-009: SendResult.success()

| 항목 | 내용 |
|------|------|
| **입력** | `RecordMetadata(topic="T", partition=0, offset=42, timestamp=123456)` |
| **기대 결과** | `success=true`, `topic="T"`, `partition=0`, `offset=42` |

### TC-PROD-010: SendResult.fail()

| 항목 | 내용 |
|------|------|
| **입력** | `"Connection refused"` |
| **기대 결과** | `success=false`, `errorMessage="Connection refused"` |

---

## KAFKA_KEYDATA UUID 유일성

### TC-PROD-011: 연속 전송 시 UUID 중복 없음

| 항목 | 내용 |
|------|------|
| **메서드** | `send()` 10회 연속 호출 |
| **Mock 설정** | `kafkaTemplate.send()` ArgumentCaptor로 JSON 캡처 |
| **검증** | 10개의 KAFKA_KEYDATA 값이 모두 다름 (Set에 넣어서 size == 10) |
