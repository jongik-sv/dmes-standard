package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain;

/** 검사증명서 저장 본문 종류. save 의 kind 값이고 이력 DOC_KND 다. */
public enum MtcKind {
    /** 양식(en·ko·es). */
    FORM,
    /** 예외 규칙. */
    RULE,
    /** 증명서 원천(인터페이스 데이터). */
    CERT,
    /** 단건 수정. */
    OVR,
    /** 서명·도장 이미지. */
    IMG;

    public static MtcKind of(String code) {
        if (code == null) return null;
        for (MtcKind k : values()) {
            if (k.name().equalsIgnoreCase(code.trim())) return k;
        }
        return null;
    }
}
