-- ============================================================
-- V3: 환율 마스터 시드 (통화 CUR · 환율 FX_RATE)
-- ============================================================
--
-- 대상 스키마: MDMAPUSER   위치: mdm/oracle
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (docs/superpowers/specs/2026-10-09-mdm-fx-master-design.md D1·D2·§6):
--   환율을 마루 데이터(TB_MDM_DATA 방식)로 둔다. 새 표를 만들지 않고 정의·카테고리·항목 행만 넣는다.
--   CUR     통화: MDM 원천. 사람이 dataItemMng 에서 관리한다. 항목 12행(KRW + 수집 대상 11개).
--   FX_RATE 환율: EXTERNAL 원천, 출처 시스템 MDM(TB_MDM_SYSTEM 의 기존 코드). 예약 작업 mdm.exchangeRateSync 만 쓴다. 항목은 시드하지 않는다.
--
-- 전제:
--   - 마스터 ID CUR · FX_RATE 가 TB_MDM_CODE 에 이미 쓰이고 있지 않아야 한다(이 파일은 확인하지 않는다).
--   - TB_MDM_SYSTEM 에 MDM 이 있어야 한다(V1 시드).
--
-- 멱등성(선분 불변식):
--   - 정의(TB_MDM_DATA)는 마스터 ID 가 없을 때만 넣는다.
--   - 카테고리·항목 선분은 그 키의 행이 하나라도 있으면(열린 행이든 닫힌 행이든) 건드리지 않는다.
--     VALID_FROM 은 고정값이라 MERGE 키로 쓰지 않는다. 사용자가 닫거나 고친 값을 되돌리지 않기 위해서다.
--   - 항목·카테고리는 마스터 정의가 먼저 있어야 외래 키를 만족한다. 아래 순서를 지킨다.
--   - 저장 시각에 DB 시각 함수를 쓰지 않고 TIMESTAMP 고정값을 쓴다(재적용해도 같은 결과).
--   - 문장은 줄 끝 세미콜론으로 끝낸다(시험이 이 파일을 읽어 실행한다). 문자열 안에는 세미콜론을 넣지 않는다.
-- ============================================================

-- ── 1. 마스터 정의 ─────────────────────────────────────────────

INSERT INTO TB_MDM_DATA
     ( MARU_DATA_ID, MARU_DATA_NAME, STATUS, SOURCE_KIND, SOURCE_SYSTEM, CODE_PATTERN, DESCRIPTION
     , ATTR01_NAME, ATTR02_NAME, ATTR03_NAME, ATTR04_NAME, ATTR05_NAME
     , LVL_CNT, LAST_CHG_SEQ, CHG_SEQ
     , C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER
     )
SELECT 'CUR'
     , '통화'
     , 'INUSE'
     , 'MDM'
     , NULL
     , '^[A-Z]{3}$'
     , 'ISO 4217 통화 코드. 환율 수집 대상은 환율 수집 칸이 Y 인 통화다.'
     , '지역'
     , '고시 단위'
     , '소수 자릿수'
     , '환율 수집'
     , NULL
     , 0, 0, 0
     , 'SYSTEM', TIMESTAMP '2026-10-09 00:00:00', 'flyway', 'V3__fx_master_seed'
     , 'SYSTEM', TIMESTAMP '2026-10-09 00:00:00', 'flyway', 'V3__fx_master_seed'
     , 0
FROM   DUAL
WHERE  NOT EXISTS (SELECT 1 FROM TB_MDM_DATA A WHERE A.MARU_DATA_ID = 'CUR');

INSERT INTO TB_MDM_DATA
     ( MARU_DATA_ID, MARU_DATA_NAME, STATUS, SOURCE_KIND, SOURCE_SYSTEM, CODE_PATTERN, DESCRIPTION
     , ATTR01_NAME, ATTR02_NAME, ATTR03_NAME, ATTR04_NAME, ATTR05_NAME
     , LVL_CNT, LAST_CHG_SEQ, CHG_SEQ
     , C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER
     )
