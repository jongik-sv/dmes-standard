# SERAI (Kafka Integration Service) - 종합 개요 문서

## 1. 시스템 개요

SERAI(Kafka Integration Service)는 **외부 시스템과 내부 시스템 간의 메시지를 중개하는 통합 서비스**다.
HTTP, DB 테이블, SFTP 파일 세 가지 프로토콜을 지원하며, **Kafka를 메시지 허브**로 사용한다.

### 핵심 개념

```
INBOUND:  외부 시스템 → SERAI → Kafka   (메시지를 Kafka로 투입)
OUTBOUND: Kafka → SERAI → 외부 시스템   (Kafka에서 메시지를 꺼내 외부로 전달)
```

### 지원 프로토콜 (3가지)

| 프로토콜 | INBOUND (외부→Kafka) | OUTBOUND (Kafka→외부) |
|----------|---------------------|----------------------|
| **HTTP** | 외부에서 `POST /seraiApi/v1/send` 호출 → Kafka 전송 | 외부 시스템에 HTTP POST 전송 |
| **DB** | IF_* 테이블 폴링 (IF_FLAG='N') → Kafka 전송 → IF_FLAG 업데이트 | IF_* 테이블에 INSERT (IF_FLAG='N') |
| **FILE** | SFTP 서버 폴링 → .txt 파일 라인별 Kafka 전송 → 백업 이동 | SFTP 서버에 .txt 파일 생성 |

---

## 2. 기술 스택

| 항목 | 버전 | 용도 |
|------|------|------|
| **Java** | 11 | 런타임 (Gradle toolchain) |
| **Spring Boot** | 2.7.18 | 웹 서버, DI, 설정 관리 |
| **Caravan** | 1.0.3-SNAPSHOT | Kafka Producer/Consumer 라이브러리 (핵심 의존성) |
| **MyBatis** | 2.3.2 | DB 접근 (듀얼 DataSource) |
| **JSch** | 0.1.55 | SFTP 파일 송수신 |
| **Caffeine** | 2.9.3 | 캐시 라이브러리 |
| **HikariCP** | (Boot 내장) | DB 커넥션 풀 |
| **Tibero** | 6 | 데이터베이스 (Tibero/Oracle 호환) |
| **Gradle** | 8.14 | 빌드 도구 |
| **Lombok** | (Boot 관리) | 보일러플레이트 코드 제거 |
| **JUnit 5** | (Boot 관리) | 단위 테스트 |

### Gradle 의존성 전체 목록 (`build.gradle`)

```groovy
dependencies {
    implementation 'com.dongkuk.caravan:caravan:1.0.3-SNAPSHOT'
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-validation'
    implementation 'org.springframework.boot:spring-boot-starter-jdbc'
    implementation 'org.mybatis.spring.boot:mybatis-spring-boot-starter:2.3.2'
    implementation 'com.jcraft:jsch:0.1.55'
    implementation 'com.github.ben-manes.caffeine:caffeine:2.9.3'
    runtimeOnly fileTree(dir: 'libs', include: ['*.jar'])  // Tibero JDBC
    compileOnly 'org.projectlombok:lombok'
    testImplementation 'org.springframework.boot:spring-boot-starter-test'
}
```

### 의존성 참고

- **Caravan**: 사내 Nexus(`http://172.31.1.96:8889/nexus`)에 publish 되어 있어야 함
  - `KafkaMessageProducer`로 메시지 전송 → `SendResult` (topic, partition, offset) 반환
  - `KafkaInterfaceHandler`를 구현하여 메시지 수신 → `HandleResult` 반환
  - `KafkaMessageContext`로 메시지 컨텍스트 접근 (topic, transactionCode, interfaceId, interfaceMsg, kafkaKeyData, rawMessageMap)
- **Tibero JDBC**: `libs/tibero6-jdbc.jar`에 직접 배치 (Maven/Gradle 저장소 없음)
- **프로젝트 좌표**: `com.dongkuk.dmes:serai:1.0.0-SNAPSHOT`
- **빌드 산출물**: `build/libs/serai.jar` (bootJar)

---

## 3. 전체 메시지 흐름도

```
                    ┌──────────────────────────────────────────────┐
                    │                   Kafka                       │
                    └──────┬───────────────────────────┬───────────┘
                           │                           │
                      INBOUND (send)             OUTBOUND (consume)
                           │                           │
          ┌────────────────┼────────────────┐          │
          │                │                │          │
     [HTTP POST]     [DB Polling]    [FILE Polling]    │
          │                │                │          │
  HttpIntegration   DbPolling       SftpPolling   BusinessStart
  Controller        Scheduler       Scheduler     (SeraiConsumeHandler)
          │                │                │          │
          │          DbPolling        SftpPolling   OutboundRouter
          │          Service          Service          │
          │                │                │     ┌────┼─────┐
          │                │                │     │    │     │
          └───── KafkaMessageProducer ──────┘   [DB] [HTTP] [FILE]
                  (Caravan)                     Handler Handler Handler
```

---

## 4. 프로젝트 패키지 구조

```
src/main/java/com/dongkuk/dmes/serai/
├── SeraiApplication.java                          # Spring Boot 진입점
│                                                  (DataSourceAutoConfiguration, MybatisAutoConfiguration exclude)
├── config/
│   ├── SeraiProperties.java                       # SERAI 설정 (serai.inbound.*, serai.outbound.*)
│   ├── DataSourceConfig.java                    # MST + IF 듀얼 DataSource
│   ├── MstMapper.java                           # MST DataSource 마커 어노테이션
│   └── IfMapper.java                            # IF DataSource 마커 어노테이션
│
├── common/
│   ├── dto/
│   │   ├── IntegrationRequest.java              # HTTP 요청 DTO
│   │   └── IntegrationResponse.java             # HTTP 응답 DTO (Builder + 정적 팩토리)
│   └── util/
│       └── SftpSessionManager.java              # SFTP 세션 캐싱 (INBOUND/OUTBOUND 공유)
│
├── mapper/
│   ├── CaravanHubConfigMapper.java                     # 설정 조회 (@MstMapper → MST DataSource)
│   └── InterfaceMapper.java                     # IF_* 테이블 CRUD (@IfMapper → IF DataSource)
│
├── inbound/
│   ├── http/controller/
│   │   └── HttpIntegrationController.java       # POST /seraiApi/v1/send
│   ├── db/
│   │   ├── scheduler/DbPollingScheduler.java    # DB 폴링 스케줄러 (토픽별 독립 주기)
│   │   └── service/DbPollingService.java        # IF_FLAG='N' 조회 → Kafka 전송 → 'Y'/'E'
│   └── file/
│       ├── scheduler/FilePollingScheduler.java   # FILE 폴링 스케줄러 (토픽별 독립 주기)
│       └── service/SftpPollingService.java       # SFTP 파일 읽기 → 라인별 Kafka 전송
│
├── handler/SeraiConsumeHandler/
│   └── BusinessStart.java                       # Caravan 핸들러 (OUTBOUND 진입점)
│
└── outbound/
    ├── router/OutboundRouter.java               # INTEGRATION_TYPE별 분기 (DB/HTTP/FILE)
    ├── db/DbOutboundHandler.java                # IF 테이블 INSERT
    ├── http/HttpOutboundHandler.java            # HTTP POST 전송 (HttpURLConnection)
    └── file/FileOutboundHandler.java            # SFTP 파일 생성
```

