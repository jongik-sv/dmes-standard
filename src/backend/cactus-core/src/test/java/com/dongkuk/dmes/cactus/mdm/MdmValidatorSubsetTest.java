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
import kr.dongkuk.maru.mdm.engine.rule.SetShape;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 하위 세트 호출(SET 노드)의 저장 검증 미리 받기 — 하위·손주 세트와 그 룰을 깊이 5 까지 같은 판정 시각으로 미리 받는다(계획 Task c, 스펙 §8.1, C-D17).
 * 엔진은 진짜이고 MDM 만 가짜 피드다. 하위 세트를 미리 받지 않으면 엔진이 평가 중 캐시 부재로 검증 불가를 낸다.
 */
class MdmValidatorSubsetTest {

    private static final Instant T0 = Instant.parse("2026-10-02T15:00:00Z");
    private static final LocalDateTime FROM = LocalDateTime.parse("2026-01-01T00:00:00");
    private static final LocalDateTime B = LocalDateTime.parse("2026-06-01T00:00:00");

    private FakeMetaFeed feed;
    private MdmValidator validator;

    @BeforeEach
    void setUp() {
        MutableClock clock = new MutableClock(T0);
        feed = new FakeMetaFeed().versioned();
        MdmMetaCache cache = new MdmMetaCache(1000, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        cache.clear(0);
        validator = new MdmValidator(new MdmMetaService(feed, cache, clock, true), FunctionProvider.NONE, MdmValidator.OnUnavailable.REJECT, clock);
    }

    // ------------------------------------------------------------------ 정의 도우미

    /** start → 노드들(차례로) → end. */
    private static FlowDefinition line(FlowNode... mids) {
        List<FlowNode> nodes = new ArrayList<>();
        nodes.add(new FlowNode("start", NodeKind.START, null, null, null, null, null, null));
        nodes.addAll(List.of(mids));
        nodes.add(new FlowNode("end", NodeKind.END, null, null, null, null, null, null));
        List<FlowEdge> edges = new ArrayList<>();
        for (int i = 0; i + 1 < nodes.size(); i++) {
            edges.add(new FlowEdge("e" + (i + 1), nodes.get(i).id(), nodes.get(i + 1).id(), null, null, false, null));
        }
        return new FlowDefinition(1, nodes, edges);
    }

    private static FlowNode setNode(String id, String setId) {
        return new FlowNode(id, NodeKind.SET, null, null, null, null, null, setId);
    }

    private static FlowNode ruleNode(String id, String ruleId) {
        return new FlowNode(id, NodeKind.RULE, ruleId, null, null, null, null, null);
    }

    private static RuleSetDefinition version(String setId, String ver, LocalDateTime from, LocalDateTime to, List<String> ruleIds, FlowDefinition flow) {
        return new RuleSetDefinition(setId, new BigDecimal(ver), from, to, ruleIds, SetStatus.INUSE, flow);
    }

    /** 한 버전짜리 세트 — 흐름은 {@code line(mids)}. */
    private void putSet(String setId, List<String> ruleIds, FlowNode... mids) {
        feed.put(MdmTargetType.RULE_SET, setId, List.of(version(setId, "1.000", FROM, null, ruleIds, line(mids))));
    }

    private void putRule(String ruleId) {
        feed.put(MdmTargetType.RULE, ruleId, List.of(MdmValidatorTest.contractRule(ruleId, "QTY", DataType.NUMBER)));
    }

    private static Map<String, Object> row(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    private MdmValidationResult validate(String setId) {
        return validator.validate(MdmValidationRequest.rows("g", List.of(row("QTY", 1))).ruleSet(setId).build());
    }

    // ------------------------------------------------------------------ 시험

    @Test
    void 하위_세트와_손주_세트의_룰을_미리_받아_검증_불가_없이_돈다() {
        putSet("A", List.of(), setNode("s1", "B"));
        putSet("B", List.of(), setNode("s1", "C"));
        putSet("C", List.of("R_C"), ruleNode("r1", "R_C"));
        putRule("R_C");

        MdmValidationResult r = validate("A");

        assertThat(r.unavailable()).isEmpty();
        assertThat(r.errors()).isEmpty();
        assertThat(r.ruleSetResults()).containsOnlyKeys(0);
        assertThat(feed.tocKeys).as("단계마다 한 번 묶어 받고, 룰은 모아서 한 번")
                .containsExactly(List.of("A"), List.of("B"), List.of("C"), List.of("R_C"));
    }

    @Test
    void 순환이어도_미리_받기가_끝나고_이미_받은_세트는_다시_받지_않는다() {
        putSet("A", List.of(), setNode("s1", "B"));
        putSet("B", List.of(), setNode("s1", "A"));

        MdmValidationResult r = validate("A");

        assertThat(feed.tocKeys).containsExactly(List.of("A"), List.of("B"));
        assertThat(r.unavailable()).isEmpty();
        assertThat(r.errors()).as("순환은 엔진이 SET_CALL_CYCLE 로 행 오류를 낸다").hasSize(1);
        assertThat(r.ruleSetResults()).isEmpty();
    }

    @Test
    void 깊이_5_단계까지만_받고_6_단계_아래_세트는_받지_않는다() {
        assertThat(SetShape.MAX_CALL_DEPTH).isEqualTo(5);
        // P0 → … → P5(룰): 최상위에서 5 단계 아래까지 — 모두 받는다
        for (int i = 0; i < 5; i++) {
            putSet("P" + i, List.of(), setNode("s1", "P" + (i + 1)));
        }
        putSet("P5", List.of("R_P"), ruleNode("r1", "R_P"));
        putRule("R_P");
        MdmValidationResult ok = validate("P0");
        assertThat(feed.tocKeys).containsExactly(List.of("P0"), List.of("P1"), List.of("P2"), List.of("P3"), List.of("P4"), List.of("P5"),
                List.of("R_P"));
        assertThat(ok.unavailable()).isEmpty();
        assertThat(ok.errors()).isEmpty();
        assertThat(ok.ruleSetResults()).containsOnlyKeys(0);
        feed.tocKeys.clear();

        // Q0 → … → Q6: Q6 은 6 단계라 받지 않는다(엔진은 SET_CALL_DEPTH 로 행 오류)
        for (int i = 0; i < 6; i++) {
            putSet("Q" + i, List.of(), setNode("s1", "Q" + (i + 1)));
        }
        putSet("Q6", List.of("R_Q"), ruleNode("r1", "R_Q"));
        putRule("R_Q");
        MdmValidationResult deep = validate("Q0");
        assertThat(feed.tocKeys).containsExactly(List.of("Q0"), List.of("Q1"), List.of("Q2"), List.of("Q3"), List.of("Q4"), List.of("Q5"));
        assertThat(deep.unavailable()).isEmpty();
        assertThat(deep.errors()).hasSize(1);
    }

    @Test
    void 하위_세트의_룰을_받을_수_없으면_최상위_세트를_검증_불가로_건너뛴다() {
        putSet("A", List.of(), setNode("s1", "B"));
        putSet("B", List.of("R_B"), ruleNode("r1", "R_B"));
        putRule("R_B");
        feed.failedKeys.put("R_B", "깨진 룰");

        MdmValidationResult r = validate("A");

        assertThat(r.unavailable()).containsExactly("RULE:R_B");
        assertThat(r.errors()).isEmpty();
        assertThat(r.ruleSetResults()).as("그 세트 검사를 건너뛴다").isEmpty();
    }

    @Test
    void 하위_세트를_받을_수_없으면_그것을_부른_최상위_세트를_검증_불가로_건너뛴다() {
        putSet("A", List.of(), setNode("s1", "B"));
        putSet("B", List.of("R_B"), ruleNode("r1", "R_B"));
        putRule("R_B");
        feed.failedKeys.put("B", "깨진 세트");

        MdmValidationResult r = validate("A");

        assertThat(r.unavailable()).containsExactly("RULE_SET:B");
        assertThat(r.errors()).isEmpty();
        assertThat(r.ruleSetResults()).isEmpty();
        assertThat(r.missing()).isEmpty();
    }

    @Test
    void 없는_하위_세트는_항목을_빼지_않고_엔진의_SET_NOT_FOUND_행_오류가_남는다() {
        putSet("A", List.of(), setNode("s1", "NO_SUCH"));

        MdmValidationResult r = validate("A");

        assertThat(r.missing()).as("최상위 세트는 있다").isEmpty();
        assertThat(r.unavailable()).isEmpty();
        assertThat(r.errors()).singleElement().satisfies(e -> {
            assertThat(e.rowIndex()).isZero();
            assertThat(e.message()).startsWith("룰 세트 A:");
        });
        assertThat(r.ruleSetResults()).isEmpty();
    }

    @Test
    void 하위_세트도_요청_판정_시각의_버전으로_고른다() {
        putSet("A", List.of(), setNode("s1", "S"));
        feed.put(MdmTargetType.RULE_SET, "S", List.of(
                version("S", "1.000", FROM, B, List.of("R1"), line(ruleNode("r1", "R1"))),
                version("S", "2.000", B, null, List.of("R2"), line(ruleNode("r1", "R2")))));
        putRule("R1");
        putRule("R2");

        MdmValidationResult past = validator.validate(MdmValidationRequest.rows("g", List.of(row("QTY", 1))).ruleSet("A")
                .evalTs(Instant.parse("2026-03-01T00:00:00Z")).build());
        assertThat(feed.tocKeys).as("하위 세트 S 1.000 의 룰 R1 만").containsExactly(List.of("A"), List.of("S"), List.of("R1"));
        assertThat(feed.tocAts).containsOnly(LocalDateTime.parse("2026-03-01T09:00:00"));
        assertThat(past.unavailable()).isEmpty();
        assertThat(past.errors()).isEmpty();
        feed.tocKeys.clear();
        feed.tocAts.clear();

        MdmValidationResult now = validator.validate(MdmValidationRequest.rows("g", List.of(row("QTY", 1))).ruleSet("A").evalTs(T0).build());
        assertThat(feed.tocKeys).as("세트 목차는 캐시 — S 2.000 의 룰 R2 만").containsExactly(List.of("R2"));
        assertThat(feed.tocAts).containsExactly(LocalDateTime.parse("2026-10-03T00:00:00"));
        assertThat(now.unavailable()).isEmpty();
        assertThat(now.errors()).isEmpty();
    }
}
