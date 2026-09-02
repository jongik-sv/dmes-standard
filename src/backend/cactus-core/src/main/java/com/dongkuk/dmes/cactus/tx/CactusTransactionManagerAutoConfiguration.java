package com.dongkuk.dmes.cactus.tx;

import jakarta.persistence.EntityManagerFactory;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnSingleCandidate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * cactus 단일 EMF 환경에서 {@link JpaTransactionManager} 를 {@code @Primary} 로 명시 등록.
 *
 * <p>Phase 4 (2026-05-13). 미결 #4 결정 반영 — film 의 {@code txBiz} 통합 모드 동등물.
 *
 * <p>활성 조건:
 * <ul>
 *   <li>{@code cactus.tx.jpa-unified=true} (기본 false, 의도적 옵트인)</li>
 *   <li>{@link EntityManagerFactory} 빈이 *단일 후보* 일 때만 — 다중 EMF 환경에서는 자동 비활성</li>
 *   <li>{@link PlatformTransactionManager} 빈이 아직 등록되지 않은 경우만 — 기존 빈과 충돌 방지</li>
 * </ul>
 *
 * <p><b>동작 원리</b>: {@link JpaTransactionManager} 는 EntityManager 의 connection 을
 * {@code TransactionSynchronizationManager} 에 DataSource 키로 bind. 같은 DataSource 를 쓰는
 * MyBatis SqlSession 이 자동으로 같은 트랜잭션을 공유 (§10-4 미결 #4 분석 참고).
 *
 * <p><b>주의 — 다중 EMF 환경에서 활성화 금지</b>: caravan 같은 라이브러리가 자체 EMF/TxMgr 를
 * 등록한 환경에서 본 빈을 활성화하면 어느 EMF 가 primary 인지 모호. {@code @ConditionalOnSingleCandidate}
 * 가 그 케이스를 차단하지만, 안전을 위해 yml 에 명시적으로 켜는 패턴 유지.
 */
@AutoConfiguration
@ConditionalOnClass({JpaTransactionManager.class, EntityManagerFactory.class})
@ConditionalOnProperty(prefix = "cactus.tx", name = "jpa-unified", havingValue = "true")
@ConditionalOnSingleCandidate(EntityManagerFactory.class)
public class CactusTransactionManagerAutoConfiguration {

    @Bean
    @Primary
    @ConditionalOnMissingBean(PlatformTransactionManager.class)
    @ConditionalOnBean(EntityManagerFactory.class)
    public PlatformTransactionManager transactionManager(EntityManagerFactory emf) {
        return new JpaTransactionManager(emf);
    }
}
