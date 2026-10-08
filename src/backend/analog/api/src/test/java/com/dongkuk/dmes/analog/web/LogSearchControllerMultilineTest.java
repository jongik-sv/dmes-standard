package com.dongkuk.dmes.analog.web;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * hibernate.format_sql 로 시각 없는 줄이 수십 줄 이어지는 로그(mcm)에서 시간 범위 검색이
 * HTTP 500("무한 루프 탐지") 없이 끝나고, 여러 줄 SQL 본문이 잘리지 않는지 검증한다.
 */
@SpringBootTest(properties = {
        "analog-express.modules=test",
        "analog-express.client_types=app",
        "analog-express.stage=DEV",
        "analog-express.minimum_minutes_for_binary_search=99999",
        "analog-express.minimum_mega_bytes_for_multi_thread=99999"
})
class LogSearchControllerMultilineTest {

    private static Path logDir;

    @BeforeAll
    static void writeLiveLog() throws IOException {
        logDir = Files.createTempDirectory("analog-multiline");
        StringBuilder sb = new StringBuilder();
        for (int minute = 0; minute < 3; minute++) {
            sb.append(String.format("2026-10-08 10:%02d:00.003 [scheduling-1] [] [] DEBUG org.hibernate.SQL - \n", minute));
            sb.append("    select\n");
            for (int k = 0; k < 40; k++)
                sb.append("        wd1_0.COLUMN_").append(k).append(",\n");
            sb.append("    from\n        TB_WIDGET_").append(minute).append(" wd1_0\n");
        }
        Files.writeString(logDir.resolve("dmes-test.log"), sb.toString(), StandardCharsets.UTF_8);
    }

    @DynamicPropertySource
    static void logBaseDir(DynamicPropertyRegistry registry) throws IOException {
        if (logDir == null)
            logDir = Files.createTempDirectory("analog-multiline");
        registry.add("analog-express.log_base_dir", () -> logDir.toString());
    }

    @Autowired
    WebApplicationContext webApplicationContext;

    MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
    }

    private static String b64(String raw) {
        return Base64.getEncoder().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void 여러_줄_SQL_로그에서_첫_기록만_요청해도_500_없이_SQL_본문_전체를_돌려준다() throws Exception {
        mockMvc.perform(get("/log/range/time")
                        .param("from", "20261008100000")
                        .param("to", "20261008100059")
                        .param("keyword", b64("TB_WIDGET_0"))
                        .param("serverType", "app")
                        .param("module", "test")
                        .param("clientType", "app")
                        .param("ignoreCase", "false")
                        .param("byThread", "false"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.log", containsString("COLUMN_39")))
                .andExpect(jsonPath("$.log", containsString("TB_WIDGET_0")))
                .andExpect(jsonPath("$.log", not(containsString("TB_WIDGET_1"))));
    }

    @Test
    void 시작_시각이_종료_시각보다_늦으면_500_대신_400을_돌려준다() throws Exception {
        mockMvc.perform(get("/log/range/time")
                        .param("from", "20261008101000")
                        .param("to", "20261008100000")
                        .param("keyword", b64("x"))
                        .param("serverType", "app")
                        .param("module", "test")
                        .param("clientType", "app")
                        .param("ignoreCase", "false")
                        .param("byThread", "false"))
                .andExpect(status().isBadRequest());
    }
}
