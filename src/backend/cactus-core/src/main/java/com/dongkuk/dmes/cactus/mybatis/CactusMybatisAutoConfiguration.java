package com.dongkuk.dmes.cactus.mybatis;

import com.dongkuk.oasis.jdbc.DefaultDataSourceResolver;
import org.apache.ibatis.session.SqlSessionFactory;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

import javax.sql.DataSource;

/**
 * cactus MyBatis 자동 설정. {@link DefaultDataSourceResolver} 빈 등록 + 프로퍼티 바인딩.
 *
 * <p>Phase 3 (2026-05-12). film {@code BizDataAccessConfig.defaultDataSourceResolver} 의 이식.
 *
 * <p>oasis-core 의 일부 컴포넌트가 {@link DefaultDataSourceResolver} 빈을 통해 primary DataSource
 * 를 받는다 (Spring 직접 주입이 아닌 oasis 내부 ServiceLoader 패턴).
 *
 * <p>활성 조건:
 * <ul>
 *   <li>{@code SqlSessionFactory} 클래스 + 빈 존재 (MyBatis 사용 모듈)</li>
 *   <li>{@code DefaultDataSourceResolver} 클래스 존재 (oasis-core 5.1.0)</li>
 *   <li>{@code DataSource} 빈 존재 (Spring Boot 자동)</li>
 * </ul>
 *
 * <p>순서: {@code @ConditionalOnBean(SqlSessionFactory.class)} 가 그 빈 정의를 보려면 생산 자동설정
 * ({@link CactusMultiMybatisAutoConfiguration}, mybatis-spring-boot {@code MybatisAutoConfiguration}) 뒤에
 * 처리돼야 한다 — 이름순 정렬에 기대지 않고 {@code after} 로 명시한다.
 */
@AutoConfiguration(
        after = CactusMultiMybatisAutoConfiguration.class,
        // mybatis-spring-boot-starter 의 단일 SqlSessionFactory 자동설정 (cactus.mybatis.enabled=false 일 때의 생산자)
        afterName = "org.mybatis.spring.boot.autoconfigure.MybatisAutoConfiguration"
)
@ConditionalOnClass({SqlSessionFactory.class, DefaultDataSourceResolver.class})
@ConditionalOnBean(SqlSessionFactory.class)
@EnableConfigurationProperties(CactusMybatisProperties.class)
public class CactusMybatisAutoConfiguration {

    /**
     * Oasis 가 사용할 primary DataSource 노출.
     * 소비 모듈이 자체 {@code DefaultDataSourceResolver} 빈을 등록하면 본 빈은 생성되지 않음.
     */
    @Bean
    @ConditionalOnBean(DataSource.class)
    @ConditionalOnMissingBean(DefaultDataSourceResolver.class)
    public DefaultDataSourceResolver cactusDefaultDataSourceResolver(DataSource dataSource) {
        return () -> dataSource;
    }
}
