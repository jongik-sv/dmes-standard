package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.util.List;
import java.util.Map;

/**
 * TSK-01-02 design.md §3.1 T6 — 04 마루 코드 역할 스텁. 실구현은 TSK-06-01(선언)·06-05(구현)가 한다.
 * 가치는 컴파일이다: {@link VersionConfirmCheckSpi} 시그니처가 바뀌면 이 클래스가 깨진다(불변 규칙 I16).
 */
public class MasterCodeConfirmCheckStub implements VersionConfirmCheckSpi {

    @Override
    public VersionTarget target() {
        return VersionTarget.MASTER_CODE;
    }

    @Override
    public VersionDiff diff(VersionRef draft) {
        // 04 는 SAME 을 내지 않는다(design.md §2.9). 최초 버전이면 base 가 null.
        VersionDiffEntry added = new VersionDiffEntry("P01", DiffKind.ADDED, null, Map.of("CODE_NAME", "신규 코드"));
        return new VersionDiff(null, draft, List.of(added));
    }

    @Override
    public ConfirmCheckResult check(ConfirmCheckRequest request) {
        // 2-1 경고 모양: 오류는 없고 경고 1건 — 담당자가 확인(warningsAcknowledged)하면 확정할 수 있다.
        MdmCheckIssue warning = new MdmCheckIssue("W2-1", "사용 중인 코드가 삭제됩니다", null, "P01");
        return new ConfirmCheckResult(List.of(), List.of(warning));
    }
}
