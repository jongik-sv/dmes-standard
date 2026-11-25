package com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain;

/** 코일 판정 상태. DB 에는 이름(WAIT 등)을 두고 화면에는 label 을 보인다. */
public enum JudgmentStatus {
    WAIT("판정대기"),
    PASS("합격"),
    FAIL("불합격"),
    HOLD("보류");

    private final String label;

    JudgmentStatus(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    /** 코드 또는 한글 이름으로 찾는다. 못 찾으면 null. */
    public static JudgmentStatus of(String text) {
        if (text == null || text.isBlank()) return null;
        String t = text.trim();
        for (JudgmentStatus s : values()) {
            if (s.name().equalsIgnoreCase(t) || s.label.equals(t)) return s;
        }
        return null;
    }

    public static String labelOf(JudgmentStatus s) {
        return s == null ? null : s.label;
    }
}
