package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleConfirmCheckItem;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleDiffConventions;
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
 * TSK-01-02 design.md §3.1 T7 — 06 업무기준(룰) 역할 스텁. 실구현은 TSK-08-01(선언)·08-05(구현)가 한다.
 * 가치는 컴파일이다: {@link VersionConfirmCheckSpi} 시그니처가 바뀌면 이 클래스가 깨진다(불변 규칙 I16).
 *
 * <p>TSK-08-01 design.md §6.5·D10 — 06 diff 관례를 반영한다: key 는 {@code row_id} 의 10진 문자열, 값 맵 키는
 * {@link MdmRuleDiffConventions#SEQ}·{@link MdmRuleDiffConventions#CELLS}. 검사 오류의 field 는 확정 검사 항목 이름이다.
 */
public class BusinessRuleConfirmCheckStub implements VersionConfirmCheckSpi {

    @Override
    public VersionTarget target() {
        return VersionTarget.BUSINESS_RULE;
    }

    @Override
    public VersionDiff diff(VersionRef draft) {
        VersionRef base = new VersionRef(VersionTarget.BUSINESS_RULE, draft.objectId(),
                draft.ver().subtract(BigDecimal.ONE));
        VersionDiffEntry changed = new VersionDiffEntry("15", DiffKind.CHANGED,
                Map.of(MdmRuleDiffConventions.SEQ, 1, MdmRuleDiffConventions.CELLS, "{\"4\":{\"val\":\"A\"}}"),
                Map.of(MdmRuleDiffConventions.SEQ, 1, MdmRuleDiffConventions.CELLS, "{\"4\":{\"val\":\"B\"}}"));
        return new VersionDiff(base, draft, List.of(changed));
    }

    @Override
    public ConfirmCheckResult check(ConfirmCheckRequest request) {
        MdmCheckIssue error = new MdmCheckIssue(MdmErrorCode.CONFIRM_CHECK_FAILED.code(),
                "룰 행이 없습니다", MdmRuleConfirmCheckItem.NOT_EMPTY.name(), "15");
        return new ConfirmCheckResult(List.of(error), List.of());
    }
}
