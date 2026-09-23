package com.dongkuk.dmes.mdm.dma.domainMng.service;

import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeSnapshot;
import com.dongkuk.dmes.mdm.dma.domainMng.dto.DomainDraftRequest;
import java.util.List;
import java.util.Map;

/**
 * 정규화한 화면 초안(TSK-04-03 design.md §3.1). 문자열은 앞뒤 공백을 자르고 빈 문자열은 null 로 본다(§3.3 diff 규칙과 같다).
 */
public record DomainDraft(
        Long domainId,
        Long ver,
        String domainName,
        String stdName,
        Long parentDomainId,
        String domainKind,
        String dataType,
        Integer length,
        Integer scale,
        String unitCode,
        String maruCodeId,
        String cateId,
        String stdRule,
        String bizRule,
        String description,
        List<DomainTestCase> testCases,
        List<String> examples) {

    public static DomainDraft from(DomainDraftRequest r, List<Map<String, Object>> testCaseRows,
                                   List<Map<String, Object>> exampleRows) {
        return new DomainDraft(r.getDomainId(), r.getVer(), norm(r.getDomainName()), norm(r.getStdName()),
                r.getParentDomainId(), norm(r.getDomainKind()), norm(r.getDataType()), r.getLength(), r.getScale(),
                norm(r.getUnitCode()), norm(r.getMaruCodeId()), norm(r.getCateId()), norm(r.getStdRule()),
                norm(r.getBizRule()), norm(r.getDescription()), DomainTestCases.fromRows(testCaseRows),
                DomainTestCases.examplesFromRows(exampleRows));
    }

    /** 스냅샷 id — 신규는 {@link DomainTreeSnapshot#DRAFT_ID}. */
    public long nodeId() {
        return domainId != null ? domainId : DomainTreeSnapshot.DRAFT_ID;
    }

    /** 스냅샷에 얹을 행. AST 는 호출자가 컴파일해 준다(파싱되지 않으면 null). */
    public DomainNode toNode(Map<String, Object> stdAst, Map<String, Object> bizAst, Long storedVer) {
        return new DomainNode(nodeId(), parentDomainId, domainName, stdName, domainKind, dataType, length, scale,
                unitCode, maruCodeId, cateId, stdRule, stdAst, bizRule, bizAst, description,
                DomainTestCases.examplesToJson(examples), DomainTestCases.toJson(testCases), storedVer);
    }

    static String norm(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
