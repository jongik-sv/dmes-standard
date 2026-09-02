package com.dongkuk.oasis.methodinvoker;

import java.lang.annotation.Annotation;
import java.lang.reflect.Type;

/**
 * Holder interface to save and provide the parameter and argument.
 * <p>
 * The argument can save using {@link ParameterAndArgumentHolder#accept} method.
 * If the argument is not acceptable, {@link IllegalArgumentException} will be thrown.
 * <p>
 * See, {@link ConstructorResolver}
 *
 * @author Jeongjin Kim
 * @since 2021-02-23
 */
interface ParameterAndArgumentHolder extends Prioritizable {
    /**
     * @return Parameter name
     */
    String getParameterName();

    /**
     * @return Actual argument
     */
    Object getActualArgument();

    /**
     * @param actualArgument to bind with the parameter
     * @throws IllegalStateException    if already resolved
     * @throws IllegalArgumentException if can not accept the argument
     */
    void accept(TypeDescribableObject actualArgument);

    /**
     * @param tClass to get
     * @param <T>    Annotation type
     * @return specified annotation
     */
    <T extends Annotation> T getParameterAnnotation(Class<T> tClass);

    /**
     * Return true if the parameter can accept the argument.
     * <p>
     * If object is {@code null}, then return {@code true}.
     *
     * @param type to test
     * @return true if the argument is type of the parameter type
     */
    boolean canAccept(Type type);

    /**
     * Return true if the parameter can accept the argument.
     * <p>
     * If object is {@code null}, then return {@code true}.
     *
     * @param object to test
     * @return true if the argument is type of the parameter type
     */
    boolean canAccept(Object object);

    /**
     * @return type of the parameter
     */
    Type getParameterType();
}
