# SERAI Spring Boot 경량화 마이그레이션 상세 계획

> 작성일: 2026-02-03
> 최종 수정일: 2026-02-04 (Spring Boot 2.7.x 기준으로 변경)
> 프로젝트: DMES SERAI (Kafka Integration Service)
> 목표: cactus-dmesfw → caravan + Spring Boot 2.7.x 전환

---

## 1. 마이그레이션 개요

### 1.1 현재 상태 vs 목표 상태

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              현재 상태                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  Framework    │ cactus-dmesfw + OASIS + eGovFrame                           │
│  Java         │ 11                                                          │
│  Build        │ Maven (pom.xml)                                             │
│  Package      │ WAR                                                         │
│  Server       │ JEUS                                                        │
│  Kafka        │ cactus-dmesfw 내장 (KafkaConfig, DMomKafkaProducerService)  │
│  OUTBOUND     │ OASIS BPMN Task (SeraiReceive.bpmn)                           │
│  DB Access    │ OASIS TransactionalDao (3개 DataSource)                     │
│  Config       │ XML 설정 파일 다수                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              목표 상태                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  Framework    │ Spring Boot 2.7.x + caravan (Kafka 라이브러리)               │
│  Java         │ 11 (LTS)                                                    │
│  Build        │ Gradle (build.gradle)                                       │
│  Package      │ JAR (내장 톰캣)                                              │
│  Server       │ 내장 톰캣 (JEUS 불필요)                                       │
│  Kafka        │ caravan (Spring Kafka 기반, Consumer/Producer/REST API 자동 제공) │
│  OUTBOUND     │ caravan Consumer → SeraiConsumeHandler (BPMN 제거)            │
│  DB Access    │ MyBatis-Spring-Boot-Starter (2개 DataSource)                │
│  Config       │ application.yml (단일 설정 파일)                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 제거되는 의존성

| 의존성 | 제거 이유 |
|--------|----------|
| cactus-dmesfw | caravan으로 대체 |
| OASIS | Spring Boot로 대체 |
| eGovFrame | Spring Boot로 대체 |
| Nexacro 관련 | Backend Only, UI 없음 |
| JEUS | 내장 톰캣 사용 |
| EHCache | Caffeine으로 대체 (경량 캐시) |

### 1.3 유지되는 의존성

| 의존성 | 이유 |
|--------|------|
| Tibero JDBC | DB 연결 필수 |
| JSch | SFTP 필수 |
| Jackson | Spring Boot 2.7 내장 (HTTP 요청/응답 처리용 — Kafka JSON은 caravan이 처리) |

---

## 2. 신규 프로젝트 구조

### 2.1 패키지 구조

```
com.dongkuk.dmes.serai/
├── SeraiApplication.java                    # Spring Boot 진입점
│
├── config/                                # SERAI 전용 설정
│   ├── DataSourceConfig.java             # DataSource 설정 (MST @Primary, IF)
│   └── SeraiProperties.java               # SERAI 전용 프로퍼티 (serai.inbound.*, serai.outbound.*)
│   # Kafka 관련 Config는 caravan AutoConfiguration이 자동 등록:
│   #   KafkaProducerConfig, KafkaConsumerConfig, KafkaDataSourceConfig,
│   #   KafkaAdminConfig, KafkaListenerConfig 등 → 별도 구현 불필요
│
├── inbound/                               # INBOUND 모듈
│   ├── http/
│   │   └── controller/
│   │       └── HttpIntegrationController.java   # POST /seraiApi/v1/send
│   ├── db/
│   │   ├── scheduler/
│   │   │   └── DbPollingScheduler.java
│   │   └── service/
│   │       └── DbPollingService.java
│   └── file/
│       ├── scheduler/
│       │   └── FilePollingScheduler.java
│       └── service/
│           └── SftpPollingService.java
│
├── handler/                                # caravan 핸들러 (OUTBOUND)
│   └── SeraiConsumeHandler/
│       └── BusinessStart.java            # @Component("SeraiConsumeHandler") - caravan 진입점
│
├── outbound/                              # OUTBOUND 처리 로직 (BPMN 제거)
│   ├── router/
│   │   └── OutboundRouter.java           # INTEGRATION_TYPE별 분기
│   ├── db/
│   │   └── DbOutboundHandler.java
│   ├── http/
│   │   └── HttpOutboundHandler.java
│   └── file/
│       └── FileOutboundHandler.java
│
├── common/                                # 공통
│   ├── dto/
│   │   ├── IntegrationRequest.java       # HTTP INBOUND 요청 DTO
│   │   └── IntegrationResponse.java      # HTTP INBOUND 응답 DTO
│   └── util/
│       └── SftpSessionManager.java       # SFTP 세션 캐싱
│
├── mapper/                                # SERAI 전용 MyBatis Mapper
│   ├── SeraiConfigMapper.java              # TB_MCM_MOM_KAFKA_SERAI_CONFIG
│   └── InterfaceMapper.java              # IF_* 테이블
│   # TB_MCM_MOM_KAFKA_TOPICS → caravan의 KafkaMapper가 처리 (별도 Mapper 불필요)
│   # TB_MCM_MOM_TC_ERROR     → caravan의 KafkaErrorRepository가 자동 기록
│
└── resources/
    ├── application.yml                    # 메인 설정
    ├── application-dev.yml                # 개발 환경
    ├── application-prod.yml               # 운영 환경
    └── mapper/
        ├── SeraiConfigMapper.xml
        └── InterfaceMapper.xml
```

### 2.2 caravan이 자동 제공하는 기능 (SERAI가 구현할 필요 없음)

caravan 의존성 추가 + `caravan.kafka.enabled: true` 설정만으로 아래 기능이 자동 활성화된다.

| 기능 | caravan 컴포넌트 | 설명 |
|------|-----------------|------|
| **Kafka Consumer 자동 등록** | `KafkaListenerConfig` | DB(TB_MCM_MOM_KAFKA_TOPICS)에서 BIZ_SYSTEM='SERAI' 토픽 조회 → 토픽별 Listener 자동 등록 |
| **DLT 자동 등록** | `KafkaListenerConfig` | 각 토픽에 대해 `{토픽명}.dlt` DLT Listener 자동 등록 |
| **메시지 소비 + 재시도** | `KafkaMessageConsumer` | parseMessage → SERAI 라우팅 → executeWithRetry → HandleResult 처리 |
| **DLT 메시지 처리** | `KafkaDltConsumer` | DLT 메시지 로그 출력 + acknowledge |
| **에러 자동 기록** | `KafkaErrorRepository` | 송신/수신 실패 시 TB_MCM_MOM_TC_ERROR에 자동 INSERT |
| **REST API** | `KafkaStatusController` | `/kafkaApi/status`, `/kafkaApi/pause`, `/kafkaApi/resume`, `/kafkaApi/skipOffset`, `/kafkaApi/browse`, `/kafkaApi/peekOffset` |
| **컨테이너 제어** | `ContainerController` | Listener 일시정지/재개/정지/시작 |
| **Offset 관리** | `KafkaOffsetManager` | Consumer Group Offset 조회/변경/스킵 |
| **메시지 조회** | `MessageBrowser` | 디버깅용 메시지 조회 (시간/Offset 기반) |
| **Producer** | `KafkaMessageProducer` | 동기/비동기 전송, 표준 JSON 자동 빌드 |
| **DataSource 연동** | `KafkaDataSourceConfig` | 호스트의 @Primary DataSource → kafkaSqlSessionFactory 자동 구성 |

> SERAI 프로젝트는 **INBOUND 폴링 로직**, **SeraiConsumeHandler**, **OUTBOUND 처리 핸들러**만 직접 구현하면 된다.

### 2.3 REST API 엔드포인트 정리

SERAI 프로젝트에는 2개의 REST API 경로가 공존한다.

