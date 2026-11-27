package com.dongkuk.dmes.mcm.init.seed;

import java.util.Collections;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

/**
 * 오브젝트별 허용 action 카탈로그 — scripts/perm/gen-obj-perm.mjs 가 만든 파일이다. 손으로 고치지 않는다.
 *
 * <p>값은 BPMN actionGateway 분기 이름 + scripts/perm/rest-supplement.json 의 합집합(쉼표 구분, 정렬).
 * BTN = TB_MCM_SEC_OBJ.BTN_PERM, POPUP = TB_MCM_SEC_OBJ.POPUP_PERM 초기 값이다. 키 = OBJECT_ID(저장된 대소문자 그대로).
 * 바꾸려면 BPMN 이나 보충 파일을 고치고 {@code node scripts/perm/gen-obj-perm.mjs --write} 를 다시 돌린다.
 */
public final class ObjPermCatalog {

    private static final Map<String, String> BTN = new TreeMap<>();
    private static final Map<String, String> POPUP = new TreeMap<>();
    private static final Set<String> IDS;

    static {
        BTN.put("auditLog", "period,search");
        BTN.put("codeCateEdit", "compare,restore,save,search,validate,view");
        BTN.put("codeConfirm", "confirm,search,validate,view");
        BTN.put("codeEdit", "delete,execute,handover,lock,reg,restore,save,search,unlock,view");
        BTN.put("codeItemEdit", "compare,execute,restore,save,search,validate,view");
        BTN.put("codeMng", "reg,search");
        BTN.put("columnMng", "compare,save,search,view");
        BTN.put("commMenuMng", "commonList,save,saveCmMenuFld,search,searchCmMenuFld,searchMenuGrp,searchObj");
        BTN.put("commObjMng", "lov,save,search,searchObjMenu,searchObjPerm,searchSystemLov");
        BTN.put("commPermBench", "apply,discardDraft,explain,impact,loadDraft,saveDraft,searchBench,searchHistory,searchHistoryDtl,searchMenuTree,searchRolePerm");
        BTN.put("commPermMng", "lov,save,search,searchPermOne");
        BTN.put("commRoleGrpMng", "save,saveCmRoleGrpMap,search,searchCmRole,searchCmRoleGrpMap,searchCmRoleGrpMenu");
        BTN.put("commRoleMng", "lov,save,saveCmRoleMap,search,searchCmPerm,searchCmRoleMap,searchFolderObj,searchObjectLov,searchRoleGroups");
        BTN.put("commUserMng", "commonUserDept,deleteCmUser,pwdinit,reRegCmUser,regCmUser,save,saveUserRoleGrp,saveUserRoleGrpCopy,search,searchDeptLov,searchRoleGrp,searchUserRoleGrp");
        BTN.put("commUserRoleCopy", "save,search,searchUserList");
        BTN.put("commWidgetMng", "delete,deleteDefaultTab,deleteLayout,loadDefaultTabs,loadLayout,previewQuery,reorderDefaultTabs,save,saveDefaultTab,saveLayout,search,searchDepts,searchLayouts,upload");
        BTN.put("dataCateEdit", "compare,delete,reg,restore,save,search,view");
        BTN.put("dataCsvUploadPop", "save,validate");
        BTN.put("dataEdit", "delete,save,view");
        BTN.put("dataHistory", "search,view");
        BTN.put("dataItemMng", "delete,reg,restore,save,search,view");
        BTN.put("dataMng", "reg,search");
        BTN.put("dbViewer", "query");
        BTN.put("domainMng", "delete,execute,save,search,validate,view");
        BTN.put("erdEdit", "compare,confirm,copy,delete,execute,handover,import,lock,reg,restore,save,search,unlock,validate,view");
        BTN.put("headerMng", "copy,delete,handover,lock,save,search,unlock,view");
        BTN.put("jobSchedMng", "collectData,cronPreview,delete,get,handlers,history,list,runNow,save,setUse");
        BTN.put("layoutConfirm", "confirm,search,validate,view");
        BTN.put("layoutMng", "copy,delete,execute,export,handover,lock,save,search,unlock,validate,view");
        BTN.put("logViewer", "search");
        BTN.put("mdmCacheMng", "reload");
        BTN.put("mdmSample", "search");
        BTN.put("metaFeed", "save,search,view");
        BTN.put("noticeBoard", "search");
        BTN.put("noticeMgmt", "changeStatus,save,search");
        BTN.put("ruleCalc", "execute,search,view");
        BTN.put("ruleConfirm", "confirm,search,validate,view");
        BTN.put("ruleEdit", "execute,save,search,validate,view");
        BTN.put("ruleMng", "copy,delete,handover,lock,reg,save,search,unlock,view");
        BTN.put("ruleSetConfirm", "confirm,search,validate,view");
        BTN.put("ruleSetEdit", "copy,delete,execute,handover,lock,restore,save,search,unlock,validate,view");
        BTN.put("ruleSetMng", "reg,search");
        BTN.put("screenUsage", "record");
        BTN.put("screenUsageStat", "byDept,byScreen,byUser,history,overview,unused");
        BTN.put("searchDefaultsSample", "search");
        BTN.put("secCodeGroup", "save,search");
        BTN.put("secCodeItem", "lov,save,search");
        BTN.put("secFavorite", "addFolder,deleteFolder,reorder,save,search,toggle");
        BTN.put("secSrchDflt", "resetPage,savePage,search");
        BTN.put("secStartPgm", "reorder,search,toggle");
        BTN.put("secUser", "myButtonEndpoints,myMenus,myMenusTree,myPermissions");
        BTN.put("secWidget", "deleteTab,reorderTabs,resetHome,resetTab,saveTab,search,searchUsers,shareTab");
        BTN.put("termMng", "compare,delete,execute,save,search");
        BTN.put("termRegPop", "reg,search");
        BTN.put("unitMng", "compare,delete,save,search");
        BTN.put("userQuery", "getDef,myList,run");
        BTN.put("userQueryMng", "delete,get,previewQuery,save,saveAssign,search,searchAssign,searchDepts,searchUserList,validate");
        BTN.put("widgetChat", "history,reset,send");
        BTN.put("widgetData", "run");
        BTN.put("widgetDef", "list");
        BTN.put("widgetExt", "exchange,options,weather");
        BTN.put("widgetMemo", "load,save");
        Set<String> ids = new TreeSet<>(BTN.keySet());
        ids.addAll(POPUP.keySet());
        IDS = Collections.unmodifiableSet(ids);
    }

    private ObjPermCatalog() {
    }

    /** objectId(as in TB_MCM_SEC_OBJ, case as stored) -> csv of allowed BTN actions, or null if unknown */
    public static String btnPerm(String objectId) {
        return objectId == null ? null : BTN.get(objectId);
    }

    /** objectId -> csv of allowed POPUP actions, or null */
    public static String popupPerm(String objectId) {
        return objectId == null ? null : POPUP.get(objectId);
    }

    /** all object ids known to the catalog, in sorted order */
    public static Set<String> objectIds() {
        return IDS;
    }
}
