package learning.wow;

import org.junit.jupiter.api.Test;

import java.lang.annotation.Annotation;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-02-10
 */
@SuppressWarnings("unused")
public class RealtimeMethodParameterInjector {
    /**
     * @param type       type
     * @param annotation an
     * @return re
     */
    public static List<Method> getMethodsAnnotatedWith
    (final Class<?> type, final Class<? extends Annotation> annotation) {
        final List<Method> methods = new ArrayList<>();
        Class<?> klass = type;
        while (klass != Object.class) { // need to iterated thought hierarchy in order to
            // retrieve methods from above the current instance
            // iterate though the list of methods declared
            // in the class represented by klass variable, and add those annotated with the specified annotation
            for (final Method method : klass.getDeclaredMethods()) {
                if (method.isAnnotationPresent(annotation)) {
                    Annotation annotInstance = method.getAnnotation(annotation);
                    methods.add(method);
                }
            }
            // move to the upper class in the hierarchy in search for more methods
            klass = klass.getSuperclass();
        }
        return methods;
    }

    @Test
    void findAnnotatedMethods() throws
            ClassNotFoundException, IllegalAccessException, InstantiationException, InvocationTargetException, NoSuchMethodException {
        String className = "learning.wow.DomainClass";
        Class<?> aClass = Class.forName(className);
        Constructor<?> constructor = aClass.getConstructor();
        Object o = constructor.newInstance();
        List<Method> methodsAnnotatedWith = getMethodsAnnotatedWith(aClass, Wow.class);
        for (Method method : methodsAnnotatedWith) {
            Class<?>[] parameterTypes = method.getParameterTypes();
            for (Class<?> parameterType : parameterTypes) {
                System.out.println(parameterType.getName());
            }
            method.invoke(o, "hey");
            System.out.println(method.getName());
        }
    }

    @Test
    void findAnnotatedMethodWithName() throws
            ClassNotFoundException, IllegalAccessException, InstantiationException, InvocationTargetException {
        String className = "learning.wow.DomainClass";
        String name = "shutdownMethod";
        Class<?> aClass = Class.forName(className);
        Object o = aClass.newInstance();
        List<Method> methodsAnnotatedWith = getMethodsAnnotatedWith(aClass, Wow.class);
        List<Method> methodsAnnotatedWithName = new ArrayList<>();
        for (Method method : methodsAnnotatedWith) {
            Wow ta = method.getAnnotation(Wow.class);
            if (ta.name().equals(name))
                methodsAnnotatedWithName.add(method);
        }

        if (methodsAnnotatedWithName.size() == 0) {
            throw new RuntimeException("No method found");
        }

        if (methodsAnnotatedWithName.size() > 1) {
            throw new RuntimeException("Too many methods found");
        }

        methodsAnnotatedWithName.get(0).invoke(o, "hey");
    }

    @Test
    void findAnnotatedMethodWithName2() throws
            ClassNotFoundException, IllegalAccessException, InstantiationException, InvocationTargetException {
        String className = "learning.wow.MyDomainClass";
        String name = "shutdownMethod";
        Class<?> aClass = Class.forName(className);
        Object o = aClass.newInstance();
        List<Method> methodsAnnotatedWith = getMethodsAnnotatedWith(aClass, Wow.class);
        List<Method> methodsAnnotatedWithName = new ArrayList<>();
        for (Method method : methodsAnnotatedWith) {
            Wow ta = method.getAnnotation(Wow.class);
            if (ta.name().equals(name))
                methodsAnnotatedWithName.add(method);
        }

        if (methodsAnnotatedWithName.size() == 0) {
            throw new RuntimeException("No method found");
        }

        if (methodsAnnotatedWithName.size() > 1) {
            throw new RuntimeException("Too many methods found");
        }

        methodsAnnotatedWithName.get(0).invoke(o, "hey");
    }

}
