package com.dongkuk.dmes.mdm.dma.termMng.dto;

/**
 * {@code termMng} action={@code save} 요청 — 기능설계서 §4 D-001~D-011. {@code termId} 없으면 신규.
 *
 * <p><b>{@code synonyms}/{@code aliases}/{@code systems} 는 배열이 아니라 콤마 구분 문자열이다</b>
 * (D-006·D-009·D-010 "TextBox, 콤마 구분 → 배열 직렬화"). OASIS {@code CactusRequestConverter} 가
 * {@code params} 의 각 값을 {@code TypedObject}(제네릭 타입 힌트 없음)로 감싸므로, 배열(JSON list) 값을
 * 그대로 {@code params} 에 실으면 "Generic type. You must explicitly specify the type" 로 죽는다(실측
 * 확인 — {@code grids} 가 아니면 배열을 절대 못 받는다, mls {@code noticeMgmt} 의 save 가 배열 파라미터를
 * 안 쓰는 이유와 같다). 배열 직렬화는 서버({@link com.dongkuk.dmes.mdm.dma.termMng.service.TermMngService})
 * 가 콤마로 split 해서 한다 — 화면은 원본 텍스트를 그대로 보낸다.
 */
public class TermSaveRequest {

    private Long termId;
    private String termName;
    private Integer senseNo;
    private String definition;
    private String context;
    private String engName;
    private String engAbbr;
    private String synonyms;
    private String aliases;
    private String systems;
    private String stdBasis;

    public Long getTermId() { return termId; }
    public String getTermName() { return termName; }
    public Integer getSenseNo() { return senseNo; }
    public String getDefinition() { return definition; }
    public String getContext() { return context; }
    public String getEngName() { return engName; }
    public String getEngAbbr() { return engAbbr; }
    public String getSynonyms() { return synonyms; }
    public String getAliases() { return aliases; }
    public String getSystems() { return systems; }
    public String getStdBasis() { return stdBasis; }

    public void setTermId(Long v) { this.termId = v; }
    public void setTermName(String v) { this.termName = v; }
    public void setSenseNo(Integer v) { this.senseNo = v; }
    public void setDefinition(String v) { this.definition = v; }
    public void setContext(String v) { this.context = v; }
    public void setEngName(String v) { this.engName = v; }
    public void setEngAbbr(String v) { this.engAbbr = v; }
    public void setSynonyms(String v) { this.synonyms = v; }
    public void setAliases(String v) { this.aliases = v; }
    public void setSystems(String v) { this.systems = v; }
    public void setStdBasis(String v) { this.stdBasis = v; }
}
