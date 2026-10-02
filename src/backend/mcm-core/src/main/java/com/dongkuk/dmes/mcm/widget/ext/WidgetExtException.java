package com.dongkuk.dmes.mcm.widget.ext;

/**
 * 외부 정보 제공자(환율·날씨) 호출 실패. 서비스가 잡아 DB·캐시 값 + {@code stale} 로 바꾼다.
 * 원인 예외를 붙이지 않는다 — RestClient 예외 메시지에 요청 주소(인증키 포함)가 들어 있어 로그로 새지 않게 한다.
 */
public class WidgetExtException extends RuntimeException {

    public WidgetExtException(String message) {
        super(message);
    }
}
