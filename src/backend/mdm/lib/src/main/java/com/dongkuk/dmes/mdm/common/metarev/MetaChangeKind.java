package com.dongkuk.dmes.mdm.common.metarev;

import java.util.Locale;
import java.util.Optional;

/** 변경 종류(spec §3.1) — SAVE 원장 변경, EVICT 화면 삭제, RELOAD 화면 재등록. */
public enum MetaChangeKind {
    SAVE, EVICT, RELOAD;

    public static Optional<MetaChangeKind> parse(String text) {
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
