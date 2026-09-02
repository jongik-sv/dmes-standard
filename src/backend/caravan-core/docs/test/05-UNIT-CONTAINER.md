# 05. 단위 테스트 - Container / Offset

## 대상 클래스

- `container/ContainerController.java`
- `offset/KafkaOffsetManager.java`

> Mock 대상: `KafkaListenerEndpointRegistry`, `MessageListenerContainer`, `AdminClient`, `ContainerController`

---

## ContainerController

### 사전 조건

```
Mock:
  - KafkaListenerEndpointRegistry registry
  - MessageListenerContainer container
```

### TC-CTN-001: pause() - 실행 중인 컨테이너 일시정지

| 항목 | 내용 |
|------|------|
| **메서드** | `pause("listener-MMPPMERPTT01")` |
| **Mock 설정** | `registry.getListenerContainer("listener-MMPPMERPTT01")` → container, `container.isRunning()` → true |
| **검증** | `container.pause()` 호출 1회 |

### TC-CTN-002: resume() - 일시정지된 컨테이너 재개

| 항목 | 내용 |
|------|------|
| **메서드** | `resume("listener-MMPPMERPTT01")` |
| **Mock 설정** | `registry.getListenerContainer()` → container |
| **검증** | `container.resume()` 호출 1회 |

### TC-CTN-003: stop() - 컨테이너 완전 정지

| 항목 | 내용 |
|------|------|
| **메서드** | `stop("listener-MMPPMERPTT01")` |
| **검증** | `container.stop()` 호출 1회 |

### TC-CTN-004: start() - 정지된 컨테이너 시작

| 항목 | 내용 |
|------|------|
| **메서드** | `start("listener-MMPPMERPTT01")` |
| **검증** | `container.start()` 호출 1회 |

### TC-CTN-005: getStatus() - RUNNING

| 항목 | 내용 |
|------|------|
| **Mock 설정** | `container.isRunning()` → true, `container.isContainerPaused()` → false |
| **기대 결과** | `ContainerStatus.RUNNING` |

### TC-CTN-006: getStatus() - PAUSED

| 항목 | 내용 |
|------|------|
| **Mock 설정** | `container.isRunning()` → true, `container.isContainerPaused()` → true |
| **기대 결과** | `ContainerStatus.PAUSED` |

### TC-CTN-007: getStatus() - STOPPED

| 항목 | 내용 |
|------|------|
| **Mock 설정** | `container.isRunning()` → false |
| **기대 결과** | `ContainerStatus.STOPPED` |

### TC-CTN-008: getStatus() - NOT_EXISTS

| 항목 | 내용 |
|------|------|
| **Mock 설정** | `registry.getListenerContainer("listener-UNKNOWN")` → null |
| **기대 결과** | `ContainerStatus.NOT_EXISTS` |

### TC-CTN-009: exists() - 존재

| 항목 | 내용 |
|------|------|
| **Mock 설정** | `registry.getListenerContainer()` → container (not null) |
| **기대 결과** | `true` |

### TC-CTN-010: exists() - 미존재

| 항목 | 내용 |
|------|------|
| **Mock 설정** | `registry.getListenerContainer()` → null |
| **기대 결과** | `false` |

---

## KafkaOffsetManager

### 사전 조건

```
Mock:
  - AdminClient adminClient
  - ContainerController containerController
```

### TC-OFS-001: getCurrentOffset() - 커밋된 offset 존재

| 항목 | 내용 |
|------|------|
| **메서드** | `getCurrentOffset("my-group", "MMPPMERPTT01")` |
| **Mock 설정** | `adminClient.listConsumerGroupOffsets()` → offset=42 |
| **기대 결과** | `42` |

### TC-OFS-002: getCurrentOffset() - 커밋된 offset 없음

| 항목 | 내용 |
|------|------|
| **메서드** | `getCurrentOffset("my-group", "MMPPMERPTT01")` |
| **Mock 설정** | `adminClient.listConsumerGroupOffsets()` → null (offset 없음) |
| **기대 결과** | `0` |

### TC-OFS-003: getMaxOffset() - 정상 조회

| 항목 | 내용 |
|------|------|
| **메서드** | `getMaxOffset("MMPPMERPTT01")` |
| **Mock 설정** | `adminClient.listOffsets(OffsetSpec.latest())` → offset=150 |
| **기대 결과** | `150` |

### TC-OFS-004: skipOffset() - 1건 스킵

| 항목 | 내용 |
|------|------|
| **메서드** | `skipOffset("listener-T", "my-group", "T", 1)` |
| **Mock 설정** | currentOffset=100, maxOffset=150 |
| **검증 순서** | |
| | 1. `containerController.stop("listener-T")` |
| | 2. `adminClient.alterConsumerGroupOffsets("my-group", offset=101)` |
| | 3. `containerController.start("listener-T")` |
| | 4. `containerController.resume("listener-T")` |
| **기대 결과** | OffsetInfo: `beforeOffset=100`, `afterOffset=101`, `maxOffset=150` |

### TC-OFS-005: skipOffset() - count가 남은 메시지보다 클 때

| 항목 | 내용 |
|------|------|
| **메서드** | `skipOffset("listener-T", "my-group", "T", 100)` |
| **Mock 설정** | currentOffset=140, maxOffset=150 |
| **기대 결과** | `afterOffset=150` (maxOffset 초과 안 함) |

### TC-OFS-006: skipOffset() - AdminClient 실패

| 항목 | 내용 |
|------|------|
| **메서드** | `skipOffset("listener-T", "my-group", "T", 1)` |
| **Mock 설정** | `adminClient.listConsumerGroupOffsets()` → 예외 |
| **기대 결과** | `KafkaOffsetException` 발생 |
