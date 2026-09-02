package com.dongkuk.dmes.analog.web;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.Base64;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * log_base_dir 의 {MODULE} 플레이스홀더가 module 파라미터의 대소문자와 무관하게
 * 소문자 디렉토리(fixture-logs-module/mpn)로 치환되는지 검증한다 (설계 D5 — Linux 대비).
 */
@SpringBootTest(properties = {
        "analog-express.log_base_dir=src/test/resources/fixture-logs-module/{MODULE}",
        "analog-express.modules=mpn",
        "analog-express.client_types=app",
        "analog-express.stage=DEV",
        "analog-express.minimum_minutes_for_binary_search=99999",
        "analog-express.minimum_mega_bytes_for_multi_thread=99999"
})
class LogSearchControllerModuleDirTest {

    @Autowired
    WebApplicationContext webApplicationContext;

    MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
    }

    private static String b64(String raw) {
        return Base64.getEncoder().encodeToString(raw.getBytes());
    }

    @Test
    void resolvesModulePlaceholderToLowercaseDirectory() throws Exception {
        // module 파라미터를 대문자(MPN)로 보내도 소문자 디렉토리의 로그를 찾아야 한다
        mockMvc.perform(get("/log/range/time")
                        .param("from", "20260515093000")
                        .param("to", "20260515110000")
                        .param("keyword", b64("module keyword"))
                        .param("serverType", "app")
                        .param("module", "MPN")
                        .param("clientType", "app")
                        .param("ignoreCase", "false")
                        .param("byThread", "false"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.log", containsString("module keyword found in lowercase dir")));
    }
}