| 경로 | 제공자 | 용도 |
|------|--------|------|
| `/seraiApi/v1/*` | **SERAI 직접 구현** | HTTP INBOUND (외부 → Kafka) |
| `/kafkaApi/*` | **caravan 자동 제공** | Kafka 모니터링/제어 (상태 조회, pause/resume, offset 스킵) |

### 2.4 의존성 (build.gradle)

```groovy
plugins {
    id 'org.springframework.boot' version '2.7.18'
    id 'io.spring.dependency-management' version '1.0.15.RELEASE'
    id 'java'
}

group = 'com.dongkuk.dmes'
version = '1.0.0'

java {
    sourceCompatibility = JavaVersion.VERSION_11
}

repositories {
    maven {
        url 'http://172.31.1.96:8889/nexus/content/groups/public'
        allowInsecureProtocol = true
    }
}

dependencies {
    // ========== Spring Boot ==========
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-validation'

    // ========== caravan (Kafka 라이브러리) ==========
    // caravan: Java 8 / Spring 5.3.27 / Spring Kafka 2.9.11 — Spring Boot 2.7.x와 완전 호환
    implementation 'com.dongkuk.caravan:caravan:1.0.0-SNAPSHOT'

    // ========== Database ==========
    implementation 'org.mybatis.spring.boot:mybatis-spring-boot-starter:2.3.2'
    runtimeOnly 'com.tmax.tibero:tibero6-jdbc:1.0'

    // ========== SFTP ==========
    implementation 'com.jcraft:jsch:0.1.55'

    // ========== Cache ==========
    implementation 'com.github.ben-manes.caffeine:caffeine'  // Spring Boot BOM이 버전 관리

    // ========== Lombok ==========
    compileOnly 'org.projectlombok:lombok'
    annotationProcessor 'org.projectlombok:lombok'

    // ========== 테스트 ==========
    testImplementation 'org.springframework.boot:spring-boot-starter-test'
    testImplementation 'org.springframework.kafka:spring-kafka-test'
}
```

### 2.5 caravan 호환성

Spring Boot 2.7.x를 선택한 핵심 이유는 caravan과의 **즉시 호환성**이다.

| 항목 | caravan | SERAI (Spring Boot 2.7.x) | 호환 |
|------|---------|------------------------|------|
| Java | 8 | 11 | O (상위 호환) |
| Spring Framework | 5.3.27 | 5.3.x (Boot 관리) | O (동일 메이저) |
| Spring Kafka | 2.9.11 | 2.9.x (Boot 관리) | O (동일 메이저) |
| javax namespace | javax.* | javax.* | O (동일) |
| MyBatis-Spring | 2.1.1 | 2.x (Boot 관리) | O (동일 메이저) |
| AutoConfiguration | spring.factories | spring.factories | O (동일 방식) |

> caravan 코드 수정 없이 `implementation 'com.dongkuk.caravan:caravan:1.0.0-SNAPSHOT'` 추가만으로 모든 기능이 동작한다.

---

## 3. 설정 파일 (application.yml)

```yaml
# ========================================
# SERAI Spring Boot 설정
# ========================================

spring:
  application:
    name: serai

# ========================================
# caravan Kafka 설정
# ========================================
caravan:
  kafka:
    enabled: true
    bootstrap-servers: ${KAFKA_SERVERS:localhost:9092}
    biz-system: SERAI                        # [중요] "serai"로 시작 → SeraiConsumeHandler 고정 라우팅

    producer:
      acks: all
      retries: 3
      timeout-seconds: 10
      idempotence: true
      max-in-flight-requests: 5

    consumer:
      enabled: true                        # OUTBOUND 수신용 Consumer 활성화
      auto-offset-reset: earliest
      enable-auto-commit: false            # 수동 커밋 (MANUAL_IMMEDIATE)
      max-poll-records: 1                  # 1건씩 처리 (순서 보장)
      poll-timeout-ms: 3000
      concurrency: 1

    retry:
      max-attempts: 3                      # 최대 재시도 횟수
      delay-ms: 2000                       # 재시도 간격 (ms)
    # caravan DataSource: 별도 설정 불필요
    # → 호스트(SERAI)의 @Primary DataSource를 자동 주입받아
    #   caravan 내부에서 kafkaSqlSessionFactory 구성

# ========================================
# SERAI 전용 설정
# ========================================
serai:
  # INBOUND 설정
  inbound:
    db:
      enabled: ${SERAI_INBOUND_DB_ENABLED:true}
      thread-pool-size: 10
      timeout-seconds: 30
      refresh-interval-ms: 60000        # 설정 변경 감지 주기 (1분)
      # 폴링 주기는 DB 테이블(POLLING_INTERVAL_MS)에서 토픽별로 관리

    file:
      enabled: ${SERAI_INBOUND_FILE_ENABLED:true}
      thread-pool-size: 5
      timeout-seconds: 60
      refresh-interval-ms: 60000        # 설정 변경 감지 주기 (1분)
      # 폴링 주기는 DB 테이블(POLLING_INTERVAL_MS)에서 토픽별로 관리

  # OUTBOUND 설정
  outbound:
    http:
      connect-timeout-ms: 10000
      read-timeout-ms: 30000

# ========================================
# DataSource 설정 (SERAI 전용)
# ========================================
serai-datasource:
  # MST DataSource (설정 테이블)
  mst:
    url: ${DB_MST_URL:jdbc:tibero:thin:@localhost:8629:tibero}
    username: ${DB_MST_USER:MCMAPUSER}
    password: ${DB_MST_PASS:password}
    driver-class-name: com.tmax.tibero.jdbc.TbDriver
    hikari:
      pool-name: serai-mst-pool
      minimum-idle: 2
      maximum-pool-size: 10

  # IF DataSource (인터페이스 테이블)
  if:
    url: ${DB_IF_URL:jdbc:tibero:thin:@localhost:8629:tibero}
    username: ${DB_IF_USER:EAIUSER}
    password: ${DB_IF_PASS:password}
    driver-class-name: com.tmax.tibero.jdbc.TbDriver
    hikari:
      pool-name: serai-if-pool
      minimum-idle: 2
      maximum-pool-size: 20

# ========================================
# 로깅 설정
# ========================================
logging:
  level:
    com.dongkuk.dmes.serai: INFO
    com.dongkuk.caravan: INFO
    org.springframework.kafka: WARN

# ========================================
# 서버 설정
# ========================================
server:
  port: ${SERVER_PORT:8080}
  servlet:
    context-path: /serai
```

---

## 4. INBOUND 마이그레이션

### 4.1 HTTP INBOUND (변경 최소)

**현재**: `HttpIntegrationController.java` + cactus `DMomKafkaProducerService`

**변경 후**: `HttpIntegrationController.java` + caravan `KafkaMessageProducer`

#### caravan Producer API

caravan의 `KafkaMessageProducer.send()`는 내부에서 표준 메시지 JSON을 자동 생성한다.
호스트 프로젝트는 `transactionCode`와 `interfaceMsg`만 전달하면 된다.

```
호스트가 전달:     topic, transactionCode, interfaceMsg
caravan이 자동생성: KAFKA_KEYDATA (UUID), INTERFACE_ID (=topic), INTERFACE_PROTOCOL ("IF_KAFKA")

최종 Kafka 메시지 (caravan buildMessageJson):
{
    "TRANSACTION_CODE": "PQR02012",
    "KAFKA_KEYDATA": "840d4999-...",        ← 자동
    "INTERFACE_ID": "MMPPMERPTT01",         ← 자동 (= topic)
    "INTERFACE_MSG": "PQR02012|P|S|...",
    "INTERFACE_PROTOCOL": "IF_KAFKA"        ← 자동
}
```

