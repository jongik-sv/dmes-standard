package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
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
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.flow.FlowParse;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

/**
 * 세트 판정 측정(항목5) — 저장 검증처럼 1,000행 × 세트 N개(N=1·5·20)를 {@code evaluateSet} 으로 부른 시간을 예열 뒤 여러 번 재어 중앙값·최소·최대를
 * 찍는다. 정의에만 의존하는 준비(흐름 파싱 + {@link FlowKeys} 생성)를 같은 횟수만큼 따로 재어 그 몫도 찍는다. 환경변수 {@code MDM_BENCH} 가
 * 있을 때만 돈다:
 *
 * <pre>
 * cd src/backend/maru-mdm-engine
 * MDM_BENCH=1 JAVA_HOME=... ../gradlew test --rerun --tests '*RuleSetPrepareBenchTest' --console=plain -i | grep BENCH
 * </pre>
 *
 * <p>세트는 실제 크기에 가까운 흐름이다 — 샘플 룰 LS_A3(BASE_SPD_LKP 7행·결과 열 그룹 8개 → SPD_EXC COLLECT → SPD_JOIN) 뒤 IF(QLTY_GRD_JDG |
 * COIL_WGT_CALC), 병렬(PROD_WGT_CALC | 계산 룰), INPUT_ERROR 를 받는 룰. 룰 9개·노드 17개. N 개 세트는 ID 만 다르다.
 */
class RuleSetPrepareBenchTest {

    private static final int ROWS = 1_000;
    private static final int WARMUP = 3;
    private static final int RUNS = 9;
    private static final Instant TS = SampleRules.EVAL_TS;

    static FlowDefinition benchFlow() {
        return flow(List.of(start(), rule("bs", "BASE_SPD_LKP"), rule("se", "SPD_EXC"), rule("sj", "SPD_JOIN"), ifNode("if1"),
                        rule("q", "QLTY_GRD_JDG"), rule("w", "COIL_WGT_CALC"), merge("m1", "if1"), par("p1"), rule("pw", "PROD_WGT_CALC"),
                        rule("ca", "R_A"), merge("pm", "p1"), rule("y", "R_Y"), catchNode("cy", "y", "INPUT_ERROR"), rule("h", "R_FILL"),
                        guardMerge("my", "y"), end()),
                List.of(e("e0", "start", "bs"), e("e1", "bs", "se"), e("e2", "se", "sj"), e("e3", "sj", "if1"),
                        br("b1", "if1", "q", 1, "COIL_THK >= 0.9"), other("bo", "if1", "w"), e("eq", "q", "m1"), e("ew", "w", "m1"),
                        e("em", "m1", "p1"), pe("p1a", "p1", "pw", 1), pe("p1b", "p1", "ca", 2), e("epw", "pw", "pm"), e("eca", "ca", "pm"),
                        e("ep", "pm", "y"), e("ey", "y", "my"), e("ecy", "cy", "h"), e("eh", "h", "my"), e("emy", "my", "end")));
    }

    private static final List<String> RULE_IDS = List.of("BASE_SPD_LKP", "SPD_EXC", "SPD_JOIN", "QLTY_GRD_JDG", "COIL_WGT_CALC",
            "PROD_WGT_CALC", "R_A", "R_Y", "R_FILL");

