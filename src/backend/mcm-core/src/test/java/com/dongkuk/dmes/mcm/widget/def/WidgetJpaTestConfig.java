package com.dongkuk.dmes.mcm.widget.def;

import com.dongkuk.dmes.mcm.widget.admin.repository.WidgetUsageRepository;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetLayoutWriter;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
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
 * 위젯 정의·기본 배치 저장소 시험용 최소 JPA 구성(H2 메모리) — {@code ScreenUsageJpaTestConfig} 방식.
 * 엔티티가 {@code MCMAPUSER} 스키마를 쓰므로 연결할 때 스키마를 만든다. 사용자 수 집계 쿼리를 확인하려고
 * A 의 사용자 위젯 엔티티·저장소(읽기·시험 데이터 넣기만)도 함께 올린다.
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(basePackageClasses = {
        WidgetDefRepository.class,
        WidgetDefaultLayoutRepository.class,
        WidgetUsageRepository.class,
        SecUserWidgetRepository.class})
public class WidgetJpaTestConfig {

    @Bean
    public DataSource dataSource() {
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.h2.Driver"); // testRuntimeOnly — 클래스 직접 참조 금지
        ds.setUrl("jdbc:h2:mem:widgetdef;DB_CLOSE_DELAY=-1;INIT=CREATE SCHEMA IF NOT EXISTS MCMAPUSER");
        ds.setUsername("sa");
        ds.setPassword("");
        return ds;
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(dataSource);
        em.setPackagesToScan(
                "com.dongkuk.dmes.mcm.widget.def.entity",
                "com.dongkuk.dmes.mcm.widget.layout.entity",
                "com.dongkuk.dmes.mcm.widget.entity");
        em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        Properties props = new Properties();
        props.put("hibernate.hbm2ddl.auto", "create-drop");
        em.setJpaProperties(props);
        return em;
    }

    /** 키 단위 지우고 다시 넣기 트랜잭션 — @Transactional 프록시가 걸리도록 빈으로 등록한다. */
    @Bean
    public WidgetLayoutWriter widgetLayoutWriter(WidgetDefaultLayoutRepository layoutRepository) {
        return new WidgetLayoutWriter(layoutRepository);
    }

    @Bean
    public PlatformTransactionManager transactionManager(EntityManagerFactory entityManagerFactory) {
        return new JpaTransactionManager(entityManagerFactory);
    }
}
