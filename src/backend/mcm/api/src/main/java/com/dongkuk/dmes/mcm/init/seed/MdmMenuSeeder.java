package com.dongkuk.dmes.mcm.init.seed;

/**
 * mcm 이 mdm(마루 MDM) 모듈용으로 넣는 메뉴·OBJECT·역할·권한 시드 (2026-10-04 DataInitializer 분할).
 *
 * <p>대상 테이블은 모두 mcm 소유 TB_MCM_SEC_* 이다(mdm 스키마에는 쓰지 않는다). 메뉴 캐시 관리(csa/mdmCacheMng)와
 * mdm metaFeed OBJECT 를 넣는 {@link #seedMdmCacheMenus()} 도 여기 둔다.
 *
 * <p>mdm {@code MdmOasisActionVocabularyTest} 가 {@code readActions}·{@code editActions}·{@code confirmActions}·
 * {@code matrix} 선언, 모든 {@code seedMdmObjectRbac(...)} 호출, metaFeed OBJECT·layoutConfirm 메뉴 시드를 이 파일에서
 * 문자열로 읽는다. 선언 모양을 바꾸면 그 시험도 함께 고친다.
 */
public final class MdmMenuSeeder extends SeedSupport {

    public MdmMenuSeeder(SeedSupport support) {
        super(support);
    }

    /**
     * 2026-10-02 — MDM 캐시 관리(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.5·§6).
     *
     * <p>mdmCacheMng — 포털(mcm) 화면 OBJECT + csa 메뉴 leaf(1020190, 화면 사용 통계 1020180 다음) + SYSADMIN 전체 권한. 화면이 부르는 업무 모듈
     * /api/{m}/mdmMeta/* 는 AUTH_ONLY(proxy.ts·EndpointPermissionFilter)이고 관리 action 은 각 모듈 컨트롤러가 SYSADMIN 을 다시 본다.
     *
     * <p>metaFeed — 화면의 삭제·재등록은 MDM OASIS /api/mdm/oasis/metaFeed/save 다. BFF 권한키 mdm/metafeed/save 를 위해 OBJECT(SYSTEM_CODE=mdm)와
     * SYSADMIN 매핑을 둔다(없으면 SYSADMIN 도 403). 업무 그룹 권한(seedMdmObjectRbac)은 주지 않는다 — 강제 기록은 SYSADMIN 만이고 MDM 서비스가
     * MDM027 로 다시 막는다. 메뉴는 없다(화면이 아니다). 모두 멱등.
     */
    public void seedMdmCacheMenus() {
        insertMcmSecObjIfAbsent("mdmCacheMng", "MDM 캐시 관리", "mcm");
        insertMcmSecMenuIfAbsent("mdmCacheMng", "001", "1020190", "MDM 캐시 관리", "csa", "mdmCacheMng");
        insertMcmSecObjIfAbsent("metaFeed", "MDM 메타 제공", "mdm");
        for (String objId : new String[]{"mdmCacheMng", "metaFeed"}) {
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objId,       "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + escapeSql(objId) + "', 'PERM_ALL'" + AUDIT_VALS + ")");
        }
        log.info("[DataInitializer] MDM 캐시 관리 시드 — OBJECT 2(mdmCacheMng=mcm, metaFeed=mdm) + 메뉴 leaf 1(csa/mdmCacheMng) + RBAC(SYSADMIN 2)");
    }

