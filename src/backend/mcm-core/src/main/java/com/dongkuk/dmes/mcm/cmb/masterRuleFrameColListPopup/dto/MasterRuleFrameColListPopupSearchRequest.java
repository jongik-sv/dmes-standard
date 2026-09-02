package com.dongkuk.dmes.mcm.cmb.masterRuleFrameColListPopup.dto;

/**
 * 업무기준 컬럼 리스트 등록 팝업 조회(search)/저장(save) 파라미터.
 *
 * <p>분석 §4.5 / §5.1 fn_search: {@code pRuleId}(=부모 sRuleId) + {@code pTable}(="TB_MCA_"+sRuleId
 * — FE 조립, As-Is Script:227). save 는 {@code pRuleId} 만 사용 (delete 기준).
 */
public class MasterRuleFrameColListPopupSearchRequest {

    private String pRuleId;
    private String pTable;

    public String getPRuleId() { return pRuleId; }
    public void setPRuleId(String pRuleId) { this.pRuleId = pRuleId; }

    public String getPTable() { return pTable; }
    public void setPTable(String pTable) { this.pTable = pTable; }
}
