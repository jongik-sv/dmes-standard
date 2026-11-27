-- ============================================================
-- V21: 퍼미션 모델 v2 데이터 옮기기 — 옛 역할 매핑·권한 묶음 -> TB_MCM_SEC_ROLE_PERM, 오브젝트 허용 값 처음 채움
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 scripts/perm/gen-obj-perm.mjs 가 만든다(`node scripts/perm/gen-obj-perm.mjs --write`). 손으로 고치지 않는다.
--   카탈로그(아래 CAT) = BPMN actionGateway 분기 이름 + scripts/perm/rest-supplement.json. 오브젝트 62개 · action 303개.
--
-- 배경 (docs/perm-bench/decompose.md 결정 D11·D12·D13·D19):
--   1) TB_MCM_SEC_ROLE_PERM: 옛 (ROLE_ID, OBJECT_ID, PERMISSION_ID) 여러 줄 -> (ROLE_ID, OBJECT_ID) 한 줄(D11).
--      BTN_PERM  = 묶음의 PERMISSION_COMMON ∪ PERMISSION_CUSTOM ∪ PERMISSION_ACTION 토큰 합집합(쉼표 분할·trim·중복 제거·정렬).
--      POPUP_PERM = 묶음의 POPUP_BTN 토큰 합집합.
--      PERM_ALL 묶음의 토큰은 그 오브젝트의 카탈로그 action 과 교집합만 쓴다(D12). 다른 묶음 토큰은 그대로 쓴다.
--      SYSADMIN(ROLE_SYSADMIN 별칭 포함) 줄은 옮기지 않는다 — 퍼미션 행 없이 계산한다(D13).
--      BTN_PERM 이 비는 줄(popup 만 있거나 교집합이 비는 줄)은 건너뛴다(BTN_PERM not null, D14).
--   2) TB_MCM_SEC_OBJ.BTN_PERM·POPUP_PERM 처음 채움 = (PERM_ALL 아닌 묶음 토큰 중 그 오브젝트에 쓰인 것) ∪ 카탈로그 action(D12).
--      SYSADMIN 줄의 PERM_ALL 아닌 묶음 토큰도 포함한다. 이미 값이 있는 오브젝트는 건드리지 않는다.
--      DATA_PERM 은 비워 둔다(D21).
--   3) 부모(역할·오브젝트·묶음)가 없는 옛 줄 = 고아라 건너뛴다(D19). 건수는 scripts/perm/check-backfill.sql 이 보고한다.
--   POPUP 카탈로그: BPMN 에는 팝업을 여는 action 정보가 없어 카탈로그 popup 은 보충 파일에 적은 것만이다.
--   옛 TB_MCM_SEC_PERM·TB_MCM_SEC_ROLE_MAPPING 은 읽기만 하고 지우지 않는다(D10).
--   두 문장 모두 다시 실행해도 안전하다(MERGE: 이미 있는 퍼미션 줄·이미 채운 오브젝트는 그대로).
--   임시 표·DDL 없이 카탈로그를 리터럴 WITH 로 담는다(문장마다 같은 CAT 이 한 번 더 나온다).

