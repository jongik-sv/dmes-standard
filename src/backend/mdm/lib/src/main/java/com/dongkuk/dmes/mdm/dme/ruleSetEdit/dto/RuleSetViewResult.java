package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

import com.dongkuk.dmes.mdm.common.rule.CondIo;
import com.dongkuk.dmes.mdm.common.rule.RuleIo;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import java.util.List;
import java.util.Map;

/**
 * {@code ruleSetEdit} action={@code view} 응답(TSK-08-06 design §6.5) — 세트 한 행, 멤버 룰의 입출력(저장된 목록 순, 중복 없음),
 * 저장된 목록 기준 검사, 쓰기 가능 여부({@code editable} = 담당자 && INUSE, {@code restorable} = 담당자 && DEPRECATED).
 */
public class RuleSetViewResult {

    private Header set;
    private List<RuleIo> rules;
    private List<RuleSetCheck> checks;
    private boolean editable;
    private boolean restorable;
    /** 저장된 흐름의 IF "그 외" 가 아닌 선마다 조건식 입출력(선 ID 키). 흐름이 없으면 빈 맵. */
    private Map<String, CondIo> condIo;
    /** 저장된 테스트 케이스(case_id 순). 세트 상태와 무관하게 싣는다(폐기 세트도, P-D8). */
    private List<Case> cases;

    public RuleSetViewResult() {
    }

    public RuleSetViewResult(Header set, List<RuleIo> rules, List<RuleSetCheck> checks, boolean editable, boolean restorable,
                             Map<String, CondIo> condIo) {
        this(set, rules, checks, editable, restorable, condIo, List.of());
    }

    public RuleSetViewResult(Header set, List<RuleIo> rules, List<RuleSetCheck> checks, boolean editable, boolean restorable,
                             Map<String, CondIo> condIo, List<Case> cases) {
        this.cases = cases;
        this.set = set;
        this.rules = rules;
        this.checks = checks;
        this.editable = editable;
        this.restorable = restorable;
        this.condIo = condIo;
    }

    public Header getSet() { return set; }
    public List<RuleIo> getRules() { return rules; }
    public List<RuleSetCheck> getChecks() { return checks; }
    public boolean isEditable() { return editable; }
    public boolean isRestorable() { return restorable; }
    public Map<String, CondIo> getCondIo() { return condIo; }
    public List<Case> getCases() { return cases; }

    public void setSet(Header v) { this.set = v; }
    public void setRules(List<RuleIo> v) { this.rules = v; }
    public void setChecks(List<RuleSetCheck> v) { this.checks = v; }
    public void setEditable(boolean v) { this.editable = v; }
    public void setRestorable(boolean v) { this.restorable = v; }
    public void setCondIo(Map<String, CondIo> v) { this.condIo = v; }
    public void setCases(List<Case> v) { this.cases = v; }

    /** {@code TB_MDM_RULE_SET_TEST_CASE} 한 행. */
    public static class Case {

        private Integer caseId;
        private String caseName;
        private String inputJson;
        private String evalTs;
        private String expectedJson;
        private String description;
        private long rowVersion;

        public Case() {
        }

        public Case(Integer caseId, String caseName, String inputJson, String evalTs, String expectedJson, String description,
                    long rowVersion) {
            this.caseId = caseId;
            this.caseName = caseName;
            this.inputJson = inputJson;
            this.evalTs = evalTs;
            this.expectedJson = expectedJson;
            this.description = description;
            this.rowVersion = rowVersion;
        }

        public Integer getCaseId() { return caseId; }
        public String getCaseName() { return caseName; }
        public String getInputJson() { return inputJson; }
        public String getEvalTs() { return evalTs; }
        public String getExpectedJson() { return expectedJson; }
        public String getDescription() { return description; }
        public long getRowVersion() { return rowVersion; }

        public void setCaseId(Integer v) { this.caseId = v; }
        public void setCaseName(String v) { this.caseName = v; }
        public void setInputJson(String v) { this.inputJson = v; }
        public void setEvalTs(String v) { this.evalTs = v; }
        public void setExpectedJson(String v) { this.expectedJson = v; }
        public void setDescription(String v) { this.description = v; }
        public void setRowVersion(long v) { this.rowVersion = v; }
    }

    /** {@code TB_MDM_RULE_SET} 한 행. {@code ruleIds} 는 저장된 JSON 배열 그대로의 순서다. */
    public static class Header {

        private String setId;
        private String setName;
        private String description;
        private String status;
        private long rowVersion;
        private List<String> ruleIds;
        /** 저장된 흐름(view 포함). FLOW_JSON 이 NULL 이면 null. */
        private Map<String, Object> flow;
        /** 분기(IF·PARALLEL)가 있으면 true — 1단계 화면은 목록을 읽기 전용으로 보인다. */
        private boolean branched;

        public Header() {
        }

        public Header(String setId, String setName, String description, String status, long rowVersion, List<String> ruleIds,
                      Map<String, Object> flow, boolean branched) {
            this.setId = setId;
            this.setName = setName;
            this.description = description;
            this.status = status;
            this.rowVersion = rowVersion;
            this.ruleIds = ruleIds;
            this.flow = flow;
            this.branched = branched;
        }

        public String getSetId() { return setId; }
        public String getSetName() { return setName; }
        public String getDescription() { return description; }
        public String getStatus() { return status; }
        public long getRowVersion() { return rowVersion; }
        public List<String> getRuleIds() { return ruleIds; }
        public Map<String, Object> getFlow() { return flow; }
        public boolean isBranched() { return branched; }

        public void setSetId(String v) { this.setId = v; }
        public void setSetName(String v) { this.setName = v; }
        public void setDescription(String v) { this.description = v; }
        public void setStatus(String v) { this.status = v; }
        public void setRowVersion(long v) { this.rowVersion = v; }
        public void setRuleIds(List<String> v) { this.ruleIds = v; }
        public void setFlow(Map<String, Object> v) { this.flow = v; }
        public void setBranched(boolean v) { this.branched = v; }
    }
}
