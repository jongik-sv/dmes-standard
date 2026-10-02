package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import com.dongkuk.dmes.mdm.common.rule.RuleSetAnalyzer.InputRow;
import com.dongkuk.dmes.mdm.common.rule.RuleSetAnalyzer.ResultRow;
import com.dongkuk.dmes.mdm.common.rule.RuleSetAnalyzer.SetIo;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * TSK-08-06 design §3.1 「RuleSetAnalyzerTest」 — 세트 입출력 표(§6.2, I10)·의존 룰(I11)·저장 시 검사(§6.3, I8)의 Java 쪽. 문구·순서까지 본다.
 * 사슬 룰 이름은 e2e 픽스처(§3.4.3)와 같다: {@code E2S_GRD}(SET_THK·SET_SURF → S_GRD), {@code E2S_FCT}(S_GRD·SET_WID → S_FCT), {@code E2S_SPD}(S_FCT → S_SPD).
 */
class RuleSetAnalyzerTest {

    static final String DICT = RuleIo.DICT;
    static final String PROG = RuleIo.PROG;
    static final String NONE = RuleIo.NONE;

    static IoName cond(String name, String source) {
        return new IoName(name, source, null, null, null, false, null);
    }

    static RuleIo rule(String id, String status, Integer ver, List<IoName> conds, String... results) {
        return new RuleIo(id, id + " 이름", "DT", status, true, ver == null ? null : ver + ".000", "FIRST", conds,
                Arrays.stream(results).map(r -> new IoName(r, null, null, null, null, false, null)).toList());
    }

    static RuleIo rule(String id, List<IoName> conds, String... results) {
        return rule(id, "INUSE", 1, conds, results);
    }

    static Map<String, RuleIo> rules(RuleIo... rs) {
        Map<String, RuleIo> m = new LinkedHashMap<>();
        for (RuleIo r : rs) {
            m.put(r.ruleId(), r);
        }
        return m;
    }

    static final RuleIo GRD = rule("E2S_GRD", List.of(cond("SET_THK", DICT), cond("SET_SURF", DICT)), "S_GRD");
    static final RuleIo FCT = rule("E2S_FCT", List.of(cond("S_GRD", NONE), cond("SET_WID", DICT)), "S_FCT");
    static final RuleIo SPD = rule("E2S_SPD", List.of(cond("S_FCT", NONE)), "S_SPD");
    static final Map<String, RuleIo> CHAIN = rules(GRD, FCT, SPD);

    static RuleSetCheck check(String code, String severity, String ruleId, String other, String var, String message) {
        return new RuleSetCheck(code, severity, ruleId, other, var, message);
    }

    // ---- io (§6.2, I10) ----

    @Test
    void 사슬_입출력_표는_입력을_첫_등장_순으로_결과를_by_readers_로_모은다() {
        SetIo io = RuleSetAnalyzer.io(List.of("E2S_GRD", "E2S_FCT", "E2S_SPD"), CHAIN);

        assertEquals(List.of("SET_THK", "SET_SURF", "SET_WID"), io.inputs().stream().map(InputRow::name).toList());
        assertEquals(List.of(List.of("E2S_GRD"), List.of("E2S_GRD"), List.of("E2S_FCT")), io.inputs().stream().map(InputRow::users).toList());
        assertEquals(List.of(DICT, DICT, DICT), io.inputs().stream().map(InputRow::source).toList());

        assertEquals(List.of("S_GRD", "S_FCT", "S_SPD"), io.results().stream().map(ResultRow::name).toList());
        assertEquals(List.of(List.of("E2S_GRD"), List.of("E2S_FCT"), List.of("E2S_SPD")), io.results().stream().map(ResultRow::by).toList());
        assertEquals(List.of(List.of("E2S_FCT"), List.of("E2S_SPD"), List.of()), io.results().stream().map(ResultRow::readers).toList());
        assertEquals(List.of(false, false, true), io.results().stream().map(ResultRow::finalResult).toList());
    }

