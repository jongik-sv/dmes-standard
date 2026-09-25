package com.dongkuk.dmes.mdm.dme.ruleEdit.dto;

import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import java.util.List;
import java.util.Map;

/**
 * {@code ruleEdit} action={@code view} 응답(TSK-08-02 design §6.2). 화면은 {@code editable}(표 편집)·{@code headerEditable}(헤더
 * 편집)만으로 편집을 켠다 — 서버가 판정한다(I7·D6). 일시는 KST {@code "yyyy-MM-dd HH:mm:ss"}.
 */
public class RuleEditViewResult {

    private String me;
    private boolean editable;
    private boolean headerEditable;
    private boolean unappliedVersionExists;
    private boolean confirmScreenReady;
    private RuleInfo rule;
    private List<VersionInfo> versions;
    private Integer selectedVer;
    private List<ResolvedVar> vars;
    private List<RowInfo> rows;
    private List<RowInfo> baseRows;
    private List<ResolvedVar> baseVars;
    private List<VarCandidate> varCandidates;
    private List<VarMeta> varMeta;
    private List<VarMeta> baseVarMeta;
    private List<Map<String, Object>> issues;
    private UsageInfo usage;
    private List<TestCaseInfo> testCases;

    public String getMe() { return me; }
    public boolean isEditable() { return editable; }
    public boolean isHeaderEditable() { return headerEditable; }
    public boolean isUnappliedVersionExists() { return unappliedVersionExists; }
    public boolean isConfirmScreenReady() { return confirmScreenReady; }
    public RuleInfo getRule() { return rule; }
    public List<VersionInfo> getVersions() { return versions; }
    public Integer getSelectedVer() { return selectedVer; }
    public List<ResolvedVar> getVars() { return vars; }
    public List<RowInfo> getRows() { return rows; }
    public List<RowInfo> getBaseRows() { return baseRows; }
    public List<ResolvedVar> getBaseVars() { return baseVars; }
    public List<VarCandidate> getVarCandidates() { return varCandidates; }
    public List<VarMeta> getVarMeta() { return varMeta; }
    public List<VarMeta> getBaseVarMeta() { return baseVarMeta; }
    public List<Map<String, Object>> getIssues() { return issues; }
    public UsageInfo getUsage() { return usage; }
    public List<TestCaseInfo> getTestCases() { return testCases; }

    public void setMe(String v) { this.me = v; }
    public void setEditable(boolean v) { this.editable = v; }
    public void setHeaderEditable(boolean v) { this.headerEditable = v; }
    public void setUnappliedVersionExists(boolean v) { this.unappliedVersionExists = v; }
    public void setConfirmScreenReady(boolean v) { this.confirmScreenReady = v; }
    public void setRule(RuleInfo v) { this.rule = v; }
    public void setVersions(List<VersionInfo> v) { this.versions = v; }
    public void setSelectedVer(Integer v) { this.selectedVer = v; }
    public void setVars(List<ResolvedVar> v) { this.vars = v; }
    public void setRows(List<RowInfo> v) { this.rows = v; }
    public void setBaseRows(List<RowInfo> v) { this.baseRows = v; }
    public void setBaseVars(List<ResolvedVar> v) { this.baseVars = v; }
    public void setVarCandidates(List<VarCandidate> v) { this.varCandidates = v; }
    public void setVarMeta(List<VarMeta> v) { this.varMeta = v; }
    public void setBaseVarMeta(List<VarMeta> v) { this.baseVarMeta = v; }
    public void setIssues(List<Map<String, Object>> v) { this.issues = v; }
    public void setUsage(UsageInfo v) { this.usage = v; }
    public void setTestCases(List<TestCaseInfo> v) { this.testCases = v; }

    /**
     * 열 설정 초안이 되돌려 보낼 저장 원값(TSK-08-03). {@code ResolvedVar} 는 해석된 값(도메인·타입)이라 그대로 되보내면 사전 타입 열이
     * 선언 타입으로 바뀌어 저장되므로, 저장된 칼럼 값을 새 필드로 따로 싣는다({@code ResolvedVar} 필드 추가 금지 — 08-01 불변).
     */
    public static class VarMeta {
        private Integer varId;
        private String axis;
        private String resGrp;
        private String grpCond;
        private String collectAgg;
        private List<String> prioList;
        private Long domainId;
        private String dataType;

