-- 공지사항 (noticeMgmt 화면 owner) 초기 스키마.
--
-- 정본: docs/mls/design/noticeMgmt/noticeMgmt_기능설계서.md §3.2 / §4 / §10
--
-- 테이블명은 대문자 TB_MLS_NOTICE 다. 식별자 사전 A.12.6 정규식은 lowercase 를 강제하지만
-- mls 기 등재 자산(TB_MLS_SL_LOC / TB_MLS_MOVE_TYPE)과 mcm(TB_MCM_SEC_*)이 모두 대문자이고
-- mcm-reference.md:33 이 대문자 보존을 정본으로 못박고 있어 실자산 관행을 따랐다
-- (기능설계서 §11.1 GAP-002 등재).
--
-- audit 9 컬럼은 cactus-core CactusAuditEntity 가 소유한다 — 엔티티에 재선언하지 않으므로
-- DDL 에는 반드시 있어야 한다.
CREATE TABLE TB_MLS_NOTICE (
    NOTICE_ID     VARCHAR(30)   NOT NULL,
    TITLE         VARCHAR(200)  NOT NULL,
    CONTENT       VARCHAR(4000),
    NOTICE_STATUS VARCHAR(10)   NOT NULL,
    POST_START_DT DATE,
    POST_END_DT   DATE,
    C_USR_ID      VARCHAR(100),
    C_AT          TIMESTAMP,
    C_SVC_ID      VARCHAR(100),
    C_PGM_ID      VARCHAR(100),
    U_USR_ID      VARCHAR(100),
    U_AT          TIMESTAMP,
    U_SVC_ID      VARCHAR(100),
    U_PGM_ID      VARCHAR(100),
    VER           BIGINT,
    CONSTRAINT PK_TB_MLS_NOTICE PRIMARY KEY (NOTICE_ID)
);

-- 조회조건 S-002(게시상태) + 목록 기본 정렬을 받쳐 준다.
CREATE INDEX IX_TB_MLS_NOTICE_STATUS ON TB_MLS_NOTICE (NOTICE_STATUS);

-- 초기 확인용 시드 3건 — 세 가지 게시상태(LV-001)를 모두 덮어 화면 진입 즉시 상태별 표시와
-- 버튼 활성 규칙(§7.4)을 눈으로 검증할 수 있게 한다.
-- POST_START_DT / POST_END_DT 는 SQLite 에서 문자열(ISO)로 저장된다
-- (mcm-core SqliteTemporalConverterContributor 의 LocalDate 컨버터 규약과 동일 형식).
INSERT INTO TB_MLS_NOTICE
    (NOTICE_ID, TITLE, CONTENT, NOTICE_STATUS, POST_START_DT, POST_END_DT,
     C_USR_ID, C_SVC_ID, C_PGM_ID, U_USR_ID, U_SVC_ID, U_PGM_ID, VER)
VALUES
    ('NT202609030001', '시스템 정기 점검 안내',
     '매월 첫째 주 토요일 02:00~04:00 정기 점검이 진행됩니다.',
     'POSTED', '2026-09-01', '2026-12-31',
     'admin', 'flyway', 'V2__create_notice', 'admin', 'flyway', 'V2__create_notice', 0),
    ('NT202609030002', '물류 창고 이전 공지',
     '3공장 자재 창고가 A동에서 B동으로 이전됩니다.',
     'STOPPED', '2026-08-01', '2026-08-31',
     'admin', 'flyway', 'V2__create_notice', 'admin', 'flyway', 'V2__create_notice', 0),
    ('NT202609030003', '(작성중) 연말 재고실사 일정',
     '일정 확정 후 게시 예정.',
     'DRAFT', NULL, NULL,
     'admin', 'flyway', 'V2__create_notice', 'admin', 'flyway', 'V2__create_notice', 0);
