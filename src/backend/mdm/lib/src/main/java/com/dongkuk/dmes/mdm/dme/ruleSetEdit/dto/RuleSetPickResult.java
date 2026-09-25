package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

import java.util.List;

/** {@code ruleSetEdit} search target=SET 응답 — 세트 고르기 후보(세트 ID 순 20건). */
public class RuleSetPickResult {

    private List<Pick> sets;

    public RuleSetPickResult() {
    }

    public RuleSetPickResult(List<Pick> sets) {
        this.sets = sets;
    }

    public List<Pick> getSets() { return sets; }

    public void setSets(List<Pick> v) { this.sets = v; }

    /** 후보 한 건. */
    public static class Pick {

        private String setId;
        private String setName;
        private String status;

        public Pick() {
        }

        public Pick(String setId, String setName, String status) {
            this.setId = setId;
            this.setName = setName;
            this.status = status;
        }

        public String getSetId() { return setId; }
        public String getSetName() { return setName; }
        public String getStatus() { return status; }

        public void setSetId(String v) { this.setId = v; }
        public void setSetName(String v) { this.setName = v; }
        public void setStatus(String v) { this.status = v; }
    }
}
