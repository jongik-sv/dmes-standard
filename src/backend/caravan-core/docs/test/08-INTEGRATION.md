# 08. 통합 테스트 - Embedded Kafka

## 개요

`@EmbeddedKafka`를 사용하여 실제 Kafka 브로커 없이 통합 테스트를 수행한다.

> 필요 의존성: `spring-kafka-test:2.9.11` (이미 build.gradle에 포함)
> 추가 필요: `mockito-core:4.11.0`

---

## 사전 조건 (공통)

```java
@SpringBootTest
@EmbeddedKafka(
    partitions = 1,
    topics = {"test-topic", "test-topic.dlt"},
    brokerProperties = {"listeners=PLAINTEXT://localhost:9092"}
)
```

---

## Producer 통합 테스트

### TC-INT-001: 실제 Kafka 전송 → 메시지 수신 확인

| 항목 | 내용 |
|------|------|
| **동작** | `producer.send("test-topic", "PQR02012", "A\|B\|C")` |
| **검증** | Embedded Kafka Consumer로 `test-topic` 구독하여 메시지 수신 |
| **검증** | 수신된 JSON에 5개 표준 필드 포함 |
| **검증** | `TRANSACTION_CODE` == `"PQR02012"` |
| **검증** | `INTERFACE_ID` == `"test-topic"` |
| **검증** | `INTERFACE_PROTOCOL` == `"IF_KAFKA"` |
| **검증** | `KAFKA_KEYDATA` UUID 형식 |

### TC-INT-002: 전송 후 SendResult 메타데이터 검증

| 항목 | 내용 |
|------|------|
| **동작** | `producer.send("test-topic", "PQR02012", "msg")` |
| **검증** | `result.isSuccess()` == true |
| **검증** | `result.getTopic()` == `"test-topic"` |
| **검증** | `result.getPartition()` == 0 |
| **검증** | `result.getOffset()` >= 0 |

---

## Consumer 통합 테스트

### TC-INT-003: 메시지 전송 → Consumer 수신 → 핸들러 호출

| 항목 | 내용 |
|------|------|
| **사전** | `@Component("TEST_TX")` 핸들러를 테스트 컨텍스트에 등록 |
| **동작** | `test-topic`에 `{"TRANSACTION_CODE":"TEST_TX","INTERFACE_MSG":"data",...}` 전송 |
| **검증** | TEST_TX 핸들러의 `businessHandle()` 호출됨 |
| **검증** | `context.getTransactionCode()` == `"TEST_TX"` |
| **검증** | `context.getInterfaceMsg()` == `"data"` |

### TC-INT-004: Consumer 재시도 → 최대 초과 → 컨테이너 일시정지

| 항목 | 내용 |
|------|------|
| **사전** | 핸들러가 항상 `failRetryable()` 반환하도록 설정, `maxAttempts=2` |
| **동작** | 메시지 전송 |
| **검증** | 핸들러 2회 호출 |
| **검증** | 컨테이너 상태 == PAUSED |

### TC-INT-005: SERAI 시스템 라우팅 통합 테스트

| 항목 | 내용 |
|------|------|
| **사전** | `caravan.kafka.biz-system=serai_test`, `@Component("SeraiConsumeHandler")` 핸들러 등록 |
| **동작** | `{"TRANSACTION_CODE":"PQR02012",...}` 메시지 전송 |
| **검증** | SeraiConsumeHandler 핸들러 호출됨 (PQR02012 핸들러 아님) |
| **검증** | `context.getTransactionCode()` == `"PQR02012"` (원본 코드 유지) |

---

## Offset 통합 테스트

### TC-INT-006: 메시지 전송 → getCurrentOffset / getMaxOffset 확인

| 항목 | 내용 |
|------|------|
| **동작** | `test-topic`에 메시지 3건 전송, Consumer로 2건 커밋 |
| **검증** | `offsetManager.getCurrentOffset("test-group", "test-topic")` == 2 |
| **검증** | `offsetManager.getMaxOffset("test-topic")` == 3 |

### TC-INT-007: skipOffset → offset 변경 확인

| 항목 | 내용 |
|------|------|
| **사전** | currentOffset=2, maxOffset=5 |
| **동작** | `offsetManager.skipOffset("listener-test-topic", "test-group", "test-topic", 2)` |
| **검증** | `getCurrentOffset()` == 4 |

---

## MessageBrowser 통합 테스트

### TC-INT-008: 메시지 전송 → peekAtOffset으로 조회

| 항목 | 내용 |
|------|------|
| **사전** | `test-topic`에 메시지 3건 전송 |
| **동작** | `messageBrowser.peekAtOffset("test-topic", 1)` |
| **검증** | `Optional.isPresent()` == true |
| **검증** | `result.getOffset()` == 1 |
| **검증** | `result.getValue()` JSON 파싱 가능 |

### TC-INT-009: browseByOffsetRange 범위 조회

| 항목 | 내용 |
|------|------|
| **사전** | `test-topic`에 메시지 5건 전송 |
| **동작** | `messageBrowser.browseByOffsetRange("test-topic", 1, 3)` |
| **검증** | 결과 리스트 크기 == 3 (offset 1, 2, 3) |

### TC-INT-010: browseByTimeRange 시간 범위 조회

| 항목 | 내용 |
|------|------|
| **사전** | `test-topic`에 메시지 전송 (현재 시간 기준) |
| **동작** | `messageBrowser.browseByTimeRange("test-topic", 시작시간, 종료시간, 10)` |
| **검증** | 결과 리스트에 전송한 메시지 포함 |
| **검증** | `timestampStr` 포맷 == `"yyyy-MM-dd HH:mm:ss"` |

---

## Listener 등록 통합 테스트

### TC-INT-011: 애플리케이션 시작 → DB 토픽 기반 Listener 등록

| 항목 | 내용 |
|------|------|
| **사전** | 시험 DB(Oracle)에 TB_MCM_MOM_KAFKA_TOPICS 레코드 2건 삽입 |
| **검증** | `registry.getListenerContainerIds()` 에 `"listener-T1"`, `"listener-T1.dlt"`, `"listener-T2"`, `"listener-T2.dlt"` 포함 |

### TC-INT-012: consumer.enabled=false → Listener 미등록

| 항목 | 내용 |
|------|------|
| **설정** | `caravan.kafka.consumer.enabled=false` |
| **검증** | `registry.getListenerContainerIds()` 비어 있음 |

---

## 참고: 시험 DB

이 모듈의 시험은 Oracle 시험 PDB(`-Pdmes.ora.test=clone`)를 쓴다. H2 는 oracle-1007 에서 의존성과 함께 제거했다.
TB_MCM_MOM_TC_ERROR INSERT 의 시퀀스 구문 `SQ_MCM_MOM_TC_ERROR.NEXTVAL` 은 Oracle 문법이며 그대로 쓴다.