```java
@RestController
@RequestMapping("/seraiApi/v1")
@RequiredArgsConstructor
@Slf4j
public class HttpIntegrationController {

    // caravan Producer (JSON 빌드, UUID 생성 모두 caravan 내부에서 처리)
    private final KafkaMessageProducer kafkaProducer;

    @PostMapping("/send")
    public ResponseEntity<IntegrationResponse> send(@RequestBody IntegrationRequest request) {
        try {
            // 1. 필수 파라미터 검증
            validateRequest(request);

            String topic = request.getInterfaceId();

            // 2. Kafka 전송 (caravan)
            //    - KAFKA_KEYDATA, INTERFACE_ID, INTERFACE_PROTOCOL은 caravan이 자동 생성
            //    - JSON 변환도 caravan 내부에서 처리
            SendResult result = kafkaProducer.send(
                topic,
                request.getTransactionCode(),
                request.getInterfaceMsg()
            );

            if (!result.isSuccess()) {
                log.error("HTTP INBOUND 전송 실패 - topic: {}, error: {}",
                    topic, result.getErrorMessage());
                return ResponseEntity.internalServerError()
                    .body(IntegrationResponse.error("KAFKA_SEND_FAIL", result.getErrorMessage()));
            }

            log.info("HTTP INBOUND 전송 완료 - topic: {}, offset: {}", topic, result.getOffset());
            return ResponseEntity.ok(IntegrationResponse.success(topic, result.getOffset()));

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                .body(IntegrationResponse.error("INVALID_PARAMETER", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                .body(IntegrationResponse.error("SYSTEM_ERROR", e.getMessage()));
        }
    }
}
```

### 4.2 DB INBOUND (폴링 구조 변경)

**현재**: `BatchDbPollingManager` + OASIS `TransactionalDao`

**변경 후**: `DbPollingScheduler` + MyBatis `Mapper` + `ScheduledExecutorService`

#### 핵심 설계 포인트

```
DbPollingScheduler
├─ ScheduledExecutorService scheduler (스케줄 + 작업 실행)
├─ Map<String, ScheduledFuture<?>> scheduledTasks (토픽별 스케줄)
├─ ConcurrentHashMap<String, AtomicBoolean> runningMap (동시실행 방지)
├─ @PostConstruct init()
│   ├─ registerTopicSchedules(): 토픽별 scheduleAtFixedRate 등록
│   └─ refreshSchedules 스케줄 등록 (1분 주기, 설정 변경 감지)
├─ refreshSchedules(): 신규 토픽 등록 / 삭제 토픽 제거
├─ pollIfNotRunning(): AtomicBoolean 기반 동시실행 방지
└─ @PreDestroy destroy(): 스케줄 취소 + 스케줄러 종료
```

```java
@Component
@RequiredArgsConstructor
@Slf4j
public class DbPollingScheduler {

    private final SeraiConfigMapper configMapper;
    private final DbPollingService dbPollingService;
    private final SeraiProperties properties;

    private ScheduledExecutorService scheduler;
    private final Map<String, ScheduledFuture<?>> scheduledTasks = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, AtomicBoolean> runningMap = new ConcurrentHashMap<>();

    @PostConstruct
    public void init() {
        if (!properties.getInbound().getDb().isEnabled()) {
            log.info("DB INBOUND 비활성화");
            return;
        }

        int poolSize = properties.getInbound().getDb().getThreadPoolSize();
        scheduler = Executors.newScheduledThreadPool(poolSize);

        registerTopicSchedules();

        // 설정 변경 감지 스케줄 등록 (1분 주기)
        long refreshInterval = properties.getInbound().getDb().getRefreshIntervalMs();
        scheduler.scheduleAtFixedRate(this::refreshSchedules,
            refreshInterval, refreshInterval, TimeUnit.MILLISECONDS);
        log.info("DB Polling Scheduler 초기화 완료 - poolSize: {}, refreshInterval: {}ms",
            poolSize, refreshInterval);
    }

    private void registerTopicSchedules() {
        List<SeraiConfig> configs = configMapper.selectDbInboundConfigs();
        if (configs == null || configs.isEmpty()) {
            log.info("DB 폴링 대상 토픽 없음");
            return;
        }

        for (SeraiConfig config : configs) {
            long interval = config.getPollingIntervalMs() != null
                ? config.getPollingIntervalMs() : 1000L;

            ScheduledFuture<?> future = scheduler.scheduleAtFixedRate(
                () -> pollIfNotRunning(config.getTopicId(), config.getDbTableName()),
                0, interval, TimeUnit.MILLISECONDS
            );

            scheduledTasks.put(config.getTopicId(), future);
            log.info("DB 폴링 스케줄 등록 - Topic: {}, Table: {}, Interval: {}ms",
                config.getTopicId(), config.getDbTableName(), interval);
        }
    }

    /**
     * 설정 변경 감지 및 스케줄 갱신
     * - 신규 토픽: scheduleAtFixedRate 등록
     * - 삭제/비활성화 토픽: cancel + 제거
     */
    private void refreshSchedules() {
        try {
            List<SeraiConfig> configs = configMapper.selectDbInboundConfigs();
            if (configs == null) {
                configs = Collections.emptyList();
            }

            Set<String> activeTopicIds = new HashSet<>();

            // 1. 신규 토픽 등록
            for (SeraiConfig config : configs) {
                activeTopicIds.add(config.getTopicId());

                if (!scheduledTasks.containsKey(config.getTopicId())) {
                    long interval = config.getPollingIntervalMs() != null
                        ? config.getPollingIntervalMs() : 1000L;

                    ScheduledFuture<?> future = scheduler.scheduleAtFixedRate(
                        () -> pollIfNotRunning(config.getTopicId(), config.getDbTableName()),
                        0, interval, TimeUnit.MILLISECONDS
                    );
                    scheduledTasks.put(config.getTopicId(), future);
                    log.info("DB 폴링 스케줄 신규 등록 - Topic: {}, Interval: {}ms",
                        config.getTopicId(), interval);
                }
            }

            // 2. 삭제/비활성화된 토픽 제거
            scheduledTasks.entrySet().removeIf(entry -> {
                if (!activeTopicIds.contains(entry.getKey())) {
                    entry.getValue().cancel(false);
                    runningMap.remove(entry.getKey());
                    log.info("DB 폴링 스케줄 제거 - Topic: {}", entry.getKey());
                    return true;
                }
                return false;
            });
        } catch (Exception e) {
            log.error("DB 폴링 스케줄 갱신 실패", e);
        }
    }

    private void pollIfNotRunning(String topicId, String tableName) {
        AtomicBoolean running = runningMap.computeIfAbsent(
            topicId, k -> new AtomicBoolean(false));

        if (!running.compareAndSet(false, true)) {
            log.debug("이전 폴링 실행 중, 스킵 - Topic: {}", topicId);
            return;
        }

        try {
            dbPollingService.pollAndSend(topicId, tableName);
        } catch (Exception e) {
            log.error("DB 폴링 실패 - Topic: {}, Table: {}", topicId, tableName, e);
        } finally {
            running.set(false);
        }
    }

    @PreDestroy
    public void destroy() {
        for (Map.Entry<String, ScheduledFuture<?>> entry : scheduledTasks.entrySet()) {
            entry.getValue().cancel(false);
            log.info("DB 폴링 스케줄 취소 - Topic: {}", entry.getKey());
        }
        scheduledTasks.clear();

        if (scheduler != null) {
            log.info("DbPollingScheduler 종료 시작");
            scheduler.shutdown();
            try {
                if (!scheduler.awaitTermination(60, TimeUnit.SECONDS)) {
                    scheduler.shutdownNow();
                }
            } catch (InterruptedException e) {
                scheduler.shutdownNow();
                Thread.currentThread().interrupt();
            }
            log.info("DbPollingScheduler 종료 완료");
        }
    }
}
```

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class DbPollingService {

    private final InterfaceMapper interfaceMapper;
    private final KafkaMessageProducer kafkaProducer;  // caravan

    @Transactional
    public void pollAndSend(String topicId, String tableName) {
        // 미처리 메시지 조회 (IF_FLAG = 'N')
        List<InterfaceMessage> messages = interfaceMapper.selectPendingMessages(tableName);
        if (messages.isEmpty()) return;

        for (InterfaceMessage msg : messages) {
            try {
                // Kafka 전송 (caravan)
                // - transactionCode, interfaceMsg만 전달
                // - KAFKA_KEYDATA, INTERFACE_ID, INTERFACE_PROTOCOL은 caravan이 자동 생성
                // - JSON 변환도 caravan 내부에서 처리
                SendResult result = kafkaProducer.send(
                    topicId,
                    msg.getTransactionCode(),
                    msg.getInterfaceMsg()
                );

                if (result.isSuccess()) {
                    // 성공: IF_FLAG = 'Y'
                    interfaceMapper.updateSuccess(tableName, msg);
                    log.debug("DB INBOUND 전송 완료 - TC: {}, offset: {}",
                        msg.getTransactionCode(), result.getOffset());
                } else {
                    // 전송 실패 (caravan이 에러를 TB_MCM_MOM_TC_ERROR에 자동 기록)
                    interfaceMapper.updateError(tableName, msg);
                    log.error("DB INBOUND 전송 실패 - TC: {}, error: {}",
                        msg.getTransactionCode(), result.getErrorMessage());
                }

            } catch (Exception e) {
                interfaceMapper.updateError(tableName, msg);
                log.error("DB INBOUND 처리 실패 - TC: {}", msg.getTransactionCode(), e);
            }
        }
    }
}
```

### 4.3 FILE INBOUND (구조 동일, 의존성 변경)

**현재**: `BatchFilePollingManager` + `FtpPollingService`

**변경 후**: `FilePollingScheduler` + `SftpPollingService` (DB와 동일한 패턴)

#### DB 폴링과의 차이점

| 항목 | DB (DbPollingScheduler) | FILE (FilePollingScheduler) |
|------|------------------------|---------------------------|
| 폴링 대상 | IF 테이블 (IF_FLAG='N') | SFTP 디렉토리 (파일 목록) |
| pollIfNotRunning 파라미터 | `(topicId, tableName)` | `(topicId, config)` config Map 전체 |
| 기본 스레드 풀 | 10 | 5 |
| 설정 조회 Mapper | `selectDbInboundConfigs` | `selectFileInboundConfigs` |

```java
@Component
@RequiredArgsConstructor
@Slf4j
public class FilePollingScheduler {

