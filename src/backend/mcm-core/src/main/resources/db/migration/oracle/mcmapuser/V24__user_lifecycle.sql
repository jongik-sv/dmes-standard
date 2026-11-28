-- ============================================================
-- V24: 사용자 상태(잠금·비활성·퇴직)·임시 비밀번호·비밀번호 이력·ERP 인사 연동 수신
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 시안: 사용자 비활성화·퇴직 처리(A안). V22·V23 은 claude/mdm-domain-delete 의 커밋 전 파일이 쓴다 — 이 파일은 V24 다.
--
-- 1) TB_MCM_SEC_USER 칸 추가
--    LOCK_YN  잠금(비밀번호 실패). 지금까지는 잠금을 USE_TP='N' 으로 담아 관리자 비활성·삭제와 구분이 안 됐다.
--    LOCK_AT  잠근 시각. SYSADMIN 시간 잠금(15·30·60분)의 기준.
--    LOCK_CNT 연속 잠금 횟수. SYSADMIN 시간 잠금을 늘리는 데 쓴다. 로그인 성공·관리자 해제 때 0.
--    HR_ST    ERP 인사 상태. ACTIVE 재직 · LEAVE 휴직 · RETIRED 퇴직. 비어 있으면 인사가 모르는 계정(협력업체 등).
--    PWD_EXPIRY_EXEMPT_YN 비밀번호 사용 기간 제외(인터페이스·배치 계정). 관리자가 직접 붙인다.
--    USE_TP 는 As-Is 뜻을 지킨다: 'N' = 관리자 비활성, 'N' + 유효 기한일 지남 = 퇴직.
-- 2) 기존 실패 잠금 옮기기: USE_TP='N' 이면서 실패 횟수가 최대(5, cactus.security.max-login-failures)에 닿고
--    유효 기한이 남은 계정은 비밀번호 실패 잠금이었다 → LOCK_YN='Y', USE_TP='Y'.
-- 3) TB_MCM_SEC_USER_PWD.LAST_PWD_CHNG_DATE 빈칸 = 이제 「임시 비밀번호 상태」다. 적용하는 날 빈칸을 적용일로 채워
--    기존 사용자가 다음 로그인에 임시 비밀번호를 요구받지 않게 한다(사용 기간은 적용일부터 센다).
-- 4) TB_MCM_SEC_USER_HIS 에 HIS_SEQ 를 PK 로 더한다. 지금 PK(ACTIVE_DT, USER_ID)는 하루 한 줄이라
--    같은 날 비활성 → 다시 사용을 하면 앞 이력이 덮였다.
-- 5) TB_MCM_SEC_USER_PWD_HIS 새 표: 비밀번호 이력(해시만). 최근 N개 재사용 금지와 변경 시각·접속 IP 기록.
-- 6) TB_MCM_SEC_HR_EVT 새 표: ERP 인사 정보 수신·처리 상태. 인터페이스 방식(배치·실시간)은 ERP 스펙을 받은 뒤 정한다.
-- 7) commUserMng 오브젝트에 새 action 을 허용 값으로 더하고, 이미 저장(save)·조회(search) 권한을 가진 직무에 같이 준다.
--    commMenuMng 오브젝트에도 조회 action searchUnplacedObj(메뉴 셋에 없는 오브젝트)를 더한다. 이 action 은 V21 뒤에
--    BPMN 에 생겨 이미 적용된 V21 에는 없다. 그래서 옮긴 DB 의 SYSADMIN(효과 = 오브젝트 BTN_PERM)이 부를 수 없었다.
--    조회(search) 권한을 가진 직무에도 같이 준다.
--
-- 재실행: DDL 은 자동 커밋이다. 중간에 실패하면 남은 문장만 손으로 이어서 실행한다.

-- ── 1) TB_MCM_SEC_USER ──────────────────────────────────────
alter table TB_MCM_SEC_USER add (
    LOCK_YN varchar2(1 char) default 'N',
    LOCK_AT timestamp(6),
    LOCK_CNT number(10,0) default 0,
    HR_ST varchar2(10 char),
    PWD_EXPIRY_EXEMPT_YN varchar2(1 char) default 'N'
);
alter table TB_MCM_SEC_USER add constraint CK_TB_MCM_SEC_USER_LOCK_YN check (LOCK_YN in ('Y','N'));
alter table TB_MCM_SEC_USER add constraint CK_TB_MCM_SEC_USER_HR_ST check (HR_ST in ('ACTIVE','LEAVE','RETIRED'));
alter table TB_MCM_SEC_USER add constraint CK_TB_MCM_SEC_USER_PWD_EXEMPT check (PWD_EXPIRY_EXEMPT_YN in ('Y','N'));

