package com.dongkuk.dmes.mdm.dma.termMng.dto;

/**
 * {@code termMng} action={@code compare}(method=recommend) 요청 — A-RECO.
 *
 * <p>편집 중인 용어의 {@code termId}(자기 자신 제외, 신규 등록 중이면 null)와 표기·정의·영문명 세 필드를
 * 그대로 받는다(I18).
 *
 * <p>추천 설정 세 값은 선택이다. 비우면 서버 설정({@code mdm.recommend.stage1-top-n}·{@code stage2-top-n}·
 * {@code mdm.embedding.min-score})을 쓴다. 범위: 개수 1~100, 최소 유사도 -1~1.
 */
public class RecommendRequest {

    private Long termId;
    private String termName;
    private String definition;
    private String engName;
    /** 1차(이름) 추천 최대 건수. */
    private Integer stage1TopN;
    /** 2차(의미) 추천 최대 건수. */
    private Integer stage2TopN;
    /** 2차(의미) 추천 최소 코사인 유사도. */
    private Double minScore;

    public Long getTermId() { return termId; }
    public String getTermName() { return termName; }
    public String getDefinition() { return definition; }
    public String getEngName() { return engName; }
    public Integer getStage1TopN() { return stage1TopN; }
    public Integer getStage2TopN() { return stage2TopN; }
    public Double getMinScore() { return minScore; }

    public void setTermId(Long v) { this.termId = v; }
    public void setTermName(String v) { this.termName = v; }
    public void setDefinition(String v) { this.definition = v; }
    public void setEngName(String v) { this.engName = v; }
    public void setStage1TopN(Integer v) { this.stage1TopN = v; }
    public void setStage2TopN(Integer v) { this.stage2TopN = v; }
    public void setMinScore(Double v) { this.minScore = v; }
}
