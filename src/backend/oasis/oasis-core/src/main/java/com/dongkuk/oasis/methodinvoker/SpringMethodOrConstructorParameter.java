package com.dongkuk.oasis.methodinvoker;

import org.springframework.core.DefaultParameterNameDiscoverer;
import org.springframework.core.MethodParameter;

import java.lang.annotation.Annotation;
import java.lang.reflect.Type;

/**
 * @author Jeongjin Kim
 * @since 2021-03-12
 */
final class SpringMethodOrConstructorParameter implements MethodOrConstructorParameter {
    private final MethodParameter methodParameter;

    public SpringMethodOrConstructorParameter(MethodOrConstructor methodOrConstructor, int index) {
        if (methodOrConstructor.getConstructor() != null)
            this.methodParameter = MethodParameter.forMethodOrConstructor(methodOrConstructor.getConstructor(), index);
        else if (methodOrConstructor.getMethod() != null)
            this.methodParameter = MethodParameter.forMethodOrConstructor(methodOrConstructor.getMethod(), index);
        else
            throw new IllegalStateException();

        methodParameter.initParameterNameDiscovery(new DefaultParameterNameDiscoverer());
    }

    @Override
    public String getParameterName() {
        return methodParameter.getParameterName();
    }

    @Override
    public boolean isPrimitive() {
        return methodParameter.getParameterType().isPrimitive();
    }

    @Override
    public Class<?> getParameterType() {
        return methodParameter.getParameterType();
    }

    @Override
    public Type getGenericParameterType() {
        return methodParameter.getGenericParameterType();
    }

    @Override
    public <T extends Annotation> T getParameterAnnotation(Class<T> tClass) {
        return methodParameter.getParameterAnnotation(tClass);
    }

    @Override
    public MethodParameter getMethodParameter() {
        return methodParameter;
    }
}