-- 칸 순서(엔티티 선언 순서) — 새 칸을 PWD_FAIL_COUNT 뒤, VER·감사 칸 앞에 둔다.
alter table TB_MCM_SEC_USER modify (USER_EMP_NO invisible, SSO_ID invisible, USER_NM invisible, START_ACTIVE_DATE invisible, END_ACTIVE_DATE invisible, DEPT_CD invisible, USER_CATEGORY_CD invisible, USE_TP invisible, EMAIL invisible, TEL_NO invisible, MOBILE_TEL_NO invisible, IN_OUT_EMP_TP invisible, GROUP_ID1 invisible, GROUP_ID2 invisible, GROUP_ID3 invisible, THEME_TP invisible, MENU_TP invisible, BOTTOM_MSG_YN invisible, EXCEL_TP invisible, PWD_FAIL_COUNT invisible, LOCK_YN invisible, LOCK_AT invisible, LOCK_CNT invisible, HR_ST invisible, PWD_EXPIRY_EXEMPT_YN invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_USER modify (USER_EMP_NO visible);
alter table TB_MCM_SEC_USER modify (SSO_ID visible);
alter table TB_MCM_SEC_USER modify (USER_NM visible);
alter table TB_MCM_SEC_USER modify (START_ACTIVE_DATE visible);
alter table TB_MCM_SEC_USER modify (END_ACTIVE_DATE visible);
alter table TB_MCM_SEC_USER modify (DEPT_CD visible);
alter table TB_MCM_SEC_USER modify (USER_CATEGORY_CD visible);
alter table TB_MCM_SEC_USER modify (USE_TP visible);
alter table TB_MCM_SEC_USER modify (EMAIL visible);
alter table TB_MCM_SEC_USER modify (TEL_NO visible);
alter table TB_MCM_SEC_USER modify (MOBILE_TEL_NO visible);
alter table TB_MCM_SEC_USER modify (IN_OUT_EMP_TP visible);
alter table TB_MCM_SEC_USER modify (GROUP_ID1 visible);
alter table TB_MCM_SEC_USER modify (GROUP_ID2 visible);
alter table TB_MCM_SEC_USER modify (GROUP_ID3 visible);
alter table TB_MCM_SEC_USER modify (THEME_TP visible);
alter table TB_MCM_SEC_USER modify (MENU_TP visible);
alter table TB_MCM_SEC_USER modify (BOTTOM_MSG_YN visible);
alter table TB_MCM_SEC_USER modify (EXCEL_TP visible);
alter table TB_MCM_SEC_USER modify (PWD_FAIL_COUNT visible);
alter table TB_MCM_SEC_USER modify (LOCK_YN visible);
alter table TB_MCM_SEC_USER modify (LOCK_AT visible);
alter table TB_MCM_SEC_USER modify (LOCK_CNT visible);
alter table TB_MCM_SEC_USER modify (HR_ST visible);
alter table TB_MCM_SEC_USER modify (PWD_EXPIRY_EXEMPT_YN visible);
alter table TB_MCM_SEC_USER modify (VER visible);
alter table TB_MCM_SEC_USER modify (C_USR_ID visible);
alter table TB_MCM_SEC_USER modify (C_AT visible);
alter table TB_MCM_SEC_USER modify (C_SVC_ID visible);
alter table TB_MCM_SEC_USER modify (C_PGM_ID visible);
alter table TB_MCM_SEC_USER modify (U_USR_ID visible);
alter table TB_MCM_SEC_USER modify (U_AT visible);
alter table TB_MCM_SEC_USER modify (U_SVC_ID visible);
alter table TB_MCM_SEC_USER modify (U_PGM_ID visible);

COMMENT ON COLUMN TB_MCM_SEC_USER.LOCK_YN IS '잠금 여부(비밀번호 실패)';
COMMENT ON COLUMN TB_MCM_SEC_USER.LOCK_AT IS '잠근 일시';
COMMENT ON COLUMN TB_MCM_SEC_USER.LOCK_CNT IS '연속 잠금 횟수';
COMMENT ON COLUMN TB_MCM_SEC_USER.HR_ST IS 'ERP 인사 상태(ACTIVE 재직, LEAVE 휴직, RETIRED 퇴직)';
COMMENT ON COLUMN TB_MCM_SEC_USER.PWD_EXPIRY_EXEMPT_YN IS '비밀번호 사용 기간 제외 여부';

-- ── 2) 기존 실패 잠금 옮기기 ────────────────────────────────
UPDATE TB_MCM_SEC_USER
   SET LOCK_YN = 'Y'
     , LOCK_AT = COALESCE(U_AT, LOCALTIMESTAMP)
     , LOCK_CNT = 1
     , USE_TP = 'Y'
 WHERE USE_TP = 'N'
   AND PWD_FAIL_COUNT >= 5
   AND (END_ACTIVE_DATE IS NULL OR END_ACTIVE_DATE > LOCALTIMESTAMP);

