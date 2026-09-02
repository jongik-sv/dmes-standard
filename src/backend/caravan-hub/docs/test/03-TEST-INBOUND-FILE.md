# TEST - INBOUND FILE (SFTP)

## 대상 클래스

- `FilePollingScheduler`
- `SftpPollingService`
- `SftpSessionManager`
- `CaravanHubConfigMapper` (selectFileInboundConfigs)

---

## TC-FILE-001: 정상 파일 폴링 및 Kafka 전송

### 목적
SFTP 서버의 .txt 파일을 읽어 라인별로 Kafka에 전송하고, 백업 폴더로 이동하는지 확인한다.

### 사전 조건
- `TB_MCM_MOM_KAFKA_SERAI_CONFIG`에 FILE INBOUND 설정 등록
  - DIRECTION='INBOUND', INTEGRATION_TYPE='FILE', USE_YN='Y'
  - FTP_HOST, FTP_PORT, FTP_USER, FTP_PASSWORD 설정
  - FILE_PATH, BACKUP_PATH 설정
- SFTP 서버에 테스트 파일 업로드
  ```
  파일명: test_data.txt
  내용:
  PQR02012|P|S|5A|20260130|JCM_TEST|MMPPMMCMTT01|||||20250808|00011|C|
  PQR02013|P|S|5B|20260131|JCM_TEST|MMPPMMCMTT01|||||20250809|00012|D|
  ```
- BACKUP_PATH 디렉토리 존재

### 예상 결과
- 각 라인이 Kafka 토픽에 개별 메시지로 전송
  - 1번 라인: TRANSACTION_CODE = "PQR02012"
  - 2번 라인: TRANSACTION_CODE = "PQR02013"
- FILE_PATH에서 파일 삭제
- BACKUP_PATH에 동일 파일명으로 이동

### 검증 항목
- [ ] Kafka 토픽에 2건 메시지 도착
- [ ] 각 메시지의 TRANSACTION_CODE가 파이프 앞 문자열과 일치
- [ ] 원본 파일이 FILE_PATH에서 제거됨
- [ ] BACKUP_PATH에 파일 존재
- [ ] 로그: "파일 처리 완료 - Success: 2, Fail: 0"

---

## TC-FILE-002: TRANSACTION_CODE 추출 규칙

### 목적
INTERFACE_MSG에서 TRANSACTION_CODE가 올바르게 추출되는지 확인한다.

### 테스트 케이스

| # | INTERFACE_MSG | 예상 TRANSACTION_CODE |
|---|---------------|----------------------|
| a | `PQR02012\|P\|S\|5A` | `PQR02012` |
| b | `SINGLE_CODE` | `SINGLE_CODE` (파이프 없음 → 전체) |
| c | `\|P\|S` | `` (빈 문자열 → 에러) |

### 검증 항목
- [ ] 케이스 a: 첫 번째 파이프 앞 문자열 추출
- [ ] 케이스 b: 파이프 없으면 전체 문자열이 TRANSACTION_CODE
- [ ] 케이스 c: 빈 TRANSACTION_CODE → IllegalArgumentException 발생 → 실패 카운트 증가

---

## TC-FILE-003: 빈 파일 처리

### 목적
빈 파일(내용 없음)이 스킵되고 백업 이동만 되는지 확인한다.

### 사전 조건
- SFTP 서버에 빈 .txt 파일 업로드

### 예상 결과
- Kafka로 전송 없음
- 파일은 BACKUP_PATH로 이동

### 검증 항목
- [ ] WARN 로그 "빈 파일 스킵" 확인
- [ ] Kafka 메시지 0건
- [ ] BACKUP_PATH에 파일 이동 확인

---

## TC-FILE-004: .txt 이외 파일 스킵

### 목적
.txt 확장자가 아닌 파일이 스킵되는지 확인한다.

### 사전 조건
- SFTP 서버 FILE_PATH에 다양한 파일 업로드
  - `data.txt` (처리 대상)
  - `data.csv` (스킵)
  - `data.xml` (스킵)
  - `readme.md` (스킵)

### 예상 결과
- `data.txt`만 처리
- 나머지 파일은 원래 위치에 유지

### 검증 항목
- [ ] .txt 파일만 processFile() 호출
- [ ] 비-txt 파일은 FILE_PATH에 그대로 존재
- [ ] 비-txt 파일은 BACKUP_PATH에 이동하지 않음

---

## TC-FILE-005: 디렉토리 엔트리 스킵

### 목적
FILE_PATH 내의 ".", "..", 하위 디렉토리가 스킵되는지 확인한다.

### 사전 조건
- FILE_PATH 내에 하위 디렉토리 존재