    /**
     * mdm(마루 MDM) 메뉴 그룹 트리·RBAC 시드(TSK-01-01 샘플 화면 + TSK-01-03 메뉴 그룹·역할·권한 세트).
     *
     * <ul>
     *   <li>폴더 6: mdm(모듈 루트) + 그룹 5개 dma 용어·도메인 / dmb 레이아웃 / dmc 마스터코드 / dmd 마스터데이터 /
     *       dme 업무기준 — TB_MCM_SEC_MENU_FLD. 이름은 MdmScreenGroup·screens/README §2·m-mdm MDM_GROUPS 와 글자까지
     *       같다(TSK-01-03). leaf 가 없는 폴더는 사이드바에 나오지 않고, 화면 Task 가 leaf 를 붙이면 보인다.</li>
     *   <li>OBJECT 1: mdmSample — TB_MCM_SEC_OBJ (SYSTEM_CODE='mdm' = FE moduleId,
     *       m-mcm PORTAL_MODULE_CONFIG 의 mdm 로더로 라우팅).</li>
     *   <li>메뉴 leaf 1: parent='dma' — TB_MCM_SEC_MENU. componentPath = 'dma/mdmSample'.</li>
     *   <li>RBAC: SYSADMIN × mdmSample × PERM_ALL(기존) + {@link #seedMdmRbac()}(역할 2·역할 그룹 2·권한 세트 3) +
     *       {@link #seedMdmObjectRbac(String, String)}(그룹 × 역할 매트릭스, ADR-0003 D5).</li>
     * </ul>
     *
     * <p>시험 사용자는 시드하지 않는다(TSK-01-03 D10) — E2E 는 격리 DB 에 픽스처(e2e/fixtures/mdm-rbac-users.sql)로 넣는다.
     *
     * <p>TSK-01-02 D2 — TSK-01-01 이 옛 그룹으로 시드한 기존 DB 는 시드 전에 {@link #migrateMdmSampleGroupToDma()}
     * 가 UPDATE 로 이행한다(insert-if-absent 시드와 조회 때 계산되는 componentPath 때문에 리터럴만 바꾸면 기존 DB 에서
     * 화면이 열리지 않는다).
     *
     * <p>FULL_SEQ 인코딩: 모듈 백만(mdm=5,000,000 — analog=4,000,000 다음, {@code insertMpnFld} 전수
     * grep 으로 5 가 미사용임을 확인) / 그룹 만(dma=5,010,000) / 화면 백·십(5010100). MENU_SEQ
     * mdm='00000005'. 시드 후 recomputeMenuFullSeq() 가 트리 위치 기준으로 FULL_SEQ 재부여(멱등).
     * 샘플 화면이 API 를 호출하지 않아(design.md §3.3) PERMISSION_ACTION 등재는 불필요 — 실 BPMN 이
     * 생기는 다음 화면 Task 에서 seedMcmSecRbac() 의 allActions 목록에 추가한다.
     */
    public void seedMdmMenus() {
        // ── 기존 DB 이행 — 반드시 dma 폴더 INSERT 보다 먼저(옛 폴더 행을 이름과 함께 옮긴다) ──
        migrateMdmSampleGroupToDma();

        // ── 폴더 (FLD) — root mdm(모듈 5) + group dma(용어·도메인) ──
        insertMpnFld("mdm", "00000005", "마루 MDM", null,   5000000L);
        insertMpnFld("dma", "00000100", "용어·도메인", "mdm", 5010000L);
        // ── TSK-01-03 — 나머지 메뉴 그룹 4개(MdmScreenGroup·screens/README §2 와 같은 이름) ──
        insertMpnFld("dmb", "00000200", "레이아웃",     "mdm", 5020000L);
        insertMpnFld("dmc", "00000300", "마스터코드",   "mdm", 5030000L);
        insertMpnFld("dmd", "00000400", "마스터데이터", "mdm", 5040000L);
        insertMpnFld("dme", "00000500", "업무기준",     "mdm", 5050000L);

        // ── OBJECT — SYSTEM_CODE='mdm' 이 FE moduleId 가 된다 ──
        insertMcmSecObjIfAbsent("mdmSample", "MDM 샘플", "mdm");
        // TSK-04-02 — 단위 마스터·용어 관리(mdm 최초의 실제 OASIS 서비스 화면, mdmSample 선례 패턴).
        insertMcmSecObjIfAbsent("unitMng", "단위 마스터", "mdm");
        insertMcmSecObjIfAbsent("termMng", "용어 관리", "mdm");

        // ── 메뉴 leaf (parent=dma) — componentPath = 'dma/mdmSample' ──
        insertMcmSecMenuIfAbsent("mdmSample", "001", "5010100", "MDM 샘플", "dma", "mdmSample");
        insertMcmSecMenuIfAbsent("unitMng", "002", "5010200", "단위 마스터", "dma", "unitMng");
        insertMcmSecMenuIfAbsent("termMng", "003", "5010300", "용어 관리", "dma", "termMng");

        // ── RBAC — SYSADMIN × 3 OBJECT × PERM_ALL ──
        for (String objectId : new String[]{"mdmSample", "unitMng", "termMng"}) {
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objectId,    "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + objectId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
        }

        // ── TSK-01-03 — MDM 역할·권한 세트와 화면별 매트릭스 ──
        seedMdmRbac();
        seedMdmObjectRbac("mdmSample", "dma");
        seedMdmObjectRbac("unitMng", "dma");
        seedMdmObjectRbac("termMng", "dma");
        log.info("[DataInitializer] MDM 메뉴 시드 — 폴더 6 + OBJECT 3 + 메뉴 leaf 3 + RBAC(SYSADMIN 1 + MDM 역할 2)");

        seedMdmDomainMngMenu();
        seedMdmCodeItemEditMenu();
        seedMdmCodeCateEditObject();
        seedMdmCodeConfirmMenu();

        // ── TSK-04-04 — 컬럼 사전(columnMng) + 용어 인라인 등록 팝업(termRegPop). 팝업은 메뉴 leaf 없이 OBJECT·권한만
        //    둔다(screens/README §3·§5 — 버튼·API 권한은 역할 매핑에서 오고 메뉴를 보지 않는다, design.md F14·F15).
        insertMcmSecObjIfAbsent("columnMng", "컬럼 사전", "mdm");
        insertMcmSecObjIfAbsent("termRegPop", "용어 인라인 등록", "mdm");
        insertMcmSecMenuIfAbsent("columnMng", "004", "5010140", "컬럼 사전", "dma", "columnMng");
        for (String objectId : new String[]{"columnMng", "termRegPop"}) {
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objectId,    "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + objectId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
            seedMdmObjectRbac(objectId, "dma");
        }
        log.info("[DataInitializer] TSK-04-04 MDM 컬럼 사전 시드 — OBJECT 2 + 메뉴 leaf 1 + RBAC(SYSADMIN 2 + MDM 역할 4)");
        seedMdmLayoutMenus();
        seedMdmLayoutConfirmMenu();
        log.info("[DataInitializer] TSK-05-02 MDM 레이아웃 메뉴 시드 — headerMng·layoutMng");

        // ── TSK-06-02 — 마루 코드 조회·등록(codeMng) + 마루 코드 수정(codeEdit), 폴더 dmc. DRAFT 소유권 액션
        //    (lock·unlock·handover) 권한은 여기서 더하지 않는다 — TSK-08-02 몫(D-075).
        //    D-101(2026-09-28): codeEdit 는 codeMng 화면에 합쳐 메뉴 leaf 가 없다. 합친 화면이 codeEdit 서비스를
        //    그대로 부르므로 OBJECT·권한은 남긴다(메뉴 없는 OBJECT 도 권한 키를 받는다 — dataCsvUploadPop 과 같다).
        insertMcmSecObjIfAbsent("codeMng", "마루 코드", "mdm");
        insertMcmSecObjIfAbsent("codeEdit", "마루 코드 수정", "mdm");
        insertMcmSecMenuIfAbsent("codeMng", "001", "5030100", "마루 코드", "dmc", "codeMng");
        removeMergedMdmCodeMenus();
        for (String objectId : new String[]{"codeMng", "codeEdit"}) {
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objectId,    "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + objectId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
            seedMdmObjectRbac(objectId, "dmc");
        }
        log.info("[DataInitializer] TSK-06-02 MDM 마루 코드 시드 — OBJECT 2 + 메뉴 leaf 1 + RBAC(SYSADMIN 2 + MDM 역할 4)");
        seedMdmDataMngMenus();
        seedMdmDataItemMenus();
        seedMdmDataCsvUploadPopObject();
        seedMdmRuleMenus();
        seedMdmRuleConfirmMenu();
        seedMdmRuleSetMenus();
        seedMdmRuleSetConfirmMenu();
    }

