package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.category.MaruIdKind;
import com.dongkuk.dmes.mdm.contract.category.MaruIdNamespace;
import java.util.Set;

/**
 * TSK-01-02 design.md §3.1 T8 — 05 마루 데이터(TB_MDM_DATA) 역할 이름 공간 스텁. 고정 집합으로 조회한다.
 */
public class MasterDataIdNamespaceStub implements MaruIdNamespace {

    private final Set<String> ids;

    public MasterDataIdNamespaceStub(Set<String> ids) {
        this.ids = Set.copyOf(ids);
    }

    @Override
    public MaruIdKind kind() {
        return MaruIdKind.MASTER_DATA;
    }

    @Override
    public boolean contains(String maruId) {
        return ids.contains(maruId);
    }
}
