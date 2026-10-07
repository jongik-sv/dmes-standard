package com.dongkuk.dmes.mcm.screenusage.schema;

import java.util.ArrayList;
import java.util.List;

/**
 * 화면 사용 통계 테이블 MSSQL DDL 정본 (설계 4.6). mcm/api DataInitializer(local-db 등 MSSQL 계열 멱등 생성)와
 * 운영 DBA 전달본이 같은 문장을 쓴다. 감사 계열처럼 schema 접두가 없다 — 접속 계정의 기본 스키마에 만든다.
 * 컬럼·제약·인덱스 이름은 엔티티 {@code ScreenUsageLog}/{@code ScreenUsageDay} 매핑과 같다(ScreenUsageMssqlDdlTest — archive/test).
 *
 * @deprecated Oracle 단일화(oracle-1007). 표 정본은 Flyway 기준선
 *     {@code db/migration/oracle/mcmapuser/V1__baseline.sql} 이다. mcm/api ScreenUsageSchemaArtifacts 호출을
 *     ora-mcm-app 이 없앤 뒤 ora-base b8 에서 지운다.
 */
@Deprecated
public final class ScreenUsageMssqlDdl {

    public static final String LOG_TABLE = "TB_SEC_SCREEN_USAGE_LOG";
    public static final String DAY_TABLE = "TB_SEC_SCREEN_USAGE_DAY";

    public static final String CREATE_LOG_TABLE = """
            CREATE TABLE TB_SEC_SCREEN_USAGE_LOG (
                USAGE_ID      VARCHAR(36)  NOT NULL,
                USER_ID       VARCHAR(50)  NOT NULL,
                DEPT_CD       VARCHAR(10)  NULL,
                PAGE_ID       VARCHAR(200) NOT NULL,
                START_KIND    VARCHAR(10)  NOT NULL,
                STARTED_AT    DATETIME2    NOT NULL,
                ENDED_AT      DATETIME2    NOT NULL,
                DURATION_MS   BIGINT       NOT NULL,
                CLIENT_SEG_ID VARCHAR(36)  NOT NULL,
                CLIENT_IP     VARCHAR(45)  NULL,
                RECEIVED_AT   DATETIME2    NOT NULL,
                CONSTRAINT PK_SEC_SCREEN_USAGE_LOG PRIMARY KEY (USAGE_ID),
                CONSTRAINT UK_SEC_SCREEN_USAGE_LOG_SEG UNIQUE (USER_ID, CLIENT_SEG_ID)
            )""";

    public static final List<IndexDdl> LOG_INDEXES = List.of(
            new IndexDdl("IX_SEC_SCREEN_USAGE_LOG_STARTED",
                    "CREATE INDEX IX_SEC_SCREEN_USAGE_LOG_STARTED ON TB_SEC_SCREEN_USAGE_LOG (STARTED_AT)"),
            new IndexDdl("IX_SEC_SCREEN_USAGE_LOG_USER",
                    "CREATE INDEX IX_SEC_SCREEN_USAGE_LOG_USER ON TB_SEC_SCREEN_USAGE_LOG (USER_ID, STARTED_AT)"),
            new IndexDdl("IX_SEC_SCREEN_USAGE_LOG_PAGE",
                    "CREATE INDEX IX_SEC_SCREEN_USAGE_LOG_PAGE ON TB_SEC_SCREEN_USAGE_LOG (PAGE_ID, STARTED_AT)"));

    public static final String CREATE_DAY_TABLE = """
            CREATE TABLE TB_SEC_SCREEN_USAGE_DAY (
                USAGE_DT    CHAR(8)      NOT NULL,
                PAGE_ID     VARCHAR(200) NOT NULL,
                USER_ID     VARCHAR(50)  NOT NULL,
                DEPT_CD     VARCHAR(10)  NOT NULL,
                OPEN_CNT    INT          NOT NULL,
                SEG_CNT     INT          NOT NULL,
                DURATION_MS BIGINT       NOT NULL,
                CONSTRAINT PK_SEC_SCREEN_USAGE_DAY PRIMARY KEY (USAGE_DT, PAGE_ID, USER_ID, DEPT_CD)
            )""";

    public record IndexDdl(String name, String sql) {}

    private ScreenUsageMssqlDdl() {}

    /** DBA 전달·테스트 실행 순서: 원본 테이블 → 원본 인덱스 3개 → 일별 집계 테이블. */
    public static List<String> allStatements() {
        List<String> out = new ArrayList<>();
        out.add(CREATE_LOG_TABLE);
        for (IndexDdl index : LOG_INDEXES) {
            out.add(index.sql());
        }
        out.add(CREATE_DAY_TABLE);
        return List.copyOf(out);
    }
}
