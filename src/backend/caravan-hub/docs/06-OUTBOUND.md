# 06. OUTBOUND

## 관련 파일

```
handler/SeraiConsumeHandler/BusinessStart.java     # Caravan 핸들러 (진입점)
outbound/router/OutboundRouter.java              # INTEGRATION_TYPE별 분기
outbound/db/DbOutboundHandler.java               # DB INSERT
outbound/http/HttpOutboundHandler.java           # HTTP POST
outbound/file/FileOutboundHandler.java           # SFTP 파일 생성
```

---

## 동작 흐름

```
Kafka 메시지 수신
  → Caravan이 TRANSACTION_CODE로 Bean 조회 → "SeraiConsumeHandler" Bean 호출
  → BusinessStart.businessHandle(context)
  → OutboundRouter.route(context)
    → CaravanHubConfigMapper.selectOutboundConfig(topicId)로 설정 조회
    → INTEGRATION_TYPE 분기:
       DB   → DbOutboundHandler.handle()
       HTTP → HttpOutboundHandler.handle()
       FILE → FileOutboundHandler.handle()
```

---

## BusinessStart.java (SeraiConsumeHandler)

### Caravan 핸들러 등록 규칙

```java
@Component("SeraiConsumeHandler")  // Bean 이름 = TRANSACTION_CODE
public class BusinessStart implements KafkaInterfaceHandler {
```

Kafka 메시지의 `TRANSACTION_CODE`가 `"SeraiConsumeHandler"`이면 이 핸들러가 호출된다.

### HandleResult 반환

```java
성공 → HandleResult.success()
실패 → HandleResult.failRetryable("SERAI_OUTBOUND_ERROR", e.getMessage())
```

현재 `failRetryable`을 사용하므로:
- `caravan.kafka.retry.max-attempts` (기본 3회)만큼 재시도
- 재시도 간격: `caravan.kafka.retry.delay-ms` (기본 2000ms)
- 모든 재시도 실패 → 컨테이너 일시정지 (수동 resume 필요)

### 참고

"재시도 후 스킵(다음 메시지로 넘어가기)" 기능은 Caravan에 아직 없다. 추후 개발 예정.

---

## OutboundRouter.java

역할은 단순하다: 설정 조회 → 타입 분기.

```java
Map<String, Object> config = seraiConfigMapper.selectOutboundConfig(topicId);
String integrationType = config.get("INTEGRATION_TYPE");

"DB"   → dbOutboundHandler.handle(context, config)
"HTTP" → httpOutboundHandler.handle(context, config)
"FILE" → fileOutboundHandler.handle(context, config)
```

설정이 없거나 알 수 없는 타입이면 `IllegalStateException` → BusinessStart에서 `failRetryable` 처리.

---

## DbOutboundHandler.java

Kafka 메시지를 IF_* 테이블에 INSERT한다.

### 처리 순서

```
1. config에서 DB_TABLE_NAME, DB_SCHEMA 추출
2. context에서 TRANSACTION_CODE, INTERFACE_ID, INTERFACE_MSG 추출
3. 테이블명 검증 (정규식: ^[A-Za-z_][A-Za-z0-9_]*$)
4. InterfaceMapper.insertOutboundData() 실행
   → INSERT INTO {schema}.{tableName} (...) VALUES (...)
   → IF_FLAG = 'N' (미처리 상태)
```

### INSERT 컬럼

| 컬럼 | 값 |
|------|-----|
| TRANSACTION_CODE | context에서 추출 |
| INTERFACE_ID | context에서 추출 |
| INTERFACE_MSG | context에서 추출 |
| IF_FLAG | 'N' (미처리) |
| CREATION_TIMESTAMP | SYSTIMESTAMP |
| CREATED_OBJECT_TYPE | 'S' |
| CREATED_OBJECT_ID | 'SERAI' |
| CREATED_PROGRAM_ID | 'DbOutboundHandler' |
| LAST_UPDATE_* | CREATION과 동일 |

---

## HttpOutboundHandler.java

Kafka 메시지를 외부 시스템에 HTTP POST로 전달한다.

### 처리 순서

```
1. config에서 HTTP_URL, HTTP_METHOD 추출 (기본값: POST)
2. context.getRawMessageMap()을 JSON으로 직렬화
3. HttpURLConnection으로 전송
   - Content-Type: application/json; charset=UTF-8
   - 타임아웃: SeraiProperties에서 읽음
4. 응답 코드 200~299 → 성공
5. 그 외 → IllegalStateException
```

### 타임아웃 설정

```yaml
serai:
  outbound:
    http:
      connect-timeout: 10000   # 연결 타임아웃 (ms)
      read-timeout: 30000      # 읽기 타임아웃 (ms)
```

### 전송되는 JSON

`context.getRawMessageMap()`은 Kafka에서 받은 원본 메시지 전체다:

```json
{
  "TRANSACTION_CODE": "SeraiConsumeHandler",
  "KAFKA_KEYDATA": "uuid...",
  "INTERFACE_ID": "TOPIC_ID",
  "INTERFACE_MSG": "...",
  "INTERFACE_PROTOCOL": "IF_KAFKA"
}
```

---

## FileOutboundHandler.java

Kafka 메시지를 SFTP 서버에 파일로 생성한다.

### 처리 순서

```
1. config에서 FILE_PATH, FTP_HOST, FTP_PORT, FTP_USER, FTP_PASSWORD 추출
2. context에서 INTERFACE_ID, KAFKA_KEYDATA, INTERFACE_MSG 추출
3. 파일명 생성
4. SftpSessionManager로 세션 획득
5. 채널 생성 → channelSftp.put()으로 파일 업로드
6. 채널 닫기
```

### 파일명 규칙

```
{TOPIC_ID}_{yyyyMMddHHmmss}_{UUID앞8자리}.txt

예: MMPPMMCMTT01_20260205105500_840d4999.txt
```

UUID 앞 8자리는 `KAFKA_KEYDATA`에서 하이픈 제거 후 추출한다.

### 파일 내용

`INTERFACE_MSG` 값이 그대로 파일 내용이 된다. UTF-8 인코딩.

### SFTP 세션

INBOUND의 SftpPollingService와 동일한 `SftpSessionManager`를 사용한다.
같은 호스트/포트/유저에 대해 세션이 공유된다.
