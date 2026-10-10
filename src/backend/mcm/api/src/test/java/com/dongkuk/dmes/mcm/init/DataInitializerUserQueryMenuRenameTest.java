package com.dongkuk.dmes.mcm.init;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.security.auth.PasswordEncoder;
import com.dongkuk.dmes.mcm.common.audit.SecurityIdentityHolder;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.repository.RuleMasterRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
import com.dongkuk.dmes.mcm.testdb.McmOraTestDb;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.SharedEntityManagerCreator;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 맞춤 레포트 메뉴 이름·위치 보정(ModuleMenuSeeder#renameUserQueryMenus, CoreRbacSeeder PERM_USRQ_USE) —
 * 옛 이름·옛 위치로 이미 시드된 DB 를 부팅 시드가 새 값으로 맞추는지, 사용자가 직접 바꾼 값은 보존하는지 확인한다(2026-10-10).
 *
 * <p>구성은 {@link DataInitializerSeedFingerprintTest} 와 같다. 한 번 시드한 뒤 JDBC 로 행을 「옛 시드 값」으로 되돌리고
 * 다시 {@link DataInitializer#run} 을 돌린다(재실행 멱등 확인을 겸한다).
 */
class DataInitializerUserQueryMenuRenameTest {

    private static HikariDataSource dataSource;
    private static LocalContainerEntityManagerFactoryBean emfBean;
    private static EntityManagerFactory emf;
    private static EntityManager sharedEm;
    private static SecurityIdentity prevIdentity;
    private static SecurityContext prevSecurityContext;

    @BeforeAll
    static void startJpa() {
        prevIdentity = SecurityIdentityHolder.get();
        prevSecurityContext = SecurityContextHolder.getContext();
        SecurityIdentityHolder.set(null);
        SecurityContextHolder.clearContext();

        McmOraTestDb.resetSchemas();
        dataSource = McmOraTestDb.appDataSource("mcm-userq-menu-rename");
        emfBean = new LocalContainerEntityManagerFactoryBean();
        emfBean.setDataSource(dataSource);
        emfBean.setJpaVendorAdapter(new org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter());
        emfBean.setJpaProperties(McmOraTestDb.jpaProperties(Map.of("hibernate.show_sql", "false")));
        emfBean.setPersistenceUnitName("default");
        emfBean.setPackagesToScan(
                "com.dongkuk.dmes.cactus.security.auth",
                "com.dongkuk.dmes.cactus.mastercode",
                "com.dongkuk.dmes.mcm");
        emfBean.setPersistenceProviderClass(org.hibernate.jpa.HibernatePersistenceProvider.class);
        emfBean.afterPropertiesSet();
        emf = emfBean.getObject();
        sharedEm = SharedEntityManagerCreator.createSharedEntityManager(emf);
    }

    @AfterAll
    static void stopJpa() {
        SecurityIdentityHolder.set(prevIdentity);
        SecurityContextHolder.setContext(prevSecurityContext);
        if (emfBean != null) emfBean.destroy();
        if (dataSource != null) dataSource.close();
    }

    @Test
    @DisplayName("옛 이름·옛 위치(csa) 로 시드된 맞춤 레포트 메뉴를 새 이름·cmq 아래로 옮기고, 직접 바꾼 이름은 보존한다")
    void renamesOldSeedRowsAndKeepsUserEdits() {
        runSeed();
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        // 새 DB — 처음부터 새 값이다.
        assertThat(jdbc.queryForObject("SELECT MENU_NM FROM TB_MCM_SEC_MENU_FLD WHERE MENU_ID = 'cmq'", String.class))
                .isEqualTo("맞춤 레포트");
        assertThat(menu(jdbc, "userQuery")).isEqualTo("맞춤 레포트 조회/cmq/00000001");
        assertThat(menu(jdbc, "userQueryMng")).isEqualTo("맞춤 레포트 관리/cmq/00000002");

        // 옛 시드 상태로 되돌린다 — 조회 leaf 이름은 사용자가 바꾼 값으로 둔다.
        jdbc.update("UPDATE TB_MCM_SEC_MENU_FLD SET MENU_NM = '공용 조회' WHERE MENU_ID = 'cmq'");
        jdbc.update("UPDATE TB_MCM_SEC_OBJ SET OBJECT_NM = '공용 쿼리 조회' WHERE OBJECT_ID = 'userQuery'");
        jdbc.update("UPDATE TB_MCM_SEC_OBJ SET OBJECT_NM = '쿼리 정의 관리' WHERE OBJECT_ID = 'userQueryMng'");
        jdbc.update("UPDATE TB_MCM_SEC_MENU SET MENU_NM = '내가 바꾼 이름' WHERE MENU_ID = 'userQuery'");
        jdbc.update("UPDATE TB_MCM_SEC_MENU SET MENU_NM = '쿼리 정의 관리', PARENT_MENU_ID = 'csa', MENU_SEQ = '00000001' WHERE MENU_ID = 'userQueryMng'");
        jdbc.update("UPDATE TB_MCM_SEC_PERM SET PERMISSION_NM = '공용 쿼리 사용', PERMISSION_DESC = '공용 쿼리 조회 화면 실행' WHERE PERMISSION_ID = 'PERM_USRQ_USE'");

        runSeed();

        assertThat(jdbc.queryForObject("SELECT MENU_NM FROM TB_MCM_SEC_MENU_FLD WHERE MENU_ID = 'cmq'", String.class))
                .isEqualTo("맞춤 레포트");
        assertThat(jdbc.queryForObject("SELECT OBJECT_NM FROM TB_MCM_SEC_OBJ WHERE OBJECT_ID = 'userQuery'", String.class))
                .isEqualTo("맞춤 레포트 조회");
        assertThat(jdbc.queryForObject("SELECT OBJECT_NM FROM TB_MCM_SEC_OBJ WHERE OBJECT_ID = 'userQueryMng'", String.class))
                .isEqualTo("맞춤 레포트 관리");
        assertThat(menu(jdbc, "userQuery")).isEqualTo("내가 바꾼 이름/cmq/00000001"); // 사용자가 바꾼 이름은 그대로
        assertThat(menu(jdbc, "userQueryMng")).isEqualTo("맞춤 레포트 관리/cmq/00000002");
        assertThat(jdbc.queryForObject(
                "SELECT PERMISSION_NM || '/' || PERMISSION_DESC FROM TB_MCM_SEC_PERM WHERE PERMISSION_ID = 'PERM_USRQ_USE'", String.class))
                .isEqualTo("맞춤 레포트 사용/맞춤 레포트 조회 화면 실행");

        // 부모가 이미 cmq 이면 순서를 바꾼 사용자 편집을 건드리지 않는다.
        jdbc.update("UPDATE TB_MCM_SEC_MENU SET MENU_SEQ = '00000009' WHERE MENU_ID = 'userQueryMng'");
        runSeed();
        assertThat(menu(jdbc, "userQueryMng")).isEqualTo("맞춤 레포트 관리/cmq/00000009");
    }

    private static String menu(JdbcTemplate jdbc, String menuId) {
        return jdbc.queryForObject(
                "SELECT MENU_NM || '/' || PARENT_MENU_ID || '/' || MENU_SEQ FROM TB_MCM_SEC_MENU WHERE MENU_ID = ?",
                String.class, menuId);
    }

    private static void runSeed() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("local");
        DataInitializer initializer = new DataInitializer(new PasswordEncoder() {
            @Override
            public String encode(String rawPassword) {
                return "{stub}fixed";
            }
        }, env);
        SecMenuNativeRepository secMenuNativeRepository = new SecMenuNativeRepository();
        ReflectionTestUtils.setField(secMenuNativeRepository, "entityManager", sharedEm);
        ReflectionTestUtils.setField(initializer, "entityManager", sharedEm);
        ReflectionTestUtils.setField(initializer, "secMenuNativeRepository", secMenuNativeRepository);
        ReflectionTestUtils.setField(initializer, "ruleMasterRepository",
                new JpaRepositoryFactory(sharedEm).getRepository(RuleMasterRepository.class));
        ReflectionTestUtils.setField(initializer, "initEnabled", true);
        new TransactionTemplate(new JpaTransactionManager(emf)).executeWithoutResult(s -> initializer.run(null));
    }
}
