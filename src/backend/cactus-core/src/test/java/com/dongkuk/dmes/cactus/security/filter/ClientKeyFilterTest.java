package com.dongkuk.dmes.cactus.security.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;

/**
 * {@link ClientKeyFilter} 단위 테스트.
 *
 * <p>핵심 회귀 케이스: 사전 인증된 SecurityContext 가 있으면 X-Client-Key 검증을 스킵해야 함
 * (MockMvc {@code with(user(...))} 시나리오 보호 — JwtAuthenticationFilter 와 동일 정책).
 */
class ClientKeyFilterTest {

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("올바른 X-Client-Key → 통과")
    void validKey_passes() throws ServletException, IOException {
        ClientKeyFilter filter = new ClientKeyFilter("secret-key", null);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/something");
        request.addHeader("X-Client-Key", "secret-key");

        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean chainCalled = new AtomicBoolean(false);
        FilterChain chain = (req, res) -> chainCalled.set(true);

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertTrue(chainCalled.get());
    }

    @Test
    @DisplayName("잘못된 X-Client-Key → 401")
    void wrongKey_returns401() throws ServletException, IOException {
        ClientKeyFilter filter = new ClientKeyFilter("secret-key", null);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/something");
        request.addHeader("X-Client-Key", "wrong");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(401, response.getStatus());
    }

    @Test
    @DisplayName("길이는 같고 내용이 다른 X-Client-Key → 401 (바이트 비교)")
    void sameLengthDifferentKey_returns401() throws ServletException, IOException {
        assertEquals(401, statusFor("secret-key", "secret-kez"));
        assertEquals(401, statusFor("secret-key", "Secret-key"));
    }

    @Test
    @DisplayName("길이가 다른 X-Client-Key(앞부분만 같음·더 김) → 401")
    void differentLengthKey_returns401() throws ServletException, IOException {
        assertEquals(401, statusFor("secret-key", "secret"));
        assertEquals(401, statusFor("secret-key", "secret-key-extra"));
        assertEquals(401, statusFor("secret-key", "secret-key "));
    }

    @Test
    @DisplayName("빈 X-Client-Key 헤더·헤더 없음 → 401")
    void emptyOrMissingKey_returns401() throws ServletException, IOException {
        assertEquals(401, statusFor("secret-key", ""));
        assertEquals(401, statusFor("secret-key", null));
    }

    @Test
    @DisplayName("한글 등 UTF-8 키도 같은 값이면 통과, 다르면 401")
    void utf8Key_comparedAsBytes() throws ServletException, IOException {
        assertEquals(200, statusFor("비밀-키", "비밀-키"));
        assertEquals(401, statusFor("비밀-키", "비밀-귀"));
    }

    /** 키를 설정한 필터에 헤더(null 이면 넣지 않음)를 보내 응답 상태를 돌려준다. 통과면 체인이 불려야 한다. */
    private static int statusFor(String configuredKey, String headerValue) throws ServletException, IOException {
        ClientKeyFilter filter = new ClientKeyFilter(configuredKey, null);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/something");
        if (headerValue != null) {
            request.addHeader("X-Client-Key", headerValue);
        }
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean chainCalled = new AtomicBoolean(false);
        FilterChain chain = (req, res) -> chainCalled.set(true);

        filter.doFilter(request, response, chain);

        assertEquals(response.getStatus() == 200, chainCalled.get(), "통과일 때만 체인을 부른다");
        return response.getStatus();
    }

    @Test
    @DisplayName("키 미설정 시 검증 스킵 (개발 편의)")
    void noKeyConfigured_passes() throws ServletException, IOException {
        ClientKeyFilter filter = new ClientKeyFilter("", null);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/something");

        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean chainCalled = new AtomicBoolean(false);
        FilterChain chain = (req, res) -> chainCalled.set(true);

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertTrue(chainCalled.get());
    }

    @Test
    @DisplayName("default skip 경로(/api/auth/) 는 검증 스킵")
    void defaultSkipPath_passes() throws ServletException, IOException {
        ClientKeyFilter filter = new ClientKeyFilter("secret-key", null);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/auth/login");
        // X-Client-Key 헤더 없음 — skip 대상

        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean chainCalled = new AtomicBoolean(false);
        FilterChain chain = (req, res) -> chainCalled.set(true);

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertTrue(chainCalled.get());
    }

    // ── Phase 3: pre-auth bypass 회귀 케이스 ──

    @Test
    @DisplayName("사전 인증된 SecurityContext 가 있으면 X-Client-Key 검증을 스킵 (MockMvc with(user) 보호)")
    void preauth_bypassesClientKeyValidation() throws ServletException, IOException {
        ClientKeyFilter filter = new ClientKeyFilter("secret-key", null);

        UsernamePasswordAuthenticationToken preAuth = new UsernamePasswordAuthenticationToken(
                "tester", null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        SecurityContextHolder.getContext().setAuthentication(preAuth);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/something");
        // X-Client-Key 헤더 없음 — 사전 인증으로 bypass 되어야 함

        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean chainCalled = new AtomicBoolean(false);
        FilterChain chain = (req, res) -> chainCalled.set(true);

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus(), "사전 인증이 있으면 X-Client-Key 없어도 통과");
        assertTrue(chainCalled.get());
    }

    @Test
    @DisplayName("사전 인증이 anonymous 면 X-Client-Key 검증 진행 (stale anonymous 보호)")
    void anonymousAuth_doesNotBypass() throws ServletException, IOException {
        ClientKeyFilter filter = new ClientKeyFilter("secret-key", null);

        AnonymousAuthenticationToken anon = new AnonymousAuthenticationToken(
                "key", "anonymousUser", List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));
        SecurityContextHolder.getContext().setAuthentication(anon);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/something");
        // X-Client-Key 헤더 없음 — anonymous 라 bypass 되지 않아야 함

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(401, response.getStatus());
    }
}
