package com.dongkuk.dmes.mdm.common.dictionary;

import com.dongkuk.dmes.mdm.entity.MdmDomain;
import java.util.Map;

/**
 * 도메인 트리 스냅샷의 한 행(TSK-04-03 design.md §2) — {@code TB_MDM_DOMAIN} 원시 값 + 파싱해 둔 자기 AST.
 * 자기 행 값만 담는다. 유효값(부모에 기대는 값)은 {@link DomainChainAssembler} 가 쓸 때 조립한다(02:103-134).
 *
 * @param stdAst {@code STD_AST} JSON 을 읽은 Map. 규칙이 없으면 null
 * @param bizAst {@code BIZ_AST} JSON 을 읽은 Map
 * @param ver    감사 {@code VER}(동시 수정 비교, design D5)
 */
public record DomainNode(
        Long domainId,
        Long parentDomainId,
        String domainName,
        String stdName,
        String domainKind,
        String dataType,
        Integer length,
        Integer scale,
        String unitCode,
        String maruCodeId,
        String cateId,
        String stdRule,
        Map<String, Object> stdAst,
        String bizRule,
        Map<String, Object> bizAst,
        String description,
        String examplesJson,
        String testCasesJson,
        Long ver) {

    public static DomainNode from(MdmDomain e) {
        return new DomainNode(e.getDomainId(), e.getParentDomainId(), e.getDomainName(), e.getStdName(),
                e.getDomainKind(), e.getDataType(), e.getLength(), e.getScale(), e.getUnitCode(), e.getMaruCodeId(),
                e.getCateId(), e.getStdRule(), DomainJson.readMap(e.getStdAst()), e.getBizRule(),
                DomainJson.readMap(e.getBizAst()), e.getDescription(), e.getExamples(), e.getTestCases(), e.getVersion());
    }
}
