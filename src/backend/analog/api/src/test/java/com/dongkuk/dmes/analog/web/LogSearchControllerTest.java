package com.dongkuk.dmes.analog.web;

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

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * fixture-logs 디렉토리에 {CLIENT} logback 컨벤션 (dmes-{module}.{date}.{seq}.log) 으로
 * 배치된 샘플 로그를 사용해 검색 엔진 + serializer 동작을 통합 검증한다.
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
class LogSearchControllerTest {

    private static final String CLIENT_KEY = "test-analog-client-key";

    @Autowired
    WebApplicationContext webApplicationContext;

    MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        // X-Client-Key 필터 포함 — 실서버 servlet 필터 자동 등록 미러
        Collection<Filter> filters = webApplicationContext.getBeansOfType(Filter.class).values();
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext)
                .addFilters(filters.toArray(new Filter[0]))
                .build();
    }

    private static String b64(String raw) {
        return Base64.getEncoder().encodeToString(raw.getBytes());
    }

    @Test
    void logRangeTime_returnsMatchedLinesWithinRange() throws Exception {
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
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.log", containsString("keyword present")))
                .andExpect(jsonPath("$.log", containsString("second keyword match")))
                .andExpect(jsonPath("$.log", not(containsString("past the range"))));
    }

    @Test
    void logRangeTime_includesLiveLogWhenWithinLimit() throws Exception {
        mockMvc.perform(get("/log/range/time")
                        .header("X-Client-Key", CLIENT_KEY)
                        .param("from", "20260515093000")
                        .param("to", "20260515110000")
                        .param("keyword", b64("keyword in live"))
                        .param("serverType", "app")
                        .param("module", "test")
                        .param("clientType", "app")
                        .param("ignoreCase", "false")
                        .param("byThread", "false"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.log", containsString("keyword in live log")));
    }

    @Test
    void logRangeTimeDownload_returnsPlainText() throws Exception {
        mockMvc.perform(get("/log/range/time/download")
                        .header("X-Client-Key", CLIENT_KEY)
                        .param("from", "20260515093000")
                        .param("to", "20260515110000")
                        .param("keyword", b64("keyword"))
                        .param("serverType", "app")
                        .param("module", "test")
                        .param("clientType", "app")
                        .param("ignoreCase", "false")
                        .param("byThread", "false"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("keyword present")));
    }
}
