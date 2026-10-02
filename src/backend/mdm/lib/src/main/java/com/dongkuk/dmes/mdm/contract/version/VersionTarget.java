package com.dongkuk.dmes.mdm.contract.version;

/**
 * 버전 상태 서비스를 함께 쓰는 대상 — PRD FR-F1(04·06). 버전 칼럼 scale 은 04 {@code DECIMAL(7,3)}(04:994),
 * 06 도 D-144 부터 NUMERIC(7,3). 룰 세트(RULE_SET)는 D-144 2단계에 더했다(스펙 §4.2).
 * LAYOUT 은 전문·헤더가 같은 표를 쓴다(스펙 §4.2 — 헤더 대상을 따로 두지 않는다).
 */
public enum VersionTarget {

    MASTER_CODE("TB_MDM_CODE_VER", 3),
    BUSINESS_RULE("TB_MDM_RULE_VER", 3),
    RULE_SET("TB_MDM_RULE_SET_VER", 3),
    LAYOUT("TB_MDM_LAYOUT_VER", 3);

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
