package com.dongkuk.dmes.analog.web;

import jakarta.servlet.Filter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.Collection;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "analog-express.modules=mpn,mpp",
        "analog-express.client_types=app",
        "analog-express.stage=DEV",
        "cactus.security.client-key=test-analog-client-key"
})
class MetaApiControllerTest {

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

    @Test
    void meta_returnsModulesAndClientTypes() throws Exception {
        mockMvc.perform(get("/api/meta")
                        .header("X-Client-Key", CLIENT_KEY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.modules.length()").value(2))
                .andExpect(jsonPath("$.modules[0].label").value("mpn"))
                .andExpect(jsonPath("$.modules[0].value").value("mpn"))
                .andExpect(jsonPath("$.modules[1].label").value("mpp"))
                .andExpect(jsonPath("$.clientTypes[0].label").value("app"))
                .andExpect(jsonPath("$.stageTitle").value("DEV"))
                .andExpect(jsonPath("$.title").value("DMES log 분석화면"));
    }
}
