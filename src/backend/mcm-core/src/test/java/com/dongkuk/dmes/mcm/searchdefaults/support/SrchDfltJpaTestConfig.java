package com.dongkuk.dmes.mcm.searchdefaults.support;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.screenusage.support.StubSecurityIdentity;
import com.dongkuk.dmes.mcm.searchdefaults.repository.SecUserSrchDfltRepository;
import com.dongkuk.dmes.mcm.searchdefaults.service.SecSrchDfltService;
import com.dongkuk.dmes.mcm.searchdefaults.service.SecSrchDfltWriter;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import jakarta.persistence.EntityManagerFactory;
import javax.sql.DataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * 조회 기본값 저장소·쓰기 빈·서비스 통합 시험용 최소 JPA 구성(Oracle 시험 PDB, 기준선 V1 — {@link McmCoreOraTestDb}).
 * {@code screenusage/support/ScreenUsageJpaTestConfig} 와 같은 방식이다. 컨텍스트가 뜰 때 네 스키마의 행을 지운다(표는 기준선이 만든다).
 * 쓰기 빈은 {@code @Transactional} 프록시가 걸리도록 빈으로 올리고, 서비스는 인증 사용자를 바꿀 수 있는 스텁으로 만든다.
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(basePackageClasses = SecUserSrchDfltRepository.class)
public class SrchDfltJpaTestConfig {

    @Bean
    public DataSource dataSource() {
        return McmCoreOraTestDb.appDataSource("srchdflt");
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        return McmCoreOraTestDb.entityManagerFactory(dataSource, "com.dongkuk.dmes.mcm.searchdefaults.entity");
    }

    @Bean
    public PlatformTransactionManager transactionManager(EntityManagerFactory entityManagerFactory) {
        return new JpaTransactionManager(entityManagerFactory);
    }

    @Bean
    public StubSecurityIdentity securityIdentity() {
        return new StubSecurityIdentity("userA");
    }

    @Bean
    public SecSrchDfltWriter secSrchDfltWriter(SecUserSrchDfltRepository repository) {
        return new SecSrchDfltWriter(repository);
    }

    @Bean
    public SecSrchDfltService secSrchDfltService(SecUserSrchDfltRepository repository, SecSrchDfltWriter writer,
                                                 SecurityIdentity securityIdentity) {
        return new SecSrchDfltService(repository, writer, securityIdentity);
    }
}
