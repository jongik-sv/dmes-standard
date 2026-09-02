package com.dongkuk.dmes.analog.web;

import jakarta.servlet.Filter;
import org.junit.jupiter.api.BeforeAll;
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

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Collection;
import java.util.zip.GZIPOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * gzip 아카이브(.log.gz) 검색 통합 검증.
 *
 * <p>{CLIENT} 운영 로그 컨벤션은 live 평문({@code dmes-mpn.log}) + gzip 아카이브
 * ({@code dmes-mpn.yyyy-MM-dd.i.log.gz}) 이다. 엔진은 평문만 읽을 수 있으므로,
 * 아카이브는 {@code .gz} 를 뗀 이름으로 필터 매칭 후 캐시 디렉터리에 해제하고
 * 그 평문을 기존 엔진(RandomAccessFile 이진탐색 포함)으로 읽어야 한다.
 *
 * <p>픽스처는 {@link TempDir} 에 프로그램적으로 생성한다 — 디스크 픽스처 추가 없음.
 */
@SpringBootTest(properties = {
        "analog-express.modules=test",
        "analog-express.client_types=app",
        "analog-express.stage=DEV",
        "analog-express.minimum_minutes_for_binary_search=99999",
        "analog-express.minimum_mega_bytes_for_multi_thread=99999",
        "cactus.security.client-key=test-analog-client-key"
})
class LogSearchControllerGzipTest {

    private static final String CLIENT_KEY = "test-analog-client-key";

    @TempDir
    static Path logDir;

    @DynamicPropertySource
    static void logBaseDir(DynamicPropertyRegistry registry) {
        registry.add("analog-express.log_base_dir", () -> logDir.toString());
    }

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

    @BeforeAll
    static void writeFixtures() throws IOException {
        // 과거일자 아카이브 — gzip 압축본만 존재 (평문 원본은 이미 압축되어 삭제된 상태)
        String archived = "2026-05-14 09:45:00.000 [main] INFO  com.dongkuk.test.Foo - gz-archived-line keyword\n"
                + "2026-05-14 10:10:00.000 [main] INFO  com.dongkuk.test.Foo - another archived line\n";
        try (OutputStream out = new GZIPOutputStream(
                Files.newOutputStream(logDir.resolve("dmes-test.2026-05-14.0.log.gz")))) {
            out.write(archived.getBytes(StandardCharsets.UTF_8));
        }
        // live 로그 — 평문
        Files.writeString(logDir.resolve("dmes-test.log"),
                "2026-05-14 10:30:00.000 [main] INFO  com.dongkuk.test.Foo - live keyword line\n",
                StandardCharsets.UTF_8);
    }

    private static String b64(String raw) {
        return Base64.getEncoder().encodeToString(raw.getBytes());
    }

    @Test
    void logRangeTime_findsContentInsideGzArchive() throws Exception {
        mockMvc.perform(get("/log/range/time")
                        .header("X-Client-Key", CLIENT_KEY)
                        .param("from", "20260514093000")
                        .param("to", "20260514110000")
                        .param("keyword", b64("keyword"))
                        .param("serverType", "app")
                        .param("module", "test")
                        .param("clientType", "app")
                        .param("ignoreCase", "false")
                        .param("byThread", "false"))
                .andExpect(status().isOk())
                // gz 아카이브 내부 라인이 검색되어야 한다
                .andExpect(jsonPath("$.log", containsString("gz-archived-line")))
                // live 평문 병합도 유지되어야 한다
                .andExpect(jsonPath("$.log", containsString("live keyword line")));

        // 해제본은 base dir 가 아닌 캐시 디렉터리에 생성된다 (base dir 오염 금지)
        Path cached = logDir.resolve(".analog-unzip-cache").resolve("dmes-test.2026-05-14.0.log");
        assertThat(cached).exists();
        assertThat(Files.readString(cached)).contains("gz-archived-line");
        assertThat(logDir.resolve("dmes-test.2026-05-14.0.log")).doesNotExist();
    }
}
