-- =====================================================================================================
-- 조업 계산기 위젯 정의 5건 (SQLite, src/backend/data/mcm.db)  ── 초안(A2 머지 뒤 세트 ID 확정)
-- -----------------------------------------------------------------------------------------------------
-- 용도   : rule-calc 유형 위젯 정의 5건 — 원판 중량(M47C0001)·이론 길이(M47C0014)·도금중량(M47C0005)·
--          코팅중량(룰 세트, 도장부착량 M47C0007 → 코팅중량 M47C0006)·외경(M47C0025). 탭 없이 각각 등록한다.
--          배치 PLACE_TP='A'(위젯 화면·업무 화면 도구 창 둘 다). 중간값 표시(showSteps)는 끈다(기본).
--          로컬 화면 확인 전용이다. Flyway 마이그레이션이 아니다 — TB_MCM_WIDGET_DEF 는 ddl-auto 로 생기므로 db/migration 에 두지 않는다.
-- 전제   : mcm 을 한 번 기동해 TB_MCM_WIDGET_DEF(PLACE_TP 칸 포함, C1 이후)가 만들어진 mcm.db.
--          위젯이 쓰는 룰·세트는 mdm 에 RELEASED 로 있어야 한다(rule-calc-api 레인 A2 시드). 없으면 위젯이 「확정 버전 없음」 을 보인다.
-- 적재   : 수동으로 넣을 때(저장소 루트에서)
--            cp src/backend/data/mcm.db /tmp/mcm.db.bak        # 먼저 백업
--            sqlite3 src/backend/data/mcm.db < src/backend/mcm/sample/widget-rule-calc-defs.sql
--          머지 뒤 로컬 mcm DB 적용은 조정 세션이 한다.
-- 재실행 : 모든 문장이 WHERE NOT EXISTS 라 두 번 넣어도 행이 늘지 않고 기존 행을 바꾸지 않는다. DELETE·UPDATE 는 없다.
-- 되돌리기: 이 파일은 삭제 문을 두지 않는다. 지우려면 위젯관리 화면에서 삭제하거나 백업한 mcm.db 로 바꾼다.
-- 채움 값 : 위젯관리 화면이 정의를 저장한 행과 같은 모양이다 — SRC_TP='D', USE_YN='Y', PRIVATE_YN='N', 분류 TOOL(도구),
--          작성자 41000132(MDM 로컬 관리자 계정), 작성·수정 일시는 에포크 밀리초, VER 0.
-- =====================================================================================================

INSERT INTO TB_MCM_WIDGET_DEF
    (WIDGET_ID, SRC_TP, TYPE_ID, TITLE, SUBTITLE, DESCRIPTION, DEF_W, DEF_H, MIN_W, MIN_H, CATEGORY_CD, PRIVATE_YN, PLACE_TP, USE_YN, CONFIG_JSON,
     C_USR_ID, C_AT, U_USR_ID, U_AT, VER)
SELECT 'def.rcalc001', 'D', 'rule-calc', '원판 중량', '룰 M47C0001', '입력 칸에 값을 넣어 원판 중량을 계산한다(룰 M47C0001).', 6, 12, 4, 7, 'TOOL', 'N', 'A', 'Y',
       '{"targetTp":"RULE","targetId":"M47C0001","showSteps":false}',
       '41000132', CAST(strftime('%s','now') AS INTEGER) * 1000, '41000132', CAST(strftime('%s','now') AS INTEGER) * 1000, 0
WHERE NOT EXISTS (SELECT 1 FROM TB_MCM_WIDGET_DEF WHERE WIDGET_ID = 'def.rcalc001');

INSERT INTO TB_MCM_WIDGET_DEF
    (WIDGET_ID, SRC_TP, TYPE_ID, TITLE, SUBTITLE, DESCRIPTION, DEF_W, DEF_H, MIN_W, MIN_H, CATEGORY_CD, PRIVATE_YN, PLACE_TP, USE_YN, CONFIG_JSON,
     C_USR_ID, C_AT, U_USR_ID, U_AT, VER)
