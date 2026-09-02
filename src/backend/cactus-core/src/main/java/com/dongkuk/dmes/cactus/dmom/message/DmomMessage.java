package com.dongkuk.dmes.cactus.dmom.message;

/**
 * 직렬화 완료된 HTTP 송신 단위(트랜잭션 스코프 버퍼 요소).
 *
 * <p>DB 방식은 {@code createMsg} 시점에 즉시 INSERT 되므로 버퍼를 경유하지 않는다 → 본 레코드는 HTTP 전용.
 */
public record DmomMessage(
        String transactionCode,
        String interfaceId,
        String interfaceMsg
) {
}
