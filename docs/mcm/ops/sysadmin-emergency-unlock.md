# SYSADMIN 비상 잠금 해제

시스템관리자(SYSADMIN) 계정이 모두 막혔을 때 쓰는 절차다. 화면에서 잠금을 풀 사람이 없을 때만 쓴다(시안 「사용자 비활성화·퇴직 처리」 D15).

## 먼저 확인할 것

- SYSADMIN 의 비밀번호 실패 잠금은 시간 잠금이다. 5번 틀리면 15분, 다시 잠기면 30분, 그다음부터 60분 뒤 저절로 풀린다. 기다릴 수 있으면 기다린다.
- 다른 SYSADMIN 이 있으면 그 사람이 사용자 관리 화면에서 「잠금 해제」·「다시 사용」을 누른다.
- `mcm.security.sysadmin-freepass=true` 는 권한 검사만 건너뛴다. 잠금을 풀지 않으므로 비상 경로가 아니다.

## 절차

1. 운영 서버에 접속한다. 운영 DB 에 `MCMAPUSER` 로 접속한다(SQL*Plus 또는 SQLcl).
2. [`docs/mcm/sql/sysadmin-emergency-unlock.sql`](../sql/sysadmin-emergency-unlock.sql) 을 실행한다. 풀 아이디와 실행자 이름을 묻는다.
3. 1) 의 결과가 0 이면 멈춘다. SYSADMIN 이 아닌 계정이다.
4. 5) 의 결과에서 `LOCK_YN=N`, `USE_TP=Y` 인지 본다. 맞으면 `COMMIT;`, 아니면 `ROLLBACK;`.
5. 유효 기한일이 지난 계정이면 3) 의 주석을 풀고 다시 실행한다.
6. 그 계정으로 로그인한다. 비밀번호를 모르면 다른 경로가 없으므로, 로그인 뒤가 아니라 지금 DBA 와 함께 임시 비밀번호로 초기화한다(사용자 관리 「비밀번호 초기화」와 같은 결과: `USER_ENC_PWD` = 임시 비밀번호의 bcrypt 해시, `LAST_PWD_CHNG_DATE` = 빈칸, `TEMP_PWD_EXPIRATION_DATE` = 오늘 23:59:59).
7. 로그인한 뒤 사용자 관리에서 다른 사람에게도 SYSADMIN 을 준다. 마지막 SYSADMIN 한 명만 남지 않게 한다.

## 남는 기록

- 사용자 이력(`TB_MCM_SEC_USER_HIS`)에 `PROC_TYPE='L'`, 설명 「비상 잠금 해제(운영 스크립트) — 실행자: …」 한 줄.
- 사용자 표의 `U_USR_ID` 에 `EMERGENCY:실행자`, `U_PGM_ID` 에 스크립트 이름.
