package com.dongkuk.dmes.mcm.widget.chat;

import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.dongkuk.dmes.mcm.widget.chat.repository.WidgetChatMessageRepository;
import com.dongkuk.dmes.mcm.widget.chat.service.WidgetChatWriter;
import com.zaxxer.hikari.HikariDataSource;
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

    /**
     * 풀 상한 3. 도우미 기본 풀(2)로는 모자란다 — WidgetChatServiceTest 의 「바깥 트랜잭션(연결 1 을 쥔 채 보류) + LLM 호출 중
     * 확인용 REQUIRES_NEW 트랜잭션」 이 동시에 연결을 쥐고, 이전(H2 DriverManagerDataSource)에는 연결 수 제한이 없어서 드러나지 않았다.
     * 풀이 부족하면 getConnection 이 30초 기다린 뒤 CannotCreateTransactionException 으로 끝난다.
     */
    @Bean
    public DataSource dataSource() {
        HikariDataSource ds = McmCoreOraTestDb.appDataSource("widget-chat");
        ds.setMaximumPoolSize(3); // 풀은 첫 getConnection 때 시작하므로 그 전에 바꾼다
        return ds;
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
