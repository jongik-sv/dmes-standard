package com.dongkuk.dmes.mdm.dmc.codeCateEdit.dto;

/**
 * {@code codeCateEdit} action={@code restore} 요청 params(TSK-06-04 design.md §1·§2). {@code table} 은
 * {@code MasterCodeSegmentTable} 이름({@code CATE}·{@code CATE_ITEM}) — CATE 는 cateId 만, CATE_ITEM 은 cateId·code 모두
 * 쓴다. getter/setter 일반 클래스다(record·Lombok 없음 — OASIS dto 바인딩 관례).
 */
public class CodeCateRevertRequest {

    private String maruCodeId;
    private String ver;
    private Long rowVersion;
    private String table;
    private String cateId;
    private String code;

    public String getMaruCodeId() { return maruCodeId; }
    public String getVer() { return ver; }
    public Long getRowVersion() { return rowVersion; }
    public String getTable() { return table; }
    public String getCateId() { return cateId; }
    public String getCode() { return code; }

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setTable(String v) { this.table = v; }
    public void setCateId(String v) { this.cateId = v; }
    public void setCode(String v) { this.code = v; }
}
