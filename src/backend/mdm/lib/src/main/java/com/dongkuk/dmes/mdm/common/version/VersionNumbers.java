package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collection;

/**
 * 버전 채번·비교 공통 규칙(D-144, 원천 04 「새 버전 대화상자」 I1~I4).
 *
 * <p>major = {@code floor(max) + 1}, minor = {@code max + 0.001}. max 는 상태로 거르지 않은 모든 버전에서 구한다.
 * SQLite NUMERIC 은 1.000 을 INTEGER, 1.001 을 REAL 로 저장하므로 산술·비교·정렬은 Java 에서만 한다(규칙표 #17).
 */
public final class VersionNumbers {

    public static final int SCALE = 3;
    public static final BigDecimal FIRST = MasterCodeConventions.FIRST_VER.setScale(SCALE);
    private static final BigDecimal MINOR_STEP = new BigDecimal("0.001");

    private static final java.util.regex.Pattern VER_PATTERN = java.util.regex.Pattern.compile("^\\d{1,4}(\\.\\d{1,3})?$");

    private VersionNumbers() {
    }

    /** 버전이 없으면 null. 상태로 거르지 않는다(I1). */
    public static BigDecimal maxVer(Collection<BigDecimal> all) {
        BigDecimal max = null;
        for (BigDecimal ver : all) {
            if (ver != null && (max == null || ver.compareTo(max) > 0)) {
                max = ver;
            }
        }
        return scaled(max);
    }

    /** max 가 null(버전 없음)이면 {@link #FIRST}. */
    public static BigDecimal nextMajor(BigDecimal max) {
        if (max == null) {
            return FIRST;
        }
        return max.setScale(0, RoundingMode.FLOOR).add(BigDecimal.ONE).setScale(SCALE);
    }

    public static boolean canMajor(BigDecimal max) {
        return nextMajor(max).setScale(0, RoundingMode.FLOOR).intValueExact() <= MasterCodeConventions.MAX_MAJOR;
    }

    /** 버전이 없으면 minor 불가(I4). 소수부 × 1000 이 999 면 불가(I2). */
    public static boolean canMinor(BigDecimal max) {
        return max != null && minorPart(max) < MasterCodeConventions.MAX_MINOR;
    }

    /** {@link #canMinor} 가 참일 때만 부른다. */
    public static BigDecimal nextMinor(BigDecimal max) {
        return max.add(MINOR_STEP).setScale(SCALE);
    }

    /** 종류별 다음 번호. 불가하면 IllegalStateException — 호출자가 can* 로 먼저 막는다. */
    public static BigDecimal next(BigDecimal max, VersionKind kind) {
        if (kind == VersionKind.MINOR) {
            if (!canMinor(max)) {
                throw new IllegalStateException("minor 를 더 올릴 수 없습니다: " + max);
            }
            return nextMinor(max);
        }
        if (!canMajor(max)) {
            throw new IllegalStateException("major 를 더 올릴 수 없습니다: " + max);
        }
        return nextMajor(max);
    }

    /** {@code "v" + 소수 세 자리}(예: {@code v1.010}). */
    public static String label(BigDecimal ver) {
        return "v" + plain(ver);
    }

    public static BigDecimal scaled(BigDecimal ver) {
        return ver == null ? null : ver.setScale(SCALE, RoundingMode.UNNECESSARY);
    }

    public static BigDecimal parse(String raw) {
        String s = raw == null ? "" : raw.trim();
        if (!VER_PATTERN.matcher(s).matches()) {
            throw new IllegalArgumentException("버전은 정수 네 자리, 소수 셋째 자리까지의 숫자입니다: " + raw);
        }
        return new BigDecimal(s).setScale(SCALE);
    }

    public static boolean same(BigDecimal a, BigDecimal b) {
        return a == null ? b == null : b != null && a.compareTo(b) == 0;
    }

    public static String plain(BigDecimal ver) {
        return scaled(ver).toPlainString();
    }

    private static int minorPart(BigDecimal ver) {
        return ver.subtract(new BigDecimal(ver.toBigInteger())).movePointRight(SCALE).intValueExact();
    }
}
