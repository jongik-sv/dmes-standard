package com.dongkuk.dmes.cactus.job;

import java.math.BigDecimal;

/** 수집(COLLECT) 값 한 건 — 숫자는 num(소수 8자리까지), 그 밖은 txt(200자까지). 둘 중 하나만 값이 있다. */
public record CollectedValue(String key, BigDecimal num, String txt) {
}