SELECT 'def.rcalc002', 'D', 'rule-calc', '이론 길이', '룰 M47C0014', '입력 칸에 값을 넣어 이론 길이를 계산한다(룰 M47C0014).', 6, 12, 4, 7, 'TOOL', 'N', 'A', 'Y',
       '{"targetTp":"RULE","targetId":"M47C0014","showSteps":false}',
       '41000132', CAST(strftime('%s','now') AS INTEGER) * 1000, '41000132', CAST(strftime('%s','now') AS INTEGER) * 1000, 0
WHERE NOT EXISTS (SELECT 1 FROM TB_MCM_WIDGET_DEF WHERE WIDGET_ID = 'def.rcalc002');

INSERT INTO TB_MCM_WIDGET_DEF
    (WIDGET_ID, SRC_TP, TYPE_ID, TITLE, SUBTITLE, DESCRIPTION, DEF_W, DEF_H, MIN_W, MIN_H, CATEGORY_CD, PRIVATE_YN, PLACE_TP, USE_YN, CONFIG_JSON,
     C_USR_ID, C_AT, U_USR_ID, U_AT, VER)
SELECT 'def.rcalc003', 'D', 'rule-calc', '도금중량', '룰 M47C0005', '입력 칸에 값을 넣어 도금중량을 계산한다(룰 M47C0005).', 6, 12, 4, 7, 'TOOL', 'N', 'A', 'Y',
       '{"targetTp":"RULE","targetId":"M47C0005","showSteps":false}',
       '41000132', CAST(strftime('%s','now') AS INTEGER) * 1000, '41000132', CAST(strftime('%s','now') AS INTEGER) * 1000, 0
WHERE NOT EXISTS (SELECT 1 FROM TB_MCM_WIDGET_DEF WHERE WIDGET_ID = 'def.rcalc003');

-- 코팅중량: 룰 세트(도장부착량 M47C0007 결과 → 코팅중량 M47C0006 입력). 세트 ID 는 A2 머지 뒤 확정한다(지금은 M47_COAT_WT 가정).
INSERT INTO TB_MCM_WIDGET_DEF
    (WIDGET_ID, SRC_TP, TYPE_ID, TITLE, SUBTITLE, DESCRIPTION, DEF_W, DEF_H, MIN_W, MIN_H, CATEGORY_CD, PRIVATE_YN, PLACE_TP, USE_YN, CONFIG_JSON,
     C_USR_ID, C_AT, U_USR_ID, U_AT, VER)
SELECT 'def.rcalc004', 'D', 'rule-calc', '코팅중량', '룰 세트 M47_COAT_WT', '도장부착량(M47C0007)을 구한 뒤 그 값으로 코팅중량(M47C0006)을 계산한다.', 6, 12, 4, 7, 'TOOL', 'N', 'A', 'Y',
       '{"targetTp":"SET","targetId":"M47_COAT_WT","showSteps":false}',
       '41000132', CAST(strftime('%s','now') AS INTEGER) * 1000, '41000132', CAST(strftime('%s','now') AS INTEGER) * 1000, 0
WHERE NOT EXISTS (SELECT 1 FROM TB_MCM_WIDGET_DEF WHERE WIDGET_ID = 'def.rcalc004');

INSERT INTO TB_MCM_WIDGET_DEF
    (WIDGET_ID, SRC_TP, TYPE_ID, TITLE, SUBTITLE, DESCRIPTION, DEF_W, DEF_H, MIN_W, MIN_H, CATEGORY_CD, PRIVATE_YN, PLACE_TP, USE_YN, CONFIG_JSON,
     C_USR_ID, C_AT, U_USR_ID, U_AT, VER)
SELECT 'def.rcalc005', 'D', 'rule-calc', '외경', '룰 M47C0025', '입력 칸에 값을 넣어 외경을 계산한다(룰 M47C0025).', 6, 12, 4, 7, 'TOOL', 'N', 'A', 'Y',
       '{"targetTp":"RULE","targetId":"M47C0025","showSteps":false}',
       '41000132', CAST(strftime('%s','now') AS INTEGER) * 1000, '41000132', CAST(strftime('%s','now') AS INTEGER) * 1000, 0
WHERE NOT EXISTS (SELECT 1 FROM TB_MCM_WIDGET_DEF WHERE WIDGET_ID = 'def.rcalc005');
