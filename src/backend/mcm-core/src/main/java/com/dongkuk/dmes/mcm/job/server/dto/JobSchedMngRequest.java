package com.dongkuk.dmes.mcm.job.server.dto;

/**
 * jobSchedMng 요청 params(설계 §7). 칸은 액션마다 일부만 쓴다. {@code configJson}·{@code varsJson}·{@code optsJson} 은 JSON 글자이다(위젯관리 save 와 같은 방식).
 * BPMN 서비스의 Action 은 {@code svcAction} — {@code action} 은 OASIS 가 경로로만 정하는 예약 키라 본문에 쓸 수 없다.
 */
public class JobSchedMngRequest {

    private String jobId;
    private String moduleCd;
    private String jobNm;
    private String jobKind;
    private String serviceId;
    private String svcAction;
    private String cronExpr;
    private String useYn;
    private String configJson;
    private String varsJson;
    private String optsJson;
    private String jobDesc;
    private Integer timeoutSec;
    private Long ver;
    private Boolean newJob;
    private Integer limit;
    private String keyword;
    private String lastStatus;
    private String expr;
    private String varOverridesJson;

    public JobSchedMngRequest() {}

    public String getJobId() { return jobId; }
    public void setJobId(String jobId) { this.jobId = jobId; }
    public String getModuleCd() { return moduleCd; }
    public void setModuleCd(String moduleCd) { this.moduleCd = moduleCd; }
    public String getJobNm() { return jobNm; }
    public void setJobNm(String jobNm) { this.jobNm = jobNm; }
    public String getJobKind() { return jobKind; }
    public void setJobKind(String jobKind) { this.jobKind = jobKind; }
    public String getServiceId() { return serviceId; }
    public void setServiceId(String serviceId) { this.serviceId = serviceId; }
    public String getSvcAction() { return svcAction; }
    public void setSvcAction(String svcAction) { this.svcAction = svcAction; }
    public String getCronExpr() { return cronExpr; }
    public void setCronExpr(String cronExpr) { this.cronExpr = cronExpr; }
    public String getUseYn() { return useYn; }
    public void setUseYn(String useYn) { this.useYn = useYn; }
    public String getConfigJson() { return configJson; }
    public void setConfigJson(String configJson) { this.configJson = configJson; }
    public String getVarsJson() { return varsJson; }
    public void setVarsJson(String varsJson) { this.varsJson = varsJson; }
    public String getOptsJson() { return optsJson; }
    public void setOptsJson(String optsJson) { this.optsJson = optsJson; }
    public String getJobDesc() { return jobDesc; }
    public void setJobDesc(String jobDesc) { this.jobDesc = jobDesc; }
    public Integer getTimeoutSec() { return timeoutSec; }
    public void setTimeoutSec(Integer timeoutSec) { this.timeoutSec = timeoutSec; }
    public Long getVer() { return ver; }
    public void setVer(Long ver) { this.ver = ver; }
    public Boolean getNewJob() { return newJob; }
    public void setNewJob(Boolean newJob) { this.newJob = newJob; }
    public Integer getLimit() { return limit; }
    public void setLimit(Integer limit) { this.limit = limit; }
    public String getKeyword() { return keyword; }
    public void setKeyword(String keyword) { this.keyword = keyword; }
    public String getLastStatus() { return lastStatus; }
    public void setLastStatus(String lastStatus) { this.lastStatus = lastStatus; }
    public String getExpr() { return expr; }
    public void setExpr(String expr) { this.expr = expr; }
    public String getVarOverridesJson() { return varOverridesJson; }
    public void setVarOverridesJson(String varOverridesJson) { this.varOverridesJson = varOverridesJson; }
}
