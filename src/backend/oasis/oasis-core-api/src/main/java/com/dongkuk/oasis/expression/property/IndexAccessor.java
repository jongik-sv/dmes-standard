package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.TypedObject;

import java.lang.reflect.Array;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.List;
import java.util.Objects;

/**
 * @author Jeongjin Kim
 * @since 2021-07-01
 */
class IndexAccessor implements Accessor<Integer> {
    private final Integer index;

    /**
     * @param index index
     */
    public IndexAccessor(Integer index) {
        this.index = index;
    }

    @Override
    public Integer getAccessor() {
        return index;
    }

    @Override
    public TypedObject access(TypedObject object) {
        if (object.getObject() instanceof List) {
            ParameterizedType parameterizedType = (ParameterizedType) object.getType();
            Type actualTypeArgument = parameterizedType.getActualTypeArguments()[0];
            Object o = object.getObject(List.class).get(index);
            return new TypedObject(o, actualTypeArgument);
        } else if (object.getObject().getClass().isArray()) {
//            Class<?> componentType = object.getObject().getClass().getComponentType();
            Object o = Array.get(object.getObject(), index);
            return new TypedObject(o);
        } else
            throw new IllegalArgumentException(
                    String.format("[%s] is not an index-accessible type.", object.getObject()));
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        IndexAccessor that = (IndexAccessor) o;
        return Objects.equals(index, that.index);
    }

    @Override
    public int hashCode() {
        return Objects.hash(index);
    }
}
