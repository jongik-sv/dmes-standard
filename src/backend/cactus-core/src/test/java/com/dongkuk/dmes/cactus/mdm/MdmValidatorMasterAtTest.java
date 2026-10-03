package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import org.junit.jupiter.api.Test;

/**
 * D-154 — {@code MASTER_AT} 의 base_dt 미리 받기(스펙 §7.3, 결정 P8, Review Focus 5). 버전 경로의 결과가 off(전 이력) 경로와 행마다 같아야 한다.
 * 비즈니스식 {@code MASTER_AT("C", "TB", value, ORDER_DT)} — TB 는 2.000 부터라 1.000 시각에는 최초 소급으로 소속이 빈 집합이다.
 */
class MdmValidatorMasterAtTest {

    private static final Instant T0 = Instant.parse("2026-10-02T15:00:00Z");

    private static MdmColumnMeta col(String bizExpr, List<String> requiredVars) {
        return MdmValidatorTest.withBiz(MdmValidatorTest.str("CODE_VAL", "코드 값", 10, false), bizExpr, requiredVars);
    }

    private static Map<String, Object> row(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    private static MdmValidationResult run(boolean versioned, MdmColumnMeta column, List<Map<String, Object>> rows) {
        return run(versioned, column, rows, feed -> {
        });
    }

    private static MdmValidationResult run(boolean versioned, MdmColumnMeta column, List<Map<String, Object>> rows, Consumer<FakeMetaFeed> setup) {
        MutableClock clock = new MutableClock(T0);
        FakeMetaFeed feed = new FakeMetaFeed();
        if (versioned) {
            feed.versioned();
        }
        setup.accept(feed);
        feed.put(MdmTargetType.COLUMN, "CODE_VAL", column);
        feed.put(MdmTargetType.CODE, "C", MdmMetaServiceVersionedTest.codeRows());
        MdmMetaCache cache = new MdmMetaCache(1000, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        cache.clear(0);
        MdmMetaService service = versioned ? new MdmMetaService(feed, cache, clock, true) : new MdmMetaService(feed, cache, clock);
        MdmValidator v = new MdmValidator(service, FunctionProvider.NONE, MdmValidator.OnUnavailable.REJECT, clock);
        return v.validate(MdmValidationRequest.rows("g", rows).columns("CODE_VAL").build());
    }

    private static void assertSame(MdmColumnMeta column, List<Map<String, Object>> rows) {
        MdmValidationResult off = run(false, column, rows);
        MdmValidationResult on = run(true, column, rows);
        assertThat(on.errors()).usingRecursiveComparison().isEqualTo(off.errors());
        assertThat(on.unavailable()).isEqualTo(off.unavailable());
    }

    @Test
    void 행_칸의_8자리_14자리_날짜마다_그_시각_본문을_미리_받아_off_와_같다() {
        MdmColumnMeta c = col("MASTER_AT(\"C\", \"TB\", value, ORDER_DT)", List.of("ORDER_DT"));
        List<Map<String, Object>> rows = List.of(
                row("CODE_VAL", "B", "ORDER_DT", "20260301"),          // 1.000 — TB 소속 없음
                row("CODE_VAL", "B", "ORDER_DT", "20260801"),          // 2.000 — B 소속
                row("CODE_VAL", "B", "ORDER_DT", "20260301120000"));   // 14자리
        assertSame(c, rows);
        MdmValidationResult on = run(true, c, rows);
        assertThat(on.unavailable()).as("1.000 본문을 미리 받았다").isEmpty();
        assertThat(on.errors()).hasSize(2);
    }

    @Test
    void 열네_자리_날짜만_가리키는_옛_버전_본문도_미리_받는다() {
        MdmColumnMeta c = col("MASTER_AT(\"C\", \"TB\", value, ORDER_DT)", List.of("ORDER_DT"));
        // 지금(T0)은 2.000 — 1.000 본문은 이 14자리 값을 풀어야만 미리 받는다
        List<Map<String, Object>> rows = List.of(row("CODE_VAL", "B", "ORDER_DT", "20260301120000"));
        assertSame(c, rows);
        MdmValidationResult on = run(true, c, rows);
        assertThat(on.unavailable()).isEmpty();
        assertThat(on.errors()).as("1.000 에는 TB 소속이 없다").hasSize(1);
    }

    @Test
    void base_dt_본문을_받을_수_없으면_그_항목을_검증_불가로_뺀다() {
        MdmColumnMeta c = col("MASTER_AT(\"C\", \"TB\", value, ORDER_DT)", List.of("ORDER_DT"));
        MdmValidationResult on = run(true, c, List.of(row("CODE_VAL", "B", "ORDER_DT", "20260301")),
                feed -> feed.failedBodies.put(new MdmBodyKey("C", "1.000"), "깨진 본문"));

        assertThat(on.unavailable()).containsExactly("CODE:C");
        assertThat(on.errors()).as("검사에서 빠졌다").isEmpty();
    }

    @Test
    void 문자열_상수_base_dt_도_미리_받는다() {
        MdmColumnMeta c = col("MASTER_AT(\"C\", \"BASE\", value, \"20260301\")", List.of());
        List<Map<String, Object>> rows = List.of(row("CODE_VAL", "A"), row("CODE_VAL", "B"));
        assertSame(c, rows);
        assertThat(run(true, c, rows).unavailable()).isEmpty();
    }

    @Test
    void 해석할_수_없는_값은_미리_받지_않고_엔진_평가에_맡겨_off_와_같다() {
        MdmColumnMeta c = col("MASTER_AT(\"C\", \"TB\", value, ORDER_DT)", List.of("ORDER_DT"));
        assertSame(c, Arrays.asList(
                row("CODE_VAL", "B", "ORDER_DT", "20261301"),   // 달력에 없음 — 평가 오류
                row("CODE_VAL", "B", "ORDER_DT", 20260301),     // 숫자 — 평가 오류
                row("CODE_VAL", "B", "ORDER_DT", ""),           // 빈 값
                row("CODE_VAL", "B")));                         // 칸 없음(필수 변수 없음)
    }

    @Test
    void 같은_물리명_칸이_겹친_행은_미리_받지_않고_지금과_같은_형식_오류다() {
        MdmColumnMeta c = col("MASTER_AT(\"C\", \"TB\", value, ORDER_DT)", List.of("ORDER_DT"));
        assertSame(c, List.of(row("CODE_VAL", "B", "orderDt", "20260301", "ORDER_DT", "20260801")));
    }
}
