package kr.dongkuk.maru.mdm.engine.expr;

/**
 * {@link ValueConverter#convert} 가 값을 대상 타입으로 바꾸지 못했다. 도메인 검증에서는 검증 실패(TYPE_CONVERSION),
 * 룰 판정에서는 판정 오류(TYPE_CONVERSION)가 된다.
 */
public final class ValueConversionException extends IllegalArgumentException {

    private static final long serialVersionUID = 1L;

    public ValueConversionException(String message) {
        super(message);
    }
}
