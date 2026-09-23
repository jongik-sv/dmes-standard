package com.dongkuk.dmes.mdm.contract.stub;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.category.MaruIdKind;
import com.dongkuk.dmes.mdm.contract.category.MaruIdNamespace;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * TSK-01-02 design.md §3.1 T9 — spec 수용 기준 "04·06 이 같은 인터페이스를 구현할 수 있음을 스텁 컴파일로 확인".
 *
 * <p>스텁을 인터페이스 타입으로만 다룬다. 이 테스트의 가치는 컴파일이다 — SPI 시그니처가 바뀌면 스텁과
 * 이 클래스가 함께 깨진다(불변 규칙 I16).
 */
class ContractStubCompileTest {

    private static final List<VersionConfirmCheckSpi> CONFIRM_CHECKS = List.of(
            new MasterCodeConfirmCheckStub(), new BusinessRuleConfirmCheckStub());

    private static final List<MaruIdNamespace> NAMESPACES = List.of(
            new MasterCodeIdNamespaceStub(Set.of("PROC_CD", "STEEL_GRADE")),
            new MasterDataIdNamespaceStub(Set.of("ITEM", "CUSTOMER")));

    @Test
    void 확정_검사_SPI_구현이_모든_버전_대상을_하나씩_덮는다() {
        Set<VersionTarget> targets = CONFIRM_CHECKS.stream().map(VersionConfirmCheckSpi::target)
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(VersionTarget.class)));
        assertEquals(EnumSet.allOf(VersionTarget.class), targets);
        assertEquals(CONFIRM_CHECKS.size(), targets.size(), "같은 대상을 두 구현이 맡으면 안 된다");
    }

    @Test
    void 확정_검사_SPI_가_diff_와_검사_결과를_돌려준다() {
        LocalDateTime now = LocalDateTime.of(2026, 9, 24, 10, 0, 0);
        for (VersionConfirmCheckSpi spi : CONFIRM_CHECKS) {
            VersionRef draft = new VersionRef(spi.target(), "OBJ-1", new BigDecimal("2"));
            VersionDiff diff = spi.diff(draft);
            assertEquals(draft, diff.target());
            assertEquals(1, diff.entries().size());

            ConfirmCheckRequest request = new ConfirmCheckRequest(draft, now.plusDays(1), now, "steward1", now);
            ConfirmCheckResult result = spi.check(request);
            assertTrue(result.errors() != null && result.warnings() != null);
        }
    }

    @Test
    void 마스터코드_스텁은_경고만_업무기준_스텁은_오류를_낸다() {
        VersionConfirmCheckSpi masterCode = byTarget(VersionTarget.MASTER_CODE);
        VersionConfirmCheckSpi businessRule = byTarget(VersionTarget.BUSINESS_RULE);
        VersionRef codeDraft = new VersionRef(VersionTarget.MASTER_CODE, "PROC_CD", new BigDecimal("1.000"));
        VersionRef ruleDraft = new VersionRef(VersionTarget.BUSINESS_RULE, "RULE-1", new BigDecimal("3"));

        VersionDiff codeDiff = masterCode.diff(codeDraft);
        assertNull(codeDiff.base(), "최초 버전 diff 는 base 가 null");
        assertEquals(DiffKind.ADDED, codeDiff.entries().get(0).kind());
        assertNull(codeDiff.entries().get(0).oldValues(), "ADDED 는 oldValues 가 null");

        VersionDiff ruleDiff = businessRule.diff(ruleDraft);
        assertEquals(new BigDecimal("2"), ruleDiff.base().ver());
        assertEquals(DiffKind.CHANGED, ruleDiff.entries().get(0).kind());

        LocalDateTime now = LocalDateTime.of(2026, 9, 24, 10, 0, 0);
        ConfirmCheckResult codeResult = masterCode.check(new ConfirmCheckRequest(codeDraft, now, null, "s", now));
        assertTrue(codeResult.errors().isEmpty());
        assertEquals(1, codeResult.warnings().size());
        assertEquals("P01", codeResult.warnings().get(0).itemKey());

        ConfirmCheckResult ruleResult = businessRule.check(new ConfirmCheckRequest(ruleDraft, now, now, "s", now));
        assertEquals(1, ruleResult.errors().size());
        assertEquals("MDM010", ruleResult.errors().get(0).code());
    }

    @Test
    void 이름_공간_SPI_구현이_두_종류를_하나씩_덮는다() {
        Set<MaruIdKind> kinds = NAMESPACES.stream().map(MaruIdNamespace::kind)
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(MaruIdKind.class)));
        assertEquals(EnumSet.allOf(MaruIdKind.class), kinds);
    }

    @Test
    void 마스터데이터_등록이_마스터코드에_있는_ID_의_소유자를_찾는다() {
        // 05 등록 서비스가 "상대 표"(자기 종류가 아닌 이름 공간)를 조회하는 모양(04:74, 05:86).
        assertEquals(Optional.of(MaruIdKind.MASTER_CODE), ownerOf("PROC_CD", MaruIdKind.MASTER_DATA));
        assertEquals(Optional.of(MaruIdKind.MASTER_DATA), ownerOf("ITEM", MaruIdKind.MASTER_CODE));
        assertEquals(Optional.empty(), ownerOf("NEW_ID", MaruIdKind.MASTER_DATA));
    }

    private static Optional<MaruIdKind> ownerOf(String maruId, MaruIdKind registering) {
        return NAMESPACES.stream()
                .filter(ns -> ns.kind() != registering)
                .filter(ns -> ns.contains(maruId))
                .map(MaruIdNamespace::kind)
                .findFirst();
    }

    private static VersionConfirmCheckSpi byTarget(VersionTarget target) {
        return CONFIRM_CHECKS.stream().filter(spi -> spi.target() == target).findFirst().orElseThrow();
    }
}
