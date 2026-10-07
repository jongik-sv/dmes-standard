package com.dongkuk.dmes.mcm.init.seed;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.testdb.McmOraTestDb;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.SharedEntityManagerCreator;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * {@link McmMenuSeeder#normalizeSecMenuCharColumns()} 가 Oracle 에서 NULL·공백만 든 코드 칸을 기본값으로 보정하는지
 * (2026-10-07 oracle-1007). Oracle 은 {@code ''} 를 NULL 로 다뤄 옛 조건 {@code LTRIM(RTRIM(c)) = ''} 는 공백만 든 값(' ')을 놓쳤다.
 */
class McmMenuSeederNormalizeTest {

    private static HikariDataSource dataSource;
    private static LocalContainerEntityManagerFactoryBean emfBean;
    private static EntityManagerFactory emf;
    private static JdbcTemplate jdbc;

    @BeforeAll
    static void startJpa() {
        McmOraTestDb.resetSchemas();
        dataSource = McmOraTestDb.appDataSource("mcm-menu-normalize");
        // 보정은 네이티브 SQL 이라 엔티티는 EMF 를 세우는 데 쓸 하나면 된다.
        emfBean = McmOraTestDb.entityManagerFactory(dataSource, "default", SecUser.class.getName());
        emfBean.afterPropertiesSet();
        emf = emfBean.getObject();
        jdbc = new JdbcTemplate(dataSource);
    }

    @AfterAll
    static void stopJpa() {
        if (emfBean != null) emfBean.destroy();
        if (dataSource != null) dataSource.close();
    }

    @Test
    @DisplayName("USE_TP·MENU_VIEW_YN·MENU_TP 가 NULL 이거나 공백만 들었으면 Y·Y·WEB 로 보정하고, 값이 있는 행은 그대로 둔다")
    void normalizesNullAndBlankCodeColumns() {
        jdbc.update("DELETE FROM TB_MCM_SEC_MENU WHERE MENU_ID LIKE 'NRM%'");
        jdbc.update("INSERT INTO TB_MCM_SEC_MENU (MENU_ID, USE_TP, MENU_VIEW_YN, MENU_TP) VALUES ('NRM_BLANK', ' ', ' ', '   ')");
        jdbc.update("INSERT INTO TB_MCM_SEC_MENU (MENU_ID, USE_TP, MENU_VIEW_YN, MENU_TP) VALUES ('NRM_NULL', NULL, NULL, NULL)");
        jdbc.update("INSERT INTO TB_MCM_SEC_MENU (MENU_ID, USE_TP, MENU_VIEW_YN, MENU_TP) VALUES ('NRM_SET', 'N', 'N', 'POP')");

        new TransactionTemplate(new JpaTransactionManager(emf)).executeWithoutResult(s ->
                new McmMenuSeeder(new SeedSupport(SharedEntityManagerCreator.createSharedEntityManager(emf)))
                        .normalizeSecMenuCharColumns());

        assertThat(codes("NRM_BLANK")).isEqualTo("Y/Y/WEB");
        assertThat(codes("NRM_NULL")).isEqualTo("Y/Y/WEB");
        assertThat(codes("NRM_SET")).isEqualTo("N/N/POP");
    }

    private static String codes(String menuId) {
        return jdbc.queryForObject("SELECT USE_TP || '/' || MENU_VIEW_YN || '/' || MENU_TP FROM TB_MCM_SEC_MENU WHERE MENU_ID = ?",
                String.class, menuId);
    }
}
