# 08. 데이터베이스

## 파일 목록

| 파일 | 역할 |
|------|------|
| `repository/KafkaTopicRepository.java` | 토픽 정보 조회 |
| `repository/KafkaErrorRepository.java` | 에러 로그 기록 |
| `mapper/KafkaMapper.java` | MyBatis Mapper 인터페이스 |
| `resources/mapper/KafkaMapper.xml` | MyBatis SQL 정의 |
| `model/TopicInfo.java` | 토픽 정보 DTO |
| `model/KafkaErrorLog.java` | 에러 로그 DTO |

---

## 테이블 구조

> 상세 DDL은 `docs/SQL/` 디렉토리 참조

### TB_MCM_MOM_KAFKA_TOPICS

토픽 설정 정보를 저장하는 테이블이다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `TOPIC_ID` | VARCHAR(100) | **PK**. Kafka 토픽명 |
| `TOPIC_DESC` | VARCHAR(300) | 토픽 설명 |
| `GROUP_ID` | VARCHAR(100) | Consumer Group ID |
| `BIZ_SYSTEM` | VARCHAR(5) | 비즈니스 시스템 코드 |
| `SEND_MODULE_ID` | VARCHAR(20) | 송신 모듈 ID |
| `RECV_MODULE_ID` | VARCHAR(20) | 수신 모듈 ID |
| `USE_TP` | VARCHAR(1) | 사용 여부 |
| `STATUS` | VARCHAR(20) | 토픽 상태 |
| 감사 컬럼 | | CREATED_*, LAST_UPDATED_* 등 |

### TB_MCM_MOM_TC_ERROR

에러 로그를 저장하는 테이블이다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `SQ_VAL` | NUMBER | **PK**. 시퀀스 `SQ_MCM_MOM_TC_ERROR` |
| `TRANSACTION_CODE` | VARCHAR(50) | 트랜잭션 코드 |
| `INTERFACE_ID` | VARCHAR(100) | 토픽명 |
| `INTERFACE_MSG` | VARCHAR(65000) | 전문 내용 |
| `INTERFACE_PROTOCOL` | VARCHAR(20) | 전송 프로토콜 |
| `ERROR_TYPE` | VARCHAR(3) | S: 송신, R: 수신 |
| `ERROR_CODE` | VARCHAR(100) | 에러 코드 |
| `ERROR_MSG` | VARCHAR(1000) | 에러 메시지 |
| `ERROR_STATUS_CODE` | VARCHAR(1) | 에러 처리 상태 (기본 'N') |
| `CREATED_OBJECT_TYPE` | VARCHAR(1) | 'B' (Batch) |
| `CREATED_OBJECT_ID` | VARCHAR(20) | bizSystem 값 |
| `CREATED_PROGRAM_ID` | VARCHAR(20) | 'CARAVAN' |
| `CREATION_TIMESTAMP` | TIMESTAMP | SYSTIMESTAMP |

---

## KafkaMapper (인터페이스)

**경로**: `mapper/KafkaMapper.java`

```java
@Mapper
public interface KafkaMapper {
    List<TopicInfo> selectTopics(@Param("bizSystem") String bizSystem);
    TopicInfo selectTopicById(@Param("bizSystem") String bizSystem, @Param("topicId") String topicId);
    List<TopicInfo> selectTopicsInfo(@Param("bizSystem") String bizSystem,
                                     @Param("topicId") String topicId,
                                     @Param("sendModuleId") String sendModuleId,
                                     @Param("recvModuleId") String recvModuleId);
    void insertKafkaError(KafkaErrorLog errorLog);
}
```

`@MapperScan`으로 `kafkaSqlSessionFactory`에 바인딩된다 (KafkaDataSourceConfig 참조).

---

## KafkaMapper.xml

**경로**: `resources/mapper/KafkaMapper.xml`

### selectTopics

```sql
SELECT TOPIC_ID, TOPIC_DESC, GROUP_ID
FROM TB_MCM_MOM_KAFKA_TOPICS
WHERE BIZ_SYSTEM = #{bizSystem}
GROUP BY TOPIC_ID, GROUP_ID, TOPIC_DESC
```

`BIZ_SYSTEM`이 현재 시스템 코드와 일치하는 토픽만 조회한다. 앱 시작 시 Listener 등록에 사용된다.

### selectTopicById

```sql
SELECT TOPIC_ID, TOPIC_DESC, GROUP_ID, BIZ_SYSTEM, SEND_MODULE_ID, RECV_MODULE_ID, USE_TP
FROM TB_MCM_MOM_KAFKA_TOPICS
WHERE BIZ_SYSTEM = #{bizSystem} AND TOPIC_ID = #{topicId}
```

### selectTopicsInfo

```sql
SELECT TOPIC_ID, TOPIC_DESC, GROUP_ID, BIZ_SYSTEM, SEND_MODULE_ID, RECV_MODULE_ID, USE_TP, STATUS
FROM TB_MCM_MOM_KAFKA_TOPICS
WHERE BIZ_SYSTEM = #{bizSystem}
  <if test="topicId != null and topicId != ''">AND TOPIC_ID LIKE '%' || #{topicId} || '%'</if>
  <if test="sendModuleId != null and sendModuleId != ''">AND SEND_MODULE_ID = #{sendModuleId}</if>
  <if test="recvModuleId != null and recvModuleId != ''">AND RECV_MODULE_ID = #{recvModuleId}</if>
```