    private static List<Map<String, Object>> rows() {
        String[] resins = {"2A", "6B", "F", "WX", "BK", "GN"};
        String[] grades = {"A", "B", "C"};
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < ROWS; i++) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("COIL_THK", new BigDecimal("0.30").add(new BigDecimal(i % 89).movePointLeft(2)));   // 0.30 ~ 1.18
            r.put("COIL_WID", new BigDecimal(1000 + (i * 7) % 400));
            r.put("TOP_RESIN_CD", resins[i % resins.length]);
            r.put("COAT_SIDE", i % 2 == 0 ? "1" : "2");
            r.put("SURF_GRD", grades[i % grades.length]);
            r.put("BASE_FCT", new BigDecimal("1.10"));
            r.put("COIL_LEN", new BigDecimal(100 + i % 50));
            r.put("SPEC_GRAV", new BigDecimal("7.85"));
            r.put("PROD_TYPE", "COIL");
            r.put("CALC_BASIS", "LEN");
            r.put("X", new BigDecimal(i));
            if (i % 4 != 0) {
                r.put("Y", new BigDecimal(i % 10));                                                   // 4행 중 1행은 받는 노드로 간다
            }
            out.add(r);
        }
        return out;
    }

    @Test
    void 천_행_곱하기_세트_N개_evaluateSet_시간() {
        Assumptions.assumeTrue(System.getenv("MDM_BENCH") != null, "MDM_BENCH 가 없으면 측정하지 않는다");
        MdmEvaluator evaluator = MdmEvaluatorFixtures.of(TestExpressionConfig.create());
        List<Map<String, Object>> rows = rows();
        FlowDefinition f = benchFlow();
        System.out.printf(Locale.ROOT, "BENCH env cpus=%d java=%s rows=%d warmup=%d runs=%d%n",
                Runtime.getRuntime().availableProcessors(), System.getProperty("java.version"), ROWS, WARMUP, RUNS);
        for (int n : new int[] {1, 5, 20}) {
            InMemoryDefinitionLookup lookup = SampleRules.lookup().add(calc("R_A", "A", "X + 1", "X"), calc("R_Y", "YY", "Y + 1", "Y"),
                    calc("R_FILL", "G", "0"));
            List<String> setIds = new ArrayList<>();
            for (int s = 0; s < n; s++) {
                String id = "BENCH_" + s;
                setIds.add(id);
                lookup.addSet(new RuleSetDefinition(id, BigDecimal.ONE.setScale(3), null, null, RULE_IDS, SetStatus.INUSE, f));
            }
            MdmRuleEngine engine = new MdmRuleEngine(evaluator, lookup);
            // 정상 판정인지 한 번 확인(예외 경로를 재면 안 된다)
            for (String id : setIds) {
                assertNotNull(engine.evaluateSet(id, rows.get(0), TS));
                assertEquals(1, engine.evaluateSet(id, rows.get(4), TS).caught().size());
            }

            long[] eval = new long[RUNS];
            for (int run = -WARMUP; run < RUNS; run++) {
                long t0 = System.nanoTime();
                for (Map<String, Object> r : rows) {
                    for (String id : setIds) {
                        engine.evaluateSet(id, r, TS);
                    }
                }
                long dt = System.nanoTime() - t0;
                if (run >= 0) {
                    eval[run] = dt;
                }
            }
            report("evaluateSet", n, eval);

            // 정의에만 의존하는 준비 몫 — 같은 호출 수만큼 흐름 파싱 + 입력 키 검사기 생성(룰 정의는 미리 받아 둔다)
            Map<String, RuleDefinition> defs = new LinkedHashMap<>();
            FlowParse parsed0 = FlowParser.parse(f);
            for (String ruleId : parsed0.tree().ruleIds()) {
                defs.put(ruleId, lookup.rule(ruleId, TS).orElseThrow());
            }
            long[] prep = new long[RUNS];
            long sink = 0;
            for (int run = -WARMUP; run < RUNS; run++) {
                long t0 = System.nanoTime();
                for (int i = 0; i < rows.size(); i++) {
                    for (int s = 0; s < n; s++) {
                        FlowParse p = FlowParser.parse(f);
                        FlowKeys keys = new FlowKeys(new LinkedHashMap<>(defs), evaluator);
                        sink += p.tree().ruleIds().size() + keys.deferred("y").size();
                    }
                }
                long dt = System.nanoTime() - t0;
                if (run >= 0) {
                    prep[run] = dt;
                }
            }
            report("prepare(parse+FlowKeys)", n, prep);
            assertNotNull(Long.valueOf(sink));
        }
    }

    private static void report(String what, int n, long[] nanos) {
        long[] sorted = nanos.clone();
        Arrays.sort(sorted);
        double median = sorted[sorted.length / 2] / 1e6;
        double min = sorted[0] / 1e6;
        double max = sorted[sorted.length - 1] / 1e6;
        int calls = ROWS * n;
        StringBuilder all = new StringBuilder();
        for (long v : nanos) {
            all.append(String.format(Locale.ROOT, "%.0f ", v / 1e6));
        }
        System.out.printf(Locale.ROOT, "BENCH %s N=%d calls=%d median=%.1fms min=%.1fms max=%.1fms perCall(median)=%.1fus runs=[%s]%n",
                what, n, calls, median, min, max, median * 1000 / calls, all.toString().trim());
    }
}