UPDATE TB_MCM_SEC_USER
   SET LOCK_YN = 'N'
 WHERE LOCK_YN IS NULL;

UPDATE TB_MCM_SEC_USER
   SET LOCK_CNT = 0
 WHERE LOCK_CNT IS NULL;

UPDATE TB_MCM_SEC_USER
   SET PWD_EXPIRY_EXEMPT_YN = 'N'
 WHERE PWD_EXPIRY_EXEMPT_YN IS NULL;

-- ── 3) 빈 마지막 변경일을 적용일로 ──────────────────────────
UPDATE TB_MCM_SEC_USER_PWD
   SET LAST_PWD_CHNG_DATE = LOCALTIMESTAMP
 WHERE LAST_PWD_CHNG_DATE IS NULL;

-- ── 4) TB_MCM_SEC_USER_HIS.HIS_SEQ ──────────────────────────
alter table TB_MCM_SEC_USER_HIS add (HIS_SEQ number(10,0) default 1 not null);
alter table TB_MCM_SEC_USER_HIS drop constraint PK_TB_MCM_SEC_USER_HIS;
alter table TB_MCM_SEC_USER_HIS add constraint PK_TB_MCM_SEC_USER_HIS primary key (ACTIVE_DT, USER_ID, HIS_SEQ);
-- 칸 순서 — PK(ACTIVE_DT, USER_ID, HIS_SEQ) 뒤에 나머지를 원래 순서로 둔다.
alter table TB_MCM_SEC_USER_HIS modify (PROC_TYPE invisible, PROC_CASE invisible, USER_NM invisible, INF_REQ_NO invisible, DESCRIPTION invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_USER_HIS modify (PROC_TYPE visible);
alter table TB_MCM_SEC_USER_HIS modify (PROC_CASE visible);
alter table TB_MCM_SEC_USER_HIS modify (USER_NM visible);
alter table TB_MCM_SEC_USER_HIS modify (INF_REQ_NO visible);
alter table TB_MCM_SEC_USER_HIS modify (DESCRIPTION visible);
alter table TB_MCM_SEC_USER_HIS modify (VER visible);
alter table TB_MCM_SEC_USER_HIS modify (C_USR_ID visible);
alter table TB_MCM_SEC_USER_HIS modify (C_AT visible);
alter table TB_MCM_SEC_USER_HIS modify (C_SVC_ID visible);
alter table TB_MCM_SEC_USER_HIS modify (C_PGM_ID visible);
alter table TB_MCM_SEC_USER_HIS modify (U_USR_ID visible);
alter table TB_MCM_SEC_USER_HIS modify (U_AT visible);
alter table TB_MCM_SEC_USER_HIS modify (U_SVC_ID visible);
alter table TB_MCM_SEC_USER_HIS modify (U_PGM_ID visible);

COMMENT ON COLUMN TB_MCM_SEC_USER_HIS.HIS_SEQ IS '이력 순번(같은 날 안에서)';

-- ── 5) TB_MCM_SEC_USER_PWD_HIS ──────────────────────────────
create table TB_MCM_SEC_USER_PWD_HIS (
    USER_ID varchar2(30 char) not null,
    CHG_AT timestamp(6) not null,
    USER_ENC_PWD varchar2(100 char) not null,
    CHG_TP varchar2(10 char) not null,
    CLIENT_IP varchar2(64 char),
    VER number(19,0) default 0,
    C_USR_ID varchar2(100 char),
    C_AT timestamp(6),
    C_SVC_ID varchar2(100 char),
    C_PGM_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    U_AT timestamp(6),
    U_SVC_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    constraint PK_TB_MCM_SEC_USER_PWD_HIS primary key (USER_ID, CHG_AT),
    constraint CK_TB_MCM_SEC_USER_PWD_HIS_TP check (CHG_TP in ('SELF','INIT'))
);

