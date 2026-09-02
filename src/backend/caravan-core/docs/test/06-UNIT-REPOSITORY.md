# 06. 단위 테스트 - Repository

## 대상 클래스

- `repository/KafkaErrorRepository.java`
- `repository/KafkaTopicRepository.java`

> Mock 대상: `KafkaMapper`, `CaravanProperties`

---

## KafkaErrorRepository

### 사전 조건

```
Mock:
  - KafkaMapper kafkaMapper
  - CaravanProperties properties (bizSystem = "DMES")
```

### TC-REPO-001: logSendError() - 정상 기록

| 항목 | 내용 |
|------|------|
| **메서드** | `logSendError("MMPPMERPTT01", "PQR02012", "msg-body", "TIMEOUT", "브로커 응답 없음")` |
| **검증** | `kafkaMapper.insertKafkaError()` 호출 1회 |
| **검증 - KafkaErrorLog 파라미터** | |
| | `interfaceProtocol` == `"IF_KAFKA"` |
| | `transactionCode` == `"PQR02012"` |
| | `interfaceId` == `"MMPPMERPTT01"` |
| | `interfaceMsg` == `"msg-body"` |
| | `errorType` == `"S"` |
| | `errorCode` == `"TIMEOUT"` |
| | `errorMsg` == `"브로커 응답 없음"` |
| | `createdObjectId` == `"DMES"` |
| | `createdProgramId` == `"CARAVAN"` |

### TC-REPO-002: logConsumeError() - 정상 기록

| 항목 | 내용 |
|------|------|
| **메서드** | `logConsumeError("MMPPMERPTT01", "PQR02012", 42, "HANDLER_ERR", "처리 실패")` |
| **검증 - KafkaErrorLog 파라미터** | |
| | `errorType` == `"R"` |
| | `interfaceMsg` == `"offset:42"` |

### TC-REPO-003: logSendError() - interfaceMsg 65000자 초과 시 절삭

| 항목 | 내용 |
|------|------|
| **메서드** | `logSendError("T", "TX", msg70000자, "ERR", "에러")` |
| **검증** | 전달된 `interfaceMsg` 길이 == 65000 |

### TC-REPO-004: logSendError() - errorMsg 1000자 초과 시 절삭

| 항목 | 내용 |
|------|------|
| **메서드** | `logSendError("T", "TX", "msg", "ERR", errorMsg2000자)` |
| **검증** | 전달된 `errorMsg` 길이 == 1000 |

### TC-REPO-005: logSendError() - errorCode 100자 초과 시 절삭

| 항목 | 내용 |
|------|------|
| **메서드** | `logSendError("T", "TX", "msg", errorCode200자, "에러")` |
| **검증** | 전달된 `errorCode` 길이 == 100 |

### TC-REPO-006: logSendError() - null 필드 처리

| 항목 | 내용 |
|------|------|
| **메서드** | `logSendError("T", null, null, null, null)` |
| **검증** | 예외 없이 `kafkaMapper.insertKafkaError()` 호출 |

---

## KafkaTopicRepository

### 사전 조건

```
Mock:
  - KafkaMapper kafkaMapper
  - CaravanProperties properties (bizSystem = "DMES")
```

### TC-REPO-007: getTopics() - bizSystem 자동 전달

| 항목 | 내용 |
|------|------|
| **메서드** | `getTopics()` |
| **검증** | `kafkaMapper.selectTopics("DMES")` 호출 1회 |

### TC-REPO-008: getTopicById() - 존재하는 토픽

| 항목 | 내용 |
|------|------|
| **메서드** | `getTopicById("MMPPMERPTT01")` |
| **Mock 설정** | `kafkaMapper.selectTopicById("DMES", "MMPPMERPTT01")` → TopicInfo 객체 |
| **기대 결과** | `Optional.of(TopicInfo)` |

### TC-REPO-009: getTopicById() - 미존재 토픽

| 항목 | 내용 |
|------|------|
| **메서드** | `getTopicById("UNKNOWN")` |
| **Mock 설정** | `kafkaMapper.selectTopicById()` → null |
| **기대 결과** | `Optional.empty()` |

### TC-REPO-010: getTopicsInfo() - 필터 파라미터 전달

| 항목 | 내용 |
|------|------|
| **메서드** | `getTopicsInfo("MMP", "SEND01", "RECV01")` |
| **검증** | `kafkaMapper.selectTopicsInfo("DMES", "MMP", "SEND01", "RECV01")` 호출 |

### TC-REPO-011: getTopicsInfo() - null 필터

| 항목 | 내용 |
|------|------|
| **메서드** | `getTopicsInfo(null, null, null)` |
| **검증** | `kafkaMapper.selectTopicsInfo("DMES", null, null, null)` 호출 |
