package com.dongkuk.dmes.mdm.dmb.layoutMng.dto;

/** {@code layoutMng} action={@code export}(스냅샷 출력) 요청(TSK-05-03 design.md §6.1). 버전이 없으면 최신. */
public class LayoutMngExportRequest {

    private Long layoutId;
    private Long layoutVersion;

    public Long getLayoutId() { return layoutId; }

    public void setLayoutId(Long v) { this.layoutId = v; }

    public Long getLayoutVersion() { return layoutVersion; }

    public void setLayoutVersion(Long v) { this.layoutVersion = v; }
}
