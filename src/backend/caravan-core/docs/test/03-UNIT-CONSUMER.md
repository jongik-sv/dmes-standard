# 03. 단위 테스트 - Consumer

## 대상 클래스

- `consumer/KafkaMessageConsumer.java`

> Mock 대상: `KafkaInterfaceHandlerRegistry`, `ContainerController`, `KafkaErrorRepository`, `CaravanProperties`
> Mock 대상 (Kafka): `ConsumerRecord`, `Consumer`, `Acknowledgment`

---

## 사전 조건 (공통)

```
Mock:
  - KafkaInterfaceHandlerRegistry handlerRegistry
  - ContainerController containerController
  - KafkaErrorRepository errorRepository
  - CaravanProperties properties
    └── bizSystem = "DMES"
    └── retry.maxAttempts = 3
    └── retry.delayMs = 0  (테스트 속도를 위해 0으로 설정)

  - ConsumerRecord<String, String> record
  - Consumer<?, ?> consumer
  - Acknowledgment ack
```

표준 메시지 JSON (공통 입력):
```json
{
  "TRANSACTION_CODE": "PQR02012",
  "KAFKA_KEYDATA": "uuid-value",
  "INTERFACE_ID": "MMPPMERPTT01",
  "INTERFACE_MSG": "PQR02012|P|S|5A",
  "INTERFACE_PROTOCOL": "IF_KAFKA"
}
```

---

## 정상 처리

### TC-CONS-001: 핸들러 성공 - offset 커밋

| 항목 | 내용 |
|------|------|
| **입력** | 표준 메시지 JSON |
| **Mock 설정** | `handlerRegistry.getHandler("PQR02012")` → Mock 핸들러, `handler.businessHandle()` → `HandleResult.success()` |
| **검증** | `ack.acknowledge()` 호출 1회 |
| **검증** | `errorRepository` 호출 없음 |

### TC-CONS-002: 핸들러에 전달되는 KafkaMessageContext 검증

| 항목 | 내용 |
|------|------|
| **입력** | 표준 메시지 JSON, `record.topic()="MMPPMERPTT01"`, `record.partition()=0`, `record.offset()=42` |
| **Mock 설정** | `handler.businessHandle()` ArgumentCaptor |
| **검증 - context** | |
| | `transactionCode` == `"PQR02012"` |
| | `interfaceId` == `"MMPPMERPTT01"` |
| | `interfaceMsg` == `"PQR02012\|P\|S\|5A"` |
| | `interfaceProtocol` == `"IF_KAFKA"` |
| | `kafkaKeyData` == `"uuid-value"` |
| | `topic` == `"MMPPMERPTT01"` |
| | `partition` == 0 |
| | `offset` == 42 |
| | `rawMessage` == 원본 JSON 문자열 |
| | `rawMessageMap` != null, size == 5 |

---

## 파싱 실패

### TC-CONS-003: 잘못된 JSON - 파싱 실패 후 스킵

| 항목 | 내용 |
|------|------|
| **입력** | `record.value() = "invalid-json"` |
| **검증** | `ack.acknowledge()` 호출 1회 (메시지 스킵) |
| **검증** | `handlerRegistry.getHandler()` 호출 없음 (핸들러 조회까지 안 감) |

### TC-CONS-004: null TRANSACTION_CODE

| 항목 | 내용 |
|------|------|
| **입력** | `{"INTERFACE_MSG":"A\|B"}` (TRANSACTION_CODE 없음) |
| **Mock 설정** | `handlerRegistry.getHandler(null)` → DefaultHandler |
| **검증** | DefaultHandler가 실행됨 |
| **검증** | `ack.acknowledge()` 호출 1회 |

---

## 재시도 로직

### TC-CONS-005: 재시도 가능 실패 → 2회차에 성공

| 항목 | 내용 |
|------|------|
| **입력** | 표준 메시지 JSON |
| **Mock 설정** | `handler.businessHandle()` 1회차 → `failRetryable("ERR", "임시 오류")`, 2회차 → `success()` |
| **검증** | `handler.businessHandle()` 호출 2회 |
| **검증** | `ack.acknowledge()` 호출 1회 |
| **검증** | context.attemptCount: 1회차=1, 2회차=2 |

### TC-CONS-006: 재시도 가능 실패 → 3회 모두 실패 → 최대 재시도 초과

| 항목 | 내용 |
|------|------|
| **입력** | 표준 메시지 JSON, `maxAttempts = 3` |
| **Mock 설정** | `handler.businessHandle()` 3회 모두 → `failRetryable("ERR", "지속 오류")` |
| **검증** | `handler.businessHandle()` 호출 3회 |
| **검증** | `errorRepository.logConsumeError()` 호출 1회 |
| **검증** | `containerController.pause("listener-MMPPMERPTT01")` 호출 1회 |
| **검증** | `consumer.seek(TopicPartition, offset)` 호출 1회 (offset 롤백) |
| **검증** | `ack.acknowledge()` 호출 **없음** |

### TC-CONS-007: 재시도 불가 실패 → 에러 기록 후 스킵

