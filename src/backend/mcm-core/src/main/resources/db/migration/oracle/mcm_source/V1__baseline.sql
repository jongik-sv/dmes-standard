-- ============================================================================
-- MCM_SOURCE Oracle 기준선 V1 (oracle-1007 c1, 2026-10-07)
--
-- 적용 방식: 스키마 폴더마다 Flyway 하나. 이 폴더는 defaultSchema=MCM_SOURCE 로 돈다. DDL 은 접두 없이 쓴다.
-- 전제: Oracle 12.2 이상. Flyway 는 이 스키마의 주인(MCM_SOURCE)으로 접속한다 — 끝의 GRANT 는 표 주인만 줄 수 있고,
--   ${app_user} 로 접속하면 자기 자신에게 주는 꼴이 되어 ORA-01749 로 실패한다. ${app_user} 사용자가 먼저 있어야 한다.
-- 내용: 마스터코드 원장(편집·DML 대상) 엔티티 MasterCode·MasterCodeCategory·MasterCodeDetail(@Table(schema="MCM_SOURCE"))
--   를 Hibernate OracleDialect(23)로 내보낸 것. 운영 조회 사본 3표와 VI_MCM_CODE_ACCESS 는 MCMAPUSER V1 에 있다.
-- 권한: mcm 앱은 MCMAPUSER 로 접속해 원장을 편집한다 — 끝의 GRANT 대상은 Flyway 자리표시자 ${app_user}
--   (로컬·운영 = MCMAPUSER). 운영 DBA 는 같은 값으로 바꿔 적용한다.
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
    CATEGORY_NM varchar2(180 char),
    constraint PK_TB_MCM_CODE_CATEGORY primary key (MASTER_CODE, CATEGORY_ID)
);

create table TB_MCM_CODE_DETAIL (
    C_AT timestamp(6),
    SORT_SEQ number(19,0),
    U_AT timestamp(6),
    VER number(19,0),
    CODE_VAL varchar2(50 char) not null,
    CODE_VER varchar2(50 char),
    MASTER_CODE varchar2(50 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    CODE_VAL_MEAN varchar2(120 char),
    CATEGORY_ID varchar2(180 char) not null,
    CODE_VAL_DESC varchar2(300 char),
    CODE_VAL_REF1 varchar2(300 char),
    CODE_VAL_REF2 varchar2(300 char),
    CODE_VAL_REF3 varchar2(300 char),
    CODE_VAL_REF4 varchar2(300 char),
    CODE_VAL_REF5 varchar2(300 char),
    CODE_VAL_REMARK varchar2(300 char),
    constraint PK_TB_MCM_CODE_DETAIL primary key (CODE_VAL, MASTER_CODE, CATEGORY_ID)
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
    MASTER_CODE_REF5 varchar2(300 char),
    constraint PK_TB_MCM_CODE_MASTER primary key (CODE_ID)
);

-- mcm 앱 접속 사용자 권한
grant select, insert, update, delete on TB_MCM_CODE_CATEGORY to ${app_user};

grant select, insert, update, delete on TB_MCM_CODE_DETAIL to ${app_user};

grant select, insert, update, delete on TB_MCM_CODE_MASTER to ${app_user};
