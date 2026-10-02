package com.dongkuk.dmes.cactus.mdm;

import java.util.Locale;
import java.util.Optional;

/** 캐시 대상 종류(spec §4.1). MDM {@code TB_MDM_META_REV.TARGET_TYPE}·metaFeed {@code type} 과 같은 이름이다. */
public enum MdmTargetType {
    COLUMN, DOMAIN, RULE, RULE_SET, CODE, LAYOUT;

    public static Optional<MdmTargetType> parse(String text) {
        if (text == null || text.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(valueOf(text.trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
