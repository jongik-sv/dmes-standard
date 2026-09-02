package com.dongkuk.oasis.methodinvoker;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Type;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-02-22
 */
class ReflectionMethod {
    @Test
    void sortConstruct() {

        Constructor<?>[] constructors = A.class.getConstructors();
        Arrays.sort(constructors, (e1, e2) -> Integer.compare(e2.getParameterCount(), e1.getParameterCount()));

        Type[] types = constructors[0].getParameterTypes();
        assertThat(types[0]).isEqualTo(String.class);
    }

    @Test
    void defaultConstructorOnly() {
        System.out.println(DefaultConstructorOnly.class.getConstructors().length);
        System.out.println(B.class.getConstructors().length);
        System.out.println(DefaultConstructorOnly.class.getDeclaredConstructors().length);
        System.out.println(B.class.getDeclaredConstructors().length);
        System.out.println("c" + C.class.getConstructors().length);
    }

    @Test
    void isInstance() {
        DD dd = new DD();
        B b = new B();
        System.out.println(D.class.isInstance(dd));
        System.out.println(D.class.isInstance(b));
    }

    public interface D {
    }

    static class DefaultConstructorOnly {
    }

    public static class DD implements D {
    }

    static public class C {
        private C() {
        }

        public C(String a) {
        }

    }

    static class B {
    }

    static class A {
        public A(int a) {

        }

        public A(String a, int b) {

        }
    }
}
