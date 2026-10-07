# Caravan - Kafka Interface Library

Caravan은 TRANSACTION_CODE 기반의 동적 핸들러 라우팅을 지원하는 Kafka 인터페이스 라이브러리입니다.

## 목차

- [개요](#개요)
- [주요 기능](#주요-기능)
- [요구사항](#요구사항)
- [설치](#설치)
- [설정](#설정)
- [사용 방법](#사용-방법)
  - [메시지 수신 (Consumer)](#메시지-수신-consumer)
  - [메시지 송신 (Producer)](#메시지-송신-producer)
  - [REST API](#rest-api)
- [핸들러 구현 가이드](#핸들러-구현-가이드)
- [에러 처리](#에러-처리)
- [테이블 구조](#테이블-구조)

---

## 개요

Caravan은 Kafka 메시지의 `TRANSACTION_CODE` 필드를 기반으로 적절한 핸들러를 동적으로 라우팅하여 비즈니스 로직을 실행합니다.

**1 Topic : 1 Partition : 1 Group** 체계로 운영되며, `INTERFACE_ID`가 곧 `TOPIC_ID`입니다.

```
메시지 수신 → TRANSACTION_CODE 추출 → Bean 조회 → 핸들러 호출
{"TRANSACTION_CODE": "PQR02012", ...} → getBean("PQR02012") → PQR02012.BusinessStart.businessHandle()
```

### 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                      Caravan Library                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Producer   │    │   Consumer   │    │  Controller  │  │
│  │              │    │              │    │  (REST API)  │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│          │                  │                    │          │
│          ▼                  ▼                    ▼          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Handler Registry                         │  │
│  │   TRANSACTION_CODE → Spring Bean → Handler 실행       │  │
│  └──────────────────────────────────────────────────────┘  │
│          │                  │                    │          │
│          ▼                  ▼                    ▼          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │    Offset    │    │  Container   │    │   Message    │  │
│  │   Manager    │    │  Controller  │    │   Browser    │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **동적 핸들러 라우팅** | TRANSACTION_CODE를 Bean 이름으로 사용하여 핸들러 자동 매핑 |
| **재시도 메커니즘** | 설정 가능한 재시도 횟수 및 간격 |
| **컨테이너 제어** | 런타임에 Consumer 시작/정지/일시정지/재개 |
| **Offset 관리** | Offset 조회 및 스킵 기능 |
| **메시지 브라우징** | 특정 Offset 또는 시간 범위의 메시지 조회 |
| **Dead Letter Topic** | 처리 실패 메시지 자동 DLT 전송 |
| **REST API** | 상태 조회 및 제어를 위한 REST 엔드포인트 |
| **에러 로깅** | TB_MCM_MOM_TC_ERROR 테이블에 에러 자동 기록 |

---

## 요구사항

- **Java**: 8 이상
- **Spring Framework**: 5.3.x
- **Spring Kafka**: 2.9.x
- **Apache Kafka**: 3.x
- **Spring Data JPA**: 2.7.x (Hibernate 5.6.x)
- **Database**: Oracle (TB_MCM_MOM_KAFKA_TOPICS, TB_MCM_MOM_TC_ERROR 테이블 필요)
  - Hibernate 가 Oracle 방언을 자동 감지한다. 이전 Tibero 시절의 TiberoDialectResolver 는 `archive/oracle-1007/java/caravan-core/` 로 옮겼다

---

## 설치

### Gradle

```groovy
dependencies {
    implementation 'com.dongkuk.caravan:caravan:1.0.0-SNAPSHOT'
}
```

### Maven

```xml
<dependency>
    <groupId>com.dongkuk.caravan</groupId>
    <artifactId>caravan</artifactId>
    <version>1.0.0-SNAPSHOT</version>
</dependency>
```

---

## 설정

### Spring Boot 환경

`application.yml` 또는 `application.properties`에 설정을 추가합니다.

```yaml
caravan:
  kafka:
    # 필수 설정
    enabled: true
    bootstrap-servers: localhost:9092
    biz-system: MY_SYSTEM

    # Producer 설정
    producer:
      acks: all
      retries: 3
      timeout-seconds: 10
      idempotence: true
      max-in-flight-requests: 5

    # Consumer 설정
    consumer:
      enabled: true
      auto-offset-reset: earliest
      enable-auto-commit: false
      max-poll-records: 1
      poll-timeout-ms: 3000
      concurrency: 1

    # 재시도 설정
    retry:
      max-attempts: 3
      delay-ms: 2000
```

**DataSource**: Caravan은 별도의 DataSource를 생성하지 않습니다. 호스트 프로젝트의 DataSource를 그대로 사용합니다.

Spring Boot 환경에서는 `CaravanAutoConfiguration`이 자동으로 활성화됩니다.

### 순수 Spring Framework 환경

`@Import`를 사용하여 수동으로 설정합니다.

```java
@Configuration
@Import(CaravanConfiguration.class)
@PropertySource("classpath:caravan.properties")
public class AppConfig {
    // 추가 설정...
}
```

---

## 사용 방법

### 메시지 수신 (Consumer)

#### 1. 핸들러 구현

TRANSACTION_CODE별로 핸들러를 구현합니다.

```java
package com.myproject.handler.PQR02012;

import com.dongkuk.caravan.handler.HandleResult;
import com.dongkuk.caravan.handler.KafkaInterfaceHandler;
import com.dongkuk.caravan.model.KafkaMessageContext;
import org.springframework.stereotype.Component;

@Component("PQR02012")  // Bean 이름 = TRANSACTION_CODE
public class BusinessStart implements KafkaInterfaceHandler {

    @Override
    public HandleResult businessHandle(KafkaMessageContext context) {
        try {
            // 1. 메시지 파싱
            String[] msgArr = context.getInterfaceMsgArray();
            String type = msgArr[1];
            String status = msgArr[2];

            // 2. 메타 정보 조회
            String kafkaKeyData = context.getKafkaKeyData();

            // 3. 비즈니스 로직 실행
            processBusinessLogic(type, status);

            // 4. 성공 반환
            return HandleResult.success();

        } catch (TemporaryException e) {
            // 일시적 오류 - 재시도 가능
            return HandleResult.failRetryable("TEMP_ERROR", e.getMessage());

        } catch (ValidationException e) {
            // 검증 오류 - 재시도 불가
            return HandleResult.fail("VALIDATION_ERROR", e.getMessage());
        }
    }
}
```

#### 2. HandleResult 반환 가이드

| 상황 | 반환값 | 동작 |
|------|--------|------|
| 처리 성공 | `HandleResult.success()` | 메시지 커밋, 다음 메시지 처리 |
| 처리 실패 (재시도 불가) | `HandleResult.fail(code, msg)` | 에러 기록, 메시지 커밋, 다음 메시지 처리 |
| 처리 실패 (재시도 가능) | `HandleResult.failRetryable(code, msg)` | 설정된 횟수만큼 재시도 |

#### 3. KafkaMessageContext 주요 필드

```java
// 표준 필드
context.getTransactionCode();    // TRANSACTION_CODE
context.getInterfaceId();        // INTERFACE_ID (= 토픽명)
context.getInterfaceMsg();       // INTERFACE_MSG (파이프 구분자)
context.getInterfaceMsgArray();  // INTERFACE_MSG를 배열로 분리
context.getKafkaKeyData();       // KAFKA_KEYDATA (UUID)
context.getInterfaceProtocol();  // INTERFACE_PROTOCOL ("IF_KAFKA")

// Kafka 메타데이터
context.getTopic();              // 토픽명
context.getPartition();          // 파티션
context.getOffset();             // Offset
context.getTimestamp();          // 타임스탬프

// 원본 메시지
context.getRawMessage();         // 원본 JSON 문자열
context.getRawMessageMap();      // Map으로 파싱된 원본 메시지

// 처리 정보
context.getAttemptCount();       // 현재 재시도 횟수
```

---

### 메시지 송신 (Producer)

#### 표준 메시지 포맷

모든 메시지는 아래 표준 JSON 포맷으로 자동 구성되어 전송됩니다.

```json
{
    "TRANSACTION_CODE": "PQR02012",
    "KAFKA_KEYDATA": "840d4999-196b-4740-a370-bc5eed4b30ae",
    "INTERFACE_ID": "MMPPMERPTT01",
    "INTERFACE_MSG": "PQR02012|P|S|5A|20260130111245|JCM_TEST|MMPPMERPTT01|||||20250808|00011|C|",
    "INTERFACE_PROTOCOL": "IF_KAFKA"
}
```

| 필드 | 설정 방식 | 설명 |
|------|-----------|------|
| `TRANSACTION_CODE` | 사용자 입력 | 트랜잭션 코드 (필수) |
| `KAFKA_KEYDATA` | **자동 생성** | 랜덤 UUID |
| `INTERFACE_ID` | **자동 설정** | 토픽명과 동일 |
| `INTERFACE_MSG` | 사용자 입력 | 파이프(\|) 구분자 메시지 (필수) |
| `INTERFACE_PROTOCOL` | **자동 설정** | "IF_KAFKA" 고정 |

#### 동기 전송

```java
@Service
@RequiredArgsConstructor
public class MyService {

    private final KafkaMessageProducer producer;

    public void sendMessage() {
        // 간단 전송 (필수 필드만)
        SendResult result = producer.send("MMPPMERPTT01", "PQR02012",
            "PQR02012|P|S|5A|20260130111245|JCM_TEST|MMPPMERPTT01|||||20250808|00011|C|");

        // KafkaMessage 객체로 전송
        KafkaMessage msg = KafkaMessage.builder()
            .transactionCode("PQR02012")
            .interfaceMsg("PQR02012|P|S|5A|20260130111245|JCM_TEST|MMPPMERPTT01|||||20250808|00011|C|")
            .build();
        SendResult result2 = producer.send("MMPPMERPTT01", msg);

        if (result.isSuccess()) {
            log.info("전송 성공 - partition: {}, offset: {}",
                result.getPartition(), result.getOffset());
        }
    }
}
```

#### 비동기 전송

```java
// 간단 비동기 전송
producer.sendAsync("MMPPMERPTT01", "PQR02012", "PQR02012|P|S|5A|...",
    new ProducerCallback() {
        @Override
        public void onSuccess(SendResult result) {
            log.info("전송 성공 - offset: {}", result.getOffset());
        }

        @Override
        public void onFailure(KafkaSendException exception) {
            log.error("전송 실패 - {}", exception.getMessage());
        }
    });

// KafkaMessage 객체로 비동기 전송
KafkaMessage msg = KafkaMessage.builder()
    .transactionCode("PQR02012")
    .interfaceMsg("PQR02012|P|S|5A|...")
    .build();
producer.sendAsync("MMPPMERPTT01", msg, callback);
```

---

### REST API

기본 경로: `/kafkaApi`

#### 상태 조회

```http
GET /kafkaApi/status?topicId=my-topic
```

응답:
```json
[
  {
    "TOPIC_ID": "my-topic",
    "TOPIC_DESC": "테스트 토픽",
    "GROUP_ID": "my-group",
    "CONTAINER_STATUS": "RUNNING",
    "CURRENT_OFFSET": 100,
    "MAX_OFFSET": 150
  }
]
```

#### 컨테이너 제어

```http
# 일시정지
POST /kafkaApi/pause
{"topicId": "my-topic"}

# 재개
POST /kafkaApi/resume
{"topicId": "my-topic"}

# 정지
POST /kafkaApi/stop
{"topicId": "my-topic"}

# 시작
POST /kafkaApi/startConsumer
{"topicId": "my-topic"}
```

#### Offset 스킵

```http
POST /kafkaApi/skipOffset
{
  "topicId": "my-topic",
  "groupId": "my-group",
  "count": 1
}
```

응답:
```json
{
  "topicId": "my-topic",
  "groupId": "my-group",
  "beforeCurrentOffset": 100,
  "afterCurrentOffset": 101,
  "maxOffset": 150,
  "success": true
}
```

#### 메시지 조회

```http
# 시간 범위로 조회
GET /kafkaApi/browse?topicId=my-topic&fromTimestamp=1704067200000&toTimestamp=1704153600000&maxCount=50

# 특정 Offset 조회
GET /kafkaApi/peekOffset?topicId=my-topic&offset=105
```

---

## 핸들러 구현 가이드

### 패키지/클래스 규칙

```
com.myproject.handler.{TRANSACTION_CODE}.BusinessStart

예시:
com.myproject.handler.PQR02012.BusinessStart
com.myproject.handler.ABC01234.BusinessStart
```

### Bean 이름 규칙

```java
@Component("{TRANSACTION_CODE}")

예시:
@Component("PQR02012")
@Component("ABC01234")
```

### 핸들러 템플릿

```java
package com.myproject.handler.PQR02012;

import com.dongkuk.caravan.handler.*;
import com.dongkuk.caravan.model.KafkaMessageContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component("PQR02012")
@RequiredArgsConstructor
public class BusinessStart implements KafkaInterfaceHandler {

    private final MyBusinessService businessService;
    private final MyRepository repository;

    @Override
    public HandleResult businessHandle(KafkaMessageContext context) {
        // 1. 메시지 파싱
        String[] msgArr = context.getInterfaceMsgArray();
        // msgArr[0] = TRANSACTION_CODE
        // msgArr[1] = 타입
        // msgArr[2] = 상태
        // ...

        // 2. 비즈니스 로직
        try {
            businessService.process(msgArr);
            return HandleResult.success();
        } catch (Exception e) {
            return HandleResult.fail("ERROR", e.getMessage());
        }
    }
}
```

---

## 에러 처리

### 재시도 정책

1. **재시도 가능 (retryable=true)**
   - 설정된 횟수만큼 재시도
   - 재시도 간 딜레이 적용
   - 최대 재시도 초과 시 컨테이너 일시정지

2. **재시도 불가 (retryable=false)**
   - TB_MCM_MOM_TC_ERROR 테이블에 에러 기록
   - 메시지 커밋 (스킵)
   - 다음 메시지 처리 계속

### 최대 재시도 초과 시 동작

1. TB_MCM_MOM_TC_ERROR 테이블에 에러 기록
2. 컨테이너 일시정지 (PAUSED)
3. Offset 롤백 (실패한 메시지 위치로)
4. `/kafkaApi/resume` API 호출 시 재시작

### 에러 복구 절차

```bash
# 1. 상태 확인
GET /kafkaApi/status?topicId=my-topic

# 2. 문제 메시지 확인
GET /kafkaApi/peekOffset?topicId=my-topic&offset=105

# 3-A. 문제 해결 후 재개
POST /kafkaApi/resume
{"topicId": "my-topic"}

# 3-B. 문제 메시지 스킵 후 재개
POST /kafkaApi/skipOffset
{"topicId": "my-topic", "groupId": "my-group", "count": 1}
```

---

## 테이블 구조

> 상세 DDL은 `docs/SQL/` 디렉토리 참조

### TB_MCM_MOM_KAFKA_TOPICS (토픽 설정)

```sql
CREATE TABLE TB_MCM_MOM_KAFKA_TOPICS (
    TOPIC_ID           VARCHAR(100) PRIMARY KEY,  -- Kafka 토픽명
    TOPIC_DESC         VARCHAR(300),              -- 토픽 설명
    GROUP_ID           VARCHAR(100) NOT NULL,     -- Consumer Group ID
    BIZ_SYSTEM         VARCHAR(5) NOT NULL,       -- 비즈니스 시스템 코드
    SEND_MODULE_ID     VARCHAR(20),               -- 송신 모듈 ID
    RECV_MODULE_ID     VARCHAR(20),               -- 수신 모듈 ID
    USE_TP             VARCHAR(1),                -- 사용 여부
    STATUS             VARCHAR(20),               -- 토픽 상태
    -- 감사 컬럼 (CREATED_*, LAST_UPDATED_*, DATA_END_*, ARCHIVE_*) 생략
);
```

### TB_MCM_MOM_TC_ERROR (에러 로그)

```sql
CREATE TABLE TB_MCM_MOM_TC_ERROR (
    SQ_VAL             NUMBER PRIMARY KEY,        -- PK (SQ_MCM_MOM_TC_ERROR 시퀀스)
    TRANSACTION_CODE   VARCHAR(50),               -- 트랜잭션 코드
    INTERFACE_ID       VARCHAR(100),              -- 토픽명
    INTERFACE_MSG      VARCHAR(65000),            -- 전문 내용
    INTERFACE_PROTOCOL VARCHAR(20),               -- 전송 프로토콜
    ERROR_TYPE         VARCHAR(3),                -- 에러 유형 (S: Send, R: Receive)
    ERROR_CODE         VARCHAR(100),              -- 에러 코드
    ERROR_MSG          VARCHAR(1000),             -- 에러 메시지
    ERROR_STATUS_CODE  VARCHAR(1),                -- 에러 처리 상태 코드
    -- 감사 컬럼 (CREATED_*, LAST_UPDATED_*, DATA_END_*, ARCHIVE_*) 생략
);
```

---

## 라이선스

Internal Use Only - Dongkuk Steel

---

## 버전 히스토리

| 버전 | 날짜 | 변경사항 |
|------|------|----------|
| 1.0.0-SNAPSHOT | 2026-02 | 최초 릴리즈 |
