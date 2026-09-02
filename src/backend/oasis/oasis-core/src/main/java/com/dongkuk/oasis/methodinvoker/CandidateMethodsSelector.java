package com.dongkuk.oasis.methodinvoker;

import com.dongkuk.oasis.methodinvoker.annotations.DefaultConstructor;
import com.dongkuk.oasis.methodinvoker.annotations.DefaultMethod;
import com.dongkuk.oasis.methodinvoker.annotations.MethodQualifier;
import com.dongkuk.oasis.methodinvoker.exceptions.NoUniqueQualifierException;

import java.lang.reflect.Method;

/**
 * An interface that selects candidate methods based on method name,
 * access modifier, {@link MethodQualifier} etc. before selecting the final method.
 * <p>
 * Method qualifier parameter can be {@code null} only when default method is set using {@link DefaultMethod}.
 * Otherwise, {@link MethodNotFoundException} is raised.
 * <p>
 * There should only be one {@link DefaultConstructor} in the class,
 * otherwise it should raise {@link TooManyDefaultException}.
 * <p>
 * If a method has the {@link MethodQualifier} annotation,
 * the {@link MethodQualifier} value is used instead of the method name.
 *
 * @author Jeongjin Kim
 * @since 2021-03-12
 */
interface CandidateMethodsSelector {
    /**
     * Resolve candidate methods using qualifier.
     *
     * @param clazz     for candidate methods
     * @param qualifier to find method. It can be method name, unique method id, Optional
     * @return candidate methods
     * @throws MethodNotFoundException    if no method found
     * @throws TooManyDefaultException    if more than one default method annotation exists
     * @throws NoUniqueQualifierException if there are duplicate qualifier values
     */
    Method[] select(Class<?> clazz, String qualifier);
}
