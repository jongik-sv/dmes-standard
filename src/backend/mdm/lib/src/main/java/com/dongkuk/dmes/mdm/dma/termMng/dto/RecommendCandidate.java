package com.dongkuk.dmes.mdm.dma.termMng.dto;

import java.util.List;

/** 유사어 추천 후보 1건 — 불변 규칙 I18. {@code stage}="1"(문자열) 또는 "2"(임베딩). */
public class RecommendCandidate {

    private Long termId;
    private String termName;
    private int senseNo;
    private String engName;
    private List<String> systems;
    private String matchedText;
    private double score;
    private String stage;

    public RecommendCandidate() {
    }

    public RecommendCandidate(Long termId, String termName, int senseNo, String engName, List<String> systems,
            String matchedText, double score, String stage) {
        this.termId = termId;
        this.termName = termName;
        this.senseNo = senseNo;
        this.engName = engName;
        this.systems = systems;
        this.matchedText = matchedText;
        this.score = score;
        this.stage = stage;
    }

    public Long getTermId() { return termId; }
    public String getTermName() { return termName; }
    public int getSenseNo() { return senseNo; }
    public String getEngName() { return engName; }
    public List<String> getSystems() { return systems; }
    public String getMatchedText() { return matchedText; }
    public double getScore() { return score; }
    public String getStage() { return stage; }

    public void setTermId(Long v) { this.termId = v; }
    public void setTermName(String v) { this.termName = v; }
    public void setSenseNo(int v) { this.senseNo = v; }
    public void setEngName(String v) { this.engName = v; }
    public void setSystems(List<String> v) { this.systems = v; }
    public void setMatchedText(String v) { this.matchedText = v; }
    public void setScore(double v) { this.score = v; }
    public void setStage(String v) { this.stage = v; }
}
