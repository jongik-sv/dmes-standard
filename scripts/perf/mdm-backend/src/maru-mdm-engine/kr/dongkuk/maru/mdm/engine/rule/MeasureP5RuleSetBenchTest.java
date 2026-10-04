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

import java.lang.management.ManagementFactory;
import java.lang.management.OperatingSystemMXBean;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.StringJoiner;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.flow.FlowParse;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

/**
 * P5 — evaluateSet 1,000행 × 세트 N개(N=1·5·20) 시간. perf-mdm-backend.md P5. 하네스 전용(scripts/perf/mdm-backend — 측정할 때만 복사한다).
 *
 * <p>dev 의 {@code RuleSetPrepareBenchTest}(87ac5868 판)에서 dev 전용 API({@code MdmRuleEngine.cachedPlans()} 단언)만 뺀 판이다 — 기준
 * (engine 모듈이 262ca6df^ 와 같다)과 변경 양쪽에서 컴파일된다. 쓰는 것은 공개 엔진 API·{@code FlowParser.parse}·패키지 전용
 * {@code new FlowKeys(defs, evaluator)}·{@code deferred} 뿐이고, 둘 다 기준에도 있다.
 *
 * <p>같은 JVM 안에서 100행 블록마다 세 경로를 번갈아 잰다(블록마다 순서를 돌린다).
 * <ul>
 *   <li>A: 오래 사는 엔진에 같은 세트 정의 객체 — 변경 쪽은 기억 적중, 기준 쪽은 기억이 없으니 매번 준비.</li>
 *   <li>B: {@link FreshSetLookup}(부를 때마다 값이 같은 새 세트 정의 사본) — 변경 쪽은 늘 기억 놓침, 기준 쪽은 A 와 같은 일 + 사본 비용.</li>
 *   <li>C: 같은 호출 수만큼 흐름 파싱 + {@code new FlowKeys} 만 — 준비 몫의 같은 시각 기준값.</li>
 * </ul>
 * 해석: 기준 쪽 B − A ≈ 사본 비용(기억 효과 0), 변경 쪽 B − A = 기억 효과 + 사본 비용. 두 값의 차가 기억 효과의 같은 JVM 기준 추정이다.
 * 기준 A 와 변경 A 의 절대값 비교는 JVM·부하가 달라 C 로 보정해 본다.
 * 환경변수 {@code MDM_MEASURE} 가 있을 때만 돈다. {@code MDM_MEASURE_DRY} 면 100행·N=1·예열 0·1회.
 */
class MeasureP5RuleSetBenchTest {

    private static final String P = "P5";
    private static final boolean DRY = System.getenv("MDM_MEASURE_DRY") != null;
    private static final int ROWS = DRY ? 100 : 1_000;
    private static final int WARMUP = DRY ? 0 : 3;
    private static final int RUNS = DRY ? 1 : 9;
    private static final int[] SETS = DRY ? new int[] {1} : new int[] {1, 5, 20};
    private static final int BLOCK = 100;
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

    /** 부를 때마다 값이 같은 새 세트 정의 사본을 돌려주는 조회기(경로 B). 룰 조회는 원래 조회기에 넘긴다. */
    private static final class FreshSetLookup implements DefinitionLookup {
        private final DefinitionLookup inner;

        FreshSetLookup(DefinitionLookup inner) {
            this.inner = inner;
        }

        @Override
        public Optional<ColumnDefinition> column(String table, String column) {
            return inner.column(table, column);
        }

        @Override
        public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
            return inner.rule(ruleId, evalTs);
        }

