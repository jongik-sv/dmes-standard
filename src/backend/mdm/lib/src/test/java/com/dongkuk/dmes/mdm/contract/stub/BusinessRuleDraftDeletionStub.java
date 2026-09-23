package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.version.VersionDraftDeletionSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.util.ArrayList;
import java.util.List;

/**
 * TSK-01-03 design.md §2.1 K5 — 06 DRAFT 삭제 정리 훅 스텁. 06 은 VAR·ROW 가 CASCADE 로 지워지므로 실구현(TSK-08-02)도
 * 빈 구현이지만 등록은 해야 한다(미등록이면 삭제가 fail-closed, D4).
 */
public class BusinessRuleDraftDeletionStub implements VersionDraftDeletionSpi {

    public final List<VersionRef> calls = new ArrayList<>();

    @Override
    public VersionTarget target() {
        return VersionTarget.BUSINESS_RULE;
    }

    @Override
    public void beforeDraftDelete(VersionRef draft) {
        calls.add(draft);
    }
}
