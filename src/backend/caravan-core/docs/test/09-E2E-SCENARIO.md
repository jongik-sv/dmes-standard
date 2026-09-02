# 09. End-to-End 시나리오 테스트

## 개요

실제 운영 환경을 시뮬레이션하는 시나리오 기반 테스트이다.
각 시나리오는 메시지 전송부터 핸들러 실행, 에러 처리, REST API 제어까지의 전체 흐름을 검증한다.

---

## 시나리오 1: 정상 메시지 처리 (일반 시스템)

### TC-E2E-001: 전송 → 수신 → 핸들러 → 성공

```
조건:
  - biz-system: DMES
  - 핸들러: @Component("PQR02012") 등록됨
  - retry.max-attempts: 3

단계:
  1. producer.send("MMPPMERPTT01", "PQR02012", "PQR02012|P|S|5A|20260130")
     → SendResult: success=true, offset=0

  2. Consumer가 MMPPMERPTT01 토픽에서 메시지 수신

  3. TRANSACTION_CODE="PQR02012" 추출

  4. handlerRegistry.getHandler("PQR02012") → PQR02012 핸들러

  5. handler.businessHandle(context) → HandleResult.success()

  6. ack.acknowledge() → offset 커밋

검증:
  - GET /kafkaApi/status?topicId=MMPPMERPTT01
    → CONTAINER_STATUS: "RUNNING"
    → CURRENT_OFFSET: 1
    → MAX_OFFSET: 1
  - TB_MCM_MOM_TC_ERROR에 레코드 없음
```

---

## 시나리오 2: 재시도 후 성공

### TC-E2E-002: 전송 → 수신 → 1회 실패 → 재시도 → 성공

```
조건:
  - 핸들러: 1회차 failRetryable, 2회차 success
  - retry.max-attempts: 3, delay-ms: 1000

단계:
  1. 메시지 전송

  2. Consumer 수신 → 핸들러 1회차 실행
     → HandleResult.failRetryable("TEMP", "일시 오류")

  3. 1초 대기 (delay-ms)

  4. 핸들러 2회차 실행 (attemptCount=2)
     → HandleResult.success()

  5. ack.acknowledge()

검증:
  - 핸들러 2회 호출
  - TB_MCM_MOM_TC_ERROR에 레코드 없음 (최종 성공이므로)
  - CURRENT_OFFSET 증가
```

---

## 시나리오 3: 최대 재시도 초과 → 컨테이너 일시정지

### TC-E2E-003: 전송 → 수신 → 3회 실패 → PAUSED → 수동 복구

```
조건:
  - 핸들러: 항상 failRetryable 반환
  - retry.max-attempts: 3

단계:
  1. 메시지 전송 (offset=5)

  2. Consumer 수신 → 핸들러 3회 실패

  3. handleMaxRetryExceeded():
     - TB_MCM_MOM_TC_ERROR에 에러 기록
     - 컨테이너 PAUSED
     - offset 롤백 (seek to 5)

  4. GET /kafkaApi/status
     → CONTAINER_STATUS: "PAUSED", CURRENT_OFFSET: 5

  5-A. 복구 옵션 A - 문제 해결 후 재개:
     POST /kafkaApi/resume {"topicId":"MMPPMERPTT01"}
     → 같은 메시지(offset=5) 재처리

  5-B. 복구 옵션 B - 메시지 스킵:
     POST /kafkaApi/skipOffset {"topicId":"MMPPMERPTT01","groupId":"G1","count":1}
     → CURRENT_OFFSET: 6으로 이동
     → 다음 메시지부터 처리

검증:
  - TB_MCM_MOM_TC_ERROR 레코드 1건
    - ERROR_TYPE: 'R'
    - ERROR_CODE: 'MAX_RETRY_EXCEEDED'
    - ERROR_STATUS_CODE: 'N'
  - 복구 후 CONTAINER_STATUS: "RUNNING"
```

---

## 시나리오 4: 재시도 불가 에러 → 스킵

### TC-E2E-004: 전송 → 수신 → 검증 실패 → 에러 기록 → 다음 메시지

```
단계:
  1. 메시지 전송 (offset=10)

  2. Consumer 수신 → 핸들러 실행
     → HandleResult.fail("INVALID_DATA", "필수 필드 누락")

  3. TB_MCM_MOM_TC_ERROR에 에러 기록

  4. ack.acknowledge() → offset 커밋 (스킵)

  5. 다음 메시지(offset=11) 정상 처리 계속

검증:
  - 핸들러 1회만 호출 (재시도 안 함)
  - TB_MCM_MOM_TC_ERROR 레코드 1건 (ERROR_TYPE='R', ERROR_CODE='INVALID_DATA')
  - CONTAINER_STATUS: "RUNNING" (일시정지 안 됨)
  - CURRENT_OFFSET: 12 (두 메시지 모두 처리)
```

---

## 시나리오 5: SERAI 시스템 라우팅