    /**
     * TSK-07-02 — 마루 데이터 조회·등록(dataMng)·수정(dataEdit)·카테고리 편집(dataCateEdit), 폴더 dmd. F2 가 예약한
     * MENU_SEQ 001~003. action(search·reg·view·save·delete·restore·compare)은 모두 기존 권한 세트·allActions 안에
     * 있다(D9). FULL_SEQ 는 부팅 끝 recomputeMenuFullSeq() 가 다시 매긴다.
     * D-104: dataEdit 는 dataMng 화면에 합쳐 메뉴 leaf 가 없다(dataCateEdit 는 dataItemMng 로 합침). 합친 화면이 두
     * 서비스를 그대로 부르므로 OBJECT·권한은 남기고, 이미 있는 메뉴 행은 {@link #removeMergedMdmDataMenus()} 가 지운다.
     */
    private void seedMdmDataMngMenus() {
        insertMcmSecObjIfAbsent("dataMng", "마루 데이터", "mdm");
        insertMcmSecObjIfAbsent("dataEdit", "마루 데이터 수정", "mdm");
        insertMcmSecObjIfAbsent("dataCateEdit", "카테고리 편집", "mdm");
        insertMcmSecMenuIfAbsent("dataMng", "001", "5040100", "마루 데이터", "dmd", "dataMng");
        removeMergedMdmDataMenus();
        for (String objectId : new String[]{"dataMng", "dataEdit", "dataCateEdit"}) {
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objectId,    "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + objectId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
            seedMdmObjectRbac(objectId, "dmd");
        }
        log.info("[DataInitializer] TSK-07-02 MDM 마루 데이터 조회·등록·수정·카테고리 편집 시드 — OBJECT 3 + 메뉴 leaf 1 "
                + "+ RBAC(SYSADMIN 3 + MDM 역할 6)");
    }

    /**
     * TSK-07-03 — 항목 편집(dmd/dataItemMng)·항목 이력(dmd/dataHistory). 부모 폴더 mdm·dmd 는 seedMdmMenus() 가 이미 멱등
     * 시드한다. OBJECT_ID = screenId = BPMN process id. action(view·search·reg·save·delete·restore)은 모두 기존 권한 세트·
     * allActions 안에 있다(design.md D9). MENU_SEQ 001~003 은 TSK-07-02(dataMng·dataEdit·dataCateEdit) 몫으로 비워 둔다.
     * FULL_SEQ 는 부팅 끝 recomputeMenuFullSeq() 가 다시 매긴다.
     * D-104: dataHistory 는 dataItemMng 화면에 합쳐 메뉴 leaf 가 없다. OBJECT·권한은 남기고 이미 있는 메뉴 행은
     * {@link #removeMergedMdmDataMenus()} 가 지운다. 남는 메뉴 이름은 "항목 편집" 이며, 이미 시드된 DB 의
     * 옛 이름 "항목 관리" 는 {@code MENU_NM} 이 그 값 그대로일 때만 바로잡는다(commMenuMng 에서 바꾼 이름은 건드리지 않는다).
     */
    private void seedMdmDataItemMenus() {
        insertMcmSecObjIfAbsent("dataItemMng", "항목 관리", "mdm");
        insertMcmSecObjIfAbsent("dataHistory", "항목 이력", "mdm");
        insertMcmSecMenuIfAbsent("dataItemMng", "004", "5040400", "항목 편집", "dmd", "dataItemMng");
        int renamed = nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET MENU_NM = :nn WHERE MENU_ID = 'dataItemMng' AND MENU_NM = :on")
                .setParameter("nn", "항목 편집").setParameter("on", "항목 관리").executeUpdate();
        if (renamed > 0) {
            log.info("[DataInitializer] D-104 — dataItemMng 메뉴 이름 보정 '항목 관리' → '항목 편집' rows={}", renamed);
        }
        for (String objectId : new String[]{"dataItemMng", "dataHistory"}) {
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objectId,    "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + objectId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
            seedMdmObjectRbac(objectId, "dmd");
        }
        log.info("[DataInitializer] TSK-07-03 MDM 항목 편집·이력 시드 — OBJECT 2 + 메뉴 leaf 1 + RBAC(SYSADMIN 2 + MDM 역할 4)");
    }

