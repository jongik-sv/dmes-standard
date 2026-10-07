-- mcm-core V8__fix_obj_sys_cd.sql
-- TB_SEC_OBJ.SYS_CD 를 페이지의 실제 소속 모듈로 정정.
--
-- 배경:
--   - 기존 seed 가 모든 OBJ 를 SYS_CD='mcm' 으로 일괄 박아둠.
--   - FE strict 라우팅 도입 후 sysCd 가 페이지 실제 모듈과 다르면 화면이 안 뜬다.
--   - m-mcm/page-components 의 각 page.tsx 가 어떤 패키지에서 import 하는지 분석한 결과로
--     OBJ_NO 별 owner 모듈을 결정.
--
-- 안전성:
--   - WHERE 절에 OBJ_ID + 현재 SYS_CD='mcm' 조건을 둬 사용자가 이미 정정한 row 는 건드리지 않는다.

-- ─────────── mpn 페이지로 이관 ───────────
-- 마스터 데이터 (group="" — top-level, menu serviceUrl="/")
UPDATE TB_SEC_OBJ SET SYS_CD = 'mpn' WHERE OBJ_ID IN (
    'OBJ_PLANT', 'OBJ_BOM', 'OBJ_ROUTING', 'OBJ_MATERIAL', 'OBJ_RESOURCE',
    'OBJ_WORKCENTER', 'OBJ_CALENDAR', 'OBJ_OPERATION', 'OBJ_ITEM_GROUP',
    'OBJ_RES_OP_MAP', 'OBJ_LABOR_PLAN', 'OBJ_SETUP_MATRIX', 'OBJ_INVENTORY',
    'OBJ_CUSTOMER', 'OBJ_VENDOR', 'OBJ_BATCH', 'OBJ_UOM', 'OBJ_VALIDATION',
    'OBJ_IMPACT'
) AND SYS_CD = 'mcm';

-- 스케줄링 (group="scheduling")
UPDATE TB_SEC_OBJ SET SYS_CD = 'mpn' WHERE OBJ_ID IN (
    'OBJ_SCHEDULES', 'OBJ_ASSIGNMENT', 'OBJ_GANTT', 'OBJ_OP_DASHBOARD',
    'OBJ_PROFILES', 'OBJ_SUMMARY', 'OBJ_SCH_EXCEPTIONS', 'OBJ_VERSION_COMPARE'
) AND SYS_CD = 'mcm';

-- 생산계획 (group="planning")
UPDATE TB_SEC_OBJ SET SYS_CD = 'mpn' WHERE OBJ_ID IN (
    'OBJ_ORDERS', 'OBJ_DEMANDS', 'OBJ_RUN', 'OBJ_PLANNED_ORDERS',
    'OBJ_TIMELINE', 'OBJ_CAPACITY', 'OBJ_PEGGING', 'OBJ_PLN_EXCEPTIONS'
) AND SYS_CD = 'mcm';

-- 시뮬레이션 (group="simulation")
UPDATE TB_SEC_OBJ SET SYS_CD = 'mpn' WHERE OBJ_ID IN (
    'OBJ_SCENARIOS', 'OBJ_SCENARIO_CMP', 'OBJ_KPI_DASH'
) AND SYS_CD = 'mcm';

-- 운영 (group="operation")
UPDATE TB_SEC_OBJ SET SYS_CD = 'mpn' WHERE OBJ_ID IN (
    'OBJ_FREEZE_ZONES', 'OBJ_URGENT_ORDERS', 'OBJ_EQUIP_DOWNTIME',
    'OBJ_SCH_PUBLISH', 'OBJ_DECISION_LOG', 'OBJ_MANUAL_ADJ',
    'OBJ_FIRM_FENCE', 'OBJ_PERFORMANCE'
) AND SYS_CD = 'mcm';

-- ─────────── mpp 페이지로 이관 ───────────
UPDATE TB_SEC_OBJ SET SYS_CD = 'mpp' WHERE OBJ_ID IN (
    'OBJ_MPP_WORK_ORDER'
) AND SYS_CD = 'mcm';

-- ─────────── mcm 으로 잔존하는 것들 (변경 없음) ───────────
-- OBJ_DASHBOARD, OBJ_OP_QUEUE, OBJ_USER_MGMT, OBJ_ROLE_MGMT, OBJ_PERM_MGMT,
-- OBJ_OBJECT_MGMT, OBJ_MENU_MGMT, OBJ_ROLE_GROUP_MGMT, OBJ_CODE_MASTER, OBJ_AUDIT_LOG
