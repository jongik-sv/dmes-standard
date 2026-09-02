package com.dongkuk.oasis.methodinvoker;

import com.dongkuk.oasis.methodinvoker.annotations.DefaultMethod;
import com.dongkuk.oasis.methodinvoker.annotations.MethodQualifier;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/**
 * @author Jeongjin Kim
 * @since 2021-03-15
 */
class PublicCandidateMethodsSelectorTest {
    final CandidateMethodsSelector resolver = new PublicCandidateMethodsSelector();

    @Test
    void givenQualifierThenMatchedMethodNameReturn() {
        Method[] resolve = resolver.select(MethodOnly.class, "myMethod");
        assertThat(resolve).hasSize(1);
        assertThat(resolve[0].getName()).isEqualTo("myMethod");
    }

    @Test
    void givenQualifierWithNotExistsMethodNameThenThrowException() {
        assertThatExceptionOfType(MethodNotFoundException.class)
                .isThrownBy(() -> resolver.select(MethodOnly.class, "noMethod"))
                .withMessage("No public method [noMethod] of class [com.dongkuk.oasis.methodinvoker.PublicCandidateMethodsSelectorTest$MethodOnly]");
    }

    @Test
    void givenQualifierAndMethodQualifierAnnotationThenMatchedMethodNameReturn() {
        Method[] resolve = resolver.select(MethodAnnotationOnly.class, "myMyMethod");
        assertThat(resolve).hasSize(1);
        assertThat(resolve[0].getName()).isEqualTo("myMethod");
    }

    @Test
    void givenQualifierAndMethodQualifierAnnotationNotExistsValueThenUseMethodName() {
        Method[] resolve = resolver.select(MethodAnnotationOnly.class, "myMethod");
        assertThat(resolve).hasSize(1);
        assertThat(resolve[0].getName()).isEqualTo("myMethod");
    }

    @Test
    void givenMultiMethodWithoutAnnotationAndNoQualifierThenThrowException() {
        assertThatExceptionOfType(MethodNotFoundException.class)
                .isThrownBy(() -> resolver.select(MultiMethodWithoutAnnotation.class, null))
                .withMessage("No default method exists. : com.dongkuk.oasis.methodinvoker.PublicCandidateMethodsSelectorTest$MultiMethodWithoutAnnotation");
    }

    @Test
    void givenMultiMethodWithoutAnnotationAndQualifierThenSelectTheMethod() {
        Method[] resolve = resolver.select(MultiMethodWithoutAnnotation.class, "method1");
        assertThat(resolve).hasSize(1);
        assertThat(resolve[0].getName()).isEqualTo("method1");
    }

    @Test
    void givenMultiMethodWithoutAnnotationAndQualifierOrPrivateMethodThenException() {
        assertThatExceptionOfType(MethodNotFoundException.class)
                .isThrownBy(() -> resolver.select(MultiMethodWithoutAnnotation.class, "method3"))
                .withMessage("No public method [method3] of class [com.dongkuk.oasis.methodinvoker.PublicCandidateMethodsSelectorTest$MultiMethodWithoutAnnotation]");
    }

    @Test
    void givenMultiMethodWithDefaultMethodAnnotationAndNoQualifierThenSelectAnnotatedMethod() {
        Method[] resolve = resolver.select(MultiMethodWithDefaultMethodAnnotation.class, null);
        assertThat(resolve).hasSize(1);
        assertThat(resolve[0].getName()).isEqualTo("method1");
    }

    @Test
    void givenMultiMethodWithDefaultMethodAnnotationAndQualifierThenSelectQualifierMethod() {
        Method[] resolve = resolver.select(MultiMethodWithDefaultMethodAnnotation.class, "method2");
        assertThat(resolve).hasSize(1);
        assertThat(resolve[0].getName()).isEqualTo("method2");
    }

    @Test
    void givenMultiMethodWithoutAnnotationAndQualifierPrivateMethodThenException() {
        assertThatExceptionOfType(MethodNotFoundException.class)
                .isThrownBy(() -> resolver.select(MultiMethodWithDefaultMethodAnnotation.class, "method3"))
                .withMessage("No public method [method3] of class [com.dongkuk.oasis.methodinvoker.PublicCandidateMethodsSelectorTest$MultiMethodWithDefaultMethodAnnotation]");
    }

    @Test
    void givenTwoDefaultMethodAnnotationsExistsInClassThenThrowException() {
        assertThatExceptionOfType(TooManyDefaultException.class)
                .isThrownBy(() -> resolver.select(DoubleDefaultMethod.class, null))
                .withMessage("More then one DefaultMethod exists.");
    }

    @Test
    void givenTwoDefaultMethodAnnotationsAndQualifierExistsInClassThenThrowException() {
        assertThatExceptionOfType(TooManyDefaultException.class)
                .isThrownBy(() -> resolver.select(DoubleDefaultMethod.class, "method2"))
                .withMessage("More then one DefaultMethod exists.");
    }

