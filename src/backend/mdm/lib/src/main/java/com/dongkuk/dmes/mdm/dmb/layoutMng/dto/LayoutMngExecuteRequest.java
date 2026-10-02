package com.dongkuk.dmes.mdm.dmb.layoutMng.dto;

/**
 * {@code layoutMng} action={@code execute}(샘플 전문 렌더) 요청(TSK-05-03 design.md §6.1). save 와 같은 칸 + 송신 시각·순번. grid
 * {@code headers}·{@code consts}·{@code items}·{@code samples}. 쓰지 않는다.
 */
public class LayoutMngExecuteRequest {

    private Long layoutId;
    private String ver;
    /** 쌓은 헤더 버전을 고를 판정 시각(KST {@code yyyy-MM-dd HH:mm:ss}). 없으면 서버 시계. */
    private String asOf;
    private String layoutName;
    private String eaiCode;
    private String sndSystem;
    private String rcvSystem;
    /** {@code yyyyMMddHHmmss}. 없으면 서버 시계(KST). */
    private String sendTime;
    /** 전문 순서. 없으면 1. */
    private Long seq;

    public Long getLayoutId() { return layoutId; }

    public void setLayoutId(Long v) { this.layoutId = v; }

    public String getVer() { return ver; }

    public void setVer(String v) { this.ver = v; }

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

    public String getSendTime() { return sendTime; }

    public void setSendTime(String v) { this.sendTime = v; }

    public Long getSeq() { return seq; }

    public void setSeq(Long v) { this.seq = v; }

    /** 초안 검사용 — save 요청과 같은 칸. */
    public LayoutMngSaveRequest toSaveRequest() {
        LayoutMngSaveRequest r = new LayoutMngSaveRequest();
        r.setLayoutId(layoutId);
        r.setVer(ver);
        r.setAsOf(asOf);
        r.setLayoutName(layoutName);
        r.setEaiCode(eaiCode);
        r.setSndSystem(sndSystem);
        r.setRcvSystem(rcvSystem);
        return r;
    }
}
