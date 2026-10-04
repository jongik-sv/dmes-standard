package com.dongkuk.dmes.cactus.datasource;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link DialectDetector} 특성 테스트 — JDBC URL·드라이버 이름으로 cactus dialect 를 추정하는 현재 규칙.
 */
class DialectDetectorTest {

    @Test
    void sqlserver_URL은_mssql이다() {
        assertThat(DialectDetector.detect("jdbc:sqlserver://host:1433;databaseName=X", null)).isEqualTo("mssql");
        assertThat(DialectDetector.detect("jdbc:jtds:sqlserver://host/X", null)).isEqualTo("mssql");
    }

    @Test
    void URL은_대소문자를_가리지_않는다() {
        assertThat(DialectDetector.detect("JDBC:SQLSERVER://host", null)).isEqualTo("mssql");
        assertThat(DialectDetector.detect("JDBC:SQLITE:/tmp/a.db", null)).isEqualTo("sqlite");
    }

    @Test
    void 드라이버_이름에_sqlserver나_jtds가_있으면_mssql이다() {
        assertThat(DialectDetector.detect(null, "com.microsoft.sqlserver.jdbc.SQLServerDriver")).isEqualTo("mssql");
        assertThat(DialectDetector.detect(null, "net.sourceforge.jtds.jdbc.Driver")).isEqualTo("mssql");
    }

    @Test
    void sqlite_URL이나_드라이버는_sqlite다() {
        assertThat(DialectDetector.detect("jdbc:sqlite:../data/mcm.db", null)).isEqualTo("sqlite");
        assertThat(DialectDetector.detect(null, "org.sqlite.JDBC")).isEqualTo("sqlite");
    }

    @Test
    void mssql_판정이_sqlite보다_먼저다() {
        assertThat(DialectDetector.detect("jdbc:sqlite:a.db", "com.microsoft.sqlserver.jdbc.SQLServerDriver"))
                .isEqualTo("mssql");
    }

    @Test
    void 오라클과_PostgreSQL은_none이다() {
        assertThat(DialectDetector.detect("jdbc:oracle:thin:@host:1521:ORCL", "oracle.jdbc.OracleDriver"))
                .isEqualTo("none");
        assertThat(DialectDetector.detect("jdbc:postgresql://host/db", "org.postgresql.Driver"))
                .isEqualTo("none");
    }

    @Test
    void 둘_다_null이면_none이다() {
        assertThat(DialectDetector.detect(null, null)).isEqualTo("none");
    }

    @Test
    void jtds_드라이버면_sybase_URL이어도_mssql로_본다() {
        // 현재 동작: 드라이버 이름의 "jtds" 만 보고 판정 — URL 이 jdbc:jtds:sybase 여도 mssql.
        assertThat(DialectDetector.detect("jdbc:jtds:sybase://host/db", "net.sourceforge.jtds.jdbc.Driver"))
                .isEqualTo("mssql");
    }
}
