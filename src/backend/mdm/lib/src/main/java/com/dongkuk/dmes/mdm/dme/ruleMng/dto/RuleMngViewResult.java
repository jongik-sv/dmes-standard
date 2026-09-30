package com.dongkuk.dmes.mdm.dme.ruleMng.dto;

import com.dongkuk.dmes.mdm.common.rule.RuleVersionRow;
import java.util.List;

/**
 * {@code ruleMng} action={@code view} 응답(D-105) — 마루 코드 {@code codeMng} 의 상세(헤더·버전 목록) 모양을 따른다.
 *
 * <p>버전 행은 공용 읽기 모델 {@link RuleVersionRow} 를 그대로 쓴다. 화면 버튼 판정은 {@code flags} 가, 확정 취소 가능 여부는
 * {@link VersionRow} 가 들고 서버가 계산한다(실제 거부는 서버가 다시 검사한다). 일시는 KST {@code "yyyy-MM-dd HH:mm:ss"}.
 */
public class RuleMngViewResult {

    private String me;
    private boolean steward;
    private Header header;
    private List<VersionRow> versions;
    private Flags flags;

    public String getMe() { return me; }
    public boolean isSteward() { return steward; }
    public Header getHeader() { return header; }
    public List<VersionRow> getVersions() { return versions; }
    public Flags getFlags() { return flags; }

    public void setMe(String v) { this.me = v; }
    public void setSteward(boolean v) { this.steward = v; }
    public void setHeader(Header v) { this.header = v; }
    public void setVersions(List<VersionRow> v) { this.versions = v; }
    public void setFlags(Flags v) { this.flags = v; }

    /** ① 헤더 — {@code auditVer} 는 TB_MDM_RULE.VER(감사 카운터)다. D-105 부터 헤더 저장의 낙관적 잠금에 쓴다. */
    public static class Header {
        private String maruRuleId;
        private String maruRuleName;
        private String ruleKind;
        private String status;
        private String sourceKind;
        private String sourceSystem;
        private String description;
        private String usageNote;
        private Long auditVer;

        public String getMaruRuleId() { return maruRuleId; }
        public String getMaruRuleName() { return maruRuleName; }
        public String getRuleKind() { return ruleKind; }
        public String getStatus() { return status; }
        public String getSourceKind() { return sourceKind; }
        public String getSourceSystem() { return sourceSystem; }
        public String getDescription() { return description; }
        public String getUsageNote() { return usageNote; }
        public Long getAuditVer() { return auditVer; }

        public void setMaruRuleId(String v) { this.maruRuleId = v; }
        public void setMaruRuleName(String v) { this.maruRuleName = v; }
        public void setRuleKind(String v) { this.ruleKind = v; }
        public void setStatus(String v) { this.status = v; }
        public void setSourceKind(String v) { this.sourceKind = v; }
        public void setSourceSystem(String v) { this.sourceSystem = v; }
        public void setDescription(String v) { this.description = v; }
        public void setUsageNote(String v) { this.usageNote = v; }
        public void setAuditVer(Long v) { this.auditVer = v; }
    }

    /** ② 버전 한 행 — 확정 취소 가능 여부만 화면 판정용으로 덧붙인다. */
    public static class VersionRow extends RuleVersionRow {

        public VersionRow() {
        }

        public VersionRow(Integer ver, String status, String applyFrom, String applyTo, String ownerId, Integer baseVer,
                          String hitPolicy, long rowVersion) {
            super(ver, status, applyFrom, applyTo, ownerId, baseVer, hitPolicy, rowVersion);
        }

        /**
         * 확정 취소 가능(ADR-0002 D8) — 아직 적용 시각이 오지 않은 확정 버전이고 소유자가 요청 사용자이며 미적용 버전이
         * 이 하나일 때만 true.
         */
        private boolean cancelConfirmable;

        public boolean isCancelConfirmable() { return cancelConfirmable; }
        public void setCancelConfirmable(boolean v) { this.cancelConfirmable = v; }
    }

    /** 버튼 판정 — 서버가 계산한다(I7·D6). 화면은 이 값을 믿고 끄기만 하고, 실제 거부는 저장 시점에 다시 검사한다. */
    public static class Flags {
        /** 헤더 수정 가능(D6) — 미적용 버전에 소유자가 있으면 그 소유자만, 없으면 담당자 역할. */
        private boolean headerEditable;
        /** 새 버전 만들기 가능 — 미적용 버전이 없을 때. 폐기한 룰은 불가. */
        private boolean canNewVersion;
        /** 폐기 가능(I9) — 원천 MDM·사용 중(INUSE)·미적용 버전 없을 때. */
        private boolean canDeprecate;
        /** 미적용(작성 중 또는 적용 전 확정) 버전 수. */
        private int unappliedCount;
        /** 지금 적용 중인 RELEASED 버전. 없으면 null(미확정). */
        private Integer currentVer;

        public boolean isHeaderEditable() { return headerEditable; }
        public boolean isCanNewVersion() { return canNewVersion; }
        public boolean isCanDeprecate() { return canDeprecate; }
        public int getUnappliedCount() { return unappliedCount; }
        public Integer getCurrentVer() { return currentVer; }

        public void setHeaderEditable(boolean v) { this.headerEditable = v; }
        public void setCanNewVersion(boolean v) { this.canNewVersion = v; }
        public void setCanDeprecate(boolean v) { this.canDeprecate = v; }
        public void setUnappliedCount(int v) { this.unappliedCount = v; }
        public void setCurrentVer(Integer v) { this.currentVer = v; }
    }
}
