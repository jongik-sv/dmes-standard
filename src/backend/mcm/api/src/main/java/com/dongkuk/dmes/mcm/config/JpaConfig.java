package com.dongkuk.dmes.mcm.config;

import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.jpa.HibernatePersistenceProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;
import org.springframework.context.annotation.Primary;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.datasource.lookup.JndiDataSourceLookup;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;

import javax.sql.DataSource;
import java.util.Properties;

/**
 * mcm 호스트의 primary DataSource + EntityManagerFactory + TransactionManager 명시 등록.
 *
 * <p>2026-05-13 — cactus-core 1.0.19-SNAPSHOT 의 secondary EMF 인프라 (v4 결정 #14, #15) 가 활성되면
 * Spring Boot 의 자동 DataSource/EMF 가 비활성되는 catch-22 가 발생. cactus 는 secondary 보조 빈만
 * 책임지고 host 의 primary 빈은 host 가 명시 정의 — 책임 분리 원칙.
 *
 * <p>Entity 패키지 스캔 범위 — cactus 빈(com.dongkuk.dmes.cactus.*), mcm-core 라이브러리 + 런처 도입 코드
 * (com.dongkuk.dmes.mcm.*). caravan-console 메타 entity 3종 (host/caravanhubconfig/topic) 은 cactus secondary EMF
 * 가 매핑 (v4 결정 #14) — 본 default EMF 의 packagesToScan 에서 제외.
 *
 * <p>caravan 의존 제거 (2026-05-12) — mcm 호스트에서 caravan 라이브러리 wiring 을 떼면서 default EMF 의
 * packagesToScan 정리. v4 결정 #14 (2026-05-13) 로 caravan-console 메타 entity 도 secondary 로 분리.
 */
@Configuration
public class JpaConfig {

    /** 기본 DataSource 연결 지연 획득 스위치({@link #lazyConnection}). */
    static final String LAZY_CONNECTION_KEY = "dmes.datasource.lazy-connection";

    @Bean
    @Primary
    public DataSource dataSource(Environment env) {
        // ── JNDI 경로 (2026-07-07 JNDI 전환 설계 — docs/framework/DataSource_JNDI설계.md) ──
        // WildFly 배포(dev/prod): application-wildfly.yml 이 spring.datasource.jndi-name 을 정의
        // (기본값 java:/jdbc/mcm/dsBiz, JNDI_DS_BIZ 로 override 가능).
        // 물리 접속/풀은 각 WildFly standalone.xml 소유 — 여기선 컨테이너 관리 풀을 조회만 한다.
        String jndiName = env.getProperty("spring.datasource.jndi-name");
        if (jndiName != null && !jndiName.isBlank()) {
            DataSource jndi = new JndiDataSourceLookup().getDataSource(jndiName);
            return lazyConnection(env) ? new LazyPrimaryDataSource(jndi, null) : jndi; // 컨테이너 풀은 닫지 않는다
        }

        // ── HikariCP 직결 경로 (local = 로컬 Oracle PDB 의 MCMAPUSER) ──
        String url = env.getProperty("spring.datasource.url");
        String driverClassName = env.getProperty("spring.datasource.driver-class-name");
        String username = env.getProperty("spring.datasource.username");
        String password = env.getProperty("spring.datasource.password");

        HikariDataSource ds = new HikariDataSource();
        if (url != null && !url.isBlank()) {
            ds.setJdbcUrl(url);
        }
        if (driverClassName != null && !driverClassName.isBlank()) {
            ds.setDriverClassName(driverClassName);
        }
        if (username != null) {
            ds.setUsername(username);
        }
        if (password != null) {
            ds.setPassword(password);
        }
        // Oracle 인스턴스를 모든 레인·앱이 나눠 쓴다(oracle-1007 연결 규약: Hikari 상한 3). 이 풀은 직접 만들어
        // spring.datasource.hikari.* 바인딩이 먹지 않으므로 여기서 읽는다 — 시험 하니스의 env SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE 도 이 키다.
        ds.setMaximumPoolSize(env.getProperty("spring.datasource.hikari.maximum-pool-size", Integer.class, 3));
        // 쉬는 연결·유휴 시간·누수 감지도 같은 접두로 읽는다(oracle-1007 ③d). 값이 없으면 Hikari 기본 그대로다
        // (쉬는 연결 = 최대치, 유휴 10분, 누수 감지 끔). 시험 하니스가 넘기는 minimum-idle=0·idle-timeout=10000 도 이로써 먹는다.
        // 메인 로컬 서버는 기동 env 로 최대 8 을 받는다(SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE — 레인 서버·시험은 3 이하 그대로).
        Integer minimumIdle = env.getProperty("spring.datasource.hikari.minimum-idle", Integer.class);
        if (minimumIdle != null) ds.setMinimumIdle(minimumIdle);
        Long idleTimeout = env.getProperty("spring.datasource.hikari.idle-timeout", Long.class);
        if (idleTimeout != null) ds.setIdleTimeout(idleTimeout);
        Long leakDetectionThreshold = env.getProperty("spring.datasource.hikari.leak-detection-threshold", Long.class);
        if (leakDetectionThreshold != null) ds.setLeakDetectionThreshold(leakDetectionThreshold);
        ds.setPoolName("mcm-host-primary");
        return lazyConnection(env) ? new LazyPrimaryDataSource(ds, ds) : ds;
    }

