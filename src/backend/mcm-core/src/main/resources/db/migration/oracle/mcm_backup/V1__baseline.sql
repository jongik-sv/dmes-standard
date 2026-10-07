-- ============================================================================
-- MCM_BACKUP Oracle 기준선 V1 (oracle-1007 c1, 2026-10-07)
--
-- 적용 방식: 스키마 폴더마다 Flyway 하나. 이 폴더는 defaultSchema=MCM_BACKUP 로 돈다. DDL 은 접두 없이 쓴다.
-- 내용: 마스터코드 백업본. 동기화 화면(CommSyncMngService)이 MCM_SOURCE → MCM_BACKUP 으로
--   TB_MCM_CODE_MASTER·TB_MCM_CODE_CATEGORY 를 DELETE 후 INSERT ... SELECT * 로 복사한다(DETAIL 은 백업하지 않는다).
--   SELECT * 복사라 열 순서가 MCM_SOURCE 원장과 같아야 한다 — 원장 정의를 그대로 옮기되, MSSQL SELECT INTO 처럼
--   PK 는 두지 않는다(DELETE 가 MASTER_CODE 기준이라 CODE_ID 의 MASTER_CODE 가 바뀌면 PK 가 복사를 막는다).
-- 전제: Oracle 23 이상. Flyway 는 이 스키마의 주인(MCM_BACKUP)으로 접속한다 — 끝의 GRANT 는 표 주인만 줄 수 있고,
--   ${app_user} 로 접속하면 자기 자신에게 주는 꼴이 되어 ORA-01749 로 실패한다. ${app_user} 사용자가 먼저 있어야 한다.
-- 적재기는 이 스키마를 비워 둔다(백업본).
-- 권한: 끝의 GRANT 대상은 Flyway 자리표시자 ${app_user}(로컬·운영 = MCMAPUSER).
-- ============================================================================

create table TB_MCM_CODE_CATEGORY (
    SORT_SEQ number(10,0),
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    MASTER_CODE varchar2(50 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    CATEGORY_ID varchar2(180 char) not null,
    CATEGORY_NM varchar2(180 char)
);

create table TB_MCM_CODE_MASTER (
    USE_TP varchar2(1 char),
    C_AT timestamp(6),
    END_ACTIVE_DATE timestamp(6),
    START_ACTIVE_DATE timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    CODE_ID varchar2(50 char) not null,
    CODE_OWNER_EMP_NO varchar2(50 char),
    CODE_VER varchar2(50 char),
    MASTER_CODE varchar2(50 char),
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    CODE_NM varchar2(180 char),
    CODE_CHARACTER varchar2(200 char),
    CODE_OWNER_DEPT_NM varchar2(200 char),
    CODE_DESC varchar2(300 char),
    MASTER_CODE_REF1 varchar2(300 char),
    MASTER_CODE_REF2 varchar2(300 char),
    MASTER_CODE_REF3 varchar2(300 char),
    MASTER_CODE_REF4 varchar2(300 char),
    MASTER_CODE_REF5 varchar2(300 char)
);

-- mcm 앱 접속 사용자 권한
grant select, insert, update, delete on TB_MCM_CODE_CATEGORY to ${app_user};

grant select, insert, update, delete on TB_MCM_CODE_MASTER to ${app_user};
