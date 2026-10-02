package com.dongkuk.dmes.cactus.mdm;

import java.util.Locale;

/** 화면 키 → 컬럼사전 물리명(spec 2026-10-02-mdm-meta-cache-design §5.5, D7). */
public final class MdmNames {

    private MdmNames() {
    }

    /** 소문자가 섞인 이름은 camelCase 로 보고 UPPER_SNAKE 로 바꾼다({@code codeNm} → {@code CODE_NM}). 이미 대문자면 그대로. 비면 null. */
    public static String toPhysName(String name) {
        if (name == null) {
            return null;
        }
        String t = name.trim();
        if (t.isEmpty()) {
            return null;
        }
        if (t.equals(t.toUpperCase(Locale.ROOT))) {
            return t;
        }
        StringBuilder out = new StringBuilder(t.length() + 4);
        for (int i = 0; i < t.length(); i++) {
            char c = t.charAt(i);
            if (i > 0 && Character.isUpperCase(c)) {
                char prev = t.charAt(i - 1);
                if (Character.isLowerCase(prev) || Character.isDigit(prev)) {
                    out.append('_');
                }
            }
            out.append(Character.toUpperCase(c));
        }
        return out.toString();
    }
}
