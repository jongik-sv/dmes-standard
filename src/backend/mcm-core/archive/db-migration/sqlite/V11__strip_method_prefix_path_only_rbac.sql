-- mcm-core V11__strip_method_prefix_path_only_rbac.sql
-- TB_SEC_PERM_BUTTON.ENDPOINT 와 TB_SEC_PERM.PERM_SCRIPT 의 leading "METHOD:" prefix 를 제거.
--
-- 정책 변경: RBAC 가 path-only 매칭으로 단순화됨.
--   - V10 까지: "GET:/api/mpn/rest/**" 처럼 method 와 path 를 콜론으로 결합한 형태로 저장
--   - V11 부터: path 만 저장. 같은 URL 의 모든 메서드가 한 perm 으로 일괄 허용
--
-- 동작:
--   - 콤마(,)로 묶인 multi-pattern 의 각 토큰을 검사.
--   - 첫 "/" 이전에 콜론이 있으면 그 콜론 앞까지 (method) 를 잘라낸다.
--   - path 안에 콜론이 들어있는 경우(드물지만 가능) 는 보호.
--
-- 안전성:
--   - method prefix 가 없는 row 는 영향 없음 (조건문이 변경 안 함).
--   - HTTP_METHOD 컬럼은 schema 호환을 위해 유지 (사용 안 함).

-- ─────────── helper: 단일 토큰에서 "METHOD:" prefix 제거 ───────────
-- SQLite 에는 정규표현식이 없으므로 INSTR/SUBSTR 조합으로 처리.
-- 토큰 단위 처리는 GROUP_CONCAT 으로 재집계.

-- TB_SEC_PERM_BUTTON.ENDPOINT — 단일 토큰만 들어있는 row 처리 (V10 로 update 된 SAVE 류는 콤마 포함이라 별도 처리 필요)
UPDATE TB_SEC_PERM_BUTTON
SET ENDPOINT = SUBSTR(ENDPOINT, INSTR(ENDPOINT, ':') + 1)
WHERE ENDPOINT IS NOT NULL
  AND INSTR(ENDPOINT, ',') = 0
  AND INSTR(ENDPOINT, ':') > 0
  AND INSTR(ENDPOINT, ':') < INSTR(ENDPOINT || '/', '/');

-- 콤마 포함 multi-pattern 은 토큰별로 처리해야 한다.
-- SQLite WITH RECURSIVE 로 split → strip → re-join.
WITH RECURSIVE
split(perm_button_id, token, rest) AS (
  SELECT PERM_BUTTON_ID, '', ENDPOINT || ','
    FROM TB_SEC_PERM_BUTTON
    WHERE ENDPOINT IS NOT NULL AND INSTR(ENDPOINT, ',') > 0
  UNION ALL
  SELECT perm_button_id,
         SUBSTR(rest, 1, INSTR(rest, ',') - 1),
         SUBSTR(rest, INSTR(rest, ',') + 1)
    FROM split
    WHERE rest != ''
),
stripped AS (
  SELECT perm_button_id,
         CASE
           WHEN TRIM(token) = '' THEN NULL
           WHEN INSTR(TRIM(token), ':') > 0
                AND INSTR(TRIM(token), ':') < INSTR(TRIM(token) || '/', '/')
             THEN SUBSTR(TRIM(token), INSTR(TRIM(token), ':') + 1)
           ELSE TRIM(token)
         END AS path
    FROM split
    WHERE token != ''
),
joined AS (
  SELECT perm_button_id, GROUP_CONCAT(path, ',') AS new_endpoint
    FROM stripped
    WHERE path IS NOT NULL
    GROUP BY perm_button_id
)
UPDATE TB_SEC_PERM_BUTTON
SET ENDPOINT = (SELECT new_endpoint FROM joined WHERE joined.perm_button_id = TB_SEC_PERM_BUTTON.PERM_BUTTON_ID)
WHERE PERM_BUTTON_ID IN (SELECT perm_button_id FROM joined);

-- ─────────── TB_SEC_PERM.PERM_SCRIPT 재집계 (button 변경 반영) ───────────
-- syncPermScriptFromButtons 와 동일한 로직: 그 perm 의 USE_YN='Y' 버튼의 ENDPOINT 를 distinct + 콤마 join.
UPDATE TB_SEC_PERM
SET PERM_SCRIPT = COALESCE(
  (
    SELECT GROUP_CONCAT(DISTINCT pb.ENDPOINT)
    FROM TB_SEC_PERM_BUTTON pb
    WHERE pb.PERM_ID = TB_SEC_PERM.PERM_ID
      AND (pb.USE_YN IS NULL OR pb.USE_YN = 'Y')
      AND pb.ENDPOINT IS NOT NULL
      AND pb.ENDPOINT != ''
  ),
  ''
)
WHERE PERM_SCRIPT LIKE '%/api/%' OR PERM_SCRIPT LIKE '%/oasis/%' OR PERM_SCRIPT LIKE '%:/%';
