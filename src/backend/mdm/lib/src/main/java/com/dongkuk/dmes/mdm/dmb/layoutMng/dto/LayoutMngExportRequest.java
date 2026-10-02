package com.dongkuk.dmes.mdm.dmb.layoutMng.dto;

/**
 * {@code layoutMng} action={@code export}(스냅샷 출력) 요청(TSK-05-03 design.md §6.1). D-144 3단계: {@code ver} 가 없으면 시각
 * {@code asOf}(비면 지금)에 적용 중인 버전, 있으면 그 버전을 시각 {@code asOf} 의 헤더 버전으로 합성한다.
 */
public class LayoutMngExportRequest {

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
