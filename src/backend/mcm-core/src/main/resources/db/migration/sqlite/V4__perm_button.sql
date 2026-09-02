-- mcm-core V4__perm_button.sql — 권한별 버튼+엔드포인트 매핑 + OBJ default_actions
-- mui 호환 권한 모델: 화면(OBJ) 단위 권한(PERM) 안에 버튼(SEARCH/SAVE/...) 별 endpoint 매핑
-- 라이브러리화 정책: 스키마만 mcm-core 가 제공. endpoint 시드는 db/seed/oasis 옵션 시드.

-- ============================================================
--  OBJ default_actions — 화면 생성 시 PERM 자동 채우기 템플릿
--  JSON 배열 예: [{"action":"SEARCH","label":"조회","endpoint":"/oasis/secUser/search"}, ...]
--  endpoint 형식은 사이트 정책 (OASIS / REST 무관 — 데이터일 뿐)
-- ============================================================

ALTER TABLE TB_SEC_OBJ ADD COLUMN DEFAULT_ACTIONS_JSON TEXT;

-- ============================================================
--  TB_SEC_PERM_BUTTON — PERM 1 : N 버튼 매핑
--  ACTION: 시멘틱 키 (SEARCH/SAVE/DELETE/EXPORT/PRINT 등 — 사이트 자유 정의)
--  ENDPOINT: HTTP 매칭 패턴 (Ant-style: /oasis/secUser/save, /api/users/* 등)
--  HTTP_METHOD: GET / POST / PUT / DELETE / * (와일드카드 허용)
-- ============================================================

CREATE TABLE IF NOT EXISTS TB_SEC_PERM_BUTTON (
    PERM_BUTTON_ID TEXT PRIMARY KEY,
    PERM_ID        TEXT NOT NULL,
    ACTION         TEXT NOT NULL,
    ACTION_LABEL   TEXT,
    ENDPOINT       TEXT,
    HTTP_METHOD    TEXT DEFAULT '*',
    SORT_ORD       INTEGER DEFAULT 0,
    USE_YN         TEXT DEFAULT 'Y',
    C_USR_ID       TEXT, C_AT TEXT, C_SVC_ID TEXT, C_PGM_ID TEXT,
    U_USR_ID       TEXT, U_AT TEXT, U_SVC_ID TEXT, U_PGM_ID TEXT,
    VER            INTEGER
);

CREATE INDEX IF NOT EXISTS IDX_SEC_PERM_BTN_PERM     ON TB_SEC_PERM_BUTTON(PERM_ID);
CREATE INDEX IF NOT EXISTS IDX_SEC_PERM_BTN_ENDPOINT ON TB_SEC_PERM_BUTTON(ENDPOINT);
