package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

import com.dongkuk.dmes.mdm.common.rule.RuleIo;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import java.util.List;

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

    public RuleSetViewResult() {
    }

    public RuleSetViewResult(Header set, List<RuleIo> rules, List<RuleSetCheck> checks, boolean editable, boolean restorable) {
        this.set = set;
        this.rules = rules;
        this.checks = checks;
        this.editable = editable;
        this.restorable = restorable;
    }

    public Header getSet() { return set; }
    public List<RuleIo> getRules() { return rules; }
    public List<RuleSetCheck> getChecks() { return checks; }
    public boolean isEditable() { return editable; }
    public boolean isRestorable() { return restorable; }

    public void setSet(Header v) { this.set = v; }
    public void setRules(List<RuleIo> v) { this.rules = v; }
    public void setChecks(List<RuleSetCheck> v) { this.checks = v; }
    public void setEditable(boolean v) { this.editable = v; }
    public void setRestorable(boolean v) { this.restorable = v; }

    /** {@code TB_MDM_RULE_SET} 한 행. {@code ruleIds} 는 저장된 JSON 배열 그대로의 순서다. */
    public static class Header {

        private String setId;
        private String setName;
        private String description;
        private String status;
        private long rowVersion;
        private List<String> ruleIds;

        public Header() {
        }

        public Header(String setId, String setName, String description, String status, long rowVersion, List<String> ruleIds) {
            this.setId = setId;
            this.setName = setName;
            this.description = description;
            this.status = status;
            this.rowVersion = rowVersion;
            this.ruleIds = ruleIds;
        }

        public String getSetId() { return setId; }
        public String getSetName() { return setName; }
        public String getDescription() { return description; }
        public String getStatus() { return status; }
        public long getRowVersion() { return rowVersion; }
        public List<String> getRuleIds() { return ruleIds; }

        public void setSetId(String v) { this.setId = v; }
        public void setSetName(String v) { this.setName = v; }
        public void setDescription(String v) { this.description = v; }
        public void setStatus(String v) { this.status = v; }
        public void setRowVersion(long v) { this.rowVersion = v; }
        public void setRuleIds(List<String> v) { this.ruleIds = v; }
    }
}
