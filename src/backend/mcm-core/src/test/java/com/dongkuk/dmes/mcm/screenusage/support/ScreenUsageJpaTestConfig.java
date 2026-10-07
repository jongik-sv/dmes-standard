package com.dongkuk.dmes.mcm.screenusage.support;

import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageDayWriter;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import jakarta.persistence.EntityManagerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import javax.sql.DataSource;

/**
 * 화면 사용 통계 저장소·통합 테스트용 최소 JPA 구성 (Oracle 시험 PDB, 기준선 V1 — {@link McmCoreOraTestDb}).
 *
 * <p>mcm-core 에는 {@code @DataJpaTest} 선례가 없고 Boot 4 슬라이스 모듈도 의존성에 없어,
 * spring-test + 이미 있는 data-jpa 테스트 의존성만으로 EMF·트랜잭션·저장소를 직접 올린다.
 * 엔티티는 {@code screenusage.entity} 만 매핑한다. 표(TB_SEC_SCREEN_USAGE_LOG·DAY)는 기준선이 만들고,
 * 컨텍스트가 뜰 때 네 스키마의 행을 지운다.
 * 서비스는 빈으로 두지 않고 테스트에서 고정 Clock 과 mock 으로 직접 만든다.
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(basePackageClasses = ScreenUsageLogRepository.class)
public class ScreenUsageJpaTestConfig {

    @Bean
    public DataSource dataSource() {
        return McmCoreOraTestDb.appDataSource("screenusage");
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        return McmCoreOraTestDb.entityManagerFactory(dataSource, "com.dongkuk.dmes.mcm.screenusage.entity");
    }

    /** 일자 단위 delete+insert 트랜잭션 — @Transactional 프록시가 걸리도록 빈으로 등록한다. */
    @Bean
    public ScreenUsageDayWriter screenUsageDayWriter(ScreenUsageDayRepository dayRepository) {
        return new ScreenUsageDayWriter(dayRepository);
    }

    @Bean
    public PlatformTransactionManager transactionManager(EntityManagerFactory entityManagerFactory) {
        return new JpaTransactionManager(entityManagerFactory);
    }
}
