package com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto;

/** {@code dataCateEdit} action={@code compare} 요청 — REGEX 미리보기(타이핑 중인 정의, 아직 저장 전). */
public class CateCompareRequest {

    private String maruDataId;
    private String defExpr;
    private String defTarget;

    public String getMaruDataId() { return maruDataId; }
    public String getDefExpr() { return defExpr; }
    public String getDefTarget() { return defTarget; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setDefExpr(String v) { this.defExpr = v; }
    public void setDefTarget(String v) { this.defTarget = v; }
}
