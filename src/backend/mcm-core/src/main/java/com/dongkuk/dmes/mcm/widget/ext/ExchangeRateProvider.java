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

    /**
     * 날짜마다 따로 부르는 제공자인지(한국수출입은행). 그렇다면 서비스는 빈 날의 이어진 구간만 나눠 부른다 — 첫 빈 날~마지막 빈 날
     * 사이에 이미 DB 에 있는 날까지 하루씩 다시 부르지 않게. 구간 한 번으로 받는 제공자(Frankfurter)는 false.
     */
    default boolean callsPerDay() {
        return false;
    }
}
