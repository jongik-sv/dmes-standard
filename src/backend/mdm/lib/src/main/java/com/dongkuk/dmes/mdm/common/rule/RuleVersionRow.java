package com.dongkuk.dmes.mdm.common.rule;

/**
 * {@code TB_MDM_RULE_VER} 한 행의 읽기 모델 — 헤더·버전 화면({@code ruleMng})과 내용 화면({@code ruleEdit})이 같이 쓴다.
 *
 * <p>D-105 로 버전 목록이 두 화면에 모두 필요해졌다. {@code ruleMng} 은 관리 버튼 판정용 플래그를 덧씌우고,
 * {@code ruleEdit} 은 읽기 전용 버전 고르기에만 쓴다. 그래서 행 모양은 여기 한 곳에 두고 화면별 Result 는
 * {@code extends} 로 확장한다(값을 다시 만들지 않는다). 일시는 KST {@code "yyyy-MM-dd HH:mm:ss"}.
 */
public class RuleVersionRow {

    private Integer ver;
    private String status;
    private String applyFrom;
    private String applyTo;
    private String ownerId;
    private Integer baseVer;
    /** 적중 정책(FIRST·UNIQUE·PRIORITY·COLLECT·ANY) — 버전마다 복제되지만 D-133 부터 룰 편집 화면의 표 저장에서만 고친다. */
    private String hitPolicy;
    private long rowVersion;

    public RuleVersionRow() {
    }

    public RuleVersionRow(Integer ver, String status, String applyFrom, String applyTo, String ownerId, Integer baseVer,
                          String hitPolicy, long rowVersion) {
        this.ver = ver;
        this.status = status;
        this.applyFrom = applyFrom;
        this.applyTo = applyTo;
        this.ownerId = ownerId;
        this.baseVer = baseVer;
        this.hitPolicy = hitPolicy;
        this.rowVersion = rowVersion;
    }

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