    /**
     * D-104 — 마루 데이터 화면 5개를 2개로 합치며 없앤 메뉴 leaf(dataEdit·dataCateEdit·dataHistory)를 잔존 DB 에서
     * 지운다. 메뉴 행만 지운다. OBJECT·역할 매핑은 합친 화면이 세 서비스를 계속 부르므로 남긴다. 멱등(없으면 0행).
     */
    private void removeMergedMdmDataMenus() {
        for (String menuId : new String[]{"dataEdit", "dataCateEdit", "dataHistory"}) {
            // 즐겨찾기가 없앤 메뉴를 가리키면 목록에 이름 없는 행이 남으므로 메뉴보다 먼저 지운다.
            int fav = nq("DELETE FROM MCMAPUSER.TB_MCM_SEC_USER_FAVORITE WHERE MENU_ID = :m")
                    .setParameter("m", menuId).executeUpdate();
            if (fav > 0) {
                log.info("[DataInitializer] D-104 — 없앤 메뉴의 즐겨찾기 DELETE MENU_ID={} rows={}", menuId, fav);
            }
            int del = nq("DELETE FROM MCMAPUSER.TB_MCM_SEC_MENU WHERE MENU_ID = :m")
                    .setParameter("m", menuId).executeUpdate();
            if (del > 0) {
                log.info("[DataInitializer] D-104 — 합친 화면의 메뉴 leaf DELETE MENU_ID={} rows={}", menuId, del);
            }
        }
    }

    /**
     * TSK-07-04 — CSV 업로드({@code dataCsvUploadPop}). 독립 화면이 아니라 {@code dataItemMng} 화면이 여는 팝업이라
     * 메뉴 leaf 는 만들지 않는다(D2, TSK-04-04 {@code termRegPop} 선례와 같은 모양 — OBJECT·역할 매핑만 둔다).
     */
    private void seedMdmDataCsvUploadPopObject() {
        insertMcmSecObjIfAbsent("dataCsvUploadPop", "CSV 업로드", "mdm");
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID",         "PERMISSION_ID"},
                new String[]{"SYSADMIN", "dataCsvUploadPop",  "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'dataCsvUploadPop', 'PERM_ALL'" + AUDIT_VALS + ")");
        seedMdmObjectRbac("dataCsvUploadPop", "dmd");
        log.info("[DataInitializer] TSK-07-04 MDM CSV 업로드 팝업 시드 — OBJECT 1(메뉴 leaf 없음) + RBAC(SYSADMIN 1 + MDM 역할 2)");
    }

    /**
     * TSK-08-02 — 업무기준(dme) 폴더의 룰 화면 두 개: 룰 조회·등록(dme/ruleMng)과 룰 화면(dme/ruleEdit). 기존 마스터관리·업무기준관리
     * 메뉴는 고치지 않고 dme 폴더 아래 새 leaf 로 등록한다. OBJECT_ID = screenId = BPMN process id(design I23·I24). action 은
     * ruleMng search·reg, ruleEdit search·view·save·delete·copy·lock·unlock·handover 이고 모두 allActions·권한 세트 안에 있다.
     * FULL_SEQ 는 부팅 끝 recomputeMenuFullSeq() 가 다시 매긴다.
     */
    private void seedMdmRuleMenus() {
        String[][] screens = {
                {"ruleMng",  "룰",      "001", "5050100"},
                {"ruleEdit", "룰 화면", "002", "5050200"},
        };
        for (String[] screen : screens) {
            String objectId = screen[0];
            insertMcmSecObjIfAbsent(objectId, screen[1], "mdm");
            insertMcmSecMenuIfAbsent(objectId, screen[2], screen[3], screen[1], "dme", objectId);
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objectId,    "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + objectId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
            seedMdmObjectRbac(objectId, "dme");
        }
        log.info("[DataInitializer] TSK-08-02 MDM 룰 화면 시드 — OBJECT 2 + 메뉴 leaf 2(dme) + RBAC(SYSADMIN 2 + MDM 역할 4)");
    }

    /**
     * TSK-08-05 — 룰 버전 확정(dme/ruleConfirm). 08-02·08-06 의 메뉴 배열은 고치지 않고 같은 dme 폴더 아래 새 leaf 로 등록한다
     * (design §6.9). MENU_SEQ 003·FULL_SEQ 5050300 은 08-06 D12 가 이 Task 몫으로 비워 두었다. OBJECT_ID = screenId = BPMN process id.
     * action(search·view·validate·confirm)은 모두 기존 권한 세트·allActions 안에 있고, dme 매트릭스는 표준 관리자 READ(search·view)·
     * 담당자 CONFIRM(validate·confirm 포함)이다. FULL_SEQ 는 부팅 끝 recomputeMenuFullSeq() 가 다시 매긴다.
     */
    private void seedMdmRuleConfirmMenu() {
        insertMcmSecObjIfAbsent("ruleConfirm", "버전 확정", "mdm");
        insertMcmSecMenuIfAbsent("ruleConfirm", "003", "5050300", "버전 확정", "dme", "ruleConfirm");
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID",   "PERMISSION_ID"},
                new String[]{"SYSADMIN", "ruleConfirm", "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'ruleConfirm', 'PERM_ALL'" + AUDIT_VALS + ")");
        seedMdmObjectRbac("ruleConfirm", "dme");
        log.info("[DataInitializer] TSK-08-05 MDM 룰 버전 확정 시드 — OBJECT 1 + 메뉴 leaf 1(dme) + RBAC(SYSADMIN 1 + MDM 역할 2)");
    }

