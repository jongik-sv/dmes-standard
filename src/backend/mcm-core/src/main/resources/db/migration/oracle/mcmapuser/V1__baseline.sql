-- ============================================================================
-- MCMAPUSER Oracle 기준선 V1 (oracle-1007 c1, 2026-10-07)
--
-- 적용 방식: 스키마 폴더마다 Flyway 하나. 이 폴더는 defaultSchema=MCMAPUSER 로 돈다.
--   DDL 은 스키마 접두 없이 쓴다 — 접속(또는 defaultSchema) 사용자의 스키마에 만든다.
--   런타임 SQL 의 접두(MCMAPUSER.)는 그대로 유지한다(README §0.4).
-- 전제: Oracle 12.2 이상(30자 넘는 제약 이름·IDENTITY). boolean 칸은 NUMBER(1)(공통 설정 preferred_boolean_jdbc_type=BIT). Flyway 는 이 스키마의 주인(MCMAPUSER)으로 접속한다.
--   MCM_SOURCE·MCM_BACKUP·MCAAPUSER 기준선은 MCMAPUSER 에게 GRANT 하므로, 이 사용자가 먼저 있어야 한다(적용 순서는 무관).
-- 시퀀스 SEQ_MCM_MOM_TC_SEND·SEQ_MCM_MOM_TC_ERROR 는 1 부터 시작한다 — 기존 데이터를 옮겨 넣으면 MAX(키)+1 로 다시 맞춘다.
-- 내용: mcm 기본 영속성 단위(JpaConfig packagesToScan — cactus.security.auth·cactus.mastercode·com.dongkuk.dmes.mcm)
--   중 @Table(schema="MCMAPUSER") 엔티티와 접두 없는 엔티티(TB_SEC_*·위젯·샘플 등 — biz 접속 사용자 = MCMAPUSER 에 놓인다)를
--   Hibernate OracleDialect(23) 로 내보낸 것 + 엔티티가 없는 Java DDL(SchemaArtifactsMssql/Sqlite) 객체.
-- 대조: 로컬 mcm.db(.backup 사본) 의 표·열·NOT NULL 이 엔티티와 같음을 확인했다. SQLite 의 HTE_TB_MCM_MOM_TC_SEND
--   (Hibernate 임시 표)는 넣지 않고, SEQ_MCM_MOM_TC_SEND(시퀀스 흉내 표)는 실제 SEQUENCE 로 바꿨다.
-- 운영(WildFly)은 Flyway 를 끄고 DBA 가 이 파일을 그대로 적용한다.
-- ============================================================================

create sequence SEQ_MCM_MOM_TC_SEND start with 1 increment by 1;

create table TB_MCM_DEPT_INFO (
    USE_TP varchar2(1 char),
    C_AT timestamp(6),
    END_ACTIVE_DATE timestamp(6),
    START_ACTIVE_DATE timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    DEPT_CD varchar2(10 char) not null,
    UPPER_DEPT_CD varchar2(10 char),
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    DEPT_NM varchar2(100 char),
    DEPT_NM_EN varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    constraint PK_TB_MCM_DEPT_INFO primary key (DEPT_CD)
);