### TC-E2E-005: SERAI 시스템 → 모든 메시지 SeraiConsumeHandler로 라우팅

```
조건:
  - biz-system: serai_prod
  - @Component("SeraiConsumeHandler") 핸들러 등록

단계:
  1. 메시지A 전송: TRANSACTION_CODE="PQR02012"
  2. 메시지B 전송: TRANSACTION_CODE="ABC01234"

  3. Consumer 수신 - 메시지A
     - bizSystem="serai_prod" → "serai"로 시작
     - handlerRegistry.getHandler("SeraiConsumeHandler")
     - context.getTransactionCode() == "PQR02012"

  4. Consumer 수신 - 메시지B
     - handlerRegistry.getHandler("SeraiConsumeHandler") (동일)
     - context.getTransactionCode() == "ABC01234"

검증:
  - SeraiConsumeHandler 핸들러 2회 호출
  - PQR02012, ABC01234 개별 핸들러는 호출 안 됨
  - 각 호출에서 context.transactionCode가 원본 값 유지
```

---

## 시나리오 6: Producer 전송 실패 → 에러 기록

### TC-E2E-006: 브로커 장애 시 에러 DB 기록

```
조건:
  - Kafka 브로커 연결 불가 상태

단계:
  1. producer.send("MMPPMERPTT01", "PQR02012", "msg")
     → SendResult: success=false, errorMessage="Connection refused"

  2. TB_MCM_MOM_TC_ERROR에 에러 기록

검증:
  - SendResult.isSuccess() == false
  - TB_MCM_MOM_TC_ERROR 레코드 1건
    - ERROR_TYPE: 'S'
    - INTERFACE_ID: 'MMPPMERPTT01'
    - TRANSACTION_CODE: 'PQR02012'
```

---

## 시나리오 7: 미등록 TRANSACTION_CODE

### TC-E2E-007: 등록되지 않은 코드 → DefaultHandler → 스킵

```
단계:
  1. 메시지 전송: TRANSACTION_CODE="UNKNOWN_TX"

  2. Consumer 수신
     → handlerRegistry.getHandler("UNKNOWN_TX")
     → DefaultKafkaInterfaceHandler (Bean 없음)

  3. DefaultHandler.businessHandle()
     → WARN 로그 출력
     → HandleResult.success() 반환

  4. ack.acknowledge() → 메시지 스킵

검증:
  - WARN 로그에 "UNKNOWN_TX" 포함
  - TB_MCM_MOM_TC_ERROR에 레코드 없음 (success 처리)
  - CURRENT_OFFSET 증가
```

---

## 시나리오 8: 컨테이너 수동 제어

### TC-E2E-008: 런타임 컨테이너 정지/시작

```
단계:
  1. GET /kafkaApi/status → CONTAINER_STATUS: "RUNNING"

  2. POST /kafkaApi/stop {"topicId":"T1"}
     → GET /kafkaApi/status → CONTAINER_STATUS: "STOPPED"

  3. 메시지 전송 (Consumer 정지 상태이므로 처리 안 됨)

  4. POST /kafkaApi/startConsumer {"topicId":"T1"}
     → "START_EXISTING"
     → GET /kafkaApi/status → CONTAINER_STATUS: "RUNNING"

  5. 정지 중 쌓인 메시지 처리 시작

검증:
  - 정지 중에는 메시지 미처리
  - 시작 후 밀린 메시지 순차 처리
```

---

## 시나리오 9: 메시지 브라우징 (디버깅)

### TC-E2E-009: peekOffset으로 문제 메시지 확인

```
단계:
  1. 메시지 5건 전송 (offset 0~4)

  2. offset=3에서 처리 실패 → 컨테이너 PAUSED

  3. GET /kafkaApi/status
     → CURRENT_OFFSET: 3, CONTAINER_STATUS: "PAUSED"

  4. GET /kafkaApi/peekOffset?topicId=T1&offset=3
     → 문제 메시지 JSON 확인

  5. 원인 파악 후:
     POST /kafkaApi/skipOffset {"topicId":"T1","groupId":"G1","count":1}

  6. offset=4 메시지부터 정상 처리

검증:
  - peekOffset 결과에 문제 메시지 JSON 포함
  - skipOffset 후 CURRENT_OFFSET: 4
```

---

## 시나리오 10: 대용량 메시지 처리

### TC-E2E-010: INTERFACE_MSG 65000자 메시지

```
단계:
  1. 65000자 interfaceMsg 생성

  2. producer.send("T1", "PQR02012", 65000자msg)
     → SendResult: success=true

  3. Consumer 수신 → 핸들러에 context 전달
     → context.getInterfaceMsg().length() == 65000

  4. 핸들러 실패 시 에러 기록
     → TB_MCM_MOM_TC_ERROR.INTERFACE_MSG 길이 == 65000 (절삭 없이 저장)

검증:
  - 전송/수신/저장 과정에서 데이터 손실 없음
  - 65000자 초과 시 KafkaErrorRepository에서 65000자로 절삭
```
