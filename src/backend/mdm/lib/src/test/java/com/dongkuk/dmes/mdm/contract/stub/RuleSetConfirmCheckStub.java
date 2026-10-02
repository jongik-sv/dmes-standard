package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleSetConfirmCheckItem;
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

/** D-144 2단계 — 룰 세트 확정 검사 SPI 스텁. diff 키는 {@code NODE:<노드 ID>}·{@code EDGE:<선 ID>}(RuleSetVersionDiffs 와 같은 관례). */
public class RuleSetConfirmCheckStub implements VersionConfirmCheckSpi {

    @Override
    public VersionTarget target() {
        return VersionTarget.RULE_SET;
    }

    @Override
    public VersionDiff diff(VersionRef draft) {
        VersionRef base = new VersionRef(VersionTarget.RULE_SET, draft.objectId(), draft.ver().subtract(BigDecimal.ONE));
        VersionDiffEntry changed = new VersionDiffEntry("NODE:r1", DiffKind.CHANGED,
                Map.of("kind", "RULE", "ruleId", "R_OLD"), Map.of("kind", "RULE", "ruleId", "R_NEW"));
        return new VersionDiff(base, draft, List.of(changed));
    }

    @Override
    public ConfirmCheckResult check(ConfirmCheckRequest request) {
        MdmCheckIssue error = new MdmCheckIssue(MdmErrorCode.CONFIRM_CHECK_FAILED.code(),
                "R_NEW 에 적용 시각의 RELEASED 버전이 없습니다", MdmRuleSetConfirmCheckItem.RULES_RELEASED.name(), "RULE:R_NEW");
        return new ConfirmCheckResult(List.of(error), List.of());
    }
}