    private final SeraiConfigMapper configMapper;
    private final SftpPollingService sftpPollingService;
    private final SeraiProperties properties;

    private ScheduledExecutorService scheduler;
    private final Map<String, ScheduledFuture<?>> scheduledTasks = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, AtomicBoolean> runningMap = new ConcurrentHashMap<>();

    @PostConstruct
    public void init() {
        if (!properties.getInbound().getFile().isEnabled()) {
            log.info("FILE INBOUND 비활성화");
            return;
        }

        int poolSize = properties.getInbound().getFile().getThreadPoolSize();
        scheduler = Executors.newScheduledThreadPool(poolSize);

        registerTopicSchedules();

        // 설정 변경 감지 스케줄 등록 (1분 주기)
        long refreshInterval = properties.getInbound().getFile().getRefreshIntervalMs();
        scheduler.scheduleAtFixedRate(this::refreshSchedules,
            refreshInterval, refreshInterval, TimeUnit.MILLISECONDS);
        log.info("File Polling Scheduler 초기화 완료 - poolSize: {}, refreshInterval: {}ms",
            poolSize, refreshInterval);
    }

    private void registerTopicSchedules() {
        List<SeraiConfig> configs = configMapper.selectFileInboundConfigs();
        if (configs == null || configs.isEmpty()) {
            log.info("FILE 폴링 대상 설정 없음");
            return;
        }

        for (SeraiConfig config : configs) {
            long interval = config.getPollingIntervalMs() != null
                ? config.getPollingIntervalMs() : 1000L;

            ScheduledFuture<?> future = scheduler.scheduleAtFixedRate(
                () -> pollIfNotRunning(config.getTopicId(), config),
                0, interval, TimeUnit.MILLISECONDS
            );

            scheduledTasks.put(config.getTopicId(), future);
            log.info("FILE 폴링 스케줄 등록 - Topic: {}, Interval: {}ms",
                config.getTopicId(), interval);
        }
    }

    /**
     * 설정 변경 감지 및 스케줄 갱신 (DB 폴링과 동일 패턴)
     */
    private void refreshSchedules() {
        try {
            List<SeraiConfig> configs = configMapper.selectFileInboundConfigs();
            if (configs == null) {
                configs = Collections.emptyList();
            }

            Set<String> activeTopicIds = new HashSet<>();

            for (SeraiConfig config : configs) {
                activeTopicIds.add(config.getTopicId());

                if (!scheduledTasks.containsKey(config.getTopicId())) {
                    long interval = config.getPollingIntervalMs() != null
                        ? config.getPollingIntervalMs() : 1000L;

                    ScheduledFuture<?> future = scheduler.scheduleAtFixedRate(
                        () -> pollIfNotRunning(config.getTopicId(), config),
                        0, interval, TimeUnit.MILLISECONDS
                    );
                    scheduledTasks.put(config.getTopicId(), future);
                    log.info("FILE 폴링 스케줄 신규 등록 - Topic: {}, Interval: {}ms",
                        config.getTopicId(), interval);
                }
            }

            scheduledTasks.entrySet().removeIf(entry -> {
                if (!activeTopicIds.contains(entry.getKey())) {
                    entry.getValue().cancel(false);
                    runningMap.remove(entry.getKey());
                    log.info("FILE 폴링 스케줄 제거 - Topic: {}", entry.getKey());
                    return true;
                }
                return false;
            });
        } catch (Exception e) {
            log.error("FILE 폴링 스케줄 갱신 실패", e);
        }
    }

    private void pollIfNotRunning(String topicId, SeraiConfig config) {
        AtomicBoolean running = runningMap.computeIfAbsent(topicId, k -> new AtomicBoolean(false));

        if (!running.compareAndSet(false, true)) {
            log.debug("이전 폴링 실행 중, 스킵 - Topic: {}", topicId);
            return;
        }

        try {
            sftpPollingService.pollAndSend(config);
        } catch (Exception e) {
            log.error("FILE 폴링 실패 - Topic: {}", topicId, e);
        } finally {
            running.set(false);
        }
    }

    @PreDestroy
    public void destroy() {
        for (Map.Entry<String, ScheduledFuture<?>> entry : scheduledTasks.entrySet()) {
            entry.getValue().cancel(false);
            log.info("FILE 폴링 스케줄 취소 - Topic: {}", entry.getKey());
        }
        scheduledTasks.clear();

        if (scheduler != null) {
            log.info("FilePollingScheduler 종료 시작");
            scheduler.shutdown();
            try {
                if (!scheduler.awaitTermination(60, TimeUnit.SECONDS)) {
                    scheduler.shutdownNow();
                }
            } catch (InterruptedException e) {
                scheduler.shutdownNow();
                Thread.currentThread().interrupt();
            }
            log.info("FilePollingScheduler 종료 완료");
        }
    }
}
```

---

## 5. OUTBOUND 마이그레이션 (BPMN → caravan Consumer)

### 5.1 기존 BPMN 구조

```
SeraiReceive.bpmn
├── StartEvent
├── DMomParseMessageTask (cactus 라이브러리)
├── MomTypeCheck (OUTBOUND 설정 조회, 분기)
├── MomDBTypeReceive / MomHttpTypeReceive / MomFileTypeReceive
└── EndEvent
```

### 5.2 caravan Consumer 수신 흐름 (SERAI 전용 라우팅)

caravan은 `biz-system`이 `serai`로 시작하면 TRANSACTION_CODE 기반 라우팅을 하지 않고,
**모든 메시지를 `SeraiConsumeHandler` Bean으로 고정 라우팅**한다.

```
Kafka Broker
    │
    ▼
caravan KafkaListenerConfig                ← 시작 시 DB에서 토픽 조회, Listener 자동 등록
    │                                        (SERAI가 직접 구현할 필요 없음)
    ▼
