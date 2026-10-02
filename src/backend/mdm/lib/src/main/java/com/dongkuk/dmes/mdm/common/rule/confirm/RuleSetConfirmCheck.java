package com.dongkuk.dmes.mdm.common.rule.confirm;

import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import org.springframework.stereotype.Component;

/** RULE_SET 확정 검사 SPI 운영 구현(D-144 2단계). 판정은 {@link RuleSetConfirmChecks} 에 위임한다. apply_from 순서는 공통 서비스가 본다. */
@Component
public class RuleSetConfirmCheck implements VersionConfirmCheckSpi {

    private final RuleSetConfirmChecks checks;

    public RuleSetConfirmCheck(RuleSetConfirmChecks checks) {
        this.checks = checks;
    }

    @Override
    public VersionTarget target() {
        return VersionTarget.RULE_SET;
    }

    @Override
    public VersionDiff diff(VersionRef draft) {
        return checks.diff(draft);
    }

    @Override
    public ConfirmCheckResult check(ConfirmCheckRequest request) {
        return RuleSetConfirmReport.flatten(checks.report(request.draft(), request.requestedApplyFrom()));
    }
}
