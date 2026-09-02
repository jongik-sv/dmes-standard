# TEST - OUTBOUND DB

## 대상 클래스

- `BusinessStart` (SeraiConsumeHandler)
- `OutboundRouter`
- `DbOutboundHandler`
- `InterfaceMapper` (insertOutboundData)

---

## TC-ODB-001: 정상 DB INSERT

### 목적
Kafka 메시지를 수신하여 IF_* 테이블에 정상적으로 INSERT되는지 확인한다.

### 사전 조건
- `TB_MCM_MOM_KAFKA_SERAI_CONFIG`에 OUTBOUND DB 설정 등록
  - DIRECTION='OUTBOUND', INTEGRATION_TYPE='DB', USE_YN='Y'
  - DB_SCHEMA='IFUSER', DB_TABLE_NAME='IF_MMPPMMCMTT01'
- Kafka 토픽에 메시지 전송
  ```json
  {
    "TRANSACTION_CODE": "SeraiConsumeHandler",
    "KAFKA_KEYDATA": "uuid-1234",
    "INTERFACE_ID": "MMPPMMCMTT01",
    "INTERFACE_MSG": "PQR02012|P|S|5A|20260130|...",
    "INTERFACE_PROTOCOL": "IF_KAFKA"
  }
  ```

### 예상 결과
- `IFUSER.IF_MMPPMMCMTT01` 테이블에 1건 INSERT

| 컬럼 | 예상 값 |
|------|---------|
| TRANSACTION_CODE | SeraiConsumeHandler |
| INTERFACE_ID | MMPPMMCMTT01 |
| INTERFACE_MSG | PQR02012\|P\|S\|5A\|20260130\|... |
| IF_FLAG | N |
| CREATED_OBJECT_TYPE | S |
| CREATED_OBJECT_ID | SERAI |
| CREATED_PROGRAM_ID | DbOutboundHandler |

### 검증 항목
- [ ] IF_* 테이블에 1건 INSERT 확인
- [ ] 모든 컬럼 값 정확히 매핑
- [ ] IF_FLAG = 'N' (미처리 상태)
- [ ] CREATION_TIMESTAMP 정상 기록
- [ ] 로그: "DB INSERT 완료"
- [ ] HandleResult.success() 반환

---

## TC-ODB-002: DB_TABLE_NAME 미설정

### 목적
OUTBOUND 설정에 DB_TABLE_NAME이 없을 때 에러가 발생하는지 확인한다.

### 사전 조건
- SERAI_CONFIG에 DB_TABLE_NAME이 NULL인 OUTBOUND 설정

### 예상 결과
- IllegalStateException: "DB_TABLE_NAME 설정이 없습니다"
- HandleResult.failRetryable() 반환
- 재시도 후 컨테이너 일시정지

### 검증 항목
- [ ] ERROR 로그 "SeraiConsumeHandler 오류"
- [ ] 재시도 동작 확인 (max-attempts만큼)
- [ ] 최종 실패 시 컨테이너 PAUSED 상태

---

## TC-ODB-003: 유효하지 않은 테이블명 (SQL Injection 방지)

### 목적
테이블명이 정규식 패턴(`^[A-Za-z_][A-Za-z0-9_]*$`)에 맞지 않을 때 거부되는지 확인한다.

### 테스트 케이스

| # | DB_TABLE_NAME | 예상 결과 |
|---|---------------|-----------|
| a | `IF_VALID_TABLE` | 통과 |
| b | `IF TABLE` (공백 포함) | 거부 |
| c | `IF_TABLE; DROP TABLE` | 거부 |
| d | `123_TABLE` (숫자 시작) | 거부 |
| e | `_UNDERSCORE_START` | 통과 |

### 검증 항목
- [ ] 유효하지 않은 테이블명 → IllegalStateException
- [ ] SQL Injection 문자열 차단

---

## TC-ODB-004: OUTBOUND 설정 미존재

### 목적
토픽 ID에 대한 OUTBOUND 설정이 없을 때 에러가 발생하는지 확인한다.

### 사전 조건
- SERAI_CONFIG에 해당 토픽의 OUTBOUND 설정 없음

### 예상 결과
- OutboundRouter에서 IllegalStateException: "OUTBOUND 설정 없음"
- HandleResult.failRetryable() 반환

### 검증 항목
- [ ] ERROR 로그 "OUTBOUND 설정 없음 - Topic: {topicId}"
- [ ] 재시도 → 최종 실패 → 컨테이너 일시정지

---

## TC-ODB-005: 재시도 동작 확인

### 목적
OUTBOUND 처리 실패 시 Caravan의 재시도 메커니즘이 동작하는지 확인한다.

### 사전 조건
- DB 연결 일시적 실패 (예: 커넥션 풀 고갈)
- `caravan.kafka.retry.max-attempts: 3`
- `caravan.kafka.retry.delay-ms: 2000`

### 예상 결과
- 최대 3회 재시도 (2초 간격)
- 재시도 중 DB 복구되면 성공 처리
- 모든 재시도 실패 시 컨테이너 일시정지

### 검증 항목
- [ ] 재시도 횟수 확인 (로그 카운트)
- [ ] 재시도 간격 약 2초
- [ ] 중간 복구 시 성공 처리

---

## TC-ODB-006: 컨테이너 일시정지 후 복구

### 목적
OUTBOUND 처리 모든 재시도 실패 후 컨테이너 일시정지 → resume 복구 절차를 확인한다.

### 절차
1. DB 장애 유발 → OUTBOUND 실패 → 재시도 소진 → 컨테이너 일시정지
2. `GET /kafkaApi/status?topicId={topicId}` → status=PAUSED 확인
3. DB 장애 복구
4. `POST /kafkaApi/resume {"topicId": "..."}` 호출
5. 동일 메시지 재처리 확인

### 검증 항목
- [ ] status API에서 PAUSED 상태 확인
- [ ] resume 후 정상 메시지 처리 재개
- [ ] 실패했던 메시지도 재처리

---

## TC-ODB-007: 메시지 스킵

### 목적
처리 불가능한 메시지를 스킵하고 다음 메시지로 넘어가는 절차를 확인한다.

### 절차
1. 처리 불가 메시지로 인해 컨테이너 일시정지
2. `POST /kafkaApi/skipOffset {"topicId": "...", "groupId": "...", "count": 1}` 호출
3. `POST /kafkaApi/resume {"topicId": "..."}` 호출

### 검증 항목
- [ ] 해당 offset의 메시지 건너뜀
- [ ] 다음 메시지부터 정상 처리
