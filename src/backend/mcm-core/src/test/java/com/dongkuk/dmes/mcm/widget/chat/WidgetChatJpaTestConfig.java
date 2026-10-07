package com.dongkuk.dmes.mcm.widget.chat;

import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.dongkuk.dmes.mcm.widget.chat.repository.WidgetChatMessageRepository;
import com.dongkuk.dmes.mcm.widget.chat.service.WidgetChatWriter;
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
 * 챗봇 기록 저장소·Writer 시험용 최소 JPA 구성(Oracle 시험 PDB, 기준선 V1 — {@link McmCoreOraTestDb}).
 * 엔티티는 {@code widget.chat.entity} 만 매핑하고, 컨텍스트가 뜰 때 네 스키마의 행을 지운다(빈 표에서 시작).
 * Writer 는 @Transactional 프록시가 걸리도록 빈으로, 서비스는 시험에서 가짜 LLM·mock 과 직접 만든다.
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(basePackageClasses = WidgetChatMessageRepository.class)
public class WidgetChatJpaTestConfig {

    @Bean
    public DataSource dataSource() {
        return McmCoreOraTestDb.appDataSource("widget-chat");
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        return McmCoreOraTestDb.entityManagerFactory(dataSource, "com.dongkuk.dmes.mcm.widget.chat.entity");
    }

    @Bean
    public WidgetChatWriter widgetChatWriter(WidgetChatMessageRepository repository) {
        return new WidgetChatWriter(repository, WidgetChatWriter.DEFAULT_USER_HISTORY_LIMIT);
    }

    @Bean
    public PlatformTransactionManager transactionManager(EntityManagerFactory entityManagerFactory) {
        return new JpaTransactionManager(entityManagerFactory);
    }
}