caravan KafkaMessageConsumer.consume()
    │
    ├── 1. parseMessage(record) → KafkaMessageContext 생성
    │       ├── JSON 파싱 → TRANSACTION_CODE, INTERFACE_ID, INTERFACE_MSG 등
    │       └── Kafka 메타데이터 (topic, partition, offset, timestamp)
    │
    ├── 2. SERAI 예외 라우팅 판별
    │       └── biz-system.toLowerCase().startsWith("serai") == true
    │           → TRANSACTION_CODE 무시, "SeraiConsumeHandler" 고정
    │
    ├── 3. handlerRegistry.getHandler("SeraiConsumeHandler")
    │       └── ApplicationContext.getBean("SeraiConsumeHandler")
    │           └── SERAI 프로젝트의 BusinessStart Bean 반환
    │
    ├── 4. executeWithRetry(handler, context, ...)
    │       ├── HandleResult.success()       → acknowledge() → 다음 메시지
    │       ├── HandleResult.fail()          → 에러 DB 기록 → acknowledge() (스킵)
    │       └── HandleResult.failRetryable() → 재시도 (초과 시 컨테이너 PAUSE)
    │
    └── 5. 최대 재시도 초과 시
            ├── KafkaErrorRepository에 에러 기록
            ├── containerController.pause(listenerId)  ← 컨테이너 일시정지
            └── consumer.seek(offset)                  ← offset 롤백
                → 운영자가 /kafkaApi/resume 또는 /kafkaApi/skipOffset으로 복구
```

#### 일반 시스템 vs SERAI 시스템 라우팅 비교

```
일반 시스템 (biz-system: DMES):
  TC "PQR02012" → Bean("PQR02012") → PQR02012 핸들러
  TC "ABC01234" → Bean("ABC01234") → ABC01234 핸들러
  TC 미등록     → DefaultKafkaInterfaceHandler (경고 로그 후 스킵)

SERAI 시스템 (biz-system: SERAI):
  TC "PQR02012" → Bean("SeraiConsumeHandler") → BusinessStart 핸들러
  TC "ABC01234" → Bean("SeraiConsumeHandler") → BusinessStart 핸들러
  모든 TC       → Bean("SeraiConsumeHandler") → BusinessStart 핸들러
```

### 5.3 SeraiConsumeHandler 구현 (caravan 진입점)

> **Bean 이름은 반드시 `SeraiConsumeHandler`** 이어야 한다 (caravan 하드코딩).
> 패키지 컨벤션: `com.{project}.handler.SeraiConsumeHandler.BusinessStart`

```java
package com.dongkuk.dmes.serai.handler.SeraiConsumeHandler;

import com.dongkuk.caravan.handler.HandleResult;
import com.dongkuk.caravan.handler.KafkaInterfaceHandler;
import com.dongkuk.caravan.model.KafkaMessageContext;
import com.dongkuk.dmes.serai.outbound.router.OutboundRouter;
import com.dongkuk.dmes.serai.mapper.SeraiConfigMapper;

/**
 * SERAI OUTBOUND 메인 핸들러
 *
 * caravan의 KafkaInterfaceHandler를 구현.
 * biz-system이 "serai"로 시작하면 caravan이 모든 메시지를 이 핸들러로 라우팅.
 * TRANSACTION_CODE 기반 라우팅이 아닌 단일 핸들러에서 OUTBOUND 처리.
 *
 * 기존 MomTypeCheck + MomDBTypeReceive/MomHttpTypeReceive/MomFileTypeReceive 통합
 */
@Component("SeraiConsumeHandler")
@RequiredArgsConstructor
@Slf4j
public class BusinessStart implements KafkaInterfaceHandler {

    private final OutboundRouter router;
    private final SeraiConfigMapper configMapper;

    @Override
    public HandleResult businessHandle(KafkaMessageContext context) {
        log.info("[SERAI OUTBOUND] 처리 시작 - TC: {}, Topic: {}, Offset: {}",
            context.getTransactionCode(), context.getInterfaceId(), context.getOffset());

        try {
            // 1. OUTBOUND 설정 조회 (TB_MCM_MOM_KAFKA_SERAI_CONFIG)
            SeraiConfig config = configMapper.selectOutboundConfig(
                context.getInterfaceId(), "OUTBOUND");

            if (config == null) {
                log.warn("OUTBOUND 설정 없음 - Topic: {}", context.getInterfaceId());
                return HandleResult.success();  // 설정 없으면 성공 처리 (메시지 스킵)
            }

            // 2. INTEGRATION_TYPE별 분기 처리
            router.route(context, config);

            log.info("[SERAI OUTBOUND] 처리 완료 - TC: {}", context.getTransactionCode());
            return HandleResult.success();

        } catch (Exception e) {
            log.error("[SERAI OUTBOUND] 처리 실패 - TC: {}, attempt: {}",
                context.getTransactionCode(), context.getAttemptCount(), e);
            // 일시적 오류 가능성이 있으면 failRetryable, 아니면 fail
            return HandleResult.fail("OUTBOUND_ERROR", e.getMessage());
        }
    }
}
```

### 5.4 OutboundRouter 구현

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class OutboundRouter {

    private final DbOutboundHandler dbHandler;
    private final HttpOutboundHandler httpHandler;
    private final FileOutboundHandler fileHandler;

    public void route(KafkaMessageContext context, SeraiConfig config) {
        String type = config.getIntegrationType();

        switch (type) {
            case "DB":
                dbHandler.handle(context, config);
                break;
            case "HTTP":
                httpHandler.handle(context, config);
                break;
            case "FILE":
                fileHandler.handle(context, config);
                break;
            default:
                log.warn("알 수 없는 INTEGRATION_TYPE: {}", type);
        }
    }
}
```

### 5.5 DbOutboundHandler 구현

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class DbOutboundHandler {

    private final InterfaceMapper interfaceMapper;

    public void handle(KafkaMessageContext context, SeraiConfig config) {
        String tableName = config.getDbSchema() + "." + config.getDbTableName();

        // 원본 메시지에서 필드 추출
        Map<String, Object> originalMsg = context.getRawMessageMap();

        InterfaceMessage message = InterfaceMessage.builder()
            .transactionCode((String) originalMsg.get("TRANSACTION_CODE"))
            .interfaceId((String) originalMsg.get("INTERFACE_ID"))
            .interfaceMsg((String) originalMsg.get("INTERFACE_MSG"))
            .ifFlag("N")
            .build();

        // INSERT 실행
        interfaceMapper.insertOutboundMessage(tableName, message);

        log.info("DB OUTBOUND 완료 - Table: {}, TC: {}", tableName, message.getTransactionCode());
    }
}
```

### 5.6 HttpOutboundHandler 구현

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class HttpOutboundHandler {

    private final SeraiProperties properties;
    private final ObjectMapper objectMapper;

    public void handle(KafkaMessageContext context, SeraiConfig config) throws Exception {
        String httpUrl = config.getHttpUrl();
        String httpMethod = config.getHttpMethod() != null ? config.getHttpMethod() : "POST";

        // 원본 메시지를 JSON으로 전송
        String jsonPayload = objectMapper.writeValueAsString(context.getRawMessageMap());

        int responseCode = sendHttpRequest(httpUrl, httpMethod, jsonPayload);

        log.info("HTTP OUTBOUND 완료 - URL: {}, ResponseCode: {}", httpUrl, responseCode);
    }

    private int sendHttpRequest(String urlString, String method, String jsonPayload) throws Exception {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(urlString);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod(method);
            connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            connection.setConnectTimeout(properties.getOutbound().getHttp().getConnectTimeoutMs());
            connection.setReadTimeout(properties.getOutbound().getHttp().getReadTimeoutMs());
            connection.setDoOutput(true);

            try (OutputStream os = connection.getOutputStream()) {
                os.write(jsonPayload.getBytes(StandardCharsets.UTF_8));
            }

            int responseCode = connection.getResponseCode();
            if (responseCode < 200 || responseCode >= 300) {
                throw new RuntimeException("HTTP 전송 실패 - ResponseCode: " + responseCode);
            }
            return responseCode;

        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }
}
```

