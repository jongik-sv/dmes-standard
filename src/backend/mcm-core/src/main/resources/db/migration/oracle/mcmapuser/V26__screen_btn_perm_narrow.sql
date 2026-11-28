-- ============================================================
-- V26: 화면별 버튼 허용 값 바로잡기 — 오브젝트 BTN_PERM·POPUP_PERM 을 화면의 실제 버튼으로, 직무 퍼미션을 그 안으로
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (2026-11-28 사용자 지적 「버튼 권한이 다 일률적이다」):
--   V21·기동 시더(fillObjPermFromCatalog)가 오브젝트 허용 값에 「PERM_ALL 아닌 옛 묶음 토큰」을 화면과 상관없이 합쳤다.
--   MDM 옛 묶음(PERM_MDM_READ·EDIT·CONFIRM)은 MDM 동작 16개를 모두 나열한 범용 목록이라, MDM 화면 27개의
--   BTN_PERM 이 같은 긴 목록 두 가지가 되었다(코드 등록 화면에 lock·import 등). 직무 퍼미션(TB_MCM_SEC_ROLE_PERM)도
--   그 묶음을 그대로 옮겨 값이 몇 가지뿐이었다.
--   1) 오브젝트 허용 값 = 화면의 실제 버튼 = BPMN actionGateway 분기 ∪ scripts/perm/rest-supplement.json
--      (REST action 과 FE 버튼 게이트 키 — 확정 화면으로 가는 confirm, 행 취소 cancel 등). 값은 이 파일을 만들 때의
--      scripts/perm/obj-perm.generated.json 그대로다(ObjPermCatalog 와 같다). POPUP 카탈로그는 비어 있어 POPUP_PERM 은 NULL.
--   2) 직무 퍼미션 = 옛 값 ∩ 새 오브젝트 허용 값(옛 순서 유지). 범용 긴 목록은 MDM 동작을 모두 담으므로 교집합이 곧
--      「새 허용 값 전부」다. 편집 묶음(EDIT)에는 confirm 이 없어서 교집합에도 confirm 이 들어가지 않는다(ADR-0003 D5 유지).
--      교집합이 비는 줄은 지운다(BTN_PERM not null, D14). 오브젝트 허용 값이 빈 오브젝트의 줄은 건드리지 않는다.
--   SYSADMIN 은 퍼미션 행 없이 계산한다(D13) — 손대지 않는다.
--   계산 결과(역할 ∩ 오브젝트, PermEvaluator)는 바뀌지 않는다: 빠지는 토큰은 화면이 쓰지 않는 것뿐이다.
--   기동 시더도 같은 규칙으로 고쳤다(SeedSupport.ensureRolePerm 이 카탈로그 안 토큰만 쓴다).
--
-- 재실행: DML 만 있다. 값이 같은 오브젝트는 조건에서 빠지고, 이미 줄인 직무 줄은 바뀌지 않는다.
-- ============================================================

