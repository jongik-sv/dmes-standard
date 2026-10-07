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
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import jakarta.persistence.EntityManagerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.util.Map;

/**
 * 사용자 관리(commUserMng)·사용자 삭제(SecUserService)·감사 로그 조회(AuditLogService) 특성 테스트용 최소 JPA 구성 (Oracle 시험 PDB, 기준선 V1 — {@link McmCoreOraTestDb}).
 *
 * <p>{@code screenusage/support/ScreenUsageJpaTestConfig} 를 복사해 넓힌 것이다(그 파일은 고치지 않는다).
 * mcm-core 에는 {@code @DataJpaTest} 선례가 없어 spring-test + data-jpa 테스트 의존성만으로 EMF·트랜잭션·저장소를 올린다.
 *
 * <ul>
 *   <li>스키마는 만들지 않는다(hbm2ddl none) — 기준선 V1 이 네 스키마의 표를 만들고, 컨텍스트가 뜰 때 {@link McmCoreOraTestDb#appDataSource} 가
 *       행을 지운다. 엔티티가 {@code MCMAPUSER} 스키마를 쓰므로 네이티브 SQL 의 {@code MCMAPUSER.} 접두도 그대로 통한다.
 *       {@code CommUserMngService.searchRoleGrp} 의 네이티브 SQL({@code LOCALTIMESTAMP}·{@code COALESCE}·{@code INTERVAL}) 도 Oracle 에서 그대로 돈다.</li>
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
        return McmCoreOraTestDb.appDataSource("commusermng");
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        LocalContainerEntityManagerFactoryBean em = McmCoreOraTestDb.entityManagerFactory(dataSource,
                "com.dongkuk.dmes.mcm.entity", "com.dongkuk.dmes.mcm.audit.entity");
        // SQL 을 바꾸지 않고 기록만 한다 — 성능 근거 테스트(*SqlCountTest)가 SELECT·DELETE 수를 센다.
        // 전제(SqlStatementCounter javadoc): hibernate.jdbc.batch_size 를 넣지 않는다 — 켜면 실행 횟수가 아니라 준비 횟수를 세어
        // 건별 DELETE 회귀를 놓친다(*SqlCountTest 가 단언한다). 이 구성을 쓰는 시험은 순차 실행이어야 한다(전역 계수기 공유).
        em.setJpaProperties(McmCoreOraTestDb.jpaProperties(Map.<String, Object>of(
                "hibernate.session_factory.statement_inspector", SqlStatementCounter.INSTANCE)));
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
