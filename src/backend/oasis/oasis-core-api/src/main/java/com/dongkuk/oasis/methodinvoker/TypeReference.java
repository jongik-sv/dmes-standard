package com.dongkuk.oasis.methodinvoker;

import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;

/**
 * The purpose of this class is to enable capturing and passing a generic
 * {@link Type}. In order to capture the generic type and retain it at runtime,
 * you need to create a subclass (ideally as anonymous inline class) as follows:
 *
 * <pre class="code">
 * TypeReference&lt;List&lt;String&gt;&gt; typeRef = new TypeReference&lt;List&lt;String&gt;&gt;() {};
 * </pre>
 * <p>
 * The resulting {@code typeRef} instance can then be used to obtain a {@link Type}
 * instance that carries the captured parameterized type information at runtime.
 * For more information on "super type tokens" see the link to Neal Gafter's blog post.
 * <p>
 * See {@link org.springframework.core.ParameterizedTypeReference}
 *
 * @param <T> Parameterized type
 * @author Jeongjin Kim
 * @see <a href="https://gafter.blogspot.nl/2006/12/super-type-tokens.html">Neal Gafter on Super Type Tokens</a>
 * @since 2021-03-22
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
            throw new IllegalArgumentException("TNumber of type arguments must be 1.");
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
