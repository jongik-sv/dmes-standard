# TEST - INBOUND HTTP

## 대상 클래스

- `HttpIntegrationController`
- `IntegrationRequest` / `IntegrationResponse`

## 엔드포인트

```
POST /seraiApi/v1/send
Content-Type: application/json
```

---

## TC-HTTP-001: 정상 전송

### 목적
필수 파라미터가 모두 포함된 정상 요청이 Kafka로 전송되고 성공 응답을 반환하는지 확인한다.

### 사전 조건
- Kafka 브로커 정상 가동
- Caravan KafkaMessageProducer 정상 동작

### 요청
```json
{
  "INTERFACE_ID": "MMPPMMCMTT01",
  "TRANSACTION_CODE": "SeraiConsumeHandler",
  "INTERFACE_MSG": "PQR02012|P|S|5A|20260130|JCM_TEST|MMPPMMCMTT01|||||20250808|00011|C|"
}
```

### 예상 응답
- HTTP Status: `200 OK`
```json
{
  "resultCode": "SUCCESS",
  "KAFKA_KEYDATA": "MMPPMMCMTT01",
  "INTERFACE_ID": "MMPPMMCMTT01",
  "timestamp": "2026-02-06T10:30:00"
}
```

### 검증 항목
- [ ] HTTP 200 반환
- [ ] resultCode = "SUCCESS"
- [ ] KAFKA_KEYDATA, INTERFACE_ID 값 존재
- [ ] timestamp ISO 8601 형식
- [ ] Kafka 토픽 `MMPPMMCMTT01`에 메시지 도착 확인

---

## TC-HTTP-002: INTERFACE_ID 누락

### 목적
필수 파라미터 INTERFACE_ID가 누락되었을 때 400 에러를 반환하는지 확인한다.

### 요청
```json
{
  "TRANSACTION_CODE": "SeraiConsumeHandler",
  "INTERFACE_MSG": "PQR02012|P|S|5A|20260130|..."
}
```

### 예상 응답
- HTTP Status: `400 Bad Request`
```json
{
  "resultCode": "ERROR",
  "errorCode": "INVALID_PARAMETER",
  "errorMessage": "INTERFACE_ID는 필수입니다.",
  "timestamp": "2026-02-06T10:30:00"
}
```

### 검증 항목
- [ ] HTTP 400 반환
- [ ] errorCode = "INVALID_PARAMETER"
- [ ] errorMessage에 "INTERFACE_ID" 포함
- [ ] Kafka로 메시지가 전송되지 않음

---

## TC-HTTP-003: TRANSACTION_CODE 누락

### 목적
필수 파라미터 TRANSACTION_CODE가 누락되었을 때 400 에러를 반환하는지 확인한다.

### 요청
```json
{
  "INTERFACE_ID": "MMPPMMCMTT01",
  "INTERFACE_MSG": "PQR02012|P|S|5A|20260130|..."
}
```

### 예상 응답
- HTTP Status: `400 Bad Request`
```json
{
  "resultCode": "ERROR",
  "errorCode": "INVALID_PARAMETER",
  "errorMessage": "TRANSACTION_CODE는 필수입니다.",
  "timestamp": "2026-02-06T10:30:00"
}
```

### 검증 항목
- [ ] HTTP 400 반환
- [ ] errorMessage에 "TRANSACTION_CODE" 포함

---

## TC-HTTP-004: INTERFACE_MSG 누락

### 목적
필수 파라미터 INTERFACE_MSG가 누락되었을 때 400 에러를 반환하는지 확인한다.

### 요청
```json
{
  "INTERFACE_ID": "MMPPMMCMTT01",
  "TRANSACTION_CODE": "SeraiConsumeHandler"
}
```

### 예상 응답
- HTTP Status: `400 Bad Request`
```json
{
  "resultCode": "ERROR",
  "errorCode": "INVALID_PARAMETER",
  "errorMessage": "INTERFACE_MSG는 필수입니다.",
  "timestamp": "2026-02-06T10:30:00"
}
```

