-- Oracle(MCMAPUSER) 대상, 문장마다 ';' (읽기 전용 SELECT 6개 — 트랜잭션·COMMIT 불필요). 문자열 리터럴 안에 ';' 없음.
-- TSK-01-03 design.md §3.6 — mcm DataInitializer 의 MDM 메뉴·RBAC 시드 대조(읽기 전용).
-- 사용: runSqlFile 류 도우미가 문장마다 실행해 각 행의 첫(유일한) 칸을 한 줄씩 이어 붙인 뒤 mdm-rbac-seed-check.expected.txt 와 글자 그대로 비교한다.
--   (SQLite 판은 .mode list · .separator | 로 열을 | 로 이었다. Oracle 판은 SELECT 가 || 로 한 칸 문자열을 직접 만든다 — 도우미는 열 구분을 하지 않는다.)
-- 마지막 SELECT(e2e 사용자 0명)는 mdm-rbac-users.sql 픽스처를 넣기 **전**에만 참이다. 매 실행은 새 mcm DB 로 시작한다.
-- FULL_SEQ·MENU_SEQ 는 recomputeMenuFullSeq 가 다시 계산하므로 대조하지 않는다.
-- 정렬은 기본(BINARY) NLS_SORT 전제 — SQLite 의 BINARY 정렬과 같다. NULL 칸은 || 에서 빈 문자열이 되고 NVL(…,'-') 칸은 '-' 가 된다.
SELECT MENU_ID || '|' || MENU_NM || '|' || NVL(PARENT_MENU_ID,'-') AS LINE FROM TB_MCM_SEC_MENU_FLD WHERE MENU_ID IN ('mdm','dma','dmb','dmc','dmd','dme') ORDER BY MENU_ID;
SELECT ROLE_ID AS LINE FROM TB_MCM_SEC_ROLE WHERE ROLE_ID LIKE 'MDM\_%' ESCAPE '\' ORDER BY ROLE_ID;
SELECT ROLE_GROUP_ID || '|' || ROLE_ID AS LINE FROM TB_MCM_SEC_ROLEGROUP_MAPPING WHERE ROLE_ID LIKE 'MDM\_%' ESCAPE '\' ORDER BY ROLE_GROUP_ID;
SELECT PERMISSION_ID || '|' || NVL(PERMISSION_COMMON,'-') || '|' || NVL(PERMISSION_CUSTOM,'-') || '|' || NVL(POPUP_BTN,'-') || '|' || PERMISSION_ACTION AS LINE FROM TB_MCM_SEC_PERM WHERE PERMISSION_ID LIKE 'PERM\_MDM\_%' ESCAPE '\' ORDER BY PERMISSION_ID;
SELECT ROLE_ID || '|' || OBJECT_ID || '|' || PERMISSION_ID AS LINE FROM TB_MCM_SEC_ROLE_MAPPING WHERE OBJECT_ID='mdmSample' ORDER BY ROLE_ID;
SELECT TO_CHAR(COUNT(*)) AS LINE FROM TB_MCM_SEC_USER WHERE USER_ID LIKE 'e2e\_%' ESCAPE '\';
