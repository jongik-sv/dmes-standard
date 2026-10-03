package com.dongkuk.dmes.mcm.domain.security.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.cactus.autoconfigure.CactusProperties;
import com.dongkuk.dmes.cactus.security.auth.LoginRequest;
import com.dongkuk.dmes.cactus.security.auth.PasswordEncoder;
import com.dongkuk.dmes.cactus.security.jwt.JwtTokenProvider;
import com.dongkuk.dmes.cactus.security.jwt.TokenPair;
import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserPwdRepository;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import jakarta.persistence.EntityManagerFactory;

/**
 * 로컬 SQLite 에서 로그인 트랜잭션이 다른 쓰기와 겹쳐도 SQLITE_BUSY 로 실패하지 않는다.
 *
 * <p>cactus AuthService.login 은 한 트랜잭션에서 사용자를 읽고(SHARED) 비밀번호 검증 뒤 PWD_FAIL_COUNT 를 쓴다(RESERVED 승격).
 * 그사이 다른 연결(RevokedTokenPurger 의 DELETE 등)이 RESERVED 를 잡고 커밋하려고 PENDING 에 들어가면, SQLite 는 승격하려는
 * 로그인 쪽에 busy handler 없이 바로 SQLITE_BUSY 를 돌려준다(교착 회피) → 500 → 포털 401.
 * 시험은 비밀번호 검증(matches) 안에서 다른 연결이 PENDING 에 들어간 것을 확인한 뒤 로그인이 이어지게 해 그 순서를 고정한다.
 */
class McmAuthServiceSqliteLockTest {

    private static final String USER = "u1";

    @TempDir
    static Path dir;

    private AnnotationConfigApplicationContext ctx;

    @AfterEach
    void tearDown() {
        McmAuditStatementInspector.setSqlite(false);
        if (ctx != null) ctx.close();
        Ctx.matchesHook = () -> true;
    }

    private String url(String name) {
        return "jdbc:sqlite:" + dir.resolve(name);
    }

    private McmAuthService start(String dbUrl) throws SQLException {
        try (Connection c = DriverManager.getConnection(dbUrl); Statement s = c.createStatement()) {
            s.execute("CREATE TABLE TB_MCM_SEC_USER (USER_ID TEXT PRIMARY KEY, USER_NM TEXT, USER_EMP_NO TEXT, USE_TP TEXT,"
                    + " START_ACTIVE_DATE TEXT, END_ACTIVE_DATE TEXT, DEPT_CD TEXT, PWD_FAIL_COUNT INTEGER,"
                    + " U_USR_ID TEXT, U_AT TEXT, U_SVC_ID TEXT, U_PGM_ID TEXT, VER INTEGER)");
            s.execute("INSERT INTO TB_MCM_SEC_USER (USER_ID, USER_NM, USE_TP, PWD_FAIL_COUNT) VALUES ('" + USER + "', '사용자', 'Y', 2)");
            s.execute("CREATE TABLE TB_SEC_REVOKED_TOKEN (JTI TEXT)");
            s.execute("INSERT INTO TB_SEC_REVOKED_TOKEN VALUES ('old')");
        }
        Ctx.dbUrl = dbUrl;
        ctx = new AnnotationConfigApplicationContext(Ctx.class);
        return ctx.getBean(McmAuthService.class);
    }

    /** 퍼저처럼 쓰기부터 하는 다른 연결 — RESERVED 를 잡고 DELETE 한 뒤 커밋하려고 PENDING 에서 기다린다. */
    private static CompletableFuture<Void> purgerCommit(String dbUrl) {
        return CompletableFuture.runAsync(() -> {
            try (Connection c = DriverManager.getConnection(dbUrl); Statement s = c.createStatement()) {
                s.execute("PRAGMA busy_timeout = 5000");
                s.execute("BEGIN IMMEDIATE");
                s.execute("DELETE FROM TB_SEC_REVOKED_TOKEN");
                s.execute("COMMIT");
            } catch (SQLException e) {
                throw new IllegalStateException(e);
            }
        });
    }

    /** 새 읽기가 막히면(SQLITE_BUSY) 다른 연결이 PENDING 에 들어간 것이다. limitMs 안에 그렇게 되면 true. */
    private static boolean awaitPending(String dbUrl, long limitMs) {
        long end = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(limitMs);
        while (System.nanoTime() < end) {
            try (Connection c = DriverManager.getConnection(dbUrl); Statement s = c.createStatement()) {
                s.execute("PRAGMA busy_timeout = 0");
                s.executeQuery("SELECT COUNT(*) FROM TB_SEC_REVOKED_TOKEN").close();
            } catch (SQLException e) {
                if (String.valueOf(e.getMessage()).contains("SQLITE_BUSY")) return true;
                throw new IllegalStateException(e);
            }
            Thread.onSpinWait();
        }
        return false;
    }

