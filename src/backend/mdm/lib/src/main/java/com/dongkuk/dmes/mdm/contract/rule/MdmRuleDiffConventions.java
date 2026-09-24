package com.dongkuk.dmes.mdm.contract.rule;

/**
 * 06 확정 검사 SPI({@code VersionConfirmCheckSpi}, target BUSINESS_RULE)의 diff 관례 — 구현 TSK-08-05(TSK-08-01 design.md D10).
 *
 * <p>{@code VersionDiffEntry.key} 는 {@code row_id} 의 10진 문자열이고, {@code oldValues}·{@code newValues} 의 키는 아래 둘이다
 * (06:1255-1268: cells 나 seq 가 다르면 CHANGED). SEQ 값은 {@code Integer}, CELLS 값은 정규화 JSON 문자열(규칙표 #3·#6).
 */
public final class MdmRuleDiffConventions {

    public static final String SEQ = "SEQ";
    public static final String CELLS = "CELLS";

    private MdmRuleDiffConventions() {
    }
}
