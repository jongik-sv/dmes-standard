package com.dongkuk.oasis;

import com.dongkuk.oasis.methodinvoker.TypeDescribableObject;
import com.dongkuk.oasis.methodinvoker.TypeUtils;

import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.lang.reflect.TypeVariable;
import java.util.List;
import java.util.Map;

/**
 * 타입과 오브젝트를 저장하기 위한 클래스이다.
 * <p>
 * 클라이언트에서 {@link com.dongkuk.oasis.methodinvoker.TypeDescribableObject} 를 직접 참조 할 필요가 없도록 하기 위해
 * {@link com.dongkuk.oasis.methodinvoker.TypeDescribableObject} 의 구현을 하드 카피한뒤 일부 편의 메소드를 추가하였다.
 *
 * @author Jeongjin Kim
 * @since 2021-05-29
 */
public final class TypedObject {
    private final Object object;
    private final Type type;

    /**
     * @param object        the real object
     * @param typeReference actual type
     * @throws IllegalArgumentException if object and actual type are incompatible
     */
    public TypedObject(Object object, TypeReference<?> typeReference) {
        this.object = object;
        this.type = typeReference.getType();
        typeCheck(object);
    }

    /**
     * @param object the real object
     * @param type   actual type
     */
    public TypedObject(Object object, Type type) {
        this.object = object;
        this.type = type;
        typeCheck(object);
    }

    /**
     * @param object the real object
     */
    public TypedObject(Object object) {
        if (object == null)
            throw new IllegalArgumentException("The type cannot be determined because object is null." +
                    "Use a constructor that specifies the type explicitly.");
        if (object instanceof TypeDescribableObject) {
            this.object = ((TypeDescribableObject) object).getObject();
            this.type = ((TypeDescribableObject) object).getType();
        } else {
            this.object = object;
            if (object.getClass().getTypeParameters().length > 0)
                throw new IllegalArgumentException("Generic type.\n" +
                        "You must explicitly specify the type for a generic type." +
                        "For instance, if you want to create a type as List<String>," +
                        "you should define it like this:\n" +
                        "new TypedObject(object, new TypeReference<List<String>>() {});\n");
            else
                this.type = object.getClass();
        }
    }

    @Override
    public String toString() {
        return "TypedObject{" +
                "object=" + object +
                ", type=" + type +
                '}';
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
     * @param <T>           타입
     * @param typeReference 타입
     * @return 오브젝트
     */
    @SuppressWarnings("unchecked")
    public <T> T getObject(TypeReference<T> typeReference) {
        return (T) object;
    }

    /**
     * @param elementType 리스트 요소 타입
     * @param <T>         요소 타입
     * @return 리스트
     */
    @SuppressWarnings("unchecked")
    public <T> List<T> getObjectAsList(Class<T> elementType) {
        return (List<T>) object;
    }

    /**
     * @param keyType   키 타입
     * @param valueType 값 타입
     * @param <K>       키 타입
     * @param <V>       값 타입
     * @return 맵
     */
    @SuppressWarnings("unchecked")
    public <K, V> Map<K, V> getObjectAsMap(Class<K> keyType, Class<V> valueType) {
        return (Map<K, V>) object;
    }

    /**
     * @return type
     */
    public Type getType() {
        return type;
    }

    /**
     * {@link TypeDescribableObject} 로 변환한다.
     *
     * @return TypeDescribableObject
     */
    public TypeDescribableObject toTypeDescribableObject() {
        return new TypeDescribableObject(this.object, this.type);
    }
}