### MyBatis XML 위치

```
src/main/resources/mapper/
├── mst/
│   └── CaravanHubConfigMapper.xml      # 설정 테이블 SQL (MST DataSource)
└── if/
    └── InterfaceMapper.xml       # IF_* 테이블 SQL (IF DataSource)
```

---

## 5. 설정 (Config) 상세

### 5.1 application.yml 전체 (실제 소스 기준)

```yaml
server:
  port: 8200                    # SERAI 서버 포트

spring:
  application:
    name: serai

# Caravan Kafka
caravan:
  kafka:
    enabled: true
    bootstrap-servers: 10.10.90.156:8401,10.10.90.156:8402,10.10.90.156:8403
    biz-system: serai
    producer:
      acks: all                 # 모든 레플리카 확인
      retries: 3                # 프로듀서 재시도 횟수
      timeout-seconds: 10       # 프로듀서 전송 타임아웃
      idempotence: true         # 멱등성 보장 (중복 전송 방지)
    consumer:
      enabled: true
      auto-offset-reset: earliest    # 초기 offset: 가장 오래된 메시지부터
      enable-auto-commit: false      # 수동 커밋 (Caravan이 관리)
      max-poll-records: 1            # 1건씩 처리
      concurrency: 1                 # Consumer 쓰레드 1개
    retry:
      max-attempts: 3           # OUTBOUND 실패 시 재시도 횟수
      delay-ms: 2000            # 재시도 간격 (ms)

# SERAI 고유 설정
serai:
  inbound:
    db:
      enabled: ${INTEGRATION_DB_ENABLED:true}  # 환경변수로 제어 가능 (기본: true)
      thread-pool-size: 10
      batch-size: 100
    file:
      enabled: false            # FILE 폴링은 기본 비활성화 (운영 환경에서 활성화)
      thread-pool-size: 5
  outbound:
    http:
      connect-timeout: 10000
      read-timeout: 30000

# 듀얼 DataSource
spring.datasource:
  mst:                          # 설정 테이블 DB (MST, @Primary)
    driver-class-name: com.tmax.tibero.jdbc.TbDriver
    jdbc-url: jdbc:tibero:thin:@10.10.90.156:4010:DEVDMES
    username: MCMAPUSER
    password: MCMAPUSER_DEV
    hikari:
      maximum-pool-size: 10     # 최대 커넥션 풀 크기
      minimum-idle: 2           # 최소 유휴 커넥션
      connection-timeout: 30000 # 커넥션 획득 타임아웃 (30초)
  if:                           # 인터페이스 테이블 DB (IF)
    driver-class-name: com.tmax.tibero.jdbc.TbDriver
    jdbc-url: jdbc:tibero:thin:@10.10.90.156:4010:DEVDMES
    username: MCMAPUSER
    password: MCMAPUSER_DEV
    hikari:
      maximum-pool-size: 10
      minimum-idle: 2
      connection-timeout: 30000

# Logging
logging:
  level:
    root: INFO
    com.dongkuk.caravan.hub: DEBUG    # SERAI 패키지는 DEBUG
    com.dongkuk.caravan: INFO      # Caravan 라이브러리는 INFO
  pattern:
    console: "%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n"
```

### 5.2 SeraiProperties 바인딩 구조

| yml 경로 | Java 접근 | 기본값 | 사용 클래스 |
|----------|----------|--------|-----------|
| `serai.inbound.db.enabled` | `getInbound().getDb().isEnabled()` | true | DbPollingScheduler |
| `serai.inbound.db.thread-pool-size` | `getInbound().getDb().getThreadPoolSize()` | 10 | DbPollingScheduler |
| `serai.inbound.db.batch-size` | `getInbound().getDb().getBatchSize()` | 100 | DbPollingService |
| `serai.inbound.file.enabled` | `getInbound().getFile().isEnabled()` | true | FilePollingScheduler |
| `serai.inbound.file.thread-pool-size` | `getInbound().getFile().getThreadPoolSize()` | 5 | FilePollingScheduler |
| `serai.outbound.http.connect-timeout` | `getOutbound().getHttp().getConnectTimeout()` | 10000 | HttpOutboundHandler |
| `serai.outbound.http.read-timeout` | `getOutbound().getHttp().getReadTimeout()` | 30000 | HttpOutboundHandler |

### 5.3 듀얼 DataSource 구조

| DataSource | 어노테이션 | 용도 | Mapper | XML 경로 |
|------------|-----------|------|--------|----------|
| **MST** (@Primary) | @MstMapper | 설정 테이블 (`TB_MCM_MOM_KAFKA_SERAI_CONFIG`, `TB_MCM_MOM_KAFKA_TOPICS`) | CaravanHubConfigMapper | `mapper/mst/*.xml` |
| **IF** | @IfMapper | 인터페이스 테이블 (`IF_*` 테이블) | InterfaceMapper | `mapper/if/*.xml` |

- MST가 `@Primary`이므로 Caravan 라이브러리 내부의 MyBatis도 MST DataSource를 사용한다.
- `SeraiApplication.java`에서 `DataSourceAutoConfiguration`과 `MybatisAutoConfiguration`을 **exclude**하여 수동 설정만 적용한다.
- 현재는 같은 DB를 가리키고 있지만, 운영 환경에서 분리될 수 있어 구조적으로 나눠놨다.

### 5.4 설정 DB 테이블

| 테이블 | 용도 |
|--------|------|
| `TB_MCM_MOM_KAFKA_SERAI_CONFIG` | INBOUND/OUTBOUND 설정 (토픽, 프로토콜, 폴링 주기, 접속 정보 등) |
| `TB_MCM_MOM_KAFKA_TOPICS` | Kafka 토픽 마스터 정보 |
| `IF_*` | 인터페이스 메시지 테이블 (INBOUND 폴링 대상 / OUTBOUND INSERT 대상) |

