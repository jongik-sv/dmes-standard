package com.dongkuk.dmes.mqc.qpr.tagManagement.domain;

/** Tag 종류. 공정 Tag 는 라인 프린터, 출하 Tag 는 출하 프린터에서 찍는다. 출하 Tag 는 코일이 합격이어야 발행한다. */
public enum TagKind {
    PROC("공정 Tag"),
    SHIP("출하 Tag");

    private final String label;

    TagKind(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
