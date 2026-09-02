package com.dongkuk.caravan.console.host.exception;

/**
 * BIZ_SYSTEM 에 대응하는 호스트 매핑이 없거나 호스트 호출 실패 시 던지는 예외.
 * ConsoleException 과 별도로 분리 — 운영자에게 "호스트 등록 필요" 명확한 신호.
 */
public class RemoteHostException extends RuntimeException {

    public RemoteHostException(String message) {
        super(message);
    }

    public RemoteHostException(String message, Throwable cause) {
        super(message, cause);
    }
}
