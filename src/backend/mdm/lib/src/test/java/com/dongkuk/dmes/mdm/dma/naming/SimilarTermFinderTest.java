package com.dongkuk.dmes.mdm.dma.naming;

import static com.dongkuk.dmes.mdm.dma.naming.NamingFixtures.term;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/**
 * TSK-04-04 design.md §3.2 S1~S5 — 유사어 1차 문자열 추천(불변 규칙 I27, §6.9).
 */
class SimilarTermFinderTest {

    private final TermDictionary dict = NamingFixtures.defaultDictionary();

    @Test
    void S1_편집_거리_1_은_표기_유사() {
        List<SimilarTerm> found = SimilarTermFinder.find("편차", null, dict);

        SimilarTerm error = find(found, "오차").orElseThrow();
        assertEquals("NAME_SIMILAR", error.reason());
        assertEquals(0.7, error.score(), 1e-9);
        assertTrue(find(found, "두께").isEmpty(), "편집 거리 2 는 유사하지 않다");
    }

    @Test
    void 편집_거리는_1_까지만() {
        assertTrue(find(SimilarTermFinder.find("편차값", null, dict), "오차").isEmpty(),
                "편차값↔오차 는 거리 2 — 한도 1 을 넘는다");
    }

    @Test
    void S2_부분_일치() {
        SimilarTerm coil = find(SimilarTermFinder.find("코일두", null, dict), "코일").orElseThrow();

        assertEquals("NAME_PARTIAL", coil.reason());
        assertEquals(0.8, coil.score(), 1e-9);
    }

    @Test
    void S3_동의어_일치() {
        SimilarTerm coil = find(SimilarTermFinder.find("배치넘버", null, dict), "코일").orElseThrow();

        assertEquals("SYNONYM_ALIAS", coil.reason());
        assertEquals(0.9, coil.score(), 1e-9);
    }

    @Test
    void 동의어_포함은_0_75() {
        SimilarTerm coil = find(SimilarTermFinder.find("배치넘버값", null, dict), "코일").orElseThrow();

        assertEquals("SYNONYM_ALIAS", coil.reason());
        assertEquals(0.75, coil.score(), 1e-9);
    }

    @Test
    void S4_영문명_일치() {
        SimilarTerm error = find(SimilarTermFinder.find("편차", "error", dict), "오차").orElseThrow();

        assertEquals("ENG_NAME", error.reason());
        assertEquals(0.95, error.score(), 1e-9);
        SimilarTerm partial = find(SimilarTermFinder.find("편차", "Errors", dict), "오차").orElseThrow();
        assertEquals(0.7, partial.score(), 1e-9, "영문 포함(0.6)보다 표기 유사(0.7)가 크다");
    }

    @Test
    void 같은_표기는_EXACT() {
        SimilarTerm coil = find(SimilarTermFinder.find("코일", null, dict), "코일").orElseThrow();

        assertEquals("EXACT", coil.reason());
        assertEquals(1.0, coil.score(), 1e-9);
    }

    @Test
    void S5_정렬과_최대_20건과_빈_사전() {
        List<TermEntry> terms = new ArrayList<>();
        for (int i = 0; i < 25; i++) {
            terms.add(term((long) (100 + i), "코일" + (char) ('가' + (24 - i)), "C" + i, null, null, null));
        }
        terms.add(term(1L, "코일", "COIL", null, null, null));
        List<SimilarTerm> found = SimilarTermFinder.find("코일", null, TermDictionary.of(terms));

        assertEquals(20, found.size());
        assertEquals("코일", found.get(0).term().termName());
        for (int i = 1; i < found.size() - 1; i++) {
            SimilarTerm a = found.get(i);
            SimilarTerm b = found.get(i + 1);
            assertTrue(a.score() > b.score()
                    || (a.score() == b.score() && a.term().termName().compareTo(b.term().termName()) <= 0));
        }
        assertTrue(SimilarTermFinder.find("코일", "Coil", TermDictionary.of(List.of())).isEmpty());
    }

    private static Optional<SimilarTerm> find(List<SimilarTerm> found, String name) {
        return found.stream().filter(s -> s.term().termName().equals(name)).findFirst();
    }
}
