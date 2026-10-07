package com.dongkuk.dmes.mcm.init.seed;

/**
 * 업무 모듈·부가 화면 메뉴 시드 — ANALOG, mls 공지사항, 화면 사용 통계, 위젯관리 (2026-10-04 DataInitializer 분할).
 *
 * <p>각 메서드는 폴더·OBJECT·메뉴 leaf·SYSADMIN ROLE_MAPPING 을 멱등 적재한다. MDM 메뉴는 {@link MdmMenuSeeder} 몫이다.
 */
public final class ModuleMenuSeeder extends SeedSupport {

    public ModuleMenuSeeder(SeedSupport support) {
        super(support);
    }

    /**
     * ANALOG(로그 분석 도구) 메뉴/OBJECT/RBAC 시드 — seedMppCrMenus(ppe) 패턴 미러.
     *
     * <p>2026-07-16 — analog-express-ui-plate 포팅 화면(로그 뷰어)의 포털 진입점 등록:
     * <ul>
     *   <li>폴더 2: analog(모듈 루트, 로그 분석) + anl(그룹, 로그 조회) — TB_MCM_SEC_MENU_FLD (insertMpnFld 재사용).</li>
     *   <li>OBJECT 1: logViewer — TB_MCM_SEC_OBJ (SYSTEM_CODE='analog' = FE moduleId(sysCd),
     *       m-mcm PORTAL_MODULE_CONFIG 의 analog 로더로 라우팅).</li>
     *   <li>메뉴 leaf 1: parent='anl' — TB_MCM_SEC_MENU. componentPath = 'anl/logViewer' (SecUserService 조립).</li>
     *   <li>RBAC 1: SYSADMIN × logViewer × PERM_ALL — TB_MCM_SEC_ROLE_MAPPING.</li>
     * </ul>
     *
     * <p>FULL_SEQ 인코딩(2026-06-02 사용자 결정): 모듈 백만(analog=4,000,000 — mcm=1/mpn=2/mpp=3 다음) /
     * 그룹 만(anl=4,010,000) / 화면 백·십(4010100). MENU_SEQ analog='00000004'(mpp='00000003' 다음).
     * 시드 후 recomputeMenuFullSeq() 가 트리 위치 기준으로 FULL_SEQ 재부여(멱등). 모두 insertIfAbsent 멱등.
     */
    public void seedAnalogMenus() {
        // ── 폴더 (FLD) — root analog + group anl ──
        insertMpnFld("analog", "00000004", "로그 분석", null,     4000000L);
        insertMpnFld("anl",    "00000100", "로그 조회", "analog", 4010000L);

        // ── OBJECT 1 — SYSTEM_CODE='analog' 가 FE moduleId(sysCd)가 된다 ──
        insertMcmSecObjIfAbsent("logViewer", "로그 뷰어", "analog");

        // ── 메뉴 leaf 1 (parent=anl) — componentPath = 'anl/logViewer' ──
        insertMcmSecMenuIfAbsent("logViewer", "001", "4010100", "로그 뷰어", "anl", "logViewer");

        // ── RBAC — SYSADMIN × 1 OBJECT × PERM_ALL ──
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                new String[]{"SYSADMIN", "logViewer", "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'logViewer', 'PERM_ALL'" + AUDIT_VALS + ")");
        log.info("[DataInitializer] ANALOG 로그 분석(anl) 메뉴 시드 — 폴더 2 + OBJECT 1 + 메뉴 leaf 1 + RBAC 1");
    }