        @Override
        public Optional<RuleSetDefinition> ruleSet(String setId, Instant evalTs) {
            return inner.ruleSet(setId, evalTs).map(d -> new RuleSetDefinition(d.setId(), d.ver(), d.applyFrom(), d.applyTo(),
                    d.ruleIds(), d.status(), d.flow()));
        }
    }

    @Test
    void 천_행_곱하기_세트_N개_A_B_C_번갈아_측정() {
        Assumptions.assumeTrue(System.getenv("MDM_MEASURE") != null, "MDM_MEASURE 가 없으면 측정하지 않는다");
        MdmEvaluator evaluator = MdmEvaluatorFixtures.of(TestExpressionConfig.create());
        OperatingSystemMXBean os = ManagementFactory.getOperatingSystemMXBean();
        List<Map<String, Object>> rows = rows();
        FlowDefinition f = benchFlow();
        emit("env", "java", System.getProperty("java.version"), "cpus", Runtime.getRuntime().availableProcessors(), "rows", ROWS,
                "block", BLOCK, "warmup", WARMUP, "runs", RUNS, "dry", DRY, "load1", fmt(os.getSystemLoadAverage()));
        for (int n : SETS) {
            InMemoryDefinitionLookup lookup = SampleRules.lookup().add(calc("R_A", "A", "X + 1", "X"), calc("R_Y", "YY", "Y + 1", "Y"),
                    calc("R_FILL", "G", "0"));
            List<String> setIds = new ArrayList<>();
            for (int s = 0; s < n; s++) {
                String id = "BENCH_" + s;
                setIds.add(id);
                lookup.addSet(new RuleSetDefinition(id, BigDecimal.ONE.setScale(3), null, null, RULE_IDS, SetStatus.INUSE, f));
            }
            MdmRuleEngine hit = new MdmRuleEngine(evaluator, lookup);
            MdmRuleEngine miss = new MdmRuleEngine(evaluator, new FreshSetLookup(lookup));
            // 두 경로 모두 정상 판정이고(예외 경로를 재면 안 된다) 결과가 같은지 확인한다
            for (String id : setIds) {
                for (int i = 0; i < 8; i++) {
                    RuleSetResult a = hit.evaluateSet(id, rows.get(i), TS);
                    RuleSetResult b = miss.evaluateSet(id, rows.get(i), TS);
                    assertNotNull(a);
                    assertEquals(a, b);
                    assertEquals(i % 4 == 0 ? 1 : 0, a.caught().size());
                }
            }

            Map<String, RuleDefinition> defs = new LinkedHashMap<>();
            for (String ruleId : FlowParser.parse(f).tree().ruleIds()) {
                defs.put(ruleId, lookup.rule(ruleId, TS).orElseThrow());
            }

            long[] a = new long[RUNS];
            long[] b = new long[RUNS];
            long[] c = new long[RUNS];
            double[] load = new double[RUNS];
            long sink = 0;
            int turn = 0;
            for (int run = -WARMUP; run < RUNS; run++) {
                long ta = 0;
                long tb = 0;
                long tc = 0;
                for (int from = 0; from < rows.size(); from += BLOCK) {
                    List<Map<String, Object>> block = rows.subList(from, Math.min(rows.size(), from + BLOCK));
                    for (int k = 0; k < 3; k++) {
                        int which = (turn + k) % 3;
                        long t0 = System.nanoTime();
                        if (which == 0) {
                            sink += timeSets(hit, block, setIds);
                            ta += System.nanoTime() - t0;
                        } else if (which == 1) {
                            sink += timeSets(miss, block, setIds);
                            tb += System.nanoTime() - t0;
                        } else {
                            for (int i = 0; i < block.size() * n; i++) {
                                FlowParse p = FlowParser.parse(f);
                                FlowKeys keys = new FlowKeys(new LinkedHashMap<>(defs), evaluator);
                                sink += p.tree().ruleIds().size() + keys.deferred("y").size();
                            }
                            tc += System.nanoTime() - t0;
                        }
                    }
                    turn++;
                }
                if (run >= 0) {
                    a[run] = ta;
                    b[run] = tb;
                    c[run] = tc;
                    load[run] = os.getSystemLoadAverage();
                }
            }
            report(n, a, b, c, load);
            assertNotNull(Long.valueOf(sink));
        }
    }

    private static long timeSets(MdmRuleEngine engine, List<Map<String, Object>> block, List<String> setIds) {
        long sink = 0;
        for (Map<String, Object> r : block) {
            for (String id : setIds) {
                sink += engine.evaluateSet(id, r, TS).steps().size();
            }
        }
        return sink;
    }

    /** 경로별 µs/호출 중앙값·최소·최대, 회차별 짝 차이 (B − A)/호출 중앙값, B > A 횟수, 원값(ms)·load. */
    private static void report(int n, long[] a, long[] b, long[] c, double[] load) {
        int calls = ROWS * n;
        double[] diff = new double[a.length];
        int bSlower = 0;
        for (int i = 0; i < a.length; i++) {
            diff[i] = (b[i] - a[i]) / 1e3 / calls;
            if (b[i] > a[i]) {
                bSlower++;
            }
        }
        double[] sd = diff.clone();
        Arrays.sort(sd);
        emit("N" + n, "calls", calls, "A_us_median", perCall(a, calls, 0), "A_us_min", perCall(a, calls, -1), "A_us_max",
                perCall(a, calls, 1), "B_us_median", perCall(b, calls, 0), "B_us_min", perCall(b, calls, -1), "B_us_max",
                perCall(b, calls, 1), "C_us_median", perCall(c, calls, 0), "C_us_min", perCall(c, calls, -1), "C_us_max",
                perCall(c, calls, 1), "BminusA_us_median", fmt(sd[sd.length / 2]), "BminusA_us_min", fmt(sd[0]), "BminusA_us_max",
                fmt(sd[sd.length - 1]), "BgtA", bSlower + "/" + a.length);
        emit("N" + n + "-raw", "A_ms", list(a, 1e6), "B_ms", list(b, 1e6), "C_ms", list(c, 1e6), "BminusA_us", list(diff),
                "load1", list(load));
    }

    private static String perCall(long[] nanos, int calls, int which) {
        long[] s = nanos.clone();
        Arrays.sort(s);
        long v = which < 0 ? s[0] : which > 0 ? s[s.length - 1] : s[s.length / 2];
        return fmt(v / 1e3 / calls);
    }

    private static String list(long[] v, double div) {
        StringJoiner j = new StringJoiner(",");
        for (long x : v) {
            j.add(String.format(Locale.ROOT, "%.0f", x / div));
        }
        return j.toString();
    }

    private static String list(double[] v) {
        StringJoiner j = new StringJoiner(",");
        for (double x : v) {
            j.add(fmt(x));
        }
        return j.toString();
    }

    private static String fmt(double v) {
        return String.format(Locale.ROOT, "%.2f", v);
    }

    private static void emit(String scenario, Object... kv) {
        StringBuilder sb = new StringBuilder("MEASURE ").append(P).append(' ').append(scenario);
        for (int i = 0; i + 1 < kv.length; i += 2) {
            sb.append(' ').append(kv[i]).append('=').append(String.valueOf(kv[i + 1]).replace(' ', '_'));
        }
        System.out.println(sb);
    }
}
