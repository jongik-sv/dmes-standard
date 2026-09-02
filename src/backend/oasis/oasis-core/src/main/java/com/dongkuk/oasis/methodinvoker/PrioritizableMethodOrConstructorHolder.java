package com.dongkuk.oasis.methodinvoker;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Immutable class with constructor and arguments.
 * <p>
 * It has the priority of the method or constructor.
 * The lowest priority of among parameters is the priority of the method or constructor.
 *
 * @author Jeongjin Kim
 * @since 2021-02-23
 */
final class PrioritizableMethodOrConstructorHolder implements Prioritizable {
    private final MethodOrConstructor methodOrConstructor;
    private final List<? extends ParameterAndArgumentHolder> parameterAndArgumentHolders;
    private final int priority;

    public PrioritizableMethodOrConstructorHolder(MethodOrConstructor methodOrConstructor,
                                                  List<? extends ParameterAndArgumentHolder> holders) {
        if (methodOrConstructor == null)
            throw new IllegalArgumentException("The methodOrConstructor can not be null.");

        this.methodOrConstructor = methodOrConstructor;
        this.parameterAndArgumentHolders = holders == null ?
                Collections.unmodifiableList(new ArrayList<>()) :
                Collections.unmodifiableList(holders);

        int highestPriority = 0;
        for (Prioritizable parameterAndArgumentHolder : this.parameterAndArgumentHolders) {
            if (highestPriority == ParameterAndArgumentHolder.PRIORITY_LOWEST)
                break;
            if (parameterAndArgumentHolder.priority() > highestPriority)
                highestPriority = parameterAndArgumentHolder.priority();
        }
        this.priority = highestPriority;
    }

    /**
     * @return Constructor. It can be {@code null}
     */
    public Constructor<?> constructor() {
        return methodOrConstructor.getConstructor();
    }

    /**
     * @return method. It can be {@code null}
     */
    public Method method() {
        return methodOrConstructor.getMethod();
    }

    /**
     * Return actual arguments. if no argument exists, return an array with length 0;
     *
     * @return actual arguments.
     */
    public Object[] args() {
        Object[] args = new Object[parameterAndArgumentHolders.size()];
        for (int i = 0; i < parameterAndArgumentHolders.size(); i++) {
            Object actualArgument = parameterAndArgumentHolders.get(i).getActualArgument();
            if (actualArgument == null) {
                if (parameterAndArgumentHolders.get(i).getParameterType() instanceof Class) {
                    if (((Class<?>) parameterAndArgumentHolders.get(i).getParameterType()).isPrimitive()) {
                        args[i] = defaultValueOfPrimitiveType(parameterAndArgumentHolders.get(i).getParameterType());
                    }
                }
            } else {
                args[i] = parameterAndArgumentHolders.get(i).getActualArgument();
            }
        }
        return args;
    }

    private Object defaultValueOfPrimitiveType(Type parameterType) {
        if (parameterType == byte.class) {
            return (byte) 0;
        } else if (parameterType == short.class) {
            return (short) 0;
        } else if (parameterType == int.class) {
            return 0;
        } else if (parameterType == long.class) {
            return 0L;
        } else if (parameterType == float.class) {
            return 0.0f;
        } else if (parameterType == double.class) {
            return 0.0d;
        } else if (parameterType == char.class) {
            return '\u0000';
        } else if (parameterType == boolean.class) {
            return false;
        } else {
            return null;
        }
    }

    @Override
    public int priority() {
        return priority;
    }
}
