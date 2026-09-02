package com.dongkuk.dmes.cactus.autoconfigure;

import com.dongkuk.dmes.cactus.security.context.UserContext;
import com.dongkuk.dmes.cactus.security.jwt.JwtTokenProvider;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;

/**
 * Cactus JWT 핵심 빈 자동 구성.
 *
 * <p>{@code cactus.jwt.secret} 프로퍼티가 정의된 경우에만 활성화되며,
 * JWT 토큰 프로바이더와 사용자 컨텍스트 빈을 등록한다.
 *
 * <p>웹 보안 필터(JWT/ClientKey/RequestId) 와 {@link
 * org.springframework.security.web.SecurityFilterChain} 등록은
 * {@link CactusWebSecurityAutoConfiguration} 에서 처리한다.
 *
 * <p>인증 관련 빈({@code AuthService}/{@code SecUserRepository}/{@code PasswordEncoder})
 * 등록은 {@link CactusAuthAutoConfiguration} 으로 분리되어
 * {@code cactus.auth.enabled=true} 인 경우에만 활성화된다.
 */
@AutoConfiguration
@ConditionalOnProperty(prefix = "cactus.jwt", name = "secret")
public class SecurityAutoConfiguration {

    /**
     * JWT 토큰 프로바이더 빈을 생성한다.
     *
     * @param properties Cactus 설정 프로퍼티
     * @return JwtTokenProvider 인스턴스
     */
    @Bean
    @ConditionalOnMissingBean
    public JwtTokenProvider jwtTokenProvider(CactusProperties properties) {
        return new JwtTokenProvider(properties);
    }

    /**
     * 사용자 컨텍스트 빈을 생성한다.
     *
     * @return UserContext 인스턴스
     */
    @Bean
    @ConditionalOnMissingBean
    public UserContext userContext() {
        return new UserContext();
    }
}
