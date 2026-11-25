package com.dongkuk.dmes.mqc.qpr.tagManagement.domain;

/** Tag 상태. 대기 → 발행 → (재발행) / 폐기. */
public enum TagStatus {
    WAIT("대기"),
    ISSUED("발행"),
    REISSUED("재발행"),
    DISCARDED("폐기");

    private final String label;

    TagStatus(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    public static TagStatus of(String text) {
        if (text == null || text.isBlank()) return null;
        for (TagStatus s : values()) {
            if (s.name().equalsIgnoreCase(text.trim()) || s.label.equals(text.trim())) return s;
        }
        return null;
    }

    public static String labelOf(String code) {
        TagStatus s = of(code);
        return s == null ? code : s.label;
    }
}
