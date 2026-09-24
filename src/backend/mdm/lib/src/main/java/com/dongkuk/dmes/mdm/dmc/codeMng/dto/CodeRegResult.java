package com.dongkuk.dmes.mdm.dmc.codeMng.dto;

/** {@code codeMng} action={@code reg} 응답 — 첫 DRAFT(1.000)와 자동 선점한 소유자. */
public class CodeRegResult {

    private String maruCodeId;
    private String ver;
    private long rowVersion;
    private String ownerId;

    public String getMaruCodeId() { return maruCodeId; }
    public String getVer() { return ver; }
    public long getRowVersion() { return rowVersion; }
    public String getOwnerId() { return ownerId; }

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setRowVersion(long v) { this.rowVersion = v; }
    public void setOwnerId(String v) { this.ownerId = v; }
}
