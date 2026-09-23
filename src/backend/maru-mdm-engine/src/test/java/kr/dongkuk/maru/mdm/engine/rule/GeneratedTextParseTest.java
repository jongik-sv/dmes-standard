package kr.dongkuk.maru.mdm.engine.rule;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ezylang.evalex.EvaluationException;
import com.ezylang.evalex.Expression;
import com.ezylang.evalex.config.ExpressionConfiguration;
import com.ezylang.evalex.functions.FunctionIfc;
import com.ezylang.evalex.parser.ASTNode;
import com.ezylang.evalex.parser.ParseException;
import com.ezylang.evalex.parser.Token;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets;
import kr.dongkuk.maru.mdm.engine.expr.MdmFunction;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.rule.CellTextSnapshotTest.SnapshotCase;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestFunctions;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * 수용 기준 3 — 생성 텍스트가 EvalEx 파싱을 통과한다(06:345 "생성해 보기", I15). 파싱 설정은 테스트 전용 fixture(D1).
 */
class GeneratedTextParseTest {

    private static final TestFunctions FUNCTIONS = new TestFunctions();
    private static final ExpressionConfiguration CONFIG = TestExpressionConfig.create(FUNCTIONS);

    static Stream<Arguments> nonEmptySnapshot() {
        return CellTextSnapshotTest.cases().stream().filter(c -> !c.text().isEmpty()).map(Arguments::of);
    }

    @ParameterizedTest(name = "{displayName} [{0}]")
    @MethodSource("nonEmptySnapshot")
    void 스냅샷_텍스트는_모두_파싱된다(SnapshotCase c) {
        assertDoesNotThrow(() -> new Expression(c.generate(), CONFIG).validate(), c.id());
    }

    static Stream<Arguments> opCodeConditions() {
        return CellTextSnapshotTest.cases().stream()
                .filter(c -> c.kind().equals("cond") && c.cell().op() != null && !c.text().isEmpty())
                .map(Arguments::of);
    }

    @ParameterizedTest(name = "{displayName} [{0}]")
    @MethodSource("opCodeConditions")
    void 조건_op_code_텍스트의_함수는_GENERATED_안이다(SnapshotCase c) throws ParseException {
        Set<String> used = functionNames(c.generate());
        Set<String> outside = new TreeSet<>(used);
        outside.removeAll(FunctionSets.GENERATED);
        assertEquals(Set.of(), outside, c.id() + " 이 GENERATED 밖 함수를 쓴다");
    }

    private static Set<String> functionNames(String text) throws ParseException {
        Set<String> used = new TreeSet<>();
        for (ASTNode n : new Expression(text, CONFIG).getAllASTNodes()) {
            if (n.getToken().getType() == Token.TokenType.FUNCTION) {
                used.add(n.getToken().getValue().toUpperCase(java.util.Locale.ROOT));
            }
        }
        return used;
    }

    @Test
    void 샘플_룰의_셀_텍스트_식_변수_열_조건은_모두_파싱된다() {
        List<String> failures = new ArrayList<>();
        int checked = 0;
        for (RuleDefinition d : SampleRules.all()) {
            for (RuleRow r : d.rows()) {
                for (Map.Entry<Integer, RuleCell> e : r.cells().entrySet()) {
                    String text = e.getValue().text();
                    if (text == null) {
                        failures.add(d.ruleId() + " row " + r.rowId() + " var " + e.getKey() + ": text null");
                    } else if (!text.isEmpty()) {
                        checked++;
                        parse(d.ruleId() + " row " + r.rowId() + " var " + e.getKey(), text, failures);
                    }
                }
            }
            for (RuleVar v : d.vars()) {
                if (v.exprText() != null) {
                    checked++;
                    parse(d.ruleId() + " exprVar " + v.varId(), v.exprText(), failures);
                }
                if (v.grpCond() != null && !v.grpCond().isEmpty()) {
                    checked++;
                    parse(d.ruleId() + " grpCond " + v.varId(), v.grpCond(), failures);
                }
            }
        }
        assertEquals(List.of(), failures);
        assertTrue(checked > 50, "검사한 텍스트 " + checked);
    }

    private static void parse(String where, String text, List<String> failures) {
        try {
            new Expression(text, CONFIG).validate();
        } catch (ParseException | RuntimeException e) {
            failures.add(where + ": " + text + " → " + e.getMessage());
        }
    }

    @Test
    void 정규식형_패턴의_정규식은_컴파일된다() {
        int regexCount = 0;
        for (SnapshotCase c : CellTextSnapshotTest.cases()) {
            if (c.kind().equals("cond") && "EQ".equals(c.cell().op()) && c.dataType() == DataType.STRING) {
                Optional<String> regex = CellTextGenerator.patternRegex(c.cell().left());
                if (regex.isPresent()) {
                    regexCount++;
                    assertDoesNotThrow(() -> Pattern.compile(regex.get()), c.id());
                    assertTrue(c.text().contains("STR_MATCHES("), c.id() + " 정규식형인데 STR_MATCHES 가 아니다");
                } else {
                    assertFalse(c.text().contains("STR_MATCHES("), c.id() + " 정규식형이 아닌데 STR_MATCHES 다");
                }
            }
        }
        assertTrue(regexCount >= 8, "정규식형 항목 " + regexCount);
    }

    // ------------------------------------------------------------------ 테스트 전용 함수의 계약 대조

    @ParameterizedTest(name = "{displayName} [{0}]")
    @EnumSource(MdmFunction.class)
    void 테스트_전용_함수는_계약의_이름과_인자_수를_따른다(MdmFunction f) {
        Map<String, FunctionIfc> fns = FUNCTIONS.functions();
        assertEquals(new TreeSet<>(FunctionSets.MDM), new TreeSet<>(fns.keySet()));
        FunctionIfc fn = fns.get(f.name());
        assertEquals(f.minArgs(), fn.getCountOfNonVarArgParameters(), f + " 최소 인자");
        List<String> names = fn.getFunctionParameterDefinitions().stream().map(p -> p.getName()).toList();
        assertEquals(f.paramNames(), names, f + " 인자 이름");
        assertEquals(f.maxArgs() > f.minArgs(), fn.hasVarArgs(), f + " 선택 인자");

        // 최소 인자는 파싱·평가된다.
        assertDoesNotThrow(() -> run(call(f.name(), f.minArgs())), f + " 최소");
        assertDoesNotThrow(() -> run(call(f.name(), f.maxArgs())), f + " 최대");
        // 최소 - 1 은 파싱 거부, 최대 + 1 은 파싱 또는 평가에서 거부.
        assertThrows(ParseException.class, () -> run(call(f.name(), f.minArgs() - 1)), f + " 최소-1");
        Exception e = assertThrows(Exception.class, () -> run(call(f.name(), f.maxArgs() + 1)), f + " 최대+1");
        assertTrue(e instanceof ParseException || e instanceof EvaluationException, e.toString());
    }

    private static String call(String name, int args) {
        List<String> a = new ArrayList<>();
        for (int i = 0; i < args; i++) {
            a.add(i == 3 && name.equals("MASTER_AT") ? "\"20260101\"" : "\"a" + i + "\"");
        }
        return name + "(" + String.join(", ", a) + ")";
    }

    private static void run(String text) throws Exception {
        Map<String, Object> values = new HashMap<>();
        values.put(ReservedNames.EVAL_TS, Instant.parse("2026-09-30T15:00:00Z"));
        new Expression(text, CONFIG).withValues(values).evaluate();
    }
}
