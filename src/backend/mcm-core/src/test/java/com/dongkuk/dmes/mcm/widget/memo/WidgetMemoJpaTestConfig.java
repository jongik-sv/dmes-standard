package com.dongkuk.dmes.mcm.widget.memo;

import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.dongkuk.dmes.mcm.widget.memo.repository.WidgetMemoRepository;
import com.dongkuk.dmes.mcm.widget.memo.service.WidgetMemoWriter;
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
 * 개인 메모 저장소·Writer 시험용 최소 JPA 구성(Oracle 시험 PDB, 기준선 V1 — {@link McmCoreOraTestDb}).
 * 엔티티는 {@code widget.memo.entity} 만 매핑하고, 컨텍스트가 뜰 때 네 스키마의 행을 지운다(빈 표에서 시작).
 * Writer 는 @Transactional 프록시가 걸리도록 빈으로, 서비스는 시험에서 mock(정의 저장소·사용자)과 직접 만든다.
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(basePackageClasses = WidgetMemoRepository.class)
public class WidgetMemoJpaTestConfig {

    @Bean
    public DataSource dataSource() {
        return McmCoreOraTestDb.appDataSource("widget-memo");
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        return McmCoreOraTestDb.entityManagerFactory(dataSource, "com.dongkuk.dmes.mcm.widget.memo.entity");
    }

    @Bean
    public WidgetMemoWriter widgetMemoWriter(WidgetMemoRepository repository) {
        return new WidgetMemoWriter(repository);
    }

    @Bean
    public PlatformTransactionManager transactionManager(EntityManagerFactory entityManagerFactory) {
        return new JpaTransactionManager(entityManagerFactory);
    }
}
