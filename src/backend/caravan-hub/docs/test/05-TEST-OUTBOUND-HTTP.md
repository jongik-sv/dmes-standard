# TEST - OUTBOUND HTTP

## 대상 클래스

- `BusinessStart` (SeraiConsumeHandler)
- `OutboundRouter`
- `HttpOutboundHandler`

---

## TC-OHTTP-001: 정상 HTTP POST 전송

### 목적
Kafka 메시지를 수신하여 외부 시스템에 HTTP POST로 정상 전송되는지 확인한다.

### 사전 조건
- `TB_MCM_MOM_KAFKA_SERAI_CONFIG`에 OUTBOUND HTTP 설정 등록
  - DIRECTION='OUTBOUND', INTEGRATION_TYPE='HTTP', USE_YN='Y'
  - HTTP_URL='http://target-system/api/receive'
  - HTTP_METHOD='POST'
- 대상 시스템 HTTP 서버 가동 (200 응답)
- Kafka 토픽에 메시지 전송

### 예상 결과
- 대상 시스템에 HTTP POST 요청 도착
- Content-Type: application/json; charset=UTF-8
- 원본 Kafka 메시지 전체가 JSON Body로 전송

### 전송되는 JSON
```json
{
  "TRANSACTION_CODE": "SeraiConsumeHandler",
  "KAFKA_KEYDATA": "uuid-1234",
  "INTERFACE_ID": "MMPPMMCMTT01",
  "INTERFACE_MSG": "PQR02012|P|S|5A|20260130|...",
  "INTERFACE_PROTOCOL": "IF_KAFKA"
}
```

### 검증 항목
- [ ] 대상 시스템에 요청 수신 확인
- [ ] Content-Type = "application/json; charset=UTF-8"
- [ ] JSON Body에 모든 Kafka 원본 메시지 필드 포함
- [ ] HandleResult.success() 반환
- [ ] 로그: "HTTP 전송 완료 - ResponseCode: 200"

---

## TC-OHTTP-002: HTTP_METHOD 기본값 (POST)

### 목적
HTTP_METHOD가 설정되지 않았을 때 기본값 POST가 사용되는지 확인한다.

### 사전 조건
- SERAI_CONFIG에 HTTP_METHOD가 NULL인 설정

### 검증 항목
- [ ] HTTP POST로 전송
- [ ] 정상 처리

---

## TC-OHTTP-003: HTTP_URL 미설정

### 목적
OUTBOUND 설정에 HTTP_URL이 없을 때 에러가 발생하는지 확인한다.

### 사전 조건
- SERAI_CONFIG에 HTTP_URL이 NULL인 OUTBOUND HTTP 설정

### 예상 결과
- IllegalStateException: "HTTP_URL 설정이 없습니다"
- HandleResult.failRetryable() 반환

### 검증 항목
- [ ] 에러 로그 확인
- [ ] 재시도 → 최종 실패 → 컨테이너 일시정지

---

## TC-OHTTP-004: 대상 시스템 4xx 응답

### 목적
대상 시스템이 4xx 에러를 반환할 때 처리되는지 확인한다.

### 사전 조건
- 대상 시스템이 400 Bad Request 반환하도록 설정

### 예상 결과
- IllegalStateException: "HTTP 전송 실패 - ResponseCode: 400"
- HandleResult.failRetryable() 반환
- 재시도

### 검증 항목
- [ ] WARN 로그 "HTTP 에러 응답 (400): ..."
- [ ] 재시도 동작
- [ ] 에러 응답 본문이 로그에 기록

---

## TC-OHTTP-005: 대상 시스템 5xx 응답

### 목적
대상 시스템이 5xx 에러를 반환할 때 처리되는지 확인한다.

### 사전 조건
- 대상 시스템이 500 Internal Server Error 반환

### 예상 결과
- IllegalStateException: "HTTP 전송 실패 - ResponseCode: 500"
- 재시도 → 서버 복구 시 성공

### 검증 항목
- [ ] 재시도 동작 확인
- [ ] 재시도 중 서버 복구 시 정상 처리

---

## TC-OHTTP-006: 대상 시스템 연결 타임아웃

### 목적
대상 시스템에 연결할 수 없을 때(connect timeout) 에러 처리를 확인한다.

### 사전 조건
- HTTP_URL이 응답하지 않는 주소 (방화벽 차단 등)
- `serai.outbound.http.connect-timeout: 10000` (10초)

### 예상 결과
- 10초 후 연결 타임아웃
- IllegalStateException → 재시도

### 검증 항목
- [ ] 약 10초 후 타임아웃 발생
- [ ] 에러 로그 기록
- [ ] 재시도 동작

---

## TC-OHTTP-007: 대상 시스템 읽기 타임아웃

### 목적
대상 시스템이 연결은 되지만 응답이 지연될 때(read timeout) 에러 처리를 확인한다.

### 사전 조건
- 대상 시스템이 연결 후 응답을 보내지 않음 (hang)
- `serai.outbound.http.read-timeout: 30000` (30초)

### 예상 결과
- 30초 후 읽기 타임아웃
- IllegalStateException → 재시도

### 검증 항목
- [ ] 약 30초 후 타임아웃 발생
- [ ] 에러 로그 기록
- [ ] 재시도 동작

---

## TC-OHTTP-008: 대상 시스템 2xx 범위 응답 (201, 204 등)

### 목적
200 이외의 2xx 응답(201 Created, 204 No Content 등)도 성공으로 처리되는지 확인한다.

### 사전 조건
- 대상 시스템이 201 Created 반환

### 예상 결과
- 성공 처리 (200~299 범위는 모두 성공)

### 검증 항목
- [ ] HandleResult.success() 반환
- [ ] 로그: "HTTP 전송 완료 - ResponseCode: 201"

---

## TC-OHTTP-009: 타임아웃 설정 변경

### 목적
application.yml의 타임아웃 설정이 HttpOutboundHandler에 정상 반영되는지 확인한다.

### 사전 조건
```yaml
serai:
  outbound:
    http:
      connect-timeout: 5000
      read-timeout: 10000
```

### 검증 항목
- [ ] 연결 타임아웃이 5초로 적용
- [ ] 읽기 타임아웃이 10초로 적용
- [ ] 기본값(10000/30000)과 다르게 동작

---

## TC-OHTTP-010: 대형 메시지 HTTP 전송

### 목적
INTERFACE_MSG가 대용량(예: 1MB)일 때 HTTP 전송이 정상 동작하는지 확인한다.

### 사전 조건
- Kafka 메시지의 INTERFACE_MSG가 1MB 이상

### 검증 항목
- [ ] HTTP 전송 성공 여부
- [ ] 대상 시스템의 요청 크기 제한 관련 에러 처리 확인
