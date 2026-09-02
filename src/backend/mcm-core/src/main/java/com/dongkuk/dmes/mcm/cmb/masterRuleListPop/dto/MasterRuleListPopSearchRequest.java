package com.dongkuk.dmes.mcm.cmb.masterRuleListPop.dto;

/**
 * 업무기준 List조회 팝업 조회(search) 파라미터.
 *
 * <p>기능설계서 §3.1 (S-002 pRuleId / S-004 pRuleNm + 추가 송신 sSchema) / 분석 §4.5.
 *
 * <ul>
 *   <li>{@link #pRuleId} — 업무기준 ID (UPPER 양변 contains LIKE — BR-002)</li>
 *   <li>{@link #pRuleNm} — 업무기준명 (UPPER 양변 contains LIKE — BR-003)</li>
 *   <li>{@link #sSchema} — As-Is 동적 스키마 라우팅 파라미터 (Q-002 확정: As-Is 유지 +
 *       화이트리스트 가드. To-Be 스키마는 MCAAPUSER 단일 — Service 에서 검증)</li>
 * </ul>
 */
public class MasterRuleListPopSearchRequest {

    private String pRuleId;
    private String pRuleNm;
    private String sSchema;

    public String getPRuleId() { return pRuleId; }
    public void setPRuleId(String pRuleId) { this.pRuleId = pRuleId; }

    public String getPRuleNm() { return pRuleNm; }
    public void setPRuleNm(String pRuleNm) { this.pRuleNm = pRuleNm; }

    public String getSSchema() { return sSchema; }
    public void setSSchema(String sSchema) { this.sSchema = sSchema; }
}
