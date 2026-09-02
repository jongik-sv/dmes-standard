package com.dongkuk.oasis.methodinvoker;

/**
 * Strategy interface that binds method parameters and objects
 * stored in the context.
 * <p>
 * Use a combination of bind strategy objects custom implemented
 * in MethodArgumentBinder.
 *
 * @author Jeongjin Kim
 * @since 2021-03-26
 */
interface MethodArgumentBindingStrategy {
    ParameterBindingResult tryBind(ParameterAndArgumentHolder parameterAndArgumentHolder, Context context);
}
