# 01. 아키텍처 개요

## 시스템 목적

SERAI(Kafka Integration Service)는 외부 시스템과 내부 시스템 간의 메시지를 중개하는 통합 서비스다.
HTTP, DB 테이블, SFTP 파일 세 가지 프로토콜을 지원하며, Kafka를 메시지 허브로 사용한다.

## 핵심 의존성

- **Caravan** (`com.dongkuk.caravan:caravan:1.0.0-SNAPSHOT`): Kafka Producer/Consumer 라이브러리. SERAI는 Caravan의 `KafkaMessageProducer`로 메시지를 보내고, `KafkaInterfaceHandler`를 구현하여 메시지를 받는다.
- **Spring Boot 2.7.18**: 웹 서버, DI, 설정 관리
- **MyBatis**: DB 접근 (듀얼 DataSource)
- **JSch**: SFTP 파일 송수신

## INBOUND vs OUTBOUND

```
INBOUND:  외부 → SERAI → Kafka
OUTBOUND: Kafka → SERAI → 외부
```

### INBOUND (외부 → Kafka)

외부 시스템이 SERAI에 메시지를 전달하면, SERAI가 Kafka로 전송한다.

| 프로토콜 | 동작 방식 |
|----------|-----------|
| HTTP | 외부에서 `POST /seraiApi/v1/send` 호출 → Kafka 전송 |
| DB | SERAI가 IF_* 테이블을 폴링 (IF_FLAG='N') → Kafka 전송 → IF_FLAG 업데이트 |
| FILE | SERAI가 SFTP 서버를 폴링 → .txt 파일 라인별 Kafka 전송 → 백업 이동 |

### OUTBOUND (Kafka → 외부)

Kafka에서 메시지를 수신하면, `TB_MCM_MOM_KAFKA_SERAI_CONFIG` 설정에 따라 외부로 전달한다.

| 프로토콜 | 동작 방식 |
|----------|-----------|
| DB | IF_* 테이블에 INSERT (IF_FLAG='N') |
| HTTP | 외부 시스템에 HTTP POST |
| FILE | SFTP 서버에 .txt 파일 생성 |

## 메시지 흐름도

```
                    ┌──────────────────────────────────────────────┐
                    │                   Kafka                       │
                    └──────┬───────────────────────────┬───────────┘
                           │                           │
                      INBOUND (send)             OUTBOUND (consume)
                           │                           │
          ┌────────────────┼────────────────┐          │
          │                │                │          │
     [HTTP POST]     [DB Polling]    [FILE Polling]    │
          │                │                │          │
  HttpIntegration   DbPolling       SftpPolling   BusinessStart
  Controller        Scheduler       Scheduler     (SeraiConsumeHandler)
          │                │                │          │
          │          DbPolling        SftpPolling   OutboundRouter
          │          Service          Service          │
          │                │                │     ┌────┼─────┐
          │                │                │     │    │     │
          └───── KafkaMessageProducer ──────┘   [DB] [HTTP] [FILE]
                  (Caravan)                     Handler Handler Handler
```

## 패키지 구조

```
com.dongkuk.caravan.hub
├── config/           설정 (DataSource, Properties, Mapper 어노테이션)
├── common/
│   ├── dto/          HTTP 요청/응답 DTO
│   └── util/         공통 유틸 (SftpSessionManager)
├── mapper/           MyBatis Mapper 인터페이스
├── inbound/
│   ├── http/         HTTP INBOUND (REST Controller)
│   ├── db/           DB INBOUND (Scheduler + Service)
│   └── file/         FILE INBOUND (Scheduler + Service)
├── handler/          Caravan 핸들러 (OUTBOUND 진입점)
└── outbound/
    ├── router/       OUTBOUND 라우터 (타입별 분기)
    ├── db/           DB OUTBOUND (INSERT)
    ├── http/         HTTP OUTBOUND (POST)
    └── file/         FILE OUTBOUND (SFTP 업로드)
```

## 설정 테이블

모든 INBOUND/OUTBOUND 동작은 `TB_MCM_MOM_KAFKA_SERAI_CONFIG` 테이블 설정에 의해 결정된다.

| 컬럼 | 설명 |
|------|------|
| TOPIC_ID | Kafka 토픽 ID |
| DIRECTION | INBOUND / OUTBOUND |
| INTEGRATION_TYPE | DB / HTTP / FILE |
| POLLING_INTERVAL_MS | 폴링 주기 (ms) |
| DB_SCHEMA, DB_TABLE_NAME | DB 프로토콜 설정 |
| FTP_HOST, FTP_PORT, FTP_USER, FTP_PASSWORD, FILE_PATH, BACKUP_PATH | FILE 프로토콜 설정 |
| HTTP_URL, HTTP_METHOD | HTTP 프로토콜 설정 |
| USE_YN | 활성화 여부 (Y/N) |
