-- 사본 테이블 (원장과 같은 모양, 판정에 필요한 컬럼만)
DROP TABLE IF EXISTS md_code_ver, md_code_item, md_code_cate, md_code_cate_item;

CREATE TABLE md_code_ver (
  maru_code_id varchar(30), ver numeric(7,3), status varchar(10),
  apply_from timestamp, apply_to timestamp,
  PRIMARY KEY (maru_code_id, ver));

CREATE TABLE md_code_item (
  maru_code_id varchar(30), code varchar(30), from_ver numeric(7,3), to_ver numeric(7,3) NOT NULL,
  name varchar(100),
  PRIMARY KEY (maru_code_id, code, from_ver));

CREATE TABLE md_code_cate (
  maru_code_id varchar(30), cate_id varchar(30), from_ver numeric(7,3), to_ver numeric(7,3) NOT NULL,
  def_kind varchar(10), def_expr text,
  PRIMARY KEY (maru_code_id, cate_id, from_ver));

CREATE TABLE md_code_cate_item (
  maru_code_id varchar(30), cate_id varchar(30), code varchar(30), from_ver numeric(7,3), to_ver numeric(7,3) NOT NULL,
  PRIMARY KEY (maru_code_id, cate_id, code, from_ver));

-- 예제: PROC_CD
-- v1.0 (2025-01-01) 코드 81,82,83 / BASE만
-- v1.1 (2026-07-01) 84 추가 / 도금 공정 LIST: 82, 84 (신설)
-- v1.2 (2026-09-01) 도금 공정 LIST: 82, 83, 84 로 변경
INSERT INTO md_code_ver VALUES
 ('PROC_CD', 1.000, 'RELEASED', '2025-01-01', '2026-07-01'),
 ('PROC_CD', 1.001, 'RELEASED', '2026-07-01', '2026-09-01'),
 ('PROC_CD', 1.002, 'RELEASED', '2026-09-01', '9999-12-31');

INSERT INTO md_code_item (maru_code_id, code, from_ver, to_ver, name) VALUES
 ('PROC_CD', '81', 1.000, 9999, '산세'),
 ('PROC_CD', '82', 1.000, 9999, '2CGL'),
 ('PROC_CD', '83', 1.000, 9999, '3CGL'),
 ('PROC_CD', '84', 1.001, 9999, '4CGL');

INSERT INTO md_code_cate VALUES
 ('PROC_CD', 'BASE',    1.000, 9999,  'ALL',  NULL),
 ('PROC_CD', 'COATING', 1.001, 1.002, 'LIST', '82, 84'),
 ('PROC_CD', 'COATING', 1.002, 9999,  'LIST', '82, 83, 84');

-- ─────────────────────────────────────────────────────────────
-- MASTER_AT(maru_code_id, cate_id, value, base_dt)의 마루 코드 대상 판정. 함수 인자와 자리가 같다. MASTER는 base_dt 자리에 평가 시각이 온다. 구 CODE_EXISTS(2026-09-08 이름 통합, 2026-09-09 MASTER_AT 분리)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION code_exists(p_mc text, p_cate text, p_value text, p_base_dt timestamp)
RETURNS boolean LANGUAGE sql STABLE AS $$
WITH v AS (                                   -- 1. 버전 고르기 (없으면 최초 버전으로 소급)
  SELECT COALESCE(
    (SELECT ver FROM md_code_ver
      WHERE maru_code_id = p_mc AND status = 'RELEASED'
        AND apply_from <= p_base_dt AND p_base_dt < apply_to),
    (SELECT MIN(ver) FROM md_code_ver
      WHERE maru_code_id = p_mc AND status = 'RELEASED')
  ) AS ver
),
cate AS (                                     -- 2. 카테고리 정의 고르기 (없으면 최초 정의로 소급)
  SELECT c.def_kind, c.def_expr,
         GREATEST(c.from_ver, v.ver) AS eff_ver   -- TABLE 종류에서 CATE_ITEM을 볼 버전
  FROM md_code_cate c, v
  WHERE c.maru_code_id = p_mc AND c.cate_id = p_cate
    AND ( (c.from_ver <= v.ver AND v.ver < c.to_ver)            -- V에 유효한 행
       OR v.ver < (SELECT MIN(x.from_ver) FROM md_code_cate x    -- 아직 생기기 전이면 소급 후보
                    WHERE x.maru_code_id = p_mc AND x.cate_id = p_cate) )
  ORDER BY c.from_ver
  LIMIT 1
),
codes AS (                                    -- 3. V에 유효한 코드
  SELECT i.code
  FROM md_code_item i, v
  WHERE i.maru_code_id = p_mc AND i.from_ver <= v.ver AND v.ver < i.to_ver
)
SELECT EXISTS (                               -- 4. 판정
  SELECT 1
  FROM codes k, cate c
  WHERE k.code = p_value
    AND ( c.def_kind = 'ALL'
       OR (c.def_kind = 'LIST'  AND p_value = ANY (string_to_array(replace(c.def_expr, ' ', ''), ',')))
       OR (c.def_kind = 'REGEX' AND p_value ~ ('^(' || c.def_expr || ')$'))
       OR (c.def_kind = 'TABLE' AND EXISTS (
             SELECT 1 FROM md_code_cate_item ci
             WHERE ci.maru_code_id = p_mc AND ci.cate_id = p_cate AND ci.code = p_value
               AND ci.from_ver <= c.eff_ver AND c.eff_ver < ci.to_ver)) )
);
$$;

-- ─────────────────────────────────────────────────────────────
-- 카테고리 목록 (콤보용): 같은 규칙으로 코드 집합을 돌려준다
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cate_codes(p_mc text, p_cate text, p_base_dt timestamp)
RETURNS TABLE (code varchar, name varchar) LANGUAGE sql STABLE AS $$
WITH v AS (
  SELECT COALESCE(
    (SELECT ver FROM md_code_ver WHERE maru_code_id = p_mc AND status = 'RELEASED'
       AND apply_from <= p_base_dt AND p_base_dt < apply_to),
    (SELECT MIN(ver) FROM md_code_ver WHERE maru_code_id = p_mc AND status = 'RELEASED')) AS ver
),
cate AS (
  SELECT c.def_kind, c.def_expr, GREATEST(c.from_ver, v.ver) AS eff_ver
  FROM md_code_cate c, v
  WHERE c.maru_code_id = p_mc AND c.cate_id = p_cate
    AND ( (c.from_ver <= v.ver AND v.ver < c.to_ver)
       OR v.ver < (SELECT MIN(x.from_ver) FROM md_code_cate x WHERE x.maru_code_id = p_mc AND x.cate_id = p_cate) )
  ORDER BY c.from_ver LIMIT 1
)
SELECT i.code, i.name
FROM md_code_item i, v, cate c
WHERE i.maru_code_id = p_mc AND i.from_ver <= v.ver AND v.ver < i.to_ver
  AND ( c.def_kind = 'ALL'
     OR (c.def_kind = 'LIST'  AND i.code = ANY (string_to_array(replace(c.def_expr, ' ', ''), ',')))
     OR (c.def_kind = 'REGEX' AND i.code ~ ('^(' || c.def_expr || ')$'))
     OR (c.def_kind = 'TABLE' AND EXISTS (
           SELECT 1 FROM md_code_cate_item ci
           WHERE ci.maru_code_id = p_mc AND ci.cate_id = p_cate AND ci.code = i.code
             AND ci.from_ver <= c.eff_ver AND c.eff_ver < ci.to_ver)) )
ORDER BY i.code;
$$;
