# 07. 단위 테스트 - REST API Controller

## 대상 클래스

- `controller/KafkaStatusController.java`

> Mock 대상: `ContainerController`, `KafkaOffsetManager`, `MessageBrowser`, `KafkaTopicRepository`
> 테스트 방식: MockMvc

---

## 사전 조건 (공통)

```
Mock:
  - ContainerController containerController
  - KafkaOffsetManager offsetManager
  - MessageBrowser messageBrowser
  - KafkaTopicRepository topicRepository
```

---

## GET /kafkaApi/status

### TC-API-001: 전체 토픽 상태 조회

| 항목 | 내용 |
|------|------|
| **요청** | `GET /kafkaApi/status` |
| **Mock 설정** | `topicRepository.getTopicsInfo(null, null, null)` → [TopicInfo(topicId="T1", groupId="G1")] |
| **Mock 설정** | `containerController.getStatus("listener-T1")` → RUNNING |
| **Mock 설정** | `offsetManager.getCurrentOffset("G1", "T1")` → 100 |
| **Mock 설정** | `offsetManager.getMaxOffset("T1")` → 150 |
| **검증** | HTTP 200 |
| **검증** | JSON 배열 크기 1, `TOPIC_ID="T1"`, `CONTAINER_STATUS="RUNNING"`, `CURRENT_OFFSET=100`, `MAX_OFFSET=150` |

### TC-API-002: topicId 필터로 상태 조회

| 항목 | 내용 |
|------|------|
| **요청** | `GET /kafkaApi/status?topicId=MMP` |
| **검증** | `topicRepository.getTopicsInfo("MMP", null, null)` 호출 |

### TC-API-003: 토픽 없을 때 빈 배열 반환

| 항목 | 내용 |
|------|------|
| **요청** | `GET /kafkaApi/status` |
| **Mock 설정** | `topicRepository.getTopicsInfo()` → 빈 리스트 |
| **검증** | HTTP 200, 빈 JSON 배열 `[]` |

---

## POST /kafkaApi/pause

### TC-API-004: 컨테이너 일시정지

| 항목 | 내용 |
|------|------|
| **요청** | `POST /kafkaApi/pause` body: `{"topicId":"MMPPMERPTT01"}` |
| **검증** | `containerController.pause("listener-MMPPMERPTT01")` 호출 1회 |
| **검증** | HTTP 200, body `"OK"` |

---

## POST /kafkaApi/resume

### TC-API-005: 컨테이너 재개

| 항목 | 내용 |
|------|------|
| **요청** | `POST /kafkaApi/resume` body: `{"topicId":"MMPPMERPTT01"}` |
| **검증** | `containerController.resume("listener-MMPPMERPTT01")` 호출 1회 |
| **검증** | HTTP 200 |

---

## POST /kafkaApi/stop

### TC-API-006: 컨테이너 정지

| 항목 | 내용 |
|------|------|
| **요청** | `POST /kafkaApi/stop` body: `{"topicId":"MMPPMERPTT01"}` |
| **검증** | `containerController.stop("listener-MMPPMERPTT01")` 호출 1회 |
| **검증** | HTTP 200 |

---

## POST /kafkaApi/startConsumer

### TC-API-007: 정지된 컨테이너 시작

| 항목 | 내용 |
|------|------|
| **요청** | `POST /kafkaApi/startConsumer` body: `{"topicId":"MMPPMERPTT01"}` |
| **Mock 설정** | `containerController.getStatus("listener-MMPPMERPTT01")` → STOPPED |
| **검증** | `containerController.start()` 호출 1회 |
| **검증** | HTTP 200, body `"START_EXISTING"` |

### TC-API-008: 이미 실행 중인 컨테이너 시작 시도

| 항목 | 내용 |
|------|------|
| **요청** | `POST /kafkaApi/startConsumer` body: `{"topicId":"MMPPMERPTT01"}` |
| **Mock 설정** | `containerController.getStatus()` → RUNNING |
| **검증** | `containerController.start()` 호출 **없음** |
| **검증** | HTTP 200, body `"ALREADY_RUNNING"` |

### TC-API-009: 미등록 토픽 시작 시도

| 항목 | 내용 |
|------|------|
| **요청** | `POST /kafkaApi/startConsumer` body: `{"topicId":"UNKNOWN"}` |
| **Mock 설정** | `containerController.getStatus()` → NOT_EXISTS |
| **검증** | HTTP 200, body `"NOT_FOUND"` |

---

## POST /kafkaApi/skipOffset

### TC-API-010: Offset 1건 스킵

| 항목 | 내용 |
|------|------|
| **요청** | `POST /kafkaApi/skipOffset` body: `{"topicId":"T1","groupId":"G1","count":1}` |
| **Mock 설정** | `offsetManager.skipOffset("listener-T1", "G1", "T1", 1)` → OffsetInfo(before=100, after=101, max=150) |
| **검증** | HTTP 200 |
| **검증** | JSON: `beforeCurrentOffset=100`, `afterCurrentOffset=101`, `maxOffset=150`, `success=true` |

### TC-API-011: count 생략 시 기본값 1

| 항목 | 내용 |
|------|------|
| **요청** | `POST /kafkaApi/skipOffset` body: `{"topicId":"T1","groupId":"G1"}` |
| **검증** | `offsetManager.skipOffset("listener-T1", "G1", "T1", 1)` 호출 (count=1) |

---

## GET /kafkaApi/browse

### TC-API-012: 시간 범위 메시지 조회

| 항목 | 내용 |
|------|------|
| **요청** | `GET /kafkaApi/browse?topicId=T1&fromTimestamp=1000&toTimestamp=2000&maxCount=50` |
| **Mock 설정** | `messageBrowser.browseByTimeRange("T1", 1000, 2000, 50)` → [BrowseResult] |
| **검증** | HTTP 200, JSON 배열 |

### TC-API-013: maxCount 생략 시 기본값 100

| 항목 | 내용 |
|------|------|
| **요청** | `GET /kafkaApi/browse?topicId=T1&fromTimestamp=1000&toTimestamp=2000` |
| **검증** | `messageBrowser.browseByTimeRange("T1", 1000, 2000, 100)` 호출 |

---

## GET /kafkaApi/peekOffset

### TC-API-014: 특정 Offset 메시지 조회 - 존재

| 항목 | 내용 |
|------|------|
| **요청** | `GET /kafkaApi/peekOffset?topicId=T1&offset=42` |
| **Mock 설정** | `messageBrowser.peekAtOffset("T1", 42)` → Optional.of(BrowseResult) |
| **검증** | HTTP 200, `offset=42`, `value` 포함 |

### TC-API-015: 특정 Offset 메시지 조회 - 미존재

| 항목 | 내용 |
|------|------|
| **요청** | `GET /kafkaApi/peekOffset?topicId=T1&offset=99999` |
| **Mock 설정** | `messageBrowser.peekAtOffset()` → Optional.empty() |
| **검증** | HTTP 200, 빈 응답 |
