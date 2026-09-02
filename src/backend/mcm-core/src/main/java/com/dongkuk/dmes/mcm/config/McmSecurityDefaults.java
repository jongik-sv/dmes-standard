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

    private static final String SYSADMIN = "ROLE_SYSADMIN";

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

        // SYSADMIN 전용 — 권한 마스터 변경
        auth.requestMatchers(oasisPaths("secUser/save", "secUser/resetPassword")).hasAuthority(SYSADMIN);
        auth.requestMatchers(oasisPaths("secRole/save")).hasAuthority(SYSADMIN);
        auth.requestMatchers(oasisPaths("secPerm/save")).hasAuthority(SYSADMIN);
        auth.requestMatchers(oasisPaths("secObj/save")).hasAuthority(SYSADMIN);
        auth.requestMatchers(oasisPaths("secMenu/save")).hasAuthority(SYSADMIN);
        auth.requestMatchers(oasisPaths("secRolePerm/save")).hasAuthority(SYSADMIN);
        auth.requestMatchers(oasisPaths("secUserRole/save")).hasAuthority(SYSADMIN);
        auth.requestMatchers(oasisPaths(
                             "secRoleGroup/save",
                             "secRoleGroup/assignRoles",
                             "secRoleGroup/assignUsers")).hasAuthority(SYSADMIN);
        auth.requestMatchers(oasisPaths("secCode/save")).hasAuthority(SYSADMIN);

        // authenticated — 본인 메뉴 / 즐겨찾기 / 페이지 접근 이력 등
        auth.requestMatchers(oasisPaths(
                             "secUser/myMenus",
                             "secUser/myMenusTree",
                             "secUser/myPermissions")).authenticated();
        auth.requestMatchers(oasisPaths("secFavorite/**")).authenticated();
        auth.requestMatchers(oasisPaths("secMenu/recordAccess")).authenticated();
    }

    private static String[] oasisPaths(String... suffixes) {
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
