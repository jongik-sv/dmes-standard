package com.dongkuk.oasis.expression.property;

import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;

import java.util.Arrays;
import java.util.Objects;

/**
 * @author Jeongjin Kim
 * @since 2021-07-01
 */
@SuppressFBWarnings({"EI_EXPOSE_REP2", "EI_EXPOSE_REP"})
public class PropertyExpression {
    private final Object value;
    private final Accessor<?>[] accessor;
    private final Object alias;

    /**
     * @param value    value
     * @param accessor accessor
     * @param alias    alias
     */
    public PropertyExpression(String value, Accessor<?>[] accessor, String alias) {
        this.value = value;
        this.accessor = accessor;
        this.alias = alias;
    }

    /**
     * @param value value
     */
    public PropertyExpression(String value) {
        this.value = value;
        this.accessor = null;
        this.alias = null;
    }

    /**
     * 프로퍼티가 원래 가지고 있던 값이다.
     *
     * @return value, nullable
     */
    public Object getValue() {
        return value;
    }

    /**
     * 프로퍼티가 원래 가지고 있던 값이다.
     *
     * @param tClass 반환타입
     * @param <T>    반환타입
     * @return value, nullable
     */
    public <T> T getValue(Class<T> tClass) {
        if (value == null)
            return null;
        else
            return tClass == String.class ? tClass.cast(value.toString()) : tClass.cast(value);
    }

    /**
     * 프로퍼티 접근자.
     * <p>
     * 접근자가 없으면 길이가 0인 배열을 반환한다.
     *
     * @return accessor
     */
    public Accessor<?>[] getAccessors() {
        return accessor == null ? new Accessor[0] : accessor;
    }

    /**
     * alias {@code null} 이면 {@code value} 값을 반환한다.
     *
     * @return alias, nullable
     */
    public Object getAlias() {
        return alias == null ? value : alias;
    }

    /**
     * alias {@code null} 이면 {@code value} 값을 반환한다.
     *
     * @param tClass 반환타입
     * @param <T>    반환타입
     * @return alias, nullable
     */
    public <T> T getAlias(Class<T> tClass) {
        if (alias == null)
            return getValue(tClass);

        return tClass == String.class ? tClass.cast(alias.toString()) : tClass.cast(alias);
    }

    /**
     * 별명을 명시적으로 지정했는지 여부를 반환한다.
     *
     * @return 별명 지정 여부
     */
    public boolean hasAlias() {
        return alias != null;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        PropertyExpression that = (PropertyExpression) o;
        return Objects.equals(value, that.value)
                && Arrays.equals(accessor, that.accessor)
                && Objects.equals(alias, that.alias);
    }

    @Override
    public int hashCode() {
        int result = Objects.hash(value, alias);
        result = 31 * result + Arrays.hashCode(accessor);
        return result;
    }
}
