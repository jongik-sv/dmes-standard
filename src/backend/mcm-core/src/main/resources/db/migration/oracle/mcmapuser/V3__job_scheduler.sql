-- ============================================================
-- V3: 예약 작업(JOB) 스케줄러 표 4개
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (docs/superpowers/specs/2026-10-08-job-scheduler-design.md §3):
--   MCM 앱이 매분 색인 조회로 실행할 작업을 판정·선점하고(JOB_DEF·JOB_RUN), 각 모듈 앱의 진입점이 자기 모듈 사용자
--   (MDMAPUSER 등)로 접속해 MCMAPUSER. 접두를 붙여 실행 결과(JOB_RUN)·수집 값(JOB_COLLECT_DATA)·코드 작업 등록
--   (JOB_DEF·JOB_HANDLER)을 직접 쓴다. 그래서 끝에 모듈 사용자 5명에게 최소 권한(DELETE 없음)을 GRANT 한다.
--   - TB_MCM_JOB_DEF: 작업 정의. SERVICE_ID 가 실제 실행할 OASIS 서비스 ID 이고 JOB_KIND 는 화면 입력 양식이다.
--   - TB_MCM_JOB_RUN: 실행 기록. PK (JOB_ID, SCHED_AT, TRIGGER_TP) INSERT 가 회차 선점의 이중 안전장치이고 RUN_ID 는 호출·결과의 키다.
--   - TB_MCM_JOB_COLLECT_DATA: 수집(COLLECT) 작업이 쌓는 값.
--   - TB_MCM_JOB_HANDLER: 코드 작업 처리기 목록(모듈 앱이 기동할 때 등록).
--   SCHED_AT 만 TIMESTAMP(0) 이다(소수 초를 반올림하므로 넣기 전에 초 단위로 버린다). 나머지 시각 칸은 TIMESTAMP(6) KST.

create table TB_MCM_JOB_DEF (
    JOB_ID varchar2(60 char) not null,
    MODULE_CD varchar2(10 char) not null,
    JOB_NM varchar2(100 char) not null,
    JOB_KIND varchar2(10 char) not null,
    SERVICE_ID varchar2(200 char) not null,
    ACTION varchar2(50 char) not null,
    CRON_EXPR varchar2(100 char) not null,
    USE_YN char(1 char) default 'Y' not null,
    CONFIG_JSON clob,
    VARS_JSON clob,
    TIMEOUT_SEC number(6,0) not null,
    NEXT_RUN_AT timestamp(6),
    JOB_DESC varchar2(500 char),
    OWNER_TP varchar2(10 char) not null,
    OPTS_JSON clob,
    C_AT timestamp(6), C_USR_ID varchar2(100 char), C_PGM_ID varchar2(100 char), C_SVC_ID varchar2(100 char),
    U_AT timestamp(6), U_USR_ID varchar2(100 char), U_PGM_ID varchar2(100 char), U_SVC_ID varchar2(100 char),
    VER number(19,0) default 0 not null,
    constraint PK_TB_MCM_JOB_DEF primary key (JOB_ID),
    constraint CK_TB_MCM_JOB_DEF_USE check (USE_YN in ('Y','N')),
    constraint CK_TB_MCM_JOB_DEF_MOD check (MODULE_CD in ('MCM','MDM','MPP','MLS','MQC','MPN')),
    constraint CK_TB_MCM_JOB_DEF_KIND check (JOB_KIND in ('CODE','BPMN','QUERY','COLLECT')),
    constraint CK_TB_MCM_JOB_DEF_OWN check (OWNER_TP in ('CODE','USER'))
);
create index IX_TB_MCM_JOB_DEF_MOD on TB_MCM_JOB_DEF (MODULE_CD, USE_YN);
create index IX_TB_MCM_JOB_DEF_DUE on TB_MCM_JOB_DEF (USE_YN, NEXT_RUN_AT);

