package com.dongkuk.dmes.mdm.feed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.cfg.JsonNodeFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * D-154 — {@code part} 없는 {@code metaFeed/view} 응답의 골든 고정(스펙 2026-10-03-mdm-meta-cache-per-version §6.2 「MDM 피드」, §8 "새 MDM + 옛
 * cactus 는 안 깨진다"). 피드를 바꾸기 전에 떠 둔 파일과 {@code data.result} 를 글자 그대로 비교한다. 파일이 없으면 지금 응답으로 만들고 실패한다 —
 * 만든 파일을 눈으로 확인한 뒤 다시 돌린다. 자동 증가 ID 가 실행마다 같도록 DB 파일을 따로 쓰고 시험 메서드는 하나만 둔다.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + MetaFeedLegacyGoldenTest.TEST_CLIENT_KEY)
@ActiveProfiles("local")
class MetaFeedLegacyGoldenTest {

    static final String TEST_CLIENT_KEY = "mdm-feed-golden-test-key";
    private static final Path GOLDEN = Path.of("src/test/resources/feed/golden");

    @TempDir
    static Path tempDir;

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;

    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper json = JsonMapper.builder()
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .disable(JsonNodeFeature.STRIP_TRAILING_BIGDECIMAL_ZEROES)
            .build();

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-feed-golden-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @Test
    void part_없는_view_응답은_골든_파일과_글자_그대로_같다() throws Exception {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        MetaRevTestSupport.clear(jdbc);
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        new MasterCodeSeeds(jdbc).clear();
        seed(jdbc);

        Map<String, List<String>> keys = new LinkedHashMap<>();
        keys.put("COLUMN", List.of("GOLD_THK", "NO_COL"));
        keys.put("DOMAIN", List.of("99001", "99999"));
        keys.put("RULE", List.of("QLTY_GRD_JDG", "NO_RULE"));
        keys.put("RULE_SET", List.of("GOLD_SET", "NO_SET"));
        keys.put("CODE", List.of("GOLD_CD", "NO_CD"));
        keys.put("LAYOUT", List.of("9801", "9804", "abc"));
        boolean created = false;
        for (Map.Entry<String, List<String>> e : keys.entrySet()) {
            String actual = json.writerWithDefaultPrettyPrinter().writeValueAsString(view(e.getKey(), e.getValue()));
            Path file = GOLDEN.resolve("view-" + e.getKey() + ".json");
            if (!Files.exists(file)) {
                Files.createDirectories(GOLDEN);
                Files.writeString(file, actual + "\n", StandardCharsets.UTF_8);
                created = true;
                continue;
            }
            assertEquals(Files.readString(file, StandardCharsets.UTF_8).stripTrailing(), actual, "골든과 다르다: " + file);
        }
        if (created) {
            fail("골든 파일을 새로 만들었다 — 내용을 확인하고 다시 돌린다: " + GOLDEN.toAbsolutePath());
        }
    }

