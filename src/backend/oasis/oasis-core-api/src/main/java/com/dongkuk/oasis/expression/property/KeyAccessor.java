package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.SubProcessResult;

import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.Map;
import java.util.Objects;

/**
 * @author Jeongjin Kim
 * @since 2021-07-01
 */
class KeyAccessor implements Accessor<String> {
    private final String key;

    /**
     * @param key key
     */
    public KeyAccessor(String key) {
        this.key = key;
    }

    @Override
    public String getAccessor() {
        return key;
    }

    @Override
    public TypedObject access(TypedObject object) {
        if (object.getObject() instanceof SubProcessResult) {
            SubProcessResult subProcessResult = object.getObject(SubProcessResult.class);
            return subProcessResult.getTypedObject(key);
        } else if (object.getObject() instanceof Map) {
            ParameterizedType parameterizedType = (ParameterizedType) object.getType();
            Type actualTypeArgument = parameterizedType.getActualTypeArguments()[1];
            Object o = object.getObject(Map.class).get(key);
            return new TypedObject(o, actualTypeArgument);
        } else
            throw new IllegalArgumentException(
                    String.format("[%s] is not a key-accessible type.", object.getObject()));
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        KeyAccessor that = (KeyAccessor) o;
        return Objects.equals(key, that.key);
    }

    @Override
    public int hashCode() {
        return Objects.hash(key);
    }
}