#### TB_MCM_MOM_KAFKA_SERAI_CONFIG 주요 컬럼

| 컬럼 | 설명 |
|------|------|
| TOPIC_ID | Kafka 토픽 ID |
| DIRECTION | `INBOUND` / `OUTBOUND` |
| INTEGRATION_TYPE | `DB` / `HTTP` / `FILE` |
| POLLING_INTERVAL_MS | 폴링 주기 (ms), NULL이면 기본값 1000ms |
| DB_SCHEMA, DB_TABLE_NAME | DB 프로토콜: 대상 테이블 정보 |
| HTTP_URL, HTTP_METHOD | HTTP 프로토콜: 전송 대상 URL/메서드 |
| FTP_HOST, FTP_PORT, FTP_USER, FTP_PASSWORD | FILE 프로토콜: SFTP 접속 정보 |
| FILE_PATH, BACKUP_PATH | FILE 프로토콜: 파일 경로/백업 경로 |
| USE_YN | 활성화 여부 (`Y`/`N`) |

---

## 6. INBOUND 상세 (외부 → Kafka)

### 6.1 INBOUND HTTP

**파일**: `HttpIntegrationController.java`, `IntegrationRequest.java`, `IntegrationResponse.java`

**흐름**:
```
외부 시스템 → POST /seraiApi/v1/send → validateRequest() → KafkaMessageProducer.send() → Kafka
```

**엔드포인트**: `POST /seraiApi/v1/send` (Content-Type: application/json)

**요청 파라미터 (IntegrationRequest)** - Jackson `@JsonProperty`로 대문자 JSON 키 매핑:

| 필드 | 필수 | 설명 |
|------|------|------|
| INTERFACE_ID | O | Kafka 토픽 ID |
| TRANSACTION_CODE | O | 트랜잭션 코드 (Caravan 핸들러 라우팅 키) |
| INTERFACE_MSG | O | 파이프(`\|`) 구분 메시지 본문 |

**검증 로직** (`validateRequest()`):
- 각 필드에 대해 `null` 체크 + `trim().isEmpty()` 체크
- 첫 번째 실패 필드에서 `IllegalArgumentException` 발생 (순서: INTERFACE_ID → TRANSACTION_CODE → INTERFACE_MSG)

**응답 (IntegrationResponse)** - `@Builder` + 정적 팩토리 메서드:

| 상황 | HTTP Status | resultCode | errorCode | 추가 필드 |
|------|------------|------------|-----------|----------|
| 성공 | 200 | SUCCESS | - | KAFKA_KEYDATA (=topic), INTERFACE_ID, timestamp (ISO 8601) |
| 파라미터 오류 | 400 | ERROR | INVALID_PARAMETER | errorMessage |
| 시스템 오류 | 500 | ERROR | SYSTEM_ERROR | errorMessage |

**Caravan SendResult 활용**:
```java
SendResult result = kafkaMessageProducer.send(topic, transactionCode, interfaceMsg);
// result.getTopic(), result.getPartition(), result.getOffset() 로깅
return IntegrationResponse.success(result.getTopic(), topic);
```

**레거시 대비 변경점**: 기존에는 `KafkaMessage` 객체 직접 생성, UUID 직접 생성, `ObjectMapper`로 JSON 직렬화가 필요했지만, Caravan 사용으로 `kafkaMessageProducer.send(topic, transactionCode, interfaceMsg)` 한 줄로 간소화되었다. UUID, INTERFACE_ID, INTERFACE_PROTOCOL은 Caravan이 자동 생성한다.

---

### 6.2 INBOUND DB

**파일**: `DbPollingScheduler.java`, `DbPollingService.java`

**흐름**:
```
TB_MCM_MOM_KAFKA_SERAI_CONFIG (DIRECTION='INBOUND', INTEGRATION_TYPE='DB')
  → 토픽별 독립 폴링 스케줄 등록 (scheduleAtFixedRate)
  → IF_* 테이블에서 IF_FLAG='N' 조회 (ORDER BY CREATION_TIMESTAMP ASC)
  → KafkaMessageProducer.send()
  → 성공: IF_FLAG='Y', IF_DATE, IF_TIME 업데이트
  → 실패: IF_FLAG='E'
```

**핵심 메커니즘**:

| 항목 | 설명 |
|------|------|
| **토픽별 독립 스케줄** | 각 토픽은 `POLLING_INTERVAL_MS` 주기로 독립 실행 |
| **동시 실행 방지** | `AtomicBoolean`으로 같은 토픽의 중복 폴링 방지 (`scheduleAtFixedRate`는 이전 작업 미완료 시에도 트리거됨) |
| **설정 변경 감지** | 60초 주기로 DB 설정 재조회, 신규 토픽 자동 등록 / 비활성화 토픽 자동 제거 |
| **SQL Injection 방지** | MyBatis `${TABLE_NAME}` 사용 전 SERAI_CONFIG에 등록된 테이블인지 검증 |
| **낙관적 락** | UPDATE WHERE `LAST_UPDATE_TIMESTAMP` 조건으로 동시 처리 충돌 방지 |
| **메시지 순서** | 테이블 내 `ORDER BY CREATION_TIMESTAMP ASC` 보장, 테이블 간은 병렬 (독립 스레드) |
| **Graceful Shutdown** | `@PreDestroy`에서 ScheduledFuture 취소 → `scheduler.shutdown()` → 60초 대기 → `shutdownNow()` |

**주의**: 기존 토픽의 `POLLING_INTERVAL_MS`가 변경되어도 기존 스케줄은 갱신되지 않는다. 반영하려면 앱 재시작 필요.

---

### 6.3 INBOUND FILE (SFTP)

**파일**: `FilePollingScheduler.java`, `SftpPollingService.java`, `SftpSessionManager.java`

**흐름**:
```
TB_MCM_MOM_KAFKA_SERAI_CONFIG (DIRECTION='INBOUND', INTEGRATION_TYPE='FILE')
  → 토픽별 독립 폴링 스케줄 등록
  → SFTP 서버 접속 → FILE_PATH에서 .txt 파일 조회
  → 파일 내용 라인별 파싱 → KafkaMessageProducer.send()
  → 처리 완료된 파일은 BACKUP_PATH로 이동 (channelSftp.rename)
```

**TRANSACTION_CODE 추출 규칙**:
```
INTERFACE_MSG: "PQR02012|P|S|5A|20260130|..."
                ^^^^^^^^
                첫 번째 파이프(|) 앞 = TRANSACTION_CODE
                파이프 없으면 → 전체 문자열이 TRANSACTION_CODE
```

**에러 처리 정책**:

