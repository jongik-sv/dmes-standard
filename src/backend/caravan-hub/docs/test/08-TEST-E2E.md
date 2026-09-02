# TEST - E2E (End-to-End) 시나리오

## 개요

외부 시스템 → SERAI → Kafka → SERAI → 외부 시스템으로 이어지는 전체 흐름을 검증한다.

---

## TC-E2E-001: HTTP → Kafka → DB (INBOUND HTTP + OUTBOUND DB)

### 목적
외부 시스템이 HTTP로 전송한 메시지가 Kafka를 거쳐 IF_* 테이블에 INSERT되는 전체 흐름을 검증한다.

### 사전 조건
- INBOUND HTTP: 별도 설정 불필요 (컨트롤러 항상 활성)
- OUTBOUND DB: SERAI_CONFIG에 토픽 등록 (DIRECTION='OUTBOUND', INTEGRATION_TYPE='DB')
- Caravan Consumer가 해당 토픽 구독 중

### 절차
1. `POST /seraiApi/v1/send` 호출
   ```json
   {
     "INTERFACE_ID": "TEST_TOPIC_01",
     "TRANSACTION_CODE": "SeraiConsumeHandler",
     "INTERFACE_MSG": "E2E_TEST|DATA|12345"
   }
   ```
2. HTTP 200 응답 확인
3. Kafka 토픽 메시지 도착 확인
4. Caravan Consumer가 메시지 수신
5. OutboundRouter → DbOutboundHandler → IF_* 테이블 INSERT

### 검증 항목
- [ ] HTTP 200 응답 (resultCode="SUCCESS")
- [ ] Kafka 토픽에 메시지 존재
- [ ] IF_* 테이블에 INSERT 확인
  - TRANSACTION_CODE = "SeraiConsumeHandler"
  - INTERFACE_MSG = "E2E_TEST|DATA|12345"
  - IF_FLAG = "N"

---

## TC-E2E-002: DB → Kafka → HTTP (INBOUND DB + OUTBOUND HTTP)

### 목적
IF_* 테이블의 데이터가 폴링되어 Kafka를 거쳐 외부 시스템에 HTTP POST로 전달되는 전체 흐름을 검증한다.

### 사전 조건
- INBOUND DB: SERAI_CONFIG 설정 (DIRECTION='INBOUND', INTEGRATION_TYPE='DB')
- OUTBOUND HTTP: SERAI_CONFIG 설정 (DIRECTION='OUTBOUND', INTEGRATION_TYPE='HTTP')
  - HTTP_URL = 외부 시스템 수신 URL
- 외부 시스템 HTTP 서버 가동

### 절차
1. IF_* 테이블에 IF_FLAG='N' 데이터 INSERT
   ```sql
   INSERT INTO IFUSER.IF_TEST_TOPIC_02 (
       TRANSACTION_CODE, INTERFACE_ID, INTERFACE_MSG, IF_FLAG,
       CREATION_TIMESTAMP
   ) VALUES (
       'SeraiConsumeHandler', 'TEST_TOPIC_02',
       'E2E_DB_HTTP|TEST|67890', 'N', SYSTIMESTAMP
   );
   ```
2. DB 폴링 대기 (POLLING_INTERVAL_MS 주기)
3. Kafka 전송 확인
4. Consumer 수신 → OutboundRouter → HttpOutboundHandler
5. 외부 시스템에 HTTP POST 도착 확인

### 검증 항목
- [ ] IF_* 테이블의 IF_FLAG = 'Y' (폴링 성공)
- [ ] Kafka 토픽에 메시지 존재
- [ ] 외부 시스템에 HTTP POST 수신
  - INTERFACE_MSG = "E2E_DB_HTTP|TEST|67890"
- [ ] 전체 처리 시간 = POLLING_INTERVAL_MS + 소요 시간 이내

---

## TC-E2E-003: FILE → Kafka → DB (INBOUND FILE + OUTBOUND DB)