        public VarMeta() {
        }

        public VarMeta(Integer varId, String axis, String resGrp, String grpCond, String collectAgg, List<String> prioList,
                       Long domainId, String dataType) {
            this.varId = varId;
            this.axis = axis;
            this.resGrp = resGrp;
            this.grpCond = grpCond;
            this.collectAgg = collectAgg;
            this.prioList = prioList;
            this.domainId = domainId;
            this.dataType = dataType;
        }

        public Integer getVarId() { return varId; }
        public String getAxis() { return axis; }
        public String getResGrp() { return resGrp; }
        public String getGrpCond() { return grpCond; }
        public String getCollectAgg() { return collectAgg; }
        public List<String> getPrioList() { return prioList; }
        public Long getDomainId() { return domainId; }
        public String getDataType() { return dataType; }

        public void setVarId(Integer v) { this.varId = v; }
        public void setAxis(String v) { this.axis = v; }
        public void setResGrp(String v) { this.resGrp = v; }
        public void setGrpCond(String v) { this.grpCond = v; }
        public void setCollectAgg(String v) { this.collectAgg = v; }
        public void setPrioList(List<String> v) { this.prioList = v; }
        public void setDomainId(Long v) { this.domainId = v; }
        public void setDataType(String v) { this.dataType = v; }
    }

    /** 식 입력 칸 datalist 소스 — 컬럼 사전 물리명(COLUMN)·앞 룰 결과 변수(RULE_RESULT, TSK-08-03). */
    public static class VarCandidate {
        private String name;
        private String label;
        private String kind;

        public VarCandidate() {
        }

        public VarCandidate(String name, String label, String kind) {
            this.name = name;
            this.label = label;
            this.kind = kind;
        }

        public String getName() { return name; }
        public String getLabel() { return label; }
        public String getKind() { return kind; }

        public void setName(String v) { this.name = v; }
        public void setLabel(String v) { this.label = v; }
        public void setKind(String v) { this.kind = v; }
    }

    /** 룰 헤더(카드 ①). */
    public static class RuleInfo {
        private String maruRuleId;
        private String maruRuleName;
        private String ruleKind;
        private String status;
        private String sourceKind;
        private String sourceSystem;
        private String description;
        private String usageNote;

        public String getMaruRuleId() { return maruRuleId; }
        public String getMaruRuleName() { return maruRuleName; }
        public String getRuleKind() { return ruleKind; }
        public String getStatus() { return status; }
        public String getSourceKind() { return sourceKind; }
        public String getSourceSystem() { return sourceSystem; }
        public String getDescription() { return description; }
        public String getUsageNote() { return usageNote; }

        public void setMaruRuleId(String v) { this.maruRuleId = v; }
        public void setMaruRuleName(String v) { this.maruRuleName = v; }
        public void setRuleKind(String v) { this.ruleKind = v; }
        public void setStatus(String v) { this.status = v; }
        public void setSourceKind(String v) { this.sourceKind = v; }
        public void setSourceSystem(String v) { this.sourceSystem = v; }
        public void setDescription(String v) { this.description = v; }
        public void setUsageNote(String v) { this.usageNote = v; }
    }

    /** 버전 목록 한 행(카드 ②, ver 내림차순). */
    public static class VersionInfo {
        private Integer ver;
        private String status;
        private String applyFrom;
        private String applyTo;
        private String ownerId;
        private Integer baseVer;
        private String hitPolicy;
        private long rowVersion;

        public Integer getVer() { return ver; }
        public String getStatus() { return status; }
        public String getApplyFrom() { return applyFrom; }
        public String getApplyTo() { return applyTo; }
        public String getOwnerId() { return ownerId; }
        public Integer getBaseVer() { return baseVer; }
        public String getHitPolicy() { return hitPolicy; }
        public long getRowVersion() { return rowVersion; }

        public void setVer(Integer v) { this.ver = v; }
        public void setStatus(String v) { this.status = v; }
        public void setApplyFrom(String v) { this.applyFrom = v; }
        public void setApplyTo(String v) { this.applyTo = v; }
        public void setOwnerId(String v) { this.ownerId = v; }
        public void setBaseVer(Integer v) { this.baseVer = v; }
        public void setHitPolicy(String v) { this.hitPolicy = v; }
        public void setRowVersion(long v) { this.rowVersion = v; }
    }

