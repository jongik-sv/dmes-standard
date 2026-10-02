package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

import com.dongkuk.dmes.mdm.common.rule.CondIo;
import com.dongkuk.dmes.mdm.common.rule.RuleIo;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import java.util.List;
import java.util.Map;

/**
 * {@code ruleSetEdit} action={@code view} 응답(TSK-08-06 design §6.5) — 세트 한 행, 멤버 룰의 입출력(저장된 목록 순, 중복 없음),
 * 저장된 목록 기준 검사, 쓰기 가능 여부({@code editable} = 담당자 && 고른 버전이 내 DRAFT && 폐기 아님, {@code restorable} = 담당자 && DEPRECATED).
 *
 * <p>D-144 2단계: 세트 칸({@code set})의 흐름·룰 목록·행 버전은 고른 버전 행의 것이고, {@code versions}(VER 내림차순)·{@code flags}(새 버전
 * 버튼)·{@code me}(요청 사용자) 는 룰 {@code RuleMngViewResult} 와 같은 이름이다.
 */
public class RuleSetViewResult {

    private Header set;
    private List<RuleIo> rules;
    private List<RuleSetCheck> checks;
    private boolean editable;
    private boolean restorable;
    /** 저장된 흐름의 IF "그 외" 가 아닌 선마다 조건식 입출력(선 ID 키). 흐름이 없으면 빈 맵. */
    private Map<String, CondIo> condIo;
    /** 저장된 테스트 케이스(case_id 순). 세트 상태와 무관하게 싣는다(폐기 세트도, P-D8). */
    private List<Case> cases;
    private List<VersionRow> versions = List.of();
    private Flags flags = new Flags();
    private String me;

    public RuleSetViewResult() {
    }

    public RuleSetViewResult(Header set, List<RuleIo> rules, List<RuleSetCheck> checks, boolean editable, boolean restorable,
                             Map<String, CondIo> condIo) {
        this(set, rules, checks, editable, restorable, condIo, List.of());
    }

    public RuleSetViewResult(Header set, List<RuleIo> rules, List<RuleSetCheck> checks, boolean editable, boolean restorable,
                             Map<String, CondIo> condIo, List<Case> cases) {
        this.cases = cases;
        this.set = set;
        this.rules = rules;
        this.checks = checks;
        this.editable = editable;
        this.restorable = restorable;
        this.condIo = condIo;
    }

    public Header getSet() { return set; }
    public List<RuleIo> getRules() { return rules; }
    public List<RuleSetCheck> getChecks() { return checks; }
    public boolean isEditable() { return editable; }
    public boolean isRestorable() { return restorable; }
    public Map<String, CondIo> getCondIo() { return condIo; }
    public List<Case> getCases() { return cases; }
    public List<VersionRow> getVersions() { return versions; }
    public Flags getFlags() { return flags; }
    public String getMe() { return me; }

    public void setSet(Header v) { this.set = v; }
    public void setRules(List<RuleIo> v) { this.rules = v; }
    public void setChecks(List<RuleSetCheck> v) { this.checks = v; }
    public void setEditable(boolean v) { this.editable = v; }
    public void setRestorable(boolean v) { this.restorable = v; }
    public void setCondIo(Map<String, CondIo> v) { this.condIo = v; }
    public void setCases(List<Case> v) { this.cases = v; }
    public void setVersions(List<VersionRow> v) { this.versions = v; }
    public void setFlags(Flags v) { this.flags = v; }
    public void setMe(String v) { this.me = v; }

    /** 버전 목록 한 행(VER 내림차순). 룰 {@code RuleMngViewResult.VersionRow} 와 같은 칸 이름. 버전·일시는 문자열({@code "1.000"}·KST). */
    public static class VersionRow {

        private String ver;
        private String verKind;
        private String verLabel;
        private String status;
        private String applyFrom;
        private String applyTo;
        private String ownerId;
        private long rowVersion;
        /** 확정 취소 가능(ADR-0002 D8) — 화면 버튼용, 서버가 실행 때 다시 본다. */
        private boolean cancelConfirmable;

        public VersionRow() {
        }

        public String getVer() { return ver; }
        public String getVerKind() { return verKind; }
        public String getVerLabel() { return verLabel; }
        public String getStatus() { return status; }
        public String getApplyFrom() { return applyFrom; }
        public String getApplyTo() { return applyTo; }
        public String getOwnerId() { return ownerId; }
        public long getRowVersion() { return rowVersion; }
        public boolean isCancelConfirmable() { return cancelConfirmable; }

        public void setVer(String v) { this.ver = v; }
        public void setVerKind(String v) { this.verKind = v; }
        public void setVerLabel(String v) { this.verLabel = v; }
        public void setStatus(String v) { this.status = v; }
        public void setApplyFrom(String v) { this.applyFrom = v; }
        public void setApplyTo(String v) { this.applyTo = v; }
        public void setOwnerId(String v) { this.ownerId = v; }
        public void setRowVersion(long v) { this.rowVersion = v; }
        public void setCancelConfirmable(boolean v) { this.cancelConfirmable = v; }
    }

    /** 버전 버튼 플래그 — 룰 {@code RuleMngViewResult.Flags} 와 같은 규칙·이름(D-144). */
    public static class Flags {

        private boolean canNewMajor;
        private boolean canNewMinor;
        private String nextMajor;
        private String nextMinor;
        private int unappliedCount;
        /** 지금 적용 중인 RELEASED 버전, 없으면 null. */
        private String currentVer;
        /** 담당자이고 사용 중(INUSE)이며 미적용 버전이 없다(Ruling P2-17). */
        private boolean canDeprecate;
        /** 테스트 케이스 저장·삭제 — 담당자이고 폐기 아님. 케이스는 버전이 아니라 세트에 딸린다(Ruling P2-18, {@code RuleSetTestCaseService.save} 와 같은 규칙). */
        private boolean canEditCases;

