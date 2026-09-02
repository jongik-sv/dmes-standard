# 07. MyBatis Mapper

## 관련 파일

```
mapper/CaravanHubConfigMapper.java              # 인터페이스 (MST DataSource)
mapper/InterfaceMapper.java              # 인터페이스 (IF DataSource)
resources/mapper/mst/CaravanHubConfigMapper.xml  # SQL (설정 테이블)
resources/mapper/if/InterfaceMapper.xml    # SQL (IF_* 테이블)
```

---

## CaravanHubConfigMapper (MST DataSource)

설정 테이블(`TB_MCM_MOM_KAFKA_SERAI_CONFIG`, `TB_MCM_MOM_KAFKA_TOPICS`)을 조회한다.

### selectDbInboundConfigs

DB INBOUND 폴링 대상 조회. DbPollingScheduler가 호출한다.

```sql
SELECT c.TOPIC_ID,
       c.DB_SCHEMA || '.' || c.DB_TABLE_NAME AS TABLE_NAME,
       NVL(c.POLLING_INTERVAL_MS, 1000) AS POLLING_INTERVAL_MS,
       t.GROUP_ID
FROM TB_MCM_MOM_KAFKA_SERAI_CONFIG c
INNER JOIN TB_MCM_MOM_KAFKA_TOPICS t ON c.TOPIC_ID = t.TOPIC_ID
WHERE c.INTEGRATION_TYPE = 'DB'
  AND c.DIRECTION = 'INBOUND'
  AND c.USE_YN = 'Y'
  AND t.USE_TP = 'Y'
```

- `TABLE_NAME`은 `DB_SCHEMA.DB_TABLE_NAME` 형식으로 결합된다 (예: `IFUSER.IF_MMPPMMCMTT01`)
- `POLLING_INTERVAL_MS`가 NULL이면 기본값 1000ms

### selectFileInboundConfigs

FILE INBOUND 폴링 대상 조회. FilePollingScheduler가 호출한다.

```sql
-- DB INBOUND와 동일한 구조, INTEGRATION_TYPE = 'FILE'
-- 추가 반환: FILE_PATH, BACKUP_PATH, FTP_HOST, FTP_PORT, FTP_USER, FTP_PASSWORD
```

### selectOutboundConfig

OUTBOUND 설정 조회. OutboundRouter가 호출한다.

```sql
SELECT TOPIC_ID, DIRECTION, INTEGRATION_TYPE,
       DB_TABLE_NAME, DB_SCHEMA,
       HTTP_URL, HTTP_METHOD,
       FILE_PATH, BACKUP_PATH, FTP_HOST, FTP_PORT, FTP_USER, FTP_PASSWORD
FROM TB_MCM_MOM_KAFKA_SERAI_CONFIG
WHERE TOPIC_ID = #{TOPIC_ID}
  AND DIRECTION = 'OUTBOUND'
  AND USE_YN = 'Y'
```

사용되는 컬럼은 INTEGRATION_TYPE에 따라 다르다:
- DB: DB_TABLE_NAME, DB_SCHEMA
- HTTP: HTTP_URL, HTTP_METHOD
- FILE: FILE_PATH, FTP_HOST, FTP_PORT, FTP_USER, FTP_PASSWORD

### isValidTableName

SQL Injection 방지용 테이블명 검증. DbPollingService가 호출한다.

```sql
SELECT COUNT(*) FROM TB_MCM_MOM_KAFKA_SERAI_CONFIG
WHERE DB_SCHEMA || '.' || DB_TABLE_NAME = #{TABLE_NAME}
  AND USE_YN = 'Y'
```

---

## InterfaceMapper (IF DataSource)

IF_* 인터페이스 테이블에 대한 CRUD를 수행한다.

### selectPendingMessages

INBOUND DB 폴링 시 미처리 메시지 조회.

```sql
SELECT LAST_UPDATE_TIMESTAMP, TRANSACTION_CODE, INTERFACE_ID, INTERFACE_MSG, ...
FROM ${TABLE_NAME}          -- 동적 테이블명 (문자열 치환)
WHERE IF_FLAG = 'N'
ORDER BY CREATION_TIMESTAMP ASC
FETCH FIRST #{LIMIT} ROWS ONLY
```

**`${}` vs `#{}`**:
- `${TABLE_NAME}`: SQL 문자열 치환. PreparedStatement 파라미터 아님. 테이블명은 `?` 바인딩이 안 되므로 `$`를 쓸 수밖에 없다.
- `#{LIMIT}`: PreparedStatement 파라미터 바인딩. 안전.

### updateSuccess / updateError

INBOUND 폴링 후 상태 업데이트.

```sql
UPDATE ${TABLE_NAME}
SET IF_FLAG = 'Y',  -- 성공 ('E' = 실패)
    IF_DATE = #{IF_DATE},           -- 'yyyyMMdd'
    IF_TIME = #{IF_TIME},           -- 'HHmmss'
    LAST_UPDATE_TIMESTAMP = SYSTIMESTAMP,
    LAST_UPDATED_OBJECT_ID = 'SERAI',
    LAST_UPDATE_PROGRAM_ID = 'DbPollingService'
WHERE LAST_UPDATE_TIMESTAMP = #{LAST_UPDATE_TIMESTAMP}
  AND TRANSACTION_CODE = #{TRANSACTION_CODE}
```

WHERE 조건의 `LAST_UPDATE_TIMESTAMP`은 낙관적 락 역할을 한다.

### insertOutboundData

OUTBOUND DB 핸들러에서 호출. 수신한 메시지를 IF 테이블에 INSERT한다.

```sql
INSERT INTO ${schema}.${tableName} (
    TRANSACTION_CODE, INTERFACE_ID, INTERFACE_MSG, IF_FLAG,
    CREATION_TIMESTAMP, CREATED_OBJECT_TYPE, CREATED_OBJECT_ID, CREATED_PROGRAM_ID,
    LAST_UPDATE_TIMESTAMP, LAST_UPDATED_OBJECT_TYPE, LAST_UPDATED_OBJECT_ID, LAST_UPDATE_PROGRAM_ID
) VALUES (
    #{TRANSACTION_CODE}, #{INTERFACE_ID}, #{INTERFACE_MSG}, #{IF_FLAG},
    SYSTIMESTAMP, 'S', 'SERAI', 'DbOutboundHandler',
    SYSTIMESTAMP, 'S', 'SERAI', 'DbOutboundHandler'
)
```

---

## 새 SQL을 추가할 때

1. 설정 테이블 접근 → `CaravanHubConfigMapper.java`에 메서드 추가 + `mapper/mst/CaravanHubConfigMapper.xml`에 SQL 추가
2. IF 테이블 접근 → `InterfaceMapper.java`에 메서드 추가 + `mapper/if/InterfaceMapper.xml`에 SQL 추가
3. namespace는 인터페이스의 전체 경로와 일치해야 한다:
   - `com.dongkuk.caravan.hub.mapper.CaravanHubConfigMapper`
   - `com.dongkuk.caravan.hub.mapper.InterfaceMapper`
