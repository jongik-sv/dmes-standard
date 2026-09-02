# 07. REST API

## 파일 목록

| 파일 | 역할 |
|------|------|
| `controller/KafkaStatusController.java` | REST 엔드포인트 (유일한 Controller) |

---

## KafkaStatusController

**경로**: `controller/KafkaStatusController.java`

`@RestController`, 기본 경로: `/kafkaApi`

### 의존성

```java
private final ContainerController containerController;
private final KafkaOffsetManager offsetManager;
private final MessageBrowser messageBrowser;
private final KafkaTopicRepository topicRepository;
```

---

## 엔드포인트 목록

| Method | URL | 설명 |
|--------|-----|------|
| GET | `/kafkaApi/status` | 토픽 상태 조회 |
| POST | `/kafkaApi/stop` | 컨테이너 정지 |
| POST | `/kafkaApi/pause` | 컨테이너 일시정지 |
| POST | `/kafkaApi/resume` | 컨테이너 재개 |
| POST | `/kafkaApi/startConsumer` | 컨테이너 시작 |
| POST | `/kafkaApi/skipOffset` | Offset 스킵 |
| GET | `/kafkaApi/browse` | 시간 범위 메시지 조회 |
| GET | `/kafkaApi/peekOffset` | 특정 Offset 메시지 조회 |

---

### GET /kafkaApi/status

토픽 상태를 조회한다.

**파라미터** (모두 선택):

| 파라미터 | 설명 |
|----------|------|
| `topicId` | 토픽 ID 필터 (LIKE 검색) |
| `sendModuleId` | 송신 모듈 ID 필터 |
| `recvModuleId` | 수신 모듈 ID 필터 |

**응답 예시**:

```json
[
  {
    "TOPIC_ID": "MMPPMERPTT01",
    "TOPIC_DESC": "ERP 연동 토픽",
    "GROUP_ID": "erp-group",
    "CONTAINER_STATUS": "RUNNING",
    "CURRENT_OFFSET": 100,
    "MAX_OFFSET": 150
  }
]
```

**내부 동작**:

```
1. topicRepository.getTopicsInfo(topicId, sendModuleId, recvModuleId)
2. 각 토픽에 대해:
   ├── containerController.getStatus("listener-" + topicId) → CONTAINER_STATUS
   ├── offsetManager.getCurrentOffset(groupId, topicId)     → CURRENT_OFFSET
   └── offsetManager.getMaxOffset(topicId)                  → MAX_OFFSET
3. LinkedHashMap 리스트로 응답 (필드 순서 보장)
```

---

### POST /kafkaApi/stop

컨테이너를 완전 정지한다 (브로커 연결 해제).

**요청 Body**:

```json
{ "topicId": "MMPPMERPTT01" }
```

**내부 동작**:

```
containerController.stop("listener-" + topicId)
```

**응답**: `"OK"`

---

### POST /kafkaApi/pause

컨테이너를 일시정지한다 (브로커 연결 유지, 메시지 수신 중단).

**요청 Body**:

```json
{ "topicId": "MMPPMERPTT01" }
```

**내부 동작**:

```
containerController.pause("listener-" + topicId)
```

**응답**: `"OK"`

---

### POST /kafkaApi/resume

일시정지된 컨테이너를 재개한다.

**요청 Body**:

```json
{ "topicId": "MMPPMERPTT01" }
```

**내부 동작**:

```
containerController.resume("listener-" + topicId)
```

**응답**: `"OK"`

---

### POST /kafkaApi/startConsumer

정지된 컨테이너를 시작한다.

**요청 Body**:

```json
{ "topicId": "MMPPMERPTT01" }
```

**내부 동작**:

```
listenerId = "listener-" + topicId
status = containerController.getStatus(listenerId)

if (status == RUNNING)    → "ALREADY_RUNNING" 반환
if (status != NOT_EXISTS) → containerController.start(listenerId) → "START_EXISTING" 반환
else                      → "NOT_FOUND" 반환
```

**응답**: `"ALREADY_RUNNING"` | `"START_EXISTING"` | `"NOT_FOUND"`

---

### POST /kafkaApi/skipOffset

지정한 수만큼 메시지를 건너뛴다.

**요청 Body**:

```json
{
  "topicId": "MMPPMERPTT01",
  "groupId": "erp-group",
  "count": 1                  // 선택 (기본값: 1)
}
```

**내부 동작**:

```
offsetManager.skipOffset("listener-" + topicId, groupId, topicId, count)
```

**응답 예시**:

```json
{
  "topicId": "MMPPMERPTT01",
  "groupId": "erp-group",
  "beforeCurrentOffset": 100,
  "afterCurrentOffset": 101,
  "maxOffset": 150,
  "success": true
}
```

---

### GET /kafkaApi/browse

시간 범위로 메시지를 조회한다.

**파라미터**:

| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `topicId` | Y | 토픽 ID |
| `fromTimestamp` | Y | 시작 시간 (epoch ms) |
| `toTimestamp` | Y | 종료 시간 (epoch ms) |
| `maxCount` | N | 최대 조회 건수 (기본: 100) |

**내부 동작**:

```
messageBrowser.browseByTimeRange(topicId, fromTimestamp, toTimestamp, maxCount)
```

**응답 예시**:

```json
[
  {
    "offset": 105,
    "partition": 0,
    "topic": "MMPPMERPTT01",
    "key": null,
    "value": "{\"TRANSACTION_CODE\":\"PQR02012\",...}",
    "timestamp": 1704067200000,
    "timestampStr": "2026-01-01 09:00:00"
  }
]
```

---

### GET /kafkaApi/peekOffset

특정 Offset의 메시지 하나를 조회한다.

**파라미터**:

| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `topicId` | Y | 토픽 ID |
| `offset` | Y | 조회할 Offset |

**내부 동작**:

```
messageBrowser.peekAtOffset(topicId, offset)
```

**응답 예시**:

```json
{
  "offset": 105,
  "partition": 0,
  "topic": "MMPPMERPTT01",
  "key": null,
  "value": "{\"TRANSACTION_CODE\":\"PQR02012\",...}",
  "timestamp": 1704067200000,
  "timestampStr": "2026-01-01 09:00:00"
}
```

Offset에 해당하는 메시지가 없으면 빈 응답을 반환한다.

---

## 에러 복구 시나리오

최대 재시도 초과로 컨테이너가 PAUSED 상태일 때:

```
1. GET /kafkaApi/status?topicId=MMPPMERPTT01
   → CONTAINER_STATUS: "PAUSED", CURRENT_OFFSET: 105

2. GET /kafkaApi/peekOffset?topicId=MMPPMERPTT01&offset=105
   → 문제 메시지 확인

3-A. 문제 해결 후 재개:
   POST /kafkaApi/resume  {"topicId": "MMPPMERPTT01"}

3-B. 문제 메시지 스킵:
   POST /kafkaApi/skipOffset  {"topicId": "MMPPMERPTT01", "groupId": "erp-group", "count": 1}
```
