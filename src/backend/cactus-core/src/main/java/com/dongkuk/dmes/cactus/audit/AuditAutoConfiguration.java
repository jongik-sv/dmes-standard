package com.dongkuk.dmes.cactus.audit;

import org.springframework.context.annotation.Configuration;

/**
 * 감사 기능 Auto-Configuration.
 *
 * <p>JPA: CactusAuditEntity에 {@code @EntityListeners}가 직접 선언되어 있으므로 별도 설정 불필요.
 *
 * <p>MyBatis 인터셉터 등록은 1.0.22-SNAPSHOT 부터 {@link com.dongkuk.dmes.cactus.mybatis.CactusMultiMybatisAutoConfiguration}
 * 가 전담한다. 기존 inner class ({@code MybatisAuditAutoConfiguration}, {@code MybatisSqlLoggingAutoConfiguration})
 * 는 단일 SqlSessionFactory 가정 — multi-DS 환경에서 cmn/if SqlSessionFactory 에 attach 누락되어 폐기됨.
 * 자세한 내용은 {@code docs/cactus/cactus-mybatis-multi-ds-design.md} §10 참고.
 */
@Configuration
public class AuditAutoConfiguration {
}
