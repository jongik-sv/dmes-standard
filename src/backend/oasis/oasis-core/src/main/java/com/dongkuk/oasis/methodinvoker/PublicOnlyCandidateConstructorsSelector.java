package com.dongkuk.oasis.methodinvoker;

import com.dongkuk.oasis.methodinvoker.annotations.ConstructorQualifier;
import com.dongkuk.oasis.methodinvoker.annotations.DefaultConstructor;
import com.dongkuk.oasis.methodinvoker.exceptions.NoUniqueQualifierException;

import java.lang.reflect.Constructor;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-03-12
 */
final class PublicOnlyCandidateConstructorsSelector implements CandidateConstructorsSelector {
    @Override
    public Constructor<?>[] select(Class<?> clazz, String qualifier) {
        Constructor<?>[] constructors = clazz.getConstructors();
        if (constructors.length == 0) {
            Constructor<?>[] declaredConstructors = clazz.getDeclaredConstructors();
            if (declaredConstructors.length == 1 && declaredConstructors[0].getModifiers() == 0)
                constructors = declaredConstructors;
            else
                throw new ConstructorNotFoundException("No public constructor exists. : " + clazz.getName());
        }

        Constructor<?> defaultConstructor = getDefaultConstructorIfExists(constructors);

        if (qualifier == null) {
            return defaultConstructor == null ? constructors : new Constructor[]{defaultConstructor};
        } else {
            Constructor<?> qualifiedConstructor = getQualifiedConstructorIfExists(constructors, qualifier);
            if (qualifiedConstructor == null)
                throw new ConstructorNotFoundException(
                        "No public constructor [" + qualifier + "] of class [" + clazz.getName() + "]");
            else
                return new Constructor[]{qualifiedConstructor};
        }
    }

    private Constructor<?> getQualifiedConstructorIfExists(Constructor<?>[] constructors, String qualifier) {
        Map<String, Constructor<?>> qualifiedConstructors = new HashMap<>(constructors.length);
        for (Constructor<?> constructor : constructors) {
            ConstructorQualifier annotation = constructor.getAnnotation(ConstructorQualifier.class);
            if (annotation != null) {
                if (qualifiedConstructors.containsKey(annotation.value()))
                    throw new NoUniqueQualifierException("[" + annotation.value() + "] is not unique qualifier.");
                qualifiedConstructors.put(annotation.value(), constructor);
            }
        }
        if (qualifiedConstructors.size() == 0)
            throw new ConstructorNotFoundException("No constructor qualifier exists.");
        return qualifiedConstructors.get(qualifier);
    }

    /**
     * @param constructors to find
     * @return default constructor. nullable
     */
    private Constructor<?> getDefaultConstructorIfExists(Constructor<?>[] constructors) {
        List<Constructor<?>> defaultConstructors = new ArrayList<>(constructors.length);
        for (Constructor<?> constructor : constructors) {
            if (constructor.getAnnotation(DefaultConstructor.class) != null)
                defaultConstructors.add(constructor);
        }
        if (defaultConstructors.size() > 1)
            throw new TooManyDefaultException("Too many default constructors.");
        else if (defaultConstructors.size() == 1)
            return defaultConstructors.get(0);
        else
            return null;

    }
}
