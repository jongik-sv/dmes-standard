package com.dongkuk.dmes.mdm.contract.rule;

/** 룰 안 식별자 카운터 — {@code TB_MDM_RULE} 의 {@code last_*_id}(06:931·937·957, TSK-08-01 design.md D8). */
public enum MdmRuleIdKind {
    VAR("LAST_VAR_ID"),
    ROW("LAST_ROW_ID"),
    CASE("LAST_CASE_ID");

    private final String counterColumn;

    MdmRuleIdKind(String counterColumn) {
        this.counterColumn = counterColumn;
    }

    /** 이 종류의 카운터 칼럼 이름. */
    public String counterColumn() {
        return counterColumn;
    }
}
