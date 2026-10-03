package com.dongkuk.dmes.mdm.feed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.mdm.MdmColumnMeta;
import com.dongkuk.dmes.cactus.mdm.MdmDefinitionLookup;
import com.dongkuk.dmes.cactus.mdm.MdmFetchResult;
import com.dongkuk.dmes.cactus.mdm.MdmJson;
import com.dongkuk.dmes.cactus.mdm.MdmLayoutVersion;
import com.dongkuk.dmes.cactus.mdm.MdmMetaCache;
import com.dongkuk.dmes.cactus.mdm.MdmMetaClient;
import com.dongkuk.dmes.cactus.mdm.MdmMetaService;
import com.dongkuk.dmes.cactus.mdm.MdmTargetType;
import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries;
import com.dongkuk.dmes.mdm.common.mastercode.MdmCodeLookup;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleSetVersionQueries;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionLookup;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutComposer;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import kr.dongkuk.maru.mdm.engine.domain.DefaultDomainValidator;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import kr.dongkuk.maru.mdm.engine.spi.MasterLookup;
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
import org.springframework.web.client.RestClient;

/**
 * Review Focus 1 — 피드(MDM)와 클라이언트(cactus)를 실제 HTTP 로 잇는 계약 시험(spec 2026-10-02 §3.4·§5.2). 양쪽 단위 시험은 각자 가짜를
 * 쓰므로 JSON 표류(LocalDateTime 형식·BigDecimal·Map&lt;Integer,…&gt; 키·enum·null)를 못 잡는다. MDM 원장에서 직접 만든 정의
 * ({@link StoredDefinitionLookup}, 빈이 아니라 new)와 HTTP 로 받아 되읽은 정의가 같은 판정을 내는지 본다.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + MdmMetaFeedContractHttpTest.TEST_CLIENT_KEY)
@ActiveProfiles("local")
class MdmMetaFeedContractHttpTest {

    static final String TEST_CLIENT_KEY = "mdm-feed-contract-test-key";
    private static final String Q = "QLTY_GRD_JDG";

    @TempDir
    static Path tempDir;

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;
    @Autowired
    MdmEvaluator mdmEvaluator;
    @Autowired
    RuleQueries ruleQueries;
    @Autowired
    StoredRuleDefinitions storedRuleDefinitions;
    @Autowired
    MdmRuleRepository ruleRepository;
    @Autowired
    MdmRuleSetRepository ruleSetRepository;
    @Autowired
    RuleSetVersionQueries ruleSetVersionQueries;
    @Autowired
    MasterCodeLedgerQueries ledger;
    @Autowired
    LayoutComposer composer;

    private JdbcTemplate jdbc;
    private MdmMetaService service;
    private MdmDefinitionLookup lookup;
    private DomainValidator validator;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-feed-contract-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        MetaRevTestSupport.clear(jdbc);
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        new MasterCodeSeeds(jdbc).clear();

        RestClient restClient = RestClient.builder().defaultHeader("X-Client-Key", effectiveClientKey()).build();
        MdmMetaClient client = new MdmMetaClient(restClient, "http://127.0.0.1:" + port, "mls");
        MdmMetaCache cache = new MdmMetaCache(1000, Duration.ofMinutes(60), Clock.systemUTC());
        cache.clear(0);
        service = new MdmMetaService(client, cache, Clock.systemUTC());
        lookup = new MdmDefinitionLookup(service);
        validator = new DefaultDomainValidator(lookup,
                new MdmEvaluator(new EngineLookups(lookup, lookup, CodeEffLookup.NONE, MasterLookup.NONE, FunctionProvider.NONE)));

        // 사전: sampleRule 의 COIL_THK(QTY NUMBER scale 2)에 표준식을 단다. 세 버전 룰(D-144 major/minor 소수):
        // 1.000 [2026-01-01, 2026-07-01), 1.001 MINOR [2026-07-01, 2027-01-01), 2.000 MAJOR [2027-01-01, 열린 끝).
        // SQLite NUMERIC 은 1.000·2.000 을 INTEGER, 1.001 을 REAL 로 저장한다 — 두 저장 형태가 모두 HTTP 를 지난다.
        DmeTestSupport.sampleRule(jdbc);
        jdbc.update("UPDATE TB_MDM_DOMAIN SET STD_RULE = 'value >= 0', STD_AST = ? WHERE STD_NAME = 'COIL_THK_D'", ast("value >= 0"));
        jdbc.update("UPDATE TB_MDM_COLUMN SET REQUIRED = 1 WHERE PHYS_NAME = 'COIL_THK'");
        jdbc.update("UPDATE TB_MDM_RULE_VER SET APPLY_TO = '2026-07-01 00:00:00' WHERE MARU_RULE_ID = ? AND VER = 1", Q);
        DmeTestSupport.released(jdbc, Q, new BigDecimal("1.001"), "MINOR", "FIRST", "2026-07-01 00:00:00", "2027-01-01 00:00:00");
        DmeTestSupport.sampleDefinition(jdbc, Q, new BigDecimal("1.001"));
        DmeTestSupport.released(jdbc, Q, new BigDecimal("2.000"), "MAJOR", "FIRST", "2027-01-01 00:00:00", null);
        DmeTestSupport.sampleDefinition(jdbc, Q, new BigDecimal("2.000"));
        // 세 버전 세트(D-144 2단계): 1.000 [2000-01-01, 2026-07-01), 1.001 MINOR [2026-07-01, 2027-01-01), 2.000 MAJOR [2027-01-01, 9999-12-31).
        // 세트 정의에는 판정 결과가 없으므로 버전마다 ruleIds 를 달리 해 고른 버전을 내용으로도 가른다. 부모 CREATED → 계산 상태 INUSE.
        DmeTestSupport.ruleSet(jdbc, "CT_SET", "계약 세트", "[\"" + Q + "\"]", "CREATED", 0);
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET APPLY_TO = '2026-07-01 00:00:00' WHERE MARU_RULE_SET_ID = 'CT_SET' AND VER = 1");
        DmeTestSupport.ruleSetVersion(jdbc, "CT_SET", "1.001", "MINOR", "RELEASED", null, "[\"" + Q + "\",\"CT_R2\"]",
                "2026-07-01 00:00:00", "2027-01-01 00:00:00", 0);
        DmeTestSupport.ruleSetVersion(jdbc, "CT_SET", "2.000", "MAJOR", "RELEASED", null, "[\"CT_R3\"]", "2027-01-01 00:00:00",
                "9999-12-31 00:00:00", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "CT_SET", "2.000",
                "{\"version\":1,\"nodes\":[{\"id\":\"s\",\"kind\":\"START\"},{\"id\":\"r\",\"kind\":\"RULE\",\"ruleId\":\"CT_R3\"},"
                        + "{\"id\":\"e\",\"kind\":\"END\"}],\"edges\":[{\"id\":\"e1\",\"from\":\"s\",\"to\":\"r\"},"
                        + "{\"id\":\"e2\",\"from\":\"r\",\"to\":\"e\"}]}");
        DmeTestSupport.ruleSetDraft(jdbc, "CT_SET", "3.000", "kim", "[\"CT_DRAFT\"]", 0);

        // 코드: CT_CD 1.000 RELEASED(A), CODE 도메인 + 컬럼 CT_CODE_COL
        MasterCodeSeeds seeds = new MasterCodeSeeds(jdbc);
        seeds.seedCode("CT_CD", "INUSE", "MDM");
        seeds.released("CT_CD", "1.000", "2026-01-01 00:00:00", MasterCodeSeeds.OPEN_END);
        seeds.seedItem("CT_CD", "A", "1.000", MasterCodeSeeds.OPEN, "에이", 1);
        seeds.seedBase("CT_CD");
        jdbc.update("INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, MARU_CODE_ID, CATE_ID, VER) "
                + "VALUES ('계약 코드', 'CT_CODE_D', 'CODE', 'STRING', 'CT_CD', 'BASE', 0)");
        long codeDomain = jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'CT_CODE_D'", Long.class);
        DmeTestSupport.column(jdbc, "CT_CODE_COL", codeDomain);
    }

    @Test
    void 컬럼_검증이_MDM_HTTP_로_받은_정의로_돈다() {
        Instant now = Instant.now();
        assertTrue(validator.validate("TB_ANY", "COIL_THK", Map.of("COIL_THK", "1.5"), now).valid());
        DomainValidator.ValidationResult bad = validator.validate("TB_ANY", "COIL_THK", Map.of("COIL_THK", "-1"), now);
        assertFalse(bad.valid());
        assertEquals(DomainValidator.Step.STD_EXPR, bad.failures().get(0).step());
    }

    @Test
    void CODE_도메인_컬럼이_MDM_HTTP_로_받은_코드_원본으로_MASTER_를_판정한다() {
        Instant now = Instant.now();
        assertTrue(validator.validate("T", "CT_CODE_COL", Map.of("CT_CODE_COL", "A"), now).valid());
        assertFalse(validator.validate("T", "CT_CODE_COL", Map.of("CT_CODE_COL", "Z"), now).valid());
        CodeRows rows = (CodeRows) service.one(MdmTargetType.CODE, "CT_CD").orElseThrow();
        assertEquals(0, rows.versions().get(0).ver().compareTo(new BigDecimal("1.000")));
        assertEquals(LocalDateTime.of(2026, 1, 1, 0, 0), rows.versions().get(0).applyFrom());
    }

    /**
     * spec 2026-10-03-mdm-column-system-alias-design §3·§4 — 별칭으로 찾은 컬럼 값(새 칸 matchedSystem·systemPhysName 포함)이 cactus
     * {@link MdmColumnMeta} 로 그대로 읽히고, 별칭 칸을 뺀 나머지 칸이 표준 이름으로 찾은 값과 같다. cactus 클라이언트 경유 사례는 {@code cactus_클라이언트가_system_code_MES_…} 시험이 맡고, 여기서는
     * HTTP 본문에 {@code params.systemCode} 를 직접 실어 원시 JSON 칸을 본다.
     */
    @Test
    void 별칭으로_찾은_컬럼_값이_cactus_컬럼_메타로_읽히고_표준_값과_같다() throws Exception {
        long id = jdbc.queryForObject("SELECT COLUMN_ID FROM TB_MDM_COLUMN WHERE PHYS_NAME = 'COIL_THK'", Long.class);
        jdbc.update("INSERT INTO TB_MDM_COLUMN_SYSTEM (COLUMN_ID, SYSTEM_CODE, PHYS_NAME, VER) VALUES (?, 'MES', 'Coil_T', 0)", id);

        JsonNode result = viewRaw("COLUMN", "MES", "COIL_T", "COIL_THK");

        JsonNode aliasValue = valueOf(result, "COIL_T");
        JsonNode standardValue = valueOf(result, "COIL_THK");
        assertEquals("MES", aliasValue.path("matchedSystem").asText(), aliasValue.toString());
        assertEquals("Coil_T", aliasValue.path("systemPhysName").asText(), aliasValue.toString());
        assertTrue(standardValue.path("matchedSystem").isNull(), "표준으로 맞으면 matchedSystem 은 null: " + standardValue);
        assertTrue(standardValue.path("systemPhysName").isNull(), "표준으로 맞으면 systemPhysName 은 null: " + standardValue);

        // 별칭 칸을 실제로 빼고 비교한다.
        ObjectNode aliasDefinition = withoutAliasFields(aliasValue);
        ObjectNode standardDefinition = withoutAliasFields(standardValue);
        assertEquals(standardDefinition, aliasDefinition, "별칭 칸을 뺀 정의는 표준 매칭과 같다");
        MdmColumnMeta viaAlias = MdmJson.MAPPER.treeToValue(aliasDefinition, MdmColumnMeta.class);
        MdmColumnMeta viaStandard = MdmJson.MAPPER.treeToValue(standardDefinition, MdmColumnMeta.class);
        assertEquals("COIL_THK", viaAlias.physName());
        assertEquals(viaStandard, viaAlias, "별칭 칸을 뺀 정의는 표준 매칭과 같다");
        assertTrue(viaAlias.required());
        assertEquals("value >= 0", viaAlias.stdExpr().text());
    }

    /**
     * 별칭 매칭 전 구간 — cactus {@link MdmMetaClient}(system-code=MES) → HTTP → MDM metaFeed → {@link MdmColumnMeta}. 표준 우선(겹치는 이름은 표준),
     * 별칭 매칭(대소문자 무시)과 응답 칸, 모호 별칭은 missing(found·failed 둘 다 없음), system-code 가 없으면 별칭을 보지 않는다.
     */
    @Test
    void cactus_클라이언트가_system_code_MES_로_별칭_매칭_전_구간을_지난다() {
        long thk = jdbc.queryForObject("SELECT COLUMN_ID FROM TB_MDM_COLUMN WHERE PHYS_NAME = 'COIL_THK'", Long.class);
        long codeCol = jdbc.queryForObject("SELECT COLUMN_ID FROM TB_MDM_COLUMN WHERE PHYS_NAME = 'CT_CODE_COL'", Long.class);
        jdbc.update("INSERT INTO TB_MDM_COLUMN_SYSTEM (COLUMN_ID, SYSTEM_CODE, PHYS_NAME, VER) VALUES (?, 'MES', 'Coil_T', 0)", thk);
        // 겹침: 별칭 CT_CODE_COL 이 COIL_THK 를 가리키지만 같은 이름의 표준 물리명 컬럼이 있다 — 표준이 이겨야 한다.
        jdbc.update("INSERT INTO TB_MDM_COLUMN_SYSTEM (COLUMN_ID, SYSTEM_CODE, PHYS_NAME, VER) VALUES (?, 'MES', 'CT_CODE_COL', 0)", thk);
        // 모호: 같은 별칭(대소문자 무시)이 서로 다른 두 컬럼을 가리킨다.
        jdbc.update("INSERT INTO TB_MDM_COLUMN_SYSTEM (COLUMN_ID, SYSTEM_CODE, PHYS_NAME, VER) VALUES (?, 'MES', 'AMB_NAME', 0)", thk);
        jdbc.update("INSERT INTO TB_MDM_COLUMN_SYSTEM (COLUMN_ID, SYSTEM_CODE, PHYS_NAME, VER) VALUES (?, 'MES', 'amb_name', 0)", codeCol);

        RestClient restClient = RestClient.builder().defaultHeader("X-Client-Key", effectiveClientKey()).build();
        String baseUrl = "http://127.0.0.1:" + port;
        MdmMetaClient mes = new MdmMetaClient(restClient, baseUrl, "mls", "MES");
        MdmFetchResult result = mes.fetch(MdmTargetType.COLUMN, List.of("COIL_T", "COIL_THK", "CT_CODE_COL", "AMB_NAME", "NO_SUCH"));

        assertTrue(result.failed().isEmpty(), result.failed().toString());
        assertEquals(java.util.Set.of("COIL_T", "COIL_THK", "CT_CODE_COL"), result.found().keySet(),
                "모호 별칭(AMB_NAME)과 없는 키는 found·failed 모두에 없다(missing)");

        MdmColumnMeta viaAlias = (MdmColumnMeta) result.found().get("COIL_T");
        assertEquals("COIL_THK", viaAlias.physName(), "physName 은 표준 물리명");
        assertEquals("MES", viaAlias.matchedSystem());
        assertEquals("Coil_T", viaAlias.systemPhysName(), "저장된 별칭 원문");
        assertTrue(viaAlias.required());
        assertEquals("value >= 0", viaAlias.stdExpr().text());

        MdmColumnMeta standard = (MdmColumnMeta) result.found().get("COIL_THK");
        assertNull(standard.matchedSystem());
        assertNull(standard.systemPhysName());
        assertEquals(standard, new MdmColumnMeta(viaAlias.physName(), viaAlias.columnName(), viaAlias.labelLong(), viaAlias.labelMid(),
                viaAlias.labelShort(), viaAlias.description(), viaAlias.usageNote(), viaAlias.dataType(), viaAlias.length(),
                viaAlias.scale(), viaAlias.required(), viaAlias.defaultValue(), viaAlias.refKind(), viaAlias.refTarget(),
                viaAlias.refCateId(), viaAlias.domain(), viaAlias.stdExpr(), viaAlias.bizExpr(), viaAlias.bizRequiredVars(),
                viaAlias.codeRef(), null, null), "별칭 칸을 뺀 정의는 표준 매칭과 같다");

        MdmColumnMeta overlap = (MdmColumnMeta) result.found().get("CT_CODE_COL");
        assertEquals("CT_CODE_COL", overlap.physName(), "겹치는 이름은 표준 컬럼(별칭 대상 COIL_THK 가 아니다)");
        assertNull(overlap.matchedSystem());
        assertNull(overlap.systemPhysName());

        // system-code 가 없는 클라이언트는 별칭을 보지 않는다 — 표준 이름만 맞는다.
        MdmMetaClient noSystem = new MdmMetaClient(restClient, baseUrl, "mls");
        MdmFetchResult plain = noSystem.fetch(MdmTargetType.COLUMN, List.of("COIL_T", "COIL_THK"));
        assertEquals(List.of("COIL_THK"), List.copyOf(plain.found().keySet()));
        assertTrue(plain.failed().isEmpty(), plain.failed().toString());
    }

    /** 컬럼 값 사본에서 별칭 칸(matchedSystem·systemPhysName)을 뺀 정의만 남긴다. */
    private static ObjectNode withoutAliasFields(JsonNode columnValue) {
        ObjectNode copy = columnValue.deepCopy();
        copy.remove(List.of("matchedSystem", "systemPhysName"));
        return copy;
    }

    private JsonNode viewRaw(String type, String systemCode, String... keys) throws Exception {
        ObjectNode body = MdmJson.MAPPER.createObjectNode();
        body.putObject("meta").put("menuId", "metaFeed");
        body.putObject("params").put("type", type).put("systemCode", systemCode);
        ArrayNode rows = body.putObject("grids").putObject("keys").putArray("rows");
        for (String k : keys) {
            rows.addObject().put("key", k);
        }
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/oasis/metaFeed/view"))
                .header("Content-Type", "application/json")
                .header("X-Client-Key", effectiveClientKey())
                .header("X-Authenticated-User", "system:mls")
                .header("X-Authenticated-Role", "SYSTEM")
                .POST(HttpRequest.BodyPublishers.ofString(MdmJson.MAPPER.writeValueAsString(body)))
                .build();
        HttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode(), response.body());
        JsonNode root = MdmJson.MAPPER.readTree(response.body());
        assertTrue(root.path("meta").path("success").asBoolean(false), root.toString());
        return root.path("data").path("result");
    }

    private static JsonNode valueOf(JsonNode result, String key) {
        for (JsonNode i : result.path("items")) {
            if (key.equals(i.path("key").asText())) {
                return i.path("value");
            }
        }
        throw new AssertionError("키가 없다: " + key + " in " + result);
    }

    /**
     * 코드 버전 자리수(DECIMAL(7,3) → scale 3, 엔진 계약 #17)가 MDM 직렬화({@code MetaFeedJson}) → OASIS 응답 → cactus 역직렬화({@code MdmJson})를
     * 거쳐도 그대로다. 레코드 equals 는 {@code BigDecimal.equals}(자리수까지 비교)를 쓰므로 원장에서 직접 만든 값과 같으면 자리수가 지켜진 것이다.
     */
    @Test
    void CODE_원본은_HTTP_왕복_뒤에도_원장_값과_자리수까지_같다() {
        CodeRows direct = new MdmCodeLookup(ledger).code("CT_CD").orElseThrow();
        CodeRows viaHttp = (CodeRows) service.one(MdmTargetType.CODE, "CT_CD").orElseThrow();

        assertEquals(direct, viaHttp);
        assertEquals(new BigDecimal("1.000"), viaHttp.versions().get(0).ver());
        assertEquals(3, viaHttp.versions().get(0).ver().scale());
        assertEquals(3, viaHttp.items().get(0).fromVer().scale());
        assertEquals(new BigDecimal("9999.000"), viaHttp.items().get(0).toVer());
        assertEquals(3, viaHttp.categories().get(0).fromVer().scale());
        assertEquals(LocalDateTime.of(9999, 12, 31, 0, 0), viaHttp.versions().get(0).applyTo());
    }

    @Test
    void 룰은_적용_기간_경계_양쪽에서_MDM_원장과_같은_버전과_내용을_고른다() {
        StoredDefinitionLookup stored = stored();
        // 경계마다 기대 버전을 못박는다 — 원장·HTTP 가 같은 틀린 버전을 고르는 경우도 잡는다. equals 는 자리수까지 본다(1.000 ≠ 1).
        Map<LocalDateTime, BigDecimal> expected = new java.util.LinkedHashMap<>();
        expected.put(LocalDateTime.of(2026, 6, 30, 23, 59, 59), new BigDecimal("1.000"));
        expected.put(LocalDateTime.of(2026, 7, 1, 0, 0), new BigDecimal("1.001"));
        expected.put(LocalDateTime.of(2026, 12, 31, 23, 59, 59), new BigDecimal("1.001"));
        expected.put(LocalDateTime.of(2027, 1, 1, 0, 0), new BigDecimal("2.000"));
        expected.forEach((at, ver) -> {
            Instant ts = at.atZone(MdmDefinitionLookup.KST).toInstant();
            RuleDefinition viaHttp = lookup.rule(Q, ts).orElseThrow();
            RuleDefinition direct = stored.rule(Q, ts).orElseThrow();
            assertEquals(ver, direct.ver(), "원장 판정 시각 " + at);
            assertEquals(ver, viaHttp.ver(), "HTTP 판정 시각 " + at);
            assertEquals(3, viaHttp.ver().scale(), "HTTP 판정 시각 " + at);
            assertEquals(fingerprint(direct), fingerprint(viaHttp), "판정 시각 " + at);
            // fingerprint 는 키를 문자열로 이어 붙여 Integer 1 과 "1" 을 가르지 못한다 — 행(셀 맵 키 타입·op·left·right·list·val 포함)을 그대로 비교한다
            assertEquals(direct.rows(), viaHttp.rows(), "판정 시각 " + at);
            viaHttp.rows().forEach(r -> r.cells().keySet().forEach(k -> assertEquals(Integer.class, ((Object) k).getClass())));
        });
        // 적용 시작 전은 원장·HTTP 모두 없다
        Instant beforeAll = LocalDateTime.of(2025, 12, 31, 23, 59, 59).atZone(MdmDefinitionLookup.KST).toInstant();
        assertTrue(stored.rule(Q, beforeAll).isEmpty());
        assertTrue(lookup.rule(Q, beforeAll).isEmpty());
    }

    /**
     * D-144 2단계 — 세트도 RELEASED 버전 목록이 HTTP 를 지나 업무 모듈이 판정 시각으로 고른다. 경계마다 기대 버전을 못박고, 원장
     * ({@code StoredDefinitionLookup.ruleSet(id, T)})과 HTTP 가 레코드 전체(ver 자리수·적용 구간·ruleIds·상태·흐름)까지 같은지 본다. DRAFT 3.000 은 오지 않는다.
     */
    @Test
    void 룰_세트는_적용_기간_경계_양쪽에서_MDM_원장과_같은_버전과_내용을_고른다() {
        StoredDefinitionLookup stored = stored();
        Map<LocalDateTime, BigDecimal> expected = new java.util.LinkedHashMap<>();
        expected.put(LocalDateTime.of(2000, 1, 1, 0, 0), new BigDecimal("1.000"));
        expected.put(LocalDateTime.of(2026, 6, 30, 23, 59, 59), new BigDecimal("1.000"));
        expected.put(LocalDateTime.of(2026, 7, 1, 0, 0), new BigDecimal("1.001"));
        expected.put(LocalDateTime.of(2026, 12, 31, 23, 59, 59), new BigDecimal("1.001"));
        expected.put(LocalDateTime.of(2027, 1, 1, 0, 0), new BigDecimal("2.000"));
        Map<BigDecimal, List<String>> members = Map.of(new BigDecimal("1.000"), List.of(Q), new BigDecimal("1.001"), List.of(Q, "CT_R2"),
                new BigDecimal("2.000"), List.of("CT_R3"));
        expected.forEach((at, ver) -> {
            Instant ts = at.atZone(MdmDefinitionLookup.KST).toInstant();
            RuleSetDefinition viaHttp = lookup.ruleSet("CT_SET", ts).orElseThrow();
            RuleSetDefinition direct = stored.ruleSet("CT_SET", ts).orElseThrow();
            assertEquals(ver, direct.ver(), "원장 판정 시각 " + at);
            assertEquals(ver, viaHttp.ver(), "HTTP 판정 시각 " + at);
            assertEquals(3, viaHttp.ver().scale(), "HTTP 판정 시각 " + at);
            assertEquals(members.get(ver), viaHttp.ruleIds(), "판정 시각 " + at);
            assertEquals(direct, viaHttp, "판정 시각 " + at);                                      // 레코드 equals — 흐름·상태·구간까지
        });
        assertTrue(lookup.ruleSet("CT_SET", LocalDateTime.of(2027, 1, 1, 0, 0).atZone(MdmDefinitionLookup.KST).toInstant())
                .orElseThrow().flow() != null, "2.000 흐름이 HTTP 를 지난다");
        // 캐시 값은 RELEASED 버전 목록(ver 오름차순, DRAFT 3.000 없음)
        @SuppressWarnings("unchecked")
        List<RuleSetDefinition> cached = (List<RuleSetDefinition>) service.one(MdmTargetType.RULE_SET, "CT_SET").orElseThrow();
        assertEquals(List.of(new BigDecimal("1.000"), new BigDecimal("1.001"), new BigDecimal("2.000")),
                cached.stream().map(RuleSetDefinition::ver).toList());
        cached.forEach(d -> assertEquals(3, d.ver().scale(), d.toString()));
        // 적용 시작 전은 원장·HTTP 모두 없다
        Instant beforeAll = LocalDateTime.of(1999, 12, 31, 23, 59, 59).atZone(MdmDefinitionLookup.KST).toInstant();
        assertTrue(stored.ruleSet("CT_SET", beforeAll).isEmpty());
        assertTrue(lookup.ruleSet("CT_SET", beforeAll).isEmpty());
    }

    /**
     * D-144 3단계 · ADR-0007 D6 — 전문도 RELEASED 버전 목록이 HTTP 를 지나 업무 모듈이 판정 시각으로 고른다. 전문 버전 경계(7/1)와 그 안의
     * 헤더 버전 경계(4/1) 앞뒤에서 HTTP 로 고른 스냅샷이 MDM 원장의 시각 T 합성({@code LayoutComposer.at})과 같은지 본다 — 헤더 경계 때문에
     * 같은 전문 1.000 이 4/1 앞뒤로 길이·본문 오프셋이 다르다. 숫자는 HTTP 쪽이 BigDecimal 이므로 칸별로 수 비교한다.
     */
    @Test
    void 전문은_버전_경계와_헤더_버전_경계_양쪽에서_MDM_원장_합성과_같은_스냅샷을_고른다() {
        seedLayouts();
        Map<LocalDateTime, String[]> expected = new java.util.LinkedHashMap<>(); // 전문 버전, 헤더 버전, 총 길이
        expected.put(LocalDateTime.of(2026, 1, 1, 0, 0), new String[] {"1.000", "1.000", "17"});
        expected.put(LocalDateTime.of(2026, 3, 31, 23, 59, 59), new String[] {"1.000", "1.000", "17"});
        expected.put(LocalDateTime.of(2026, 4, 1, 0, 0), new String[] {"1.000", "2.000", "19"});
        expected.put(LocalDateTime.of(2026, 6, 30, 23, 59, 59), new String[] {"1.000", "2.000", "19"});
        expected.put(LocalDateTime.of(2026, 7, 1, 0, 0), new String[] {"2.000", "2.000", "21"});
        expected.forEach((at, want) -> {
            Map<String, Object> viaHttp = lookup.layout("9801", at.atZone(MdmDefinitionLookup.KST).toInstant()).orElseThrow();
            MdmLayoutSnapshot direct = composer.at(9801L, at);
            assertEquals(0, new BigDecimal(want[0]).compareTo(direct.layoutVersion()), "원장 판정 시각 " + at);
            assertEquals(new BigDecimal(want[0]), viaHttp.get("layoutVersion"), "HTTP 판정 시각 " + at + " — 자리수까지");
            assertEquals(Integer.parseInt(want[2]), direct.totalLength(), "원장 판정 시각 " + at);
            assertEquals(direct.totalLength(), ((Number) viaHttp.get("totalLength")).intValue(), "판정 시각 " + at);
            @SuppressWarnings("unchecked")
            Map<String, Object> header = ((List<Map<String, Object>>) viaHttp.get("headers")).get(0);
            assertEquals(0, new BigDecimal(want[1]).compareTo(direct.headers().get(0).headerVersion()), "원장 판정 시각 " + at);
            assertEquals(new BigDecimal(want[1]), header.get("headerVersion"), "HTTP 판정 시각 " + at);
            assertEquals(direct.headers().get(0).totalLength(), ((Number) header.get("totalLength")).intValue(), "판정 시각 " + at);
            @SuppressWarnings("unchecked")
            Map<String, Object> body = ((List<Map<String, Object>>) viaHttp.get("items")).get(0);
            assertEquals(direct.items().get(0).offset(), ((Number) body.get("offset")).intValue(), "본문 절대 오프셋, 판정 시각 " + at);
        });
        // 적용 시작 전은 원장·HTTP 모두 없다(원장은 오류, HTTP 는 빈 값)
        LocalDateTime beforeAll = LocalDateTime.of(2025, 12, 31, 23, 59, 59);
        assertTrue(lookup.layout("9801", beforeAll.atZone(MdmDefinitionLookup.KST).toInstant()).isEmpty());
        assertThrows(com.dongkuk.dmes.cactus.common.BusinessException.class, () -> composer.at(9801L, beforeAll));
        // 캐시 값은 RELEASED 버전 목록(ver 수 비교 오름차순, 자리수 3, DRAFT 3.000 없음), 1.000 은 헤더 경계로 두 구간
        @SuppressWarnings("unchecked")
        List<MdmLayoutVersion> cached = (List<MdmLayoutVersion>) service.one(MdmTargetType.LAYOUT, "9801").orElseThrow();
        assertEquals(List.of(new BigDecimal("1.000"), new BigDecimal("2.000")), cached.stream().map(MdmLayoutVersion::ver).toList());
        assertEquals(List.of(LocalDateTime.of(2026, 1, 1, 0, 0), LocalDateTime.of(2026, 4, 1, 0, 0)),
                cached.get(0).segments().stream().map(MdmLayoutVersion.Segment::applyFrom).toList());
        assertEquals(LocalDateTime.of(9999, 12, 31, 0, 0), cached.get(1).applyTo());
    }

    /** 헤더 9890: 1.000 [2000-01-01, 2026-04-01) 7자, 2.000 [2026-04-01, 열린 끝) 9자. 전문 9801: 1.000 [2026-01-01, 2026-07-01) 10자, 2.000 [2026-07-01, 열린 끝) 12자. */
    private void seedLayouts() {
        String ids = "(9801, 9890)";
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_CONST WHERE LAYOUT_ID IN " + ids);
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_HEADER WHERE LAYOUT_ID IN " + ids);
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_ITEM WHERE LAYOUT_ID IN " + ids);
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID IN " + ids);
        jdbc.update("DELETE FROM TB_MDM_LAYOUT WHERE LAYOUT_ID IN " + ids);
        jdbc.update("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, STATUS, VER) VALUES "
                + "(9890, 'HEADER', '계약 헤더', 'INUSE', 0), (9801, 'MESSAGE', '계약 전문', 'INUSE', 0)");
        layoutVer(9890, "1.000", "RELEASED", "2000-01-01 00:00:00", "2026-04-01 00:00:00", 7);
        layoutVer(9890, "2.000", "RELEASED", "2026-04-01 00:00:00", "9999-12-31 00:00:00", 9);
        layoutVer(9801, "1.000", "RELEASED", "2026-01-01 00:00:00", "2026-07-01 00:00:00", 10);
        layoutVer(9801, "2.000", "RELEASED", "2026-07-01 00:00:00", "9999-12-31 00:00:00", 12);
        layoutVer(9801, "3.000", "DRAFT", null, null, 30);
        filler(9890, "1.000", 7);
        filler(9890, "2.000", 9);
        for (String ver : new String[] {"1.000", "2.000", "3.000"}) {
            filler(9801, ver, "1.000".equals(ver) ? 10 : "2.000".equals(ver) ? 12 : 30);
            jdbc.update("INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, VER, SEQ, HEADER_LAYOUT_ID) VALUES (9801, ?, 1, 9890)", new BigDecimal(ver));
        }
    }

    private void layoutVer(long id, String ver, String status, String from, String to, int own) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, OWN_LENGTH) "
                + "VALUES (?, ?, 'MAJOR', ?, ?, ?, ?, ?)", id, new BigDecimal(ver), status, "DRAFT".equals(status) ? "kim" : null,
                from, to, own);
    }

    private void filler(long id, String ver, int length) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, VER, SEQ, FILL_KIND, FILLER_LENGTH, `OFFSET`, `LENGTH`) "
                + "VALUES (?, ?, 1, 'FILLER', ?, 0, ?)", id, new BigDecimal(ver), length, length);
    }

    private StoredDefinitionLookup stored() {
        return new StoredDefinitionLookup(ruleQueries, storedRuleDefinitions, ruleRepository, ruleSetVersionQueries, ruleSetRepository);
    }

    /** 판정에 쓰이는 칸 — ver·적용 구간·종류·적중·변수·행 셀 텍스트(키는 var_id 정수). AST Map 은 숫자 타입이 왕복에서 바뀔 수 있어 뺀다. */
    static String fingerprint(RuleDefinition d) {
        String vars = d.vars().stream().map(v -> v.varId() + ":" + v.varKind() + ":" + v.varName() + ":" + v.dataType() + ":" + v.scale())
                .collect(Collectors.joining(","));
        String rows = d.rows().stream().map(r -> r.rowId() + ":" + r.seq() + ":" + r.rowKind() + ":"
                + new TreeMap<>(r.cells()).entrySet().stream().map(e -> e.getKey() + "=" + e.getValue().text()).collect(Collectors.joining("|")))
                .collect(Collectors.joining(","));
        return d.ruleId() + "/" + d.ver() + "/" + d.applyFrom() + "/" + d.applyTo() + "/" + d.ruleKind() + "/" + d.hitPolicy()
                + "/" + d.contract().always().size() + "/" + vars + "/" + rows;
    }

    String ast(String text) {
        try {
            return DomainJson.write(AstExporter.export(text, mdmEvaluator.configuration()));
        } catch (com.ezylang.evalex.parser.ParseException e) {
            throw new IllegalStateException(e);
        }
    }

    static String effectiveClientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return (env != null && !env.isBlank()) ? env : TEST_CLIENT_KEY;
    }
}
