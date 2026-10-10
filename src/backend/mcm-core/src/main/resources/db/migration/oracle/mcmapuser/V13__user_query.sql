-- ============================================================
-- V13: 공용 쿼리 조회 표 2개
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (docs/superpowers/specs/2026-10-10-user-query-program-design.md §2):
--   TB_MCM_USRQ_DEF: 공용 쿼리 정의. 관리자가 SQL·입력 정의(PARAMS_JSON)·출력 정의(COLUMNS_JSON)·최대 행을 등록한다.
--   TB_MCM_USRQ_ASSIGN: 정의-사용자 할당. 키 (QUERY_ID, USER_ID), 사용자 단위만.
--   외래 키는 두지 않는다(기준선·V2~V12 에 없다). 정의 삭제는 서비스가 할당을 먼저 지운다.
--   없는 사용자의 할당은 할당 탭이 「없는 사용자」로 보인다.
--   IX_TB_MCM_USRQ_ASSIGN_USER 는 사용자 목록(myList)의 USER_ID 조건에 쓴다.

create table TB_MCM_USRQ_DEF (
    QUERY_ID varchar2(40 char) not null,
    QUERY_NM varchar2(100 char) not null,
    CATEGORY_CD varchar2(20 char),
    QUERY_DESC varchar2(500 char),
    OWNER_DEPT_CD varchar2(10 char),
    SQL_TEXT clob not null,
    PARAMS_JSON clob,
    COLUMNS_JSON clob,
    MAX_ROW_CNT number(6,0) default 1000 not null,
    USE_YN char(1 char) default 'Y' not null,
    C_AT timestamp(6), C_USR_ID varchar2(100 char), C_PGM_ID varchar2(100 char), C_SVC_ID varchar2(100 char),
    U_AT timestamp(6), U_USR_ID varchar2(100 char), U_PGM_ID varchar2(100 char), U_SVC_ID varchar2(100 char),
    VER number(19,0) default 0 not null,
    constraint PK_TB_MCM_USRQ_DEF primary key (QUERY_ID),
    constraint CK_TB_MCM_USRQ_DEF_USE check (USE_YN in ('Y','N')),
    constraint CK_TB_MCM_USRQ_DEF_MAX check (MAX_ROW_CNT between 1 and 5000)
);

create table TB_MCM_USRQ_ASSIGN (
    QUERY_ID varchar2(40 char) not null,
    USER_ID varchar2(30 char) not null,
    C_AT timestamp(6), C_USR_ID varchar2(100 char), C_PGM_ID varchar2(100 char), C_SVC_ID varchar2(100 char),
    U_AT timestamp(6), U_USR_ID varchar2(100 char), U_PGM_ID varchar2(100 char), U_SVC_ID varchar2(100 char),
    VER number(19,0) default 0 not null,
    constraint PK_TB_MCM_USRQ_ASSIGN primary key (QUERY_ID, USER_ID)
);
create index IX_TB_MCM_USRQ_ASSIGN_USER on TB_MCM_USRQ_ASSIGN (USER_ID, QUERY_ID);

COMMENT ON TABLE TB_MCM_USRQ_DEF IS '공용 쿼리 정의';
COMMENT ON COLUMN TB_MCM_USRQ_DEF.QUERY_ID IS '쿼리 ID';
COMMENT ON COLUMN TB_MCM_USRQ_DEF.QUERY_NM IS '쿼리 이름';
COMMENT ON COLUMN TB_MCM_USRQ_DEF.CATEGORY_CD IS '분류';
COMMENT ON COLUMN TB_MCM_USRQ_DEF.QUERY_DESC IS '설명';
COMMENT ON COLUMN TB_MCM_USRQ_DEF.OWNER_DEPT_CD IS '담당 부서 코드';
COMMENT ON COLUMN TB_MCM_USRQ_DEF.SQL_TEXT IS '조회 SQL';
COMMENT ON COLUMN TB_MCM_USRQ_DEF.PARAMS_JSON IS '입력 정의(JSON)';
COMMENT ON COLUMN TB_MCM_USRQ_DEF.COLUMNS_JSON IS '출력 정의(JSON)';
COMMENT ON COLUMN TB_MCM_USRQ_DEF.MAX_ROW_CNT IS '최대 행 수';
COMMENT ON COLUMN TB_MCM_USRQ_DEF.USE_YN IS '사용 여부';
COMMENT ON COLUMN TB_MCM_USRQ_DEF.C_AT IS '생성일시';
COMMENT ON COLUMN TB_MCM_USRQ_DEF.C_USR_ID IS '생성자 아이디';
COMMENT ON COLUMN TB_MCM_USRQ_DEF.C_PGM_ID IS '생성 프로그램 아이디';
COMMENT ON COLUMN TB_MCM_USRQ_DEF.C_SVC_ID IS '생성 서비스 아이디';
COMMENT ON COLUMN TB_MCM_USRQ_DEF.U_AT IS '수정일시';
COMMENT ON COLUMN TB_MCM_USRQ_DEF.U_USR_ID IS '수정자 아이디';
COMMENT ON COLUMN TB_MCM_USRQ_DEF.U_PGM_ID IS '수정 프로그램 아이디';
COMMENT ON COLUMN TB_MCM_USRQ_DEF.U_SVC_ID IS '수정 서비스 아이디';
COMMENT ON COLUMN TB_MCM_USRQ_DEF.VER IS '버전';

COMMENT ON TABLE TB_MCM_USRQ_ASSIGN IS '공용 쿼리 할당';
COMMENT ON COLUMN TB_MCM_USRQ_ASSIGN.QUERY_ID IS '쿼리 ID';
COMMENT ON COLUMN TB_MCM_USRQ_ASSIGN.USER_ID IS '사용자 ID';
COMMENT ON COLUMN TB_MCM_USRQ_ASSIGN.C_AT IS '생성일시';
COMMENT ON COLUMN TB_MCM_USRQ_ASSIGN.C_USR_ID IS '생성자 아이디';
COMMENT ON COLUMN TB_MCM_USRQ_ASSIGN.C_PGM_ID IS '생성 프로그램 아이디';
COMMENT ON COLUMN TB_MCM_USRQ_ASSIGN.C_SVC_ID IS '생성 서비스 아이디';
COMMENT ON COLUMN TB_MCM_USRQ_ASSIGN.U_AT IS '수정일시';
COMMENT ON COLUMN TB_MCM_USRQ_ASSIGN.U_USR_ID IS '수정자 아이디';
COMMENT ON COLUMN TB_MCM_USRQ_ASSIGN.U_PGM_ID IS '수정 프로그램 아이디';
COMMENT ON COLUMN TB_MCM_USRQ_ASSIGN.U_SVC_ID IS '수정 서비스 아이디';
COMMENT ON COLUMN TB_MCM_USRQ_ASSIGN.VER IS '버전';