SELECT 'FX_RATE'
     , '환율'
     , 'INUSE'
     , 'EXTERNAL'
     , 'MDM'
     , '^[A-Z]{3}[0-9]{8}$'
     , '통화별 일자 환율(1 대상 통화당 원화). 예약 작업 mdm.exchangeRateSync 가 채운다. 키는 통화 3자 + 기준일 8자.'
     , '통화'
     , '기준일'
     , '환율'
     , '기준통화'
     , '출처'
     , 0, 0, 0
     , 'SYSTEM', TIMESTAMP '2026-10-09 00:00:00', 'flyway', 'V3__fx_master_seed'
     , 'SYSTEM', TIMESTAMP '2026-10-09 00:00:00', 'flyway', 'V3__fx_master_seed'
     , 0
FROM   DUAL
WHERE  NOT EXISTS (SELECT 1 FROM TB_MDM_DATA A WHERE A.MARU_DATA_ID = 'FX_RATE');

-- ── 2. 카테고리 (모두 REGEX: 소속이 항목 칸에서 자동으로 정해진다) ──────────

INSERT INTO TB_MDM_DATA_CATE
     ( MARU_DATA_ID, CATE_ID, VALID_FROM, CATE_NAME, DEF_KIND, DEF_EXPR, DEF_TARGET, DESCRIPTION, VALID_TO, CHG_SEQ
     , C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER
     )
SELECT V.MARU_DATA_ID
     , V.CATE_ID
     , TIMESTAMP '2026-10-09 00:00:00'
     , V.CATE_NAME
     , 'REGEX'
     , V.DEF_EXPR
     , V.DEF_TARGET
     , V.DESCRIPTION
     , TIMESTAMP '9999-12-31 00:00:00'
     , 0
     , 'SYSTEM', TIMESTAMP '2026-10-09 00:00:00', 'flyway', 'V3__fx_master_seed'
     , 'SYSTEM', TIMESTAMP '2026-10-09 00:00:00', 'flyway', 'V3__fx_master_seed'
     , 0
FROM
(
    SELECT 'CUR' MARU_DATA_ID, 'BASE' CATE_ID, '전체' CATE_NAME, '.*' DEF_EXPR, 'KEY' DEF_TARGET, '모든 통화' DESCRIPTION FROM DUAL
    UNION ALL
    SELECT 'CUR', 'MAJOR', '주요 통화', '^(USD|EUR|JPY|CNY)$', 'KEY', '환율 위젯 초기 설정의 4개 통화' FROM DUAL
    UNION ALL
    SELECT 'CUR', 'ASIA', '아시아', '^ASIA$', 'ATTR01', '지역이 아시아인 통화' FROM DUAL
    UNION ALL
    SELECT 'CUR', 'EUROPE', '유럽', '^EUROPE$', 'ATTR01', '지역이 유럽인 통화' FROM DUAL
    UNION ALL
    SELECT 'CUR', 'AMERICAS', '아메리카', '^AMERICAS$', 'ATTR01', '지역이 아메리카인 통화' FROM DUAL
    UNION ALL
    SELECT 'CUR', 'OCEANIA', '오세아니아', '^OCEANIA$', 'ATTR01', '지역이 오세아니아인 통화' FROM DUAL
    UNION ALL
    SELECT 'FX_RATE', 'BASE', '전체', '.*', 'KEY', '모든 환율' FROM DUAL
    UNION ALL
    SELECT 'FX_RATE', 'MAJOR', '주요 통화', '^(USD|EUR|JPY|CNY)$', 'ATTR01', '주요 4개 통화의 환율' FROM DUAL
) V
WHERE  NOT EXISTS
(
    SELECT 1
    FROM   TB_MDM_DATA_CATE A
    WHERE  A.MARU_DATA_ID = V.MARU_DATA_ID
    AND    A.CATE_ID = V.CATE_ID
);

-- ── 3. 통화 항목 12행 (KRW 는 기준통화라 환율 수집 N) ─────────────────────