### 5.7 FileOutboundHandler 구현

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class FileOutboundHandler {

    private final SftpSessionManager sessionManager;

    public void handle(KafkaMessageContext context, SeraiConfig config) throws Exception {
        String filePath = config.getFilePath();
        String ftpHost = config.getFtpHost();
        int ftpPort = config.getFtpPort() != null ? config.getFtpPort() : 22;
        String ftpUser = config.getFtpUser();
        String ftpPassword = config.getFtpPassword();

        // 파일명 생성
        String fileName = generateFileName(context);

        // INTERFACE_MSG만 파일로 저장
        String content = (String) context.getRawMessageMap().get("INTERFACE_MSG");

        // SFTP 업로드 (세션 캐싱 사용)
        sessionManager.uploadFile(ftpHost, ftpPort, ftpUser, ftpPassword, filePath, fileName, content);

        log.info("FILE OUTBOUND 완료 - Path: {}/{}", filePath, fileName);
    }

    private String generateFileName(KafkaMessageContext context) {
        String timestamp = new SimpleDateFormat("yyyyMMddHHmmss").format(new Date());
        String uuid = context.getKafkaKeyData() != null
            ? context.getKafkaKeyData().replace("-", "").substring(0, 8)
            : String.valueOf(System.currentTimeMillis() % 100000000);
        return String.format("%s_%s_%s.txt", context.getInterfaceId(), timestamp, uuid);
    }
}
```

---

## 6. caravan 핸들러 등록

### 6.1 SERAI 전용 라우팅 (caravan 내장)

SERAI는 일반 시스템과 다른 라우팅 방식을 사용한다. **별도의 Configuration이나 Bean Override가 필요 없다.**

```
[핵심] application.yml에서 biz-system을 "serai"로 시작하도록 설정하면
       caravan이 자동으로 SERAI 라우팅을 적용한다.

caravan:
  kafka:
    biz-system: SERAI       ← 이것만 설정하면 됨
```

#### caravan 내부 동작 (KafkaMessageConsumer.consume())

```java
// caravan 내부 코드 (수정 불가)
String bizSystem = properties.getBizSystem();  // "SERAI"

if (bizSystem.toLowerCase().startsWith("serai")) {
    // SERAI 예외: TRANSACTION_CODE 무시, SeraiConsumeHandler로 고정
    handler = handlerRegistry.getHandler("SeraiConsumeHandler");
} else {
    // 일반: TRANSACTION_CODE로 Bean 조회
    handler = handlerRegistry.getHandler(transactionCode);
}
```

#### SERAI 프로젝트에서 해야 할 것

| 항목 | 내용 |
|------|------|
| application.yml | `caravan.kafka.biz-system: SERAI` (또는 serai_prod 등 serai로 시작하는 값) |
| Handler 구현 | `@Component("SeraiConsumeHandler")` Bean 1개만 등록 |
| 추가 Configuration | **불필요** (DefaultKafkaInterfaceHandler 오버라이드 불필요) |

### 6.2 HandleResult 사용 전략

SeraiConsumeHandler에서 반환하는 `HandleResult`에 따라 caravan이 다르게 동작한다.

```java
// 정상 처리 → offset 커밋, 다음 메시지
return HandleResult.success();

// 영구적 오류 (데이터 문제 등) → 에러 DB 기록 후 스킵 (재시도 안 함)
return HandleResult.fail("INVALID_DATA", "필수 필드 누락");

// DB 장애 등 인프라 오류 → 재시도, 초과 시 컨테이너 PAUSE (운영자 개입)
return HandleResult.failRetryable("DB_ERROR", "DB 연결 불가");

// 외부 API 오류 등 → 재시도, 초과 시 에러 기록 후 다음 메시지 (자동 스킵)
return HandleResult.failRetryableSkip("API_ERROR", "외부 시스템 응답 없음");
```

#### 에러 처리 흐름

```
HandleResult.failRetryable() 반환
    │
    ├── attempt < maxAttempts (3)
    │   └── sleep(2000ms) → businessHandle() 재호출
    │
    └── attempt >= maxAttempts
        ├── TB_MCM_MOM_TC_ERROR에 에러 기록 (ERROR_CODE: MAX_RETRY_EXCEEDED)
        ├── 컨테이너 PAUSE (메시지 수신 중단)
        └── offset 롤백 (같은 메시지 유지)
            │
            ▼
        운영자 개입 필요
        ├── POST /kafkaApi/resume      → 같은 메시지 재처리
        └── POST /kafkaApi/skipOffset  → 해당 메시지 건너뛰기

HandleResult.failRetryableSkip() 반환
    │
    ├── attempt < maxAttempts (3)
    │   └── sleep(2000ms) → businessHandle() 재호출
    │
    └── attempt >= maxAttempts
        ├── TB_MCM_MOM_TC_ERROR에 에러 기록 (ERROR_CODE: MAX_RETRY_SKIP)
        └── acknowledge() → offset 커밋 (메시지 스킵)
            │
            ▼
        컨테이너 RUNNING 유지 → 다음 메시지 자동 처리
        (운영자 개입 불필요)
```

### 6.3 특정 TRANSACTION_CODE 분기 (선택)

SERAI에서 특정 TC에 대해 다른 처리가 필요하면, SeraiConsumeHandler 내부에서 분기한다.
(SERAI 모드에서는 TC별 별도 Bean 등록이 적용되지 않음)

```java
@Component("SeraiConsumeHandler")
public class BusinessStart implements KafkaInterfaceHandler {

    @Override
    public HandleResult businessHandle(KafkaMessageContext context) {
        String tc = context.getTransactionCode();

        // 특정 TC에 대해 별도 처리가 필요한 경우
        if ("SPECIAL_TC_001".equals(tc)) {
            return handleSpecialCase(context);
        }

        // 기본 OUTBOUND 처리
        return handleOutbound(context);
    }
}
```

---

## 7. DataSource 설정

### 7.1 caravan + SERAI DataSource 관계

caravan은 별도의 DataSource를 생성하지 않는다. 호스트 프로젝트(SERAI)의 `@Primary` DataSource를 주입받아 caravan 전용 `kafkaSqlSessionFactory`를 구성한다.

```
SERAI DataSource 구성
├── mstDataSource (@Primary)           ← caravan이 이 DataSource를 자동 주입
│   ├── SERAI용: mstSqlSessionFactory    (SeraiConfigMapper, TopicMapper)
│   └── caravan용: kafkaSqlSessionFactory (KafkaMapper - 토픽 조회, 에러 로그)
│
└── ifDataSource
    └── SERAI용: ifSqlSessionFactory     (InterfaceMapper - IF_* 테이블)
