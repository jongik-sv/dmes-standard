# 08. 트러블슈팅

## OUTBOUND 처리 실패 시

### 증상

OUTBOUND 핸들러(DB INSERT, HTTP POST, SFTP 파일 생성)에서 에러가 발생하면 Caravan이 재시도 후 컨테이너를 일시정지시킨다.

### 확인 방법

```
GET /kafkaApi/status?topicId={topicId}
```

status가 `PAUSED`면 일시정지 상태다.

### 복구 절차

```
1. 원인 확인 (로그 확인, DB 연결 확인 등)
2. 원인 해결
3. POST /kafkaApi/resume {"topicId": "..."}
```

원인 해결 없이 resume하면 같은 메시지에서 또 실패한다.

### 메시지 스킵이 필요한 경우

메시지 자체가 잘못되어 처리 불가능한 경우:

```
POST /kafkaApi/skipOffset {"topicId": "...", "groupId": "...", "count": 1}
POST /kafkaApi/resume {"topicId": "..."}
```

---

## DB INBOUND 폴링이 안 될 때

### 체크리스트

1. `serai.inbound.db.enabled`가 `true`인가?
2. `TB_MCM_MOM_KAFKA_SERAI_CONFIG`에 해당 토픽이 등록되어 있는가?
   - `DIRECTION = 'INBOUND'`, `INTEGRATION_TYPE = 'DB'`, `USE_YN = 'Y'`
3. `TB_MCM_MOM_KAFKA_TOPICS`에 토픽이 등록되어 있고 `USE_TP = 'Y'`인가?
4. IF_* 테이블에 `IF_FLAG = 'N'`인 데이터가 있는가?
5. 로그에 `DB 폴링 대상 토픽 없음`이 나오는가? → 설정 테이블 확인

### 신규 토픽 추가 후 반영

DB에 설정을 추가하면 **최대 60초 후** 자동 감지된다 (refreshSchedules).
즉시 반영하려면 앱 재시작.

---

## FILE INBOUND 폴링이 안 될 때

### 체크리스트

1. `serai.inbound.file.enabled`가 `true`인가? (현재 `false`로 설정되어 있음)
2. SFTP 접속 정보(FTP_HOST, FTP_PORT, FTP_USER, FTP_PASSWORD)가 정확한가?
3. FILE_PATH 경로가 존재하는가?
4. BACKUP_PATH 경로가 존재하는가? (없으면 rename 실패)
5. 파일 확장자가 `.txt`인가? (다른 확장자는 스킵됨)

### SFTP 세션 오류

로그에 `SFTP 세션 생성 실패`가 나오면:
- 호스트/포트 확인
- 비밀번호 확인
- 방화벽 확인
- `StrictHostKeyChecking`은 `no`로 설정되어 있으므로 known_hosts 문제는 아님

---

## HTTP INBOUND 전송 실패

### 400 INVALID_PARAMETER

요청 JSON에 `INTERFACE_ID`, `TRANSACTION_CODE`, `INTERFACE_MSG` 중 하나가 null이거나 빈 문자열.

### 500 SYSTEM_ERROR

Kafka 전송 실패. Kafka 브로커 상태 확인 필요.

---

## DataSource 연결 실패

### 증상

```
Unable to obtain JDBC Connection
```

### 확인

- `application.yml`의 `jdbc-url` 형식: `jdbc:tibero:thin:@HOST:PORT:SID`
- DB 서버 상태, 방화벽, 계정/비밀번호 확인
- `libs/` 폴더에 `tibero6-jdbc.jar`가 있는지 확인

---

## 빌드 오류

### `invalid source release: 11`

Gradle이 JDK 8로 실행되고 있다. `build.gradle`에 Java 11 toolchain이 설정되어 있으므로 시스템에 JDK 11이 설치되어 있어야 한다.

### `UnsupportedClassVersionError: class file version 55.0`

실행 JDK가 8이다. IntelliJ **실행 구성** 또는 **프로젝트 구조**에서 JDK를 11로 변경.

### Tibero JDBC not found

`libs/tibero6-jdbc.jar` 파일이 없다. 직접 복사해 넣어야 한다.
