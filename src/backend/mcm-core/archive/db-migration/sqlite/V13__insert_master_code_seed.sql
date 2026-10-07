-- ============================================================
-- V13: 마스터 코드 초기 시드 데이터
-- ============================================================
--
-- TB_SEC_CODE_GROUP / TB_SEC_CODE_ITEM 의 예시 마스터 코드 그룹을 등록한다.
-- cactus-core 의 LovController + DefaultMasterCodeProvider 가 본 데이터를
-- /api/{module}/lov/master/{groupCd} 로 노출한다.
--
-- 운영 환경에서는 m-mcm 의 마스터 코드 관리 화면에서 직접 등록·수정하므로
-- 본 시드는 개발/검증/데모용 초기값이다.

-- ──────────────────────────────────────────────────────────────
-- 1. 그룹 등록
-- ──────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO TB_SEC_CODE_GROUP (GROUP_CD, GROUP_NM, GROUP_DESC, USE_YN, C_AT, U_AT, VER) VALUES
    ('PLANT_LIST',    '공장',             '생산 공장 목록 — 모든 모듈의 조회 조건 콤보',          'Y', datetime('now'), datetime('now'), 1),
    ('INSP_CLASS',    '검사분류',         '품질 검사 분류 (사내/외주/구매/지그금형/RMA)',          'Y', datetime('now'), datetime('now'), 1),
    ('INSP_STATUS',   '검사 진행 상태',    'Q(미진행)/V(판정중)/R(완료)',                            'Y', datetime('now'), datetime('now'), 1),
    ('DECISION_CD',   '판정 코드',         '검사 판정 (합격/조건부/불합격)',                         'Y', datetime('now'), datetime('now'), 1),
    ('USE_YN',        '사용 여부',         '공통 사용 여부 (Y/N)',                                   'Y', datetime('now'), datetime('now'), 1);

-- ──────────────────────────────────────────────────────────────
-- 2. 항목 등록
-- ──────────────────────────────────────────────────────────────

-- 공장 목록 (PLANT_LIST) — EXTRA_VAL1 = 지역 코드
INSERT OR IGNORE INTO TB_SEC_CODE_ITEM (GROUP_CD, ITEM_CD, ITEM_NM, ITEM_DESC, SORT_ORD, EXTRA_VAL1, EXTRA_VAL2, USE_YN, C_AT, U_AT, VER) VALUES
    ('PLANT_LIST', 'PLANT1', '제1공장', '본사 공장',     10, 'PLANT1', '본사',  'Y', datetime('now'), datetime('now'), 1),
    ('PLANT_LIST', 'PLANT2', '제2공장', '제2공장',       20, 'PLANT2', '지사',  'Y', datetime('now'), datetime('now'), 1),
    ('PLANT_LIST', 'PLANT3', '제3공장', '제3공장',       30, 'PLANT3', '지사',  'Y', datetime('now'), datetime('now'), 1);

-- 검사분류 (INSP_CLASS)
INSERT OR IGNORE INTO TB_SEC_CODE_ITEM (GROUP_CD, ITEM_CD, ITEM_NM, ITEM_DESC, SORT_ORD, USE_YN, C_AT, U_AT, VER) VALUES
    ('INSP_CLASS', 'M', '사내공정검사',  '사내 공정 중간 검사',  10, 'Y', datetime('now'), datetime('now'), 1),
    ('INSP_CLASS', 'O', '외주공정검사',  '외주 협력사 검사',     20, 'Y', datetime('now'), datetime('now'), 1),
    ('INSP_CLASS', 'P', '구매검사',      '구매 입고 검사',       30, 'Y', datetime('now'), datetime('now'), 1),
    ('INSP_CLASS', 'X', '지그금형검사',  '지그/금형 도구 검사',  40, 'Y', datetime('now'), datetime('now'), 1),
    ('INSP_CLASS', 'R', 'RMA',           '반품/재검사',          50, 'Y', datetime('now'), datetime('now'), 1);

-- 검사 진행 상태 (INSP_STATUS)
INSERT OR IGNORE INTO TB_SEC_CODE_ITEM (GROUP_CD, ITEM_CD, ITEM_NM, ITEM_DESC, SORT_ORD, USE_YN, C_AT, U_AT, VER) VALUES
    ('INSP_STATUS', 'Q', '미진행',  '검사 의뢰 단계',           10, 'Y', datetime('now'), datetime('now'), 1),
    ('INSP_STATUS', 'V', '판정중',  '부적합 발생, 처분 결정중', 20, 'Y', datetime('now'), datetime('now'), 1),
    ('INSP_STATUS', 'R', '완료',    'Release 완료',             30, 'Y', datetime('now'), datetime('now'), 1);

-- 판정 코드 (DECISION_CD) — Q004 호환
INSERT OR IGNORE INTO TB_SEC_CODE_ITEM (GROUP_CD, ITEM_CD, ITEM_NM, ITEM_DESC, SORT_ORD, USE_YN, C_AT, U_AT, VER) VALUES
    ('DECISION_CD', 'A', '합격',     '전 항목 합격',         10, 'Y', datetime('now'), datetime('now'), 1),
    ('DECISION_CD', 'C', '조건부합격','특정 조건 하 합격',    20, 'Y', datetime('now'), datetime('now'), 1),
    ('DECISION_CD', 'F', '불합격',   '재작업/폐기 필요',     30, 'Y', datetime('now'), datetime('now'), 1),
    ('DECISION_CD', 'N', '미판정',   '판정 대기',            40, 'Y', datetime('now'), datetime('now'), 1);

-- 사용 여부 (USE_YN) — 공통
INSERT OR IGNORE INTO TB_SEC_CODE_ITEM (GROUP_CD, ITEM_CD, ITEM_NM, SORT_ORD, USE_YN, C_AT, U_AT, VER) VALUES
    ('USE_YN', 'Y', '사용', 10, 'Y', datetime('now'), datetime('now'), 1),
    ('USE_YN', 'N', '미사용', 20, 'Y', datetime('now'), datetime('now'), 1);

-- ──────────────────────────────────────────────────────────────
-- 인덱스 추가 (LoV 조회 성능)
-- ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS IDX_SEC_CODE_ITEM_GROUP_USE
    ON TB_SEC_CODE_ITEM(GROUP_CD, USE_YN, SORT_ORD);

CREATE INDEX IF NOT EXISTS IDX_SEC_CODE_ITEM_EXTRA1
    ON TB_SEC_CODE_ITEM(GROUP_CD, EXTRA_VAL1, USE_YN);
