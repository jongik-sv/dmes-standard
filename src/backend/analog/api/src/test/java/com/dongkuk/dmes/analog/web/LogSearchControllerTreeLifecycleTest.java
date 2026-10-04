package com.dongkuk.dmes.analog.web;

import com.dongkuk.analog.parser.LogPattern;
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

import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collection;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * /log/range/time/tree 의 소비 작업 수명과 토큰 정의 파일 로드.
 */
@SpringBootTest(properties = {
        "analog-express.modules=test",
        "analog-express.client_types=app",
        "analog-express.stage=DEV",
        "cactus.security.client-key=test-analog-client-key"
})
class LogSearchControllerTreeLifecycleTest {

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
    void 검색이_실패하면_트리_소비_작업을_끝내_풀_자리를_돌려준다() throws Exception {
        // keyword 가 Base64 가 아니면 검색 단계(decodeKeyword)에서 실패한다 — 소비 작업은 이미 풀에 들어가 있다.
        Throwable thrown = catchThrowable(() -> mockMvc.perform(get("/log/range/time/tree")
                .header("X-Client-Key", "test-analog-client-key")
                .param("from", "20260515093000")
                .param("to", "20260515110000")
                .param("keyword", "%%%not-base64%%%")
                .param("serverType", "app")
                .param("module", "test")
                .param("clientType", "app")
                .param("ignoreCase", "false")
                .param("byThread", "false")));
        assertThat(thrown).isNotNull();

        long deadline = System.currentTimeMillis() + 5000;
        while (executors.treeParseInFlight() > 0 && System.currentTimeMillis() < deadline) {
            Thread.sleep(20);
        }
        // 예전에는 EOQ 가 오지 않아 소비 스레드가 100ms 마다 깨며 영영 남았다.
        assertThat(executors.treeParseInFlight()).isZero();
    }

    @Test
    void 토큰_정의는_classpath_자원을_스트림으로_읽는다() throws Exception {
        LogPattern pattern = LogSearchController.loadLogPattern("classpath:analog-serializer.json");
        assertThat(pattern.getTokens()).isNotEmpty();
        assertThat(pattern.getTokens().get(0).getAssignValues()).isNotNull();
    }

    @Test
    void 토큰_정의는_파일_경로로도_읽는다() throws Exception {
        File copy = logDir.resolve("serializer-copy.json").toFile();
        try (InputStream in = getClass().getResourceAsStream("/analog-serializer.json")) {
            Files.copy(in, copy.toPath());
        }
        assertThat(LogSearchController.loadLogPattern(copy.getAbsolutePath()).getTokens()).isNotEmpty();
        assertThat(LogSearchController.loadLogPattern("file:" + copy.getAbsolutePath()).getTokens()).isNotEmpty();
    }
}
