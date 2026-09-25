package com.dongkuk.dmes.mdm.common.rule.definition;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures;
import com.dongkuk.dmes.mdm.common.engine.MdmEngineConfig;
import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckInput.DraftRow;
import com.dongkuk.dmes.mdm.common.rule.definition.RuleDefinitionAssembler.Assembled;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.rule.MdmRuleEngine;
import kr.dongkuk.maru.mdm.engine.rule.RuleResult;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.InputContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/**
 * TSK-08-04 design §2.3·§3.2 「RuleDefinitionAssemblerTest」 — 원장 모양(변수·행) → 엔진 {@code RuleDefinition}. DISP 대응(TSK-08-01 §6.4),
 * 셀마다 생성한 텍스트(06:1326-1328), 입력 계약이 화면 계약(한 벌 입력 계약 코퍼스)과 같다(B1 인계: 라벨을 넘기고 식 변수 참조는 AST 에서).
 * 생성에 실패한 셀은 그 행을 정의에서 빼고 실패로 돌려준다(D5).
 */
class RuleDefinitionAssemblerTest {

    static final Path CORPUS = Path.of("../../maru-mdm-engine/src/test/resources/kr/dongkuk/maru/mdm/engine/contract/input-contract-corpus.json");

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final MdmEvaluator EVALUATOR = new MdmEvaluator(MdmEngineConfig.lookups(null, null, DomainFixtures.THK_OK));

    static final String Q_ROW1 = "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"1.6\",\"right\":\"2.5\"},\"2\":{\"op\":\"GT\",\"left\":\"1000\"},"
            + "\"3\":{\"op\":\"IN\",\"list\":[\"A\"]},\"4\":{\"val\":\"A\"},\"5\":{\"val\":\"1.05\"}}";
    static final String Q_ROW2 = "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"1.6\",\"right\":\"2.5\"},\"2\":{\"op\":\"GT\",\"left\":\"1000\"},"
            + "\"3\":{\"op\":\"IN\",\"list\":[\"B\"]},\"4\":{\"val\":\"B\"},\"5\":{\"val\":\"1.00\"}}";
    static final String Q_ROW3 = "{\"1\":{\"op\":\"GE\",\"left\":\"2.5\"},\"2\":{\"op\":\"NA\"},\"3\":{\"op\":\"NOT_IN\",\"list\":[\"C\"]},"
            + "\"4\":{\"val\":\"B\"},\"5\":{\"val\":\"0.98\"}}";
    static final String Q_DEFAULT = "{\"4\":{\"val\":\"C\"},\"5\":{\"val\":\"0.90\"}}";

    // ------------------------------------------------------------------ 06 샘플 QLTY_GRD_JDG

    private static List<MdmRuleVar> sampleRaw() {
        return List.of(raw(1, "COND", "2", "COIL_THK", 1), raw(2, "COND", "1", "COIL_WID", 2), raw(3, "COND", "1", "SURF_GRD", 3),
                raw(4, "RESULT", "Value", "QLTY_GRD", 1), raw(5, "RESULT", "Value", "PRC_FCT", 2));
    }

    private static List<ResolvedVar> sampleVars() {
        return List.of(var(1, "COND", "2", 1, "COIL_THK", "NUMBER", 2, 11L), var(2, "COND", "1", 2, "COIL_WID", "NUMBER", 0, 12L),
                var(3, "COND", "1", 3, "SURF_GRD", "STRING", null, 13L), var(4, "RESULT", "Value", 1, "QLTY_GRD", "STRING", null, null),
                var(5, "RESULT", "Value", 2, "PRC_FCT", "NUMBER", null, null));
    }

    private static List<DraftRow> sampleRows() {
        return List.of(row(1, 1, "NORMAL", Q_ROW1), row(2, 2, "NORMAL", Q_ROW2), row(3, 3, "NORMAL", Q_ROW3), row(4, 0, "DEFAULT", Q_DEFAULT));
    }

    private static Assembled sample(List<DraftRow> rows) {
        return RuleDefinitionAssembler.assemble("QLTY_GRD_JDG", 1, "DECISION", "FIRST", null, null, sampleRaw(), sampleVars(), rows, name -> null);
    }

    @Test
    void 샘플_룰을_DISP_대응과_셀_생성_텍스트로_조립한다() {
        Assembled a = sample(sampleRows());
        RuleDefinition def = a.definition();

        assertTrue(a.failures().isEmpty(), a.failures().toString());
        assertEquals("QLTY_GRD_JDG", def.ruleId());
        assertEquals("FIRST", def.hitPolicy().name());
        assertEquals("DECISION", def.ruleKind().name());
        assertEquals(List.of(DispType.TWO, DispType.ONE, DispType.ONE, DispType.VALUE, DispType.VALUE),
                def.vars().stream().map(RuleVar::dispType).toList());
        assertEquals("11", def.vars().get(0).domainId(), "DOMAIN_ID Long → String(TSK-08-01 어긋남 ①)");
        assertEquals(List.of(1, 2, 3, 4), def.rows().stream().map(RuleRow::rowId).toList());
        assertEquals(0, def.rows().get(3).seq());
        assertEquals("COIL_THK != NULL && COIL_THK >= 1.6 && COIL_THK < 2.5", def.rows().get(0).cells().get(1).text(), "06:1326");
        assertEquals("COIL_THK != NULL && COIL_THK >= 2.5", def.rows().get(2).cells().get(1).text(), "06:1327");
        assertEquals("SURF_GRD != NULL && SURF_GRD != \"C\"", def.rows().get(2).cells().get(3).text(), "06:1328");
        InputContract contract = def.contract();
        assertEquals(List.of("COIL_THK", "COIL_WID", "SURF_GRD"), contract.always().stream().map(VarType::name).toList());
        assertEquals("NUMBER", contract.always().get(0).dataType().name(), "계약 타입은 룰 변수의 해석된 타입");
    }

