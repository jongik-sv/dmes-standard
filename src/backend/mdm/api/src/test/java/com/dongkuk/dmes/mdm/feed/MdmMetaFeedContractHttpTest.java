package com.dongkuk.dmes.mdm.feed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.mdm.MdmDefinitionLookup;
import com.dongkuk.dmes.cactus.mdm.MdmMetaCache;
import com.dongkuk.dmes.cactus.mdm.MdmMetaClient;
import com.dongkuk.dmes.cactus.mdm.MdmMetaService;
import com.dongkuk.dmes.cactus.mdm.MdmTargetType;
import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries;
import com.dongkuk.dmes.mdm.common.mastercode.MdmCodeLookup;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionLookup;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
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
    MasterCodeLedgerQueries ledger;

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

        // 사전: sampleRule 의 COIL_THK(QTY NUMBER scale 2)에 표준식을 단다. 두 버전 룰: v1 [2026-01-01, 2026-07-01), v2 [2026-07-01, 열린 끝)
        DmeTestSupport.sampleRule(jdbc);
        jdbc.update("UPDATE TB_MDM_DOMAIN SET STD_RULE = 'value >= 0', STD_AST = ? WHERE STD_NAME = 'COIL_THK_D'", ast("value >= 0"));
        jdbc.update("UPDATE TB_MDM_COLUMN SET REQUIRED = 1 WHERE PHYS_NAME = 'COIL_THK'");
        jdbc.update("UPDATE TB_MDM_RULE_VER SET APPLY_TO = '2026-07-01 00:00:00' WHERE MARU_RULE_ID = ? AND VER = 1", Q);
        DmeTestSupport.released(jdbc, Q, 2, "FIRST", "2026-07-01 00:00:00", null);
        DmeTestSupport.sampleDefinition(jdbc, Q, 2);
        DmeTestSupport.ruleSet(jdbc, "CT_SET", "계약 세트", "[\"" + Q + "\"]", "INUSE", 0);

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
        StoredDefinitionLookup stored = new StoredDefinitionLookup(ruleQueries, storedRuleDefinitions, ruleRepository, ruleSetRepository);
        for (LocalDateTime at : new LocalDateTime[] {LocalDateTime.of(2026, 6, 30, 23, 59, 59), LocalDateTime.of(2026, 7, 1, 0, 0)}) {
            Instant ts = at.atZone(MdmDefinitionLookup.KST).toInstant();
            RuleDefinition viaHttp = lookup.rule(Q, ts).orElseThrow();
            RuleDefinition direct = stored.rule(Q, ts).orElseThrow();
            assertEquals(fingerprint(direct), fingerprint(viaHttp), "판정 시각 " + at);
        }
        assertEquals(stored.ruleSet("CT_SET").orElseThrow(), lookup.ruleSet("CT_SET").orElseThrow());
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
