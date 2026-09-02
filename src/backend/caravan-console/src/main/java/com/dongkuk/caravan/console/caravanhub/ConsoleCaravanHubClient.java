package com.dongkuk.caravan.console.caravanhub;

/**
 * caravan-console 의 caravan-hub EAI hub 호출 클라이언트 (0.2.0 신규 — cactus 의존 제거 패턴 B).
 *
 * <p>console 가 cactus 의존 0 (옵션 B) — caravan-hub sync REST {@code POST /caravanHubApi/v1/send} 호출 자체 구현.
 * yml prefix {@code caravan-console.caravanhub.*}.
 */
public interface ConsoleCaravanHubClient {

    /**
     * 메시지 송신 — caravan-hub 의 {@code POST /caravanHubApi/v1/send} 호출.
     *
     * @throws ConsoleCaravanHubException 재시도 모두 실패 / 응답 역직렬화 실패 / HTTP 오류 시
     */
    ConsoleCaravanHubSendResult send(String topicId, String transactionCode, String interfaceMsg);
}
