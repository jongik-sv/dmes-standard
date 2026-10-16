package com.dongkuk.dmes.mcm.config;

import java.util.ArrayList;
import java.util.List;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AuthorizeHttpRequestsConfigurer;
import org.springframework.stereotype.Component;

/**
 * mcm-core URL 매처 default — 02 §5 권고 1.
 *
 * <p>사이트 SecurityConfig 가 {@link #applyTo} 를 호출하여 default 매처를 일괄 적용한 뒤
 * 사이트 특이 매처를 추가하는 패턴.
 *
 * <p>cactus / Spring Security 에 의존하지만 cactus 가 아닌 표준 Spring Security 만 import.
 */
@Component
public class McmSecurityDefaults {

    /** 로그인만 요구하는 OASIS {@code 서비스ID/action} — 본인 메뉴 / 즐겨찾기 / 포털 기본 화면. {@code **} 는 그 서비스의 모든 action. */
    private static final List<String> AUTHENTICATED_ACTIONS = List.of(
            "secUser/myMenus",
            "secUser/myMenusTree",
            "secUser/myPermissions",
            "secFavorite/**",
            "secStartPgm/**"); // 포털 기본 화면(본인 데이터)

    /**
     * 사이트 SecurityConfig 의 {@code authorizeHttpRequests} 안에서 호출.
     *
     * <pre>{@code
     * .authorizeHttpRequests(auth -> {
     *     mcmSecurityDefaults.applyTo(auth);
     *     auth.requestMatchers("/site/specific/**").authenticated();
     *     auth.anyRequest().authenticated();
     * })
     * }</pre>
     */
    public void applyTo(AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry auth) {
        // permitAll
        auth.requestMatchers("/api/auth/**").permitAll();
        auth.requestMatchers("/actuator/health", "/actuator/info").permitAll();

        // SYSADMIN 전용 matcher 는 남지 않았다(2026-10-16, BE 리팩토링 2회차). BPMN 이 없는 옛 권한 마스터 서비스
        // (secRole·secPerm·secObj·secMenu·secRolePerm·secUserRole·secRoleGroup·secCode)의 것은 D3 에서, 쓰이지 않던
        // secUser/save·resetPassword 는 F7 에서 BPMN action 과 함께 지웠다. 실제 권한 마스터 서비스(csa/comm*Mng)의 gate 는 F8(결정 대기)이다.
        auth.requestMatchers(oasisPaths(AUTHENTICATED_ACTIONS)).authenticated();
    }

    private static String[] oasisPaths(List<String> suffixes) {
        List<String> paths = new ArrayList<>();
        for (String suffix : suffixes) {
            String normalized = suffix.startsWith("/") ? suffix : "/" + suffix;
            paths.add("/oasis" + normalized);
            paths.add("/mcm/oasis" + normalized);
            paths.add("/api/mcm/oasis" + normalized);
        }
        return paths.toArray(String[]::new);
    }
}
