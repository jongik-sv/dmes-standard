package com.dongkuk.dmes.mdm.dma.naming;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * TSK-04-04 design.md §3.2 A1~A6 — 영문명 → 약어 제안과 대안(불변 규칙 I19, §6.10).
 */
class AbbrSuggesterTest {

    @Test
    void A1_앞_세_글자가_기본() {
        AbbrSuggestion s = AbbrSuggester.suggest("Deviation", Set.of());

        assertEquals("DEV", s.base());
        assertFalse(s.baseTaken());
        assertEquals("DEV", s.suggested());
        assertEquals(List.of("DEV", "DEVI", "DEVIA"), s.alternatives());
    }

    @Test
    void A2_사용_중이면_한_글자씩_늘린_대안() {
        AbbrSuggestion s = AbbrSuggester.suggest("Deviation", Set.of("DEV"));

        assertTrue(s.baseTaken());
        assertEquals("DEVI", s.suggested());
        assertEquals(List.of("DEVI", "DEVIA", "DEVIAT"), s.alternatives());
    }

    @Test
    void A3_사용_약어는_대소문자를_무시한다() {
        AbbrSuggestion s = AbbrSuggester.suggest("Deviation", Set.of("dev", "Devi"));

        assertTrue(s.baseTaken());
        assertEquals("DEVIA", s.suggested());
    }

    @Test
    void A4_영숫자만_남긴다() {
        assertEquals("RAW", AbbrSuggester.suggest("Raw-Material 2", Set.of()).base());
        assertEquals(List.of("RAWM", "RAWMA", "RAWMAT"),
                AbbrSuggester.suggest("Raw-Material 2", Set.of("RAW")).alternatives());
    }

    @Test
    void A5_빈_문자열이나_숫자로_시작하면_제안_없음() {
        for (String engName : new String[]{"", "  ", null, "2nd Pass", "-"}) {
            AbbrSuggestion s = AbbrSuggester.suggest(engName, Set.of());
            assertNull(s.base(), String.valueOf(engName));
            assertNull(s.suggested());
            assertFalse(s.baseTaken());
            assertTrue(s.alternatives().isEmpty());
        }
    }

    @Test
    void A6_짧은_이름은_숫자를_붙인다() {
        AbbrSuggestion s = AbbrSuggester.suggest("Id", Set.of("ID"));

        assertEquals("ID", s.base());
        assertTrue(s.baseTaken());
        assertEquals(List.of("ID2", "ID3", "ID4"), s.alternatives());
    }

    @Test
    void 모든_후보가_사용_중이면_제안_없음() {
        AbbrSuggestion s = AbbrSuggester.suggest("Id", Set.of("ID", "ID2", "ID3", "ID4", "ID5", "ID6", "ID7", "ID8", "ID9"));

        assertNull(s.suggested());
        assertTrue(s.alternatives().isEmpty());
    }
}
