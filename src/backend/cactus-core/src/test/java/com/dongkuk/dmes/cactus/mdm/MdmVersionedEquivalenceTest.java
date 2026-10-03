package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.code.CodeRowsProjection;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import org.junit.jupiter.api.Test;

/** D-154 — 새 MDM·옛 MDM(물러남)·off(전 이력 한 키) 세 경로의 판정 동치(스펙 §6.1·§6.2). 판정 시각은 경계 ±1초·첫 버전 전·열린 끝 쪽. */
class MdmVersionedEquivalenceTest {

    private static final LocalDateTime B1 = LocalDateTime.parse("2026-06-01T00:00:00");
    private static final LocalDateTime B2 = LocalDateTime.parse("2026-07-01T00:00:00");

    private enum Mode { NEW_MDM, OLD_MDM, OFF }

    private static List<Instant> times() {
        List<Instant> out = new ArrayList<>();
        for (LocalDateTime t : List.of(LocalDateTime.parse("2025-06-01T00:00:00"), B1.minusSeconds(1), B1, B1.plusSeconds(1),
                B2.minusSeconds(1), B2, B2.plusSeconds(1), LocalDateTime.parse("2030-01-01T00:00:00"))) {
            out.add(t.atZone(MdmDefinitionLookup.KST).toInstant());
        }
        return out;
    }

    private static void seed(FakeMetaFeed feed) {
        feed.put(MdmTargetType.CODE, "C", CodeRowsProjection.releasedOnly(MdmMetaServiceVersionedTest.codeRows()));
        feed.put(MdmTargetType.COLUMN, "TB_COL", new MdmColumnMeta("TB_COL", "TB 컬럼", null, "TB", null, null, null, "STRING", 10, null, false,
                null, null, null, null, new MdmColumnMeta.DomainRef("8", "코드", "CODE"), null, null, List.of(),
                new MdmColumnMeta.CodeRefMeta("C", "TB"), null, null, null));
        feed.put(MdmTargetType.COLUMN, "AT_COL", MdmValidatorTest.withBiz(MdmValidatorTest.str("AT_COL", "기준일 코드", 10, false),
                "MASTER_AT(\"C\", \"BASE\", value, ORDER_DT)", List.of("ORDER_DT")));
        feed.put(MdmTargetType.RULE_SET, "S", List.of(
                new RuleSetDefinition("S", new BigDecimal("1.000"), LocalDateTime.parse("2026-01-01T00:00:00"), B1, List.of("R1"), SetStatus.INUSE, null),
                new RuleSetDefinition("S", new BigDecimal("2.000"), B1, null, List.of("R2"), SetStatus.INUSE, null)));
        feed.put(MdmTargetType.RULE, "R1", List.of(MdmValidatorTest.contractRule("R1", "QTY", DataType.NUMBER)));
        feed.put(MdmTargetType.RULE, "R2", List.of(MdmValidatorTest.contractRule("R2", "QTY", DataType.STRING)));
        feed.put(MdmTargetType.LAYOUT, "42", List.of(
                new MdmLayoutVersion(new BigDecimal("1.000"), LocalDateTime.parse("2026-01-01T00:00:00"), B2,
                        List.of(new MdmLayoutVersion.Segment(LocalDateTime.parse("2026-01-01T00:00:00"), B1, Map.of("n", 1)),
                                new MdmLayoutVersion.Segment(B1, B2, Map.of("n", 2)))),
                new MdmLayoutVersion(new BigDecimal("2.000"), B2, null, List.of(new MdmLayoutVersion.Segment(B2, null, Map.of("n", 3))))));
    }