    @Test
    void 뒤_룰이_만드는_이름을_앞_룰이_읽으면_입력으로_잡히고_출처는_그대로다() {
        SetIo io = RuleSetAnalyzer.io(List.of("E2S_FCT", "E2S_GRD"), CHAIN);

        InputRow first = io.inputs().get(0);
        assertEquals("S_GRD", first.name());
        assertEquals(NONE, first.source());
        assertEquals(List.of("E2S_FCT"), first.users());
        ResultRow grd = io.results().stream().filter(r -> r.name().equals("S_GRD")).findFirst().orElseThrow();
        assertEquals(List.of("E2S_GRD"), grd.by());
        assertEquals(List.of(), grd.readers(), "뒤 룰이 만든 결과를 앞 룰이 읽은 것은 readers 가 아니다");
        assertTrue(grd.finalResult());
    }

    @Test
    void 입력_행은_처음_읽은_룰의_타입과_표시명을_싣고_결과_행은_처음_만든_룰의_타입을_싣는다() {
        RuleIo a = new RuleIo("A", "A", "DT", "INUSE", true, "1.000", "FIRST",
                List.of(new IoName("SET_THK", DICT, "세트 두께", "NUMBER", 2, false, null)),
                List.of(new IoName("X", null, null, "STRING", null, false, "CD1")));
        RuleIo b = new RuleIo("B", "B", "DT", "INUSE", true, "1.000", "FIRST",
                List.of(new IoName("SET_THK", DICT, "다른 표시명", "STRING", null, false, null)),
                List.of(new IoName("X", null, null, "NUMBER", 0, false, null)));

        SetIo io = RuleSetAnalyzer.io(List.of("A", "B"), rules(a, b));

        assertEquals(List.of(new InputRow("SET_THK", "세트 두께", "NUMBER", 2, false, null, DICT, List.of("A", "B"))), io.inputs());
        assertEquals(List.of(new ResultRow("X", "STRING", null, false, "CD1", List.of("A", "B"), List.of())), io.results());
    }

    @Test
    void 없는_룰과_RELEASED_없는_룰은_입출력에_아무것도_더하지_않는다() {
        RuleIo fresh = rule("E2S_NEW", "INUSE", null, List.of());
        SetIo io = RuleSetAnalyzer.io(List.of("NO_SUCH", "E2S_NEW", "E2S_GRD"), rules(GRD, fresh));

        assertEquals(List.of("SET_THK", "SET_SURF"), io.inputs().stream().map(InputRow::name).toList());
        assertEquals(List.of("S_GRD"), io.results().stream().map(ResultRow::name).toList());
    }

    // ---- deps (I11) ----

    @Test
    void 의존_룰은_DICT_가_아닌_조건을_만드는_세트_안의_다른_룰이고_목록_순이다() {
        RuleIo z = rule("Z", List.of(cond("A_OUT", NONE), cond("B_OUT", NONE), cond("Z_OUT", NONE)), "Z_OUT");
        RuleIo a = rule("A", List.of(), "A_OUT");
        RuleIo b = rule("B", List.of(), "B_OUT");

        Map<String, List<String>> d = RuleSetAnalyzer.deps(List.of("B", "A", "Z"), rules(z, a, b));

        assertEquals(List.of("B", "A"), d.get("Z"), "조건 순이 아니라 목록 순이고, 자기(Z_OUT)는 빠진다");
        assertEquals(List.of(), d.get("A"));
        assertEquals(List.of("B", "A", "Z"), List.copyOf(d.keySet()));
    }

    @Test
    void DICT_이름을_만드는_룰은_의존_룰이_아니다() {
        RuleIo mkt = rule("E2S_MKT", List.of(), "SET_THK");

        Map<String, List<String>> d = RuleSetAnalyzer.deps(List.of("E2S_MKT", "E2S_GRD"), rules(mkt, GRD));

        assertEquals(List.of(), d.get("E2S_GRD"));
    }

    @Test
    void 사슬의_의존_룰() {
        assertEquals(Map.of("E2S_GRD", List.of(), "E2S_FCT", List.of("E2S_GRD"), "E2S_SPD", List.of("E2S_FCT")),
                RuleSetAnalyzer.deps(List.of("E2S_GRD", "E2S_FCT", "E2S_SPD"), CHAIN));
    }

    // ---- checks (§6.3, I8) ----

