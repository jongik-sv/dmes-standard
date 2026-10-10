package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

/**
 * 명령 판정 경고. code: STD_MISS | STD_DOMAIN | STD_TYPE | STD_NEW | CLAIMED.
 * {@code CLAIMED} 일 때만 claimedBy(작업 중인 세션)와 expiresAt(만료 시각, ISO-8601)을 싣는다(스펙 4.5). 다른 코드는 둘 다 null.
 */
public record ErdWarning(String code, String elementId, String message, String claimedBy, String expiresAt) {

    public ErdWarning(String code, String elementId, String message) {
        this(code, elementId, message, null, null);
    }
}
