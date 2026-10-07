package com.dongkuk.dmes.mcm.init.seed;

/**
 * mcm 메뉴 트리(TB_MCM_SEC_MENU / TB_MCM_SEC_MENU_FLD)와 부서 LoV(TB_MCM_DEPT_INFO) 시드 (2026-10-04 DataInitializer 분할).
 */
public final class McmMenuSeeder extends SeedSupport {

    public McmMenuSeeder(SeedSupport support) {
        super(support);
    }

    /**
     * TB_MCM_SEC_MENU 시드 — 메뉴 트리 17 row (화면 leaf 만). 멱등 (복합 PK MENU_ID + MENU_SEQ).
     *
     * <p>SecUserService.getMyMenus / getMyMenusTree 가 본 시드를 읽어 myMenus / myMenusTree 응답을 만든다.
     * 본 시드가 없으면 myMenus 가 빈 배열을 반환하여 FE 사이드바 메뉴가 표시되지 않는다.
     *
     * <p>구조 (2026-06-02 R3 P1 round 3 — 데이터 구조 분리 / 사용자 결정):
     * <ul>
     *   <li><b>TB_MCM_SEC_MENU 에는 화면 (leaf) 만 보관.</b> 모듈/그룹 폴더 (mcm / cma / csa / cme / cmb / cmz)
     *       6 row 는 {@code TB_MCM_SEC_MENU_FLD} 가 owner — 본 테이블에 INSERT ✗.</li>
     *   <li>cma group leaf 2 (PARENT_MENU_ID="cma"): masterCategoryMng=1010100 / masterCodeMng=1010110</li>
     *   <li>csa group leaf 8 (PARENT_MENU_ID="csa"): commObjMng=1020100 / commMenuMng=1020110 /
     *       commRoleMng=1020120 / commRoleGrpMng=1020130 / commUserMng=1020140 / commPermMng=1020150 /
     *       commUserRoleCopy=1020160 / commSyncMng=1020170</li>
     *   <li>cme group leaf 1 (PARENT_MENU_ID="cme"): masterCodeMngList=1030100</li>
     *   <li>cmb group leaf 4 (PARENT_MENU_ID="cmb"): masterRuleList=1040100 / masterRuleData=1040110 /
     *       masterRuleDataList=1040120 / masterRuleFrame=1040130.
     *       2026-08-14 — 뒤 3 건은 OBJECT·RBAC·FE 라우팅이 모두 있는데 메뉴 leaf 만 없어 사이드바 진입이
     *       불가했다(팝업 3 건과 달리 일반 업무화면이므로 {@code MENU_VIEW_YN='Y'}).</li>
     *   <li><b>cmz 팝업 leaf 5</b> (PARENT_MENU_ID="cmz", 전부 {@code MENU_VIEW_YN='N'}):
     *       masterCodeSelPop=1050100 / masterCodeUploadFilePopup=1050110 / masterRuleListPop=1050120 /
     *       masterRuleFrameColListPopup=1050130 / masterRuleDataUploadFilePopup=1050140.
     *       2026-08-13 에 cma·cmb 에서 팝업 전용 그룹으로 이관 (mpp {@code ppz} 와 동일 규약).</li>
     * </ul>
     *
     * <p>FULL_SEQ 인코딩 (사용자 결정 2026-06-02):
     * <ul>
     *   <li>백만 자리 (+1,000,000) = 모듈 (mcm=1)</li>
     *   <li>만 자리 (+10,000)      = 그룹 폴더 (cma=01 / csa=02 / cme=03 / cmb=04 / cmz=05)</li>
     *   <li>백/십 자리 (+100 시작, +10 증가) = 화면 (100 → 110 → 120 ...)</li>
     * </ul>
     * 시드 리터럴은 체계 표현용이고, 부팅 말미 {@code recomputeMenuFullSeq()} 가 트리 위치 기준으로
     * 실제 값을 재부여한다 (모듈 순번이 바뀌면 백만 자리도 달라진다).
     *
     * <p>OBJECT_ID 는 TB_MCM_SEC_OBJ 의 OBJECT_ID (=화면식별자) 와 1:1 매칭 — 권한 chain (SecUser → SecUserMapping →
     * SecRoleGroupMapping → SecRoleMapping.OBJECT_ID) 검증용. 모든 leaf row 는 OBJECT_ID 보유.
     *
     * <p>정정 처리 (round 3 — 직전 worker 가 SEC_MENU 에 잘못 적재한 모듈/그룹 4 row 제거):
     * <ol>
     *   <li>legacy {@code grp-cma}/{@code grp-csa}/{@code grp-cme} 와 신규 {@code mcm}/{@code cma}/{@code csa}/
     *       {@code cme} 폴더 row 가 SEC_MENU 에 잔존하면 DELETE. SEC_MENU_FLD 만 폴더 owner.</li>
     *   <li>FULL_SEQ 7자리 인코딩 일괄 재적용 (잔존 DB 의 legacy FULL_SEQ "1"/"100"/"110"/... 정정 — leaf 17 만).</li>
     * </ol>
     */
    public void seedMcmSecMenu() {
        // R3 P1 round 3 — SEC_MENU 의 폴더 row (모듈/그룹) 정리:
        //  - swapLegacyGrpMenuIds: SEC_MENU_FLD 의 legacy grp-* swap (FLD owner 정합 보장)
        //  - cleanupLegacyFolderRowsInSecMenu: SEC_MENU 의 폴더 row (mcm/cma/csa/cme + grp-*) DELETE
        //  자식 FK (leaf 의 PARENT_MENU_ID='cma'/'csa'/'cme' 등) 는 SEC_MENU 내부 참조이며 외래키 제약이 ✗
        //  (entity 미선언) → 부모 row DELETE 가능. 자식 leaf 는 그대로 유지.
        swapLegacyGrpMenuIds();
        cleanupLegacyFolderRowsInSecMenu();

        // cma group leaf 2 — PARENT_MENU_ID = cma (round 3 매핑 / 백/십 자리 +100~+110)
        //   팝업 2종(masterCodeSelPop · masterCodeUploadFilePopup)은 2026-08-13 팝업 전용 그룹 cmz 로 이관했다
        //   (아래 "cmz 팝업 leaf 5" 블록). 본 그룹에는 사이드바에 뜨는 업무 화면만 남는다.
        insertMcmSecMenuIfAbsent("masterCategoryMng",         "001", "1010100", "카테고리 관리",                       "cma", "masterCategoryMng");
        insertMcmSecMenuIfAbsent("masterCodeMng",             "001", "1010110", "Master Code 관리",                    "cma", "masterCodeMng");

        // csa group leaf 8 — PARENT_MENU_ID = csa (round 3 매핑 / 백/십 자리 +100~+170)
        insertMcmSecMenuIfAbsent("commObjMng",        "001", "1020100", "OBJECT 관리",            "csa", "commObjMng");
        insertMcmSecMenuIfAbsent("commMenuMng",       "001", "1020110", "메뉴 관리",              "csa", "commMenuMng");
        insertMcmSecMenuIfAbsent("commRoleMng",       "001", "1020120", "역할 관리",              "csa", "commRoleMng");
        insertMcmSecMenuIfAbsent("commRoleGrpMng",    "001", "1020130", "역할 그룹 관리",         "csa", "commRoleGrpMng");
        insertMcmSecMenuIfAbsent("commUserMng",       "001", "1020140", "사용자 관리",            "csa", "commUserMng");
        insertMcmSecMenuIfAbsent("commPermMng",       "001", "1020150", "PERMISSION 관리",        "csa", "commPermMng");
        insertMcmSecMenuIfAbsent("commUserRoleCopy",  "001", "1020160", "사용자 권한 일괄 등록",  "csa", "commUserRoleCopy");
        insertMcmSecMenuIfAbsent("commSyncMng",       "001", "1020170", "동기화 관리",            "csa", "commSyncMng");

        // cme group leaf 1 — PARENT_MENU_ID = cme (round 3 매핑 / 백/십 자리 +100)
        insertMcmSecMenuIfAbsent("masterCodeMngList", "001", "1030100", "Master Code 상세조회",   "cme", "masterCodeMngList");

        // cmb group leaf 4 — PARENT_MENU_ID = cmb (그룹 04 / 백/십 자리 +100~+130) — 2026-06-05 masterRuleList 등재
        //   팝업 3종은 아래 cmz 블록으로 이관(2026-08-13). 본 그룹에는 업무 화면만 남는다.
        //   2026-08-14 — 일반 화면 3종(masterRuleData/masterRuleDataList/masterRuleFrame) 추가 등재.
        //     OBJECT(TB_MCM_SEC_OBJ) · RBAC(SYSADMIN×PERM_ALL) · BPMN(services/cmb/*.bpmn) ·
        //     FE PAGE_REGISTRY 키("cmb/masterRuleData" 외 2)는 이미 있는데 메뉴 leaf 만 없어
        //     사이드바 진입점이 생기지 않았다(직접 URL 로만 도달 가능).
        //   MENU_VIEW_YN 은 6-인자 오버로드의 기본값 'Y'(표시) — cmz 팝업과 달리 일반 업무화면이므로
        //     사이드바에 떠야 하고, PAGE_REGISTRY 키가 실재하므로 클릭 시 오류탭이 열리지 않는다.
        //   MENU_NM 은 위 TB_MCM_SEC_OBJ 시드의 OBJECT_NM 을 그대로 사용(단일 식별자·단일 명칭 규약).
        insertMcmSecMenuIfAbsent("masterRuleList",     "001", "1040100", "업무기준 목록조회",      "cmb", "masterRuleList");
        insertMcmSecMenuIfAbsent("masterRuleData",     "001", "1040110", "업무기준 Data관리",      "cmb", "masterRuleData");
        insertMcmSecMenuIfAbsent("masterRuleDataList", "001", "1040120", "업무기준 상세조회",      "cmb", "masterRuleDataList");
        insertMcmSecMenuIfAbsent("masterRuleFrame",    "001", "1040130", "업무기준 구조관리",      "cmb", "masterRuleFrame");

        // ── cmz 팝업 leaf 5 — PARENT_MENU_ID = cmz, MENU_VIEW_YN='N'(사이드바 숨김). 2026-08-13 ──
        //   사용자 결정: "팝업과 팝업그룹은 전부 등재하고 트리 표시여부는 전부 숨김". 종전에는 팝업이
        //   업무 그룹(cma 2 · cmb 3)에 섞여 있었고, 이번에 mpp ppz 와 동일한 팝업 전용 그룹으로 모았다.
        //   (OBJECT/RBAC 는 seedMcmSecRbac 에 기시드 — 여기서는 메뉴 트리 위치만 다룬다.)
        //
        //   leaf 를 두는 이유 = ① 팝업도 자기 serviceId 로 OASIS 를 직접 호출하므로 팝업 단위 RBAC 를
        //   역할/메뉴 화면에서 화면과 똑같이 다루고 ② commMenuMng 에서 명칭·순서를 관리하기 위함이다
        //   (insertMcmSecMenuIfAbsent 7-인자 오버로드 javadoc "팝업 leaf 정책").
        //   숨김인 이유 = 팝업은 부모 화면에서 모달로 열리는 컴포넌트라 FE PAGE_REGISTRY 에 라우팅 키가 없다.
        //   사이드바에 진입점이 뜨면 클릭 시 빈 오류탭이 열린다(cma 팝업 2 건에서 실제로 발생했던 결함).
        //   MENU_NM 은 위 TB_MCM_SEC_OBJ 시드의 OBJECT_NM 을 그대로 사용(단일 식별자·단일 명칭 규약).
        //   FULL_SEQ = 모듈 백만(mcm=1) + 그룹 만(cmz=05) + 화면 백·십(+100 부터 +10 씩).
        //   나열 순서는 이관 전 소속(cma 2 → cmb 3)을 유지해 대조가 쉽도록 했다.
        insertMcmSecMenuIfAbsent("masterCodeSelPop",              "001", "1050100", "마스터코드 선택 팝업",             "cmz", "masterCodeSelPop",              "N");
        insertMcmSecMenuIfAbsent("masterCodeUploadFilePopup",     "001", "1050110", "마스터코드 등록(Excel Upload)",    "cmz", "masterCodeUploadFilePopup",     "N");
        insertMcmSecMenuIfAbsent("masterRuleListPop",             "001", "1050120", "업무기준 List조회 팝업",           "cmz", "masterRuleListPop",             "N");
        insertMcmSecMenuIfAbsent("masterRuleFrameColListPopup",   "001", "1050130", "업무기준 컬럼 리스트 등록 팝업",   "cmz", "masterRuleFrameColListPopup",   "N");
        insertMcmSecMenuIfAbsent("masterRuleDataUploadFilePopup", "001", "1050140", "일반 업무기준 등록(Excel Upload)", "cmz", "masterRuleDataUploadFilePopup", "N");
        // 이미 적재된 DB(개발 MSSQL·동료 SQLite) 백필 — INSERT 헬퍼는 기존 행을 갱신하지 않으므로,
        //   시드 리터럴만 cmz 로 바꿔서는 기존 DB 의 부모가 영원히 cma/cmb 로 남는다.
        for (String popupId : new String[]{
                "masterCodeSelPop", "masterCodeUploadFilePopup",
                "masterRuleListPop", "masterRuleFrameColListPopup", "masterRuleDataUploadFilePopup"}) {
            ensureMenuParent(popupId, "cmz");
            ensureMenuViewYn(popupId, "N");
        }

        // FULL_SEQ 7자리 인코딩 일괄 재적용 (잔존 DB 의 legacy FULL_SEQ "1"/"100"/"110"/... 정정 — leaf 17 row 만).
        int updatedFullSeq = applyR3FullSeqEncoding();
        log.info("[DataInitializer] SEC_MENU UPDATE — leaf FULL_SEQ rows={}", updatedFullSeq);
    }

