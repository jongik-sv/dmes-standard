package com.dongkuk.dmes.mdm.contract.version;

/**
 * 버전 상태 서비스를 함께 쓰는 대상 — PRD FR-F1(04·06). 버전 칼럼 scale 은 04 {@code DECIMAL(7,3)}(04:994),
 * 06 정수(06:971).
 */
public enum VersionTarget {

    MASTER_CODE("TB_MDM_CODE_VER", 3),
    BUSINESS_RULE("TB_MDM_RULE_VER", 0);

    private final String versionTable;
    private final int versionScale;

    VersionTarget(String versionTable, int versionScale) {
        this.versionTable = versionTable;
        this.versionScale = versionScale;
    }

    public String versionTable() {
        return versionTable;
    }

    public int versionScale() {
        return versionScale;
    }
}