create table TB_MCM_EXCHANGE_RATE (
    BASE_CUR varchar2(3 char) not null,
    QUOTE_CUR varchar2(3 char) not null,
    RATE number(20,8) not null,
    C_AT timestamp(6),
    RATE_DATE varchar2(8 char) not null,
    U_AT timestamp(6),
    VER number(19,0),
    SOURCE varchar2(20 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    constraint PK_TB_MCM_EXCHANGE_RATE primary key (BASE_CUR, QUOTE_CUR, RATE_DATE)
);

create table TB_MCM_MOM_FORMAT_LIST (
    END_ACTIVE_DATE date,
    FORMAT_VER number(8,2) not null,
    START_ACTIVE_DATE date,
    USE_TP varchar2(1 char) not null,
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    FORMAT_ID varchar2(50 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    FORMAT_NM varchar2(120 char),
    FORMAT_DESC varchar2(300 char),
    constraint PK_TB_MCM_MOM_FORMAT_LIST primary key (FORMAT_VER, FORMAT_ID)
);

create table TB_MCM_MOM_INTERFACES (
    END_ACTIVE_DATE date,
    RECV_WORKS_CD varchar2(2 char),
    SEND_WORKS_CD varchar2(2 char),
    START_ACTIVE_DATE date,
    USE_TP varchar2(1 char) not null,
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    INTERFACE_PROTOCOL varchar2(20 char),
    RECV_IF_TP varchar2(20 char),
    RECV_MODULE_ID varchar2(20 char),
    SEND_IF_TP varchar2(20 char),
    SEND_MODULE_ID varchar2(20 char),
    FORMAT_ID varchar2(50 char),
    INTERFACE_ID varchar2(50 char) not null,
    RECV_TABLE_ID varchar2(50 char),
    SEND_TABLE_ID varchar2(50 char),
    TRANSACTION_CODE varchar2(50 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    INTERFACE_DESC varchar2(300 char),
    constraint PK_TB_MCM_MOM_INTERFACES primary key (INTERFACE_ID, TRANSACTION_CODE)
);

create table TB_MCM_MOM_TC_ERROR (
    ERROR_STATUS_CODE varchar2(1 char),
    ERROR_TYPE varchar2(3 char),
    SQ_VAL number(19,0) not null,
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    INTERFACE_PROTOCOL varchar2(20 char),
    TRANSACTION_CODE varchar2(50 char),
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    ERROR_CODE varchar2(100 char),
    INTERFACE_ID varchar2(100 char),
    KEY_DATA1 varchar2(100 char),
    KEY_DATA2 varchar2(100 char),
    KEY_DATA3 varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    ERROR_MSG varchar2(1000 char),
    INTERFACE_MSG nclob,
    constraint PK_TB_MCM_MOM_TC_ERROR primary key (SQ_VAL)
);

create table TB_MCM_MOM_TC_LIST (
    END_ACTIVE_DATE date,
    START_ACTIVE_DATE date,
    USE_TP varchar2(1 char) not null,
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    FORMAT_ID varchar2(50 char) not null,
    TRANSACTION_CODE varchar2(50 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    TRANSACTION_NM varchar2(120 char),
    TRANSACTION_DESC varchar2(300 char),
    constraint PK_TB_MCM_MOM_TC_LIST primary key (TRANSACTION_CODE)
);

create table TB_MCM_MOM_TC_SEND (
    ERR_SQ_VAL number(19,0) not null,
    SEND_SQ_VAL number(19,0) not null,
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    SEND_RESULT varchar2(10 char),
    TRANSACTION_CODE varchar2(50 char),
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    INTERFACE_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    INTERFACE_MSG nclob,
    constraint PK_TB_MCM_MOM_TC_SEND primary key (SEND_SQ_VAL)
);

create table TB_MCM_MOM_TC_SKIP (
    END_ACTIVE_DATE date,
    SKIP_LEVEL varchar2(1 char),
    START_ACTIVE_DATE date,
    USE_TP varchar2(1 char) not null,
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    TRANSACTION_CODE varchar2(50 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    constraint PK_TB_MCM_MOM_TC_SKIP primary key (TRANSACTION_CODE)
);

create table TB_MCM_NOTICE (
    PIN_YN varchar2(1 char) not null,
    POST_END_DT date,
    POST_START_DT date,
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    CONTENT_FORMAT varchar2(10 char) not null,
    NOTICE_CATEGORY varchar2(10 char) not null,
    NOTICE_STATUS varchar2(10 char) not null,
    TARGET_SCOPE varchar2(10 char) not null,
    NOTICE_ID varchar2(30 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    TITLE varchar2(200 char) not null,
    CONTENT clob,
    constraint PK_TB_MCM_NOTICE primary key (NOTICE_ID)
);

create table TB_MCM_NOTICE_TARGET (
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    NOTICE_ID varchar2(30 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    ROLE_ID varchar2(100 char) not null,
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    constraint PK_TB_MCM_NOTICE_TARGET primary key (NOTICE_ID, ROLE_ID)
);

create table TB_MCM_SEC_MENU (
    MENU_VIEW_YN varchar2(1 char),
    USE_TP varchar2(1 char),
    C_AT timestamp(6),
    END_ACTIVE_DATE timestamp(6),
    START_ACTIVE_DATE timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    MENU_TP varchar2(10 char),
    FULL_SEQ varchar2(30 char),
    MENU_ID varchar2(30 char) not null,
    MENU_SEQ varchar2(30 char),
    PARENT_MENU_ID varchar2(30 char),
    OBJECT_ID varchar2(50 char),
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    MENU_NM varchar2(300 char),
    MENU_PARAM1 varchar2(300 char),
    MENU_PARAM2 varchar2(300 char),
    MENU_PARAM3 varchar2(300 char),
    MENU_DESC varchar2(1000 char),
    constraint PK_TB_MCM_SEC_MENU primary key (MENU_ID)
);

create table TB_MCM_SEC_OBJ (
    USE_TP varchar2(1 char),
    C_AT timestamp(6),
    END_ACTIVE_DATE timestamp(6),
    START_ACTIVE_DATE timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    ACCESS_TP varchar2(10 char),
    OBJECT_TYPE varchar2(10 char),
    SYSTEM_CODE varchar2(10 char),
    OBJECT_ID varchar2(50 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    FORM_URL varchar2(100 char),
    OBJECT_NM varchar2(100 char),
    SERVICE varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    OUT_ACCESS_IP varchar2(150 char),
    PARAM varchar2(150 char),
    PROGRAM_DESC varchar2(300 char),
    constraint PK_TB_MCM_SEC_OBJ primary key (OBJECT_ID)
);

create table TB_MCM_SEC_PERM (
    USE_TP varchar2(1 char),
    C_AT timestamp(6),
    END_ACTIVE_DATE timestamp(6),
    START_ACTIVE_DATE timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    PERMISSION_ID varchar2(100 char) not null,
    PERMISSION_NM varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    PERMISSION_DESC varchar2(300 char),
    PERMISSION_COMMON varchar2(500 char),
    PERMISSION_CUSTOM varchar2(500 char),
    POPUP_BTN varchar2(1000 char),
    PERMISSION_ACTION varchar2(2000 char),
    constraint PK_TB_MCM_SEC_PERM primary key (PERMISSION_ID)
);

create table TB_MCM_SEC_ROLE (
    USE_TP varchar2(1 char),
    C_AT timestamp(6),
    END_ACTIVE_DATE timestamp(6),
    START_ACTIVE_DATE timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    MENU_ID varchar2(30 char),
    PARENT_ROLE_ID varchar2(30 char),
    ROLE_ID varchar2(30 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    ROLE_NM varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    ROLE_DESC varchar2(300 char),
    constraint PK_TB_MCM_SEC_ROLE primary key (ROLE_ID)
);

create table TB_MCM_SEC_ROLE_MAPPING (
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    ROLE_ID varchar2(30 char) not null,
    OBJECT_ID varchar2(50 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    PERMISSION_ID varchar2(100 char) not null,
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    constraint PK_TB_MCM_SEC_ROLE_MAPPING primary key (ROLE_ID, OBJECT_ID, PERMISSION_ID)
);

create table TB_MCM_SEC_ROLEGROUP (
    USE_TP varchar2(1 char),
    C_AT timestamp(6),
    END_ACTIVE_DATE timestamp(6),
    START_ACTIVE_DATE timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    ROLE_GROUP_ID varchar2(30 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    ROLE_GROUP_NM varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    ROLE_GROUP_DESC varchar2(300 char),
    constraint PK_TB_MCM_SEC_ROLEGROUP primary key (ROLE_GROUP_ID)
);

create table TB_MCM_SEC_ROLEGROUP_MAPPING (
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    ROLE_GROUP_ID varchar2(30 char) not null,
    ROLE_ID varchar2(30 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    constraint PK_TB_MCM_SEC_ROLEGROUP_MAPPING primary key (ROLE_GROUP_ID, ROLE_ID)
);

create table TB_MCM_SEC_USER (
    BOTTOM_MSG_YN varchar2(1 char),
    EXCEL_TP varchar2(1 char),
    IN_OUT_EMP_TP varchar2(1 char),
    MENU_TP varchar2(1 char),
    USE_TP varchar2(1 char),
    C_AT timestamp(6),
    END_ACTIVE_DATE timestamp(6),
    PWD_FAIL_COUNT number(19,0),
    START_ACTIVE_DATE timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    DEPT_CD varchar2(10 char),
    USER_CATEGORY_CD varchar2(10 char),
    USER_EMP_NO varchar2(10 char),
    MOBILE_TEL_NO varchar2(15 char),
    TEL_NO varchar2(15 char),
    THEME_TP varchar2(20 char),
    EMAIL varchar2(30 char),
    SSO_ID varchar2(30 char),
    USER_ID varchar2(30 char) not null,
    USER_NM varchar2(30 char),
    GROUP_ID1 varchar2(50 char),
    GROUP_ID2 varchar2(50 char),
    GROUP_ID3 varchar2(50 char),
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    constraint PK_TB_MCM_SEC_USER primary key (USER_ID)
);

create table TB_MCM_SEC_USER_FAVORITE (
    FVT_SEQ number(10,0) not null,
    MENU_SEQ number(10,0) not null,
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    FVT_FOLD_ID varchar2(30 char) not null,
    MENU_ID varchar2(30 char) not null,
    USER_ID varchar2(30 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    FULL_ID varchar2(200 char) not null,
    constraint PK_TB_MCM_SEC_USER_FAVORITE primary key (MENU_SEQ, FVT_FOLD_ID, MENU_ID, USER_ID, FULL_ID)
);

create table TB_MCM_SEC_USER_FAVORITE_FOLD (
    FVT_FOLD_SEQ number(10,0) not null,
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    FVT_FOLD_ID varchar2(10 char) not null,
    FVT_FOLD_NM varchar2(30 char),
    USER_ID varchar2(30 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    constraint PK_TB_MCM_SEC_USER_FAVORITE_FOLD primary key (FVT_FOLD_ID, USER_ID)
);

create table TB_MCM_SEC_USER_HIS (
    PROC_CASE varchar2(1 char),
    PROC_TYPE varchar2(1 char),
    ACTIVE_DT varchar2(8 char) not null,
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    USER_ID varchar2(30 char) not null,
    USER_NM varchar2(30 char),
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    INF_REQ_NO varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    DESCRIPTION varchar2(300 char),
    constraint PK_TB_MCM_SEC_USER_HIS primary key (ACTIVE_DT, USER_ID)
);

create table TB_MCM_SEC_USER_MAPPING (
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    ROLE_GROUP_ID varchar2(30 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    USER_ID varchar2(100 char) not null,
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    constraint PK_TB_MCM_SEC_USER_MAPPING primary key (ROLE_GROUP_ID, USER_ID)
);

create table TB_MCM_SEC_USER_PWD (
    C_AT timestamp(6),
    LAST_PWD_CHNG_DATE timestamp(6),
    TEMP_PWD_EXPIRATION_DATE timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    USER_ID varchar2(30 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    SALT varchar2(100 char),
    USER_ENC_PWD varchar2(100 char),
    USER_ENC_TEMP_PWD varchar2(100 char),
    USER_SSO_PWD varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    constraint PK_TB_MCM_SEC_USER_PWD primary key (USER_ID)
);

create table TB_MCM_SEC_USER_ROLL_HIS (
    RESP_GBN varchar2(1 char) not null,
    WORKS_CODE varchar2(1 char) not null,
    C_AT timestamp(6),
    OP_SUMUP_DT varchar2(8 char) not null,
    U_AT timestamp(6),
    VER number(19,0),
    ROLE_GROUP_ID varchar2(30 char) not null,
    USER_ID varchar2(30 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    INF_REQ_NO varchar2(100 char),
    ROLE_GROUP_NM varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    DESCRIPTION varchar2(300 char),
    constraint PK_TB_MCM_SEC_USER_ROLL_HIS primary key (RESP_GBN, WORKS_CODE, OP_SUMUP_DT, ROLE_GROUP_ID, USER_ID)
);

create table TB_MCM_SEC_USER_SRCH_DFLT (
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    USER_ID varchar2(30 char) not null,
    FIELD_META varchar2(50 char),
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    FIELD_KEY varchar2(100 char) not null,
    FIELD_LABEL varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    PAGE_ID varchar2(200 char) not null,
    RULE_JSON varchar2(1000 char) not null,
    constraint PK_TB_MCM_SEC_USER_SRCH_DFLT primary key (USER_ID, FIELD_KEY, PAGE_ID)
);

create table TB_MCM_SEC_USER_START_PGM (
    MENU_SEQ number(10,0) not null,
    START_SEQ number(10,0) not null,
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    MENU_ID varchar2(30 char) not null,
    USER_ID varchar2(30 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    FULL_ID varchar2(200 char) not null,
    constraint PK_TB_MCM_SEC_USER_START_PGM primary key (MENU_SEQ, MENU_ID, USER_ID, FULL_ID)
);

create table TB_MCM_SEC_USER_WIDGET (
    LOCK_YN varchar2(1 char) not null,
    POS_X number(10,0) not null,
    POS_Y number(10,0) not null,
    SIZE_H number(10,0) not null,
    SIZE_W number(10,0) not null,
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    TAB_ID varchar2(30 char) not null,
    USER_ID varchar2(30 char) not null,
    INST_ID varchar2(40 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    WIDGET_ID varchar2(100 char) not null,
    CONFIG_JSON varchar2(4000 char),
    constraint PK_TB_MCM_SEC_USER_WIDGET primary key (TAB_ID, USER_ID, INST_ID)
);

create table TB_MCM_SEC_USER_WIDGET_CHAT (
    MSG_SEQ number(10,0) not null,
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    ROLE_TP varchar2(10 char) not null,
    USER_ID varchar2(30 char) not null,
    INST_ID varchar2(40 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    CONTENT clob not null,
    LINKS_JSON varchar2(4000 char),
    constraint PK_TB_MCM_SEC_USER_WIDGET_CHAT primary key (MSG_SEQ, USER_ID, INST_ID)
);

create table TB_MCM_SEC_USER_WIDGET_MEMO (
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    FMT varchar2(10 char) not null,
    INST_ID varchar2(40 char) not null,
    USER_ID varchar2(50 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    DEF_ID varchar2(100 char) not null,
    TITLE varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    CONTENT clob,
    constraint PK_TB_MCM_SEC_USER_WIDGET_MEMO primary key (INST_ID, USER_ID)
);

create table TB_MCM_SEC_USER_WIDGET_TAB (
    LOCK_YN varchar2(1 char) not null,
    TAB_SEQ number(10,0) not null,
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    TAB_ID varchar2(30 char) not null,
    USER_ID varchar2(30 char) not null,
    TAB_NM varchar2(60 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    constraint PK_TB_MCM_SEC_USER_WIDGET_TAB primary key (TAB_ID, USER_ID)
);

create table TB_MCM_WIDGET_COLLECT_DATA (
    VALUE_NUM number(24,8),
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    SLOT varchar2(12 char) not null,
    WIDGET_ID varchar2(40 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    ITEM_KEY varchar2(100 char) not null,
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    VALUE_TXT varchar2(200 char),
    constraint PK_TB_MCM_WIDGET_COLLECT_DATA primary key (SLOT, WIDGET_ID, ITEM_KEY)
);

create table TB_MCM_WIDGET_COLLECT_RUN (
    ITEM_CNT number(10,0),
    STATUS varchar2(4 char) not null,
    C_AT timestamp(6),
    ENDED_AT timestamp(6),
    STARTED_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    SLOT varchar2(12 char) not null,
    WIDGET_ID varchar2(40 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    MSG varchar2(200 char),
    constraint PK_TB_MCM_WIDGET_COLLECT_RUN primary key (SLOT, WIDGET_ID)
);

create table TB_MCM_WIDGET_DEF (
    DEF_H number(10,0),
    DEF_W number(10,0),
    MAX_H number(10,0),
    MAX_W number(10,0),
    MIN_H number(10,0),
    MIN_W number(10,0),
    MULTIPLE_YN varchar2(1 char),
    PLACE_TP varchar2(1 char),
    PRIVATE_YN varchar2(1 char),
    REFRESH_SEC number(10,0),
    SRC_TP varchar2(1 char) not null,
    USE_YN varchar2(1 char) not null,
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    CATEGORY_CD varchar2(20 char),
    DATA_SRC varchar2(20 char),
    TYPE_ID varchar2(40 char),
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    SUBTITLE varchar2(100 char),
    TITLE varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    WIDGET_ID varchar2(100 char) not null,
    LINK_PAGE_ID varchar2(200 char),
    DESCRIPTION varchar2(400 char),
    CONFIG_JSON clob,
    constraint PK_TB_MCM_WIDGET_DEF primary key (WIDGET_ID)
);

create table TB_MCM_WIDGET_DEFAULT_LAYOUT (
    LOCK_YN varchar2(1 char) not null,
    POS_X number(10,0) not null,
    POS_Y number(10,0) not null,
    SIZE_H number(10,0) not null,
    SIZE_W number(10,0) not null,
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    LAYOUT_KEY varchar2(30 char) not null,
    INST_ID varchar2(40 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    WIDGET_ID varchar2(100 char) not null,
    constraint PK_TB_MCM_WIDGET_DEFAULT_LAYOUT primary key (LAYOUT_KEY, INST_ID)
);

create table TB_MCM_WIDGET_DEFAULT_TAB (
    TAB_SEQ number(10,0) not null,
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    LAYOUT_KEY varchar2(30 char) not null,
    TAB_ID varchar2(30 char) not null,
    TAB_NM varchar2(60 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    constraint PK_TB_MCM_WIDGET_DEFAULT_TAB primary key (LAYOUT_KEY, TAB_ID),
    constraint UK_MCM_WIDGET_DEFAULT_TAB_ID unique (TAB_ID)
);

create table TB_MCM_WIDGET_DEFAULT_TAB_ITEM (
    LOCK_YN varchar2(1 char) not null,
    POS_X number(10,0) not null,
    POS_Y number(10,0) not null,
    SIZE_H number(10,0) not null,
    SIZE_W number(10,0) not null,
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    LAYOUT_KEY varchar2(30 char) not null,
    TAB_ID varchar2(30 char) not null,
    INST_ID varchar2(40 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    WIDGET_ID varchar2(100 char) not null,
    constraint PK_TB_MCM_WIDGET_DEFAULT_TAB_ITEM primary key (LAYOUT_KEY, TAB_ID, INST_ID)
);

create table TB_MCM_WIDGET_MEDIA (
    C_AT timestamp(6),
    FILE_SIZE number(19,0) not null,
    U_AT timestamp(6),
    VER number(19,0),
    FILE_ID varchar2(40 char) not null,
    CONTENT_TYPE varchar2(100 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    ORIG_NM varchar2(200 char) not null,
    constraint PK_TB_MCM_WIDGET_MEDIA primary key (FILE_ID)
);

create index IX_TB_MCM_NOTICE_STATUS
   on TB_MCM_NOTICE (NOTICE_STATUS);

create index IX_TB_MCM_NOTICE_TARGET_ROLE
   on TB_MCM_NOTICE_TARGET (ROLE_ID);

create index IX_MCM_WCOL_DATA_SLOT
   on TB_MCM_WIDGET_COLLECT_DATA (SLOT);

create index IX_MCM_WCOL_RUN_SLOT
   on TB_MCM_WIDGET_COLLECT_RUN (SLOT);

create table sample_master_code (
    sort_order number(10,0) not null,
    use_yn varchar2(1 char) not null,
    id number(19,0) generated by default as identity,
    code_group varchar2(50 char) not null,
    code_value varchar2(50 char) not null,
    label varchar2(200 char) not null,
    constraint PK_SAMPLE_MASTER_CODE primary key (id)
);

create table sample_notice (
    active number(1,0) not null check ((active in (0,1))),
    id number(19,0) generated by default as identity,
    title varchar2(200 char) not null,
    content varchar2(4000 char),
    constraint PK_SAMPLE_NOTICE primary key (id)
);

create table TB_MCM_MOM_FORMAT_LAYOUT (
    DATA_DECIMAL_PREC number(5,0),
    DATA_LEN number(5,0),
    DATA_TP varchar2(1 char),
    FORMAT_VER number(8,2) not null,
    ITEM_SEQ number(15,0) not null,
    ITEM_TP varchar2(1 char),
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    FORMAT_ID varchar2(50 char) not null,
    ITEM_ID varchar2(50 char),
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    ITEM_NM varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    constraint PK_TB_MCM_MOM_FORMAT_LAYOUT primary key (FORMAT_VER, ITEM_SEQ, FORMAT_ID)
);

create table TB_SEC_AUDIT_LOG (
    OCCURRED_AT timestamp(6) not null,
    CLIENT_IP varchar2(64 char),
    ACTION varchar2(100 char) not null,
    ACTOR_USER_ID varchar2(100 char),
    AUDIT_ID varchar2(100 char) not null,
    TARGET_ID varchar2(100 char),
    TARGET_TYPE varchar2(100 char),
    AFTER_JSON clob,
    BEFORE_JSON clob,
    constraint PK_TB_SEC_AUDIT_LOG primary key (AUDIT_ID)
);

create table TB_SEC_CODE_CATEGORY (
    SORT_ORD number(10,0),
    USE_YN varchar2(1 char),
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    CATEGORY_CD varchar2(50 char) not null,
    GROUP_CD varchar2(50 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    CATEGORY_NM varchar2(200 char),
    constraint PK_TB_SEC_CODE_CATEGORY primary key (CATEGORY_CD, GROUP_CD)
);

create table TB_SEC_CODE_GROUP (
    USE_YN varchar2(1 char),
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    GROUP_CD varchar2(50 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    GROUP_NM varchar2(200 char),
    GROUP_DESC varchar2(500 char),
    constraint PK_TB_SEC_CODE_GROUP primary key (GROUP_CD)
);

create table TB_SEC_CODE_ITEM (
    SORT_ORD number(10,0),
    USE_YN varchar2(1 char),
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    GROUP_CD varchar2(50 char) not null,
    ITEM_CD varchar2(50 char) not null,
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    EXTRA_VAL1 varchar2(200 char),
    EXTRA_VAL2 varchar2(200 char),
    ITEM_NM varchar2(200 char),
    ITEM_DESC varchar2(500 char),
    constraint PK_TB_SEC_CODE_ITEM primary key (GROUP_CD, ITEM_CD)
);

create table TB_SEC_KEY_STORE (
    ACTIVE varchar2(1 char),
    CREATED_AT timestamp(6),
    EXPIRES_AT timestamp(6),
    ALG varchar2(20 char),
    KID varchar2(50 char) not null,
    PRIVATE_KEY clob,
    PUBLIC_KEY clob,
    SECRET clob,
    constraint PK_TB_SEC_KEY_STORE primary key (KID)
);

create table TB_SEC_LOGIN_LOG (
    OCCURRED_AT timestamp(6) not null,
    EVENT_TYPE varchar2(30 char) not null,
    CLIENT_IP varchar2(64 char),
    LOG_ID varchar2(100 char) not null,
    USER_ID varchar2(100 char),
    USER_AGENT varchar2(500 char),
    constraint PK_TB_SEC_LOGIN_LOG primary key (LOG_ID)
);

create table TB_SEC_REVOKED_TOKEN (
    EXPIRES_AT timestamp(6),
    REVOKED_AT timestamp(6) not null,
    JTI varchar2(100 char) not null,
    USER_ID varchar2(100 char),
    constraint PK_TB_SEC_REVOKED_TOKEN primary key (JTI)
);

create table TB_SEC_SCREEN_USAGE_DAY (
    OPEN_CNT number(10,0) not null,
    SEG_CNT number(10,0) not null,
    DURATION_MS number(19,0) not null,
    USAGE_DT char(8) not null,
    DEPT_CD varchar2(10 char) not null,
    USER_ID varchar2(50 char) not null,
    PAGE_ID varchar2(200 char) not null,
    constraint PK_TB_SEC_SCREEN_USAGE_DAY primary key (USAGE_DT, DEPT_CD, USER_ID, PAGE_ID)
);

create table TB_SEC_SCREEN_USAGE_LOG (
    DURATION_MS number(19,0) not null,
    ENDED_AT timestamp(6) not null,
    RECEIVED_AT timestamp(6) not null,
    STARTED_AT timestamp(6) not null,
    DEPT_CD varchar2(10 char),
    START_KIND varchar2(10 char) not null,
    CLIENT_SEG_ID varchar2(36 char) not null,
    USAGE_ID varchar2(36 char) not null,
    CLIENT_IP varchar2(45 char),
    USER_ID varchar2(50 char) not null,
    PAGE_ID varchar2(200 char) not null,
    constraint PK_TB_SEC_SCREEN_USAGE_LOG primary key (USAGE_ID),
    constraint UK_SEC_SCREEN_USAGE_LOG_SEG unique (USER_ID, CLIENT_SEG_ID)
);

create table TB_SEC_USER (
    LOCK_YN varchar2(1 char),
    PASS_INIT_YN varchar2(1 char),
    PASS_SET_DD date,
    TRY_CNT number(10,0),
    USE_YN varchar2(1 char),
    VALID_END_DD date,
    VALID_STR_DD date,
    C_AT timestamp(6),
    U_AT timestamp(6),
    VER number(19,0),
    DEPT_CD varchar2(30 char),
    USER_NO varchar2(50 char),
    C_PGM_ID varchar2(100 char),
    C_SVC_ID varchar2(100 char),
    C_USR_ID varchar2(100 char),
    USER_ID varchar2(100 char) not null,
    USER_PASS varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    U_SVC_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    USER_NM varchar2(200 char),
    constraint PK_TB_SEC_USER primary key (USER_ID)
);

create index IX_SEC_SCREEN_USAGE_LOG_STARTED
   on TB_SEC_SCREEN_USAGE_LOG (STARTED_AT);

create index IX_SEC_SCREEN_USAGE_LOG_USER
   on TB_SEC_SCREEN_USAGE_LOG (USER_ID, STARTED_AT);

create index IX_SEC_SCREEN_USAGE_LOG_PAGE
   on TB_SEC_SCREEN_USAGE_LOG (PAGE_ID, STARTED_AT);

-- ----------------------------------------------------------------------------
-- 엔티티가 없는 객체 (SchemaArtifactsMssql·SchemaArtifactsSqlite 의 마지막 상태)
-- ----------------------------------------------------------------------------

-- MOM TC 에러 로그 키 — 엔티티 MomTcError 는 키를 직접 받고, cactus DmomMapper.xml 의 INSERT 가 이 시퀀스로 SQ_VAL 을 채운다.
create sequence SEQ_MCM_MOM_TC_ERROR start with 1 increment by 1;

-- 메뉴 폴더(모듈·그룹) — SecMenuNativeRepository 가 TB_MCM_SEC_MENU 와 조인해 트리를 만든다.
-- FULL_SEQ 는 7자리 인코딩 숫자(모듈 백만·그룹 만). TB_MCM_SEC_MENU.FULL_SEQ 는 문자열이다.
create table TB_MCM_SEC_MENU_FLD (
    MENU_ID varchar2(30 char) not null,
    MENU_SEQ varchar2(30 char),
    MENU_NM varchar2(100 char),
    PARENT_MENU_ID varchar2(30 char),
    BIZ_SYSTEM_CODE varchar2(10 char),
    FULL_SEQ number(10,0),
    USE_TP varchar2(1 char),
    MENU_TP varchar2(20 char),
    MENU_VIEW_YN varchar2(1 char),
    constraint PK_TB_MCM_SEC_MENU_FLD primary key (MENU_ID)
);

-- 마스터코드 운영 조회 사본 3표 — 원장은 MCM_SOURCE(엔티티 MasterCode·MasterCodeCategory·MasterCodeDetail).
-- 동기화 화면(CommSyncMngService)이 MCM_SOURCE → MCMAPUSER 로 DELETE(MASTER_CODE 기준) 후 INSERT ... SELECT * 로 복사한다.
-- SELECT * 복사라 열 순서가 원장과 같아야 한다. MSSQL 판(SELECT INTO ... WHERE 1=0)처럼 PK 를 두지 않는다 —
-- 원장에서 CODE_ID 의 MASTER_CODE 가 바뀌면 옛 행이 남아 PK 가 동기화를 막기 때문이다(동작 보존).
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
    CODE_VAL_REMARK varchar2(300 char)
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

-- 코드 선택 팝업(masterCodeSelPop) 조회 뷰 — 자기 스키마의 사본 3표를 조인한다(원장 직접 조인 안 함, 동기화 시차 의도).
create or replace view VI_MCM_CODE_ACCESS (
    CODE_ID, CODE_NM, CATEGORY_ID, CATEGORY_NM, CODE_VAL, CODE_VAL_MEAN,
    CODE_VAL_REF1, CODE_VAL_REF2, CODE_VAL_REF3, CODE_VAL_REF4, CODE_VAL_REF5,
    CODE_VAL_DESC, CODE_VAL_REMARK, CODE_VER, SORT_SEQ
) as
select MASTER.CODE_ID, MASTER.CODE_NM, CATEGORY.CATEGORY_ID, CATEGORY.CATEGORY_NM,
       DETAIL.CODE_VAL, DETAIL.CODE_VAL_MEAN,
       DETAIL.CODE_VAL_REF1, DETAIL.CODE_VAL_REF2, DETAIL.CODE_VAL_REF3, DETAIL.CODE_VAL_REF4, DETAIL.CODE_VAL_REF5,
       DETAIL.CODE_VAL_DESC, DETAIL.CODE_VAL_REMARK, DETAIL.CODE_VER, DETAIL.SORT_SEQ
  from TB_MCM_CODE_MASTER MASTER, TB_MCM_CODE_CATEGORY CATEGORY, TB_MCM_CODE_DETAIL DETAIL
 where MASTER.USE_TP = 'Y'
   and MASTER.MASTER_CODE = CATEGORY.MASTER_CODE
   and MASTER.MASTER_CODE = DETAIL.MASTER_CODE
   and CATEGORY.CATEGORY_ID = DETAIL.CATEGORY_ID;
