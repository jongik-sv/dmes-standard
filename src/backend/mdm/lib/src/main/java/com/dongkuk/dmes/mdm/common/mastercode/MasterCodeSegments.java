package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import java.math.BigDecimal;

/**
 * 선분 비교(TSK-06-03 design.md §2, 불변 규칙 13). SQLite 는 NUMERIC(7,3) 을 값에 따라 INTEGER·REAL 로 저장하고
 * {@link BigDecimal#equals} 는 scale 을 보므로, 버전 비교는 모두 {@link BigDecimal#compareTo} 로 한다.
 */
public final class MasterCodeSegments {

    private MasterCodeSegments() {
    }

    /** 버전 V 에 유효한 행 = {@code from <= V < to}(04:33). */
    public static boolean valid(BigDecimal from, BigDecimal to, BigDecimal v) {
        return from.compareTo(v) <= 0 && v.compareTo(to) < 0;
    }

    public static boolean same(BigDecimal a, BigDecimal b) {
        return a != null && b != null && a.compareTo(b) == 0;
    }

    public static boolean isOpen(BigDecimal to) {
        return to.compareTo(MasterCodeConventions.OPEN_TO_VER) == 0;
    }
}
