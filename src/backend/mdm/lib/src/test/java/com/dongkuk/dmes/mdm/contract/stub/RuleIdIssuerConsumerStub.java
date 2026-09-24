package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdIssuer;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdKind;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdRange;
import java.util.ArrayList;
import java.util.List;

/**
 * TSK-08-01 design.md §3.6 — TSK-08-02(룰 행 그리드 저장) 역할 스텁. {@link MdmRuleIdIssuer} 만 알고, 새 행 N개에
 * {@code issue(ruleId, ROW, N)} 로 받은 연속 구간을 차례로 붙인다. 가치는 컴파일이다: 발급 계약 서명이 바뀌면 깨진다
 * (불변 규칙 23).
 */
public class RuleIdIssuerConsumerStub {

    private final MdmRuleIdIssuer issuer;

    public RuleIdIssuerConsumerStub(MdmRuleIdIssuer issuer) {
        this.issuer = issuer;
    }

    /** 새 행 {@code newRows} 개의 ROW_ID 를 한 번의 발급으로 받아 순서대로 돌려준다. */
    public List<Integer> assignRowIds(String maruRuleId, int newRows) {
        MdmRuleIdRange range = issuer.issue(maruRuleId, MdmRuleIdKind.ROW, newRows);
        List<Integer> ids = new ArrayList<>(newRows);
        for (int id = range.first(); id <= range.last(); id++) {
            ids.add(id);
        }
        return ids;
    }
}
