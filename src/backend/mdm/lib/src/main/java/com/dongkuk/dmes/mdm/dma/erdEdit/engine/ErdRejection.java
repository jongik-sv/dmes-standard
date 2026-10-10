package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * 거절(스펙 4.2·4.5). hint 는 "다음에 할 일" 문장이다. ownerId 는 {@code NOT_EDITOR} 일 때 그 버전의 소유자(공동 편집자 등록을
 * 부탁할 사람, 스펙 4.5)다 — DRAFT 가 없어 소유자가 없으면 null 이고, 다른 코드에서는 늘 null 이다.
 * byUserId 는 byRev 를 남긴 사용자다(S2-13). 엔진은 null 로 만들고 서비스가 명령 기록에서 찾아 {@link #withByUserId} 로 채운다.
 */
public record ErdRejection(String code, int commandIndex, String message, String hint, String elementId,
                           String property, Long byRev, String bySession, String byUserId,
                           JsonNode current, JsonNode choices, String ownerId) {
    public static final String INVALID = "INVALID";
    public static final String CONFLICT = "CONFLICT";
    public static final String NOT_FOUND = "NOT_FOUND";
    public static final String NEEDS_CHOICE = "NEEDS_CHOICE";
    public static final String NOT_EDITOR = "NOT_EDITOR";

    /** 단계 1 모양(byUserId 없음). */
    public ErdRejection(String code, int commandIndex, String message, String hint, String elementId,
                        String property, Long byRev, String bySession, JsonNode current, JsonNode choices, String ownerId) {
        this(code, commandIndex, message, hint, elementId, property, byRev, bySession, null, current, choices, ownerId);
    }

    /** 소유자 칸이 없는 거절(NOT_EDITOR 밖의 모든 코드). */
    public ErdRejection(String code, int commandIndex, String message, String hint, String elementId,
                        String property, Long byRev, String bySession, JsonNode current, JsonNode choices) {
        this(code, commandIndex, message, hint, elementId, property, byRev, bySession, null, current, choices, null);
    }

    public ErdRejection withByUserId(String userId) {
        return new ErdRejection(code, commandIndex, message, hint, elementId, property, byRev, bySession, userId,
                current, choices, ownerId);
    }

    /** 클라이언트 묶음의 자리로 바꾼 거절. */
    public ErdRejection atIndex(int index) {
        return new ErdRejection(code, index, message, hint, elementId, property, byRev, bySession, byUserId,
                current, choices, ownerId);
    }
}
