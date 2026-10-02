package com.dongkuk.dmes.mdm.dmb.layoutMng.dto;

/**
 * {@code layoutMng} action={@code view} 요청(TSK-05-02 design.md §6.1). D-144 3단계: {@code ver} 가 없으면 화면이 열 버전(내 DRAFT →
 * 남의 DRAFT → 지금 적용 중), {@code asOf} 는 쌓은 헤더 버전을 고를 판정 시각(비면 지금).
 */
public class LayoutMngViewRequest {

    private Long layoutId;
    private String ver;
    private String asOf;

    public Long getLayoutId() { return layoutId; }

    public void setLayoutId(Long v) { this.layoutId = v; }

    public String getVer() { return ver; }

    public void setVer(String v) { this.ver = v; }

    public String getAsOf() { return asOf; }

    public void setAsOf(String v) { this.asOf = v; }
}
