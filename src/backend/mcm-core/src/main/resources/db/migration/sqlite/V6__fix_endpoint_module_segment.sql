-- mcm-core V6__fix_endpoint_module_segment.sql
-- 권한 관리 화면의 자동 조립이 잘못된 형식 (`/oasis/{module}/{objId}/...`) 으로 endpoint 를 박아둔 데이터 정정.
--
-- 배경:
--   - BFF 가 `/api/{module}/` prefix 를 떼고 BE 로 forward 하므로 BE-side path 에는 모듈 segment 가 없다.
--   - 정답: `/oasis/{serviceId}/{action}` (UI 쪽 자동 조립 식도 이 PR 에서 정정됨)
--   - 잘못된 데이터는 OBJ 신규 등록 시 ObjectForm 의 자동 조립이 `/oasis/${moduleCode}/${objId}` 였던 시기의 잔재.
--
-- 안전성:
--   - REPLACE 로 모듈 segment 만 정확히 제거 → 이미 올바른 행은 영향 없음.
--   - legacy 5개 OBJ (OBJ_USER_MGMT 등) 의 ENDPOINT_PREFIX 는 OasisDefaultActionsSeeder 가
--     `/oasis/secUser` 같은 정답 형식으로 박아두므로 본 마이그레이션 영향 없음.

-- ============================================================
--  TB_SEC_OBJ.ENDPOINT_PREFIX — `/oasis/{module}/{objId}` → `/oasis/{objId}`
-- ============================================================

UPDATE TB_SEC_OBJ SET ENDPOINT_PREFIX = REPLACE(ENDPOINT_PREFIX, '/oasis/mcm/', '/oasis/') WHERE ENDPOINT_PREFIX LIKE '/oasis/mcm/%';
UPDATE TB_SEC_OBJ SET ENDPOINT_PREFIX = REPLACE(ENDPOINT_PREFIX, '/oasis/mpn/', '/oasis/') WHERE ENDPOINT_PREFIX LIKE '/oasis/mpn/%';
UPDATE TB_SEC_OBJ SET ENDPOINT_PREFIX = REPLACE(ENDPOINT_PREFIX, '/oasis/mpp/', '/oasis/') WHERE ENDPOINT_PREFIX LIKE '/oasis/mpp/%';
UPDATE TB_SEC_OBJ SET ENDPOINT_PREFIX = REPLACE(ENDPOINT_PREFIX, '/oasis/mqc/', '/oasis/') WHERE ENDPOINT_PREFIX LIKE '/oasis/mqc/%';
UPDATE TB_SEC_OBJ SET ENDPOINT_PREFIX = REPLACE(ENDPOINT_PREFIX, '/oasis/mes/', '/oasis/') WHERE ENDPOINT_PREFIX LIKE '/oasis/mes/%';

-- ============================================================
--  TB_SEC_PERM_BUTTON.ENDPOINT — `/oasis/{module}/{objId}/{action}` → `/oasis/{objId}/{action}`
-- ============================================================

UPDATE TB_SEC_PERM_BUTTON SET ENDPOINT = REPLACE(ENDPOINT, '/oasis/mcm/', '/oasis/') WHERE ENDPOINT LIKE '/oasis/mcm/%';
UPDATE TB_SEC_PERM_BUTTON SET ENDPOINT = REPLACE(ENDPOINT, '/oasis/mpn/', '/oasis/') WHERE ENDPOINT LIKE '/oasis/mpn/%';
UPDATE TB_SEC_PERM_BUTTON SET ENDPOINT = REPLACE(ENDPOINT, '/oasis/mpp/', '/oasis/') WHERE ENDPOINT LIKE '/oasis/mpp/%';
UPDATE TB_SEC_PERM_BUTTON SET ENDPOINT = REPLACE(ENDPOINT, '/oasis/mqc/', '/oasis/') WHERE ENDPOINT LIKE '/oasis/mqc/%';
UPDATE TB_SEC_PERM_BUTTON SET ENDPOINT = REPLACE(ENDPOINT, '/oasis/mes/', '/oasis/') WHERE ENDPOINT LIKE '/oasis/mes/%';