    @Test
    void 조립한_정의를_엔진이_06_샘플_케이스대로_판정한다() {
        RuleDefinition def = sample(sampleRows()).definition();
        MdmRuleEngine engine = new MdmRuleEngine(EVALUATOR.configuration(), new SingleRuleDefinitionLookup(def));
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("COIL_THK", new BigDecimal("1.8"));
        record.put("COIL_WID", 1200);
        record.put("SURF_GRD", "A");

        RuleResult r = engine.evaluate("QLTY_GRD_JDG", record, Instant.parse("2026-06-15T00:00:00Z"));

        assertEquals("A", r.results().get("QLTY_GRD"));
        assertEquals(0, new BigDecimal("1.05").compareTo((BigDecimal) r.results().get("PRC_FCT")));
        assertEquals(List.of(1), r.hits().stream().map(RuleResult.Hit::rowId).toList());
    }

    @Test
    void 생성에_실패한_셀의_행은_정의에서_빼고_실패로_돌려준다() {
        List<DraftRow> rows = new ArrayList<>(sampleRows());
        rows.set(1, row(2, 2, "NORMAL", "{\"1\":{\"op\":\"GE\"},\"4\":{\"val\":\"B\"},\"5\":{\"val\":\"1\"}}"));

        Assembled a = sample(rows);

        assertEquals(List.of(1, 3, 4), a.definition().rows().stream().map(RuleRow::rowId).toList());
        assertEquals(1, a.failures().size(), a.failures().toString());
        assertEquals(2, a.failures().get(0).rowId());
        assertEquals(1, a.failures().get(0).varId());
        assertEquals(List.of(2), List.copyOf(a.skippedRows()));
    }

    @Test
    void 식_변수는_식_텍스트와_AST_와_AST_에서_뽑은_참조_변수를_싣는다() {
        MdmRuleVar exprRaw = raw(7, "COND", "Equal", " STR_SUBSTRING(MAT_CD, 1, 2) ", 1);
        exprRaw.setVarAst("{\"type\":\"FUNCTION\",\"value\":\"STR_SUBSTRING\",\"params\":[{\"type\":\"VARIABLE_OR_CONSTANT\",\"value\":\"MAT_CD\"},"
                + "{\"type\":\"NUMBER_LITERAL\",\"value\":\"1\"},{\"type\":\"NUMBER_LITERAL\",\"value\":\"2\"}]}");
        ResolvedVar exprVar = new ResolvedVar(7, "COND", "Equal", 1, " STR_SUBSTRING(MAT_CD, 1, 2) ", true, "품명", "STRING", null, false, null,
                null, null, "EXPRESSION", null);
        List<DraftRow> rows = List.of(row(1, 1, "NORMAL", "{\"7\":{\"op\":\"EQ\",\"left\":\"A\"},\"8\":{\"val\":\"A\"}}"));

        Assembled a = RuleDefinitionAssembler.assemble("EXPR_JDG", 1, "DECISION", "FIRST", null, null,
                List.of(exprRaw, raw(8, "RESULT", "Value", "QLTY_GRD", 1)),
                List.of(exprVar, var(8, "RESULT", "Value", 1, "QLTY_GRD", "STRING", null, null)), rows, name -> null);

        RuleVar v = a.definition().vars().get(0);
        assertNull(v.varName());
        assertEquals("STR_SUBSTRING(MAT_CD, 1, 2)", v.exprText());
        assertEquals(List.of("MAT_CD"), v.refVars(), "엔진의 참조 변수 NULL 가드가 돌도록 AST 에서 뽑는다");
        assertEquals("_V7 != NULL && _V7 == \"A\"", a.definition().rows().get(0).cells().get(7).text());
        assertEquals("품명 = A", a.definition().contract().rows().get(0).cond(), "라벨을 넘겨 화면 계약과 같게 적는다");
        assertEquals("STRING", a.definition().contract().always().get(0).dataType().name(), "룰 밖 이름은 외부 타입이 없으면 STRING");
    }

    // ------------------------------------------------------------------ 한 벌 입력 계약 코퍼스