    /**
     * R3 P1 round 3 (2026-06-02) — TB_MCM_SEC_MENU 에서 폴더 (모듈/그룹) row 제거.
     *
     * <p>사용자 결정: 메인 그리드 조회 시 메뉴 폴더 표시 ✗. TB_MCM_SEC_MENU 는 화면 (leaf) 만 보관.
     * 모듈/그룹 폴더는 TB_MCM_SEC_MENU_FLD 가 owner.
     *
     * <p>처리 대상 (잔존 DB only — 신규 클린 DB 무영향):
     * <ul>
     *   <li>legacy R3 P1 시드: {@code mcm} / {@code cma} / {@code csa} / {@code cme} (PARENT_MENU_ID IS NULL or 'mcm')</li>
     *   <li>legacy cycle 1 시드: {@code grp-cma} / {@code grp-csa} / {@code grp-cme}</li>
     * </ul>
     *
     * <p>자식 leaf row (PARENT_MENU_ID='cma'/'csa'/'cme') 는 entity 미선언 = FK 제약 ✗ 라 부모 폴더 row DELETE
     * 가능. 자식 leaf 는 그대로 유지하며 PARENT_MENU_ID 값만 SEC_MENU_FLD.MENU_ID 를 참조하는 의미가 된다.
     */
    private void cleanupLegacyFolderRowsInSecMenu() {
        String[] folderIds = {"mcm", "cma", "csa", "cme", "grp-cma", "grp-csa", "grp-cme"};
        int totalDeleted = 0;
        for (String id : folderIds) {
            int del = nq(
                    "DELETE FROM MCMAPUSER.TB_MCM_SEC_MENU WHERE MENU_ID = :m")
                    .setParameter("m", id).executeUpdate();
            if (del > 0) {
                log.info("[DataInitializer] R3 round3 — SEC_MENU 폴더 row DELETE MENU_ID={} rows={}", id, del);
                totalDeleted += del;
            }
        }
        if (totalDeleted > 0) {
            log.info("[DataInitializer] R3 round3 — SEC_MENU 폴더 row 총 DELETE rows={} (폴더 owner=SEC_MENU_FLD 만)", totalDeleted);
        }
    }

