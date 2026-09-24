package com.dongkuk.dmes.mdm.dma.unitMng;

import java.util.Locale;
import java.util.Set;

/**
 * 월·년·영업일·근무시간처럼 고정 계수가 없는 단위 코드 — 불변 규칙 I4, design.md D3.
 * 대소문자 무관 비교. ASCII 만 다룬다(I20 이 {@code UNIT_CODE} 를 ASCII 로 제한하므로 한글 표기는
 * 애초에 I20 이 먼저 막는다).
 */
public final class UnitForbiddenCodes {

    private static final Set<String> CODES = Set.of("MONTH", "MON", "YEAR", "YR", "BIZDAY", "WORKHOUR");

    private UnitForbiddenCodes() {
    }

    public static boolean isForbidden(String unitCode) {
        return unitCode != null && CODES.contains(unitCode.toUpperCase(Locale.ROOT));
    }
}
