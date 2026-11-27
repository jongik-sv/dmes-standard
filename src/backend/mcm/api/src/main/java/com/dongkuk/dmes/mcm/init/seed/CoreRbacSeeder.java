package com.dongkuk.dmes.mcm.init.seed;

import com.dongkuk.dmes.cactus.security.auth.PasswordEncoder;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

/**
 * 코어 RBAC 시드 — admin 사용자·비밀번호, SYSADMIN 역할그룹·역할, PERM_ALL, mcm 화면 OBJECT 와 ROLE_MAPPING
 * (2026-10-04 DataInitializer 분할, 분할 전 {@code seedMcmSecRbac} 앞부분).
 *
 * <p>PERM_ALL 의 action 목록({@code allActions})은 {@link #seedCoreRbac()} 안에 선언한다. 소스 대조 시험(mcm-core
 * ScreenUsageOasisContractTest · mdm MdmOasisActionVocabularyTest)이 그 선언을 이 파일에서 문자열로 읽는다.
 */
public final class CoreRbacSeeder extends SeedSupport {

    private final PasswordEncoder passwordEncoder;
    private final Environment environment;

    public CoreRbacSeeder(SeedSupport support, PasswordEncoder passwordEncoder, Environment environment) {
        super(support);
        this.passwordEncoder = passwordEncoder;
        this.environment = environment;
    }

