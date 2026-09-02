package com.dongkuk.oasis.methodinvoker;

import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.lang.reflect.TypeVariable;

/**
 * Class that explicitly stores an object and its type.
 * <p>
 * Ordinary classes can get the type of the class,
 * but generic classes don't have exact type information due to type erasure.
 * So explicitly put the type.
 * <p>
 * {@link Class#getGenericSuperclass()} is helpful to get type information from Generic class.
 *
 * @author Jeongjin Kim
 * @since 2021-03-05
 */
public final class TypeDescribableObject {
    private final Object object;
    private final Type type;

    /**
     * @param object        the real object
     * @param typeReference actual type
     * @throws IllegalArgumentException if object and actual type are incompatible
     */
    public TypeDescribableObject(Object object, TypeReference<?> typeReference) {
        this.object = object;
        this.type = typeReference.getType();
        typeCheck(object);
    }

    /**
     * @param object the real object
     * @param type   actual type
     */
    public TypeDescribableObject(Object object, Type type) {
        this.object = object;
        this.type = type;
        typeCheck(object);
    }

    /**
     * @param object the real object
     */
    public TypeDescribableObject(Object object) {
        if (object == null)
            throw new IllegalArgumentException("The type cannot be determined because object is null." +
                    "Use a constructor that specifies the type explicitly.");
        this.object = object;
        if (object.getClass().getTypeParameters().length > 0)
            throw new IllegalArgumentException("Generic type");
        else
            this.type = object.getClass();
    }

    private void typeCheck(Object object) {
        if (object == null)
            return;

        if (this.type instanceof ParameterizedType) {
            Type rawType = ((ParameterizedType) this.type).getRawType();
            if (rawType instanceof Class) {
                boolean instance = ((Class<?>) rawType).isInstance(object);
                if (!instance)
                    throw new IllegalArgumentException("Incompatible parameterized type.");
            }
        } else if (this.type instanceof Class<?>) {
            if (!((Class<?>) this.type).isInstance(object)) {
                if (!TypeUtils.isInstance(this.type, object))
                    throw new IllegalArgumentException("Incompatible type.");
            }
        } else if (this.type instanceof TypeVariable) {
            TypeUtils.isInstance(this.type, object);
        } else {
            throw new IllegalArgumentException("Incompatible type.");

        }
    }

    /**
     * @return object
     */
    public Object getObject() {
        return object;
    }

    /**
     * @param t   type to cast
     * @param <T> type to cast
     * @return object
     */
    public <T> T getObject(Class<T> t) {
        return t.cast(object);
    }

    /**
     * @return type
     */
    public Type getType() {
        return type;
    }
}
