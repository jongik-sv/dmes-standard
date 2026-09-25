package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

import com.dongkuk.dmes.mdm.common.rule.RuleIo;
import com.dongkuk.dmes.mdm.common.rule.RuleSetGuide;
import java.util.List;

/**
 * {@code ruleSetEdit} search target=GUIDE 응답(TSK-08-06 design §6.4) — 제안 순서·고르기·오류와 제안 룰의 입출력({@code order} 순).
 * 오류면 {@code order}·{@code ambiguous}·{@code rules} 는 빈 목록이다. 제안일 뿐 저장하지 않는다.
 */
public class RuleSetGuideResult {

    private String target;
    private List<String> order;
    private List<RuleSetGuide.Ambiguity> ambiguous;
    private String error;
    private List<RuleIo> rules;

    public RuleSetGuideResult() {
    }

    public RuleSetGuideResult(String target, List<String> order, List<RuleSetGuide.Ambiguity> ambiguous, String error, List<RuleIo> rules) {
        this.target = target;
        this.order = order;
        this.ambiguous = ambiguous;
        this.error = error;
        this.rules = rules;
    }

    public String getTarget() { return target; }
    public List<String> getOrder() { return order; }
    public List<RuleSetGuide.Ambiguity> getAmbiguous() { return ambiguous; }
    public String getError() { return error; }
    public List<RuleIo> getRules() { return rules; }

    public void setTarget(String v) { this.target = v; }
    public void setOrder(List<String> v) { this.order = v; }
    public void setAmbiguous(List<RuleSetGuide.Ambiguity> v) { this.ambiguous = v; }
    public void setError(String v) { this.error = v; }
    public void setRules(List<RuleIo> v) { this.rules = v; }
}
