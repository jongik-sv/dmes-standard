package kr.dongkuk.maru.mdm.engine.corpus;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * TSK-03-04 design.md §3.1 — 코퍼스 모양을 스키마 정본 {@code $defs} 로 대조한다(JSON Schema 검증기는 쓰지 않는다).
 */
class CorpusShapeTest {

    private static final String SCHEMA_RESOURCE = "/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json";

    private static final JsonNode DEFS = loadSchema().get("$defs");

    private static final JsonNode CORPUS = CorpusConformanceTest.CORPUS;

    @Test
    void version_은_1_이고_cases_는_비어_있지_않다() {
        assertEquals(1, CORPUS.get("version").asInt());
        assertTrue(CORPUS.get("version").isIntegralNumber());
        assertTrue(CORPUS.get("cases").size() > 0);
    }

    @Test
    void id_는_유일하고_스키마_패턴을_지킨다() {
        Pattern pattern = Pattern.compile(DEFS.get("ExprCase").get("properties").get("id").get("pattern").asText());
        Set<String> seen = new HashSet<>();
        for (JsonNode c : CORPUS.get("cases")) {
            String id = c.get("id").asText();
            assertTrue(pattern.matcher(id).find(), "id 가 스키마 패턴과 다르다: " + id);
            assertTrue(seen.add(id), "id 가 겹친다: " + id);
        }
    }

    @Test
    void 사례_키가_ExprCase_CellCase_의_properties_와_required_를_지킨다() {
        for (JsonNode c : CORPUS.get("cases")) {
            String kind = c.get("kind").asText();
            JsonNode def = switch (kind) {
                case "expr" -> DEFS.get("ExprCase");
                case "cell" -> DEFS.get("CellCase");
                default -> throw new AssertionError("모르는 kind: " + kind);
            };
            assertKeys(c.get("id").asText(), c, def);
            if ("cell".equals(kind)) {
                assertKeys(c.get("id").asText() + ".variable", c.get("variable"),
                        def.get("properties").get("variable"));
            }
        }
    }

    @Test
    void TypedValue_Expect_CellJson_모양이_스키마_변형_하나에_맞는다() {
        for (JsonNode c : CORPUS.get("cases")) {
            String id = c.get("id").asText();
            if (c.has("value")) {
                assertTypedValue(id + ".value", c.get("value"));
            }
            if (c.has("vars")) {
                c.get("vars").properties().forEach(e -> assertTypedValue(id + ".vars." + e.getKey(), e.getValue()));
            }
            JsonNode expect = c.get("expect");
            assertTrue(expect.has("value") ^ expect.has("error"), id + ": expect 는 value·error 중 정확히 하나다");
            if (expect.has("value")) {
                assertTypedValue(id + ".expect.value", expect.get("value"));
            }
            if (c.has("cell")) {
                assertCellJson(id, c.get("cell"));
            }
        }
    }

    // ------------------------------------------------------------------ 보조

    private static void assertKeys(String where, JsonNode node, JsonNode def) {
        Set<String> allowed = fieldNames(def.get("properties"));
        Set<String> actual = fieldNames(node);
        Set<String> extra = new TreeSet<>(actual);
        extra.removeAll(allowed);
        assertTrue(extra.isEmpty(), where + ": 스키마 밖 키 " + extra);
        for (JsonNode r : def.get("required")) {
            assertTrue(actual.contains(r.asText()), where + ": 필수 키 없음 " + r.asText());
        }
    }

    private static void assertTypedValue(String where, JsonNode tv) {
        String type = tv.get("type").asText();
        JsonNode variant = null;
        for (JsonNode v : DEFS.get("TypedValue").get("oneOf")) {
            if (textsOf(v.get("properties").get("type").get("enum")).contains(type)) {
                variant = v;
            }
        }
        if (variant == null) {
            fail(where + ": 모르는 TypedValue type " + type);
            return;
        }
        assertEquals(fieldNames(variant.get("properties")), fieldNames(tv), where + ": TypedValue 키 집합");
        if ("NUMBER".equals(type)) {
            Pattern p = Pattern.compile(variant.get("properties").get("value").get("pattern").asText());
            assertTrue(p.matcher(tv.get("value").asText()).find(), where + ": NUMBER 값 모양 " + tv.get("value"));
        }
        if ("BOOLEAN".equals(type)) {
            assertTrue(textsOf(variant.get("properties").get("value").get("enum")).contains(tv.get("value").asText()),
                    where + ": BOOLEAN 값 " + tv.get("value"));
        }
    }

    private static void assertCellJson(String where, JsonNode cell) {
        String op = cell.get("op").asText();
        String group = null;
        for (String g : List.of("NoValueOp", "SingleValueOp", "ListOp", "RangeOp")) {
            if (textsOf(DEFS.get(g).get("enum")).contains(op)) {
                group = g;
            }
        }
        assertTrue(group != null, where + ": 모르는 op " + op);
        String ref = "#/$defs/" + group;
        JsonNode variant = null;
        for (JsonNode v : DEFS.get("CellJson").get("oneOf")) {
            JsonNode opDef = v.get("properties").get("op");
            if (opDef != null && ref.equals(opDef.path("$ref").asText())) {
                variant = v;
            }
        }
        assertTrue(variant != null, where + ": CellJson 변형 없음 " + group);
        assertEquals(fieldNames(variant.get("properties")), fieldNames(cell), where + ": CellJson 키 집합");
    }

    private static Set<String> fieldNames(JsonNode node) {
        Set<String> names = new TreeSet<>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }

    private static List<String> textsOf(JsonNode array) {
        List<String> list = new ArrayList<>();
        array.forEach(n -> list.add(n.asText()));
        return list;
    }

    private static JsonNode loadSchema() {
        try (InputStream in = CorpusShapeTest.class.getResourceAsStream(SCHEMA_RESOURCE)) {
            return CorpusConformanceTest.MAPPER.readTree(in);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
