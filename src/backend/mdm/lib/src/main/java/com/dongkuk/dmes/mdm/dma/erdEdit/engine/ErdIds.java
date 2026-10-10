package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import java.util.UUID;
import java.util.regex.Pattern;

/** 요소 id·Oracle 식별자 규칙. */
public final class ErdIds {
    private static final Pattern ORACLE_ID = Pattern.compile("^[A-Z][A-Z0-9_$#]{0,127}$");
    private static final Pattern ELEMENT_ID = Pattern.compile("^[a-z]-[0-9a-zA-Z-]{1,48}$");

    private ErdIds() {}

    public static String newId(char prefix) { return prefix + "-" + UUID.randomUUID(); }

    public static boolean isOracleIdentifier(String s) { return s != null && ORACLE_ID.matcher(s).matches(); }

    public static boolean isElementId(String s) { return s != null && ELEMENT_ID.matcher(s).matches(); }
}
