package com.dongkuk.dmes.analog.security;

import jakarta.servlet.Filter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.Base64;
import java.util.Collection;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * X-Client-Key 인증 검증 — BFF(be-proxy) 신뢰 헤더 없이는 API 를 읽을 수 없어야 한다.
 *
 * <p>cactus-core {@code ClientKeyFilter} 를 analog 로컬에 미러한 필터의 통합 검증.
 * 컨텍스트에 등록된 servlet {@link Filter} 빈 전부를 MockMvc 체인에 태운다 —
 * 필터 빈 등록이 누락되면 무키 요청이 200 이 되어 본 테스트가 RED 로 잡는다.
 */
@SpringBootTest(properties = {
        "analog-express.log_base_dir=src/test/resources/fixture-logs",
        "analog-express.modules=test",
        "analog-express.client_types=app",
        "analog-express.stage=DEV",
        "analog-express.minimum_minutes_for_binary_search=99999",
        "analog-express.minimum_mega_bytes_for_multi_thread=99999",
        "cactus.security.client-key=test-analog-client-key"
})
class ClientKeyFilterTest {

    private static final String CLIENT_KEY = "test-analog-client-key";

    @Autowired
    WebApplicationContext webApplicationContext;

    MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        // 컨텍스트의 servlet Filter 빈 전부를 체인에 포함 (실서버 자동 등록 미러)
        Collection<Filter> filters = webApplicationContext.getBeansOfType(Filter.class).values();
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext)
                .addFilters(filters.toArray(new Filter[0]))
                .build();
    }

    private static String b64(String raw) {
        return Base64.getEncoder().encodeToString(raw.getBytes());
    }

    @Test
    void meta_withoutClientKey_returns401() throws Exception {
        mockMvc.perform(get("/api/meta"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("A001"));
    }

    @Test
    void meta_withWrongClientKey_returns401() throws Exception {
        mockMvc.perform(get("/api/meta")
                        .header("X-Client-Key", "wrong-key"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("A001"));
    }

    @Test
    void meta_withValidClientKey_returns200() throws Exception {
        mockMvc.perform(get("/api/meta")
                        .header("X-Client-Key", CLIENT_KEY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.modules[0].value").value("test"));
    }

    @Test
    void logRangeTime_withoutClientKey_returns401() throws Exception {
        mockMvc.perform(get("/log/range/time")
                        .param("from", "20260515093000")
                        .param("to", "20260515110000")
                        .param("keyword", b64("keyword"))
                        .param("serverType", "app")
                        .param("module", "test")
                        .param("clientType", "app")
                        .param("ignoreCase", "false")
                        .param("byThread", "false"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void logRangeTime_withValidClientKey_returns200() throws Exception {
        mockMvc.perform(get("/log/range/time")
                        .header("X-Client-Key", CLIENT_KEY)
                        .param("from", "20260515093000")
                        .param("to", "20260515110000")
                        .param("keyword", b64("keyword"))
                        .param("serverType", "app")
                        .param("module", "test")
                        .param("clientType", "app")
                        .param("ignoreCase", "false")
                        .param("byThread", "false"))
                .andExpect(status().isOk());
    }
}