    private static MdmMetaService service(Mode mode, Instant now) {
        MutableClock clock = new MutableClock(now);
        FakeMetaFeed feed = new FakeMetaFeed();
        if (mode == Mode.NEW_MDM) {
            feed.versioned();
        }
        seed(feed);
        MdmMetaCache cache = new MdmMetaCache(1000, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        cache.clear(0);
        return mode == Mode.OFF ? new MdmMetaService(feed, cache, clock) : new MdmMetaService(feed, cache, clock, true);
    }

    private static Map<String, Object> row(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    @Test
    void 저장_검증_결과가_세_경로에서_모든_판정_시각에_같다() {
        List<Map<String, Object>> rows = List.of(
                row("TB_COL", "A", "AT_COL", "A", "ORDER_DT", "20260301", "QTY", 1),
                row("TB_COL", "B", "AT_COL", "B", "ORDER_DT", "20260801", "QTY", "x"),
                row("TB_COL", "Z", "AT_COL", "Z", "ORDER_DT", "20261301", "QTY", 2));
        int compared = 0;
        for (Instant ts : times()) {
            Map<Mode, MdmValidationResult> results = new LinkedHashMap<>();
            for (Mode mode : Mode.values()) {
                MdmValidator v = new MdmValidator(service(mode, ts), FunctionProvider.NONE, MdmValidator.OnUnavailable.REJECT,
                        new MutableClock(ts));
                results.put(mode, v.validate(MdmValidationRequest.rows("g", rows).columns("TB_COL", "AT_COL").ruleSet("S").evalTs(ts).build()));
            }
            for (Mode mode : List.of(Mode.NEW_MDM, Mode.OLD_MDM)) {
                assertThat(results.get(mode)).as(mode + " " + ts).usingRecursiveComparison().isEqualTo(results.get(Mode.OFF));
                compared++;
            }
        }
        assertThat(compared).isEqualTo(times().size() * 2);
    }

    /**
     * 보강(계획 Step 3 변이 점검에서 추가): 위 시험은 AT_COL 의 MASTER_AT 미리 받기가 첫 버전 본문을 따로 받아 줘서 CODE 선택 규칙(첫 버전 전 소급)이
     * 빠져도 통과한다. 여기서는 MASTER_AT 없이 코드 칸 하나만 검사해 판정 시각의 코드 버전 선택이 곧바로 결과에 드러나게 한다.
     */
    @Test
    void 코드_칸만_검사해도_세_경로가_모든_판정_시각에_같다() {
        List<Map<String, Object>> rows = List.of(row("TB_COL", "A"), row("TB_COL", "B"));
        for (Instant ts : times()) {
            Map<Mode, MdmValidationResult> results = new LinkedHashMap<>();
            for (Mode mode : Mode.values()) {
                MdmValidator v = new MdmValidator(service(mode, ts), FunctionProvider.NONE, MdmValidator.OnUnavailable.REJECT,
                        new MutableClock(ts));
                results.put(mode, v.validate(MdmValidationRequest.rows("g", rows).columns("TB_COL").evalTs(ts).build()));
            }
            for (Mode mode : List.of(Mode.NEW_MDM, Mode.OLD_MDM)) {
                assertThat(results.get(mode)).as(mode + " " + ts).usingRecursiveComparison().isEqualTo(results.get(Mode.OFF));
            }
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void 룰_세트_전문_선택은_목록_선택과_같다() {
        for (Instant t : times()) {
            MdmMetaService off = service(Mode.OFF, t);
            List<RuleSetDefinition> sets = (List<RuleSetDefinition>) off.one(MdmTargetType.RULE_SET, "S").orElseThrow();
            List<RuleDefinition> rules = (List<RuleDefinition>) off.one(MdmTargetType.RULE, "R1").orElseThrow();
            List<MdmLayoutVersion> layouts = (List<MdmLayoutVersion>) off.one(MdmTargetType.LAYOUT, "42").orElseThrow();
            for (Mode mode : List.of(Mode.NEW_MDM, Mode.OLD_MDM)) {
                MdmDefinitionLookup lookup = new MdmDefinitionLookup(service(mode, t));
                assertThat(lookup.ruleSet("S", t)).as(mode + " set " + t).isEqualTo(MdmDefinitionLookup.selectSet(sets, t));
                assertThat(lookup.rule("R1", t)).as(mode + " rule " + t).isEqualTo(MdmDefinitionLookup.select(rules, t));
                assertThat(lookup.layout("42", t)).as(mode + " layout " + t).isEqualTo(MdmDefinitionLookup.selectLayout(layouts, t));
            }
        }
    }
}
