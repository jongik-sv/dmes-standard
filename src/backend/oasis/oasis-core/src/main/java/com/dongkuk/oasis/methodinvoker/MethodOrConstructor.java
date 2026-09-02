package com.dongkuk.oasis.methodinvoker;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;

/**
 * @author Jeongjin Kim
 * @since 2021-03-12
 */
final class MethodOrConstructor {
    private final Method method;
    private final Constructor<?> constructor;

    public MethodOrConstructor(Method method) {
        if (method == null)
            throw new IllegalArgumentException();

        this.method = method;
        this.constructor = null;
    }

    public MethodOrConstructor(Constructor<?> constructor) {
        if (constructor == null)
            throw new IllegalArgumentException();

        this.method = null;
        this.constructor = constructor;
    }

    public Method getMethod() {
        return method;
    }

    public Constructor<?> getConstructor() {
        return constructor;
    }

    public MethodOrConstructorParameter parameter(int index) {
        if (method != null)
            return new SpringMethodOrConstructorParameter(new MethodOrConstructor(method), index);
        else if (constructor != null)
            return new SpringMethodOrConstructorParameter(new MethodOrConstructor(constructor), index);
        else
            throw new IllegalStateException("Method and Constructor are both null.");
    }

    public int parameterCount() {
        if (method != null)
            return method.getParameterCount();
        else if (constructor != null)
            return constructor.getParameterCount();
        else
            throw new IllegalStateException("Method and Constructor are both null.");
    }
}
