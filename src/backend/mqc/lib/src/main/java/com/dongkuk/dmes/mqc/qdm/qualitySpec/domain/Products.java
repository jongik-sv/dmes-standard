package com.dongkuk.dmes.mqc.qdm.qualitySpec.domain;

import java.util.LinkedHashMap;
import java.util.Map;

/** 품명 코드(설계 화면 어휘와 같다 — 3 CCGI · 4 CCLI · G GI · L G/L · W GLX). 표시 모양은 "3 : CCGI". */
public final class Products {
    public static final Map<String, String> NAMES;
    static {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("3", "CCGI");
        m.put("4", "CCLI");
        m.put("G", "GI");
        m.put("L", "G/L");
        m.put("W", "GLX");
        NAMES = java.util.Collections.unmodifiableMap(m);
    }

    private Products() {}

    public static String name(String code) { return code == null ? null : NAMES.get(code); }

    public static String label(String code) {
        String n = name(code);
        return n == null ? code : code + " : " + n;
    }
}
