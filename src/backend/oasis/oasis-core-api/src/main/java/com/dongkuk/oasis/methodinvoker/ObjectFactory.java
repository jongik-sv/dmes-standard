package com.dongkuk.oasis.methodinvoker;

/**
 * @author Jeongjin Kim
 * @since 2021-02-19
 */
public interface ObjectFactory {
    /**
     * Returns the new object of the specified class.
     *
     * @param className full qualified class name to be instantiated
     * @param context   The context referenced to create the object
     * @return the new object of the specified class
     */
    Object createObject(String className, Context context);

    /**
     * Returns the new object of the specified class.
     *
     * @param clazz   the class to be instantiated
     * @param context The context referenced to create the object
     * @return the new object of the specified class
     */
    Object createObject(Class<?> clazz, Context context);
}
