package com.dongkuk.dmes.analog.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collection;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 컨트롤러 특성 테스트 — 2026-10-04 리팩토링(요청마다 만들던 스레드 풀 → 공유 풀, LogPattern 1회 로드) 직전의
 * /log/range/time · /log/range/time/tree 응답을 고정한다. 기대값(characterization/*.json)은 바꾸기 전 코드로 뽑았다.
 *
 * <p>minimum_mega_bytes_for_multi_thread=0 으로 작은 파일도 MultiThreadRangeSearcherRunner(범위 분할) 경로를 타게 한다.
 * 픽스처에 이어진 줄(스택)을 두지 않는다 — 기대값을 뽑던 때의 코드는 소비 스레드가 생산 도중 빈 큐를 만나면 이어진 줄을
 * 놓칠 수 있었다(지금은 고쳐졌고 core LogProcessorCatchUpTest 가 따로 확인한다). 예전 기대값을 그대로 쓰려고 두지 않는다.
 */
@SpringBootTest(properties = {
        "analog-express.modules=test",
        "analog-express.client_types=app",
        "analog-express.stage=DEV",
        "analog-express.minimum_minutes_for_binary_search=99999",
        "analog-express.minimum_mega_bytes_for_multi_thread=0",
        "cactus.security.client-key=test-analog-client-key"
})
class LogSearchControllerCharacterizationTest {

    private static final String CLIENT_KEY = "test-analog-client-key";
    private static final ObjectMapper MAPPER = new ObjectMapper();

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
        Collection<Filter> filters = webApplicationContext.getBeansOfType(Filter.class).values();
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext)
                .addFilters(filters.toArray(new Filter[0]))
                .build();
    }

    private static String line(String time, String thread, String tag, String service, String level, String logger, String message) {
        return "2026-05-15 " + time + " [" + thread + "] [" + tag + "] [" + service + "] " + level + " " + logger + " - " + message + "\n";
    }

    /** 아카이브(평문 dmes-test.2026-05-15.0.log) + live(dmes-test.log). 범위 앞뒤 줄을 둬 이진검색 경계를 확인한다. */
    @BeforeAll
    static void writeFixtures() throws IOException {
        StringBuilder archived = new StringBuilder();
        archived.append(line("09:00:00.000", "http-0", "T0", "SVC00", "INFO ", "c.d.Web", "POST \"/api/before/range\""));
        archived.append(line("09:30:00.000", "http-1", "T1", "SVC01", "INFO ", "c.d.Web", "POST \"/api/order/save\""));
        archived.append(line("09:30:00.010", "http-1", "T1", "SVC01", "INFO ", "c.d.Svc", "Service [SVC01] start. Request Tag [RT1]"));
        archived.append(line("09:30:00.020", "http-2", "T2", "SVC02", "INFO ", "c.d.Web", "GET \"/api/item/list\""));
        archived.append(line("09:30:00.030", "http-1", "T1", "SVC01", "INFO ", "c.d.Svc", "Process [P1](saveProc) start."));
        archived.append(line("09:30:00.040", "http-1", "T1", "SVC01", "INFO ", "c.d.Svc", "Task [K1](saveTask) start."));
        archived.append(line("09:30:00.050", "http-1", "T1", "SVC01", "DEBUG", "c.d.Sql", "Mybatis SQL : select * from item where id = ?"));
        archived.append(line("09:30:00.051", "http-1", "T1", "SVC01", "TRACE", "c.d.Bind", "binding parameter [1] as [VARCHAR] - [A01]"));
        archived.append(line("09:30:00.060", "http-1", "T1", "SVC01", "INFO ", "c.d.Svc", "Invoking class : [com.d.Foo], method : [bar]"));
        archived.append(line("09:30:00.070", "http-1", "T1", "SVC01", "INFO ", "c.d.Svc", "Task [K1](saveTask) finish.(30ms)"));
        archived.append(line("09:30:00.090", "http-1", "T1", "SVC01", "INFO ", "c.d.Svc", "plain business message"));
        Files.writeString(logDir.resolve("dmes-test.2026-05-15.0.log"), archived.toString(), StandardCharsets.UTF_8);

        StringBuilder live = new StringBuilder();
        live.append(line("10:00:00.095", "http-2", "T2", "SVC02", "INFO ", "c.d.Svc", "Sub-service [SUB9] start."));
        live.append(line("10:00:00.100", "http-1", "T1", "SVC01", "INFO ", "c.d.Svc", "Process [P1](saveProc) finish.(70ms)"));
        live.append(line("10:00:00.110", "http-1", "T1", "SVC01", "INFO ", "c.d.Svc", "Service [SVC01] finish.(100ms)"));
        live.append(line("10:00:00.120", "http-1", "T1", "SVC01", "INFO ", "c.d.Web", "Completed 200 OK"));
        live.append(line("10:00:00.200", "http-2", "T2", "SVC02", "DEBUG", "c.d.Svc", "Converted value on extraction: x"));
        // 범위(~11:00) 밖 줄. live 파일은 이 줄까지 결과에 들어온다(기존 동작). 이제 LogProcessor 는 끝 신호(EOQ)에서
        // 마지막 논리 줄도 소비한다 — 예전 기대값을 그대로 쓰려고 트리에 영향 없는 T2 버림 메시지를 보초 줄로 남긴다.
        live.append(line("11:30:00.000", "http-2", "T2", "SVC02", "DEBUG", "c.d.Svc", "Converted value on extraction: after-range"));
        Files.writeString(logDir.resolve("dmes-test.log"), live.toString(), StandardCharsets.UTF_8);
    }

    private static String b64(String raw) {
        return Base64.getEncoder().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    private String call(String path) throws Exception {
        return mockMvc.perform(get(path)
                        .header("X-Client-Key", CLIENT_KEY)
                        .param("from", "20260515093000")
                        .param("to", "20260515110000")
                        .param("keyword", b64(" - "))
                        .param("serverType", "app")
                        .param("module", "test")
                        .param("clientType", "app")
                        .param("ignoreCase", "false")
                        .param("byThread", "false"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    private static JsonNode golden(String name) throws IOException {
        try (InputStream in = LogSearchControllerCharacterizationTest.class.getResourceAsStream("/characterization/" + name)) {
            return MAPPER.readTree(in);
        }
    }

    @Test
    void 범위_검색_응답은_고정된_결과와_같다() throws Exception {
        assertThat(MAPPER.readTree(call("/log/range/time"))).isEqualTo(golden("range-time-response.json"));
    }

    @Test
    void 트리_응답은_고정된_결과와_같다() throws Exception {
        // 노드 속성이 HashMap 이라 필드 순서는 보지 않는다(JsonNode 비교).
        assertThat(MAPPER.readTree(call("/log/range/time/tree"))).isEqualTo(golden("range-time-tree-response.json"));
    }

    /** 같은 요청을 동시에 여러 개 보내도 모두 고정된 결과와 같아야 한다(공유 스레드 풀·LogPattern 공유 확인). */
    private List<JsonNode> concurrently(String path, int requests) throws Exception {
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService clients = Executors.newFixedThreadPool(requests);
        try {
            List<Future<JsonNode>> futures = new ArrayList<>();
            for (int i = 0; i < requests; i++) {
                Callable<JsonNode> task = () -> {
                    go.await();
                    return MAPPER.readTree(call(path));
                };
                futures.add(clients.submit(task));
            }
            go.countDown();
            List<JsonNode> out = new ArrayList<>();
            for (Future<JsonNode> f : futures) out.add(f.get(60, TimeUnit.SECONDS));
            return out;
        } finally {
            clients.shutdownNow();
        }
    }

    @Test
    void 범위_검색을_동시에_보내도_결과가_같다() throws Exception {
        JsonNode expected = golden("range-time-response.json");
        assertThat(concurrently("/log/range/time", 12)).allSatisfy(actual -> assertThat(actual).isEqualTo(expected));
    }

    @Test
    void 트리를_동시에_보내도_결과가_같다() throws Exception {
        JsonNode expected = golden("range-time-tree-response.json");
        assertThat(concurrently("/log/range/time/tree", 6)).allSatisfy(actual -> assertThat(actual).isEqualTo(expected));
    }
}
