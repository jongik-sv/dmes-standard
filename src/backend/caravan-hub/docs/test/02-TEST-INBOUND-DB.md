# TEST - INBOUND DB

## 대상 클래스

- `DbPollingScheduler`
- `DbPollingService`
- `CaravanHubConfigMapper` (selectDbInboundConfigs, isValidTableName)
- `InterfaceMapper` (selectPendingMessages, updateSuccess, updateError)

---

## TC-DB-001: 정상 폴링 및 Kafka 전송

### 목적
IF_FLAG='N'인 메시지를 폴링하여 Kafka로 전송하고, IF_FLAG='Y'로 업데이트되는지 확인한다.

### 사전 조건
- `TB_MCM_MOM_KAFKA_SERAI_CONFIG`에 DB INBOUND 설정 등록
  - DIRECTION='INBOUND', INTEGRATION_TYPE='DB', USE_YN='Y'
- `TB_MCM_MOM_KAFKA_TOPICS`에 토픽 등록 (USE_TP='Y')
- IF_* 테이블에 테스트 데이터 INSERT
  ```sql
  INSERT INTO IFUSER.IF_MMPPMMCMTT01 (
      TRANSACTION_CODE, INTERFACE_ID, INTERFACE_MSG, IF_FLAG,
      CREATION_TIMESTAMP
  ) VALUES (
      'SeraiConsumeHandler', 'MMPPMMCMTT01',
      'PQR02012|P|S|5A|20260130|...', 'N',
      SYSTIMESTAMP
  );
  ```

### 예상 결과
- Kafka 토픽에 메시지 도착
- IF_FLAG = 'Y'
- IF_DATE = 오늘 날짜 (yyyyMMdd)
- IF_TIME = 처리 시각 (HHmmss)
- LAST_UPDATE_TIMESTAMP 갱신

### 검증 항목
- [ ] Kafka 토픽에 메시지 도착 확인
- [ ] IF_FLAG = 'Y' 업데이트 확인
- [ ] IF_DATE, IF_TIME 값 정상 기록
- [ ] LAST_UPDATED_OBJECT_ID = 'SERAI'
- [ ] LAST_UPDATE_PROGRAM_ID = 'DbPollingService'

---

## TC-DB-002: Kafka 전송 실패 시 IF_FLAG='E'

### 목적
Kafka 전송 실패 시 IF_FLAG가 'E'로 업데이트되는지 확인한다.

### 사전 조건
- IF_* 테이블에 IF_FLAG='N' 데이터 존재
- Kafka 브로커 중지 또는 토픽 미존재

### 예상 결과
- IF_FLAG = 'E'
- IF_DATE, IF_TIME 기록

### 검증 항목
- [ ] IF_FLAG = 'E' 업데이트 확인
- [ ] 로그에 에러 기록
- [ ] 다른 메시지의 처리에 영향 없음 (개별 메시지 단위 에러 처리)

---

## TC-DB-003: 미처리 메시지 없는 경우

### 목적
IF_FLAG='N'인 메시지가 없을 때 폴링이 정상 종료되는지 확인한다.

### 사전 조건
- IF_* 테이블에 IF_FLAG='N' 데이터 없음 (모두 'Y' 또는 'E')

### 예상 결과
- 폴링 실행 후 아무 동작 없이 종료
- 에러 로그 없음

### 검증 항목
- [ ] 에러/경고 로그 없음
- [ ] 다음 폴링 주기에 정상 실행

---

## TC-DB-004: 배치 크기(batchSize) 제한

### 목적
batchSize 설정에 따라 1회 폴링 시 조회 건수가 제한되는지 확인한다.

### 사전 조건
- `serai.inbound.db.batch-size: 5`
- IF_* 테이블에 IF_FLAG='N' 데이터 10건

### 예상 결과
- 1회 폴링 시 5건만 처리
- 나머지 5건은 다음 폴링 주기에 처리

### 검증 항목
- [ ] 1회 폴링에서 정확히 batchSize건만 처리
- [ ] CREATION_TIMESTAMP 순서대로 처리 (오래된 것 먼저)
- [ ] 나머지 건은 IF_FLAG='N' 유지

---

## TC-DB-005: 메시지 순서 보장

### 목적
같은 테이블 내에서 CREATION_TIMESTAMP 순서대로 처리되는지 확인한다.

### 사전 조건
- IF_* 테이블에 3건 INSERT (각각 다른 CREATION_TIMESTAMP)
  - 1번: CREATION_TIMESTAMP = 10:00:00
  - 2번: CREATION_TIMESTAMP = 10:00:01
  - 3번: CREATION_TIMESTAMP = 10:00:02

### 예상 결과
- Kafka에 1번 → 2번 → 3번 순서로 전송

### 검증 항목
- [ ] Kafka 토픽의 메시지 offset 순서 = CREATION_TIMESTAMP 순서
- [ ] IF_FLAG 업데이트도 같은 순서

---

## TC-DB-006: 유효하지 않은 테이블명

