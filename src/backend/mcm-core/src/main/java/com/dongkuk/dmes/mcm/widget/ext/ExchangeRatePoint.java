package com.dongkuk.dmes.mcm.widget.ext;

import java.math.BigDecimal;
import java.time.LocalDate;

/** 일자·대상 통화·값(대상 통화 1단위의 기준 통화 값, 소수 8자리). */
public record ExchangeRatePoint(LocalDate date, String cur, BigDecimal rate) {
}
