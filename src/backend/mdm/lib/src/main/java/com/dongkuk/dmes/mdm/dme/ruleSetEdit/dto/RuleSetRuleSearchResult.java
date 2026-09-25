package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

import com.dongkuk.dmes.mdm.common.rule.RuleIo;
import java.util.List;

/** {@code ruleSetEdit} search target=RULE 응답 — 룰 추가 후보 20건과 각 룰의 입출력(화면이 목록에 더한 뒤 바로 다시 계산한다). */
public class RuleSetRuleSearchResult {

    private List<RuleIo> rules;

    public RuleSetRuleSearchResult() {
    }

    public RuleSetRuleSearchResult(List<RuleIo> rules) {
        this.rules = rules;
    }

    public List<RuleIo> getRules() { return rules; }

    public void setRules(List<RuleIo> v) { this.rules = v; }
}
