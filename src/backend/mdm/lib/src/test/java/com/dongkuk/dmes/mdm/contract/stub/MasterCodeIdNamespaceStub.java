package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.category.MaruIdKind;
import com.dongkuk.dmes.mdm.contract.category.MaruIdNamespace;
import java.util.Set;

/**
 * TSK-01-02 design.md §3.1 T8 — 04 마루 코드(TB_MDM_CODE) 역할 이름 공간 스텁. 고정 집합으로 조회한다.
 */
public class MasterCodeIdNamespaceStub implements MaruIdNamespace {

    private final Set<String> ids;

    public MasterCodeIdNamespaceStub(Set<String> ids) {
        this.ids = Set.copyOf(ids);
    }

    @Override
    public MaruIdKind kind() {
        return MaruIdKind.MASTER_CODE;
    }

    @Override
    public boolean contains(String maruId) {
        return ids.contains(maruId);
    }
}
