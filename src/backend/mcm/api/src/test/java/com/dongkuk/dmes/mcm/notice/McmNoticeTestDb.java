package com.dongkuk.dmes.mcm.notice;

import com.dongkuk.dmes.cactus.mdm.MdmValidator;
import com.dongkuk.dmes.mcm.notice.entity.Notice;
import com.dongkuk.dmes.mcm.notice.entity.NoticeTarget;
import com.dongkuk.dmes.mcm.notice.noticeBoard.service.NoticeBoardService;
import com.dongkuk.dmes.mcm.notice.noticeMgmt.service.NoticeMgmtService;
import com.dongkuk.dmes.mcm.notice.repository.NoticeRepository;
import com.dongkuk.dmes.mcm.notice.repository.NoticeTargetRepository;
import com.dongkuk.dmes.mcm.testdb.McmOraTestDb;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeAll;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * 공지 서비스 시험용 DB — Oracle 시험 PDB 의 MCMAPUSER(Flyway 기준선, oracle-1007 2026-10-07).
 *
 * <p>mcm 의 실제 {@code McmApplication} 은 {@code com.dongkuk.dmes.mcm} 전체를 스캔하므로, 시험 클래스의 중첩
 * {@code @Configuration}(예: {@code MenuCatalogOasisSaveIntegrationTest.Config})까지 끌어와 빈이 충돌한다. 그래서 mcm 의 기존
 * 시험처럼 앱 전체가 아니라 공지 엔티티·저장소·서비스만 올린다. JPA 구성은 {@code JpaConfig} 와 같다({@link McmOraTestDb#jpaProperties}).
 *
 * <p>이 클래스를 상속한 시험끼리 스프링 컨텍스트 하나를 나눠 쓰며, 각 시험은 {@code @Transactional} 롤백으로 서로 격리한다.
 * 스키마는 JVM 안에서 처음 컨텍스트가 뜰 때 한 번 비우고 다시 만든다({@link #schemasReady}) — 시드 행은 없다
 * (DataInitializer 를 부르지 않는다). 다른 시험 클래스가 그 뒤에 스키마를 다시 만들어도 공지 표는 비어 있게 된다.
 *
 * <p>MDM 저장 검증({@link MdmValidator})은 컨텍스트에 두지 않는다. 서비스는 빈이 없으면 검증 없이 저장하며({@code cactus.mdm.enabled=false}
 * 와 같다), MDM 검증은 검증기를 가짜로 끼운 시험({@code NoticeMgmtMdmSaveTest})이 본다.
 */
@SpringBootTest(classes = McmNoticeTestDb.Config.class)
public abstract class McmNoticeTestDb {

    private static boolean schemasReady;

    /** 공지 시험 묶음이 처음 쓸 때 한 번 스키마를 비우고 다시 만든다. */
    @BeforeAll
    static synchronized void prepareSchemas() {
        if (!schemasReady) {
            McmOraTestDb.resetSchemas();
            schemasReady = true;
        }
    }

    @Configuration
    @EnableTransactionManagement
    @EnableJpaRepositories(basePackageClasses = NoticeRepository.class, transactionManagerRef = "transactionManager")
    public static class Config {

        @Bean(destroyMethod = "close")
        DataSource dataSource() {
            return McmOraTestDb.appDataSource("mcm-notice-test");
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            return McmOraTestDb.entityManagerFactory(dataSource, "default",
                    Notice.class.getName(), NoticeTarget.class.getName());
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
