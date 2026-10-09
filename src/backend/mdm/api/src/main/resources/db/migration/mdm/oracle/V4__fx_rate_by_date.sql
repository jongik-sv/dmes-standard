-- ============================================================
-- V4: 환율 마스터를 「날짜 한 행, 통화는 칼럼」으로 전환
-- ============================================================
--
-- 대상 스키마: MDMAPUSER   위치: mdm/oracle
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (docs/superpowers/specs/2026-10-09-mdm-fx-master-design.md §7):
--   V3 의 FX_RATE 는 「통화+기준일」이 키(USD20261008)였다. 이제 키는 기준일 한 개(20261008)이고,
--   추가 컬럼 ATTR01~10 의 라벨이 통화 코드이며 값은 그 통화 1단위당 원화 환율이다.
--   기준통화·출처는 칼럼이 없으므로 항목 DESCRIPTION 에 남긴다(예약 작업이 쓴다).
--   추가 컬럼이 10개뿐이라 수집 통화에서 THB 를 뺀다(철강 거래 비중이 가장 낮다).
--
-- 변경:
--   1. FX_RATE 정의: 키 정규식 ^[0-9]{8}$, 설명, ATTR01~10_NAME = USD EUR JPY CNY GBP AUD CAD CHF HKD SGD
--   2. FX_RATE 카테고리 MAJOR 닫기(대상 칸 ATTR01 이 더는 통화 정규식이 아니다). 삭제하지 않는다. BASE 만 남는다.
--   3. CUR 의 THB: 환율 수집(ATTR04) Y → N. 선분 이력 규칙대로 열린 행을 닫고 값만 바꾼 새 행을 연다.
--   4. FX_RATE 의 옛 모양(통화3자+기준일8자) 열린 행을 닫는다. 삭제하지 않는다. 새 모양 행은 예약 작업이 다시 채운다.
--
-- 멱등성:
--   - 모든 문장이 「아직 바뀌지 않은 행」만 대상으로 삼는다(재적용하면 0행).
--   - 닫는 시각은 DB 시각 함수 없이 고정값과 (행의 VALID_FROM + 1초) 중 큰 값이다(VALID_TO > VALID_FROM 보장).
--   - 문장은 줄 끝 세미콜론으로 끝낸다(시험이 이 파일을 읽어 실행한다). 문자열 안에는 세미콜론을 넣지 않는다.
-- ============================================================

-- ── 1. FX_RATE 정의 ───────────────────────────────────────────

UPDATE TB_MDM_DATA A
SET    A.CODE_PATTERN = '^[0-9]{8}$'
     , A.DESCRIPTION  = '기준일별 환율(1 통화 단위당 원화). 키는 기준일 8자(yyyyMMdd), 추가 컬럼 라벨이 통화 코드다. 예약 작업 mdm.exchangeRateSync 가 채운다. 기준통화·출처는 항목 설명에 남긴다.'
     , A.ATTR01_NAME  = 'USD'
     , A.ATTR02_NAME  = 'EUR'
     , A.ATTR03_NAME  = 'JPY'
     , A.ATTR04_NAME  = 'CNY'
     , A.ATTR05_NAME  = 'GBP'
     , A.ATTR06_NAME  = 'AUD'
     , A.ATTR07_NAME  = 'CAD'
     , A.ATTR08_NAME  = 'CHF'
     , A.ATTR09_NAME  = 'HKD'
     , A.ATTR10_NAME  = 'SGD'
     , A.U_USR_ID     = 'SYSTEM'
     , A.U_AT         = TIMESTAMP '2026-10-09 12:00:00'
     , A.U_SVC_ID     = 'flyway'
     , A.U_PGM_ID     = 'V4__fx_rate_by_date'
     , A.VER          = A.VER + 1
WHERE  A.MARU_DATA_ID = 'FX_RATE'
AND    (A.CODE_PATTERN IS NULL OR A.CODE_PATTERN <> '^[0-9]{8}$' OR A.ATTR01_NAME IS NULL OR A.ATTR01_NAME <> 'USD');

-- ── 2. FX_RATE 카테고리 MAJOR 닫기 ────────────────────────────

UPDATE TB_MDM_DATA_CATE A
SET    A.VALID_TO = GREATEST(TIMESTAMP '2026-10-09 12:00:00', A.VALID_FROM + INTERVAL '1' SECOND)
     , A.U_USR_ID = 'SYSTEM'
     , A.U_AT     = TIMESTAMP '2026-10-09 12:00:00'
     , A.U_SVC_ID = 'flyway'
     , A.U_PGM_ID = 'V4__fx_rate_by_date'
     , A.VER      = A.VER + 1
WHERE  A.MARU_DATA_ID = 'FX_RATE'
AND    A.CATE_ID = 'MAJOR'
AND    A.VALID_TO = TIMESTAMP '9999-12-31 00:00:00';

-- ── 3. CUR 의 THB 환율 수집 N ────────────────────────────────
-- 3-1. 열린 THB(수집 Y) 행을 닫는다.

