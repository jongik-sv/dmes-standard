-- TSK-01-03 design.md §3.6 — mcm DataInitializer 의 MDM 메뉴·RBAC 시드 대조(읽기 전용).
-- 사용: sqlite3 <격리 mcm.db> < e2e/fixtures/mdm-rbac-seed-check.sql | diff - e2e/fixtures/mdm-rbac-seed-check.expected.txt
-- 마지막 SELECT(e2e 사용자 0명)는 mdm-rbac-users.sql 픽스처를 넣기 **전**에만 참이다. 매 실행은 새 mcm.db 로 시작한다.
-- FULL_SEQ·MENU_SEQ 는 recomputeMenuFullSeq 가 다시 계산하므로 대조하지 않는다.
.mode list
.separator |
SELECT MENU_ID, MENU_NM, IFNULL(PARENT_MENU_ID,'-') FROM TB_MCM_SEC_MENU_FLD WHERE MENU_ID IN ('mdm','dma','dmb','dmc','dmd','dme') ORDER BY MENU_ID;
SELECT ROLE_ID FROM TB_MCM_SEC_ROLE WHERE ROLE_ID LIKE 'MDM\_%' ESCAPE '\' ORDER BY ROLE_ID;
SELECT ROLE_GROUP_ID, ROLE_ID FROM TB_MCM_SEC_ROLEGROUP_MAPPING WHERE ROLE_ID LIKE 'MDM\_%' ESCAPE '\' ORDER BY 1;
SELECT PERMISSION_ID, IFNULL(PERMISSION_COMMON,'-'), IFNULL(PERMISSION_CUSTOM,'-'), IFNULL(POPUP_BTN,'-'), PERMISSION_ACTION FROM TB_MCM_SEC_PERM WHERE PERMISSION_ID LIKE 'PERM\_MDM\_%' ESCAPE '\' ORDER BY 1;
SELECT ROLE_ID, OBJECT_ID, PERMISSION_ID FROM TB_MCM_SEC_ROLE_MAPPING WHERE OBJECT_ID='mdmSample' ORDER BY ROLE_ID;
SELECT COUNT(*) FROM TB_MCM_SEC_USER WHERE USER_ID LIKE 'e2e\_%' ESCAPE '\';
