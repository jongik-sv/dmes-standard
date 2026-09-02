package com.dongkuk.oasis.methodinvoker;

import com.dongkuk.oasis.methodinvoker.annotations.DefaultMethod;
import com.dongkuk.oasis.methodinvoker.annotations.MethodQualifier;
import com.dongkuk.oasis.methodinvoker.exceptions.NoUniqueQualifierException;
import org.junit.jupiter.api.Test;

import java.lang.annotation.*;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-03-11
 */
class StrictMethodResolverTest {
    MethodResolver resolver = new StrictMethodResolver(
            new PublicCandidateMethodsSelector(),
            new TypeMatchableMethodArgumentBinder(),
            new HighestPriorityPicker()
    );

    @Test
    void givenOrdinaryClassWithoutContextThenReturnMethodWithNoArgs() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("name")).willReturn(false);

        PrioritizableMethodOrConstructorHolder sayHello = resolver.resolve(OrdinaryClass.class, "sayHello", mockContext);

        assertThat(sayHello.method()).isEqualTo(OrdinaryClass.class.getMethod("sayHello", (Class<?>[]) null));
        assertThat(sayHello.args()).hasSize(0);
    }

    @Test
    void givenOrdinaryClassWithContextThenReturnMethodWithArgs() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("name")).willReturn(true);
        given(mockContext.getValueByKey("name")).willReturn(new TypeDescribableObject("ff"));

        PrioritizableMethodOrConstructorHolder sayHello = resolver.resolve(OrdinaryClass.class, "sayHello", mockContext);

        assertThat(sayHello.method()).isEqualTo(OrdinaryClass.class.getMethod("sayHello", String.class));
        assertThat(sayHello.args()).hasSize(1);
    }

    @Test
    void givenOrdinaryClassAndAskWrongNameOfMethodThenThrowsException() {
        Context mockContext = mock(Context.class);
        assertThatExceptionOfType(MethodNotFoundException.class)
                .isThrownBy(() -> resolver.resolve(OrdinaryClass.class, "hi", mockContext))
                .withMessage("No public method [hi] of class [com.dongkuk.oasis.methodinvoker.StrictMethodResolverTest$OrdinaryClass]");
    }

    @Test
    void givenOrdinaryClassAndAskWithoutMethodNameThenThrowsException() {
        Context mockContext = mock(Context.class);
        assertThatExceptionOfType(MethodNotFoundException.class)
                .isThrownBy(() -> resolver.resolve(OrdinaryClass.class, mockContext))
                .withMessage("No default method exists. : com.dongkuk.oasis.methodinvoker.StrictMethodResolverTest$OrdinaryClass");
    }

    @Test
    void givenPrivateMethodAndAskPrivateMethodThenThrowsException() {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("name")).willReturn(true);
        given(mockContext.getValueByKey("name")).willReturn(new TypeDescribableObject("ff"));
        assertThatExceptionOfType(MethodNotFoundException.class)
                .isThrownBy(() -> resolver.resolve(PrivateMethod.class, "sayHello", mockContext))
                .withMessage("No public method [sayHello] of class [com.dongkuk.oasis.methodinvoker.StrictMethodResolverTest$PrivateMethod]");
    }

    @Test
    void givenDefaultMethodThenReturnTheMethod() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("name")).willReturn(true);
        given(mockContext.getValueByKey("name")).willReturn(new TypeDescribableObject("ff"));
        PrioritizableMethodOrConstructorHolder sayHello = resolver.resolve(DefaultMethodClass.class, mockContext);

        assertThat(sayHello.method()).isEqualTo(DefaultMethodClass.class.getMethod("method1", String.class));
        assertThat(sayHello.args()).hasSize(1);
    }

    @Test
    void givenDefaultMethodAndMethodNameThenReturnTheNamedMethod() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("name")).willReturn(true);
        given(mockContext.getValueByKey("name")).willReturn(new TypeDescribableObject("ff"));
        PrioritizableMethodOrConstructorHolder sayHello = resolver.resolve(DefaultMethodClass.class, "method2", mockContext);

        assertThat(sayHello.method()).isEqualTo(DefaultMethodClass.class.getMethod("method2", String.class));
        assertThat(sayHello.args()).hasSize(1);
    }

    @Test
    void givenMethodQualifierAndQualifierValueThenReturnQualifiedMethod() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("name")).willReturn(true);
        given(mockContext.getValueByKey("name")).willReturn(new TypeDescribableObject("ff"));
        PrioritizableMethodOrConstructorHolder sayHello = resolver.resolve(QualifiedMethodClass.class, "MyMethod", mockContext);

        assertThat(sayHello.method()).isEqualTo(QualifiedMethodClass.class.getMethod("method1", String.class));
        assertThat(sayHello.args()).hasSize(1);
    }

    @Test
    void givenSameMethodQualifierThenThrowsException() {
        Context mockContext = mock(Context.class);
        assertThatExceptionOfType(NoUniqueQualifierException.class)
                .isThrownBy(() -> resolver.resolve(SameQualifiedMethodClass.class, "MyMethod", mockContext))
                .withMessage("MyMethod is not unique qualifier.");
    }

    @Test
    void givenDuplicateDefaultMethodThenThrowsException() {
        Context mockContext = mock(Context.class);
        assertThatExceptionOfType(TooManyDefaultException.class)
                .isThrownBy(() -> resolver.resolve(DuplicateDefaultMethodClass.class, "MyMethod", mockContext))
                .withMessage("More then one DefaultMethod exists.");
    }

    @Test
    void givenNestedMethodQualifierThenWorkWell() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        PrioritizableMethodOrConstructorHolder myMethod = resolver.resolve(NestedQualifier.class, "MyMethod", mockContext);
        assertThat(myMethod.method()).isEqualTo(NestedQualifier.class.getMethod("method1"));
    }

    @Test
    void givenComplicateObjectParameterExistsAndTheObjectExistsInContextThenReturnTheMethodHavingComplicateClassParameter() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("name")).willReturn(true);
        given(mockContext.getValueByKey("name")).willReturn(new TypeDescribableObject(new OrdinaryClass()));
        PrioritizableMethodOrConstructorHolder sayHello = resolver.resolve(ComplicateObjectParameter.class, "method1", mockContext);

        assertThat(sayHello.method()).isEqualTo(ComplicateObjectParameter.class.getMethod("method1", OrdinaryClass.class));
        assertThat(sayHello.args()).hasSize(1);
    }

    @Test
    void giveListWildcardMethodThenBindWithAnyList() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("list")).willReturn(true);
        ArrayList<String> arrayList = new ArrayList<>();
        given(mockContext.getValueByKey("list")).willReturn(new TypeDescribableObject(arrayList, new TypeReference<ArrayList<String>>() {
        }));
        PrioritizableMethodOrConstructorHolder sayHello = resolver.resolve(WildcardMethod.class, "method1", mockContext);

        assertThat(sayHello.method()).isEqualTo(WildcardMethod.class.getMethod("method1", List.class));
        assertThat(sayHello.args()).hasSize(1);
    }

    @Test
    void givenTypeMatchingContextThenBindUsingType() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("list")).willReturn(false);
        ArrayList<String> arrayList = new ArrayList<>();
        Type methodParamType = WildcardMethod.class.getMethod("method1", List.class).getParameters()[0].getParameterizedType();
        given(mockContext.hasType(methodParamType)).willReturn(true);
        given(mockContext.getOneValueByType(methodParamType))
                .willReturn(new TypeDescribableObject(arrayList, new TypeReference<ArrayList<String>>() {
                }));
        PrioritizableMethodOrConstructorHolder sayHello = resolver.resolve(WildcardMethod.class, "method1", mockContext);
        assertThat(sayHello.method()).isEqualTo(WildcardMethod.class.getMethod("method1", List.class));
        assertThat(sayHello.args()).hasSize(1);
    }

    @Test
    void givenJsonStringTryConvertToParameterObject() throws NoSuchMethodException {
        SingleLevelContext context = new SingleLevelContext();
        context.add("paramObject", new TypeDescribableObject(new ParamObject("3")));
        PrioritizableMethodOrConstructorHolder call = resolver.resolve(PojoParamMethodClass.class, "call", context);
        assertThat(call.method()).isEqualTo(PojoParamMethodClass.class.getMethod("call", ParamObject.class));
        assertThat(call.args()).hasSize(1);

        context.add("paramObject", new TypeDescribableObject("{\"id\":\"3\"}"));
        PrioritizableMethodOrConstructorHolder call2 = resolver.resolve(PojoParamMethodClass.class, "call", context);
        assertThat(call2.method()).isEqualTo(PojoParamMethodClass.class.getMethod("call", ParamObject.class));
        assertThat(call2.args()).hasSize(1);
    }

    static class PojoParamMethodClass {
        public void call(ParamObject paramObject) {

        }
    }

    static class ParamObject {
        private String id;

        public ParamObject() {
        }

        public ParamObject(String id) {
            this.id = id;
        }

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }
    }

    @Target({ElementType.METHOD, ElementType.ANNOTATION_TYPE})
    @Retention(RetentionPolicy.RUNTIME)
    @Inherited
    @Documented
    @MethodQualifier
    @interface Qualifier{
        String value();
    }

    static class NestedQualifier{
        @Qualifier("MyMethod")
        public void method1(){

        }
    }

    static class WildcardMethod {
        public void method1(List<?> list) {

        }

        public void method1(String name) {
        }
    }

    static class ComplicateObjectParameter {
        public void method1(OrdinaryClass name) {
        }

        public void method1(String name) {
        }
    }

    static class SameQualifiedMethodClass {
        @MethodQualifier("MyMethod")
        public void method2(String name) {

        }

        @MethodQualifier("MyMethod")
        public void method1(String name) {

        }

    }

    static class QualifiedMethodClass {
        public void method2(String name) {

        }

        @MethodQualifier("MyMethod")
        public void method1(String name) {

        }

    }

    static class DuplicateDefaultMethodClass {
        @DefaultMethod
        public void method1(String name) {

        }

        @DefaultMethod
        public void method2(String name) {

        }
    }

    static class DefaultMethodClass {
        @DefaultMethod
        public void method1(String name) {

        }

        public void method2(String name) {

        }
    }

    static class PrivateMethod {
        private void sayHello() {

        }

        private void sayHello(String name) {

        }
    }

    static class OrdinaryClass {
        public void sayHello() {

        }

        public void sayHello(String name) {

        }
    }
}