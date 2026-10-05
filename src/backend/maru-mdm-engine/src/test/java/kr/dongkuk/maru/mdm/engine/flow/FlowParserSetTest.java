package kr.dongkuk.maru.mdm.engine.flow;

import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.catchNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.guardMerge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.par;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.pe;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.set;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.task;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree.Relation;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import org.junit.jupiter.api.Test;

/**
 * 하위 세트 spec §1·implicit-join spec §13 — SET 노드는 구조에서 RULE·TASK 와 같은 단계다(들어오는 선 1 이상, 나가는 선 1). 빈 setId 는 구조
 * 오류가 아니다(CALL_MISSING 은 서버 분석기 몫).
 */
class FlowParserSetTest {

    private static List<String> issues(FlowDefinition f) {
        return FlowParser.parse(f).issues().stream().map(i -> i.code() + "|" + i.nodeId() + "|" + i.edgeId() + "|" + i.message()).toList();
    }

    /** start → r1(R1) → s1(QD_S_A) → if1 [b1 X > 1 → s2(QD_S_B)] [그 외 → s3(QD_S_A)] → j(빈 단계) → end. */
    private static FlowDefinition withSets() {
        return flow(List.of(start(), rule("r1", "R1"), set("s1", "QD_S_A"), ifNode("if1"), set("s2", "QD_S_B"), set("s3", "QD_S_A"), task("j"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "s1"), e("e3", "s1", "if1"), br("b1", "if1", "s2", 1, "X > 1"),
                        other("bo", "if1", "s3"), e("e4", "s2", "j"), e("e5", "s3", "j"), e("e6", "j", "end")));
    }

    @Test
    void SET_노드는_한_줄_블록이고_setSteps_setIds_가_깊이_우선이다() {
        FlowParse p = FlowParser.parse(withSets());
        assertEquals(List.of(), p.issues());
        FlowTree t = p.tree();
        SetStep s1 = assertInstanceOf(SetStep.class, t.root().items().get(1));
        assertEquals("QD_S_A", s1.setId());
        assertEquals(List.of("s1", "s2", "s3"), t.setSteps().stream().map(SetStep::nodeId).toList());
        assertEquals(List.of("QD_S_A", "QD_S_B"), t.setIds());
        assertEquals(List.of("R1"), t.ruleIds());
        assertEquals(List.of("r1"), t.ruleSteps().stream().map(RuleStep::nodeId).toList());
        Split s = assertInstanceOf(Split.class, t.root().items().get(2));
        assertEquals(new SetStep("s2", "QD_S_B"), s.branches().get(0).body().items().get(0));
    }

    @Test
    void SET_노드도_관계를_답한다() {
        FlowTree t = FlowParser.parse(withSets()).tree();
        assertEquals(Relation.SAME, t.relation("s1", "s1"));
        assertEquals(Relation.BEFORE, t.relation("r1", "s1"));
        assertEquals(Relation.AFTER, t.relation("s2", "s1"));
        assertEquals(Relation.EXCLUSIVE, t.relation("s2", "s3"));
        assertEquals(Relation.BEFORE, t.relation("s1", "if1"));
        assertEquals(Relation.EXCLUSIVE, t.relation("s2", "s3"));
        assertThrows(IllegalArgumentException.class, () -> t.relation("s1", "nope"));
    }

    @Test
    void 병렬_갈래_안_SET_은_서로_PARALLEL() {
        FlowTree t = FlowParser.parse(flow(List.of(start(), par("p1"), set("s1", "A"), set("s2", "B"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), pe("pa", "p1", "s1", 1), pe("pb", "p1", "s2", 2), e("ea", "s1", "pm"), e("eb", "s2", "pm"),
                        e("ee", "pm", "end")))).tree();
        assertEquals(Relation.PARALLEL, t.relation("s1", "s2"));
        assertEquals(List.of("A", "B"), t.setIds());
    }

