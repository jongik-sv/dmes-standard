package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.math.BigDecimal;
import java.util.Objects;

/**
 * 04 DECIMAL(7,3) 버전 번호의 엔티티·IdClass 값 규칙(TSK-06-01 §6.2, 불변 규칙 23, F26).
 *
 * <p>SQLite 는 NUMERIC 친화도라 1.000 을 INTEGER 1 로 저장해 Hibernate 가 읽은 값의 scale 이 0 이 된다. 게터는 scale 3
 * ({@link VersionTarget#MASTER_CODE} 의 versionScale)을 돌려주고, IdClass 동등성은 scale 과 무관하게 한다
 * ({@link BigDecimal#equals} 는 scale 을 본다). DECIMAL(7,3) 이라 반올림은 필요 없다 — 필요하면
 * {@link ArithmeticException} 으로 드러난다.
 */
final class MdmCodeVerNumbers {

    private MdmCodeVerNumbers() {
    }

    static BigDecimal scaled(BigDecimal value) {
        return value == null ? null : value.setScale(VersionTarget.MASTER_CODE.versionScale());
    }

    static boolean same(BigDecimal a, BigDecimal b) {
        return a == null ? b == null : b != null && a.compareTo(b) == 0;
    }

    static int hash(BigDecimal value) {
        return Objects.hashCode(value == null ? null : value.stripTrailingZeros());
    }
}
