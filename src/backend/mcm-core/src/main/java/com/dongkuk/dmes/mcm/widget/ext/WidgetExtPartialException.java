package com.dongkuk.dmes.mcm.widget.ext;

import java.util.List;

/**
 * 환율 제공자가 일부 날짜만 받고 멈춘 경우 — 받은 값({@link #partial()})을 함께 싣는다.
 * 서비스는 받은 값은 저장·합치되 응답에 {@code stale} 을 붙이고 시도 기록을 실패로 남긴다(뒤 날짜가 빠진 채 정상으로 보이지 않게).
 */
public class WidgetExtPartialException extends WidgetExtException {

    private final List<ExchangeRatePoint> partial;

    public WidgetExtPartialException(String message, List<ExchangeRatePoint> partial) {
        super(message);
        this.partial = partial == null ? List.of() : List.copyOf(partial);
    }

    /** 멈추기 전까지 받은 값(비어 있지 않다). */
    public List<ExchangeRatePoint> partial() {
        return partial;
    }
}
