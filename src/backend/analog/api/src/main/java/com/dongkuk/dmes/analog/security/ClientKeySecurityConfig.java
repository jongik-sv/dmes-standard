package com.dongkuk.dmes.analog.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

/**
 * X-Client-Key 검증 필터 등록.
 *
 * <p><b>출처</b> — cactus-core {@code CactusWebSecurityAutoConfiguration} 의
 * {@code cactusClientKeyFilter} 조건부 등록 패턴 미러
 * ({@code @ConditionalOnProperty(prefix = "cactus.security", name = "client-key")},
 * 속성명 동일). mpn/mcm 은 Spring Security {@code SecurityFilterChain} 에 필터를 통합
 * 등록하지만, analog 는 Security 미의존이므로 servlet {@link jakarta.servlet.Filter} 빈
 * 자동 등록(Spring Boot)으로 전 경로에 적용한다 — 필터가 단독이라 순서 제약 없음.
 *
 * <p>{@code cactus.security.client-key} 프로퍼티가 정의된 경우에만 활성.
 * skip 경로(default {@code /auth/}, {@code /api/auth/}, {@code /actuator/}) 를 제외한
 * {@code /api/meta}, {@code /log/**} 전 엔드포인트가 키 필수다.
 */
@Configuration
public class ClientKeySecurityConfig {

    /** ClientKey 필터 빈 — {@code cactus.security.client-key} 가 정의된 경우에만 활성. */
    @Bean
    @ConditionalOnProperty(prefix = "cactus.security", name = "client-key")
    public ClientKeyFilter clientKeyFilter(
            @Value("${cactus.security.client-key:}") String configClientKey,
            @Value("${cactus.security.client-key-skip-paths:}") List<String> skipPaths) {
        return new ClientKeyFilter(configClientKey, skipPaths);
    }
}
