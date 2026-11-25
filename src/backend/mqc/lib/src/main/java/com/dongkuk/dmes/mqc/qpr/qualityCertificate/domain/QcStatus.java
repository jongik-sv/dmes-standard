package com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain;

/** 품질보증서 상태. 초안 → 발행 → (재발행) / 회수. */
public enum QcStatus {
    DRAFT("초안"),
    ISSUED("발행"),
    REISSUED("재발행"),
    RECALLED("회수");

    private final String label;

    QcStatus(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    public static QcStatus of(String text) {
        if (text == null || text.isBlank()) return null;
        for (QcStatus s : values()) {
            if (s.name().equalsIgnoreCase(text.trim()) || s.label.equals(text.trim())) return s;
        }
        return null;
    }

    /** 이력 칸(코드 문자열)의 이름. 모르는 코드는 그대로. */
    public static String labelOf(String code) {
        QcStatus s = of(code);
        return s == null ? code : s.label;
    }
}
