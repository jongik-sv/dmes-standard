package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainReference;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainReferenceSpi;
import java.util.List;
import java.util.Set;

/**
 * 03·06 이 구현하는 {@link MdmDomainReferenceSpi} 흉내(TSK-04-01 design.md §3.4, D9). {@code refKind} 로
 * 03("LAYOUT_ITEM")·06("RULE_VAR") 역을 구분한다.
 */
public class DomainReferenceSpiStub implements MdmDomainReferenceSpi {

    private final String refKind;
    private final List<MdmDomainReference> fixed;

    public DomainReferenceSpiStub(String refKind, List<MdmDomainReference> fixed) {
        this.refKind = refKind;
        this.fixed = fixed;
    }

    @Override
    public List<MdmDomainReference> referencesTo(Set<Long> domainIds, Set<String> columnPhysNames) {
        return fixed.stream().filter(r -> r.refKind().equals(refKind)).toList();
    }
}
