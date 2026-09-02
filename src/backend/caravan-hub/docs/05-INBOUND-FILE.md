# 05. INBOUND - FILE (SFTP)

## 관련 파일

```
inbound/file/scheduler/FilePollingScheduler.java   # 스케줄 관리
inbound/file/service/SftpPollingService.java        # SFTP 파일 읽기 → Kafka 전송
common/util/SftpSessionManager.java                 # SFTP 세션 캐싱 (공통)
```

---

## 동작 흐름

```
TB_MCM_MOM_KAFKA_SERAI_CONFIG (DIRECTION='INBOUND', INTEGRATION_TYPE='FILE')
  → 토픽별 폴링 스케줄 등록
  → SFTP 서버 접속 → FILE_PATH에서 .txt 파일 조회
  → 파일 내용 라인별 파싱 → KafkaMessageProducer.send()
  → 처리 완료된 파일은 BACKUP_PATH로 이동
```

---

## FilePollingScheduler.java

DB 폴링 스케줄러와 완전히 동일한 패턴이다.

| 항목 | DbPollingScheduler | FilePollingScheduler |
|------|-------------------|---------------------|
| 설정 조회 | `selectDbInboundConfigs()` | `selectFileInboundConfigs()` |
| 서비스 호출 | `dbPollingService.pollAndSend(topicId, tableName)` | `sftpPollingService.pollAndSend(config)` |
| 활성화 설정 | `serai.inbound.db.enabled` | `serai.inbound.file.enabled` |
| 스레드 수 기본값 | 10 | 5 |

나머지(scheduleAtFixedRate, AtomicBoolean 동시실행 방지, 60초 설정 갱신, @PreDestroy 종료)는 동일하다.

---

## SftpPollingService.java

### pollAndSend(config) 흐름

```
1. config에서 접속 정보 추출 (FTP_HOST, FTP_PORT, FTP_USER, FTP_PASSWORD, FILE_PATH, BACKUP_PATH)
2. SftpSessionManager로 세션 획득 (캐시 또는 신규 생성)
3. 채널 생성 (매번 새로) → channelSftp.connect()
4. channelSftp.ls(filePath)로 파일 목록 조회
5. 각 파일 처리:
   a. ".", "..", 디렉토리, .txt 아닌 파일 → 스킵
   b. processFile() 호출
6. 채널 닫기 (세션은 캐시 유지)
```

### processFile() 흐름

```
1. channelSftp.get(remotePath) → 파일 내용 읽기 (UTF-8)
2. 빈 파일이면 → 백업 이동만 하고 끝
3. 줄바꿈(\n)으로 분리 → 각 라인 처리:
   a. sendToKafka(topicId, trimmedLine)
   b. 성공/실패 카운트 기록
4. 모든 라인 처리 후 → 파일을 BACKUP_PATH로 이동 (channelSftp.rename)
```

### sendToKafka() - TRANSACTION_CODE 추출 규칙

```
INTERFACE_MSG: "PQR02012|P|S|5A|20260130|..."
                ^^^^^^^^
                첫 번째 파이프(|) 앞 = TRANSACTION_CODE
```

```java
if (interfaceMsg.contains("|")) {
    transactionCode = interfaceMsg.split("\\|")[0];
} else {
    transactionCode = interfaceMsg;  // 파이프 없으면 전체가 TC
}
```

### 에러 처리

- **JSchException** (세션 오류): 세션 캐시에서 제거 → 다음 폴링 때 재연결
- **SftpException** (SFTP 명령 오류): 로그만 남기고 다음 파일 처리
- 파일 내 라인 전송 실패: 해당 라인만 실패 카운트 → 나머지 라인은 계속 처리
- 파일 처리 중 일부 실패해도 **파일은 백업으로 이동**된다 (재처리 안 됨)

---

## SftpSessionManager.java

INBOUND(SftpPollingService)와 OUTBOUND(FileOutboundHandler) 모두 사용하는 공통 유틸이다.

### 세션 캐싱 전략

```
캐시 키: "호스트:포트:유저" (예: "10.10.90.156:22:sftpuser")

getOrCreateSession():
  1. 캐시에서 세션 조회
  2. 세션 있고 연결 상태 → 그대로 반환
  3. 세션 있지만 끊어짐 → 제거 후 새로 생성
  4. 세션 없음 → 새로 생성 → 캐시에 저장
```

### 왜 세션만 캐싱하고 채널은 매번 새로 만드나?

- **세션**: TCP 연결 + SSH 핸드셰이크. 비용이 크다 → 캐싱
- **채널**: 세션 위의 논리적 채널. 비용이 작고, 동시 사용 시 스레드 안전하지 않다 → 매번 생성/닫기

### @PreDestroy

앱 종료 시 캐시에 남아있는 모든 세션을 disconnect한다.

### 주의사항

- `getOrCreateSession()`은 `synchronized` 메서드다. 동시에 여러 스레드가 같은 호스트로 세션을 만들려고 하면 하나만 생성된다.
- 세션이 끊어진 건 `session.isConnected()`로 판단한다. 네트워크 단절을 즉시 감지하지 못할 수 있다. 채널 생성/사용 시 JSchException이 발생하면 `removeSession()`을 호출해서 캐시에서 제거한다.
