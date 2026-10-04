package com.dongkuk.dmes.analog.web;

import com.dongkuk.dmes.analog.config.AnalogSearchExecutors;
import jakarta.servlet.Filter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.nio.file.Path;
import java.util.Collection;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * /log/range/time/tree 동시 파싱 상한 — 상한을 넘는 요청만 503 과 안내 문구를 받는다.
 */
@SpringBootTest(properties = {
        "analog-express.modules=test",
        "analog-express.client_types=app",
        "analog-express.stage=DEV",
        "analog-express.tree_parse_pool_size=1",
        "cactus.security.client-key=test-analog-client-key"
})
class LogSearchControllerTreeLimitTest {

    private static final String BUSY_MESSAGE = "로그 트리 분석 요청이 많습니다. 잠시 뒤 다시 시도하세요.";

    @TempDir
    static Path logDir;

    @DynamicPropertySource
    static void logBaseDir(DynamicPropertyRegistry registry) {
        registry.add("analog-express.log_base_dir", () -> logDir.toString());
    }

    @Autowired
    WebApplicationContext webApplicationContext;
    @Autowired
    AnalogSearchExecutors executors;

    MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        Collection<Filter> filters = webApplicationContext.getBeansOfType(Filter.class).values();
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext)
                .addFilters(filters.toArray(new Filter[0]))
                .build();
    }

    @Test
    void 동시_파싱이_상한이면_503과_안내_문구를_돌려준다() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch started = new CountDownLatch(1);
        // 하나뿐인 자리를 막아 둔다 — 요청의 소비 작업 제출은 검색보다 먼저라 로그 파일이 없어도 된다.
        Future<?> occupant = executors.submitTreeParse(() -> {
            started.countDown();
            try {
                release.await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        try {
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();

            mockMvc.perform(get("/log/range/time/tree")
                            .header("X-Client-Key", "test-analog-client-key")
                            .param("from", "20260515093000")
                            .param("to", "20260515110000")
                            .param("keyword", "a2V5d29yZA==")
                            .param("serverType", "app")
                            .param("module", "test")
                            .param("clientType", "app")
                            .param("ignoreCase", "false")
                            .param("byThread", "false"))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(status().reason(BUSY_MESSAGE));
        } finally {
            release.countDown();
        }
        occupant.get(5, TimeUnit.SECONDS);
        assertThat(executors.treeParseInFlight()).isZero();
    }
}
