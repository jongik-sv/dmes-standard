package com.dongkuk.dmes.mcm.init.seed;

/**
 * 공용 쿼리 분류 공통코드(USRQ_CTG) 시드 — 스펙 2026-10-10-user-query-program-design §3(미결 3, 처음 값 ETC 하나).
 *
 * <p>맞춤 레포트 관리·조회의 분류가 가리키는 코드그룹. {@link WidgetCategoryCodeSeeder} 와 같은 방식으로
 * 그룹 1 + 항목 1(ETC 기타)을 없을 때만 넣는다(멱등 — 재기동해도 중복 행이 생기지 않는다).
 * 운영·개발계는 마스터코드 관리 화면에서 등록·수정한다.
 */
public final class UserQueryCategoryCodeSeeder extends SeedSupport {

    public UserQueryCategoryCodeSeeder(SeedSupport support) {
        super(support);
    }

    /** 그룹 1 + 항목 1 — 없을 때만 넣는다. */
    public void seedUserQueryCategoryCodes() {
        insertIfAbsent(
                "TB_SEC_CODE_GROUP", "GROUP_CD", "USRQ_CTG",
                "INSERT INTO MCMAPUSER.TB_SEC_CODE_GROUP " +
                "(GROUP_CD, GROUP_NM, GROUP_DESC, USE_YN" + AUDIT_COLS + ") " +
                "VALUES ('USRQ_CTG', N'공용 쿼리 분류', N'공용 쿼리 정의·사용자 조회의 쿼리 분류', 'Y'" + AUDIT_VALS + ")");
        insertIfAbsentComposite(
                "TB_SEC_CODE_ITEM",
                new String[]{"GROUP_CD", "ITEM_CD"},
                new String[]{"USRQ_CTG", "ETC"},
                "INSERT INTO MCMAPUSER.TB_SEC_CODE_ITEM " +
                "(GROUP_CD, ITEM_CD, ITEM_NM, ITEM_DESC, SORT_ORD, EXTRA_VAL1, USE_YN" + AUDIT_COLS + ") " +
                "VALUES ('USRQ_CTG', 'ETC', N'기타', N'기타', 10, '', 'Y'" + AUDIT_VALS + ")");
        log.info("[DataInitializer] 공용 쿼리 분류 공통코드 시드 — USRQ_CTG 그룹 1 + 항목 1(ETC 기타)");
    }
}
