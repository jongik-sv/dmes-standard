package com.dongkuk.oasis.methodinvoker;

import org.springframework.core.MethodParameter;

import java.lang.annotation.Annotation;
import java.lang.reflect.Type;

/**
 * @author Jeongjin Kim
 * @since 2021-03-12
 */
interface MethodOrConstructorParameter {
    String getParameterName();

    boolean isPrimitive();

    Class<?> getParameterType();

    Type getGenericParameterType();

    <T extends Annotation> T getParameterAnnotation(Class<T> tClass);

    MethodParameter getMethodParameter();
}
