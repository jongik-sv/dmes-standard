package com.dongkuk.dmes.analog.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * {@link ClientKeyFilter} 키 비교 단위 시험 — 통과·거절 결과를 고정한다(cactus-core {@code ClientKeyFilterTest} 의 비교 사례와 같다).
 * 비교 방식(상수 시간 바이트 비교)을 바꿔도 이 결과는 같아야 한다.
 */
class ClientKeyFilterCompareTest {

    /** 필터는 env {@code BACKEND_CLIENT_KEY} 를 설정 키보다 먼저 쓴다 — 이 값이 있는 셸에서는 비교 결과를 고정할 수 없어 건너뛴다. */
    @BeforeAll
    static void noEnvClientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        assumeTrue(env == null || env.isBlank(), "BACKEND_CLIENT_KEY 가 설정된 셸에서는 건너뛴다");
    }

    @Test
    @DisplayName("같은 X-Client-Key → 통과")
    void sameKey_passes() throws ServletException, IOException {
        assertEquals(200, statusFor("secret-key", "secret-key"));
    }

    @Test
    @DisplayName("길이는 같고 내용이 다른 X-Client-Key → 401")
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
    void utf8Key_comparedByValue() throws ServletException, IOException {
        assertEquals(200, statusFor("비밀-키", "비밀-키"));
        assertEquals(401, statusFor("비밀-키", "비밀-귀"));
    }

    @Test
    @DisplayName("거절하면 체인을 부르지 않고 A001 JSON 을 쓴다")
    void rejected_doesNotCallChain() throws ServletException, IOException {
        ClientKeyFilter filter = new ClientKeyFilter("secret-key", null);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/meta");
        request.addHeader("X-Client-Key", "wrong");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean chainCalled = new AtomicBoolean(false);
        FilterChain chain = (req, res) -> chainCalled.set(true);

        filter.doFilter(request, response, chain);

        assertEquals(401, response.getStatus());
        assertFalse(chainCalled.get());
        assertTrue(response.getContentAsString().contains("\"errorCode\":\"A001\""));
    }

    /** 설정 키·헤더 값으로 필터를 한 번 태운 응답 상태. 통과면 체인이 불렸는지도 확인한다. */
    private static int statusFor(String configuredKey, String headerValue) throws ServletException, IOException {
        ClientKeyFilter filter = new ClientKeyFilter(configuredKey, null);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/meta");
        if (headerValue != null) {
            request.addHeader("X-Client-Key", headerValue);
        }
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean chainCalled = new AtomicBoolean(false);
        FilterChain chain = (req, res) -> chainCalled.set(true);

        filter.doFilter(request, response, chain);

        if (response.getStatus() == 200) {
            assertTrue(chainCalled.get(), "통과면 체인을 불러야 한다");
        }
        return response.getStatus();
    }
}