COMMENT ON TABLE TB_MCM_SEC_USER_PWD_HIS IS '사용자 비밀번호 이력';
COMMENT ON COLUMN TB_MCM_SEC_USER_PWD_HIS.USER_ID IS '사용자 아이디';
COMMENT ON COLUMN TB_MCM_SEC_USER_PWD_HIS.CHG_AT IS '변경 일시';
COMMENT ON COLUMN TB_MCM_SEC_USER_PWD_HIS.USER_ENC_PWD IS '사용자 암호화 비밀번호(해시)';
COMMENT ON COLUMN TB_MCM_SEC_USER_PWD_HIS.CHG_TP IS '변경 구분(SELF 본인 변경, INIT 관리자 초기화)';
COMMENT ON COLUMN TB_MCM_SEC_USER_PWD_HIS.CLIENT_IP IS '접속 IP';
COMMENT ON COLUMN TB_MCM_SEC_USER_PWD_HIS.VER IS '버전';
COMMENT ON COLUMN TB_MCM_SEC_USER_PWD_HIS.C_USR_ID IS '생성자 아이디';
COMMENT ON COLUMN TB_MCM_SEC_USER_PWD_HIS.C_AT IS '생성일시';
COMMENT ON COLUMN TB_MCM_SEC_USER_PWD_HIS.C_SVC_ID IS '생성 서비스 아이디';
COMMENT ON COLUMN TB_MCM_SEC_USER_PWD_HIS.C_PGM_ID IS '생성 프로그램 아이디';
COMMENT ON COLUMN TB_MCM_SEC_USER_PWD_HIS.U_USR_ID IS '수정자 아이디';
COMMENT ON COLUMN TB_MCM_SEC_USER_PWD_HIS.U_AT IS '수정일시';
COMMENT ON COLUMN TB_MCM_SEC_USER_PWD_HIS.U_SVC_ID IS '수정 서비스 아이디';
COMMENT ON COLUMN TB_MCM_SEC_USER_PWD_HIS.U_PGM_ID IS '수정 프로그램 아이디';

-- ── 6) TB_MCM_SEC_HR_EVT ────────────────────────────────────
create table TB_MCM_SEC_HR_EVT (
    EVT_ID varchar2(40 char) not null,
    EMP_NO varchar2(10 char) not null,
    EVT_TP varchar2(10 char) not null,
    EVT_DT varchar2(8 char) not null,
    ORDER_NO varchar2(50 char),
    USER_NM varchar2(30 char),
    DEPT_CD varchar2(10 char),
    EMAIL varchar2(30 char),
    TEL_NO varchar2(15 char),
    MOBILE_TEL_NO varchar2(15 char),
    USER_ID varchar2(30 char),
    PROC_ST varchar2(10 char) default 'WAIT' not null,
    PROC_MSG varchar2(500 char),
    TRY_CNT number(5,0) default 0 not null,
    PROC_AT timestamp(6),
    VER number(19,0) default 0,
    C_USR_ID varchar2(100 char),
    C_AT timestamp(6),
    C_SVC_ID varchar2(100 char),
    C_PGM_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    U_AT timestamp(6),
    U_SVC_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    constraint PK_TB_MCM_SEC_HR_EVT primary key (EVT_ID),
    constraint CK_TB_MCM_SEC_HR_EVT_TP check (EVT_TP in ('HIRE','LEAVE','RETURN','RETIRE','MOVE','INFO')),
    constraint CK_TB_MCM_SEC_HR_EVT_ST check (PROC_ST in ('WAIT','DONE','SKIP','FAIL','HOLD'))
);
create index IX_TB_MCM_SEC_HR_EVT_ST on TB_MCM_SEC_HR_EVT (PROC_ST, EVT_DT);
create index IX_TB_MCM_SEC_HR_EVT_EMP on TB_MCM_SEC_HR_EVT (EMP_NO, EVT_DT);

