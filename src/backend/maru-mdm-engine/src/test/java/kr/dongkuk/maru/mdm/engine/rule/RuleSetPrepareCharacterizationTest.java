package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
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
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Test;

/**
 * 세트 판정 준비(prepare — 흐름 파싱·입력 키 검사기)의 특성 테스트. 같은 엔진으로 세트를 여러 레코드·여러 판정 시각에 반복해 불러도 결과가
 * 매번 새 엔진으로 새로 계산한 결과와 같아야 하고, 정의(세트 버전·같은 ID 의 다른 정의·룰 버전)가 바뀌면 새 결과가 나와야 한다. 파싱에 실패하는
 * 정의는 매번 같은 예외를 내고, 가상 스레드 여럿이 같은 엔진을 동시에 불러도 결과가 같다. 준비 결과를 엔진 안에 기억하게 바꿀 때(항목5) 동작이
 * 바뀌지 않았는지 이 시험이 지킨다.
 */
class RuleSetPrepareCharacterizationTest {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final LocalDateTime FOREVER = LocalDateTime.of(9999, 12, 31, 0, 0);
    /** 룰 R_A·세트 S 의 두 번째 버전이 시작하는 시각(KST). */
    private static final LocalDateTime T2 = LocalDateTime.of(2026, 10, 1, 0, 0);
    private static final LocalDateTime T3 = LocalDateTime.of(2026, 10, 2, 0, 0);
    /** 판정 시각 — 앞 둘은 R_A v1·S v1, 셋째는 R_A v2·S v1, 넷째는 R_A v2·S v2. 소수 초는 엔진이 초로 자른다. */
    private static final List<Instant> TS = List.of(
            at(LocalDateTime.of(2026, 9, 20, 9, 0)), at(LocalDateTime.of(2026, 9, 20, 9, 0)).plusMillis(700),
            at(LocalDateTime.of(2026, 10, 1, 12, 0)), at(LocalDateTime.of(2026, 10, 3, 8, 30)));

    private final MdmEvaluator evaluator = MdmEvaluatorFixtures.of(TestExpressionConfig.create());

    private static Instant at(LocalDateTime kst) {
        return kst.atZone(KST).toInstant();
    }

    // ------------------------------------------------------------------ 정의

    /** 적용 구간·버전만 바꾼 룰 사본. */
    private static RuleDefinition window(RuleDefinition d, int ver, LocalDateTime from, LocalDateTime to) {
        return new RuleDefinition(d.ruleId(), BigDecimal.valueOf(ver).setScale(3), d.ruleKind(), d.hitPolicy(), from, to,
                d.engineVersion(), d.vars(), d.contract(), d.rows());
    }

    private static RuleSetDefinition set(String id, int ver, LocalDateTime from, LocalDateTime to, SetStatus status, FlowDefinition f) {
        return new RuleSetDefinition(id, BigDecimal.valueOf(ver).setScale(3), from, to, List.of("R_A", "R_B", "R_D", "R_C", "R_K", "R_Y", "R_FILL"),
                status, f);
    }

