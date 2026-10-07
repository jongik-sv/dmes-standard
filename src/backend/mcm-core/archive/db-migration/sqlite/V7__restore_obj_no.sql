-- mcm-core V7__restore_obj_no.sql
-- 깨진 TB_SEC_OBJ.OBJ_NO 복구.
--
-- 배경:
--   - SecObjService.saveObjects 가 update 시 entity.setObjNo(row.get("objNo")) 를 무조건 실행했고
--     FE 의 OBJ 관리 form 은 objNo 입력 필드 자체가 없었다.
--   - 결과: 사용자가 OBJ 를 한 번이라도 저장하면 OBJ_NO 가 null 로 덮여
--     portal-shell sidebar 가 pageId 를 만들지 못해 메뉴 클릭이 silently 무시됨.
--
-- 본 마이그레이션은 DataInitializer.java 의 seed 매핑을 따라 OBJ_NO 가 비어있는 row 만 복원한다.
-- 안전성:
--   - OBJ_NO 가 NULL 또는 빈 문자열인 row 만 UPDATE — 사용자 정의 값은 건드리지 않음.

UPDATE TB_SEC_OBJ SET OBJ_NO = 'dashboard-overview'         WHERE OBJ_ID = 'OBJ_DASHBOARD'        AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'operations-queue'           WHERE OBJ_ID = 'OBJ_OP_QUEUE'         AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'user-management'            WHERE OBJ_ID = 'OBJ_USER_MGMT'        AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'role-management'            WHERE OBJ_ID = 'OBJ_ROLE_MGMT'        AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'permission-management'      WHERE OBJ_ID = 'OBJ_PERM_MGMT'        AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'object-management'          WHERE OBJ_ID = 'OBJ_OBJECT_MGMT'      AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'menu-management'            WHERE OBJ_ID = 'OBJ_MENU_MGMT'        AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'role-group-management'      WHERE OBJ_ID = 'OBJ_ROLE_GROUP_MGMT'  AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'code-master'                WHERE OBJ_ID = 'OBJ_CODE_MASTER'      AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'audit-log'                  WHERE OBJ_ID = 'OBJ_AUDIT_LOG'        AND (OBJ_NO IS NULL OR OBJ_NO = '');

UPDATE TB_SEC_OBJ SET OBJ_NO = 'plant'                      WHERE OBJ_ID = 'OBJ_PLANT'            AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'bom'                        WHERE OBJ_ID = 'OBJ_BOM'              AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'routing'                    WHERE OBJ_ID = 'OBJ_ROUTING'          AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'material'                   WHERE OBJ_ID = 'OBJ_MATERIAL'         AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'resource'                   WHERE OBJ_ID = 'OBJ_RESOURCE'         AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'workcenter'                 WHERE OBJ_ID = 'OBJ_WORKCENTER'       AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'calendar'                   WHERE OBJ_ID = 'OBJ_CALENDAR'         AND (OBJ_NO IS NULL OR OBJ_NO = '');

UPDATE TB_SEC_OBJ SET OBJ_NO = 'schedules'                  WHERE OBJ_ID = 'OBJ_SCHEDULES'        AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'assignment'                 WHERE OBJ_ID = 'OBJ_ASSIGNMENT'       AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'gantt'                      WHERE OBJ_ID = 'OBJ_GANTT'            AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'operation-dashboard'        WHERE OBJ_ID = 'OBJ_OP_DASHBOARD'     AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'profiles'                   WHERE OBJ_ID = 'OBJ_PROFILES'         AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'summary'                    WHERE OBJ_ID = 'OBJ_SUMMARY'          AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'exceptions'                 WHERE OBJ_ID = 'OBJ_SCH_EXCEPTIONS'   AND (OBJ_NO IS NULL OR OBJ_NO = '');

