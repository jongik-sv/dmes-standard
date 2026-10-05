-- ============================================================
-- V18: 위젯 분류 마스터 코드 시드 (WIDGET_CTG)
-- ============================================================
--
-- 위젯 서랍·위젯 관리의 분류(2026-10-05 위젯 개선 10건 §6)에 쓰는 코드그룹.
-- TB_MCM_WIDGET_DEF.CATEGORY_CD 와 코드 위젯 meta.category 가 이 값을 가리킨다.
--
-- ※ m-mcm "마스터코드 관리" 화면 정본은 MCM_SOURCE.TB_MCM_CODE_* (운영/MSSQL) 이며,
--   본 SQLite 시드는 cactus LoV(드롭다운)용 TB_SEC_CODE_* 만 대상으로 한다(오프라인 개발/데모).
--   운영 환경에서는 마스터 코드 관리 화면에서 직접 등록·수정한다(V13 시드와 같은 원칙).

INSERT OR IGNORE INTO TB_SEC_CODE_GROUP (GROUP_CD, GROUP_NM, GROUP_DESC, USE_YN, C_AT, U_AT, VER) VALUES
    ('WIDGET_CTG', '위젯 분류', '위젯 서랍·위젯 관리의 위젯 분류', 'Y', datetime('now'), datetime('now'), 1);

INSERT OR IGNORE INTO TB_SEC_CODE_ITEM (GROUP_CD, ITEM_CD, ITEM_NM, ITEM_DESC, SORT_ORD, EXTRA_VAL1, USE_YN, C_AT, U_AT, VER) VALUES
    ('WIDGET_CTG', 'COMMON', '공통',   '공통(공지·알림·바로 가기)', 10, '', 'Y', datetime('now'), datetime('now'), 1),
    ('WIDGET_CTG', 'PROD',   '생산',   '생산(작업·설비·실적)',       20, '', 'Y', datetime('now'), datetime('now'), 1),
    ('WIDGET_CTG', 'QUAL',   '품질',   '품질(불량·검사)',           30, '', 'Y', datetime('now'), datetime('now'), 1),
    ('WIDGET_CTG', 'LOGI',   '물류',   '물류(출하·재고)',           40, '', 'Y', datetime('now'), datetime('now'), 1),
    ('WIDGET_CTG', 'TOOL',   '도구',   '도구(계산기·메모·단위)',     50, '', 'Y', datetime('now'), datetime('now'), 1),
    ('WIDGET_CTG', 'INFO',   '외부 정보', '외부 정보(날씨·환율)',    60, '', 'Y', datetime('now'), datetime('now'), 1);
