package com.dongkuk.dmes.mdm.dmb.layout.codec;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 단위 마스터 한 벌(TSK-05-03 design.md §2, D9) — {@code TB_MDM_UNIT} 의 코드·차원·계수. 계수 = 차원 기준 단위로의 배수.
 */
public record LayoutUnitTable(Map<String, Unit> units) {

    public record Unit(String code, String dimension, BigDecimal factor) {
    }

    public LayoutUnitTable {
        units = Map.copyOf(units);
    }

    public static LayoutUnitTable of(Collection<Unit> list) {
        Map<String, Unit> m = new LinkedHashMap<>();
        for (Unit u : list) {
            m.put(u.code(), u);
        }
        return new LayoutUnitTable(m);
    }

    public static LayoutUnitTable empty() {
        return new LayoutUnitTable(Map.of());
    }

    public boolean has(String code) {
        return code != null && units.containsKey(code);
    }

    /** @throws LayoutCodecException 단위 마스터에 없다 */
    public Unit require(String code) {
        Unit u = code == null ? null : units.get(code);
        if (u == null) {
            throw new LayoutCodecException("단위 마스터에 없는 단위: " + code);
        }
        return u;
    }
}