    /**
     * 화면 사용 통계(csa/screenUsageStat) 메뉴 시드 (2026-10-02) — OBJECT 1 + 메뉴 leaf 1 + SYSADMIN × PERM_ALL 1.
     * 폴더는 기존 시스템관리 그룹 {@code csa} 를 쓰므로 더 만들지 않는다. componentPath={@code csa/screenUsageStat} 는
     * m-mcm 페이지 레지스트리 키와 같다. FULL_SEQ 1020180 은 csa 기존 leaf(1020100~1020170) 다음이다.
     * 모두 insert-if-absent 라 재기동해도 중복 행이 생기지 않는다.
     */
    public void seedScreenUsageMenus() {
        final String objId = "screenUsageStat";
        insertMcmSecObjIfAbsent(objId, "화면 사용 통계", "mcm");
        insertMcmSecMenuIfAbsent(objId, "001", "1020180", "화면 사용 통계", "csa", objId);
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                new String[]{"SYSADMIN", objId,       "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', '" + objId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
        log.info("[DataInitializer] 화면 사용 통계 메뉴 시드 — OBJECT 1(screenUsageStat) + 메뉴 leaf 1(csa/screenUsageStat) + RBAC(SYSADMIN 1)");
    }

    /**
     * 위젯관리(csa/commWidgetMng) 메뉴 시드 (2026-10-02, 스펙 2026-10-02-widget-admin-generic §5.2·W-D22) —
     * OBJECT 1 + 메뉴 leaf 1 + SYSADMIN × PERM_ALL 1. 관리자 서비스(정의 저장·SQL 미리보기·기본 배치·미디어 올리기)는
     * 이 OBJECT 의 메뉴 권한(RBAC)으로 보호한다. 사용자용 서비스는 AUTH_ONLY 라 여기 넣지 않는다.
     * FULL_SEQ 1020190 은 csa 의 화면 사용 통계(1020180) 다음이다. 모두 insert-if-absent 라 재기동해도 중복 행이 생기지 않는다.
     */
    public void seedWidgetAdminMenus() {
        final String objId = "commWidgetMng";
        insertMcmSecObjIfAbsent(objId, "위젯 관리", "mcm");
        insertMcmSecMenuIfAbsent(objId, "001", "1020190", "위젯 관리", "csa", objId);
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                new String[]{"SYSADMIN", objId,       "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', '" + objId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
        log.info("[DataInitializer] 위젯관리 메뉴 시드 — OBJECT 1(commWidgetMng) + 메뉴 leaf 1(csa/commWidgetMng) + RBAC(SYSADMIN 1)");
    }

    /**
     * 조회 기본값 샘플(csa/searchDefaultsSample) 메뉴 시드 (2026-10-07, 스펙 2026-10-07-search-defaults-design §7.5) —
     * OBJECT 1 + 메뉴 leaf 1 + SYSADMIN × PERM_ALL 1. 기본값 동작을 눈과 e2e 로 확인하는 샘플 화면의 포털 진입점이다.
     * <b>local 프로필에서만</b> 부른다(호출하는 DataInitializer 가 판정 — 운영 메뉴에는 넣지 않는다). componentPath={@code csa/searchDefaultsSample}
     * 은 m-mcm 페이지 레지스트리 키와 같다. FULL_SEQ 1020210 은 csa 의 MDM 캐시 관리(1020190) 다음이다.
     * 모두 insert-if-absent 라 재기동해도 중복 행이 생기지 않는다.
     */
    public void seedSearchDefaultsSampleMenu() {
        final String objId = "searchDefaultsSample";
        insertMcmSecObjIfAbsent(objId, "조회 기본값 샘플", "mcm");
        insertMcmSecMenuIfAbsent(objId, "001", "1020210", "조회 기본값 샘플", "csa", objId);
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                new String[]{"SYSADMIN", objId,       "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', '" + objId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
        log.info("[DataInitializer] 조회 기본값 샘플 메뉴 시드 — OBJECT 1(searchDefaultsSample) + 메뉴 leaf 1(csa/searchDefaultsSample) + RBAC(SYSADMIN 1)");
    }

    /**
     * 공지사항 관리(noticeMgmt) 메뉴·OBJECT·RBAC 시드 — 2026-10-02, <b>2026-10-07 코드도 mcm 으로 옮겼다</b>(DEC-001 「재검토 → 이전」).
     *
     * <ul>
     *   <li>폴더 1: lsh(공지관리) — 부모는 공통관리 루트 {@code mcm}. MENU_SEQ '00000600' 으로 기존 그룹
     *       cma(100)·csa(200)·cme(300)·cmb(400)·cmz(500, 숨김 팝업) 뒤에 둔다 — 기존 그룹의 순서·FULL_SEQ 는 그대로다.
     *       폴더 ID {@code lsh} 는 식별자 사전의 mcm 그룹 예외(옛 mls 그룹 코드, 이전 때 메뉴·즐겨찾기 보존 위해 유지)이고,
     *       componentPath 가 {@code PARENT_MENU_ID/OBJECT_ID} 로 조립되므로 FE 경로 {@code lsh/noticeMgmt}
     *       (m-mcm {@code page-components/lsh/noticeMgmt/page}) 와 맞추려면 폴더 ID 를 바꾸면 안 된다.</li>
     *   <li>noticeMgmt: OBJECT(SYSTEM_CODE='mcm') + 메뉴 leaf(parent=lsh) + SYSADMIN × PERM_ALL.
     *       action(search·save·changeStatus) 은 PERM_ALL 에 있다(changeStatus 는 같은 날 allActions 에 추가).</li>
     * </ul>
     *
     * <p><b>경과</b> — 10-02 처음에는 물류관리(mls) 모듈 루트를 새로 만들고 그 아래에 lsh 를 두었다. 사용자 요청으로 공통관리 아래로
     * 옮겼다. insert-if-absent 는 이미 있는 lsh 행을 옮기지 않으므로 {@link #relocateNoticeFolderToMcm()} 이 멱등 보정한다. mls 루트
     * 폴더는 더 시드하지 않는다(이미 생긴 DB 의 빈 mls 폴더는 보이는 화면이 없어 사이드바에 나오지 않는다).
     * 10-07 코드 이전으로 OBJECT SYSTEM_CODE 가 mls → mcm 이 되었고, 이미 시드된 DB 는 {@link #moveNoticeObjectsToMcm()} 이 맞춘다.
     *
     * <p><b>포털 홈 공지 목록(noticeBoard)은 여기서 시드하지 않는다</b> — 로그인한 모든 사용자에게 여는 AUTH_ONLY 경로다
     * (m-mcm {@code proxy.ts} authOnlyPrefixes · mcm-core {@code EndpointPermissionFilter}). 게시 대상은 서비스가 현재 사용자
     * 역할로 거른다. 10-02 에 잠시 두었던 {@code PERM_SEARCH_ONLY} 권한 세트와 noticeBoard OBJECT·역할 매핑 시드는 뺐다.
     * 이미 시드된 DB 에 남은 그 행들은 지우지 않는다 — search 하나만 주는 행이라 AUTH_ONLY 와 결과가 같아 해가 없다.
     *
     * <p>FULL_SEQ: 공통관리 모듈(1,000,000) + 그룹 6번째(lsh=1,060,000) + 화면(1060100). 부팅 끝 recomputeMenuFullSeq() 가
     * 트리 위치 기준으로 다시 매긴다. 모두 멱등이다.
     */
    public void seedNoticeMenus() {
        // ── 폴더 (FLD) — 공통관리(mcm) 아래 lsh(공지관리). 이미 다른 부모로 시드된 DB 는 아래 보정이 옮긴다 ──
        insertMpnFld("lsh", "00000600", "공지관리", "mcm", 1060000L);
        relocateNoticeFolderToMcm();

        // ── noticeMgmt — OBJECT + 메뉴 leaf + SYSADMIN 전체 권한 ──
        insertMcmSecObjIfAbsent("noticeMgmt", "공지사항 관리", "mcm");
        moveNoticeObjectsToMcm();
        insertMcmSecMenuIfAbsent("noticeMgmt", "001", "1060100", "공지사항 관리", "lsh", "noticeMgmt");
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID",  "PERMISSION_ID"},
                new String[]{"SYSADMIN", "noticeMgmt", "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'noticeMgmt', 'PERM_ALL'" + AUDIT_VALS + ")");
        log.info("[DataInitializer] 공지 메뉴 시드 — 폴더 1(mcm/lsh) + OBJECT 1(noticeMgmt, SYSTEM_CODE=mcm) + 메뉴 leaf 1(lsh/noticeMgmt) + RBAC(SYSADMIN 1)");
    }

    /**
     * 공지 OBJECT 의 SYSTEM_CODE 보정 — mls → mcm (2026-10-07, 멱등).
     *
     * <p>공지 코드가 mls 에서 mcm 으로 옮겨졌다. 권한키의 모듈은 OBJECT SYSTEM_CODE 에서 나오므로({@code UserPermCache}),
     * 이미 {@code 'mls'} 로 시드된 DB 를 그대로 두면 {@code /api/mcm/oasis/noticeMgmt/*} 가 403 이 되고 화면 pageId 도
     * {@code mls:lsh/noticeMgmt} 로 남아 m-mls 로더를 찾는다. 10-02 에 잠시 시드했던 noticeBoard OBJECT 도 같이 맞춘다.
     * 값이 {@code mls} 인 행만 바꾼다 — 권한 캐시처럼 앞뒤 공백·대소문자는 무시한다({@code 'MLS'}, {@code ' mls'} 도 대상). 메뉴 관리 화면에서
     * 다른 값으로 바꾼 행과 이미 mcm 인 행은 건드리지 않는다. 행은 지우지 않는다.
     */
    private void moveNoticeObjectsToMcm() {
        int n = nq("UPDATE MCMAPUSER.TB_MCM_SEC_OBJ SET SYSTEM_CODE = 'mcm' "
                 + " WHERE OBJECT_ID IN ('noticeMgmt', 'noticeBoard') AND LOWER(TRIM(SYSTEM_CODE)) = 'mls'").executeUpdate();
        if (n > 0) {
            log.info("[DataInitializer] 공지 OBJECT SYSTEM_CODE 를 mls → mcm 으로 옮김 — rows={}", n);
        }
    }

    /**
     * 공지관리 폴더(lsh) 위치 보정 — 부모가 공통관리 루트({@code mcm})가 아니면 옮긴다 (2026-10-02, 멱등).
     *
     * <p>같은 날 잠깐 물류관리(mls) 루트 아래로 시드된 DB 를 맞춘다. 옮길 때 MENU_SEQ 도 '00000600' 으로 바꾼다 — 옛 값 '00000100' 그대로
     * 공통관리 아래로 가면 cma(100)와 순번이 겹쳐 기존 그룹의 FULL_SEQ 가 한 칸씩 밀린다. 부모가 이미 {@code mcm} 이면 손대지 않으므로
     * 메뉴 관리 화면에서 사용자가 바꾼 순서는 보존된다. FULL_SEQ 는 부팅 끝 recomputeMenuFullSeq() 가 다시 매긴다.
     */
    private void relocateNoticeFolderToMcm() {
        int n = nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD SET PARENT_MENU_ID = 'mcm', MENU_SEQ = '00000600' "
                 + " WHERE MENU_ID = 'lsh' AND (PARENT_MENU_ID IS NULL OR PARENT_MENU_ID <> 'mcm')").executeUpdate();
        if (n > 0) {
            log.info("[DataInitializer] 공지관리 폴더(lsh)를 공통관리(mcm) 아래로 옮김 — rows={}", n);
        }
    }
}
