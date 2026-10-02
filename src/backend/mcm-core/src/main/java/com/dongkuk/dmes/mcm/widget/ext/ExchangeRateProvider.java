package com.dongkuk.dmes.mcm.widget.ext;

import java.time.LocalDate;
import java.util.List;

/**
 * 환율 제공자 — 스펙 §8.1 {@code fetch(base, symbols, from, to) → [{date, cur, rate}]}.
 * 값은 「대상 통화 1단위 = n 기준 통화」로 돌려준다. 실패는 {@link WidgetExtException}.
 */
public interface ExchangeRateProvider {

    /** TB_MCM_EXCHANGE_RATE.SOURCE 에 적는 이름(frankfurter·koreaexim). */
    String id();

    List<ExchangeRatePoint> fetch(String base, List<String> symbols, LocalDate from, LocalDate to);
}
