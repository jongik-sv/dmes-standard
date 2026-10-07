package com.dongkuk.dmes.mcm.searchdefaults.support;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.screenusage.support.StubSecurityIdentity;
import com.dongkuk.dmes.mcm.searchdefaults.repository.SecUserSrchDfltRepository;
import com.dongkuk.dmes.mcm.searchdefaults.service.SecSrchDfltService;
import com.dongkuk.dmes.mcm.searchdefaults.service.SecSrchDfltWriter;
import jakarta.persistence.EntityManagerFactory;
import java.util.Properties;
import javax.sql.DataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * 조회 기본값 저장소·쓰기 빈·서비스 통합 시험용 최소 JPA 구성(H2 메모리, 도커 없음).
 * {@code screenusage/support/ScreenUsageJpaTestConfig} 와 같은 방식이다. 엔티티가 {@code MCMAPUSER} 스키마를 쓰므로 접속 때 만든다.
 * 쓰기 빈은 {@code @Transactional} 프록시가 걸리도록 빈으로 올리고, 서비스는 인증 사용자를 바꿀 수 있는 스텁으로 만든다.
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(basePackageClasses = SecUserSrchDfltRepository.class)
public class SrchDfltJpaTestConfig {

    @Bean
    public DataSource dataSource() {
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.h2.Driver"); // testRuntimeOnly — 클래스 직접 참조 금지
        ds.setUrl("jdbc:h2:mem:srchdflt;DB_CLOSE_DELAY=-1;INIT=CREATE SCHEMA IF NOT EXISTS MCMAPUSER");
        ds.setUsername("sa");
        ds.setPassword("");
        return ds;
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(dataSource);
        em.setPackagesToScan("com.dongkuk.dmes.mcm.searchdefaults.entity");
        em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        Properties props = new Properties();
        props.put("hibernate.hbm2ddl.auto", "create-drop");
        em.setJpaProperties(props);
        return em;
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