REST API `/kafkaApi/status`에서 사용한다. `topicId`는 LIKE 검색이다.

### insertKafkaError

```sql
INSERT INTO TB_MCM_MOM_TC_ERROR (
    SQ_VAL, INTERFACE_PROTOCOL, TRANSACTION_CODE, INTERFACE_ID, INTERFACE_MSG,
    ERROR_TYPE, ERROR_CODE, ERROR_MSG, ERROR_STATUS_CODE,
    CREATED_OBJECT_TYPE, CREATED_OBJECT_ID, CREATED_PROGRAM_ID, CREATION_TIMESTAMP,
    LAST_UPDATED_OBJECT_TYPE, LAST_UPDATED_OBJECT_ID, LAST_UPDATE_PROGRAM_ID, LAST_UPDATE_TIMESTAMP
) VALUES (
    SQ_MCM_MOM_TC_ERROR.NEXTVAL, #{interfaceProtocol}, #{transactionCode}, #{interfaceId}, #{interfaceMsg},
    #{errorType}, #{errorCode}, #{errorMsg}, 'N',
    'B', #{createdObjectId}, #{createdProgramId}, SYSTIMESTAMP,
    'B', #{createdObjectId}, #{createdProgramId}, SYSTIMESTAMP
)
```

- PK: `SQ_MCM_MOM_TC_ERROR.NEXTVAL` (Tibero 시퀀스)
- `ERROR_STATUS_CODE`: 항상 `'N'` (미처리)
- `CREATED_OBJECT_TYPE` / `LAST_UPDATED_OBJECT_TYPE`: 항상 `'B'` (Batch)

---

## KafkaTopicRepository

**경로**: `repository/KafkaTopicRepository.java`

### 의존성

```java
private final KafkaMapper kafkaMapper;
private final CaravanProperties properties;
```

### 메서드

| 메서드 | SQL | 용도 |
|--------|-----|------|
| `getTopics()` | selectTopics | 앱 시작 시 Listener 등록 |
| `getTopicById(topicId)` | selectTopicById | 토픽 단건 조회 (Optional 반환) |
| `getTopicsInfo(topicId, sendModuleId, recvModuleId)` | selectTopicsInfo | REST API 상태 조회 |

모든 조회에 `properties.getBizSystem()`을 자동으로 전달한다.

---

## KafkaErrorRepository

**경로**: `repository/KafkaErrorRepository.java`

### 의존성

```java
private final KafkaMapper kafkaMapper;
private final CaravanProperties properties;
```

### 메서드

#### logSendError(String topic, String transactionCode, String message, String errorCode, String errorMsg)

Producer 전송 실패 시 호출된다.

```
KafkaErrorLog 생성:
  interfaceProtocol = "IF_KAFKA"
  transactionCode   = 파라미터
  interfaceId       = topic
  interfaceMsg      = message          (65000자 절삭)
  errorType         = "S"              (Send)
  errorCode         = errorCode        (100자 절삭)
  errorMsg          = errorMsg         (1000자 절삭)
  createdObjectId   = properties.getBizSystem()
  createdProgramId  = "CARAVAN"
```

#### logConsumeError(String topic, String transactionCode, long offset, String errorCode, String errorMsg)

Consumer 처리 실패 시 호출된다.

```
KafkaErrorLog 생성:
  interfaceProtocol = "IF_KAFKA"
  transactionCode   = 파라미터
  interfaceId       = topic
  interfaceMsg      = "offset:" + offset  (65000자 절삭)
  errorType         = "R"                 (Receive)
  errorCode         = errorCode           (100자 절삭)
  errorMsg          = errorMsg            (1000자 절삭)
  createdObjectId   = properties.getBizSystem()
  createdProgramId  = "CARAVAN"
```

### 필드 길이 절삭

DDL 컬럼 길이에 맞춰 `truncate()` 메서드로 자동 절삭한다.

| 필드 | 최대 길이 |
|------|-----------|
| interfaceMsg | 65,000 |
| errorCode | 100 |
| errorMsg | 1,000 |

---

## TopicInfo (DTO)

**경로**: `model/TopicInfo.java`

```java
@Data
public class TopicInfo {
    private String topicId;
    private String topicDesc;
    private String groupId;
    private String bizSystem;
    private String sendModuleId;
    private String recvModuleId;
    private String useTp;
    private String status;
}
```

MyBatis `mapUnderscoreToCamelCase=true` 설정으로 DB 컬럼이 자동 매핑된다.
(`TOPIC_ID` → `topicId`, `GROUP_ID` → `groupId` 등)

---

## KafkaErrorLog (DTO)

**경로**: `model/KafkaErrorLog.java`

```java
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class KafkaErrorLog {
    private String interfaceProtocol;
    private String transactionCode;
    private String interfaceId;
    private String interfaceMsg;
    private String errorType;          // "S" (Send) 또는 "R" (Receive)
    private String errorCode;
    private String errorMsg;
    private String createdObjectId;    // bizSystem
    private String createdProgramId;   // "CARAVAN"
}
```
