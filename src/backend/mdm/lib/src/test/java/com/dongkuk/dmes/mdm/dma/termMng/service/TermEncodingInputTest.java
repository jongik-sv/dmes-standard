package com.dongkuk.dmes.mdm.dma.termMng.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/**
 * 인코딩 입력 형식 — term-embedding.md §2(D-025): {@code "{표기}: {정의} ({영문명})"}, 각 값은 strip,
 * 정의가 비면 {@code ": {정의}"}, 영문명이 비면 {@code " ({영문명})"} 를 뺀다(PoC TermCorpus.encodeInput 과 같다).
 */
class TermEncodingInputTest {

    @Test
    void 세_값이_모두_있으면_전체_형식() {
        assertEquals("실평량: 실제로 잰 평량 (ActualWeightAmount)",
                TermMngService.buildEncodingInput(" 실평량 ", " 실제로 잰 평량 ", " ActualWeightAmount "));
    }

    @Test
    void 정의가_비면_정의_부분을_뺀다() {
        assertEquals("실평량 (ActualWeightAmount)", TermMngService.buildEncodingInput("실평량", "", "ActualWeightAmount"));
        assertEquals("실평량 (ActualWeightAmount)", TermMngService.buildEncodingInput("실평량", null, "ActualWeightAmount"));
    }

    @Test
    void 영문명이_비면_영문명_부분을_뺀다() {
        assertEquals("반제품: 첫공정 불출부터 제품입고 전까지", TermMngService.buildEncodingInput("반제품", "첫공정 불출부터 제품입고 전까지", " "));
    }

    @Test
    void 표기만_있으면_표기만() {
        assertEquals("코일", TermMngService.buildEncodingInput("코일", null, null));
    }
}
