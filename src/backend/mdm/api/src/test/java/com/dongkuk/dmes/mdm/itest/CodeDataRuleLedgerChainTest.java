package com.dongkuk.dmes.mdm.itest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.engine.MdmEngineConfig;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries;
import com.dongkuk.dmes.mdm.common.mastercode.MdmCodeLookup;
import com.dongkuk.dmes.mdm.common.rule.RuleCaseJudge;
import com.dongkuk.dmes.mdm.common.rule.definition.RuleDefinitionAssembler.Assembled;
import com.dongkuk.dmes.mdm.common.rule.definition.SingleRuleDefinitionLookup;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions.Stored;
import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import javax.sql.DataSource;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.rule.MdmRuleEngine;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
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

/**
 * TSK-09-03 design.md §3 B3 — CODE 참조 → 코드 확정 → 데이터 등록 → 룰 MASTER 확정 → 원장 기준 판정 일치까지 한 흐름으로
 * 잇는다(수용 기준 1). 화면 네 개(domainMng·codeMng/codeItemEdit/codeConfirm·dataMng/dataItemMng·ruleMng/ruleEdit/
 * ruleConfirm)는 실제 BPMN 을 HTTP 로 그대로 태운다({@code DmcOasisHttpTest}·{@code DmdOasisHttpTest}·
 * {@code DmeOasisHttpTest}·{@code TermDomainColumnChainOasisFlowTest} 골격).
 *
 * <p>{@code MdmEngineConfig} 는 운영에서 {@code CodeLookup}·{@code MasterLookup} 빈을 등록하지 않는다(D-077, design
 * 「담당자 확인 필요 결정」 D1). 그래서 "판정" 단계만 이 시험이 직접 조립한 {@code MdmEvaluator}(두 SPI 를 원장에 실제로
 * 이어 붙인 시험 전용 구현)로 확인한다 — {@code MdmEngineConfig} 자체나 운영 빈 등록은 건드리지 않는다(불변 규칙).
 * {@code MASTER} 대상 마루 데이터 쪽({@link DataItemMasterLookup})은 {@code TB_MDM_DATA_ITEM} 을 직접 읽는 이 파일 안의
 * private 어댑터다(프로덕션 코드 아님) — BASE 카테고리(REGEX {@code .*})만 쓰므로 카테고리·소속 판정(05 ③④)은 재현하지
 * 않고 항목 선분(① 데이터 닫힘·② 항목 선분)만 본다(build-log.md 「설계 이탈」 참조).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + CodeDataRuleLedgerChainTest.CLIENT_KEY)
@ActiveProfiles("local")
class CodeDataRuleLedgerChainTest {

    static final String CLIENT_KEY = "mdm-itest-chain-client-key";
    private static final String STEWARD = "MDM_STEWARD";
    private static final String STD_ADMIN = "MDM_STD_ADMIN";
    private static final DateTimeFormatter SQLITE_TEXT = DateTimeFormatter.ofPattern(MdmTemporalBinder.TEXT_PATTERN);

    @TempDir
    static Path tempDir;

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;
    @Autowired
    MasterCodeLedgerQueries ledger;
    @Autowired
    StoredRuleDefinitions storedRuleDefinitions;

    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();
    private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-itest-chain.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        // 룰 결과식이 참조하는 ITEM_KEY 의 사전 항목(도메인·컬럼) — dma 등록 흐름은 1번(CODE 참조)만 대상이라 이
        // 사전은 JDBC 로 직접 넣는다(DmeOasisHttpTest·DmeTestSupport 와 같은 관례, TSK-08-02 design §3.1).
        DmeTestSupport.column(jdbc, "ITEM_KEY", DmeTestSupport.domain(jdbc, "ITEM_KEY_D", "TEXT", "STRING", null));
    }

    @Test
    void CODE_참조_코드확정_데이터등록_룰_MASTER_확정_판정이_한_흐름으로_이어진다() throws Exception {
        // ── 1) dmc/codeMng.reg — 마루 코드 헤더(CREATED) + VER 1.000 DRAFT + BASE 카테고리 ──
        JsonNode reg = post("codeMng", "reg", STEWARD,
                envelope("codeMng", json.createObjectNode().put("maruCodeId", "CHAIN_CD").put("maruCodeName", "체인 코드")));
        assertSuccess(reg);
        long codeRowVersion = reg.path("data").path("result").path("rowVersion").asLong();

        // ── 1b) dmc/codeItemEdit.save — DRAFT 에 실제 코드 항목 하나를 넣는다(3번이 참조할 값의 원천) ──
        ObjectNode itemParams = json.createObjectNode().put("maruCodeId", "CHAIN_CD").put("ver", "1.000").put("rowVersion", codeRowVersion);
        ObjectNode itemBody = envelope("codeItemEdit", itemParams);
        ObjectNode itemGrids = itemBody.putObject("grids");
        itemGrids.putObject("rows").putArray("rows")
                .addObject().put("rowStatus", "ADDED").put("code", "A1").put("name", "에이일").put("seq", 1);
        itemGrids.putObject("categories").putArray("rows"); // 2026-09-28 화면 합치기 — 세 그리드를 늘 보낸다
        itemGrids.putObject("members").putArray("rows");
        JsonNode itemSaved = post("codeItemEdit", "save", STEWARD, itemBody);
        assertSuccess(itemSaved);
        long codeRowVersionAfterItem = itemSaved.path("data").path("result").path("rowVersion").asLong();

        // ── 2) dma/domainMng.save — CODE 종류 도메인이 1번 마루 코드(BASE 카테고리)를 참조한다("CODE 참조"). 운영
        //     CodeLookup 빈이 없어(D-077) 판정 불가 경고(W02)만 나고 저장은 된다 — 이 시험이 그 경고를 재확인한다.
        ObjectNode domainParams = json.createObjectNode().put("domainName", "체인 코드 참조 도메인").put("stdName", "CHAIN_CODE_REF_D")
                .put("domainKind", "CODE").put("dataType", "STRING").put("maruCodeId", "CHAIN_CD").put("cateId", "BASE");
        JsonNode domainSaved = post("domainMng", "save", STD_ADMIN, envelope("domainMng", domainParams, emptyGrids()));
        assertSuccess(domainSaved);
        boolean hasW02 = false;
        for (JsonNode w : domainSaved.path("data").path("result").path("warnings")) {
            hasW02 = hasW02 || "W02".equals(w.path("CODE").asText());
        }
        assertTrue(hasW02, "CodeLookup 운영 빈이 없는데도 W02 가 없다(D-077 전제가 바뀌었다): " + domainSaved);

        // ── 3) dmc/codeConfirm.confirm — 1번 DRAFT(1.000)를 확정한다(TSK-06-05 확정 경로 재현) ──
        String pastApplyFrom = SQLITE_TEXT.format(LocalDateTime.now().minusDays(1));
        JsonNode confirmed = post("codeConfirm", "confirm", STEWARD, envelope("codeConfirm",
                json.createObjectNode().put("maruCodeId", "CHAIN_CD").put("ver", "1.000").put("rowVersion", codeRowVersionAfterItem)
                        .put("applyFrom", pastApplyFrom).put("warningsAcknowledged", true)));
        assertSuccess(confirmed);

        // ── 4) 원장에서 실제로 확정된 값을 읽는다("원장 기준" — 하드코딩이 아니라 MdmCodeLookup SPI 로 직접 읽는다) ──
        MdmCodeLookup codeLookup = new MdmCodeLookup(ledger);
        Optional<CodeLookup.CodeRows> chainCode = codeLookup.code("CHAIN_CD");
        assertTrue(chainCode.isPresent(), "확정 뒤에도 마루 코드 원장을 못 읽는다");
        assertEquals(1, chainCode.get().items().size(), chainCode.get().items().toString());
        String ledgerItemCode = chainCode.get().items().get(0).code();
        assertEquals("A1", ledgerItemCode, "원장에서 읽은 값이 실제로 저장한 값과 다르다");

        // ── 5) dmd/dataMng.reg + dataItemMng.reg — 2번 마루 코드 값을 참조하는 마스터데이터 항목을 등록한다 ──
        JsonNode dataReg = post("dataMng", "reg", STEWARD, envelope("dataMng",
                json.createObjectNode().put("maruDataId", "CHAIN_DATA").put("maruDataName", "체인 데이터")
                        .put("codePattern", "^[0-9A-Z]{1,20}$").put("lvlCnt", 1)));
        assertSuccess(dataReg);
        JsonNode itemReg = post("dataItemMng", "reg", STEWARD, envelope("dataItemMng",
                json.createObjectNode().put("maruDataId", "CHAIN_DATA").put("code", ledgerItemCode).put("name", "체인 항목")));
        assertSuccess(itemReg);
        // 대조군 — 유효 키를 하나 더 둔다(1만 건 판정에서 등록된 키가 하나뿐이라 우연히 맞는 결과가 아님을 보인다).
        JsonNode itemReg2 = post("dataItemMng", "reg", STEWARD, envelope("dataItemMng",
                json.createObjectNode().put("maruDataId", "CHAIN_DATA").put("code", "A2").put("name", "체인 항목 2")));
        assertSuccess(itemReg2);

        // ── 6) dme/ruleMng.reg + ruleEdit.save(COLUMNS·TABLE) — MASTER(...) 를 참조하는 DERIVE 룰을 만들고 확정한다
        //     (TSK-08-05 확정 경로 재현). MASTER 의 id·cate 는 3번이 등록한 마루 데이터·카테고리, key 는 평가마다
        //     input 으로 바뀌는 ITEM_KEY 다.
        JsonNode ruleReg = post("ruleMng", "reg", STEWARD, envelope("ruleMng",
                json.createObjectNode().put("maruRuleId", "CHAIN_JDG").put("maruRuleName", "체인 판정").put("ruleKind", "DERIVE")));
        assertSuccess(ruleReg);
        long ruleRowVersion = ruleReg.path("data").path("result").path("rowVersion").asLong();

        String masterExpr = "MASTER(\"CHAIN_DATA\", \"BASE\", ITEM_KEY)";
        JsonNode parsed = post("ruleEdit", "validate", STEWARD, envelope("ruleEdit",
                json.createObjectNode().put("text", masterExpr).put("slot", "RULE_RESULT_EXPR")));
        assertSuccess(parsed);
        // "supported" 는 FunctionSets.BASE(표준식용) 만 보는 화면 힌트라 MASTER(MDM 확장 함수)는 항상 false 다
        // (RuleEditService.parseExpr). 저장 시 검사가 실제로 보는 것은 problems(ExpressionChecker.check) 다.
        assertTrue(parsed.path("data").path("result").path("problems").isEmpty(),
                "MASTER 식이 저장 시 검사 화이트리스트를 통과하지 못한다: " + parsed);
        assertEquals("ITEM_KEY", parsed.path("data").path("result").path("refVars").path(0).asText(), parsed.toString());

        // 6a) TABLE 을 먼저 빈 셀 NORMAL 행 하나로 만든다 — RuleColumnsService(S001, checkDeriveExprs)가 "산출 룰은
        //     결과 식을 둘 NORMAL 행이 이미 있어야" COLUMNS 저장을 받아 준다(Build 실측, WGT_CALC 픽스처와 같은 순서).
        ObjectNode placeholderParams = json.createObjectNode().put("part", "TABLE").put("maruRuleId", "CHAIN_JDG").put("ver", 1)
                .put("rowVersion", ruleRowVersion);
        ObjectNode placeholderBody = envelope("ruleEdit", placeholderParams);
        placeholderBody.putObject("grids").putObject("rows").putArray("rows").addObject()
                .put("rowId", -1).put("rowKind", "NORMAL").put("cells", "{}");
        JsonNode placeholderSaved = post("ruleEdit", "save", STEWARD, placeholderBody);
        assertSuccess(placeholderSaved);
        long ruleRowVersionAfterRow = placeholderSaved.path("data").path("result").path("rowVersion").asLong();
        int chainRowId = jdbc.queryForObject(
                "SELECT ROW_ID FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'CHAIN_JDG' AND VER = 1", Integer.class);

        // 6b) COLUMNS — MASTER(...) 결과 식 변수를 추가한다.
        long boolDomainId = DmeTestSupport.domain(jdbc, "MASTER_HIT_D", "TEXT", "BOOLEAN", null);
        ObjectNode columnsParams = json.createObjectNode().put("part", "COLUMNS").put("maruRuleId", "CHAIN_JDG").put("ver", 1)
                .put("rowVersion", ruleRowVersionAfterRow);
        ObjectNode columnsBody = envelope("ruleEdit", columnsParams);
        columnsBody.putObject("grids").putObject("rows").putArray("rows").addObject()
                .put("varId", -1).put("varKind", "RESULT").put("dispType", "Expression").put("varName", "MASTER_HIT")
                .put("dataType", "BOOLEAN").put("domainId", boolDomainId).put("expr", masterExpr);
        JsonNode columnsSaved = post("ruleEdit", "save", STEWARD, columnsBody);
        assertSuccess(columnsSaved);
        long ruleRowVersionAfterColumns = columnsSaved.path("data").path("result").path("rowVersion").asLong();
        int masterVarId = jdbc.queryForObject(
                "SELECT VAR_ID FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'CHAIN_JDG' AND VER = 1 AND VAR_NAME = 'MASTER_HIT'",
                Integer.class);

        // 6c) TABLE 을 다시 저장해 방금 만든 행의 셀에 MASTER 식을 채운다(같은 rowId, 새 varId).
        ObjectNode tableParams = json.createObjectNode().put("part", "TABLE").put("maruRuleId", "CHAIN_JDG").put("ver", 1)
                .put("rowVersion", ruleRowVersionAfterColumns);
        ObjectNode tableBody = envelope("ruleEdit", tableParams);
        String cells = "{\"" + masterVarId + "\":{\"expr\":\"" + masterExpr.replace("\"", "\\\"") + "\"}}";
        tableBody.putObject("grids").putObject("rows").putArray("rows").addObject()
                .put("rowId", chainRowId).put("rowKind", "NORMAL").put("cells", cells);
        JsonNode tableSaved = post("ruleEdit", "save", STEWARD, tableBody);
        assertSuccess(tableSaved);
        long ruleRowVersionAfterTable = tableSaved.path("data").path("result").path("rowVersion").asLong();

        String ruleApplyFrom = SQLITE_TEXT.format(LocalDateTime.now().minusDays(1));
        JsonNode ruleConfirmed = post("ruleConfirm", "confirm", STEWARD, envelope("ruleConfirm",
                json.createObjectNode().put("maruRuleId", "CHAIN_JDG").put("ver", 1).put("rowVersion", ruleRowVersionAfterTable)
                        .put("applyFrom", ruleApplyFrom).put("warningsAcknowledged", true)));
        assertSuccess(ruleConfirmed);

        // ── 7) 확정된 룰을, 시험이 직접 조립한 MdmEvaluator(운영 CodeLookup + 시험 전용 MasterLookup)로 판정한다 ──
        MasterLookup dataItemMasterLookup = new DataItemMasterLookup(jdbc);
        MdmEvaluator evaluator = new MdmEvaluator(MdmEngineConfig.lookups(codeLookup, dataItemMasterLookup, FunctionProvider.NONE));
        Stored stored = storedRuleDefinitions.read("CHAIN_JDG", DmeTestSupport.v(1)).orElseThrow();
        Assembled assembled = storedRuleDefinitions.assemble("CHAIN_JDG", "DERIVE", stored);
        assertTrue(assembled.failures().isEmpty(), assembled.failures().toString());
        MdmRuleEngine engine = new MdmRuleEngine(evaluator, new SingleRuleDefinitionLookup(assembled.definition()));
        Instant ts = Instant.now();

        RuleCaseJudge.Evaluated hit = RuleCaseJudge.evaluate(engine, "CHAIN_JDG", Map.of("ITEM_KEY", ledgerItemCode), ts);
        assertTrue(hit.ok(), String.valueOf(hit));
        assertEquals(Boolean.TRUE, hit.result().results().get("MASTER_HIT"),
                "원장에 실제로 등록한 키인데 MASTER 판정이 거짓이다");

        RuleCaseJudge.Evaluated miss = RuleCaseJudge.evaluate(engine, "CHAIN_JDG", Map.of("ITEM_KEY", "NOT_REGISTERED_9999"), ts);
        assertTrue(miss.ok(), String.valueOf(miss));
        assertEquals(Boolean.FALSE, miss.result().results().get("MASTER_HIT"),
                "등록하지 않은 키인데 MASTER 판정이 참이다");

        // ── 8) 1만 건 규모 — 유효·무효 키가 섞인 합성 레코드를 예외 없이 판정한다(시간 예산 단언 없음, design §3 B3.6) ──
        List<String> validKeys = List.of(ledgerItemCode, "A2");
        int total = 10_000;
        for (int i = 0; i < total; i++) {
            boolean expectValid = i % 7 == 0;
            String key = expectValid ? validKeys.get(i % validKeys.size()) : "BULK_" + i;
            RuleCaseJudge.Evaluated e = RuleCaseJudge.evaluate(engine, "CHAIN_JDG", Map.of("ITEM_KEY", key), ts);
            assertTrue(e.ok(), "레코드 " + i + ": " + e);
            assertEquals(expectValid, e.result().results().get("MASTER_HIT"), "레코드 " + i + " key=" + key);
        }
    }

    // ── MASTER 대상 시험 전용 MasterLookup — TB_MDM_DATA_ITEM 을 직접 읽는다(운영 빈이 아니다, D-077·D1) ──
    private static final class DataItemMasterLookup implements MasterLookup {
        private final JdbcTemplate jdbc;

        DataItemMasterLookup(JdbcTemplate jdbc) {
            this.jdbc = jdbc;
        }

        @Override
        public boolean isValid(String maruDataId, String cateId, String key, LocalDateTime baseDt) {
            if (maruDataId == null || cateId == null || key == null) {
                return false;
            }
            String at = SQLITE_TEXT.format(baseDt);
            Integer count = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = ? AND CODE = ? AND VALID_FROM <= ? AND VALID_TO > ?",
                    Integer.class, maruDataId, key, at, at);
            return count != null && count > 0;
        }

        @Override
        public Optional<String> attr(String maruDataId, String cateId, String key, LocalDateTime baseDt, int attrNo) {
            if (!isValid(maruDataId, cateId, key, baseDt)) {
                return Optional.empty();
            }
            String at = SQLITE_TEXT.format(baseDt);
            String column = "ATTR" + String.format("%02d", attrNo);
            String value = jdbc.queryForObject("SELECT " + column + " FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = ? AND CODE = ? "
                    + "AND VALID_FROM <= ? AND VALID_TO > ?", String.class, maruDataId, key, at, at);
            return Optional.ofNullable(value);
        }
    }

    // ── 도우미 ──

    private static void assertSuccess(JsonNode body) {
        assertTrue(body.path("meta").path("success").asBoolean(false), body.toString());
    }

    private ObjectNode envelope(String menuId, ObjectNode params) {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", menuId);
        body.set("params", params);
        return body;
    }

    private ObjectNode envelope(String menuId, ObjectNode params, ObjectNode grids) {
        ObjectNode body = envelope(menuId, params);
        body.set("grids", grids);
        return body;
    }

    private ObjectNode emptyGrids() {
        ObjectNode g = json.createObjectNode();
        g.putObject("testCases").putArray("rows");
        g.putObject("examples").putArray("rows");
        return g;
    }

    private JsonNode post(String service, String action, String role, ObjectNode body) throws IOException, InterruptedException {
        String user = STD_ADMIN.equals(role) ? "stdadmin" : "steward";
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/oasis/" + service + "/" + action))
                .header("Content-Type", "application/json")
                .header("X-Client-Key", effectiveClientKey())
                .header("X-Authenticated-User", user)
                .header("X-Authenticated-Role", role)
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode(), response.body());
        return json.readTree(response.body());
    }

    private static String effectiveClientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return (env != null && !env.isBlank()) ? env : CLIENT_KEY;
    }
}