    @Test
    void 로그인이_사용자를_읽은_뒤_다른_연결이_커밋을_기다려도_로그인과_그_쓰기가_모두_성공한다() throws Exception {
        String dbUrl = url("deadlock.db");
        McmAuthService auth = start(dbUrl);
        McmAuditStatementInspector.setSqlite(true);
        CompletableFuture<?>[] purger = new CompletableFuture<?>[1];
        Ctx.matchesHook = () -> {
            purger[0] = purgerCommit(dbUrl);
            // 고치기 전: 로그인이 SHARED 만 쥐어 퍼저가 RESERVED → PENDING 까지 간다. 고친 뒤: 로그인이 먼저 쓰기 잠금을 쥐어
            // 퍼저가 BEGIN IMMEDIATE 에서 기다리므로 PENDING 이 오지 않는다 — 시간 한도 뒤 그대로 진행한다.
            awaitPending(dbUrl, 1_500);
            return true;
        };

        Map<String, Object> result = auth.login(new LoginRequest(USER, "pw"));

        assertEquals("access", result.get("accessToken"));
        purger[0].get(10, TimeUnit.SECONDS);
        try (Connection c = DriverManager.getConnection(dbUrl); Statement s = c.createStatement()) {
            var rs = s.executeQuery("SELECT PWD_FAIL_COUNT FROM TB_MCM_SEC_USER WHERE USER_ID = '" + USER + "'");
            rs.next();
            assertEquals(0, rs.getInt(1));
            var rs2 = s.executeQuery("SELECT COUNT(*) FROM TB_SEC_REVOKED_TOKEN");
            rs2.next();
            assertEquals(0, rs2.getInt(1));
        }
    }

    @Test
    void SQLite_에서는_로그인_트랜잭션이_비밀번호_검증_전에_이미_쓰기_잠금을_쥐고_있다() throws Exception {
        String dbUrl = url("probe.db");
        McmAuthService auth = start(dbUrl);
        boolean[] writerBlocked = new boolean[1];
        Ctx.matchesHook = () -> {
            try (Connection c = DriverManager.getConnection(dbUrl); Statement s = c.createStatement()) {
                s.execute("PRAGMA busy_timeout = 0");
                s.execute("BEGIN IMMEDIATE");
                s.execute("ROLLBACK");
                writerBlocked[0] = false;
            } catch (SQLException e) {
                writerBlocked[0] = String.valueOf(e.getMessage()).contains("SQLITE_BUSY");
            }
            return true;
        };

        McmAuditStatementInspector.setSqlite(true);
        auth.login(new LoginRequest(USER, "pw"));
        assertTrue(writerBlocked[0], "SQLite: 비밀번호 검증 중에 이미 쓰기 잠금을 쥐어야 한다");

    }

    @Configuration
    @EnableTransactionManagement(proxyTargetClass = true)
    static class Ctx {
        static String dbUrl;
        static volatile BooleanSupplier matchesHook = () -> true;

        @Bean
        DataSource dataSource() {
            DriverManagerDataSource ds = new DriverManagerDataSource(dbUrl);
            ds.setDriverClassName("org.sqlite.JDBC");
            return ds;
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
            em.setDataSource(dataSource);
            em.setPersistenceUnitName("default");
            em.setPackagesToScan("com.dongkuk.dmes.mcm.domain.security.service.none");
            em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            Properties p = new Properties();
            p.put("hibernate.dialect", "org.hibernate.community.dialect.SQLiteDialect");
            p.put("hibernate.session_factory.statement_inspector", new McmAuditStatementInspector());
            em.setJpaProperties(p);
            return em;
        }

        @Bean
        PlatformTransactionManager transactionManager(EntityManagerFactory emf) {
            return new JpaTransactionManager(emf);
        }

        @Bean
        McmSecUserRepository mcmSecUserRepository() {
            SecUserPwdRepository pwd = mock(SecUserPwdRepository.class);
            when(pwd.findById(anyString())).thenReturn(Optional.empty());
            return new McmSecUserRepository(pwd);
        }

        @Bean
        McmAuthService mcmAuthService(McmSecUserRepository users) {
            JwtTokenProvider jwt = mock(JwtTokenProvider.class);
            when(jwt.generateTokenPair(any())).thenReturn(new TokenPair("access", "refresh"));
            PasswordEncoder encoder = mock(PasswordEncoder.class);
            when(encoder.matches(any(), any())).thenAnswer(inv -> matchesHook.getAsBoolean());
            SecUserMappingRepository userMap = mock(SecUserMappingRepository.class);
            return new McmAuthService(jwt, encoder, users, new CactusProperties(), userMap, mock(SecRoleGroupMappingRepository.class));
        }
    }
}
