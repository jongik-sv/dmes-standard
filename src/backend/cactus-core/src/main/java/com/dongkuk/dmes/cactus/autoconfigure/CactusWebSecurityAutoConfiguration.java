package com.dongkuk.dmes.cactus.autoconfigure;

import com.dongkuk.dmes.cactus.security.filter.ClientKeyFilter;
import com.dongkuk.dmes.cactus.security.jwt.JwtAuthenticationFilter;
import com.dongkuk.dmes.cactus.security.jwt.JwtTokenProvider;
import com.dongkuk.dmes.cactus.web.filter.RequestIdFilter;
import com.dongkuk.dmes.cactus.web.filter.TxIdFilter;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigureAfter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import java.util.List;

/**
 * Cactus 통합 웹 보안 자동 구성.
 *
 * <p>활성 조건: {@code cactus.jwt.secret} 프로퍼티 정의 + servlet 웹 애플리케이션 +
 * Spring Security 클래스패스 존재.
 *
 * <p>등록 빈:
 * <ul>
 *     <li>{@link SecurityFilterChain} — default 매처 + TxId/RequestId/ClientKey/JWT 통합 필터.
 *         소비 모듈이 자체 {@code SecurityFilterChain} 빈을 정의한 경우 등록되지 않음
 *         ({@code @ConditionalOnMissingBean}).</li>
 *     <li>{@link TxIdFilter} — cactus 표준 필터(항상 등록). MDC {@code txId}/{@code service_tag} 부여.
 *         체인 최상단(RequestIdFilter/ClientKeyFilter 보다 앞)에서 동작해야 ClientKey 401 short-circuit 응답 로그에도 txId 가 부여된다.</li>
 *     <li>{@link RequestIdFilter} — cactus 표준 필터(항상 등록)</li>
 *     <li>{@link ClientKeyFilter} — {@code cactus.security.client-key} 가 정의된 경우만 등록</li>
 *     <li>각 필터의 {@link FilterRegistrationBean} ({@code setEnabled(false)}) — servlet 측
 *         자동 등록 차단(이중 등록 방지)</li>
 * </ul>
 */
@AutoConfiguration
@AutoConfigureAfter(SecurityAutoConfiguration.class)
@ConditionalOnClass({SecurityFilterChain.class, HttpSecurity.class})
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@ConditionalOnProperty(prefix = "cactus.jwt", name = "secret")
public class CactusWebSecurityAutoConfiguration {

    /**
     * TxId 필터 빈 (항상 등록).
     * MDC {@code txId} 8자리 임시 UUID 와 {@code service_tag} 4자리를 부여한다.
     * SecurityFilterChain 최상단(RequestIdFilter/ClientKeyFilter 앞)에 배치해야
     * ClientKey 검증 401 short-circuit 응답 로그에도 txId 가 정상 부여된다.
     */
    @Bean
    @ConditionalOnMissingBean
    public TxIdFilter cactusTxIdFilter() {
        return new TxIdFilter();
    }

    /** RequestId 필터 빈 (항상 등록). */
    @Bean
    @ConditionalOnMissingBean
    public RequestIdFilter cactusRequestIdFilter() {
        return new RequestIdFilter();
    }

    /** ClientKey 필터 빈 — {@code cactus.security.client-key} 가 정의된 경우에만 활성. */
    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnProperty(prefix = "cactus.security", name = "client-key")
    public ClientKeyFilter cactusClientKeyFilter(
            @Value("${cactus.security.client-key:}") String configClientKey,
            @Value("${cactus.security.client-key-skip-paths:}") List<String> skipPaths) {
        return new ClientKeyFilter(configClientKey, skipPaths);
    }

    /**
     * default {@link SecurityFilterChain} — 소비 모듈이 자체 빈을 등록하지 않은 경우에만 사용.
     */
    @Bean
    @ConditionalOnMissingBean(SecurityFilterChain.class)
    public SecurityFilterChain cactusDefaultSecurityFilterChain(
            HttpSecurity http,
            JwtTokenProvider tokenProvider,
            ObjectProvider<ClientKeyFilter> clientKeyFilterProvider,
            RequestIdFilter requestIdFilter,
            TxIdFilter txIdFilter) throws Exception {

        JwtAuthenticationFilter jwtFilter = new JwtAuthenticationFilter(tokenProvider);

        // 필터 실행 순서를 명시 target 의 사슬로 보장:
        //   txIdFilter → before requestIdFilter
        //   requestIdFilter → before (clientKey | jwtFilter)
        //   clientKeyFilter → before jwtFilter
        //   jwtFilter → before UsernamePasswordAuthenticationFilter
        // 같은 target 으로 addFilterBefore 를 반복 호출하는 패턴은 Spring Security 7 에서
        // 등록 순서가 결과 순서를 모호하게 만들 수 있으므로, 각 필터를 서로 다른 target 으로
        // 사슬 연결하여 실행 순서를 명시한다.
        http
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/auth/**").permitAll()
                        .requestMatchers("/actuator/health").permitAll()
                        .requestMatchers("/oasis/**").authenticated()
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);

        ClientKeyFilter clientKeyFilter = clientKeyFilterProvider.getIfAvailable();
        if (clientKeyFilter != null) {
            // clientKey → before jwtFilter
            http.addFilterBefore(clientKeyFilter, JwtAuthenticationFilter.class);
            // requestId → before clientKey
            http.addFilterBefore(requestIdFilter, ClientKeyFilter.class);
        } else {
            // clientKey 가 없으면 requestId 가 jwt 직전
            http.addFilterBefore(requestIdFilter, JwtAuthenticationFilter.class);
        }

        // txId → before requestId
        http.addFilterBefore(txIdFilter, RequestIdFilter.class);

        return http.build();
    }

    /** servlet 컨테이너 측 자동 등록 차단 — JwtAuthenticationFilter. */
    @Bean
    public FilterRegistrationBean<JwtAuthenticationFilter> jwtAuthenticationFilterRegistration(
            JwtTokenProvider tokenProvider) {
        FilterRegistrationBean<JwtAuthenticationFilter> registration =
                new FilterRegistrationBean<>(new JwtAuthenticationFilter(tokenProvider));
        registration.setEnabled(false);
        return registration;
    }

    /** servlet 컨테이너 측 자동 등록 차단 — ClientKeyFilter. */
    @Bean
    @ConditionalOnProperty(prefix = "cactus.security", name = "client-key")
    public FilterRegistrationBean<ClientKeyFilter> clientKeyFilterRegistration(
            ClientKeyFilter clientKeyFilter) {
        FilterRegistrationBean<ClientKeyFilter> registration =
                new FilterRegistrationBean<>(clientKeyFilter);
        registration.setEnabled(false);
        return registration;
    }

    /** servlet 컨테이너 측 자동 등록 차단 — RequestIdFilter. */
    @Bean
    public FilterRegistrationBean<RequestIdFilter> requestIdFilterRegistration(
            RequestIdFilter requestIdFilter) {
        FilterRegistrationBean<RequestIdFilter> registration =
                new FilterRegistrationBean<>(requestIdFilter);
        registration.setEnabled(false);
        return registration;
    }

    /** servlet 컨테이너 측 자동 등록 차단 — TxIdFilter. */
    @Bean
    public FilterRegistrationBean<TxIdFilter> txIdFilterRegistration(
            TxIdFilter txIdFilter) {
        FilterRegistrationBean<TxIdFilter> registration =
                new FilterRegistrationBean<>(txIdFilter);
        registration.setEnabled(false);
        return registration;
    }
}
