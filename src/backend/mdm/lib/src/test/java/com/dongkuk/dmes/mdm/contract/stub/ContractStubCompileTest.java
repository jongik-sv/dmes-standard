package com.dongkuk.dmes.mdm.contract.stub;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.category.MaruIdKind;
import com.dongkuk.dmes.mdm.contract.category.MaruIdNamespace;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmColumnDictionaryEntry;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainDraft;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainKind;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainReference;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainReferenceSpi;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmEffectiveDomain;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmEffectiveDomainResolver;
import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutHeaderRef;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemType;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSerializeContext;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
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

    // ── TSK-04-01 design.md §3.4 — 02 계약(dictionary) 스텁 컴파일 ──

    @Test
    void 컬럼_사전_조회_스텁이_MdmColumnDictionaryLookup_만으로_화면_라벨을_조립한다() {
        MdmColumnDictionaryEntry entry = new MdmColumnDictionaryEntry(
                1L, "품목코드", "ITEM_CD", 10L, MdmDomainKind.CODE, true,
                "품목 코드", "품목코드", "품목", null, "LAYOUT_ITEM", "L-1", null, null);
        ColumnDictionaryConsumerStub stub = new ColumnDictionaryConsumerStub(entry);

        assertEquals("품목 코드(domain=10, ref=LAYOUT_ITEM)", stub.composeScreenLabel("ITEM_CD"));
        assertEquals("UNKNOWN", stub.composeScreenLabel("UNKNOWN"));
        assertEquals(Optional.of(entry), stub.byColumnId(1L));
        assertEquals(List.of(entry), stub.byDomainId(10L));
        assertEquals(Optional.empty(), stub.byDomainId(99L).stream().findFirst());
    }

    @Test
    void 유효_도메인_해석_스텁이_조회_경로와_저장_경로_모두_컴파일_동작한다() {
        MdmEffectiveDomainResolver resolver = new EffectiveDomainConsumerStub();

        MdmEffectiveDomain resolved = resolver.resolve(5L);
        assertEquals(5L, resolved.domainId());

        MdmDomainDraft draft = new MdmDomainDraft(null, 5L, MdmDomainKind.FLAG, "std", "biz", null);
        MdmEffectiveDomain fromDraft = resolver.resolveDraft(draft);
        assertEquals("std", fromDraft.effectiveStdExpr());
        assertEquals("biz", fromDraft.effectiveBizExpr());
    }

    @Test
    void 영향도_참조_SPI_목록이_구현체_0개에서도_빈_결과로_동작한다() {
        List<MdmDomainReferenceSpi> empty = List.of();
        List<MdmDomainReference> merged = empty.stream()
                .flatMap(spi -> spi.referencesTo(Set.of(1L), Set.of("ITEM_CD")).stream())
                .toList();
        assertTrue(merged.isEmpty(), "구현체가 없으면(wbs 수용 기준) 참조는 0건이어야 한다");

        List<MdmDomainReferenceSpi> both = List.of(
                new DomainReferenceSpiStub("LAYOUT_ITEM", List.of(new MdmDomainReference("LAYOUT_ITEM", "L-1"))),
                new DomainReferenceSpiStub("RULE_VAR", List.of(new MdmDomainReference("RULE_VAR", "R-1"))));
        List<MdmDomainReference> mergedBoth = both.stream()
                .flatMap(spi -> spi.referencesTo(Set.of(1L), Set.of("ITEM_CD")).stream())
                .toList();
        assertEquals(2, mergedBoth.size());
        assertTrue(mergedBoth.contains(new MdmDomainReference("LAYOUT_ITEM", "L-1")));
        assertTrue(mergedBoth.contains(new MdmDomainReference("RULE_VAR", "R-1")));
    }

    // ── TSK-05-01 design.md §3.4 — 03(레이아웃) 계약 스텁 컴파일 ──
    // 별도 파일을 새로 만들지 않고 기존 ContractStubCompileTest.java(TSK-01-02 소유)에 메서드를 추가한다
    // — TSK-04-01 이 같은 판단(design.md §2 "수정" 목록에 이 파일이 없는 것은 design 의 누락)을 이미 남겼다.

    @Test
    void 레이아웃_직렬화기_스텁이_컨텍스트를_받아_컴파일_동작한다() {
        MdmLayoutItemSnapshot bodyItem = new MdmLayoutItemSnapshot(
                1, MdmFillKind.DATA, MdmLayoutItemType.CHAR, "COIL_ID", null, null, null,
                null, null, null, 0, 20);
        MdmLayoutSnapshot snapshot = new MdmLayoutSnapshot(
                201L, "M201", "IFL2MES201", "L2", "MES", "EUC-KR", "패딩 규칙",
                2L, 20, List.of(), List.of(bodyItem));
        LayoutSerializerConsumerStub stub = new LayoutSerializerConsumerStub();

        MdmLayoutSerializeContext context = new MdmLayoutSerializeContext(
                LocalDateTime.of(2026, 9, 24, 10, 0, 0), 1L);
        byte[] serialized = stub.serialize(snapshot, java.util.Map.of("COIL_ID", "C1"), context);
        assertEquals(snapshot.totalLength(), serialized.length);
    }

    @Test
    void 레이아웃_파서_스텁이_컴파일_동작한다() {
        MdmLayoutSnapshot snapshot = new MdmLayoutSnapshot(
                201L, "M201", "IFL2MES201", "L2", "MES", "EUC-KR", "패딩 규칙",
                2L, 20, List.of(), List.of());
        LayoutParserConsumerStub stub = new LayoutParserConsumerStub();

        java.util.Map<String, Object> parsed = stub.parse(snapshot, new byte[20]);
        assertEquals(201L, parsed.get("layoutId"));
        assertEquals(20, parsed.get("messageLength"));
    }

    @Test
    void 레이아웃_스냅샷이_헤더_0_1_2_경우를_생성자_호출로_담을_수_있다() {
        MdmLayoutItemSnapshot headerItem = new MdmLayoutItemSnapshot(
                2, MdmFillKind.CONST, MdmLayoutItemType.CHAR, "SND_FAC_TP", null, null, null,
                "B0", "B1", null, 8, 4);
        MdmLayoutHeaderRef h100 = new MdmLayoutHeaderRef(1, 100L, "L100 GLUE 공통 헤더", 0, 100, List.of(headerItem));
        MdmLayoutHeaderRef h110 = new MdmLayoutHeaderRef(2, 110L, "L110 L2 구간 헤더", 100, 30, List.of());

        MdmLayoutSnapshot noHeader = new MdmLayoutSnapshot(
                1L, "무헤더", null, null, null, null, null, 1L, 10, List.of(), List.of());
        MdmLayoutSnapshot oneHeader = new MdmLayoutSnapshot(
                2L, "단일헤더", null, null, null, null, null, 1L, 110, List.of(h100), List.of());
        MdmLayoutSnapshot stacked = new MdmLayoutSnapshot(
                201L, "M201", "IFL2MES201", "L2", "MES", "EUC-KR", null, 2L, 187, List.of(h100, h110), List.of());

        assertEquals(0, noHeader.headers().size());
        assertEquals(1, oneHeader.headers().size());
        assertEquals(2, stacked.headers().size());
        // 헤더 기본값·재정의 값을 둘 다 구분해 조립할 수 있음을 증명한다(F22, 불변 규칙 14).
        MdmLayoutItemSnapshot fromStacked = stacked.headers().get(0).items().get(0);
        assertEquals("B0", fromStacked.defaultValue());
        assertEquals("B1", fromStacked.overrideValue());
    }
}
