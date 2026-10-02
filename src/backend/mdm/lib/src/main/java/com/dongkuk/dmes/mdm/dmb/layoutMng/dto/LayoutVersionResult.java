package com.dongkuk.dmes.mdm.dmb.layoutMng.dto;

/**
 * 레이아웃·헤더 버전 조작 응답(D-144 3단계) — 새 버전 번호·종류(copy), 새 row_version(copy 는 0, lock·unlock·handover 는 갱신 값).
 * 해당 없는 칸은 null. 버전은 문자열({@code "1.001"}, {@code VersionNumbers.plain}).
 */
public class LayoutVersionResult {

    private Long layoutId;
    private String ver;
    /** 새 버전(copy)일 때만 채운다: MAJOR 또는 MINOR. */
    private String verKind;
    private Long rowVersion;

    public LayoutVersionResult() {
    }

    public LayoutVersionResult(Long layoutId, String ver, String verKind, Long rowVersion) {
        this.layoutId = layoutId;
        this.ver = ver;
        this.verKind = verKind;
        this.rowVersion = rowVersion;
    }

    public Long getLayoutId() { return layoutId; }
    public String getVer() { return ver; }
    public String getVerKind() { return verKind; }
    public Long getRowVersion() { return rowVersion; }

    public void setLayoutId(Long v) { this.layoutId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setVerKind(String v) { this.verKind = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
}
