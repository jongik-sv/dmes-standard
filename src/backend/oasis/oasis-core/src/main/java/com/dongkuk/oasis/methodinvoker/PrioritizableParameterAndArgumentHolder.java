package com.dongkuk.oasis.methodinvoker;

import org.springframework.core.ResolvableType;
import org.springframework.util.ClassUtils;

import java.lang.annotation.Annotation;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.List;
import java.util.Map;

/**
 * Holder class to save the parameter and argument.
 * <p>
 * The argument can save using {@link PrioritizableParameterAndArgumentHolder#accept} method.
 * If the argument is not acceptable, {@link IllegalArgumentException} will be thrown.
 * <p>
 * The priority is determined by the parameter class and the argument class. The priority is used for resolving the
 * constructor. If more than one constructor is listed as a candidate, this priority is used to make the final decision.
 * <p>
 * See, {@link ConstructorResolver}
 *
 * @author Jeongjin Kim
 * @since 2021-02-23
 */
final class PrioritizableParameterAndArgumentHolder implements ParameterAndArgumentHolder {
    /**
     * Priority increment for each distance between argument and parameter types.
     */
    public final static int PRIORITY_STEP = 255;

    private final MethodOrConstructorParameter methodOrConstructorParameter;
    private Object actualArgument;
    private boolean isResolved;
    private int priority;
    private ResolvableType resolvableType;

    public PrioritizableParameterAndArgumentHolder(MethodOrConstructorParameter methodParameter) {
        if (methodParameter.getParameterName() == null) {
            throw new IllegalArgumentException("ParameterName must not be null.\n" +
                    "\n" +
                    "Check compile option '-parameters' to get the parameter name.\n" +
                    "See, https://github.com/spring-projects/spring-framework/wiki/Spring-Framework-6.1-Release-Notes");
        }

        this.methodOrConstructorParameter = methodParameter;
    }

    /**
     * @return Parameter name
     */
    @Override
    public String getParameterName() {
        return methodOrConstructorParameter.getParameterName();
    }

    /**
     * @return Actual argument
     */
    @Override
    public Object getActualArgument() {
        return actualArgument;
    }

    /**
     * @param actualArgument to bind with the parameter
     * @throws IllegalStateException    if already resolved
     * @throws IllegalArgumentException if can not accept the argument
     */
    @Override
    public void accept(TypeDescribableObject actualArgument) {
        if (isResolved)
            throw new IllegalStateException("Actual argument already set");

        if (canAccept(actualArgument.getType())) {
            if (this.methodOrConstructorParameter.isPrimitive() && actualArgument.getObject() == null)
                this.actualArgument = defaultPrimitiveValue(this.methodOrConstructorParameter.getParameterType());
            else
                this.actualArgument = actualArgument.getObject();
            this.isResolved = true;

            priority = evaluatePriority(this.methodOrConstructorParameter.getGenericParameterType()
                    , actualArgument.getType());

        } else if (actualArgument.getObject() != null && canAccept(actualArgument.getObject().getClass())) {
            this.actualArgument = actualArgument.getObject();
            this.isResolved = true;

            priority = evaluatePriority(this.methodOrConstructorParameter.getGenericParameterType()
                    , actualArgument.getType());
        } else if (actualArgument.getObject() != null && canAccept(actualArgument.getObject())) {
            this.actualArgument = actualArgument.getObject();
            this.isResolved = true;

            priority = evaluatePriority(this.methodOrConstructorParameter.getGenericParameterType()
                    , actualArgument.getType());
        } else
            throw new IllegalArgumentException(
                    String.format("actualArgument is not type of the parameter type [%s]"
                            , methodOrConstructorParameter.getGenericParameterType()));
    }

    private Object defaultPrimitiveValue(Class<?> parameterType) {
        if (parameterType == int.class)
            return 0;
        else if (parameterType == short.class)
            return 0;
        else if (parameterType == long.class)
            return 0L;
        else if (parameterType == byte.class)
            return 0;
        else if (parameterType == float.class)
            return 0.0f;
        else if (parameterType == double.class)
            return 0.0d;
        else if (parameterType == char.class)
            return '\u0000';
        else if (parameterType == boolean.class)
            return false;
        return null;
    }

    private int evaluatePriority(Type paramType, Type argType) {
        int priority = PRIORITY_HIGHEST;

        if (paramType == argType)
            return priority;

        if (ClassUtils.isPrimitiveOrWrapper(methodOrConstructorParameter.getParameterType())) {
            return priority;
        }

        ResolvableType type = ResolvableType.forType(argType);
        while (!(type.resolve() == null || type.resolve() == resolvableType.resolve())) {
            priority += PRIORITY_STEP;
            type = type.getSuperType();
        }
        return priority;
    }

    /**
     * @param tClass to get
     * @param <T>    Annotation type
     * @return specified annotation
     */
    @Override
    public <T extends Annotation> T getParameterAnnotation(Class<T> tClass) {
        return methodOrConstructorParameter.getParameterAnnotation(tClass);
    }

    /**
     * Return true if the parameter can accept the argument.
     * <p>
     * If object is {@code null}, then return {@code true}.
     *
     * @param type to test
     * @return true if the argument is type of the parameter type
     */
    //todo Remove Dependencies
    @Override
    public boolean canAccept(Type type) {
        if (this.resolvableType == null)
            this.resolvableType = ResolvableType.forMethodParameter(methodOrConstructorParameter.getMethodParameter());

        //todo In case of number, int -> long, float or double conversion, etc.,
        // if possible, conversion attempt function added, NumberUtils
        return TypeUtils.isAssignable(resolvableType, type);
    }

    /**
     * Return true if the parameter can accept the argument.
     * <p>
     * If object is {@code null} or empty Collection, then return {@code true}.
     *
     * @param object to test
     * @return true if the argument is type of the parameter type
     */
    @Override
    public boolean canAccept(Object object) {
        if (TypeUtils.isAssignable(List.class,
                methodOrConstructorParameter.getMethodParameter().getGenericParameterType()))
            return checkIfList(object);
        else if (TypeUtils.isAssignable(Map.class,
                methodOrConstructorParameter.getMethodParameter().getGenericParameterType()))
            // Not support Map bind yet.
            return false;
        else {
            return TypeUtils.isAssignable(methodOrConstructorParameter.getMethodParameter().getParameterType(),
                    object.getClass());
        }
    }

    private boolean checkIfList(Object object) {
        Type actualTypeArgument = ((ParameterizedType) methodOrConstructorParameter.getMethodParameter()
                .getGenericParameterType()).getActualTypeArguments()[0];

        if (!(object instanceof List))
            return false;

        List<?> objectList = (List<?>) object;
        if (objectList.size() == 0)
            return true;

        return TypeUtils.isAssignable(actualTypeArgument, objectList.get(0).getClass());
    }

    /**
     * @return type of the parameter
     */
    @Override
    public Type getParameterType() {
        return this.methodOrConstructorParameter.getGenericParameterType();
    }

    /**
     * @return priority
     */
    @Override
    public int priority() {
        return priority;
    }
}
