# TEST - OUTBOUND FILE (SFTP)

## 대상 클래스

- `BusinessStart` (SeraiConsumeHandler)
- `OutboundRouter`
- `FileOutboundHandler`
- `SftpSessionManager`

---

## TC-OFILE-001: 정상 SFTP 파일 생성

### 목적
Kafka 메시지를 수신하여 SFTP 서버에 파일로 정상 생성되는지 확인한다.

### 사전 조건
- `TB_MCM_MOM_KAFKA_SERAI_CONFIG`에 OUTBOUND FILE 설정 등록
  - DIRECTION='OUTBOUND', INTEGRATION_TYPE='FILE', USE_YN='Y'
  - FILE_PATH='/data/outbound'
  - FTP_HOST, FTP_PORT, FTP_USER, FTP_PASSWORD 설정
- Kafka 토픽에 메시지 전송
  ```json
  {
    "TRANSACTION_CODE": "SeraiConsumeHandler",
    "KAFKA_KEYDATA": "840d4999-1234-5678-abcd-ef0123456789",
    "INTERFACE_ID": "MMPPMMCMTT01",
    "INTERFACE_MSG": "PQR02012|P|S|5A|20260130|...",
    "INTERFACE_PROTOCOL": "IF_KAFKA"
  }
  ```

### 예상 결과
- SFTP 서버 `/data/outbound/`에 파일 생성
  - 파일명: `MMPPMMCMTT01_20260206103000_840d4999.txt` (타임스탬프는 처리 시점)
  - 파일 내용: `PQR02012|P|S|5A|20260130|...` (INTERFACE_MSG 그대로)
  - 인코딩: UTF-8

### 검증 항목
- [ ] SFTP 서버에 파일 존재 확인
- [ ] 파일명 규칙: `{TOPIC_ID}_{yyyyMMddHHmmss}_{UUID앞8자리}.txt`
- [ ] 파일 내용 = INTERFACE_MSG
- [ ] 파일 인코딩 = UTF-8
- [ ] HandleResult.success() 반환
- [ ] 로그: "SFTP 파일 생성 완료"

---

## TC-OFILE-002: 파일명 생성 규칙 검증

### 목적
다양한 KAFKA_KEYDATA 값에 대해 파일명이 올바르게 생성되는지 확인한다.

### 테스트 케이스

| # | KAFKA_KEYDATA | 예상 UUID 부분 |
|---|---------------|---------------|
| a | `840d4999-1234-5678-abcd-ef0123456789` | `840d4999` (하이픈 제거 후 앞 8자) |
| b | `ABCDEFGH-1234-5678-abcd-ef0123456789` | `ABCDEFGH` |
| c | `null` | `System.currentTimeMillis() % 100000000` 기반 값 |
| d | `SHORT` (8자 미만) | `System.currentTimeMillis()` 기반 대체값 |

### 검증 항목
- [ ] 케이스 a, b: 하이픈 제거 후 앞 8자 추출
- [ ] 케이스 c, d: 대체 값 생성 (에러 없음)
- [ ] 파일명 형식: `{TOPIC_ID}_{yyyyMMddHHmmss}_{8자리}.txt`

---

## TC-OFILE-003: FILE_PATH 미설정

### 목적
OUTBOUND 설정에 FILE_PATH가 없을 때 에러가 발생하는지 확인한다.

### 사전 조건
- SERAI_CONFIG에 FILE_PATH가 NULL인 OUTBOUND FILE 설정

### 예상 결과
- IllegalStateException: "FILE_PATH 설정이 없습니다"
- HandleResult.failRetryable() 반환

### 검증 항목
- [ ] 에러 로그 확인
- [ ] 재시도 → 최종 실패 → 컨테이너 일시정지

---

## TC-OFILE-004: FTP_HOST 미설정

### 목적
OUTBOUND 설정에 FTP_HOST가 없을 때 에러가 발생하는지 확인한다.

### 사전 조건
- SERAI_CONFIG에 FTP_HOST가 NULL인 OUTBOUND FILE 설정

### 예상 결과
- IllegalStateException: "FTP_HOST 설정이 없습니다"

### 검증 항목
- [ ] 에러 로그 확인

---

## TC-OFILE-005: INTERFACE_MSG 미존재

### 목적
Kafka 메시지에 INTERFACE_MSG가 없을 때 에러가 발생하는지 확인한다.

### 사전 조건
- Kafka 메시지에서 INTERFACE_MSG가 null 또는 빈 문자열

### 예상 결과
- IllegalStateException: "INTERFACE_MSG가 없습니다"

### 검증 항목
- [ ] 에러 로그 확인
- [ ] SFTP 서버에 파일 생성되지 않음

---

## TC-OFILE-006: SFTP 연결 실패

### 목적
SFTP 서버에 연결할 수 없을 때 에러 처리 및 세션 캐시 정리를 확인한다.

### 사전 조건
- FTP_HOST가 잘못된 주소이거나 SFTP 서버 다운

### 예상 결과
- IllegalStateException: "SFTP 세션 획득 실패"
- HandleResult.failRetryable() → 재시도

### 검증 항목
- [ ] 에러 로그 확인
- [ ] 재시도 동작
- [ ] 세션 캐시에 잘못된 세션 남지 않음

---

## TC-OFILE-007: SFTP 채널 오류 시 세션 캐시 제거

### 목적
SFTP 채널 사용 중 JSchException 발생 시 세션 캐시에서 제거하는지 확인한다.

### 사전 조건
- 정상 세션 캐싱 후 SFTP 서버 재시작 (세션 끊어짐)

### 예상 결과
- JSchException 발생
- removeSession() 호출 → 캐시 제거
- 다음 메시지 처리 시 새 세션 생성

### 검증 항목
- [ ] 세션 캐시에서 제거 확인
- [ ] 다음 처리에서 정상 재연결

---

## TC-OFILE-008: SFTP 파일 경로에 디렉토리 미존재

### 목적
FILE_PATH 디렉토리가 SFTP 서버에 존재하지 않을 때 에러 처리를 확인한다.

### 사전 조건
- FILE_PATH 디렉토리가 SFTP 서버에 없음

### 예상 결과
- SftpException 발생
- IllegalStateException → 재시도

### 검증 항목
- [ ] 에러 로그 "SFTP 파일 업로드 오류" 확인
- [ ] 재시도 동작

---

## TC-OFILE-009: 동일 토픽 연속 메시지 파일 생성

### 목적
같은 토픽에서 연속으로 수신된 메시지가 각각 별도 파일로 생성되는지 확인한다.

### 사전 조건
- 같은 토픽에서 3건의 메시지 연속 수신

### 예상 결과
- 3개의 별도 파일 생성
- 파일명의 타임스탬프 또는 UUID 부분이 다름

### 검증 항목
- [ ] 3개 파일 모두 SFTP에 존재
- [ ] 파일명이 서로 다름 (UUID 앞 8자리가 다르므로)
- [ ] 각 파일 내용이 해당 메시지의 INTERFACE_MSG와 일치

---

## TC-OFILE-010: FTP_PORT 기본값

### 목적
SERAI_CONFIG에 FTP_PORT가 설정되지 않았을 때 기본값 22가 사용되는지 확인한다.

### 사전 조건
- SERAI_CONFIG에 FTP_PORT가 NULL

### 검증 항목
- [ ] 포트 22로 SFTP 연결 시도
- [ ] 정상 연결 시 파일 업로드 성공
