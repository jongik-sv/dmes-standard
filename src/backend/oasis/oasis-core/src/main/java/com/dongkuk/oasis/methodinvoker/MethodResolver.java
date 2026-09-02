package com.dongkuk.oasis.methodinvoker;

import com.dongkuk.oasis.methodinvoker.annotations.DefaultMethod;
import com.dongkuk.oasis.methodinvoker.annotations.MethodQualifier;
import com.dongkuk.oasis.methodinvoker.annotations.OptionalParam;

/**
 * This interface is used to determine which method to invoke in a given class.
 * <p>
 * The method name and context are used to determine the method to be executed.
 * If there is only one method in the class, the method name can be omitted.
 * But the class should be a {@link FunctionalInterface}.
 * <p>
 * You can also specify a default method with the {@link DefaultMethod} annotation.
 * Only one method can be specified in a class.
 * <p>
 * {@link MethodQualifier} can be assigned to a method. It must have a unique value within the class.
 * If the method in which the Method Qualifier value is described cannot be found,
 * an {@link MethodNotFoundException} is thrown.
 * <p>
 * How it behaves when the value matching the parameter is not in the context depends on the implementation.
 * The method can be selected only when values matching all parameters are in the context,
 * and selection can be made even when only some of the matching parameters are matched.
 * You can make it more flexible by using {@link OptionalParam} annotation on parameters.
 *
 * @author Jeongjin Kim
 * @since 2021-03-09
 */
interface MethodResolver {
    /**
     * Resolve a method in the class.
     * <p>
     * Even if method name is given, only one method is not always selected as a candidate due to method overload.
     * Select the method that best matches the context from among several candidates.
     * If it cannot be resolved, {@link MethodNotFoundException} is raised.
     * <p>
     * If a method has a {@link MethodQualifier}, it chooses only one that exactly matches the method name.
     *
     * @param aClass     the class to find
     * @param methodName the method name to find. It would be real method name or the method qualifier value
     * @param context    the context to find the best matches parameters
     * @return Immutable object with method and argument
     * @throws MethodNotFoundException If there is no suitable method or no public method exists
     */
    PrioritizableMethodOrConstructorHolder resolve(Class<?> aClass, String methodName, Context context);

    /**
     * Resolve a method in the class.
     * <p>
     * Only if it is a {@link FunctionalInterface} or {@link DefaultMethod} is set on the method of the class
     * , this method is available.
     * Otherwise {@link MethodNotFoundException} is thrown.
     *
     * @param aClass  the class to find
     * @param context the context to find the best matches parameters
     * @return Immutable object with method and argument
     */
    PrioritizableMethodOrConstructorHolder resolve(Class<?> aClass, Context context);
}