    /**
     * start → if1 [b1 cond → a(R_A)] [그 외 → b(R_B)] → m1 → d(R_D: A 를 읽는다 — IF 일부 갈래에서만 만들어져 지연 검사) → p1 [c(R_C)] [k(R_K)] → pm
     * → y(R_Y: Y 를 읽는다, INPUT_ERROR 를 받는다 → h(R_FILL)) → my → end.
     */
    static FlowDefinition richFlow(String cond) {
        return flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), merge("m1", "if1"), rule("d", "R_D"), par("p1"),
                        rule("c", "R_C"), rule("k", "R_K"), merge("pm", "p1"), rule("y", "R_Y"), catchNode("cy", "y", "INPUT_ERROR"),
                        rule("h", "R_FILL"), guardMerge("my", "y"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, cond), other("bo", "if1", "b"), e("ea", "a", "m1"),
                        e("eb", "b", "m1"), e("em", "m1", "d"), e("ed", "d", "p1"), pe("p1a", "p1", "c", 1), pe("p1b", "p1", "k", 2),
                        e("ec", "c", "pm"), e("ek", "k", "pm"), e("ep", "pm", "y"), e("ey", "y", "my"), e("ecy", "cy", "h"),
                        e("eh", "h", "my"), e("emy", "my", "end")));
    }

    /** start → a(R_A) 만 있고 end 로 가는 선이 없다 — 구조 검사 실패(FLOW_INVALID). */
    static FlowDefinition brokenFlow() {
        return flow(List.of(start(), rule("a", "R_A"), end()), List.of(e("e0", "start", "a")));
    }

    /** R_A 는 T2 에 v2(X + 100)로 바뀐다. 나머지 룰은 한 버전이다. */
    private static VersionedLookup lookup() {
        VersionedLookup l = new VersionedLookup();
        l.putRule(window(calc("R_A", "A", "X + 1", "X"), 1, FlowRules.FROM, T2), window(calc("R_A", "A", "X + 100", "X"), 2, T2, FOREVER));
        l.putRule(calc("R_B", "B", "X + 2", "X"));
        l.putRule(calc("R_D", "D", "A * 2", "A"));
        l.putRule(calc("R_C", "C", "X + 3", "X"));
        l.putRule(calc("R_K", "K", "7"));
        l.putRule(calc("R_Y", "YY", "Y + 1", "Y"));
        l.putRule(calc("R_FILL", "G", "0"));
        l.putSet(set("S", 1, FlowRules.FROM, T3, SetStatus.INUSE, richFlow("X > 10")),
                set("S", 2, T3, FOREVER, SetStatus.INUSE, richFlow("X > 50")));
        l.putSet(set("S2", 1, FlowRules.FROM, FOREVER, SetStatus.INUSE, richFlow("X > 0")));
        return l;
    }

    /** 키 집합이 서로 다른 레코드 — A·Y 유무, X 크기로 갈래·지연 검사·받는 노드가 갈린다. */
    private static List<Map<String, Object>> records() {
        List<Map<String, Object>> out = new ArrayList<>();
        out.add(rec("X", new BigDecimal("20"), "Y", new BigDecimal("1")));          // IF 참 갈래, Y 있음
        out.add(rec("X", new BigDecimal("5"), "Y", new BigDecimal("1")));           // 그 외 갈래 → R_D 의 A 가 없다(MISSING_KEY)
        out.add(rec("X", new BigDecimal("5"), "A", new BigDecimal("3")));           // 그 외 갈래지만 레코드에 A, Y 없음 → 받는 노드
        out.add(rec("X", new BigDecimal("60")));                                     // 참 갈래, Y 없음 → 받는 노드
        out.add(rec("X", new BigDecimal("20"), "A", new BigDecimal("9"), "Y", new BigDecimal("2"))); // A 를 룰이 덮어쓴다
        out.add(rec("Y", new BigDecimal("1")));                                      // X 없음 → 사전 검사 MISSING_KEY
        out.add(rec("X", "abc", "Y", new BigDecimal("1")));                          // X 타입 변환 실패
        out.add(rec("X", new BigDecimal("55"), "Y", "zz"));                          // Y 타입 변환 실패 → INPUT_ERROR 받기
        return out;
    }

    // ------------------------------------------------------------------ 결과 비교

    /** 판정 한 번의 결과 — 정상 결과 또는 던진 예외(종류·위반·문구). 레코드 equals 로 비교한다. */
    record Outcome(RuleSetResult result, String error, List<Violation> violations, String message) {

        static Outcome of(MdmRuleEngine engine, String setId, Map<String, Object> record, Instant ts) {
            try {
                return new Outcome(engine.evaluateSet(setId, record, ts), null, null, null);
            } catch (EngineEvaluationException e) {
                return new Outcome(null, e.getClass().getName(), e.violations(), e.getMessage());
            } catch (RuntimeException e) {
                return new Outcome(null, e.getClass().getName(), null, e.getMessage());
            }
        }

        boolean failed() {
            return result == null;
        }
    }

    private MdmRuleEngine engine(DefinitionLookup l) {
        return new MdmRuleEngine(evaluator, l);
    }

    /** 매번 새 엔진으로 새로 계산한 결과. */
    private Outcome fresh(DefinitionLookup l, String setId, Map<String, Object> record, Instant ts) {
        return Outcome.of(engine(l), setId, record, ts);
    }

    // ------------------------------------------------------------------ 반복 호출

    @Test
    void 같은_엔진으로_여러_레코드와_판정_시각을_반복해도_매번_새로_계산한_결과와_같다() {
        VersionedLookup l = lookup();
        MdmRuleEngine shared = engine(l);
        int ok = 0;
        int failed = 0;
        // 레코드·시각을 섞어 세 바퀴 — 앞 호출이 남긴 준비 상태가 다음 호출에 새면 여기서 드러난다.
        for (int round = 0; round < 3; round++) {
            for (Instant ts : TS) {
                List<Map<String, Object>> rs = records();
                if (round == 1) {
                    Collections.reverse(rs);
                }
                for (Map<String, Object> r : rs) {
                    for (String setId : List.of("S", "S2")) {
                        Outcome expected = fresh(l, setId, r, ts);
                        Outcome actual = Outcome.of(shared, setId, r, ts);
                        assertEquals(expected, actual, setId + " " + r + " @ " + ts);
                        if (actual.failed()) {
                            failed++;
                        } else {
                            ok++;
                        }
                    }
                }
            }
        }
        // 정상·실패 경로를 모두 지났는지(시험 자체의 확인)
        assertTrue(ok > 0 && failed > 0, "ok=" + ok + " failed=" + failed);
    }

    @Test
    void 지연_검사와_받는_노드_결과가_레코드마다_따로_정해진다() {
        VersionedLookup l = lookup();
        MdmRuleEngine shared = engine(l);
        Instant ts = TS.get(0);
        // 그 외 갈래에서 A 가 없으면 R_D 직전 MISSING_KEY
        Outcome missing = Outcome.of(shared, "S", rec("X", new BigDecimal("5"), "Y", new BigDecimal("1")), ts);
        assertEquals(List.of(Code.MISSING_KEY), missing.violations().stream().map(Violation::code).toList());
        assertEquals("A", missing.violations().get(0).name());
        // 바로 뒤 같은 갈래라도 레코드에 A 가 있으면 통과하고, Y 가 없으니 받는 노드가 G=0 을 채운다
        Outcome withA = Outcome.of(shared, "S", rec("X", new BigDecimal("5"), "A", new BigDecimal("3")), ts);
        assertNull(withA.error());
        assertNum("6", withA.result().finalValues().get("D"));
        assertEquals(1, withA.result().caught().size());
        assertNotNull(withA.result().finalValues().get("G"));
        // 다시 A 없는 레코드 — 앞 호출의 상태와 무관하게 같은 위반
        assertEquals(missing, Outcome.of(shared, "S", rec("X", new BigDecimal("5"), "Y", new BigDecimal("1")), ts));
    }

    // ------------------------------------------------------------------ 정의 변경

    @Test
    void 세트의_새_버전은_판정_시각으로_골라지고_새_결과가_나온다() {
        VersionedLookup l = lookup();
        MdmRuleEngine shared = engine(l);
        Map<String, Object> r = rec("X", new BigDecimal("30"), "Y", new BigDecimal("1"));
        Outcome v1 = Outcome.of(shared, "S", r, TS.get(2));   // S v1(X > 10) → 참 갈래 R_A v2
        Outcome v2 = Outcome.of(shared, "S", r, TS.get(3));   // S v2(X > 50) → 그 외 갈래 → A 없음
        assertEquals(fresh(l, "S", r, TS.get(2)), v1);
        assertEquals(fresh(l, "S", r, TS.get(3)), v2);
        assertNotEquals(v1, v2);
        assertNull(v1.error());
        assertEquals(List.of(Code.MISSING_KEY), v2.violations().stream().map(Violation::code).toList());
        // 다시 앞 시각 — v1 결과 그대로
        assertEquals(v1, Outcome.of(shared, "S", r, TS.get(2)));
    }

    @Test
    void 같은_세트_ID_와_버전의_정의가_다른_객체로_바뀌면_새_결과가_나온다() {
        VersionedLookup l = lookup();
        MdmRuleEngine shared = engine(l);
        Map<String, Object> r = rec("X", new BigDecimal("30"), "Y", new BigDecimal("1"));
        Instant ts = TS.get(0);
        Outcome before = Outcome.of(shared, "S", r, ts);
        assertNull(before.error());
        // 재등록·RELOAD — 같은 ID·같은 버전 번호·같은 적용 구간인데 흐름이 다르다(조건 X > 100 → 그 외 갈래)
        l.putSet(set("S", 1, FlowRules.FROM, T3, SetStatus.INUSE, richFlow("X > 100")),
                set("S", 2, T3, FOREVER, SetStatus.INUSE, richFlow("X > 50")));
        Outcome after = Outcome.of(shared, "S", r, ts);
        assertEquals(fresh(l, "S", r, ts), after);
        assertNotEquals(before, after);
        // 값이 같은 새 객체로 다시 바꾸면 처음 결과로 돌아온다
        l.putSet(set("S", 1, FlowRules.FROM, T3, SetStatus.INUSE, richFlow("X > 10")),
                set("S", 2, T3, FOREVER, SetStatus.INUSE, richFlow("X > 50")));
        assertEquals(before, Outcome.of(shared, "S", r, ts));
    }

    @Test
    void 같은_세트_버전이_폐기_상태로_바뀌면_판정하지_않는다() {
        VersionedLookup l = lookup();
        MdmRuleEngine shared = engine(l);
        Map<String, Object> r = rec("X", new BigDecimal("30"), "Y", new BigDecimal("1"));
        Instant ts = TS.get(0);
        assertNull(Outcome.of(shared, "S", r, ts).error());
        // 부모 상태로 계산되는 상태만 바뀐다(흐름·버전 그대로)
        l.putSet(set("S", 1, FlowRules.FROM, T3, SetStatus.DEPRECATED, richFlow("X > 10")),
                set("S", 2, T3, FOREVER, SetStatus.DEPRECATED, richFlow("X > 50")));
        Outcome deprecated = Outcome.of(shared, "S", r, ts);
        assertEquals(List.of(Code.SET_DEPRECATED), deprecated.violations().stream().map(Violation::code).toList());
        assertEquals(fresh(l, "S", r, ts), deprecated);
    }

    @Test
    void 세트는_그대로이고_룰_버전이나_룰_정의가_바뀌어도_새_결과가_나온다() {
        VersionedLookup l = lookup();
        MdmRuleEngine shared = engine(l);
        Map<String, Object> r = rec("X", new BigDecimal("30"), "Y", new BigDecimal("1"));
        // 같은 세트 v1, R_A 만 v1(X + 1) → v2(X + 100)
        Outcome ruleV1 = Outcome.of(shared, "S", r, TS.get(0));
        Outcome ruleV2 = Outcome.of(shared, "S", r, TS.get(2));
        assertNum("31", ruleV1.result().finalValues().get("A"));
        assertNum("130", ruleV2.result().finalValues().get("A"));
        // 같은 룰 ID·버전의 정의가 바뀐다(재등록) — 결과 이름도 계약도 다르다
        l.putRule(window(calc("R_A", "A", "X * 3", "X"), 1, FlowRules.FROM, T2), window(calc("R_A", "A", "X + 100", "X"), 2, T2, FOREVER));
        Outcome reloaded = Outcome.of(shared, "S", r, TS.get(0));
        assertNum("90", reloaded.result().finalValues().get("A"));
        assertEquals(fresh(l, "S", r, TS.get(0)), reloaded);
        // 룰 계약이 바뀌어 새 입력 키가 필요해지면 사전 검사도 새로 한다
        l.putRule(window(calc("R_A", "A", "X + W", "X", "W"), 1, FlowRules.FROM, T2), window(calc("R_A", "A", "X + 100", "X"), 2, T2, FOREVER));
        Outcome needsW = Outcome.of(shared, "S", r, TS.get(0));
        assertEquals(fresh(l, "S", r, TS.get(0)), needsW);
        assertEquals(List.of("W"), needsW.violations().stream().map(Violation::name).toList());
    }

    // ------------------------------------------------------------------ 실패하는 정의

    @Test
    void 흐름_파싱에_실패하는_정의는_매번_같은_예외를_낸다() {
        VersionedLookup l = lookup();
        l.putSet(set("BROKEN", 1, FlowRules.FROM, FOREVER, SetStatus.INUSE, brokenFlow()));
        MdmRuleEngine shared = engine(l);
        Outcome first = Outcome.of(shared, "BROKEN", rec("X", BigDecimal.ONE), TS.get(0));
        assertEquals(EngineEvaluationException.class.getName(), first.error());
        assertTrue(first.violations().stream().allMatch(v -> v.code() == Code.FLOW_INVALID), first.violations().toString());
        for (Map<String, Object> r : records()) {
            for (Instant ts : TS) {
                Outcome again = Outcome.of(shared, "BROKEN", r, ts);
                assertEquals(first.violations(), again.violations(), r + " @ " + ts);
                assertEquals(fresh(l, "BROKEN", r, ts), again);
            }
        }
        // 정의를 고치면 바로 판정한다
        l.putSet(set("BROKEN", 1, FlowRules.FROM, FOREVER, SetStatus.INUSE, richFlow("X > 0")));
        Outcome fixed = Outcome.of(shared, "BROKEN", rec("X", BigDecimal.ONE, "Y", BigDecimal.ONE), TS.get(0));
        assertNull(fixed.error());
        assertEquals(fresh(l, "BROKEN", rec("X", BigDecimal.ONE, "Y", BigDecimal.ONE), TS.get(0)), fixed);
    }

    @Test
    void 없는_룰은_매번_RULE_NOT_FOUND_이고_룰이_생기면_판정한다() {
        VersionedLookup l = lookup();
        l.removeRule("R_K");
        MdmRuleEngine shared = engine(l);
        Map<String, Object> r = rec("X", new BigDecimal("30"), "Y", new BigDecimal("1"));
        Outcome first = Outcome.of(shared, "S", r, TS.get(0));
        assertEquals(List.of(Code.RULE_NOT_FOUND), first.violations().stream().map(Violation::code).toList());
        assertEquals(first, Outcome.of(shared, "S", r, TS.get(0)));
        assertEquals(first, Outcome.of(shared, "S", r, TS.get(1)));
        l.putRule(calc("R_K", "K", "7"));
        Outcome found = Outcome.of(shared, "S", r, TS.get(0));
        assertNull(found.error());
        assertEquals(fresh(l, "S", r, TS.get(0)), found);
    }

    // ------------------------------------------------------------------ 동시 호출

    @Test
    void 가상_스레드_여럿이_같은_엔진을_동시에_불러도_결과가_같다() throws Exception {
        VersionedLookup l = lookup();
        l.putSet(set("BROKEN", 1, FlowRules.FROM, FOREVER, SetStatus.INUSE, brokenFlow()));
        record Case(String setId, Map<String, Object> record, Instant ts) {}
        List<Case> cases = new ArrayList<>();
        for (Instant ts : TS) {
            for (Map<String, Object> r : records()) {
                for (String setId : List.of("S", "S2", "BROKEN")) {
                    cases.add(new Case(setId, Collections.unmodifiableMap(r), ts));
                }
            }
        }
        List<Outcome> expected = new ArrayList<>();
        for (Case c : cases) {
            expected.add(fresh(l, c.setId(), c.record(), c.ts()));
        }
        // 차가운 엔진 — 첫 호출들이 동시에 들어온다
        MdmRuleEngine shared = engine(l);
        int threads = 32;
        CountDownLatch gate = new CountDownLatch(1);
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<List<String>>> futures = new ArrayList<>();
            for (int t = 0; t < threads; t++) {
                long seed = t;
                futures.add(pool.submit(() -> {
                    gate.await();
                    List<Integer> order = new ArrayList<>();
                    for (int i = 0; i < cases.size(); i++) {
                        order.add(i);
                    }
                    Collections.shuffle(order, new Random(seed));
                    List<String> mismatches = new ArrayList<>();
                    for (int i : order) {
                        Case c = cases.get(i);
                        Outcome actual = Outcome.of(shared, c.setId(), c.record(), c.ts());
                        if (!expected.get(i).equals(actual)) {
                            mismatches.add(c + " → " + actual);
                        }
                    }
                    return mismatches;
                }));
            }
            gate.countDown();
            List<String> all = new ArrayList<>();
            for (Future<List<String>> f : futures) {
                all.addAll(f.get());
            }
            assertEquals(List.of(), all);
        }
    }

    // ------------------------------------------------------------------ 시험용 조회기

    /**
     * 스레드 안전한 버전 조회기 — 룰·세트마다 버전 목록을 두고 {@code applyFrom <= t < applyTo}(KST) 인 것 가운데 버전이 가장 큰 것을 고른다
     * (운영 조회기의 고르기 규칙과 같다). {@code put*} 는 그 ID 의 목록을 통째로 새 객체로 바꾼다(재등록·RELOAD 흉내).
     */
    static final class VersionedLookup implements DefinitionLookup {

        private final Map<String, List<RuleDefinition>> rules = new ConcurrentHashMap<>();
        private final Map<String, List<RuleSetDefinition>> sets = new ConcurrentHashMap<>();

        void putRule(RuleDefinition... versions) {
            rules.put(versions[0].ruleId(), List.of(versions));
        }

        void removeRule(String ruleId) {
            rules.remove(ruleId);
        }

        void putSet(RuleSetDefinition... versions) {
            sets.put(versions[0].setId(), List.of(versions));
        }

        @Override
        public Optional<ColumnDefinition> column(String table, String column) {
            return Optional.empty();
        }

        @Override
        public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
            LocalDateTime t = LocalDateTime.ofInstant(evalTs, KST);
            return rules.getOrDefault(ruleId, List.of()).stream()
                    .filter(d -> !t.isBefore(d.applyFrom()) && t.isBefore(d.applyTo()))
                    .max(Comparator.comparing(RuleDefinition::ver));
        }

        @Override
        public Optional<RuleSetDefinition> ruleSet(String setId, Instant evalTs) {
            LocalDateTime t = LocalDateTime.ofInstant(evalTs, KST);
            return sets.getOrDefault(setId, List.of()).stream()
                    .filter(d -> !t.isBefore(d.applyFrom()) && t.isBefore(d.applyTo()))
                    .max(Comparator.comparing(RuleSetDefinition::ver));
        }
    }
}