| 에러 유형 | 처리 방식 |
|----------|----------|
| JSchException (세션 오류) | 세션 캐시에서 제거 → 다음 폴링 때 재연결 |
| SftpException (SFTP 명령 오류) | 로그만 남기고 다음 파일 처리 |
| 라인 전송 실패 | 해당 라인만 실패 카운트, 나머지 라인 계속 처리 |
| 파일 내 일부 실패 | **파일은 백업으로 이동됨** (재처리 안 됨) |

**SftpSessionManager (공통 유틸)**:

- INBOUND(SftpPollingService)와 OUTBOUND(FileOutboundHandler) 모두 사용
- 캐시 저장소: `ConcurrentHashMap<String, Session>`
- 캐시 키: `"호스트:포트:유저"` (예: `"10.10.90.156:22:sftpuser"`)
- **세션만 캐싱** (TCP 연결 + SSH 핸드셰이크 비용 크다), **채널은 매번 새로 생성** (스레드 안전 문제)
- `getOrCreateSession()`은 `synchronized` 메서드
- 세션 생성 시: `StrictHostKeyChecking=no`, `PreferredAuthentications=password`, 연결 타임아웃 10초
- SFTP 채널 연결 타임아웃: 5초 (`channelSftp.connect(5000)`)
- 파일 읽기 버퍼: 8192 bytes
- `@PreDestroy`에서 모든 세션 disconnect

**FilePollingScheduler vs DbPollingScheduler**: 설정 조회와 서비스 호출 대상만 다르고, 스케줄링 로직(scheduleAtFixedRate, AtomicBoolean 동시실행 방지, 60초 설정 갱신, @PreDestroy 종료)은 동일 패턴이다.

---

## 7. OUTBOUND 상세 (Kafka → 외부)

### 7.1 OUTBOUND 공통 흐름

```
Kafka 메시지 수신
  → Caravan이 TRANSACTION_CODE로 Bean 조회
  → "SeraiConsumeHandler" Bean의 BusinessStart.businessHandle(context) 호출
  → OutboundRouter.route(context)
    → CaravanHubConfigMapper.selectOutboundConfig(topicId) 설정 조회
    → INTEGRATION_TYPE 분기:
       "DB"   → DbOutboundHandler.handle()
       "HTTP" → HttpOutboundHandler.handle()
       "FILE" → FileOutboundHandler.handle()
```

**Caravan 핸들러 등록**: `@Component("SeraiConsumeHandler")`로 Bean 이름 = TRANSACTION_CODE 매핑.

**OutboundRouter 라우팅**: `equalsIgnoreCase()`로 INTEGRATION_TYPE 비교 → 대소문자 무관 (`"DB"`, `"db"` 모두 매칭)

**KafkaMessageContext 주요 메서드**:
- `context.getTopic()` - Kafka 토픽
- `context.getTransactionCode()` - 트랜잭션 코드
- `context.getInterfaceId()` - 인터페이스 ID (토픽 ID)
- `context.getInterfaceMsg()` - 인터페이스 메시지 본문
- `context.getKafkaKeyData()` - Kafka 메시지 키 (UUID)
- `context.getRawMessageMap()` - Kafka 원본 메시지 전체 (Map)

**HandleResult 반환 정책**:
- 성공 → `HandleResult.success()`
- 실패 → `HandleResult.failRetryable("SERAI_OUTBOUND_ERROR", e.getMessage())`
  - `caravan.kafka.retry.max-attempts` (기본 3회)만큼 재시도
  - 재시도 간격: `caravan.kafka.retry.delay-ms` (기본 2000ms)
  - 모든 재시도 실패 → 컨테이너 일시정지 (수동 resume 필요)

---

### 7.2 OUTBOUND DB

**파일**: `DbOutboundHandler.java`

Kafka 메시지를 IF_* 테이블에 INSERT한다.

**처리 순서**:
1. config에서 `DB_TABLE_NAME`, `DB_SCHEMA` 추출
2. context에서 `TRANSACTION_CODE`, `INTERFACE_ID`, `INTERFACE_MSG` 추출
3. 테이블명 검증 (정규식: `^[A-Za-z_][A-Za-z0-9_]*$`) - SQL Injection 방지
4. `InterfaceMapper.insertOutboundData()` 실행

**INSERT 컬럼 매핑**:

| 컬럼 | 값 |
|------|-----|
| TRANSACTION_CODE | context에서 추출 |
| INTERFACE_ID | context에서 추출 |
| INTERFACE_MSG | context에서 추출 |
| IF_FLAG | `'N'` (미처리 상태) |
| CREATION_TIMESTAMP | SYSTIMESTAMP |
| CREATED_OBJECT_TYPE | `'S'` |
| CREATED_OBJECT_ID | `'SERAI'` |
| CREATED_PROGRAM_ID | `'DbOutboundHandler'` |

---

### 7.3 OUTBOUND HTTP

**파일**: `HttpOutboundHandler.java`

Kafka 메시지를 외부 시스템에 HTTP POST로 전달한다.

**처리 순서**:
1. config에서 `HTTP_URL`, `HTTP_METHOD` 추출 (기본값: POST)
2. `context.getRawMessageMap()`을 `ObjectMapper.writeValueAsString()`으로 JSON 직렬화
3. `HttpURLConnection`으로 전송
4. 응답 코드 200~299 → 성공 (응답 본문 DEBUG 로깅), 그 외 → `IllegalStateException` (에러 응답 본문 WARN 로깅)

**HTTP 요청 헤더**:
- `Content-Type: application/json; charset=UTF-8`
- `Accept: application/json`

**전송 JSON 예시** (Kafka 원본 메시지 전체 = `context.getRawMessageMap()`):
```json
{
  "TRANSACTION_CODE": "SeraiConsumeHandler",
  "KAFKA_KEYDATA": "uuid...",
  "INTERFACE_ID": "TOPIC_ID",
  "INTERFACE_MSG": "...",
  "INTERFACE_PROTOCOL": "IF_KAFKA"
}
```

**타임아웃**: `serai.outbound.http.connect-timeout` (기본 10초), `serai.outbound.http.read-timeout` (기본 30초)

**에러 응답 처리**: 2xx가 아닌 응답 시 에러 스트림(`getErrorStream()`)을 읽어 WARN 로그에 기록한 후 `IllegalStateException` 발생

---

### 7.4 OUTBOUND FILE (SFTP)

**파일**: `FileOutboundHandler.java`

Kafka 메시지를 SFTP 서버에 파일로 생성한다.

