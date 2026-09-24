package kr.dongkuk.maru.mdm.engine.expr;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ezylang.evalex.data.EvaluationValue;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups.RecordingMasterLookup;
import kr.dongkuk.maru.mdm.engine.testsupport.PortFixtures;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * TSK-03-02 design.md §3.1·§6.3 — 컴파일 캐시(텍스트당 하나) + {@code copy()} 평가 + {@code EVAL_TS} 주입 + 타임아웃(06:449).
 * 수용 기준 2: 동시 평가 1,000 스레드에서 결과가 단일 스레드와 같다.
 */
class MdmEvaluatorTest {

    private static final Instant TS = Instant.parse("2026-09-06T00:00:00Z");

    private static MdmEvaluator plain() {
        return new MdmEvaluator(InMemoryLookups.create().build());
    }

    private static Map<String, Object> vars(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    @Test
    void 같은_텍스트는_한_번만_컴파일한다() {
        MdmEvaluator e = plain();
        for (int i = 0; i < 3; i++) {
            e.evaluate("A + 1", vars("A", BigDecimal.ONE), TS);
        }
        assertEquals(1, e.cacheSize());
        e.evaluate("A + 2", vars("A", BigDecimal.ONE), TS);
        assertEquals(2, e.cacheSize());
    }

    @Test
    void 평가_뒤_캐시_원본에는_값이_남지_않는다() {
        MdmEvaluator e = plain();
        EvaluationValue r = e.evaluate("A + 1", vars("A", new BigDecimal("5")), TS);
        assertAll(
                () -> assertEquals(0, new BigDecimal("6").compareTo(r.getNumberValue())),
                () -> assertNull(e.cachedOriginal("A + 1").getDataAccessor().getData("A")),
                () -> assertNull(e.cachedOriginal("A + 1").getDataAccessor().getData(ReservedNames.EVAL_TS)));
    }

    @Test
    void 동시_평가_1000_스레드_결과가_단일_스레드와_같다() {
        assertTimeoutPreemptively(Duration.ofSeconds(60), () -> {
            MdmEvaluator e = new MdmEvaluator(InMemoryLookups.create().build(), Duration.ofSeconds(30));
            String numberText = "value * 3 + OFFSET";
            String stringText = "IF(value % 2 == 0, \"E\" + value, \"O\")";
            int n = 1000;
            BigDecimal[] expectedNumbers = new BigDecimal[n];
            String[] expectedStrings = new String[n];
            for (int i = 0; i < n; i++) {
                expectedNumbers[i] = e.evaluate(numberText, input(i), TS).getNumberValue();
                expectedStrings[i] = e.evaluate(stringText, input(i), TS).getStringValue();
            }

            BigDecimal[] numbers = new BigDecimal[n];
            String[] strings = new String[n];
            Queue<Throwable> errors = new ConcurrentLinkedQueue<>();
            CountDownLatch start = new CountDownLatch(1);
            CountDownLatch done = new CountDownLatch(n);
            List<Thread> threads = new ArrayList<>(n);
            for (int i = 0; i < n; i++) {
                int k = i;
                threads.add(Thread.ofPlatform().start(() -> {
                    try {
                        start.await();
                        numbers[k] = e.evaluate(numberText, input(k), TS).getNumberValue();
                        strings[k] = e.evaluate(stringText, input(k), TS).getStringValue();
                    } catch (Throwable t) {
                        errors.add(t);
                    } finally {
                        done.countDown();
                    }
                }));
            }
            start.countDown();
            assertTrue(done.await(60, TimeUnit.SECONDS), "1,000 스레드가 60 초 안에 끝나지 않았다");
            assertEquals(List.of(), List.copyOf(errors));
            for (int i = 0; i < n; i++) {
                int k = i;
                assertAll("i=" + k,
                        () -> assertEquals(0, expectedNumbers[k].compareTo(numbers[k]), "숫자 " + numbers[k]),
                        () -> assertEquals(expectedStrings[k], strings[k]));
            }
        });
    }

    private static Map<String, Object> input(int i) {
        return vars("value", BigDecimal.valueOf(i), "OFFSET", BigDecimal.valueOf(i % 7));
    }

    @Test
    void EVAL_TS_는_초_미만을_자르고_KST_로_MASTER_에_간다() {
        RecordingMasterLookup masters = new RecordingMasterLookup(PortFixtures.resolver(PortFixtures.port()));
        MdmEvaluator e = new MdmEvaluator(InMemoryLookups.create().masters(masters).build());
        e.evaluate("MASTER(\"PORT\", \"BASE\", \"KRPUS\")", Map.of(), Instant.parse("2026-09-05T15:00:00.900Z"));
        assertEquals(List.of(LocalDateTime.parse("2026-09-06T00:00:00")), masters.baseDts());
    }

    @Test
    void 타임아웃을_넘으면_평가_오류이고_작업을_끊는다() {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch interrupted = new CountDownLatch(1);
        MdmEvaluator e = slowEvaluator(entered, release, interrupted);
        assertTimeoutPreemptively(Duration.ofSeconds(5), () -> {
            ExpressionFailure f = assertThrows(ExpressionFailure.class, () -> e.evaluate("SLOW()", Map.of(), TS));
            assertAll(
                    () -> assertEquals(ExpressionFailure.TIMEOUT, f.reason()),
                    () -> assertEquals(Code.EVALUATION_ERROR, f.code()),
                    () -> assertTrue(entered.await(1, TimeUnit.SECONDS), "본문이 불리지 않았다"),
                    () -> assertTrue(interrupted.await(5, TimeUnit.SECONDS), "평가 작업이 인터럽트되지 않았다"));
        });
    }

    @Test
    void 타임아웃_안이면_값을_돌려준다() {
        MdmEvaluator e = slowEvaluator(new CountDownLatch(1), new CountDownLatch(1), new CountDownLatch(1));
        assertEquals(0, new BigDecimal("3").compareTo(e.evaluate("1 + 2", Map.of(), TS).getNumberValue()));
    }

    /** 0인자 비즈니스 함수 {@code SLOW()} — 아무도 내리지 않는 래치를 최대 10 초 기다린다. 평가기 타임아웃 50 ms. */
    private static MdmEvaluator slowEvaluator(CountDownLatch entered, CountDownLatch release, CountDownLatch interrupted) {
        return new MdmEvaluator(InMemoryLookups.create().function(InMemoryLookups.fn("SLOW", args -> {
            entered.countDown();
            try {
                release.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException ex) {
                interrupted.countDown();
                Thread.currentThread().interrupt();
            }
            return Boolean.TRUE;
        })).build(), Duration.ofMillis(50));
    }

    @Test
    void 상수_이름_값은_CONSTANT_KEY_다() {
        ExpressionFailure f = assertThrows(ExpressionFailure.class,
                () -> plain().evaluate("x", vars("null", 1, "x", 1), TS));
        assertAll(
                () -> assertEquals(Code.CONSTANT_KEY, f.code()),
                () -> assertEquals(ExpressionFailure.CONSTANT_KEY, f.reason()),
                () -> assertEquals("null", f.name()));
    }

    @Test
    void 평가_중_런타임_예외는_EVALUATION_ERROR_로_감싼다() {
        Map<String, Object> x = new HashMap<>();
        x.put("X", null);
        ExpressionFailure f = assertThrows(ExpressionFailure.class, () -> plain().evaluate("NOT(X)", x, TS));
        assertAll(
                () -> assertEquals(Code.EVALUATION_ERROR, f.code()),
                () -> assertEquals(ExpressionFailure.EVALUATION, f.reason()));
    }

    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource({
            "NULL, CONSTANT_KEY",
            "pi, CONSTANT_KEY",
            "EVAL_TS, EVAL_TS_KEY",
            "eval_ts, EVAL_TS_KEY",
            "_V1, RESERVED_KEY",
            "_x, RESERVED_KEY"})
    void 레코드_예약_키(String key, Code expected) {
        List<Violation> v = RecordKeys.violations(vars(key, 1, "COIL_THK", 1));
        assertAll(
                () -> assertEquals(1, v.size(), v.toString()),
                () -> assertEquals(expected, v.get(0).code()),
                () -> assertEquals(key, v.get(0).name()),
                () -> assertEquals(Stage.INPUT_CHECK, v.get(0).stage()));
    }

    @Test
    void 레코드_예약_키_위반은_한_번에_모두_모은다() {
        List<Violation> v = RecordKeys.violations(vars("_x", 1, "OK", 1, "NULL", 1, "EVAL_TS", 1));
        assertAll(
                () -> assertEquals(List.of("EVAL_TS", "NULL", "_x"), v.stream().map(Violation::name).toList()),
                () -> assertEquals(List.of(Code.EVAL_TS_KEY, Code.CONSTANT_KEY, Code.RESERVED_KEY),
                        v.stream().map(Violation::code).toList()));
    }
}
