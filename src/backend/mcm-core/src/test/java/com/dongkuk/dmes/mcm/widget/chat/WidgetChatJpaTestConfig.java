package com.dongkuk.dmes.mcm.widget.chat;

import com.dongkuk.dmes.mcm.widget.chat.repository.WidgetChatMessageRepository;
import com.dongkuk.dmes.mcm.widget.chat.service.WidgetChatWriter;
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
 * 챗봇 기록 저장소·Writer 시험용 최소 JPA 구성(H2 메모리, 도커 금지) — {@code ScreenUsageJpaTestConfig} 와 같은 방식.
 * 엔티티는 {@code widget.chat.entity} 만 매핑하고, 스키마 MCMAPUSER 는 접속 때 만든다.
 * Writer 는 @Transactional 프록시가 걸리도록 빈으로, 서비스는 시험에서 가짜 LLM·mock 과 직접 만든다.
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(basePackageClasses = WidgetChatMessageRepository.class)
public class WidgetChatJpaTestConfig {

    @Bean
    public DataSource dataSource() {
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.h2.Driver");
        ds.setUrl("jdbc:h2:mem:widgetchat;DB_CLOSE_DELAY=-1;INIT=CREATE SCHEMA IF NOT EXISTS MCMAPUSER");
        ds.setUsername("sa");
        ds.setPassword("");
        return ds;
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(dataSource);
        em.setPackagesToScan("com.dongkuk.dmes.mcm.widget.chat.entity");
        em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        Properties props = new Properties();
        props.put("hibernate.hbm2ddl.auto", "create-drop");
        em.setJpaProperties(props);
        return em;
    }

    @Bean
    public WidgetChatWriter widgetChatWriter(WidgetChatMessageRepository repository) {
        return new WidgetChatWriter(repository);
    }

    @Bean
    public PlatformTransactionManager transactionManager(EntityManagerFactory entityManagerFactory) {
        return new JpaTransactionManager(entityManagerFactory);
    }
}
