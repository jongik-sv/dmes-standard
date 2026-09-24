package com.dongkuk.dmes.mdm.dmb.layout.codec;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;

/**
 * 단위 경계 변환(TSK-05-03 design.md §2 — 불변 I8, D9). {@code value × from.factor ÷ to.factor}, 나눗셈 {@code MathContext(34,
 * HALF_UP)} — unitMng {@code convertPreview} 와 같은 식이다. 송신은 기준 → 전송, 수신은 전송 → 기준. 같은 단위면 그대로.
 */
public final class LayoutUnitConverter {

    private static final MathContext MC = new MathContext(34, RoundingMode.HALF_UP);

    private LayoutUnitConverter() {
    }

    public static BigDecimal convert(BigDecimal value, String fromUnit, String toUnit, LayoutUnitTable units) {
        if (value == null || fromUnit.equals(toUnit)) {
            return value;
        }
        LayoutUnitTable.Unit from = units.require(fromUnit);
        LayoutUnitTable.Unit to = units.require(toUnit);
        if (!from.dimension().equals(to.dimension())) {
            throw new LayoutCodecException("차원이 다르다: " + fromUnit + "(" + from.dimension() + ") → " + toUnit + "(" + to.dimension() + ")");
        }
        return value.multiply(from.factor(), MC).divide(to.factor(), MC);
    }
}
