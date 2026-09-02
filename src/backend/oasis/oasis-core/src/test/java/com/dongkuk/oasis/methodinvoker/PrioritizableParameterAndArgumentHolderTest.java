package com.dongkuk.oasis.methodinvoker;

import org.junit.jupiter.api.Test;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.lang.reflect.Method;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-03-03
 */
class PrioritizableParameterAndArgumentHolderTest {

    @Test
    void givenParameterNameIsNullThenConstructorThrows() {
        MethodOrConstructorParameter parameter = mock(MethodOrConstructorParameter.class);
        given(parameter.getParameterName()).willReturn(null);

        assertThatThrownBy(() -> new PrioritizableParameterAndArgumentHolder(parameter))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("ParameterName must not be null");
    }

    @Test
    void getParameterNameReturnsParameterName() throws NoSuchMethodException {
        PrioritizableParameterAndArgumentHolder holder = holderFor("stringMethod", String.class);

        assertThat(holder.getParameterName()).isEqualTo("name");
    }

    @Test
    void getActualArgumentBeforeAcceptReturnsNull() throws NoSuchMethodException {
        PrioritizableParameterAndArgumentHolder holder = holderFor("stringMethod", String.class);

        assertThat(holder.getActualArgument()).isNull();
    }

    @Test
    void getParameterTypeReturnsGenericParameterType() throws NoSuchMethodException {
        PrioritizableParameterAndArgumentHolder holder = holderFor("listMethod", List.class);

        Type parameterType = holder.getParameterType();

        assertThat(parameterType).isInstanceOf(ParameterizedType.class);
        ParameterizedType pt = (ParameterizedType) parameterType;
        assertThat(pt.getRawType()).isEqualTo(List.class);
        assertThat(pt.getActualTypeArguments()[0]).isEqualTo(String.class);
    }

    @Test
    void acceptWithExactlyMatchingTypeBindsArgumentAndYieldsHighestPriority() throws NoSuchMethodException {
        PrioritizableParameterAndArgumentHolder holder = holderFor("stringMethod", String.class);

        holder.accept(new TypeDescribableObject("hello", String.class));

        assertThat(holder.getActualArgument()).isEqualTo("hello");
        assertThat(holder.priority()).isEqualTo(Prioritizable.PRIORITY_HIGHEST);
    }

    @Test
    void acceptWithSubTypeIncreasesPriorityByOneStep() throws NoSuchMethodException {
        PrioritizableParameterAndArgumentHolder holder = holderFor("numberMethod", Number.class);

        holder.accept(new TypeDescribableObject(1, Integer.class));

        assertThat(holder.getActualArgument()).isEqualTo(1);
        // Integer는 Number의 직속 자식이므로 한 단계.
        assertThat(holder.priority()).isEqualTo(
                Prioritizable.PRIORITY_HIGHEST + PrioritizableParameterAndArgumentHolder.PRIORITY_STEP);
    }

    @Test
    void acceptWithFartherSubTypeIncreasesPriorityByMultipleSteps() throws NoSuchMethodException {
        PrioritizableParameterAndArgumentHolder holder = holderFor("objectMethod", Object.class);

        holder.accept(new TypeDescribableObject(1, Integer.class));

        // Integer -> Number -> Object 두 단계 거리.
        assertThat(holder.priority()).isEqualTo(
                Prioritizable.PRIORITY_HIGHEST + 2 * PrioritizableParameterAndArgumentHolder.PRIORITY_STEP);
    }

