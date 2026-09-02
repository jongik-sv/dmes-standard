-- mcm-core 옵션 시드 (OASIS 사이트용) — TB_SEC_OBJ.DEFAULT_ACTIONS_JSON 채움
-- 적용 방법:
--   사이트 application.yml 에서
--     spring.flyway.locations: classpath:db/migration/sqlite, classpath:db/seed/oasis
--   추가하면 Flyway 가 자동 실행. Flyway 미사용 사이트는 SQL 을 수동 적용.
--
-- 정책: 시드 endpoint 는 OASIS BPMN 컨벤션 기준 (/oasis/{serviceId}/{action}).
-- REST 사이트는 별도 시드 (db/seed/rest 등) 를 작성해서 활용.

UPDATE TB_SEC_OBJ
SET DEFAULT_ACTIONS_JSON = '[' ||
    '{"action":"SEARCH","label":"조회","endpoint":"/oasis/secUser/search","httpMethod":"POST"},' ||
    '{"action":"SAVE","label":"저장","endpoint":"/oasis/secUser/save","httpMethod":"POST"},' ||
    '{"action":"RESET_PW","label":"비번재설정","endpoint":"/oasis/secUser/resetPassword","httpMethod":"POST"}' ||
']'
WHERE OBJ_ID = 'user-management';

UPDATE TB_SEC_OBJ
SET DEFAULT_ACTIONS_JSON = '[' ||
    '{"action":"SEARCH","label":"조회","endpoint":"/oasis/secRole/search","httpMethod":"POST"},' ||
    '{"action":"SAVE","label":"저장","endpoint":"/oasis/secRole/save","httpMethod":"POST"}' ||
']'
WHERE OBJ_ID = 'role-management';

UPDATE TB_SEC_OBJ
SET DEFAULT_ACTIONS_JSON = '[' ||
    '{"action":"SEARCH","label":"조회","endpoint":"/oasis/secPerm/search","httpMethod":"POST"},' ||
    '{"action":"SAVE","label":"저장","endpoint":"/oasis/secPerm/save","httpMethod":"POST"},' ||
    '{"action":"SAVE_BUTTONS","label":"버튼저장","endpoint":"/oasis/secPerm/saveButtons","httpMethod":"POST"}' ||
']'
WHERE OBJ_ID = 'permission-management';

UPDATE TB_SEC_OBJ
SET DEFAULT_ACTIONS_JSON = '[' ||
    '{"action":"SEARCH","label":"조회","endpoint":"/oasis/secObj/search","httpMethod":"POST"},' ||
    '{"action":"SAVE","label":"저장","endpoint":"/oasis/secObj/save","httpMethod":"POST"}' ||
']'
WHERE OBJ_ID = 'object-management';

UPDATE TB_SEC_OBJ
SET DEFAULT_ACTIONS_JSON = '[' ||
    '{"action":"SEARCH","label":"조회","endpoint":"/oasis/secMenu/search","httpMethod":"POST"},' ||
    '{"action":"SAVE","label":"저장","endpoint":"/oasis/secMenu/save","httpMethod":"POST"}' ||
']'
WHERE OBJ_ID = 'menu-management';