    @Test
    void 통과_사슬은_검사가_없다() {
        assertEquals(List.of(), RuleSetAnalyzer.checks(List.of("E2S_GRD", "E2S_FCT", "E2S_SPD"), CHAIN));
    }

    @Test
    void 빈_목록은_EMPTY_하나만이다() {
        assertEquals(List.of(check("EMPTY", "REJECT", null, null, null, "룰이 하나도 없다")), RuleSetAnalyzer.checks(List.of(), Map.of()));
    }

    @Test
    void 없는_룰은_RULE_NOT_FOUND_한_건이다() {
        RuleIo gone = new RuleIo("E2S_GONE", null, null, null, false, null, null, List.of(), List.of());

        assertEquals(List.of(
                        check("RULE_NOT_FOUND", "REJECT", "NO_SUCH", null, null, "NO_SUCH는 없는 룰이다"),
                        check("RULE_NOT_FOUND", "REJECT", "E2S_GONE", null, null, "E2S_GONE는 없는 룰이다")),
                RuleSetAnalyzer.checks(List.of("NO_SUCH", "E2S_GONE"), rules(gone)));
    }

    @Test
    void DEPRECATED_룰은_RULE_DEPRECATED_한_건이다() {
        RuleIo old = rule("E2S_OLD", "DEPRECATED", 1, List.of(cond("SET_THK", DICT)), "S_OLD");

        assertEquals(List.of(check("RULE_DEPRECATED", "REJECT", "E2S_OLD", null, null, "E2S_OLD는 DEPRECATED다")),
                RuleSetAnalyzer.checks(List.of("E2S_OLD"), rules(old)));
    }

    @Test
    void RELEASED_없는_룰은_경고_NO_RELEASED_한_건이다() {
        RuleIo fresh = rule("E2S_NEW", "INUSE", null, List.of());

        List<RuleSetCheck> out = RuleSetAnalyzer.checks(List.of("E2S_NEW"), rules(fresh));

        assertEquals(List.of(check("NO_RELEASED", "WARN", "E2S_NEW", null, null,
                "E2S_NEW는 RELEASED 버전이 없어 입출력을 계산하지 않았다. 이대로 부르면 판정 오류다")), out);
        assertFalse(out.get(0).rejected());
    }

    @Test
    void 뒤_룰의_결과를_읽으면_ORDER_거부다() {
        List<RuleSetCheck> out = RuleSetAnalyzer.checks(List.of("E2S_FCT", "E2S_GRD"), CHAIN);

        assertEquals(List.of(check("ORDER", "REJECT", "E2S_FCT", "E2S_GRD", "S_GRD",
                "E2S_FCT가 뒤에 도는 E2S_GRD의 결과 변수 S_GRD를 읽는다. E2S_GRD를 E2S_FCT 앞으로 옮긴다")), out);
        assertTrue(out.get(0).rejected());
    }

    @Test
    void 뒤에_만드는_룰이_여럿이면_ORDER_문구에_모두_잇고_첫_룰을_앞으로_옮기라고_한다() {
        RuleIo rd = rule("E2S_RD", List.of(cond("S_X", NONE)), "S_RD");
        RuleIo p1 = rule("E2S_P1", List.of(), "S_X");
        RuleIo p2 = rule("E2S_P2", List.of(), "S_X");

        assertEquals(List.of(
                        check("ORDER", "REJECT", "E2S_RD", "E2S_P1", "S_X",
                                "E2S_RD가 뒤에 도는 E2S_P1, E2S_P2의 결과 변수 S_X를 읽는다. E2S_P1를 E2S_RD 앞으로 옮긴다"),
                        check("DUP_RESULT", "WARN", "E2S_P2", "E2S_P1", "S_X", "E2S_P1와 E2S_P2가 같은 결과 변수 S_X에 대입한다")),
                RuleSetAnalyzer.checks(List.of("E2S_RD", "E2S_P1", "E2S_P2"), rules(rd, p1, p2)));
    }

