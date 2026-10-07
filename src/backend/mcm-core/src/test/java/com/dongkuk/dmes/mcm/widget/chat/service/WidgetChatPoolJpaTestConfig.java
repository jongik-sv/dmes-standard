package com.dongkuk.dmes.mcm.widget.chat.service;

import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.dongkuk.dmes.mcm.widget.chat.repository.WidgetChatMessageRepository;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.datasource.LazyConnectionDataSourceProxy;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * 채팅이 LLM 을 기다리는 동안 쥐는 연결 수를 재는 시험 구성(oracle-1007 ③c 후속, docs/oracle-1007/design-mcm-lazy-ds.md).
 * 풀은 앱 로컬과 같은 상한 3·쉬는 연결 0 에 짧은 connectionTimeout({@value #CONNECTION_TIMEOUT_MS}ms)을 둔다.
 * {@code chat.pool.lazy=true} 면 mcm 앱의 {@code dmes.datasource.lazy-connection} 처럼 앱 기본 DataSource 를
 * {@link LazyConnectionDataSourceProxy} 로 감싸 EMF·트랜잭션 매니저가 그것을 쓴다(풀의 쥔 연결 수는 감싸기 전 Hikari 에서 잰다).
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(basePackageClasses = {WidgetChatMessageRepository.class, WidgetDefRepository.class})
public class WidgetChatPoolJpaTestConfig {

    static final int POOL_SIZE = 3;
    static final long CONNECTION_TIMEOUT_MS = 4000;

    @Bean(destroyMethod = "close")
    public HikariDataSource hikari() {
        HikariDataSource ds = McmCoreOraTestDb.appDataSource("widget-chat-pool");
        // 풀은 첫 getConnection 때 시작하므로 그 전에 바꾼다.
        ds.setMaximumPoolSize(POOL_SIZE);
        ds.setMinimumIdle(0);
        ds.setConnectionTimeout(CONNECTION_TIMEOUT_MS);
        ds.setIdleTimeout(10_000);
        return ds;
    }

    @Bean
    @Primary
    public DataSource dataSource(HikariDataSource hikari, @Value("${chat.pool.lazy:false}") boolean lazy) {
        return lazy ? new LazyConnectionDataSourceProxy(hikari) : hikari;
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        // 위젯 정의도 실제 저장소로 읽는다 — 채팅이 정의를 읽는 방식이 바뀌어 범위 EntityManager 가 생기면 시험이 잡는다.
        return McmCoreOraTestDb.entityManagerFactory(dataSource, "com.dongkuk.dmes.mcm.widget.chat.entity",
                "com.dongkuk.dmes.mcm.widget.def.entity");
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
