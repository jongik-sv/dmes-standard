package kr.dongkuk.maru.mdm.engine.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ezylang.evalex.config.ExpressionConfiguration;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Stream;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.InputContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/**
 * TSK-08-04 design §2.1·I28 — 입력 계약 코퍼스의 서버 러너.
 *
 * <p>코퍼스 정본은 엔진 test resources 의 {@code contract/input-contract-corpus.json} 한 벌이다. m-mdm 의 Vitest 러너
 * ({@code tests/evalex-input-contract-corpus.test.ts})가 같은 파일을 화면 경로({@code computeContract})로 읽는다. 두 러너가 모두
 * 기대값과 같으면 Java {@link InputContracts} 와 TS {@code computeInputContract} 가 같다.
 *
 * <p>코퍼스 룰은 저장 형태(06 표기 DISP_TYPE, 셀 JSON 문자열, 식 변수는 {@code varName} 에 식 텍스트)다. 엔진 {@link RuleVar}·
 * {@link RuleRow} 로 바꾸는 변환은 이 테스트 안에 둔다(엔진 main 은 Jackson 금지). 식 AST 는 EvalEx 파싱 결과와 같은지 따로 본다.
 */
class InputContractCorpusTest {

    static final String CORPUS_RESOURCE = "/kr/dongkuk/maru/mdm/engine/contract/input-contract-corpus.json";

    /** design §2.1 — 사례 하한. */
    static final int MIN_CASES = 12;

    static final ObjectMapper MAPPER = new ObjectMapper();

    static final JsonNode CORPUS = load();

    private static final ExpressionConfiguration CONFIG = MdmExpressionConfig.create(InMemoryLookups.create().build());

    private static final Map<String, DispType> DISP = Map.of(
            "Equal", DispType.EQUAL, "1", DispType.ONE, "2", DispType.TWO,
            "Expression", DispType.EXPRESSION, "Value", DispType.VALUE);

    @TestFactory
    Stream<DynamicTest> 서버_입력_계약이_코퍼스_기대값과_같다() {
        return cases().stream().map(c -> DynamicTest.dynamicTest(c.get("id").asText(), () -> {
            JsonNode rule = c.get("rule");
            Function<String, VarType> types = typeResolver(c.get("types"));
            InputContract actual = InputContracts.compute(
                    vars(rule, c.get("asts")),
                    rows(rule),
                    RuleKind.valueOf(rule.get("ruleKind").asText()),
                    types,
                    labels(rule));
            assertEquals(expected(c.get("expect"), types), actual, c.get("note").asText());
        }));
    }