    @Test
    void 두_룰이_서로의_결과를_읽으면_CYCLE_이다() {
        RuleIo cya = rule("E2S_CYA", List.of(cond("S_CYB", NONE)), "S_CYA");
        RuleIo cyb = rule("E2S_CYB", List.of(cond("S_CYA", NONE)), "S_CYB");

        assertEquals(List.of(check("CYCLE", "REJECT", "E2S_CYA", "E2S_CYB", "S_CYB",
                        "E2S_CYA와 E2S_CYB가 서로의 결과 변수를 읽는다(순환). 순서를 바꿔서는 풀리지 않는다")),
                RuleSetAnalyzer.checks(List.of("E2S_CYA", "E2S_CYB"), rules(cya, cyb)));
    }

    @Test
    void 세_룰_고리는_이행적으로_CYCLE_이다() {
        // A 는 C 결과를 읽고, C 는 B 결과를, B 는 A 결과를 읽는다(C → B → A 의존). 직접 겹침은 없다.
        RuleIo a = rule("A", List.of(cond("C_OUT", NONE)), "A_OUT");
        RuleIo b = rule("B", List.of(cond("A_OUT", NONE)), "B_OUT");
        RuleIo c = rule("C", List.of(cond("B_OUT", NONE)), "C_OUT");

        assertEquals(List.of(check("CYCLE", "REJECT", "A", "C", "C_OUT", "A와 C가 서로의 결과 변수를 읽는다(순환). 순서를 바꿔서는 풀리지 않는다")),
                RuleSetAnalyzer.checks(List.of("A", "B", "C"), rules(a, b, c)));
    }

    @Test
    void 순환_겹침은_상대_조건의_출처와_무관하게_본다() {
        // OB 가 S_OA 를 DICT 로 읽어 의존 그래프에는 간선이 없지만, OA 결과와 OB 조건 이름이 겹친다.
        RuleIo oa = rule("E2S_OA", List.of(cond("S_OB", NONE)), "S_OA");
        RuleIo ob = rule("E2S_OB", List.of(cond("S_OA", DICT)), "S_OB");

        assertEquals(List.of("CYCLE"), RuleSetAnalyzer.checks(List.of("E2S_OA", "E2S_OB"), rules(oa, ob)).stream().map(RuleSetCheck::code).toList());
    }

    @Test
    void 프로그램_변수는_통과하고_뒤_룰이_같은_이름을_만들면_ORDER_다() {
        RuleIo prg = rule("E2S_PRG", List.of(cond("P_LINE", PROG), cond("SET_THK", DICT)), "S_PRG");
        RuleIo mkl = rule("E2S_MKL", List.of(cond("SET_WID", DICT)), "P_LINE");

        assertEquals(List.of(), RuleSetAnalyzer.checks(List.of("E2S_PRG"), rules(prg)));
        assertEquals(List.of(check("ORDER", "REJECT", "E2S_PRG", "E2S_MKL", "P_LINE",
                        "E2S_PRG가 뒤에 도는 E2S_MKL의 결과 변수 P_LINE를 읽는다. E2S_MKL를 E2S_PRG 앞으로 옮긴다")),
                RuleSetAnalyzer.checks(List.of("E2S_PRG", "E2S_MKL"), rules(prg, mkl)));
    }

    @Test
    void 어디에도_없는_입력은_UNKNOWN_INPUT_거부다() {
        assertEquals(List.of(check("UNKNOWN_INPUT", "REJECT", "E2S_FCT", null, "S_GRD",
                        "E2S_FCT의 조건 변수 S_GRD는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다")),
                RuleSetAnalyzer.checks(List.of("E2S_FCT"), CHAIN));
    }

