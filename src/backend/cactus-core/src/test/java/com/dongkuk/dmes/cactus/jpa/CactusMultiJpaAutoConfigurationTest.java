package com.dongkuk.dmes.cactus.jpa;

import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.orm.jpa.JpaTransactionManager;

import javax.sql.DataSource;
import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * {@link CactusMultiJpaAutoConfiguration} 특성 테스트 — jpa.extras 마다 등록되는 EMF·JpaTxMgr 빈 정의와
 * EMF 를 실제로 만들 때 넣는 Hibernate 속성.
 *
 * <p>EMF 생성은 접속을 던지는 mock DataSource 와 명시 dialect + JDBC 메타데이터 조회 끔으로 DB 없이 한다.
 */
class CactusMultiJpaAutoConfigurationTest {

    private static DefaultListableBeanFactory process(String... props) {
        MockEnvironment env = new MockEnvironment();
        for (String p : props) {
            int eq = p.indexOf('=');
            env.setProperty(p.substring(0, eq), p.substring(eq + 1));
        }
        CactusMultiJpaAutoConfiguration cfg = new CactusMultiJpaAutoConfiguration();
        DefaultListableBeanFactory registry = new DefaultListableBeanFactory();
        cfg.setEnvironment(env);
        cfg.setBeanFactory(registry);
        cfg.postProcessBeanDefinitionRegistry(registry);
        return registry;
    }

    private static DataSource unreachableDataSource() throws SQLException {
        DataSource ds = mock(DataSource.class);
        when(ds.getConnection()).thenThrow(new SQLException("시험용 — 접속 없음"));
        return ds;
    }

    @Test
    void jpa_extras가_없으면_아무것도_등록하지_않는다() {
        assertThat(process("cactus.datasource.extras.cmn.url=jdbc:test:cmn").getBeanDefinitionNames()).isEmpty();
    }

    @Test
    void jpa_extras마다_EMF와_JpaTxMgr_빈_정의를_등록한다() {
        DefaultListableBeanFactory registry = process(
                "cactus.jpa.extras.cmn.packages-to-scan=com.example.cmn",
                "cactus.jpa.extras.if.packages-to-scan=com.example.if");

        // MockEnvironment 는 프로퍼티 순서를 지키지 않아 순서는 보지 않는다 (yml 이면 선언 순서)
        assertThat(registry.getBeanDefinitionNames()).containsExactlyInAnyOrder(
                "cactusEntityManagerFactoryCmn", "cactusTransactionManagerCmn",
                "cactusEntityManagerFactoryIf", "cactusTransactionManagerIf");

        BeanDefinition emf = registry.getBeanDefinition("cactusEntityManagerFactoryCmn");
        assertThat(emf.getBeanClassName()).isEqualTo(EntityManagerFactory.class.getName());
        assertThat(emf.getDestroyMethodName()).isEqualTo("close");
        assertThat(emf.isPrimary()).isFalse();

        BeanDefinition tx = registry.getBeanDefinition("cactusTransactionManagerCmn");
        assertThat(tx.getBeanClassName()).isEqualTo(JpaTransactionManager.class.getName());
        assertThat(tx.isPrimary()).isFalse();
        // DataSource alias 나 TxMgr alias 는 본 자동설정이 붙이지 않는다
        assertThat(registry.getAliases("cactusTransactionManagerCmn")).isEmpty();
    }

    @Test
    void EMF는_같은_key의_DataSource로_만들고_네이밍_전략_인스턴스와_hibernate_속성을_넣는다() throws Exception {
        DefaultListableBeanFactory registry = process(
                "cactus.jpa.table-prefix=tb_cmn_",
                "cactus.jpa.implicit-naming.enabled=true",
                "cactus.jpa.extras.cmn.hibernate.dialect=org.hibernate.dialect.H2Dialect",
                "cactus.jpa.extras.cmn.hibernate.show-sql=true",
                "cactus.jpa.extras.cmn.hibernate.properties.[hibernate.boot.allow_jdbc_metadata_access]=false");
        registry.registerSingleton("cmn", unreachableDataSource());

        EntityManagerFactory emf = registry.getBean("cactusEntityManagerFactoryCmn", EntityManagerFactory.class);
        try {
            assertThat(emf.getProperties())
                    .containsEntry("hibernate.dialect", "org.hibernate.dialect.H2Dialect")
                    .containsEntry("hibernate.hbm2ddl.auto", "none")
                    .containsEntry("hibernate.show_sql", "true")
                    .containsEntry("hibernate.boot.allow_jdbc_metadata_access", "false");
            assertThat(emf.getProperties().get("hibernate.physical_naming_strategy"))
                    .isExactlyInstanceOf(PrefixedSnakePhysicalNamingStrategy.class);
            assertThat(emf.getProperties().get("hibernate.implicit_naming_strategy"))
                    .isExactlyInstanceOf(CactusImplicitNamingStrategy.class);
            // packages-to-scan 이 비어도 엔티티 0개 유닛을 "cactus-{key}" 이름으로 만든다
            assertThat(emf.getProperties()).containsEntry("hibernate.persistenceUnitName", "cactus-cmn");
            assertThat(emf.getMetamodel().getEntities()).isEmpty();

            JpaTransactionManager tx = registry.getBean("cactusTransactionManagerCmn", JpaTransactionManager.class);
            assertThat(tx.getEntityManagerFactory()).isSameAs(emf);
        } finally {
            emf.close();
        }
    }

    @Test
    void prefix가_없으면_Snake_전략을_넣고_snake를_끄면_넣지_않는다() throws Exception {
        DefaultListableBeanFactory snake = process(
                "cactus.jpa.extras.cmn.persistence-unit-name=myUnit",
                "cactus.jpa.extras.cmn.hibernate.dialect=org.hibernate.dialect.H2Dialect",
                "cactus.jpa.extras.cmn.hibernate.properties.[hibernate.boot.allow_jdbc_metadata_access]=false");
        snake.registerSingleton("cmn", unreachableDataSource());
        EntityManagerFactory emf = snake.getBean("cactusEntityManagerFactoryCmn", EntityManagerFactory.class);
        try {
            assertThat(emf.getProperties().get("hibernate.physical_naming_strategy"))
                    .isExactlyInstanceOf(SnakePhysicalNamingStrategy.class);
            assertThat(emf.getProperties()).doesNotContainKey("hibernate.implicit_naming_strategy");
            assertThat(emf.getProperties()).containsEntry("hibernate.persistenceUnitName", "myUnit");
            assertThat(emf.getProperties()).containsEntry("hibernate.show_sql", "false");
        } finally {
            emf.close();
        }

        DefaultListableBeanFactory off = process(
                "cactus.jpa.snake-naming.enabled=false",
                "cactus.jpa.extras.cmn.hibernate.dialect=org.hibernate.dialect.H2Dialect",
                "cactus.jpa.extras.cmn.hibernate.properties.[hibernate.boot.allow_jdbc_metadata_access]=false");
        off.registerSingleton("cmn", unreachableDataSource());
        EntityManagerFactory emfOff = off.getBean("cactusEntityManagerFactoryCmn", EntityManagerFactory.class);
        try {
            // snake-naming 을 끄면 physical 전략 속성 자체를 넣지 않는다 (Hibernate 기본 전략)
            assertThat(emfOff.getProperties().get("hibernate.physical_naming_strategy")).isNull();
        } finally {
            emfOff.close();
        }
    }
}
