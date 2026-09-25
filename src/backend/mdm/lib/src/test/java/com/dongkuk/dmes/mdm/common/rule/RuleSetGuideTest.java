package com.dongkuk.dmes.mdm.common.rule;

import static com.dongkuk.dmes.mdm.common.rule.RuleSetAnalyzerTest.cond;
import static com.dongkuk.dmes.mdm.common.rule.RuleSetAnalyzerTest.rule;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.dongkuk.dmes.mdm.common.rule.RuleSetGuide.Ambiguity;
import com.dongkuk.dmes.mdm.common.rule.RuleSetGuide.GuideResult;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * TSK-08-06 design §3.1 「RuleSetGuideTest」·§6.4·I16 — 결과 변수 역추적 → 위상 정렬 제안. 생산자 목록(룰 ID 순, DEPRECATED·RELEASED 없음 제외)은
 * {@code RuleIoReader.producersOfActiveRules} 가 만들고(B2), 여기서는 그 맵이 주어졌을 때의 고르기·순서·오류를 본다.
 */
class RuleSetGuideTest {

    static final String DICT = RuleIo.DICT;
    static final String PROG = RuleIo.PROG;
    static final String NONE = RuleIo.NONE;

    private final Map<String, List<String>> producers = new HashMap<>();
    private final Map<String, RuleIo> io = new HashMap<>();

    private void add(RuleIo r) {
        io.put(r.ruleId(), r);
        r.results().forEach(x -> producers.computeIfAbsent(x.name(), k -> new java.util.ArrayList<>()).add(r.ruleId()));
    }

    private GuideResult suggest(String target) {
        return RuleSetGuide.suggest(target, n -> producers.getOrDefault(n, List.of()), io::get);
    }

    private void chain() {
        add(rule("E2S_GRD", List.of(cond("SET_THK", DICT), cond("SET_SURF", DICT)), "S_GRD"));
        add(rule("E2S_FCT", List.of(cond("S_GRD", NONE), cond("SET_WID", DICT)), "S_FCT"));
        add(rule("E2S_SPD", List.of(cond("S_FCT", NONE)), "S_SPD"));
    }

    @Test
    void 사슬은_의존_먼저_순서로_제안한다() {
        chain();

        GuideResult g = suggest("S_SPD");

        assertEquals(new GuideResult(List.of("E2S_GRD", "E2S_FCT", "E2S_SPD"), List.of(), null), g);
    }

    @Test
    void 생산자가_둘이면_목록_첫_룰을_고르고_ambiguous_에_둘_다_싣는다() {
        add(rule("E2S_DUP", List.of(cond("SET_WID", DICT)), "S_GRD"));
        chain();
        // 생산자 목록은 룰 ID 순으로 주어진다(producersOfActiveRules): E2S_DUP < E2S_GRD
        assertEquals(List.of("E2S_DUP", "E2S_GRD"), producers.get("S_GRD"));

        GuideResult g = suggest("S_SPD");

        assertEquals(List.of("E2S_DUP", "E2S_FCT", "E2S_SPD"), g.order());
        assertEquals(List.of(new Ambiguity("S_GRD", List.of("E2S_DUP", "E2S_GRD"))), g.ambiguous());
        assertNull(g.error());
    }

    @Test
    void DICT_와_PROG_이름은_거슬러_찾지_않는다() {
        add(rule("R", List.of(cond("SET_THK", DICT), cond("P_LINE", PROG)), "R_OUT"));
        add(rule("MK_THK", List.of(), "SET_THK"));
        add(rule("MK_LINE", List.of(), "P_LINE"));

        assertEquals(new GuideResult(List.of("R"), List.of(), null), suggest("R_OUT"));
    }

    @Test
    void 생산자_없는_NONE_이름은_오류이고_순서와_고르기는_비어_있다() {
        // S_FCT 는 생산자가 둘이라 고르기가 쌓이지만, 오류가 나면 비운다
        add(rule("E2S_FCT", List.of(cond("S_GRD", NONE)), "S_FCT"));
        add(rule("E2S_FCU", List.of(), "S_FCT"));
        add(rule("E2S_SPD", List.of(cond("S_FCT", NONE)), "S_SPD"));

        assertEquals(new GuideResult(List.of(), List.of(), "S_GRD를 만드는 룰이 없다"), suggest("S_SPD"));
    }

    @Test
    void 대상_이름을_만드는_룰이_없으면_오류다() {
        chain();

        assertEquals(new GuideResult(List.of(), List.of(), "결과 변수 S_NONE를 만드는 룰이 없다"), suggest("S_NONE"));
    }

    @Test
    void 두_룰_순환은_오류다() {
        add(rule("E2S_CYA", List.of(cond("S_CYB", NONE)), "S_CYA"));
        add(rule("E2S_CYB", List.of(cond("S_CYA", NONE)), "S_CYB"));

        assertEquals(new GuideResult(List.of(), List.of(),
                        "순환이 있다(E2S_CYA). 룰 A의 조건이 B의 결과이고 B의 조건이 A의 결과인 경우다"),
                suggest("S_CYA"));
    }

    @Test
    void 같은_룰을_두_번_고르지_않고_후위_순서다() {
        // SPD 는 A·B 를, RA·RB 는 모두 C 를 읽는다. RW 는 A·B 둘 다 만든다 — 한 번만 고른다.
        add(rule("SPD", List.of(cond("A", NONE), cond("B", NONE)), "S_SPD"));
        add(rule("RA", List.of(cond("C", NONE)), "A"));
        add(rule("RB", List.of(cond("C", NONE)), "B"));
        add(rule("CR", List.of(), "C"));

        assertEquals(List.of("CR", "RA", "RB", "SPD"), suggest("S_SPD").order());

        producers.clear();
        io.clear();
        add(rule("Z", List.of(cond("X", NONE), cond("Y", NONE)), "Z_OUT"));
        add(rule("W", List.of(), "X", "Y"));

        assertEquals(List.of("W", "Z"), suggest("Z_OUT").order());
    }
}
