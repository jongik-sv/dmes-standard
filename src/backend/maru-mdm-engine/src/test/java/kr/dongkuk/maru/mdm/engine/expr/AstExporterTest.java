package kr.dongkuk.maru.mdm.engine.expr;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import com.ezylang.evalex.Expression;
import com.ezylang.evalex.config.ExpressionConfiguration;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * TSK-03-02 design.md §3.1·§6.6(D5) — AST 내보내기(원천 샘플 {@code js/AstExporter.java} 이식, evalex-guide §8.3,
 * engine-contract §9). 자식이 없으면 {@code params} 키가 없고, 숫자 리터럴은 원문이며, 결과는 스키마 {@code $defs/AstNode}
 * 를 통과한다.
 */
class AstExporterTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 0인자 비즈니스 함수 {@code ZERO()} 가 있는 엔진 설정. */
    private static final ExpressionConfiguration CONFIG = MdmExpressionConfig.create(InMemoryLookups.create()
            .function(InMemoryLookups.fn("ZERO", args -> BigDecimal.ZERO))
            .build());

    private static final JsonSchema AST_NODE_SCHEMA = astNodeSchema();

    private static JsonSchema astNodeSchema() {
        try (InputStream in = AstExporterTest.class.getResourceAsStream(
                "/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json")) {
            ObjectNode root = (ObjectNode) MAPPER.readTree(in);
            root.put("$ref", "#/$defs/AstNode");
            return JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(root);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static Map<String, Object> export(String text) throws Exception {
        return AstExporter.export(text, CONFIG);
    }

    private static Map<String, Object> json(String json) throws IOException {
        return MAPPER.readValue(json, new TypeReference<>() {});
    }

    @Test
    void evalex_guide_8_3_예시와_같다() throws Exception {
        Map<String, Object> expected = json("""
                { "type": "INFIX_OPERATOR", "value": "&&", "params": [
                    { "type": "INFIX_OPERATOR", "value": ">=", "params": [
                        { "type": "VARIABLE_OR_CONSTANT", "value": "value" },
                        { "type": "NUMBER_LITERAL", "value": "0.1" } ] },
                    { "type": "INFIX_OPERATOR", "value": "<=", "params": [
                        { "type": "VARIABLE_OR_CONSTANT", "value": "value" },
                        { "type": "NUMBER_LITERAL", "value": "3.5" } ] } ] }""");
        assertEquals(expected, export("value >= 0.1 && value <= 3.5"));
    }

    @Test
    void 숫자_리터럴은_입력_원문이다() throws Exception {
        assertAll(
                () -> assertEquals("1.60", export("1.60").get("value")),
                () -> assertEquals("1e-3", export("1e-3").get("value")),
                () -> assertEquals("0xFF", export("0xFF").get("value")));
    }

    @Test
    void 음수는_접두_연산자와_숫자다() throws Exception {
        assertEquals(json("""
                {"type": "INFIX_OPERATOR", "value": ">=", "params": [
                  {"type": "VARIABLE_OR_CONSTANT", "value": "V"},
                  {"type": "PREFIX_OPERATOR", "value": "-", "params": [{"type": "NUMBER_LITERAL", "value": "1.5"}]}]}"""),
                export("V >= (-1.5)"));
    }

    @Test
    void 접두_연산자가_거듭제곱보다_먼저_묶인다() throws Exception {
        assertEquals(json("""
                {"type": "INFIX_OPERATOR", "value": "^", "params": [
                  {"type": "PREFIX_OPERATOR", "value": "-", "params": [{"type": "NUMBER_LITERAL", "value": "2"}]},
                  {"type": "NUMBER_LITERAL", "value": "2"}]}"""),
                export("-2^2"));
    }

    @Test
    void 자식_없는_노드와_인자_0개_함수는_params_키가_없다() throws Exception {
        assertAll(
                () -> assertEquals(Map.of("type", "NUMBER_LITERAL", "value", "1"), export("1")),
                () -> assertEquals(Map.of("type", "VARIABLE_OR_CONSTANT", "value", "A"), export("A")),
                () -> assertEquals(Map.of("type", "FUNCTION", "value", "ZERO"), export("ZERO()")));
    }

    @Test
    void toAstNode_는_toMap_과_같은_트리다() throws Exception {
        String text = "IF(GRADE == \"A\", value <= 2.0, -value <= 3.5) && MASTER(\"PROC_CD\", \"BASE\", value)";
        Expression e = new Expression(text, CONFIG);
        AstNode node = AstExporter.toAstNode(e.getAbstractSyntaxTree());
        assertSameTree(AstExporter.toMap(e.getAbstractSyntaxTree()), node);
    }

    @SuppressWarnings("unchecked")
    private static void assertSameTree(Map<String, Object> map, AstNode node) {
        List<Map<String, Object>> params = (List<Map<String, Object>>) map.getOrDefault("params", List.of());
        assertAll(
                () -> assertEquals(map.get("type"), node.type().name()),
                () -> assertEquals(map.get("value"), node.value()),
                () -> assertEquals(params.size(), node.params().size()));
        for (int i = 0; i < params.size(); i++) {
            assertSameTree(params.get(i), node.params().get(i));
        }
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {
            "value >= 0.1 && value <= 3.5 && value % 0.1 == 0",
            "STR_MATCHES(value, \"^[A-Z0-9]{10,20}$\")",
            "IF(GRADE == \"A\", value <= 2.0, value <= 3.5)",
            "MASTER(\"PROC_CD\", \"BASE\", value)",
            "!(A != B) || C <> 1",
            "-2^2 + 0xFF",
            "\"a\\\"b\" == S",
            "ZERO()"})
    void 내보낸_AST_는_스키마_AstNode_를_통과한다(String text) throws Exception {
        Set<ValidationMessage> errors = AST_NODE_SCHEMA.validate(MAPPER.valueToTree(export(text)));
        assertEquals(Set.of(), errors);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {
            "{\"type\":\"ARRAY_INDEX\",\"value\":\"[\",\"params\":[{\"type\":\"VARIABLE_OR_CONSTANT\",\"value\":\"B\"},"
                    + "{\"type\":\"NUMBER_LITERAL\",\"value\":\"0\"}]}",
            "{\"type\":\"FUNCTION\",\"value\":\"F\",\"params\":[]}"})
    void 스키마가_틀린_모양을_거부한다(String badJson) throws Exception {
        JsonNode bad = MAPPER.readTree(badJson);
        assertFalse(AST_NODE_SCHEMA.validate(bad).isEmpty(), "검증기가 틀린 모양을 통과시켰다: " + badJson);
    }
}
