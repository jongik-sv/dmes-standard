package com.dongkuk.dmes.mdm.dma.naming;

import java.util.ArrayList;
import java.util.List;

/**
 * TSK-04-04 design.md §3.2 — 기본 사전 픽스처. termId 는 목록 순서(1부터)다.
 * {@code 원재} 는 최장 일치 대조용, {@code 편성} 은 약어 없는 용어다.
 */
final class NamingFixtures {

    static final TermEntry RAW_MATERIAL = term(1L, "원재료", "RMTL", null, "[\"원자재(ERP)\"]", null);
    static final TermEntry RAW = term(2L, "원재", "RMJ", null, null, null);
    static final TermEntry COIL = term(3L, "코일", "COIL", null, "[\"배치(ERP)\",\"배치넘버(ERP)\"]", "[\"코일ID\"]");
    static final TermEntry ANNEAL_BATCH = term(4L, "소둔배치", "ANN_BATCH", null, "[\"배치(MES 소둔 화면)\"]", null);
    static final TermEntry THICKNESS = term(5L, "두께", "THK", null, null, null);
    static final TermEntry ID = term(6L, "아이디", "ID", null, null, null);
    static final TermEntry FORMATION = term(7L, "편성", null, null, null, null);
    static final TermEntry ERROR = term(8L, "오차", "ERR", "Error", null, null);

    private NamingFixtures() {
    }

    static List<TermEntry> defaultTerms() {
        return List.of(RAW_MATERIAL, RAW, COIL, ANNEAL_BATCH, THICKNESS, ID, FORMATION, ERROR);
    }

    static TermDictionary defaultDictionary() {
        return TermDictionary.of(defaultTerms());
    }

    /** F8b 전용 — 기본 사전에 {@code 차}(CHA) 를 더한다. 기본 사전에 넣으면 {@code 편차} 가 쪼개진다. */
    static TermDictionary withCha() {
        List<TermEntry> terms = new ArrayList<>(defaultTerms());
        terms.add(term(9L, "차", "CHA", null, null, null));
        return TermDictionary.of(terms);
    }

    static TermEntry term(Long id, String name, String abbr, String engName, String synonyms, String aliases) {
        return new TermEntry(id, name, 1, name + " 정의", null, engName, abbr, synonyms, aliases);
    }
}
