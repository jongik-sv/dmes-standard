-- D-141 (2026-10-02) — 컬럼 사전의 도메인 필수 조건을 없앤다: TB_MDM_COLUMN.DOMAIN_ID 를 NULL 허용으로 바꾼다.
-- FK_TB_MDM_COLUMN_DOMAIN 은 남긴다 — 값이 있으면 여전히 있는 도메인이어야 한다(NULL 은 FK 검사 대상이 아니다).
--
-- SQLite 는 칼럼의 NOT NULL 을 바꿀 수 없어 표를 다시 만든다. V9(TB_MDM_DOMAIN)·V13(TB_MDM_RULE_VAR) 의 "새 표 → 복사 →
-- 옛 표 DROP → 개명" 순서는 쓰지 않는다. TB_MDM_COLUMN 은 자식 표 둘의 부모라서(TB_MDM_COLUMN_SYSTEM.COLUMN_ID V3,
-- TB_MDM_LAYOUT_ITEM.COLUMN_PHYS V4) 자식 행이 있으면 DROP 의 암묵 DELETE 가 FK 위반으로 실패한다(MdmDomainCodeFkRebuildTest B).
-- 로컬 DB 에는 컬럼 7천여 건과 그 매핑이 있으므로 그 순서로는 적용되지 않는다.
--
-- 그래서 이 파일은 다음과 같이 한다.
--   PRAGMA defer_foreign_keys = ON — 이 트랜잭션 안의 FK 검사를 커밋 때로 미룬다(커밋하면 저절로 꺼진다). Flyway 의 SQLite
--   파서는 이 PRAGMA 를 트랜잭션 문으로 보므로 같은 파일의 DDL 과 섞여도 된다(PRAGMA foreign_keys 는 트랜잭션 안에서 효과가
--   없고 Flyway 가 비트랜잭션 문으로 보아 거부한다 — V13 주석).
--   ① 행과 AUTOINCREMENT 상한을 제약 없는 임시 표에 옮긴다(칼럼 이름을 모두 적는다 — flyway-migration-add §7).
--   ② 옛 표를 DROP 한다. 자식 행이 고아가 되며 미뤄 둔 FK 위반 수가 늘어난다(CASCADE 는 어디에도 없어 자식 행은 그대로다).
--   ③ 같은 이름으로 새 표를 만든다. V3 정의를 글자 그대로 옮기고 DOMAIN_ID 의 NOT NULL 만 뺀다(제약 이름·순서 그대로).
--   ④ 인덱스를 먼저 만든다. TB_MDM_LAYOUT_ITEM 의 FK 가 PHYS_NAME 을 가리키므로 유일 인덱스 없이 부모에 쓰면
--      "foreign key mismatch" 가 난다.
--   ⑤ 행을 되돌려 넣는다. 부모 행이 다시 생길 때마다 SQLite 가 미뤄 둔 위반 수를 줄이므로 커밋 때 0 이 된다.
--      옛 표를 _OLD 로 개명하는 방식은 쓰지 않는다 — 요즘 SQLite 는 개명할 때 자식 표의 FK 글자도 _OLD 로 고쳐 쓴다.
--   ⑥ AUTOINCREMENT 상한을 되살린다(지운 최댓값 ID 를 다시 쓰지 않게 — V9 ③ 과 같은 규칙). ⑦ 임시 표를 지운다.
-- Flyway 기본 동작대로 이 파일 전체가 한 트랜잭션이라 어디서 실패하든 V16 전체가 롤백된다.
-- 검증: MdmColumnDomainOptionalMigrationTest(자식 행이 있는 DB 에서 행·칼럼·인덱스·FK·자식 FK·상한 보존).

PRAGMA defer_foreign_keys = ON;

-- ① 행·상한 옮기기
CREATE TABLE TB_MDM_COLUMN_V16_ROWS AS
SELECT COLUMN_ID, COLUMN_NAME, LABEL_LONG, LABEL_MID, LABEL_SHORT, PHYS_NAME, DESCRIPTION, DOMAIN_ID, REQUIRED,
    DEFAULT_VALUE, REF_KIND, REF_TARGET, REF_CATE_ID, TERM_IDS, USAGE_NOTE, CHG_SEQ,
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER
FROM TB_MDM_COLUMN;

CREATE TABLE TB_MDM_COLUMN_V16_SEQ AS
SELECT seq FROM sqlite_sequence WHERE name = 'TB_MDM_COLUMN';

