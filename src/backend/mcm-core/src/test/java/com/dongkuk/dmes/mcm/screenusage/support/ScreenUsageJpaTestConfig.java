package com.dongkuk.dmes.mcm.screenusage.support;

import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import jakarta.persistence.EntityManagerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import javax.sql.DataSource;
import java.util.Properties;

/**
 * 화면 사용 통계 저장소·통합 테스트용 최소 JPA 구성 (H2 메모리).
 *
 * <p>mcm-core 에는 {@code @DataJpaTest} 선례가 없고 Boot 4 슬라이스 모듈도 의존성에 없어,
 * spring-test + 이미 있는 data-jpa·H2 테스트 의존성만으로 EMF·트랜잭션·저장소를 직접 올린다.
 * 엔티티는 {@code screenusage.entity} 만 매핑한다(MCMAPUSER schema 테이블 불필요).
 * 서비스는 빈으로 두지 않고 테스트에서 고정 Clock 과 mock 으로 직접 만든다.
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(basePackageClasses = ScreenUsageLogRepository.class)
public class ScreenUsageJpaTestConfig {

    @Bean
    public DataSource dataSource() {
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.h2.Driver"); // testRuntimeOnly — 클래스 직접 참조 금지
        ds.setUrl("jdbc:h2:mem:screenusage;DB_CLOSE_DELAY=-1");
        ds.setUsername("sa");
        ds.setPassword("");
        return ds;
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(dataSource);
        em.setPackagesToScan("com.dongkuk.dmes.mcm.screenusage.entity");
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
}
