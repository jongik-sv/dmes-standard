package com.dongkuk.dmes.mdm.contract.stub;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import com.dongkuk.dmes.mdm.contract.category.CategoryKind;
import com.dongkuk.dmes.mdm.contract.category.MaruIdKind;
import com.dongkuk.dmes.mdm.contract.category.MaruIdNamespace;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentAction;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentResult;
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
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCheckItemResult;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCheckStatus;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConfirmCheckItem;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConfirmCheckReport;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeDiffConventions;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemValues;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentKey;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentService;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentTable;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeVersionView;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleConfirmCheckItem;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleDefinitionSource;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleDiffConventions;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdIssuer;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdKind;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdRange;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import com.dongkuk.dmes.mdm.contract.version.VersionDraftDeletionSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleRow;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
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
        VersionRef ruleDraft = new VersionRef(VersionTarget.BUSINESS_RULE, "RULE-1", new BigDecimal("3.000"));

        VersionDiff codeDiff = masterCode.diff(codeDraft);
        assertNull(codeDiff.base(), "최초 버전 diff 는 base 가 null");
        assertEquals(DiffKind.ADDED, codeDiff.entries().get(0).kind());
        assertNull(codeDiff.entries().get(0).oldValues(), "ADDED 는 oldValues 가 null");

        VersionDiff ruleDiff = businessRule.diff(ruleDraft);
        assertEquals(new BigDecimal("2.000"), ruleDiff.base().ver());
        assertEquals(DiffKind.CHANGED, ruleDiff.entries().get(0).kind());

        LocalDateTime now = LocalDateTime.of(2026, 9, 24, 10, 0, 0);
        ConfirmCheckResult codeResult = masterCode.check(new ConfirmCheckRequest(codeDraft, now, null, "s", now));
        assertTrue(codeResult.errors().isEmpty());
        assertEquals(1, codeResult.warnings().size());
        // TSK-06-01 D10 — itemKey 는 diff 키 규약({표}:{부분}) 이다. 스텁이 계약 문장을 따르도록 "P01" 에서 바꿨다
        // (정확한 값 → 정확한 값, 완화 아님. design.md Build 이탈 기록 참고).
        assertEquals("CATE_ITEM:MAJOR,P01", codeResult.warnings().get(0).itemKey());

        ConfirmCheckResult ruleResult = businessRule.check(new ConfirmCheckRequest(ruleDraft, now, now, "s", now));
        assertEquals(1, ruleResult.errors().size());
        assertEquals("MDM010", ruleResult.errors().get(0).code());
    }

    @Test
    void 삭제_정리_훅_구현이_모든_버전_대상을_하나씩_덮는다() {
        // TSK-01-03 K5 — VersionDraftDeletionSpi 도 target 마다 정확히 하나(D4).
        List<VersionDraftDeletionSpi> hooks = List.of(new MasterCodeDraftDeletionStub(), new BusinessRuleDraftDeletionStub());
        Set<VersionTarget> targets = hooks.stream().map(VersionDraftDeletionSpi::target)
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(VersionTarget.class)));
        assertEquals(EnumSet.allOf(VersionTarget.class), targets);
        assertEquals(hooks.size(), targets.size(), "같은 대상을 두 훅이 맡으면 안 된다");

        VersionRef draft = new VersionRef(VersionTarget.MASTER_CODE, "PROC_CD", new BigDecimal("2.000"));
        hooks.get(0).beforeDraftDelete(draft);
        assertEquals(List.of(draft), ((MasterCodeDraftDeletionStub) hooks.get(0)).calls);
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
                null, null, null, 0, 20, null, null);
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
                "B0", "B1", null, 8, 4, null, null);
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

    // ── TSK-07-01 design.md §3.4 — 05(마스터데이터) 일시 선분 저장 코어 계약 스텁 컴파일 ──

    @Test
    void 일시_선분_저장_코어_스텁이_등록_수정_닫기_다시열기_네_메서드를_컴파일_동작한다() {
        MdmTemporalSegmentStoreConsumerStub stub = new MdmTemporalSegmentStoreConsumerStub();
        LocalDateTime t1 = LocalDateTime.of(2026, 9, 24, 10, 0, 0);
        LocalDateTime t2 = LocalDateTime.of(2026, 9, 25, 10, 0, 0);

        MdmTemporalSegmentResult<String> registered = stub.register("K1", "V1", t1);
        assertEquals(MdmTemporalSegmentAction.INSERT, registered.action());
        assertEquals("V1", registered.value());

        MdmTemporalSegmentResult<String> modified = stub.modify("K1", "V2", t2);
        assertEquals(MdmTemporalSegmentAction.UPDATE, modified.action());
        assertEquals("V2", modified.value());

        MdmTemporalSegmentResult<String> reopened = stub.reopen("K1", t2);
        assertEquals(MdmTemporalSegmentAction.REOPEN, reopened.action());
        assertEquals("V2", reopened.value());

        MdmTemporalSegmentResult<String> closed = stub.close("K1", t2);
        assertEquals(MdmTemporalSegmentAction.CLOSE, closed.action());
        assertNull(closed.value(), "닫기 결과는 value 를 강제하지 않는다(계약, §6.1)");
    }

    // MaruIdNamespace/MASTER_DATA 재사용 증명은 새 스텁을 만들지 않는다(F10, TSK-07-01 design.md §3.4)
    // — 위 이름_공간_SPI_구현이_두_종류를_하나씩_덮는다()·마스터데이터_등록이_마스터코드에_있는_ID_의_소유자를_찾는다()
    // (TSK-01-02 산출, 이 파일 상단)가 MasterDataIdNamespaceStub 로 이미 증명하고 있다.

    // ── TSK-06-01 design.md §3.4 — 04(마스터코드) 계약 스텁 컴파일 ──
    // TSK-05-01 과 같게 이 파일(TSK-01-02 소유)에 메서드를 더한다. CONFIRM_CHECKS 목록은 늘리지 않는다 — MASTER_CODE
    // 구현은 target 당 하나다(F21, 불변 규칙 29).

    @Test
    void 선분_조작_서비스_스텁이_06_02_03_04_역의_호출을_인터페이스_타입으로_컴파일_동작한다() {
        MasterCodeSegmentService service = new MasterCodeSegmentServiceStub();
        VersionRef first = new VersionRef(VersionTarget.MASTER_CODE, "PROC_CD", new BigDecimal("1.000"));
        VersionRef draft = new VersionRef(VersionTarget.MASTER_CODE, "PROC_CD", new BigDecimal("1.001"));
        MasterCodeItemValues values = new MasterCodeItemValues("열연", null, 1, null,
                Arrays.asList("L1", null, null, null, null), Arrays.asList(new String[10]));
        CategoryDefinition coating = new CategoryDefinition("COATING", "도금", CategoryKind.REGEX, "^C.*",
                CategoryDefTarget.CODE, null);

        // 06-02 — 등록·복원
        service.createBaseCategory(first);
        service.fillFrom(draft, new BigDecimal("1.000"));
        // 06-03 — 코드 행
        MasterCodeVersionView view = service.viewAt(draft);
        service.addItem(draft, "82", values);
        service.changeItem(draft, "82", values);
        List<String> closedCategories = service.removeItem(draft, "82");
        service.revert(draft, new MasterCodeSegmentKey(MasterCodeSegmentTable.ITEM, null, "82"));
        // 06-04 — 카테고리·소속(전사 CategoryDefinition 을 그대로 넘긴다)
        service.addCategory(draft, coating);
        service.changeCategory(draft, coating);
        service.addCategoryMembers(draft, "MAJOR", Set.of("82"));
        service.removeCategoryMembers(draft, "MAJOR", Set.of("82"));
        service.closeCategory(draft, "MAJOR");

        assertEquals(draft, view.version());
        assertEquals(List.of("MAJOR"), closedCategories);
        assertEquals(List.of("createBaseCategory", "fillFrom:1.000", "viewAt", "addItem:82", "changeItem:82",
                "removeItem:82", "revert:ITEM", "addCategory:COATING", "changeCategory:COATING",
                "addCategoryMembers:MAJOR", "removeCategoryMembers:MAJOR", "closeCategory:MAJOR"),
                ((MasterCodeSegmentServiceStub) service).calls);
    }

    @Test
    void 마스터코드_확정_검사_보고는_10행이고_면제_위임_보류를_구분하며_check_는_report_를_편_것이다() {
        MasterCodeConfirmCheckSpi spi = (MasterCodeConfirmCheckSpi) byTarget(VersionTarget.MASTER_CODE);
        VersionRef draft = new VersionRef(VersionTarget.MASTER_CODE, "PROC_CD", new BigDecimal("1.001"));
        LocalDateTime now = LocalDateTime.of(2026, 9, 24, 10, 0, 0);

        MasterCodeConfirmCheckReport firstReport = spi.report(new ConfirmCheckRequest(draft, now, null, "s", now));
        assertEquals(Arrays.asList(MasterCodeConfirmCheckItem.values()),
                firstReport.results().stream().map(MasterCodeCheckItemResult::item).toList(), "항목 순서대로 10행");
        assertEquals(MasterCodeCheckStatus.EXEMPT, statusOf(firstReport, MasterCodeConfirmCheckItem.APPLY_FROM_ORDER));
        assertEquals(MasterCodeCheckStatus.EXEMPT, statusOf(firstReport, MasterCodeConfirmCheckItem.HAS_CHANGES));
        assertEquals(MasterCodeCheckStatus.DEFERRED, statusOf(firstReport, MasterCodeConfirmCheckItem.DEPLOY_TARGET_EXISTS));

        ConfirmCheckRequest next = new ConfirmCheckRequest(draft, now, now.minusDays(1), "s", now);
        MasterCodeConfirmCheckReport nextReport = spi.report(next);
        assertEquals(MasterCodeCheckStatus.DELEGATED, statusOf(nextReport, MasterCodeConfirmCheckItem.APPLY_FROM_ORDER));
        assertEquals(MasterCodeCheckStatus.PASSED, statusOf(nextReport, MasterCodeConfirmCheckItem.HAS_CHANGES));
        assertEquals(MasterCodeCheckStatus.DEFERRED, statusOf(nextReport, MasterCodeConfirmCheckItem.DEPLOY_TARGET_EXISTS));

        List<MdmCheckIssueView> warned = new ArrayList<>();
        nextReport.results().stream().filter(r -> r.status() == MasterCodeCheckStatus.WARNED)
                .forEach(r -> r.issues().forEach(i -> warned.add(new MdmCheckIssueView(i.code(), i.itemKey()))));
        ConfirmCheckResult flat = spi.check(next);
        assertTrue(flat.errors().isEmpty());
        assertEquals(warned, flat.warnings().stream().map(i -> new MdmCheckIssueView(i.code(), i.itemKey())).toList());
        assertEquals(List.of(new MdmCheckIssueView("CATE_ITEM_CODE_MISSING", "CATE_ITEM:MAJOR,P01")), warned);
    }

    @Test
    void diff_키는_규약_상수로만_세_표를_구분해_조립된다() {
        String sep = MasterCodeDiffConventions.TABLE_KEY_SEPARATOR;
        String part = MasterCodeDiffConventions.KEY_PART_SEPARATOR;
        String itemKey = MasterCodeSegmentTable.ITEM.name() + sep + "82";
        String cateKey = MasterCodeSegmentTable.CATE.name() + sep + "COATING";
        String cateItemKey = MasterCodeSegmentTable.CATE_ITEM.name() + sep + "MAJOR" + part + "82";

        List<VersionDiffEntry> entries = List.of(
                new VersionDiffEntry(itemKey, DiffKind.CHANGED, Map.of("NAME", "열연"), Map.of("NAME", "열연(개정)")),
                new VersionDiffEntry(cateKey, DiffKind.ADDED, null, Map.of("DEF_EXPR", "^C.*")),
                new VersionDiffEntry(cateItemKey, DiffKind.REMOVED, Map.of(), null));
        assertEquals(List.of("ITEM:82", "CATE:COATING", "CATE_ITEM:MAJOR,82"),
                entries.stream().map(VersionDiffEntry::key).toList());
    }

    private static MasterCodeCheckStatus statusOf(MasterCodeConfirmCheckReport report, MasterCodeConfirmCheckItem item) {
        return report.results().stream().filter(r -> r.item() == item).findFirst().orElseThrow().status();
    }

    private record MdmCheckIssueView(String code, String itemKey) {
    }

    // ── TSK-08-01 design.md §3.6 — 06(업무기준) 계약 스텁 컴파일 ──
    // 기존 관례(TSK-04-01·05-01)대로 이 파일에 절을 이어 붙인다.

    @Test
    void 룰_식별자_발급_소비자_스텁이_MdmRuleIdIssuer_만으로_연속_구간을_붙인다() {
        int[] counter = {4};
        MdmRuleIdIssuer inMemory = (ruleId, kind, count) -> {
            int first = counter[0] + 1;
            counter[0] += count;
            return new MdmRuleIdRange(ruleId, kind, first, counter[0]);
        };

        MdmRuleIdRange range = inMemory.issue("QLTY_GRD_JDG", MdmRuleIdKind.ROW, 3);
        assertEquals(5, range.first());
        assertEquals(7, range.last());
        assertEquals(3, range.last() - range.first() + 1, "구간 길이 = count");
        assertEquals(MdmRuleIdKind.ROW, range.kind());

        RuleIdIssuerConsumerStub consumer = new RuleIdIssuerConsumerStub(inMemory);
        assertEquals(List.of(8, 9), consumer.assignRowIds("QLTY_GRD_JDG", 2));
    }

    @Test
    void 룰_식별자_종류마다_TB_MDM_RULE_카운터_칼럼이_정해져_있다() {
        assertEquals("LAST_VAR_ID", MdmRuleIdKind.VAR.counterColumn());
        assertEquals("LAST_ROW_ID", MdmRuleIdKind.ROW.counterColumn());
        assertEquals("LAST_CASE_ID", MdmRuleIdKind.CASE.counterColumn());
        assertEquals(3, MdmRuleIdKind.values().length);
    }

    @Test
    void DefinitionLookup_구현_대상_스텁이_06_샘플을_엔진_정의로_옮긴다() {
        MdmRule rule = new MdmRule("QLTY_GRD_JDG", "품질 등급 판정", "DECISION", "MDM");
        MdmRuleVer ver = new MdmRuleVer("QLTY_GRD_JDG", new BigDecimal("1.000"), VersionKind.MAJOR, null);
        ver.setStatus("RELEASED");
        ver.setHitPolicy("FIRST");
        ver.setApplyFrom(LocalDateTime.of(2026, 9, 1, 0, 0));
        ver.setApplyTo(LocalDateTime.of(9999, 12, 31, 0, 0));
        List<MdmRuleVar> vars = List.of(
                sampleVar(5, "RESULT", "Expression", "PRC_FCT", 12L, 2),
                sampleVar(1, "COND", "2", "COIL_THK", null, 1),
                sampleVar(4, "RESULT", "Value", "QLTY_GRD", 11L, 1),
                sampleVar(2, "COND", "1", "COIL_WID", null, 2),
                sampleVar(3, "COND", "1", "SURF_GRD", null, 3));
        List<MdmRuleRow> rows = List.of(
                new MdmRuleRow("QLTY_GRD_JDG", new BigDecimal("1.000"), 4, "DEFAULT", 0, "{\"4\":{\"val\":\"C\"}}"),
                new MdmRuleRow("QLTY_GRD_JDG", new BigDecimal("1.000"), 1, "NORMAL", 1, "{}"),
                new MdmRuleRow("QLTY_GRD_JDG", new BigDecimal("1.000"), 3, "NORMAL", 3, "{}"),
                new MdmRuleRow("QLTY_GRD_JDG", new BigDecimal("1.000"), 2, "NORMAL", 2, "{}"));
        MdmRuleSet set = new MdmRuleSet("LS_A3", "3CCL 라인스피드", "[\"BASE_SPD_LKP\",\"SPD_EXC\",\"SPD_JOIN\"]");
        RuleDefinitionLookupStub stub = new RuleDefinitionLookupStub(rule, ver, vars, rows, set);
        DefinitionLookup lookup = stub;

        DefinitionLookup.RuleDefinition definition = lookup.rule("QLTY_GRD_JDG", java.time.Instant.EPOCH).orElseThrow();
        assertEquals(new BigDecimal("1.000"), definition.ver());
        assertEquals(DefinitionLookup.RuleKind.DECISION, definition.ruleKind());
        assertEquals(DefinitionLookup.HitPolicy.FIRST, definition.hitPolicy());
        assertEquals(5, definition.vars().size());
        assertEquals(4, definition.rows().size());
        assertEquals(List.of(1, 2, 3, 4, 5), definition.vars().stream().map(DefinitionLookup.RuleVar::varId).toList(),
                "VAR_KIND, SEQ 순서(06:1216)");
        assertEquals(List.of(DefinitionLookup.DispType.TWO, DefinitionLookup.DispType.ONE, DefinitionLookup.DispType.ONE,
                        DefinitionLookup.DispType.VALUE, DefinitionLookup.DispType.EXPRESSION),
                definition.vars().stream().map(DefinitionLookup.RuleVar::dispType).toList(), "D4 대응표");
        assertEquals("11", definition.vars().get(3).domainId(), "어긋남 ① — DOMAIN_ID(Long)는 문자열로 옮긴다");
        assertEquals(List.of(1, 2, 3, 4), definition.rows().stream().map(DefinitionLookup.RuleRow::rowId).toList(),
                "NORMAL 먼저, SEQ, ROW_ID 순서(06:1221)");
        DefinitionLookup.RuleRow defaultRow = definition.rows().get(3);
        assertEquals(DefinitionLookup.RowKind.DEFAULT, defaultRow.rowKind());
        assertEquals(0, defaultRow.seq());
        assertEquals(Optional.empty(), lookup.column("TB_ANY", "COL"), "column() 은 02 계약 위임 몫");
        assertEquals(Optional.empty(), lookup.rule("OTHER", java.time.Instant.EPOCH));
        assertEquals(DefinitionLookup.SetStatus.INUSE, lookup.ruleSet("LS_A3").orElseThrow().status());
        assertEquals(MdmRuleDefinitionSource.STORED_VERSION, stub.source());
    }

    @Test
    void 확정_검사_06_스텁이_row_id_키와_SEQ_CELLS_값_맵_관례를_따른다() {
        VersionConfirmCheckSpi businessRule = byTarget(VersionTarget.BUSINESS_RULE);
        VersionDiff diff = businessRule.diff(new VersionRef(VersionTarget.BUSINESS_RULE, "QLTY_GRD_JDG", new BigDecimal("2.000")));
        var entry = diff.entries().get(0);
        Integer.parseInt(entry.key()); // row_id 10진 문자열이 아니면 NumberFormatException
        assertEquals(Set.of(MdmRuleDiffConventions.SEQ, MdmRuleDiffConventions.CELLS), entry.oldValues().keySet());
        assertEquals(Set.of(MdmRuleDiffConventions.SEQ, MdmRuleDiffConventions.CELLS), entry.newValues().keySet());
        assertEquals("SEQ", MdmRuleDiffConventions.SEQ);
        assertEquals("CELLS", MdmRuleDiffConventions.CELLS);
    }

    @Test
    void 확정_검사_항목은_넷이고_룰_참조_검사가_없으며_정의_출처는_둘이다() {
        assertEquals(List.of("SAVE_CHECKS", "NOT_EMPTY", "TEST_CASES", "RESULT_VAR_RELEASED"),
                Arrays.stream(MdmRuleConfirmCheckItem.values()).map(Enum::name).toList());
        assertEquals(List.of("STORED_VERSION", "REQUEST_BODY"),
                Arrays.stream(MdmRuleDefinitionSource.values()).map(Enum::name).toList());
    }

    private static MdmRuleVar sampleVar(int varId, String kind, String disp, String name, Long domainId, int seq) {
        MdmRuleVar v = new MdmRuleVar("QLTY_GRD_JDG", new BigDecimal("1.000"), varId, kind, seq);
        v.setDispType(disp);
        v.setVarName(name);
        v.setDomainId(domainId);
        return v;
    }
}
