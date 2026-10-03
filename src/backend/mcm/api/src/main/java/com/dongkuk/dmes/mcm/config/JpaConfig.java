package com.dongkuk.dmes.mcm.config;

import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.jpa.HibernatePersistenceProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
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

    @Bean
    @Primary
    public DataSource dataSource(Environment env) {
        // ── JNDI 경로 (2026-07-07 JNDI 전환 설계 — docs/framework/DataSource_JNDI설계.md) ──
        // WildFly 배포(dev/prod): application-wildfly.yml 이 spring.datasource.jndi-name 을 정의
        // (기본값 java:/jdbc/mssql/mcm/dsBiz, JNDI_DS_BIZ 로 override 가능).
        // 물리 접속/풀은 각 WildFly standalone.xml 소유 — 여기선 컨테이너 관리 풀을 조회만 한다.
        String jndiName = env.getProperty("spring.datasource.jndi-name");
        if (jndiName != null && !jndiName.isBlank()) {
            return new JndiDataSourceLookup().getDataSource(jndiName);
        }

        // ── HikariCP 직결 경로 (local=SQLite / local-ph=포항 직결 / local-kp=김포 직결) ──
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
        ds.setPoolName("mcm-host-primary");
        return ds;
    }

    @Bean
    @Primary
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(
            @Qualifier("dataSource") DataSource dataSource,
            @Value("${spring.jpa.database-platform:}") String dialect,
            @Value("${spring.jpa.hibernate.ddl-auto:update}") String ddlAuto,
            @Value("${spring.jpa.show-sql:false}") boolean showSql) {

        Properties props = new Properties();
        if (dialect != null && !dialect.isBlank()) {
            props.put("hibernate.dialect", dialect);
        }
        props.put("hibernate.hbm2ddl.auto", ddlAuto);
        props.put("hibernate.show_sql", Boolean.toString(showSql));
        props.put("hibernate.format_sql", "true");
        // SQLite ddl-auto introspection 한계 회피 (2026-06-05): getColumns() 스키마 추출을 단일
        // compound SELECT(UNION) 대신 테이블 개별 수행. mcm.db 테이블 수 증가 시
        // "SQLITE_ERROR: too many terms in compound SELECT"(term 한계 ~500) 방지. 타 DB(MSSQL) 무해.
        props.put("hibernate.hbm2ddl.jdbc_metadata_extraction_strategy", "individually");

        // SQLite(개발자 Mac local 단독) — primary EMF 는 본 JpaConfig 가 명시 빌드해 application.yml 의
        // spring.jpa.properties(statement_inspector 포함)가 적용되지 않는다. SQLite 일 때만 audit inspector 를
        // 명시 등록 + SQLite 모드 전환 → 모든 native/JPA SQL 의 MCMAPUSER. schema 접두·SYSDATETIME 등을 SQLite
        // 호환으로 치환(mcm-core native @Query 66건 일괄). MSSQL/dev/prod 는 미등록 — 동료 환경 무영향.
        boolean sqlite = dialect != null && dialect.toLowerCase().contains("sqlite");
        if (sqlite) {
            props.put("hibernate.session_factory.statement_inspector",
                    "com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector");
            McmAuditStatementInspector.setSqlite(true);
            // SQLite 커뮤니티 dialect + xerial 의 네이티브 temporal 라운드트립 결함 우회 (2026-06-06) —
            // LocalDate/LocalDateTime 을 ISO text 로 저장/읽는 컨버터를 auto-apply (mpn application-local 패턴 이식).
            // 미등록 시 화면 저장 datetime 이 epoch millis 로 새어 시드(text)·조회와 형식 불일치. 읽기는 epoch·text 양쪽 호환.
            // primary EMF 가 명시 빌드라 yml 의 metadata_builder_contributor 미적용 → 여기서 직접 등록. MSSQL/dev/prod 미진입.
            props.put("hibernate.metadata_builder_contributor",
                    "com.dongkuk.dmes.mcm.common.persistence.SqliteTemporalConverterContributor");
        }

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
