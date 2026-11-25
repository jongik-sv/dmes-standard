package com.dongkuk.dmes.mqc.qdm.qualitySpec.domain;

import java.util.Map;

/** 변경 이력 작업 코드와 이름. 개정(REV)은 이름 뒤에 개정 번호를 붙인다(개정 Rev.2). */
public final class ChangeAction {
    public static final String REG = "REG";
    public static final String CONF = "CONF";
    public static final String MOD = "MOD";
    public static final String REV = "REV";
    public static final String SEND = "SEND";
    public static final String SEND_FAIL = "SEND_FAIL";
    public static final String DEL = "DEL";
    private static final Map<String, String> NAMES = Map.of(REG, "등록", CONF, "확정", MOD, "수정", REV, "개정",
            SEND, "OMS 전송", SEND_FAIL, "OMS 전송 실패", DEL, "삭제");

    private ChangeAction() {}

    public static String name(String code, int rev) {
        String n = NAMES.getOrDefault(code, code);
        return REV.equals(code) ? n + " Rev." + rev : n;
    }
}