### 목적
SERAI_CONFIG에 등록되지 않은 테이블명으로 폴링 시도 시 스킵되는지 확인한다.

### 사전 조건
- DbPollingService.pollAndSend()에 등록되지 않은 테이블명 전달
  (정상적으로는 발생하지 않지만, 설정 변경 타이밍 이슈 시 가능)

### 예상 결과
- 폴링 스킵 (경고 로그: "유효하지 않은 테이블명")
- 예외 발생 없음

### 검증 항목
- [ ] WARN 로그 출력
- [ ] 폴링이 중단되지 않음 (다음 주기 정상 실행)

---

## TC-DB-007: 동시 실행 방지 (AtomicBoolean)

### 목적
같은 토픽의 이전 폴링이 실행 중일 때 다음 주기가 스킵되는지 확인한다.

### 사전 조건
- POLLING_INTERVAL_MS = 1000 (1초)
- IF_* 테이블에 대량 데이터 (처리 시간 > 1초)

### 예상 결과
- 이전 폴링 실행 중이면 "이전 폴링 실행 중, 스킵" 로그
- 중복 실행 없음

### 검증 항목
- [ ] DEBUG 로그 "이전 폴링 실행 중, 스킵" 확인
- [ ] 같은 메시지가 두 번 처리되지 않음
- [ ] IF_FLAG 업데이트 충돌 없음

---

## TC-DB-008: 낙관적 락 (Optimistic Lock) 검증

### 목적
동일 메시지가 여러 프로세스에서 동시 처리 시 낙관적 락이 동작하는지 확인한다.

### 사전 조건
- IF_* 테이블에 IF_FLAG='N' 데이터 1건
- 두 개의 SERAI 인스턴스가 동일 테이블을 폴링

### 예상 결과
- 하나의 인스턴스만 UPDATE 성공 (affected rows = 1)
- 나머지 인스턴스는 UPDATE 0건 (LAST_UPDATE_TIMESTAMP 불일치)

### 검증 항목
- [ ] WHERE LAST_UPDATE_TIMESTAMP 조건으로 중복 처리 방지
- [ ] 에러 없이 정상 처리

---

## TC-DB-009: 설정 변경 자동 감지 (60초 주기)

### 목적
TB_MCM_MOM_KAFKA_SERAI_CONFIG에 새 토픽을 추가하면 최대 60초 내 자동 감지되는지 확인한다.

### 사전 조건
- SERAI 서비스 기동 상태
- 초기에는 토픽 1개만 설정

### 절차
1. SERAI 서비스 기동 확인 (토픽 1개 폴링 중)
2. TB_MCM_MOM_KAFKA_SERAI_CONFIG에 새 토픽 INSERT
3. 최대 60초 대기

### 예상 결과
- 새 토픽에 대한 폴링 스케줄 자동 등록

### 검증 항목
- [ ] "DB 폴링 스케줄 신규 등록" 로그 확인
- [ ] 새 토픽의 IF_* 테이블 폴링 시작

---

## TC-DB-010: 토픽 비활성화 시 스케줄 제거

### 목적
설정 테이블에서 USE_YN='N'으로 변경하면 해당 토픽의 폴링이 중지되는지 확인한다.

### 사전 조건
- SERAI 서비스 기동 상태, 토픽 2개 폴링 중

### 절차
1. TB_MCM_MOM_KAFKA_SERAI_CONFIG에서 1개 토픽의 USE_YN='N' 변경
2. 최대 60초 대기

### 예상 결과
- 해당 토픽의 ScheduledFuture 취소
- runningMap에서 제거

### 검증 항목
- [ ] "DB 폴링 스케줄 제거" 로그 확인
- [ ] 해당 토픽의 IF_* 테이블 더 이상 폴링하지 않음
- [ ] 나머지 토픽은 정상 폴링 유지

---

## TC-DB-011: DB 비활성화 설정

### 목적
`serai.inbound.db.enabled=false`일 때 스케줄러가 생성되지 않는지 확인한다.

### 사전 조건
```yaml
serai:
  inbound:
    db:
      enabled: false
```

### 예상 결과
- ScheduledExecutorService 미생성
- "DB Integration 비활성화 상태" 로그

### 검증 항목
- [ ] INFO 로그 "DB Integration 비활성화 상태" 확인
- [ ] DB 폴링 미실행
- [ ] 앱 정상 기동

---

## TC-DB-012: 서비스 종료 시 그레이스풀 셧다운

### 목적
앱 종료 시 실행 중인 폴링이 정상 완료된 후 스케줄러가 종료되는지 확인한다.

### 절차
1. SERAI 서비스 기동 (폴링 실행 중)
2. SIGTERM 또는 정상 종료 실행

### 예상 결과
- 모든 ScheduledFuture 취소
- scheduler.shutdown() 호출 → 60초 대기 → shutdownNow()

### 검증 항목
- [ ] "DB 폴링 스케줄 취소" 로그 (토픽별)
- [ ] "DbPollingScheduler 종료 완료" 로그
- [ ] 처리 중이던 메시지의 IF_FLAG 정상 업데이트