```

> **중요**: `mstDataSource`를 `@Primary`로 설정하면 caravan의 `KafkaDataSourceConfig`가 자동으로 이 DataSource를 사용하여 `kafkaSqlSessionFactory`를 생성한다. 별도의 caravan DataSource 설정이 불필요하다.

### 7.2 caravan이 사용하는 DB 테이블 (MST DataSource)

caravan은 `kafkaSqlSessionFactory` → `KafkaMapper.xml`로 아래 2개 테이블에 접근한다.
SERAI의 MST DataSource가 이 테이블들에 접근 가능해야 한다.

#### TB_MCM_MOM_KAFKA_TOPICS (토픽 설정)

caravan 시작 시 Listener 자동 등록에 사용된다. `BIZ_SYSTEM = 'SERAI'`인 토픽만 조회된다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `TOPIC_ID` | VARCHAR(100) | **PK**. Kafka 토픽명 |
| `TOPIC_DESC` | VARCHAR(300) | 토픽 설명 |
| `GROUP_ID` | VARCHAR(100) | Consumer Group ID |
| `BIZ_SYSTEM` | VARCHAR(5) | **'SERAI'** (application.yml의 biz-system과 일치 필요) |
| `SEND_MODULE_ID` | VARCHAR(20) | 송신 모듈 ID |
| `RECV_MODULE_ID` | VARCHAR(20) | 수신 모듈 ID |
| `USE_TP` | VARCHAR(1) | 사용 여부 |
| `STATUS` | VARCHAR(20) | 토픽 상태 |

> **OUTBOUND용 토픽은 반드시 이 테이블에 `BIZ_SYSTEM = 'SERAI'`로 등록**해야 caravan이 Listener를 생성한다.

#### TB_MCM_MOM_TC_ERROR (에러 로그)

caravan이 송신/수신 에러를 자동 기록한다. SERAI에서 별도 INSERT 불필요.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `SQ_VAL` | NUMBER | **PK**. 시퀀스 `SQ_MCM_MOM_TC_ERROR` |
| `TRANSACTION_CODE` | VARCHAR(50) | 트랜잭션 코드 |
| `INTERFACE_ID` | VARCHAR(100) | 토픽명 |
| `INTERFACE_MSG` | VARCHAR(65000) | 전문 내용 (송신) 또는 `"offset:{offset}"` (수신) |
| `ERROR_TYPE` | VARCHAR(3) | `S`: 송신 에러, `R`: 수신 에러 |
| `ERROR_CODE` | VARCHAR(100) | 에러 코드 |
| `ERROR_MSG` | VARCHAR(1000) | 에러 메시지 |
| `ERROR_STATUS_CODE` | VARCHAR(1) | 기본 `'N'` (미처리) |
| `CREATED_OBJECT_ID` | VARCHAR(20) | `'SERAI'` (biz-system 값) |
| `CREATED_PROGRAM_ID` | VARCHAR(20) | `'CARAVAN'` |

### 7.3 Multi-DataSource 구성

```java
@Configuration
@EnableConfigurationProperties(SeraiDataSourceProperties.class)
public class DataSourceConfig {

    // ========== MST DataSource (설정 테이블) ==========

    @Bean
    @Primary
    @ConfigurationProperties("serai-datasource.mst.hikari")
    public HikariDataSource mstDataSource(SeraiDataSourceProperties props) {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(props.getMst().getUrl());
        config.setUsername(props.getMst().getUsername());
        config.setPassword(props.getMst().getPassword());
        config.setDriverClassName(props.getMst().getDriverClassName());
        return new HikariDataSource(config);
    }

    @Bean
    public SqlSessionFactory mstSqlSessionFactory(
            @Qualifier("mstDataSource") DataSource dataSource) throws Exception {
        SqlSessionFactoryBean factoryBean = new SqlSessionFactoryBean();
        factoryBean.setDataSource(dataSource);
        factoryBean.setMapperLocations(
            new PathMatchingResourcePatternResolver()
                .getResources("classpath:mapper/mst/*.xml"));
        return factoryBean.getObject();
    }

    // ========== IF DataSource (인터페이스 테이블) ==========

    @Bean
    @ConfigurationProperties("serai-datasource.if.hikari")
    public HikariDataSource ifDataSource(SeraiDataSourceProperties props) {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(props.getIf().getUrl());
        config.setUsername(props.getIf().getUsername());
        config.setPassword(props.getIf().getPassword());
        config.setDriverClassName(props.getIf().getDriverClassName());
        return new HikariDataSource(config);
    }

