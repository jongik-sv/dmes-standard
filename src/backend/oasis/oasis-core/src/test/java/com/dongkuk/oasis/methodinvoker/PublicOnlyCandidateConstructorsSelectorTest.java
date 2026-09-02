package com.dongkuk.oasis.methodinvoker;

import com.dongkuk.oasis.methodinvoker.annotations.ConstructorQualifier;
import com.dongkuk.oasis.methodinvoker.annotations.DefaultConstructor;
import com.dongkuk.oasis.methodinvoker.exceptions.NoUniqueQualifierException;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/**
 * @author Jeongjin Kim
 * @since 2021-03-16
 */
class PublicOnlyCandidateConstructorsSelectorTest {
    final CandidateConstructorsSelector resolver = new PublicOnlyCandidateConstructorsSelector();

    @Test
    void givenNoQualifierThenReturnAllConstructors() {
        Constructor<?>[] resolve = resolver.select(ConstructorQualifierExists.class, null);
        assertThat(resolve).hasSize(2);
    }

    @Test
    void givenNoQualifierAndNoPublicConstructorThenThrowsException() {
        assertThatExceptionOfType(ConstructorNotFoundException.class).isThrownBy(
                () -> resolver.select(NoPublicConstructor.class, null))
                .withMessage("No public constructor exists. : com.dongkuk.oasis.methodinvoker.PublicOnlyCandidateConstructorsSelectorTest$NoPublicConstructor");
    }

    @Test
    void givenQualifierAndConstructorQualifierAnnotationThenMatchedConstructorReturn() {
        Constructor<?>[] resolve = resolver.select(ConstructorQualifierExists.class, "myConst");
        assertThat(resolve).hasSize(1);
        assertThat(resolve[0].getParameterCount()).isEqualTo(0);
    }

    @Test
    void givenQualifierAndConstructorQualifierAnnotationWithWrongNameThenThrowsException() {
        assertThatExceptionOfType(ConstructorNotFoundException.class).isThrownBy(
                () -> resolver.select(ConstructorQualifierExists.class, "abc"))
                .withMessage("No public constructor [abc] of class [com.dongkuk.oasis.methodinvoker.PublicOnlyCandidateConstructorsSelectorTest$ConstructorQualifierExists]");
    }

    @Test
    void givenNoQualifierAndDefaultConstructorAnnotationThenReturnDefaultConstructor() {
        Constructor<?>[] resolve = resolver.select(DefaultConstructorAnnotation.class, null);
        assertThat(resolve).hasSize(1);
        assertThat(resolve[0].getParameterCount()).isEqualTo(1);
    }

    @Test
    void givenNoQualifierAndDefaultConstructorAnnotationAndConstructorQualifierThenReturnDefaultConstructor() {
        Constructor<?>[] resolve = resolver.select(DefaultConstructorAnnotationAndConstructorQualifierAnnotation.class, null);
        assertThat(resolve).hasSize(1);
        assertThat(resolve[0].getParameterCount()).isEqualTo(1);
    }

    @Test
    void givenQualifierAndDefaultConstructorAnnotationOnlyThenThrowsException() {
        assertThatExceptionOfType(ConstructorNotFoundException.class).isThrownBy(
                () -> resolver.select(DefaultConstructorAnnotation.class, "abc"))
                .withMessage("No constructor qualifier exists.");
    }

    @Test
    void givenQualifierAndDefaultConstructorAnnotationAndConstructorQualifierThenReturnMatchedConstructor() {
        Constructor<?>[] resolve = resolver.select(DefaultConstructorAnnotationAndConstructorQualifierAnnotation.class, "myConst");
        assertThat(resolve).hasSize(1);
        assertThat(resolve[0].getParameterCount()).isEqualTo(2);
    }

    @Test
    void givenNoQualifierAndDefaultConstructorAnnotationAndConstructorQualifierThenReturnAllPublicConstructor() {
        Constructor<?>[] resolve = resolver.select(DefaultConstructorAnnotationAndConstructorQualifierAnnotation.class, null);
        assertThat(resolve).hasSize(1);
        assertThat(resolve[0].getParameterCount()).isEqualTo(1);
    }

