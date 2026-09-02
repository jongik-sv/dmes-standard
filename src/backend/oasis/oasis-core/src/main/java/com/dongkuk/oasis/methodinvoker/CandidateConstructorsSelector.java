package com.dongkuk.oasis.methodinvoker;

import com.dongkuk.oasis.methodinvoker.annotations.ConstructorQualifier;
import com.dongkuk.oasis.methodinvoker.annotations.DefaultConstructor;
import com.dongkuk.oasis.methodinvoker.exceptions.NoUniqueQualifierException;

import java.lang.reflect.Constructor;

/**
 * An interface that selects candidate constructors based on access modifier
 * , {@link ConstructorQualifier} etc. before selecting the final constructor.
 * <p>
 * the {@code qualifier} argument can be {@code null}.
 * If {@code null}, all public constructor will be selected
 * or the constructor annotated with {@link DefaultConstructor} will be.
 * There should only be one {@link DefaultConstructor} in the class,
 * otherwise it should raise {@link TooManyDefaultException}.
 * <p>
 * If a constructor has the {@link ConstructorQualifier} annotation,
 * the {@link ConstructorQualifier} value is used to match with {@code qualifier} argument.
 * If there is no matching constructor, {@link ConstructorNotFoundException} is raised.
 * <p>
 * If no constructor selected, thrown {@link ConstructorNotFoundException}.
 *
 * @author Jeongjin Kim
 * @since 2021-03-12
 */
interface CandidateConstructorsSelector {
    /**
     * Resolve candidate constructors using qualifier.
     *
     * @param clazz     for candidate constructors
     * @param qualifier to find constructor. It is unique constructor id, Optional
     * @return candidate constructors
     * @throws ConstructorNotFoundException if no constructor found
     * @throws TooManyDefaultException      if more than one default constructor annotation exists
     * @throws NoUniqueQualifierException   if there are duplicate qualifier values
     */
    Constructor<?>[] select(Class<?> clazz, String qualifier);
}
