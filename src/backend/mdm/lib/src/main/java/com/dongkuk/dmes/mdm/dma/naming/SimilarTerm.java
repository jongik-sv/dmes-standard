package com.dongkuk.dmes.mdm.dma.naming;

/** 유사어 추천 한 건 — reason 은 EXACT·ENG_NAME·SYNONYM_ALIAS·NAME_PARTIAL·NAME_SIMILAR 중 최고 점수 근거. */
public record SimilarTerm(TermEntry term, String reason, double score) {
}
