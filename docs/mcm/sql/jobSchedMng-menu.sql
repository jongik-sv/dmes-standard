-- ============================================================
-- 예약 작업 관리(csa/jobSchedMng) 메뉴·권한 등록 — 멱등(여러 번 실행해도 같다)
-- ============================================================
-- 대상: MCMAPUSER 스키마(TB_MCM_SEC_OBJ·TB_MCM_SEC_MENU·TB_MCM_SEC_ROLE_MAPPING·TB_MCM_SEC_PERM).
-- 적용은 조정자가 한다(L_MAIN 에는 이 레인이 쓰지 않는다 — docs/superpowers/specs/2026-10-08-job-scheduler-design.md §10).
-- 새 DB 는 mcm 기동 때 DataInitializer 가 같은 행을 넣는다(ModuleMenuSeeder.seedJobSchedMngMenu = OBJECT·메뉴·SYSADMIN 매핑,
-- CoreRbacSeeder.allActions = PERM_ALL 의 action). 이 파일은 mcm 을 재기동하지 않고 이미 떠 있는 DB 에 먼저 넣을 때 쓴다.
-- 시더와 이 파일은 둘 다 멱등이라 겹쳐 실행해도 중복 행이 생기지 않는다. 실행 뒤 mcm 의 메뉴·권한 캐시는 재기동(또는 시드 이벤트)으로 비운다.

MERGE INTO MCMAPUSER.TB_MCM_SEC_OBJ T
USING (SELECT 'jobSchedMng' OBJECT_ID FROM DUAL) S
ON    (T.OBJECT_ID = S.OBJECT_ID)
WHEN NOT MATCHED THEN INSERT
      (OBJECT_ID, OBJECT_NM, OBJECT_TYPE, SYSTEM_CODE, ACCESS_TP, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE,
       C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
VALUES (S.OBJECT_ID, '예약 작업 관리', 'web', 'mcm', '내부', 'Y', SYSTIMESTAMP, TIMESTAMP '9999-12-31 23:59:59',
        SYSTIMESTAMP, 'admin', 'jobSchedMng-menu.sql', 'jobSchedMng-menu.sql', SYSTIMESTAMP, 'admin', 'jobSchedMng-menu.sql', 'jobSchedMng-menu.sql', 0);

MERGE INTO MCMAPUSER.TB_MCM_SEC_MENU T
USING (SELECT 'jobSchedMng' MENU_ID FROM DUAL) S
ON    (T.MENU_ID = S.MENU_ID)
WHEN NOT MATCHED THEN INSERT
      (MENU_ID, MENU_NM, MENU_SEQ, FULL_SEQ, MENU_TP, MENU_VIEW_YN, OBJECT_ID, PARENT_MENU_ID, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE,
       C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
VALUES (S.MENU_ID, '예약 작업 관리', '00000001', '1020220', 'WEB', 'Y', 'jobSchedMng', 'csa', 'Y', SYSTIMESTAMP, TIMESTAMP '9999-12-31 23:59:59',
        SYSTIMESTAMP, 'admin', 'jobSchedMng-menu.sql', 'jobSchedMng-menu.sql', SYSTIMESTAMP, 'admin', 'jobSchedMng-menu.sql', 'jobSchedMng-menu.sql', 0);

MERGE INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING T
USING (SELECT 'SYSADMIN' ROLE_ID, 'jobSchedMng' OBJECT_ID, 'PERM_ALL' PERMISSION_ID FROM DUAL) S
ON    (T.ROLE_ID = S.ROLE_ID AND T.OBJECT_ID = S.OBJECT_ID AND T.PERMISSION_ID = S.PERMISSION_ID)
WHEN NOT MATCHED THEN INSERT
      (ROLE_ID, OBJECT_ID, PERMISSION_ID, C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
VALUES (S.ROLE_ID, S.OBJECT_ID, S.PERMISSION_ID, SYSTIMESTAMP, 'admin', 'jobSchedMng-menu.sql', 'jobSchedMng-menu.sql', SYSTIMESTAMP, 'admin', 'jobSchedMng-menu.sql', 'jobSchedMng-menu.sql', 0);

-- PERM_ALL 의 action 목록에 없는 토큰은 SYSADMIN 도 403 이다 — 없는 것만 덧붙인다.
UPDATE MCMAPUSER.TB_MCM_SEC_PERM
SET    PERMISSION_ACTION = PERMISSION_ACTION || ',list'
WHERE  PERMISSION_ID = 'PERM_ALL'
AND    INSTR(',' || PERMISSION_ACTION || ',', ',list,') = 0;
UPDATE MCMAPUSER.TB_MCM_SEC_PERM
SET    PERMISSION_ACTION = PERMISSION_ACTION || ',get'
WHERE  PERMISSION_ID = 'PERM_ALL'
AND    INSTR(',' || PERMISSION_ACTION || ',', ',get,') = 0;
UPDATE MCMAPUSER.TB_MCM_SEC_PERM
SET    PERMISSION_ACTION = PERMISSION_ACTION || ',setUse'
WHERE  PERMISSION_ID = 'PERM_ALL'
AND    INSTR(',' || PERMISSION_ACTION || ',', ',setUse,') = 0;
UPDATE MCMAPUSER.TB_MCM_SEC_PERM
SET    PERMISSION_ACTION = PERMISSION_ACTION || ',runNow'
WHERE  PERMISSION_ID = 'PERM_ALL'
AND    INSTR(',' || PERMISSION_ACTION || ',', ',runNow,') = 0;
UPDATE MCMAPUSER.TB_MCM_SEC_PERM
SET    PERMISSION_ACTION = PERMISSION_ACTION || ',cronPreview'
WHERE  PERMISSION_ID = 'PERM_ALL'
AND    INSTR(',' || PERMISSION_ACTION || ',', ',cronPreview,') = 0;
UPDATE MCMAPUSER.TB_MCM_SEC_PERM
SET    PERMISSION_ACTION = PERMISSION_ACTION || ',handlers'
WHERE  PERMISSION_ID = 'PERM_ALL'
AND    INSTR(',' || PERMISSION_ACTION || ',', ',handlers,') = 0;
UPDATE MCMAPUSER.TB_MCM_SEC_PERM
SET    PERMISSION_ACTION = PERMISSION_ACTION || ',collectData'
WHERE  PERMISSION_ID = 'PERM_ALL'
AND    INSTR(',' || PERMISSION_ACTION || ',', ',collectData,') = 0;
COMMIT;
