package com.dongkuk.dmes.mdm.dme.ruleSetMng.dto;

import java.util.List;

/**
 * 룰 세트 목록 한 행. {@code ruleCount} 밖의 계산 칸은 저장하지 않는 값이다 — 멤버 룰의 지금 RELEASED 입출력으로 세트 입출력 표·저장 시
 * 검사를 계산한다(design §6.7). {@code finalResults} 는 뒤 룰이 읽지 않는 결과 이름(표 순서), DEPRECATED 세트는 거부·경고 수가 0 이다.
 */
public class RuleSetListRow {

    private String setId;
    private String setName;
    private int ruleCount;
    private List<String> finalResults;
    private int inputCount;
    private String description;
    private int rejectCount;
    private int warnCount;
    private String status;

    public String getSetId() { return setId; }
    public String getSetName() { return setName; }
    public int getRuleCount() { return ruleCount; }
    public List<String> getFinalResults() { return finalResults; }
    public int getInputCount() { return inputCount; }
    public String getDescription() { return description; }
    public int getRejectCount() { return rejectCount; }
    public int getWarnCount() { return warnCount; }
    public String getStatus() { return status; }

    public void setSetId(String v) { this.setId = v; }
    public void setSetName(String v) { this.setName = v; }
    public void setRuleCount(int v) { this.ruleCount = v; }
    public void setFinalResults(List<String> v) { this.finalResults = v; }
    public void setInputCount(int v) { this.inputCount = v; }
    public void setDescription(String v) { this.description = v; }
    public void setRejectCount(int v) { this.rejectCount = v; }
    public void setWarnCount(int v) { this.warnCount = v; }
    public void setStatus(String v) { this.status = v; }
}
