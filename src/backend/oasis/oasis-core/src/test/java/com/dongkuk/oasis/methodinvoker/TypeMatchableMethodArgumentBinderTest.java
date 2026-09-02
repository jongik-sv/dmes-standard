package com.dongkuk.oasis.methodinvoker;

import com.dongkuk.oasis.methodinvoker.annotations.ParameterQualifier;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-03-19
 */
class TypeMatchableMethodArgumentBinderTest {
    MethodArgumentBinder binder = new TypeMatchableMethodArgumentBinder();

    @Test
    void givenNoContextToFindArgsThenThrowException() {
        assertThatExceptionOfType(MethodBindingException.class).isThrownBy(() ->
                binder.bind(new MethodOrConstructor(OneStringArgOnlyClass.class.getConstructor(String.class))
                        , null)
        ).withMessage("Args exist but no context exists.");
    }

    @Test
    void givenNoSuitableMethodThenReturnNull() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        PrioritizableMethodOrConstructorHolder bind = binder.bind(
                new MethodOrConstructor(OneStringArgOnlyClass.class.getConstructor(String.class))
                , mockContext);
        assertThat(bind).isNull();
    }

    @Test
    void givenContextDataWithSameNameOfParameterNameThenBind() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.getValueByKey("ant")).willReturn(new TypeDescribableObject("1", String.class));
        given(mockContext.hasKey("ant")).willReturn(true);
        PrioritizableMethodOrConstructorHolder bind = binder.bind(new MethodOrConstructor(OneStringArgOnlyClass.class.getConstructor(String.class)),
                mockContext);

        assertThat(bind.args()).hasSize(1);
        assertThat(bind.args()[0]).isEqualTo("1");
    }

    @Test
    void givenParameterQualifierButNotMatchedThenStopMatching() {
        Context mockContext = mock(Context.class);
        given(mockContext.getValueByKey("hey")).willReturn(new TypeDescribableObject("1", String.class));
        given(mockContext.hasKey("hey")).willReturn(true);
        given(mockContext.getValueByKey("hi")).willReturn(new TypeDescribableObject("1", String.class));
        given(mockContext.hasKey("hi")).willReturn(true);
        Method[] methods = ParameterQualifiedClass.class.getMethods();
        boolean tryBinding = false;
        PrioritizableMethodOrConstructorHolder bind = null;
        for (Method method : methods) {
            if (!method.getName().equals("one") || method.getParameters().length != 2)
                continue;
            tryBinding = true;
            bind = binder.bind(new MethodOrConstructor(method), mockContext);
        }
        assertThat(bind).isNull();
        assertThat(tryBinding).isTrue();
    }

    @Test
    void givenParameterQualifierButNotMatchedThenTryNextMethod() {
        Context mockContext = mock(Context.class);
        given(mockContext.getValueByKey("hey")).willReturn(new TypeDescribableObject("1", String.class));
        given(mockContext.hasKey("hey")).willReturn(true);
        given(mockContext.getValueByKey("hi")).willReturn(new TypeDescribableObject("1", String.class));
        given(mockContext.hasKey("hi")).willReturn(true);
        Method[] methods = ParameterQualifiedClass.class.getMethods();
        PrioritizableMethodOrConstructorHolder bind = null;
        for (Method method : methods) {
            if (!method.getName().equals("one"))
                continue;
            bind = binder.bind(new MethodOrConstructor(method), mockContext);
            if (bind != null)
                break;
        }
        assert bind != null;
        assertThat(bind.method().getParameterCount()).isEqualTo(1);
    }

    @Test
    void givenListObjectsContainDifferentTypeOfObjectThenThrowException() throws NoSuchMethodException {
        SingleLevelContext context = new SingleLevelContext();
        context.add("data", new TypeDescribableObject(Arrays.asList("Str"), new TypeReference<List<String>>() {
        }));

        PrioritizableMethodOrConstructorHolder method
                = binder.bind(new MethodOrConstructor(ListMethod.class.getMethod("method", List.class)), context);
        Assertions.assertThat(method).isNull();
    }

    @Test
    void givenListObjectsContainDifferentTypeOfObjectButParameterizedThenThrowException() throws NoSuchMethodException {
        SingleLevelContext context = new SingleLevelContext();

        Map<String, Object> map = new HashMap<>();
        context.add("data", new TypeDescribableObject(Arrays.asList(map),
                new TypeReference<List<Map<String, Object>>>() {
                }));

        PrioritizableMethodOrConstructorHolder method
                = binder.bind(new MethodOrConstructor(ListMethod.class.getMethod("listMapMethod", List.class)), context);
        Assertions.assertThat(method).isNull();
    }

    @Test
    void givenListObjectsContainSameTypeOfObjectButParameterizedThenBind() throws NoSuchMethodException {
        SingleLevelContext context = new SingleLevelContext();

        Map<Integer, Integer> map = new HashMap<>();
        context.add("data", new TypeDescribableObject(Arrays.asList(map),
                new TypeReference<List<Map<Integer, Integer>>>() {
                }));

        PrioritizableMethodOrConstructorHolder method
                = binder.bind(new MethodOrConstructor(ListMethod.class.getMethod("listMapMethod", List.class)), context);
        Assertions.assertThat(method).isNotNull();
    }

    static class ListMethod {
        public String method(List<Integer> data) {
            return data.toString();
        }

        public String listMapMethod(List<Map<Integer, Integer>> data) {
            return data.toString();
        }
    }

    static class ParameterQualifiedClass {
        public void one(@ParameterQualifier("ph") String hello, String hi) {
        }

        public void one(String hey) {
        }
    }

    static class OneStringArgOnlyClass {
        public OneStringArgOnlyClass(String ant) {
        }
    }

}