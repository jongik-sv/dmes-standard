package com.dongkuk.dmes.cactus.security.jwt;

import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.cactus.security.context.UserInfo;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 모든 요청에 대해 JWT를 검증하는 서블릿 필터.
 *
 * <p>동작 분기:
 * <ul>
 *   <li>요청 진입 시 이미 인증된 {@code SecurityContext} 가 있으면 (예: MockMvc {@code with(user(...))},
 *       또는 다른 상위 필터가 인증) JWT 검증을 스킵하고 사전 인증을 보존한다.
 *       이때 {@link UserContextHolder} 도 사전 인증의 principal/authorities 로 채워
 *       하위 비즈니스 로직(특히 {@link com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor}) 의
 *       audit userId 가 {@code SYSTEM} 으로 떨어지는 회귀를 방지한다.</li>
 *   <li>사전 인증이 없으면 Authorization 헤더의 Bearer 토큰을 검증해
 *       {@link UserContextHolder}, {@link JwtTokenHolder}, {@link SecurityContextHolder} 에 사용자 정보를 세팅한다.
 *       검증 실패 → 401 JSON 응답.</li>
 * </ul>
 *
 * <p>finally 블록에서는 본 필터가 set 한 holder 만 clear 한다 (사전 인증의 holder 는 보존).
 * {@link SecurityContextHolder#clearContext()} 는 호출하지 않는다 — Spring Security 표준
 * {@code SecurityContextHolderFilter} 가 thread-local 정리를 담당한다.
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    /** 로거 */
    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationFilter.class);
    /** Authorization 헤더명 */
    private static final String AUTHORIZATION = "Authorization";
    /** Bearer 토큰 접두사 */
    private static final String BEARER_PREFIX = "Bearer ";

    /** 인증을 건너뛸 경로 접미사 목록 */
    private static final List<String> SKIP_SUFFIXES = Arrays.asList(
            "/api/auth/login",
            "/api/auth/refresh"
    );

    /** 인증을 건너뛸 고정 경로 목록 */
    private static final List<String> SKIP_FIXED = Arrays.asList(
            "/actuator/health",
            "/actuator/info"
    );

    /** JWT 토큰 프로바이더 */
    private final JwtTokenProvider tokenProvider;

    /**
     * JwtAuthenticationFilter 생성자.
     * @param tokenProvider JWT 토큰 프로바이더
     */
    public JwtAuthenticationFilter(JwtTokenProvider tokenProvider) {
        this.tokenProvider = tokenProvider;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        if (shouldSkip(request)) {
            chain.doFilter(request, response);
            return;
        }

        // 1. 사전 인증 확인 — MockMvc with(user(...)) 또는 상위 필터의 인증
        Authentication preExisting = SecurityContextHolder.getContext().getAuthentication();
        boolean hasPreAuth = preExisting != null
                && preExisting.isAuthenticated()
                && !(preExisting instanceof AnonymousAuthenticationToken);

        boolean weSetHolders = false;
        try {
            if (hasPreAuth) {
                // bypass: 사전 인증의 사용자 정보로 UserContextHolder 도 채운다.
                // OasisServiceExecutor 가 UserContextHolder.getUserId() 를 audit 으로 사용하므로
                // 미설정 시 "SYSTEM" 으로 떨어지는 회귀를 방지한다.
                //
                // userId 추출 정책 (안전 폴백):
                //   1) Authentication.getName() — Spring Security 의 표준 식별자.
                //      UserDetails / AuthenticatedPrincipal / Principal 구현 시 정상 동작.
                //   2) custom principal 이 위 인터페이스 미구현 시 toString() 으로 폴백되므로,
                //      blank/null 가드를 둬 "SYSTEM" 으로 떨어지는 것보다 빈 문자열 audit 을 막는다.
                String preAuthUserId = preExisting.getName();
                if (preAuthUserId == null || preAuthUserId.isBlank()) {
                    Object principal = preExisting.getPrincipal();
                    preAuthUserId = principal != null ? principal.toString() : "SYSTEM";
                }
                List<String> roles = preExisting.getAuthorities().stream()
                        .map(GrantedAuthority::getAuthority)
                        .collect(Collectors.toList());
                UserInfo preAuthUserInfo = new UserInfo(
                        preAuthUserId, preAuthUserId, null, roles);
                UserContextHolder.set(preAuthUserInfo);
                weSetHolders = true;

                log.debug("[JWT] 사전 인증 보존: userId={}", preAuthUserId);
                chain.doFilter(request, response);
                return;
            }

            // 2. 토큰 추출 + 검증
            String token = resolveToken(request);
            if (token == null) {
                sendError(response, 401, "A001", "인증 토큰이 없습니다");
                return;
            }

            UserInfo userInfo;
            try {
                userInfo = tokenProvider.validateAndExtract(token);
            } catch (ExpiredJwtException e) {
                sendError(response, 401, "A002", "토큰이 만료되었습니다");
                return;
            } catch (JwtException e) {
                sendError(response, 401, "A003", "유효하지 않은 토큰입니다");
                return;
            }

            // 3. holder + SecurityContext 세팅
            UserContextHolder.set(userInfo);
            JwtTokenHolder.set(token);
            weSetHolders = true;

            List<SimpleGrantedAuthority> authorities = userInfo.roles().stream()
                    .map(SimpleGrantedAuthority::new)
                    .collect(Collectors.toList());

            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(
                            userInfo.userId(), null, authorities);
            SecurityContextHolder.getContext().setAuthentication(authentication);

            log.debug("[JWT] 인증 성공: userId={}, empNo={}",
                    userInfo.userId(), userInfo.userEmpNo());

            chain.doFilter(request, response);

        } finally {
            // 본 필터가 set 한 경우에만 clear — 외부에서 미리 채워둔 holder 는 보존
            // SecurityContextHolder.clearContext() 는 호출하지 않는다 — 표준 SecurityContextHolderFilter 가 처리.
            if (weSetHolders) {
                UserContextHolder.clear();
                JwtTokenHolder.clear();
            }
        }
    }

    /** Authorization 헤더에서 Bearer 토큰을 추출한다. */
    private String resolveToken(HttpServletRequest request) {
        String header = request.getHeader(AUTHORIZATION);
        if (header != null && header.startsWith(BEARER_PREFIX)) {
            return header.substring(BEARER_PREFIX.length());
        }
        return null;
    }

    /** 인증을 건너뛸 경로인지 확인한다. serviceGroup prefix에 무관하게 동작. */
    private boolean shouldSkip(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (SKIP_FIXED.stream().anyMatch(path::startsWith)) {
            return true;
        }
        return SKIP_SUFFIXES.stream().anyMatch(path::endsWith);
    }

    /** 인증 실패 시 JSON 에러 응답을 반환한다. */
    private void sendError(HttpServletResponse response, int status,
                           String errorCode, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        String escapedMessage = (message == null) ? "" : message.replace("\\", "\\\\").replace("\"", "\\\"");
        String body = String.format(
                "{\"success\":false,\"data\":null,\"message\":\"%s\",\"errorCode\":\"%s\",\"timestamp\":\"%s\"}",
                escapedMessage, errorCode, LocalDateTime.now());
        response.getWriter().write(body);
    }
}
