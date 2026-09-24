package kr.dongkuk.maru.mdm.engine.expr;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.Instant;
import java.util.Locale;
import java.util.regex.Pattern;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;

/**
 * 타입 변환 공개 단일 진입점(TSK-03-02 design D2, §6.7). 도메인 검증(02 실행 순서 3단계)과 룰 판정(06:198 엔진 계약 2)이
 * 같은 함수를 쓴다. 두 엔진(서버·화면)이 같은 문자열을 같은 수로 읽도록 06:325 저장 시 검사의 타입 규칙
 * (지수·16진 표기 거부, Boolean 은 TRUE/FALSE 만)을 레코드 값에도 적용한다.
 *
 * <p>소수 자리수(scale)로 반올림하거나 자르지 않는다. 빈 값 정규화(공백만 있는 문자열 → NULL)는 도메인 검증기의 몫이다.
 */
public final class ValueConverter {

    /** 부호·정수부·소수부만. 지수·16진·앞뒤 공백·천 단위 구분 기호·{@code .5} 꼴은 거부한다. */
    private static final Pattern NUMBER_TEXT = Pattern.compile("^[+-]?[0-9]+(\\.[0-9]+)?$");

    private ValueConverter() {}

    /**
     * @return null 이면 null, 아니면 {@code BigDecimal}·{@code String}·{@code Boolean}·{@code Instant}
     * @throws ValueConversionException 변환 표 밖의 값
     */
    public static Object convert(Object value, DataType type) {
        if (value == null) {
            return null;
        }
        return switch (type) {
            case NUMBER -> toNumber(value);
            case STRING -> toText(value);
            case BOOLEAN -> toBoolean(value);
            case DATE -> toDate(value);
        };
    }

    private static BigDecimal toNumber(Object value) {
        if (value instanceof BigDecimal d) {
            return d;
        }
        if (value instanceof Integer || value instanceof Long || value instanceof Short || value instanceof Byte) {
            return BigDecimal.valueOf(((Number) value).longValue());
        }
        if (value instanceof BigInteger i) {
            return new BigDecimal(i);
        }
        if (value instanceof Double || value instanceof Float) {
            double d = ((Number) value).doubleValue();
            if (Double.isFinite(d)) {
                return new BigDecimal(Double.toString(d));
            }
        }
        if (value instanceof String s && NUMBER_TEXT.matcher(s).matches()) {
            return new BigDecimal(s);
        }
        throw fail(value, DataType.NUMBER);
    }

    private static String toText(Object value) {
        if (value instanceof String s) {
            return s;
        }
        if (value instanceof BigDecimal d) {
            return d.toPlainString();
        }
        if (value instanceof Integer || value instanceof Long || value instanceof Short || value instanceof Byte
                || value instanceof BigInteger) {
            return value.toString();
        }
        throw fail(value, DataType.STRING);
    }

    private static Boolean toBoolean(Object value) {
        if (value instanceof Boolean b) {
            return b;
        }
        if (value instanceof String s) {
            String upper = s.toUpperCase(Locale.ROOT);
            if (upper.equals("TRUE")) {
                return Boolean.TRUE;
            }
            if (upper.equals("FALSE")) {
                return Boolean.FALSE;
            }
        }
        throw fail(value, DataType.BOOLEAN);
    }

    private static Instant toDate(Object value) {
        if (value instanceof Instant i) {
            return i;
        }
        throw fail(value, DataType.DATE);
    }

    private static ValueConversionException fail(Object value, DataType type) {
        return new ValueConversionException(
                value.getClass().getSimpleName() + " 값 '" + value + "' 을 " + type + " 로 바꿀 수 없다");
    }
}