    /**
     * R3 P1 round 3 (2026-06-02) — 잔존 grp- 접두 row 처리.
     *
     * <p>대상 테이블 정합 (round 3 — 데이터 구조 분리):
     * <ul>
     *   <li><b>TB_MCM_SEC_MENU_FLD</b> (폴더 owner): legacy grp-cma/grp-csa/grp-cme 를 신규 cma/csa/cme 로 swap.
     *       PARENT_MENU_ID FK 도 동시 swap.</li>
     *   <li><b>TB_MCM_SEC_MENU</b> (화면 leaf owner): 폴더 row 는 본 테이블에 존재 ✗ 가 정합 —
     *       PARENT_MENU_ID 의 legacy 값만 신규로 swap. 폴더 row 자체 (grp-* / mcm / cma / csa / cme) 는
     *       {@link #cleanupLegacyFolderRowsInSecMenu()} 가 DELETE.</li>
     * </ul>
     *
     * <p>FK 순서: 자식 PARENT_MENU_ID 먼저 swap → 부모 PK swap (FLD 만). PK 충돌 시 legacy DELETE.
     */
    private void swapLegacyGrpMenuIds() {
        String[] legacy = {"grp-cma", "grp-csa", "grp-cme"};
        String[] target = {"cma",     "csa",     "cme"};
        for (int i = 0; i < legacy.length; i++) {
            String oldId = legacy[i];
            String newId = target[i];
            // (a) TB_MCM_SEC_MENU 자식 PARENT_MENU_ID swap (leaf 의 부모 참조만 정정 — 폴더 row 자체는 cleanup 가 DELETE)
            int childMenu = nq(
                    "UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET PARENT_MENU_ID = :n WHERE PARENT_MENU_ID = :o")
                    .setParameter("o", oldId).setParameter("n", newId).executeUpdate();
            // (b) TB_MCM_SEC_MENU_FLD 자식 PARENT_MENU_ID swap (폴더 children)
            int childFld = nq(
                    "UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD SET PARENT_MENU_ID = :n WHERE PARENT_MENU_ID = :o")
                    .setParameter("o", oldId).setParameter("n", newId).executeUpdate();
            // (c) TB_MCM_SEC_MENU_FLD 폴더 row 자체 PK swap (신규 PK 존재 시 legacy DELETE)
            Number newExistsFld = (Number) nq(
                    "SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD WHERE MENU_ID = :n")
                    .setParameter("n", newId).getSingleResult();
            if (newExistsFld != null && newExistsFld.intValue() > 0) {
                int delFld = nq(
                        "DELETE FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD WHERE MENU_ID = :o")
                        .setParameter("o", oldId).executeUpdate();
                if (delFld > 0) {
                    log.info("[DataInitializer] R3 round3 grp- legacy delete (신규 PK 충돌) — MENU_FLD MENU_ID={} rows={}", oldId, delFld);
                }
            } else {
                int updFld = nq(
                        "UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD SET MENU_ID = :n WHERE MENU_ID = :o")
                        .setParameter("o", oldId).setParameter("n", newId).executeUpdate();
                if (updFld > 0) {
                    log.info("[DataInitializer] R3 round3 grp- legacy swap — MENU_FLD MENU_ID {}→{} rows={}", oldId, newId, updFld);
                }
            }
            if (childMenu > 0 || childFld > 0) {
                log.info("[DataInitializer] R3 round3 grp- child PARENT_MENU_ID swap — MENU={} MENU_FLD={} ({}→{})",
                        childMenu, childFld, oldId, newId);
            }
        }
    }

