package com.dongkuk.dmes.mcm.notice;

import com.dongkuk.dmes.cactus.mdm.MdmValidator;
import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import com.dongkuk.dmes.mcm.notice.entity.Notice;
import com.dongkuk.dmes.mcm.notice.entity.NoticeTarget;
import com.dongkuk.dmes.mcm.notice.noticeBoard.service.NoticeBoardService;
import com.dongkuk.dmes.mcm.notice.noticeMgmt.service.NoticeMgmtService;
import com.dongkuk.dmes.mcm.notice.repository.NoticeRepository;
import com.dongkuk.dmes.mcm.notice.repository.NoticeTargetRepository;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;
import javax.sql.DataSource;
import org.hibernate.jpa.HibernatePersistenceProvider;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.persistenceunit.PersistenceManagedTypes;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * 공지 서비스 시험용 SQLite 파일 — 작업 트리의 {@code ../data/mcm.db} 를 건드리지 않도록 임시 파일을 쓴다.
 *
 * <p>mcm 의 실제 {@code McmApplication} 은 {@code com.dongkuk.dmes.mcm} 전체를 스캔하므로, 시험 클래스의 중첩
 * {@code @Configuration}(예: {@code MenuCatalogOasisSaveIntegrationTest.Config})까지 끌어와 빈이 충돌한다. 그래서 mcm 의 기존
 * 시험처럼 앱 전체가 아니라 공지 엔티티·저장소·서비스만 올린다. JPA 구성은 {@code JpaConfig} 의 SQLite 분기와 같다
 * ({@link McmAuditStatementInspector} SQLite 모드로 {@code MCMAPUSER.} 접두 제거, 날짜 문자열 변환).
 *
 * <p>클래스마다 {@code @TempDir} 을 쓰면 캐시된 스프링 컨텍스트가 지워진 파일을 가리키게 되므로, JVM 안에서 한 번만 만들고
 * 끝날 때 지운다. 이 클래스를 상속한 시험끼리 컨텍스트 하나를 나눠 쓰며, 각 시험은 {@code @Transactional} 롤백으로 서로
 * 격리한다. mcm 은 Flyway 없이 hibernate ddl-auto 로 스키마를 만들므로(local 프로필과 같다) 컨텍스트가 처음 뜰 때 엔티티 기준으로
 * 빈 테이블이 만들어진다 — 시드 행은 없다.
 *
 * <p>MDM 저장 검증({@link MdmValidator})은 컨텍스트에 두지 않는다. 서비스는 빈이 없으면 검증 없이 저장하며({@code cactus.mdm.enabled=false}
 * 와 같다), MDM 검증은 검증기를 가짜로 끼운 시험({@code NoticeMgmtMdmSaveTest})이 본다.
 */
@SpringBootTest(classes = McmNoticeTestDb.Config.class)
public abstract class McmNoticeTestDb {

    private static final Path FILE;

    static {
        try {
            Path dir = Files.createTempDirectory("mcm-notice-test-db");
            FILE = dir.resolve("mcm-test.db");
            dir.toFile().deleteOnExit();
            FILE.toFile().deleteOnExit();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static boolean sqliteBefore;

    /** 감사 inspector 의 SQLite 모드는 JVM 전역 값이다 — 다른 시험에 새지 않게 클래스 단위로 켜고 되돌린다. */
    @BeforeAll
    static void sqliteInspectorOn() {
        sqliteBefore = McmAuditStatementInspector.isSqlite();
        McmAuditStatementInspector.setSqlite(true);
    }

    @AfterAll
    static void sqliteInspectorRestore() {
        McmAuditStatementInspector.setSqlite(sqliteBefore);
    }

    /** 이 JVM 이 쓰는 임시 SQLite 파일 경로(JDBC URL 용). */
    public static String jdbcUrl() {
        return "jdbc:sqlite:" + FILE;
    }

    @Configuration
    @EnableTransactionManagement
    @EnableJpaRepositories(basePackageClasses = NoticeRepository.class, transactionManagerRef = "transactionManager")
    public static class Config {

        @Bean
        DataSource dataSource() {
            HikariDataSource ds = new HikariDataSource();
            ds.setJdbcUrl(jdbcUrl());
            ds.setPoolName("mcm-notice-test");
            ds.setMaximumPoolSize(4);
            return ds;
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            Properties props = new Properties();
            props.put("hibernate.dialect", "org.hibernate.community.dialect.SQLiteDialect");
            props.put("hibernate.hbm2ddl.auto", "update");
            props.put("hibernate.hbm2ddl.jdbc_metadata_extraction_strategy", "individually");
            props.put("hibernate.session_factory.statement_inspector", McmAuditStatementInspector.class.getName());
            props.put("hibernate.metadata_builder_contributor",
                    "com.dongkuk.dmes.mcm.common.persistence.SqliteTemporalConverterContributor");

            LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
            em.setDataSource(dataSource);
            em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            em.setJpaProperties(props);
            em.setPersistenceUnitName("default");
            em.setManagedTypes(PersistenceManagedTypes.of(Notice.class.getName(), NoticeTarget.class.getName()));
            em.setPersistenceProviderClass(HibernatePersistenceProvider.class);
            return em;
        }

        /** OASIS 기본 매니저 txBiz = 운영의 primary JPA 매니저({@code transactionManager}) 별칭. */
        @Bean(name = {"transactionManager", "txBiz"})
        PlatformTransactionManager transactionManager(EntityManagerFactory emf) {
            return new JpaTransactionManager(emf);
        }

        @Bean(name = "noticeMgmtService")
        NoticeMgmtService noticeMgmtService(NoticeRepository notices, NoticeTargetRepository targets,
                                            ObjectProvider<MdmValidator> mdmValidator) {
            return new NoticeMgmtService(notices, targets, mdmValidator);
        }

        @Bean(name = "noticeBoardService")
        NoticeBoardService noticeBoardService(NoticeRepository notices) {
            return new NoticeBoardService(notices);
        }
    }
}
