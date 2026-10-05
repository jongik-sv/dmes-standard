package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.SubsetFlows.line;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.catchNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.set;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.task;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import org.junit.jupiter.api.Test;

/** 하위 세트 계획 편차 8·Ruling 16 — 엔진 실행용 겉모양(서버 SetCallIo 와 같은 알고리즘, Review Focus 1). */
class SubsetShapeTest {

    private static final MdmEvaluator EVALUATOR = MdmEvaluatorFixtures.of(TestExpressionConfig.create());

    private static SetShape shape(FlowDefinition f, Map<String, SetShape> shapes, RuleDefinition... rules) {
        Map<String, RuleDefinition> defs = new LinkedHashMap<>();
        for (RuleDefinition d : rules) {
            defs.put(d.ruleId(), d);
        }
        FlowTree tree = FlowParser.parse(f).tree();
        FlowKeys keys = new FlowKeys(defs, shapes, EVALUATOR);
        return SetShape.of(tree, defs, shapes, keys);
    }

    private static SetShape shape(FlowDefinition f, RuleDefinition... rules) {
        return shape(f, Map.of(), rules);
    }

    @Test
    void 앞에서_읽고_뒤에서_만든_이름은_최종_결과_만든_뒤_읽힌_이름은_중간_결과() {
        SetShape s = shape(line(rule("a", "C_A"), rule("b", "C_B")), calc("C_A", "A", "Y + 1", "Y"), calc("C_B", "Y", "A + 1", "A"));
        assertEquals(List.of("Y"), s.inputs());
        assertEquals(List.of("Y"), s.mustInputs());
        assertEquals(List.of("Y"), s.outputs());
        assertEquals(Set.of("Y"), s.always());
    }

    @Test
    void IF_한_갈래에서만_만든_출력은_always_가_아니다() {
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("rp", "R_P"), rule("rq", "R_Q0"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "rp", 1, "Y > 0"), other("bo", "if1", "rq"), e("ep", "rp", "m1"),
                        e("eq", "rq", "m1"), e("ee", "m1", "end")));
        SetShape s = shape(f, calc("R_P", "P", "Y + 100", "Y"), calc("R_Q0", "Q0", "1"));
        assertEquals(List.of("P", "Q0"), s.outputs());
        assertEquals(Set.of(), s.always());
        assertEquals(List.of("Y"), s.inputs(), "입력은 룰이 읽는 이름만 센다(서버 io 와 같다)");
        assertEquals(List.of("Y"), s.mustInputs(), "IF 조건식 변수는 갈래에 들어가기 전에 읽으므로 반드시 읽는 입력이다");
    }

    @Test
    void 끝내는_IF_갈래의_끝_상태도_always_에_든다() {
        // start → if1 [b1 X > 0 → k(B) → END(끝내는 갈래)] [b2 X < -5 → m1(B) → m2(C) → j] [그 외 → n1(B) → n2(C) → j] → j(빈 단계) → end
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("k", "R_B"), rule("m1", "R_B"), rule("m2", "R_C"), rule("n1", "R_B"),
                        rule("n2", "R_C"), task("j"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "k", 1, "X > 0"), e("ek", "k", "end"), br("b2", "if1", "m1", 2, "X < -5"),
                        e("em1", "m1", "m2"), e("em2", "m2", "j"), other("bo", "if1", "n1"), e("en1", "n1", "n2"), e("en2", "n2", "j"),
                        e("ej", "j", "end")));
        SetShape s = shape(f, calc("R_B", "B", "1"), calc("R_C", "C", "2"));
        assertEquals(List.of("B", "C"), s.outputs());
        assertEquals(Set.of("B"), s.always(), "C 는 끝내는 갈래로 끝나면 없다");
    }

    @Test
    void 끝내는_처리_갈래의_끝_상태도_always_에_든다() {
        // start → r1(E) → j(C) → end, c1(r1, EVAL_ERROR) → h(B) → end
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_E"), rule("j", "R_C"), catchNode("c1", "r1", "EVAL_ERROR"), rule("h", "R_B"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "j"), e("e3", "j", "end"), e("e4", "c1", "h"), e("e5", "h", "end")));
        SetShape s = shape(f, calc("R_E", "E", "X / 0", "X"), calc("R_C", "C", "2"), calc("R_B", "B", "1"));
        assertEquals(List.of("X"), s.inputs());
        assertEquals(List.of("E", "B", "C"), s.outputs(), "단계 → 처리 갈래 → 바깥 순차 순서");
        assertEquals(Set.of(), s.always());
    }

    @Test
    void 돌아오는_처리_갈래는_정상과_교집합이고_INPUT_ERROR_를_받는_룰의_입력은_반드시_읽는_입력이_아니다() {
        // start → r1(E, X 를 읽는다) → j(C) → end, c1(r1, INPUT_ERROR) → h(B) → j
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_E"), rule("j", "R_C"), catchNode("c1", "r1", "INPUT_ERROR"), rule("h", "R_B"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "j"), e("e3", "j", "end"), e("e4", "c1", "h"), e("e5", "h", "j")));
        SetShape s = shape(f, calc("R_E", "E", "X + 1", "X"), calc("R_C", "C", "2"), calc("R_B", "B", "1"));
        assertEquals(List.of("X"), s.inputs());
        assertEquals(List.of(), s.mustInputs());
        assertEquals(List.of("E", "B", "C"), s.outputs(), "돌아오는 자리 j 는 블록 뒤 바깥 순차다 — 단계 → 처리 갈래 → j");
        assertEquals(Set.of("C"), s.always());
    }

    @Test
    void 손주_세트의_겉모양을_RULE_처럼_끼운다() {
        // 손주 겉모양: 입력 Y, 출력 Z(always)·W(아님), 반드시 읽는 입력 Y
        SetShape grand = new SetShape(List.of("Y"), List.of("Y"), List.of("Z", "W"), Set.of("Z"));
        FlowDefinition f = line(set("s1", "G"), rule("u", "R_U"));
        SetShape s = shape(f, Map.of("s1", grand), calc("R_U", "U", "Z + 1", "Z"));
        assertEquals(List.of("Y"), s.inputs());
        assertEquals(List.of("Y"), s.mustInputs());
        assertEquals(List.of("W", "U"), s.outputs(), "Z 는 u 가 읽으므로 중간 결과");
        assertEquals(Set.of("U"), s.always());
    }
}
