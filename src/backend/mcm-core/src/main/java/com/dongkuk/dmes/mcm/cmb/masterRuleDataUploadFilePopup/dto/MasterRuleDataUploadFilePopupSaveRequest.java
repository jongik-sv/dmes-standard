package com.dongkuk.dmes.mcm.cmb.masterRuleDataUploadFilePopup.dto;

/**
 * 일반 업무기준 등록(Excel Upload) 파라미터 (분석 §4.4 sArgument 전수 — 3액션 공용).
 *
 * <ul>
 *   <li>{@link #pRuleId} — 업무기준 ID (부모 masterRuleData 전달 sRuleId — R-101.
 *       서버가 형식 검증 후 pTable 재조립 — Q-104 안전화)</li>
 *   <li>{@link #pTable} — As-Is 계약 보존 파라미터 (FE "TB_MCA_"+ruleId 조립 — xfdl:177/213.
 *       서버는 신뢰하지 않고 pRuleId 로 재조립·대조. 불일치/형식 위반 → INVALID_VALUE)</li>
 *   <li>{@link #pRegFlag} — 삭제등록 (chk_regFlag — "true" 면 전건 선삭제 후 재등록, R-107.
 *       빈 업로드 데이터 + true 는 차단 — Q-102 확정)</li>
 * </ul>
 */
public class MasterRuleDataUploadFilePopupSaveRequest {

    private String pRuleId;
    private String pTable;
    private String pRegFlag;

    public String getPRuleId() { return pRuleId; }
    public void setPRuleId(String pRuleId) { this.pRuleId = pRuleId; }

    public String getPTable() { return pTable; }
    public void setPTable(String pTable) { this.pTable = pTable; }

    public String getPRegFlag() { return pRegFlag; }
    public void setPRegFlag(String pRegFlag) { this.pRegFlag = pRegFlag; }
}
