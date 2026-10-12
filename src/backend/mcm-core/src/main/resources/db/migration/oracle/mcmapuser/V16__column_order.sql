-- ============================================================================
-- MCMAPUSER 컬럼 순서 재배치 — 자동 생성 파일. 직접 고치지 말고 생성기를 다시 돌린다.
--   생성기: node scripts/db-order/gen.mjs relocate --base <기존 DB 기준 ref> --write
--   규칙: PK(PK 제약 순서) → 엔티티 필드 선언 순서 → 버전(VER·AUD_VER·ROW_VERSION) → 감사 8개(scripts/db-order/lib/rule.mjs)
-- 방식: 표마다 앞에 둘 PK 컬럼만 남기고 나머지를 INVISIBLE 로 숨긴 뒤 규칙 순서대로 하나씩 VISIBLE 로 되돌린다.
--   VISIBLE 로 돌아온 컬럼은 맨 끝에 붙으므로 결과 = 규칙 순서. 데이터·타입·NULL·기본값·제약·인덱스는 그대로다.
--   새 DB(V1 부터 적용)·기존 DB 모두 이 파일 뒤 규칙 순서가 된다. 다시 적용해도 결과가 같다(멱등).
-- 운영(Flyway 끔): DBA 가 앞 V 파일 다음 차례로 이 파일을 그대로 적용한다.
-- ============================================================================