### 검증 항목
- [ ] 디렉토리는 processFile() 호출하지 않음
- [ ] 에러 발생 없음

---

## TC-FILE-006: 라인 일부 전송 실패

### 목적
파일 내 일부 라인이 Kafka 전송에 실패해도 나머지 라인은 처리되고, 파일은 백업 이동되는지 확인한다.

### 사전 조건
- 3줄짜리 파일
  - 1번 라인: 정상
  - 2번 라인: TRANSACTION_CODE 추출 불가 (빈 줄 → 빈 라인은 skip되므로, "|" 로 시작하는 라인으로 테스트)
  - 3번 라인: 정상

### 예상 결과
- 1번, 3번 라인: Kafka 전송 성공
- 2번 라인: 전송 실패
- 파일은 BACKUP_PATH로 이동 (일부 실패해도 이동)

### 검증 항목
- [ ] 로그: "Success: 2, Fail: 1"
- [ ] 실패 라인에 대한 ERROR 로그
- [ ] 파일은 BACKUP_PATH에 이동 (재처리 안 됨)

---

## TC-FILE-007: SFTP 연결 실패

### 목적
SFTP 서버 연결에 실패했을 때 에러 처리 및 세션 캐시 정리가 되는지 확인한다.

### 사전 조건
- FTP_HOST가 잘못된 주소이거나 SFTP 서버 다운

### 예상 결과
- 세션 생성 실패 로그
- 폴링 스킵
- 다음 폴링 주기에 재시도

### 검증 항목
- [ ] ERROR 로그 "SFTP 세션 생성 실패" 확인
- [ ] getOrCreateSession() 반환 값 null
- [ ] 다음 폴링 주기에 재연결 시도

---

## TC-FILE-008: SFTP 세션 끊어짐 후 재연결

### 목적
SFTP 세션이 끊어졌을 때 캐시에서 제거하고 다음 폴링 시 재연결하는지 확인한다.

### 절차
1. 정상 폴링 확인 (세션 캐싱됨)
2. SFTP 서버 재시작 (세션 끊어짐)
3. 다음 폴링 주기 대기

### 예상 결과
- JSchException 발생 → removeSession() 호출
- 다음 폴링 시 새 세션 생성

### 검증 항목
- [ ] ERROR 로그 "SFTP 연결 오류"
- [ ] 세션 캐시에서 제거
- [ ] 다음 폴링에서 "SFTP 세션 생성" 로그
- [ ] 정상 폴링 재개

---

## TC-FILE-009: BACKUP_PATH 미존재 시

### 목적
BACKUP_PATH가 존재하지 않을 때 파일 이동(rename)이 실패하는지 확인한다.

### 사전 조건
- BACKUP_PATH 디렉토리 미존재

### 예상 결과
- channelSftp.rename() 실패
- ERROR 로그 "파일 백업 실패"
- 원본 파일은 FILE_PATH에 유지

### 검증 항목
- [ ] ERROR 로그 확인
- [ ] 원본 파일이 FILE_PATH에 남아있음
- [ ] 다음 폴링에서 동일 파일 재처리 시도

---

## TC-FILE-010: 여러 파일 동시 처리

### 목적
FILE_PATH에 여러 .txt 파일이 있을 때 모두 처리되는지 확인한다.

### 사전 조건
- FILE_PATH에 .txt 파일 3개 업로드
  - file_001.txt (2줄)
  - file_002.txt (1줄)
  - file_003.txt (3줄)

### 예상 결과
- 총 6건의 Kafka 메시지 전송
- 3개 파일 모두 BACKUP_PATH로 이동

### 검증 항목
- [ ] Kafka 메시지 6건 도착
- [ ] 3개 파일 모두 BACKUP_PATH에 존재
- [ ] FILE_PATH에 .txt 파일 없음

---

## TC-FILE-011: 세션 캐싱 공유 확인

### 목적
동일 SFTP 호스트에 대해 INBOUND와 OUTBOUND가 세션을 공유하는지 확인한다.

### 사전 조건
- FILE INBOUND와 FILE OUTBOUND가 같은 SFTP 호스트 사용

### 검증 항목
- [ ] SftpSessionManager의 sessionCache에 동일 키로 1개 세션만 존재
- [ ] "SFTP 세션 생성" 로그가 해당 호스트에 대해 1번만 출력

---

## TC-FILE-012: FILE 비활성화 설정

### 목적
`serai.inbound.file.enabled=false`일 때 스케줄러가 생성되지 않는지 확인한다.

### 사전 조건
```yaml
serai:
  inbound:
    file:
      enabled: false
```

### 검증 항목
- [ ] INFO 로그 "FILE Integration 비활성화 상태" 확인
- [ ] FILE 폴링 미실행
- [ ] 앱 정상 기동
