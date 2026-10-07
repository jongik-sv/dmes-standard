package com.dongkuk.dmes.mcm.oracheck;

import com.dongkuk.dmes.mcm.cmb.masterRuleData.service.MasterRuleDataService;
import com.dongkuk.dmes.mcm.csa.commSyncMng.service.CommSyncMngService;
import com.dongkuk.dmes.mcm.repository.MasterRuleColListRepository;
import com.dongkuk.dmes.mcm.repository.MomTcErrorRepository;
import com.dongkuk.dmes.mcm.repository.RuleMasterRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingNativeRepository;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import jakarta.persistence.EntityManagerFactory;
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

import javax.sql.DataSource;

/**
 * c2 에서 Oracle 식으로 바꾼 SQL 을 실제 Oracle 에서 확인하는 시험(oracle-1007 c4 묶음 D)의 공용 스프링 구성.
 *
 * <p>접속은 앱 사용자(MCMAPUSER)이고 스키마는 기준선 V1 이 만든다({@link McmCoreOraTestDb}). 컨텍스트가 처음 뜰 때
 * 네 스키마의 행이 지워진다 — 이 구성을 같이 쓰는 {@code *OraTest} 는 컨텍스트가 캐시되어 한 번만 지워지므로
 * 각 시험 클래스가 자기가 넣은 행을 스스로 지운다.
 *
 * <p>저장소는 쓰는 것(MomTcErrorRepository·MasterRuleColListRepository)만 올리고, {@code @PersistenceContext} 를 쓰는
 * 서비스·네이티브 저장소는 빈으로 직접 만든다. 쓰기 경로(save·동기화)는 운영의 OASIS 가 프로세스 하나를 트랜잭션 하나로
 * 감싸는 것과 같게 {@link TransactionTemplate} 으로 감싸 부른다.
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(
        basePackageClasses = MomTcErrorRepository.class,
        includeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {
                MomTcErrorRepository.class,
                MasterRuleColListRepository.class,
                RuleMasterRepository.class,
                SecUserRepository.class
        }))
public class OraCheckJpaConfig {

    @Bean
    public DataSource dataSource() {
        return McmCoreOraTestDb.appDataSource("oracheck-d");
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        return McmCoreOraTestDb.entityManagerFactory(dataSource,
                "com.dongkuk.dmes.mcm.entity",
                "com.dongkuk.dmes.mcm.screenusage.entity");
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
    public SecMenuNativeRepository secMenuNativeRepository() {
        return new SecMenuNativeRepository();
    }

    @Bean
    public SecRoleGroupMappingNativeRepository secRoleGroupMappingNativeRepository() {
        return new SecRoleGroupMappingNativeRepository();
    }

    @Bean
    public CommSyncMngService commSyncMngService() {
        return new CommSyncMngService();
    }

    @Bean
    public MasterRuleDataService masterRuleDataService(MasterRuleColListRepository colListRepository) {
        return new MasterRuleDataService(colListRepository);
    }
}
