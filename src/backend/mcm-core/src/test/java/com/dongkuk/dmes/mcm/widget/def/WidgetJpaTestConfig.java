package com.dongkuk.dmes.mcm.widget.def;

import com.dongkuk.dmes.mcm.widget.admin.repository.WidgetUsageRepository;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetLayoutWriter;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
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
 * 위젯 정의·기본 배치 저장소 시험용 최소 JPA 구성(Oracle 시험 PDB, 기준선 V1 — {@link McmCoreOraTestDb}).
 * 컨텍스트가 뜰 때 네 스키마의 행을 지운다(예전 H2 create-drop 과 같은 빈 표에서 시작). 사용자 수 집계 쿼리를 확인하려고
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
        return McmCoreOraTestDb.appDataSource("widget-def");
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        return McmCoreOraTestDb.entityManagerFactory(dataSource,
                "com.dongkuk.dmes.mcm.widget.def.entity",
                "com.dongkuk.dmes.mcm.widget.layout.entity",
                "com.dongkuk.dmes.mcm.widget.entity");
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