    @Test
    void 빈_setId_는_구조_오류가_아니고_setIds_에서_빠진다() {
        FlowDefinition f = flow(List.of(start(), set("s1", null), set("s2", ""), set("s3", "  "), set("s4", "X"), end()),
                List.of(e("e1", "start", "s1"), e("e2", "s1", "s2"), e("e3", "s2", "s3"), e("e4", "s3", "s4"), e("e5", "s4", "end")));
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        assertNull(((SetStep) p.tree().root().items().get(0)).setId());
        assertEquals(4, p.tree().setSteps().size());
        assertEquals(List.of("X"), p.tree().setIds());
    }

    @Test
    void setIds_는_중복을_빼고_처음_나온_순서다() {
        assertEquals(List.of("QD_S_A", "QD_S_B"), FlowParser.parse(withSets()).tree().setIds());
    }

    @Test
    void SET_이_없으면_setSteps_setIds_가_비어_있다() {
        FlowTree t = FlowParser.parse(FlowParser.linear(List.of("R1", "R2"))).tree();
        assertEquals(List.of(), t.setSteps());
        assertEquals(List.of(), t.setIds());
    }

    // ── 차수 ──

    @Test
    void SET_은_들어오는_선이_없으면_구조_오류이고_나가는_선은_하나여야_한다() {
        FlowDefinition noIn = flow(List.of(start(), rule("r1", "R1"), set("s1", "A"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "end"), e("e3", "s1", "end")));
        assertEquals(true, issues(noIn).contains("FLOW_STRUCTURE|s1|null|s1의 들어오는 선이 0개다. 1개 이상이어야 한다"), issues(noIn).toString());
        FlowDefinition twoOut = flow(List.of(start(), set("s1", "A"), end()),
                List.of(e("e1", "start", "s1"), e("e2", "s1", "end"), e("e3", "s1", "end")));
        assertEquals(true, issues(twoOut).contains("FLOW_STRUCTURE|s1|null|s1의 나가는 선이 2개다. 1개여야 한다"), issues(twoOut).toString());
    }

