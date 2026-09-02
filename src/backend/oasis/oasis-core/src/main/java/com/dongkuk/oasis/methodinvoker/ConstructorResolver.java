package com.dongkuk.oasis.methodinvoker;

/**
 * This interface is used to determine which constructor to create an object in a given class.
 *
 * @author Jeongjin Kim
 * @since 2021-02-23
 */
interface ConstructorResolver {
    /**
     * Returns the constructor and arguments that best match the given context in the specified class.
     * <p>
     * If there is no suitable constructor or no public constructor exists, throw {@link ConstructorNotFoundException}.
     *
     * @param aClass  the class to find the constructor for
     * @param context context of class
     * @return Immutable object with constructor and argument
     * @throws ConstructorNotFoundException If there is no suitable constructor or no public constructor exists
     */
    PrioritizableMethodOrConstructorHolder resolve(Class<?> aClass, Context context);
}