### 목적
SFTP 서버의 파일 데이터가 폴링되어 Kafka를 거쳐 IF_* 테이블에 INSERT되는 전체 흐름을 검증한다.

### 사전 조건
- INBOUND FILE: SERAI_CONFIG 설정 (DIRECTION='INBOUND', INTEGRATION_TYPE='FILE')
- OUTBOUND DB: SERAI_CONFIG 설정 (DIRECTION='OUTBOUND', INTEGRATION_TYPE='DB')
- SFTP 서버에 테스트 파일 업로드
  ```
  파일명: e2e_test.txt
  내용:
  SeraiConsumeHandler|DATA1|AAA
  SeraiConsumeHandler|DATA2|BBB
  ```

### 절차
1. SFTP FILE_PATH에 e2e_test.txt 업로드
2. FILE 폴링 대기
3. 각 라인별 Kafka 전송
4. Consumer 수신 → OutboundRouter → DbOutboundHandler
5. IF_* 테이블 INSERT 확인

### 검증 항목
- [ ] SFTP BACKUP_PATH에 e2e_test.txt 이동
- [ ] Kafka 토픽에 2건 메시지 존재
- [ ] IF_* 테이블에 2건 INSERT
  - 1건: INTERFACE_MSG = "SeraiConsumeHandler|DATA1|AAA"
  - 2건: INTERFACE_MSG = "SeraiConsumeHandler|DATA2|BBB"
- [ ] 순서 보장 (라인 순서대로 INSERT)

---

## TC-E2E-004: DB → Kafka → FILE (INBOUND DB + OUTBOUND FILE)

### 목적
IF_* 테이블의 데이터가 폴링되어 Kafka를 거쳐 SFTP 서버에 파일로 생성되는 전체 흐름을 검증한다.

### 사전 조건
- INBOUND DB: SERAI_CONFIG 설정 (DIRECTION='INBOUND', INTEGRATION_TYPE='DB')
- OUTBOUND FILE: SERAI_CONFIG 설정 (DIRECTION='OUTBOUND', INTEGRATION_TYPE='FILE')
  - FILE_PATH, FTP_HOST, FTP_PORT, FTP_USER, FTP_PASSWORD 설정

### 절차
1. IF_* 테이블에 IF_FLAG='N' 데이터 INSERT
2. DB 폴링 대기
3. Kafka 전송 확인
4. Consumer 수신 → OutboundRouter → FileOutboundHandler
5. SFTP 서버에 파일 생성 확인

### 검증 항목
- [ ] IF_* 테이블의 IF_FLAG = 'Y'
- [ ] SFTP FILE_PATH에 파일 생성
  - 파일명: `{TOPIC_ID}_{yyyyMMddHHmmss}_{UUID8자}.txt`
  - 파일 내용 = INTERFACE_MSG

---

## TC-E2E-005: HTTP → Kafka → FILE (INBOUND HTTP + OUTBOUND FILE)

### 목적
외부 시스템이 HTTP로 전송한 메시지가 Kafka를 거쳐 SFTP 서버에 파일로 생성되는 전체 흐름을 검증한다.

### 절차
1. `POST /seraiApi/v1/send` 호출
2. HTTP 200 응답 확인
3. Kafka 메시지 전송 확인
4. Consumer 수신 → FileOutboundHandler → SFTP 파일 생성

### 검증 항목
- [ ] HTTP 200 응답
- [ ] SFTP 서버에 파일 생성
- [ ] 파일 내용 = 요청의 INTERFACE_MSG

---

## TC-E2E-006: HTTP → Kafka → HTTP (INBOUND HTTP + OUTBOUND HTTP)

### 목적
HTTP로 수신된 메시지가 Kafka를 거쳐 다른 외부 시스템에 HTTP POST로 전달되는 전체 흐름을 검증한다.

### 절차
1. `POST /seraiApi/v1/send` 호출
2. HTTP 200 응답 확인
3. Consumer 수신 → HttpOutboundHandler → 외부 시스템 HTTP POST

