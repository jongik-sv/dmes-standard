package com.dongkuk.dmes.mdm.dma.termMng.dto;

/**
 * {@code termMng} action={@code compare}(method=recommend) 요청 — A-RECO.
 *
 * <p>편집 중인 용어의 {@code termId}(자기 자신 제외, 신규 등록 중이면 null)와 표기·정의·영문명 세 필드를
 * 그대로 받는다(I18).
 */
public class RecommendRequest {

    private Long termId;
    private String termName;
    private String definition;
    private String engName;

    public Long getTermId() { return termId; }
    public String getTermName() { return termName; }
    public String getDefinition() { return definition; }
    public String getEngName() { return engName; }

    public void setTermId(Long v) { this.termId = v; }
    public void setTermName(String v) { this.termName = v; }
    public void setDefinition(String v) { this.definition = v; }
    public void setEngName(String v) { this.engName = v; }
}
