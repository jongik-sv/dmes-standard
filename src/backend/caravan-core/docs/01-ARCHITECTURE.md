# 01. 아키텍처 개요

## 프로젝트 구조

```
caravan/
├── build.gradle
├── README.md
├── docs/
│   └── SQL/                          # DDL 스크립트
├── src/main/java/com/dongkuk/caravan/
│   ├── autoconfigure/                # Spring Boot 자동 설정
│   │   └── CaravanAutoConfiguration
│   ├── config/                       # 설정 (Properties, Producer, Consumer, DataSource, Admin)
│   │   ├── CaravanConfiguration
│   │   ├── CaravanProperties
│   │   ├── KafkaProducerConfig
│   │   ├── KafkaConsumerConfig
│   │   ├── KafkaDataSourceConfig
│   │   └── KafkaAdminConfig
│   ├── consumer/                     # 메시지 수신
│   │   ├── KafkaListenerConfig
│   │   ├── KafkaMessageConsumer
│   │   └── KafkaDltConsumer
│   ├── producer/                     # 메시지 송신
│   │   ├── KafkaMessageProducer
│   │   ├── SendResult
│   │   └── ProducerCallback
│   ├── handler/                      # 핸들러 (동적 라우팅)
│   │   ├── KafkaInterfaceHandler
│   │   ├── KafkaInterfaceHandlerRegistry
│   │   ├── DefaultKafkaInterfaceHandler
│   │   └── HandleResult
│   ├── container/                    # 컨테이너 제어
│   │   ├── ContainerController
│   │   └── ContainerStatus
│   ├── offset/                       # Offset 관리
│   │   ├── KafkaOffsetManager
│   │   ├── OffsetInfo
│   │   └── MessageBrowser
│   ├── controller/                   # REST API
│   │   └── KafkaStatusController
│   ├── repository/                   # DB 접근
│   │   ├── KafkaTopicRepository
│   │   └── KafkaErrorRepository
│   ├── mapper/                       # MyBatis 매퍼
│   │   └── KafkaMapper
│   ├── model/                        # DTO / 모델
│   │   ├── KafkaMessage
│   │   ├── KafkaMessageContext
│   │   ├── KafkaErrorLog
│   │   ├── TopicInfo
│   │   └── BrowseResult
│   ├── exception/                    # 예외
│   │   ├── KafkaSendException
│   │   ├── KafkaConsumeException
│   │   └── KafkaOffsetException
│   └── util/                         # 유틸리티
│       ├── KafkaConstants
│       └── JsonUtil
└── src/main/resources/
    ├── mapper/
    │   └── KafkaMapper.xml           # MyBatis SQL
    └── META-INF/
        └── spring.factories          # Spring Boot 자동 설정 진입점
```

---

## 운영 모델

**1 Topic : 1 Partition : 1 Group**

- 하나의 토픽에 하나의 파티션, 하나의 Consumer Group
- `INTERFACE_ID` = `TOPIC_ID`
- 순서 보장이 기본 전제

---

## 메시지 수신 흐름 (Consumer)

```
Kafka Broker
    │
    ▼
KafkaListenerConfig          ← 애플리케이션 시작 시 DB에서 토픽 목록 조회, Listener 동적 등록
    │
    ▼
KafkaMessageConsumer.consume()
    │
    ├── 1. JSON 파싱 → KafkaMessageContext 생성
    │
    ├── 2. TRANSACTION_CODE 추출
    │
    ├── 3. KafkaInterfaceHandlerRegistry.getHandler()
    │       └── ApplicationContext.getBean(transactionCode)
    │           ├── Bean 존재 → 해당 Handler 반환
    │           └── Bean 없음 → DefaultKafkaInterfaceHandler (경고 로그 후 스킵)
    │
    ├── 4. handler.businessHandle(context) 실행 (재시도 루프)
    │       ├── HandleResult.success()       → offset 커밋, 다음 메시지
    │       ├── HandleResult.fail()          → 에러 DB 기록, offset 커밋, 다음 메시지
    │       └── HandleResult.failRetryable() → 재시도 (최대 횟수 초과 시 컨테이너 일시정지)
    │
    └── 5. Acknowledgment.acknowledge() (수동 커밋)
```

---

## 메시지 송신 흐름 (Producer)

```
호스트 프로젝트 코드
    │
    ▼
KafkaMessageProducer.send(topic, transactionCode, interfaceMsg)
    │
    ├── 1. KafkaMessage → 표준 JSON 빌드 (buildMessageJson)
    │       ├── TRANSACTION_CODE  ← 사용자 입력
    │       ├── KAFKA_KEYDATA     ← UUID 자동 생성
    │       ├── INTERFACE_ID      ← topic 자동 설정
    │       ├── INTERFACE_MSG     ← 사용자 입력
    │       └── INTERFACE_PROTOCOL ← "IF_KAFKA" 자동 설정
    │
    ├── 2. KafkaTemplate.send(topic, json)
    │
    ├── 3-A. 동기: Future.get(timeout) → SendResult 반환
    │
    └── 3-B. 비동기: ListenableFutureCallback → ProducerCallback 호출
```

---

## 의존성 관계도

```
KafkaStatusController (REST API)
├── ContainerController
├── KafkaOffsetManager
│   ├── AdminClient
│   └── ContainerController
├── MessageBrowser
│   └── ConsumerFactory
└── KafkaTopicRepository
    └── KafkaMapper

KafkaMessageConsumer (메시지 소비)
├── KafkaInterfaceHandlerRegistry
│   ├── ApplicationContext
│   └── DefaultKafkaInterfaceHandler
├── ContainerController
│   └── KafkaListenerEndpointRegistry
├── KafkaErrorRepository
│   ├── KafkaMapper
│   └── CaravanProperties
└── CaravanProperties

KafkaMessageProducer (메시지 생산)
├── KafkaTemplate
├── CaravanProperties
├── KafkaErrorRepository
└── JsonUtil

KafkaListenerConfig (리스너 등록)
├── KafkaTopicRepository
├── KafkaMessageConsumer
├── KafkaDltConsumer
├── CaravanProperties
└── ConcurrentKafkaListenerContainerFactory
```

---

## DataSource 구조

Caravan은 별도의 DataSource를 생성하지 않는다. 호스트 프로젝트의 DataSource를 주입받아 Caravan 전용 `SqlSessionFactory`를 구성한다.

```
호스트 프로젝트 DataSource
    │
    ▼
KafkaDataSourceConfig
    ├── kafkaSqlSessionFactory  (KafkaMapper.xml 로드)
    └── kafkaSqlSessionTemplate
            │
            ▼
        KafkaMapper (MyBatis)
```

---

## 기술 스택

| 항목 | 버전 |
|------|------|
| Java | 8 |
| Spring Framework | 5.3.27 |
| Spring Kafka | 2.9.11 |
| Apache Kafka Client | 3.6.0 |
| MyBatis | 3.5.13 |
| Jackson | 2.16.1 |
| Lombok | 1.18.26 |
| Spring Boot (optional) | 2.7.18 |
| Database | Tibero |