    @Test
    void givenOverloadedMethodWithQualifierThenReturnAllMethodMatchingMethodName() {
        Method[] resolve = resolver.select(OverloadedMethods.class, "method1");
        assertThat(resolve).hasSize(4);
        assertThat(resolve[0].getName()).isEqualTo("method1");
        assertThat(resolve[1].getName()).isEqualTo("method1");
        assertThat(resolve[2].getName()).isEqualTo("method1");
        assertThat(resolve[3].getName()).isEqualTo("method1");
    }

    @Test
    void givenOverloadedMethodWithMethodQualifierThenReturnQualifiedNameOfMethod() {
        Method[] resolve = resolver.select(OverloadedMethodsWithQualifierOnMethod.class, "myMyMethod");
        assertThat(resolve).hasSize(1);
        assertThat(resolve[0].getName()).isEqualTo("method1");
    }

    @Test
    @DisplayName("한정자와 일치하는 메소드가 없을 때 메소드 이름과 매치되는 것을 모두 가져온다.")
    void givenNoMethodMatchingQualifierThenReturnAllMethodsMatchingMethodName() {
        Method[] resolve = resolver.select(OverloadedMethodsWithQualifierOnMethod.class, "method1");
        assertThat(resolve).hasSize(2);
        assertThat(resolve[0].getName()).isEqualTo("method1");
        assertThat(resolve[1].getName()).isEqualTo("method1");
    }

    @Test
    void givenSuperClassHasTheRequireMethodThenSelectMethodFromSuperClass() {
        Method[] resolve = resolver.select(ChildClass.class, "myMethod");
        assertThat(resolve).hasSize(1);
        assertThat(resolve[0].getName()).isEqualTo("myMethod");
    }

    @Test
    void givenSuperClassHavingMethodQualifierAnnotationHasTheRequireMethodThenSelectMethodFromSuperClass() {
        Method[] resolve = resolver.select(QualifierChildClass.class, "myMyMethod");
        assertThat(resolve).hasSize(1);
        assertThat(resolve[0].getName()).isEqualTo("method1");
    }

    @Test
    void givenChildClassAlsoHasDefaultMethodThenThrowException() {
        assertThatExceptionOfType(TooManyDefaultException.class)
                .isThrownBy(() -> resolver.select(DuplicatedDefaultMethodAnnotation.class, "method2"))
                .withMessage("More then one DefaultMethod exists.");
    }

    @Test
    void givenChildClassAlsoHasDefaultMethodWithNoQualifierThenThrowException() {
        assertThatExceptionOfType(TooManyDefaultException.class)
                .isThrownBy(() -> resolver.select(DuplicatedDefaultMethodAnnotation.class, null))
                .withMessage("More then one DefaultMethod exists.");
    }

    @Test
    void givenDuplicateQualifierAndMethodNameThenSelectMethodOfMethodQualifier() {
        Method[] resolve = resolver.select(QualifierChildClass.class, "method1");
        assertThat(resolve).hasSize(2);
    }

    static class DuplicatedDefaultMethodAnnotation extends MultiMethodWithDefaultMethodAnnotation {
        @DefaultMethod
        public void myMethod() {

        }
    }

    static class ChildClass extends MethodOnly {
        public void childMethod() {

        }
    }

    static class QualifierChildClass extends OverloadedMethodsWithQualifierOnMethod {
        public void childMethod() {

        }
    }

    static class DuplicateQualifierAndMethodName {
        @MethodQualifier("method1")
        public void method2(String a, String b) {

        }

        public void method1(String a, String b, String c) {

        }
    }

    static class OverloadedMethodsWithQualifierOnMethod {
        @MethodQualifier("myMyMethod")
        public void method1(String a, String b) {

        }

        public void method1(String a, String b, String c) {

        }
    }

    static class OverloadedMethods {
        public void method1() {

        }

        public void method1(String a) {

        }

        public void method1(String a, String b) {

        }

        public void method1(String a, String b, String c) {

        }
    }

    static class DoubleDefaultMethod {
        @DefaultMethod
        public void method1() {

        }

        @DefaultMethod
        public void method2() {

        }

        private void method3() {

        }
    }

    static class MultiMethodWithDefaultMethodAnnotation {
        @DefaultMethod
        public void method1() {

        }

        public void method2() {

        }

        private void method3() {

        }
    }

    static class MultiMethodWithoutAnnotation {
        public void method1() {

        }

        public void method2() {

        }

        private void method3() {

        }
    }

    static class MethodAnnotationOnly {
        @MethodQualifier("myMyMethod")
        public void myMethod() {
        }
    }

    static class MethodOnly {
        public void myMethod() {
        }
    }
}