package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.contract.category.MaruIdKind;
import com.dongkuk.dmes.mdm.contract.category.MaruIdNamespace;
import com.dongkuk.dmes.mdm.repository.MdmCodeRepository;
import org.springframework.stereotype.Component;

/**
 * 마루 ID 이름 공간 — 마루 코드 쪽(TSK-06-01 인계, TSK-06-02 design.md §2). 마루 데이터 등록(TSK-07-02)이 같은 ID 가
 * TB_MDM_CODE 에 있는지 볼 때 쓴다. MASTER_DATA 쪽 빈은 07-02 몫이다(D4).
 */
@Component
public class MasterCodeIdNamespace implements MaruIdNamespace {

    private final MdmCodeRepository codes;

    public MasterCodeIdNamespace(MdmCodeRepository codes) {
        this.codes = codes;
    }

    @Override
    public MaruIdKind kind() {
        return MaruIdKind.MASTER_CODE;
    }

    @Override
    public boolean contains(String maruId) {
        return maruId != null && !maruId.isBlank() && codes.existsById(maruId);
    }
}
