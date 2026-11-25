package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain;

/** 검사증명서(MTC) 상태. 검토중 → 발행 / 보류. */
public enum MtcStatus {
    REVIEW("검토중"),
    ISSUED("발행"),
    HOLD("보류");

    private final String label;

    MtcStatus(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    public static MtcStatus of(String text) {
        if (text == null || text.isBlank()) return null;
        for (MtcStatus s : values()) {
            if (s.name().equalsIgnoreCase(text.trim()) || s.label.equals(text.trim())) return s;
        }
        return null;
    }

    public static String labelOf(String code) {
        MtcStatus s = of(code);
        return s == null ? code : s.label;
    }
}