| 항목 | 내용 |
|------|------|
| **입력** | 표준 메시지 JSON |
| **Mock 설정** | `handler.businessHandle()` → `fail("INVALID", "검증 오류")` |
| **검증** | `handler.businessHandle()` 호출 1회 (재시도 안 함) |
| **검증** | `errorRepository.logConsumeError()` 호출 1회 |
| **검증** | `ack.acknowledge()` 호출 1회 (스킵) |

### TC-CONS-008: maxAttempts=1 설정 시 재시도 없이 바로 초과 처리

| 항목 | 내용 |
|------|------|
| **입력** | 표준 메시지 JSON, `maxAttempts = 1` |
| **Mock 설정** | `handler.businessHandle()` → `failRetryable("ERR", "오류")` |
| **검증** | `handler.businessHandle()` 호출 1회 |
| **검증** | `containerController.pause()` 호출 1회 |

### TC-CONS-008-1: failRetryableSkip → 2회차에 성공

| 항목 | 내용 |
|------|------|
| **입력** | 표준 메시지 JSON, `maxAttempts = 3` |
| **Mock 설정** | `handler.businessHandle()` 1회차 → `failRetryableSkip("ERR", "임시 오류")`, 2회차 → `success()` |
| **검증** | `handler.businessHandle()` 호출 2회 |
| **검증** | `ack.acknowledge()` 호출 1회 |
| **검증** | `containerController.pause()` 호출 **없음** |

### TC-CONS-008-2: failRetryableSkip → 3회 모두 실패 → 에러 기록 후 스킵 (컨테이너 유지)

| 항목 | 내용 |
|------|------|
| **입력** | 표준 메시지 JSON, `maxAttempts = 3` |
| **Mock 설정** | `handler.businessHandle()` 3회 모두 → `failRetryableSkip("API_ERR", "외부 API 장애")` |
| **검증** | `handler.businessHandle()` 호출 3회 |
| **검증** | `errorRepository.logConsumeError()` 호출 1회 |
| **검증** | `ack.acknowledge()` 호출 1회 (메시지 스킵) |
| **검증** | `containerController.pause()` 호출 **없음** (컨테이너 RUNNING 유지) |
| **검증** | `consumer.seek()` 호출 **없음** (offset 롤백 안 함) |

### TC-CONS-008-3: failRetryableSkip과 failRetryable 혼용 → 마지막 결과 기준

| 항목 | 내용 |
|------|------|
| **입력** | 표준 메시지 JSON, `maxAttempts = 3` |
| **Mock 설정** | 1회차 → `failRetryableSkip(...)`, 2회차 → `failRetryable(...)`, 3회차 → `failRetryable(...)` |
| **검증** | 마지막 결과가 `failRetryable` → `containerController.pause()` 호출 1회 |
| **의미** | `skipOnMaxRetry`는 마지막 시도의 HandleResult 기준으로 판단됨 |

---

## SERAI 시스템 라우팅

### TC-CONS-009: bizSystem="serai_prod" → SeraiConsumeHandler 라우팅

| 항목 | 내용 |
|------|------|
| **입력** | 표준 메시지 JSON (TRANSACTION_CODE="PQR02012"), `properties.bizSystem = "serai_prod"` |
| **Mock 설정** | `handlerRegistry.getHandler("SeraiConsumeHandler")` → seraiHandler |
| **검증** | `handlerRegistry.getHandler("SeraiConsumeHandler")` 호출 1회 |
| **검증** | `handlerRegistry.getHandler("PQR02012")` 호출 **없음** |
| **검증** | seraiHandler.businessHandle() 호출 1회 |

### TC-CONS-010: bizSystem="SERAI_DEV" → SeraiConsumeHandler 라우팅 (대소문자 무관)

| 항목 | 내용 |
|------|------|
| **입력** | `properties.bizSystem = "SERAI_DEV"` |
| **검증** | `handlerRegistry.getHandler("SeraiConsumeHandler")` 호출 1회 |

### TC-CONS-011: bizSystem="DMES" → TRANSACTION_CODE 기반 라우팅

| 항목 | 내용 |
|------|------|
| **입력** | 표준 메시지 JSON (TRANSACTION_CODE="PQR02012"), `properties.bizSystem = "DMES"` |
| **검증** | `handlerRegistry.getHandler("PQR02012")` 호출 1회 |
| **검증** | `handlerRegistry.getHandler("SeraiConsumeHandler")` 호출 **없음** |

### TC-CONS-012: bizSystem="serai_prod" + SeraiConsumeHandler 미등록 → DefaultHandler

| 항목 | 내용 |
|------|------|
| **입력** | `properties.bizSystem = "serai_prod"` |
| **Mock 설정** | `handlerRegistry.getHandler("SeraiConsumeHandler")` → DefaultKafkaInterfaceHandler |
| **검증** | DefaultHandler 실행, `ack.acknowledge()` 호출 1회 |

---

## 에러 저장 실패

### TC-CONS-013: 에러 로그 DB 기록 자체가 실패해도 정상 진행

| 항목 | 내용 |
|------|------|
| **입력** | 표준 메시지 JSON |
| **Mock 설정** | `handler.businessHandle()` → `fail("ERR", "오류")`, `errorRepository.logConsumeError()` → 예외 |
| **검증** | 예외 전파 안 됨, `ack.acknowledge()` 호출 1회 |