create table TB_MCM_JOB_RUN (
    JOB_ID varchar2(60 char) not null,
    SCHED_AT timestamp(0) not null,
    TRIGGER_TP char(1 char) not null,
    RUN_ID varchar2(36 char) not null,
    MODULE_CD varchar2(10 char) not null,
    SERVICE_ID varchar2(200 char) not null,
    SERVER_NM varchar2(100 char),
    SERVICE_TAG varchar2(40 char),
    STATUS varchar2(8 char) not null,
    STARTED_AT timestamp(6),
    ENDED_AT timestamp(6),
    ITEM_CNT number(10,0),
    MSG varchar2(500 char),
    REQ_USR_ID varchar2(100 char),
    TIMEOUT_SEC number(6,0),
    VARS_JSON clob,
    C_AT timestamp(6), C_USR_ID varchar2(100 char), C_PGM_ID varchar2(100 char), C_SVC_ID varchar2(100 char),
    U_AT timestamp(6), U_USR_ID varchar2(100 char), U_PGM_ID varchar2(100 char), U_SVC_ID varchar2(100 char),
    VER number(19,0) default 0 not null,
    constraint PK_TB_MCM_JOB_RUN primary key (JOB_ID, SCHED_AT, TRIGGER_TP),
    constraint UQ_TB_MCM_JOB_RUN_RUNID unique (RUN_ID),
    constraint CK_TB_MCM_JOB_RUN_TRG check (TRIGGER_TP in ('S','M')),
    constraint CK_TB_MCM_JOB_RUN_ST check (STATUS in ('RUN','OK','FAIL','SKIP','TIMEOUT'))
);
create index IX_TB_MCM_JOB_RUN_ST on TB_MCM_JOB_RUN (STATUS, STARTED_AT);
create index IX_TB_MCM_JOB_RUN_START on TB_MCM_JOB_RUN (STARTED_AT);
create index IX_TB_MCM_JOB_RUN_JOB on TB_MCM_JOB_RUN (JOB_ID, SCHED_AT desc);

create table TB_MCM_JOB_COLLECT_DATA (
    JOB_ID varchar2(60 char) not null,
    SLOT varchar2(12 char) not null,
    ITEM_KEY varchar2(100 char) not null,
    VALUE_NUM number(24,8),
    VALUE_TXT varchar2(200 char),
    C_AT timestamp(6), C_USR_ID varchar2(100 char), C_PGM_ID varchar2(100 char), C_SVC_ID varchar2(100 char),
    U_AT timestamp(6), U_USR_ID varchar2(100 char), U_PGM_ID varchar2(100 char), U_SVC_ID varchar2(100 char),
    VER number(19,0) default 0 not null,
    constraint PK_TB_MCM_JOB_COLLECT_DATA primary key (JOB_ID, SLOT, ITEM_KEY)
);
create index IX_TB_MCM_JOB_CDATA_SLOT on TB_MCM_JOB_COLLECT_DATA (SLOT);

create table TB_MCM_JOB_HANDLER (
    HANDLER_ID varchar2(60 char) not null,
    MODULE_CD varchar2(10 char) not null,
    HANDLER_NM varchar2(100 char) not null,
    DEFAULT_CRON varchar2(100 char),
    VARS_JSON clob,
    SEEN_AT timestamp(6),
    C_AT timestamp(6), C_USR_ID varchar2(100 char), C_PGM_ID varchar2(100 char), C_SVC_ID varchar2(100 char),
    U_AT timestamp(6), U_USR_ID varchar2(100 char), U_PGM_ID varchar2(100 char), U_SVC_ID varchar2(100 char),
    VER number(19,0) default 0 not null,
    constraint PK_TB_MCM_JOB_HANDLER primary key (HANDLER_ID),
    constraint CK_TB_MCM_JOB_HANDLER_MOD check (MODULE_CD in ('MCM','MDM','MPP','MLS','MQC','MPN'))
);

-- 모듈 앱(MDM·MPP·MLS·MQC·MPN)은 자기 스키마 사용자로 접속한다 — 표 주인(MCMAPUSER)으로 실행되는 이 파일이 최소 권한을 준다(DELETE 없음).
grant select, update on TB_MCM_JOB_RUN to MDMAPUSER, MPPAPUSER, MLSAPUSER, MQCAPUSER, MPNAPUSER;
grant select, insert, update on TB_MCM_JOB_COLLECT_DATA to MDMAPUSER, MPPAPUSER, MLSAPUSER, MQCAPUSER, MPNAPUSER;
grant select, insert, update on TB_MCM_JOB_DEF to MDMAPUSER, MPPAPUSER, MLSAPUSER, MQCAPUSER, MPNAPUSER;
grant select, insert, update on TB_MCM_JOB_HANDLER to MDMAPUSER, MPPAPUSER, MLSAPUSER, MQCAPUSER, MPNAPUSER;