    @Test
    void SET_이_모이는_자리면_들어오는_선이_둘_이상이어도_받는다() {
        // if1 [b1 → r1] [그 외 → r2] → s9(SET) → end — 새 형식 IF 의 모이는 자리가 SET.
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("r1", "A"), rule("r2", "B"), set("s9", "QD_S_J"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "r1", 1, "X > 0"), other("bo", "if1", "r2"), e("e1", "r1", "s9"),
                        e("e2", "r2", "s9"), e("e3", "s9", "end")));
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        Split s = assertInstanceOf(Split.class, p.tree().root().items().get(0));
        assertEquals("s9", s.joinId());
        assertNull(s.mergeId());
        assertEquals(new SetStep("s9", "QD_S_J"), p.tree().root().items().get(1));
        assertEquals(Relation.AFTER, p.tree().relation("s9", "r1"));
        assertEquals(Relation.AFTER, p.tree().relation("s9", "r2"));
    }

    @Test
    void 들어오는_선이_둘인데_모이는_자리가_아니면_RULE_과_같이_두_번_지난다는_오류() {
        // r1 도 start 에서 s1 로 바로 가고 s1 도 r1 뒤에서 온다 — 모이는 자리가 없는 곳의 두 번째 도착.
        FlowDefinition f = flow(List.of(start(), rule("r1", "R1"), set("s1", "QD_S_A"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "s1"), e("e3", "start", "s1"), e("e4", "s1", "end")));
        List<String> msgs = FlowParser.parse(f).issues().stream().map(FlowIssue::message).toList();
        assertFalse(msgs.isEmpty());
        assertEquals(1, msgs.size(), msgs.toString());
    }

    // ── 받는 노드가 SET 에 붙는다 ──

    /** start → s1(SET) → n(R_N) → end, c1(attachTo s1, kinds) → h(R_H) → n. */
    private static FlowDefinition setWithCatch(String... kinds) {
        return flow(List.of(start(), set("s1", "QD_S_A"), rule("n", "R_N"), catchNode("c1", "s1", kinds), rule("h", "R_H"), end()),
                List.of(e("e1", "start", "s1"), e("e2", "s1", "n"), e("e3", "n", "end"), e("e4", "c1", "h"), e("e5", "h", "n")));
    }

    @Test
    void SET_에_받는_노드가_붙으면_Guarded_의_step_이_SetStep_이고_돌아오는_자리가_있다() {
        FlowParse p = FlowParser.parse(setWithCatch("INPUT_ERROR", "SUBSET_ENDED"));
        assertEquals(List.of(), p.issues());
        Guarded g = assertInstanceOf(Guarded.class, p.tree().root().items().get(0));
        assertEquals(new SetStep("s1", "QD_S_A"), g.step());
        assertEquals("s1", g.nodeId());
        assertEquals("n", g.joinId());
        assertNull(g.mergeId());
        assertEquals(List.of(), g.normal().items());
        assertEquals(List.of(CatchKind.INPUT_ERROR, CatchKind.SUBSET_ENDED), g.handlers().get(0).kinds());
        assertFalse(g.handlers().get(0).ends());
        assertEquals(new RuleStep("n", "R_N"), p.tree().root().items().get(1));
        assertEquals(List.of("s1"), p.tree().setSteps().stream().map(SetStep::nodeId).toList());
        assertEquals(List.of("QD_S_A"), p.tree().setIds());
        assertEquals(List.of("R_H", "R_N"), p.tree().ruleIds().stream().sorted().toList());
        assertEquals(Relation.BEFORE, p.tree().relation("h", "n"), "처리 갈래는 돌아오는 자리 n 앞이다");
        assertEquals(Relation.BEFORE, p.tree().relation("s1", "h"));
    }

    @Test
    void SET_정상_갈래와_처리_갈래는_서로_배타다() {
        // s1 → x → n, c1 → h → n : 정상 갈래 x 와 처리 갈래 h.
        FlowParse p = FlowParser.parse(flow(List.of(start(), set("s1", "QD_S_A"), rule("x", "R_X"), rule("n", "R_N"), catchNode("c1", "s1", "EVAL_ERROR"),
                        rule("h", "R_H"), end()),
                List.of(e("e1", "start", "s1"), e("e2", "s1", "x"), e("e3", "x", "n"), e("e4", "n", "end"), e("e5", "c1", "h"), e("e6", "h", "n"))));
        assertEquals(List.of(), p.issues());
        Guarded g = (Guarded) p.tree().root().items().get(0);
        assertEquals(List.of(new RuleStep("x", "R_X")), g.normal().items());
        assertEquals("n", g.joinId());
        assertEquals(Relation.EXCLUSIVE, p.tree().relation("x", "h"));
        assertEquals(Relation.BEFORE, p.tree().relation("s1", "x"));
    }

    @Test
    void SET_의_처리_갈래가_END_로_가면_끝내는_처리_갈래다() {
        FlowParse p = FlowParser.parse(flow(List.of(start(), set("s1", "QD_S_A"), rule("n", "R_N"), catchNode("c1", "s1", "SUBSET_ENDED", "HIT_CONFLICT"),
                        set("h", "QD_S_H"), end()),
                List.of(e("e1", "start", "s1"), e("e2", "s1", "n"), e("e3", "n", "end"), e("e4", "c1", "h"), e("e5", "h", "end"))));
        assertEquals(List.of(), p.issues());
        Guarded g = (Guarded) p.tree().root().items().get(0);
        assertNull(g.joinId());
        assertTrue(g.handlers().get(0).ends());
        assertEquals(List.of(new SetStep("h", "QD_S_H")), g.handlers().get(0).body().items());
        assertEquals(List.of("QD_S_A", "QD_S_H"), p.tree().setIds());
    }

    @Test
    void SET_의_돌아오는_자리가_SET_이어도_받는다() {
        // s1 → n(SET) → end, c1 → h → n : 돌아오는 자리가 SET(들어오는 선 2).
        FlowParse p = FlowParser.parse(flow(List.of(start(), set("s1", "QD_S_A"), set("n", "QD_S_N"), catchNode("c1", "s1", "INPUT_ERROR"),
                        rule("h", "R_H"), end()),
                List.of(e("e1", "start", "s1"), e("e2", "s1", "n"), e("e3", "n", "end"), e("e4", "c1", "h"), e("e5", "h", "n"))));
        assertEquals(List.of(), p.issues());
        Guarded g = (Guarded) p.tree().root().items().get(0);
        assertEquals("n", g.joinId());
        assertEquals(new SetStep("n", "QD_S_N"), p.tree().root().items().get(1));
        assertEquals(List.of("s1", "n"), p.tree().setSteps().stream().map(SetStep::nodeId).toList());
    }

    @Test
    void SET_에_붙은_받는_노드_안에서_IF_끝내는_갈래도_처리_갈래_안_끝냄이다() {
        // c1 → if2 [b1 → h1 → end] [그 외 → h2 → n] : 끝내는 IF 갈래가 처리 갈래 안에 있다(J-D9·J-D18, SET 받는 노드에도 그대로).
        FlowParse p = FlowParser.parse(flow(List.of(start(), set("s1", "QD_S_A"), rule("n", "R_N"), catchNode("c1", "s1", "EVAL_ERROR"), ifNode("if2"),
                        rule("h1", "R_H1"), rule("h2", "R_H2"), end()),
                List.of(e("e1", "start", "s1"), e("e2", "s1", "n"), e("e3", "n", "end"), e("e4", "c1", "if2"), br("b1", "if2", "h1", 1, "X > 0"),
                        other("bo", "if2", "h2"), e("e5", "h1", "end"), e("e6", "h2", "n"))));
        assertEquals(List.of(), p.issues());
        Guarded g = (Guarded) p.tree().root().items().get(0);
        assertEquals("n", g.joinId());
        assertFalse(g.handlers().get(0).ends());
        Split s = assertInstanceOf(Split.class, g.handlers().get(0).body().items().get(0));
        assertTrue(s.branches().get(0).ends());
        assertFalse(s.branches().get(1).ends());
        assertEquals(Relation.BEFORE, p.tree().relation("h1", "h2"), "h2 는 if2 의 모이는 자리라 갈래 밖이다");
    }

    @Test
    void 끝내는_IF_갈래_안에_SET_이_있어도_받는다() {
        // if1 [b1 → s1(SET) → end] [그 외 → r2 → r3] → end : b1 은 끝내는 갈래.
        FlowParse p = FlowParser.parse(flow(List.of(start(), ifNode("if1"), set("s1", "QD_S_A"), rule("r2", "R2"), rule("r3", "R3"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "s1", 1, "X > 0"), other("bo", "if1", "r2"), e("e1", "s1", "end"), e("e2", "r2", "r3"),
                        e("e3", "r3", "end"))));
        assertEquals(List.of(), p.issues());
        Split s = assertInstanceOf(Split.class, p.tree().root().items().get(0));
        assertTrue(s.branches().get(0).ends());
        assertEquals(List.of(new SetStep("s1", "QD_S_A")), s.branches().get(0).body().items());
        assertEquals(Relation.BEFORE, p.tree().relation("s1", "r2"), "r2 는 이어지는 갈래의 모이는 자리라 갈래 밖이다");
    }

    @Test
    void 받는_노드가_붙은_SET_이_IF_갈래_안에_있어도_갈래_본문이_Guarded() {
        // if1 [b1 → s1(SET) → j] [그 외 → r2 → j], c1(s1) → h → j.
        FlowParse p = FlowParser.parse(flow(List.of(start(), ifNode("if1"), set("s1", "QD_S_A"), rule("r2", "R2"), rule("j", "RJ"), catchNode("c1", "s1", "INPUT_ERROR"),
                        rule("h", "RH"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "s1", 1, "X > 0"), other("bo", "if1", "r2"), e("e1", "s1", "j"), e("e2", "r2", "j"),
                        e("ej", "j", "end"), e("ec", "c1", "h"), e("eh", "h", "j"))));
        assertEquals(List.of(), p.issues());
        Split s = (Split) p.tree().root().items().get(0);
        assertEquals("j", s.joinId());
        Guarded g = assertInstanceOf(Guarded.class, s.branches().get(0).body().items().get(0));
        assertEquals("j", g.joinId());
        assertInstanceOf(SetStep.class, g.step());
    }

    @Test
    void 받는_노드가_SET_에_붙고_같은_종류를_둘이_받으면_구조_오류() {
        FlowDefinition f = flow(List.of(start(), set("s1", "QD_S_A"), rule("n", "R_N"), catchNode("c1", "s1", "SUBSET_ENDED"), catchNode("c2", "s1", "SUBSET_ENDED"),
                        end()),
                List.of(e("e1", "start", "s1"), e("e2", "s1", "n"), e("e3", "n", "end"), e("e4", "c1", "n"), e("e5", "c2", "n")));
        assertEquals(List.of("FLOW_CATCH|c2|null|룰 노드 s1에서 예외 종류 SUBSET_ENDED를 c1와 c2가 함께 받는다"), issues(f));
    }

    // ── 옛 형식 돌아오는 MERGE 는 SET 에 없다(D-136 §13) ──

    @Test
    void SET_을_짝으로_가리키는_합류는_짝_분기가_없다는_구조_오류() {
        FlowDefinition f = flow(List.of(start(), set("s1", "QD_S_A"), catchNode("c1", "s1", "INPUT_ERROR"), rule("r9", "R9"), guardMerge("m1", "s1"), end()),
                List.of(e("e1", "start", "s1"), e("e2", "s1", "m1"), e("e3", "c1", "r9"), e("e4", "r9", "m1"), e("e5", "m1", "end")));
        assertEquals(true, issues(f).contains("FLOW_STRUCTURE|m1|null|합류 m1의 짝 분기 s1가 없다"), issues(f).toString());
        assertNull(FlowParser.parse(f).tree());
    }

    @Test
    void 옛_형식_합류는_RULE_에는_그대로_받는다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "R1"), catchNode("c1", "r1", "INPUT_ERROR"), rule("r9", "R9"), guardMerge("m1", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "m1"), e("e3", "c1", "r9"), e("e4", "r9", "m1"), e("e5", "m1", "end")));
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        assertEquals("m1", ((Guarded) p.tree().root().items().get(0)).mergeId());
    }

    // ── catchable ──

    @Test
    void catchable_은_RULE_TASK_SET_이다() {
        for (NodeKind k : NodeKind.values()) {
            assertEquals(k == NodeKind.RULE || k == NodeKind.TASK || k == NodeKind.SET, FlowParser.catchable(k), k.name());
        }
    }

    @Test
    void 받는_노드를_못_붙이는_대상의_문구는_룰_빈_단계_룰_세트_노드다() {
        FlowDefinition f = flow(List.of(start(), set("s1", "QD_S_A"), catchNode("c1", "start", "EVAL_ERROR"), end()),
                List.of(e("e1", "start", "s1"), e("e2", "s1", "end"), e("e3", "c1", "end")));
        assertEquals(List.of("FLOW_CATCH|c1|null|받는 노드 c1는 룰·빈 단계·룰 세트 노드에만 붙일 수 있다(start는 START)"), issues(f));
    }
}
