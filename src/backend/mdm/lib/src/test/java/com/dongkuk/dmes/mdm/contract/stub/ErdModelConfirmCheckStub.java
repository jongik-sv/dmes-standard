package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/** ERD 단계 0 — ERD 모델 확정 검사 SPI 스텁. 실구현은 확정 검사 Task 가 맡는다. diff 키는 {@code TABLE:<표 UUID>}, 검사 결과는 빈 목록이다. */
public class ErdModelConfirmCheckStub implements VersionConfirmCheckSpi {

    @Override
    public VersionTarget target() {
        return VersionTarget.ERD_MODEL;
    }

    @Override
    public VersionDiff diff(VersionRef draft) {
        VersionRef base = new VersionRef(VersionTarget.ERD_MODEL, draft.objectId(), draft.ver().subtract(BigDecimal.ONE));
        VersionDiffEntry changed = new VersionDiffEntry("TABLE:t-1", DiffKind.CHANGED, Map.of("LOGICAL_NAME", "a"), Map.of("LOGICAL_NAME", "b"));
        return new VersionDiff(base, draft, List.of(changed));
    }

    @Override
    public ConfirmCheckResult check(ConfirmCheckRequest request) {
        return new ConfirmCheckResult(List.of(), List.of());
    }
}