    /**
     * R3 P1 round 3 (2026-06-02) — TB_MCM_SEC_MENU 의 leaf 13 row FULL_SEQ 7자리 인코딩 일괄 재적용
     * (멱등 — 동일 값 UPDATE 무영향).
     *
     * <p>인코딩 = 모듈 백만(+1,000,000) + 그룹 폴더 만(+10,000) + 화면 백/십(+100~+990).
     * leaf 13 만 본 테이블의 대상 — 폴더 4 row (mcm/cma/csa/cme) 는 SEC_MENU_FLD 가 owner 라 본 인코딩 대상 ✗.
     *
     * @return UPDATE 영향 행 수 합산 (정보용)
     */
    private int applyR3FullSeqEncoding() {
        // {menuId, fullSeq, parentMenuId} — Round 3 정합 PARENT_MENU_ID 도 함께 멱등 정정.
        // 잔존 row 의 PARENT_MENU_ID 가 자기 자신 또는 다른 값으로 잘못 시드된 경우 본 UPDATE 가 정정.
        String[][] rows = {
            {"masterCategoryMng",         "1010100", "cma"},
            {"masterCodeMng",             "1010110", "cma"},
            {"commObjMng",                "1020100", "csa"},
            {"commMenuMng",               "1020110", "csa"},
            {"commRoleMng",               "1020120", "csa"},
            {"commRoleGrpMng",            "1020130", "csa"},
            {"commUserMng",               "1020140", "csa"},
            {"commPermMng",               "1020150", "csa"},
            {"commUserRoleCopy",          "1020160", "csa"},
            {"commSyncMng",               "1020170", "csa"},
            {"mdmCacheMng",               "1020190", "csa"},   // 2026-10-02 MDM 캐시 관리(화면 사용 통계 1020180 다음) — 빠지면 잔존 DB 의 FULL_SEQ 가 매 부팅 어긋난다
            {"searchDefaultsSample",      "1020210", "csa"},   // 2026-10-07 조회 기본값 샘플(local 전용 시드) — 행이 있는 DB 에서만 적용된다
            {"masterCodeMngList",         "1030100", "cme"},
            {"masterRuleList",            "1040100", "cmb"},
            // 2026-08-14 등재 — 본 배열에 빠지면 잔존 DB 의 FULL_SEQ/PARENT_MENU_ID 가 매 부팅 어긋난 채 남는다
            //   (insertMcmSecMenuIfAbsent 는 기존 행을 갱신하지 않으므로 신규 leaf 도 반드시 여기 함께 등재).
            {"masterRuleData",            "1040110", "cmb"},
            {"masterRuleDataList",        "1040120", "cmb"},
            {"masterRuleFrame",           "1040130", "cmb"},
            // ── cmz 팝업 5 (2026-08-13 이관) — 업무 그룹(cma/cmb)이 아닌 팝업 전용 그룹이 정본이다.
            //   ⚠ 본 배열은 PARENT_MENU_ID 를 무조건 덮어쓴다. 여기에 옛 부모(cma/cmb)가 남아 있으면
            //   seedMcmSecMenu 말미의 ensureMenuParent(…, "cmz") 백필을 매 부팅마다 되돌려 버린다.
            //   팝업의 소속 그룹을 바꿀 때는 반드시 두 곳을 함께 고칠 것.
            //   MENU_VIEW_YN 은 본 UPDATE 대상 ✗ (사용자 편집 값 — ensureMenuViewYn 이 명시 대상만 정정).
            {"masterCodeSelPop",              "1050100", "cmz"},
            {"masterCodeUploadFilePopup",     "1050110", "cmz"},
            {"masterRuleListPop",             "1050120", "cmz"},
            {"masterRuleFrameColListPopup",   "1050130", "cmz"},
            {"masterRuleDataUploadFilePopup", "1050140", "cmz"},
        };
        int total = 0;
        for (String[] r : rows) {
            // 2026-06-05 — PK = MENU_ID 단독이므로 MENU_SEQ='001' 조건 제거 (MENU_ID 로 단건 매칭).
            int n = nq(
                    "UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET FULL_SEQ = :f, PARENT_MENU_ID = :p " +
                    "WHERE MENU_ID = :m")
                    .setParameter("f", r[1])
                    .setParameter("p", r[2])
                    .setParameter("m", r[0])
                    .executeUpdate();
            total += n;
        }
        return total;
    }

