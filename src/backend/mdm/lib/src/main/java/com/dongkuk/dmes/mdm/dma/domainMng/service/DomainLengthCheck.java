package com.dongkuk.dmes.mdm.dma.domainMng.service;

import java.math.BigDecimal;
import java.util.Locale;

/**
 * 도메인 길이 검사 — 테스트 케이스·미리보기 판정에서 엔진 검증({@code DefaultDomainValidator})이 보지 않는 유효 길이·소수 자리수를
 * 본다. 엔진은 길이를 DB 제약으로 보고 호출자에게 맡긴다(DomainValidator "유일성·DB 제약은 호출자 몫").
 *
 * <ul>
 *   <li>STRING: 글자 수가 유효 길이를 넘으면 실패.</li>
 *   <li>NUMBER: 정수 자리수가 (길이 − 소수 자리수)를 넘으면 실패. 소수 자리수가 정해져 있으면 소수 자리수가 넘어도 실패.</li>
 *   <li>그 밖의 타입, 길이 없음, 빈 값, 숫자로 읽지 못하는 값은 판정하지 않는다(타입 변환 실패는 엔진이 알린다).</li>
 * </ul>
 */
public final class DomainLengthCheck {

    /** 판정 단계 이름(엔진 Step 과 같은 자리에 쓴다). */
    public static final String STEP = "LENGTH";

    private DomainLengthCheck() {}

    /** @return 위반 문구. 위반이 없으면 null */
    public static String violation(String dataType, Integer length, Integer scale, String value) {
        if (length == null || length <= 0 || value == null || value.isBlank()) {
            return null;
        }
        String type = dataType == null ? "STRING" : dataType.toUpperCase(Locale.ROOT);
        if (type.equals("STRING")) {
            int n = value.codePointCount(0, value.length());
            return n > length ? "길이 초과: " + n + "자 > " + length + "자" : null;
        }
        if (type.equals("NUMBER")) {
            BigDecimal d;
            try {
                d = new BigDecimal(value.trim()).abs().stripTrailingZeros();
            } catch (NumberFormatException e) {
                return null;
            }
            int frac = Math.max(d.scale(), 0);
            int whole = Math.max(d.precision() - d.scale(), 0);
            if (d.signum() == 0) {
                whole = 0;
                frac = 0;
            }
            int s = scale == null ? 0 : scale;
            int wholeMax = Math.max(length - s, 0);
            if (whole > wholeMax) {
                return "정수 자리수 초과: " + whole + "자리 > " + wholeMax + "자리";
            }
            if (scale != null && frac > scale) {
                return "소수 자리수 초과: " + frac + "자리 > " + scale + "자리";
            }
        }
        return null;
    }
}
