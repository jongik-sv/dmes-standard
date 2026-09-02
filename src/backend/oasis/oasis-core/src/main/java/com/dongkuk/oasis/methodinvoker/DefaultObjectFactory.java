package com.dongkuk.oasis.methodinvoker;

import java.lang.reflect.InvocationTargetException;

/**
 * @author Jeongjin Kim
 * @since 2021-02-19
 */
final class DefaultObjectFactory implements ObjectFactory {
    private final ConstructorResolver constructorResolver;

    public DefaultObjectFactory(ConstructorResolver constructorResolver) {
        this.constructorResolver = constructorResolver;
    }

    public DefaultObjectFactory() {
        constructorResolver = new StrictConstructorResolver(
                new PublicOnlyCandidateConstructorsSelector(),
                new TypeMatchableMethodArgumentBinder(),
                new HighestPriorityPicker()
        );
    }

    @Override
    public Object createObject(String fullQualifiedClassName, Context context) {
        Class<?> aClass;
        try {
            aClass = Class.forName(fullQualifiedClassName);
        } catch (ClassNotFoundException e) {
            throw new ObjectInitializationException(e.getMessage(), e);
        }

        return createObject(aClass, context);
    }

    @Override
    public Object createObject(Class<?> clazz, Context context) {
        PrioritizableMethodOrConstructorHolder methodOrConstructorHolder = constructorResolver.resolve(clazz, context);
        Object o;
        try {
            o = methodOrConstructorHolder.constructor().newInstance(methodOrConstructorHolder.args());
        } catch (InstantiationException | IllegalAccessException | InvocationTargetException e) {
            throw new ObjectInitializationException(e.getMessage(), e);
        }
        return o;
    }
}
