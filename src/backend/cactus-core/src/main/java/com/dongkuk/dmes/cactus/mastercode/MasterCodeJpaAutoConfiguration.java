package com.dongkuk.dmes.cactus.mastercode;

import jakarta.persistence.EntityManagerFactory;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/**
 * 마스터 코드 JPA Entity / Repository 자동 활성화.
 *
 * <p>cactus-core 의 {@code com.dongkuk.dmes.cactus.mastercode} 패키지의 Entity 와
 * Repository 를 소비 모듈의 JPA 컨텍스트에 자동 포함시킨다. 소비 모듈은 자체
 * {@code @EntityScan} / {@code @EnableJpaRepositories} 에 cactus 패키지를 추가할
 * 필요가 없다 — 의존성만으로 동작.
 *
 * <p>활성 조건:
 * <ul>
 *   <li>{@code EntityManagerFactory} 클래스가 classpath 에 존재 (JPA 환경)</li>
 *   <li>본 Configuration 클래스가 컨텍스트에 중복 등록되지 않음</li>
 * </ul>
 *
 * <p><b>multi-EMF 환경 binding</b> (1.0.22-SNAPSHOT, 2026-05-19):
 * {@code entityManagerFactoryRef = "entityManagerFactory"} 와 {@code transactionManagerRef = "transactionManager"} 명시 —
 * multi-DS 환경 ({@link com.dongkuk.dmes.cactus.jpa.CactusMultiJpaAutoConfiguration} 활성 시 cactusEntityManagerFactory{Name} 다수 존재) 에서도
 * primary EMF (Spring Boot default name = entityManagerFactory) 에 명확히 binding.
 * 명시 누락 시 multi-EMF 환경에서 Repository 빈 등록 실패 → MasterCodeDecoder 빈 미등록 → MasterCodeMybatisInterceptor 미attach (R-mybatis-13).
 *
 * <p>주의: 소비 모듈이 자체 {@code @EnableJpaRepositories(basePackages="...")} 를
 * 명시적으로 좁게 지정하면 cactus 의 Repository 가 등록되지 않을 수 있다. 그 경우
 * 소비 모듈 측에서 {@code basePackages} 에 {@code com.dongkuk.dmes.cactus.mastercode} 를
 * 추가하거나 {@code basePackages = {"...", "com.dongkuk.dmes.cactus"}} 형태로 확장 필요.
 */
@AutoConfiguration
@ConditionalOnClass({EntityManagerFactory.class})
@EntityScan(basePackages = "com.dongkuk.dmes.cactus.mastercode")
@EnableJpaRepositories(
        basePackages = "com.dongkuk.dmes.cactus.mastercode",
        entityManagerFactoryRef = "entityManagerFactory",
        transactionManagerRef = "transactionManager")
public class MasterCodeJpaAutoConfiguration {
}
