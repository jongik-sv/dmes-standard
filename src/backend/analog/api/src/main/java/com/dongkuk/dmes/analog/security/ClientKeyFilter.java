package com.dongkuk.dmes.analog.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

/**
 * 프론트엔드 BFF에서 전달되는 {@code X-Client-Key} 헤더를 검증하는 필터.
 *
 * <p><b>출처</b> — cactus-core {@code com.dongkuk.dmes.cactus.security.filter.ClientKeyFilter}
 * 의 소형 복제. analog 는 공유 lib(cactus) 무의존 격리 빌드라 필터 클래스를 로컬에 미러한다.
 * 키 우선순위(env {@code BACKEND_CLIENT_KEY} > yml {@code cactus.security.client-key}),
 * 헤더명, default skip 경로, 401 JSON 응답 형식(errorCode A001)은 원본과 동일하다.
 *
 * <p><b>원본과의 차이</b> — analog 는 Spring Security 를 쓰지 않으므로
 * 사전 인증(SecurityContext) bypass 분기와 {@code X-Authenticated-User}/{@code X-Authenticated-Role}
 * 헤더의 SecurityContext 사전 인증 세팅을 제거했다. analog 에는 사용자 권한 모델이 없어
 * BFF 가 부착해 보내는 사용자 컨텍스트 헤더는 소비하지 않는다(무시).
 *
 * <p>키 우선순위:
 * <ol>
 *     <li>환경 변수 {@code BACKEND_CLIENT_KEY} (운영 권장)</li>
 *     <li>{@code application.yml} 의 {@code cactus.security.client-key} (개발 default)</li>
 * </ol>
 *
 * <p>두 값 모두 비어 있으면 검증을 스킵한다(개발 편의).
 * default skip 경로: {@code /auth/*}, {@code /api/auth/**}, {@code /actuator/*}.
 */
public class ClientKeyFilter extends OncePerRequestFilter {

    /** 로거 */
    private static final Logger log = LoggerFactory.getLogger(ClientKeyFilter.class);

    /** 클라이언트 키 헤더명 */
    private static final String HEADER_CLIENT_KEY = "X-Client-Key";

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

        chain.doFilter(request, response);
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
