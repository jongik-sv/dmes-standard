package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.version.VersionDraftDeletionSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.util.ArrayList;
import java.util.List;

/**
 * TSK-01-03 design.md §2.1 K5 — 04 DRAFT 삭제 정리 훅 스텁. 실구현은 TSK-06-02 가 한다(to_ver = V 행 되돌리기,
 * from_ver = V 행 삭제). 가치는 컴파일이다: {@link VersionDraftDeletionSpi} 시그니처가 바뀌면 이 클래스가 깨진다.
 */
public class MasterCodeDraftDeletionStub implements VersionDraftDeletionSpi {

    public final List<VersionRef> calls = new ArrayList<>();

    @Override
    public VersionTarget target() {
        return VersionTarget.MASTER_CODE;
    }

    @Override
    public void beforeDraftDelete(VersionRef draft) {
        calls.add(draft);
    }
}