    /**
     * 기본 DataSource 연결 지연 획득 스위치 {@code dmes.datasource.lazy-connection}(기본 false) — 켜면 {@link LazyPrimaryDataSource} 로
     * 감싸 트랜잭션이 시작돼도 첫 SQL 때 풀에서 연결을 받는다(docs/oracle-1007/design-mcm-lazy-ds.md). OASIS txBiz 를 SQL 없이 내려놓고
     * LLM 을 기다리는 위젯 채팅이 그동안 연결을 쥐지 않게 된다. 끄면 전과 같다(설정 한 줄로 되돌린다).
     */
    static boolean lazyConnection(Environment env) {
        return env.getProperty(LAZY_CONNECTION_KEY, Boolean.class, false);
    }

    @Bean
    @Primary
    @DependsOn(McmFlywayConfig.MIGRATOR_BEAN)
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(
            @Qualifier("dataSource") DataSource dataSource,
            @Value("${spring.jpa.database-platform:}") String dialect,
            @Value("${spring.jpa.hibernate.ddl-auto:none}") String ddlAuto,
            @Value("${spring.jpa.show-sql:false}") boolean showSql) {

        Properties props = new Properties();
        if (dialect != null && !dialect.isBlank()) {
            props.put("hibernate.dialect", dialect);
        }
        props.put("hibernate.hbm2ddl.auto", ddlAuto);
        props.put("hibernate.show_sql", Boolean.toString(showSql));
        props.put("hibernate.format_sql", "true");
        // 일시·boolean 공통 설정(docs/oracle-1007/schema-owners.md §3.1·§3.1.1). 이 EMF 는 직접 만들어 yml 의
        // spring.jpa.properties 가 먹지 않으므로 여기에 넣는다. hibernate.jdbc.time_zone 은 넣지 않는다(KST 통일, JVM Asia/Seoul).
        //  - Instant 감사 칸(C_AT·U_AT)은 TIMESTAMP(6) — KST 벽시계로 저장한다.
        //  - boolean 칸은 NUMBER(1) — TINYINT 로 둔다(Hibernate 7.2 OracleDialect 는 23 이상에서 BIT 를 BOOLEAN 으로 매핑한다).
        props.put("hibernate.type.preferred_instant_jdbc_type", "TIMESTAMP");
        props.put("hibernate.type.preferred_boolean_jdbc_type", "TINYINT");

        LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(dataSource);
        em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        em.setJpaProperties(props);
        em.setPersistenceUnitName("default");
        em.setPackagesToScan(
                // 정책 (2026-05-20) — cactus 광역 매핑 폐기. 명시 EMF 가 필요한 cactus sub-package 만 명시.
                "com.dongkuk.dmes.cactus.security.auth", // SecUser (cactus.auth.enabled=true 활성)
                "com.dongkuk.dmes.cactus.mastercode",    // MasterCode Entity (MasterCodeJpaAutoConfiguration 매핑)
                "com.dongkuk.dmes.mcm"                   // mcm-core 라이브러리 엔티티 (SecRole/SecMenu/RevokedToken/AuditLog) + 런처 엔티티
                // ⚠️ "com.dongkuk.caravan.console.{host,caravanhubconfig,topic}" 포함 금지 —
                //    cactus 의 if EMF (cactusEntityManagerFactoryIf) 가 매핑.
                //    cactus.jpa.extras.if.packages-to-scan 에서 등록 (1.0.21+).
        );
        em.setPersistenceProviderClass(HibernatePersistenceProvider.class);
        return em;
    }

    @Bean
    @Primary
    public PlatformTransactionManager transactionManager(
            @Qualifier("entityManagerFactory") EntityManagerFactory emf) {
        return new JpaTransactionManager(emf);
    }
}
