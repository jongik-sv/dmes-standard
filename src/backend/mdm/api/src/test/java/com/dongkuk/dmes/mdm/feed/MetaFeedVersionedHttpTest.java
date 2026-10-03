package com.dongkuk.dmes.mdm.feed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.cfg.JsonNodeFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
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
 * D-154 — {@code metaFeed/view} 의 {@code part=TOC|BODY}·{@code at}(스펙 2026-10-03-mdm-meta-cache-per-version §4.1·§4.2). 목차는 RELEASED
 * 버전 목록(ver scale 3 number)과 {@code at} 시각의 본문 하나({@code current}), 본문은 (키, ver) 쌍마다 하나다. 본문 값은 {@code part} 없는 응답의
 * 목록 원소와 같아야 한다.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + MetaFeedVersionedHttpTest.TEST_CLIENT_KEY)
@ActiveProfiles("local")
class MetaFeedVersionedHttpTest {

    static final String TEST_CLIENT_KEY = "mdm-feed-versioned-test-key";
    private static final String Q = "QLTY_GRD_JDG";

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
    private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-feed-versioned-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        MetaRevTestSupport.clear(jdbc);
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        new MasterCodeSeeds(jdbc).clear();
    }

    /** 룰 세 버전: 1.000(SQLite INTEGER) [2026-01-01, 2026-07-01), 1.001(REAL) [2026-07-01, 2027-01-01), 2.000 DRAFT. */
    private void seedRule() {
        DmeTestSupport.sampleRule(jdbc);
        jdbc.update("UPDATE TB_MDM_RULE_VER SET APPLY_TO = '2026-07-01 00:00:00' WHERE MARU_RULE_ID = ? AND VER = 1", Q);
        DmeTestSupport.released(jdbc, Q, new BigDecimal("1.001"), "MINOR", "FIRST", "2026-07-01 00:00:00", "2027-01-01 00:00:00");
        DmeTestSupport.sampleDefinition(jdbc, Q, new BigDecimal("1.001"));
    }

    // ------------------------------------------------------------------ RULE

    @Test
    void RULE_목차는_RELEASED_버전을_ver_순_scale_3_으로_주고_at_시각의_본문을_current_로_싣는다() throws Exception {
        seedRule();
        JsonNode legacy = item(view("RULE", Q), Q);

        JsonNode r = toc("RULE", "2026-08-01T00:00:00", Q, "NO_RULE");

        assertEquals("TOC", r.path("part").asText(), r.toString());
        assertEquals(1, r.path("items").size(), "없는 룰은 빠진다: " + r);
        JsonNode it = r.path("items").get(0);
        JsonNode versions = it.path("value").path("versions");
        assertEquals(2, versions.size(), versions.toString());
        assertEquals("1.000", versions.get(0).path("ver").decimalValue().toPlainString(), "INTEGER 로 저장된 1 도 scale 3");
        assertEquals("1.001", versions.get(1).path("ver").decimalValue().toPlainString());
        assertEquals("RELEASED", versions.get(1).path("status").asText());
        assertEquals("2026-07-01T00:00:00", versions.get(1).path("applyFrom").asText());
        assertTrue(it.path("value").path("header").isNull(), "룰 목차의 header 는 null");
        assertEquals("1.001", it.path("current").path("ver").asText());
        assertEquals(legacy.get(1), it.path("current").path("value"), "current 본문 = part 없는 목록의 그 원소");
    }

    @Test
    void RULE_at_이_없거나_적용_버전이_없으면_current_는_null_이다() throws Exception {
        seedRule();
        assertTrue(toc("RULE", null, Q).path("items").get(0).path("current").isNull());
        assertTrue(toc("RULE", "2025-01-01T00:00:00", Q).path("items").get(0).path("current").isNull(), "룰은 소급하지 않는다");
    }

    @Test
    void RULE_current_는_적용_시작_경계에서_바뀌고_마지막_버전의_적용_종료_이후에는_없다() throws Exception {
        seedRule(); // 1.000 [2026-01-01, 2026-07-01), 1.001 [2026-07-01, 2027-01-01)
        assertEquals("1.001", currentVer(toc("RULE", "2026-07-01T00:00:00", Q)), "applyFrom 은 포함");
        assertEquals("1.000", currentVer(toc("RULE", "2026-06-30T23:59:59", Q)), "직전 1초는 이전 버전");
        assertEquals("1.001", currentVer(toc("RULE", "2026-12-31T23:59:59", Q)), "applyTo 직전은 마지막 버전");
        assertTrue(toc("RULE", "2027-01-01T00:00:00", Q).path("items").get(0).path("current").isNull(), "applyTo 는 제외(열린 구간 아님)");
        assertTrue(toc("RULE", "2030-01-01T00:00:00", Q).path("items").get(0).path("current").isNull(), "마지막 RELEASED 의 applyTo 이후는 current 없음");
    }

    @Test
    void RULE_본문은_키_ver_쌍마다_주고_ver_는_scale_3_으로_되돌린다() throws Exception {
        seedRule();
        JsonNode legacy = item(view("RULE", Q), Q);

        JsonNode r = bodies("RULE", Q, "1", Q, "1.001", Q, "1.000");

        assertEquals("BODY", r.path("part").asText(), r.toString());
        assertEquals(2, r.path("items").size(), "1 과 1.000 은 같은 쌍이라 하나: " + r);
        assertEquals("1.000", r.path("items").get(0).path("ver").asText());
        assertEquals(legacy.get(0), r.path("items").get(0).path("value"));
        assertEquals("1.001", r.path("items").get(1).path("ver").asText());
        assertEquals(legacy.get(1), r.path("items").get(1).path("value"));
        assertEquals(0, r.path("failed").size());
    }

    @Test
    void RULE_본문_RELEASED_가_아닌_ver_와_없는_룰은_NOT_RELEASED_형식이_틀린_ver_는_INVALID_VER_이고_묶음은_거부하지_않는다() throws Exception {
        seedRule();
        DmeTestSupport.pending(jdbc, Q, new BigDecimal("2.000"), "MAJOR", "DRAFT", "kim", "FIRST", null);

        JsonNode r = bodies("RULE", Q, "2.000", "NO_RULE", "1.000", Q, "x.y", Q, "1.000");

        assertEquals(1, r.path("items").size(), r.toString());
        assertEquals(3, r.path("failed").size(), r.toString());
        assertEquals("NOT_RELEASED", failed(r, Q, "2.000").path("message").asText());
        assertEquals("NOT_RELEASED", failed(r, "NO_RULE", "1.000").path("message").asText());
        assertEquals("INVALID_VER", failed(r, Q, "x.y").path("message").asText());
    }

    // ------------------------------------------------------------------ RULE_SET

    /** 세트 두 버전: 1.000 [2000-01-01, 2026-07-01), 1.001 [2026-07-01, 9999-12-31) — 버전마다 ruleIds 를 달리 해 내용으로 가른다. */
    private void seedSet() {
        DmeTestSupport.ruleSet(jdbc, "VS_SET", "버전 세트", "[\"" + Q + "\"]", "CREATED", 0);
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET APPLY_TO = '2026-07-01 00:00:00' WHERE MARU_RULE_SET_ID = 'VS_SET' AND VER = 1");
        DmeTestSupport.ruleSetVersion(jdbc, "VS_SET", "1.001", "MINOR", "RELEASED", null, "[\"" + Q + "\",\"R2\"]",
                "2026-07-01 00:00:00", "9999-12-31 00:00:00", 0);
        DmeTestSupport.ruleSetDraft(jdbc, "VS_SET", "2.000", "kim", "[\"DRAFT_R\"]", 0);
    }

    @Test
    void RULE_SET_목차와_current_와_본문은_part_없는_목록_원소와_같다() throws Exception {
        seedSet();
        JsonNode legacy = item(view("RULE_SET", "VS_SET"), "VS_SET");

        JsonNode t = toc("RULE_SET", "2026-08-01T00:00:00", "VS_SET", "NO_SET");
        assertEquals(1, t.path("items").size(), t.toString());
        JsonNode versions = t.path("items").get(0).path("value").path("versions");
        assertEquals(2, versions.size(), "DRAFT 2.000 은 빠진다: " + versions);
        assertEquals("1.001", t.path("items").get(0).path("current").path("ver").asText());
        assertEquals(legacy.get(1), t.path("items").get(0).path("current").path("value"));
        assertEquals("INUSE", t.path("items").get(0).path("current").path("value").path("status").asText(), "부모 계산 상태는 본문에 남는다");

        JsonNode b = bodies("RULE_SET", "VS_SET", "1.000", "VS_SET", "2.000");
        assertEquals(legacy.get(0), b.path("items").get(0).path("value"));
        assertEquals("NOT_RELEASED", failed(b, "VS_SET", "2.000").path("message").asText());
    }

    @Test
    void RULE_SET_current_는_시각에_따라_바뀌고_versions_항목은_ver_status_applyFrom_applyTo_를_싣는다() throws Exception {
        seedSet(); // 1.000 [2000-01-01, 2026-07-01), 1.001 [2026-07-01, 9999-12-31)
        JsonNode early = toc("RULE_SET", "2026-06-01T00:00:00", "VS_SET").path("items").get(0);
        assertEquals("1.000", early.path("current").path("ver").asText());
        assertEquals(1, early.path("current").path("value").path("ruleIds").size(), "1.000 의 ruleIds: " + early.path("current"));
        JsonNode late = toc("RULE_SET", "2026-07-01T00:00:00", "VS_SET").path("items").get(0);
        assertEquals("1.001", late.path("current").path("ver").asText(), "applyFrom 은 포함");
        assertEquals(2, late.path("current").path("value").path("ruleIds").size());

        JsonNode versions = late.path("value").path("versions");
        assertEquals("1.000", versions.get(0).path("ver").decimalValue().toPlainString());
        assertEquals("RELEASED", versions.get(0).path("status").asText());
        assertEquals("2000-01-01T00:00:00", versions.get(0).path("applyFrom").asText());
        assertEquals("2026-07-01T00:00:00", versions.get(0).path("applyTo").asText());
        assertEquals("1.001", versions.get(1).path("ver").decimalValue().toPlainString());
        assertEquals("RELEASED", versions.get(1).path("status").asText());
        assertEquals("2026-07-01T00:00:00", versions.get(1).path("applyFrom").asText());
        assertEquals("9999-12-31T00:00:00", versions.get(1).path("applyTo").asText());
    }

    @Test
    void RULE_SET_저장값이_깨진_세트는_본문에서_그_키의_모든_쌍이_같은_메시지로_failed_다() throws Exception {
        seedSet();
        DmeTestSupport.ruleSet(jdbc, "BAD_SET", "깨진 세트", "[]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "BAD_SET", "{\"version\":1,\"nodes\":\"x\",\"edges\":[]}");

        JsonNode t = toc("RULE_SET", "2026-08-01T00:00:00", "VS_SET", "BAD_SET");
        assertEquals("BAD_SET", t.path("failed").get(0).path("key").asText(), t.toString());

        JsonNode b = bodies("RULE_SET", "BAD_SET", "1.000", "BAD_SET", "1.001", "VS_SET", "1.000", "BAD_SET", "x.y");
        assertEquals(1, b.path("items").size(), "깨지지 않은 세트는 정상: " + b);
        String message = failed(b, "BAD_SET", "1.000").path("message").asText();
        assertFalse(message.isBlank(), b.toString());
        assertEquals(message, failed(b, "BAD_SET", "1.001").path("message").asText(), "RELEASED 에 없는 ver 도 적재 실패가 먼저다");
        assertEquals("INVALID_VER", failed(b, "BAD_SET", "x.y").path("message").asText(), "형식 오류는 적재 전에 가린다");
    }

    // ------------------------------------------------------------------ LAYOUT

    private void seedLayouts() {
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_HEADER WHERE LAYOUT_ID IN (9601, 9603, 9690, 9691)");
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID IN (9601, 9603, 9690, 9691)");
        jdbc.update("DELETE FROM TB_MDM_LAYOUT WHERE LAYOUT_ID IN (9601, 9603, 9690, 9691)");
        jdbc.update("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, STATUS, VER) VALUES "
                + "(9690, 'HEADER', '버전 헤더', 'INUSE', 0), (9691, 'HEADER', '초안 헤더', 'CREATED', 0), "
                + "(9601, 'MESSAGE', '버전 전문', 'INUSE', 0), (9603, 'MESSAGE', '깨진 전문', 'INUSE', 0)");
        layoutVer(9690, "1.000", "RELEASED", "2000-01-01 00:00:00", "9999-12-31 00:00:00", 7);
        layoutVer(9691, "1.000", "DRAFT", null, null, 3);
        layoutVer(9601, "1.000", "RELEASED", "2000-01-01 00:00:00", "2026-07-01 00:00:00", 10);
        layoutVer(9601, "2.000", "RELEASED", "2026-07-01 00:00:00", "9999-12-31 00:00:00", 12);
        layoutVer(9603, "1.000", "RELEASED", "2000-01-01 00:00:00", "9999-12-31 00:00:00", 4);
        stack(9601, "1.000", 9690);
        stack(9601, "2.000", 9690);
        stack(9603, "1.000", 9691);
    }

    @Test
    void LAYOUT_목차와_current_와_본문은_part_없는_목록_원소와_같고_합성이_깨진_전문은_그_키만_failed_다() throws Exception {
        seedLayouts();
        JsonNode legacy = item(view("LAYOUT", "9601"), "9601");

        JsonNode t = toc("LAYOUT", "2026-08-01T00:00:00", "9601", "9603", "9690", "abc");
        assertEquals(1, t.path("items").size(), "헤더·숫자 아닌 키는 빠진다: " + t);
        assertEquals(1, t.path("failed").size(), t.toString());
        assertEquals("9603", t.path("failed").get(0).path("key").asText());
        JsonNode it = t.path("items").get(0);
        assertEquals("2.000", it.path("value").path("versions").get(1).path("ver").decimalValue().toPlainString());
        assertEquals("2.000", it.path("current").path("ver").asText());
        assertEquals(legacy.get(1), it.path("current").path("value"), "전문 본문 = 목록 원소(ver 문자열·segments 포함)");

        JsonNode b = bodies("LAYOUT", "9601", "1.000", "abc", "1.000", "9601", "3.000");
        assertEquals(1, b.path("items").size(), b.toString());
        assertEquals(legacy.get(0), b.path("items").get(0).path("value"));
        assertEquals("NOT_RELEASED", failed(b, "abc", "1.000").path("message").asText());
        assertEquals("NOT_RELEASED", failed(b, "9601", "3.000").path("message").asText());
    }

    @Test
    void LAYOUT_합성이_깨진_전문은_본문에서_그_키의_모든_쌍이_같은_메시지로_failed_다() throws Exception {
        seedLayouts();

        JsonNode b = bodies("LAYOUT", "9603", "1.000", "9603", "2.000", "9601", "1.000", "9603", "x.y");

        assertEquals(1, b.path("items").size(), "깨지지 않은 전문은 정상: " + b);
        String message = failed(b, "9603", "1.000").path("message").asText();
        assertFalse(message.isBlank(), b.toString());
        assertEquals(message, failed(b, "9603", "2.000").path("message").asText(), "RELEASED 에 없는 ver 도 적재 실패가 먼저다");
        assertEquals("INVALID_VER", failed(b, "9603", "x.y").path("message").asText());
    }

    private void layoutVer(long id, String ver, String status, String from, String to, int own) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, OWN_LENGTH) "
                + "VALUES (?, ?, 'MAJOR', ?, ?, ?, ?, ?)", id, new BigDecimal(ver), status, "DRAFT".equals(status) ? "kim" : null,
                from, to, own);
    }

    private void stack(long messageId, String ver, long headerId) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, VER, SEQ, HEADER_LAYOUT_ID) VALUES (?, ?, 1, ?)",
                messageId, new BigDecimal(ver), headerId);
    }

    // ------------------------------------------------------------------ CODE

    /**
     * 코드 VS_CD: RELEASED 1.000 [2026-01-01, 2026-04-01)·1.001(REAL) [2026-04-01, 2026-07-01)·2.000(INTEGER) [2026-07-01, 열린 끝), DRAFT 2.001.
     * items A(1.000~), B(1.001~), C(2.001~ 초안). TABLE TB(1.001~): B.
     */
    private void seedCode() {
        MasterCodeSeeds seeds = new MasterCodeSeeds(jdbc);
        seeds.seedCode("VS_CD", "INUSE", "MDM");
        seeds.released("VS_CD", "1.000", "2026-01-01 00:00:00", "2026-04-01 00:00:00");
        seeds.released("VS_CD", "1.001", "2026-04-01 00:00:00", "2026-07-01 00:00:00");
        seeds.released("VS_CD", "2.000", "2026-07-01 00:00:00", MasterCodeSeeds.OPEN_END);
        seeds.draft("VS_CD", "2.001", "kim");
        seeds.seedItem("VS_CD", "A", "1.000", MasterCodeSeeds.OPEN, "에이", 1);
        seeds.seedItem("VS_CD", "B", "1.001", MasterCodeSeeds.OPEN, "비", 2);
        seeds.seedItem("VS_CD", "C", "2.001", MasterCodeSeeds.OPEN, "씨(초안)", 3);
        seeds.seedBase("VS_CD");
        seeds.seedCate("VS_CD", "TB", "1.001", MasterCodeSeeds.OPEN, "TABLE", null, null, "표");
        seeds.seedCateItem("VS_CD", "TB", "B", "1.001", MasterCodeSeeds.OPEN);
    }

    @Test
    void CODE_목차는_헤더와_RELEASED_버전만_scale_3_으로_싣고_current_는_소급까지_엔진_규칙으로_고른다() throws Exception {
        seedCode();
        JsonNode t = toc("CODE", "2025-06-01T00:00:00", "VS_CD", "NO_CD");
        assertEquals(1, t.path("items").size(), t.toString());
        JsonNode value = t.path("items").get(0).path("value");
        assertEquals("VS_CD", value.path("header").path("maruCodeId").asText());
        assertEquals("INUSE", value.path("header").path("status").asText());
        JsonNode versions = value.path("versions");
        assertEquals(3, versions.size(), "DRAFT 2.001 은 빠진다: " + versions);
        assertEquals("1.000", versions.get(0).path("ver").decimalValue().toPlainString());
        assertEquals("1.001", versions.get(1).path("ver").decimalValue().toPlainString());
        assertEquals("2.000", versions.get(2).path("ver").decimalValue().toPlainString(), "INTEGER 로 저장된 2 도 scale 3");
        assertEquals("1.000", t.path("items").get(0).path("current").path("ver").asText(), "첫 적용 전 시각은 첫 버전으로 소급");
    }

    @Test
    void CODE_본문은_엔진_자르기와_같고_소속과_전체_표시를_싣는다() throws Exception {
        seedCode();
        JsonNode b = bodies("CODE", "VS_CD", "1.000", "VS_CD", "2", "VS_CD", "2.001", "NO_CD", "1.000");

        assertEquals(2, b.path("items").size(), b.toString());
        JsonNode v1 = b.path("items").get(0).path("value");
        assertEquals("1.000", b.path("items").get(0).path("ver").asText());
        assertEquals(1, v1.path("items").size(), "1.000 의 items 는 A 하나: " + v1);
        JsonNode tb1 = category(v1, "TB");
        assertEquals(false, tb1.path("all").asBoolean(true), "1.000 에서 TB 는 최초 소급으로 1.001 정의를 고르고 소속 B 는 1.000 items 에 없다");
        assertEquals(0, tb1.path("members").size());
        JsonNode v2 = b.path("items").get(1).path("value");
        assertEquals("2.000", b.path("items").get(1).path("ver").asText(), "요청 ver 2 는 2.000 으로 되돌린다");
        assertEquals(2, v2.path("items").size(), "C(초안 행)는 없다: " + v2);
        assertTrue(category(v2, "BASE").path("all").asBoolean());
        assertTrue(category(v2, "BASE").path("members").isNull());
        assertEquals("B", category(v2, "TB").path("members").get(0).asText());
        assertEquals("NOT_RELEASED", failed(b, "VS_CD", "2.001").path("message").asText());
        assertEquals("NOT_RELEASED", failed(b, "NO_CD", "1.000").path("message").asText());
    }

    @Test
    void CODE_current_본문은_같은_시각의_BODY_본문과_같다() throws Exception {
        seedCode();
        JsonNode t = toc("CODE", "2026-08-01T00:00:00", "VS_CD");
        JsonNode b = bodies("CODE", "VS_CD", "2.000");
        assertEquals("2.000", t.path("items").get(0).path("current").path("ver").asText());
        assertEquals(b.path("items").get(0).path("value"), t.path("items").get(0).path("current").path("value"));
    }

    @Test
    void CODE_current_는_마지막_적용_종료_이후와_빈틈에서도_소급으로_있고_at_이_없으면_null_이며_RELEASED_가_없으면_versions_가_비고_current_는_null_이다() throws Exception {
        seedCode();
        MasterCodeSeeds seeds = new MasterCodeSeeds(jdbc);
        seeds.seedCode("CL_CD", "INUSE", "MDM"); // 닫힌 끝 — 마지막 버전의 적용 종료가 지난 뒤
        seeds.released("CL_CD", "1.000", "2026-01-01 00:00:00", "2026-04-01 00:00:00");
        seeds.released("CL_CD", "2.000", "2026-04-01 00:00:00", "2026-07-01 00:00:00");
        seeds.seedCode("GAP_CD", "INUSE", "MDM"); // 두 버전 사이에 빈틈
        seeds.released("GAP_CD", "1.000", "2026-01-01 00:00:00", "2026-03-01 00:00:00");
        seeds.released("GAP_CD", "2.000", "2026-05-01 00:00:00", MasterCodeSeeds.OPEN_END);
        seeds.seedCode("DR_CD", "INUSE", "MDM"); // RELEASED 가 없다
        seeds.draft("DR_CD", "1.000", "kim");

        JsonNode after = toc("CODE", "2027-01-01T00:00:00", "VS_CD", "CL_CD");
        assertEquals("2.000", tocItem(after, "VS_CD").path("current").path("ver").asText(), "열린 끝 마지막 버전");
        assertEquals("1.000", tocItem(after, "CL_CD").path("current").path("ver").asText(), "마지막 버전의 적용 종료 이후는 ver 가 가장 작은 RELEASED 로 소급(엔진 CodeVersions.select)");
        assertFalse(tocItem(after, "CL_CD").path("current").isNull(), "RULE 과 달리 적용 종료 이후에도 current 가 있다");
        JsonNode gap = toc("CODE", "2026-04-01T00:00:00", "GAP_CD");
        assertEquals("1.000", tocItem(gap, "GAP_CD").path("current").path("ver").asText(), "빈틈은 ver 가 가장 작은 RELEASED 로 소급");
        assertFalse(tocItem(gap, "GAP_CD").path("current").isNull(), "RULE 과 달리 빈틈에서도 current 가 있다");

        JsonNode noAt = toc("CODE", null, "VS_CD", "GAP_CD");
        assertTrue(tocItem(noAt, "VS_CD").path("current").isNull(), "at 이 없으면 current 는 null");
        assertTrue(tocItem(noAt, "GAP_CD").path("current").isNull());
        assertEquals(3, tocItem(noAt, "VS_CD").path("value").path("versions").size(), "versions 는 at 과 무관하게 싣는다");

        JsonNode none = toc("CODE", "2026-08-01T00:00:00", "DR_CD");
        assertEquals(0, tocItem(none, "DR_CD").path("value").path("versions").size(), none.toString());
        assertTrue(tocItem(none, "DR_CD").path("current").isNull(), none.toString());
    }

    private static JsonNode tocItem(JsonNode toc, String key) {
        for (JsonNode i : toc.path("items")) {
            if (key.equals(i.path("key").asText())) {
                return i;
            }
        }
        throw new AssertionError("items 에 없다: " + key + " in " + toc);
    }

    @Test
    void CODE_저장값이_깨진_코드는_그_키만_failed_이고_묶음은_거부하지_않는다() throws Exception {
        seedCode();
        MasterCodeSeeds seeds = new MasterCodeSeeds(jdbc);
        seeds.seedCode("BAD_CD", "INUSE", "MDM");
        seeds.released("BAD_CD", "1.000", "2026-01-01 00:00:00", MasterCodeSeeds.OPEN_END);
        seeds.seedItem("BAD_CD", "A", "1.000", MasterCodeSeeds.OPEN, "에이", 1);
        seeds.seedBase("BAD_CD");
        seeds.seedCate("BAD_CD", "BROKEN", "1.000", MasterCodeSeeds.OPEN, "REGEX", "[", "CODE", "깨진 정규식"); // SQL 로 넣어 저장 검사를 우회한다

        JsonNode t = toc("CODE", "2026-08-01T00:00:00", "VS_CD", "BAD_CD");
        assertEquals(1, t.path("items").size(), t.toString());
        assertEquals("VS_CD", t.path("items").get(0).path("key").asText());
        assertEquals("BAD_CD", t.path("failed").get(0).path("key").asText(), t.toString());
        assertFalse(t.path("failed").get(0).path("message").asText().isBlank(), t.toString());

        JsonNode b = bodies("CODE", "VS_CD", "2.000", "BAD_CD", "1.000");
        assertEquals(1, b.path("items").size(), b.toString());
        assertEquals("BAD_CD", b.path("failed").get(0).path("key").asText(), b.toString());
        assertFalse(failed(b, "BAD_CD", "1.000").path("message").asText().isBlank(), b.toString());
    }

    static JsonNode category(JsonNode body, String cateId) {
        for (JsonNode c : body.path("categories")) {
            if (cateId.equals(c.path("cateId").asText())) {
                return c;
            }
        }
        throw new AssertionError("카테고리 없음: " + cateId + " in " + body);
    }

    // ------------------------------------------------------------------ 공통

    @Test
    void COLUMN_DOMAIN_은_part_를_무시하고_지금_응답을_준다() throws Exception {
        seedRule();
        JsonNode plain = view("COLUMN", "COIL_THK");
        JsonNode withPart = result(post(body(json.createObjectNode().put("type", "COLUMN").put("part", "TOC"), "COIL_THK")));
        assertEquals(plain, withPart);
        assertTrue(withPart.path("part").isMissingNode());
    }

    @Test
    void part_at_형식_오류와_키_500개_초과만_묶음을_거부한다() throws Exception {
        JsonNode badPart = post(body(json.createObjectNode().put("type", "RULE").put("part", "XYZ"), Q));
        assertFalse(badPart.path("meta").path("success").asBoolean(true), badPart.toString());
        assertTrue(badPart.path("meta").path("message").asText().startsWith(MdmErrorCode.INVALID_INPUT.defaultMessage()));
        JsonNode badAt = post(body(json.createObjectNode().put("type", "RULE").put("part", "TOC").put("at", "2026/10/03"), Q));
        assertFalse(badAt.path("meta").path("success").asBoolean(true), badAt.toString());
        ObjectNode many = json.createObjectNode();
        many.putObject("meta").put("menuId", "metaFeed");
        many.putObject("params").put("type", "RULE").put("part", "BODY");
        ArrayNode rows = many.putObject("grids").putObject("keys").putArray("rows");
        for (int i = 0; i < 501; i++) {
            rows.addObject().put("key", "R" + i).put("ver", "1.000");
        }
        assertFalse(post(many).path("meta").path("success").asBoolean(true));
    }

    @Test
    void 키가_없으면_part_를_되울린_빈_결과다() throws Exception {
        JsonNode r = toc("RULE", null);
        assertEquals("TOC", r.path("part").asText());
        assertEquals(0, r.path("items").size());
        assertEquals(0, r.path("failed").size());
    }

    // ------------------------------------------------------------------ 보조

    JsonNode toc(String type, String at, String... keys) throws IOException, InterruptedException {
        ObjectNode params = json.createObjectNode().put("type", type).put("part", "TOC");
        if (at != null) {
            params.put("at", at);
        }
        return result(post(body(params, keys)));
    }

    /** {@code keyVers} 는 키·ver 를 번갈아 적는다. */
    JsonNode bodies(String type, String... keyVers) throws IOException, InterruptedException {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", "metaFeed");
        body.putObject("params").put("type", type).put("part", "BODY");
        ArrayNode rows = body.putObject("grids").putObject("keys").putArray("rows");
        for (int i = 0; i < keyVers.length; i += 2) {
            rows.addObject().put("key", keyVers[i]).put("ver", keyVers[i + 1]);
        }
        return result(post(body));
    }

    static String currentVer(JsonNode toc) {
        return toc.path("items").get(0).path("current").path("ver").asText();
    }

    JsonNode view(String type, String... keys) throws IOException, InterruptedException {
        return result(post(body(json.createObjectNode().put("type", type), keys)));
    }

    static JsonNode failed(JsonNode result, String key, String ver) {
        for (JsonNode f : result.path("failed")) {
            if (key.equals(f.path("key").asText()) && ver.equals(f.path("ver").asText())) {
                return f;
            }
        }
        throw new AssertionError("failed 에 없다: " + key + "@" + ver + " in " + result);
    }

    ObjectNode body(ObjectNode params, String... keys) {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", "metaFeed");
        body.set("params", params);
        ArrayNode rows = body.putObject("grids").putObject("keys").putArray("rows");
        for (String k : keys) {
            rows.addObject().put("key", k);
        }
        return body;
    }

    JsonNode post(ObjectNode body) throws IOException, InterruptedException {
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
        return json.readTree(response.body());
    }

    JsonNode result(JsonNode response) {
        assertTrue(response.path("meta").path("success").asBoolean(false), response.toString());
        return response.path("data").path("result");
    }

    static JsonNode item(JsonNode result, String key) {
        for (JsonNode i : result.path("items")) {
            if (key.equals(i.path("key").asText())) {
                return i.path("value");
            }
        }
        throw new AssertionError("키가 없다: " + key + " in " + result);
    }

    static String effectiveClientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return (env != null && !env.isBlank()) ? env : TEST_CLIENT_KEY;
    }
}
