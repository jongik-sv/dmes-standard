-- ============================================================================
-- CARAVANUSER 컬럼 순서 재배치 — 자동 생성 파일. 직접 고치지 말고 생성기를 다시 돌린다.
--   생성기: node scripts/db-order/gen.mjs relocate --base <기존 DB 기준 ref> --write
--   규칙: PK(PK 제약 순서) → 엔티티 필드 선언 순서 → 버전(VER·AUD_VER·ROW_VERSION) → 감사 8개(scripts/db-order/lib/rule.mjs)
-- 방식: 표마다 앞에 둘 PK 컬럼만 남기고 나머지를 INVISIBLE 로 숨긴 뒤 규칙 순서대로 하나씩 VISIBLE 로 되돌린다.
--   VISIBLE 로 돌아온 컬럼은 맨 끝에 붙으므로 결과 = 규칙 순서. 데이터·타입·NULL·기본값·제약·인덱스는 그대로다.
--   새 DB(V1 부터 적용)·기존 DB 모두 이 파일 뒤 규칙 순서가 된다. 다시 적용해도 결과가 같다(멱등).
-- 운영(Flyway 끔): DBA 가 앞 V 파일 다음 차례로 이 파일을 그대로 적용한다.
-- ============================================================================

-- TB_CARAVAN_TOPICS: 앞에 남김 TOPIC_ID,BIZ_SYSTEM
alter table TB_CARAVAN_TOPICS modify (TOPIC_DESC invisible, GROUP_ID invisible, SEND_MODULE_ID invisible, RECV_MODULE_ID invisible, USE_TP invisible, STATUS invisible, ERROR_AT invisible, ERROR_OFFSET invisible, LAST_ERROR_CODE invisible, LAST_ERROR_MSG invisible, ASSIGNED_HOST invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_CARAVAN_TOPICS modify (TOPIC_DESC visible);
alter table TB_CARAVAN_TOPICS modify (GROUP_ID visible);
alter table TB_CARAVAN_TOPICS modify (SEND_MODULE_ID visible);
alter table TB_CARAVAN_TOPICS modify (RECV_MODULE_ID visible);
alter table TB_CARAVAN_TOPICS modify (USE_TP visible);
alter table TB_CARAVAN_TOPICS modify (STATUS visible);
alter table TB_CARAVAN_TOPICS modify (ERROR_AT visible);
alter table TB_CARAVAN_TOPICS modify (ERROR_OFFSET visible);
alter table TB_CARAVAN_TOPICS modify (LAST_ERROR_CODE visible);
alter table TB_CARAVAN_TOPICS modify (LAST_ERROR_MSG visible);
alter table TB_CARAVAN_TOPICS modify (ASSIGNED_HOST visible);
alter table TB_CARAVAN_TOPICS modify (VER visible);
alter table TB_CARAVAN_TOPICS modify (C_USR_ID visible);
alter table TB_CARAVAN_TOPICS modify (C_AT visible);
alter table TB_CARAVAN_TOPICS modify (C_SVC_ID visible);
alter table TB_CARAVAN_TOPICS modify (C_PGM_ID visible);
alter table TB_CARAVAN_TOPICS modify (U_USR_ID visible);
alter table TB_CARAVAN_TOPICS modify (U_AT visible);
alter table TB_CARAVAN_TOPICS modify (U_SVC_ID visible);
alter table TB_CARAVAN_TOPICS modify (U_PGM_ID visible);

-- TB_CARAVAN_TC_ERROR: 앞에 남김 SQ_VAL
alter table TB_CARAVAN_TC_ERROR modify (INTERFACE_PROTOCOL invisible, TRANSACTION_CODE invisible, INTERFACE_ID invisible, INTERFACE_MSG invisible, ERROR_TYPE invisible, ERROR_CODE invisible, ERROR_MSG invisible, ERROR_STATUS_CODE invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_CARAVAN_TC_ERROR modify (INTERFACE_PROTOCOL visible);
alter table TB_CARAVAN_TC_ERROR modify (TRANSACTION_CODE visible);
alter table TB_CARAVAN_TC_ERROR modify (INTERFACE_ID visible);
alter table TB_CARAVAN_TC_ERROR modify (INTERFACE_MSG visible);
alter table TB_CARAVAN_TC_ERROR modify (ERROR_TYPE visible);
alter table TB_CARAVAN_TC_ERROR modify (ERROR_CODE visible);
alter table TB_CARAVAN_TC_ERROR modify (ERROR_MSG visible);
alter table TB_CARAVAN_TC_ERROR modify (ERROR_STATUS_CODE visible);
alter table TB_CARAVAN_TC_ERROR modify (VER visible);
alter table TB_CARAVAN_TC_ERROR modify (C_USR_ID visible);
alter table TB_CARAVAN_TC_ERROR modify (C_AT visible);
alter table TB_CARAVAN_TC_ERROR modify (C_SVC_ID visible);
alter table TB_CARAVAN_TC_ERROR modify (C_PGM_ID visible);
alter table TB_CARAVAN_TC_ERROR modify (U_USR_ID visible);
alter table TB_CARAVAN_TC_ERROR modify (U_AT visible);
alter table TB_CARAVAN_TC_ERROR modify (U_SVC_ID visible);
alter table TB_CARAVAN_TC_ERROR modify (U_PGM_ID visible);

-- TB_CARAVAN_HUB_CONFIG: 앞에 남김 TOPIC_ID,DIRECTION
alter table TB_CARAVAN_HUB_CONFIG modify (INTEGRATION_TYPE invisible, POLLING_INTERVAL_MS invisible, DB_TABLE_NAME invisible, DB_SCHEMA invisible, FILE_PATH invisible, BACKUP_PATH invisible, FTP_HOST invisible, FTP_PORT invisible, FTP_USER invisible, FTP_PASSWORD invisible, HTTP_URL invisible, HTTP_METHOD invisible, HTTP_HEADERS invisible, USE_YN invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_CARAVAN_HUB_CONFIG modify (INTEGRATION_TYPE visible);
alter table TB_CARAVAN_HUB_CONFIG modify (POLLING_INTERVAL_MS visible);
alter table TB_CARAVAN_HUB_CONFIG modify (DB_TABLE_NAME visible);
alter table TB_CARAVAN_HUB_CONFIG modify (DB_SCHEMA visible);
alter table TB_CARAVAN_HUB_CONFIG modify (FILE_PATH visible);
alter table TB_CARAVAN_HUB_CONFIG modify (BACKUP_PATH visible);
alter table TB_CARAVAN_HUB_CONFIG modify (FTP_HOST visible);
alter table TB_CARAVAN_HUB_CONFIG modify (FTP_PORT visible);
alter table TB_CARAVAN_HUB_CONFIG modify (FTP_USER visible);
alter table TB_CARAVAN_HUB_CONFIG modify (FTP_PASSWORD visible);
alter table TB_CARAVAN_HUB_CONFIG modify (HTTP_URL visible);
alter table TB_CARAVAN_HUB_CONFIG modify (HTTP_METHOD visible);
alter table TB_CARAVAN_HUB_CONFIG modify (HTTP_HEADERS visible);
alter table TB_CARAVAN_HUB_CONFIG modify (USE_YN visible);
alter table TB_CARAVAN_HUB_CONFIG modify (VER visible);
alter table TB_CARAVAN_HUB_CONFIG modify (C_USR_ID visible);
alter table TB_CARAVAN_HUB_CONFIG modify (C_AT visible);
alter table TB_CARAVAN_HUB_CONFIG modify (C_SVC_ID visible);
alter table TB_CARAVAN_HUB_CONFIG modify (C_PGM_ID visible);
alter table TB_CARAVAN_HUB_CONFIG modify (U_USR_ID visible);
alter table TB_CARAVAN_HUB_CONFIG modify (U_AT visible);
alter table TB_CARAVAN_HUB_CONFIG modify (U_SVC_ID visible);
alter table TB_CARAVAN_HUB_CONFIG modify (U_PGM_ID visible);

-- TB_CARAVAN_APPHOST: 앞에 남김 APP_HOST_ID,WORKS_CD
alter table TB_CARAVAN_APPHOST modify (APP_HOST_NM invisible, APP_HOST_DESC invisible, APP_HOST_URL invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_CARAVAN_APPHOST modify (APP_HOST_NM visible);
alter table TB_CARAVAN_APPHOST modify (APP_HOST_DESC visible);
alter table TB_CARAVAN_APPHOST modify (APP_HOST_URL visible);
alter table TB_CARAVAN_APPHOST modify (VER visible);
alter table TB_CARAVAN_APPHOST modify (C_USR_ID visible);
alter table TB_CARAVAN_APPHOST modify (C_AT visible);
alter table TB_CARAVAN_APPHOST modify (C_SVC_ID visible);
alter table TB_CARAVAN_APPHOST modify (C_PGM_ID visible);
alter table TB_CARAVAN_APPHOST modify (U_USR_ID visible);
alter table TB_CARAVAN_APPHOST modify (U_AT visible);
alter table TB_CARAVAN_APPHOST modify (U_SVC_ID visible);
alter table TB_CARAVAN_APPHOST modify (U_PGM_ID visible);
