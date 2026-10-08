-- ============================================================
-- V3: 예약 작업(JOB) 스케줄러 표 4개
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (docs/superpowers/specs/2026-10-08-job-scheduler-design.md §3):
--   각 모듈 앱(MCM·MDM·MPP·MLS·MQC·MPN)이 JOB 전용 연결로 MCMAPUSER. 접두를 붙여 읽고 쓴다.
--   - TB_MCM_JOB_DEF: 작업 정의(모듈별 crontab 한 줄 + 유형별 설정). OPTS_JSON 은 고급 설정(재시도·이어 실행, 설계 D12)
--   - TB_MCM_JOB_RUN: 실행 기록. 기본 키 (JOB_ID, SCHED_AT, TRIGGER_TP) INSERT 가 회차 선점이다.
--     TIMEOUT_SEC·VARS_JSON 은 그 회차에 적용한 값이다(정의가 나중에 바뀌어도 시간 초과 정리·이력이 정확하도록)
--   - TB_MCM_JOB_VER: 모듈별 정의 버전(앱이 폴링해 캐시를 갱신)
--   - TB_MCM_JOB_COLLECT_DATA: 수집(COLLECT) 유형 작업이 쌓는 값
-- ============================================================

create table TB_MCM_JOB_DEF (
    JOB_ID varchar2(60 char) not null,
    MODULE_CD varchar2(10 char) not null,
    JOB_NM varchar2(100 char) not null,
    JOB_KIND varchar2(10 char) not null,
    CRON_EXPR varchar2(100 char) not null,
    USE_YN char(1 char) default 'Y' not null,
    CONFIG_JSON clob,
    VARS_JSON clob,
    TIMEOUT_SEC number(6,0) not null,
    NEXT_RUN_AT timestamp(6),
    JOB_DESC varchar2(500 char),
    OWNER_TP varchar2(10 char) not null,
    CODE_SEEN_AT timestamp(6),
    OPTS_JSON clob,
    C_AT timestamp(6), C_USR_ID varchar2(100 char), C_PGM_ID varchar2(100 char), C_SVC_ID varchar2(100 char),
    U_AT timestamp(6), U_USR_ID varchar2(100 char), U_PGM_ID varchar2(100 char), U_SVC_ID varchar2(100 char),
    VER number(19,0) default 0 not null,
    constraint PK_TB_MCM_JOB_DEF primary key (JOB_ID),
    constraint CK_TB_MCM_JOB_DEF_USE check (USE_YN in ('Y','N')),
    constraint CK_TB_MCM_JOB_DEF_MOD check (MODULE_CD in ('MCM','MDM','MPP','MLS','MQC','MPN')),
    constraint CK_TB_MCM_JOB_DEF_KIND check (JOB_KIND in ('CODE','BPMN','QUERY','COLLECT','HTTP','PURGE')),
    constraint CK_TB_MCM_JOB_DEF_OWN check (OWNER_TP in ('CODE','USER'))
);
create index IX_TB_MCM_JOB_DEF_MOD on TB_MCM_JOB_DEF (MODULE_CD, USE_YN);

create table TB_MCM_JOB_RUN (
    JOB_ID varchar2(60 char) not null,
    SCHED_AT timestamp(0) not null,
    TRIGGER_TP char(1 char) not null,
    MODULE_CD varchar2(10 char) not null,
    SERVER_NM varchar2(100 char),
    STATUS varchar2(8 char) not null,
    STARTED_AT timestamp(6),
    ENDED_AT timestamp(6),
    TIMEOUT_SEC number(6,0),
    ITEM_CNT number(10,0),
    MSG varchar2(500 char),
    REQ_USR_ID varchar2(100 char),
    VARS_JSON clob,
    C_AT timestamp(6), C_USR_ID varchar2(100 char), C_PGM_ID varchar2(100 char), C_SVC_ID varchar2(100 char),
    U_AT timestamp(6), U_USR_ID varchar2(100 char), U_PGM_ID varchar2(100 char), U_SVC_ID varchar2(100 char),
    VER number(19,0) default 0 not null,
    constraint PK_TB_MCM_JOB_RUN primary key (JOB_ID, SCHED_AT, TRIGGER_TP),
    constraint CK_TB_MCM_JOB_RUN_TRG check (TRIGGER_TP in ('S','M')),
    constraint CK_TB_MCM_JOB_RUN_ST check (STATUS in ('REQ','RUN','OK','FAIL','SKIP','TIMEOUT'))
);
create index IX_TB_MCM_JOB_RUN_ST on TB_MCM_JOB_RUN (STATUS, STARTED_AT);
create index IX_TB_MCM_JOB_RUN_START on TB_MCM_JOB_RUN (STARTED_AT);
create index IX_TB_MCM_JOB_RUN_JOB on TB_MCM_JOB_RUN (JOB_ID, SCHED_AT desc);

create table TB_MCM_JOB_VER (
    MODULE_CD varchar2(10 char) not null,
    DEF_VER number(19,0) default 0 not null,
    constraint PK_TB_MCM_JOB_VER primary key (MODULE_CD)
);
insert into TB_MCM_JOB_VER (MODULE_CD, DEF_VER) values ('MCM', 0);
insert into TB_MCM_JOB_VER (MODULE_CD, DEF_VER) values ('MDM', 0);
insert into TB_MCM_JOB_VER (MODULE_CD, DEF_VER) values ('MPP', 0);
insert into TB_MCM_JOB_VER (MODULE_CD, DEF_VER) values ('MLS', 0);
insert into TB_MCM_JOB_VER (MODULE_CD, DEF_VER) values ('MQC', 0);
insert into TB_MCM_JOB_VER (MODULE_CD, DEF_VER) values ('MPN', 0);

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