    /**
     * TB_MCM_SEC_MENU_FLD 시드 — 메뉴 폴더 트리 6 row (mcm root + 업무 group 4 + 팝업 group 1).
     *
     * <p>commMenuMng 분석리포트 §9.3 정합 — 본 4 컬럼 (MENU_ID PK / MENU_SEQ 정렬 / MENU_NM / PARENT_MENU_ID).
     * As-Is 의도는 폴더 (디렉토리) 트리만 보유 → leaf 화면 행은 별도 매핑 (TB_MCM_SEC_MENU). 본 시드는
     * mcm root 1 + 업무 group 4 (cma/csa/cme/cmb) + 팝업 group 1 (cmz, 숨김) = 6 row 적재.
     *
     * <p>SecMenuNativeRepository.searchMenuFld 의 CTE WITH RECURSIVE 가:
     * <ul>
     *   <li>anchor = PARENT_MENU_ID IS NULL → mcm 1 row (LEV=0)</li>
     *   <li>recursive = child.PARENT_MENU_ID = parent.MENU_ID → group 5 row (LEV=1)</li>
     * </ul>
     *
     * <p>{@code cmz} 만 {@code MENU_VIEW_YN='N'} (팝업 전용 그룹 — 사이드바 비노출). 나머지는 값을 두지
     * 않으며 NULL 은 표시로 취급된다.
     *
     * <p>insertIfAbsent 가드로 멱등 (이미 시드된 row 가 있으면 skip).
     */
    public void seedMcmSecMenuFld() {
        // TB_MCM_SEC_MENU_FLD 는 entity 미보유 + audit listener 미적용 — DDL 본 4 컬럼만 INSERT (audit 9 컬럼은
        // 본 stub DDL 의 컬럼 list 에 없음. W1 commObjMng 가 적재한 4 컬럼 stub + W2 가 ALTER 로 MENU_SEQ 만 ADD).
        // 추후 본 테이블을 entity 화 / audit 통합 시 audit fragment 적재 필요.

        // Root 1 — mcm (PARENT_MENU_ID = NULL)
        // MENU_SEQ='00000002' — 공정계획(mpn=00000001) 다음 순서. 폴더 정렬은 MENU_SEQ 기준(2026-06-10).
        insertIfAbsent(
                "TB_MCM_SEC_MENU_FLD", "MENU_ID", "mcm",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                "(MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID) " +
                "VALUES ('mcm', '00000002', N'공통관리', NULL)");

        // Group 3 — cma / csa / cme (PARENT_MENU_ID = 'mcm') — 2026-06-02 R3 P1 grp- 접두 제거.
        // 잔존 grp-* row 는 swapLegacyGrpMenuIds() 가 신규 토큰으로 swap (FK 동시).
        insertIfAbsent(
                "TB_MCM_SEC_MENU_FLD", "MENU_ID", "cma",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                "(MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID) " +
                "VALUES ('cma', '00000100', N'마스터관리(원장)', 'mcm')");

        insertIfAbsent(
                "TB_MCM_SEC_MENU_FLD", "MENU_ID", "csa",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                "(MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID) " +
                "VALUES ('csa', '00000200', N'시스템관리', 'mcm')");

        insertIfAbsent(
                "TB_MCM_SEC_MENU_FLD", "MENU_ID", "cme",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                "(MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID) " +
                "VALUES ('cme', '00000300', N'마스터관리(가동)', 'mcm')");

        // cmb group (PARENT_MENU_ID = 'mcm') — 2026-06-05 masterRuleList 등재 (업무기준 관리(원장))
        insertIfAbsent(
                "TB_MCM_SEC_MENU_FLD", "MENU_ID", "cmb",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                "(MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID) " +
                "VALUES ('cmb', '00000400', N'업무기준관리(원장)', 'mcm')");

        // cmz — 팝업 전용 그룹 (PARENT_MENU_ID = 'mcm', MENU_VIEW_YN='N' 숨김). 2026-08-13 신설.
        //   사용자 결정: "팝업과 팝업그룹은 전부 등재하되 트리 표시는 전부 숨김". mpp 가 먼저 채택한
        //   ppz 규약(팝업 20종을 업무 그룹이 아닌 전용 숨김 그룹에 모음)을 mcm 에도 동일 적용한다.
        //   종전에는 팝업 5종이 업무 그룹(cma 2 · cmb 3) 안에 섞여 있어, 그룹을 펼쳤을 때 commMenuMng
        //   메뉴 트리에서 업무 화면과 팝업이 구분되지 않았다.
        //   위 4개 그룹과 달리 insertMpnFld 를 쓰는 이유 = 이 헬퍼만 MENU_VIEW_YN 을 명시 INSERT 한다
        //   (모듈 무관 범용 FLD 헬퍼 — mpn/mls/mqc/analog/mpp 가 이미 공용한다).
        //   폴더까지 숨겨야 하는 이유 = 자식 leaf 를 전부 'N' 으로 숨겨도 폴더가 표시면 사이드바에
        //   빈 그룹이 남는다(seedMppMenus javadoc "팝업 leaf 정책").
        //   FULL_SEQ = 모듈 백만(mcm=1) + 그룹 만(cmz=05) — cma01/csa02/cme03/cmb04 다음 자리.
        //   시드 리터럴은 체계만 맞으면 되고, 부팅 말미 recomputeMenuFullSeq() 가 트리 위치 기준으로
        //   실제 값을 재부여한다(현 DB 실값은 모듈 순번이 2 라 20xxxxx 대다).
        insertMpnFld("cmz", "00000500", "팝업", "mcm", 1050000L, "N");
        // 이미 적재된 DB(개발 MSSQL·동료 SQLite) 백필 — insertMpnFld 는 기존 행을 갱신하지 않는다.
        ensureMenuFldViewYn("cmz", "N");
    }

