package com.dongkuk.dmes.mcm.cmb.masterRuleFrame.dto;

/**
 * 업무기준 구조관리 조회(search)/저장(save) 파라미터.
 *
 * <p>기능설계서 §3.1 (S-002 pRuleId 단일 키) / 분석 §6.1. As-Is 저장 시에도
 * {@code sArgument = pRuleId} 로 동일 파라미터 전달 (xfdl:365).
 *
 * <ul>
 *   <li>{@link #pRuleId} — 업무기준 ID (S-002, {@code RMASTER.RULE_ID = #{pRuleId}} 동등 비교.
 *       공란 시 WHERE 절 제외 — 단, As-Is 는 P-001 팝업 선택 전 조회 미발생)</li>
 * </ul>
 */
public class MasterRuleFrameSearchRequest {

    private String pRuleId;

    public String getPRuleId() { return pRuleId; }
    public void setPRuleId(String pRuleId) { this.pRuleId = pRuleId; }
}
