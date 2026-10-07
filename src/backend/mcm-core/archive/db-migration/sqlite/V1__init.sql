-- mcm-core V1__init.sql — 권한관리·메뉴·즐겨찾기·마스터코드 본체 스키마 (SQLite)
-- 사이트 특이 테이블은 사이트가 V100__site.sql 로 별도 추가.
-- 감사 컬럼은 cactus CactusAuditEntity 와 동일 (C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_*, VER).

-- ============================================================
--  권한 (role / perm / role_perm / obj)
-- ============================================================

CREATE TABLE IF NOT EXISTS TB_SEC_OBJ (
    OBJ_ID       TEXT PRIMARY KEY,
    OBJ_NM       TEXT,
    OBJ_NO       TEXT,
    OBJ_TYPE     TEXT,
    SYS_CD       TEXT,
    SUB_SYS_CD   TEXT,
    USE_YN       TEXT DEFAULT 'Y',
    DESCRIPTION  TEXT,
    C_USR_ID     TEXT, C_AT TEXT, C_SVC_ID TEXT, C_PGM_ID TEXT,
    U_USR_ID     TEXT, U_AT TEXT, U_SVC_ID TEXT, U_PGM_ID TEXT,
    VER          INTEGER
);

CREATE TABLE IF NOT EXISTS TB_SEC_ROLE (
    ROLE_ID      TEXT PRIMARY KEY,
    ROLE_NM      TEXT,
    ROLE_NO      TEXT,
    DESCRIPTION  TEXT,
    USE_YN       TEXT DEFAULT 'Y',
    C_USR_ID     TEXT, C_AT TEXT, C_SVC_ID TEXT, C_PGM_ID TEXT,
    U_USR_ID     TEXT, U_AT TEXT, U_SVC_ID TEXT, U_PGM_ID TEXT,
    VER          INTEGER
);

CREATE TABLE IF NOT EXISTS TB_SEC_PERM (
    PERM_ID      TEXT PRIMARY KEY,
    PERM_NM      TEXT,
    PERM_NO      TEXT,
    PERM_SCRIPT  TEXT,
    VIEW_PERM    TEXT,
    OBJ_ID       TEXT,
    C_USR_ID     TEXT, C_AT TEXT, C_SVC_ID TEXT, C_PGM_ID TEXT,
    U_USR_ID     TEXT, U_AT TEXT, U_SVC_ID TEXT, U_PGM_ID TEXT,
    VER          INTEGER
);

CREATE TABLE IF NOT EXISTS TB_SEC_ROLE_PERM (
    ROLE_PERM_ID TEXT PRIMARY KEY,
    ROLE_ID      TEXT,
    PERM_ID      TEXT,
    C_USR_ID     TEXT, C_AT TEXT, C_SVC_ID TEXT, C_PGM_ID TEXT,
    U_USR_ID     TEXT, U_AT TEXT, U_SVC_ID TEXT, U_PGM_ID TEXT,
    VER          INTEGER
);

-- ============================================================
--  메뉴 (menu / menu_log)
-- ============================================================

CREATE TABLE IF NOT EXISTS TB_SEC_MENU (
    MENU_ID         TEXT PRIMARY KEY,
    MENU_NM         TEXT,
    MENU_TYPE       TEXT,
    MENU_SET        TEXT,
    LV              INTEGER,
    UPR_LV_MENU_ID  TEXT,
    OBJ_ID          TEXT,
    SERVICE_URL     TEXT,
    PARAM           TEXT,
    SQ              TEXT,
    ROW_SEQ         INTEGER,
    HIDDEN_YN       TEXT,
    USE_YN          TEXT DEFAULT 'Y',
    C_USR_ID        TEXT, C_AT TEXT, C_SVC_ID TEXT, C_PGM_ID TEXT,
    U_USR_ID        TEXT, U_AT TEXT, U_SVC_ID TEXT, U_PGM_ID TEXT,
    VER             INTEGER
);

CREATE TABLE IF NOT EXISTS TB_SEC_MENU_LOG (
    ID            TEXT PRIMARY KEY,
    MENU_ID       TEXT,
    MENU_NM       TEXT,
    USE_USER_ID   TEXT,
    USE_USER_NM   TEXT,
    USE_DATE_TIME TEXT,
    C_USR_ID      TEXT, C_AT TEXT, C_SVC_ID TEXT, C_PGM_ID TEXT,
    U_USR_ID      TEXT, U_AT TEXT, U_SVC_ID TEXT, U_PGM_ID TEXT,
    VER           INTEGER
);

-- ============================================================
--  사용자-롤 매핑 (사용자 본체는 cactus-core 의 TB_SEC_USER 또는 사이트 결정)
-- ============================================================

CREATE TABLE IF NOT EXISTS TB_SEC_USER_ROLE (
    USER_ROLE_ID TEXT PRIMARY KEY,
    USER_ID      TEXT,
    ROLE_ID      TEXT,
    C_USR_ID     TEXT, C_AT TEXT, C_SVC_ID TEXT, C_PGM_ID TEXT,
    U_USR_ID     TEXT, U_AT TEXT, U_SVC_ID TEXT, U_PGM_ID TEXT,
    VER          INTEGER
);

