package com.dongkuk.dmes.mcm.config;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * primary EMF 방언이 SQLite 일 때만 isSqlite 를 켠다 — 감사 SQL 치환과 로그인 SQLITE_BUSY 재시도(SqliteBusyRetry)가
 * 이 값에 걸려 있으므로, 운영 방언(Oracle·PostgreSQL)에서는 꺼진 채여야 한다.
 */
class JpaConfigSqliteFlagTest {

    @AfterEach
    void tearDown() {
        McmAuditStatementInspector.setSqlite(false);
    }

    @ParameterizedTest
    @ValueSource(strings = {"org.hibernate.dialect.OracleDialect", "org.hibernate.dialect.PostgreSQLDialect", ""})
    void 운영_방언이면_isSqlite_는_꺼진_채다(String dialect) {
        McmAuditStatementInspector.setSqlite(false);
        new JpaConfig().entityManagerFactory(mock(DataSource.class), dialect, "none", false);
        assertFalse(McmAuditStatementInspector.isSqlite());
    }

    @Test
    void SQLite_방언이면_isSqlite_를_켠다() {
        new JpaConfig().entityManagerFactory(mock(DataSource.class), "org.hibernate.community.dialect.SQLiteDialect", "none", false);
        assertTrue(McmAuditStatementInspector.isSqlite());
    }
}
