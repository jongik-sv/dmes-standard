package com.dongkuk.dmes.mcm.userq;

import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryAssignRepository;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryDefRepository;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryStore;
import jakarta.persistence.EntityManagerFactory;
import javax.sql.DataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 공용 쿼리 조회(userq) 서비스 Oracle 시험의 공용 스프링 구성 — {@code OraCheckJpaConfig} 와 같은 방식.
 * 접속은 앱 사용자(MCMAPUSER)이고 스키마는 기준선·V13 이 만든다({@link McmCoreOraTestDb}).
 * 저장소는 쓰는 것만 올리고 {@code @PersistenceContext} 를 쓰는 {@link UserQueryStore} 는 빈으로 직접 만든다.
 * 쓰기 경로(save·delete·saveAssign)는 운영의 OASIS 가 프로세스 하나를 트랜잭션 하나로 감싸는 것과 같게
 * {@link TransactionTemplate} 으로 감싸 부른다.
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(
        basePackageClasses = {UserQueryDefRepository.class, DeptInfoRepository.class},
        includeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {
                UserQueryDefRepository.class,
                UserQueryAssignRepository.class,
                DeptInfoRepository.class
        }))
public class UserQueryOraConfig {

    @Bean
    public DataSource dataSource() {
        return McmCoreOraTestDb.appDataSource("userq");
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        return McmCoreOraTestDb.entityManagerFactory(dataSource,
                "com.dongkuk.dmes.mcm.entity",
                "com.dongkuk.dmes.mcm.userq.entity");
    }

    @Bean
    public PlatformTransactionManager transactionManager(EntityManagerFactory entityManagerFactory) {
        return new JpaTransactionManager(entityManagerFactory);
    }

    @Bean
    public TransactionTemplate transactionTemplate(PlatformTransactionManager transactionManager) {
        return new TransactionTemplate(transactionManager);
    }

    @Bean
    public JdbcTemplate jdbcTemplate(DataSource dataSource) {
        return new JdbcTemplate(dataSource);
    }

    @Bean
    public UserQueryStore userQueryStore() {
        return new UserQueryStore();
    }
}
