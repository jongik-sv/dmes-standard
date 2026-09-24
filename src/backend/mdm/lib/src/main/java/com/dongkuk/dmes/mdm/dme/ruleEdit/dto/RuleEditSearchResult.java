package com.dongkuk.dmes.mdm.dme.ruleEdit.dto;

import java.util.List;

/** {@code ruleEdit} action={@code search} 응답. */
public class RuleEditSearchResult {

    private List<Row> list;

    public RuleEditSearchResult() {
    }

    public RuleEditSearchResult(List<Row> list) {
        this.list = list;
    }

    public List<Row> getList() { return list; }
    public void setList(List<Row> v) { this.list = v; }

    /** 룰 고르기 한 행. */
    public static class Row {
        private String maruRuleId;
        private String maruRuleName;
        private String ruleKind;
        private String status;
        private String sourceKind;

        public Row() {
        }

        public Row(String maruRuleId, String maruRuleName, String ruleKind, String status, String sourceKind) {
            this.maruRuleId = maruRuleId;
            this.maruRuleName = maruRuleName;
            this.ruleKind = ruleKind;
            this.status = status;
            this.sourceKind = sourceKind;
        }

        public String getMaruRuleId() { return maruRuleId; }
        public String getMaruRuleName() { return maruRuleName; }
        public String getRuleKind() { return ruleKind; }
        public String getStatus() { return status; }
        public String getSourceKind() { return sourceKind; }

        public void setMaruRuleId(String v) { this.maruRuleId = v; }
        public void setMaruRuleName(String v) { this.maruRuleName = v; }
        public void setRuleKind(String v) { this.ruleKind = v; }
        public void setStatus(String v) { this.status = v; }
        public void setSourceKind(String v) { this.sourceKind = v; }
    }
}
