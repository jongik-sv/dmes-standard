package com.dongkuk.dmes.mcm.init.seed;

/**
 * 공용 쿼리 분류 공통코드(USRQ_CTG) 시드 — 스펙 2026-10-10-custom-report-v2-design §5(1차 스펙 미결 3 의 ETC 하나를 9개로 확장).
 *
 * <p>맞춤 레포트 관리·조회의 분류가 가리키는 코드그룹. {@link WidgetCategoryCodeSeeder} 와 같은 방식으로
 * 그룹 1 + 항목 9개를 없을 때만 넣는다(멱등 — 재기동해도 중복 행이 생기지 않는다). 항목 이름은 WIDGET_CTG 와 맞춘다.
 * 1차 시드가 넣은 ETC 는 SORT_ORD=10·이름 「기타」 그대로일 때만 90 으로 옮긴다(사용자가 바꾼 값은 둔다).
 * 운영·개발계는 마스터코드 관리 화면에서 등록·수정한다.
 */
public final class UserQueryCategoryCodeSeeder extends SeedSupport {

    /** ITEM_CD, 이름, SORT_ORD. */
    private static final Object[][] ITEMS = {
            {"PROD", "생산", 10}, {"QUAL", "품질", 20}, {"LOGI", "물류·출하", 30}, {"EQP", "설비", 40}, {"MATL", "자재", 50},
            {"COMMON", "공통", 60}, {"SYS", "시스템 관리", 70}, {"SAMPLE", "견본", 80}, {"ETC", "기타", 90},
    };

    public UserQueryCategoryCodeSeeder(SeedSupport support) {
        super(support);
    }

    /** 그룹 1 + 항목 9개 — 없을 때만 넣는다. */
    public void seedUserQueryCategoryCodes() {
        insertIfAbsent(
                "TB_SEC_CODE_GROUP", "GROUP_CD", "USRQ_CTG",
                "INSERT INTO MCMAPUSER.TB_SEC_CODE_GROUP " +
                "(GROUP_CD, GROUP_NM, GROUP_DESC, USE_YN" + AUDIT_COLS + ") " +
                "VALUES ('USRQ_CTG', N'공용 쿼리 분류', N'공용 쿼리 정의·사용자 조회의 쿼리 분류', 'Y'" + AUDIT_VALS + ")");
        // 1차 시드의 ETC(정렬 10) 를 먼저 옮긴다 — 사용자가 이름이나 정렬을 바꿨으면 조건이 맞지 않아 그대로 둔다.
        nq("UPDATE MCMAPUSER.TB_SEC_CODE_ITEM SET SORT_ORD = 90 " +
                "WHERE GROUP_CD = 'USRQ_CTG' AND ITEM_CD = 'ETC' AND SORT_ORD = 10 AND ITEM_NM = N'기타'").executeUpdate();
        for (Object[] item : ITEMS) {
            String code = (String) item[0];
            insertIfAbsentComposite(
                    "TB_SEC_CODE_ITEM",
                    new String[]{"GROUP_CD", "ITEM_CD"},
                    new String[]{"USRQ_CTG", code},
                    "INSERT INTO MCMAPUSER.TB_SEC_CODE_ITEM " +
                    "(GROUP_CD, ITEM_CD, ITEM_NM, ITEM_DESC, SORT_ORD, EXTRA_VAL1, USE_YN" + AUDIT_COLS + ") " +
                    "VALUES ('USRQ_CTG', '" + code + "', N'" + item[1] + "', N'" + item[1] + "', " + item[2] + ", '', 'Y'"
                            + AUDIT_VALS + ")");
        }
        log.info("[DataInitializer] 공용 쿼리 분류 공통코드 시드 — USRQ_CTG 그룹 1 + 항목 {}개", ITEMS.length);
    }
}
