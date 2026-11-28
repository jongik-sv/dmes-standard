-- Oracle(MCMAPUSER) 대상, 문장마다 ';' (읽기 전용 SELECT 9개 — 트랜잭션·COMMIT 불필요). 문자열 리터럴 안에 ';' 없음.
-- TSK-01-03 design.md §3.6 — mcm DataInitializer 의 MDM 메뉴·RBAC 시드 대조(읽기 전용).
-- 사용: runSqlFile 류 도우미가 문장마다 실행해 각 행의 첫(유일한) 칸을 한 줄씩 이어 붙인 뒤 mdm-rbac-seed-check.expected.txt 와 글자 그대로 비교한다.
--   (SQLite 판은 .mode list · .separator | 로 열을 | 로 이었다. Oracle 판은 SELECT 가 || 로 한 칸 문자열을 직접 만든다 — 도우미는 열 구분을 하지 않는다.)
-- 마지막 SELECT(e2e 사용자 0명)는 mdm-rbac-users.sql 픽스처를 넣기 **전**에만 참이다. 매 실행은 새 mcm DB 로 시작한다.
-- MENU_SEQ 는 시드 마무리(MenuFinalizer)가 고칠 수 있으므로 대조하지 않는다(FULL_SEQ 칸은 2026-11-27 삭제).
-- 정렬은 기본(BINARY) NLS_SORT 전제 — SQLite 의 BINARY 정렬과 같다. NULL 칸은 || 에서 빈 문자열이 되고 NVL(…,'-') 칸은 '-' 가 된다.
SELECT MENU_ID || '|' || MENU_NM || '|' || NVL(PARENT_MENU_ID,'-') AS LINE FROM TB_MCM_SEC_MENU_FLD WHERE MENU_ID IN ('mdm','dma','dmb','dmc','dmd','dme') ORDER BY MENU_ID;
SELECT ROLE_ID AS LINE FROM TB_MCM_SEC_ROLE WHERE ROLE_ID LIKE 'MDM\_%' ESCAPE '\' ORDER BY ROLE_ID;
SELECT ROLE_GROUP_ID || '|' || ROLE_ID AS LINE FROM TB_MCM_SEC_ROLEGROUP_MAPPING WHERE ROLE_ID LIKE 'MDM\_%' ESCAPE '\' ORDER BY ROLE_GROUP_ID;
SELECT PERMISSION_ID || '|' || NVL(PERMISSION_COMMON,'-') || '|' || NVL(PERMISSION_CUSTOM,'-') || '|' || NVL(POPUP_BTN,'-') || '|' || PERMISSION_ACTION AS LINE FROM TB_MCM_SEC_PERM WHERE PERMISSION_ID LIKE 'PERM\_MDM\_%' ESCAPE '\' ORDER BY PERMISSION_ID;
SELECT ROLE_ID || '|' || OBJECT_ID || '|' || PERMISSION_ID AS LINE FROM TB_MCM_SEC_ROLE_MAPPING WHERE OBJECT_ID='mdmSample' ORDER BY ROLE_ID;
-- 2026-11-27 perm-bench c4 — 퍼미션 모델 v2(TB_MCM_SEC_ROLE_PERM) 대조 3개. ① mdmSample 의 MDM 역할 퍼미션(BTN = 옛 권한 세트 COMMON∪CUSTOM∪ACTION, POPUP = POPUP_BTN, D11)
--   ② 옛 MDM 역할 매핑(역할×오브젝트) 중 새 퍼미션 행이 없는 쌍 수 = 0 ③ SYSADMIN 퍼미션 행 수 = 0(D13 — SYSADMIN 은 행 없이 계산).
SELECT ROLE_ID || '|' || OBJECT_ID || '|' || BTN_PERM || '|' || NVL(POPUP_PERM,'-') AS LINE FROM TB_MCM_SEC_ROLE_PERM WHERE OBJECT_ID='mdmSample' AND ROLE_ID LIKE 'MDM\_%' ESCAPE '\' ORDER BY ROLE_ID;
SELECT TO_CHAR(COUNT(*)) AS LINE FROM (SELECT ROLE_ID, OBJECT_ID FROM TB_MCM_SEC_ROLE_MAPPING WHERE ROLE_ID LIKE 'MDM\_%' ESCAPE '\' MINUS SELECT ROLE_ID, OBJECT_ID FROM TB_MCM_SEC_ROLE_PERM);
SELECT TO_CHAR(COUNT(*)) AS LINE FROM TB_MCM_SEC_ROLE_PERM WHERE ROLE_ID = 'SYSADMIN';
SELECT TO_CHAR(COUNT(*)) AS LINE FROM TB_MCM_SEC_USER WHERE USER_ID LIKE 'e2e\_%' ESCAPE '\';
