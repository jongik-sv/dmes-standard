package com.dongkuk.dmes.mdm.contract.rule.violation;

import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdIssuer;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdKind;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdRange;

/**
 * TSK-08-01 design.md §3.7-3 — 공허 통과 방지 음성 테스트 전용 고립 클래스. {@link MdmRuleIdIssuer} 를 구현해
 * "발급기 구현 클래스가 없다" 규칙의 위반 표본이 된다. test 에만 둔다(main 으로 옮기면 그 규칙이 이 클래스를 잡는다).
 */
public class ViolatingIssuer implements MdmRuleIdIssuer {

    @Override
    public MdmRuleIdRange issue(String maruRuleId, MdmRuleIdKind kind, int count) {
        return new MdmRuleIdRange(maruRuleId, kind, 1, count);
    }
}
