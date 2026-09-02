# 06. 컨테이너 제어 & Offset 관리

## 파일 목록

| 파일 | 역할 |
|------|------|
| `container/ContainerController.java` | Listener 컨테이너 생명주기 관리 |
| `container/ContainerStatus.java` | 컨테이너 상태 Enum |
| `offset/KafkaOffsetManager.java` | Consumer Group Offset 조회/변경 |
| `offset/OffsetInfo.java` | Offset Skip 결과 DTO |
| `offset/MessageBrowser.java` | 메시지 조회 (디버깅용) |
| `model/BrowseResult.java` | 메시지 조회 결과 DTO |

---

## ContainerController

**경로**: `container/ContainerController.java`

`@Service`로 등록되며, `KafkaListenerEndpointRegistry`를 통해 Listener 컨테이너를 제어한다.

### 의존성

```java
private final KafkaListenerEndpointRegistry registry;
```

### Listener ID 규칙

```
메인 Listener: "listener-{topicId}"
DLT Listener:  "listener-{topicId}.dlt"
```

예: 토픽 `MMPPMERPTT01`의 메인 Listener ID = `listener-MMPPMERPTT01`

### 공개 API

| 메서드 | 설명 |
|--------|------|
| `pause(String listenerId)` | 일시정지 (브로커 연결 유지, 메시지 수신 중단) |
| `resume(String listenerId)` | 일시정지에서 재개 |
| `stop(String listenerId)` | 완전 정지 (브로커 연결 해제) |
| `start(String listenerId)` | 정지된 컨테이너 시작 |
| `getStatus(String listenerId)` | 현재 상태 조회 |
| `exists(String listenerId)` | 컨테이너 존재 여부 확인 |
| `getAllListenerIds()` | 전체 Listener ID 목록 |
| `getContainer(String listenerId)` | MessageListenerContainer 직접 접근 |

### 상태 전이

```
                    start()
        STOPPED ─────────────► RUNNING
           ▲                     │ │
           │     stop()          │ │
           └─────────────────────┘ │
                                   │ pause()
                                   ▼
                                PAUSED
                                   │
                                   │ resume()
                                   ▼
                                RUNNING
```

---

## ContainerStatus (Enum)

**경로**: `container/ContainerStatus.java`

```java
public enum ContainerStatus {
    RUNNING,      // 실행 중 (메시지 수신 중)
    PAUSED,       // 일시정지 (브로커 연결 유지, 수신 중단)
    STOPPED,      // 완전 정지 (브로커 연결 해제)
    NOT_EXISTS    // Listener가 등록되지 않음
}
```

---

## KafkaOffsetManager

**경로**: `offset/KafkaOffsetManager.java`

`@Service`로 등록되며, Kafka `AdminClient`를 통해 Consumer Group Offset을 관리한다.

### 의존성

```java
private final AdminClient adminClient;
private final ContainerController containerController;
```

### 주요 메서드

#### getCurrentOffset(String groupId, String topic)

Consumer Group의 커밋된 현재 Offset을 조회한다.

```
1. adminClient.listConsumerGroupOffsets(groupId)
2. TopicPartition(topic, 0)에 대한 Offset 반환
3. null이면 0 반환 (커밋된 offset이 없는 경우)
```

#### getMaxOffset(String topic)

토픽의 Log End Offset (가장 큰 offset)을 조회한다.

```
1. adminClient.listOffsets(OffsetSpec.latest())
2. TopicPartition(topic, 0)에 대한 offset 반환
```

#### getMinOffset(String topic)

토픽의 Log Start Offset (가장 작은 offset)을 조회한다.

```
1. adminClient.listOffsets(OffsetSpec.earliest())
```

#### skipOffset(String listenerId, String groupId, String topic, int count)

N개의 메시지를 건너뛴다. **반드시 컨테이너를 정지한 상태에서 실행해야 한다.**

```
1. containerController.stop(listenerId)           // 컨테이너 정지
2. beforeOffset = getCurrentOffset(groupId, topic) // 현재 offset 조회
3. maxOffset = getMaxOffset(topic)                 // 최대 offset 조회
4. newOffset = min(beforeOffset + count, maxOffset) // 새 offset 계산
5. adminClient.alterConsumerGroupOffsets(groupId, newOffset)  // offset 변경
6. containerController.start(listenerId)           // 컨테이너 재시작
7. containerController.resume(listenerId)          // 컨테이너 재개
8. OffsetInfo 반환
```

### 파티션 가정

모든 메서드에서 **파티션 0**을 사용한다. 1 Topic : 1 Partition 운영 모델을 전제로 한다.

```java
TopicPartition tp = new TopicPartition(topic, KafkaConstants.DEFAULT_PARTITION); // 0
```

### 타임아웃

`AdminClient` 호출의 타임아웃: **10초**

---

## OffsetInfo

**경로**: `offset/OffsetInfo.java`

```java
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class OffsetInfo {
    private long beforeOffset;   // skip 전 offset
    private long afterOffset;    // skip 후 offset
    private long maxOffset;      // 토픽 최대 offset
    private int partition;       // 파티션 (항상 0)
    private String topic;
    private String groupId;
}
```

---

## MessageBrowser

**경로**: `offset/MessageBrowser.java`

`@Service`로 등록되며, 디버깅 및 모니터링 목적으로 Kafka 메시지를 조회한다.

### 의존성

```java
private final ConsumerFactory<String, String> consumerFactory;
```

### 주요 메서드

#### browseByOffsetRange(String topic, long startOffset, long endOffset)

Offset 범위로 메시지를 조회한다.

```
1. 임시 Consumer 생성 (group.id 없음 — 메인 Consumer Group에 영향 없음)
2. assign(TopicPartition(topic, 0))
3. seek(startOffset)
4. poll() 반복하여 endOffset까지 수집
5. Consumer 종료
6. List<BrowseResult> 반환
```

#### browseByTimeRange(String topic, long fromTimestamp, long toTimestamp, int maxCount)

시간 범위로 메시지를 조회한다.

```
1. 임시 Consumer 생성
2. offsetsForTimes(fromTimestamp)로 시작 offset 계산
3. seek(시작 offset)
4. poll() 반복하여 toTimestamp 이전 + maxCount 이내의 메시지 수집
5. Consumer 종료
6. List<BrowseResult> 반환
```

#### peekAtOffset(String topic, long offset)

특정 Offset의 메시지 하나를 조회한다.

```
browseByOffsetRange(topic, offset, offset)의 첫 번째 결과 반환
Optional<BrowseResult>
```

### 임시 Consumer

`MessageBrowser`는 메시지를 조회할 때마다 임시 Consumer를 생성하고 닫는다. Consumer Group에 참여하지 않으므로 메인 Consumer의 Offset에 영향을 주지 않는다.

---

## BrowseResult

**경로**: `model/BrowseResult.java`

```java
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class BrowseResult {
    private long offset;
    private int partition;
    private String topic;
    private String key;
    private String value;         // 메시지 본문 (JSON)
    private long timestamp;
    private String timestampStr;  // "yyyy-MM-dd HH:mm:ss" 포맷
}
```
