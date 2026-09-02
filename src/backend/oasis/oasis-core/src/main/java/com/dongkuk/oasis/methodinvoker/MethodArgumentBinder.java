package com.dongkuk.oasis.methodinvoker;

/**
 * Returns a group of parameters and objects that are compatible with each parameter of a method or constructor.
 * The source of Objects is the context.
 * If no matching argument is found, returns {@code null}.
 * <p>
 * See {@link Context}
 *
 * @author Jeongjin Kim
 * @since 2021-03-12
 */
interface MethodArgumentBinder {
    /**
     * @param methodOrConstructor Method or constructor to bind
     * @param context             The context containing the arguments to bind with parameters
     * @return Immutable class with constructor and arguments. nullable.
     * @throws MethodBindingException if failed to bind
     */
    PrioritizableMethodOrConstructorHolder bind(MethodOrConstructor methodOrConstructor, Context context);

    default BindingAttemptResult bindWithDiagnostics(MethodOrConstructor methodOrConstructor, Context context) {
        return new BindingAttemptResult(bind(methodOrConstructor, context));
    }
}