    @TestFactory
    Stream<DynamicTest> 조립한_계약이_입력_계약_코퍼스와_같다() throws Exception {
        assertTrue(Files.isRegularFile(CORPUS), "입력 계약 코퍼스가 없다: " + CORPUS.toAbsolutePath());
        JsonNode root = JSON.readTree(CORPUS.toFile());
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode c : root.get("cases")) {
            tests.add(DynamicTest.dynamicTest(c.get("id").asText(), () -> assertCorpusCase(c)));
        }
        return tests.stream();
    }

    private static void assertCorpusCase(JsonNode c) throws Exception {
        JsonNode rule = c.get("rule");
        JsonNode asts = c.get("asts");
        Map<Integer, JsonNode> meta = new HashMap<>();
        for (JsonNode m : rule.get("meta")) {
            meta.put(m.get("varId").asInt(), m);
        }
        List<MdmRuleVar> raws = new ArrayList<>();
        List<ResolvedVar> vars = new ArrayList<>();
        for (JsonNode v : rule.get("vars")) {
            int varId = v.get("varId").asInt();
            String kind = v.get("varKind").asText();
            String disp = text(v, "dispType");
            String name = text(v, "varName");
            boolean exprVar = v.get("exprVar").asBoolean();
            MdmRuleVar r = raw(varId, kind, disp, name, v.get("seq").asInt());
            if (exprVar && name != null && asts.has(name.trim())) {
                r.setVarAst(JSON.writeValueAsString(asts.get(name.trim())));
            }
            JsonNode m = meta.get(varId);
            if (m != null) {
                r.setResGrp(text(m, "resGrp"));
                String grpCond = text(m, "grpCond");
                r.setGrpCond(grpCond);
                if (grpCond != null && asts.has(grpCond.trim())) {
                    r.setGrpCondAst(JSON.writeValueAsString(asts.get(grpCond.trim())));
                }
            }
            raws.add(r);
            // 코퍼스에는 코드 도메인이 없다 — CODE_IN 셀 텍스트를 만들 수 있게 조건 열에 가짜 마루 코드를 준다(계약 계산과 무관)
            vars.add(new ResolvedVar(varId, kind, disp, v.get("seq").asInt(), name, exprVar, text(v, "label"), text(v, "dataType"),
                    v.get("scale").isNull() ? null : v.get("scale").asInt(), false, "COND".equals(kind) ? "CORPUS_CODE" : null, null, null, null,
                    null));
        }
        List<DraftRow> rows = new ArrayList<>();
        for (JsonNode r : rule.get("rows")) {
            rows.add(row(r.get("rowId").asInt(), r.get("seq").asInt(), r.get("rowKind").asText(), r.get("cells").asText()));
        }
        JsonNode types = c.get("types");

        Assembled a = RuleDefinitionAssembler.assemble(rule.get("ruleId").asText(), 1, rule.get("ruleKind").asText(), text(rule, "hitPolicy"),
                null, null, raws, vars, rows, name -> {
                    JsonNode t = types.get(name.toUpperCase(java.util.Locale.ROOT));
                    return t == null ? null : new VarType(name, kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType.valueOf(
                            t.get("dataType").asText()), null, null);
                });

        assertTrue(a.failures().isEmpty(), c.get("id").asText() + " 생성 실패: " + a.failures());
        JsonNode expect = c.get("expect");
        List<String> always = new ArrayList<>();
        expect.get("always").forEach(n -> always.add(n.asText()));
        assertEquals(always, a.definition().contract().always().stream().map(VarType::name).toList(), c.get("note").asText());
        List<String> expectedRows = new ArrayList<>();
        expect.get("rows").forEach(r -> expectedRows.add(r.get("rowId").asInt() + "|" + r.get("cond").asText() + "|" + names(r.get("required"))
                + "|" + names(r.get("optional"))));
        List<String> actualRows = new ArrayList<>();
        for (RowContract rc : a.definition().contract().rows()) {
            actualRows.add(rc.rowId() + "|" + rc.cond() + "|" + rc.required().stream().map(VarType::name).toList() + "|"
                    + rc.optional().stream().map(VarType::name).toList());
        }
        assertEquals(expectedRows, actualRows, c.get("note").asText());
    }

    private static List<String> names(JsonNode array) {
        List<String> out = new ArrayList<>();
        array.forEach(n -> out.add(n.isTextual() ? n.asText() : n.get("name").asText()));
        return out;
    }

    // ------------------------------------------------------------------ 도우미

    static MdmRuleVar raw(int varId, String kind, String disp, String name, int seq) {
        MdmRuleVar v = new MdmRuleVar("R", 1, varId, kind, seq);
        v.setDispType(disp);
        v.setVarName(name);
        return v;
    }

    static ResolvedVar var(int varId, String kind, String disp, int seq, String name, String dataType, Integer scale, Long domainId) {
        return new ResolvedVar(varId, kind, disp, seq, name, false, null, dataType, scale, false, null, domainId, null, "COLUMN", null);
    }

    static DraftRow row(int rowId, int seq, String kind, String cells) {
        return new DraftRow(rowId, seq, kind, RuleCellsCodec.parse(cells));
    }

    private static String text(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }
}
