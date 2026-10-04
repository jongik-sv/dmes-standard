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
 * 세트 판정 측정(항목5) — 저장 검증처럼 1,000행 × 세트 N개(N=1·5·20)를 {@code evaluateSet} 으로 부른다. 같은 JVM 안에서 기억 적중(A)·기억
 * 놓침(B)·준비 몫 기준값(C)을 100행 블록마다 번갈아 재어 PC 부하 변화가 세 경로에 똑같이 걸리게 한다. 예열 뒤 여러 번 재어 경로별
 * 중앙값·최소·최대·원값과 회차별 짝 차이(B − A)·load average 를 찍는다. 환경변수 {@code MDM_BENCH} 가 있을 때만 돈다:
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

    /** 한 블록에 담는 행 수 — 세 경로(A·B·C)를 이 단위로 번갈아 재어 PC 부하 변화가 셋에 똑같이 걸리게 한다. */
    private static final int BLOCK = 100;

    /**
     * 기억을 늘 놓치게 하는 조회기(경로 B) — {@code ruleSet()} 이 부를 때마다 값이 같은 새 {@link RuleSetDefinition} 사본을 돌려준다. 엔진은 세트
     * 정의 객체 동일성({@code MdmRuleEngine.cachedPlan} 의 {@code p.set == set})으로 기억을 고르므로 B 는 매번 흐름 파싱과 {@link FlowKeys}
     * 생성을 다시 한다. 룰 조회는 원래 조회기에 그대로 넘겨 A 와 같은 룰 정의 객체를 받는다.
     */
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

    /**
     * 같은 JVM 안에서 세 경로를 {@value #BLOCK} 행 블록마다 번갈아 잰다(블록마다 순서를 돌린다).
     * <ul>
     *   <li>A: 지금 조회기 — 같은 세트 정의 객체가 와서 기억이 적중한다(운영 cactus 처럼 오래 사는 엔진).</li>
     *   <li>B: {@link FreshSetLookup} — 늘 기억을 놓친다. 바꾸기 전 비용에 사본 생성·snapshot 복사·기억 put 이 조금 더 붙는다.</li>
     *   <li>C: 같은 호출 수만큼 흐름 파싱 + {@code new FlowKeys} 만 — 기억으로 아낄 수 있는 몫의 같은 시각 기준값.</li>
     * </ul>
     * A 와 B 는 엔진을 따로 둔다(한 엔진이면 B 가 넣은 준비가 A 의 기억을 덮어쓴다). 회차마다 1분 load average 를 찍는다.
     */
    @Test
    void 천_행_곱하기_세트_N개_기억_적중_대_놓침_번갈아_측정() {
        Assumptions.assumeTrue(System.getenv("MDM_BENCH") != null, "MDM_BENCH 가 없으면 측정하지 않는다");
        MdmEvaluator evaluator = MdmEvaluatorFixtures.of(TestExpressionConfig.create());
        OperatingSystemMXBean os = ManagementFactory.getOperatingSystemMXBean();
        List<Map<String, Object>> rows = rows();
        FlowDefinition f = benchFlow();
        System.out.printf(Locale.ROOT, "BENCH env cpus=%d java=%s rows=%d block=%d warmup=%d runs=%d load=%.2f%n",
                Runtime.getRuntime().availableProcessors(), System.getProperty("java.version"), ROWS, BLOCK, WARMUP, RUNS,
                os.getSystemLoadAverage());
        for (int n : new int[] {1, 5, 20}) {
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
            assertEquals(n, hit.cachedPlans());

            // C 경로 준비 — 룰 정의는 미리 받아 둔다
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
            report("A_hit(evaluateSet)", n, a);
            report("B_miss(evaluateSet)", n, b);
            report("C_prepare(parse+FlowKeys)", n, c);
            reportPaired(n, a, b, c, load);
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

    /** 회차별 (B − A)/호출과 C/호출, B > A 횟수, 회차별 load 를 찍는다. 같은 회차 안의 짝 차이라 부하 변화가 거의 지워진다. */
    private static void reportPaired(int n, long[] a, long[] b, long[] c, double[] load) {
        int calls = ROWS * n;
        double[] diff = new double[a.length];
        double[] base = new double[a.length];
        int bSlower = 0;
        StringBuilder diffs = new StringBuilder();
        StringBuilder bases = new StringBuilder();
        StringBuilder loads = new StringBuilder();
        for (int i = 0; i < a.length; i++) {
            diff[i] = (b[i] - a[i]) / 1e3 / calls;
            base[i] = c[i] / 1e3 / calls;
            if (b[i] > a[i]) {
                bSlower++;
            }
            diffs.append(String.format(Locale.ROOT, "%.1f ", diff[i]));
            bases.append(String.format(Locale.ROOT, "%.1f ", base[i]));
            loads.append(String.format(Locale.ROOT, "%.2f ", load[i]));
        }
        double[] sd = diff.clone();
        Arrays.sort(sd);
        double[] sb = base.clone();
        Arrays.sort(sb);
        System.out.printf(Locale.ROOT,
                "BENCH paired N=%d (B-A)/call median=%.1fus min=%.1fus max=%.1fus B>A=%d/%d C/call median=%.1fus "
                        + "diffs=[%s] C=[%s] load=[%s]%n",
                n, sd[sd.length / 2], sd[0], sd[sd.length - 1], bSlower, a.length, sb[sb.length / 2], diffs.toString().trim(),
                bases.toString().trim(), loads.toString().trim());
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
        System.out.printf(Locale.ROOT,
                "BENCH %s N=%d calls=%d median=%.1fms min=%.1fms max=%.1fms perCall median=%.1fus min=%.1fus max=%.1fus runs(ms)=[%s]%n",
                what, n, calls, median, min, max, median * 1000 / calls, min * 1000 / calls, max * 1000 / calls, all.toString().trim());
    }
}
