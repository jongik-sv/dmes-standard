package com.dongkuk.dmes.mdm.dme.ruleMng.dto;

/**
 * {@code ruleMng} 버전 조작 요청 — copy(새 버전)·delete(target VERSION = DRAFT 삭제, RULE = 폐기, CONFIRM = 확정 취소)·
 * lock·unlock·handover. D-105 로 헤더·버전 화면이 {@code ruleMng} 로 옮겨 오면서 {@code ruleEdit.dto} 에서 이 자리로 왔다.
 */
public class RuleVersionRequest {

    /**
     * 확정 취소 대상 값({@code target}) — 아직 적용 시각이 오지 않은 확정 버전을 작성 중으로 되돌린다
     * (ADR-0002 D8, TSK-02-01 D4-1). 04·06 이 같은 값을 쓴다.
     */
    public static final String TARGET_CONFIRM = "CONFIRM";

    private String maruRuleId;
    private Integer ver;
    private Long rowVersion;

    /** handover 의 넘겨받을 사용자 ID. */
    private String newOwnerId;

    /** delete 의 대상 VERSION·RULE·CONFIRM. */
    private String target;

    public String getMaruRuleId() { return maruRuleId; }
    public Integer getVer() { return ver; }
    public Long getRowVersion() { return rowVersion; }
    public String getNewOwnerId() { return newOwnerId; }
    public String getTarget() { return target; }

    public void setMaruRuleId(String v) { this.maruRuleId = v; }
    public void setVer(Integer v) { this.ver = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setNewOwnerId(String v) { this.newOwnerId = v; }
    public void setTarget(String v) { this.target = v; }
}