**처리 순서**:
1. config에서 `FILE_PATH`, SFTP 접속 정보 추출
2. context에서 `INTERFACE_ID`, `KAFKA_KEYDATA`, `INTERFACE_MSG` 추출
3. 파일명 생성
4. `SftpSessionManager`로 세션 획득 → 채널 생성 → `channelSftp.put()`으로 업로드 → 채널 닫기

**파일명 규칙**:
```
{TOPIC_ID}_{yyyyMMddHHmmss}_{UUID앞8자리}.txt
예: MMPPMMCMTT01_20260205105500_840d4999.txt
```
- UUID 앞 8자리: `KAFKA_KEYDATA`에서 하이픈 제거 후 추출
- `KAFKA_KEYDATA`가 null이거나 8자 미만이면 `System.currentTimeMillis()` 기반 대체값 사용

**파일 내용**: `INTERFACE_MSG` 값이 그대로 파일 내용 (UTF-8 인코딩)

---

## 8. MyBatis Mapper 상세

### 8.1 CaravanHubConfigMapper (MST DataSource)

설정 테이블 조회용. `@MstMapper` 어노테이션.

| 메서드 | 용도 | 호출자 |
|--------|------|--------|
| `selectDbInboundConfigs` | DB INBOUND 폴링 대상 조회 | DbPollingScheduler |
| `selectFileInboundConfigs` | FILE INBOUND 폴링 대상 조회 | FilePollingScheduler |
| `selectOutboundConfig` | OUTBOUND 설정 조회 (토픽별) | OutboundRouter |
| `isValidTableName` | SQL Injection 방지용 테이블명 검증 | DbPollingService |

**selectDbInboundConfigs 핵심 SQL**:
```sql
SELECT c.TOPIC_ID,
       c.DB_SCHEMA || '.' || c.DB_TABLE_NAME AS TABLE_NAME,
       NVL(c.POLLING_INTERVAL_MS, 1000) AS POLLING_INTERVAL_MS,
       t.GROUP_ID
FROM TB_MCM_MOM_KAFKA_SERAI_CONFIG c
INNER JOIN TB_MCM_MOM_KAFKA_TOPICS t ON c.TOPIC_ID = t.TOPIC_ID
WHERE c.INTEGRATION_TYPE = 'DB' AND c.DIRECTION = 'INBOUND'
  AND c.USE_YN = 'Y' AND t.USE_TP = 'Y'
```

### 8.2 InterfaceMapper (IF DataSource)

IF_* 인터페이스 테이블 CRUD. `@IfMapper` 어노테이션.

| 메서드 | 용도 | 호출자 |
|--------|------|--------|
| `selectPendingMessages` | IF_FLAG='N' 미처리 메시지 조회 | DbPollingService |
| `updateSuccess` | 전송 성공 → IF_FLAG='Y' | DbPollingService |
| `updateError` | 전송 실패 → IF_FLAG='E' | DbPollingService |
| `insertOutboundData` | OUTBOUND 수신 메시지 INSERT | DbOutboundHandler |

**selectPendingMessages 반환 컬럼** (실제 SQL 기준):
- `LAST_UPDATE_TIMESTAMP`, `TRANSACTION_CODE`, `INTERFACE_ID`, `INTERFACE_MSG`
- `KEY_DATA1`, `KEY_DATA2`, `KEY_DATA3`, `IF_SEQ` (추가 컬럼)

**`${}` vs `#{}`**:
- `${TABLE_NAME}`: SQL 문자열 치환 (테이블명은 `?` 바인딩 불가) → SQL Injection 위험 → `isValidTableName()`으로 사전 검증
- `#{LIMIT}`: PreparedStatement 파라미터 바인딩 (안전)

**낙관적 락**: `UPDATE WHERE LAST_UPDATE_TIMESTAMP = #{LAST_UPDATE_TIMESTAMP} AND TRANSACTION_CODE = #{TRANSACTION_CODE}` 조건으로 동시 처리 충돌 방지

**updateSuccess/updateError 추가 SET 컬럼**:
- `LAST_UPDATED_OBJECT_TYPE = 'S'`
- `LAST_UPDATED_OBJECT_ID = 'SERAI'`
- `LAST_UPDATE_PROGRAM_ID = 'DbPollingService'`

### 8.3 MyBatis Configuration 설정

| 설정 | 값 | 의미 |
|------|-----|------|
| `mapUnderscoreToCamelCase` | false | 컬럼명 그대로 매핑 (언더스코어→카멜 변환 안 함) |
| `callSettersOnNulls` | true | NULL 값도 Map에 키 포함 |

### 8.4 새 Mapper/SQL 추가 가이드

1. **MST 테이블** 접근 → 인터페이스에 `@MstMapper` + XML은 `resources/mapper/mst/`
2. **IF 테이블** 접근 → 인터페이스에 `@IfMapper` + XML은 `resources/mapper/if/`
3. namespace는 인터페이스 전체 경로와 일치해야 함:
   - `com.dongkuk.caravan.hub.mapper.CaravanHubConfigMapper`
   - `com.dongkuk.caravan.hub.mapper.InterfaceMapper`

---

## 9. Caravan REST API (Kafka 관리)

Caravan 라이브러리가 제공하는 Kafka 관리 API:

| 메서드 | 엔드포인트 | 용도 |
|--------|-----------|------|
| GET | `/kafkaApi/status?topicId={topicId}` | 컨테이너 상태 조회 |
| POST | `/kafkaApi/pause` | 컨테이너 일시정지 |
| POST | `/kafkaApi/resume` | 컨테이너 재개 |
| POST | `/kafkaApi/skipOffset` | 오프셋 스킵 (count 만큼) |

---

## 10. 트러블슈팅 가이드

### 10.1 OUTBOUND 처리 실패 시

**증상**: 핸들러에서 에러 → Caravan이 재시도 후 컨테이너 일시정지

**복구 절차**:
1. `GET /kafkaApi/status?topicId={topicId}` → status=`PAUSED` 확인
2. 원인 확인 및 해결
3. `POST /kafkaApi/resume {"topicId": "..."}`

**메시지 스킵 (처리 불가 메시지)**:
```
POST /kafkaApi/skipOffset {"topicId": "...", "groupId": "...", "count": 1}
POST /kafkaApi/resume {"topicId": "..."}
```

### 10.2 DB INBOUND 폴링 안 될 때

1. `serai.inbound.db.enabled`가 `true`인가?
2. `TB_MCM_MOM_KAFKA_SERAI_CONFIG`: `DIRECTION='INBOUND'`, `INTEGRATION_TYPE='DB'`, `USE_YN='Y'`?
3. `TB_MCM_MOM_KAFKA_TOPICS`: `USE_TP='Y'`?
4. IF_* 테이블에 `IF_FLAG='N'` 데이터 있는가?
5. 신규 토픽 추가 시 **최대 60초 후** 자동 감지, 즉시 반영하려면 앱 재시작