CREATE TABLE IF NOT EXISTS TB_SEC_USER_PW_HIS (
    ID           TEXT PRIMARY KEY,
    USER_ID      TEXT,
    USER_NO      TEXT,
    USER_PASS    TEXT,
    PASS_SET_DD  TEXT,
    C_USR_ID     TEXT, C_AT TEXT, C_SVC_ID TEXT, C_PGM_ID TEXT,
    U_USR_ID     TEXT, U_AT TEXT, U_SVC_ID TEXT, U_PGM_ID TEXT,
    VER          INTEGER
);

-- ============================================================
--  즐겨찾기 (favorite_menu — 폴더 컬럼 포함)
-- ============================================================

CREATE TABLE IF NOT EXISTS TB_SEC_FAVORITE_MENU (
    ID            TEXT PRIMARY KEY,
    USER_ID       TEXT,
    MENU_ID       TEXT,
    FVT_FOLD_ID   TEXT,
    FVT_FOLD_NM   TEXT,
    FVT_FOLD_SEQ  INTEGER,
    FVT_SEQ       INTEGER,
    LVL           INTEGER,
    FULL_ID       TEXT,
    FORM_URL      TEXT,
    SERVICE_URL   TEXT,
    MENU_SEQ      INTEGER,
    PARENT_FOLD   TEXT,
    C_USR_ID      TEXT, C_AT TEXT, C_SVC_ID TEXT, C_PGM_ID TEXT,
    U_USR_ID      TEXT, U_AT TEXT, U_SVC_ID TEXT, U_PGM_ID TEXT,
    VER           INTEGER
);

-- ============================================================
--  마스터코드 (Phase 3)
-- ============================================================

CREATE TABLE IF NOT EXISTS TB_SEC_CODE_GROUP (
    GROUP_CD     TEXT PRIMARY KEY,
    GROUP_NM     TEXT,
    GROUP_DESC   TEXT,
    USE_YN       TEXT DEFAULT 'Y',
    C_USR_ID     TEXT, C_AT TEXT, C_SVC_ID TEXT, C_PGM_ID TEXT,
    U_USR_ID     TEXT, U_AT TEXT, U_SVC_ID TEXT, U_PGM_ID TEXT,
    VER          INTEGER
);

CREATE TABLE IF NOT EXISTS TB_SEC_CODE_ITEM (
    GROUP_CD     TEXT NOT NULL,
    ITEM_CD      TEXT NOT NULL,
    ITEM_NM      TEXT,
    ITEM_DESC    TEXT,
    SORT_ORD     INTEGER DEFAULT 0,
    EXTRA_VAL1   TEXT,
    EXTRA_VAL2   TEXT,
    USE_YN       TEXT DEFAULT 'Y',
    C_USR_ID     TEXT, C_AT TEXT, C_SVC_ID TEXT, C_PGM_ID TEXT,
    U_USR_ID     TEXT, U_AT TEXT, U_SVC_ID TEXT, U_PGM_ID TEXT,
    VER          INTEGER,
    PRIMARY KEY (GROUP_CD, ITEM_CD)
);

CREATE INDEX IF NOT EXISTS IDX_SEC_PERM_OBJ        ON TB_SEC_PERM(OBJ_ID);
CREATE INDEX IF NOT EXISTS IDX_SEC_MENU_UPR        ON TB_SEC_MENU(UPR_LV_MENU_ID);
CREATE INDEX IF NOT EXISTS IDX_SEC_MENU_OBJ        ON TB_SEC_MENU(OBJ_ID);
CREATE INDEX IF NOT EXISTS IDX_SEC_FAV_USER        ON TB_SEC_FAVORITE_MENU(USER_ID);
CREATE INDEX IF NOT EXISTS IDX_SEC_USERROLE_USER   ON TB_SEC_USER_ROLE(USER_ID);
CREATE INDEX IF NOT EXISTS IDX_SEC_USERROLE_ROLE   ON TB_SEC_USER_ROLE(ROLE_ID);
CREATE INDEX IF NOT EXISTS IDX_SEC_ROLEPERM_ROLE   ON TB_SEC_ROLE_PERM(ROLE_ID);
CREATE INDEX IF NOT EXISTS IDX_SEC_ROLEPERM_PERM   ON TB_SEC_ROLE_PERM(PERM_ID);
CREATE INDEX IF NOT EXISTS IDX_SEC_USERPWHIS_USER  ON TB_SEC_USER_PW_HIS(USER_ID);
CREATE INDEX IF NOT EXISTS IDX_SEC_MENULOG_USER    ON TB_SEC_MENU_LOG(USE_USER_ID);
CREATE INDEX IF NOT EXISTS IDX_SEC_CODEITEM_GROUP  ON TB_SEC_CODE_ITEM(GROUP_CD);