    /**
     * TSK-08-06 — 업무기준(dme) 폴더의 룰 세트 화면 두 개: 룰 세트 조회·등록(dme/ruleSetMng)과 룰 세트 편집(dme/ruleSetEdit). 08-02 의
     * seedMdmRuleMenus() 배열은 고치지 않고 같은 dme 폴더 아래 새 leaf 로 등록한다(design D12). OBJECT_ID = screenId = BPMN process id(I17·I18).
     * action 은 ruleSetMng search·reg, ruleSetEdit search·view·save·delete(폐기)·restore(되살리기)이고 모두 allActions·권한 세트 안에 있다.
     * FULL_SEQ 는 부팅 끝 recomputeMenuFullSeq() 가 다시 매긴다.
     */
    private void seedMdmRuleSetMenus() {
        String[][] screens = {
                {"ruleSetMng",  "룰 세트",      "004", "5050400"},
                {"ruleSetEdit", "룰 세트 편집", "005", "5050500"},
        };
        for (String[] screen : screens) {
            String objectId = screen[0];
            insertMcmSecObjIfAbsent(objectId, screen[1], "mdm");
            insertMcmSecMenuIfAbsent(objectId, screen[2], screen[3], screen[1], "dme", objectId);
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objectId,    "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + objectId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
            seedMdmObjectRbac(objectId, "dme");
        }
        log.info("[DataInitializer] TSK-08-06 MDM 룰 세트 화면 시드 — OBJECT 2 + 메뉴 leaf 2(dme) + RBAC(SYSADMIN 2 + MDM 역할 4)");
    }

    /**
     * D-144 2단계 — 룰 세트 확정(dme/ruleSetConfirm). 기존 메뉴 배열은 고치지 않고 같은 dme 폴더 아래 새 leaf 로 등록한다.
     * action(search·view·validate·confirm)은 기존 권한 세트·allActions 안에 있다(ruleConfirm 과 같다). 룰 세트 편집(ruleSetEdit)의 새 action
     * copy·lock·unlock·handover 도 이미 PERM_MDM_EDIT·allActions 안에 있어 시드를 바꾸지 않는다. FULL_SEQ 는 부팅 끝 recomputeMenuFullSeq() 가 다시 매긴다.
     */
    private void seedMdmRuleSetConfirmMenu() {
        insertMcmSecObjIfAbsent("ruleSetConfirm", "룰 세트 확정", "mdm");
        insertMcmSecMenuIfAbsent("ruleSetConfirm", "006", "5050600", "룰 세트 확정", "dme", "ruleSetConfirm");
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID",      "PERMISSION_ID"},
                new String[]{"SYSADMIN", "ruleSetConfirm", "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'ruleSetConfirm', 'PERM_ALL'" + AUDIT_VALS + ")");
        seedMdmObjectRbac("ruleSetConfirm", "dme");
        log.info("[DataInitializer] D-144 2단계 MDM 룰 세트 확정 시드 — OBJECT 1 + 메뉴 leaf 1(dme) + RBAC(SYSADMIN 1 + MDM 역할 2)");
    }

