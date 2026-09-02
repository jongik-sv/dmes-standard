package com.dongkuk.dmes.cactus.autoconfigure;

import com.dongkuk.dmes.cactus.security.auth.AuthService;
import com.dongkuk.dmes.cactus.security.auth.PasswordEncoder;
import com.dongkuk.dmes.cactus.security.auth.SecUserRepository;
import com.dongkuk.dmes.cactus.security.jwt.JwtTokenProvider;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigureAfter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.Bean;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/**
 * Cactus 통합 인증(Auth) 자동 구성.
 *
 * <p>{@code cactus.auth.enabled=true} 인 경우에만 활성화되어 다음 빈을 등록한다.
 * <ul>
 *     <li>{@link PasswordEncoder} — BCrypt 비밀번호 인코더</li>
 *     <li>{@link AuthService} — 로그인/갱신/로그아웃 로직</li>
 *     <li>{@code SecUser} 엔티티 스캔 ({@link EntityScan})</li>
 *     <li>{@link SecUserRepository} JPA 리포지토리 스캔 ({@link EnableJpaRepositories})</li>
 * </ul>
 *
 * <p>default 비활성. mcm 모듈 등 인증을 직접 수행하는 모듈만
 * {@code application.yml} 에 {@code cactus.auth.enabled: true} 를 추가하여 활성화한다.
 */
@AutoConfiguration
@AutoConfigureAfter(SecurityAutoConfiguration.class)
@ConditionalOnProperty(prefix = "cactus.auth", name = "enabled", havingValue = "true", matchIfMissing = false)
@EntityScan(basePackages = "com.dongkuk.dmes.cactus.security.auth")
@EnableJpaRepositories(basePackages = "com.dongkuk.dmes.cactus.security.auth")
public class CactusAuthAutoConfiguration {

    /** BCrypt 비밀번호 인코더 빈을 생성한다. */
    @Bean
    @ConditionalOnMissingBean
    public PasswordEncoder passwordEncoder() {
        return new PasswordEncoder();
    }

    /** 인증 서비스 빈을 생성한다. */
    @Bean
    @ConditionalOnMissingBean
    public AuthService authService(JwtTokenProvider tokenProvider,
                                   PasswordEncoder passwordEncoder,
                                   SecUserRepository secUserRepository,
                                   CactusProperties properties) {
        return new AuthService(tokenProvider, passwordEncoder, secUserRepository, properties);
    }
}
