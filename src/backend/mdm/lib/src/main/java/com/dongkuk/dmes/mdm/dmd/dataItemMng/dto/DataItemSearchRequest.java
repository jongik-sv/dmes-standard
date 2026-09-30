package com.dongkuk.dmes.mdm.dmd.dataItemMng.dto;

/** {@code dataItemMng} action={@code search} 요청 — 서버 페이징(Q3). */
public class DataItemSearchRequest {

    /** 필수. */
    private String maruDataId;
    /** 키 부분 일치(대소문자 무시). */
    private String code;
    /** 이름 부분 일치. */
    private String name;
    /** 없으면 BASE(전체). */
    private String cateId;
    /** 닫힌 항목 보기. */
    private Boolean showClosed;
    /** 0부터. 기본 0. */
    private Integer page;
    /**
     * 기본 50, 상한 20000(2026-09-30 — 구 200 에서 올림, design.md Q3 갱신). 상한에 걸리면 응답 {@code truncated} 가
     * true 이다. 항목 편집 화면은 페이징 대신 이 상한을 그대로 요청해 조건에 맞는 항목을 한 번에 받는다.
     */
    private Integer size;
    /** "이 노드로 보기" — 코드 자신 또는 lvl1~5 어딘가의 값이 이 값과 같은 행만(열림·닫힘 무관, I5). */
    private String nodeFilter;
    /** true 면 결과에 트리(열린 행만, I6)를 함께 싣는다. */
    private Boolean withTree;

    public String getMaruDataId() { return maruDataId; }
    public String getCode() { return code; }
    public String getName() { return name; }
    public String getCateId() { return cateId; }
    public Boolean getShowClosed() { return showClosed; }
    public Integer getPage() { return page; }
    public Integer getSize() { return size; }
    public String getNodeFilter() { return nodeFilter; }
    public Boolean getWithTree() { return withTree; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setCode(String v) { this.code = v; }
    public void setName(String v) { this.name = v; }
    public void setCateId(String v) { this.cateId = v; }
    public void setShowClosed(Boolean v) { this.showClosed = v; }
    public void setPage(Integer v) { this.page = v; }
    public void setSize(Integer v) { this.size = v; }
    public void setNodeFilter(String v) { this.nodeFilter = v; }
    public void setWithTree(Boolean v) { this.withTree = v; }
}
