package com.dongkuk.oasis.methodinvoker;

import com.dongkuk.oasis.methodinvoker.annotations.DefaultMethod;
import com.dongkuk.oasis.methodinvoker.annotations.MethodQualifier;
import com.dongkuk.oasis.methodinvoker.exceptions.NoUniqueQualifierException;

import java.lang.annotation.Annotation;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.*;

/**
 * @author Jeongjin Kim
 * @since 2021-03-15
 */
final class PublicCandidateMethodsSelector implements CandidateMethodsSelector {
    @Override
    public Method[] select(Class<?> clazz, String qualifier) {
        Method[] methods = clazz.getMethods();
        if (methods.length == 0)
            throw new MethodNotFoundException("No public method exists. : " + clazz.getName());

        Method defaultMethodIfExists = getDefaultMethodIfExists(methods);

        if (qualifier == null && defaultMethodIfExists == null)
            throw new MethodNotFoundException("No default method exists. : " + clazz.getName());

        if (qualifier == null)
            return new Method[]{defaultMethodIfExists};

        Method qualifiedMethodIfExists = getQualifiedMethodIfExists(methods, qualifier);

        if (qualifiedMethodIfExists != null)
            return new Method[]{qualifiedMethodIfExists};

        Method[] methodsMatchingQualifierAndMethodName = getMethodsMatchingQualifierAndMethodName(methods, qualifier);

        if (methodsMatchingQualifierAndMethodName.length == 0)
            throw new MethodNotFoundException(
                    "No public method [" + qualifier + "] of class [" + clazz.getName() + "]");

        return methodsMatchingQualifierAndMethodName;
    }

    private Method[] getMethodsMatchingQualifierAndMethodName(Method[] methods, String qualifier) {
        List<Method> qualifiedMethods = new ArrayList<>(methods.length);
        for (Method method : methods) {
            if (method.getName().equals(qualifier))
                qualifiedMethods.add(method);

        }
        return qualifiedMethods.toArray(new Method[0]);
    }

    private Method getQualifiedMethodIfExists(Method[] methods, String qualifier) {
        Map<String, Method> qualifiedMethods = new HashMap<>(methods.length);
        for (Method method : methods) {
            String annotationAndGetValue = (String) findAnnotationAndGetValue(method, MethodQualifier.class);
            if (annotationAndGetValue != null) {
                if (qualifiedMethods.containsKey(annotationAndGetValue))
                    throw new NoUniqueQualifierException(
                            annotationAndGetValue + " is not unique qualifier.");
                qualifiedMethods.put(annotationAndGetValue, method);
            }
        }
        return qualifiedMethods.get(qualifier);
    }

    private Object findAnnotationAndGetValue(Method method, Class<? extends Annotation> annotationType) {
        Annotation[] declaredAnnotations = method.getDeclaredAnnotations();
        Set<Class<? extends Annotation>> failedSet = new HashSet<>();

        for (Annotation declaredAnnotation : declaredAnnotations) {
            Method valueMethod;
            try {
                valueMethod = declaredAnnotation.annotationType().getMethod("value");
            } catch (NoSuchMethodException e) {
                failedSet.add(declaredAnnotation.annotationType());
                continue;
            }
            Object value;
            try {
                value = valueMethod.invoke(declaredAnnotation);
            } catch (IllegalAccessException | InvocationTargetException e) {
                failedSet.add(declaredAnnotation.annotationType());
                continue;
            }
            if (!(value instanceof String)) {
                failedSet.add(declaredAnnotation.annotationType());
                continue;
            }

            if (declaredAnnotation.annotationType() == annotationType)
                return value;
            else {
                boolean b = hasAnnotation(declaredAnnotation, annotationType, failedSet);
                if (b)
                    return value;
            }
        }
        return null;
    }

    private boolean hasAnnotation(Annotation annotation,
                                  Class<?> annotationType,
                                  Set<Class<? extends Annotation>> failedSet) {
        Annotation[] declaredAnnotations = annotation.annotationType().getDeclaredAnnotations();

        for (Annotation declaredAnnotation : declaredAnnotations) {
            if (failedSet.contains(declaredAnnotation.annotationType()))
                continue;
            if (failedSet.contains(declaredAnnotation.annotationType()))
                continue;
            if (declaredAnnotation.annotationType() == annotationType)
                return true;
            failedSet.add(declaredAnnotation.annotationType());
            boolean b = hasAnnotation(declaredAnnotation, annotationType, failedSet);
            if (b)
                return true;
        }
        return false;
    }

    private Method getDefaultMethodIfExists(Method[] methods) {
        List<Method> defaultMethods = new ArrayList<>(methods.length);

        for (Method method : methods) {
            if (method.getAnnotation(DefaultMethod.class) != null)
                defaultMethods.add(method);
        }
        if (defaultMethods.size() > 1)
            throw new TooManyDefaultException("More then one DefaultMethod exists.");
        else if (defaultMethods.size() == 1)
            return defaultMethods.get(0);
        else
            return null;
    }
}
