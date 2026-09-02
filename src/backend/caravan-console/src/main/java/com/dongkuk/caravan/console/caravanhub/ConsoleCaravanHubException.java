package com.dongkuk.caravan.console.caravanhub;

/**
 * caravan-console caravan-hub 통합 클라이언트 호출 실패 예외 (0.2.0 신규 — cactus 의존 제거 패턴 B).
 */
public class ConsoleCaravanHubException extends RuntimeException {

    public ConsoleCaravanHubException(String message) {
        super(message);
    }

    public ConsoleCaravanHubException(String message, Throwable cause) {
        super(message, cause);
    }
}
