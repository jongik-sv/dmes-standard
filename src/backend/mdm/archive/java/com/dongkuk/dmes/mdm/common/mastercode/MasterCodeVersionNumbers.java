package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import java.math.BigDecimal;
import java.util.Collection;

/**
 * 마루 코드 버전 채번(TSK-06-02 design.md §6.2, 불변 규칙 I1~I4, 원천 04 「새 버전 대화상자」).
 *
 * <p>major = {@code floor(max) + 1}, minor = {@code max + 0.001}. max 는 그 코드의 <b>모든</b> VER 행(CANCELLED·DRAFT
 * 포함)에서 구한다 — 호출자가 상태로 거르지 않은 목록을 넘긴다. 소수부가 {@link MasterCodeConventions#MAX_MINOR} 이면
 * minor 는 major 번호를 만들지 않고 불가다. major 결과 정수부가 {@link MasterCodeConventions#MAX_MAJOR} 를 넘으면 불가다
 * (9999 는 열린 to_ver 라 발급하지 않는다). 산술·비교는 Java 에서만 한다(규칙표 #17, I20).
 *
 * <p>D-144 부터 본문은 {@link VersionNumbers} 에 위임한다.
 */
public final class MasterCodeVersionNumbers {

    private MasterCodeVersionNumbers() {
    }

    /** 버전이 없으면 null. 상태로 거르지 않는다(I1). */
    public static BigDecimal maxVer(Collection<BigDecimal> all) {
        return VersionNumbers.maxVer(all);
    }

    /** max 가 null(버전 없음)이면 {@link MasterCodeConventions#FIRST_VER}. */
    public static BigDecimal nextMajor(BigDecimal max) {
        return VersionNumbers.nextMajor(max);
    }

    public static boolean canMajor(BigDecimal max) {
        return VersionNumbers.canMajor(max);
    }

    /** 버전이 없으면 minor 불가(I4). 소수부 × 1000 이 999 면 불가(I2). */
    public static boolean canMinor(BigDecimal max) {
        return VersionNumbers.canMinor(max);
    }

    /** {@link #canMinor} 가 참일 때만 부른다. */
    public static BigDecimal nextMinor(BigDecimal max) {
        return VersionNumbers.nextMinor(max);
    }

    /** {@code "v" + 소수 세 자리}(예: {@code v1.010}). */
    public static String label(BigDecimal ver) {
        return VersionNumbers.label(ver);
    }
}
