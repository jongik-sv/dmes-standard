package com.dongkuk.dmes.mdm.common.dictionary;

import com.dongkuk.dmes.mdm.contract.dictionary.MdmCodeRef;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmEffectiveDomain;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.CodeRef;

/**
 * 상속 체인 조립 결과(TSK-04-03 design.md §3.3) — 저장하지 않는 파생값이다(불변 I1). 계약 {@link MdmEffectiveDomain} 보다
 * 넓다(종류·타입·길이·소수·단위 포함).
 *
 * @param chainStdExpr 조상~자신의 표준식만 AND 로 이은 것(CODE 의 MASTER 식 제외). 엔진 검증기가 CODE 면 MASTER 를 스스로 붙인다
 * @param stdExpr      화면·계약용 유효 표준식 — CODE 면 {@code MASTER("id","cate",value)} 를 뒤에 더한다
 */
public record EffectiveDomainView(
        Long domainId,
        String domainKind,
        String dataType,
        Integer length,
        Integer scale,
        String unitCode,
        CodeRef codeRef,
        String chainStdExpr,
        String stdExpr,
        Map<String, Object> stdAst,
        String bizExpr,
        Map<String, Object> bizAst,
        List<String> bizRequiredVars) {

    public String stdAstJson() {
        return DomainJson.write(stdAst);
    }

    public String bizAstJson() {
        return DomainJson.write(bizAst);
    }

    public MdmEffectiveDomain toContract() {
        return new MdmEffectiveDomain(domainId, stdExpr, stdAstJson(), bizExpr, bizAstJson(), bizRequiredVars,
                codeRef == null ? null : new MdmCodeRef(codeRef.maruCodeId(), codeRef.cateId()));
    }
}