-- 1) 오브젝트 허용 값(목록에 없는 오브젝트는 0행)
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'period,search', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'auditLog' AND (DECODE(BTN_PERM, 'period,search', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'compare,restore,save,search,validate,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'codeCateEdit' AND (DECODE(BTN_PERM, 'compare,restore,save,search,validate,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'confirm,search,validate,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'codeConfirm' AND (DECODE(BTN_PERM, 'confirm,search,validate,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'confirm,delete,execute,handover,lock,reg,restore,save,search,unlock,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'codeEdit' AND (DECODE(BTN_PERM, 'confirm,delete,execute,handover,lock,reg,restore,save,search,unlock,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'compare,execute,restore,save,search,validate,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'codeItemEdit' AND (DECODE(BTN_PERM, 'compare,execute,restore,save,search,validate,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'reg,search', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'codeMng' AND (DECODE(BTN_PERM, 'reg,search', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'compare,save,search,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'columnMng' AND (DECODE(BTN_PERM, 'compare,save,search,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'cancel,commonList,save,saveCmMenuFld,search,searchCmMenuFld,searchMenuGrp,searchObj,searchUnplacedObj', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'commMenuMng' AND (DECODE(BTN_PERM, 'cancel,commonList,save,saveCmMenuFld,search,searchCmMenuFld,searchMenuGrp,searchObj,searchUnplacedObj', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'cancel,lov,save,search,searchObjMenu,searchObjPerm,searchSystemLov', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'commObjMng' AND (DECODE(BTN_PERM, 'cancel,lov,save,search,searchObjMenu,searchObjPerm,searchSystemLov', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'apply,discardDraft,explain,impact,loadDraft,saveDraft,searchBench,searchHistory,searchHistoryDtl,searchMenuTree,searchRolePerm', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'commPermBench' AND (DECODE(BTN_PERM, 'apply,discardDraft,explain,impact,loadDraft,saveDraft,searchBench,searchHistory,searchHistoryDtl,searchMenuTree,searchRolePerm', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'cancel,lov,save,search,searchPermOne', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'commPermMng' AND (DECODE(BTN_PERM, 'cancel,lov,save,search,searchPermOne', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'cancel,save,saveCmRoleGrpMap,search,searchCmRole,searchCmRoleGrpMap,searchCmRoleGrpMenu', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'commRoleGrpMng' AND (DECODE(BTN_PERM, 'cancel,save,saveCmRoleGrpMap,search,searchCmRole,searchCmRoleGrpMap,searchCmRoleGrpMenu', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'cancel,lov,save,saveCmRoleMap,search,searchCmPerm,searchCmRoleMap,searchFolderObj,searchObjectLov,searchRoleGroups', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'commRoleMng' AND (DECODE(BTN_PERM, 'cancel,lov,save,saveCmRoleMap,search,searchCmPerm,searchCmRoleMap,searchFolderObj,searchObjectLov,searchRoleGroups', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'commonUserDept,deleteCmUser,handover,pwdinit,reRegCmUser,regCmUser,regHrEvtUser,resume,retire,retryHrEvt,save,saveUserRoleGrp,saveUserRoleGrpCopy,search,searchActiveUserLov,searchDeptLov,searchHrEvt,searchOwned,searchRetirePreview,searchRoleGrp,searchUserRoleGrp,suspend,unlock', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'commUserMng' AND (DECODE(BTN_PERM, 'commonUserDept,deleteCmUser,handover,pwdinit,reRegCmUser,regCmUser,regHrEvtUser,resume,retire,retryHrEvt,save,saveUserRoleGrp,saveUserRoleGrpCopy,search,searchActiveUserLov,searchDeptLov,searchHrEvt,searchOwned,searchRetirePreview,searchRoleGrp,searchUserRoleGrp,suspend,unlock', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'save,search,searchUserList', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'commUserRoleCopy' AND (DECODE(BTN_PERM, 'save,search,searchUserList', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'delete,deleteDefaultTab,deleteLayout,loadDefaultTabs,loadLayout,previewQuery,reorderDefaultTabs,save,saveDefaultTab,saveLayout,search,searchDepts,searchLayouts,upload', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'commWidgetMng' AND (DECODE(BTN_PERM, 'delete,deleteDefaultTab,deleteLayout,loadDefaultTabs,loadLayout,previewQuery,reorderDefaultTabs,save,saveDefaultTab,saveLayout,search,searchDepts,searchLayouts,upload', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'compare,delete,reg,restore,save,search,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'dataCateEdit' AND (DECODE(BTN_PERM, 'compare,delete,reg,restore,save,search,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'save,validate', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'dataCsvUploadPop' AND (DECODE(BTN_PERM, 'save,validate', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'delete,save,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'dataEdit' AND (DECODE(BTN_PERM, 'delete,save,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'search,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'dataHistory' AND (DECODE(BTN_PERM, 'search,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'delete,reg,restore,save,search,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'dataItemMng' AND (DECODE(BTN_PERM, 'delete,reg,restore,save,search,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'reg,search', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'dataMng' AND (DECODE(BTN_PERM, 'reg,search', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'query', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'dbViewer' AND (DECODE(BTN_PERM, 'query', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'delete,execute,save,search,validate,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'domainMng' AND (DECODE(BTN_PERM, 'delete,execute,save,search,validate,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'compare,confirm,copy,delete,execute,handover,import,lock,reg,restore,save,search,unlock,validate,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'erdEdit' AND (DECODE(BTN_PERM, 'compare,confirm,copy,delete,execute,handover,import,lock,reg,restore,save,search,unlock,validate,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'confirm,copy,delete,handover,lock,save,search,unlock,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'headerMng' AND (DECODE(BTN_PERM, 'confirm,copy,delete,handover,lock,save,search,unlock,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'collectData,cronPreview,delete,get,handlers,history,list,runNow,save,search,setUse', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'jobSchedMng' AND (DECODE(BTN_PERM, 'collectData,cronPreview,delete,get,handlers,history,list,runNow,save,search,setUse', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'confirm,search,validate,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'layoutConfirm' AND (DECODE(BTN_PERM, 'confirm,search,validate,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'confirm,copy,delete,execute,export,handover,lock,save,search,unlock,validate,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'layoutMng' AND (DECODE(BTN_PERM, 'confirm,copy,delete,execute,export,handover,lock,save,search,unlock,validate,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'search', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'logViewer' AND (DECODE(BTN_PERM, 'search', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'delete,reload,save,search', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'mdmCacheMng' AND (DECODE(BTN_PERM, 'delete,reload,save,search', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'search', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'mdmSample' AND (DECODE(BTN_PERM, 'search', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'save,search,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'metaFeed' AND (DECODE(BTN_PERM, 'save,search,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'search', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'noticeBoard' AND (DECODE(BTN_PERM, 'search', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'changeStatus,delete,save,search', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'noticeMgmt' AND (DECODE(BTN_PERM, 'changeStatus,delete,save,search', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'execute,search,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'ruleCalc' AND (DECODE(BTN_PERM, 'execute,search,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'confirm,search,validate,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'ruleConfirm' AND (DECODE(BTN_PERM, 'confirm,search,validate,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'execute,save,search,validate,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'ruleEdit' AND (DECODE(BTN_PERM, 'execute,save,search,validate,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'copy,delete,handover,lock,reg,save,search,unlock,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'ruleMng' AND (DECODE(BTN_PERM, 'copy,delete,handover,lock,reg,save,search,unlock,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'confirm,search,validate,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'ruleSetConfirm' AND (DECODE(BTN_PERM, 'confirm,search,validate,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'confirm,copy,delete,execute,handover,lock,restore,save,search,unlock,validate,view', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'ruleSetEdit' AND (DECODE(BTN_PERM, 'confirm,copy,delete,execute,handover,lock,restore,save,search,unlock,validate,view', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'reg,search', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'ruleSetMng' AND (DECODE(BTN_PERM, 'reg,search', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'record', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'screenUsage' AND (DECODE(BTN_PERM, 'record', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'byDept,byScreen,byUser,export,history,overview,search,unused', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'screenUsageStat' AND (DECODE(BTN_PERM, 'byDept,byScreen,byUser,export,history,overview,search,unused', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'search', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'searchDefaultsSample' AND (DECODE(BTN_PERM, 'search', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'save,search', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'secCodeGroup' AND (DECODE(BTN_PERM, 'save,search', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'lov,save,search', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'secCodeItem' AND (DECODE(BTN_PERM, 'lov,save,search', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'addFolder,deleteFolder,reorder,save,search,toggle', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'secFavorite' AND (DECODE(BTN_PERM, 'addFolder,deleteFolder,reorder,save,search,toggle', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'resetPage,savePage,search', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'secSrchDflt' AND (DECODE(BTN_PERM, 'resetPage,savePage,search', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'reorder,search,toggle', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'secStartPgm' AND (DECODE(BTN_PERM, 'reorder,search,toggle', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'myButtonEndpoints,myMenus,myMenusTree,myPermissions', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'secUser' AND (DECODE(BTN_PERM, 'myButtonEndpoints,myMenus,myMenusTree,myPermissions', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'deleteTab,reorderTabs,resetHome,resetTab,saveTab,search,searchUsers,shareTab', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'secWidget' AND (DECODE(BTN_PERM, 'deleteTab,reorderTabs,resetHome,resetTab,saveTab,search,searchUsers,shareTab', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'compare,delete,execute,save,search', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'termMng' AND (DECODE(BTN_PERM, 'compare,delete,execute,save,search', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'reg,search', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'termRegPop' AND (DECODE(BTN_PERM, 'reg,search', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'compare,delete,save,search', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'unitMng' AND (DECODE(BTN_PERM, 'compare,delete,save,search', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'getDef,myList,run', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'userQuery' AND (DECODE(BTN_PERM, 'getDef,myList,run', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'delete,get,previewQuery,save,saveAssign,search,searchAssign,searchDepts,searchUserList,validate', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'userQueryMng' AND (DECODE(BTN_PERM, 'delete,get,previewQuery,save,saveAssign,search,searchAssign,searchDepts,searchUserList,validate', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'history,reset,send', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'widgetChat' AND (DECODE(BTN_PERM, 'history,reset,send', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'run', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'widgetData' AND (DECODE(BTN_PERM, 'run', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'list', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'widgetDef' AND (DECODE(BTN_PERM, 'list', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'exchange,options,weather', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'widgetExt' AND (DECODE(BTN_PERM, 'exchange,options,weather', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'load,save', POPUP_PERM = NULL, VER = NVL(VER, 0) + 1, U_AT = SYSTIMESTAMP, U_USR_ID = 'FLYWAY', U_PGM_ID = 'V26', U_SVC_ID = 'V26'
 WHERE OBJECT_ID = 'widgetMemo' AND (DECODE(BTN_PERM, 'load,save', 0, 1) = 1 OR POPUP_PERM IS NOT NULL);

COMMIT;

-- 2) 직무 퍼미션 = 옛 값 ∩ 오브젝트 허용 값(교집합이 비면 줄을 지운다)
declare
    nb varchar2(1000 char);
    np varchar2(1000 char);

    function has(csv varchar2, tok varchar2) return boolean is
    begin
        return instr(',' || replace(csv, ' ', '') || ',', ',' || tok || ',') > 0;
    end;

    function keep(csv varchar2, allow varchar2) return varchar2 is
        acc varchar2(1000 char);
        tok varchar2(200 char);
        i   pls_integer := 1;
    begin
        if csv is null or allow is null then
            return null;
        end if;
        loop
            tok := regexp_substr(replace(csv, ' ', ''), '[^,]+', 1, i);
            exit when tok is null;
            if has(allow, tok) and (acc is null or not has(acc, tok)) then
                acc := case when acc is null then tok else acc || ',' || tok end;
            end if;
            i := i + 1;
        end loop;
        return acc;
    end;
begin
    for r in (select p.rowid rid, p.btn_perm, p.popup_perm, o.btn_perm obj_btn, o.popup_perm obj_pop
                from TB_MCM_SEC_ROLE_PERM p
                join TB_MCM_SEC_OBJ o on o.object_id = p.object_id
               where o.btn_perm is not null
                 and upper(p.role_id) not in ('SYSADMIN', 'ROLE_SYSADMIN')) loop
        nb := keep(r.btn_perm, r.obj_btn);
        np := keep(r.popup_perm, r.obj_pop);
        if nb is null then
            delete from TB_MCM_SEC_ROLE_PERM where rowid = r.rid;
        elsif nb <> r.btn_perm or nvl(np, '~') <> nvl(r.popup_perm, '~') then
            update TB_MCM_SEC_ROLE_PERM
               set btn_perm = nb, popup_perm = np, ver = nvl(ver, 0) + 1,
                   u_at = systimestamp, u_usr_id = 'FLYWAY', u_pgm_id = 'V26', u_svc_id = 'V26'
             where rowid = r.rid;
        end if;
    end loop;
    commit;
end;
/
