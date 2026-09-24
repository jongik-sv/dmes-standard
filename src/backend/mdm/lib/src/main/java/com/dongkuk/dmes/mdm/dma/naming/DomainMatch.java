package com.dongkuk.dmes.mdm.dma.naming;

/** 도메인 추천 결과 한 건 — 물리명 꼬리와 일치한 표준명 조각 수. */
public record DomainMatch(DomainEntry domain, int matchLength) {
}