-- ── 1. 역할×오브젝트 퍼미션 옮기기 ──
MERGE INTO TB_MCM_SEC_ROLE_PERM D
USING (
    WITH CAT AS (
        SELECT 'auditLog' AS OBJECT_ID, 'period,search' AS BTN_CSV, CAST(NULL AS VARCHAR2(1000 CHAR)) AS POP_CSV FROM DUAL
        UNION ALL
        SELECT 'codeCateEdit', 'compare,restore,save,search,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'codeConfirm', 'confirm,search,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'codeEdit', 'delete,execute,handover,lock,reg,restore,save,search,unlock,view', NULL FROM DUAL
        UNION ALL
        SELECT 'codeItemEdit', 'compare,execute,restore,save,search,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'codeMng', 'reg,search', NULL FROM DUAL
        UNION ALL
        SELECT 'columnMng', 'compare,save,search,view', NULL FROM DUAL
        UNION ALL
        SELECT 'commMenuMng', 'commonList,save,saveCmMenuFld,search,searchCmMenuFld,searchMenuGrp,searchObj', NULL FROM DUAL
        UNION ALL
        SELECT 'commObjMng', 'lov,save,search,searchObjMenu,searchObjPerm,searchSystemLov', NULL FROM DUAL
        UNION ALL
        SELECT 'commPermBench', 'apply,discardDraft,explain,impact,loadDraft,saveDraft,searchBench,searchHistory,searchHistoryDtl,searchMenuTree,searchRolePerm', NULL FROM DUAL
        UNION ALL
        SELECT 'commPermMng', 'lov,save,search,searchPermOne', NULL FROM DUAL
        UNION ALL
        SELECT 'commRoleGrpMng', 'save,saveCmRoleGrpMap,search,searchCmRole,searchCmRoleGrpMap,searchCmRoleGrpMenu', NULL FROM DUAL
        UNION ALL
        SELECT 'commRoleMng', 'lov,save,saveCmRoleMap,search,searchCmPerm,searchCmRoleMap,searchFolderObj,searchObjectLov,searchRoleGroups', NULL FROM DUAL
        UNION ALL
        SELECT 'commUserMng', 'commonUserDept,deleteCmUser,pwdinit,reRegCmUser,regCmUser,save,saveUserRoleGrp,saveUserRoleGrpCopy,search,searchDeptLov,searchRoleGrp,searchUserRoleGrp', NULL FROM DUAL
        UNION ALL
        SELECT 'commUserRoleCopy', 'save,search,searchUserList', NULL FROM DUAL
        UNION ALL
        SELECT 'commWidgetMng', 'delete,deleteDefaultTab,deleteLayout,loadDefaultTabs,loadLayout,previewQuery,reorderDefaultTabs,save,saveDefaultTab,saveLayout,search,searchDepts,searchLayouts,upload', NULL FROM DUAL
        UNION ALL
        SELECT 'dataCateEdit', 'compare,delete,reg,restore,save,search,view', NULL FROM DUAL
        UNION ALL
        SELECT 'dataCsvUploadPop', 'save,validate', NULL FROM DUAL
        UNION ALL
        SELECT 'dataEdit', 'delete,save,view', NULL FROM DUAL
        UNION ALL
        SELECT 'dataHistory', 'search,view', NULL FROM DUAL
        UNION ALL
        SELECT 'dataItemMng', 'delete,reg,restore,save,search,view', NULL FROM DUAL
        UNION ALL
        SELECT 'dataMng', 'reg,search', NULL FROM DUAL
        UNION ALL
        SELECT 'dbViewer', 'query', NULL FROM DUAL
        UNION ALL
        SELECT 'domainMng', 'delete,execute,save,search,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'erdEdit', 'compare,confirm,copy,delete,execute,handover,import,lock,reg,restore,save,search,unlock,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'headerMng', 'copy,delete,handover,lock,save,search,unlock,view', NULL FROM DUAL
        UNION ALL
        SELECT 'jobSchedMng', 'collectData,cronPreview,delete,get,handlers,history,list,runNow,save,setUse', NULL FROM DUAL
        UNION ALL
        SELECT 'layoutConfirm', 'confirm,search,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'layoutMng', 'copy,delete,execute,export,handover,lock,save,search,unlock,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'logViewer', 'search', NULL FROM DUAL
        UNION ALL
        SELECT 'mdmCacheMng', 'reload', NULL FROM DUAL
        UNION ALL
        SELECT 'mdmSample', 'search', NULL FROM DUAL
        UNION ALL
        SELECT 'metaFeed', 'save,search,view', NULL FROM DUAL
        UNION ALL
        SELECT 'noticeBoard', 'search', NULL FROM DUAL
        UNION ALL
        SELECT 'noticeMgmt', 'changeStatus,save,search', NULL FROM DUAL
        UNION ALL
        SELECT 'ruleCalc', 'execute,search,view', NULL FROM DUAL
        UNION ALL
        SELECT 'ruleConfirm', 'confirm,search,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'ruleEdit', 'execute,save,search,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'ruleMng', 'copy,delete,handover,lock,reg,save,search,unlock,view', NULL FROM DUAL
        UNION ALL
        SELECT 'ruleSetConfirm', 'confirm,search,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'ruleSetEdit', 'copy,delete,execute,handover,lock,restore,save,search,unlock,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'ruleSetMng', 'reg,search', NULL FROM DUAL
        UNION ALL
        SELECT 'screenUsage', 'record', NULL FROM DUAL
        UNION ALL
        SELECT 'screenUsageStat', 'byDept,byScreen,byUser,history,overview,unused', NULL FROM DUAL
        UNION ALL
        SELECT 'searchDefaultsSample', 'search', NULL FROM DUAL
        UNION ALL
        SELECT 'secCodeGroup', 'save,search', NULL FROM DUAL
        UNION ALL
        SELECT 'secCodeItem', 'lov,save,search', NULL FROM DUAL
        UNION ALL
        SELECT 'secFavorite', 'addFolder,deleteFolder,reorder,save,search,toggle', NULL FROM DUAL
        UNION ALL
        SELECT 'secSrchDflt', 'resetPage,savePage,search', NULL FROM DUAL
        UNION ALL
        SELECT 'secStartPgm', 'reorder,search,toggle', NULL FROM DUAL
        UNION ALL
        SELECT 'secUser', 'myButtonEndpoints,myMenus,myMenusTree,myPermissions', NULL FROM DUAL
        UNION ALL
        SELECT 'secWidget', 'deleteTab,reorderTabs,resetHome,resetTab,saveTab,search,searchUsers,shareTab', NULL FROM DUAL
        UNION ALL
        SELECT 'termMng', 'compare,delete,execute,save,search', NULL FROM DUAL
        UNION ALL
        SELECT 'termRegPop', 'reg,search', NULL FROM DUAL
        UNION ALL
        SELECT 'unitMng', 'compare,delete,save,search', NULL FROM DUAL
        UNION ALL
        SELECT 'userQuery', 'getDef,myList,run', NULL FROM DUAL
        UNION ALL
        SELECT 'userQueryMng', 'delete,get,previewQuery,save,saveAssign,search,searchAssign,searchDepts,searchUserList,validate', NULL FROM DUAL
        UNION ALL
        SELECT 'widgetChat', 'history,reset,send', NULL FROM DUAL
        UNION ALL
        SELECT 'widgetData', 'run', NULL FROM DUAL
        UNION ALL
        SELECT 'widgetDef', 'list', NULL FROM DUAL
        UNION ALL
        SELECT 'widgetExt', 'exchange,options,weather', NULL FROM DUAL
        UNION ALL
        SELECT 'widgetMemo', 'load,save', NULL FROM DUAL
    )
    , N AS (
        SELECT /*+ MATERIALIZE */ LEVEL AS N
        FROM   DUAL
        CONNECT BY LEVEL <= 500
    )
    , CAT_TOK AS (
        SELECT /*+ MATERIALIZE */ C.OBJECT_ID, 'B' AS KIND, TRIM(REGEXP_SUBSTR(C.BTN_CSV, '[^,]+', 1, N.N)) AS TOKEN
        FROM   CAT C, N
        WHERE  N.N <= REGEXP_COUNT(C.BTN_CSV, ',') + 1
        UNION ALL
        SELECT C.OBJECT_ID, 'P', TRIM(REGEXP_SUBSTR(C.POP_CSV, '[^,]+', 1, N.N))
        FROM   CAT C, N
        WHERE  N.N <= REGEXP_COUNT(C.POP_CSV, ',') + 1
    )
    , SRC AS (
        SELECT M.ROLE_ID, M.OBJECT_ID, M.PERMISSION_ID, 'B' AS KIND
             , P.PERMISSION_COMMON || ',' || P.PERMISSION_CUSTOM || ',' || P.PERMISSION_ACTION AS CSV
        FROM   TB_MCM_SEC_ROLE_MAPPING M, TB_MCM_SEC_ROLE R, TB_MCM_SEC_OBJ O, TB_MCM_SEC_PERM P
        WHERE  R.ROLE_ID = M.ROLE_ID
        AND    O.OBJECT_ID = M.OBJECT_ID
        AND    P.PERMISSION_ID = M.PERMISSION_ID
        UNION ALL
        SELECT M.ROLE_ID, M.OBJECT_ID, M.PERMISSION_ID, 'P', P.POPUP_BTN
        FROM   TB_MCM_SEC_ROLE_MAPPING M, TB_MCM_SEC_ROLE R, TB_MCM_SEC_OBJ O, TB_MCM_SEC_PERM P
        WHERE  R.ROLE_ID = M.ROLE_ID
        AND    O.OBJECT_ID = M.OBJECT_ID
        AND    P.PERMISSION_ID = M.PERMISSION_ID
    )
    , TOK AS (
        SELECT /*+ MATERIALIZE */ S.ROLE_ID, S.OBJECT_ID, S.PERMISSION_ID, S.KIND, TRIM(REGEXP_SUBSTR(S.CSV, '[^,]+', 1, N.N)) AS TOKEN
        FROM   SRC S, N
        WHERE  N.N <= REGEXP_COUNT(S.CSV, ',') + 1
    )
    , EFF AS (
        SELECT T.ROLE_ID, T.OBJECT_ID, T.KIND, T.TOKEN
        FROM   TOK T, CAT_TOK C
        WHERE  C.OBJECT_ID(+) = T.OBJECT_ID
        AND    C.KIND(+) = T.KIND
        AND    C.TOKEN(+) = T.TOKEN
        AND    T.TOKEN IS NOT NULL
        AND    (T.PERMISSION_ID <> 'PERM_ALL' OR C.OBJECT_ID IS NOT NULL)
    )
    , BTN AS (
        SELECT ROLE_ID, OBJECT_ID, LISTAGG(TOKEN, ',') WITHIN GROUP (ORDER BY TOKEN) AS CSV
        FROM   (SELECT DISTINCT ROLE_ID, OBJECT_ID, TOKEN
                FROM   EFF
                WHERE  KIND = 'B')
        GROUP BY ROLE_ID, OBJECT_ID
    )
    , POP AS (
        SELECT ROLE_ID, OBJECT_ID, LISTAGG(TOKEN, ',') WITHIN GROUP (ORDER BY TOKEN) AS CSV
        FROM   (SELECT DISTINCT ROLE_ID, OBJECT_ID, TOKEN
                FROM   EFF
                WHERE  KIND = 'P')
        GROUP BY ROLE_ID, OBJECT_ID
    )
    SELECT B.ROLE_ID, B.OBJECT_ID, B.CSV AS BTN_PERM, P.CSV AS POPUP_PERM
    FROM   BTN B, POP P
    WHERE  P.ROLE_ID(+) = B.ROLE_ID
    AND    P.OBJECT_ID(+) = B.OBJECT_ID
    AND    UPPER(B.ROLE_ID) NOT IN ('SYSADMIN', 'ROLE_SYSADMIN')
) S
ON (D.ROLE_ID = S.ROLE_ID AND D.OBJECT_ID = S.OBJECT_ID)
WHEN NOT MATCHED THEN
    INSERT (ROLE_ID, OBJECT_ID, BTN_PERM, POPUP_PERM, VER, C_USR_ID, C_AT, C_PGM_ID)
    VALUES (S.ROLE_ID, S.OBJECT_ID, S.BTN_PERM, S.POPUP_PERM, 0, 'V21', SYSTIMESTAMP, 'V21__perm_model_backfill');

