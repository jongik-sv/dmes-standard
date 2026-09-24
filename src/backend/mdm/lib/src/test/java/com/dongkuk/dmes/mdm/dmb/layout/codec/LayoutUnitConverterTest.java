package com.dongkuk.dmes.mdm.dmb.layout.codec;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

/**
 * TSK-05-03 design.md §3.1 — 단위 경계 변환(불변 I8). 식 {@code value × from.factor ÷ to.factor}(unitMng convertPreview 와 같다).
 */
class LayoutUnitConverterTest {

    private static final LayoutUnitTable UNITS = M201Snapshots.UNITS;

    private static void same(String expected, BigDecimal got) {
        assertEquals(0, new BigDecimal(expected).compareTo(got), expected + " ≠ " + got);
    }

    @Test
    void 같은_차원이면_기준에서_전송_단위로_계수를_곱하고_나눈다() {
        same("3500", LayoutUnitConverter.convert(new BigDecimal("3.5"), "MM", "UM", UNITS));
        same("1", LayoutUnitConverter.convert(new BigDecimal("25.4"), "MM", "INCH", UNITS));
        same("3.5", LayoutUnitConverter.convert(new BigDecimal("3.5"), "MM", "MM", UNITS));
    }

    @Test
    void 수신은_전송_단위에서_기준_단위로_역변환한다() {
        same("3.5", LayoutUnitConverter.convert(new BigDecimal("3500"), "UM", "MM", UNITS));
        same("1.5", LayoutUnitConverter.convert(new BigDecimal("1500"), "KG", "TON", UNITS));
    }

    @Test
    void 차원이_다르면_오류다() {
        LayoutCodecException e = assertThrows(LayoutCodecException.class,
                () -> LayoutUnitConverter.convert(new BigDecimal("1"), "MM", "KG", UNITS));
        assertTrue(e.getMessage().contains("차원"), e.getMessage());
    }

    @Test
    void 단위_마스터에_없는_단위는_오류다() {
        LayoutCodecException e = assertThrows(LayoutCodecException.class,
                () -> LayoutUnitConverter.convert(new BigDecimal("1"), "MM", "NOPE", UNITS));
        assertTrue(e.getMessage().contains("NOPE"), e.getMessage());
    }
}
