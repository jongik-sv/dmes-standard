package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.version.VersionDraftDeletionSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.util.ArrayList;
import java.util.List;

/** ERD 단계 0 — ERD 모델 DRAFT 삭제 훅 스텁. 실구현은 편집자 표(TB_MDM_ERD_EDITOR)를 먼저 지운다. */
public class ErdModelDraftDeletionStub implements VersionDraftDeletionSpi {

    public final List<VersionRef> calls = new ArrayList<>();

    @Override
    public VersionTarget target() {
        return VersionTarget.ERD_MODEL;
    }

    @Override
    public void beforeDraftDelete(VersionRef draft) {
        calls.add(draft);
    }
}
