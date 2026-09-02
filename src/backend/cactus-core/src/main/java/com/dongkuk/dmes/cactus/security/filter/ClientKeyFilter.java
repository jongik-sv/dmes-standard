package com.dongkuk.dmes.cactus.security.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * 프론트엔드 BFF에서 전달되는 {@code X-Client-Key} 헤더를 검증하는 필터.
 *
 * <p>키 우선순위:
 * <ol>
 *     <li>환경 변수 {@code BACKEND_CLIENT_KEY} (운영 권장)</li>
 *     <li>{@code application.yml} 의 {@code cactus.security.client-key} (개발 default)</li>
 * </ol>
 *
 * <p>두 값 모두 비어 있으면 검증을 스킵한다(개발 편의).
 * default skip 경로: {@code /auth/*}, {@code /api/auth/**}, {@code /actuator/*}.
 *
 * <p>활성 조건은 {@link com.dongkuk.dmes.cactus.autoconfigure.CactusWebSecurityAutoConfiguration}
 * 에서 {@code cactus.security.client-key} 프로퍼티가 정의된 경우에만 빈으로 등록된다.
 *
 * <p><b>BFF 신뢰 채널 모델</b> — X-Client-Key 검증이 성공하면 BFF 호출로 간주하고,
 * {@code X-Authenticated-User} / {@code X-Authenticated-Role} 헤더의 값으로
 * SecurityContext 에 사전 인증을 set 한다. 후속 {@link com.dongkuk.dmes.cactus.security.jwt.JwtAuthenticationFilter}
 * 는 사전 인증 보존 분기로 진입해 JWT 검증을 스킵한다. 즉 BFF↔BE 구간은 shared secret(X-Client-Key)
 * 으로 신뢰하고, 사용자 컨텍스트는 별도 헤더로 전달한다.
 */
public class ClientKeyFilter extends OncePerRequestFilter {

    /** 로거 */
    private static final Logger log = LoggerFactory.getLogger(ClientKeyFilter.class);

    /** 클라이언트 키 헤더명 */
    private static final String HEADER_CLIENT_KEY = "X-Client-Key";

    /** 사용자 식별 헤더명 (BFF 가 부착) */
    private static final String HEADER_AUTH_USER = "X-Authenticated-User";

    /** 사용자 역할 헤더명 (BFF 가 부착). 콤마 구분 다중값 허용. */
    private static final String HEADER_AUTH_ROLE = "X-Authenticated-Role";

    /** 환경 변수에서 우선 조회할 키 이름 */
    private static final String ENV_KEY_NAME = "BACKEND_CLIENT_KEY";

    /** default 스킵 경로 — Spring AntPathMatcher 패턴이 아닌 prefix 매칭 */
    private static final List<String> DEFAULT_SKIP_PATHS = List.of(
            "/auth/",
            "/api/auth/",
            "/actuator/"
    );

    /** 실제 검증에 사용될 클라이언트 키 (env > yml fallback) */
    private final String expectedClientKey;

    /** 추가 스킵 경로 (yml override) */
    private final List<String> skipPaths;

    /**
     * ClientKeyFilter 생성자.
     *
     * @param configClientKey {@code cactus.security.client-key} fallback 값
     * @param extraSkipPaths  {@code cactus.security.client-key-skip-paths} 추가 prefix 목록
     */
    public ClientKeyFilter(String configClientKey, List<String> extraSkipPaths) {
        String envValue = System.getenv(ENV_KEY_NAME);
        this.expectedClientKey = (envValue != null && !envValue.isBlank())
                ? envValue
                : configClientKey;
        this.skipPaths = (extraSkipPaths == null || extraSkipPaths.isEmpty())
                ? DEFAULT_SKIP_PATHS
                : Collections.unmodifiableList(extraSkipPaths);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {

        String path = request.getRequestURI();

        // skip 경로면 통과
        if (isSkipPath(path)) {
            chain.doFilter(request, response);
            return;
        }

        // 사전 인증된 SecurityContext 가 있으면 검증 스킵 (예: MockMvc with(user(...)),
        // 또는 상위 필터가 이미 인증 처리한 경우). JwtAuthenticationFilter 와 동일한 정책.
        Authentication preExisting = SecurityContextHolder.getContext().getAuthentication();
        if (preExisting != null
                && preExisting.isAuthenticated()
                && !(preExisting instanceof AnonymousAuthenticationToken)) {
            chain.doFilter(request, response);
            return;
        }

        // 검증 키 미설정 시 통과(개발 편의)
        if (expectedClientKey == null || expectedClientKey.isBlank()) {
            chain.doFilter(request, response);
            return;
        }

        String headerValue = request.getHeader(HEADER_CLIENT_KEY);
        if (!expectedClientKey.equals(headerValue)) {
            log.warn("[ClientKey] 클라이언트 키 불일치: path={}", path);
            sendError(response);
            return;
        }

        // X-Client-Key 검증 성공 → BFF 신뢰 채널.
        // X-Authenticated-User / X-Authenticated-Role 헤더로 SecurityContext 사전 인증을 set.
        // 후속 JwtAuthenticationFilter 는 사전 인증 보존 분기로 진입해 JWT 검증을 스킵한다.
        // 헤더가 없으면 set 하지 않고 통과 — 기존 JWT 검증 흐름으로 자연 폴백.
        String authUser = request.getHeader(HEADER_AUTH_USER);
        if (authUser != null && !authUser.isBlank()) {
            List<SimpleGrantedAuthority> authorities = parseRoleHeader(request.getHeader(HEADER_AUTH_ROLE));
            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(authUser, null, authorities);
            SecurityContextHolder.getContext().setAuthentication(authentication);
        }

        chain.doFilter(request, response);
    }

    /**
     * X-Authenticated-Role 헤더 값을 {@link SimpleGrantedAuthority} 리스트로 파싱한다.
     * <ul>
     *     <li>콤마 구분 다중값 지원 (예: {@code "ROLE_SYSADMIN,ROLE_USER"} 또는 {@code "SYSADMIN,USER"})</li>
     *     <li>{@code ROLE_} prefix 가 없으면 자동 부착 (Spring Security 관용 정책)</li>
     *     <li>blank 항목 무시. 헤더 자체가 없거나 비어 있으면 빈 리스트.</li>
     * </ul>
     */
    private List<SimpleGrantedAuthority> parseRoleHeader(String headerValue) {
        if (headerValue == null || headerValue.isBlank()) {
            return Collections.emptyList();
        }
        List<SimpleGrantedAuthority> result = new ArrayList<>();
        for (String token : Arrays.asList(headerValue.split(","))) {
            String trimmed = token.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            String normalized = trimmed.startsWith("ROLE_") ? trimmed : "ROLE_" + trimmed;
            result.add(new SimpleGrantedAuthority(normalized));
        }
        return result;
    }

    /** 스킵 대상 경로인지 확인한다(prefix 매칭). */
    private boolean isSkipPath(String path) {
        if (path == null) {
            return false;
        }
        for (String prefix : skipPaths) {
            // 트레일링 슬래시가 없는 prefix(/auth) 도 허용
            if (path.startsWith(prefix)) {
                return true;
            }
            // "/auth/" 형태 prefix → "/auth" exact 매칭도 허용
            if (prefix.endsWith("/") && path.equals(prefix.substring(0, prefix.length() - 1))) {
                return true;
            }
        }
        return false;
    }

    /** 401 한국어 JSON 에러 응답을 반환한다. */
    private void sendError(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json;charset=UTF-8");
        String body = String.format(
                "{\"success\":false,\"data\":null,\"message\":\"%s\",\"errorCode\":\"%s\",\"timestamp\":\"%s\"}",
                "유효하지 않은 클라이언트 키입니다",
                "A001",
                LocalDateTime.now());
        response.getWriter().write(body);
    }
}
