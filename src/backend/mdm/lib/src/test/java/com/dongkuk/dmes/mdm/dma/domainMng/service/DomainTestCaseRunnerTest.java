package com.dongkuk.dmes.mdm.dma.domainMng.service;

import static com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures.node;
import static com.dongkuk.dmes.mdm.dma.domainMng.service.DomainDrafts.caseRow;
import static com.dongkuk.dmes.mdm.dma.domainMng.service.DomainDrafts.draft;
import static com.dongkuk.dmes.mdm.dma.domainMng.service.DomainDrafts.examples;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.dictionary.DomainChainAssembler;
import com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures;
import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import com.dongkuk.dmes.mdm.common.dictionary.EffectiveDomainView;
import com.dongkuk.dmes.mdm.common.engine.MdmCodeLookupAvailability;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import org.junit.jupiter.api.Test;

/** design.md §4.1 U5 — 엔진 DefaultDomainValidator 의미 그대로 케이스를 판정한다(불변 I15, D2). */
class DomainTestCaseRunnerTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-06-01T00:00:00Z"), ZoneId.of("Asia/Seoul"));

    static final CodeLookup CODES = id -> !"PROC_CD".equals(id) ? Optional.empty() : Optional.of(new CodeRows(
            new CodeHeader("PROC_CD", "INUSE"),
            List.of(new CodeVersionRow(new BigDecimal("1.000"), "RELEASED", LocalDateTime.of(2020, 1, 1, 0, 0),
                    LocalDateTime.of(9999, 12, 31, 0, 0))),
            List.of(new CodeItemRow("C1", new BigDecimal("1.000"), new BigDecimal("9999.000"), "코일", null, 1,
                    java.util.Arrays.asList(null, null, null, null, null),
                    java.util.Arrays.asList(null, null, null, null, null, null, null, null, null, null))),
            List.of(new CodeCateRow("BASE", new BigDecimal("1.000"), new BigDecimal("9999.000"), "REGEX", ".*", "CODE")),
            List.of()));

    private final MdmEvaluator ev = DomainFixtures.evaluator();
    private final DomainTestCaseRunner runner =
            new DomainTestCaseRunner(ev, MdmCodeLookupAvailability.of(null), CLOCK);

    private EffectiveDomainView view(MdmEvaluator evaluator, DomainNode... chain) {
        return new DomainChainAssembler(evaluator).assemble(List.of(chain));
    }

    private DomainTestCase tc(String value, boolean expect) {
        return new DomainTestCase(value, expect, Map.of(), null, null);
    }

    @Test
    void 기대와_같으면_MATCH_다르면_MISMATCH() {
        EffectiveDomainView v = view(ev, node(1).kind("QTY").type("NUMBER").stdRule("value <= 30").build(ev));
        assertEquals("MATCH", runner.run(v, "D1", tc("25", true)).result());
        assertEquals("MISMATCH", runner.run(v, "D1", tc("35", true)).result());
        assertEquals(Boolean.FALSE, runner.run(v, "D1", tc("35", true)).actual());
    }

    @Test
    void 조상_식까지_유효_정의로_판정한다() {
        EffectiveDomainView v = view(ev, node(1).kind("QTY").type("NUMBER").stdRule("value <= 30").build(ev),
                node(2).parent(1L).kind("QTY").type("NUMBER").stdRule("value >= 10").build(ev));
        assertEquals("MATCH", runner.run(v, "D2", tc("35", false)).result());
        assertEquals("MATCH", runner.run(v, "D2", tc("5", false)).result());
    }

    @Test
    void 불린이_아닌_결과는_판정_오류다() {
        EffectiveDomainView v = view(ev, node(1).kind("QTY").type("NUMBER").stdRule("value + 1").build(ev));
        assertEquals("ERROR", runner.run(v, "D1", tc("1", true)).result());
    }

    @Test
    void 비즈니스_변수가_없으면_실패이고_있으면_평가한다() {
        EffectiveDomainView v = view(ev, node(1).kind("QTY").type("NUMBER").bizRule("value >= COIL_NET_WGT").build(ev));
        DomainTestCaseRunner.CaseResult missing = runner.run(v, "D1", tc("10", true));
        assertEquals("MISMATCH", missing.result(), "요구 변수 누락은 통과가 아니라 실패(I15)");
        DomainTestCase withVars = new DomainTestCase("10", true, Map.of("COIL_NET_WGT", new BigDecimal("8")), null, null);
        assertEquals("MATCH", runner.run(v, "D1", withVars).result());
    }

    @Test
    void 소수_문자열은_정밀하게_판정한다() {
        EffectiveDomainView v = view(ev, node(1).kind("QTY").type("NUMBER").stdRule("value % 0.1 == 0").build(ev));
        assertEquals("MATCH", runner.run(v, "D1", tc("0.3", true)).result());
        assertEquals("MATCH", runner.run(v, "D1", tc("0.35", false)).result());
    }

    @Test
    void 코드_원장이_없으면_CODE_케이스는_판정_불가다() {
        EffectiveDomainView v = view(ev, node(1).kind("CODE").type("STRING").code("PROC_CD", "BASE").build(ev));
        DomainTestCaseRunner.CaseResult r = runner.run(v, "D1", tc("C1", true));
        assertEquals("UNDECIDED", r.result());
        assertTrue(runner.undecided(v));
        EffectiveDomainView master = view(ev, node(2).kind("TEXT").type("STRING")
                .stdRule("MASTER(\"PROC_CD\", \"BASE\", value)").build(ev));
        assertEquals("UNDECIDED", runner.run(master, "D2", tc("C1", true)).result());
    }

    @Test
    void 코드_원장이_있으면_실제로_판정한다() {
        MdmEvaluator withCodes = DomainFixtures.evaluator(CODES);
        DomainTestCaseRunner real = new DomainTestCaseRunner(withCodes, MdmCodeLookupAvailability.of(CODES), CLOCK);
        EffectiveDomainView v = view(withCodes, node(1).kind("CODE").type("STRING").code("PROC_CD", "BASE").build(withCodes));
        assertFalse(real.undecided(v));
        assertEquals("MATCH", real.run(v, "D1", tc("C1", true)).result());
        assertEquals("MATCH", real.run(v, "D1", tc("ZZ", false)).result());
    }

    @Test
    void 자기_식_결과_타입을_예시와_케이스로_확인한다() {
        DomainDraft bad = draft(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setUnitCode("mm");
            r.setStdRule("value + 1");
        }, List.of(caseRow("1", true)));
        Set<String> codes = runner.checkResultTypes(bad).stream().map(i -> i.code().name()).collect(Collectors.toSet());
        assertEquals(Set.of("R03"), codes);
        DomainDraft example = DomainDraft.from(DomainDrafts.request(r -> r.setStdRule("STR_LENGTH(value)")),
                List.of(), examples("abc"));
        assertTrue(runner.checkResultTypes(example).stream().anyMatch(i -> i.code() == DomainIssueCode.R03));
        DomainDraft none = draft(r -> r.setStdRule("value == \"A\""));
        assertEquals(List.of(DomainIssueCode.W03), runner.checkResultTypes(none).stream().map(DomainIssue::code).toList());
        DomainDraft ok = draft(r -> r.setStdRule("value == \"A\""), List.of(caseRow("A", true)));
        assertEquals(List.of(), runner.checkResultTypes(ok));
    }
}
