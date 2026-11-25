package com.dongkuk.dmes.mqc.qdm.qualitySpec.domain;

import java.util.List;
import java.util.Map;

/** 품질사양 상태 코드와 이름. 흐름: 작성중 → 확정 → 전송완료 | 전송실패 → (재전송) → 전송완료 | 전송실패. */
public final class SpecStatus {
    public static final String DRAFT = "DRAFT";
    public static final String CONF = "CONF";
    public static final String SENT = "SENT";
    public static final String FAIL = "FAIL";
    public static final List<String> ALL = List.of(DRAFT, CONF, SENT, FAIL);
    private static final Map<String, String> NAMES = Map.of(DRAFT, "작성중", CONF, "확정", SENT, "전송완료", FAIL, "전송실패");

    private SpecStatus() {}

    public static String name(String code) { return code == null ? null : NAMES.getOrDefault(code, code); }

    /** 주문 적용 대상 상태 — 확정·전송완료만 설계에 쓴다. */
    public static boolean applicable(String code) { return CONF.equals(code) || SENT.equals(code); }

    /** OMS 로 보낼 수 있는 상태 — 확정·전송실패(재전송). */
    public static boolean sendable(String code) { return CONF.equals(code) || FAIL.equals(code); }
}
