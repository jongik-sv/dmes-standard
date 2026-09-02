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
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Collection;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * module 파라미터 화이트리스트 가드 + {MODULE} 디렉터리 치환 검증.
 *
 * <p>log_base_dir 는 {CLIENT} 로컬 기본값과 동일한 {@code …/{MODULE}/logs/{MODULE}} 치환형으로
 * 구성한다. 픽스처는 {@code {temp}/test/logs/test/dmes-test.log} — 즉 검색이 성공하려면
 * {MODULE} 이 정규화된 소문자 모듈명으로 치환되어야 한다 (원 회사 잔재였던
 * {@code toUpperCase()} 치환이면 어떤 OS 에서도 디렉터리를 찾지 못한다).
 *
 * <p>가드 — module 이 {@code analog-express.modules} 목록에 없으면 경로 치환 전에
 * 400 으로 거부한다 (경로 조작 차단). 전 엔드포인트(log/range/time·tree·download·refresh) 적용.
 */
@SpringBootTest(properties = {
        "analog-express.modules=test,mpn",
        "analog-express.client_types=app",
        "analog-express.stage=DEV",
        "analog-express.minimum_minutes_for_binary_search=99999",
        "analog-express.minimum_mega_bytes_for_multi_thread=99999",
        "cactus.security.client-key=test-analog-client-key"
})
class LogSearchControllerModuleGuardTest {

    private static final String CLIENT_KEY = "test-analog-client-key";

    @TempDir
    static Path baseDir;

    @DynamicPropertySource
    static void logBaseDir(DynamicPropertyRegistry registry) {
        // 로컬 기본값(../logs/{MODULE} — 공용 src/backend/logs) 과 동일한 치환형 배치
        registry.add("analog-express.log_base_dir", () -> baseDir + "/logs/{MODULE}");
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
        Path moduleLogs = baseDir.resolve("logs").resolve("test");
        Files.createDirectories(moduleLogs);
        Files.writeString(moduleLogs.resolve("dmes-test.log"),
                "2026-05-14 10:30:00.000 [main] INFO  com.dongkuk.test.Foo - module-dir keyword line\n",
                StandardCharsets.UTF_8);
    }

    private static String b64(String raw) {
        return Base64.getEncoder().encodeToString(raw.getBytes());
    }

    @Test
    void allowedModule_readsFromModuleSubstitutedDirectory() throws Exception {
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
                // {MODULE} 치환이 {base}/test/logs/test 디렉터리를 가리켜야만 찾을 수 있는 라인
                .andExpect(jsonPath("$.log", containsString("module-dir keyword line")));
    }

    @Test
    void stagePrefixedUpperCaseModule_normalizedToLowercaseDirectory() throws Exception {
        // DEV_TEST → 정규화(test) 로 화이트리스트 통과 + 소문자 디렉터리 치환.
        // 구 toUpperCase 치환이면 {base}/DEV_TEST/… 를 보므로 결과가 비어 실패한다.
        mockMvc.perform(get("/log/range/time")
                        .header("X-Client-Key", CLIENT_KEY)
                        .param("from", "20260514093000")
                        .param("to", "20260514110000")
                        .param("keyword", b64("keyword"))
                        .param("serverType", "app")
                        .param("module", "DEV_TEST")
                        .param("clientType", "app")
                        .param("ignoreCase", "false")
                        .param("byThread", "false"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.log", containsString("module-dir keyword line")));
    }

    @Test
    void unknownModule_rejectedWith400() throws Exception {
        mockMvc.perform(get("/log/range/time")
                        .header("X-Client-Key", CLIENT_KEY)
                        .param("from", "20260514093000")
                        .param("to", "20260514110000")
                        .param("keyword", b64("keyword"))
                        .param("serverType", "app")
                        .param("module", "mqc") // 목록(test,mpn) 밖 — 실모듈명이라도 거부
                        .param("clientType", "app")
                        .param("ignoreCase", "false")
                        .param("byThread", "false"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void pathTraversalShapedModule_rejectedWith400_onAllEndpoints() throws Exception {
        String traversal = "../analog";

        mockMvc.perform(get("/log/range/time")
                        .header("X-Client-Key", CLIENT_KEY)
                        .param("from", "20260514093000")
                        .param("to", "20260514110000")
                        .param("keyword", b64("keyword"))
                        .param("serverType", "app")
                        .param("module", traversal)
                        .param("clientType", "app")
                        .param("ignoreCase", "false")
                        .param("byThread", "false"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(get("/log/range/time/tree")
                        .header("X-Client-Key", CLIENT_KEY)
                        .param("from", "20260514093000")
                        .param("to", "20260514110000")
                        .param("keyword", b64("keyword"))
                        .param("serverType", "app")
                        .param("module", traversal)
                        .param("clientType", "app")
                        .param("ignoreCase", "false")
                        .param("byThread", "false"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(get("/log/range/time/download")
                        .header("X-Client-Key", CLIENT_KEY)
                        .param("from", "20260514093000")
                        .param("to", "20260514110000")
                        .param("keyword", b64("keyword"))
                        .param("serverType", "app")
                        .param("module", traversal)
                        .param("clientType", "app")
                        .param("ignoreCase", "false")
                        .param("byThread", "false"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(get("/log/refresh")
                        .header("X-Client-Key", CLIENT_KEY)
                        .param("module", traversal)
                        .param("clientType", "app"))
                .andExpect(status().isBadRequest());
    }
}
