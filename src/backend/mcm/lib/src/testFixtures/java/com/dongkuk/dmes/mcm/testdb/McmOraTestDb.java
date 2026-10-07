package com.dongkuk.dmes.mcm.testdb;

import com.dongkuk.dmes.mcm.db.McmSchemaMigrator;
import com.zaxxer.hikari.HikariDataSource;
import org.flywaydb.core.Flyway;
import org.hibernate.jpa.HibernatePersistenceProvider;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.persistenceunit.PersistenceManagedTypes;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;

import javax.sql.DataSource;
import java.util.Map;
import java.util.Properties;

/**
 * mcm 시험의 Oracle 시험 PDB 접속과 스키마 준비 (oracle-1007, 2026-10-07).
 *
 * <p>접속값은 시험 하니스(build-logic dmes.test-conventions, {@code -Pdmes.ora.test=clone} 또는 {@code -Pdmes.ora.pdb=<PDB>})가
 * 넘기는 시스템 속성 {@code dmes.ora.url}·{@code dmes.ora.password}(없으면 env {@code DMES_ORA_URL}·{@code DMES_ORA_PASSWORD})다.
 * 없으면 시험을 건너뛰지 않고 실패한다 — 백엔드 시험은 모두 Oracle 에서 돈다(사용자 확정 사항).
 *
 * <p>스키마는 앱과 같은 {@link McmSchemaMigrator} 로 만든다(스키마 4개를 각 주인으로 접속해 mcm-core V 파일 적용).
 * {@link #resetSchemas()} 는 네 스키마를 Flyway clean 으로 비우고 다시 마이그레이션한다 — 시험 클래스마다 빈 스키마에서 시작한다.
 * 시험 PDB 는 빌드 한 번에 하나라 시험끼리 나눠 쓴다 — 태스크 안은 maxParallelForks=1, 태스크 사이는 api 의 test 가
 * {@code mustRunAfter(':lib:test')} 로 겹치지 않는다({@code --parallel} 대비).
 */
public final class McmOraTestDb {

    /** 앱 접속 사용자(런타임 SQL 의 MCMAPUSER. 접두와 같은 스키마). */
    public static final String APP_USER = McmSchemaMigrator.DEFAULT_APP_USER;

    private McmOraTestDb() {
    }

    /** 시험 PDB JDBC URL. */
    public static String url() {
        String url = setting("dmes.ora.url", "DMES_ORA_URL");
        if (url == null || url.isBlank()) {
            throw new IllegalStateException("Oracle 시험 PDB 접속값이 없다 — -Pdmes.ora.test=clone(또는 -Pdmes.ora.pdb=<PDB>)로 돌린다"
                    + " (scripts/oracle/README.md 「Gradle 시험 하니스」).");
        }
        return url;
    }

    /** 스키마 사용자 비밀번호(로컬 PDB 는 모든 사용자가 같다). */
    public static String password() {
        String pw = setting("dmes.ora.password", "DMES_ORA_PASSWORD");
        return pw == null || pw.isBlank() ? "dmes_password_123" : pw;
    }

    /** 네 스키마를 비우고(Flyway clean) 다시 마이그레이션한다. */
    public static synchronized void resetSchemas() {
        for (String schema : McmSchemaMigrator.SCHEMAS) {
            Flyway.configure()
                    .dataSource(url(), schema, password())
                    .schemas(schema)
                    .defaultSchema(schema)
                    .createSchemas(false)
                    .cleanDisabled(false)
                    .locations(McmSchemaMigrator.location(schema))
                    .load()
                    .clean();
        }
        McmSchemaMigrator.migrate(url(), password(), APP_USER);
    }

    /** 사용자 하나로 붙는 작은 풀(인스턴스를 모든 레인이 나눠 쓴다 — 상한 2). 닫는 것은 호출자 몫이다. */
    public static HikariDataSource dataSource(String user, String poolName) {
        HikariDataSource ds = new HikariDataSource();
        ds.setJdbcUrl(url());
        ds.setUsername(user);
        ds.setPassword(password());
        ds.setDriverClassName("oracle.jdbc.OracleDriver");
        ds.setPoolName(poolName);
        ds.setMaximumPoolSize(2);
        return ds;
    }

    /** 앱 사용자(MCMAPUSER)로 붙는 풀. */
    public static HikariDataSource appDataSource(String poolName) {
        return dataSource(APP_USER, poolName);
    }

    /**
     * 앱의 기본 EMF({@code JpaConfig})와 같은 Hibernate 설정 — OracleDialect, 스키마는 만들지 않음(none),
     * Instant=TIMESTAMP·boolean=TINYINT(docs/oracle-1007/schema-owners.md §3.1). {@code extra} 로 덧붙인다.
     */
    public static Properties jpaProperties(Map<String, Object> extra) {
        Properties props = new Properties();
        props.put("hibernate.dialect", "org.hibernate.dialect.OracleDialect");
        props.put("hibernate.hbm2ddl.auto", "none");
        props.put("hibernate.type.preferred_instant_jdbc_type", "TIMESTAMP");
        props.put("hibernate.type.preferred_boolean_jdbc_type", "TINYINT");
        props.putAll(extra);
        return props;
    }

    /** 엔티티 몇 개만 올린 EMF 빈(시험용). {@code afterPropertiesSet} 은 호출자가(또는 스프링이) 부른다. */
    public static LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource, String unitName,
                                                                              String... entityClassNames) {
        LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(dataSource);
        em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        em.setJpaProperties(jpaProperties(Map.of()));
        em.setPersistenceUnitName(unitName);
        em.setManagedTypes(PersistenceManagedTypes.of(entityClassNames));
        em.setPersistenceProviderClass(HibernatePersistenceProvider.class);
        return em;
    }

    private static String setting(String property, String env) {
        String v = System.getProperty(property);
        return v != null && !v.isBlank() ? v : System.getenv(env);
    }
}
