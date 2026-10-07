package com.dongkuk.dmes.mcm.init.seed;

import com.dongkuk.dmes.mcm.screenusage.schema.ScreenUsageMssqlDdl;

/**
 * 화면 사용 통계 원본·일별 집계 테이블 멱등 생성 단계 (MSSQL 계열, 2026-10-04 DataInitializer 분할).
 *
 * <p>mcm-core {@code ScreenUsageMssqlDdlTest} 가 이 파일에서 DDL 사용(CREATE_LOG_TABLE·CREATE_DAY_TABLE·LOG_INDEXES)을
 * 문자열로 확인한다. 호출 위치와 SQLite 분기와의 순서는 {@code DataInitializer.java} 의 run() 에서 확인한다.
 */
public final class ScreenUsageSchemaArtifacts extends SeedSupport {

    public ScreenUsageSchemaArtifacts(SeedSupport support) {
        super(support);
    }

    /**
     * 화면 사용 통계 원본·일별 집계 테이블 멱등 생성 (MSSQL 계열, 2026-10-02).
     * <p>DDL 정본은 mcm-core {@link ScreenUsageMssqlDdl} — 운영 DBA 전달본과 같은 문장이다. 두 테이블은 schema 접두가 없어
     * {@link #tableExists(String, String)}(schema 필수) 대신 기본 스키마로 해석하는 {@code OBJECT_ID(테이블)} 로 확인한다.
     * local-db 는 ddl-auto=update 가 먼저 만들 수 있으므로 인덱스도 이름으로 하나씩 확인한다.
     */
    public void initScreenUsageArtifacts() {
        if (!tableExistsInDefaultSchema(ScreenUsageMssqlDdl.LOG_TABLE)) {
            nq(ScreenUsageMssqlDdl.CREATE_LOG_TABLE).executeUpdate();
            log.info("[DataInitializer] CREATE TABLE: {}", ScreenUsageMssqlDdl.LOG_TABLE);
        }
        for (ScreenUsageMssqlDdl.IndexDdl index : ScreenUsageMssqlDdl.LOG_INDEXES) {
            if (!indexExistsInDefaultSchema(ScreenUsageMssqlDdl.LOG_TABLE, index.name())) {
                nq(index.sql()).executeUpdate();
                log.info("[DataInitializer] CREATE INDEX: {}", index.name());
            }
        }
        if (!tableExistsInDefaultSchema(ScreenUsageMssqlDdl.DAY_TABLE)) {
            nq(ScreenUsageMssqlDdl.CREATE_DAY_TABLE).executeUpdate();
            log.info("[DataInitializer] CREATE TABLE: {}", ScreenUsageMssqlDdl.DAY_TABLE);
        }
    }

    /** schema 접두 없는 테이블 존재 여부 — 접속 계정 기본 스키마로 해석 (MSSQL). */
    private boolean tableExistsInDefaultSchema(String table) {
        Number cnt = (Number) nq(
                "SELECT COUNT(*) FROM sys.objects WHERE object_id = OBJECT_ID(:name) AND type = 'U'")
                .setParameter("name", table)
                .getSingleResult();
        return cnt != null && cnt.intValue() > 0;
    }

    /** schema 접두 없는 테이블의 인덱스 존재 여부 (MSSQL). */
    private boolean indexExistsInDefaultSchema(String table, String indexName) {
        Number cnt = (Number) nq(
                "SELECT COUNT(*) FROM sys.indexes WHERE object_id = OBJECT_ID(:name) AND name = :idx")
                .setParameter("name", table)
                .setParameter("idx", indexName)
                .getSingleResult();
        return cnt != null && cnt.intValue() > 0;
    }
}
