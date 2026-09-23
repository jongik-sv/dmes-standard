package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.ApplyFromOrderCheck;
import java.time.LocalDateTime;
import java.util.Optional;

/**
 * TSK-01-02 design.md §3.1 T10 — {@link ApplyFromOrderCheck} 의 test 전용 참조 구현.
 * ADR-0002 D4-3: 직전 RELEASED 의 apply_from 보다 엄격히 뒤여야 하고, 최초 버전은 면제한다.
 */
public class ApplyFromOrderCheckStub implements ApplyFromOrderCheck {

    @Override
    public Optional<MdmCheckIssue> check(LocalDateTime previousReleasedApplyFrom, LocalDateTime requestedApplyFrom) {
        if (previousReleasedApplyFrom == null || requestedApplyFrom.isAfter(previousReleasedApplyFrom)) {
            return Optional.empty();
        }
        MdmErrorCode code = MdmErrorCode.APPLY_FROM_NOT_AFTER_PREVIOUS;
        return Optional.of(new MdmCheckIssue(code.code(), code.defaultMessage(), "applyFrom", null));
    }
}
