package com.dongkuk.dmes.mcm.testdb;

import com.zaxxer.hikari.HikariDataSource;
import org.flywaydb.core.Flyway;
import org.hibernate.jpa.HibernatePersistenceProvider;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;

/**
 * mcm-core 시험의 Oracle 시험 PDB 접속과 스키마 준비 (oracle-1007 c4, 2026-10-07).
 *
 * <p>접속값은 시험 하니스(build-logic dmes.test-conventions, {@code -Pdmes.ora.test=clone} 또는 {@code -Pdmes.ora.pdb=<PDB>})가
 * 넘기는 시스템 속성 {@code dmes.ora.url}·{@code dmes.ora.password}(없으면 env {@code DMES_ORA_URL}·{@code DMES_ORA_PASSWORD})다.
 * 없으면 시험을 건너뛰지 않고 실패한다 — 백엔드 시험은 모두 Oracle 에서 돈다.
 *
 * <p>스키마는 앱(mcm {@code McmSchemaMigrator})과 같은 Flyway 설정으로 만든다 — 스키마 4개를 각 주인으로 접속해
 * {@code classpath:db/migration/oracle/<스키마 소문자>} 를 적용하고 자리표시자 {@code app_user} 는 MCMAPUSER 다.
 * JVM 당 한 번 clean 후 migrate 하고({@link #ensureMigrated()}), 시험 컨텍스트·클래스 사이는 행만 지운다({@link #resetData()} —
 * 기준선에 외래 키가 없어 순서 없이 지운다). 행 삭제는 IDENTITY·시퀀스를 되돌리지 않는다.
 *
 * <p>인스턴스를 모든 레인이 나눠 쓰므로 풀은 작게(최대 2, 쉬는 연결 0) 두고, 직접 만든 풀·EMF 는 호출자가 닫는다.
 */
public final class McmCoreOraTestDb {

    /** 적용 순서 — mcm {@code McmSchemaMigrator.SCHEMAS} 와 같다. */
    public static final List<String> SCHEMAS = List.of("MCMAPUSER", "MCM_SOURCE", "MCM_BACKUP", "MCAAPUSER");

    /** 앱 접속 사용자(런타임 SQL 의 MCMAPUSER. 접두와 같은 스키마). */
    public static final String APP_USER = "MCMAPUSER";

    private static final String HISTORY_TABLE = "flyway_schema_history";

    private static boolean migrated;

    private McmCoreOraTestDb() {
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

    /** Flyway 위치 — mcm-core {@code src/main/resources/db/migration/oracle/<스키마 소문자>}. */
    public static String location(String schema) {
        return "classpath:db/migration/oracle/" + schema.toLowerCase(Locale.ROOT);
    }

    /** JVM 당 한 번: 네 스키마를 비우고(Flyway clean) 기준선을 적용한다. 그 뒤 부르면 행만 지운다. */
    public static synchronized void ensureMigrated() {
        if (migrated) {
            resetData();
            return;
        }
        for (String schema : SCHEMAS) flyway(schema).clean();
        for (String schema : SCHEMAS) flyway(schema).migrate();
        migrated = true;
    }

    /** 네 스키마의 모든 표에서 행을 지운다(이력 표 제외). 시험 컨텍스트가 처음 뜰 때 빈 표에서 시작하게 한다. */
    public static synchronized void resetData() {
        for (String schema : SCHEMAS) {
            try (Connection c = DriverManager.getConnection(url(), schema, password()); Statement st = c.createStatement()) {
                List<String> tables = new ArrayList<>();
                try (ResultSet rs = st.executeQuery("SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME <> '" + HISTORY_TABLE + "'")) {
                    while (rs.next()) tables.add(rs.getString(1));
                }
                for (String table : tables) st.executeUpdate("DELETE FROM \"" + table + "\"");
                if (!c.getAutoCommit()) c.commit();
            } catch (SQLException e) {
                throw new IllegalStateException(schema + " 행 지우기 실패: " + e.getMessage(), e);
            }
        }
    }

    /** 스키마 준비({@link #ensureMigrated()}) 뒤 앱 사용자(MCMAPUSER)로 붙는 작은 풀. 닫는 것은 호출자(또는 스프링) 몫이다. */
    public static HikariDataSource appDataSource(String poolName) {
        ensureMigrated();
        return dataSource(APP_USER, poolName);
    }

    /** 사용자 하나로 붙는 작은 풀(최대 2, 쉬는 연결 0). 스키마 준비는 하지 않는다. */
    public static HikariDataSource dataSource(String user, String poolName) {
        HikariDataSource ds = new HikariDataSource();
        ds.setJdbcUrl(url());
        ds.setUsername(user);
        ds.setPassword(password());
        ds.setDriverClassName("oracle.jdbc.OracleDriver");
        ds.setPoolName(poolName);
        ds.setMaximumPoolSize(2);
        ds.setMinimumIdle(0);
        return ds;
    }

    /**
     * 앱의 기본 EMF 와 같은 Hibernate 설정 — OracleDialect, 스키마는 만들지 않음(none, 기준선이 만든다),
     * Instant=TIMESTAMP·boolean=TINYINT(docs/oracle-1007/schema-owners.md §3.1). {@code extra} 로 덧붙이거나 덮는다.
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

    /** 패키지를 훑어 엔티티를 올린 EMF 빈(시험용). {@code afterPropertiesSet} 은 스프링이(또는 호출자가) 부른다. */
    public static LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource, String... packagesToScan) {
        LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(dataSource);
        em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        em.setJpaProperties(jpaProperties(Map.of()));
        em.setPackagesToScan(packagesToScan);
        em.setPersistenceProviderClass(HibernatePersistenceProvider.class);
        return em;
    }

    private static Flyway flyway(String schema) {
        return Flyway.configure()
                .dataSource(url(), schema, password())
                .schemas(schema)
                .defaultSchema(schema)
                .createSchemas(false)
                .cleanDisabled(false)
                .locations(location(schema))
                .placeholders(Map.of("app_user", APP_USER))
                .load();
    }

    private static String setting(String property, String env) {
        String v = System.getProperty(property);
        return v != null && !v.isBlank() ? v : System.getenv(env);
    }
}
