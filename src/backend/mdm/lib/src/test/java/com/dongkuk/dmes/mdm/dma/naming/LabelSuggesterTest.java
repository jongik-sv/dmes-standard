package com.dongkuk.dmes.mdm.dma.naming;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/**
 * TSK-04-04 design.md §3.2 L1~L4 — 표시명 3종 제안(불변 규칙 I10).
 */
class LabelSuggesterTest {

    @Test
    void L1_논리명에서_긴_중간_짧은_표시명을_만든다() {
        LabelSuggestion s = LabelSuggester.suggest("원재료 코일 두께");

        assertEquals("원재료 코일 두께", s.labelLong());
        assertEquals("원재료 코일 두께", s.labelMid());
        assertEquals("코일두께", s.labelShort());
    }

    @Test
    void 중간은_공백을_빼거나_앞_단어부터_뗀다() {
        // 12자 초과 → 공백 제거 11자
        assertEquals("원재료코일두께편차값", LabelSuggester.suggest("원재료 코일 두께 편차값").labelMid());
        // 공백 제거해도 13자 → 앞 단어부터 뗀다
        LabelSuggestion s = LabelSuggester.suggest("가나다라 마바사아 자차카타파");
        assertEquals("마바사아자차카타파", s.labelMid());
        assertEquals("자차카타파", s.labelShort());
    }

    @Test
    void L2_25자_이상이면_긴_표시명은_빈_값() {
        String name = "가나다라마바사아자차 카타파하가나다라마바 사아자";
        LabelSuggestion s = LabelSuggester.suggest(name);

        assertEquals(25, NamingRules.length(name));
        assertEquals("", s.labelLong());
        assertEquals("", LabelSuggester.suggest("가".repeat(24) + " " + "나").labelLong());
        assertEquals("가".repeat(24), LabelSuggester.suggest("가".repeat(24)).labelLong());
    }

    @Test
    void L3_짧은_규칙에_맞는_후보가_없으면_빈_값() {
        LabelSuggestion s = LabelSuggester.suggest("가 나다라마바사아");

        assertEquals("", s.labelShort());
        assertEquals("가 나다라마바사아", s.labelMid());
    }

    @Test
    void L4_길이는_code_point_수() {
        String sixEmoji = "😀😀😀😀😀😀";
        assertEquals(6, NamingRules.length(sixEmoji));
        assertEquals(sixEmoji, LabelSuggester.suggest(sixEmoji).labelShort());
    }

    @Test
    void 빈_논리명은_모두_빈_값() {
        LabelSuggestion s = LabelSuggester.suggest("  ");

        assertEquals("", s.labelLong());
        assertEquals("", s.labelMid());
        assertEquals("", s.labelShort());
    }
}
