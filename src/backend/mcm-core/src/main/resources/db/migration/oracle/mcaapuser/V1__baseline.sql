-- ============================================================================
-- MCAAPUSER Oracle 기준선 V1 (oracle-1007 c1, 2026-10-07)
--
-- 적용 방식: 스키마 폴더마다 Flyway 하나. 이 폴더는 defaultSchema=MCAAPUSER 로 돈다. DDL 은 접두 없이 쓴다.
-- 전제: Oracle 12.2 이상. Flyway 는 이 스키마의 주인(MCAAPUSER)으로 접속한다 — 끝의 GRANT 는 표 주인만 줄 수 있고,
--   ${app_user} 로 접속하면 자기 자신에게 주는 꼴이 되어 ORA-01749 로 실패한다. ${app_user} 사용자가 먼저 있어야 한다.
-- 내용: 업무기준(cmb) 엔티티 RuleMaster·MasterRuleColList(@Table(schema="MCAAPUSER")) 를 Hibernate OracleDialect(23)로 내보낸 것.
-- 권한: mcm 앱은 MCMAPUSER 로 접속해 MCAAPUSER.TB_MCA_* 를 읽고 쓴다 — 끝의 GRANT 대상은 Flyway 자리표시자 ${app_user}
--   (로컬·운영 = MCMAPUSER). 운영 DBA 는 같은 값으로 바꿔 적용한다.
-- ============================================================================

create table TB_MCA_RULE_COL_LIST (
    COL_LEN number(10,0),
    COL_PREC_LEN number(10,0),
    COL_SEQ number(10,0) not null,
    MASTER_CODE_DIV varchar2(2 char),
    RULE_VER number(8,2),
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    COL_TYPE varchar2(10 char),
    IO_FLAG varchar2(10 char),
    COL_ID varchar2(30 char),
    MES_COL_ID varchar2(50 char),
    RULE_ID varchar2(50 char) not null,
    COL_NM varchar2(100 char),
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    OLD_COL_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    constraint PK_TB_MCA_RULE_COL_LIST primary key (COL_SEQ, RULE_ID)
);

create table TB_MCA_RULE_MASTER (
    RULE_TP varchar2(1 char),
    RULE_VER number(8,2),
    USE_TP varchar2(1 char),
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    RULE_OWNER_EMP_NO varchar2(20 char),
    RULE_OWNER_DEPT_NM varchar2(30 char),
    OLD_RULE_ID varchar2(50 char),
    RULE_ID varchar2(50 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    RULE_NM varchar2(180 char) not null,
    RULE_DESC varchar2(300 char),
    constraint PK_TB_MCA_RULE_MASTER primary key (RULE_ID)
);

-- mcm 앱 접속 사용자 권한
grant select, insert, update, delete on TB_MCA_RULE_COL_LIST to ${app_user};

grant select, insert, update, delete on TB_MCA_RULE_MASTER to ${app_user};