### 10.3 FILE INBOUND 폴링 안 될 때

1. `serai.inbound.file.enabled`가 `true`인가?
2. SFTP 접속 정보 정확한가? (FTP_HOST, FTP_PORT, FTP_USER, FTP_PASSWORD)
3. FILE_PATH, BACKUP_PATH 디렉토리 존재하는가?
4. 파일 확장자가 `.txt`인가? (다른 확장자는 스킵)
5. `StrictHostKeyChecking=no` 설정이라 known_hosts 문제는 아님

### 10.4 DataSource 연결 실패

- `jdbc-url` 형식: `jdbc:tibero:thin:@HOST:PORT:SID`
- DB 서버 상태, 방화벽, 계정/비밀번호 확인
- `libs/` 폴더에 `tibero6-jdbc.jar` 존재 확인

### 10.5 빌드 오류

| 에러 | 원인 | 해결 |
|------|------|------|
| `invalid source release: 11` | Gradle이 JDK 8로 실행 | JDK 11 설치 필요 |
| `UnsupportedClassVersionError: class file version 55.0` | 실행 JDK가 8 | JDK 11로 변경 |
| Tibero JDBC not found | `libs/tibero6-jdbc.jar` 없음 | 파일 직접 복사 |

---

## 11. 빌드 & 실행

```bash
# 빌드 (libs/에 tibero6-jdbc.jar 필요)
gradlew build -x test

# 실행
java -jar build/libs/serai.jar

# DB 폴링 비활성화 실행
java -jar build/libs/serai.jar --serai.inbound.db.enabled=false

# FILE 폴링 비활성화 실행
java -jar build/libs/serai.jar --serai.inbound.file.enabled=false
```

---

## 12. 테스트 케이스 요약

### 12.1 INBOUND HTTP 테스트 (10건)

| TC | 내용 | 검증 포인트 |
|----|------|-----------|
| TC-HTTP-001 | 정상 전송 | 200 OK, Kafka 메시지 도착 |
| TC-HTTP-002 | INTERFACE_ID 누락 | 400, INVALID_PARAMETER |
| TC-HTTP-003 | TRANSACTION_CODE 누락 | 400, INVALID_PARAMETER |
| TC-HTTP-004 | INTERFACE_MSG 누락 | 400, INVALID_PARAMETER |
| TC-HTTP-005 | 빈 문자열/공백 파라미터 | 400, trim() 후 검증 |
| TC-HTTP-006 | Kafka 브로커 장애 | 500, SYSTEM_ERROR |
| TC-HTTP-007 | 빈 JSON Body | 400 |
| TC-HTTP-008 | 대용량 INTERFACE_MSG (1MB) | 정상 또는 크기 제한 에러 |
| TC-HTTP-009 | 동시 다건 전송 (10스레드) | 모든 요청 200, 메시지 유실 없음 |
| TC-HTTP-010 | 잘못된 Content-Type | 415 또는 400 |

### 12.2 INBOUND DB 테스트 (12건)

| TC | 내용 | 검증 포인트 |
|----|------|-----------|
| TC-DB-001 | 정상 폴링 및 Kafka 전송 | IF_FLAG='Y', Kafka 도착 |
| TC-DB-002 | Kafka 전송 실패 | IF_FLAG='E' |
| TC-DB-003 | 미처리 메시지 없음 | 정상 종료, 에러 없음 |
| TC-DB-004 | batchSize 제한 | 지정 건수만 처리 |
| TC-DB-005 | 메시지 순서 보장 | CREATION_TIMESTAMP 순서 |
| TC-DB-006 | 유효하지 않은 테이블명 | 스킵, WARN 로그 |
| TC-DB-007 | 동시 실행 방지 (AtomicBoolean) | 중복 실행 없음 |
| TC-DB-008 | 낙관적 락 검증 | 동시 처리 충돌 방지 |
| TC-DB-009 | 설정 변경 자동 감지 (60초) | 신규 토픽 자동 등록 |
| TC-DB-010 | 토픽 비활성화 시 스케줄 제거 | 폴링 중지 |
| TC-DB-011 | DB 비활성화 설정 | 스케줄러 미생성 |
| TC-DB-012 | Graceful Shutdown | 실행 중 작업 완료 대기 |

### 12.3 INBOUND FILE 테스트 (12건)

| TC | 내용 | 검증 포인트 |
|----|------|-----------|
| TC-FILE-001 | 정상 파일 폴링 | 라인별 Kafka 전송, 백업 이동 |
| TC-FILE-002 | TRANSACTION_CODE 추출 규칙 | 파이프 앞 문자열 추출 |
| TC-FILE-003 | 빈 파일 처리 | 스킵, 백업 이동만 |
| TC-FILE-004 | .txt 이외 파일 스킵 | .txt만 처리 |
| TC-FILE-005 | 디렉토리 엔트리 스킵 | ".", "..", 하위 디렉토리 무시 |
| TC-FILE-006 | 라인 일부 전송 실패 | 나머지 라인 계속 처리, 파일 백업 이동 |
| TC-FILE-007 | SFTP 연결 실패 | 세션 생성 실패 로그, 다음 폴링 재시도 |
| TC-FILE-008 | SFTP 세션 끊어짐 후 재연결 | 캐시 제거, 새 세션 생성 |
| TC-FILE-009 | BACKUP_PATH 미존재 | rename 실패, 원본 유지 |
| TC-FILE-010 | 여러 파일 동시 처리 | 모든 .txt 파일 처리 |
| TC-FILE-011 | 세션 캐싱 공유 확인 | 동일 호스트 1개 세션 공유 |
| TC-FILE-012 | FILE 비활성화 설정 | 스케줄러 미생성 |

### 12.4 OUTBOUND DB 테스트 (7건)

| TC | 내용 | 검증 포인트 |
|----|------|-----------|
| TC-ODB-001 | 정상 DB INSERT | IF_FLAG='N', 모든 컬럼 매핑 |
| TC-ODB-002 | DB_TABLE_NAME 미설정 | IllegalStateException, 컨테이너 일시정지 |
| TC-ODB-003 | SQL Injection 방지 | 정규식 패턴 검증 |
| TC-ODB-004 | OUTBOUND 설정 미존재 | IllegalStateException |
| TC-ODB-005 | 재시도 동작 | max-attempts만큼, delay-ms 간격 |
| TC-ODB-006 | 컨테이너 일시정지 후 복구 | resume으로 재처리 |
| TC-ODB-007 | 메시지 스킵 | skipOffset + resume |

