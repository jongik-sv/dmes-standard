package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.version.VersionDraftDeletionSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.util.ArrayList;
import java.util.List;

/** D-144 2단계 — 룰 세트 DRAFT 삭제 훅 스텁. 세트 버전 행에는 자식 표가 없어 실구현도 빈 구현이다. */
public class RuleSetDraftDeletionStub implements VersionDraftDeletionSpi {

    public final List<VersionRef> calls = new ArrayList<>();

    @Override
    public VersionTarget target() {
        return VersionTarget.RULE_SET;
    }

    @Override
    public void beforeDraftDelete(VersionRef draft) {
        calls.add(draft);
    }
}
