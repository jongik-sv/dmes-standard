package kr.dongkuk.maru.mdm.engine.rule;

import com.ezylang.evalex.data.EvaluationValue;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;

/**
 * 입력·결과 값을 선언 데이터 타입으로 바꾼다(06-business-rule.md:198 엔진 계약 2, TSK-03-03 design §6.7).
 * 실패는 {@link IllegalArgumentException} 이고 부르는 쪽이 {@code TYPE_CONVERSION}·{@code EVALUATION_ERROR} 로 바꾼다.
 */
final class ValueConverter {

    private ValueConverter() {}

    /** 선언 타입으로. {@code type == null} 이면 그대로, {@code List} 는 그대로(COLLECT LIST 전달). */
    static Object toDeclared(Object value, DataType type) {
        if (value == null || type == null || value instanceof List) {
            return value;
        }
        switch (type) {
            case NUMBER:
                return toNumber(value);
            case BOOLEAN:
                if (value instanceof Boolean) {
                    return value;
                }
                if (value instanceof String s) {
                    if (s.equalsIgnoreCase("TRUE")) {
                        return Boolean.TRUE;
                    }
                    if (s.equalsIgnoreCase("FALSE")) {
                        return Boolean.FALSE;
                    }
                }
                throw fail(value, type);
            default:
                if (value instanceof String) {
                    return value;
                }
                if (value instanceof Boolean) {
                    throw fail(value, type);
                }
                return toNumber(value).toPlainString();
        }
    }

    private static BigDecimal toNumber(Object value) {
        if (value instanceof BigDecimal d) {
            return d;
        }
        if (value instanceof Integer || value instanceof Long || value instanceof Short || value instanceof Byte) {
            return BigDecimal.valueOf(((Number) value).longValue());
        }
        if (value instanceof BigInteger bi) {
            return new BigDecimal(bi);
        }
        if (value instanceof Double || value instanceof Float) {
            double d = ((Number) value).doubleValue();
            if (Double.isNaN(d) || Double.isInfinite(d)) {
                throw fail(value, DataType.NUMBER);
            }
            return new BigDecimal(value.toString());
        }
        if (value instanceof String s) {
            try {
                return new BigDecimal(s);
            } catch (NumberFormatException e) {
                throw fail(value, DataType.NUMBER);
            }
        }
        throw fail(value, DataType.NUMBER);
    }

    private static IllegalArgumentException fail(Object value, DataType type) {
        return new IllegalArgumentException(
                value.getClass().getSimpleName() + " 값 '" + value + "' 을 " + type + " 로 바꿀 수 없다");
    }

    /** EvalEx 값 → Java 값. DURATION·STRUCTURE·BINARY·EXPRESSION_NODE 는 IAE(부르는 쪽이 EVALUATION_ERROR). */
    static Object fromEvalEx(EvaluationValue v) {
        if (v.isNullValue()) {
            return null;
        }
        if (v.isNumberValue()) {
            return v.getNumberValue();
        }
        if (v.isStringValue()) {
            return v.getStringValue();
        }
        if (v.isBooleanValue()) {
            return v.getBooleanValue();
        }
        if (v.isDateTimeValue()) {
            return v.getDateTimeValue();
        }
        if (v.isArrayValue()) {
            List<Object> out = new ArrayList<>();
            for (EvaluationValue e : v.getArrayValue()) {
                out.add(fromEvalEx(e));
            }
            return Collections.unmodifiableList(out);
        }
        throw new IllegalArgumentException("지원하지 않는 결과 타입: " + v.getDataType());
    }
}
