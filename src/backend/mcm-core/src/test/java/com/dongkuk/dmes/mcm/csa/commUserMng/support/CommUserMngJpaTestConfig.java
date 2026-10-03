package com.dongkuk.dmes.mcm.csa.commUserMng.support;

import com.dongkuk.dmes.mcm.audit.repository.AuditLogRepository;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupRepository;
import com.dongkuk.dmes.mcm.repository.SecUserHisRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserPwdRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRollHisRepository;
import jakarta.persistence.EntityManagerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.util.Properties;

/**
 * 사용자 관리(commUserMng)·사용자 삭제(SecUserService)·감사 로그 조회(AuditLogService) 특성 테스트용 최소 JPA 구성 (H2 메모리).
 *
 * <p>{@code screenusage/support/ScreenUsageJpaTestConfig} 를 복사해 넓힌 것이다(그 파일은 고치지 않는다).
 * mcm-core 에는 {@code @DataJpaTest} 선례가 없어 spring-test + data-jpa·H2 테스트 의존성만으로 EMF·트랜잭션·저장소를 올린다.
 *
 * <ul>
 *   <li>H2 는 {@code MODE=MSSQLServer} 로 띄운다. {@code CommUserMngService.searchRoleGrp} 의 비-SQLite 분기
 *       네이티브 SQL({@code GETDATE()}·{@code ISNULL}·{@code DATEADD}) 이 그대로 돌게 하기 위해서다.</li>
 *   <li>엔티티가 {@code MCMAPUSER} 스키마를 쓰므로 접속 시 스키마를 만든다. 네이티브 SQL 의 {@code MCMAPUSER.} 접두도 그대로 통한다.</li>
 *   <li>저장소는 쓰는 것만 올린다(includeFilters) — 패키지 전체를 올리면 무관한 JPQL 까지 기동 시 검증된다.</li>
 *   <li>서비스는 {@code csa.commUserMng} 패키지를 컴포넌트 스캔해 빈으로 둔다. 다음 단계에서 서비스가 여러 빈으로
 *       나뉘어도 테스트는 {@code CommUserMngService} 를 타입으로 주입받으므로 고칠 필요가 없다.
 *       EMF 단위 이름은 기본값 {@code "default"} — 서비스의 {@code @PersistenceContext(unitName = "default")} 와 맞는다.</li>
 *   <li>운영은 OASIS {@code SpringTransactionHandler} 가 BPMN 프로세스 하나를 트랜잭션 하나로 감싼다.
 *       테스트는 {@link TransactionTemplate} 으로 서비스 호출 하나를 트랜잭션 하나로 감싸 같은 조건을 만든다.</li>
 * </ul>
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(
        basePackageClasses = {SecUserRepository.class, AuditLogRepository.class},
        includeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {
                SecUserRepository.class,
                SecUserMappingRepository.class,
                SecUserPwdRepository.class,
                SecUserHisRepository.class,
                SecUserRollHisRepository.class,
                DeptInfoRepository.class,
                SecRoleGroupMappingRepository.class,
                SecRoleGroupRepository.class,
                AuditLogRepository.class
        }))
@ComponentScan(
        basePackages = "com.dongkuk.dmes.mcm.csa.commUserMng",
        excludeFilters = @ComponentScan.Filter(type = FilterType.ANNOTATION, classes = Configuration.class))
public class CommUserMngJpaTestConfig {

    @Bean
    public DataSource dataSource() {
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.h2.Driver"); // testRuntimeOnly — 클래스 직접 참조 금지
        ds.setUrl("jdbc:h2:mem:commusermng;DB_CLOSE_DELAY=-1;MODE=MSSQLServer;"
                + "INIT=CREATE SCHEMA IF NOT EXISTS MCMAPUSER");
        ds.setUsername("sa");
        ds.setPassword("");
        return ds;
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(dataSource);
        em.setPackagesToScan("com.dongkuk.dmes.mcm.entity", "com.dongkuk.dmes.mcm.audit.entity");
        em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        Properties props = new Properties();
        props.put("hibernate.hbm2ddl.auto", "create-drop");
        // entity 패키지에는 다른 스키마(MCAAPUSER·MCM_SOURCE) 엔티티도 있다 — 스키마를 만들어 DDL 오류 로그를 없앤다.
        props.put("hibernate.hbm2ddl.create_namespaces", "true");
        // SQL 을 바꾸지 않고 기록만 한다 — 성능 근거 테스트(*SqlCountTest)가 SELECT·DELETE 수를 센다.
        props.put("hibernate.session_factory.statement_inspector", SqlStatementCounter.INSTANCE);
        em.setJpaProperties(props);
        return em;
    }

    @Bean
    public PlatformTransactionManager transactionManager(EntityManagerFactory entityManagerFactory) {
        return new JpaTransactionManager(entityManagerFactory);
    }

    @Bean
    public TransactionTemplate transactionTemplate(PlatformTransactionManager transactionManager) {
        return new TransactionTemplate(transactionManager);
    }

    /** 서비스가 발행한 {@code RoleChangedEvent} 를 모은다. 테스트마다 {@link RoleChangedEventCollector#clear()} 한다. */
    @Bean
    public RoleChangedEventCollector roleChangedEventCollector() {
        return new RoleChangedEventCollector();
    }
}
