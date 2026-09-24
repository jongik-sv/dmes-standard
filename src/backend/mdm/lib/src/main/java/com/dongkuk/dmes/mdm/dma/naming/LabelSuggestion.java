package com.dongkuk.dmes.mdm.dma.naming;

/** 표시명 3종 제안. 규칙에 맞는 후보가 없으면 빈 문자열이다. */
public record LabelSuggestion(String labelLong, String labelMid, String labelShort) {
}
