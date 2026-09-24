package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collection;

/**
 * 마루 코드 버전 채번(TSK-06-02 design.md §6.2, 불변 규칙 I1~I4, 원천 04 「새 버전 대화상자」).
 *
 * <p>major = {@code floor(max) + 1}, minor = {@code max + 0.001}. max 는 그 코드의 <b>모든</b> VER 행(CANCELLED·DRAFT
 * 포함)에서 구한다 — 호출자가 상태로 거르지 않은 목록을 넘긴다. 소수부가 {@link MasterCodeConventions#MAX_MINOR} 이면
 * minor 는 major 번호를 만들지 않고 불가다. major 결과 정수부가 {@link MasterCodeConventions#MAX_MAJOR} 를 넘으면 불가다
 * (9999 는 열린 to_ver 라 발급하지 않는다). 산술·비교는 Java 에서만 한다(규칙표 #17, I20).
 */
public final class MasterCodeVersionNumbers {

    private static final int SCALE = MasterCodeConventions.FIRST_VER.scale();
    private static final BigDecimal MINOR_STEP = new BigDecimal("0.001");

    private MasterCodeVersionNumbers() {
    }

    /** 버전이 없으면 null. 상태로 거르지 않는다(I1). */
    public static BigDecimal maxVer(Collection<BigDecimal> all) {
        BigDecimal max = null;
        for (BigDecimal ver : all) {
            if (ver != null && (max == null || ver.compareTo(max) > 0)) {
                max = ver;
            }
        }
        return max == null ? null : max.setScale(SCALE);
    }

    /** max 가 null(버전 없음)이면 {@link MasterCodeConventions#FIRST_VER}. */
    public static BigDecimal nextMajor(BigDecimal max) {
        if (max == null) {
            return MasterCodeConventions.FIRST_VER.setScale(SCALE);
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

    /** {@code "v" + 소수 세 자리}(예: {@code v1.010}). */
    public static String label(BigDecimal ver) {
        return "v" + ver.setScale(SCALE).toPlainString();
    }

    private static int minorPart(BigDecimal ver) {
        return ver.subtract(new BigDecimal(ver.toBigInteger())).movePointRight(SCALE).intValueExact();
    }
}
