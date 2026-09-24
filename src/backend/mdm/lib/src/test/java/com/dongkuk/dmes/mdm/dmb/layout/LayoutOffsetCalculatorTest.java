package com.dongkuk.dmes.mdm.dmb.layout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import java.util.List;
import org.junit.jupiter.api.Test;

/** TSK-05-02 design.md §3.1 — 오프셋·총 길이 순수 계산(불변 I1~I4). 수치는 html M201(F7). */
class LayoutOffsetCalculatorTest {

    private static final LayoutNumFormat W4 = new LayoutNumFormat(false, true, 1, 4);

    @Test
    void L100_헤더_13항목은_100바이트이고_오프셋은_헤더_안에서_0부터_센다() {
        LayoutOffsetCalculator.Placed placed =
                LayoutOffsetCalculator.placeHeader(List.of(8, 4, 3, 4, 3, 14, 14, 12, 1, 5, 1, 6, 25));
        assertEquals(List.of(0, 8, 12, 15, 19, 22, 36, 50, 62, 63, 68, 69, 75), placed.offsets());
        assertEquals(100, placed.total());
    }

    @Test
    void L110_헤더_6항목은_30바이트이고_Length_항목_오프셋은_6이다() {
        LayoutOffsetCalculator.Placed placed = LayoutOffsetCalculator.placeHeader(List.of(2, 4, 5, 8, 6, 5));
        assertEquals(List.of(0, 2, 6, 11, 19, 25), placed.offsets());
        assertEquals(6, placed.offsets().get(2));
        assertEquals(30, placed.total());
    }

    @Test
    void M201_총_길이_187_본문_첫_오프셋_130_을_재현한다() {
        LayoutOffsetCalculator.Stacked s = LayoutOffsetCalculator.placeMessage(List.of(100, 30), List.of(20, 8, 4, 25));
        assertEquals(List.of(0, 100), s.headerOffsets());
        assertEquals(130, s.headerLength());
        assertEquals(List.of(130, 150, 158, 162), s.bodyOffsets());
        assertEquals(187, s.total());
    }

    @Test
    void 헤더가_없으면_본문은_0부터_시작한다() {
        LayoutOffsetCalculator.Stacked s = LayoutOffsetCalculator.placeMessage(List.of(), List.of(20, 8));
        assertEquals(List.of(), s.headerOffsets());
        assertEquals(0, s.headerLength());
        assertEquals(List.of(0, 20), s.bodyOffsets());
        assertEquals(28, s.total());
    }

    @Test
    void 본문이_없으면_총_길이는_헤더_합이다() {
        LayoutOffsetCalculator.Stacked s = LayoutOffsetCalculator.placeMessage(List.of(100, 30), List.of());
        assertEquals(List.of(), s.bodyOffsets());
        assertEquals(130, s.total());
    }

    @Test
    void 항목_길이는_FILLER면_FILLER_길이_숫자_표현이면_표현_자리수_아니면_도메인_길이다() {
        assertEquals(25, LayoutOffsetCalculator.itemLength(MdmFillKind.FILLER, 25, null, null));
        assertEquals(4, LayoutOffsetCalculator.itemLength(MdmFillKind.DATA, null, W4, 3));
        assertEquals(20, LayoutOffsetCalculator.itemLength(MdmFillKind.DATA, null, null, 20));
        assertThrows(IllegalArgumentException.class,
                () -> LayoutOffsetCalculator.itemLength(MdmFillKind.DATA, null, null, null));
        assertThrows(IllegalArgumentException.class,
                () -> LayoutOffsetCalculator.itemLength(MdmFillKind.FILLER, 0, null, null));
    }
}