### 검증 항목
- [ ] HTTP 400 반환
- [ ] errorMessage에 "INTERFACE_MSG" 포함

---

## TC-HTTP-005: 빈 문자열 파라미터

### 목적
파라미터 값이 빈 문자열("")이거나 공백만 포함된 경우 400 에러를 반환하는지 확인한다.

### 요청
```json
{
  "INTERFACE_ID": "",
  "TRANSACTION_CODE": "  ",
  "INTERFACE_MSG": "PQR02012|P|S|5A|20260130|..."
}
```

### 예상 응답
- HTTP Status: `400 Bad Request`

### 검증 항목
- [ ] HTTP 400 반환
- [ ] 첫 번째 검증 실패 파라미터에 대한 에러 메시지 반환
- [ ] trim() 후 빈 문자열도 검증에 걸리는지 확인

---

## TC-HTTP-006: Kafka 브로커 장애 시 시스템 에러

### 목적
Kafka 브로커가 다운되었을 때 500 에러를 반환하는지 확인한다.

### 사전 조건
- Kafka 브로커 중지 또는 연결 불가 상태

### 요청
```json
{
  "INTERFACE_ID": "MMPPMMCMTT01",
  "TRANSACTION_CODE": "SeraiConsumeHandler",
  "INTERFACE_MSG": "PQR02012|P|S|5A|20260130|..."
}
```

### 예상 응답
- HTTP Status: `500 Internal Server Error`
```json
{
  "resultCode": "ERROR",
  "errorCode": "SYSTEM_ERROR",
  "errorMessage": "...(Kafka 관련 에러 메시지)...",
  "timestamp": "2026-02-06T10:30:00"
}
```

### 검증 항목
- [ ] HTTP 500 반환
- [ ] errorCode = "SYSTEM_ERROR"
- [ ] 로그에 에러 스택 트레이스 기록

---

## TC-HTTP-007: 빈 JSON Body

### 목적
요청 본문이 빈 JSON 객체일 때 400 에러를 반환하는지 확인한다.

### 요청
```json
{}
```

### 예상 응답
- HTTP Status: `400 Bad Request`

### 검증 항목
- [ ] HTTP 400 반환
- [ ] 첫 번째 필수 파라미터(INTERFACE_ID)에 대한 에러 메시지

---

## TC-HTTP-008: 대용량 INTERFACE_MSG

### 목적
INTERFACE_MSG가 대용량(예: 1MB)일 때 정상 처리되는지 확인한다.

### 사전 조건
- 대용량 파이프 구분 문자열 준비 (1MB 이상)

### 요청
```json
{
  "INTERFACE_ID": "MMPPMMCMTT01",
  "TRANSACTION_CODE": "SeraiConsumeHandler",
  "INTERFACE_MSG": "(1MB 이상의 파이프 구분 문자열)"
}
```

### 검증 항목
- [ ] 정상 전송 여부 확인
- [ ] Kafka 메시지 크기 제한(`max.message.bytes`) 초과 시 에러 처리 확인
- [ ] 에러 발생 시 500 응답 + 적절한 에러 메시지

---

## TC-HTTP-009: 동시 다건 전송

### 목적
여러 클라이언트가 동시에 전송할 때 모든 요청이 정상 처리되는지 확인한다.

### 방법
- 10개 스레드에서 동시에 POST /seraiApi/v1/send 호출
- 각각 다른 INTERFACE_MSG

### 검증 항목
- [ ] 모든 요청이 200 응답
- [ ] 모든 메시지가 Kafka에 도착
- [ ] 메시지 유실 없음

---

## TC-HTTP-010: 잘못된 Content-Type

### 목적
Content-Type이 application/json이 아닌 경우 에러를 반환하는지 확인한다.

### 요청
```
POST /seraiApi/v1/send
Content-Type: text/plain

{"INTERFACE_ID": "MMPPMMCMTT01", ...}
```

### 검증 항목
- [ ] HTTP 415 (Unsupported Media Type) 또는 400 반환
