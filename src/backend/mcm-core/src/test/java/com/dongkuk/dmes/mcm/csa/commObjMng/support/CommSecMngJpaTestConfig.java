package com.dongkuk.dmes.mcm.csa.commObjMng.support;

import com.dongkuk.dmes.mcm.repository.CommPermQueryRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuFldLovRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecPermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingNativeRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingNativeRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRolePermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import jakarta.persistence.EntityManagerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.util.Map;

/**
 * 권한 관리 옛 화면 4종(commObjMng·commRoleMng·commPermMng·commRoleGrpMng) 서비스 시험용 최소 JPA 구성
 * (Oracle 시험 PDB — {@link McmCoreOraTestDb}, {@code -Pdmes.ora.test=clone}).
 *
 * <p>{@code csa/commUserMng/support/CommUserMngJpaTestConfig} 를 복사해 고친 것이다(그 파일은 고치지 않는다).
 *
 * <ul>
 *   <li>스키마는 Flyway 로 만든다(hbm2ddl none). 새 퍼미션 표(V20 {@code TB_MCM_SEC_ROLE_PERM})도 같은 migrate 로 생긴다.</li>
 *   <li>JPA 저장소는 쓰는 것만 올린다(includeFilters). 네이티브 SQL 저장소(@Repository 클래스)는 {@link Import} 로 올린다.</li>
 *   <li>서비스 4종은 각 {@code csa.comm*Mng} 패키지를 컴포넌트 스캔해 빈으로 둔다.</li>
 *   <li>운영은 OASIS {@code SpringTransactionHandler} 가 BPMN 프로세스 하나를 트랜잭션 하나로 감싼다.
 *       시험은 {@link TransactionTemplate} 으로 서비스 호출 하나를 트랜잭션 하나로 감싼다.</li>
 * </ul>
 *
 * <p>화면별 네이티브 쿼리 클래스 = {@code csa.comm*Mng.query} 패키지(아래 basePackages 에 이미 있다).
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(
        basePackageClasses = SecObjRepository.class,
        includeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {
                SecObjRepository.class,
                SecRoleRepository.class,
                SecPermRepository.class,
                SecRoleMappingRepository.class,
                SecRoleGroupRepository.class,
                SecRoleGroupMappingRepository.class,
                SecMenuRepository.class,
                SecRolePermRepository.class,
                SecUserMappingRepository.class
        }))
@Import({
        SecMenuFldLovRepository.class,
        SecRoleMappingNativeRepository.class,
        SecRoleGroupMappingNativeRepository.class,
        CommPermQueryRepository.class,
        CommSecMngFixtures.class,
        SecEventCollector.class
})
@ComponentScan(
        basePackages = {
                "com.dongkuk.dmes.mcm.csa.commObjMng.service",
                "com.dongkuk.dmes.mcm.csa.commRoleMng.service",
                "com.dongkuk.dmes.mcm.csa.commPermMng.service",
                "com.dongkuk.dmes.mcm.csa.commRoleGrpMng.service",
                // 화면별 네이티브 쿼리 클래스(@Repository) — 없는 패키지는 스캔 결과가 비어 무해하다
                "com.dongkuk.dmes.mcm.csa.commObjMng.query",
                "com.dongkuk.dmes.mcm.csa.commRoleMng.query",
                "com.dongkuk.dmes.mcm.csa.commPermMng.query",
                // 마지막 시스템관리자 판정·그룹 사용 현황(perm-crudfix c5·c1)
                "com.dongkuk.dmes.mcm.csa.commPerm"
        },
        excludeFilters = @ComponentScan.Filter(type = FilterType.ANNOTATION, classes = Configuration.class))
public class CommSecMngJpaTestConfig {

    /** 로그인 사용자 — 시험이 바꾼다(기본 null = 시스템 호출). SYSADMIN 만 할 수 있는 일 막기(m19)가 읽는다. */
    public static final java.util.concurrent.atomic.AtomicReference<String> CURRENT_USER =
            new java.util.concurrent.atomic.AtomicReference<>();

    @Bean
    public com.dongkuk.dmes.mcm.common.security.SecurityIdentity securityIdentity() {
        return new com.dongkuk.dmes.mcm.common.security.SecurityIdentity() {
            @Override public String currentUserId() { return CURRENT_USER.get(); }
            @Override public boolean hasAuthority(String authority) { return false; }
        };
    }

    @Bean
    public DataSource dataSource() {
        return McmCoreOraTestDb.appDataSource("commsecmng");
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        LocalContainerEntityManagerFactoryBean em = McmCoreOraTestDb.entityManagerFactory(dataSource,
                "com.dongkuk.dmes.mcm.entity");
        em.setJpaProperties(McmCoreOraTestDb.jpaProperties(Map.of()));
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
}
