package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

/** {@code erdEdit} 모든 액션의 요청(계획 Task 10 표). 액션마다 쓰는 칸만 채워 온다. */
public class ErdEditRequest {

    private String modelId;
    private String moduleId;
    private String schemaName;
    private String modelName;
    private String ver;
    private Long rowVersion;
    private Long baseRev;
    private Long sinceRev;
    private Long rev;
    private String session;
    private String source;
    /** 명령 배열 JSON 문자열 — OASIS params 는 배열을 담지 못한다. */
    private String commandsJson;
    private String logical;
    private String phys;
    /** 액션별 종류 — view: SET_VIEW·STATUS, compare: DB_DIFF, import: FROM_DB, execute: ADD_EDITOR·REMOVE_EDITOR·CLAIM·RELEASE. */
    private String kind;
    private String userId;
    private String viewJson;
    private String tableId;
    private String verKind;
    private String newOwnerId;
    private String applyFrom;
    private Boolean warningsAcknowledged;

    public String getModelId() { return modelId; }
    public String getModuleId() { return moduleId; }
    public String getSchemaName() { return schemaName; }
    public String getModelName() { return modelName; }
    public String getVer() { return ver; }
    public Long getRowVersion() { return rowVersion; }
    public Long getBaseRev() { return baseRev; }
    public Long getSinceRev() { return sinceRev; }
    public Long getRev() { return rev; }
    public String getSession() { return session; }
    public String getSource() { return source; }
    public String getCommandsJson() { return commandsJson; }
    public String getLogical() { return logical; }
    public String getPhys() { return phys; }
    public String getKind() { return kind; }
    public String getUserId() { return userId; }
    public String getViewJson() { return viewJson; }
    public String getTableId() { return tableId; }
    public String getVerKind() { return verKind; }
    public String getNewOwnerId() { return newOwnerId; }
    public String getApplyFrom() { return applyFrom; }
    public Boolean getWarningsAcknowledged() { return warningsAcknowledged; }

    public void setModelId(String v) { this.modelId = v; }
    public void setModuleId(String v) { this.moduleId = v; }
    public void setSchemaName(String v) { this.schemaName = v; }
    public void setModelName(String v) { this.modelName = v; }
    public void setVer(String v) { this.ver = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setBaseRev(Long v) { this.baseRev = v; }
    public void setSinceRev(Long v) { this.sinceRev = v; }
    public void setRev(Long v) { this.rev = v; }
    public void setSession(String v) { this.session = v; }
    public void setSource(String v) { this.source = v; }
    public void setCommandsJson(String v) { this.commandsJson = v; }
    public void setLogical(String v) { this.logical = v; }
    public void setPhys(String v) { this.phys = v; }
    public void setKind(String v) { this.kind = v; }
    public void setUserId(String v) { this.userId = v; }
    public void setViewJson(String v) { this.viewJson = v; }
    public void setTableId(String v) { this.tableId = v; }
    public void setVerKind(String v) { this.verKind = v; }
    public void setNewOwnerId(String v) { this.newOwnerId = v; }
    public void setApplyFrom(String v) { this.applyFrom = v; }
    public void setWarningsAcknowledged(Boolean v) { this.warningsAcknowledged = v; }
}
