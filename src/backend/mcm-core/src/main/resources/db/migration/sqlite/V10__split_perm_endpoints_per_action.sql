-- mcm-core V10__split_perm_endpoints_per_action.sql
-- TB_SEC_PERM_BUTTON.ENDPOINT 와 TB_SEC_PERM.PERM_SCRIPT 를 액션별 좁은 패턴으로 분리.
--
-- Two-tier RBAC:
--   - Page-level (화면 접근) — 메뉴 필터링이 role-perm-objId 기반으로 처리. endpoint 무관.
--   - Button-level (액션별)  — 액션마다 좁은 METHOD:path 패턴. SEARCH/SAVE/DELETE 가 분리.
--
-- 배경:
--   - V9 까지는 모든 액션 버튼이 동일한 광역 wildcard 를 박아 "조회 권한 = 모든 권한" 이었음.
--   - V10 부터 ACTION 컬럼별로 좁은 패턴을 박아 read/write/delete 가 BFF middleware 단에서 분리됨.
--
-- 안전성:
--   - 자동조립으로 보이는 row 만 대상 (ENDPOINT LIKE '/api/%' OR LIKE '/oasis/%').
--   - 사용자가 수동 입력한 명시적 endpoint 는 보존.

-- ─────────── TB_SEC_PERM_BUTTON.ENDPOINT 액션별 정정 ───────────
UPDATE TB_SEC_PERM_BUTTON
SET ENDPOINT = (
  SELECT CASE o.SYS_CD || ':' || TB_SEC_PERM_BUTTON."ACTION"
    -- mpn 액션별
    WHEN 'mpn:SEARCH' THEN 'GET:/api/mpn/rest/**'
    WHEN 'mpn:SAVE'   THEN 'POST:/api/mpn/rest/**,PUT:/api/mpn/rest/**,PATCH:/api/mpn/rest/**'
    WHEN 'mpn:DELETE' THEN 'DELETE:/api/mpn/rest/**'
    WHEN 'mpn:EXPORT' THEN 'GET:/api/mpn/rest/**'
    WHEN 'mpn:IMPORT' THEN 'POST:/api/mpn/rest/**'
    WHEN 'mpn:PRINT'  THEN 'GET:/api/mpn/rest/**'
    -- mpp 액션별
    WHEN 'mpp:SEARCH' THEN 'GET:/api/mpp/rest/**'
    WHEN 'mpp:SAVE'   THEN 'POST:/api/mpp/rest/**,PUT:/api/mpp/rest/**,PATCH:/api/mpp/rest/**'
    WHEN 'mpp:DELETE' THEN 'DELETE:/api/mpp/rest/**'
    WHEN 'mpp:EXPORT' THEN 'GET:/api/mpp/rest/**'
    WHEN 'mpp:IMPORT' THEN 'POST:/api/mpp/rest/**'
    WHEN 'mpp:PRINT'  THEN 'GET:/api/mpp/rest/**'
    -- mqc 액션별
    WHEN 'mqc:SEARCH' THEN 'GET:/api/mqc/rest/**'
    WHEN 'mqc:SAVE'   THEN 'POST:/api/mqc/rest/**,PUT:/api/mqc/rest/**,PATCH:/api/mqc/rest/**'
    WHEN 'mqc:DELETE' THEN 'DELETE:/api/mqc/rest/**'
    WHEN 'mqc:EXPORT' THEN 'GET:/api/mqc/rest/**'
    WHEN 'mqc:IMPORT' THEN 'POST:/api/mqc/rest/**'
    WHEN 'mqc:PRINT'  THEN 'GET:/api/mqc/rest/**'
    -- mcm (admin 영역, OASIS 가 전부 POST 라 액션별 분리 어려움 — 광역 허용 + GET 추가)
    WHEN 'mcm:SEARCH' THEN 'POST:/api/mcm/oasis/**,GET:/api/mcm/**'
    WHEN 'mcm:SAVE'   THEN 'POST:/api/mcm/oasis/**,POST:/api/mcm/**,PUT:/api/mcm/**'
    WHEN 'mcm:DELETE' THEN 'POST:/api/mcm/oasis/**,DELETE:/api/mcm/**'
    WHEN 'mcm:EXPORT' THEN 'POST:/api/mcm/oasis/**,GET:/api/mcm/**'
    WHEN 'mcm:IMPORT' THEN 'POST:/api/mcm/oasis/**,POST:/api/mcm/**'
    WHEN 'mcm:PRINT'  THEN 'POST:/api/mcm/oasis/**,GET:/api/mcm/**'
    -- 기타 — 보존
    ELSE TB_SEC_PERM_BUTTON.ENDPOINT
  END
  FROM TB_SEC_PERM p JOIN TB_SEC_OBJ o ON p.OBJ_ID = o.OBJ_ID
  WHERE p.PERM_ID = TB_SEC_PERM_BUTTON.PERM_ID
)
WHERE ENDPOINT LIKE '/api/%' OR ENDPOINT LIKE '/oasis/%';

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
WHERE PERM_SCRIPT LIKE '%/api/%' OR PERM_SCRIPT LIKE '%/oasis/%';