-- ── 2. 오브젝트 허용 값 처음 채움 ──
MERGE INTO TB_MCM_SEC_OBJ O
USING (
    WITH CAT AS (
        SELECT 'auditLog' AS OBJECT_ID, 'period,search' AS BTN_CSV, CAST(NULL AS VARCHAR2(1000 CHAR)) AS POP_CSV FROM DUAL
        UNION ALL
        SELECT 'codeCateEdit', 'compare,restore,save,search,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'codeConfirm', 'confirm,search,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'codeEdit', 'delete,execute,handover,lock,reg,restore,save,search,unlock,view', NULL FROM DUAL
        UNION ALL
        SELECT 'codeItemEdit', 'compare,execute,restore,save,search,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'codeMng', 'reg,search', NULL FROM DUAL
        UNION ALL
        SELECT 'columnMng', 'compare,save,search,view', NULL FROM DUAL
        UNION ALL
        SELECT 'commMenuMng', 'commonList,save,saveCmMenuFld,search,searchCmMenuFld,searchMenuGrp,searchObj', NULL FROM DUAL
        UNION ALL
        SELECT 'commObjMng', 'lov,save,search,searchObjMenu,searchObjPerm,searchSystemLov', NULL FROM DUAL
        UNION ALL
        SELECT 'commPermBench', 'apply,discardDraft,explain,impact,loadDraft,saveDraft,searchBench,searchHistory,searchHistoryDtl,searchMenuTree,searchRolePerm', NULL FROM DUAL
        UNION ALL
        SELECT 'commPermMng', 'lov,save,search,searchPermOne', NULL FROM DUAL
        UNION ALL
        SELECT 'commRoleGrpMng', 'save,saveCmRoleGrpMap,search,searchCmRole,searchCmRoleGrpMap,searchCmRoleGrpMenu', NULL FROM DUAL
        UNION ALL
        SELECT 'commRoleMng', 'lov,save,saveCmRoleMap,search,searchCmPerm,searchCmRoleMap,searchFolderObj,searchObjectLov,searchRoleGroups', NULL FROM DUAL
        UNION ALL
        SELECT 'commUserMng', 'commonUserDept,deleteCmUser,pwdinit,reRegCmUser,regCmUser,save,saveUserRoleGrp,saveUserRoleGrpCopy,search,searchDeptLov,searchRoleGrp,searchUserRoleGrp', NULL FROM DUAL
        UNION ALL
        SELECT 'commUserRoleCopy', 'save,search,searchUserList', NULL FROM DUAL
        UNION ALL
        SELECT 'commWidgetMng', 'delete,deleteDefaultTab,deleteLayout,loadDefaultTabs,loadLayout,previewQuery,reorderDefaultTabs,save,saveDefaultTab,saveLayout,search,searchDepts,searchLayouts,upload', NULL FROM DUAL
        UNION ALL
        SELECT 'dataCateEdit', 'compare,delete,reg,restore,save,search,view', NULL FROM DUAL
        UNION ALL
        SELECT 'dataCsvUploadPop', 'save,validate', NULL FROM DUAL
        UNION ALL
        SELECT 'dataEdit', 'delete,save,view', NULL FROM DUAL
        UNION ALL
        SELECT 'dataHistory', 'search,view', NULL FROM DUAL
        UNION ALL
        SELECT 'dataItemMng', 'delete,reg,restore,save,search,view', NULL FROM DUAL
        UNION ALL
        SELECT 'dataMng', 'reg,search', NULL FROM DUAL
        UNION ALL
        SELECT 'dbViewer', 'query', NULL FROM DUAL
        UNION ALL
        SELECT 'domainMng', 'delete,execute,save,search,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'erdEdit', 'compare,confirm,copy,delete,execute,handover,import,lock,reg,restore,save,search,unlock,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'headerMng', 'copy,delete,handover,lock,save,search,unlock,view', NULL FROM DUAL
        UNION ALL
        SELECT 'jobSchedMng', 'collectData,cronPreview,delete,get,handlers,history,list,runNow,save,setUse', NULL FROM DUAL
        UNION ALL
        SELECT 'layoutConfirm', 'confirm,search,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'layoutMng', 'copy,delete,execute,export,handover,lock,save,search,unlock,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'logViewer', 'search', NULL FROM DUAL
        UNION ALL
        SELECT 'mdmCacheMng', 'reload', NULL FROM DUAL
        UNION ALL
        SELECT 'mdmSample', 'search', NULL FROM DUAL
        UNION ALL
        SELECT 'metaFeed', 'save,search,view', NULL FROM DUAL
        UNION ALL
        SELECT 'noticeBoard', 'search', NULL FROM DUAL
        UNION ALL
        SELECT 'noticeMgmt', 'changeStatus,save,search', NULL FROM DUAL
        UNION ALL
        SELECT 'ruleCalc', 'execute,search,view', NULL FROM DUAL
        UNION ALL
        SELECT 'ruleConfirm', 'confirm,search,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'ruleEdit', 'execute,save,search,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'ruleMng', 'copy,delete,handover,lock,reg,save,search,unlock,view', NULL FROM DUAL
        UNION ALL
        SELECT 'ruleSetConfirm', 'confirm,search,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'ruleSetEdit', 'copy,delete,execute,handover,lock,restore,save,search,unlock,validate,view', NULL FROM DUAL
        UNION ALL
        SELECT 'ruleSetMng', 'reg,search', NULL FROM DUAL
        UNION ALL
        SELECT 'screenUsage', 'record', NULL FROM DUAL
        UNION ALL
        SELECT 'screenUsageStat', 'byDept,byScreen,byUser,history,overview,unused', NULL FROM DUAL
        UNION ALL
        SELECT 'searchDefaultsSample', 'search', NULL FROM DUAL
        UNION ALL
        SELECT 'secCodeGroup', 'save,search', NULL FROM DUAL
        UNION ALL
        SELECT 'secCodeItem', 'lov,save,search', NULL FROM DUAL
        UNION ALL
        SELECT 'secFavorite', 'addFolder,deleteFolder,reorder,save,search,toggle', NULL FROM DUAL
        UNION ALL
        SELECT 'secSrchDflt', 'resetPage,savePage,search', NULL FROM DUAL
        UNION ALL
        SELECT 'secStartPgm', 'reorder,search,toggle', NULL FROM DUAL
        UNION ALL
        SELECT 'secUser', 'myButtonEndpoints,myMenus,myMenusTree,myPermissions', NULL FROM DUAL
        UNION ALL
        SELECT 'secWidget', 'deleteTab,reorderTabs,resetHome,resetTab,saveTab,search,searchUsers,shareTab', NULL FROM DUAL
        UNION ALL
        SELECT 'termMng', 'compare,delete,execute,save,search', NULL FROM DUAL
        UNION ALL
        SELECT 'termRegPop', 'reg,search', NULL FROM DUAL
        UNION ALL
        SELECT 'unitMng', 'compare,delete,save,search', NULL FROM DUAL
        UNION ALL
        SELECT 'userQuery', 'getDef,myList,run', NULL FROM DUAL
        UNION ALL
        SELECT 'userQueryMng', 'delete,get,previewQuery,save,saveAssign,search,searchAssign,searchDepts,searchUserList,validate', NULL FROM DUAL
        UNION ALL
        SELECT 'widgetChat', 'history,reset,send', NULL FROM DUAL
        UNION ALL
        SELECT 'widgetData', 'run', NULL FROM DUAL
        UNION ALL
        SELECT 'widgetDef', 'list', NULL FROM DUAL
        UNION ALL
        SELECT 'widgetExt', 'exchange,options,weather', NULL FROM DUAL
        UNION ALL
        SELECT 'widgetMemo', 'load,save', NULL FROM DUAL
    )
    , N AS (
        SELECT /*+ MATERIALIZE */ LEVEL AS N
        FROM   DUAL
        CONNECT BY LEVEL <= 500
    )
    , CAT_TOK AS (
        SELECT /*+ MATERIALIZE */ C.OBJECT_ID, 'B' AS KIND, TRIM(REGEXP_SUBSTR(C.BTN_CSV, '[^,]+', 1, N.N)) AS TOKEN
        FROM   CAT C, N
        WHERE  N.N <= REGEXP_COUNT(C.BTN_CSV, ',') + 1
        UNION ALL
        SELECT C.OBJECT_ID, 'P', TRIM(REGEXP_SUBSTR(C.POP_CSV, '[^,]+', 1, N.N))
        FROM   CAT C, N
        WHERE  N.N <= REGEXP_COUNT(C.POP_CSV, ',') + 1
    )
    , SRC AS (
        SELECT M.ROLE_ID, M.OBJECT_ID, M.PERMISSION_ID, 'B' AS KIND
             , P.PERMISSION_COMMON || ',' || P.PERMISSION_CUSTOM || ',' || P.PERMISSION_ACTION AS CSV
        FROM   TB_MCM_SEC_ROLE_MAPPING M, TB_MCM_SEC_ROLE R, TB_MCM_SEC_OBJ O, TB_MCM_SEC_PERM P
        WHERE  R.ROLE_ID = M.ROLE_ID
        AND    O.OBJECT_ID = M.OBJECT_ID
        AND    P.PERMISSION_ID = M.PERMISSION_ID
        UNION ALL
        SELECT M.ROLE_ID, M.OBJECT_ID, M.PERMISSION_ID, 'P', P.POPUP_BTN
        FROM   TB_MCM_SEC_ROLE_MAPPING M, TB_MCM_SEC_ROLE R, TB_MCM_SEC_OBJ O, TB_MCM_SEC_PERM P
        WHERE  R.ROLE_ID = M.ROLE_ID
        AND    O.OBJECT_ID = M.OBJECT_ID
        AND    P.PERMISSION_ID = M.PERMISSION_ID
    )
    , TOK AS (
        SELECT /*+ MATERIALIZE */ S.ROLE_ID, S.OBJECT_ID, S.PERMISSION_ID, S.KIND, TRIM(REGEXP_SUBSTR(S.CSV, '[^,]+', 1, N.N)) AS TOKEN
        FROM   SRC S, N
        WHERE  N.N <= REGEXP_COUNT(S.CSV, ',') + 1
    )
    , EFF AS (
        SELECT T.ROLE_ID, T.OBJECT_ID, T.KIND, T.TOKEN
        FROM   TOK T, CAT_TOK C
        WHERE  C.OBJECT_ID(+) = T.OBJECT_ID
        AND    C.KIND(+) = T.KIND
        AND    C.TOKEN(+) = T.TOKEN
        AND    T.TOKEN IS NOT NULL
        AND    (T.PERMISSION_ID <> 'PERM_ALL' OR C.OBJECT_ID IS NOT NULL)
    )
    , U_TOK AS (
        SELECT OBJECT_ID, KIND, TOKEN
        FROM   TOK
        WHERE  TOKEN IS NOT NULL
        AND    PERMISSION_ID <> 'PERM_ALL'
        UNION
        SELECT OBJECT_ID, KIND, TOKEN
        FROM   CAT_TOK
        WHERE  TOKEN IS NOT NULL
    )
    , BTN AS (
        SELECT OBJECT_ID, LISTAGG(TOKEN, ',') WITHIN GROUP (ORDER BY TOKEN) AS CSV
        FROM   U_TOK
        WHERE  KIND = 'B'
        GROUP BY OBJECT_ID
    )
    , POP AS (
        SELECT OBJECT_ID, LISTAGG(TOKEN, ',') WITHIN GROUP (ORDER BY TOKEN) AS CSV
        FROM   U_TOK
        WHERE  KIND = 'P'
        GROUP BY OBJECT_ID
    )
    SELECT X.OBJECT_ID, B.CSV AS BTN_PERM, P.CSV AS POPUP_PERM
    FROM   TB_MCM_SEC_OBJ X, BTN B, POP P
    WHERE  B.OBJECT_ID(+) = X.OBJECT_ID
    AND    P.OBJECT_ID(+) = X.OBJECT_ID
    AND    (B.OBJECT_ID IS NOT NULL OR P.OBJECT_ID IS NOT NULL)
) S
ON (O.OBJECT_ID = S.OBJECT_ID)
WHEN MATCHED THEN
    UPDATE SET O.BTN_PERM = S.BTN_PERM
             , O.POPUP_PERM = S.POPUP_PERM
             , O.U_USR_ID = 'V21'
             , O.U_AT = SYSTIMESTAMP
             , O.U_PGM_ID = 'V21__perm_model_backfill'
    WHERE  O.BTN_PERM IS NULL
    AND    O.POPUP_PERM IS NULL;

COMMIT;
