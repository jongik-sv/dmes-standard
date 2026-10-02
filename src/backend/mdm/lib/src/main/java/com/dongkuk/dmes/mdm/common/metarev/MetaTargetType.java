package com.dongkuk.dmes.mdm.common.metarev;

import java.util.Locale;
import java.util.Optional;

/** 캐시 대상 종류(spec 2026-10-02-mdm-meta-cache-design §4.1) — {@code TB_MDM_META_REV.TARGET_TYPE}·metaFeed {@code type}. */
public enum MetaTargetType {
    COLUMN, DOMAIN, RULE, RULE_SET, CODE, LAYOUT;

    public static Optional<MetaTargetType> parse(String text) {
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
