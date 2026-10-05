package kr.dongkuk.maru.mdm.engine.flow;

import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.catchNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.guardMerge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.par;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.pe;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.task;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import org.junit.jupiter.api.Test;

/**
 * {@link FlowParser#parse} 1단계 특성 테스트(리팩토링 항목 7) — {@link FlowParserTest}·rule-set-corpus 가 닿지 않는 분기와, 모든 검사 단계
 * (a → b → c → 노드별 d·e·f1 → 분기별 f2·g·f4 → 받는 노드별 h1..h5 → 붙은 노드별 h6·h7)가 한 흐름에서 함께 날 때의 순서를 고정한다.
 */
class FlowParserStageOneCharacterizationTest {

    /** issue 를 "code|nodeId|edgeId|message" 로. 오류가 있으면 트리는 없다. */
    private static List<String> issues(FlowDefinition f) {
        FlowParse p = FlowParser.parse(f);
        if (!p.issues().isEmpty()) {
            assertNull(p.tree(), "오류가 있으면 트리가 없다");
        }
        return p.issues().stream().map(i -> i.code() + "|" + i.nodeId() + "|" + i.edgeId() + "|" + i.message()).toList();
    }

    @Test
    void 일단계_검사_단계가_모두_함께_나면_a_b_c_노드별_분기별_받는_노드별_붙은_노드별_순서다() {
        FlowDefinition f = flow(List.of(
                        start(),
                        new FlowNode("start", NodeKind.START, null, null, null, null, null, null), // a — 겹친 ID(개수에서 빠진다)
                        new FlowNode("s2", NodeKind.START, null, null, null, null, null, null), // b1 — 시작 2개
                        rule("r", "R_A"),
                        ifNode("if1"),
                        par("p1"),
                        rule("x", " "), // e — 룰 ID 없음
                        merge("m9", "zz"), // f1 — 없는 짝 분기
                        task("t1"),
                        catchNode("c1", "t1", "NO_RESULT"),
                        catchNode("c2", "t1", "NO_RESULT", "NO_RESULT"), // h5 — 한 받는 노드 안 겹침, h6 — c1 과 함께 받음
                        new FlowNode("c3", NodeKind.CATCH, null, null, null, " ", null, null), // h1 — 빈 붙임('-'), h3 — 종류 null
                        catchNode("c4", "if1", "BOOM"), // h2 — 붙일 수 없는 종류, h4 — 모르는 키
                        guardMerge("gm1", "t1"),
                        guardMerge("gm2", "t1")), // h7 — 돌아오는 합류 2개
                List.of(
                        e("e1", "start", "r"),
                        e("e2", "r", "if1"),
                        e("e3", "r", "ghost"), // c — 없는 노드(r 의 나가는 선 수에서 빠진다)
                        br("b1", "if1", "x", 1, "A > 0"),
                        br("b2", "if1", "x", 1, " "), // g2 조건식 없음, g5 순서 겹침, f4 같은 도착
                        new FlowEdge("b3", "if1", "p1", null, "B > 0", false, null), // g4 순서 없음
                        new FlowEdge("q1", "p1", "t1", 1, null, true, null), // g3 — 병렬 갈래의 그 외 표시
                        pe("q2", "p1", "t1", 2),
                        e("ex", "x", "t1"),
                        e("et", "t1", "gm1"),
                        e("ec1", "c1", "gm1"),
                        e("eg", "gm1", "gm2"),
                        e("ec2", "c2", "gm2"),
                        e("ein", "s2", "c1"))); // d — CATCH 에 들어오는 선
        assertEquals(List.of(
                "FLOW_STRUCTURE|start|null|노드 ID start가 겹친다",
                "FLOW_STRUCTURE|null|null|시작 노드가 2개다. 정확히 1개여야 한다",
                "FLOW_STRUCTURE|null|null|끝 노드가 0개다. 정확히 1개여야 한다",
                "FLOW_STRUCTURE|ghost|e3|선 e3가 없는 노드 ghost를 가리킨다",
                "FLOW_STRUCTURE|x|null|룰 노드 x에 룰 ID가 없다",
                "FLOW_STRUCTURE|m9|null|m9의 들어오는 선이 0개다. 2개 이상이어야 한다",
                "FLOW_STRUCTURE|m9|null|m9의 나가는 선이 0개다. 1개여야 한다",
                "FLOW_STRUCTURE|m9|null|합류 m9의 짝 분기 zz가 없다",
                "FLOW_STRUCTURE|c1|null|c1의 들어오는 선이 1개다. 없어야 한다",
                "FLOW_STRUCTURE|c3|null|c3의 나가는 선이 0개다. 1개여야 한다",
                "FLOW_STRUCTURE|c4|null|c4의 나가는 선이 0개다. 1개여야 한다",
                "FLOW_STRUCTURE|gm2|null|gm2의 나가는 선이 0개다. 1개여야 한다",
                "FLOW_IF_ELSE|if1|null|IF if1에 \"그 외\" 갈래가 0개다. 정확히 1개여야 한다",
                "FLOW_IF_ELSE|if1|b2|IF if1의 갈래 b2에 조건식이 없다",
                "FLOW_STRUCTURE|if1|b3|분기 if1의 갈래 b3에 순서가 없다",
                "FLOW_STRUCTURE|if1|b2|분기 if1의 갈래 순서 1가 겹친다",
                "FLOW_STRUCTURE|if1|b2|IF if1의 갈래 b2가 갈래 b1와 같은 노드 x로 간다. 같은 노드로 가는 갈래는 하나만 둔다",
                "FLOW_STRUCTURE|p1|null|분기 p1를 닫는 합류가 0개다. 정확히 1개여야 한다",
                "FLOW_STRUCTURE|p1|q1|병렬 분기 p1의 갈래 q1에는 조건을 둘 수 없다",
                "FLOW_CATCH|c2|null|받는 노드 c2에 예외 종류 NO_RESULT가 겹친다",
                "FLOW_CATCH|c3|null|받는 노드 c3가 붙은 노드 -가 없다",
                "FLOW_CATCH|c3|null|받는 노드 c3에 받을 예외 종류가 없다",
                "FLOW_CATCH|c4|null|받는 노드 c4는 룰·빈 단계 노드에만 붙일 수 있다(if1는 IF)",
                "FLOW_CATCH|c4|null|받는 노드 c4의 예외 종류 BOOM를 모른다",
                // h6 — c2 안의 둘째 NO_RESULT 도 c1 과 견주어 같은 문구가 한 번 더 난다(현재 동작 그대로 고정).
                "FLOW_CATCH|c2|null|룰 노드 t1에서 예외 종류 NO_RESULT를 c1와 c2가 함께 받는다",
                "FLOW_CATCH|c2|null|룰 노드 t1에서 예외 종류 NO_RESULT를 c1와 c2가 함께 받는다",
                "FLOW_STRUCTURE|t1|null|룰 t1로 돌아오는 합류가 2개다. 1개까지 둔다"), issues(f));
    }

