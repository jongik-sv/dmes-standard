# 04. INBOUND - DB

## 관련 파일

```
inbound/db/scheduler/DbPollingScheduler.java    # 스케줄 관리
inbound/db/service/DbPollingService.java         # 실제 폴링 로직
mapper/CaravanHubConfigMapper.java                      # 설정 조회
mapper/InterfaceMapper.java                      # IF_* 테이블 CRUD
resources/mapper/mst/CaravanHubConfigMapper.xml          # 설정 SQL
resources/mapper/if/InterfaceMapper.xml            # IF_* 테이블 SQL
```

---

## 동작 흐름

```
TB_MCM_MOM_KAFKA_SERAI_CONFIG (DIRECTION='INBOUND', INTEGRATION_TYPE='DB')
  → 토픽별 폴링 스케줄 등록
  → IF_* 테이블에서 IF_FLAG='N' 조회
  → KafkaMessageProducer.send()
  → 성공: IF_FLAG='Y' / 실패: IF_FLAG='E'
```

---

## DbPollingScheduler.java

스케줄러는 **토픽별로 독립적인 폴링 주기**를 관리한다.

### 초기화 (`@PostConstruct init()`)

```
1. serai.inbound.db.enabled 확인 → false면 스케줄러 생성 안 함
2. ScheduledExecutorService 생성 (threadPoolSize만큼)
3. registerTopicSchedules() → DB에서 활성 토픽 조회 → 토픽별 scheduleAtFixedRate 등록
4. refreshSchedules를 60초 주기로 등록 (설정 변경 감지)
```

### 토픽별 스케줄 (`scheduleAtFixedRate`)

```java
scheduler.scheduleAtFixedRate(
    () -> pollIfNotRunning(topicId, tableName),
    0,                    // 초기 지연 없음
    interval,             // POLLING_INTERVAL_MS (DB 설정값)
    TimeUnit.MILLISECONDS
);
```

각 토픽은 자기만의 주기(POLLING_INTERVAL_MS)로 독립 실행된다.

### 동시 실행 방지 (`pollIfNotRunning`)

```java
AtomicBoolean running = runningMap.computeIfAbsent(topicId, k -> new AtomicBoolean(false));
if (!running.compareAndSet(false, true)) {
    return; // 이전 작업이 아직 실행 중 → 이번 주기는 스킵
}
try {
    dbPollingService.pollAndSend(topicId, tableName);
} finally {
    running.set(false);
}
```

`scheduleAtFixedRate`는 이전 작업이 끝나지 않아도 다음 주기가 트리거된다.
`AtomicBoolean`으로 같은 토픽의 중복 실행을 방지한다.

### 설정 변경 감지 (`refreshSchedules`, 60초 주기)

```
1. DB에서 현재 활성 토픽 목록 조회
2. 신규 토픽 → scheduleAtFixedRate 등록
3. 삭제/비활성화된 토픽 → ScheduledFuture.cancel() + runningMap 제거
```

**주의**: 기존 토픽의 POLLING_INTERVAL_MS가 바뀌어도 기존 스케줄은 갱신되지 않는다. 반영하려면 앱 재시작이 필요하다.

### 종료 (`@PreDestroy destroy()`)

```
1. 모든 ScheduledFuture 취소
2. scheduler.shutdown() → 60초 대기 → shutdownNow()
```

---

## DbPollingService.java

실제 DB 조회 → Kafka 전송 → 상태 업데이트 로직이다.

### pollAndSend(topicId, tableName) 흐름

```
1. isValidTableName()    → TABLE_NAME이 SERAI_CONFIG에 등록된 건지 확인 (SQL Injection 방지)
2. selectPendingMessages → IF_FLAG='N' 메시지 조회 (ORDER BY CREATION_TIMESTAMP, LIMIT=batchSize)
3. 각 메시지 순서대로 처리:
   a. kafkaMessageProducer.send(topicId, transactionCode, interfaceMsg)
   b. 성공 → updateSuccess (IF_FLAG='Y', IF_DATE, IF_TIME 업데이트)
   c. 실패 → updateError  (IF_FLAG='E')
```

### 테이블명 검증이 필요한 이유

MyBatis XML에서 `${TABLE_NAME}`은 문자열 치환이다 (PreparedStatement가 아님).
SQL Injection 가능성이 있으므로, 실제로 SERAI_CONFIG에 등록된 테이블인지 먼저 확인한다.

```sql
-- CaravanHubConfigMapper.xml
SELECT COUNT(*) FROM TB_MCM_MOM_KAFKA_SERAI_CONFIG
WHERE DB_SCHEMA || '.' || DB_TABLE_NAME = #{TABLE_NAME} AND USE_YN = 'Y'
```

### 메시지 순서 보장

- 테이블 내: `ORDER BY CREATION_TIMESTAMP ASC`로 순서 보장
- 테이블 간: 병렬 처리 (각 토픽 독립 스레드)

---

## MyBatis SQL (InterfaceMapper.xml)

### selectPendingMessages

```sql
SELECT LAST_UPDATE_TIMESTAMP, TRANSACTION_CODE, INTERFACE_ID, INTERFACE_MSG, ...
FROM ${TABLE_NAME}
WHERE IF_FLAG = 'N'
ORDER BY CREATION_TIMESTAMP ASC
FETCH FIRST #{LIMIT} ROWS ONLY
```

### updateSuccess / updateError

```sql
UPDATE ${TABLE_NAME}
SET IF_FLAG = 'Y',  -- 또는 'E'
    IF_DATE = #{IF_DATE},
    IF_TIME = #{IF_TIME},
    LAST_UPDATE_TIMESTAMP = SYSTIMESTAMP
WHERE LAST_UPDATE_TIMESTAMP = #{LAST_UPDATE_TIMESTAMP}
  AND TRANSACTION_CODE = #{TRANSACTION_CODE}
```

`LAST_UPDATE_TIMESTAMP`을 WHERE 조건에 넣어서 낙관적 락(Optimistic Lock)을 구현한다.
다른 프로세스가 먼저 처리했으면 UPDATE가 0건이 된다.