    /**
     * 사용자·역할·권한·OBJECT·ROLE_MAPPING 멱등 적재. 모든 INSERT 는 존재 검증 후 skip.
     * PERM_ALL 의 PERMISSION_ACTION 은 메서드 안 {@code allActions} 선언의 콤마 텍스트다(토큰 순서가 곧 컬럼 값).
     */
    public void seedCoreRbac() {
        // TB_MCM_SEC_USER — admin
        insertIfAbsent(
                "TB_MCM_SEC_USER", "USER_ID", "admin",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_USER " +
                "(USER_ID, USER_NM, USER_EMP_NO, DEPT_CD, USE_TP, IN_OUT_EMP_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('admin', N'관리자', 'E0001', 'IT', 'Y', 'I', SYSTIMESTAMP, TIMESTAMP '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // TB_MCM_SEC_USER_PWD — admin 비밀번호 (BCrypt). passwordEncoder 가 null 인 빈 환경에서는 skip.
        if (passwordEncoder != null) {
            insertIfAbsent(
                    "TB_MCM_SEC_USER_PWD", "USER_ID", "admin",
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_USER_PWD " +
                    "(USER_ID, USER_ENC_PWD, LAST_PWD_CHNG_DATE" + AUDIT_COLS + ") " +
                    "VALUES ('admin', '" + escapeSql(passwordEncoder.encode("admin123")) + "', SYSTIMESTAMP" + AUDIT_VALS + ")");
            // 2026-06-05 사용자 결정 — 매 부팅 시 admin 비밀번호 admin123 으로 강제 재설정.
            //   사유: DB hash 가 commUserMng 의 "비밀번호 초기화" 액션 / 수동 변경으로 어긋난 경우 dev 환경 복구 안전망.
            //   운영 환경(prod profile)에서는 본 강제 갱신을 분기로 차단할 수 있도록 후속 cycle 에서 조건 추가 검토.
            String adminHash = passwordEncoder.encode("admin123");
            int updated = nq(
                    "UPDATE MCMAPUSER.TB_MCM_SEC_USER_PWD " +
                    "   SET USER_ENC_PWD = :hash, LAST_PWD_CHNG_DATE = SYSTIMESTAMP, U_USR_ID = 'admin', U_AT = SYSTIMESTAMP " +
                    " WHERE USER_ID = 'admin'")
                    .setParameter("hash", adminHash)
                    .executeUpdate();
            log.info("[DataInitializer] admin password force-reset to 'admin123' (UPDATE rows={})", updated);
        }
        unlockLocalAdmin();

        // TB_MCM_SEC_ROLEGROUP — ROLE_GROUP_SYSADMIN
        insertIfAbsent(
                "TB_MCM_SEC_ROLEGROUP", "ROLE_GROUP_ID", "ROLE_GROUP_SYSADMIN",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP " +
                "(ROLE_GROUP_ID, ROLE_GROUP_NM, ROLE_GROUP_DESC, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('ROLE_GROUP_SYSADMIN', N'시스템관리자 그룹', N'시스템 전체 관리 권한', 'Y', SYSTIMESTAMP, TIMESTAMP '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // TB_MCM_SEC_USER_MAPPING — (admin, ROLE_GROUP_SYSADMIN)
        insertIfAbsentComposite(
                "TB_MCM_SEC_USER_MAPPING",
                new String[]{"USER_ID", "ROLE_GROUP_ID"},
                new String[]{"admin",   "ROLE_GROUP_SYSADMIN"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_USER_MAPPING (USER_ID, ROLE_GROUP_ID" + AUDIT_COLS + ") " +
                "VALUES ('admin', 'ROLE_GROUP_SYSADMIN'" + AUDIT_VALS + ")");

        // TB_MCM_SEC_ROLE — SYSADMIN
        // 2026-06-01 fix — RoleId 에서 "ROLE_" prefix 제거. McmAuthService.loadUserRoles 가 "ROLE_" + roleId 로
        // JWT claim 빌드 시 결과는 "ROLE_SYSADMIN" (Spring Security 표준). EndpointPermissionFilter /
        // SecUserService.filterMenusByRole 의 hasAuthority("ROLE_SYSADMIN") 검사와 정합.
        insertIfAbsent(
                "TB_MCM_SEC_ROLE", "ROLE_ID", "SYSADMIN",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE " +
                "(ROLE_ID, ROLE_NM, ROLE_DESC, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', N'시스템관리자', N'전체 권한', 'Y', SYSTIMESTAMP, TIMESTAMP '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // 기존 잔존 "ROLE_SYSADMIN" row 가 있다면 swap UPDATE — 멱등성 (신규 클린 DB 무영향).
        // 외래키 (TB_MCM_SEC_ROLEGROUP_MAPPING.ROLE_ID / TB_MCM_SEC_ROLE_MAPPING.ROLE_ID) 도 동시 UPDATE.
        cleanupLegacyRoleSysadmin();

        // TB_MCM_SEC_ROLEGROUP_MAPPING — (ROLE_GROUP_SYSADMIN, SYSADMIN)
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLEGROUP_MAPPING",
                new String[]{"ROLE_GROUP_ID",       "ROLE_ID"},
                new String[]{"ROLE_GROUP_SYSADMIN", "SYSADMIN"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (ROLE_GROUP_ID, ROLE_ID" + AUDIT_COLS + ") " +
                "VALUES ('ROLE_GROUP_SYSADMIN', 'SYSADMIN'" + AUDIT_VALS + ")");

        // PERM_ALL (전체 권한) 의 action 목록 — 아래 TB_MCM_SEC_PERM INSERT 와 ensurePermAllActions 가 쓴다.
        // 소스 대조 시험(mcm-core ScreenUsageOasisContractTest · mdm MdmOasisActionVocabularyTest)이 이 선언을
        // 이 파일에서 문자열로 읽는다. 선언 모양(변수 이름·String.join)을 바꾸면 두 시험도 함께 고친다.
        String allActions = String.join(",",
                "search", "save", "delete", "import", "export", "reg",
                "confirm", "cancel", "approve", "reject", "copy",
                "deleteCmUser", "reRegCmUser", "regCmUser", "pwdinit",
                "searchUserRoleGrp", "saveUserRoleGrp",
                "searchRoleGrp", "saveUserRoleGrpCopy",
                "commonUserDept", "commonList",
                "searchObj", "searchCmMenu", "searchMenuGrp", "saveCmMenu",
                "searchCmMenuFld", "saveCmMenuFld",
                "searchCmRole", "saveCmRole",
                "searchCmRoleMap", "saveCmRoleMap",
                "searchCmPerm", "lov",
                "searchDetail", "saveDetail",
                "searchObjectLov", "searchSystemLov", "searchDeptLov",
                "searchCmRoleGrp", "saveCmRoleGrp",
                "searchCmRoleGrpMap", "saveCmRoleGrpMap",
                "searchCmRoleGrpMenu",
                "searchCmUser", "saveCmUser",
                "searchCmObj", "saveCmObj",
                "searchUserList",
                "execute", "validate", "analyze", "view",
                "activate", "deactivate", "compare", "restore",
                "apply", "release", "calculate",
                // TSK-08-02 D4 — mdm DRAFT 소유권(선점·해제·넘기기). mdm MdmActions·MdmPermissions 와 같은 이름.
                "lock", "unlock", "handover",
                // 2026-10-02 — 공지사항 관리(services/lsh/noticeMgmt.bpmn, 10-07 mls→mcm 이전) 게시상태 변경. 이 토큰이 없어 SYSADMIN 도
                //   게시중지가 403 이었다. 이미 시드된 DB 는 아래 ensurePermAllActions 가 끝에 덧붙인다.
                "changeStatus",
                // 2026-10-02 — mcm 화면 사용 통계(services/csa/screenUsageStat.bpmn) 6개 action. 이미 시드된 DB 는
                //   아래 ensurePermAllActions 가 덧붙인다. screenUsage/record 는 AUTH_ONLY 라 여기 넣지 않는다.
                "overview", "byScreen", "byDept", "byUser", "unused", "history",
                // 2026-10-02 — mcm 위젯관리(services/csa/commWidgetMng.bpmn) action 과 미디어 올리기(REST upload).
                //   search·save·delete 는 위에 있다. 사용자용 widgetDef·widgetData·widgetExt·widgetChat·widgetMemo·widgetMedia 는 AUTH_ONLY 라 넣지 않는다.
                "previewQuery", "searchLayouts", "loadLayout", "saveLayout", "deleteLayout", "searchDepts", "upload",
                // 2026-10-05 — 위젯관리 기본 탭 action(docs/widget-2026-10/design-widget-tabs.md §3.2). 이미 시드된 DB 는
                //   ensurePermAllActions 가 덧붙인다. 사용자용 secWidget 의 resetTab·shareTab·searchUsers 는 AUTH_ONLY 라 넣지 않는다.
                "loadDefaultTabs", "saveDefaultTab", "deleteDefaultTab", "reorderDefaultTabs",
                // 2026-10-02 — MDM 캐시 관리(csa/mdmCacheMng) 재등록 버튼. 이미 시드된 DB 는 ensurePermAllActions 가 덧붙인다.
                "reload",
                // 2026-10-08 — analog DB 뷰어(ADR-0002) REST 경유 action. BFF REST 신경로 규약의
                //   permKey 가 `{objId}/{action}` = `dbViewer/query` 라 이 토큰이 없으면 SYSADMIN 도 403 이다.
                //   (아래 코멘트 블록은 인자 열 끝이라 다음 토큰이 이어지도록 쉼표를 남긴다)
                "query",
                // 2026-10-09 — 예약 작업 관리(services/csa/jobSchedMng.bpmn) action. save·delete·history 는 위에 있다.
                //   이미 시드된 DB 는 ensurePermAllActions 가 덧붙인다.
                "list", "get", "setUse", "runNow", "cronPreview", "handlers",
                // 2026-10-09 — 예약 작업 관리 수집 값 읽기(jobSchedMng collectData). 읽기 전용이라도 여기 없으면 SYSADMIN 도 403 이다.
                "collectData",
                // 2026-10-10 — 맞춤 레포트(services/cmq/userQueryMng.bpmn·cmq/userQuery.bpmn, 스펙 2026-10-10 §3).
                //   search·get·save·delete·previewQuery·validate·searchUserList·searchDepts 는 위에 있다.
                //   myList·getDef·run 은 일반 역할용 PERM_USRQ_USE 에도 같이 들어 있다(아래 insertIfAbsent).
                "searchAssign", "saveAssign", "myList", "getDef", "run",
                // 2026-11-27 — 권한 작업대(services/csa/commPermBench, docs/perm-bench/decompose.md 0.3절). apply 는 위에 있다.
                //   D13 이후 이 목록은 어휘 목록이다. 퍼미션 모델 v2 의 SYSADMIN 은 오브젝트 허용 값으로 계산하고, 이 목록은 옛 PERM_ALL
                //   행(legacy 되돌림·r3 전 런타임)에만 들어간다. 이미 시드된 DB 는 ensurePermAllActions 가 덧붙인다.
                "searchBench", "searchMenuTree", "explain", "searchRolePerm",
                "loadDraft", "saveDraft", "discardDraft", "impact",
                "searchHistory", "searchHistoryDtl",
                // 2026-11-27 — 옛 화면 3종 새 설계(decompose.md 0.4절). commObjMng 의 searchObjPerm·searchObjMenu,
                //   commRoleMng 의 searchFolderObj·searchRoleGroups, commPermMng 의 searchPermOne. lov 는 위에 있다.
                "searchObjPerm", "searchObjMenu", "searchFolderObj", "searchRoleGroups", "searchPermOne"

                // ── 업무 모듈을 붙일 때 여기에 해당 모듈의 OASIS action 을 추가한다 ──────────────
                // 본 목록은 PERM_ALL 의 PERMISSION_ACTION 이며, UserPermCache 가 콤마 분할해 PermKey
                // (`{objId}/{action}`) 를 만든다. **여기에 없는 action 은 SYSADMIN 도 403 이다.**
                // 증상이 조용해서 추적이 어렵다 — 조회 1건은 되는데 콤보/팝업/저장만 죽는 형태로 나타난다.
                // 목록 정본 = 각 모듈 BPMN 의 actionGateway 분기명 전수:
                //   grep -h 'sourceRef="actionGateway"' src/backend/{모듈}/**/services/**/*.bpmn
                // 화면을 추가할 때마다 함께 갱신할 것.
        );

        // TB_MCM_SEC_PERM — PERM_ALL (전체 권한).
        // PERMISSION_ACTION 에 모든 action 콤마 텍스트 (UserPermCache 가 콤마 분할 후 PermKey 빌드).
        insertIfAbsent(
                "TB_MCM_SEC_PERM", "PERMISSION_ID", "PERM_ALL",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_PERM " +
                "(PERMISSION_ID, PERMISSION_NM, PERMISSION_DESC, PERMISSION_COMMON, PERMISSION_ACTION, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('PERM_ALL', N'전체 권한', N'SYSADMIN 전체 접근', " +
                "'search,save,delete,import,export', " +
                "'" + escapeSql(allActions) + "', " +
                "'Y', SYSTIMESTAMP, TIMESTAMP '9999-12-31 23:59:59'" + AUDIT_VALS + ")");
        ensurePermAllActions(allActions);

        // TB_MCM_SEC_PERM — PERM_USRQ_USE (맞춤 레포트 사용, 스펙 2026-10-10-user-query-program-design §3).
        // 일반 역할이 맞춤 레포트 조회(cmq/userQuery)를 쓰는 세트다 — 운영자가 역할에 매핑한다(이 시드는 SYSADMIN 만 PERM_ALL 로 둔다).
        // insert-if-absent 라 이미 있는 DB 의 값을 덮어쓰지 않는다.
        insertIfAbsent(
                "TB_MCM_SEC_PERM", "PERMISSION_ID", "PERM_USRQ_USE",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_PERM " +
                "(PERMISSION_ID, PERMISSION_NM, PERMISSION_DESC, PERMISSION_COMMON, PERMISSION_ACTION, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('PERM_USRQ_USE', N'맞춤 레포트 사용', N'맞춤 레포트 조회 화면 실행', " +
                "'myList,getDef,run', " +
                "'myList,getDef,run', " +
                "'Y', SYSTIMESTAMP, TIMESTAMP '9999-12-31 23:59:59'" + AUDIT_VALS + ")");
        // 2026-10-10 화면 이름 변경(공용 쿼리 조회 → 맞춤 레포트 조회)을 이미 시드된 DB 에도 — 옛 시드 값 그대로인 행만 고친다(멱등).
        nq("UPDATE MCMAPUSER.TB_MCM_SEC_PERM SET PERMISSION_NM = N'맞춤 레포트 사용' "
         + " WHERE PERMISSION_ID = 'PERM_USRQ_USE' AND PERMISSION_NM = N'공용 쿼리 사용'").executeUpdate();
        nq("UPDATE MCMAPUSER.TB_MCM_SEC_PERM SET PERMISSION_DESC = N'맞춤 레포트 조회 화면 실행' "
         + " WHERE PERMISSION_ID = 'PERM_USRQ_USE' AND PERMISSION_DESC = N'공용 쿼리 조회 화면 실행'").executeUpdate();

        // TB_MCM_SEC_OBJ — csa 7 화면 OBJECT 시드 (W1~W9).
        //   2026-10-16 — 옛 마스터코드·업무기준 프로그램(cma 4·cme 1·cmb 7·csa commSyncMng)은 걷어냈다(후속은 mdm).
        //   이미 적재된 DB 의 행은 Flyway mcmapuser V17 이 지운다.
        insertMcmSecObjIfAbsent("commObjMng",          "OBJECT 관리",                  "mcm");
        insertMcmSecObjIfAbsent("commMenuMng",         "MENU 관리",                    "mcm");
        insertMcmSecObjIfAbsent("commRoleMng",         "역할 관리",            "mcm");
        insertMcmSecObjIfAbsent("commRoleGrpMng",      "역할 그룹 관리", "mcm");
        insertMcmSecObjIfAbsent("commUserMng",         "사용자 관리",      "mcm");
        insertMcmSecObjIfAbsent("commPermMng",         "PERMISSION 관리",              "mcm");
        insertMcmSecObjIfAbsent("commUserRoleCopy",    "사용자 권한 일괄 등록", "mcm");

        // TB_MCM_SEC_ROLE_MAPPING — SYSADMIN x 7 OBJECT x PERM_ALL = 7 rows
        //   2026-11-27 perm-bench D13 — 옛 표 줄만 둔다(legacy 되돌림용). 새 TB_MCM_SEC_ROLE_PERM 에는 SYSADMIN 행을 넣지 않는다.
        for (String objId : new String[]{
                "commObjMng", "commMenuMng", "commRoleMng", "commRoleGrpMng", "commUserMng",
                "commPermMng", "commUserRoleCopy"}) {
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objId,       "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + escapeSql(objId) + "', 'PERM_ALL'" + AUDIT_VALS + ")");
        }
    }

    /**
     * 2026-06-01 fix — 기존 잔존 "ROLE_SYSADMIN" RoleId 를 "SYSADMIN" 으로 swap.
     *
     * <p>cycle 1 시드는 RoleId="ROLE_SYSADMIN" 으로 적재되었고, McmAuthService.loadUserRoles 가
     * "ROLE_" + roleId 를 prefix 로 붙여 JWT claim 을 만들어 "ROLE_ROLE_SYSADMIN" 이라는 double prefix
     * authority 가 생성. 결과적으로 hasAuthority("ROLE_SYSADMIN") 검사가 false → SYSADMIN bypass 실패.
     *
     * <p>fix 정책: 시드 RoleId 를 "SYSADMIN" (prefix 없음) 으로 변경 + 기존 row 를 멱등 UPDATE.
     * 신규 클린 DB 에서는 UPDATE 영향 0 (행 미존재) → 무영향.
     *
     * <p>처리 순서 (FK 영향 회피):
     * <ol>
     *   <li>TB_MCM_SEC_ROLEGROUP_MAPPING.ROLE_ID 변경 (자식)</li>
     *   <li>TB_MCM_SEC_ROLE_MAPPING.ROLE_ID 변경 (자식)</li>
     *   <li>TB_MCM_SEC_ROLE.ROLE_ID 변경 (부모)</li>
     * </ol>
     *
     * <p>SYSADMIN row 가 이미 시드되어 PK 충돌이 발생하지 않도록, 변경 전 SYSADMIN row 존재 시 ROLE_SYSADMIN row 만 삭제.
     */
    private void cleanupLegacyRoleSysadmin() {
        // SYSADMIN 신규 row 가 이미 존재하면, legacy ROLE_SYSADMIN row 들은 PK 충돌 회피를 위해 DELETE.
        Number sysadminExists = (Number) nq(
                "SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_ROLE WHERE ROLE_ID = 'SYSADMIN'")
                .getSingleResult();
        Number legacyExists = (Number) nq(
                "SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_ROLE WHERE ROLE_ID = 'ROLE_SYSADMIN'")
                .getSingleResult();
        if (legacyExists == null || legacyExists.intValue() == 0) {
            return; // 잔존 데이터 ✗ → 무영향
        }
        // 2026-11-27 perm-bench c4 — 퍼미션 모델 v2 행(TB_MCM_SEC_ROLE_PERM, FK → TB_MCM_SEC_ROLE, ON DELETE 없음)을 먼저 지운다.
        //   아래 두 갈래 모두 ROLE_SYSADMIN 역할 행을 지우거나 PK 를 바꾸므로 자식 행이 있으면 FK 오류로 기동이 멈춘다.
        //   SYSADMIN 은 퍼미션 행 없이 계산하므로(D13) 옮기지 않고 지운다.
        int dRp = nq(
                "DELETE FROM MCMAPUSER.TB_MCM_SEC_ROLE_PERM WHERE ROLE_ID = 'ROLE_SYSADMIN'")
                .executeUpdate();
        if (dRp > 0) {
            log.info("[DataInitializer] legacy ROLE_SYSADMIN 의 ROLE_PERM DELETE rows={}", dRp);
        }
        if (sysadminExists != null && sysadminExists.intValue() > 0) {
            // 충돌 회피 — legacy ROLE_SYSADMIN 자식 + 부모 DELETE (SYSADMIN 시드가 정본).
            int dRgm = nq(
                    "DELETE FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING WHERE ROLE_ID = 'ROLE_SYSADMIN'")
                    .executeUpdate();
            int dRm = nq(
                    "DELETE FROM MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING WHERE ROLE_ID = 'ROLE_SYSADMIN'")
                    .executeUpdate();
            int dRole = nq(
                    "DELETE FROM MCMAPUSER.TB_MCM_SEC_ROLE WHERE ROLE_ID = 'ROLE_SYSADMIN'")
                    .executeUpdate();
            log.info("[DataInitializer] legacy ROLE_SYSADMIN cleanup (SYSADMIN 충돌) — RGM={} RM={} ROLE={}",
                    dRgm, dRm, dRole);
            return;
        }
        // SYSADMIN row 미존재 → 단순 UPDATE swap (자식 먼저).
        int uRgm = nq(
                "UPDATE MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING SET ROLE_ID = 'SYSADMIN' " +
                "WHERE ROLE_ID = 'ROLE_SYSADMIN'")
                .executeUpdate();
        int uRm = nq(
                "UPDATE MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING SET ROLE_ID = 'SYSADMIN' " +
                "WHERE ROLE_ID = 'ROLE_SYSADMIN'")
                .executeUpdate();
        int uRole = nq(
                "UPDATE MCMAPUSER.TB_MCM_SEC_ROLE SET ROLE_ID = 'SYSADMIN' " +
                "WHERE ROLE_ID = 'ROLE_SYSADMIN'")
                .executeUpdate();
        log.info("[DataInitializer] legacy ROLE_SYSADMIN UPDATE swap — RGM={} RM={} ROLE={}",
                uRgm, uRm, uRole);
    }

    /**
     * local 프로필(로컬 Oracle PDB, 프로필 미지정 폴백 포함) 부팅 때 admin 의 로그인 잠금을 푼다 — PWD_FAIL_COUNT=0, USE_TP='Y'.
     *
     * <p>로그인 실패가 최대 횟수에 닿으면 USE_TP='N' 으로 잠긴다(AuthService · McmSecUserRepository#lockUser). 위의 비밀번호
     * 강제 재설정만으로는 풀리지 않아, 공용 로컬 DB 에서 admin 이 한 번 잠기면 재기동해도 admin 으로 로그인하는 e2e 가 모두 막힌다.
     * admin 외 계정, local 이 아닌 프로필(dev·prod 등)은 건드리지 않는다. 이미 풀려 있으면 쓰지 않는다.
     *
     * @return 되돌린 행 수(0 또는 1)
     */
    public int unlockLocalAdmin() {
        if (!environment.acceptsProfiles(Profiles.of("local"))) {
            return 0;
        }
        int updated = nq(
                "UPDATE MCMAPUSER.TB_MCM_SEC_USER SET PWD_FAIL_COUNT = 0, USE_TP = 'Y' " +
                " WHERE USER_ID = 'admin' " +
                "   AND (USE_TP IS NULL OR USE_TP <> 'Y' OR COALESCE(PWD_FAIL_COUNT, 0) <> 0)")
                .executeUpdate();
        if (updated > 0) {
            log.info("[DataInitializer] local — admin 로그인 잠금 해제 (PWD_FAIL_COUNT=0, USE_TP='Y')");
        }
        return updated;
    }

    /**
     * 퍼미션 모델 v2 — 오브젝트 허용 값({@code TB_MCM_SEC_OBJ.BTN_PERM·POPUP_PERM})을 {@link ObjPermCatalog} 로 처음 채운다
     * (2026-11-27 perm-bench c4, decompose.md D12·D13).
     *
     * <p>모든 시드 단계가 OBJECT 를 넣은 뒤에 부른다(DataInitializer). 칸이 비었을 때만 쓴다 — V21 이 채운 값과 관리자가 오브젝트 관리
     * 화면에서 고친 값은 보존한다. 목록에 있지만 DB 에 없는 오브젝트는 UPDATE 0행이다. 값 = 카탈로그 ∪ 그 오브젝트의 새 퍼미션
     * 행 토큰(SYSADMIN 제외, D12 — V21 과 같은 규칙, 토큰 정렬).
     *
     * <p>SYSADMIN 은 퍼미션 행 없이 「모든 사용 오브젝트 × (BTN_PERM ∪ POPUP_PERM)」으로 계산한다(D13). 그래서 SYSADMIN 의 새
     * 퍼미션 행은 시드하지 않는다(PERM_ALL → 새 표 시드 중단). 옛 PERM_ALL 행과 SYSADMIN × OBJECT × PERM_ALL 옛 매핑은 그대로 둔다 —
     * {@code mcm.security.perm-model=legacy} 되돌림과 런타임 전환(r3) 전 코드가 그 행을 읽는다(D10).
     *
     * @return 고친 칸 수
     */
    public int fillObjPermFromCatalog() {
        // D12 — 허용 값 = (그 오브젝트의 새 퍼미션 행 토큰, 곧 PERM_ALL 아닌 묶음 토큰) ∪ 카탈로그 action. V21 과 같은 규칙·같은 정렬이다.
        //   퍼미션 토큰을 빼면 시드한 MDM 퍼미션이 오브젝트 허용 값 밖(⊆ 위반, D15)이 되어 계산에서 빠지고 다시 저장할 수 없다.
        java.util.Map<String, java.util.Set<String>> btn = new java.util.TreeMap<>();
        java.util.Map<String, java.util.Set<String>> popup = new java.util.TreeMap<>();
        for (String objectId : ObjPermCatalog.objectIds()) {
            appendCsv(btn.computeIfAbsent(objectId, k -> new java.util.TreeSet<>()), ObjPermCatalog.btnPerm(objectId));
            appendCsv(popup.computeIfAbsent(objectId, k -> new java.util.TreeSet<>()), ObjPermCatalog.popupPerm(objectId));
        }
        @SuppressWarnings("unchecked")
        java.util.List<Object[]> perms = nq(
                "SELECT OBJECT_ID, BTN_PERM, POPUP_PERM FROM MCMAPUSER.TB_MCM_SEC_ROLE_PERM " +
                "WHERE UPPER(ROLE_ID) NOT IN ('SYSADMIN', 'ROLE_SYSADMIN')")
                .getResultList();
        for (Object[] p : perms) {
            String objectId = String.valueOf(p[0]);
            appendCsv(btn.computeIfAbsent(objectId, k -> new java.util.TreeSet<>()), p[1] == null ? null : p[1].toString());
            appendCsv(popup.computeIfAbsent(objectId, k -> new java.util.TreeSet<>()), p[2] == null ? null : p[2].toString());
        }
        int n = 0;
        for (java.util.Map.Entry<String, java.util.Set<String>> e : btn.entrySet()) {
            java.util.Set<String> pop = popup.getOrDefault(e.getKey(), java.util.Set.of());
            n += fillObjPermIfNull(e.getKey(), String.join(",", e.getValue()), String.join(",", pop));
        }
        log.info("[DataInitializer] OBJECT 허용 값 처음 채움(ObjPermCatalog {}개 + 퍼미션 토큰) — 칸 {}개", ObjPermCatalog.objectIds().size(), n);
        return n;
    }
}
