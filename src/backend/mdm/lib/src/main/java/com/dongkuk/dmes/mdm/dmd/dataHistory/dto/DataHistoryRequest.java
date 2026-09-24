package com.dongkuk.dmes.mdm.dmd.dataHistory.dto;

/** {@code dataHistory} action={@code search} 요청 — (마루 데이터, 대상, 키). */
public class DataHistoryRequest {

    private String maruDataId;
    /** ITEM / CATE / CATE_ITEM. */
    private String target;
    /** 항목 키 또는 카테고리 ID. 필수(H3). */
    private String key;
    /** 대상이 CATE_ITEM 일 때 카테고리. */
    private String cateId;

    public String getMaruDataId() { return maruDataId; }
    public String getTarget() { return target; }
    public String getKey() { return key; }
    public String getCateId() { return cateId; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setTarget(String v) { this.target = v; }
    public void setKey(String v) { this.key = v; }
    public void setCateId(String v) { this.cateId = v; }
}
