# SERAI (Kafka Integration Service)

Kafka 기반 시스템 간 인터페이스 통합 서비스. Caravan 라이브러리를 사용하여 HTTP, DB, FILE(SFTP) 프로토콜을 통해 메시지를 송수신한다.

## 기술 스택

| 항목 | 버전 |
|------|------|
| Java | 11 |
| Spring Boot | 2.7.18 |
| Caravan | 1.0.0-SNAPSHOT |
| MyBatis | 2.3.2 (ANSI SQL) |
| JSch (SFTP) | 0.1.55 |
| DB | Tibero / Oracle / PostgreSQL / MySQL |

## 프로젝트 구조

```
src/main/java/com/dongkuk/dmes/serai/
├── SeraiApplication.java                          # Spring Boot 진입점
├── config/
│   ├── SeraiProperties.java                       # SERAI 설정 (serai.inbound.*, serai.outbound.*)
│   ├── DataSourceConfig.java                    # MST + IF 듀얼 DataSource
│   ├── MstMapper.java                           # MST DataSource 마커 어노테이션
│   └── IfMapper.java                            # IF DataSource 마커 어노테이션
├── common/
│   ├── dto/
│   │   ├── IntegrationRequest.java              # HTTP 요청 DTO
│   │   └── IntegrationResponse.java             # HTTP 응답 DTO
│   └── util/
│       └── SftpSessionManager.java              # SFTP 세션 캐싱 (INBOUND/OUTBOUND 공유)
├── mapper/
│   ├── SeraiConfigMapper.java                     # 설정 조회 (MST DataSource)
│   └── InterfaceMapper.java                     # IF_* 테이블 CRUD (IF DataSource)
├── inbound/
│   ├── http/controller/
│   │   └── HttpIntegrationController.java       # POST /seraiApi/v1/send
│   ├── db/
│   │   ├── scheduler/DbPollingScheduler.java    # DB 폴링 스케줄러
│   │   └── service/DbPollingService.java        # IF_FLAG='N' 조회 → Kafka 전송
│   └── file/
│       ├── scheduler/FilePollingScheduler.java   # FILE 폴링 스케줄러
│       └── service/SftpPollingService.java       # SFTP 파일 읽기 → Kafka 전송
├── handler/SeraiConsumeHandler/
│   └── BusinessStart.java                       # Caravan 핸들러 (OUTBOUND 진입점)
└── outbound/
    ├── router/OutboundRouter.java               # INTEGRATION_TYPE별 분기
    ├── db/DbOutboundHandler.java                # IF 테이블 INSERT
    ├── http/HttpOutboundHandler.java            # HTTP POST 전송
    └── file/FileOutboundHandler.java            # SFTP 파일 생성
```

## 메시지 흐름

### INBOUND (외부 → Kafka)

```
[HTTP]  POST /seraiApi/v1/send → KafkaMessageProducer.send()
[DB]    IF_* 테이블 (IF_FLAG='N') → 폴링 → KafkaMessageProducer.send() → IF_FLAG='Y'/'E'
[FILE]  SFTP 서버 .txt 파일 → 라인별 파싱 → KafkaMessageProducer.send() → 백업 이동
```

### OUTBOUND (Kafka → 외부)

```
Kafka 메시지 수신 → BusinessStart (SeraiConsumeHandler)
  → OutboundRouter → INTEGRATION_TYPE 분기
     → [DB]   IF 테이블 INSERT (IF_FLAG='N')
     → [HTTP] 외부 시스템 HTTP POST
     → [FILE] SFTP 서버 파일 생성
```

## 설정

### application.yml 주요 항목

```yaml
# Kafka
caravan.kafka.bootstrap-servers: localhost:9092
caravan.kafka.biz-system: serai

# DB 폴링
serai.inbound.db.enabled: true          # DB 폴링 활성화
serai.inbound.db.thread-pool-size: 10   # 폴링 스레드 수
serai.inbound.db.batch-size: 100        # 1회 조회 건수

# FILE 폴링
serai.inbound.file.enabled: true        # FILE 폴링 활성화
serai.inbound.file.thread-pool-size: 5

# OUTBOUND HTTP
serai.outbound.http.connect-timeout: 10000
serai.outbound.http.read-timeout: 30000

# DataSource (MST: 설정 테이블, IF: 인터페이스 테이블)
spring.datasource.mst.jdbc-url: jdbc:tibero:thin:@host:port:sid
spring.datasource.if.jdbc-url: jdbc:tibero:thin:@host:port:sid
```

### DB 테이블

| 테이블 | 용도 |
|--------|------|
| `TB_MCM_MOM_KAFKA_SERAI_CONFIG` | INBOUND/OUTBOUND 설정 (토픽, 프로토콜, 폴링 주기 등) |
| `TB_MCM_MOM_KAFKA_TOPICS` | Kafka 토픽 마스터 |
| `IF_*` | 인터페이스 메시지 테이블 (INBOUND 폴링 대상, OUTBOUND INSERT 대상) |

### 폴링 동작

- 토픽별 독립적인 `scheduleAtFixedRate` 등록
- `AtomicBoolean`으로 동시 실행 방지
- 1분 주기로 DB에서 설정 변경 감지 (토픽 추가/삭제 자동 반영)

## 빌드 & 실행

```bash
# 빌드 (libs/ 에 tibero6-jdbc.jar 필요)
gradlew build -x test

# 실행
java -jar build/libs/serai.jar

# DB 폴링 비활성화 실행
java -jar build/libs/serai.jar --serai.inbound.db.enabled=false
```

## HTTP API

### 메시지 전송

```
POST /seraiApi/v1/send
Content-Type: application/json

{
  "INTERFACE_ID": "TOPIC_ID",
  "TRANSACTION_CODE": "TC001",
  "INTERFACE_MSG": "TC001|DATA1|DATA2|DATA3"
}
```

응답:
```json
{
  "resultCode": "SUCCESS",
  "KAFKA_KEYDATA": "topic-name",
  "INTERFACE_ID": "TOPIC_ID",
  "timestamp": "2026-02-05T10:30:00"
}
```

### Caravan REST API

Caravan 라이브러리가 제공하는 Kafka 관리 API:

```
GET  /kafkaApi/status?topicId={topicId}     # 컨테이너 상태 조회
POST /kafkaApi/pause   {"topicId": "..."}    # 컨테이너 일시정지
POST /kafkaApi/resume  {"topicId": "..."}    # 컨테이너 재개
POST /kafkaApi/skipOffset {"topicId": "...", "groupId": "...", "count": 1}  # 오프셋 스킵
```

## 의존성

- **Caravan**: Nexus에 publish 되어 있어야 함 (`com.dongkuk.caravan:caravan:1.0.0-SNAPSHOT`)
- **Tibero JDBC**: `libs/tibero6-jdbc.jar` 에 직접 배치