        public Flags() {
        }

        public boolean isCanNewMajor() { return canNewMajor; }
        public boolean isCanNewMinor() { return canNewMinor; }
        public String getNextMajor() { return nextMajor; }
        public String getNextMinor() { return nextMinor; }
        public int getUnappliedCount() { return unappliedCount; }
        public String getCurrentVer() { return currentVer; }
        public boolean isCanDeprecate() { return canDeprecate; }
        public boolean isCanEditCases() { return canEditCases; }

        public void setCanNewMajor(boolean v) { this.canNewMajor = v; }
        public void setCanNewMinor(boolean v) { this.canNewMinor = v; }
        public void setNextMajor(String v) { this.nextMajor = v; }
        public void setNextMinor(String v) { this.nextMinor = v; }
        public void setUnappliedCount(int v) { this.unappliedCount = v; }
        public void setCurrentVer(String v) { this.currentVer = v; }
        public void setCanDeprecate(boolean v) { this.canDeprecate = v; }
        public void setCanEditCases(boolean v) { this.canEditCases = v; }
    }

    /** {@code TB_MDM_RULE_SET_TEST_CASE} 한 행. */
    public static class Case {

        private Integer caseId;
        private String caseName;
        private String inputJson;
        private String evalTs;
        private String expectedJson;
        private String description;
        private long rowVersion;

        public Case() {
        }

        public Case(Integer caseId, String caseName, String inputJson, String evalTs, String expectedJson, String description,
                    long rowVersion) {
            this.caseId = caseId;
            this.caseName = caseName;
            this.inputJson = inputJson;
            this.evalTs = evalTs;
            this.expectedJson = expectedJson;
            this.description = description;
            this.rowVersion = rowVersion;
        }

        public Integer getCaseId() { return caseId; }
        public String getCaseName() { return caseName; }
        public String getInputJson() { return inputJson; }
        public String getEvalTs() { return evalTs; }
        public String getExpectedJson() { return expectedJson; }
        public String getDescription() { return description; }
        public long getRowVersion() { return rowVersion; }

        public void setCaseId(Integer v) { this.caseId = v; }
        public void setCaseName(String v) { this.caseName = v; }
        public void setInputJson(String v) { this.inputJson = v; }
        public void setEvalTs(String v) { this.evalTs = v; }
        public void setExpectedJson(String v) { this.expectedJson = v; }
        public void setDescription(String v) { this.description = v; }
        public void setRowVersion(long v) { this.rowVersion = v; }
    }

    /**
     * {@code TB_MDM_RULE_SET} 한 행과 고른 버전 행. {@code ruleIds} 는 저장된 JSON 배열 그대로의 순서다. {@code status} 는 부모 계산 상태
     * (CREATED·INUSE·DEPRECATED), {@code rowVersion} 은 고른 버전 행의 ROW_VERSION 이다. 버전이 없으면 버전 칸은 null·{@code rowVersion} 0.
     */
    public static class Header {

        private String setId;
        private String setName;
        private String description;
        private String status;
        private long rowVersion;
        private String ver;
        private String verKind;
        private String verLabel;
        private String verStatus;
        private String ownerId;
        private String baseVer;
        private String applyFrom;
        private String applyTo;
        private List<String> ruleIds;
        /** 저장된 흐름(view 포함). FLOW_JSON 이 NULL 이면 null. */
        private Map<String, Object> flow;
        /** 분기(IF·PARALLEL)가 있으면 true — 1단계 화면은 목록을 읽기 전용으로 보인다. */
        private boolean branched;

        public Header() {
        }

        public Header(String setId, String setName, String description, String status, long rowVersion, List<String> ruleIds,
                      Map<String, Object> flow, boolean branched) {
            this.setId = setId;
            this.setName = setName;
            this.description = description;
            this.status = status;
            this.rowVersion = rowVersion;
            this.ruleIds = ruleIds;
            this.flow = flow;
            this.branched = branched;
        }

        public String getSetId() { return setId; }
        public String getSetName() { return setName; }
        public String getDescription() { return description; }
        public String getStatus() { return status; }
        public long getRowVersion() { return rowVersion; }
        public List<String> getRuleIds() { return ruleIds; }
        public Map<String, Object> getFlow() { return flow; }
        public boolean isBranched() { return branched; }
        public String getVer() { return ver; }
        public String getVerKind() { return verKind; }
        public String getVerLabel() { return verLabel; }
        public String getVerStatus() { return verStatus; }
        public String getOwnerId() { return ownerId; }
        public String getBaseVer() { return baseVer; }
        public String getApplyFrom() { return applyFrom; }
        public String getApplyTo() { return applyTo; }

        public void setSetId(String v) { this.setId = v; }
        public void setSetName(String v) { this.setName = v; }
        public void setDescription(String v) { this.description = v; }
        public void setStatus(String v) { this.status = v; }
        public void setRowVersion(long v) { this.rowVersion = v; }
        public void setRuleIds(List<String> v) { this.ruleIds = v; }
        public void setFlow(Map<String, Object> v) { this.flow = v; }
        public void setBranched(boolean v) { this.branched = v; }
        public void setVer(String v) { this.ver = v; }
        public void setVerKind(String v) { this.verKind = v; }
        public void setVerLabel(String v) { this.verLabel = v; }
        public void setVerStatus(String v) { this.verStatus = v; }
        public void setOwnerId(String v) { this.ownerId = v; }
        public void setBaseVer(String v) { this.baseVer = v; }
        public void setApplyFrom(String v) { this.applyFrom = v; }
        public void setApplyTo(String v) { this.applyTo = v; }
    }
}
