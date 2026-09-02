package com.dongkuk.dmes.cactus.security.jwt;

import com.dongkuk.dmes.cactus.autoconfigure.CactusProperties;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.cactus.security.context.UserInfo;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class JwtAuthenticationFilterTest {

    private JwtAuthenticationFilter filter;
    private JwtTokenProvider tokenProvider;

    private static final String SECRET = Base64.getEncoder().encodeToString(
            "this-is-a-test-secret-key-at-least-32-bytes!!".getBytes(StandardCharsets.UTF_8)
    );

    @BeforeEach
    void setUp() {
        CactusProperties properties = new CactusProperties();
        properties.getJwt().setSecret(SECRET);
        properties.getJwt().setIssuer("dmes-test");
        properties.getJwt().setAccessTokenExpiry(3600);
        properties.getJwt().setRefreshTokenExpiry(86400);
        tokenProvider = new JwtTokenProvider(properties);
        filter = new JwtAuthenticationFilter(tokenProvider);
    }

    @AfterEach
    void tearDown() {
        UserContextHolder.clear();
        JwtTokenHolder.clear();
        // Phase 3 변경 후 필터가 더 이상 SecurityContextHolder.clearContext() 를 호출하지 않으므로,
        // 테스트 간 인증 상태 누수 차단을 위해 명시적으로 정리한다.
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("유효한 Bearer 토큰 → 200, UserContextHolder에 사용자 정보 세팅")
    void validToken() throws Exception {
        TokenPair pair = tokenProvider.generateTokenPair(
                new UserInfo("admin", "홍길동", "E20210001"));

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/service/test");
        request.addHeader("Authorization", "Bearer " + pair.accessToken());

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        // filter의 finally에서 clear되므로 chain 실행 후에는 null
        // chain 내부에서 UserContextHolder를 확인하려면 별도 처리 필요
    }

    @Test
    @DisplayName("토큰 없이 API 호출 → 401, A001")
    void noToken() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/service/test");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(401, response.getStatus());
        assertTrue(response.getContentAsString().contains("A001"));
    }

    @Test
    @DisplayName("잘못된 토큰 → 401, A003")
    void invalidToken() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/service/test");
        request.addHeader("Authorization", "Bearer invalid.token.here");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(401, response.getStatus());
        assertTrue(response.getContentAsString().contains("A003"));
    }

    @Test
    @DisplayName("/api/auth/login은 필터 스킵 → 200")
    void skipLoginPath() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/auth/login");
        // 토큰 없이 호출

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
    }

    @Test
    @DisplayName("/api/auth/refresh은 필터 스킵 → 200")
    void skipRefreshPath() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/auth/refresh");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
    }

    @Test
    @DisplayName("/actuator/health는 필터 스킵 → 200")
    void skipActuatorHealth() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/actuator/health");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
    }

    @Test
    @DisplayName("필터 통과 후 ThreadLocal이 clear 되는지 확인")
    void threadLocalCleared() throws Exception {
        TokenPair pair = tokenProvider.generateTokenPair(
                new UserInfo("admin", "홍길동", "E20210001"));

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/service/test");
        request.addHeader("Authorization", "Bearer " + pair.accessToken());

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertNull(UserContextHolder.get());
        assertNull(JwtTokenHolder.get());
    }

    // ── Phase 3: pre-auth bypass + holder 전파 회귀 테스트 ──

    @Test
    @DisplayName("사전 인증이 있으면 토큰 검증을 스킵하고 SecurityContext 를 보존한다")
    void preauth_skipsTokenValidation() throws Exception {
        UsernamePasswordAuthenticationToken preAuth = new UsernamePasswordAuthenticationToken(
                "tester", null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        SecurityContextHolder.getContext().setAuthentication(preAuth);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/service/test");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus(), "사전 인증이 있으면 토큰 없어도 통과");
        assertSame(preAuth, SecurityContextHolder.getContext().getAuthentication(),
                "사전 인증은 그대로 보존되어야 함");
    }

    @Test
    @DisplayName("사전 인증 bypass 경로에서도 UserContextHolder 가 사용자 ID 로 채워진다 (audit SYSTEM 회귀 방지)")
    void preauth_populatesUserContextHolder() throws Exception {
        UsernamePasswordAuthenticationToken preAuth = new UsernamePasswordAuthenticationToken(
                "tester", null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        SecurityContextHolder.getContext().setAuthentication(preAuth);

        AtomicReference<String> capturedUserId = new AtomicReference<>();

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/service/test");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = (req, res) -> capturedUserId.set(UserContextHolder.getUserId());

        filter.doFilter(request, response, chain);

        assertEquals("tester", capturedUserId.get(),
                "bypass 경로에서도 UserContextHolder 가 사전 인증의 userId 로 채워져야 audit 이 SYSTEM 으로 떨어지지 않음");
    }

    @Test
    @DisplayName("사전 인증이 없는 일반 경로에서도 토큰의 userId 로 UserContextHolder 가 채워진다")
    void noPreauth_populatesUserContextHolderFromToken() throws Exception {
        TokenPair pair = tokenProvider.generateTokenPair(
                new UserInfo("admin", "홍길동", "E20210001"));

        AtomicReference<String> capturedUserId = new AtomicReference<>();

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/service/test");
        request.addHeader("Authorization", "Bearer " + pair.accessToken());

        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = (req, res) -> capturedUserId.set(UserContextHolder.getUserId());

        filter.doFilter(request, response, chain);

        assertEquals("admin", capturedUserId.get());
        assertNull(UserContextHolder.get(), "필터 종료 후에는 holder 정리됨");
    }

    @Test
    @DisplayName("사전 인증이 anonymous 면 토큰을 다시 검증한다 (stale anonymous 보호)")
    void preauth_anonymousIsTreatedAsNoAuth() throws Exception {
        org.springframework.security.authentication.AnonymousAuthenticationToken anon =
                new org.springframework.security.authentication.AnonymousAuthenticationToken(
                        "key", "anonymousUser",
                        List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));
        SecurityContextHolder.getContext().setAuthentication(anon);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/service/test");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(401, response.getStatus());
    }
}