    /**
     * {@code TB_MCM_SEC_MENU} 의 1글자 코드 컬럼에서 빈 문자열을 제거한다 (2026-08-07).
     *
     * <p><b>왜 필요한가</b> — {@code SecMenuNativeRepository} 는 native query 결과를 {@code List<Object[]>}
     * 로 받는데, Hibernate 6 는 컬럼 길이가 1인 VARCHAR 를 {@code Character} 로 추론한다. 값이 {@code ''}
     * 이면 {@code CharacterJavaType.wrap} 이
     * {@code CoercionException: value does not contain a character: ''} 를 던져 <b>행 한 건 때문에
     * commMenuMng 화면의 조회·저장 전체가 실패</b>한다. OASIS 는 이를 HTTP 200 + {@code meta.success=false}
     * 로 돌려주므로 화면에서는 "아무 일도 안 일어나는" 것처럼 보인다.
     *
     * <p>{@code ''} 는 Y/N·WEB 같은 코드값이 들어가야 할 자리에 잘못 들어간 값이므로 기본값으로 승격한다.
     * 유입 경로(구 시드·수동 저장 등)와 무관하게 매 부팅 멱등 보정한다.
     */
    public void normalizeSecMenuCharColumns() {
        int n = 0;
        n += nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET USE_TP = 'Y' "
              + " WHERE USE_TP IS NULL OR LTRIM(RTRIM(USE_TP)) = ''").executeUpdate();
        n += nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET MENU_VIEW_YN = 'Y' "
              + " WHERE MENU_VIEW_YN IS NULL OR LTRIM(RTRIM(MENU_VIEW_YN)) = ''").executeUpdate();
        n += nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET MENU_TP = 'WEB' "
              + " WHERE MENU_TP IS NULL OR LTRIM(RTRIM(MENU_TP)) = ''").executeUpdate();
        if (n > 0) {
            log.info("[DataInitializer] SEC_MENU 코드컬럼 빈 문자열 정규화 — {} 행 보정 (Character 변환 오류 예방)", n);
        }
    }

    /**
     * TB_MCM_DEPT_INFO 시드 — 부서 마스터 3 row (정책 #2 / Q-002 — EAI 폐기 대체).
     *
     * <p>commUserMng 화면 (W5) 의 부서 LoV 가 본 시드를 read → admin 사용자의 DEPT_CD='IT' 값과
     * 일치하는 부서가 없으면 화면 표기 부서명이 공란. 본 시드는 admin / commUserMng / commUserRoleCopy
     * 화면이 기본 LoV 로 표시할 최소 부서 3 행 (경영지원본부 / 정보기술팀 / 생산관리팀) 만 제공.
     *
     * <p>관련 화면:
     * <ul>
     *   <li>commUserMng — selectUserList JOIN DEPT_NM (정책 #2 Q-004)</li>
     *   <li>commUserRoleCopy — selectUserList JOIN DEPT_NM (정책 #2 Q-004)</li>
     * </ul>
     *
     * <p>{@code DEPT_001} (경영지원본부 — root) / {@code DEPT_002} (정보기술팀 — UPPER=DEPT_001) /
     * {@code DEPT_003} (생산관리팀 — UPPER=DEPT_001). admin 사용자의 DEPT_CD='IT' 와는 일치하지 않으나,
     * LoV 표기는 표시되며 admin DEPT_CD 의 별도 정정은 후속 운영 시드에서 처리.
     */
    public void seedMcmDeptInfo() {
        // DEPT_001 — 경영지원본부 (root, UPPER_DEPT_CD = NULL)
        insertIfAbsent(
                "TB_MCM_DEPT_INFO", "DEPT_CD", "DEPT_001",
                "INSERT INTO MCMAPUSER.TB_MCM_DEPT_INFO " +
                "(DEPT_CD, DEPT_NM, DEPT_NM_EN, UPPER_DEPT_CD, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('DEPT_001', N'경영지원본부', 'Management Support HQ', NULL, 'Y', " +
                "SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // DEPT_002 — 정보기술팀 (UPPER = DEPT_001)
        insertIfAbsent(
                "TB_MCM_DEPT_INFO", "DEPT_CD", "DEPT_002",
                "INSERT INTO MCMAPUSER.TB_MCM_DEPT_INFO " +
                "(DEPT_CD, DEPT_NM, DEPT_NM_EN, UPPER_DEPT_CD, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('DEPT_002', N'정보기술팀', 'IT Team', 'DEPT_001', 'Y', " +
                "SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // DEPT_003 — 생산관리팀 (UPPER = DEPT_001)
        insertIfAbsent(
                "TB_MCM_DEPT_INFO", "DEPT_CD", "DEPT_003",
                "INSERT INTO MCMAPUSER.TB_MCM_DEPT_INFO " +
                "(DEPT_CD, DEPT_NM, DEPT_NM_EN, UPPER_DEPT_CD, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('DEPT_003', N'생산관리팀', 'Production Mgmt Team', 'DEPT_001', 'Y', " +
                "SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // 2026-06-04 — 사용자 결정: Detail LoV 모달 확인을 위해 추가 부서 4 row 시드.
        // DEPT_004 ~ DEPT_007 — 인사팀 / 재무팀 / 영업1팀 / 영업2팀 / 품질관리팀.
        // UPPER_DEPT_CD = DEPT_001 (경영지원본부 산하 가정 — 후속 운영 조직개편 시 정정).

        // DEPT_004 — 인사팀
        insertIfAbsent(
                "TB_MCM_DEPT_INFO", "DEPT_CD", "DEPT_004",
                "INSERT INTO MCMAPUSER.TB_MCM_DEPT_INFO " +
                "(DEPT_CD, DEPT_NM, DEPT_NM_EN, UPPER_DEPT_CD, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('DEPT_004', N'인사팀', 'HR Team', 'DEPT_001', 'Y', " +
                "SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // DEPT_005 — 재무팀
        insertIfAbsent(
                "TB_MCM_DEPT_INFO", "DEPT_CD", "DEPT_005",
                "INSERT INTO MCMAPUSER.TB_MCM_DEPT_INFO " +
                "(DEPT_CD, DEPT_NM, DEPT_NM_EN, UPPER_DEPT_CD, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('DEPT_005', N'재무팀', 'Finance Team', 'DEPT_001', 'Y', " +
                "SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // DEPT_006 — 영업1팀
        insertIfAbsent(
                "TB_MCM_DEPT_INFO", "DEPT_CD", "DEPT_006",
                "INSERT INTO MCMAPUSER.TB_MCM_DEPT_INFO " +
                "(DEPT_CD, DEPT_NM, DEPT_NM_EN, UPPER_DEPT_CD, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('DEPT_006', N'영업1팀', 'Sales Team 1', 'DEPT_001', 'Y', " +
                "SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // DEPT_007 — 품질관리팀
        insertIfAbsent(
                "TB_MCM_DEPT_INFO", "DEPT_CD", "DEPT_007",
                "INSERT INTO MCMAPUSER.TB_MCM_DEPT_INFO " +
                "(DEPT_CD, DEPT_NM, DEPT_NM_EN, UPPER_DEPT_CD, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('DEPT_007', N'품질관리팀', 'Quality Mgmt Team', 'DEPT_001', 'Y', " +
                "SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");
    }
}
