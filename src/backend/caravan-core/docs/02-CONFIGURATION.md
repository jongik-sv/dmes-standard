# 02. 설정 (Configuration)

## 파일 목록

| 파일 | 역할 |
|------|------|
| `CaravanAutoConfiguration` | Spring Boot 자동 설정 진입점 |
| `CaravanConfiguration` | 순수 Spring Framework 수동 설정 |
| `CaravanProperties` | 프로퍼티 바인딩 (`caravan.kafka.*`) |
| `KafkaProducerConfig` | KafkaTemplate, ProducerFactory 생성 |
| `KafkaConsumerConfig` | ConsumerFactory, ListenerContainerFactory 생성 |
| `KafkaDataSourceConfig` | MyBatis SqlSessionFactory 생성 |
| `KafkaAdminConfig` | AdminClient, DeadLetterPublishingRecoverer 생성 |

---

## CaravanAutoConfiguration

**경로**: `autoconfigure/CaravanAutoConfiguration.java`

Spring Boot 환경에서 자동 활성화되는 진입점이다.

```
META-INF/spring.factories
  └── EnableAutoConfiguration = CaravanAutoConfiguration
```

### 활성화 조건

```java
@ConditionalOnClass(KafkaTemplate.class)           // kafka-clients가 classpath에 있을 때
@ConditionalOnProperty(
    prefix = "caravan.kafka",
    name = "enabled",
    havingValue = "true",
    matchIfMissing = true)                          // caravan.kafka.enabled=true (기본값)
```

### Import 대상

모든 Caravan 컴포넌트를 `@Import`로 등록한다. 아래 목록 전체가 Spring Bean으로 등록된다.

| 계층 | Bean |
|------|------|
| Config | KafkaDataSourceConfig, KafkaProducerConfig, KafkaConsumerConfig, KafkaAdminConfig |
| Handler | DefaultKafkaInterfaceHandler, KafkaInterfaceHandlerRegistry |
| Consumer | KafkaMessageConsumer, KafkaDltConsumer, KafkaListenerConfig |
| Producer | KafkaMessageProducer |
| Service | ContainerController, KafkaOffsetManager, MessageBrowser |
| Repository | KafkaTopicRepository, KafkaErrorRepository |
| Controller | KafkaStatusController |

---

## CaravanConfiguration

**경로**: `config/CaravanConfiguration.java`

Spring Boot를 사용하지 않는 순수 Spring Framework 환경에서 수동으로 Import하여 사용한다.

```java
@Configuration
@Import(CaravanConfiguration.class)
@PropertySource("classpath:caravan.properties")
public class AppConfig { }
```

Import 대상은 `CaravanAutoConfiguration`과 동일하다.

---

## CaravanProperties

**경로**: `config/CaravanProperties.java`

`@ConfigurationProperties(prefix = "caravan.kafka")`로 프로퍼티를 바인딩한다.

### 프로퍼티 구조

```yaml
caravan:
  kafka:
    enabled: true                      # Kafka 활성화 여부 (기본: true)
    bootstrap-servers: localhost:9092   # [필수] 브로커 주소
    biz-system: MY_SYSTEM              # [필수] 비즈니스 시스템 코드

    producer:
      acks: all                        # ACK 설정 (기본: all)
      retries: 3                       # 재시도 횟수 (기본: 3)
      timeout-seconds: 10             # 응답 대기 시간 초 (기본: 10)
      idempotence: true               # 멱등성 (기본: true)
      max-in-flight-requests: 5       # in-flight 요청 제한 (기본: 5)

    consumer:
      enabled: true                    # Consumer 활성화 여부 (기본: true)
      auto-offset-reset: earliest     # 시작 위치 (기본: earliest)
      enable-auto-commit: false       # 자동 커밋 비활성화 (기본: false)
      max-poll-records: 1             # poll당 최대 레코드 (기본: 1)
      poll-timeout-ms: 3000           # poll 타임아웃 ms (기본: 3000)
      concurrency: 1                  # 병렬 Consumer 수 (기본: 1)

    retry:
      max-attempts: 3                  # 최대 재시도 횟수 (기본: 3)
      delay-ms: 2000                   # 재시도 간격 ms (기본: 2000)
```

### 내부 클래스

