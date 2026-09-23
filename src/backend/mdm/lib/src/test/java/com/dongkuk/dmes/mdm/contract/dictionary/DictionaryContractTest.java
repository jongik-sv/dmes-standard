package com.dongkuk.dmes.mdm.contract.dictionary;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * TSK-04-01 design.md §3.4·§7 — {@code contract.dictionary} 세 그룹(컬럼 사전·유효 도메인·영향도)의
 * record 가 필드를 보존하는지, enum 값 집합이 design.md §7.1 과 같은지 확인한다.
 *
 * <p>엔진(현재 문서 초안뿐, F15)의 {@code DomainKind}·{@code DataType} 과의 컴파일 교차 검증은 대상이
 * 컴파일되지 않아 이 Task 에 없다(불변 규칙 6, §8 인계 — TSK-03-01 몫).
 */
class DictionaryContractTest {

    @Test
    void 도메인_종류는_QTY_CODE_ID_TEXT_DATE_FLAG_6종이다() {
        assertEquals(List.of("QTY", "CODE", "ID", "TEXT", "DATE", "FLAG"),
                Arrays.stream(MdmDomainKind.values()).map(Enum::name).toList());
    }

    @Test
    void 데이터_타입은_NUMBER_STRING_BOOLEAN_DATE_4종이다() {
        assertEquals(List.of("NUMBER", "STRING", "BOOLEAN", "DATE"),
                Arrays.stream(MdmDataType.values()).map(Enum::name).toList());
    }

    @Test
    void 마스터_코드_참조_record_는_필드를_보존한다() {
        MdmCodeRef ref = new MdmCodeRef("MC-1", "CATE-1");
        assertEquals("MC-1", ref.maruCodeId());
        assertEquals("CATE-1", ref.cateId());
    }

    @Test
    void 컬럼_사전_항목_record_는_14개_필드를_보존한다() {
        MdmColumnDictionaryEntry entry = new MdmColumnDictionaryEntry(
                1L, "품목코드", "ITEM_CD", 10L, MdmDomainKind.CODE, true,
                "품목 코드", "품목코드", "품목", "N/A", "LAYOUT_ITEM", "L-1", "C-1", "비고");
        assertEquals(1L, entry.columnId());
        assertEquals("품목코드", entry.columnName());
        assertEquals("ITEM_CD", entry.physName());
        assertEquals(10L, entry.domainId());
        assertEquals(MdmDomainKind.CODE, entry.domainKind());
        assertEquals(true, entry.required());
        assertEquals("품목 코드", entry.labelLong());
        assertEquals("품목코드", entry.labelMid());
        assertEquals("품목", entry.labelShort());
        assertEquals("N/A", entry.defaultValue());
        assertEquals("LAYOUT_ITEM", entry.refKind());
        assertEquals("L-1", entry.refTarget());
        assertEquals("C-1", entry.refCateId());
        assertEquals("비고", entry.usageNote());
    }

    @Test
    void 도메인_초안_record_는_부모_링크와_규칙을_보존한다() {
        MdmCodeRef ref = new MdmCodeRef("MC-1", "CATE-1");
        MdmDomainDraft draft = new MdmDomainDraft(null, 7L, MdmDomainKind.FLAG, "std", "biz", ref);
        assertNull(draft.domainId(), "아직 저장되지 않은 초안이라 domainId 는 null 일 수 있다");
        assertEquals(7L, draft.parentDomainId());
        assertEquals(MdmDomainKind.FLAG, draft.domainKind());
        assertEquals("std", draft.stdRule());
        assertEquals("biz", draft.bizRule());
        assertEquals(ref, draft.codeRef());
    }

    @Test
    void 유효_도메인_record_는_조립_결과_모양을_보존한다() {
        MdmEffectiveDomain effective = new MdmEffectiveDomain(
                1L, "std expr", "{\"std\":true}", "biz expr", "{\"biz\":true}",
                List.of("VAR1", "VAR2"), new MdmCodeRef("MC-1", "CATE-1"));
        assertEquals(1L, effective.domainId());
        assertEquals("std expr", effective.effectiveStdExpr());
        assertEquals("{\"std\":true}", effective.effectiveStdAstJson());
        assertEquals("biz expr", effective.effectiveBizExpr());
        assertEquals("{\"biz\":true}", effective.effectiveBizAstJson());
        assertEquals(List.of("VAR1", "VAR2"), effective.bizRequiredVars());
        assertEquals("MC-1", effective.effectiveCodeRef().maruCodeId());
    }

    @Test
    void 도메인_참조_record_는_refKind_refKey_를_보존한다() {
        MdmDomainReference reference = new MdmDomainReference("RULE_VAR", "R-1");
        assertEquals("RULE_VAR", reference.refKind());
        assertEquals("R-1", reference.refKey());
    }

    @Test
    void 도메인_영향도_record_는_네_목록을_보존한다() {
        MdmDomainImpact impact = new MdmDomainImpact(
                1L, List.of(2L, 3L), List.of(10L),
                List.of(new MdmDomainReference("LAYOUT_ITEM", "L-1")), List.of("ERP", "MES"));
        assertEquals(1L, impact.domainId());
        assertEquals(List.of(2L, 3L), impact.descendantDomainIds());
        assertEquals(List.of(10L), impact.referencingColumnIds());
        assertEquals(1, impact.externalReferences().size());
        assertEquals(List.of("ERP", "MES"), impact.affectedSystemCodes());
    }
}