    @Bean
    public SqlSessionFactory ifSqlSessionFactory(
            @Qualifier("ifDataSource") DataSource dataSource) throws Exception {
        SqlSessionFactoryBean factoryBean = new SqlSessionFactoryBean();
        factoryBean.setDataSource(dataSource);
        factoryBean.setMapperLocations(
            new PathMatchingResourcePatternResolver()
                .getResources("classpath:mapper/if/*.xml"));
        return factoryBean.getObject();
    }
}
```

---

## 8. 마이그레이션 단계

### Phase 1: 프로젝트 구조 생성 (2일)

| 순서 | 작업 | 산출물 |
|------|------|--------|
| 1-1 | Spring Boot 2.7.18 프로젝트 생성 | build.gradle |
| 1-2 | 패키지 구조 생성 | 디렉토리 구조 |
| 1-3 | application.yml 작성 | 설정 파일 |
| 1-4 | caravan 의존성 추가 | 의존성 설정 |

### Phase 2: 설정 및 공통 모듈 (2일)

| 순서 | 작업 | 산출물 |
|------|------|--------|
| 2-1 | DataSource 설정 | DataSourceConfig.java |
| 2-2 | MyBatis 설정 | Mapper 인터페이스/XML |
| 2-3 | 공통 DTO 마이그레이션 | IntegrationRequest, KafkaMessage 등 |
| 2-4 | SftpSessionManager 구현 | SFTP 세션 캐싱 |

### Phase 3: INBOUND 마이그레이션 (3일)

| 순서 | 작업 | 산출물 |
|------|------|--------|
| 3-1 | HTTP INBOUND 마이그레이션 | HttpIntegrationController.java |
| 3-2 | DB INBOUND 마이그레이션 | DbPollingScheduler, DbPollingService |
| 3-3 | FILE INBOUND 마이그레이션 | FilePollingScheduler, SftpPollingService |
| 3-4 | 폴링 주기 정확도 개선 적용 | scheduleAtFixedRate + AtomicBoolean |
| 3-5 | 런타임 설정 변경 감지 구현 | refreshSchedules (1분 주기) |

### Phase 4: OUTBOUND 마이그레이션 (3일)

| 순서 | 작업 | 산출물 |
|------|------|--------|
| 4-1 | SeraiConsumeHandler 구현 | @Component("SeraiConsumeHandler") - caravan 진입점 |
| 4-2 | OutboundRouter 구현 | INTEGRATION_TYPE별 분기 |
| 4-3 | DbOutboundHandler 구현 | DB INSERT |
| 4-4 | HttpOutboundHandler 구현 | HTTP POST |
| 4-5 | FileOutboundHandler 구현 | SFTP 파일 생성 |

### Phase 5: 테스트 및 검증 (3일)

| 순서 | 작업 | 산출물 |
|------|------|--------|
| 5-1 | 단위 테스트 작성 | *Test.java |
| 5-2 | 통합 테스트 작성 | *IntegrationTest.java |
| 5-3 | 기존 시스템과 병행 테스트 | 테스트 결과 |
| 5-4 | 성능 테스트 | 벤치마크 결과 |

### Phase 6: 배포 및 전환 (2일)

| 순서 | 작업 | 산출물 |
|------|------|--------|
| 6-1 | Docker 이미지 생성 | Dockerfile |
| 6-2 | 배포 스크립트 작성 | deploy.sh |
| 6-3 | 운영 환경 배포 | JAR 배포 |
| 6-4 | 모니터링 설정 | 로그/메트릭 설정 |

---

## 9. 일정 요약

| 주차 | Phase | 작업 내용 |
|------|-------|----------|
| **1주차** | Phase 1~2 | 프로젝트 구조 생성, 설정 |
| **2주차** | Phase 3~4 | INBOUND/OUTBOUND 마이그레이션 |
| **3주차** | Phase 5~6 | 테스트, 배포 |

**총 소요 기간: 약 3주 (15일)**

---

## 10. 체크리스트

### 준비 단계
- [ ] caravan 라이브러리 Nexus 배포 완료 확인
- [ ] Tibero JDBC 드라이버 준비
- [ ] 개발/테스트 환경 Kafka 클러스터 준비
- [ ] TB_MCM_MOM_KAFKA_TOPICS에 OUTBOUND 토픽 등록 (BIZ_SYSTEM = 'SERAI')
- [ ] TB_MCM_MOM_TC_ERROR 테이블 + SQ_MCM_MOM_TC_ERROR 시퀀스 존재 확인

### Phase 1: 프로젝트 구조
- [ ] Spring Boot 2.7.18 프로젝트 생성 (Gradle)
- [ ] 패키지 구조 생성
- [ ] application.yml 작성 (caravan.kafka.biz-system: SERAI 설정)
- [ ] caravan 의존성 추가 및 AutoConfiguration 활성화 확인
- [ ] caravan 자동 Bean 등록 확인 (KafkaMessageProducer, KafkaStatusController 등)

### Phase 2: 설정
- [ ] DataSourceConfig 구현 (MST @Primary, IF)
- [ ] caravan DataSource 연동 확인 (MST → kafkaSqlSessionFactory 자동 생성)
- [ ] caravan Listener 자동 등록 확인 (TB_MCM_MOM_KAFKA_TOPICS 조회 → 토픽별 Listener)
- [ ] caravan REST API 접근 확인 (GET /kafkaApi/status)
- [ ] SERAI 전용 MyBatis Mapper 마이그레이션 (SeraiConfigMapper, InterfaceMapper)
- [ ] SERAI 전용 DTO 구현 (IntegrationRequest/Response만 — KafkaMessage 등은 caravan 제공)
- [ ] SftpSessionManager 구현

### Phase 3: INBOUND
- [ ] HttpIntegrationController 마이그레이션
- [ ] DbPollingScheduler/Service 구현 (scheduleAtFixedRate + AtomicBoolean)
- [ ] FilePollingScheduler/Service 구현 (scheduleAtFixedRate + AtomicBoolean)
- [ ] 폴링 주기 정확도 개선 적용
- [ ] 런타임 설정 변경 감지 (refreshSchedules - 신규/삭제 토픽 자동 반영)

### Phase 4: OUTBOUND
- [ ] SeraiConsumeHandler (BusinessStart) 구현 - @Component("SeraiConsumeHandler")
- [ ] OutboundRouter 구현 (INTEGRATION_TYPE별 분기)
- [ ] DbOutboundHandler 구현
- [ ] HttpOutboundHandler 구현
- [ ] FileOutboundHandler 구현
- [ ] HandleResult 전략 검증 (success/fail/failRetryable)

### Phase 5: 테스트
- [ ] 단위 테스트 통과
- [ ] 통합 테스트 통과
- [ ] SeraiConsumeHandler 메시지 수신 검증 (caravan → SeraiConsumeHandler 라우팅)
- [ ] HandleResult 시나리오 검증 (success/fail/failRetryable/재시도 초과)
- [ ] 컨테이너 PAUSE 시 /kafkaApi/resume, /kafkaApi/skipOffset 복구 검증
- [ ] 폴링 주기 정확도 검증
- [ ] 동시 실행 방지 검증
- [ ] 런타임 토픽 추가/삭제 시 자동 반영 검증 (refreshSchedules)
- [ ] 기존 시스템 병행 테스트
- [ ] 성능 테스트 완료

### Phase 6: 배포
- [ ] Docker 이미지 생성
- [ ] JAR 배포 및 실행 확인
- [ ] JEUS 제거 확인
- [ ] 모니터링 설정 완료

---

## 11. 롤백 계획

문제 발생 시 기존 시스템(cactus-dmesfw 기반)으로 롤백:

1. 신규 SERAI(Spring Boot + caravan) 서비스 중지
2. 기존 SERAI(JEUS + cactus-dmesfw) 서비스 재시작
3. Kafka Consumer Group Offset 확인 및 필요 시 조정
   - caravan REST API: `GET /kafkaApi/status` → 현재 Offset 확인
   - 필요 시: `POST /kafkaApi/skipOffset` → 중복 메시지 건너뛰기
4. TB_MCM_MOM_KAFKA_TOPICS의 BIZ_SYSTEM 확인 (기존 시스템과 동일한지)

---

## 12. 향후 업그레이드 경로 (선택)

현재 마이그레이션은 **1단계: 경량화**에 집중한다.
안정화 이후 필요 시 Spring Boot 3.x 업그레이드를 2단계로 진행할 수 있다.

```
1단계 (현재)                          2단계 (향후)
Spring Boot 2.7.x / Java 11          Spring Boot 3.x / Java 17
javax.* namespace                     jakarta.* namespace
caravan 수정 불필요                     caravan javax → jakarta 마이그레이션 필요
spring.factories                      META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
MyBatis-Spring-Boot 2.x              MyBatis-Spring-Boot 3.x
```

### 2단계 업그레이드 시 필요한 작업

| 항목 | 변경 내용 |
|------|----------|
| caravan | javax.validation → jakarta.validation, javax.servlet → jakarta.servlet |
| caravan | spring.factories → AutoConfiguration.imports 등록 방식 변경 |
| caravan | MyBatis 2.x → 3.x 호환 확인 |
| caravan | Java 8 → 17 sourceCompatibility 변경 |
| SERAI | Java 11 → 17, Spring Boot 2.7 → 3.x 버전 변경 |
| SERAI | javax.* import → jakarta.* import 일괄 변경 |

> **권장**: 1단계(경량화)를 먼저 완료하고 운영 안정화 후 2단계를 검토한다. Spring Boot 2.7.x만으로도 cactus-dmesfw/OASIS/eGovFrame/JEUS 제거, JAR 배포, application.yml 통합 등 모든 경량화 목표가 달성된다.

---

## 13. 참고 문서

### caravan 라이브러리 상세 문서 (CARAVAN/)

| 문서 | 내용 |
|------|------|
| [01-ARCHITECTURE.md](./CARAVAN/01-ARCHITECTURE.md) | 아키텍처 개요, 패키지 구조, 의존성 관계도 |
| [02-CONFIGURATION.md](./CARAVAN/02-CONFIGURATION.md) | CaravanProperties, AutoConfiguration, DataSource |
| [03-PRODUCER.md](./CARAVAN/03-PRODUCER.md) | KafkaMessageProducer, SendResult |
| [04-CONSUMER.md](./CARAVAN/04-CONSUMER.md) | **KafkaMessageConsumer, SERAI 예외 라우팅, 재시도 로직** |
| [05-HANDLER.md](./CARAVAN/05-HANDLER.md) | **KafkaInterfaceHandler, SeraiConsumeHandler 구현 규칙** |
| [06-CONTAINER-OFFSET.md](./CARAVAN/06-CONTAINER-OFFSET.md) | **ContainerController (pause/resume), OffsetManager** |
| [07-REST-API.md](./CARAVAN/07-REST-API.md) | KafkaStatusController (/kafkaApi/*) |
| [08-DATABASE.md](./CARAVAN/08-DATABASE.md) | KafkaMapper, 테이블 구조 |
| [09-MODEL-DTO.md](./CARAVAN/09-MODEL-DTO.md) | KafkaMessageContext, HandleResult, SendResult 등 |
| [10-UTILITY-EXCEPTION.md](./CARAVAN/10-UTILITY-EXCEPTION.md) | JsonUtil, KafkaConstants, 예외 클래스 |

### 기타 참고 문서

- [KAFKA_LIBRARY_SEPARATION_PLAN.md](./KAFKA_LIBRARY_SEPARATION_PLAN.md) - caravan 라이브러리 분리 설계
- [KAFKA_CONSUMER_HANDLER_DESIGN.md](./KAFKA_CONSUMER_HANDLER_DESIGN.md) - Handler 패턴 초기 설계
- [SERAI_INBOUND_OVERVIEW.md](../INBOUND/SERAI_INBOUND_OVERVIEW.md) - INBOUND 기능 명세
- [SERAI_OUTBOUND_OVERVIEW.md](../OUTBOUND/SERAI_OUTBOUND_OVERVIEW.md) - OUTBOUND 기능 명세
- [SERAI_INBOUND_POLLING_IMPROVEMENT_PLAN.md](../INBOUND/SERAI_INBOUND_POLLING_IMPROVEMENT_PLAN.md) - 폴링 주기 개선 (구현 완료)

---

*이 문서는 SERAI 프로젝트 Spring Boot 경량화 마이그레이션을 위해 작성되었습니다.*
