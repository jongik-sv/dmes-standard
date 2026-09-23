package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainDraft;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmEffectiveDomain;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmEffectiveDomainResolver;

/**
 * 04-03(유효 식·유효 코드 참조 해석 구현체) 역 흉내(TSK-04-01 design.md §3.4) — {@link MdmEffectiveDomainResolver}
 * 만 구현해 컴파일·단순 동작을 보인다. AND 체이닝 조립 로직은 흉내 내지 않는다(F8 — 그 로직은 이 Task 밖).
 */
public class EffectiveDomainConsumerStub implements MdmEffectiveDomainResolver {

    @Override
    public MdmEffectiveDomain resolve(Long domainId) {
        return new MdmEffectiveDomain(domainId, "expr", "{}", "bizExpr", "{}",
                java.util.List.of(), null);
    }

    @Override
    public MdmEffectiveDomain resolveDraft(MdmDomainDraft draft) {
        return new MdmEffectiveDomain(draft.domainId(), draft.stdRule(), "{}", draft.bizRule(), "{}",
                java.util.List.of(), draft.codeRef());
    }
}
