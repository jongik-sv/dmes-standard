package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.InputContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import kr.dongkuk.maru.mdm.engine.spi.MasterLookup;
import org.junit.jupiter.api.Test;

/** D-154 — 룰 세트 흐름 조건과 룰 행 계약 조건의 {@code MASTER_AT} 기준 시각 수집(스펙 §7.3). 상수는 시각으로, 변수는 이름으로 모은다. */
class MdmExprRefsMasterAtTest {

    private static final LocalDateTime FROM = LocalDateTime.parse("2026-01-01T00:00:00");

    private static MdmExprRefs refs() {
        MdmMetaCache cache = new MdmMetaCache(10, Duration.ofHours(1), Clock.systemUTC());
        MdmCachedDefinitions cached = new MdmCachedDefinitions(new MdmMetaService(new FakeMetaFeed(), cache, Clock.systemUTC()));
        MdmEvaluator evaluator = new MdmEvaluator(new EngineLookups(cached, cached, cached, MasterLookup.NONE, FunctionProvider.NONE));
        return new MdmExprRefs(evaluator.configuration());
    }

    @Test
    void 룰_세트_흐름_조건의_MASTER_AT_상수_기준_시각을_모은다() {
        FlowDefinition flow = new FlowDefinition(1, List.of(), List.of(
                new FlowEdge("e1", "s", "r1", 1, "MASTER_AT(\"C\", \"TB\", QTY, \"20260301\")", false, null),
                new FlowEdge("e2", "s", "r2", 2, null, true, null)));
        RuleSetDefinition set = new RuleSetDefinition("S", new BigDecimal("1.000"), FROM, null, List.of("R1"), SetStatus.INUSE, flow);

        assertThat(refs().flowMasterAt(set)).containsExactly(new MdmExprRefs.MasterAtRef("C", LocalDateTime.parse("2026-03-01T00:00:00"), null));
    }

    @Test
    void 룰_행_계약_조건의_MASTER_AT_변수_기준_시각을_이름으로_모은다() {
        RuleDefinition rule = new RuleDefinition("R", new BigDecimal("1.000"), RuleKind.DECISION, HitPolicy.FIRST, FROM, null, "1", List.of(),
                new InputContract(List.of(new VarType("X", DataType.STRING, null, null)),
                        List.of(new RowContract(1, "MASTER_AT(\"D\", \"BASE\", X, ORDER_DT)", List.of(), List.of()))),
                List.of());

        assertThat(refs().ruleMasterAt(rule)).containsExactly(new MdmExprRefs.MasterAtRef("D", null, "ORDER_DT"));
    }
}