    /** 행 하나(저장 형태 — {@code cells} 는 JSON 문자열). NORMAL 먼저 seq·row_id 순, 기본 행은 마지막. */
    public static class RowInfo {
        private Integer rowId;
        private int seq;
        private String rowKind;
        private String cells;
        private String note;

        public RowInfo() {
        }

        public RowInfo(Integer rowId, int seq, String rowKind, String cells, String note) {
            this.rowId = rowId;
            this.seq = seq;
            this.rowKind = rowKind;
            this.cells = cells;
            this.note = note;
        }

        public Integer getRowId() { return rowId; }
        public int getSeq() { return seq; }
        public String getRowKind() { return rowKind; }
        public String getCells() { return cells; }
        public String getNote() { return note; }

        public void setRowId(Integer v) { this.rowId = v; }
        public void setSeq(int v) { this.seq = v; }
        public void setRowKind(String v) { this.rowKind = v; }
        public void setCells(String v) { this.cells = v; }
        public void setNote(String v) { this.note = v; }
    }

    /** 테스트 케이스(카드 ⑥, TSK-08-04 design §6.6) — 버전과 무관하다. JSON 두 칸은 저장된 글자 그대로다. */
    public static class TestCaseInfo {
        private Integer caseId;
        private String caseName;
        private String inputJson;
        private String expectedJson;
        private String description;
        private long rowVersion;

        public TestCaseInfo() {
        }

        public TestCaseInfo(Integer caseId, String caseName, String inputJson, String expectedJson, String description, long rowVersion) {
            this.caseId = caseId;
            this.caseName = caseName;
            this.inputJson = inputJson;
            this.expectedJson = expectedJson;
            this.description = description;
            this.rowVersion = rowVersion;
        }

        public Integer getCaseId() { return caseId; }
        public String getCaseName() { return caseName; }
        public String getInputJson() { return inputJson; }
        public String getExpectedJson() { return expectedJson; }
        public String getDescription() { return description; }
        public long getRowVersion() { return rowVersion; }

        public void setCaseId(Integer v) { this.caseId = v; }
        public void setCaseName(String v) { this.caseName = v; }
        public void setInputJson(String v) { this.inputJson = v; }
        public void setExpectedJson(String v) { this.expectedJson = v; }
        public void setDescription(String v) { this.description = v; }
        public void setRowVersion(long v) { this.rowVersion = v; }
    }

    /** 활용처(카드 ⑧). */
    public static class UsageInfo {
        private String usageNote;
        private List<SetInfo> sets;

        public UsageInfo() {
        }

        public UsageInfo(String usageNote, List<SetInfo> sets) {
            this.usageNote = usageNote;
            this.sets = sets;
        }

        public String getUsageNote() { return usageNote; }
        public List<SetInfo> getSets() { return sets; }

        public void setUsageNote(String v) { this.usageNote = v; }
        public void setSets(List<SetInfo> v) { this.sets = v; }
    }

    /** 이 룰을 담은 룰 세트와 세트 안의 의존(이 룰이 읽는 이름을 만드는 룰)·역의존(이 룰이 만드는 이름을 읽는 룰). */
    public static class SetInfo {
        private String setId;
        private String setName;
        private String status;
        private List<String> dependsOn;
        private List<String> dependedBy;

        public SetInfo() {
        }

        public SetInfo(String setId, String setName, String status, List<String> dependsOn, List<String> dependedBy) {
            this.setId = setId;
            this.setName = setName;
            this.status = status;
            this.dependsOn = dependsOn;
            this.dependedBy = dependedBy;
        }

        public String getSetId() { return setId; }
        public String getSetName() { return setName; }
        public String getStatus() { return status; }
        public List<String> getDependsOn() { return dependsOn; }
        public List<String> getDependedBy() { return dependedBy; }

        public void setSetId(String v) { this.setId = v; }
        public void setSetName(String v) { this.setName = v; }
        public void setStatus(String v) { this.status = v; }
        public void setDependsOn(List<String> v) { this.dependsOn = v; }
        public void setDependedBy(List<String> v) { this.dependedBy = v; }
    }
}
