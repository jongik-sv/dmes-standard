package com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain;

/** 검사 항목 판정. 합(PASS) · 부(FAIL) · 보류(HOLD, 재검) · 미검(NONE). */
public enum ItemResult {
    PASS("합"),
    FAIL("부"),
    HOLD("보류"),
    NONE("미검");

    private final String label;

    ItemResult(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
