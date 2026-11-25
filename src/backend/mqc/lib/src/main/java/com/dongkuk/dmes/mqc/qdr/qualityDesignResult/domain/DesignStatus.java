package com.dongkuk.dmes.mqc.qdr.qualityDesignResult.domain;

/** 품질설계 상태. AS-IS 표시는 A : 확정 · B : 설계중. */
public enum DesignStatus {
    WAIT("미설계", "-"), ING("설계중", "B"), CONF("확정", "A"), HOLD("보류", "H");

    private final String label;
    private final String asIs;

    DesignStatus(String label, String asIs) {
        this.label = label;
        this.asIs = asIs;
    }

    public String label() {
        return label;
    }

    /** 공통 섹션 「품질설계상태」 표시값. */
    public String commonLabel() {
        return asIs + " : " + label;
    }

    public static DesignStatus of(String v) {
        if (v == null || v.isBlank()) return null;
        try {
            return valueOf(v.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
