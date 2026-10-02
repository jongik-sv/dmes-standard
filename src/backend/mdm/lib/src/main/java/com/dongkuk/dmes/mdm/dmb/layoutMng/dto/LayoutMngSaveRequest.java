package com.dongkuk.dmes.mdm.dmb.layoutMng.dto;

/**
 * {@code layoutMng} action={@code save} 요청(TSK-05-02 design.md §6.1). grid {@code headers}·{@code consts}·{@code items} — 헤더 항목을 받는 칸은 없다(불변 I8).
 *
 * <p>D-144 3단계: 등록이면 {@code layoutId} 가 없고, 수정이면 {@code layoutId}·{@code ver}(업무 버전 문자열 {@code "1.000"})·
 * {@code rowVersion}(DRAFT 동시 저장 충돌 검사)이 필요하다. {@code asOf} 는 쌓은 헤더 버전을 고를 판정 시각(비면 지금).
 */
public class LayoutMngSaveRequest {

    private Long layoutId;
    private String ver;
    private Long rowVersion;
    private String asOf;
    private String layoutName;
    private String eaiCode;
    private String sndSystem;
    private String rcvSystem;

    public Long getLayoutId() { return layoutId; }

    public void setLayoutId(Long v) { this.layoutId = v; }

    public String getVer() { return ver; }

    public void setVer(String v) { this.ver = v; }

    public Long getRowVersion() { return rowVersion; }

    public void setRowVersion(Long v) { this.rowVersion = v; }

    public String getAsOf() { return asOf; }

    public void setAsOf(String v) { this.asOf = v; }

    public String getLayoutName() { return layoutName; }

    public void setLayoutName(String v) { this.layoutName = v; }

    public String getEaiCode() { return eaiCode; }

    public void setEaiCode(String v) { this.eaiCode = v; }

    public String getSndSystem() { return sndSystem; }

    public void setSndSystem(String v) { this.sndSystem = v; }

    public String getRcvSystem() { return rcvSystem; }

    public void setRcvSystem(String v) { this.rcvSystem = v; }
}