-- ② 옛 표 지우기(인덱스도 함께 지워진다)
DROP TABLE TB_MDM_COLUMN;

-- ③ 새 표 — V3 정의에서 DOMAIN_ID 의 NOT NULL 만 뺐다
CREATE TABLE TB_MDM_COLUMN (
    COLUMN_ID INTEGER CONSTRAINT PK_TB_MDM_COLUMN PRIMARY KEY AUTOINCREMENT,
    COLUMN_NAME TEXT NOT NULL,
    LABEL_LONG TEXT,
    LABEL_MID TEXT,
    LABEL_SHORT TEXT,
    PHYS_NAME VARCHAR(50) NOT NULL,
    DESCRIPTION TEXT,
    DOMAIN_ID INTEGER,
    REQUIRED INTEGER NOT NULL DEFAULT 0,
    DEFAULT_VALUE VARCHAR(50),
    REF_KIND VARCHAR(20),
    REF_TARGET VARCHAR(50),
    REF_CATE_ID VARCHAR(50),
    TERM_IDS TEXT CONSTRAINT CK_TB_MDM_COLUMN_TERM_IDS_JSON CHECK (TERM_IDS IS NULL OR json_valid(TERM_IDS)),
    USAGE_NOTE TEXT,
    CHG_SEQ INTEGER NOT NULL DEFAULT 0,
    C_USR_ID VARCHAR(100),
    C_AT TIMESTAMP,
    C_SVC_ID VARCHAR(100),
    C_PGM_ID VARCHAR(100),
    U_USR_ID VARCHAR(100),
    U_AT TIMESTAMP,
    U_SVC_ID VARCHAR(100),
    U_PGM_ID VARCHAR(100),
    VER BIGINT,
    CONSTRAINT FK_TB_MDM_COLUMN_DOMAIN FOREIGN KEY (DOMAIN_ID) REFERENCES TB_MDM_DOMAIN (DOMAIN_ID),
    CONSTRAINT CK_TB_MDM_COLUMN_REQUIRED CHECK (REQUIRED IN (0,1))
);

-- ④ 인덱스(행보다 먼저)
CREATE UNIQUE INDEX UX_TB_MDM_COLUMN_NAME ON TB_MDM_COLUMN (COLUMN_NAME);
CREATE UNIQUE INDEX UX_TB_MDM_COLUMN_PHYS_NAME ON TB_MDM_COLUMN (PHYS_NAME);

-- ⑤ 행 되돌리기
INSERT INTO TB_MDM_COLUMN (COLUMN_ID, COLUMN_NAME, LABEL_LONG, LABEL_MID, LABEL_SHORT, PHYS_NAME, DESCRIPTION, DOMAIN_ID, REQUIRED,
    DEFAULT_VALUE, REF_KIND, REF_TARGET, REF_CATE_ID, TERM_IDS, USAGE_NOTE, CHG_SEQ,
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER)
SELECT COLUMN_ID, COLUMN_NAME, LABEL_LONG, LABEL_MID, LABEL_SHORT, PHYS_NAME, DESCRIPTION, DOMAIN_ID, REQUIRED,
    DEFAULT_VALUE, REF_KIND, REF_TARGET, REF_CATE_ID, TERM_IDS, USAGE_NOTE, CHG_SEQ,
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER
FROM TB_MDM_COLUMN_V16_ROWS
ORDER BY COLUMN_ID;

-- ⑥ AUTOINCREMENT 상한 되살리기. ⑤ 가 행을 넣었으면 새 표 행이 이미 있으므로 더 클 때만 올리고, 없으면(남은 행이 없었으면) 넣는다.
INSERT INTO sqlite_sequence (name, seq)
SELECT 'TB_MDM_COLUMN', seq FROM TB_MDM_COLUMN_V16_SEQ
WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'TB_MDM_COLUMN');
UPDATE sqlite_sequence
SET seq = (SELECT seq FROM TB_MDM_COLUMN_V16_SEQ)
WHERE name = 'TB_MDM_COLUMN'
  AND seq < (SELECT seq FROM TB_MDM_COLUMN_V16_SEQ);

-- ⑦ 임시 표 지우기
DROP TABLE TB_MDM_COLUMN_V16_ROWS;
DROP TABLE TB_MDM_COLUMN_V16_SEQ;