COMMENT ON TABLE TB_MCM_SEC_HR_EVT IS 'ERP 인사 정보 수신';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.EVT_ID IS '인사 정보 아이디(ERP 키 또는 수신 때 만든 키)';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.EMP_NO IS '사번';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.EVT_TP IS '인사 구분(HIRE 입사, LEAVE 휴직, RETURN 복직, RETIRE 퇴직, MOVE 부서 이동, INFO 이름·연락처 변경)';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.EVT_DT IS '발령 일자(YYYYMMDD)';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.ORDER_NO IS '인사 발령 번호';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.USER_NM IS '이름';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.DEPT_CD IS '부서 코드';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.EMAIL IS '이메일';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.TEL_NO IS '전화번호';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.MOBILE_TEL_NO IS '휴대 전화번호';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.USER_ID IS '맞춘 사용자 아이디';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.PROC_ST IS '처리 상태(WAIT 대기, DONE 끝, SKIP 건너뜀, FAIL 실패, HOLD 계정 생성 대기)';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.PROC_MSG IS '처리 결과 메시지';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.TRY_CNT IS '처리 시도 횟수';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.PROC_AT IS '처리 일시';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.VER IS '버전';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.C_USR_ID IS '생성자 아이디';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.C_AT IS '생성일시';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.C_SVC_ID IS '생성 서비스 아이디';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.C_PGM_ID IS '생성 프로그램 아이디';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.U_USR_ID IS '수정자 아이디';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.U_AT IS '수정일시';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.U_SVC_ID IS '수정 서비스 아이디';
COMMENT ON COLUMN TB_MCM_SEC_HR_EVT.U_PGM_ID IS '수정 프로그램 아이디';

-- ── 7) commUserMng 새 action ────────────────────────────────
-- 오브젝트 허용 값: 조회 searchOwned·searchHrEvt, 저장 unlock·suspend·resume·retire·handover·retryHrEvt·regHrEvtUser
UPDATE TB_MCM_SEC_OBJ
   SET BTN_PERM = BTN_PERM || ',handover,regHrEvtUser,resume,retire,retryHrEvt,searchHrEvt,searchOwned,suspend,unlock'
 WHERE OBJECT_ID = 'commUserMng'
   AND BTN_PERM IS NOT NULL
   AND INSTR(',' || BTN_PERM || ',', ',unlock,') = 0;

-- 저장 권한(save)을 가진 직무 → 새 저장 action, 조회 권한(search)을 가진 직무 → 새 조회 action
UPDATE TB_MCM_SEC_ROLE_PERM
   SET BTN_PERM = BTN_PERM || ',handover,regHrEvtUser,resume,retire,retryHrEvt,suspend,unlock'
 WHERE OBJECT_ID = 'commUserMng'
   AND INSTR(',' || BTN_PERM || ',', ',save,') > 0
   AND INSTR(',' || BTN_PERM || ',', ',unlock,') = 0;

UPDATE TB_MCM_SEC_ROLE_PERM
   SET BTN_PERM = BTN_PERM || ',searchHrEvt,searchOwned'
 WHERE OBJECT_ID = 'commUserMng'
   AND INSTR(',' || BTN_PERM || ',', ',search,') > 0
   AND INSTR(',' || BTN_PERM || ',', ',searchOwned,') = 0;

-- commMenuMng 새 조회 action(searchUnplacedObj) — V21 뒤에 BPMN 에 생겼다.
UPDATE TB_MCM_SEC_OBJ
   SET BTN_PERM = BTN_PERM || ',searchUnplacedObj'
 WHERE OBJECT_ID = 'commMenuMng'
   AND BTN_PERM IS NOT NULL
   AND INSTR(',' || BTN_PERM || ',', ',searchUnplacedObj,') = 0;

UPDATE TB_MCM_SEC_ROLE_PERM
   SET BTN_PERM = BTN_PERM || ',searchUnplacedObj'
 WHERE OBJECT_ID = 'commMenuMng'
   AND INSTR(',' || BTN_PERM || ',', ',search,') > 0
   AND INSTR(',' || BTN_PERM || ',', ',searchUnplacedObj,') = 0;

COMMIT;
