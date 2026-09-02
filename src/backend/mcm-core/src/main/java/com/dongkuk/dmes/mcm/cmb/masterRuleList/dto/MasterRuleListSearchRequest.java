package com.dongkuk.dmes.mcm.cmb.masterRuleList.dto;

/**
 * 업무기준 목록조회 조회(search) 파라미터.
 *
 * <p>기능설계서 §3 S-002/S-004 / 분석 §6.1. 2 조건 모두 optional (공란 시 WHERE 절 제외).
 *
 * <ul>
 *   <li>{@link #pRuleId} — 업무기준 ID (S-002, UPPER 양변 contains LIKE)</li>
 *   <li>{@link #pRuleNm} — 업무기준명 (S-004, UPPER 양변 contains LIKE)</li>
 * </ul>
 */
public class MasterRuleListSearchRequest {

    private String pRuleId;
    private String pRuleNm;

    public String getPRuleId() { return pRuleId; }
    public void setPRuleId(String pRuleId) { this.pRuleId = pRuleId; }

    public String getPRuleNm() { return pRuleNm; }
    public void setPRuleNm(String pRuleNm) { this.pRuleNm = pRuleNm; }
}