UPDATE TB_SEC_OBJ SET OBJ_NO = 'orders'                     WHERE OBJ_ID = 'OBJ_ORDERS'           AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'demands'                    WHERE OBJ_ID = 'OBJ_DEMANDS'          AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'run'                        WHERE OBJ_ID = 'OBJ_RUN'              AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'planned-orders'             WHERE OBJ_ID = 'OBJ_PLANNED_ORDERS'   AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'timeline'                   WHERE OBJ_ID = 'OBJ_TIMELINE'         AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'capacity'                   WHERE OBJ_ID = 'OBJ_CAPACITY'         AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'pegging'                    WHERE OBJ_ID = 'OBJ_PEGGING'          AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'exceptions'                 WHERE OBJ_ID = 'OBJ_PLN_EXCEPTIONS'   AND (OBJ_NO IS NULL OR OBJ_NO = '');

UPDATE TB_SEC_OBJ SET OBJ_NO = 'operation'                  WHERE OBJ_ID = 'OBJ_OPERATION'        AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'item-group'                 WHERE OBJ_ID = 'OBJ_ITEM_GROUP'       AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'resource-operation-mapping' WHERE OBJ_ID = 'OBJ_RES_OP_MAP'       AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'labor-deployment-plan'      WHERE OBJ_ID = 'OBJ_LABOR_PLAN'       AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'setup-matrix'               WHERE OBJ_ID = 'OBJ_SETUP_MATRIX'     AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'inventory'                  WHERE OBJ_ID = 'OBJ_INVENTORY'        AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'customer'                   WHERE OBJ_ID = 'OBJ_CUSTOMER'         AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'vendor'                     WHERE OBJ_ID = 'OBJ_VENDOR'           AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'batch'                      WHERE OBJ_ID = 'OBJ_BATCH'            AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'uom'                        WHERE OBJ_ID = 'OBJ_UOM'              AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'validation'                 WHERE OBJ_ID = 'OBJ_VALIDATION'       AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'impact-analysis'            WHERE OBJ_ID = 'OBJ_IMPACT'           AND (OBJ_NO IS NULL OR OBJ_NO = '');

UPDATE TB_SEC_OBJ SET OBJ_NO = 'version-compare'            WHERE OBJ_ID = 'OBJ_VERSION_COMPARE'  AND (OBJ_NO IS NULL OR OBJ_NO = '');

UPDATE TB_SEC_OBJ SET OBJ_NO = 'scenarios'                  WHERE OBJ_ID = 'OBJ_SCENARIOS'        AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'scenario-comparison'        WHERE OBJ_ID = 'OBJ_SCENARIO_CMP'     AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'kpi-dashboard'              WHERE OBJ_ID = 'OBJ_KPI_DASH'         AND (OBJ_NO IS NULL OR OBJ_NO = '');

UPDATE TB_SEC_OBJ SET OBJ_NO = 'freeze-zones'               WHERE OBJ_ID = 'OBJ_FREEZE_ZONES'     AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'urgent-orders'              WHERE OBJ_ID = 'OBJ_URGENT_ORDERS'    AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'equipment-downtimes'        WHERE OBJ_ID = 'OBJ_EQUIP_DOWNTIME'   AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'schedule-publish'           WHERE OBJ_ID = 'OBJ_SCH_PUBLISH'      AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'decision-log'               WHERE OBJ_ID = 'OBJ_DECISION_LOG'     AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'manual-adjustment'          WHERE OBJ_ID = 'OBJ_MANUAL_ADJ'       AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'firm-fence'                 WHERE OBJ_ID = 'OBJ_FIRM_FENCE'       AND (OBJ_NO IS NULL OR OBJ_NO = '');
UPDATE TB_SEC_OBJ SET OBJ_NO = 'performance'                WHERE OBJ_ID = 'OBJ_PERFORMANCE'      AND (OBJ_NO IS NULL OR OBJ_NO = '');

UPDATE TB_SEC_OBJ SET OBJ_NO = 'work-order'                 WHERE OBJ_ID = 'OBJ_MPP_WORK_ORDER'   AND (OBJ_NO IS NULL OR OBJ_NO = '');
