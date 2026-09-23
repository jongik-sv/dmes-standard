package kr.dongkuk.maru.mdm.engine.corpus;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.fail;

import com.ezylang.evalex.Expression;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/**
 * TSK-03-04 design.md §3.1·§6.11 — 서버·화면 정합성 코퍼스의 서버 러너.
 *
 * <p>코퍼스 정본은 엔진 test resources 의 {@code corpus/engine-corpus.json} 한 벌이다. m-mdm 의 Vitest 러너
 * ({@code tests/evalex-corpus.test.ts})가 같은 파일을 읽는다. 두 러너가 모두 같은 기대값과 같으면 서버와 화면이 같다
 * (수용 기준 "코퍼스 불일치 0건"). 화면 폴백({@code screenFallback})은 서버 쪽에서 보지 않는다.
 */
class CorpusConformanceTest {

    static final String CORPUS_RESOURCE = "/kr/dongkuk/maru/mdm/engine/corpus/engine-corpus.json";

    static final ObjectMapper MAPPER = new ObjectMapper();

    static final JsonNode CORPUS = load();

    /**
     * design §6.10 「표본 15건」 — docs 표본({@code docs/mdm/engine-contract/samples/sample-corpus.json})과 같은 기대값.
     * docs 파일은 읽지 않는다(TSK-03-01 D6 단일 사본 원칙). 표본 기대값을 바꿔야 하는 상황이면 고치지 말고 멈춘다(§6.14 5단계).
     */
    private static final Map<String, String> SAMPLE_EXPECTS = sampleExpects();

    @TestFactory
    Stream<DynamicTest> 서버_평가가_코퍼스_기대값과_같다() {
        return cases().stream().map(c -> DynamicTest.dynamicTest(c.get("id").asText(), () -> {
            if (c.has("patternRegex")) {
                assertEquals(Optional.of(c.get("patternRegex").asText()),
                        CellTextOracle.patternRegex(c.get("cell").get("left").asText()),
                        "오라클 정규식이 사례 patternRegex 와 다르다");
            }
            CorpusEvalExHarness.Outcome actual = "expr".equals(c.get("kind").asText())
                    ? CorpusEvalExHarness.evaluateExpr(c)
                    : CorpusEvalExHarness.evaluateCell(c);
            assertMatches(c.get("expect"), actual);
        }));
    }

    @TestFactory
    Stream<DynamicTest> 식_사례의_AST_가_EvalEx_파싱_결과와_같다() {
        return cases().stream()
                .filter(c -> "expr".equals(c.get("kind").asText()))
                .map(c -> DynamicTest.dynamicTest(c.get("id").asText(), () -> {
                    Expression expression = new Expression(c.get("expr").asText(),
                            CorpusEvalExHarness.configuration(CorpusEvalExHarness.codeSets(c)));
                    JsonNode parsed = MAPPER.valueToTree(AstMaps.toMap(expression.getAbstractSyntaxTree()));
                    assertEquals(c.get("ast"), parsed, "코퍼스 ast 가 식 텍스트의 EvalEx AST 와 다르다. EvalEx AST = " + parsed);
                }));
    }

    @Test
    void 표본_15건의_id_와_기대값이_그대로_들어_있다() throws IOException {
        Map<String, JsonNode> byId = new LinkedHashMap<>();
        for (JsonNode c : cases()) {
            byId.put(c.get("id").asText(), c);
        }
        assertEquals(15, SAMPLE_EXPECTS.size());
        for (Map.Entry<String, String> e : SAMPLE_EXPECTS.entrySet()) {
            JsonNode c = byId.get(e.getKey());
            assertNotNull(c, "표본 사례가 없다: " + e.getKey());
            assertEquals(MAPPER.readTree(e.getValue()), c.get("expect"), "표본 기대값이 다르다: " + e.getKey());
        }
    }

    // ------------------------------------------------------------------ 판정

    static void assertMatches(JsonNode expect, CorpusEvalExHarness.Outcome actual) {
        if (expect.has("error")) {
            assertEquals(expect.get("error").asText(), actual.error(),
                    "오류 코드가 다르다. 실제 값 = " + actual.value() + ", 메시지 = " + actual.message());
            return;
        }
        assertNull(actual.error(), () -> "값을 기대했는데 오류다: " + actual.error() + " — " + actual.message());
        JsonNode want = expect.get("value");
        JsonNode got = actual.value();
        assertEquals(want.get("type").asText(), got.get("type").asText(), () -> "타입이 다르다. 실제 = " + got);
        switch (want.get("type").asText()) {
            case "NULL" -> { }
            case "NUMBER" -> assertEquals(0, new BigDecimal(want.get("value").asText())
                    .compareTo(new BigDecimal(got.get("value").asText())), () -> "숫자가 다르다. 실제 = " + got);
            default -> assertEquals(want.get("value").asText(), got.get("value").asText(), () -> "값이 다르다. 실제 = " + got);
        }
    }

    // ------------------------------------------------------------------ 적재

    static List<JsonNode> cases() {
        List<JsonNode> list = new ArrayList<>();
        CORPUS.get("cases").forEach(list::add);
        return list;
    }

    private static JsonNode load() {
        try (InputStream in = CorpusConformanceTest.class.getResourceAsStream(CORPUS_RESOURCE)) {
            if (in == null) {
                fail("코퍼스 리소스가 없다: " + CORPUS_RESOURCE);
            }
            return MAPPER.readTree(in);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static Map<String, String> sampleExpects() {
        String t = "{\"value\":{\"type\":\"BOOLEAN\",\"value\":\"true\"}}";
        String f = "{\"value\":{\"type\":\"BOOLEAN\",\"value\":\"false\"}}";
        Map<String, String> m = new LinkedHashMap<>();
        m.put("cell.eq.trailing-zero", t);
        m.put("cell.range.upper-open-boundary", f);
        m.put("cell.ne.null", f);
        m.put("cell.is-null.null", t);
        m.put("cell.in.single", t);
        m.put("cell.code-in.not-member", f);
        m.put("cell.eq.pattern-regex", t);
        m.put("cell.contains.meta-literal", f);
        m.put("cell.lt.date-string", t);
        m.put("cell.type-mismatch", "{\"error\":\"TYPE_CONVERSION\"}");
        m.put("expr.decimal.no-double", t);
        m.put("expr.instr.null-compare", "{\"error\":\"EVALUATION_ERROR\"}");
        m.put("expr.master.data-fallback",
                "{\"value\":{\"type\":\"BOOLEAN\",\"value\":\"false\"},\"screenFallback\":true}");
        m.put("expr.round.half-even", "{\"value\":{\"type\":\"NUMBER\",\"value\":\"2.34\"}}");
        m.put("expr.constant-key", "{\"error\":\"CONSTANT_KEY\"}");
        return m;
    }
}
