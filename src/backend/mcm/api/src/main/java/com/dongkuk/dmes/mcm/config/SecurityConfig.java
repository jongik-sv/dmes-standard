package com.dongkuk.dmes.mcm.config;

import com.dongkuk.dmes.cactus.security.filter.ClientKeyFilter;
import com.dongkuk.dmes.cactus.security.jwt.JwtAuthenticationFilter;
import com.dongkuk.dmes.cactus.security.jwt.JwtTokenProvider;
import com.dongkuk.dmes.cactus.web.filter.RequestIdFilter;
import com.dongkuk.dmes.cactus.web.filter.TxIdFilter;
import com.dongkuk.dmes.mcm.config.McmSecurityDefaults;
import com.dongkuk.dmes.mcm.security.endpoint.EndpointPermissionFilter;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * MCM 보안 구성 — cactus default {@link SecurityFilterChain} override.
 *
 * <p>cactus 의 {@code CactusWebSecurityAutoConfiguration} 이
 * {@code @ConditionalOnMissingBean(SecurityFilterChain.class)} 로 제공하는 default 빈을
 * 본 빈이 정의되면 비활성화한다. cactus 가 제공하는 servlet 필터 4종
 * ({@link TxIdFilter}, {@link JwtAuthenticationFilter}, {@link ClientKeyFilter}, {@link RequestIdFilter}) 을
 * SecurityFilterChain 에 통합 등록한다. 각 {@link FilterRegistrationBean} 자동 등록 차단은
 * cactus 가 이미 {@code setEnabled(false)} 로 처리한다.
 *
 * <p>필터 순서: {@code txId → requestId → clientKey → jwt → revokedToken → endpointPerm → UsernamePasswordAuthenticationFilter}.
 *
 * <p>매처:
 * <ul>
 *     <li>mcm-core {@link McmSecurityDefaults} 에서 default 매처 적용 (api-auth permitAll 등)</li>
 *     <li>{@code /kafkaApi/**} — internal-only (RFC1918 사설 IP 만, caravan-console-MCM Phase 3 [3-1]) — caravan 인스턴스 간 호출용</li>
 *     <li>{@code /caravanConsole/**} — authenticated (caravan-console 컨트롤러. 권한은 BFF 가 SoT)</li>
 *     <li>나머지 — authenticated</li>
 * </ul>
 *
 * <p>{@code ClientKeyFilter} 의 default skip path 에 이미 {@code /api/auth/} 가 포함되어
 * NextAuth {@code authenticateViaBackend} 호출은 X-Client-Key 검증을 건너뛴다.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity                          // caravan-console-MCM 마이그레이션 Phase 1 [1-5] — caravan-console 컨트롤러 메서드의 @PreAuthorize 활성 (cactus-core 자동 제공 안 함, R10)
public class SecurityConfig {

    // 참고 — 포털 알림(STOMP WebSocket) 스택은 본 표준 템플릿에 포함하지 않는다.
    // 도입 시 /ws/notify 핸드셰이크 전용 체인을 @Order(0) 으로 추가하고(커스텀 필터 미부착),
    // 인증은 핸드셰이크가 아니라 STOMP CONNECT 의 단명 1회용 티켓에서 수행한다.

    @Bean
    @Order(1) // 알림 WS 체인(@Order(0)) 도입 시 그다음 — 나머지 전체 트래픽
    public SecurityFilterChain filterChain(HttpSecurity http,
                                           JwtTokenProvider tokenProvider,
                                           ObjectProvider<ClientKeyFilter> clientKeyFilterProvider,
                                           RequestIdFilter requestIdFilter,
                                           TxIdFilter txIdFilter,
                                           RevokedTokenFilter revokedTokenFilter,
                                           EndpointPermissionFilter endpointPermissionFilter,
                                           McmSecurityDefaults mcmSecurityDefaults) throws Exception {

        JwtAuthenticationFilter jwtFilter = new JwtAuthenticationFilter(tokenProvider);

        // 필터 실행 순서를 명시 target 의 사슬로 보장 — txId → requestId → (clientKey) → jwt → revokedToken → endpointPerm
        http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> {
                // 02 §5 권고 1 — mcm-core default URL 매처 (SYSADMIN / authenticated)
                mcmSecurityDefaults.applyTo(auth);
                // actuator health 는 무인증 노출 (cactus default 및 타 모듈과 톤 통일). anyRequest 보다 먼저.
                auth.requestMatchers("/actuator/health").permitAll();
                // caravan-console-MCM Phase 3 [3-1] — caravan /kafkaApi/** 는 caravan 인스턴스 간 호출용. 외부 노출 금지.
                // NGINX 측에서도 /kafkaApi/** 외부 차단 룰 병행 (Phase 8 운영 매뉴얼).
                auth.requestMatchers("/kafkaApi/**").access(internalOnly());
                // caravan-console-MCM Phase 3 [3-1] — caravan-console 진입점. 권한 검증은 BFF (api-permission-cache) 가 SoT.
                auth.requestMatchers("/caravanConsole/**").authenticated();
                // 사이트 특이 매처 (없으면 anyRequest 만)
                auth.anyRequest().authenticated();
            })
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
            // 갭 #12 — JwtAuthenticationFilter 통과 후 jti 블랙리스트 체크
            .addFilterAfter(revokedTokenFilter, JwtAuthenticationFilter.class)
            // PERM_BUTTON.endpoint 기반 동적 권한체크 (revokedToken 이후, 비즈니스 진입 전)
            .addFilterAfter(endpointPermissionFilter, RevokedTokenFilter.class);

        ClientKeyFilter clientKeyFilter = clientKeyFilterProvider.getIfAvailable();
        if (clientKeyFilter != null) {
            http.addFilterBefore(clientKeyFilter, JwtAuthenticationFilter.class);
            http.addFilterBefore(requestIdFilter, ClientKeyFilter.class);
        } else {
            http.addFilterBefore(requestIdFilter, JwtAuthenticationFilter.class);
        }

        http.addFilterBefore(txIdFilter, RequestIdFilter.class);

        return http.build();
    }

    /**
     * EndpointPermissionFilter 가 servlet container 에 자동 등록되어 SecurityFilterChain 외부에서
     * 두 번째로 실행되는 것을 막는다.
     */
    @Bean
    public FilterRegistrationBean<EndpointPermissionFilter> endpointPermissionFilterRegistration(
            EndpointPermissionFilter filter) {
        FilterRegistrationBean<EndpointPermissionFilter> r = new FilterRegistrationBean<>(filter);
        r.setEnabled(false);
        return r;
    }

    /**
     * RFC1918 사설 IP 만 허용하는 AuthorizationManager. caravan 의 {@code /kafkaApi/**} 는
     * caravan 인스턴스 간 호출용이라 외부 노출 금지 (caravan-console-MCM Phase 3 [3-1]).
     *
     * <p>운영 NGINX 가 {@code X-Forwarded-For} 를 추가하더라도 본 매처는 {@code remoteAddr}(NGINX IP)
     * 만 보고 통과시킬 수 있음 — NGINX 측에 {@code /kafkaApi/**} 외부 차단 location 룰 병행 필요
     * (Phase 8 운영 매뉴얼).</p>
     */
    private AuthorizationManager<RequestAuthorizationContext> internalOnly() {
        return (auth, ctx) -> {
            String remoteAddr = ctx.getRequest().getRemoteAddr();
            boolean isInternal = remoteAddr != null && (
                    remoteAddr.startsWith("10.")
                    || remoteAddr.startsWith("172.")
                    || remoteAddr.startsWith("192.168.")
                    || remoteAddr.equals("127.0.0.1")
                    || remoteAddr.equals("0:0:0:0:0:0:0:1")
                    || remoteAddr.equals("::1")
            );
            return new AuthorizationDecision(isInternal);
        };
    }
}
