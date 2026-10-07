-- mcm-core V9__fix_perm_endpoints_to_real_api_patterns.sql
-- TB_SEC_PERM_BUTTON.ENDPOINT 와 TB_SEC_PERM.PERM_SCRIPT 를 BFF middleware 가 매칭하는
-- 실제 FE-side API 패턴으로 정정.
--
-- 배경:
--   - 기존 자동조립 로직이 endpoint 를 `/oasis/{OBJ_ID}/{action}` 형식으로 박았는데
--     이 형식은 어떤 실제 BPMN serviceId 와도 매칭되지 않는다.
--   - BFF middleware (m-mcm/proxy.ts) 가 이 PERM_SCRIPT 로 incoming request URI 를 매칭하므로
--     자동조립값이 박힌 perm 을 가진 사용자는 어떤 화면도 못 들어옴 (admin 외).
--   - V9 부터는 FE 의 module-pages.ts MODULE_DEFAULT_API_PATTERNS 와 일치하는 module-level
--     광역 패턴으로 자동 채움. 페이지별 더 세분화하려면 module-pages.ts 의 apiPatterns 사용.
--
-- 안전성:
--   - 자동조립으로 보이는 row 만 정정 (ENDPOINT LIKE '/oasis/OBJ_%').
--   - 사용자가 수동으로 입력한 endpoint 는 보존.

-- ─────────── TB_SEC_PERM_BUTTON.ENDPOINT 정정 ───────────
UPDATE TB_SEC_PERM_BUTTON
SET ENDPOINT = (
  SELECT CASE o.SYS_CD
    WHEN 'mpn' THEN '/api/mpn/**,/api/mcm/oasis/secObj/**,/api/mcm/oasis/secMenu/**'
    WHEN 'mpp' THEN '/api/mpp/**,/api/mcm/oasis/secObj/**,/api/mcm/oasis/secMenu/**'
    WHEN 'mqc' THEN '/api/mqc/**,/api/mcm/oasis/secObj/**,/api/mcm/oasis/secMenu/**'
    WHEN 'mcm' THEN '/api/mcm/**'
    ELSE TB_SEC_PERM_BUTTON.ENDPOINT
  END
  FROM TB_SEC_PERM p JOIN TB_SEC_OBJ o ON p.OBJ_ID = o.OBJ_ID
  WHERE p.PERM_ID = TB_SEC_PERM_BUTTON.PERM_ID
)
WHERE ENDPOINT LIKE '/oasis/OBJ_%';

-- ─────────── TB_SEC_PERM.PERM_SCRIPT 정정 (button 변경에 맞춰 동기화) ───────────
UPDATE TB_SEC_PERM
SET PERM_SCRIPT = (
  SELECT CASE o.SYS_CD
    WHEN 'mpn' THEN '/api/mpn/**,/api/mcm/oasis/secObj/**,/api/mcm/oasis/secMenu/**'
    WHEN 'mpp' THEN '/api/mpp/**,/api/mcm/oasis/secObj/**,/api/mcm/oasis/secMenu/**'
    WHEN 'mqc' THEN '/api/mqc/**,/api/mcm/oasis/secObj/**,/api/mcm/oasis/secMenu/**'
    WHEN 'mcm' THEN '/api/mcm/**'
    ELSE TB_SEC_PERM.PERM_SCRIPT
  END
  FROM TB_SEC_OBJ o
  WHERE o.OBJ_ID = TB_SEC_PERM.OBJ_ID
)
WHERE PERM_SCRIPT LIKE '/oasis/OBJ_%' OR PERM_SCRIPT LIKE '%/oasis/OBJ_%';
