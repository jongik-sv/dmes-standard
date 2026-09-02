package com.dongkuk.dmes.cactus.mastercode;

import org.apache.ibatis.session.SqlSessionFactory;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;

/**
 * 마스터 코드 자동 디코딩 자동 설정.
 * Phase 1 (2026-05-12) — film {@code MasterCodeIntercept} 의 cactus 이식.
 *
 * <p>활성 조건:
 * <ul>
 *   <li>{@code SqlSessionFactory} 가 classpath 에 + 빈 존재 (소비 모듈이 mybatis-spring-boot-starter 사용)</li>
 *   <li>{@code cactus.mybatis.master-code-decoding.enabled} 기본 true. {@code false} 로 설정 시 비활성</li>
 *   <li>{@link MasterCodeItemRepository} 빈 존재 (기본 {@link DefaultMasterCodeDecoder} 활성 조건)</li>
 * </ul>
 *
 * <p>1.0.22-SNAPSHOT (2026-05-19) 부터 인터셉터 등록은
 * {@link com.dongkuk.dmes.cactus.mybatis.CactusMultiMybatisAutoConfiguration} 가 전담.
 * 기존 {@code InterceptorRegistrar} inner class 는 단일 SqlSessionFactory 가정 — multi-DS 환경에서
 * cmn/if SqlSessionFactory 에 attach 누락되어 폐기. 본 클래스는 {@link MasterCodeDecoder} 빈만
 * 등록하고, 실제 attach 는 SqlSessionFactoryBean.setPlugins 에서 직접 new (film 패턴).
 * 자세한 내용은 {@code docs/cactus/cactus-mybatis-multi-ds-design.md} §10 참고.
 */
@AutoConfiguration
@ConditionalOnClass(SqlSessionFactory.class)
@ConditionalOnProperty(prefix = "cactus.mybatis.master-code-decoding",
        name = "enabled", havingValue = "true", matchIfMissing = true)
public class MasterCodeMybatisAutoConfiguration {

    /**
     * {@link MasterCodeItemRepository} 기반 기본 디코더.
     * 소비 모듈이 자체 {@code @Bean MasterCodeDecoder} 를 등록하면 이 빈은 생성되지 않음.
     */
    @Bean
    @ConditionalOnMissingBean(MasterCodeDecoder.class)
    @ConditionalOnBean(MasterCodeItemRepository.class)
    public MasterCodeDecoder defaultMasterCodeDecoder(MasterCodeItemRepository repository) {
        return new DefaultMasterCodeDecoder(repository);
    }
}
