package com.dongkuk.dmes.mcm.init;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.security.auth.PasswordEncoder;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.testdb.McmOraTestDb;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.SharedEntityManagerCreator;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 로컬 부팅 때 admin 의 로그인 잠금(PWD_FAIL_COUNT·USE_TP='N')을 푸는지 — Oracle 시험 PDB(Flyway 기준선) + Hibernate 로 확인한다.
 *
 * <p>로그인 실패 기록이 실제로 커밋되면서(AuthService noRollbackFor) 공용 로컬 DB 의 admin 이 잠기면 재기동으로도 풀리지 않아
 * admin 으로 로그인하는 e2e 전체가 막힌다. local 프로필(기본 폴백 포함)에서만 풀고, 그 밖의 프로필과 다른 계정은 그대로 둔다.
 */
class DataInitializerLocalAdminUnlockTest {

    private static HikariDataSource dataSource;
    private static LocalContainerEntityManagerFactoryBean emfBean;
    private static EntityManagerFactory emf;
    private static JdbcTemplate admin;

    @BeforeAll
    static void startJpa() {
        McmOraTestDb.resetSchemas();
        dataSource = McmOraTestDb.appDataSource("mcm-local-admin-unlock");
        emfBean = McmOraTestDb.entityManagerFactory(dataSource, "default", SecUser.class.getName());
        emfBean.afterPropertiesSet();
        emf = emfBean.getObject();
        admin = new JdbcTemplate(dataSource);
    }

    @AfterAll
    static void stopJpa() {
        if (emfBean != null) emfBean.destroy();
        if (dataSource != null) dataSource.close();
    }

    @BeforeEach
    void seedLockedUsers() {
        admin.update("DELETE FROM TB_MCM_SEC_USER");
        admin.update("INSERT INTO TB_MCM_SEC_USER (USER_ID, USER_NM, USE_TP, PWD_FAIL_COUNT) VALUES ('admin', '관리자', 'N', 5)");
        admin.update("INSERT INTO TB_MCM_SEC_USER (USER_ID, USER_NM, USE_TP, PWD_FAIL_COUNT) VALUES ('u1', '사용자', 'N', 5)");
    }

    @Test
    @DisplayName("local 프로필 — 잠긴 admin(횟수 5, USE_TP 'N')을 부팅 때 횟수 0·USE_TP 'Y' 로 되돌린다")
    void localProfileUnlocksAdmin() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("local");

        assertThat(runUnlock(env)).isEqualTo(1);

        assertThat(state("admin")).isEqualTo("Y/0");
    }

    @Test
    @DisplayName("프로필 미지정(spring.profiles.default=local 폴백) — admin 잠금을 푼다")
    void defaultLocalFallbackUnlocksAdmin() {
        MockEnvironment env = new MockEnvironment();
        env.setDefaultProfiles("local");

        runUnlock(env);

        assertThat(state("admin")).isEqualTo("Y/0");
    }

    @Test
    @DisplayName("local 프로필 — admin 이 아닌 잠긴 계정은 건드리지 않는다")
    void localProfileLeavesOtherUsersLocked() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("local");

        runUnlock(env);

        assertThat(state("u1")).isEqualTo("N/5");
    }

    @ParameterizedTest
    // "local-db"(2026-10-07 archive 한 옛 프로필) 는 이름이 local 로 시작해도 local 로 보지 않는지 함께 본다.
    @ValueSource(strings = {"local-db", "dev", "prod", "wildfly"})
    @DisplayName("local 이 아닌 프로필 — 잠긴 admin 을 그대로 둔다")
    void nonLocalProfileKeepsAdminLocked(String profile) {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles(profile);

        assertThat(runUnlock(env)).isZero();

        assertThat(state("admin")).isEqualTo("N/5");
    }

    // ─────────────────────────────────────────────────────────────────────

    private static int runUnlock(MockEnvironment env) {
        DataInitializer initializer = new DataInitializer(new PasswordEncoder(), env);
        ReflectionTestUtils.setField(initializer, "entityManager", SharedEntityManagerCreator.createSharedEntityManager(emf));
        Integer updated = new TransactionTemplate(new JpaTransactionManager(emf)).execute(s -> initializer.unlockLocalAdmin());
        return updated == null ? 0 : updated;
    }

    private static String state(String userId) {
        return admin.queryForObject(
                "SELECT USE_TP || '/' || PWD_FAIL_COUNT FROM TB_MCM_SEC_USER WHERE USER_ID = ?", String.class, userId);
    }
}
