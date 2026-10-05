package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 하위 세트 spec §5 CALL_CYCLE·CALL_DEPTH(Ruling 10 문구) — 엔진 SubsetCycleDepthTest 와 같은 경계(5 통과, 6 거부, Review Focus 4). */
class RuleSetCallGraphTest {

    private static Map<String, List<String>> chain(String... ids) {
        Map<String, List<String>> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < ids.length; i++) {
            m.put(ids[i], List.of(ids[i + 1]));
        }
        return m;
    }

    private static List<String> messages(List<RuleSetCheck> checks) {
        return checks.stream().map(c -> c.code() + " " + c.severity() + " " + c.ruleId() + " " + c.message()).toList();
    }

    @Test
    void 자기_자신을_부르면_순환() {
        assertEquals(List.of("CALL_CYCLE REJECT S 세트 호출이 순환한다: S › S"), messages(RuleSetCallGraph.check("S", Map.of("S", List.of("S")))));
    }

    @Test
    void 이_세트에서_닿는_순환을_경로로_적는다() {
        Map<String, List<String>> g = new LinkedHashMap<>(chain("S", "A", "B"));
        g.put("B", List.of("A"));
        assertEquals(List.of("CALL_CYCLE REJECT S 세트 호출이 순환한다: S › A › B › A"), messages(RuleSetCallGraph.check("S", g)));
    }

    @Test
    void 이_세트와_무관한_순환은_보지_않는다() {
        Map<String, List<String>> g = new LinkedHashMap<>(chain("S", "A"));
        g.put("X", List.of("Y"));
        g.put("Y", List.of("X", "S"));
        assertEquals(List.of(), RuleSetCallGraph.check("S", g), "X ↔ Y 순환은 S 에서 닿지 않는다(위쪽 사슬은 끊어 센다)");
    }

    @Test
    void 다섯_단계는_통과하고_여섯_단계는_거부한다() {
        assertEquals(List.of(), RuleSetCallGraph.check("S0", chain("S0", "S1", "S2", "S3", "S4", "S5")));
        assertEquals(List.of("CALL_DEPTH REJECT S0 세트 호출이 6단계다. 5단계까지 부른다: S0 › S1 › S2 › S3 › S4 › S5 › S6"),
                messages(RuleSetCallGraph.check("S0", chain("S0", "S1", "S2", "S3", "S4", "S5", "S6"))));
    }

    @Test
    void 이_세트를_부르는_쪽_깊이를_합친다() {
        Map<String, List<String>> g = new LinkedHashMap<>(chain("P0", "P1", "P2", "S"));
        g.putAll(chain("S", "C1", "C2", "C3"));
        assertEquals(List.of("CALL_DEPTH REJECT S 세트 호출이 6단계다. 5단계까지 부른다: P0 › P1 › P2 › S › C1 › C2 › C3"), messages(RuleSetCallGraph.check("S", g)));
        g.put("C2", List.of());
        assertEquals(List.of(), RuleSetCallGraph.check("S", g), "P0 › P1 › P2 › S › C1 › C2 는 5단계");
    }

    @Test
    void 갈래가_여럿이면_가장_긴_사슬_하나를_적는다() {
        Map<String, List<String>> g = new LinkedHashMap<>();
        g.put("S", List.of("A", "B"));
        g.putAll(chain("A", "A1"));
        g.putAll(chain("B", "B1", "B2", "B3", "B4", "B5"));
        assertEquals(List.of("CALL_DEPTH REJECT S 세트 호출이 6단계다. 5단계까지 부른다: S › B › B1 › B2 › B3 › B4 › B5"), messages(RuleSetCallGraph.check("S", g)));
    }

    @Test
    void 빈_그래프와_부르지_않는_세트는_통과() {
        assertEquals(List.of(), RuleSetCallGraph.check("S", Map.of()));
        assertEquals(List.of(), RuleSetCallGraph.check("S", Map.of("S", List.of())));
    }
}
