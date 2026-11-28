-- ============================================================
-- 퍼미션 옮기기 점검 (읽기 전용) — scripts/perm/gen-obj-perm.mjs 가 만든다. 손으로 고치지 않는다.
-- ============================================================
-- 실행: MCMAPUSER 로 접속해 이 파일을 통째로 돌린다. 문장 둘 다 SELECT 뿐이다.
--   문장 1 = 옮기기 전(V20·V21 적용 전이어도 된다). 옛 표와 카탈로그만 읽어 V21 이 옮길 건수를 미리 보인다.
--   문장 2 = V20·V21 적용 뒤. 실제로 들어간 건수.
-- 항목 설명
--   OLD_MAPPING_ROWS          옛 TB_MCM_SEC_ROLE_MAPPING 줄 수
--   ORPHAN_ROLE/OBJ/PERM      부모(역할·오브젝트·묶음)가 없어 건너뛰는 옛 줄 수 (D19)
--   SKIP_SYSADMIN_ROWS        SYSADMIN·ROLE_SYSADMIN 이라 옮기지 않는 옛 줄 수 (D13)
--   PAIRS_CANDIDATE           옮길 후보 (ROLE_ID, OBJECT_ID) 쌍 수(SYSADMIN·고아 제외)
--   PAIRS_MIGRATE             BTN_PERM 이 비지 않아 실제로 옮길 쌍 수 = V21 이 만들 TB_MCM_SEC_ROLE_PERM 줄 수
--   PAIRS_EMPTY_BTN           BTN_PERM 이 비어 건너뛰는 쌍 수
--   OBJ_WILL_FILL             V21 이 BTN_PERM·POPUP_PERM 을 채울 오브젝트 수
--   OBJ_NO_VALUE              채울 값이 없어 NULL 로 남을 오브젝트 수(SYSADMIN 이 이 화면의 버튼을 못 쓰므로 보충 파일 점검)

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
    SELECT 'commMenuMng', 'commonList,save,saveCmMenuFld,search,searchCmMenuFld,searchMenuGrp,searchObj,searchUnplacedObj', NULL FROM DUAL
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
    SELECT 'commUserMng', 'commonUserDept,deleteCmUser,handover,pwdinit,reRegCmUser,regCmUser,regHrEvtUser,resume,retire,retryHrEvt,save,saveUserRoleGrp,saveUserRoleGrpCopy,search,searchActiveUserLov,searchDeptLov,searchHrEvt,searchOwned,searchRetirePreview,searchRoleGrp,searchUserRoleGrp,suspend,unlock', NULL FROM DUAL
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
, PAIR_ALL AS (
    SELECT DISTINCT ROLE_ID, OBJECT_ID
    FROM   SRC
    WHERE  ROLE_ID NOT IN ('SYSADMIN', 'ROLE_SYSADMIN')
)
, PAIR_BTN AS (
    SELECT DISTINCT ROLE_ID, OBJECT_ID
    FROM   EFF
    WHERE  KIND = 'B'
    AND    ROLE_ID NOT IN ('SYSADMIN', 'ROLE_SYSADMIN')
)
, U_TOK AS (
    SELECT OBJECT_ID
    FROM   TOK
    WHERE  TOKEN IS NOT NULL
    AND    PERMISSION_ID <> 'PERM_ALL'
    UNION
    SELECT OBJECT_ID
    FROM   CAT_TOK
    WHERE  TOKEN IS NOT NULL
)
SELECT 'OLD_MAPPING_ROWS' AS ITEM, COUNT(*) AS CNT
FROM   TB_MCM_SEC_ROLE_MAPPING
UNION ALL
SELECT 'ORPHAN_ROLE', COUNT(*)
FROM   TB_MCM_SEC_ROLE_MAPPING M
WHERE  NOT EXISTS (SELECT 1 FROM TB_MCM_SEC_ROLE R WHERE R.ROLE_ID = M.ROLE_ID)
UNION ALL
SELECT 'ORPHAN_OBJ', COUNT(*)
FROM   TB_MCM_SEC_ROLE_MAPPING M
WHERE  NOT EXISTS (SELECT 1 FROM TB_MCM_SEC_OBJ O WHERE O.OBJECT_ID = M.OBJECT_ID)
UNION ALL
SELECT 'ORPHAN_PERM', COUNT(*)
FROM   TB_MCM_SEC_ROLE_MAPPING M
WHERE  NOT EXISTS (SELECT 1 FROM TB_MCM_SEC_PERM P WHERE P.PERMISSION_ID = M.PERMISSION_ID)
UNION ALL
SELECT 'SKIP_SYSADMIN_ROWS', COUNT(*)
FROM   TB_MCM_SEC_ROLE_MAPPING M
WHERE  M.ROLE_ID IN ('SYSADMIN', 'ROLE_SYSADMIN')
UNION ALL
SELECT 'PAIRS_CANDIDATE', COUNT(*)
FROM   PAIR_ALL
UNION ALL
SELECT 'PAIRS_MIGRATE', COUNT(*)
FROM   PAIR_BTN
UNION ALL
SELECT 'PAIRS_EMPTY_BTN', COUNT(*)
FROM   PAIR_ALL A
WHERE  NOT EXISTS (SELECT 1 FROM PAIR_BTN B WHERE B.ROLE_ID = A.ROLE_ID AND B.OBJECT_ID = A.OBJECT_ID)
UNION ALL
SELECT 'OBJ_WILL_FILL', COUNT(*)
FROM   TB_MCM_SEC_OBJ X
WHERE  EXISTS (SELECT 1 FROM U_TOK U WHERE U.OBJECT_ID = X.OBJECT_ID)
UNION ALL
SELECT 'OBJ_NO_VALUE', COUNT(*)
FROM   TB_MCM_SEC_OBJ X
WHERE  NOT EXISTS (SELECT 1 FROM U_TOK U WHERE U.OBJECT_ID = X.OBJECT_ID);

-- 문장 2: V20·V21 적용 뒤 실제 건수
SELECT 'ROLE_PERM_ROWS' AS ITEM, COUNT(*) AS CNT
FROM   TB_MCM_SEC_ROLE_PERM
UNION ALL
SELECT 'OBJ_WITH_BTN_PERM', COUNT(*)
FROM   TB_MCM_SEC_OBJ
WHERE  BTN_PERM IS NOT NULL
UNION ALL
SELECT 'OBJ_WITHOUT_BTN_PERM', COUNT(*)
FROM   TB_MCM_SEC_OBJ
WHERE  BTN_PERM IS NULL;
