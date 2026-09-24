package com.dongkuk.dmes.mdm.dma.naming;

/** 분해 토큰 상태(design.md §6.5). UNKNOWN·NO_ABBR 은 물리명에서 {@code ***} 자리가 된다. */
public enum TokenStatus {
    MATCHED,
    SYNONYM,
    AMBIGUOUS,
    NO_ABBR,
    UNKNOWN
}