### 12.5 OUTBOUND HTTP 테스트 (10건)

| TC | 내용 | 검증 포인트 |
|----|------|-----------|
| TC-OHTTP-001 | 정상 HTTP POST 전송 | JSON Body 전체 전송, 200 성공 |
| TC-OHTTP-002 | HTTP_METHOD 기본값 | NULL이면 POST |
| TC-OHTTP-003 | HTTP_URL 미설정 | IllegalStateException |
| TC-OHTTP-004 | 4xx 응답 | failRetryable, 재시도 |
| TC-OHTTP-005 | 5xx 응답 | 재시도, 서버 복구 시 성공 |
| TC-OHTTP-006 | 연결 타임아웃 | connect-timeout 적용 |
| TC-OHTTP-007 | 읽기 타임아웃 | read-timeout 적용 |
| TC-OHTTP-008 | 2xx 범위 응답 (201, 204) | 200~299 모두 성공 |
| TC-OHTTP-009 | 타임아웃 설정 변경 | yml 값 반영 확인 |
| TC-OHTTP-010 | 대형 메시지 전송 | 크기 제한 에러 처리 |

### 12.6 OUTBOUND FILE 테스트 (10건)

| TC | 내용 | 검증 포인트 |
|----|------|-----------|
| TC-OFILE-001 | 정상 SFTP 파일 생성 | 파일명 규칙, UTF-8 내용 |
| TC-OFILE-002 | 파일명 생성 규칙 검증 | UUID 앞 8자, 대체값 |
| TC-OFILE-003 | FILE_PATH 미설정 | IllegalStateException |
| TC-OFILE-004 | FTP_HOST 미설정 | IllegalStateException |
| TC-OFILE-005 | INTERFACE_MSG 미존재 | IllegalStateException |
| TC-OFILE-006 | SFTP 연결 실패 | failRetryable, 재시도 |
| TC-OFILE-007 | SFTP 채널 오류 시 캐시 제거 | removeSession, 재연결 |
| TC-OFILE-008 | FILE_PATH 디렉토리 미존재 | SftpException, 재시도 |
| TC-OFILE-009 | 동일 토픽 연속 메시지 | 별도 파일 생성 |
| TC-OFILE-010 | FTP_PORT 기본값 | NULL이면 22 |

### 12.7 설정(Config) 테스트 (9건)

| TC | 내용 | 검증 포인트 |
|----|------|-----------|
| TC-CFG-001 | SeraiProperties yml 바인딩 | 모든 설정값 정상 바인딩 |
| TC-CFG-002 | SeraiProperties 기본값 | yml 미설정 시 기본값 적용 |
| TC-CFG-003 | MST DataSource 연결 | @Primary, Caravan 공유 |
| TC-CFG-004 | IF DataSource 연결 | MST와 독립 동작 |
| TC-CFG-005 | DataSource 연결 실패 | 앱 기동 실패 |
| TC-CFG-006 | Mapper↔DataSource 분리 | @MstMapper→MST, @IfMapper→IF |
| TC-CFG-007 | MyBatis Configuration | camelCase=false, nulls=true |
| TC-CFG-008 | Tibero JDBC 드라이버 | libs/ 존재 확인 |
| TC-CFG-009 | AutoConfiguration exclude | 수동 설정만 적용 |

### 12.8 E2E (End-to-End) 테스트 (10건)

| TC | 내용 | INBOUND → OUTBOUND |
|----|------|-------------------|
| TC-E2E-001 | HTTP → Kafka → DB | HTTP IN + DB OUT |
| TC-E2E-002 | DB → Kafka → HTTP | DB IN + HTTP OUT |
| TC-E2E-003 | FILE → Kafka → DB | FILE IN + DB OUT |
| TC-E2E-004 | DB → Kafka → FILE | DB IN + FILE OUT |
| TC-E2E-005 | HTTP → Kafka → FILE | HTTP IN + FILE OUT |
| TC-E2E-006 | HTTP → Kafka → HTTP | HTTP IN + HTTP OUT |
| TC-E2E-007 | 다중 토픽 동시 처리 | 3개 토픽 독립 동작 |
| TC-E2E-008 | 장애 전파 격리 | 1개 장애가 다른 토픽에 영향 없음 |
| TC-E2E-009 | 전체 시스템 재시작 후 복구 | Graceful Shutdown + 재기동 |
| TC-E2E-010 | 성능 부하 테스트 | DB 1000건, HTTP 100건 동시, FILE 10파일 |

**총 테스트 케이스: 80건**

---

## 13. 구현된 단위 테스트 (JUnit 5)

### 13.1 테스트 구조 개요

```
src/test/java/com/dongkuk/dmes/serai/
├── config/
│   └── SeraiPropertiesTest.java                # 설정 바인딩/기본값
├── common/
│   ├── dto/
│   │   └── IntegrationResponseTest.java      # 응답 DTO 팩토리
│   └── util/
│       └── SftpSessionManagerTest.java       # SFTP 세션 캐싱
├── inbound/
│   ├── http/controller/
│   │   └── HttpIntegrationControllerTest.java # HTTP 컨트롤러
│   ├── db/
│   │   ├── scheduler/DbPollingSchedulerTest.java
│   │   └── service/DbPollingServiceTest.java
│   └── file/
│       ├── scheduler/FilePollingSchedulerTest.java
│       └── service/SftpPollingServiceTest.java
├── handler/SeraiConsumeHandler/
│   └── BusinessStartTest.java                # OUTBOUND 진입점
└── outbound/
    ├── router/OutboundRouterTest.java
    ├── db/DbOutboundHandlerTest.java
    ├── http/HttpOutboundHandlerTest.java
    └── file/FileOutboundHandlerTest.java
```

**총 13개 테스트 클래스**, **100+ 테스트 메서드**

### 13.2 테스트 패턴

- **JUnit 5 `@Nested`**: 모든 테스트 클래스가 `@Nested` 내부 클래스로 시나리오 그룹화
- **Mockito**: `@Mock`, `@InjectMocks`, `@ExtendWith(MockitoExtension.class)` 사용
- **MockMvc**: `HttpIntegrationControllerTest`에서 `@WebMvcTest` + `MockMvc` 사용
- **AssertJ**: `assertThat()` 스타일 assertion
- **ReflectionTestUtils**: private 필드 주입 (`@Value` 등이 아닌 `@Autowired` 필드 테스트)

### 13.3 테스트 클래스 상세