    @TestFactory
    Stream<DynamicTest> 코퍼스_AST_가_EvalEx_파싱_결과와_같다() {
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode c : cases()) {
            String id = c.get("id").asText();
            c.get("asts").fields().forEachRemaining(e ->
                    tests.add(DynamicTest.dynamicTest(id + " · " + e.getKey(), () -> assertAst(e.getKey(), e.getValue()))));
            for (JsonNode r : c.get("rule").get("rows")) {
                JsonNode cells = readTree(r.get("cells").asText());
                cells.fields().forEachRemaining(e -> {
                    if (e.getValue().has("ast")) {
                        String expr = e.getValue().get("expr").asText();
                        tests.add(DynamicTest.dynamicTest(id + " · 행 " + r.get("rowId") + " · " + expr,
                                () -> assertAst(expr, e.getValue().get("ast"))));
                    }
                });
            }
        }
        return tests.stream();
    }

    @Test
    void 사례가_하한_이상이고_id_가_겹치지_않는다() {
        List<String> ids = cases().stream().map(c -> c.get("id").asText()).toList();
        assertTrue(ids.size() >= MIN_CASES, "사례 " + ids.size() + "건 < " + MIN_CASES);
        assertEquals(ids.size(), ids.stream().distinct().count(), "id 중복");
    }

    private static void assertAst(String text, JsonNode ast) throws Exception {
        JsonNode parsed = MAPPER.valueToTree(AstExporter.export(text, CONFIG));
        assertEquals(ast, parsed, "코퍼스 ast 가 EvalEx AST 와 다르다: " + text + " → " + parsed);
    }

    // ------------------------------------------------------------------ 저장 형태 → 엔진 정의

    static List<RuleVar> vars(JsonNode rule, JsonNode asts) {
        Map<Integer, JsonNode> meta = new HashMap<>();
        for (JsonNode m : rule.get("meta")) {
            meta.put(m.get("varId").asInt(), m);
        }
        List<RuleVar> out = new ArrayList<>();
        for (JsonNode v : rule.get("vars")) {
            int varId = v.get("varId").asInt();
            VarKind kind = VarKind.valueOf(v.get("varKind").asText());
            String dispText = text(v, "dispType");
            DispType disp = dispText == null ? (kind == VarKind.COND ? DispType.ONE : DispType.VALUE) : DISP.get(dispText);
            boolean exprVar = v.get("exprVar").asBoolean();
            String name = text(v, "varName");
            boolean nameless = exprVar || (kind == VarKind.COND && disp == DispType.EXPRESSION);
            String exprText = kind == VarKind.COND && exprVar && name != null ? name.trim() : null;
            JsonNode m = meta.get(varId);
            String resGrp = null;
            String grpCond = null;
            if (kind == VarKind.RESULT && m != null) {
                resGrp = blankToNull(text(m, "resGrp"));
                grpCond = blankToNull(text(m, "grpCond"));
            }
            out.add(new RuleVar(
                    varId, kind, disp,
                    nameless ? null : name,
                    exprText,
                    exprText == null ? null : ast(asts, exprText),
                    null,
                    DataType.valueOf(v.get("dataType").asText()),
                    v.get("scale").isNull() ? null : v.get("scale").asInt(),
                    null, null, null,
                    resGrp,
                    grpCond,
                    grpCond == null ? null : ast(asts, grpCond.trim()),
                    v.get("seq").asInt()));
        }
        return out;
    }

    static List<RuleRow> rows(JsonNode rule) {
        List<RuleRow> out = new ArrayList<>();
        for (JsonNode r : rule.get("rows")) {
            Map<Integer, RuleCell> cells = new LinkedHashMap<>();
            readTree(r.get("cells").asText()).fields().forEachRemaining(e -> cells.put(Integer.valueOf(e.getKey()), cell(e.getValue())));
            out.add(new RuleRow(r.get("rowId").asInt(), r.get("seq").asInt(), RowKind.valueOf(r.get("rowKind").asText()), cells));
        }
        return out;
    }

    static Map<Integer, String> labels(JsonNode rule) {
        Map<Integer, String> out = new HashMap<>();
        for (JsonNode v : rule.get("vars")) {
            String label = text(v, "label");
            if (label != null) {
                out.put(v.get("varId").asInt(), label);
            }
        }
        return out;
    }

    private static RuleCell cell(JsonNode c) {
        List<String> list = null;
        if (c.has("list")) {
            list = new ArrayList<>();
            for (JsonNode x : c.get("list")) {
                list.add(x.asText());
            }
        }
        Map<String, Object> ast = c.has("ast") ? MAPPER.convertValue(c.get("ast"), new TypeReference<>() {}) : null;
        return new RuleCell(text(c, "op"), text(c, "left"), text(c, "right"), list, text(c, "expr"), ast, text(c, "val"), null);
    }

    private static Map<String, Object> ast(JsonNode asts, String text) {
        JsonNode a = asts.get(text);
        return a == null ? null : MAPPER.convertValue(a, new TypeReference<>() {});
    }

    /** 코퍼스 타입 표(대문자 이름) — 없는 이름은 null(계산기가 예외를 낸다). */
    static Function<String, VarType> typeResolver(JsonNode types) {
        return name -> {
            JsonNode t = types.get(name.toUpperCase(Locale.ROOT));
            if (t == null) {
                return null;
            }
            return new VarType(name, DataType.valueOf(t.get("dataType").asText()),
                    t.get("scale").isNull() ? null : t.get("scale").asInt(), text(t, "domainId"));
        };
    }

    private static InputContract expected(JsonNode expect, Function<String, VarType> types) {
        List<RowContract> rows = new ArrayList<>();
        for (JsonNode r : expect.get("rows")) {
            rows.add(new RowContract(r.get("rowId").asInt(), r.get("cond").asText(),
                    typed(r.get("required"), types), typed(r.get("optional"), types)));
        }
        return new InputContract(typed(expect.get("always"), types), rows);
    }

    private static List<VarType> typed(JsonNode names, Function<String, VarType> types) {
        List<VarType> out = new ArrayList<>();
        for (JsonNode n : names) {
            out.add(types.apply(n.asText()));
        }
        return out;
    }

    // ------------------------------------------------------------------ JSON

    private static String text(JsonNode n, String key) {
        JsonNode v = n.get(key);
        return v == null || v.isNull() ? null : v.asText();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    private static List<JsonNode> cases() {
        List<JsonNode> out = new ArrayList<>();
        CORPUS.get("cases").forEach(out::add);
        return out;
    }

    private static JsonNode readTree(String json) {
        try {
            return MAPPER.readTree(json);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static JsonNode load() {
        try (InputStream in = InputContractCorpusTest.class.getResourceAsStream(CORPUS_RESOURCE)) {
            return MAPPER.readTree(in);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
