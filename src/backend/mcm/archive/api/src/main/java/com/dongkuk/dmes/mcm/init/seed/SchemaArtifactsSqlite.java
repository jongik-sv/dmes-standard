package com.dongkuk.dmes.mcm.init.seed;

/**
 * SQLite(개발자 Mac local 단독 부팅) 전용 보강 DDL (2026-10-04 DataInitializer 분할).
 *
 * <p>대부분의 테이블은 {@code @Entity} 기준 ddl-auto=update 가 만들고, 여기서는 entity 가 없는 테이블·뷰·고유 인덱스만 만든다.
 */
public final class SchemaArtifactsSqlite extends SeedSupport {

    public SchemaArtifactsSqlite(SeedSupport support) {
        super(support);
    }

    /** SQLite(local 단독) 전용 — 화면 사용 통계 원본의 재전송 중복 방지 고유 인덱스. */
    public void createScreenUsageLogSegIndex() {
        // ddl-auto(update) 는 SQLite 에서 @UniqueConstraint 를 ALTER 로만 시도해 실패한다(2026-10-02 기동 로그 확인).
        // 재전송 중복 방지의 마지막 방어선이므로 고유 인덱스로 보강한다.
        entityManager.createNativeQuery(
                "CREATE UNIQUE INDEX IF NOT EXISTS UK_SEC_SCREEN_USAGE_LOG_SEG"
                        + " ON TB_SEC_SCREEN_USAGE_LOG (USER_ID, CLIENT_SEG_ID)").executeUpdate();
    }

    /**
     * SQLite(local 단독) 용 {@code VI_MCM_CODE_ACCESS} 뷰 멱등 생성 (2026-08-07).
     *
     * <p>MSSQL 판({@link #createOrReplaceMcmCodeAccessView()})과 컬럼 구성·JOIN 조건이 동일하며,
     * SQLite 는 schema 접두를 쓰지 않으므로({@code McmAuditStatementInspector} 가 제거) 테이블명만 남긴다.
     * {@code CREATE VIEW IF NOT EXISTS} 라 매 부팅 재실행해도 안전하다.
     */
    public void createMcmCodeAccessViewSqlite() {
        nq("CREATE VIEW IF NOT EXISTS VI_MCM_CODE_ACCESS (" +
           "  CODE_ID, CODE_NM, CATEGORY_ID, CATEGORY_NM, CODE_VAL, CODE_VAL_MEAN," +
           "  CODE_VAL_REF1, CODE_VAL_REF2, CODE_VAL_REF3, CODE_VAL_REF4, CODE_VAL_REF5," +
           "  CODE_VAL_DESC, CODE_VAL_REMARK, CODE_VER, SORT_SEQ" +
           ") AS " +
           "SELECT MASTER.CODE_ID, MASTER.CODE_NM, CATEGORY.CATEGORY_ID, CATEGORY.CATEGORY_NM," +
           "       DETAIL.CODE_VAL, DETAIL.CODE_VAL_MEAN," +
           "       DETAIL.CODE_VAL_REF1, DETAIL.CODE_VAL_REF2, DETAIL.CODE_VAL_REF3, DETAIL.CODE_VAL_REF4, DETAIL.CODE_VAL_REF5," +
           "       DETAIL.CODE_VAL_DESC, DETAIL.CODE_VAL_REMARK, DETAIL.CODE_VER, DETAIL.SORT_SEQ " +
           "  FROM TB_MCM_CODE_MASTER MASTER, TB_MCM_CODE_CATEGORY CATEGORY, TB_MCM_CODE_DETAIL DETAIL " +
           " WHERE MASTER.USE_TP = 'Y'" +
           "   AND MASTER.MASTER_CODE = CATEGORY.MASTER_CODE" +
           "   AND MASTER.MASTER_CODE = DETAIL.MASTER_CODE" +
           "   AND CATEGORY.CATEGORY_ID = DETAIL.CATEGORY_ID")
                .executeUpdate();
        log.info("[DataInitializer] SQLite VI_MCM_CODE_ACCESS 뷰 멱등 생성 (masterCodeSelPop 조회용)");
    }

    /**
     * SQLite(local 단독) 전용 — entity 미보유 {@code TB_MCM_SEC_MENU_FLD} 보강 생성.
     * <p>그 외 SEC/메뉴 테이블은 {@code @Entity} 가 있어 Hibernate ddl-auto=update 가 SQLite 에 자동 생성하지만,
     * 본 테이블만 entity 가 없어 MSSQL native DDL({@code createTbMcmSecMenuFldStubIfAbsent})에 의존한다. SQLite 에서는
     * 그 native DDL 이 skip 되므로 여기서 SQLite 호환 DDL 로 직접 생성한다(MSSQL owner DDL 과 동일 컬럼 집합 — stub 5 + upgrade 4).
     */
    public void createSecMenuFldForSqlite() {
        entityManager.createNativeQuery(
                "CREATE TABLE IF NOT EXISTS TB_MCM_SEC_MENU_FLD (" +
                "  MENU_ID         VARCHAR(30)  NOT NULL," +
                "  MENU_SEQ        VARCHAR(30)," +
                "  MENU_NM         VARCHAR(100)," +
                "  PARENT_MENU_ID  VARCHAR(30)," +
                "  BIZ_SYSTEM_CODE VARCHAR(10)," +
                "  FULL_SEQ        NUMERIC(10,0)," +
                "  USE_TP          VARCHAR(1)," +
                "  MENU_TP         VARCHAR(20)," +
                "  MENU_VIEW_YN    VARCHAR(1)," +
                "  CONSTRAINT PK_TB_MCM_SEC_MENU_FLD PRIMARY KEY (MENU_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] SQLite — TB_MCM_SEC_MENU_FLD 보강 생성 (entity 미보유 테이블)");
    }
}
