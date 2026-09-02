# Caravan 테스트 시나리오 목차

## 테스트 구성

| 파일 | 유형 | 테스트 대상 | TC 수 |
|------|------|------------|-------|
| [01-UNIT-UTIL](01-UNIT-UTIL.md) | 단위 | JsonUtil, HandleResult, KafkaMessageContext | 19 |
| [02-UNIT-PRODUCER](02-UNIT-PRODUCER.md) | 단위 | KafkaMessageProducer, SendResult | 11 |
| [03-UNIT-CONSUMER](03-UNIT-CONSUMER.md) | 단위 | KafkaMessageConsumer (라우팅, 재시도, SERAI, failRetryableSkip) | 16 |
| [04-UNIT-HANDLER](04-UNIT-HANDLER.md) | 단위 | KafkaInterfaceHandlerRegistry, DefaultHandler | 9 |
| [05-UNIT-CONTAINER](05-UNIT-CONTAINER.md) | 단위 | ContainerController, KafkaOffsetManager | 16 |
| [06-UNIT-REPOSITORY](06-UNIT-REPOSITORY.md) | 단위 | KafkaErrorRepository, KafkaTopicRepository | 11 |
| [07-UNIT-REST-API](07-UNIT-REST-API.md) | 단위 | KafkaStatusController (MockMvc) | 15 |
| [08-INTEGRATION](08-INTEGRATION.md) | 통합 | Embedded Kafka 기반 통합 테스트 | 12 |
| [09-E2E-SCENARIO](09-E2E-SCENARIO.md) | E2E | 운영 시나리오 기반 전체 흐름 | 10 |
| **합계** | | | **119** |

---

## 테스트 유형별 설명

### 단위 테스트 (01~07)

- 외부 의존성을 **Mockito**로 대체
- Kafka 브로커, DB 불필요
- 각 클래스의 메서드 단위 검증
- 추가 필요 의존성: `mockito-core:4.11.0`

### 통합 테스트 (08)

- **@EmbeddedKafka**로 인메모리 Kafka 브로커 사용
- **H2**로 인메모리 DB 사용
- 실제 Spring Context 기동
- 컴포넌트 간 연동 검증
- 기존 의존성으로 실행 가능 (`spring-kafka-test`, `h2`)

### E2E 시나리오 테스트 (09)

- 실제 운영 환경 시뮬레이션
- 전송 → 수신 → 핸들러 → 에러 처리 → REST API 제어 전체 흐름
- 정상/에러/재시도/SERAI/컨테이너 제어 시나리오 포함

---

## TC ID 규칙

| 접두사 | 대상 |
|--------|------|
| `TC-UTIL-*` | 유틸리티, DTO |
| `TC-PROD-*` | Producer |
| `TC-CONS-*` | Consumer |
| `TC-HDL-*` | Handler, Registry |
| `TC-CTN-*` | ContainerController |
| `TC-OFS-*` | KafkaOffsetManager |
| `TC-REPO-*` | Repository |
| `TC-API-*` | REST API |
| `TC-INT-*` | 통합 테스트 |
| `TC-E2E-*` | E2E 시나리오 |

---

## build.gradle 추가 의존성

```groovy
// 단위 테스트용 (현재 누락)
testImplementation 'org.mockito:mockito-core:4.11.0'
```

기존에 포함된 테스트 의존성:
```groovy
testImplementation 'org.springframework.kafka:spring-kafka-test:2.9.11'
testImplementation 'junit:junit:4.13.2'
testImplementation 'org.springframework:spring-test:5.3.27'
testImplementation 'com.h2database:h2:2.2.224'
```
