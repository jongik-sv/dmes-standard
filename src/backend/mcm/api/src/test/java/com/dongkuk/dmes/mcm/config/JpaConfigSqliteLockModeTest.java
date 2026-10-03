package com.dongkuk.dmes.mcm.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.zaxxer.hikari.HikariDataSource;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;

/**
 * 로컬 SQLite primary 풀은 트랜잭션을 BEGIN IMMEDIATE 로 연다.
 *
 * <p>DEFERRED 트랜잭션이 SELECT 로 SHARED 를 쥔 채 UPDATE 로 RESERVED 를 원할 때 다른 쪽이 RESERVED/PENDING 을 쥐고 있으면
 * SQLite 는 busy handler 를 부르지 않고 바로 SQLITE_BUSY 를 돌려준다(동시 로그인의 resetTryCnt·RevokedTokenPurger DELETE 가
 * 겹칠 때 500 → 포털 401). IMMEDIATE 면 트랜잭션 시작에서 쓰기 잠금을 기다리므로 busy_timeout 이 그 대기를 흡수한다.
 * 운영(JNDI·Oracle·PostgreSQL) URL 에는 이 속성을 붙이지 않는다.
 */
class JpaConfigSqliteLockModeTest {

    @TempDir
    Path dir;

    private DataSource dataSource(String url, String driver) {
        MockEnvironment env = new MockEnvironment().withProperty("spring.datasource.url", url);
        if (driver != null) {
            env.setProperty("spring.datasource.driver-class-name", driver);
        }
        return new JpaConfig().dataSource(env);
    }

    @Test
    void sqlite_트랜잭션은_시작에서_쓰기_잠금을_잡아_다른_연결의_쓰기_트랜잭션을_막는다() throws Exception {
        String url = "jdbc:sqlite:" + dir.resolve("mcm.db");
        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            s.execute("CREATE TABLE T (ID INTEGER)");
        }
        try (HikariDataSource ds = (HikariDataSource) dataSource(url, "org.sqlite.JDBC");
             Connection a = ds.getConnection()) {
            a.setAutoCommit(false);
            try (Statement s = a.createStatement()) {
                s.executeQuery("SELECT COUNT(*) FROM T").close();
            }
            try (Connection b = DriverManager.getConnection(url); Statement s = b.createStatement()) {
                s.execute("PRAGMA busy_timeout = 0");
                SQLException e = assertThrows(SQLException.class, () -> s.execute("BEGIN IMMEDIATE"));
                assertTrue(e.getMessage().contains("SQLITE_BUSY"), e.getMessage());
            }
            a.rollback();
        }
    }

    @Test
    void sqlite_연결의_busy_timeout_은_10초다() throws Exception {
        String url = "jdbc:sqlite:" + dir.resolve("mcm.db");
        try (HikariDataSource ds = (HikariDataSource) dataSource(url, "org.sqlite.JDBC");
             Connection c = ds.getConnection();
             Statement s = c.createStatement();
             var rs = s.executeQuery("PRAGMA busy_timeout")) {
            rs.next();
            assertEquals(10_000, rs.getInt(1));
        }
    }

    /** 드라이버 클래스는 시험 클래스패스에 없을 수 있어 넘기지 않는다 — 풀은 연결을 열기 전까지 URL 만 들고 있다. */
    @Test
    void sqlite_가_아닌_URL_에는_잠금_속성을_붙이지_않는다() {
        try (HikariDataSource ds = (HikariDataSource) dataSource("jdbc:postgresql://db:5432/mcm", null)) {
            assertTrue(ds.getDataSourceProperties().isEmpty(), ds.getDataSourceProperties().toString());
        }
        try (HikariDataSource ds = (HikariDataSource) dataSource("jdbc:oracle:thin:@db:1521/MCM", null)) {
            assertTrue(ds.getDataSourceProperties().isEmpty(), ds.getDataSourceProperties().toString());
        }
    }
}