INSERT INTO TB_MDM_DATA_ITEM
     ( MARU_DATA_ID, CODE, VALID_FROM, NAME, ALTER_NAME, SEQ, VALID_TO, ROW_VERSION, CHG_SEQ
     , ATTR01, ATTR02, ATTR03, ATTR04
     , C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER
     )
SELECT 'CUR'
     , V.CODE
     , TIMESTAMP '2026-10-09 00:00:00'
     , V.NAME
     , V.ALTER_NAME
     , V.SEQ
     , TIMESTAMP '9999-12-31 00:00:00'
     , 0
     , 0
     , V.ATTR01, V.ATTR02, V.ATTR03, V.ATTR04
     , 'SYSTEM', TIMESTAMP '2026-10-09 00:00:00', 'flyway', 'V3__fx_master_seed'
     , 'SYSTEM', TIMESTAMP '2026-10-09 00:00:00', 'flyway', 'V3__fx_master_seed'
     , 0
FROM
(
    SELECT 'KRW' CODE, '대한민국 원' NAME, 'Korean Won' ALTER_NAME, 1 SEQ, 'LOCAL' ATTR01, '1' ATTR02, '0' ATTR03, 'N' ATTR04 FROM DUAL
    UNION ALL
    SELECT 'USD', '미국 달러', 'US Dollar', 2, 'AMERICAS', '1', '2', 'Y' FROM DUAL
    UNION ALL
    SELECT 'EUR', '유로', 'Euro', 3, 'EUROPE', '1', '2', 'Y' FROM DUAL
    UNION ALL
    SELECT 'JPY', '일본 엔', 'Japanese Yen', 4, 'ASIA', '100', '2', 'Y' FROM DUAL
    UNION ALL
    SELECT 'CNY', '중국 위안', 'Chinese Yuan', 5, 'ASIA', '1', '2', 'Y' FROM DUAL
    UNION ALL
    SELECT 'GBP', '영국 파운드', 'British Pound', 6, 'EUROPE', '1', '2', 'Y' FROM DUAL
    UNION ALL
    SELECT 'AUD', '호주 달러', 'Australian Dollar', 7, 'OCEANIA', '1', '2', 'Y' FROM DUAL
    UNION ALL
    SELECT 'CAD', '캐나다 달러', 'Canadian Dollar', 8, 'AMERICAS', '1', '2', 'Y' FROM DUAL
    UNION ALL
    SELECT 'CHF', '스위스 프랑', 'Swiss Franc', 9, 'EUROPE', '1', '2', 'Y' FROM DUAL
    UNION ALL
    SELECT 'HKD', '홍콩 달러', 'Hong Kong Dollar', 10, 'ASIA', '1', '2', 'Y' FROM DUAL
    UNION ALL
    SELECT 'SGD', '싱가포르 달러', 'Singapore Dollar', 11, 'ASIA', '1', '2', 'Y' FROM DUAL
    UNION ALL
    SELECT 'THB', '태국 바트', 'Thai Baht', 12, 'ASIA', '1', '2', 'Y' FROM DUAL
) V
WHERE  NOT EXISTS
(
    SELECT 1
    FROM   TB_MDM_DATA_ITEM A
    WHERE  A.MARU_DATA_ID = 'CUR'
    AND    A.CODE = V.CODE
);

-- ── 4. mcm 앱(위젯)의 읽기 권한 ──────────────────────────────────────────
-- 환율 위젯(mcm 앱, MCMAPUSER)이 FX_RATE 항목을 MDMAPUSER.TB_MDM_DATA_ITEM 접두로 읽는다. 표 주인(MDMAPUSER)이 이 파일에서 준다.
-- MCMAPUSER 가 없는 DB(mdm 만 따로 만든 시험 스키마 등)에서는 건너뛴다.

DECLARE
    V_CNT NUMBER;
BEGIN
    SELECT COUNT(*) INTO V_CNT FROM ALL_USERS A WHERE A.USERNAME = 'MCMAPUSER';
    IF V_CNT > 0 THEN
        EXECUTE IMMEDIATE 'GRANT SELECT ON TB_MDM_DATA_ITEM TO MCMAPUSER';
    END IF;
END;
/
