package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * 거절(스펙 4.2·4.5). hint 는 "다음에 할 일" 문장이다. ownerId 는 {@code NOT_EDITOR} 일 때 그 버전의 소유자(공동 편집자 등록을
 * 부탁할 사람, 스펙 4.5)다 — DRAFT 가 없어 소유자가 없으면 null 이고, 다른 코드에서는 늘 null 이다.
 */
public record ErdRejection(String code, int commandIndex, String message, String hint, String elementId,
                           String property, Long byRev, String bySession,
                           JsonNode current, JsonNode choices, String ownerId) {
    public static final String INVALID = "INVALID";
    public static final String CONFLICT = "CONFLICT";
    public static final String NOT_FOUND = "NOT_FOUND";
    public static final String NEEDS_CHOICE = "NEEDS_CHOICE";
    public static final String NOT_EDITOR = "NOT_EDITOR";

    /** 소유자 칸이 없는 거절(NOT_EDITOR 밖의 모든 코드). */
    public ErdRejection(String code, int commandIndex, String message, String hint, String elementId,
                        String property, Long byRev, String bySession, JsonNode current, JsonNode choices) {
        this(code, commandIndex, message, hint, elementId, property, byRev, bySession, current, choices, null);
    }
}