    @Test
    void givenMoreThenOneDefaultConstructorClassThenThrowException() {
        assertThatExceptionOfType(TooManyDefaultException.class).isThrownBy(
                () -> resolver.select(ManyDefaultConstructors.class, null))
                .withMessage("Too many default constructors.");
        assertThatExceptionOfType(TooManyDefaultException.class).isThrownBy(
                () -> resolver.select(ManyDefaultConstructors.class, "abc"))
                .withMessage("Too many default constructors.");
    }

    @Test
    void givenSameQualifierAnnotationConstructorThenThrowException() {
        assertThatExceptionOfType(NoUniqueQualifierException.class).isThrownBy(
                () -> resolver.select(SameQualifierExistsConstructors.class, "abc"))
                .withMessage("[abc] is not unique qualifier.");
    }

    @Test
    void givenDefaultConstructorOnlyThenReturnDefaultConstructor() {
        Constructor<?>[] resolve = resolver.select(DefaultConstructorOnly.class, null);
        assertThat(resolve.length).isEqualTo(1);
        assertThat(resolve[0].getParameterCount()).isEqualTo(0);
    }

    @Test
    void checkDefaultConstructorModifier() throws IllegalAccessException, InvocationTargetException, InstantiationException {
        int modifiers = DefaultConstructorOnly.class.getModifiers();
        Constructor<?>[] declaredConstructors = DefaultConstructorOnly.class.getDeclaredConstructors();
        DefaultConstructorOnly o = (DefaultConstructorOnly) declaredConstructors[0].newInstance((Object[]) null);
        System.out.println(modifiers);
        System.out.println(declaredConstructors[0].getModifiers());
        o.hello();
    }

    @Test
    void checkStaticClass() throws IllegalAccessException, InvocationTargetException, InstantiationException {
        Constructor<?>[] declaredConstructors = StaticConstructor.class.getDeclaredConstructors();
        StaticConstructor o = (StaticConstructor) declaredConstructors[0].newInstance((Object[]) null);
        System.out.println(declaredConstructors[0].getModifiers());
        o.hello();
        System.out.println(NoPublicConstructor.class.getDeclaredConstructors()[0].getModifiers());
    }

    static class SameQualifierExistsConstructors {
        @ConstructorQualifier("abc")
        public SameQualifierExistsConstructors(String a) {
        }

        @ConstructorQualifier("abc")
        public SameQualifierExistsConstructors() {
        }
    }

    static class ManyDefaultConstructors {
        @DefaultConstructor
        public ManyDefaultConstructors(String a) {
        }

        @DefaultConstructor
        public ManyDefaultConstructors() {
        }
    }

    static class DefaultConstructorAnnotationAndConstructorQualifierAnnotation {
        public DefaultConstructorAnnotationAndConstructorQualifierAnnotation() {

        }

        @DefaultConstructor
        public DefaultConstructorAnnotationAndConstructorQualifierAnnotation(String a) {

        }

        @ConstructorQualifier("myConst")
        public DefaultConstructorAnnotationAndConstructorQualifierAnnotation(String a, String b) {

        }
    }

    static class DefaultConstructorAnnotation {
        public DefaultConstructorAnnotation() {

        }

        @DefaultConstructor
        public DefaultConstructorAnnotation(String a) {

        }
    }

    static class ConstructorQualifierExists {
        @ConstructorQualifier("myConst")
        public ConstructorQualifierExists() {

        }

        public ConstructorQualifierExists(String a) {

        }
    }

    static class NoPublicConstructor {
        private NoPublicConstructor() {
        }
    }

    static class DefaultConstructorOnly {
        void hello() {
            System.out.println("hello");
        }
    }

    static class StaticConstructor {
        final static String name;

        static {
            name = "ddd";
        }

        void hello() {
            System.out.println("hello");
        }
    }
}