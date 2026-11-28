package com.dongkuk.dmes.mcm.init;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.init.seed.CoreRbacSeeder;
import com.dongkuk.dmes.mcm.init.seed.SeedSupport;
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
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 로컬 부팅 때 EMAIL 이 빈 admin 행에 예시 EMAIL 을 채우는지 — Oracle 시험 PDB(Flyway 기준선) + Hibernate 로 확인한다.
 *
 * <p>EMAIL 없이 시드된 옛 DB 의 admin 은 사용자 관리(commUserMng)의 EMAIL 필수 검증에 막혀 저장할 수 없다.
 * local 프로필(기본 폴백 포함)에서만 채우고, EMAIL 이 이미 있는 행·다른 계정·그 밖의 프로필은 그대로 둔다.
 */
class DataInitializerLocalAdminEmailTest {

    private static HikariDataSource dataSource;
    private static LocalContainerEntityManagerFactoryBean emfBean;
    private static EntityManagerFactory emf;
    private static JdbcTemplate admin;

    @BeforeAll
    static void startJpa() {
        McmOraTestDb.resetSchemas();
        dataSource = McmOraTestDb.appDataSource("mcm-local-admin-email");
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
    void seedUsersWithoutEmail() {
        admin.update("DELETE FROM TB_MCM_SEC_USER");
        admin.update("INSERT INTO TB_MCM_SEC_USER (USER_ID, USER_NM, USE_TP) VALUES ('admin', '관리자', 'Y')");
        admin.update("INSERT INTO TB_MCM_SEC_USER (USER_ID, USER_NM, USE_TP) VALUES ('u1', '사용자', 'Y')");
    }

    @Test
    @DisplayName("local 프로필 — EMAIL 이 빈 admin 에 예시 EMAIL 을 채운다")
    void localProfileFillsEmptyAdminEmail() {
        assertThat(runFill(localEnv())).isEqualTo(1);

        assertThat(email("admin")).isEqualTo(CoreRbacSeeder.ADMIN_SEED_EMAIL);
    }

    @Test
    @DisplayName("프로필 미지정(spring.profiles.default=local 폴백) — 빈 admin EMAIL 을 채운다")
    void defaultLocalFallbackFillsAdminEmail() {
        MockEnvironment env = new MockEnvironment();
        env.setDefaultProfiles("local");

        assertThat(runFill(env)).isEqualTo(1);

        assertThat(email("admin")).isEqualTo(CoreRbacSeeder.ADMIN_SEED_EMAIL);
    }

    @Test
    @DisplayName("local 프로필 — EMAIL 이 이미 있는 admin 은 바꾸지 않는다")
    void localProfileKeepsExistingAdminEmail() {
        admin.update("UPDATE TB_MCM_SEC_USER SET EMAIL = 'ops@example.org' WHERE USER_ID = 'admin'");

        assertThat(runFill(localEnv())).isZero();

        assertThat(email("admin")).isEqualTo("ops@example.org");
    }

    @Test
    @DisplayName("local 프로필 — admin 이 아닌 계정의 빈 EMAIL 은 건드리지 않는다")
    void localProfileLeavesOtherUsers() {
        runFill(localEnv());

        assertThat(email("u1")).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"local-db", "dev", "prod", "wildfly"})
    @DisplayName("local 이 아닌 프로필 — 빈 admin EMAIL 을 그대로 둔다")
    void nonLocalProfileKeepsAdminEmailEmpty(String profile) {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles(profile);

        assertThat(runFill(env)).isZero();

        assertThat(email("admin")).isNull();
    }

    // ─────────────────────────────────────────────────────────────────────

    private static MockEnvironment localEnv() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("local");
        return env;
    }

    private static int runFill(MockEnvironment env) {
        CoreRbacSeeder seeder = new CoreRbacSeeder(
                new SeedSupport(SharedEntityManagerCreator.createSharedEntityManager(emf)), null, env);
        Integer updated = new TransactionTemplate(new JpaTransactionManager(emf)).execute(s -> seeder.fillLocalAdminEmail());
        return updated == null ? 0 : updated;
    }

    private static String email(String userId) {
        return admin.queryForObject("SELECT EMAIL FROM TB_MCM_SEC_USER WHERE USER_ID = ?", String.class, userId);
    }
}
