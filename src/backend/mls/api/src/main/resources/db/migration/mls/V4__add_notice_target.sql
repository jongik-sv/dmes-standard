-- ============================================================
-- V4: 공지 게시 대상(전체/역할) 추가
-- ============================================================
--
-- 배경:
--   공지를 "전체 사용자" 또는 "특정 역할(복수 선택)" 에게만 홈 화면(noticeBoard)에 보여 준다.
--   정본: docs/mls/design/noticeMgmt/noticeMgmt_기능설계서.md §4(D-010·D-011)·§12.
--
-- 왜 역할 그룹이 아니라 역할인가:
--   mls 가 요청 시점에 아는 사용자 정보는 BFF 가 실어 주는 X-Authenticated-Role 헤더뿐이고, 여기에는 JWT 의
--   역할 ID(mcm McmAuthService.loadUserRoles — 사용자 → 역할 그룹 → 역할을 펼친 결과)가 실린다. 역할 그룹 ID 는
--   토큰·헤더에 없고 TB_MCM_SEC_USER_MAPPING(mcm DB)에만 있다. mls 가 mcm DB 를 직접 읽지 않으려면 역할 단위가
--   요청 시점에 판정할 수 있는 유일한 단위다. 역할 그룹 대상은 "그 그룹의 역할들" 을 고르는 것으로 대신한다.
--
--   TARGET_SCOPE  ALL(전체 사용자, 기본) / ROLE(TB_MLS_NOTICE_TARGET 에 적힌 역할만)
--   TB_MLS_NOTICE_TARGET  공지 × 역할 ID. ROLE_ID 는 mcm TB_MCM_SEC_ROLE.ROLE_ID 값이다("ROLE_" 접두 없이).
--                         다른 DB 라 외래키는 걸 수 없다.
--
--   기존 행(V2 시드 포함)은 DEFAULT 'ALL' 을 받는다.
--
-- 대응: 공통 위치(db/migration/mls) 단일 파일. 방언 폴더 없음(mls 는 SQLite 한 벌).
-- ============================================================

ALTER TABLE TB_MLS_NOTICE ADD COLUMN TARGET_SCOPE VARCHAR(10) NOT NULL DEFAULT 'ALL';

-- audit 9 컬럼은 cactus-core CactusAuditEntity 가 소유한다 — 엔티티에 재선언하지 않으므로 DDL 에는 반드시 있어야 한다.
CREATE TABLE TB_MLS_NOTICE_TARGET (
    NOTICE_ID VARCHAR(30)  NOT NULL,
    ROLE_ID   VARCHAR(100) NOT NULL,
    C_USR_ID  VARCHAR(100),
    C_AT      TIMESTAMP,
    C_SVC_ID  VARCHAR(100),
    C_PGM_ID  VARCHAR(100),
    U_USR_ID  VARCHAR(100),
    U_AT      TIMESTAMP,
    U_SVC_ID  VARCHAR(100),
    U_PGM_ID  VARCHAR(100),
    VER       BIGINT,
    CONSTRAINT PK_TB_MLS_NOTICE_TARGET PRIMARY KEY (NOTICE_ID, ROLE_ID)
);

-- 홈 조회(noticeBoard)의 "사용자 역할이 대상에 있는가" EXISTS 를 받쳐 준다. NOTICE_ID 조회는 PK 가 받친다.
CREATE INDEX IX_TB_MLS_NOTICE_TARGET_ROLE ON TB_MLS_NOTICE_TARGET (ROLE_ID);