| 클래스 | 필드 |
|--------|------|
| `Producer` | acks, retries, timeoutSeconds, idempotence, maxInFlightRequests |
| `Consumer` | enabled, autoOffsetReset, enableAutoCommit, maxPollRecords, pollTimeoutMs, concurrency |
| `Retry` | maxAttempts, delayMs |

### Validation

`@Validated` + `@NotBlank`로 필수 필드를 검증한다.

- `bootstrapServers`: 필수
- `bizSystem`: 필수

---

## KafkaProducerConfig

**경로**: `config/KafkaProducerConfig.java`

### 생성 Bean

| Bean | 타입 | 설명 |
|------|------|------|
| `kafkaProducerFactory` | `ProducerFactory<String, String>` | Kafka Producer 팩토리 |
| `kafkaTemplate` | `KafkaTemplate<String, String>` | Kafka 전송 템플릿 |

### Producer 설정 매핑

```
CaravanProperties.producer.acks         → ProducerConfig.ACKS_CONFIG
CaravanProperties.producer.retries      → ProducerConfig.RETRIES_CONFIG
CaravanProperties.producer.idempotence  → ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG
CaravanProperties.producer.maxInFlightRequests → ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION
```

Key/Value 직렬화: `StringSerializer`

---

## KafkaConsumerConfig

**경로**: `config/KafkaConsumerConfig.java`

### 생성 Bean

| Bean | 타입 | 설명 |
|------|------|------|
| `kafkaConsumerFactory` | `ConsumerFactory<String, String>` | Kafka Consumer 팩토리 |
| `kafkaListenerContainerFactory` | `ConcurrentKafkaListenerContainerFactory` | Listener 컨테이너 팩토리 |

### Consumer 설정 매핑

```
CaravanProperties.bootstrapServers              → ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG
CaravanProperties.consumer.autoOffsetReset       → ConsumerConfig.AUTO_OFFSET_RESET_CONFIG
CaravanProperties.consumer.enableAutoCommit      → ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG
CaravanProperties.consumer.maxPollRecords        → ConsumerConfig.MAX_POLL_RECORDS_CONFIG
```

### AckMode

```java
factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
```

`MANUAL_IMMEDIATE`로 설정되어 있어 `Acknowledgment.acknowledge()` 호출 시 즉시 오프셋이 커밋된다. `KafkaMessageConsumer`에서 수동으로 커밋을 관리한다.

---

## KafkaDataSourceConfig

**경로**: `config/KafkaDataSourceConfig.java`

호스트 프로젝트의 `DataSource`를 주입받아 Caravan 전용 `SqlSessionFactory`를 구성한다.

### 생성 Bean

| Bean | 타입 | 설명 |
|------|------|------|
| `kafkaSqlSessionFactory` | `SqlSessionFactory` | Caravan 전용 MyBatis 세션 팩토리 |
| `kafkaSqlSessionTemplate` | `SqlSessionTemplate` | Caravan 전용 MyBatis 세션 템플릿 |

### Mapper 스캔

```java
@MapperScan(basePackages = "com.dongkuk.caravan.mapper",
            sqlSessionFactoryRef = "kafkaSqlSessionFactory")
```

`com.dongkuk.caravan.mapper` 패키지의 Mapper 인터페이스를 스캔하여 `kafkaSqlSessionFactory`에 바인딩한다.

### MyBatis 설정

```java
configuration.setMapUnderscoreToCamelCase(true);   // DB 컬럼 SNAKE_CASE → Java 필드 camelCase
```

Mapper XML 위치: `classpath:mapper/KafkaMapper.xml`

---

## KafkaAdminConfig

**경로**: `config/KafkaAdminConfig.java`

### 생성 Bean

| Bean | 타입 | 설명 |
|------|------|------|
| `kafkaAdminClient` | `AdminClient` | Offset 조회/변경, 토픽 관리용 |
| `deadLetterPublishingRecoverer` | `DeadLetterPublishingRecoverer` | DLT 메시지 전송 |

### DLT 토픽 명명 규칙

```java
(record, ex) -> new TopicPartition(
    record.topic() + KafkaConstants.DLT_SUFFIX,   // 원본토픽명.dlt
    record.partition()
)
```

예: 원본 토픽 `MMPPMERPTT01` → DLT 토픽 `MMPPMERPTT01.dlt`
