-- ============================================================
-- SYSADMIN 비상 잠금 해제 (D15, 2026-11-28 시안 「사용자 비활성화·퇴직 처리」)
-- ============================================================
-- 언제: 시스템관리자(SYSADMIN) 계정이 모두 막혀 화면에서 잠금을 풀 사람이 없을 때만 쓴다.
-- 어디서: 운영 DB 에 MCMAPUSER 로 접속해 운영 서버에서만 실행한다. 절차는 docs/mcm/ops/sysadmin-emergency-unlock.md.
-- 무엇을: 지정한 한 계정의 비밀번호 실패 잠금(LOCK_YN)·관리자 비활성(USE_TP)·인사 휴직·퇴직 표시(HR_ST)를 풀고
--         실행 기록을 사용자 이력(TB_MCM_SEC_USER_HIS, PROC_TYPE='L', PROC_CASE='M')에 남긴다.
--         비밀번호·역할그룹·유효 기한일은 바꾸지 않는다. 기한이 지났으면 아래 3) 을 함께 실행한다.
-- 주의: mcm.security.sysadmin-freepass=true 는 권한 검사만 건너뛰고 잠금은 풀지 않는다 — 비상 경로가 아니다.
--
-- 쓰는 법: SQL*Plus·SQLcl 에서 실행하면 아이디와 실행자 이름을 묻는다.
--   DEFINE 로 미리 줄 수도 있다: DEFINE target_user = 'admin'  /  DEFINE operator = '홍길동(운영팀)'

SET VERIFY OFF
ACCEPT target_user CHAR PROMPT '풀 SYSADMIN 아이디: '
ACCEPT operator CHAR PROMPT '실행자(이름·소속): '

-- 1) 대상이 SYSADMIN 역할을 가진 계정인지 확인한다(0 이면 멈춘다)
SELECT COUNT(*) AS SYSADMIN_YN
FROM   MCMAPUSER.TB_MCM_SEC_USER_MAPPING UM
     , MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING GM
WHERE  UM.USER_ID = '&target_user'
AND    GM.ROLE_GROUP_ID = UM.ROLE_GROUP_ID
AND    GM.ROLE_ID IN ('SYSADMIN', 'ROLE_SYSADMIN');

-- 2) 잠금·비활성·인사 표시 풀기
UPDATE MCMAPUSER.TB_MCM_SEC_USER
   SET LOCK_YN = 'N'
     , LOCK_AT = NULL
     , LOCK_CNT = 0
     , PWD_FAIL_COUNT = 0
     , USE_TP = 'Y'
     , HR_ST = CASE WHEN HR_ST IN ('LEAVE', 'RETIRED') THEN 'ACTIVE' ELSE HR_ST END
     , U_USR_ID = 'EMERGENCY:&operator'
     , U_AT = LOCALTIMESTAMP
     , U_PGM_ID = 'sysadmin-emergency-unlock.sql'
 WHERE USER_ID = '&target_user';

-- 3) (필요할 때만) 유효 기한일이 지났으면 늘린다 — 주석을 풀고 실행한다
-- UPDATE MCMAPUSER.TB_MCM_SEC_USER
--    SET END_ACTIVE_DATE = TIMESTAMP '9999-12-31 00:00:00'
--  WHERE USER_ID = '&target_user'
--    AND END_ACTIVE_DATE < LOCALTIMESTAMP;

-- 4) 실행 기록
INSERT INTO MCMAPUSER.TB_MCM_SEC_USER_HIS
       (ACTIVE_DT, USER_ID, HIS_SEQ, PROC_TYPE, PROC_CASE, USER_NM, DESCRIPTION, VER, C_USR_ID, C_AT, C_PGM_ID)
SELECT TO_CHAR(SYSDATE, 'YYYYMMDD')
     , U.USER_ID
     , NVL((SELECT MAX(H.HIS_SEQ)
            FROM   MCMAPUSER.TB_MCM_SEC_USER_HIS H
            WHERE  H.USER_ID = U.USER_ID
            AND    H.ACTIVE_DT = TO_CHAR(SYSDATE, 'YYYYMMDD')), 0) + 1
     , 'L'
     , 'M'
     , U.USER_NM
     , SUBSTR('비상 잠금 해제(운영 스크립트) — 실행자: &operator', 1, 300)
     , 0
     , 'EMERGENCY:&operator'
     , LOCALTIMESTAMP
     , 'sysadmin-emergency-unlock.sql'
FROM   MCMAPUSER.TB_MCM_SEC_USER U
WHERE  U.USER_ID = '&target_user';

-- 5) 결과 확인 — LOCK_YN=N, USE_TP=Y 인지 본 뒤 COMMIT 한다. 틀렸으면 ROLLBACK.
SELECT USER_ID, USE_TP, LOCK_YN, LOCK_CNT, PWD_FAIL_COUNT, HR_ST, END_ACTIVE_DATE
FROM   MCMAPUSER.TB_MCM_SEC_USER
WHERE  USER_ID = '&target_user';

PROMPT 결과가 맞으면 COMMIT; 을, 아니면 ROLLBACK; 을 입력하세요.
