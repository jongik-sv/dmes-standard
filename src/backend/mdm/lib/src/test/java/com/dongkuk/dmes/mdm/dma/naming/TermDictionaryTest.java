package com.dongkuk.dmes.mdm.dma.naming;

import static com.dongkuk.dmes.mdm.dma.naming.NamingFixtures.term;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * TSK-04-04 design.md §3.2 T1~T5 — 표면형 색인(표기·동의어·별칭)과 약어 색인(불변 규칙 I4·I5, D3).
 */
class TermDictionaryTest {

    @Test
    void T1_동의어는_끝의_괄호를_떼고_표면형으로_쓴다() {
        TermDictionary dict = TermDictionary.of(List.of(
                term(3L, "코일", "COIL", null, "[\"배치(ERP)\",\"배치(ERP, APS)\",\"배치\"]", null)));

        List<TermCandidate> hits = dict.candidates("배치");

        assertEquals(1, hits.size());
        assertEquals(3L, hits.get(0).term().termId());
        assertEquals(MatchVia.SYNONYM, hits.get(0).via());
        assertTrue(dict.candidates("배치ERP").isEmpty(), "괄호 안 시스템명은 표면형에 들어가지 않는다");
    }

    @Test
    void T2_객체_원소는_name_없으면_term_필드를_읽는다() {
        TermDictionary dict = TermDictionary.of(List.of(
                term(3L, "코일", "COIL", null, "[{\"name\":\"배치(ERP)\",\"systems\":[\"ERP\"]},{\"term\":\"로트\"}]", null)));

        assertEquals(MatchVia.SYNONYM, dict.candidates("배치").get(0).via());
        assertEquals(MatchVia.SYNONYM, dict.candidates("로트").get(0).via());
    }

    @Test
    void T3_잘못된_JSON_null_숫자_원소는_예외_없이_무시한다() {
        TermDictionary dict = TermDictionary.of(List.of(
                term(1L, "코일", "COIL", null, "[\"배치\"", null),
                term(2L, "두께", "THK", null, "[1, null, {\"x\":1}, \"두께값\"]", "{\"name\":\"객체\"}"),
                term(3L, "폭", "WID", null, "3", null)));

        assertTrue(dict.candidates("배치").isEmpty());
        assertEquals(2L, dict.candidates("두께값").get(0).term().termId());
        assertTrue(dict.candidates("객체").isEmpty());
        assertEquals(3L, dict.candidates("폭").get(0).term().termId());
    }

    @Test
    void T4_별칭은_대문자로_정규화한_키로_찾는다() {
        TermDictionary dict = NamingFixtures.defaultDictionary();

        List<TermCandidate> hits = dict.candidates("코일id");

        assertEquals(1, hits.size());
        assertEquals(MatchVia.ALIAS, hits.get(0).via());
        assertEquals(3L, hits.get(0).term().termId());
    }

    @Test
    void T5_약어_색인은_대소문자를_무시하고_충돌하면_termId_가_작은_쪽() {
        TermDictionary dict = TermDictionary.of(List.of(
                term(7L, "나중", "Dev", null, null, null),
                term(5L, "먼저", "DEV", null, null, null),
                term(6L, "소둔배치", "ANN_BATCH", null, null, null)));

        assertEquals(5L, dict.byAbbr("dev").termId());
        assertEquals(5L, dict.byAbbr("DEV").termId());
        assertEquals(2, dict.maxAbbrParts());
        assertTrue(dict.usedAbbrUpper().containsAll(List.of("DEV", "ANN_BATCH")));
    }

    @Test
    void 같은_용어가_표기와_동의어로_같은_키에_있으면_한_번만_NAME_으로() {
        TermDictionary dict = TermDictionary.of(List.of(
                term(1L, "코일", "COIL", null, "[\"코일(ERP)\"]", null)));

        List<TermCandidate> hits = dict.candidates("코일");

        assertEquals(1, hits.size());
        assertEquals(MatchVia.NAME, hits.get(0).via());
    }

    @Test
    void 빈_사전은_아무것도_찾지_않는다() {
        TermDictionary dict = TermDictionary.of(List.of());

        assertTrue(dict.candidates("코일").isEmpty());
        assertEquals(0, dict.maxSurfaceLength());
        assertEquals(0, dict.maxAbbrParts());
        assertEquals(null, dict.byAbbr("COIL"));
    }
}