-- TB_MCM_DEPT_INFO: 앞에 남김 DEPT_CD
alter table TB_MCM_DEPT_INFO modify (DEPT_NM invisible, DEPT_NM_EN invisible, UPPER_DEPT_CD invisible, USE_TP invisible, START_ACTIVE_DATE invisible, END_ACTIVE_DATE invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_DEPT_INFO modify (DEPT_NM visible);
alter table TB_MCM_DEPT_INFO modify (DEPT_NM_EN visible);
alter table TB_MCM_DEPT_INFO modify (UPPER_DEPT_CD visible);
alter table TB_MCM_DEPT_INFO modify (USE_TP visible);
alter table TB_MCM_DEPT_INFO modify (START_ACTIVE_DATE visible);
alter table TB_MCM_DEPT_INFO modify (END_ACTIVE_DATE visible);
alter table TB_MCM_DEPT_INFO modify (VER visible);
alter table TB_MCM_DEPT_INFO modify (C_USR_ID visible);
alter table TB_MCM_DEPT_INFO modify (C_AT visible);
alter table TB_MCM_DEPT_INFO modify (C_SVC_ID visible);
alter table TB_MCM_DEPT_INFO modify (C_PGM_ID visible);
alter table TB_MCM_DEPT_INFO modify (U_USR_ID visible);
alter table TB_MCM_DEPT_INFO modify (U_AT visible);
alter table TB_MCM_DEPT_INFO modify (U_SVC_ID visible);
alter table TB_MCM_DEPT_INFO modify (U_PGM_ID visible);

-- TB_MCM_MOM_FORMAT_LIST: 앞에 남김 FORMAT_VER,FORMAT_ID
alter table TB_MCM_MOM_FORMAT_LIST modify (FORMAT_NM invisible, FORMAT_DESC invisible, USE_TP invisible, START_ACTIVE_DATE invisible, END_ACTIVE_DATE invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_MOM_FORMAT_LIST modify (FORMAT_NM visible);
alter table TB_MCM_MOM_FORMAT_LIST modify (FORMAT_DESC visible);
alter table TB_MCM_MOM_FORMAT_LIST modify (USE_TP visible);
alter table TB_MCM_MOM_FORMAT_LIST modify (START_ACTIVE_DATE visible);
alter table TB_MCM_MOM_FORMAT_LIST modify (END_ACTIVE_DATE visible);
alter table TB_MCM_MOM_FORMAT_LIST modify (VER visible);
alter table TB_MCM_MOM_FORMAT_LIST modify (C_USR_ID visible);
alter table TB_MCM_MOM_FORMAT_LIST modify (C_AT visible);
alter table TB_MCM_MOM_FORMAT_LIST modify (C_SVC_ID visible);
alter table TB_MCM_MOM_FORMAT_LIST modify (C_PGM_ID visible);
alter table TB_MCM_MOM_FORMAT_LIST modify (U_USR_ID visible);
alter table TB_MCM_MOM_FORMAT_LIST modify (U_AT visible);
alter table TB_MCM_MOM_FORMAT_LIST modify (U_SVC_ID visible);
alter table TB_MCM_MOM_FORMAT_LIST modify (U_PGM_ID visible);

-- TB_MCM_MOM_INTERFACES: 앞에 남김 INTERFACE_ID,TRANSACTION_CODE
alter table TB_MCM_MOM_INTERFACES modify (INTERFACE_DESC invisible, INTERFACE_PROTOCOL invisible, FORMAT_ID invisible, SEND_WORKS_CD invisible, SEND_MODULE_ID invisible, SEND_IF_TP invisible, SEND_TABLE_ID invisible, RECV_WORKS_CD invisible, RECV_MODULE_ID invisible, RECV_IF_TP invisible, RECV_TABLE_ID invisible, USE_TP invisible, START_ACTIVE_DATE invisible, END_ACTIVE_DATE invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_MOM_INTERFACES modify (INTERFACE_DESC visible);
alter table TB_MCM_MOM_INTERFACES modify (INTERFACE_PROTOCOL visible);
alter table TB_MCM_MOM_INTERFACES modify (FORMAT_ID visible);
alter table TB_MCM_MOM_INTERFACES modify (SEND_WORKS_CD visible);
alter table TB_MCM_MOM_INTERFACES modify (SEND_MODULE_ID visible);
alter table TB_MCM_MOM_INTERFACES modify (SEND_IF_TP visible);
alter table TB_MCM_MOM_INTERFACES modify (SEND_TABLE_ID visible);
alter table TB_MCM_MOM_INTERFACES modify (RECV_WORKS_CD visible);
alter table TB_MCM_MOM_INTERFACES modify (RECV_MODULE_ID visible);
alter table TB_MCM_MOM_INTERFACES modify (RECV_IF_TP visible);
alter table TB_MCM_MOM_INTERFACES modify (RECV_TABLE_ID visible);
alter table TB_MCM_MOM_INTERFACES modify (USE_TP visible);
alter table TB_MCM_MOM_INTERFACES modify (START_ACTIVE_DATE visible);
alter table TB_MCM_MOM_INTERFACES modify (END_ACTIVE_DATE visible);
alter table TB_MCM_MOM_INTERFACES modify (VER visible);
alter table TB_MCM_MOM_INTERFACES modify (C_USR_ID visible);
alter table TB_MCM_MOM_INTERFACES modify (C_AT visible);
alter table TB_MCM_MOM_INTERFACES modify (C_SVC_ID visible);
alter table TB_MCM_MOM_INTERFACES modify (C_PGM_ID visible);
alter table TB_MCM_MOM_INTERFACES modify (U_USR_ID visible);
alter table TB_MCM_MOM_INTERFACES modify (U_AT visible);
alter table TB_MCM_MOM_INTERFACES modify (U_SVC_ID visible);
alter table TB_MCM_MOM_INTERFACES modify (U_PGM_ID visible);

-- TB_MCM_MOM_TC_ERROR: 앞에 남김 SQ_VAL
alter table TB_MCM_MOM_TC_ERROR modify (TRANSACTION_CODE invisible, INTERFACE_ID invisible, INTERFACE_PROTOCOL invisible, INTERFACE_MSG invisible, KEY_DATA1 invisible, KEY_DATA2 invisible, KEY_DATA3 invisible, ERROR_TYPE invisible, ERROR_CODE invisible, ERROR_MSG invisible, ERROR_STATUS_CODE invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_MOM_TC_ERROR modify (TRANSACTION_CODE visible);
alter table TB_MCM_MOM_TC_ERROR modify (INTERFACE_ID visible);
alter table TB_MCM_MOM_TC_ERROR modify (INTERFACE_PROTOCOL visible);
alter table TB_MCM_MOM_TC_ERROR modify (INTERFACE_MSG visible);
alter table TB_MCM_MOM_TC_ERROR modify (KEY_DATA1 visible);
alter table TB_MCM_MOM_TC_ERROR modify (KEY_DATA2 visible);
alter table TB_MCM_MOM_TC_ERROR modify (KEY_DATA3 visible);
alter table TB_MCM_MOM_TC_ERROR modify (ERROR_TYPE visible);
alter table TB_MCM_MOM_TC_ERROR modify (ERROR_CODE visible);
alter table TB_MCM_MOM_TC_ERROR modify (ERROR_MSG visible);
alter table TB_MCM_MOM_TC_ERROR modify (ERROR_STATUS_CODE visible);
alter table TB_MCM_MOM_TC_ERROR modify (VER visible);
alter table TB_MCM_MOM_TC_ERROR modify (C_USR_ID visible);
alter table TB_MCM_MOM_TC_ERROR modify (C_AT visible);
alter table TB_MCM_MOM_TC_ERROR modify (C_SVC_ID visible);
alter table TB_MCM_MOM_TC_ERROR modify (C_PGM_ID visible);
alter table TB_MCM_MOM_TC_ERROR modify (U_USR_ID visible);
alter table TB_MCM_MOM_TC_ERROR modify (U_AT visible);
alter table TB_MCM_MOM_TC_ERROR modify (U_SVC_ID visible);
alter table TB_MCM_MOM_TC_ERROR modify (U_PGM_ID visible);

-- TB_MCM_MOM_TC_LIST: 앞에 남김 TRANSACTION_CODE
alter table TB_MCM_MOM_TC_LIST modify (TRANSACTION_NM invisible, TRANSACTION_DESC invisible, FORMAT_ID invisible, USE_TP invisible, START_ACTIVE_DATE invisible, END_ACTIVE_DATE invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_MOM_TC_LIST modify (TRANSACTION_NM visible);
alter table TB_MCM_MOM_TC_LIST modify (TRANSACTION_DESC visible);
alter table TB_MCM_MOM_TC_LIST modify (FORMAT_ID visible);
alter table TB_MCM_MOM_TC_LIST modify (USE_TP visible);
alter table TB_MCM_MOM_TC_LIST modify (START_ACTIVE_DATE visible);
alter table TB_MCM_MOM_TC_LIST modify (END_ACTIVE_DATE visible);
alter table TB_MCM_MOM_TC_LIST modify (VER visible);
alter table TB_MCM_MOM_TC_LIST modify (C_USR_ID visible);
alter table TB_MCM_MOM_TC_LIST modify (C_AT visible);
alter table TB_MCM_MOM_TC_LIST modify (C_SVC_ID visible);
alter table TB_MCM_MOM_TC_LIST modify (C_PGM_ID visible);
alter table TB_MCM_MOM_TC_LIST modify (U_USR_ID visible);
alter table TB_MCM_MOM_TC_LIST modify (U_AT visible);
alter table TB_MCM_MOM_TC_LIST modify (U_SVC_ID visible);
alter table TB_MCM_MOM_TC_LIST modify (U_PGM_ID visible);

-- TB_MCM_MOM_TC_SEND: 앞에 남김 SEND_SQ_VAL
alter table TB_MCM_MOM_TC_SEND modify (ERR_SQ_VAL invisible, TRANSACTION_CODE invisible, INTERFACE_ID invisible, INTERFACE_MSG invisible, SEND_RESULT invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_MOM_TC_SEND modify (ERR_SQ_VAL visible);
alter table TB_MCM_MOM_TC_SEND modify (TRANSACTION_CODE visible);
alter table TB_MCM_MOM_TC_SEND modify (INTERFACE_ID visible);
alter table TB_MCM_MOM_TC_SEND modify (INTERFACE_MSG visible);
alter table TB_MCM_MOM_TC_SEND modify (SEND_RESULT visible);
alter table TB_MCM_MOM_TC_SEND modify (VER visible);
alter table TB_MCM_MOM_TC_SEND modify (C_USR_ID visible);
alter table TB_MCM_MOM_TC_SEND modify (C_AT visible);
alter table TB_MCM_MOM_TC_SEND modify (C_SVC_ID visible);
alter table TB_MCM_MOM_TC_SEND modify (C_PGM_ID visible);
alter table TB_MCM_MOM_TC_SEND modify (U_USR_ID visible);
alter table TB_MCM_MOM_TC_SEND modify (U_AT visible);
alter table TB_MCM_MOM_TC_SEND modify (U_SVC_ID visible);
alter table TB_MCM_MOM_TC_SEND modify (U_PGM_ID visible);

-- TB_MCM_MOM_TC_SKIP: 앞에 남김 TRANSACTION_CODE
alter table TB_MCM_MOM_TC_SKIP modify (SKIP_LEVEL invisible, USE_TP invisible, START_ACTIVE_DATE invisible, END_ACTIVE_DATE invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_MOM_TC_SKIP modify (SKIP_LEVEL visible);
alter table TB_MCM_MOM_TC_SKIP modify (USE_TP visible);
alter table TB_MCM_MOM_TC_SKIP modify (START_ACTIVE_DATE visible);
alter table TB_MCM_MOM_TC_SKIP modify (END_ACTIVE_DATE visible);
alter table TB_MCM_MOM_TC_SKIP modify (VER visible);
alter table TB_MCM_MOM_TC_SKIP modify (C_USR_ID visible);
alter table TB_MCM_MOM_TC_SKIP modify (C_AT visible);
alter table TB_MCM_MOM_TC_SKIP modify (C_SVC_ID visible);
alter table TB_MCM_MOM_TC_SKIP modify (C_PGM_ID visible);
alter table TB_MCM_MOM_TC_SKIP modify (U_USR_ID visible);
alter table TB_MCM_MOM_TC_SKIP modify (U_AT visible);
alter table TB_MCM_MOM_TC_SKIP modify (U_SVC_ID visible);
alter table TB_MCM_MOM_TC_SKIP modify (U_PGM_ID visible);

-- TB_MCM_NOTICE: 앞에 남김 NOTICE_ID
alter table TB_MCM_NOTICE modify (TITLE invisible, CONTENT invisible, CONTENT_FORMAT invisible, NOTICE_CATEGORY invisible, PIN_YN invisible, TARGET_SCOPE invisible, NOTICE_STATUS invisible, POST_START_DT invisible, POST_END_DT invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_NOTICE modify (TITLE visible);
alter table TB_MCM_NOTICE modify (CONTENT visible);
alter table TB_MCM_NOTICE modify (CONTENT_FORMAT visible);
alter table TB_MCM_NOTICE modify (NOTICE_CATEGORY visible);
alter table TB_MCM_NOTICE modify (PIN_YN visible);
alter table TB_MCM_NOTICE modify (TARGET_SCOPE visible);
alter table TB_MCM_NOTICE modify (NOTICE_STATUS visible);
alter table TB_MCM_NOTICE modify (POST_START_DT visible);
alter table TB_MCM_NOTICE modify (POST_END_DT visible);
alter table TB_MCM_NOTICE modify (VER visible);
alter table TB_MCM_NOTICE modify (C_USR_ID visible);
alter table TB_MCM_NOTICE modify (C_AT visible);
alter table TB_MCM_NOTICE modify (C_SVC_ID visible);
alter table TB_MCM_NOTICE modify (C_PGM_ID visible);
alter table TB_MCM_NOTICE modify (U_USR_ID visible);
alter table TB_MCM_NOTICE modify (U_AT visible);
alter table TB_MCM_NOTICE modify (U_SVC_ID visible);
alter table TB_MCM_NOTICE modify (U_PGM_ID visible);

-- TB_MCM_NOTICE_TARGET: 앞에 남김 NOTICE_ID,ROLE_ID
alter table TB_MCM_NOTICE_TARGET modify (VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_NOTICE_TARGET modify (VER visible);
alter table TB_MCM_NOTICE_TARGET modify (C_USR_ID visible);
alter table TB_MCM_NOTICE_TARGET modify (C_AT visible);
alter table TB_MCM_NOTICE_TARGET modify (C_SVC_ID visible);
alter table TB_MCM_NOTICE_TARGET modify (C_PGM_ID visible);
alter table TB_MCM_NOTICE_TARGET modify (U_USR_ID visible);
alter table TB_MCM_NOTICE_TARGET modify (U_AT visible);
alter table TB_MCM_NOTICE_TARGET modify (U_SVC_ID visible);
alter table TB_MCM_NOTICE_TARGET modify (U_PGM_ID visible);

-- TB_MCM_SEC_MENU: 앞에 남김 MENU_ID
alter table TB_MCM_SEC_MENU modify (MENU_SEQ invisible, FULL_SEQ invisible, MENU_NM invisible, MENU_DESC invisible, MENU_TP invisible, OBJECT_ID invisible, USE_TP invisible, START_ACTIVE_DATE invisible, END_ACTIVE_DATE invisible, MENU_VIEW_YN invisible, PARENT_MENU_ID invisible, MENU_PARAM1 invisible, MENU_PARAM2 invisible, MENU_PARAM3 invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_MENU modify (MENU_SEQ visible);
alter table TB_MCM_SEC_MENU modify (FULL_SEQ visible);
alter table TB_MCM_SEC_MENU modify (MENU_NM visible);
alter table TB_MCM_SEC_MENU modify (MENU_DESC visible);
alter table TB_MCM_SEC_MENU modify (MENU_TP visible);
alter table TB_MCM_SEC_MENU modify (OBJECT_ID visible);
alter table TB_MCM_SEC_MENU modify (USE_TP visible);
alter table TB_MCM_SEC_MENU modify (START_ACTIVE_DATE visible);
alter table TB_MCM_SEC_MENU modify (END_ACTIVE_DATE visible);
alter table TB_MCM_SEC_MENU modify (MENU_VIEW_YN visible);
alter table TB_MCM_SEC_MENU modify (PARENT_MENU_ID visible);
alter table TB_MCM_SEC_MENU modify (MENU_PARAM1 visible);
alter table TB_MCM_SEC_MENU modify (MENU_PARAM2 visible);
alter table TB_MCM_SEC_MENU modify (MENU_PARAM3 visible);
alter table TB_MCM_SEC_MENU modify (VER visible);
alter table TB_MCM_SEC_MENU modify (C_USR_ID visible);
alter table TB_MCM_SEC_MENU modify (C_AT visible);
alter table TB_MCM_SEC_MENU modify (C_SVC_ID visible);
alter table TB_MCM_SEC_MENU modify (C_PGM_ID visible);
alter table TB_MCM_SEC_MENU modify (U_USR_ID visible);
alter table TB_MCM_SEC_MENU modify (U_AT visible);
alter table TB_MCM_SEC_MENU modify (U_SVC_ID visible);
alter table TB_MCM_SEC_MENU modify (U_PGM_ID visible);

-- TB_MCM_SEC_OBJ: 앞에 남김 OBJECT_ID
alter table TB_MCM_SEC_OBJ modify (OBJECT_NM invisible, PROGRAM_DESC invisible, SYSTEM_CODE invisible, OBJECT_TYPE invisible, SERVICE invisible, USE_TP invisible, ACCESS_TP invisible, FORM_URL invisible, OUT_ACCESS_IP invisible, PARAM invisible, START_ACTIVE_DATE invisible, END_ACTIVE_DATE invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_OBJ modify (OBJECT_NM visible);
alter table TB_MCM_SEC_OBJ modify (PROGRAM_DESC visible);
alter table TB_MCM_SEC_OBJ modify (SYSTEM_CODE visible);
alter table TB_MCM_SEC_OBJ modify (OBJECT_TYPE visible);
alter table TB_MCM_SEC_OBJ modify (SERVICE visible);
alter table TB_MCM_SEC_OBJ modify (USE_TP visible);
alter table TB_MCM_SEC_OBJ modify (ACCESS_TP visible);
alter table TB_MCM_SEC_OBJ modify (FORM_URL visible);
alter table TB_MCM_SEC_OBJ modify (OUT_ACCESS_IP visible);
alter table TB_MCM_SEC_OBJ modify (PARAM visible);
alter table TB_MCM_SEC_OBJ modify (START_ACTIVE_DATE visible);
alter table TB_MCM_SEC_OBJ modify (END_ACTIVE_DATE visible);
alter table TB_MCM_SEC_OBJ modify (VER visible);
alter table TB_MCM_SEC_OBJ modify (C_USR_ID visible);
alter table TB_MCM_SEC_OBJ modify (C_AT visible);
alter table TB_MCM_SEC_OBJ modify (C_SVC_ID visible);
alter table TB_MCM_SEC_OBJ modify (C_PGM_ID visible);
alter table TB_MCM_SEC_OBJ modify (U_USR_ID visible);
alter table TB_MCM_SEC_OBJ modify (U_AT visible);
alter table TB_MCM_SEC_OBJ modify (U_SVC_ID visible);
alter table TB_MCM_SEC_OBJ modify (U_PGM_ID visible);

-- TB_MCM_SEC_PERM: 앞에 남김 PERMISSION_ID
alter table TB_MCM_SEC_PERM modify (PERMISSION_NM invisible, PERMISSION_DESC invisible, PERMISSION_COMMON invisible, PERMISSION_CUSTOM invisible, POPUP_BTN invisible, PERMISSION_ACTION invisible, USE_TP invisible, START_ACTIVE_DATE invisible, END_ACTIVE_DATE invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_PERM modify (PERMISSION_NM visible);
alter table TB_MCM_SEC_PERM modify (PERMISSION_DESC visible);
alter table TB_MCM_SEC_PERM modify (PERMISSION_COMMON visible);
alter table TB_MCM_SEC_PERM modify (PERMISSION_CUSTOM visible);
alter table TB_MCM_SEC_PERM modify (POPUP_BTN visible);
alter table TB_MCM_SEC_PERM modify (PERMISSION_ACTION visible);
alter table TB_MCM_SEC_PERM modify (USE_TP visible);
alter table TB_MCM_SEC_PERM modify (START_ACTIVE_DATE visible);
alter table TB_MCM_SEC_PERM modify (END_ACTIVE_DATE visible);
alter table TB_MCM_SEC_PERM modify (VER visible);
alter table TB_MCM_SEC_PERM modify (C_USR_ID visible);
alter table TB_MCM_SEC_PERM modify (C_AT visible);
alter table TB_MCM_SEC_PERM modify (C_SVC_ID visible);
alter table TB_MCM_SEC_PERM modify (C_PGM_ID visible);
alter table TB_MCM_SEC_PERM modify (U_USR_ID visible);
alter table TB_MCM_SEC_PERM modify (U_AT visible);
alter table TB_MCM_SEC_PERM modify (U_SVC_ID visible);
alter table TB_MCM_SEC_PERM modify (U_PGM_ID visible);

-- TB_MCM_SEC_ROLE: 앞에 남김 ROLE_ID
alter table TB_MCM_SEC_ROLE modify (ROLE_NM invisible, ROLE_DESC invisible, PARENT_ROLE_ID invisible, MENU_ID invisible, USE_TP invisible, START_ACTIVE_DATE invisible, END_ACTIVE_DATE invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_ROLE modify (ROLE_NM visible);
alter table TB_MCM_SEC_ROLE modify (ROLE_DESC visible);
alter table TB_MCM_SEC_ROLE modify (PARENT_ROLE_ID visible);
alter table TB_MCM_SEC_ROLE modify (MENU_ID visible);
alter table TB_MCM_SEC_ROLE modify (USE_TP visible);
alter table TB_MCM_SEC_ROLE modify (START_ACTIVE_DATE visible);
alter table TB_MCM_SEC_ROLE modify (END_ACTIVE_DATE visible);
alter table TB_MCM_SEC_ROLE modify (VER visible);
alter table TB_MCM_SEC_ROLE modify (C_USR_ID visible);
alter table TB_MCM_SEC_ROLE modify (C_AT visible);
alter table TB_MCM_SEC_ROLE modify (C_SVC_ID visible);
alter table TB_MCM_SEC_ROLE modify (C_PGM_ID visible);
alter table TB_MCM_SEC_ROLE modify (U_USR_ID visible);
alter table TB_MCM_SEC_ROLE modify (U_AT visible);
alter table TB_MCM_SEC_ROLE modify (U_SVC_ID visible);
alter table TB_MCM_SEC_ROLE modify (U_PGM_ID visible);

-- TB_MCM_SEC_ROLE_MAPPING: 앞에 남김 ROLE_ID,OBJECT_ID,PERMISSION_ID
alter table TB_MCM_SEC_ROLE_MAPPING modify (VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_ROLE_MAPPING modify (VER visible);
alter table TB_MCM_SEC_ROLE_MAPPING modify (C_USR_ID visible);
alter table TB_MCM_SEC_ROLE_MAPPING modify (C_AT visible);
alter table TB_MCM_SEC_ROLE_MAPPING modify (C_SVC_ID visible);
alter table TB_MCM_SEC_ROLE_MAPPING modify (C_PGM_ID visible);
alter table TB_MCM_SEC_ROLE_MAPPING modify (U_USR_ID visible);
alter table TB_MCM_SEC_ROLE_MAPPING modify (U_AT visible);
alter table TB_MCM_SEC_ROLE_MAPPING modify (U_SVC_ID visible);
alter table TB_MCM_SEC_ROLE_MAPPING modify (U_PGM_ID visible);

-- TB_MCM_SEC_ROLEGROUP: 앞에 남김 ROLE_GROUP_ID
alter table TB_MCM_SEC_ROLEGROUP modify (ROLE_GROUP_NM invisible, ROLE_GROUP_DESC invisible, USE_TP invisible, START_ACTIVE_DATE invisible, END_ACTIVE_DATE invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_ROLEGROUP modify (ROLE_GROUP_NM visible);
alter table TB_MCM_SEC_ROLEGROUP modify (ROLE_GROUP_DESC visible);
alter table TB_MCM_SEC_ROLEGROUP modify (USE_TP visible);
alter table TB_MCM_SEC_ROLEGROUP modify (START_ACTIVE_DATE visible);
alter table TB_MCM_SEC_ROLEGROUP modify (END_ACTIVE_DATE visible);
alter table TB_MCM_SEC_ROLEGROUP modify (VER visible);
alter table TB_MCM_SEC_ROLEGROUP modify (C_USR_ID visible);
alter table TB_MCM_SEC_ROLEGROUP modify (C_AT visible);
alter table TB_MCM_SEC_ROLEGROUP modify (C_SVC_ID visible);
alter table TB_MCM_SEC_ROLEGROUP modify (C_PGM_ID visible);
alter table TB_MCM_SEC_ROLEGROUP modify (U_USR_ID visible);
alter table TB_MCM_SEC_ROLEGROUP modify (U_AT visible);
alter table TB_MCM_SEC_ROLEGROUP modify (U_SVC_ID visible);
alter table TB_MCM_SEC_ROLEGROUP modify (U_PGM_ID visible);

-- TB_MCM_SEC_ROLEGROUP_MAPPING: 앞에 남김 ROLE_GROUP_ID,ROLE_ID
alter table TB_MCM_SEC_ROLEGROUP_MAPPING modify (VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_ROLEGROUP_MAPPING modify (VER visible);
alter table TB_MCM_SEC_ROLEGROUP_MAPPING modify (C_USR_ID visible);
alter table TB_MCM_SEC_ROLEGROUP_MAPPING modify (C_AT visible);
alter table TB_MCM_SEC_ROLEGROUP_MAPPING modify (C_SVC_ID visible);
alter table TB_MCM_SEC_ROLEGROUP_MAPPING modify (C_PGM_ID visible);
alter table TB_MCM_SEC_ROLEGROUP_MAPPING modify (U_USR_ID visible);
alter table TB_MCM_SEC_ROLEGROUP_MAPPING modify (U_AT visible);
alter table TB_MCM_SEC_ROLEGROUP_MAPPING modify (U_SVC_ID visible);
alter table TB_MCM_SEC_ROLEGROUP_MAPPING modify (U_PGM_ID visible);

-- TB_MCM_SEC_USER: 앞에 남김 USER_ID
alter table TB_MCM_SEC_USER modify (USER_EMP_NO invisible, SSO_ID invisible, USER_NM invisible, START_ACTIVE_DATE invisible, END_ACTIVE_DATE invisible, DEPT_CD invisible, USER_CATEGORY_CD invisible, USE_TP invisible, EMAIL invisible, TEL_NO invisible, MOBILE_TEL_NO invisible, IN_OUT_EMP_TP invisible, GROUP_ID1 invisible, GROUP_ID2 invisible, GROUP_ID3 invisible, THEME_TP invisible, MENU_TP invisible, BOTTOM_MSG_YN invisible, EXCEL_TP invisible, PWD_FAIL_COUNT invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_USER modify (USER_EMP_NO visible);
alter table TB_MCM_SEC_USER modify (SSO_ID visible);
alter table TB_MCM_SEC_USER modify (USER_NM visible);
alter table TB_MCM_SEC_USER modify (START_ACTIVE_DATE visible);
alter table TB_MCM_SEC_USER modify (END_ACTIVE_DATE visible);
alter table TB_MCM_SEC_USER modify (DEPT_CD visible);
alter table TB_MCM_SEC_USER modify (USER_CATEGORY_CD visible);
alter table TB_MCM_SEC_USER modify (USE_TP visible);
alter table TB_MCM_SEC_USER modify (EMAIL visible);
alter table TB_MCM_SEC_USER modify (TEL_NO visible);
alter table TB_MCM_SEC_USER modify (MOBILE_TEL_NO visible);
alter table TB_MCM_SEC_USER modify (IN_OUT_EMP_TP visible);
alter table TB_MCM_SEC_USER modify (GROUP_ID1 visible);
alter table TB_MCM_SEC_USER modify (GROUP_ID2 visible);
alter table TB_MCM_SEC_USER modify (GROUP_ID3 visible);
alter table TB_MCM_SEC_USER modify (THEME_TP visible);
alter table TB_MCM_SEC_USER modify (MENU_TP visible);
alter table TB_MCM_SEC_USER modify (BOTTOM_MSG_YN visible);
alter table TB_MCM_SEC_USER modify (EXCEL_TP visible);
alter table TB_MCM_SEC_USER modify (PWD_FAIL_COUNT visible);
alter table TB_MCM_SEC_USER modify (VER visible);
alter table TB_MCM_SEC_USER modify (C_USR_ID visible);
alter table TB_MCM_SEC_USER modify (C_AT visible);
alter table TB_MCM_SEC_USER modify (C_SVC_ID visible);
alter table TB_MCM_SEC_USER modify (C_PGM_ID visible);
alter table TB_MCM_SEC_USER modify (U_USR_ID visible);
alter table TB_MCM_SEC_USER modify (U_AT visible);
alter table TB_MCM_SEC_USER modify (U_SVC_ID visible);
alter table TB_MCM_SEC_USER modify (U_PGM_ID visible);

-- TB_MCM_SEC_USER_FAVORITE: 앞에 남김 MENU_SEQ,FVT_FOLD_ID,MENU_ID,USER_ID,FULL_ID
alter table TB_MCM_SEC_USER_FAVORITE modify (FVT_SEQ invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_USER_FAVORITE modify (FVT_SEQ visible);
alter table TB_MCM_SEC_USER_FAVORITE modify (VER visible);
alter table TB_MCM_SEC_USER_FAVORITE modify (C_USR_ID visible);
alter table TB_MCM_SEC_USER_FAVORITE modify (C_AT visible);
alter table TB_MCM_SEC_USER_FAVORITE modify (C_SVC_ID visible);
alter table TB_MCM_SEC_USER_FAVORITE modify (C_PGM_ID visible);
alter table TB_MCM_SEC_USER_FAVORITE modify (U_USR_ID visible);
alter table TB_MCM_SEC_USER_FAVORITE modify (U_AT visible);
alter table TB_MCM_SEC_USER_FAVORITE modify (U_SVC_ID visible);
alter table TB_MCM_SEC_USER_FAVORITE modify (U_PGM_ID visible);

-- TB_MCM_SEC_USER_FAVORITE_FOLD: 앞에 남김 FVT_FOLD_ID,USER_ID
alter table TB_MCM_SEC_USER_FAVORITE_FOLD modify (FVT_FOLD_NM invisible, FVT_FOLD_SEQ invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_USER_FAVORITE_FOLD modify (FVT_FOLD_NM visible);
alter table TB_MCM_SEC_USER_FAVORITE_FOLD modify (FVT_FOLD_SEQ visible);
alter table TB_MCM_SEC_USER_FAVORITE_FOLD modify (VER visible);
alter table TB_MCM_SEC_USER_FAVORITE_FOLD modify (C_USR_ID visible);
alter table TB_MCM_SEC_USER_FAVORITE_FOLD modify (C_AT visible);
alter table TB_MCM_SEC_USER_FAVORITE_FOLD modify (C_SVC_ID visible);
alter table TB_MCM_SEC_USER_FAVORITE_FOLD modify (C_PGM_ID visible);
alter table TB_MCM_SEC_USER_FAVORITE_FOLD modify (U_USR_ID visible);
alter table TB_MCM_SEC_USER_FAVORITE_FOLD modify (U_AT visible);
alter table TB_MCM_SEC_USER_FAVORITE_FOLD modify (U_SVC_ID visible);
alter table TB_MCM_SEC_USER_FAVORITE_FOLD modify (U_PGM_ID visible);

-- TB_MCM_SEC_USER_HIS: 앞에 남김 ACTIVE_DT,USER_ID
alter table TB_MCM_SEC_USER_HIS modify (PROC_TYPE invisible, PROC_CASE invisible, USER_NM invisible, INF_REQ_NO invisible, DESCRIPTION invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_USER_HIS modify (PROC_TYPE visible);
alter table TB_MCM_SEC_USER_HIS modify (PROC_CASE visible);
alter table TB_MCM_SEC_USER_HIS modify (USER_NM visible);
alter table TB_MCM_SEC_USER_HIS modify (INF_REQ_NO visible);
alter table TB_MCM_SEC_USER_HIS modify (DESCRIPTION visible);
alter table TB_MCM_SEC_USER_HIS modify (VER visible);
alter table TB_MCM_SEC_USER_HIS modify (C_USR_ID visible);
alter table TB_MCM_SEC_USER_HIS modify (C_AT visible);
alter table TB_MCM_SEC_USER_HIS modify (C_SVC_ID visible);
alter table TB_MCM_SEC_USER_HIS modify (C_PGM_ID visible);
alter table TB_MCM_SEC_USER_HIS modify (U_USR_ID visible);
alter table TB_MCM_SEC_USER_HIS modify (U_AT visible);
alter table TB_MCM_SEC_USER_HIS modify (U_SVC_ID visible);
alter table TB_MCM_SEC_USER_HIS modify (U_PGM_ID visible);

-- TB_MCM_SEC_USER_MAPPING: 앞에 남김 ROLE_GROUP_ID,USER_ID
alter table TB_MCM_SEC_USER_MAPPING modify (VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_USER_MAPPING modify (VER visible);
alter table TB_MCM_SEC_USER_MAPPING modify (C_USR_ID visible);
alter table TB_MCM_SEC_USER_MAPPING modify (C_AT visible);
alter table TB_MCM_SEC_USER_MAPPING modify (C_SVC_ID visible);
alter table TB_MCM_SEC_USER_MAPPING modify (C_PGM_ID visible);
alter table TB_MCM_SEC_USER_MAPPING modify (U_USR_ID visible);
alter table TB_MCM_SEC_USER_MAPPING modify (U_AT visible);
alter table TB_MCM_SEC_USER_MAPPING modify (U_SVC_ID visible);
alter table TB_MCM_SEC_USER_MAPPING modify (U_PGM_ID visible);

-- TB_MCM_SEC_USER_PWD: 앞에 남김 USER_ID
alter table TB_MCM_SEC_USER_PWD modify (USER_ENC_PWD invisible, SALT invisible, LAST_PWD_CHNG_DATE invisible, USER_SSO_PWD invisible, USER_ENC_TEMP_PWD invisible, TEMP_PWD_EXPIRATION_DATE invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_USER_PWD modify (USER_ENC_PWD visible);
alter table TB_MCM_SEC_USER_PWD modify (SALT visible);
alter table TB_MCM_SEC_USER_PWD modify (LAST_PWD_CHNG_DATE visible);
alter table TB_MCM_SEC_USER_PWD modify (USER_SSO_PWD visible);
alter table TB_MCM_SEC_USER_PWD modify (USER_ENC_TEMP_PWD visible);
alter table TB_MCM_SEC_USER_PWD modify (TEMP_PWD_EXPIRATION_DATE visible);
alter table TB_MCM_SEC_USER_PWD modify (VER visible);
alter table TB_MCM_SEC_USER_PWD modify (C_USR_ID visible);
alter table TB_MCM_SEC_USER_PWD modify (C_AT visible);
alter table TB_MCM_SEC_USER_PWD modify (C_SVC_ID visible);
alter table TB_MCM_SEC_USER_PWD modify (C_PGM_ID visible);
alter table TB_MCM_SEC_USER_PWD modify (U_USR_ID visible);
alter table TB_MCM_SEC_USER_PWD modify (U_AT visible);
alter table TB_MCM_SEC_USER_PWD modify (U_SVC_ID visible);
alter table TB_MCM_SEC_USER_PWD modify (U_PGM_ID visible);

-- TB_MCM_SEC_USER_ROLL_HIS: 앞에 남김 RESP_GBN,WORKS_CODE,OP_SUMUP_DT,ROLE_GROUP_ID,USER_ID
alter table TB_MCM_SEC_USER_ROLL_HIS modify (ROLE_GROUP_NM invisible, INF_REQ_NO invisible, DESCRIPTION invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_USER_ROLL_HIS modify (ROLE_GROUP_NM visible);
alter table TB_MCM_SEC_USER_ROLL_HIS modify (INF_REQ_NO visible);
alter table TB_MCM_SEC_USER_ROLL_HIS modify (DESCRIPTION visible);
alter table TB_MCM_SEC_USER_ROLL_HIS modify (VER visible);
alter table TB_MCM_SEC_USER_ROLL_HIS modify (C_USR_ID visible);
alter table TB_MCM_SEC_USER_ROLL_HIS modify (C_AT visible);
alter table TB_MCM_SEC_USER_ROLL_HIS modify (C_SVC_ID visible);
alter table TB_MCM_SEC_USER_ROLL_HIS modify (C_PGM_ID visible);
alter table TB_MCM_SEC_USER_ROLL_HIS modify (U_USR_ID visible);
alter table TB_MCM_SEC_USER_ROLL_HIS modify (U_AT visible);
alter table TB_MCM_SEC_USER_ROLL_HIS modify (U_SVC_ID visible);
alter table TB_MCM_SEC_USER_ROLL_HIS modify (U_PGM_ID visible);

-- TB_MCM_SEC_USER_SRCH_DFLT: 앞에 남김 USER_ID,FIELD_KEY,PAGE_ID
alter table TB_MCM_SEC_USER_SRCH_DFLT modify (RULE_JSON invisible, FIELD_META invisible, FIELD_LABEL invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_USER_SRCH_DFLT modify (RULE_JSON visible);
alter table TB_MCM_SEC_USER_SRCH_DFLT modify (FIELD_META visible);
alter table TB_MCM_SEC_USER_SRCH_DFLT modify (FIELD_LABEL visible);
alter table TB_MCM_SEC_USER_SRCH_DFLT modify (VER visible);
alter table TB_MCM_SEC_USER_SRCH_DFLT modify (C_USR_ID visible);
alter table TB_MCM_SEC_USER_SRCH_DFLT modify (C_AT visible);
alter table TB_MCM_SEC_USER_SRCH_DFLT modify (C_SVC_ID visible);
alter table TB_MCM_SEC_USER_SRCH_DFLT modify (C_PGM_ID visible);
alter table TB_MCM_SEC_USER_SRCH_DFLT modify (U_USR_ID visible);
alter table TB_MCM_SEC_USER_SRCH_DFLT modify (U_AT visible);
alter table TB_MCM_SEC_USER_SRCH_DFLT modify (U_SVC_ID visible);
alter table TB_MCM_SEC_USER_SRCH_DFLT modify (U_PGM_ID visible);

-- TB_MCM_SEC_USER_START_PGM: 앞에 남김 MENU_SEQ,MENU_ID,USER_ID,FULL_ID
alter table TB_MCM_SEC_USER_START_PGM modify (START_SEQ invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_USER_START_PGM modify (START_SEQ visible);
alter table TB_MCM_SEC_USER_START_PGM modify (VER visible);
alter table TB_MCM_SEC_USER_START_PGM modify (C_USR_ID visible);
alter table TB_MCM_SEC_USER_START_PGM modify (C_AT visible);
alter table TB_MCM_SEC_USER_START_PGM modify (C_SVC_ID visible);
alter table TB_MCM_SEC_USER_START_PGM modify (C_PGM_ID visible);
alter table TB_MCM_SEC_USER_START_PGM modify (U_USR_ID visible);
alter table TB_MCM_SEC_USER_START_PGM modify (U_AT visible);
alter table TB_MCM_SEC_USER_START_PGM modify (U_SVC_ID visible);
alter table TB_MCM_SEC_USER_START_PGM modify (U_PGM_ID visible);

-- TB_MCM_SEC_USER_WIDGET: 앞에 남김 TAB_ID,USER_ID,INST_ID
alter table TB_MCM_SEC_USER_WIDGET modify (WIDGET_ID invisible, POS_X invisible, POS_Y invisible, SIZE_W invisible, SIZE_H invisible, LOCK_YN invisible, CONFIG_JSON invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_USER_WIDGET modify (WIDGET_ID visible);
alter table TB_MCM_SEC_USER_WIDGET modify (POS_X visible);
alter table TB_MCM_SEC_USER_WIDGET modify (POS_Y visible);
alter table TB_MCM_SEC_USER_WIDGET modify (SIZE_W visible);
alter table TB_MCM_SEC_USER_WIDGET modify (SIZE_H visible);
alter table TB_MCM_SEC_USER_WIDGET modify (LOCK_YN visible);
alter table TB_MCM_SEC_USER_WIDGET modify (CONFIG_JSON visible);
alter table TB_MCM_SEC_USER_WIDGET modify (VER visible);
alter table TB_MCM_SEC_USER_WIDGET modify (C_USR_ID visible);
alter table TB_MCM_SEC_USER_WIDGET modify (C_AT visible);
alter table TB_MCM_SEC_USER_WIDGET modify (C_SVC_ID visible);
alter table TB_MCM_SEC_USER_WIDGET modify (C_PGM_ID visible);
alter table TB_MCM_SEC_USER_WIDGET modify (U_USR_ID visible);
alter table TB_MCM_SEC_USER_WIDGET modify (U_AT visible);
alter table TB_MCM_SEC_USER_WIDGET modify (U_SVC_ID visible);
alter table TB_MCM_SEC_USER_WIDGET modify (U_PGM_ID visible);

-- TB_MCM_SEC_USER_WIDGET_CHAT: 앞에 남김 MSG_SEQ,USER_ID,INST_ID
alter table TB_MCM_SEC_USER_WIDGET_CHAT modify (ROLE_TP invisible, CONTENT invisible, LINKS_JSON invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_USER_WIDGET_CHAT modify (ROLE_TP visible);
alter table TB_MCM_SEC_USER_WIDGET_CHAT modify (CONTENT visible);
alter table TB_MCM_SEC_USER_WIDGET_CHAT modify (LINKS_JSON visible);
alter table TB_MCM_SEC_USER_WIDGET_CHAT modify (VER visible);
alter table TB_MCM_SEC_USER_WIDGET_CHAT modify (C_USR_ID visible);
alter table TB_MCM_SEC_USER_WIDGET_CHAT modify (C_AT visible);
alter table TB_MCM_SEC_USER_WIDGET_CHAT modify (C_SVC_ID visible);
alter table TB_MCM_SEC_USER_WIDGET_CHAT modify (C_PGM_ID visible);
alter table TB_MCM_SEC_USER_WIDGET_CHAT modify (U_USR_ID visible);
alter table TB_MCM_SEC_USER_WIDGET_CHAT modify (U_AT visible);
alter table TB_MCM_SEC_USER_WIDGET_CHAT modify (U_SVC_ID visible);
alter table TB_MCM_SEC_USER_WIDGET_CHAT modify (U_PGM_ID visible);

-- TB_MCM_SEC_USER_WIDGET_MEMO: 앞에 남김 INST_ID,USER_ID
alter table TB_MCM_SEC_USER_WIDGET_MEMO modify (DEF_ID invisible, FMT invisible, CONTENT invisible, TITLE invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_USER_WIDGET_MEMO modify (DEF_ID visible);
alter table TB_MCM_SEC_USER_WIDGET_MEMO modify (FMT visible);
alter table TB_MCM_SEC_USER_WIDGET_MEMO modify (CONTENT visible);
alter table TB_MCM_SEC_USER_WIDGET_MEMO modify (TITLE visible);
alter table TB_MCM_SEC_USER_WIDGET_MEMO modify (VER visible);
alter table TB_MCM_SEC_USER_WIDGET_MEMO modify (C_USR_ID visible);
alter table TB_MCM_SEC_USER_WIDGET_MEMO modify (C_AT visible);
alter table TB_MCM_SEC_USER_WIDGET_MEMO modify (C_SVC_ID visible);
alter table TB_MCM_SEC_USER_WIDGET_MEMO modify (C_PGM_ID visible);
alter table TB_MCM_SEC_USER_WIDGET_MEMO modify (U_USR_ID visible);
alter table TB_MCM_SEC_USER_WIDGET_MEMO modify (U_AT visible);
alter table TB_MCM_SEC_USER_WIDGET_MEMO modify (U_SVC_ID visible);
alter table TB_MCM_SEC_USER_WIDGET_MEMO modify (U_PGM_ID visible);

-- TB_MCM_SEC_USER_WIDGET_TAB: 앞에 남김 TAB_ID,USER_ID
alter table TB_MCM_SEC_USER_WIDGET_TAB modify (TAB_NM invisible, TAB_SEQ invisible, LOCK_YN invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_USER_WIDGET_TAB modify (TAB_NM visible);
alter table TB_MCM_SEC_USER_WIDGET_TAB modify (TAB_SEQ visible);
alter table TB_MCM_SEC_USER_WIDGET_TAB modify (LOCK_YN visible);
alter table TB_MCM_SEC_USER_WIDGET_TAB modify (VER visible);
alter table TB_MCM_SEC_USER_WIDGET_TAB modify (C_USR_ID visible);
alter table TB_MCM_SEC_USER_WIDGET_TAB modify (C_AT visible);
alter table TB_MCM_SEC_USER_WIDGET_TAB modify (C_SVC_ID visible);
alter table TB_MCM_SEC_USER_WIDGET_TAB modify (C_PGM_ID visible);
alter table TB_MCM_SEC_USER_WIDGET_TAB modify (U_USR_ID visible);
alter table TB_MCM_SEC_USER_WIDGET_TAB modify (U_AT visible);
alter table TB_MCM_SEC_USER_WIDGET_TAB modify (U_SVC_ID visible);
alter table TB_MCM_SEC_USER_WIDGET_TAB modify (U_PGM_ID visible);

-- TB_MCM_WIDGET_DEF: 앞에 남김 WIDGET_ID
alter table TB_MCM_WIDGET_DEF modify (SRC_TP invisible, TYPE_ID invisible, TITLE invisible, SUBTITLE invisible, DESCRIPTION invisible, DEF_W invisible, DEF_H invisible, MIN_W invisible, MIN_H invisible, MAX_W invisible, MAX_H invisible, REFRESH_SEC invisible, LINK_PAGE_ID invisible, MULTIPLE_YN invisible, CATEGORY_CD invisible, PRIVATE_YN invisible, PLACE_TP invisible, USE_YN invisible, DATA_SRC invisible, CONFIG_JSON invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_WIDGET_DEF modify (SRC_TP visible);
alter table TB_MCM_WIDGET_DEF modify (TYPE_ID visible);
alter table TB_MCM_WIDGET_DEF modify (TITLE visible);
alter table TB_MCM_WIDGET_DEF modify (SUBTITLE visible);
alter table TB_MCM_WIDGET_DEF modify (DESCRIPTION visible);
alter table TB_MCM_WIDGET_DEF modify (DEF_W visible);
alter table TB_MCM_WIDGET_DEF modify (DEF_H visible);
alter table TB_MCM_WIDGET_DEF modify (MIN_W visible);
alter table TB_MCM_WIDGET_DEF modify (MIN_H visible);
alter table TB_MCM_WIDGET_DEF modify (MAX_W visible);
alter table TB_MCM_WIDGET_DEF modify (MAX_H visible);
alter table TB_MCM_WIDGET_DEF modify (REFRESH_SEC visible);
alter table TB_MCM_WIDGET_DEF modify (LINK_PAGE_ID visible);
alter table TB_MCM_WIDGET_DEF modify (MULTIPLE_YN visible);
alter table TB_MCM_WIDGET_DEF modify (CATEGORY_CD visible);
alter table TB_MCM_WIDGET_DEF modify (PRIVATE_YN visible);
alter table TB_MCM_WIDGET_DEF modify (PLACE_TP visible);
alter table TB_MCM_WIDGET_DEF modify (USE_YN visible);
alter table TB_MCM_WIDGET_DEF modify (DATA_SRC visible);
alter table TB_MCM_WIDGET_DEF modify (CONFIG_JSON visible);
alter table TB_MCM_WIDGET_DEF modify (VER visible);
alter table TB_MCM_WIDGET_DEF modify (C_USR_ID visible);
alter table TB_MCM_WIDGET_DEF modify (C_AT visible);
alter table TB_MCM_WIDGET_DEF modify (C_SVC_ID visible);
alter table TB_MCM_WIDGET_DEF modify (C_PGM_ID visible);
alter table TB_MCM_WIDGET_DEF modify (U_USR_ID visible);
alter table TB_MCM_WIDGET_DEF modify (U_AT visible);
alter table TB_MCM_WIDGET_DEF modify (U_SVC_ID visible);
alter table TB_MCM_WIDGET_DEF modify (U_PGM_ID visible);

-- TB_MCM_WIDGET_DEFAULT_LAYOUT: 앞에 남김 LAYOUT_KEY,INST_ID
alter table TB_MCM_WIDGET_DEFAULT_LAYOUT modify (WIDGET_ID invisible, POS_X invisible, POS_Y invisible, SIZE_W invisible, SIZE_H invisible, LOCK_YN invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_WIDGET_DEFAULT_LAYOUT modify (WIDGET_ID visible);
alter table TB_MCM_WIDGET_DEFAULT_LAYOUT modify (POS_X visible);
alter table TB_MCM_WIDGET_DEFAULT_LAYOUT modify (POS_Y visible);
alter table TB_MCM_WIDGET_DEFAULT_LAYOUT modify (SIZE_W visible);
alter table TB_MCM_WIDGET_DEFAULT_LAYOUT modify (SIZE_H visible);
alter table TB_MCM_WIDGET_DEFAULT_LAYOUT modify (LOCK_YN visible);
alter table TB_MCM_WIDGET_DEFAULT_LAYOUT modify (VER visible);
alter table TB_MCM_WIDGET_DEFAULT_LAYOUT modify (C_USR_ID visible);
alter table TB_MCM_WIDGET_DEFAULT_LAYOUT modify (C_AT visible);
alter table TB_MCM_WIDGET_DEFAULT_LAYOUT modify (C_SVC_ID visible);
alter table TB_MCM_WIDGET_DEFAULT_LAYOUT modify (C_PGM_ID visible);
alter table TB_MCM_WIDGET_DEFAULT_LAYOUT modify (U_USR_ID visible);
alter table TB_MCM_WIDGET_DEFAULT_LAYOUT modify (U_AT visible);
alter table TB_MCM_WIDGET_DEFAULT_LAYOUT modify (U_SVC_ID visible);
alter table TB_MCM_WIDGET_DEFAULT_LAYOUT modify (U_PGM_ID visible);

-- TB_MCM_WIDGET_DEFAULT_TAB: 앞에 남김 LAYOUT_KEY,TAB_ID
alter table TB_MCM_WIDGET_DEFAULT_TAB modify (TAB_NM invisible, TAB_SEQ invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_WIDGET_DEFAULT_TAB modify (TAB_NM visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB modify (TAB_SEQ visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB modify (VER visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB modify (C_USR_ID visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB modify (C_AT visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB modify (C_SVC_ID visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB modify (C_PGM_ID visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB modify (U_USR_ID visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB modify (U_AT visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB modify (U_SVC_ID visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB modify (U_PGM_ID visible);

-- TB_MCM_WIDGET_DEFAULT_TAB_ITEM: 앞에 남김 LAYOUT_KEY,TAB_ID,INST_ID
alter table TB_MCM_WIDGET_DEFAULT_TAB_ITEM modify (WIDGET_ID invisible, POS_X invisible, POS_Y invisible, SIZE_W invisible, SIZE_H invisible, LOCK_YN invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_WIDGET_DEFAULT_TAB_ITEM modify (WIDGET_ID visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB_ITEM modify (POS_X visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB_ITEM modify (POS_Y visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB_ITEM modify (SIZE_W visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB_ITEM modify (SIZE_H visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB_ITEM modify (LOCK_YN visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB_ITEM modify (VER visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB_ITEM modify (C_USR_ID visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB_ITEM modify (C_AT visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB_ITEM modify (C_SVC_ID visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB_ITEM modify (C_PGM_ID visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB_ITEM modify (U_USR_ID visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB_ITEM modify (U_AT visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB_ITEM modify (U_SVC_ID visible);
alter table TB_MCM_WIDGET_DEFAULT_TAB_ITEM modify (U_PGM_ID visible);

-- TB_MCM_WIDGET_MEDIA: 앞에 남김 FILE_ID
alter table TB_MCM_WIDGET_MEDIA modify (ORIG_NM invisible, CONTENT_TYPE invisible, FILE_SIZE invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_WIDGET_MEDIA modify (ORIG_NM visible);
alter table TB_MCM_WIDGET_MEDIA modify (CONTENT_TYPE visible);
alter table TB_MCM_WIDGET_MEDIA modify (FILE_SIZE visible);
alter table TB_MCM_WIDGET_MEDIA modify (VER visible);
alter table TB_MCM_WIDGET_MEDIA modify (C_USR_ID visible);
alter table TB_MCM_WIDGET_MEDIA modify (C_AT visible);
alter table TB_MCM_WIDGET_MEDIA modify (C_SVC_ID visible);
alter table TB_MCM_WIDGET_MEDIA modify (C_PGM_ID visible);
alter table TB_MCM_WIDGET_MEDIA modify (U_USR_ID visible);
alter table TB_MCM_WIDGET_MEDIA modify (U_AT visible);
alter table TB_MCM_WIDGET_MEDIA modify (U_SVC_ID visible);
alter table TB_MCM_WIDGET_MEDIA modify (U_PGM_ID visible);

-- SAMPLE_MASTER_CODE: 앞에 남김 ID
alter table SAMPLE_MASTER_CODE modify (CODE_GROUP invisible, CODE_VALUE invisible, LABEL invisible, SORT_ORDER invisible, USE_YN invisible);
alter table SAMPLE_MASTER_CODE modify (CODE_GROUP visible);
alter table SAMPLE_MASTER_CODE modify (CODE_VALUE visible);
alter table SAMPLE_MASTER_CODE modify (LABEL visible);
alter table SAMPLE_MASTER_CODE modify (SORT_ORDER visible);
alter table SAMPLE_MASTER_CODE modify (USE_YN visible);

-- SAMPLE_NOTICE: 앞에 남김 ID
alter table SAMPLE_NOTICE modify (TITLE invisible, CONTENT invisible, ACTIVE invisible);
alter table SAMPLE_NOTICE modify (TITLE visible);
alter table SAMPLE_NOTICE modify (CONTENT visible);
alter table SAMPLE_NOTICE modify (ACTIVE visible);

-- TB_MCM_MOM_FORMAT_LAYOUT: 앞에 남김 FORMAT_VER,ITEM_SEQ,FORMAT_ID
alter table TB_MCM_MOM_FORMAT_LAYOUT modify (ITEM_TP invisible, ITEM_ID invisible, ITEM_NM invisible, DATA_TP invisible, DATA_LEN invisible, DATA_DECIMAL_PREC invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_MOM_FORMAT_LAYOUT modify (ITEM_TP visible);
alter table TB_MCM_MOM_FORMAT_LAYOUT modify (ITEM_ID visible);
alter table TB_MCM_MOM_FORMAT_LAYOUT modify (ITEM_NM visible);
alter table TB_MCM_MOM_FORMAT_LAYOUT modify (DATA_TP visible);
alter table TB_MCM_MOM_FORMAT_LAYOUT modify (DATA_LEN visible);
alter table TB_MCM_MOM_FORMAT_LAYOUT modify (DATA_DECIMAL_PREC visible);
alter table TB_MCM_MOM_FORMAT_LAYOUT modify (VER visible);
alter table TB_MCM_MOM_FORMAT_LAYOUT modify (C_USR_ID visible);
alter table TB_MCM_MOM_FORMAT_LAYOUT modify (C_AT visible);
alter table TB_MCM_MOM_FORMAT_LAYOUT modify (C_SVC_ID visible);
alter table TB_MCM_MOM_FORMAT_LAYOUT modify (C_PGM_ID visible);
alter table TB_MCM_MOM_FORMAT_LAYOUT modify (U_USR_ID visible);
alter table TB_MCM_MOM_FORMAT_LAYOUT modify (U_AT visible);
alter table TB_MCM_MOM_FORMAT_LAYOUT modify (U_SVC_ID visible);
alter table TB_MCM_MOM_FORMAT_LAYOUT modify (U_PGM_ID visible);

-- TB_SEC_AUDIT_LOG: 앞에 남김 AUDIT_ID
alter table TB_SEC_AUDIT_LOG modify (ACTION invisible, TARGET_TYPE invisible, TARGET_ID invisible, ACTOR_USER_ID invisible, BEFORE_JSON invisible, AFTER_JSON invisible, CLIENT_IP invisible, OCCURRED_AT invisible);
alter table TB_SEC_AUDIT_LOG modify (ACTION visible);
alter table TB_SEC_AUDIT_LOG modify (TARGET_TYPE visible);
alter table TB_SEC_AUDIT_LOG modify (TARGET_ID visible);
alter table TB_SEC_AUDIT_LOG modify (ACTOR_USER_ID visible);
alter table TB_SEC_AUDIT_LOG modify (BEFORE_JSON visible);
alter table TB_SEC_AUDIT_LOG modify (AFTER_JSON visible);
alter table TB_SEC_AUDIT_LOG modify (CLIENT_IP visible);
alter table TB_SEC_AUDIT_LOG modify (OCCURRED_AT visible);

-- TB_SEC_CODE_CATEGORY: 앞에 남김 CATEGORY_CD,GROUP_CD
alter table TB_SEC_CODE_CATEGORY modify (CATEGORY_NM invisible, SORT_ORD invisible, USE_YN invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_SEC_CODE_CATEGORY modify (CATEGORY_NM visible);
alter table TB_SEC_CODE_CATEGORY modify (SORT_ORD visible);
alter table TB_SEC_CODE_CATEGORY modify (USE_YN visible);
alter table TB_SEC_CODE_CATEGORY modify (VER visible);
alter table TB_SEC_CODE_CATEGORY modify (C_USR_ID visible);
alter table TB_SEC_CODE_CATEGORY modify (C_AT visible);
alter table TB_SEC_CODE_CATEGORY modify (C_SVC_ID visible);
alter table TB_SEC_CODE_CATEGORY modify (C_PGM_ID visible);
alter table TB_SEC_CODE_CATEGORY modify (U_USR_ID visible);
alter table TB_SEC_CODE_CATEGORY modify (U_AT visible);
alter table TB_SEC_CODE_CATEGORY modify (U_SVC_ID visible);
alter table TB_SEC_CODE_CATEGORY modify (U_PGM_ID visible);

-- TB_SEC_CODE_GROUP: 앞에 남김 GROUP_CD
alter table TB_SEC_CODE_GROUP modify (GROUP_NM invisible, GROUP_DESC invisible, USE_YN invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_SEC_CODE_GROUP modify (GROUP_NM visible);
alter table TB_SEC_CODE_GROUP modify (GROUP_DESC visible);
alter table TB_SEC_CODE_GROUP modify (USE_YN visible);
alter table TB_SEC_CODE_GROUP modify (VER visible);
alter table TB_SEC_CODE_GROUP modify (C_USR_ID visible);
alter table TB_SEC_CODE_GROUP modify (C_AT visible);
alter table TB_SEC_CODE_GROUP modify (C_SVC_ID visible);
alter table TB_SEC_CODE_GROUP modify (C_PGM_ID visible);
alter table TB_SEC_CODE_GROUP modify (U_USR_ID visible);
alter table TB_SEC_CODE_GROUP modify (U_AT visible);
alter table TB_SEC_CODE_GROUP modify (U_SVC_ID visible);
alter table TB_SEC_CODE_GROUP modify (U_PGM_ID visible);

-- TB_SEC_CODE_ITEM: 앞에 남김 GROUP_CD,ITEM_CD
alter table TB_SEC_CODE_ITEM modify (ITEM_NM invisible, ITEM_DESC invisible, SORT_ORD invisible, EXTRA_VAL1 invisible, EXTRA_VAL2 invisible, USE_YN invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_SEC_CODE_ITEM modify (ITEM_NM visible);
alter table TB_SEC_CODE_ITEM modify (ITEM_DESC visible);
alter table TB_SEC_CODE_ITEM modify (SORT_ORD visible);
alter table TB_SEC_CODE_ITEM modify (EXTRA_VAL1 visible);
alter table TB_SEC_CODE_ITEM modify (EXTRA_VAL2 visible);
alter table TB_SEC_CODE_ITEM modify (USE_YN visible);
alter table TB_SEC_CODE_ITEM modify (VER visible);
alter table TB_SEC_CODE_ITEM modify (C_USR_ID visible);
alter table TB_SEC_CODE_ITEM modify (C_AT visible);
alter table TB_SEC_CODE_ITEM modify (C_SVC_ID visible);
alter table TB_SEC_CODE_ITEM modify (C_PGM_ID visible);
alter table TB_SEC_CODE_ITEM modify (U_USR_ID visible);
alter table TB_SEC_CODE_ITEM modify (U_AT visible);
alter table TB_SEC_CODE_ITEM modify (U_SVC_ID visible);
alter table TB_SEC_CODE_ITEM modify (U_PGM_ID visible);

-- TB_SEC_KEY_STORE: 앞에 남김 KID
alter table TB_SEC_KEY_STORE modify (ALG invisible, PUBLIC_KEY invisible, PRIVATE_KEY invisible, SECRET invisible, ACTIVE invisible, CREATED_AT invisible, EXPIRES_AT invisible);
alter table TB_SEC_KEY_STORE modify (ALG visible);
alter table TB_SEC_KEY_STORE modify (PUBLIC_KEY visible);
alter table TB_SEC_KEY_STORE modify (PRIVATE_KEY visible);
alter table TB_SEC_KEY_STORE modify (SECRET visible);
alter table TB_SEC_KEY_STORE modify (ACTIVE visible);
alter table TB_SEC_KEY_STORE modify (CREATED_AT visible);
alter table TB_SEC_KEY_STORE modify (EXPIRES_AT visible);

-- TB_SEC_LOGIN_LOG: 앞에 남김 LOG_ID
alter table TB_SEC_LOGIN_LOG modify (USER_ID invisible, EVENT_TYPE invisible, CLIENT_IP invisible, USER_AGENT invisible, OCCURRED_AT invisible);
alter table TB_SEC_LOGIN_LOG modify (USER_ID visible);
alter table TB_SEC_LOGIN_LOG modify (EVENT_TYPE visible);
alter table TB_SEC_LOGIN_LOG modify (CLIENT_IP visible);
alter table TB_SEC_LOGIN_LOG modify (USER_AGENT visible);
alter table TB_SEC_LOGIN_LOG modify (OCCURRED_AT visible);

-- TB_SEC_REVOKED_TOKEN: 앞에 남김 JTI
alter table TB_SEC_REVOKED_TOKEN modify (USER_ID invisible, REVOKED_AT invisible, EXPIRES_AT invisible);
alter table TB_SEC_REVOKED_TOKEN modify (USER_ID visible);
alter table TB_SEC_REVOKED_TOKEN modify (REVOKED_AT visible);
alter table TB_SEC_REVOKED_TOKEN modify (EXPIRES_AT visible);

-- TB_SEC_SCREEN_USAGE_DAY: 앞에 남김 USAGE_DT,DEPT_CD,USER_ID,PAGE_ID
alter table TB_SEC_SCREEN_USAGE_DAY modify (OPEN_CNT invisible, SEG_CNT invisible, DURATION_MS invisible);
alter table TB_SEC_SCREEN_USAGE_DAY modify (OPEN_CNT visible);
alter table TB_SEC_SCREEN_USAGE_DAY modify (SEG_CNT visible);
alter table TB_SEC_SCREEN_USAGE_DAY modify (DURATION_MS visible);

-- TB_SEC_SCREEN_USAGE_LOG: 앞에 남김 USAGE_ID
alter table TB_SEC_SCREEN_USAGE_LOG modify (USER_ID invisible, DEPT_CD invisible, PAGE_ID invisible, START_KIND invisible, STARTED_AT invisible, ENDED_AT invisible, DURATION_MS invisible, CLIENT_SEG_ID invisible, CLIENT_IP invisible, RECEIVED_AT invisible);
alter table TB_SEC_SCREEN_USAGE_LOG modify (USER_ID visible);
alter table TB_SEC_SCREEN_USAGE_LOG modify (DEPT_CD visible);
alter table TB_SEC_SCREEN_USAGE_LOG modify (PAGE_ID visible);
alter table TB_SEC_SCREEN_USAGE_LOG modify (START_KIND visible);
alter table TB_SEC_SCREEN_USAGE_LOG modify (STARTED_AT visible);
alter table TB_SEC_SCREEN_USAGE_LOG modify (ENDED_AT visible);
alter table TB_SEC_SCREEN_USAGE_LOG modify (DURATION_MS visible);
alter table TB_SEC_SCREEN_USAGE_LOG modify (CLIENT_SEG_ID visible);
alter table TB_SEC_SCREEN_USAGE_LOG modify (CLIENT_IP visible);
alter table TB_SEC_SCREEN_USAGE_LOG modify (RECEIVED_AT visible);

-- TB_SEC_USER: 앞에 남김 USER_ID
alter table TB_SEC_USER modify (USER_NM invisible, USER_NO invisible, USER_PASS invisible, USE_YN invisible, LOCK_YN invisible, TRY_CNT invisible, PASS_INIT_YN invisible, PASS_SET_DD invisible, DEPT_CD invisible, VALID_STR_DD invisible, VALID_END_DD invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_SEC_USER modify (USER_NM visible);
alter table TB_SEC_USER modify (USER_NO visible);
alter table TB_SEC_USER modify (USER_PASS visible);
alter table TB_SEC_USER modify (USE_YN visible);
alter table TB_SEC_USER modify (LOCK_YN visible);
alter table TB_SEC_USER modify (TRY_CNT visible);
alter table TB_SEC_USER modify (PASS_INIT_YN visible);
alter table TB_SEC_USER modify (PASS_SET_DD visible);
alter table TB_SEC_USER modify (DEPT_CD visible);
alter table TB_SEC_USER modify (VALID_STR_DD visible);
alter table TB_SEC_USER modify (VALID_END_DD visible);
alter table TB_SEC_USER modify (VER visible);
alter table TB_SEC_USER modify (C_USR_ID visible);
alter table TB_SEC_USER modify (C_AT visible);
alter table TB_SEC_USER modify (C_SVC_ID visible);
alter table TB_SEC_USER modify (C_PGM_ID visible);
alter table TB_SEC_USER modify (U_USR_ID visible);
alter table TB_SEC_USER modify (U_AT visible);
alter table TB_SEC_USER modify (U_SVC_ID visible);
alter table TB_SEC_USER modify (U_PGM_ID visible);

-- TB_MCM_CODE_CATEGORY: 앞에 남김 MASTER_CODE,CATEGORY_ID
alter table TB_MCM_CODE_CATEGORY modify (CATEGORY_NM invisible, SORT_SEQ invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_CODE_CATEGORY modify (CATEGORY_NM visible);
alter table TB_MCM_CODE_CATEGORY modify (SORT_SEQ visible);
alter table TB_MCM_CODE_CATEGORY modify (VER visible);
alter table TB_MCM_CODE_CATEGORY modify (C_USR_ID visible);
alter table TB_MCM_CODE_CATEGORY modify (C_AT visible);
alter table TB_MCM_CODE_CATEGORY modify (C_SVC_ID visible);
alter table TB_MCM_CODE_CATEGORY modify (C_PGM_ID visible);
alter table TB_MCM_CODE_CATEGORY modify (U_USR_ID visible);
alter table TB_MCM_CODE_CATEGORY modify (U_AT visible);
alter table TB_MCM_CODE_CATEGORY modify (U_SVC_ID visible);
alter table TB_MCM_CODE_CATEGORY modify (U_PGM_ID visible);

-- TB_MCM_CODE_DETAIL: 앞에 남김 CODE_VAL,MASTER_CODE,CATEGORY_ID
alter table TB_MCM_CODE_DETAIL modify (CODE_VAL_MEAN invisible, CODE_VAL_DESC invisible, CODE_VER invisible, SORT_SEQ invisible, CODE_VAL_REF1 invisible, CODE_VAL_REF2 invisible, CODE_VAL_REF3 invisible, CODE_VAL_REF4 invisible, CODE_VAL_REF5 invisible, CODE_VAL_REMARK invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_CODE_DETAIL modify (CODE_VAL_MEAN visible);
alter table TB_MCM_CODE_DETAIL modify (CODE_VAL_DESC visible);
alter table TB_MCM_CODE_DETAIL modify (CODE_VER visible);
alter table TB_MCM_CODE_DETAIL modify (SORT_SEQ visible);
alter table TB_MCM_CODE_DETAIL modify (CODE_VAL_REF1 visible);
alter table TB_MCM_CODE_DETAIL modify (CODE_VAL_REF2 visible);
alter table TB_MCM_CODE_DETAIL modify (CODE_VAL_REF3 visible);
alter table TB_MCM_CODE_DETAIL modify (CODE_VAL_REF4 visible);
alter table TB_MCM_CODE_DETAIL modify (CODE_VAL_REF5 visible);
alter table TB_MCM_CODE_DETAIL modify (CODE_VAL_REMARK visible);
alter table TB_MCM_CODE_DETAIL modify (VER visible);
alter table TB_MCM_CODE_DETAIL modify (C_USR_ID visible);
alter table TB_MCM_CODE_DETAIL modify (C_AT visible);
alter table TB_MCM_CODE_DETAIL modify (C_SVC_ID visible);
alter table TB_MCM_CODE_DETAIL modify (C_PGM_ID visible);
alter table TB_MCM_CODE_DETAIL modify (U_USR_ID visible);
alter table TB_MCM_CODE_DETAIL modify (U_AT visible);
alter table TB_MCM_CODE_DETAIL modify (U_SVC_ID visible);
alter table TB_MCM_CODE_DETAIL modify (U_PGM_ID visible);

-- TB_MCM_CODE_MASTER: 앞에 남김 CODE_ID
alter table TB_MCM_CODE_MASTER modify (CODE_NM invisible, CODE_DESC invisible, CODE_VER invisible, MASTER_CODE invisible, MASTER_CODE_REF1 invisible, MASTER_CODE_REF2 invisible, MASTER_CODE_REF3 invisible, MASTER_CODE_REF4 invisible, MASTER_CODE_REF5 invisible, USE_TP invisible, START_ACTIVE_DATE invisible, END_ACTIVE_DATE invisible, CODE_OWNER_DEPT_NM invisible, CODE_OWNER_EMP_NO invisible, CODE_CHARACTER invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_CODE_MASTER modify (CODE_NM visible);
alter table TB_MCM_CODE_MASTER modify (CODE_DESC visible);
alter table TB_MCM_CODE_MASTER modify (CODE_VER visible);
alter table TB_MCM_CODE_MASTER modify (MASTER_CODE visible);
alter table TB_MCM_CODE_MASTER modify (MASTER_CODE_REF1 visible);
alter table TB_MCM_CODE_MASTER modify (MASTER_CODE_REF2 visible);
alter table TB_MCM_CODE_MASTER modify (MASTER_CODE_REF3 visible);
alter table TB_MCM_CODE_MASTER modify (MASTER_CODE_REF4 visible);
alter table TB_MCM_CODE_MASTER modify (MASTER_CODE_REF5 visible);
alter table TB_MCM_CODE_MASTER modify (USE_TP visible);
alter table TB_MCM_CODE_MASTER modify (START_ACTIVE_DATE visible);
alter table TB_MCM_CODE_MASTER modify (END_ACTIVE_DATE visible);
alter table TB_MCM_CODE_MASTER modify (CODE_OWNER_DEPT_NM visible);
alter table TB_MCM_CODE_MASTER modify (CODE_OWNER_EMP_NO visible);
alter table TB_MCM_CODE_MASTER modify (CODE_CHARACTER visible);
alter table TB_MCM_CODE_MASTER modify (VER visible);
alter table TB_MCM_CODE_MASTER modify (C_USR_ID visible);
alter table TB_MCM_CODE_MASTER modify (C_AT visible);
alter table TB_MCM_CODE_MASTER modify (C_SVC_ID visible);
alter table TB_MCM_CODE_MASTER modify (C_PGM_ID visible);
alter table TB_MCM_CODE_MASTER modify (U_USR_ID visible);
alter table TB_MCM_CODE_MASTER modify (U_AT visible);
alter table TB_MCM_CODE_MASTER modify (U_SVC_ID visible);
alter table TB_MCM_CODE_MASTER modify (U_PGM_ID visible);

-- TB_MCM_JOB_DEF: 앞에 남김 JOB_ID
alter table TB_MCM_JOB_DEF modify (MODULE_CD invisible, JOB_NM invisible, JOB_KIND invisible, SERVICE_ID invisible, ACTION invisible, CRON_EXPR invisible, USE_YN invisible, CONFIG_JSON invisible, VARS_JSON invisible, TIMEOUT_SEC invisible, NEXT_RUN_AT invisible, JOB_DESC invisible, OWNER_TP invisible, OPTS_JSON invisible, MISFIRE_RUN_YN invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_JOB_DEF modify (MODULE_CD visible);
alter table TB_MCM_JOB_DEF modify (JOB_NM visible);
alter table TB_MCM_JOB_DEF modify (JOB_KIND visible);
alter table TB_MCM_JOB_DEF modify (SERVICE_ID visible);
alter table TB_MCM_JOB_DEF modify (ACTION visible);
alter table TB_MCM_JOB_DEF modify (CRON_EXPR visible);
alter table TB_MCM_JOB_DEF modify (USE_YN visible);
alter table TB_MCM_JOB_DEF modify (CONFIG_JSON visible);
alter table TB_MCM_JOB_DEF modify (VARS_JSON visible);
alter table TB_MCM_JOB_DEF modify (TIMEOUT_SEC visible);
alter table TB_MCM_JOB_DEF modify (NEXT_RUN_AT visible);
alter table TB_MCM_JOB_DEF modify (JOB_DESC visible);
alter table TB_MCM_JOB_DEF modify (OWNER_TP visible);
alter table TB_MCM_JOB_DEF modify (OPTS_JSON visible);
alter table TB_MCM_JOB_DEF modify (MISFIRE_RUN_YN visible);
alter table TB_MCM_JOB_DEF modify (VER visible);
alter table TB_MCM_JOB_DEF modify (C_USR_ID visible);
alter table TB_MCM_JOB_DEF modify (C_AT visible);
alter table TB_MCM_JOB_DEF modify (C_SVC_ID visible);
alter table TB_MCM_JOB_DEF modify (C_PGM_ID visible);
alter table TB_MCM_JOB_DEF modify (U_USR_ID visible);
alter table TB_MCM_JOB_DEF modify (U_AT visible);
alter table TB_MCM_JOB_DEF modify (U_SVC_ID visible);
alter table TB_MCM_JOB_DEF modify (U_PGM_ID visible);

-- TB_MCM_JOB_RUN: 앞에 남김 JOB_ID,SCHED_AT,TRIGGER_TP
alter table TB_MCM_JOB_RUN modify (RUN_ID invisible, MODULE_CD invisible, SERVICE_ID invisible, SERVER_NM invisible, SERVICE_TAG invisible, STATUS invisible, STARTED_AT invisible, ENDED_AT invisible, ITEM_CNT invisible, MSG invisible, REQ_USR_ID invisible, TIMEOUT_SEC invisible, VARS_JSON invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_JOB_RUN modify (RUN_ID visible);
alter table TB_MCM_JOB_RUN modify (MODULE_CD visible);
alter table TB_MCM_JOB_RUN modify (SERVICE_ID visible);
alter table TB_MCM_JOB_RUN modify (SERVER_NM visible);
alter table TB_MCM_JOB_RUN modify (SERVICE_TAG visible);
alter table TB_MCM_JOB_RUN modify (STATUS visible);
alter table TB_MCM_JOB_RUN modify (STARTED_AT visible);
alter table TB_MCM_JOB_RUN modify (ENDED_AT visible);
alter table TB_MCM_JOB_RUN modify (ITEM_CNT visible);
alter table TB_MCM_JOB_RUN modify (MSG visible);
alter table TB_MCM_JOB_RUN modify (REQ_USR_ID visible);
alter table TB_MCM_JOB_RUN modify (TIMEOUT_SEC visible);
alter table TB_MCM_JOB_RUN modify (VARS_JSON visible);
alter table TB_MCM_JOB_RUN modify (VER visible);
alter table TB_MCM_JOB_RUN modify (C_USR_ID visible);
alter table TB_MCM_JOB_RUN modify (C_AT visible);
alter table TB_MCM_JOB_RUN modify (C_SVC_ID visible);
alter table TB_MCM_JOB_RUN modify (C_PGM_ID visible);
alter table TB_MCM_JOB_RUN modify (U_USR_ID visible);
alter table TB_MCM_JOB_RUN modify (U_AT visible);
alter table TB_MCM_JOB_RUN modify (U_SVC_ID visible);
alter table TB_MCM_JOB_RUN modify (U_PGM_ID visible);

-- TB_MCM_JOB_COLLECT_DATA: 앞에 남김 JOB_ID,SLOT,ITEM_KEY
alter table TB_MCM_JOB_COLLECT_DATA modify (VALUE_NUM invisible, VALUE_TXT invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_JOB_COLLECT_DATA modify (VALUE_NUM visible);
alter table TB_MCM_JOB_COLLECT_DATA modify (VALUE_TXT visible);
alter table TB_MCM_JOB_COLLECT_DATA modify (VER visible);
alter table TB_MCM_JOB_COLLECT_DATA modify (C_USR_ID visible);
alter table TB_MCM_JOB_COLLECT_DATA modify (C_AT visible);
alter table TB_MCM_JOB_COLLECT_DATA modify (C_SVC_ID visible);
alter table TB_MCM_JOB_COLLECT_DATA modify (C_PGM_ID visible);
alter table TB_MCM_JOB_COLLECT_DATA modify (U_USR_ID visible);
alter table TB_MCM_JOB_COLLECT_DATA modify (U_AT visible);
alter table TB_MCM_JOB_COLLECT_DATA modify (U_SVC_ID visible);
alter table TB_MCM_JOB_COLLECT_DATA modify (U_PGM_ID visible);

-- TB_MCM_JOB_HANDLER: 앞에 남김 HANDLER_ID
alter table TB_MCM_JOB_HANDLER modify (MODULE_CD invisible, HANDLER_NM invisible, DEFAULT_CRON invisible, VARS_JSON invisible, SEEN_AT invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_JOB_HANDLER modify (MODULE_CD visible);
alter table TB_MCM_JOB_HANDLER modify (HANDLER_NM visible);
alter table TB_MCM_JOB_HANDLER modify (DEFAULT_CRON visible);
alter table TB_MCM_JOB_HANDLER modify (VARS_JSON visible);
alter table TB_MCM_JOB_HANDLER modify (SEEN_AT visible);
alter table TB_MCM_JOB_HANDLER modify (VER visible);
alter table TB_MCM_JOB_HANDLER modify (C_USR_ID visible);
alter table TB_MCM_JOB_HANDLER modify (C_AT visible);
alter table TB_MCM_JOB_HANDLER modify (C_SVC_ID visible);
alter table TB_MCM_JOB_HANDLER modify (C_PGM_ID visible);
alter table TB_MCM_JOB_HANDLER modify (U_USR_ID visible);
alter table TB_MCM_JOB_HANDLER modify (U_AT visible);
alter table TB_MCM_JOB_HANDLER modify (U_SVC_ID visible);
alter table TB_MCM_JOB_HANDLER modify (U_PGM_ID visible);

-- TB_MCM_USRQ_DEF: 앞에 남김 QUERY_ID
alter table TB_MCM_USRQ_DEF modify (QUERY_NM invisible, CATEGORY_CD invisible, QUERY_DESC invisible, MODULE_CD invisible, OWNER_DEPT_CD invisible, SQL_TEXT invisible, PARAMS_JSON invisible, COLUMNS_JSON invisible, MAX_ROW_CNT invisible, USE_YN invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_USRQ_DEF modify (QUERY_NM visible);
alter table TB_MCM_USRQ_DEF modify (CATEGORY_CD visible);
alter table TB_MCM_USRQ_DEF modify (QUERY_DESC visible);
alter table TB_MCM_USRQ_DEF modify (MODULE_CD visible);
alter table TB_MCM_USRQ_DEF modify (OWNER_DEPT_CD visible);
alter table TB_MCM_USRQ_DEF modify (SQL_TEXT visible);
alter table TB_MCM_USRQ_DEF modify (PARAMS_JSON visible);
alter table TB_MCM_USRQ_DEF modify (COLUMNS_JSON visible);
alter table TB_MCM_USRQ_DEF modify (MAX_ROW_CNT visible);
alter table TB_MCM_USRQ_DEF modify (USE_YN visible);
alter table TB_MCM_USRQ_DEF modify (VER visible);
alter table TB_MCM_USRQ_DEF modify (C_USR_ID visible);
alter table TB_MCM_USRQ_DEF modify (C_AT visible);
alter table TB_MCM_USRQ_DEF modify (C_SVC_ID visible);
alter table TB_MCM_USRQ_DEF modify (C_PGM_ID visible);
alter table TB_MCM_USRQ_DEF modify (U_USR_ID visible);
alter table TB_MCM_USRQ_DEF modify (U_AT visible);
alter table TB_MCM_USRQ_DEF modify (U_SVC_ID visible);
alter table TB_MCM_USRQ_DEF modify (U_PGM_ID visible);

-- TB_MCM_USRQ_ASSIGN: 앞에 남김 QUERY_ID,USER_ID
alter table TB_MCM_USRQ_ASSIGN modify (VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_USRQ_ASSIGN modify (VER visible);
alter table TB_MCM_USRQ_ASSIGN modify (C_USR_ID visible);
alter table TB_MCM_USRQ_ASSIGN modify (C_AT visible);
alter table TB_MCM_USRQ_ASSIGN modify (C_SVC_ID visible);
alter table TB_MCM_USRQ_ASSIGN modify (C_PGM_ID visible);
alter table TB_MCM_USRQ_ASSIGN modify (U_USR_ID visible);
alter table TB_MCM_USRQ_ASSIGN modify (U_AT visible);
alter table TB_MCM_USRQ_ASSIGN modify (U_SVC_ID visible);
alter table TB_MCM_USRQ_ASSIGN modify (U_PGM_ID visible);

-- 뷰 다시 컴파일
alter view VI_MCM_CODE_ACCESS compile;