### 검증 항목
- [ ] 원본 시스템에 200 응답
- [ ] 대상 시스템에 HTTP POST 도착
- [ ] 대상 시스템 수신 JSON에 원본 INTERFACE_MSG 포함

---

## TC-E2E-007: 다중 토픽 동시 처리

### 목적
여러 토픽이 동시에 INBOUND/OUTBOUND 처리될 때 서로 간섭 없이 독립적으로 동작하는지 확인한다.

### 사전 조건
- 3개 토픽 설정
  - TOPIC_A: INBOUND DB → OUTBOUND HTTP
  - TOPIC_B: INBOUND DB → OUTBOUND DB
  - TOPIC_C: INBOUND FILE → OUTBOUND FILE

### 절차
1. 3개 토픽에 동시에 데이터 투입
2. 모든 토픽의 INBOUND 처리 확인
3. 모든 토픽의 OUTBOUND 처리 확인

### 검증 항목
- [ ] 3개 토픽 모두 독립적으로 처리
- [ ] 토픽 간 데이터 혼선 없음
- [ ] 각 토픽의 POLLING_INTERVAL_MS에 따른 독립 주기 동작
- [ ] 스레드 풀 리소스 정상 공유

---

## TC-E2E-008: 장애 전파 격리

### 목적
하나의 OUTBOUND 핸들러에서 장애가 발생해도 다른 토픽의 처리에 영향을 주지 않는지 확인한다.

### 사전 조건
- TOPIC_A: OUTBOUND HTTP → 대상 시스템 다운 (장애)
- TOPIC_B: OUTBOUND DB → 정상

### 절차
1. TOPIC_A와 TOPIC_B에 동시에 메시지 전송
2. TOPIC_A 장애 발생 확인
3. TOPIC_B 정상 처리 확인

### 검증 항목
- [ ] TOPIC_A: 재시도 → 컨테이너 일시정지
- [ ] TOPIC_B: 정상 처리 지속
- [ ] TOPIC_A의 장애가 TOPIC_B에 영향 없음

---

## TC-E2E-009: 전체 시스템 재시작 후 복구

### 목적
SERAI 서비스 재시작 후 모든 INBOUND 폴링과 OUTBOUND 처리가 정상 재개되는지 확인한다.

### 절차
1. SERAI 서비스 기동 중 데이터 투입
2. SERAI 서비스 정상 종료 (SIGTERM)
3. 처리 중이던 데이터 상태 확인
4. SERAI 서비스 재시작
5. 미처리 데이터 처리 재개 확인

### 검증 항목
- [ ] 종료 시 그레이스풀 셧다운 (실행 중 작업 완료 대기)
- [ ] 재시작 후 DB 폴링 스케줄 재등록
- [ ] 재시작 후 FILE 폴링 스케줄 재등록
- [ ] IF_FLAG='N' 미처리 데이터 재처리
- [ ] Kafka Consumer offset 기반 메시지 재수신
- [ ] SFTP 세션 캐시 재구축

---

## TC-E2E-010: 성능 부하 테스트

### 목적
대량 메시지 처리 시 시스템이 안정적으로 동작하는지 확인한다.

### 사전 조건
- DB INBOUND: 1000건 IF_FLAG='N' 데이터
- HTTP INBOUND: 100건 동시 요청
- SFTP: 10개 파일, 각 100줄

### 검증 항목
- [ ] DB INBOUND: 1000건 모두 처리 (batchSize 단위로 분할 처리)
- [ ] HTTP INBOUND: 100건 모두 200 응답
- [ ] FILE INBOUND: 1000줄 모두 Kafka 전송
- [ ] OUTBOUND: 모든 메시지 정상 처리
- [ ] 메모리 누수 없음 (힙 메모리 모니터링)
- [ ] 스레드 누수 없음 (스레드 덤프 확인)
- [ ] SFTP 세션 캐시 정상 관리
