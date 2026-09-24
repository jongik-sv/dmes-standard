package kr.dongkuk.maru.mdm.engine.corpus;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ezylang.evalex.Expression;
import com.ezylang.evalex.parser.ASTNode;
import com.ezylang.evalex.parser.Token;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets;
import org.junit.jupiter.api.Test;

/**
 * TSK-03-04 design.md §3.1·§6.11 — test 전용 셀 → 텍스트 오라클의 골든.
 *
 * <p>기대 텍스트는 06 「EvalEx 생성 규칙」(06:242-262)과 TSK-03-03 design §6.10.4 스냅샷의 같은 모양 항목과 글자까지 같다.
 * 03-03 이 머지되면 이 테스트는 그 스냅샷 대조로 옮겨지고 지운다(design §6.15 P2).
 */
class CellTextOracleTest {

    private static final String V = "V";

    @Test
    void EQ_숫자는_리터럴을_정규화한다() {
        assertEquals("V != NULL && V == 1.6", text("NUMBER", single("EQ", "1.60")));
    }

    @Test
    void 음수_리터럴은_괄호로_감싼다() {
        assertEquals("V != NULL && V >= (-1.5)", text("NUMBER", single("GE", "-1.5")));
    }

    @Test
    void 구간_왼쪽_부등호는_뒤집고_오른쪽은_그대로다() {
        assertEquals("V != NULL && V >= 1.6 && V < 2.5", text("NUMBER", range("<= 변수 <", "1.6", "2.5")));
    }

    @Test
    void 구간_열린_아래_닫힌_위() {
        assertEquals("V != NULL && V > 2.5 && V <= 3", text("NUMBER", range("< 변수 <=", "2.5", "3.0")));
    }

    @Test
    void IN_은_괄호로_묶은_OR_사슬이다() {
        assertEquals("V != NULL && (V == \"A\" || V == \"B\")", text("STRING", list("IN", "A", "B")));
    }

    @Test
    void NOT_IN_은_AND_사슬이다() {
        assertEquals("V != NULL && V != \"A\" && V != \"B\"", text("STRING", list("NOT_IN", "A", "B")));
    }

    @Test
    void 패턴_단순형_셋() {
        assertEquals("V != NULL && STR_STARTS_WITH(V, \"SGC\")", text("STRING", single("EQ", "SGC%")));
        assertEquals("V != NULL && STR_ENDS_WITH(V, \"CC\")", text("STRING", single("EQ", "%CC")));
        assertEquals("V != NULL && INSTR(V, \"G33\") > 0", text("STRING", single("EQ", "%G33%")));
    }

    @Test
    void 패턴_정규식형과_정규식_변환_거부() {
        assertEquals("V != NULL && STR_MATCHES(V, \"A.*B\")", text("STRING", single("EQ", "A%B")));
        assertEquals(Optional.empty(), CellTextOracle.patternRegex("A.B%"));
        assertEquals(Optional.of("A\\.B."), CellTextOracle.patternRegex("A.B_"));
        assertEquals(Optional.of(".*A.*B.*"), CellTextOracle.patternRegex("%A%B%"));
        assertEquals("A\\.B.*", CellTextOracle.likeToRegex("A.B%"));
        assertThrows(IllegalArgumentException.class, () -> CellTextOracle.patternRegex("A\\B"));
        assertThrows(IllegalArgumentException.class, () -> CellTextOracle.patternRegex("%"));
        assertThrows(IllegalArgumentException.class, () -> CellTextOracle.patternRegex("%A%B%C%"));
    }

    @Test
    void 이스케이프한_와일드카드와_문자열_리터럴() {
        assertEquals("V != NULL && V == \"100%\"", text("STRING", single("EQ", "100\\%")));
        // 저장 값 a"b\\c — `=` 패턴에서 \\ 는 글자 \ 다(03-03 스냅샷 eq.escape). 텍스트에서는 문자열 리터럴 규칙으로 다시 이스케이프된다.
        assertEquals("V != NULL && V == \"a\\\"b\\\\c\"", text("STRING", single("EQ", "a\"b\\\\c")));
    }

    @Test
    void CONTAINS_와_INSTR_는_방향이_반대다() {
        assertEquals("V != NULL && INSTR(V, \"CC\") > 0", text("STRING", single("CONTAINS", "CC")));
        assertEquals("V != NULL && INSTR(\"SGCC,SGHC\", V) > 0", text("STRING", single("INSTR", "SGCC,SGHC")));
    }

    @Test
    void CODE_IN_은_MASTER_로_만든다() {
        assertEquals("V != NULL && MASTER(\"PROC_CD\", \"PLATING\", V)",
                CellTextOracle.conditionText(single("CODE_IN", "PLATING"), V, "STRING", "PROC_CD"));
    }

    @Test
    void IS_NULL_NOT_NULL_NA() {
        assertEquals("V == NULL", text("STRING", noValue("IS_NULL")));
        assertEquals("V != NULL", text("STRING", noValue("NOT_NULL")));
        assertEquals("", text("STRING", noValue("NA")));
        assertEquals("", CellTextOracle.NA_TEXT);
    }

    @Test
    void Boolean_은_TRUE_FALSE_맨_이름이다() {
        assertEquals("V != NULL && V == TRUE", text("BOOLEAN", single("EQ", "TRUE")));
    }

    @Test
    void 코퍼스_셀_텍스트의_함수는_GENERATED_안이다() throws Exception {
        Set<String> used = new TreeSet<>();
        for (JsonNode c : CorpusConformanceTest.cases()) {
            if (!"cell".equals(c.get("kind").asText()) || "NA".equals(c.get("cell").get("op").asText())) {
                continue;
            }
            JsonNode var = c.get("variable");
            String text = CellTextOracle.conditionText(c.get("cell"), var.get("name").asText(),
                    var.get("dataType").asText(), var.path("maruCodeId").isMissingNode() ? null : var.get("maruCodeId").asText());
            Expression e = new Expression(text, CorpusEvalExHarness.configuration(CorpusEvalExHarness.codeSets(c)));
            for (ASTNode n : e.getAllASTNodes()) {
                if (n.getToken().getType() == Token.TokenType.FUNCTION) {
                    used.add(n.getToken().getValue().toUpperCase());
                }
            }
        }
        assertTrue(FunctionSets.GENERATED.containsAll(used), "GENERATED 밖 함수: " + used);
        assertTrue(!used.isEmpty(), "코퍼스 셀 텍스트에 함수가 하나도 없다");
    }

    // ------------------------------------------------------------------ 보조

    private static String text(String dataType, JsonNode cell) {
        return CellTextOracle.conditionText(cell, V, dataType, null);
    }

    private static ObjectNode noValue(String op) {
        return CorpusConformanceTest.MAPPER.createObjectNode().put("op", op);
    }

    private static ObjectNode single(String op, String left) {
        return noValue(op).put("left", left);
    }

    private static ObjectNode range(String op, String left, String right) {
        return single(op, left).put("right", right);
    }

    private static ObjectNode list(String op, String... items) {
        ObjectNode cell = noValue(op);
        ArrayNode arr = cell.putArray("list");
        for (String s : items) {
            arr.add(s);
        }
        return cell;
    }
}