    @Test
    void acceptCalledTwiceThrowsIllegalStateException() throws NoSuchMethodException {
        PrioritizableParameterAndArgumentHolder holder = holderFor("stringMethod", String.class);
        holder.accept(new TypeDescribableObject("first", String.class));

        assertThatThrownBy(() -> holder.accept(new TypeDescribableObject("second", String.class)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void acceptIncompatibleTypeThrowsIllegalArgumentException() throws NoSuchMethodException {
        PrioritizableParameterAndArgumentHolder holder = holderFor("stringMethod", String.class);

        assertThatThrownBy(() -> holder.accept(new TypeDescribableObject(42, Integer.class)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void acceptPrimitiveParameterWithNullValueUsesDefaultPrimitiveValue() throws NoSuchMethodException {
        PrioritizableParameterAndArgumentHolder holder = holderFor("intMethod", int.class);

        holder.accept(new TypeDescribableObject(null, int.class));

        assertThat(holder.getActualArgument()).isEqualTo(0);
    }

    @Test
    void acceptNonPrimitiveParameterWithNullValueStoresNull() throws NoSuchMethodException {
        PrioritizableParameterAndArgumentHolder holder = holderFor("stringMethod", String.class);

        holder.accept(new TypeDescribableObject(null, String.class));

        assertThat(holder.getActualArgument()).isNull();
    }

    @Test
    void canAcceptTypeReturnsTrueForMatchingType() throws NoSuchMethodException {
        PrioritizableParameterAndArgumentHolder holder = holderFor("stringMethod", String.class);

        assertThat(holder.canAccept(String.class)).isTrue();
    }

    @Test
    void canAcceptTypeReturnsFalseForIncompatibleType() throws NoSuchMethodException {
        PrioritizableParameterAndArgumentHolder holder = holderFor("stringMethod", String.class);

        assertThat(holder.canAccept(Integer.class)).isFalse();
    }

    @Test
    void canAcceptObjectReturnsTrueForListWithMatchingElement() throws NoSuchMethodException {
        PrioritizableParameterAndArgumentHolder holder = holderFor("listMethod", List.class);

        assertThat(holder.canAccept((Object) List.of("a"))).isTrue();
    }

    @Test
    void canAcceptObjectReturnsTrueForEmptyList() throws NoSuchMethodException {
        PrioritizableParameterAndArgumentHolder holder = holderFor("listMethod", List.class);

        assertThat(holder.canAccept((Object) List.of())).isTrue();
    }

    @Test
    void canAcceptObjectReturnsFalseForListWithWrongElementType() throws NoSuchMethodException {
        PrioritizableParameterAndArgumentHolder holder = holderFor("listMethod", List.class);

        assertThat(holder.canAccept((Object) List.of(1))).isFalse();
    }

    @Test
    void canAcceptObjectReturnsFalseForMapParameterBecauseMapBindIsUnsupported() throws NoSuchMethodException {
        PrioritizableParameterAndArgumentHolder holder = holderFor("mapMethod", Map.class);

        assertThat(holder.canAccept((Object) Map.of("k", "v"))).isFalse();
    }

    @Test
    void getParameterAnnotationReturnsAnnotationOnParameter() throws NoSuchMethodException {
        PrioritizableParameterAndArgumentHolder holder = holderFor("annotatedMethod", String.class);

        TestQualifier annotation = holder.getParameterAnnotation(TestQualifier.class);

        assertThat(annotation).isNotNull();
        assertThat(annotation.value()).isEqualTo("special");
    }

    private static PrioritizableParameterAndArgumentHolder holderFor(String methodName, Class<?>... parameterTypes)
            throws NoSuchMethodException {
        Method method = SampleMethods.class.getDeclaredMethod(methodName, parameterTypes);
        return new PrioritizableParameterAndArgumentHolder(new MethodOrConstructor(method).parameter(0));
    }

    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.PARAMETER)
    @interface TestQualifier {
        String value();
    }

    @SuppressWarnings("unused")
    static class SampleMethods {
        public void stringMethod(String name) {
        }

        public void numberMethod(Number value) {
        }

        public void objectMethod(Object value) {
        }

        public void intMethod(int n) {
        }

        public void listMethod(List<String> items) {
        }

        public void mapMethod(Map<String, String> entries) {
        }

        public void annotatedMethod(@TestQualifier("special") String value) {
        }
    }
}
