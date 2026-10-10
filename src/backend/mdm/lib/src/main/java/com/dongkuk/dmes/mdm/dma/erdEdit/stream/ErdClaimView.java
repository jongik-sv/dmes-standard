package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

/** 작업 중 표시 한 건(스펙 D17). 권고용이라 다른 세션의 명령을 막지 않고 경고만 붙인다. expiresAt 은 ISO-8601 문자열(ErdPresence 와 같은 이유). */
public record ErdClaimView(String tableId, String session, String userId, String expiresAt) {
}
