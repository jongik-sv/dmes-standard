package com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto;

import java.util.List;

/**
 * {@code dataCateEdit} action={@code search} 응답 — 카테고리 목록 + 마루 데이터 머리(계층 칸 수·추가 컬럼 라벨,
 * FE 가 REGEX defTarget 드롭다운을 이 값으로 제한한다, D5).
 */
public class CateSearchResult {

    private String maruDataId;
    private String maruDataName;
    private int lvlCnt;
    /** attr01~10 라벨, 순서대로(라벨 없는 번호는 null). */
    private List<String> attrLabels;
    private List<CateRow> list;

    public String getMaruDataId() { return maruDataId; }
    public String getMaruDataName() { return maruDataName; }
    public int getLvlCnt() { return lvlCnt; }
    public List<String> getAttrLabels() { return attrLabels; }
    public List<CateRow> getList() { return list; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setMaruDataName(String v) { this.maruDataName = v; }
    public void setLvlCnt(int v) { this.lvlCnt = v; }
    public void setAttrLabels(List<String> v) { this.attrLabels = v; }
    public void setList(List<CateRow> v) { this.list = v; }
}