UPDATE TB_MDM_DATA_ITEM A
SET    A.VALID_TO    = GREATEST(TIMESTAMP '2026-10-09 12:00:00', A.VALID_FROM + INTERVAL '1' SECOND)
     , A.ROW_VERSION = A.ROW_VERSION + 1
     , A.U_USR_ID    = 'SYSTEM'
     , A.U_AT        = TIMESTAMP '2026-10-09 12:00:00'
     , A.U_SVC_ID    = 'flyway'
     , A.U_PGM_ID    = 'V4__fx_rate_by_date'
     , A.VER         = A.VER + 1
WHERE  A.MARU_DATA_ID = 'CUR'
AND    A.CODE = 'THB'
AND    A.VALID_TO = TIMESTAMP '9999-12-31 00:00:00'
AND    A.ATTR04 = 'Y';

-- 3-2. 방금 닫은 행(열린 행이 없고, 마지막 행의 수집이 Y)을 복사해 수집 N 의 새 행을 연다.

INSERT INTO TB_MDM_DATA_ITEM
     ( MARU_DATA_ID, CODE, VALID_FROM, NAME, ALTER_NAME, SEQ, DESCRIPTION, VALID_TO, ROW_VERSION, CHG_SEQ
     , LVL1, LVL2, LVL3, LVL4, LVL5
     , ATTR01, ATTR02, ATTR03, ATTR04, ATTR05, ATTR06, ATTR07, ATTR08, ATTR09, ATTR10
     , C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER
     )
SELECT B.MARU_DATA_ID, B.CODE, B.VALID_TO, B.NAME, B.ALTER_NAME, B.SEQ, B.DESCRIPTION
     , TIMESTAMP '9999-12-31 00:00:00', B.ROW_VERSION, 0
     , B.LVL1, B.LVL2, B.LVL3, B.LVL4, B.LVL5
     , B.ATTR01, B.ATTR02, B.ATTR03, 'N', B.ATTR05, B.ATTR06, B.ATTR07, B.ATTR08, B.ATTR09, B.ATTR10
     , 'SYSTEM', TIMESTAMP '2026-10-09 12:00:00', 'flyway', 'V4__fx_rate_by_date'
     , 'SYSTEM', TIMESTAMP '2026-10-09 12:00:00', 'flyway', 'V4__fx_rate_by_date'
     , 0
FROM   TB_MDM_DATA_ITEM B
WHERE  B.MARU_DATA_ID = 'CUR'
AND    B.CODE = 'THB'
AND    B.ATTR04 = 'Y'
AND    B.VALID_FROM = (SELECT MAX(M.VALID_FROM) FROM TB_MDM_DATA_ITEM M WHERE M.MARU_DATA_ID = 'CUR' AND M.CODE = 'THB')
AND    B.VALID_TO < TIMESTAMP '9999-12-31 00:00:00'
AND    NOT EXISTS (SELECT 1 FROM TB_MDM_DATA_ITEM O WHERE O.MARU_DATA_ID = 'CUR' AND O.CODE = 'THB' AND O.VALID_TO = TIMESTAMP '9999-12-31 00:00:00');

-- ── 4. FX_RATE 옛 모양(통화3자+기준일8자) 열린 행 닫기 ──────────────

UPDATE TB_MDM_DATA_ITEM A
SET    A.VALID_TO    = GREATEST(TIMESTAMP '2026-10-09 12:00:00', A.VALID_FROM + INTERVAL '1' SECOND)
     , A.ROW_VERSION = A.ROW_VERSION + 1
     , A.U_USR_ID    = 'SYSTEM'
     , A.U_AT        = TIMESTAMP '2026-10-09 12:00:00'
     , A.U_SVC_ID    = 'flyway'
     , A.U_PGM_ID    = 'V4__fx_rate_by_date'
     , A.VER         = A.VER + 1
WHERE  A.MARU_DATA_ID = 'FX_RATE'
AND    A.VALID_TO = TIMESTAMP '9999-12-31 00:00:00'
AND    REGEXP_LIKE(A.CODE, '^[A-Z]{3}[0-9]{8}$');

-- ── 5. mcm 앱(위젯)의 읽기 권한 추가 ──────────────────────────────
-- 환율 위젯은 통화→칼럼 대응을 FX_RATE 정의의 라벨에서 읽으므로 TB_MDM_DATA 도 읽을 수 있어야 한다(V3 은 항목 표만 준다).
-- MCMAPUSER 가 없는 DB 에서는 건너뛴다. 이 블록은 시험 하니스가 DML 로 읽지 않는다(DECLARE 앞에서 멈춘다).

DECLARE
    V_CNT NUMBER;
BEGIN
    SELECT COUNT(*) INTO V_CNT FROM ALL_USERS A WHERE A.USERNAME = 'MCMAPUSER';
    IF V_CNT > 0 THEN
        EXECUTE IMMEDIATE 'GRANT SELECT ON TB_MDM_DATA TO MCMAPUSER';
    END IF;
END;
/
