package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
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

/**
 * D-144 3단계 — 레이아웃 확정 검사 SPI 스텁(Ruling P3-6, 실구현은 Task 7). diff 키는 {@code ITEM:<SEQ>}, 검사 이슈의 itemKey 는
 * {@code 레이아웃ID@버전}(헤더 확정 영향 경고와 같은 관례).
 */
public class LayoutConfirmCheckStub implements VersionConfirmCheckSpi {

    @Override
    public VersionTarget target() {
        return VersionTarget.LAYOUT;
    }

    @Override
    public VersionDiff diff(VersionRef draft) {
        VersionRef base = new VersionRef(VersionTarget.LAYOUT, draft.objectId(), draft.ver().subtract(BigDecimal.ONE));
        VersionDiffEntry changed = new VersionDiffEntry("ITEM:3", DiffKind.CHANGED, Map.of("LENGTH", 4), Map.of("LENGTH", 5));
        return new VersionDiff(base, draft, List.of(changed));
    }

    @Override
    public ConfirmCheckResult check(ConfirmCheckRequest request) {
        MdmCheckIssue error = new MdmCheckIssue(MdmErrorCode.CONFIRM_CHECK_FAILED.code(),
                "헤더 110 에 적용 시각의 RELEASED 버전이 없습니다", "HEADER_LAYOUT_ID", request.draft().objectId() + "@2.000");
        return new ConfirmCheckResult(List.of(error), List.of());
    }
}
