package kr.dongkuk.maru.mdm.engine.flow;

import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.catchNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.guardMerge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifFlow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.nestedFlow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.parFlow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree.Relation;
import org.junit.jupiter.api.Test;

/** plan C2 — 노드 관계·펼친 룰 목록. */
class FlowTreeTest {

    private static FlowTree tree(kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition f) {
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        return p.tree();
    }

    @Test
    void IF_의_다른_갈래는_EXCLUSIVE_이고_분기와_갈래_안은_같은_경로() {
        FlowTree t = tree(ifFlow());
        assertEquals(Relation.EXCLUSIVE, t.relation("a", "b"));
        assertEquals(Relation.EXCLUSIVE, t.relation("c", "a"));
        assertEquals(Relation.BEFORE, t.relation("if1", "a"));
        assertEquals(Relation.AFTER, t.relation("b", "if1"));
        assertEquals(Relation.SAME, t.relation("a", "a"));
    }

    @Test
    void 병렬_형제는_PARALLEL_이고_합류_뒤_룰은_모두보다_뒤() {
        FlowTree t = tree(parFlow());
        assertEquals(Relation.PARALLEL, t.relation("a", "b"));
        assertEquals(Relation.BEFORE, t.relation("a", "c"));
        assertEquals(Relation.BEFORE, t.relation("b", "c"));
        assertEquals(Relation.AFTER, t.relation("c", "p1"));
    }

    @Test
    void 중첩에서_바깥_갈래가_먼저_갈린다() {
        FlowTree t = tree(nestedFlow());
        assertEquals(Relation.PARALLEL, t.relation("a", "b"), "a 는 p1 첫 갈래 안의 IF 안, b 는 p1 둘째 갈래");
        assertEquals(Relation.BEFORE, t.relation("if1", "a"));
        assertEquals(Relation.PARALLEL, t.relation("if1", "b"));
    }

    @Test
    void ruleSteps_는_깊이_우선_ruleIds_는_중복_없이() {
        // 같은 룰 R_A 를 두 갈래에 둔다(Review Focus 3).
        var f = flow(List.of(start(), ifNode("if1"), rule("a1", "R_A"), rule("a2", "R_A"), merge("m1", "if1"), rule("c", "R_C"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a1", 1, "X > 0"), other("bo", "if1", "a2"),
                        e("ea1", "a1", "m1"), e("ea2", "a2", "m1"), e("em", "m1", "c"), e("ec", "c", "end")));
        FlowTree t = tree(f);
        assertEquals(List.of("a1", "a2", "c"), t.ruleSteps().stream().map(RuleStep::nodeId).toList());
        assertEquals(List.of("R_A", "R_C"), t.ruleIds());
        assertEquals("start", t.startId());
        assertEquals("end", t.endId());
    }

    @Test
    void 모르는_노드의_관계는_예외() {
        FlowTree t = tree(ifFlow());
        assertThrows(IllegalArgumentException.class, () -> t.relation("a", "nope"));
    }

    @Test
    void 정상_갈래와_처리_갈래는_EXCLUSIVE_이고_받는_룰보다_뒤이며_branched_는_그대로다() {
        FlowTree t = tree(FlowParserTest.guardedFlow());
        assertEquals(Relation.BEFORE, t.relation("r1", "r9"));
        assertEquals(Relation.AFTER, t.relation("r9", "r1"));
        assertEquals(Relation.BEFORE, t.relation("r9", "r2"));
        assertFalse(t.branched());
        FlowTree n = tree(kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow(
                List.of(start(), rule("r1", "R_A"), rule("n1", "R_B"), catchNode("c1", "r1", "NO_RESULT"), rule("h1", "R_C"), guardMerge("mr", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "n1"), e("e3", "n1", "mr"), e("e4", "c1", "h1"), e("e5", "h1", "mr"), e("e6", "mr", "end"))));
        assertEquals(Relation.EXCLUSIVE, n.relation("n1", "h1"));
        assertEquals(Relation.EXCLUSIVE, n.relation("h1", "n1"));
    }
}
