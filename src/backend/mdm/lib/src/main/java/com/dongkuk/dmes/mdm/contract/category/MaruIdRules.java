package com.dongkuk.dmes.mdm.contract.category;

/** 마루 ID 규칙 — 원천 04:73, 05:617. */
public final class MaruIdRules {

    /** maru_code_id·maru_data_id·cate_id 금지 문자(점·공백·콤마). */
    public static final String FORBIDDEN_CHAR_PATTERN = "[.,\\s]";

    private MaruIdRules() {
    }
}