    /**
     * 받는 노드 spec §5 — 처리 갈래는 받는 룰 직전 상태에서 시작하므로 받는 룰의 결과는 처리 갈래에 없다. 지금 문구 그대로 UNKNOWN_INPUT 거부다
     * (TS {@code set-model.test.ts} 같은 사례와 짝). {@code start → r1(R1) → mr → r2(R2) → end}, {@code c1(r1, NO_RESULT) → h1(R9: P 읽기) → mr}.
     */
    @Test
    void 처리_갈래_룰이_받는_룰의_결과를_읽으면_UNKNOWN_INPUT_거부다() {
        String flow = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"R1\"},"
                + "{\"id\":\"c1\",\"kind\":\"CATCH\",\"attachTo\":\"r1\",\"catches\":[\"NO_RESULT\"]},{\"id\":\"h1\",\"kind\":\"RULE\",\"ruleId\":\"R9\"},"
                + "{\"id\":\"mr\",\"kind\":\"MERGE\",\"splitId\":\"r1\"},{\"id\":\"r2\",\"kind\":\"RULE\",\"ruleId\":\"R2\"},{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"r1\"},{\"id\":\"e2\",\"from\":\"r1\",\"to\":\"mr\"},"
                + "{\"id\":\"e3\",\"from\":\"c1\",\"to\":\"h1\"},{\"id\":\"e4\",\"from\":\"h1\",\"to\":\"mr\"},"
                + "{\"id\":\"e5\",\"from\":\"mr\",\"to\":\"r2\"},{\"id\":\"e6\",\"from\":\"r2\",\"to\":\"end\"}]}";
        Map<String, RuleIo> rs = rules(rule("R1", List.of(cond("A", DICT)), "P"), rule("R9", List.of(cond("P", null)), "X"), rule("R2", List.of(), "Q"));

        assertEquals(List.of(new RuleSetCheck("UNKNOWN_INPUT", "REJECT", "R9", null, "P",
                        "R9의 조건 변수 P는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다", "h1", null)),
                RuleSetAnalyzer.checks(RuleSetFlowJson.parse(flow), rs, Map.of()));
    }

    @Test
    void 세_번_대입하면_경고가_두_건이고_앞_생산자를_상대로_적는다() {
        RuleIo a = rule("A", List.of(), "X");
        RuleIo b = rule("B", List.of(), "X");
        RuleIo c = rule("C", List.of(), "X");

        assertEquals(List.of(
                        check("DUP_RESULT", "WARN", "B", "A", "X", "A와 B가 같은 결과 변수 X에 대입한다"),
                        check("DUP_RESULT", "WARN", "C", "B", "X", "B와 C가 같은 결과 변수 X에 대입한다")),
                RuleSetAnalyzer.checks(List.of("A", "B", "C"), rules(a, b, c)));
    }

    @Test
    void 검사는_1단계_존재_상태를_목록_순으로_먼저_내고_DEPRECATED_룰의_조건도_2단계에_참여한다() {
        RuleIo old = rule("E2S_OLD", "DEPRECATED", 1, List.of(cond("S_Q", NONE)), "S_OLD");
        RuleIo fresh = rule("E2S_NEW", "INUSE", null, List.of());

        assertEquals(List.of(
                        check("RULE_NOT_FOUND", "REJECT", "NO_SUCH", null, null, "NO_SUCH는 없는 룰이다"),
                        check("RULE_DEPRECATED", "REJECT", "E2S_OLD", null, null, "E2S_OLD는 DEPRECATED다"),
                        check("NO_RELEASED", "WARN", "E2S_NEW", null, null,
                                "E2S_NEW는 RELEASED 버전이 없어 입출력을 계산하지 않았다. 이대로 부르면 판정 오류다"),
                        check("UNKNOWN_INPUT", "REJECT", "E2S_OLD", null, "S_Q",
                                "E2S_OLD의 조건 변수 S_Q는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다")),
                RuleSetAnalyzer.checks(List.of("NO_SUCH", "E2S_OLD", "E2S_NEW"), rules(old, fresh)));
    }

    @Test
    void 호출자가_맵의_한_항목을_바꿔_넣으면_그_정의로_다시_검사한다() {
        // 08-04 가 룰 저장 때 "저장하려는 정의"로 세트를 다시 검사하는 방식(design §2.1 RuleSetAnalyzer, 06:327)
        Map<String, RuleIo> edited = new LinkedHashMap<>(CHAIN);
        edited.put("E2S_GRD", rule("E2S_GRD", List.of(cond("S_SPD", NONE)), "S_GRD"));

        assertEquals(List.of("CYCLE"),
                RuleSetAnalyzer.checks(List.of("E2S_GRD", "E2S_FCT", "E2S_SPD"), edited).stream().map(RuleSetCheck::code).toList());
    }
}