| # | 테스트 클래스 | @Nested 그룹 | 주요 검증 내용 |
|---|-------------|-------------|--------------|
| 1 | `HttpIntegrationControllerTest` | 8개: NormalSend, MissingInterfaceId, MissingTransactionCode, MissingInterfaceMsg, EmptyStringParameters, KafkaFailure, EmptyJsonBody, ConcurrentSend | 정상 전송, 필수 파라미터 누락(400), Kafka 장애(500), 빈 JSON(400), 10스레드 동시 전송 |
| 2 | `DbPollingServiceTest` | 5개: NormalPolling, KafkaSendFailure, NoPendingMessages, BatchSizeLimit, InvalidTableName | 정상 폴링→Kafka전송→FLAG='Y', 실패→FLAG='E', 미처리 없음, 배치 제한, SQL Injection 방지 |
| 3 | `DbPollingSchedulerTest` | 4개: ScheduleRegistration, DisabledDb, ConcurrentExecutionPrevention, GracefulShutdown | 스케줄 등록, DB 비활성화 시 미등록, AtomicBoolean 동시실행 방지, 60초 graceful shutdown |
| 4 | `SftpPollingServiceTest` | 9개: NormalFilePolling, TransactionCodeExtraction, EmptyFile, NonTxtFileSkip, DirectorySkip, PartialLineFailure, SftpConnectionFailure, SftpSessionDisconnect, MultipleFiles | TC 추출 규칙, .txt 필터, 디렉토리 스킵, 부분 실패, 세션 재연결, 다중 파일 |
| 5 | `FilePollingSchedulerTest` | 3개: DisabledFile, ScheduleRegistration, GracefulShutdown | FILE 비활성화, 스케줄 등록, graceful shutdown |
| 6 | `BusinessStartTest` | 2개: SuccessScenario, RouterFailure | OutboundRouter 성공→HandleResult.success(), 실패→HandleResult.failRetryable() |
| 7 | `OutboundRouterTest` | 2개: TypeRouting, ConfigErrors | DB/HTTP/FILE 대소문자 무관 라우팅, 설정 미존재/미지원 타입 에러 |
| 8 | `DbOutboundHandlerTest` | 3개: NormalInsert, MissingTableName, InvalidTableName | 정상 INSERT, 테이블명 누락, SQL Injection 패턴 거부 (`;DROP TABLE`, `' OR '1'='1`) |
| 9 | `HttpOutboundHandlerTest` | 4개: DefaultHttpMethod, MissingHttpUrl, ConnectionTimeout, MessageSerialization | POST 기본값, URL 누락, 타임아웃, JSON 직렬화 |
| 10 | `FileOutboundHandlerTest` | 6개: NormalFileCreation, FileNameGeneration, MissingConfig, SftpConnectionFailure, SftpChannelError, DefaultFtpPort | 파일 생성, 파일명 규칙(UUID 8자), 설정 누락, SFTP 에러, 기본 포트 22 |
| 11 | `SeraiPropertiesTest` | 3개: DefaultValues, ConfigBinding, InnerClassIndependence | 기본값 검증, yml 바인딩, 내부 클래스 독립성 |
| 12 | `IntegrationResponseTest` | 2개: SuccessFactory, ErrorFactory | `success()` 팩토리(resultCode, kafkaKeydata, timestamp), `error()` 팩토리(errorCode, errorMessage) |
| 13 | `SftpSessionManagerTest` | 4개: SessionCreation, SessionRemoval, ServiceShutdown, CacheKeyDistinction | 세션 생성/캐싱, removeSession(), @PreDestroy, 캐시 키 `호스트:포트:유저` 구분 |

### 13.4 Mocking 전략

| 대상 | Mock 방식 | 이유 |
|------|----------|------|
| `KafkaMessageProducer` | `@Mock` | 실제 Kafka 브로커 불필요 |
| `CaravanHubConfigMapper` | `@Mock` | 실제 MST DB 불필요 |
| `InterfaceMapper` | `@Mock` | 실제 IF DB 불필요 |
| `KafkaMessageContext` | `@Mock` | Caravan 내부 객체 |
| `SftpSessionManager` | `@Mock` | 실제 SFTP 서버 불필요 |
| `JSch`, `Session`, `ChannelSftp` | `@Mock` | JSch 라이브러리 객체 |
| `OutboundRouter` | `@Mock` | BusinessStartTest에서 라우터 격리 |
| `SeraiProperties` | `@Mock` 또는 직접 생성 | 타임아웃 등 설정값 제어 |

### 13.5 테스트 실행

```bash
# 전체 테스트 실행
gradlew test

# 특정 테스트 클래스 실행
gradlew test --tests "com.dongkuk.caravan.hub.inbound.http.controller.HttpIntegrationControllerTest"

# 테스트 리포트
build/reports/tests/test/index.html
```

---

## 14. 문서 구성 (docs/)

| 파일 | 내용 |
|------|------|
| `00-OVERVIEW.md` | **이 문서** - 전체 종합 개요 |
| `01-ARCHITECTURE.md` | 아키텍처 개요, 메시지 흐름, 패키지 구조 |
| `02-CONFIG.md` | SeraiProperties, DataSourceConfig, 듀얼 DataSource |
| `03-INBOUND-HTTP.md` | HTTP INBOUND 컨트롤러, DTO, API 스펙 |
| `04-INBOUND-DB.md` | DB INBOUND 스케줄러, 폴링 서비스, 낙관적 락 |
| `05-INBOUND-FILE.md` | FILE INBOUND 스케줄러, SFTP 폴링, 세션 캐싱 |
| `06-OUTBOUND.md` | OUTBOUND 전체 (BusinessStart, Router, DB/HTTP/FILE Handler) |
| `07-MYBATIS.md` | CaravanHubConfigMapper, InterfaceMapper, SQL 상세 |
| `08-TROUBLESHOOTING.md` | 트러블슈팅 가이드 |
| `test/01-TEST-INBOUND-HTTP.md` | HTTP INBOUND 테스트 (10건) |
| `test/02-TEST-INBOUND-DB.md` | DB INBOUND 테스트 (12건) |
| `test/03-TEST-INBOUND-FILE.md` | FILE INBOUND 테스트 (12건) |
| `test/04-TEST-OUTBOUND-DB.md` | OUTBOUND DB 테스트 (7건) |
| `test/05-TEST-OUTBOUND-HTTP.md` | OUTBOUND HTTP 테스트 (10건) |
| `test/06-TEST-OUTBOUND-FILE.md` | OUTBOUND FILE 테스트 (10건) |
| `test/07-TEST-CONFIG.md` | 설정 테스트 (9건) |
| `test/08-TEST-E2E.md` | E2E 통합 테스트 (10건) |
