package com.dongkuk.dmes.mdm.common.rule.confirm;

import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import org.springframework.stereotype.Component;

/**
 * BUSINESS_RULE 확정 검사 SPI 운영 구현(TSK-08-05 design §6.1). 판정 코드가 없다 — {@link RuleConfirmChecks} 에 위임만 한다(I11). apply_from
 * 순서는 공통 서비스가 SPI 전에 검사하므로 반복하지 않는다.
 */
@Component
public class RuleConfirmCheck implements VersionConfirmCheckSpi {

    private final RuleConfirmChecks checks;

    public RuleConfirmCheck(RuleConfirmChecks checks) {
        this.checks = checks;
    }

    @Override
    public VersionTarget target() {
        return VersionTarget.BUSINESS_RULE;
    }

    @Override
    public VersionDiff diff(VersionRef draft) {
        return checks.diff(draft);
    }

    @Override
    public ConfirmCheckResult check(ConfirmCheckRequest request) {
        return RuleConfirmReport.flatten(checks.report(request.draft()));
    }
}
