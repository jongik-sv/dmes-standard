package com.dongkuk.dmes.mdm.dme.ruleCalc.dto;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@code ruleCalc} action=run 응답(문서 §3). 값은 §4 규칙: NUMBER 는 {@code toPlainString} 문자열, BOOLEAN 은 불린, 그 밖은 문자열, 없으면
 * null, 목록은 배열이다.
 */
public class RuleCalcRunResult {

    private boolean ok;
    private Map<String, Object> result = new LinkedHashMap<>();
    private List<Step> steps = new ArrayList<>();
    private List<RuleCalcMessage> messages = new ArrayList<>();

    public boolean isOk() { return ok; }
    public Map<String, Object> getResult() { return result; }
    public List<Step> getSteps() { return steps; }
    public List<RuleCalcMessage> getMessages() { return messages; }

    public void setOk(boolean v) { this.ok = v; }
    public void setResult(Map<String, Object> v) { this.result = v; }
    public void setSteps(List<Step> v) { this.steps = v; }
    public void setMessages(List<RuleCalcMessage> v) { this.messages = v; }

    /** 실행한 룰 한 건 — 읽은 값·만든 값·적중 여부·기본 행 사용 여부. */
    public static class Step {
        private String ruleId;
        private Map<String, Object> inputs = new LinkedHashMap<>();
        private Map<String, Object> outputs = new LinkedHashMap<>();
        private boolean hit;
        private boolean defaultApplied;

        public String getRuleId() { return ruleId; }
        public Map<String, Object> getInputs() { return inputs; }
        public Map<String, Object> getOutputs() { return outputs; }
        public boolean isHit() { return hit; }
        public boolean isDefaultApplied() { return defaultApplied; }

        public void setRuleId(String v) { this.ruleId = v; }
        public void setInputs(Map<String, Object> v) { this.inputs = v; }
        public void setOutputs(Map<String, Object> v) { this.outputs = v; }
        public void setHit(boolean v) { this.hit = v; }
        public void setDefaultApplied(boolean v) { this.defaultApplied = v; }
    }
}