    @Test
    void 받는_노드의_빈_붙임은_대시로_쓰고_종류가_null_이면_빈_목록과_같다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_A"), new FlowNode("c1", NodeKind.CATCH, null, null, null, null, null, null), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "end"), e("e3", "c1", "end")));
        assertEquals(List.of(
                "FLOW_CATCH|c1|null|받는 노드 c1가 붙은 노드 -가 없다",
                "FLOW_CATCH|c1|null|받는 노드 c1에 받을 예외 종류가 없다"), issues(f));
    }

    @Test
    void 받는_노드는_IF_START_다른_받는_노드에_붙일_수_없다() {
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), merge("m1", "if1"), catchNode("c1", "if1", "NO_RESULT"),
                        catchNode("c2", "start", "EVAL_ERROR"), catchNode("c3", "c1", "NO_RESULT"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "m1"), e("ea", "a", "m1"),
                        e("em", "m1", "end"), e("ec1", "c1", "end"), e("ec2", "c2", "end"), e("ec3", "c3", "end")));
        assertEquals(List.of(
                "FLOW_CATCH|c1|null|받는 노드 c1는 룰·빈 단계 노드에만 붙일 수 있다(if1는 IF)",
                "FLOW_CATCH|c2|null|받는 노드 c2는 룰·빈 단계 노드에만 붙일 수 있다(start는 START)",
                "FLOW_CATCH|c3|null|받는 노드 c3는 룰·빈 단계 노드에만 붙일 수 있다(c1는 CATCH)"), issues(f));
    }

    @Test
    void 병렬_갈래에_그_외_표시만_있어도_조건으로_본다() {
        FlowDefinition f = flow(List.of(start(), par("p1"), rule("a", "R_A"), rule("b", "R_B"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), new FlowEdge("p1a", "p1", "a", 1, null, true, null), pe("p1b", "p1", "b", 2),
                        e("ea", "a", "pm"), e("eb", "b", "pm"), e("ee", "pm", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|p1|p1a|병렬 분기 p1의 갈래 p1a에는 조건을 둘 수 없다"), issues(f));
    }

    @Test
    void 합류의_짝_분기_ID_가_없는_노드면_그_ID_를_쓴다() {
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), merge("m1", "nope"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "b"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ee", "m1", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|m1|null|합류 m1의 짝 분기 nope가 없다"), issues(f));
    }
}
