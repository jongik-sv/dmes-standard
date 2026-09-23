package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.ApplyFromOrderCheck;
import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * 확정 시 apply_from 순서 검사(TSK-01-03 B16, ADR-0002 D4-3). 직전 RELEASED 의 apply_from 보다 엄격히 뒤여야 하고
 * (같으면 거부), 최초 버전은 면제, 소급(과거 일시)은 허용한다.
 */
@Component
public class DefaultApplyFromOrderCheck implements ApplyFromOrderCheck {

    @Override
    public Optional<MdmCheckIssue> check(LocalDateTime previousReleasedApplyFrom, LocalDateTime requestedApplyFrom) {
        if (previousReleasedApplyFrom == null || requestedApplyFrom.isAfter(previousReleasedApplyFrom)) {
            return Optional.empty();
        }
        MdmErrorCode code = MdmErrorCode.APPLY_FROM_NOT_AFTER_PREVIOUS;
        return Optional.of(new MdmCheckIssue(code.code(), code.defaultMessage(), "applyFrom", null));
    }
}
