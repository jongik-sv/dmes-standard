package com.dongkuk.oasis;

import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;

/**
 * 제네릭 타입을 인자로 넘길 수 있게 하기 위한 클래스입니다.
 * <p>
 * 제네릭 클래스의 정확한 타입을 가져오기 위해서는 제네릭 클래스의 서브 타입을 만들어야 가능합니다. 아래 코드를 참조하여 사용하시기 바랍니다.
 * <p>
 * {@code TypeReference<List<String>> typeRef = new TypeReference<List<String>>() {};}
 * <p>
 * {@code typeRef} 인스턴스는 {@code getType()} 메소드를 통해 정확한 제네릭 타입 {@code List<String>}를 반환할 수 있습니다.
 *
 * @param <T> Parameterized type
 * @author Jeongjin Kim
 * @since 2021-06-03
 */
public abstract class TypeReference<T> {
    private final Type type;

    protected TypeReference() {
        Class<?> typeReferenceSubclass = findTypeReferenceSubclass(getClass());
        Type type = typeReferenceSubclass.getGenericSuperclass();
        if (!(type instanceof ParameterizedType)) {
            throw new IllegalArgumentException("Type must be a parameterized type");
        }
        ParameterizedType parameterizedType = (ParameterizedType) type;
        Type[] actualTypeArguments = parameterizedType.getActualTypeArguments();
        if (actualTypeArguments.length != 1)
            throw new IllegalArgumentException("Number of type arguments must be 1.");
        this.type = actualTypeArguments[0];
    }

    private static Class<?> findTypeReferenceSubclass(Class<?> child) {
        Class<?> parent = child.getSuperclass();
        if (Object.class == parent) {
            throw new IllegalStateException("Expected TypeReference superclass");
        } else if (TypeReference.class == parent) {
            return child;
        } else {
            return findTypeReferenceSubclass(parent);
        }
    }

    /**
     * @return type
     */
    public Type getType() {
        return this.type;
    }

    @Override
    public boolean equals(Object obj) {
        return (this == obj || (obj instanceof TypeReference &&
                this.type.equals(((TypeReference<?>) obj).type)));
    }

    @Override
    public int hashCode() {
        return this.type.hashCode();
    }

    @Override
    public String toString() {
        return "TypeReference<" + this.type + ">";
    }
}