    private static void seed(JdbcTemplate jdbc) {
        // 컬럼·도메인 — 도메인 ID 를 명시한다(자동 증가 값이 응답에 실린다)
        jdbc.update("INSERT INTO TB_MDM_DOMAIN (DOMAIN_ID, DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, SCALE, STD_RULE, VER) "
                + "VALUES (99001, '골든 두께', 'GOLD_THK_D', 'QTY', 'NUMBER', 2, 'value >= 0', 0)");
        DmeTestSupport.column(jdbc, "GOLD_THK", 99001L);
        // 룰 — 1.000(SQLite INTEGER)·1.001(REAL) 두 저장 형태
        DmeTestSupport.sampleRule(jdbc);
        jdbc.update("UPDATE TB_MDM_RULE_VER SET APPLY_TO = '2026-07-01 00:00:00' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 1");
        DmeTestSupport.released(jdbc, "QLTY_GRD_JDG", new BigDecimal("1.001"), "MINOR", "FIRST", "2026-07-01 00:00:00", null);
        DmeTestSupport.sampleDefinition(jdbc, "QLTY_GRD_JDG", new BigDecimal("1.001"));
        // 룰 세트
        DmeTestSupport.ruleSet(jdbc, "GOLD_SET", "골든 세트", "[\"QLTY_GRD_JDG\"]", "CREATED", 0);
        // 코드 — RELEASED 1.000·1.001, DRAFT 1.002(투영이 덜어 낸다), BASE + TABLE
        MasterCodeSeeds seeds = new MasterCodeSeeds(jdbc);
        seeds.seedCode("GOLD_CD", "INUSE", "MDM");
        seeds.released("GOLD_CD", "1.000", "2026-01-01 00:00:00", "2026-07-01 00:00:00");
        seeds.released("GOLD_CD", "1.001", "2026-07-01 00:00:00", MasterCodeSeeds.OPEN_END);
        seeds.draft("GOLD_CD", "1.002", "kim");
        seeds.seedItem("GOLD_CD", "A", "1.000", MasterCodeSeeds.OPEN, "에이", 1, null, null, null, null, null, "X");
        seeds.seedItem("GOLD_CD", "B", "1.001", MasterCodeSeeds.OPEN, "비", 2);
        seeds.seedItem("GOLD_CD", "C", "1.002", MasterCodeSeeds.OPEN, "씨(초안)", 3);
        seeds.seedBase("GOLD_CD");
        seeds.seedCate("GOLD_CD", "TB", "1.001", MasterCodeSeeds.OPEN, "TABLE", null, null, "표");
        seeds.seedCateItem("GOLD_CD", "TB", "B", "1.001", MasterCodeSeeds.OPEN);
        // 전문 — 헤더 9890 두 버전, 전문 9801(헤더 쌓음, 두 버전), 9804(헤더 없음)
        jdbc.update("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, STATUS, VER) VALUES "
                + "(9890, 'HEADER', '골든 헤더', 'INUSE', 0), (9801, 'MESSAGE', '골든 전문', 'INUSE', 0), "
                + "(9804, 'MESSAGE', '헤더 없는 골든 전문', 'INUSE', 0)");
        layoutVer(jdbc, 9890, "1.000", "2000-01-01 00:00:00", "2026-04-01 00:00:00", 7);
        layoutVer(jdbc, 9890, "2.000", "2026-04-01 00:00:00", "9999-12-31 00:00:00", 9);
        layoutVer(jdbc, 9801, "1.000", "2000-01-01 00:00:00", "2026-07-01 00:00:00", 10);
        layoutVer(jdbc, 9801, "2.000", "2026-07-01 00:00:00", "9999-12-31 00:00:00", 12);
        layoutVer(jdbc, 9804, "1.000", "2000-01-01 00:00:00", "9999-12-31 00:00:00", 5);
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, VER, SEQ, HEADER_LAYOUT_ID) VALUES (9801, 1, 1, 9890)");
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, VER, SEQ, HEADER_LAYOUT_ID) VALUES (9801, 2, 1, 9890)");
    }

    private static void layoutVer(JdbcTemplate jdbc, long id, String ver, String from, String to, int own) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, OWN_LENGTH) "
                + "VALUES (?, ?, 'MAJOR', 'RELEASED', NULL, ?, ?, ?)", id, new BigDecimal(ver), from, to, own);
    }

    private JsonNode view(String type, List<String> keys) throws Exception {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", "metaFeed");
        body.putObject("params").put("type", type);
        ArrayNode rows = body.putObject("grids").putObject("keys").putArray("rows");
        keys.forEach(k -> rows.addObject().put("key", k));
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/oasis/metaFeed/view"))
                .header("Content-Type", "application/json")
                .header("X-Client-Key", effectiveClientKey())
                .header("X-Authenticated-User", "system:mls")
                .header("X-Authenticated-Role", "SYSTEM")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode(), response.body());
        JsonNode root = json.readTree(response.body());
        assertTrue(root.path("meta").path("success").asBoolean(false), root.toString());
        return root.path("data").path("result");
    }

    static String effectiveClientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return (env != null && !env.isBlank()) ? env : TEST_CLIENT_KEY;
    }
}