    /**
     * TSK-01-03 D10 — MDM 역할 2종·역할 그룹 2종(1:1)·권한 세트 3종 시드(ADR-0003 D5).
     *
     * <p>역할 ID 는 {@code ROLE_} 접두 없이 넣는다(JWT 역할 클레임이 "ROLE_" + ROLE_ID). 사용자는 역할 그룹을 거쳐서만
     * 역할을 받으므로 역할 그룹을 함께 둔다. 권한 세트의 액션 목록은 mdm 계약 MdmPermissions.*_ACTIONS 와 같다(이 모듈은
     * mdm lib 을 의존하지 않아 문자열로 적고, e2e/fixtures/mdm-rbac-seed-check 가 대조한다).
     * <b>PERMISSION_COMMON·PERMISSION_CUSTOM·POPUP_BTN 은 비운다</b> — UserPermCache 가 네 칸의 합집합을 액션으로
     * 쓰므로 PERM_ALL 처럼 COMMON 을 채우면 READ 가 save·delete 를 얻는다.
     */
    private void seedMdmRbac() {
        // TB_MCM_SEC_ROLE — 표준 관리자·담당자
        insertIfAbsent(
                "TB_MCM_SEC_ROLE", "ROLE_ID", "MDM_STD_ADMIN",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE " +
                "(ROLE_ID, ROLE_NM, ROLE_DESC, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('MDM_STD_ADMIN', N'표준 관리자', N'용어·도메인·레이아웃 등록·수정(ADR-0003 D5)', 'Y', SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");
        insertIfAbsent(
                "TB_MCM_SEC_ROLE", "ROLE_ID", "MDM_STEWARD",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE " +
                "(ROLE_ID, ROLE_NM, ROLE_DESC, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('MDM_STEWARD', N'담당자', N'마스터코드·마스터데이터·업무기준 편집과 버전 확정(ADR-0003 D5)', 'Y', SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // TB_MCM_SEC_ROLEGROUP — 역할 그룹 1:1
        insertIfAbsent(
                "TB_MCM_SEC_ROLEGROUP", "ROLE_GROUP_ID", "ROLE_GROUP_MDM_STD_ADMIN",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP " +
                "(ROLE_GROUP_ID, ROLE_GROUP_NM, ROLE_GROUP_DESC, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('ROLE_GROUP_MDM_STD_ADMIN', N'MDM 표준 관리자 그룹', N'MDM 표준 관리자 역할 그룹', 'Y', SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");
        insertIfAbsent(
                "TB_MCM_SEC_ROLEGROUP", "ROLE_GROUP_ID", "ROLE_GROUP_MDM_STEWARD",
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP " +
                "(ROLE_GROUP_ID, ROLE_GROUP_NM, ROLE_GROUP_DESC, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('ROLE_GROUP_MDM_STEWARD', N'MDM 담당자 그룹', N'MDM 담당자 역할 그룹', 'Y', SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");

        // TB_MCM_SEC_ROLEGROUP_MAPPING — (그룹, 역할)
        for (String roleId : new String[]{"MDM_STD_ADMIN", "MDM_STEWARD"}) {
            String groupId = "ROLE_GROUP_" + roleId;
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLEGROUP_MAPPING",
                    new String[]{"ROLE_GROUP_ID", "ROLE_ID"},
                    new String[]{groupId,         roleId},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (ROLE_GROUP_ID, ROLE_ID" + AUDIT_COLS + ") " +
                    "VALUES ('" + groupId + "', '" + roleId + "'" + AUDIT_VALS + ")");
        }

        // TB_MCM_SEC_PERM — READ ⊂ EDIT ⊂ CONFIRM (MdmPermissions.*_ACTIONS 와 같은 순서)
        // TSK-08-02 D4 — DRAFT 소유권 액션 lock·unlock·handover 는 EDIT 부터(restore 뒤).
        String readActions = "search,view,export,compare";
        String editActions = readActions + ",save,delete,reg,import,validate,execute,copy,restore,lock,unlock,handover";
        String confirmActions = editActions + ",confirm";
        String[][] perms = {
                {"PERM_MDM_READ",    "MDM 조회",      "MDM 조회 권한(ADR-0003 D5)",           readActions},
                {"PERM_MDM_EDIT",    "MDM 편집",      "MDM 조회·편집 권한(ADR-0003 D5)",      editActions},
                {"PERM_MDM_CONFIRM", "MDM 편집·확정", "MDM 조회·편집·확정 권한(ADR-0003 D5)", confirmActions},
        };
        for (String[] perm : perms) {
            insertIfAbsent(
                    "TB_MCM_SEC_PERM", "PERMISSION_ID", perm[0],
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_PERM " +
                    "(PERMISSION_ID, PERMISSION_NM, PERMISSION_DESC, PERMISSION_ACTION, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                    "VALUES ('" + perm[0] + "', N'" + escapeSql(perm[1]) + "', N'" + escapeSql(perm[2]) + "', " +
                    "'" + escapeSql(perm[3]) + "', 'Y', SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");
            // 이미 있는 DB 는 insert-if-absent 가 건너뛰므로 빠진 action 만 끝에 덧붙인다(TSK-08-02 — 기존 순서는 바꾸지 않는다).
            ensurePermActions(perm[0], perm[3]);
        }
    }

    /**
     * TSK-01-03 D10 — MDM 화면 OBJECT 하나에 그룹 × 역할 매트릭스(ADR-0003 D5)를 매핑한다.
     *
     * <p>화면 Task 는 OBJECT·leaf 시드 뒤 이 메서드를 한 줄 부른다(TSK-01-03 D10). SYSADMIN 은 여기 없다 —
     * 기존대로 PERM_ALL 행을 따로 둔다. 매트릭스는 mdm 계약 MdmPermissions.MATRIX 와 같다.
     *
     * @param objectId  TB_MCM_SEC_OBJ.OBJECT_ID(= screenId)
     * @param groupCode 메뉴 그룹 코드 dma~dme. 모르는 값이면 기동 실패
     */
    private void seedMdmObjectRbac(String objectId, String groupCode) {
        java.util.Map<String, java.util.Map<String, String>> matrix = java.util.Map.of(
                "dma", java.util.Map.of("MDM_STD_ADMIN", "PERM_MDM_EDIT", "MDM_STEWARD", "PERM_MDM_READ"),
                "dmb", java.util.Map.of("MDM_STD_ADMIN", "PERM_MDM_EDIT", "MDM_STEWARD", "PERM_MDM_CONFIRM"),
                "dmc", java.util.Map.of("MDM_STD_ADMIN", "PERM_MDM_READ", "MDM_STEWARD", "PERM_MDM_CONFIRM"),
                "dmd", java.util.Map.of("MDM_STD_ADMIN", "PERM_MDM_READ", "MDM_STEWARD", "PERM_MDM_EDIT"),
                "dme", java.util.Map.of("MDM_STD_ADMIN", "PERM_MDM_READ", "MDM_STEWARD", "PERM_MDM_CONFIRM"));
        java.util.Map<String, String> byRole = matrix.get(groupCode);
        if (byRole == null) {
            throw new IllegalStateException("[DataInitializer] 알 수 없는 MDM 메뉴 그룹: " + groupCode);
        }
        for (String roleId : new String[]{"MDM_STD_ADMIN", "MDM_STEWARD"}) {
            String permissionId = byRole.get(roleId);
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID", "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{roleId,    objectId,    permissionId},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('" + roleId + "', '" + escapeSql(objectId) + "', '" + permissionId + "'" + AUDIT_VALS + ")");
        }
    }

    // TSK-01-02 D2 — TSK-01-01 이 옛 그룹 mdt 로 시드한 기존 DB 를 dma 로 옮긴다.
    // UPDATE 만 쓴다(DELETE 없음). 새 DB 에서는 영향 행 0 이라 아무 일도 하지 않는다(멱등).
    // 순서: leaf 부모 → 자식 폴더 부모 → 폴더 PK·이름(dma 가 없을 때만) → 즐겨찾기 경로(FULL_ID = componentPath).
    // dma·mdt 가 둘 다 있으면 mdt 폴더 행은 남긴다 — 자식이 없어 사이드바에 보이지 않고, 삭제는 사용자 확인 대상이다.
    private void migrateMdmSampleGroupToDma() {
        int leaf = nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET PARENT_MENU_ID = 'dma' WHERE PARENT_MENU_ID = 'mdt'").executeUpdate();
        int childFld = nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD SET PARENT_MENU_ID = 'dma' WHERE PARENT_MENU_ID = 'mdt'").executeUpdate();
        Number dmaExists = (Number) nq("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD WHERE MENU_ID = 'dma'").getSingleResult();
        int fld = 0;
        if (dmaExists == null || dmaExists.intValue() == 0) {
            fld = nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD SET MENU_ID = 'dma', MENU_NM = N'용어·도메인' WHERE MENU_ID = 'mdt'").executeUpdate();
        }
        int fav = nq("UPDATE MCMAPUSER.TB_MCM_SEC_USER_FAVORITE SET FULL_ID = 'dma/mdmSample' WHERE FULL_ID = 'mdt/mdmSample'").executeUpdate();
        if (leaf + childFld + fld + fav > 0) {
            log.info("[DataInitializer] MDM 샘플 그룹 이행 mdt → dma — leaf {} · 자식 폴더 {} · 폴더 {} · 즐겨찾기 {}행",
                    leaf, childFld, fld, fav);
        }
    }

    /**
     * TSK-04-03 — 도메인 관리 화면(dma/domainMng). 기존 마스터관리·업무기준관리 메뉴는 고치지 않고 dma 폴더 아래 새 leaf 로
     * 등록한다(design.md §3.9). 부모 폴더 mdm·dma 는 seedMdmMenus() 가 이미 멱등 시드한다. OBJECT_ID = screenId = BPMN
     * process id(불변 I17). action(search·view·validate·execute·save)은 모두 기존 권한 세트·allActions 안에 있다.
     * FULL_SEQ 는 screens/README §3 순서(unitMng·termMng·domainMng·columnMng)의 셋째 자리이며 부팅 끝
     * recomputeMenuFullSeq() 가 다시 매긴다.
     */
    private void seedMdmDomainMngMenu() {
        insertMcmSecObjIfAbsent("domainMng", "도메인 관리", "mdm");
        insertMcmSecMenuIfAbsent("domainMng", "001", "5010130", "도메인 관리", "dma", "domainMng");
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                new String[]{"SYSADMIN", "domainMng", "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'domainMng', 'PERM_ALL'" + AUDIT_VALS + ")");
        seedMdmObjectRbac("domainMng", "dma");
    }

    /**
     * TSK-06-03 — 코드 편집 화면(dmc/codeItemEdit). 기존 마스터관리 메뉴는 고치지 않고 dmc 폴더 아래 새 leaf 로 등록한다
     * (design.md §3 커밋 C). 부모 폴더 mdm·dmc 는 seedMdmMenus() 가 이미 멱등 시드한다. OBJECT_ID = screenId = BPMN
     * process id. action(search·view·compare·validate·save·restore·execute)은 모두 기존 권한 세트 안에 있고, dmc 매트릭스는
     * 표준 관리자 READ·담당자 CONFIRM 이다. FULL_SEQ 는 screens/README §3 순서(codeMng·codeItemEdit·codeConfirm,
     * D-101 로 codeEdit·codeCateEdit 메뉴 없음)의 둘째 자리이며 부팅 끝 recomputeMenuFullSeq() 가 다시 매긴다.
     */
    private void seedMdmCodeItemEditMenu() {
        insertMcmSecObjIfAbsent("codeItemEdit", "코드 편집", "mdm");
        insertMcmSecMenuIfAbsent("codeItemEdit", "003", "5030300", "코드 편집", "dmc", "codeItemEdit");
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID",    "PERMISSION_ID"},
                new String[]{"SYSADMIN", "codeItemEdit", "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'codeItemEdit', 'PERM_ALL'" + AUDIT_VALS + ")");
        seedMdmObjectRbac("codeItemEdit", "dmc");
    }

    /**
     * TSK-06-04 — 카테고리 편집(codeCateEdit) OBJECT·권한. OBJECT_ID = BPMN process id. action(search·view·compare·
     * validate·save·restore)은 모두 기존 권한 세트 안에 있고, dmc 매트릭스는 표준 관리자 READ·담당자 CONFIRM 이다.
     * D-101(2026-09-28): 화면은 코드 편집(codeItemEdit)의 카테고리 탭으로 합쳐 메뉴 leaf 가 없다. 그 탭이 codeCateEdit
     * 서비스를 그대로 부르므로 OBJECT·권한만 둔다. 이미 있는 메뉴 행은 {@link #removeMergedMdmCodeMenus()} 가 지운다.
     */
    private void seedMdmCodeCateEditObject() {
        insertMcmSecObjIfAbsent("codeCateEdit", "카테고리 편집", "mdm");
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID",    "PERMISSION_ID"},
                new String[]{"SYSADMIN", "codeCateEdit", "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'codeCateEdit', 'PERM_ALL'" + AUDIT_VALS + ")");
        seedMdmObjectRbac("codeCateEdit", "dmc");
    }

    /**
     * D-101(2026-09-28) — 마루 코드 화면 4개를 2개로 합치며 없앤 메뉴 leaf(codeEdit·codeCateEdit)를 잔존 DB 에서 지운다.
     * 메뉴 행만 지운다. OBJECT·역할 매핑은 합친 화면이 두 서비스를 계속 부르므로 남긴다. 멱등(없으면 0행).
     */
    private void removeMergedMdmCodeMenus() {
        for (String menuId : new String[]{"codeEdit", "codeCateEdit"}) {
            // 즐겨찾기가 없앤 메뉴를 가리키면 목록에 이름 없는 행이 남으므로 메뉴보다 먼저 지운다.
            int fav = nq("DELETE FROM MCMAPUSER.TB_MCM_SEC_USER_FAVORITE WHERE MENU_ID = :m")
                    .setParameter("m", menuId).executeUpdate();
            if (fav > 0) {
                log.info("[DataInitializer] D-101 — 없앤 메뉴의 즐겨찾기 DELETE MENU_ID={} rows={}", menuId, fav);
            }
            int del = nq("DELETE FROM MCMAPUSER.TB_MCM_SEC_MENU WHERE MENU_ID = :m")
                    .setParameter("m", menuId).executeUpdate();
            if (del > 0) {
                log.info("[DataInitializer] D-101 — 합친 화면의 메뉴 leaf DELETE MENU_ID={} rows={}", menuId, del);
            }
        }
    }

    /**
     * TSK-06-05 — 버전 확정(dmc/codeConfirm). 기존 마스터관리 메뉴는 고치지 않고 dmc 폴더 아래 새 leaf 로 등록한다
     * (design.md §6.8). 부모 폴더 mdm·dmc 는 seedMdmMenus() 가 이미 멱등 시드한다. OBJECT_ID = screenId = BPMN process id.
     * action(search·view·validate·confirm)은 모두 기존 권한 세트 안에 있고, dmc 매트릭스는 표준 관리자 READ(search·view)·
     * 담당자 CONFIRM(validate·confirm 포함)이다. FULL_SEQ 는 screens/README §3 순서의 셋째 자리(D-101)이며 부팅 끝
     * recomputeMenuFullSeq() 가 다시 매긴다.
     */
    private void seedMdmCodeConfirmMenu() {
        insertMcmSecObjIfAbsent("codeConfirm", "버전 확정", "mdm");
        insertMcmSecMenuIfAbsent("codeConfirm", "005", "5030500", "버전 확정", "dmc", "codeConfirm");
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID",   "PERMISSION_ID"},
                new String[]{"SYSADMIN", "codeConfirm", "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'codeConfirm', 'PERM_ALL'" + AUDIT_VALS + ")");
        seedMdmObjectRbac("codeConfirm", "dmc");
    }

    /**
     * TSK-05-02 — 전문 헤더 정의(dmb/headerMng)·전문 레이아웃(dmb/layoutMng). 기존 마스터관리·업무기준관리 메뉴는 고치지 않고
     * 이미 시드된 dmb "레이아웃" 폴더 아래 새 leaf 로 등록한다. OBJECT_ID = screenId = BPMN process id. action(search·view·save)은
     * 모두 기존 권한 세트·allActions 안에 있다(design.md D8). FULL_SEQ 는 부팅 끝 recomputeMenuFullSeq() 가 다시 매긴다.
     */
    private void seedMdmLayoutMenus() {
        insertMcmSecObjIfAbsent("headerMng", "전문 헤더 정의", "mdm");
        insertMcmSecObjIfAbsent("layoutMng", "전문 레이아웃", "mdm");
        insertMcmSecMenuIfAbsent("headerMng", "001", "5020110", "전문 헤더 정의", "dmb", "headerMng");
        insertMcmSecMenuIfAbsent("layoutMng", "002", "5020120", "전문 레이아웃", "dmb", "layoutMng");
        for (String objectId : new String[]{"headerMng", "layoutMng"}) {
            insertIfAbsentComposite(
                    "TB_MCM_SEC_ROLE_MAPPING",
                    new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                    new String[]{"SYSADMIN", objectId,    "PERM_ALL"},
                    "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                    "VALUES ('SYSADMIN', '" + objectId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
            seedMdmObjectRbac(objectId, "dmb");
        }
        log.info("[DataInitializer] TSK-05-02 MDM 레이아웃 시드 — OBJECT 2 + 메뉴 leaf 2 + RBAC(SYSADMIN 2 + MDM 역할 4)");
    }

    /**
     * D-144 3단계 — 레이아웃 확정(dmb/layoutConfirm, 전문·헤더 공용). 05-02 의 seedMdmLayoutMenus() 배열은 고치지 않고 같은 dmb 폴더
     * 아래 새 leaf 로 등록한다. action(search·view·validate·confirm)은 기존 권한 세트·allActions 안에 있다. DMB 담당자는 CONFIRM 이다
     * (이미 있는 DB 의 옛 READ 매핑 행은 남는다 — READ ⊂ CONFIRM 이라 합집합이 CONFIRM 이다).
     *
     * <p>합집합 근거(검토 I2 확인, 2026-10-03) — 역할×객체 매핑 PK 가 (ROLE_ID, OBJECT_ID, PERMISSION_ID) 라 READ·CONFIRM 두 행이 함께 있고,
     * 판정은 행마다의 액션을 모두 더한다: mcm-core {@code UserPermCache.build} 가 {@code findByRoleIdIn} 의 매핑 전부를 돌며 액션 토큰을 한
     * {@code Set<PermKey>} 에 넣고, 서버 {@code EndpointPermissionFilter} 는 그 집합의 {@code contains}, BFF·화면은 같은 집합을 직렬화한
     * {@code toKeyStrings} 의 {@code includes} 로 본다. 버튼 목록 {@code SecUserService.getMyButtonEndpoints} 도 매핑 행마다 액션을 낸다.
     * 그래서 옛 READ 행을 CONFIRM 으로 바꾸는 UPDATE 는 두지 않는다(행을 지우지도 않는다).
     */
    private void seedMdmLayoutConfirmMenu() {
        insertMcmSecObjIfAbsent("layoutConfirm", "레이아웃 확정", "mdm");
        insertMcmSecMenuIfAbsent("layoutConfirm", "003", "5020130", "레이아웃 확정", "dmb", "layoutConfirm");
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID",     "PERMISSION_ID"},
                new String[]{"SYSADMIN", "layoutConfirm", "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'layoutConfirm', 'PERM_ALL'" + AUDIT_VALS + ")");
        seedMdmObjectRbac("layoutConfirm", "dmb");
        // 이미 시드된 headerMng·layoutMng 에도 담당자 CONFIRM 매핑을 더한다(insert-if-absent)
        seedMdmObjectRbac("headerMng", "dmb");
        seedMdmObjectRbac("layoutMng", "dmb");
        log.info("[DataInitializer] D-144 MDM 레이아웃 확정 시드 — OBJECT 1 + 메뉴 leaf 1(dmb) + RBAC, dmb 담당자 CONFIRM");
    }
}
