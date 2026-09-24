package com.dongkuk.dmes.mdm.dmb.layout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import org.junit.jupiter.api.Test;

/** TSK-05-02 design.md §3.1 — 3층 기본값 해석 순서(불변 I10, F9). */
class LayoutConstResolverTest {

    @Test
    void CONST_는_재정의가_있으면_재정의_값이다() {
        assertEquals("B1", LayoutConstResolver.effective(MdmFillKind.CONST, "B0", "B1"));
    }

    @Test
    void CONST_는_재정의가_비면_헤더_기본값이다() {
        assertEquals("B0", LayoutConstResolver.effective(MdmFillKind.CONST, "B0", null));
        assertEquals("B0", LayoutConstResolver.effective(MdmFillKind.CONST, "B0", ""));
        assertEquals("B0", LayoutConstResolver.effective(MdmFillKind.CONST, "B0", "  "));
    }

    @Test
    void AUTO_는_재정의를_무시하고_송신_시_채움으로_보인다() {
        assertEquals("(송신 시 채움: SEND_TIME)", LayoutConstResolver.effective(MdmFillKind.AUTO, "SEND_TIME", "X"));
    }

    @Test
    void DATA_FILLER_는_값이_없다() {
        assertNull(LayoutConstResolver.effective(MdmFillKind.DATA, "B0", "B1"));
        assertNull(LayoutConstResolver.effective(MdmFillKind.FILLER, null, "B1"));
    }
}
