package com.dongkuk.dmes.mcm.init.seed;

/**
 * 위젯 분류 공통코드(WIDGET_CTG) 시드 — 2026-10-05 위젯 개선 §6.
 *
 * <p>위젯 서랍·위젯 관리의 분류가 가리키는 코드그룹. 그룹 1 + 항목 6(COMMON/PROD/QUAL/LOGI/TOOL/INFO)을
 * 없을 때만 넣는다(멱등 — 재기동해도 중복 행이 생기지 않는다).
 *
 * <p>옛 SQLite Flyway {@code V18__insert_widget_category_code} 와 같은 값이다(Oracle V1 기준선은 이 행을 넣지 않는다 —
 * 로컬 부팅 때 이 시더가 넣는다). 운영·개발계는 마스터코드 관리 화면에서 등록·수정한다(V13 시드와 같은 원칙).
 */
public final class WidgetCategoryCodeSeeder extends SeedSupport {

    public WidgetCategoryCodeSeeder(SeedSupport support) {
        super(support);
    }

    /** 그룹 1 + 항목 6 — 없을 때만 넣는다. */
    public void seedWidgetCategoryCodes() {
        insertIfAbsent(
                "TB_SEC_CODE_GROUP", "GROUP_CD", "WIDGET_CTG",
                "INSERT INTO MCMAPUSER.TB_SEC_CODE_GROUP " +
                "(GROUP_CD, GROUP_NM, GROUP_DESC, USE_YN" + AUDIT_COLS + ") " +
                "VALUES ('WIDGET_CTG', N'위젯 분류', N'위젯 서랍·위젯 관리의 위젯 분류', 'Y'" + AUDIT_VALS + ")");
        seedItem("COMMON", "공통", "공통(공지·알림·바로 가기)", 10);
        seedItem("PROD", "생산", "생산(작업·설비·실적)", 20);
        seedItem("QUAL", "품질", "품질(불량·검사)", 30);
        seedItem("LOGI", "물류", "물류(출하·재고)", 40);
        seedItem("TOOL", "도구", "도구(계산기·메모·단위)", 50);
        seedItem("INFO", "외부 정보", "외부 정보(날씨·환율)", 60);
        log.info("[DataInitializer] 위젯 분류 공통코드 시드 — WIDGET_CTG 그룹 1 + 항목 6(COMMON/PROD/QUAL/LOGI/TOOL/INFO)");
    }

    private void seedItem(String itemCd, String itemNm, String itemDesc, int sortOrd) {
        insertIfAbsentComposite(
                "TB_SEC_CODE_ITEM",
                new String[]{"GROUP_CD", "ITEM_CD"},
                new String[]{"WIDGET_CTG", itemCd},
                "INSERT INTO MCMAPUSER.TB_SEC_CODE_ITEM " +
                "(GROUP_CD, ITEM_CD, ITEM_NM, ITEM_DESC, SORT_ORD, EXTRA_VAL1, USE_YN" + AUDIT_COLS + ") " +
                "VALUES ('WIDGET_CTG', '" + itemCd + "', N'" + escapeSql(itemNm) + "', N'" + escapeSql(itemDesc) + "', " +
                sortOrd + ", '', 'Y'" + AUDIT_VALS + ")");
    }
}
