package com.dongkuk.dmes.mdm.dmc.codeEdit.dto;

import java.util.List;

/** {@code codeEdit} 조회·쓰기 공통 응답 — 화면이 한 번에 다시 그리고 rv·auditVer 를 새 값으로 받는다(I23). */
public class CodeEditView {

    private CodeHeaderView header;
    private List<CodeVersionRow> versions;
    private CodeEditFlags flags;
    /** 복원 원본 후보 — RELEASED 번호 내림차순(D13). */
    private List<String> restoreSources;
    /** 요청 사용자 ID. */
    private String me;
    /** 요청 사용자가 담당자. */
    private boolean steward;

    public CodeHeaderView getHeader() { return header; }
    public List<CodeVersionRow> getVersions() { return versions; }
    public CodeEditFlags getFlags() { return flags; }
    public List<String> getRestoreSources() { return restoreSources; }
    public String getMe() { return me; }
    public boolean isSteward() { return steward; }

    public void setHeader(CodeHeaderView v) { this.header = v; }
    public void setVersions(List<CodeVersionRow> v) { this.versions = v; }
    public void setFlags(CodeEditFlags v) { this.flags = v; }
    public void setRestoreSources(List<String> v) { this.restoreSources = v; }
    public void setMe(String v) { this.me = v; }
    public void setSteward(boolean v) { this.steward = v; }
}
