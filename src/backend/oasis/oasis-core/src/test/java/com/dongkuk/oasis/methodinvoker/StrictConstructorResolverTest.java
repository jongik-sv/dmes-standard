package com.dongkuk.oasis.methodinvoker;

import com.dongkuk.oasis.methodinvoker.annotations.ParameterQualifier;
import com.dongkuk.oasis.methodinvoker.exceptions.NoUniqueElementException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.ParameterizedTypeReference;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-02-24
 */
class StrictConstructorResolverTest {
    ConstructorResolver resolver = new StrictConstructorResolver(
            new PublicOnlyCandidateConstructorsSelector(),
            new TypeMatchableMethodArgumentBinder(),
            new HighestPriorityPicker());

    @Test
    void givenNoPublicConstructorClassThenThrowException() {
        assertThatExceptionOfType(ConstructorNotFoundException.class)
                .isThrownBy(() -> resolver.resolve(NoPublicConstWithPublicClass.class, null))
                .withMessage("No public constructor exists. : com.dongkuk.oasis.methodinvoker.StrictConstructorResolverTest$NoPublicConstWithPublicClass");
    }

    @Test
    void givenNoContextToFindArgsThenThrowException() {
        assertThatExceptionOfType(ConstructorNotFoundException.class)
                .isThrownBy(() -> resolver.resolve(OneStringArgOnlyClass.class, null))
                .withMessage("Args exist but no context exists.");

        Context mockContext = mock(Context.class);
        assertThatExceptionOfType(ConstructorNotFoundException.class)
                .isThrownBy(() -> resolver.resolve(OneStringArgOnlyClass.class, mockContext))
                .withMessage("No candidate constructors : com.dongkuk.oasis.methodinvoker.StrictConstructorResolverTest$OneStringArgOnlyClass");
    }

    @Test
    void givenContextDataWithSameNameOfParameterNameThenBind() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.getValueByKey("ant")).willReturn(new TypeDescribableObject("1", String.class));
        given(mockContext.hasKey("ant")).willReturn(true);

        PrioritizableMethodOrConstructorHolder resolve = resolver.resolve(OneStringArgOnlyClass.class, mockContext);

        assertThat(resolve.constructor()).isEqualTo(OneStringArgOnlyClass.class.getConstructor(String.class));
        assertThat(resolve.args()).hasSize(1);
        assertThat(resolve.args()[0]).isEqualTo("1");
    }

    @Test
    @DisplayName("파라미터 이름과 같은 이름의 값을 가지고 있는데 값이 null 이면 이어도 바인드 되어야 함")
    void givenContextNullDataWithSameNameOfParameterNameThenBind() {
        Context mockContext = mock(Context.class);
        given(mockContext.getValueByKey("ant")).willReturn(new TypeDescribableObject(null, String.class));
        given(mockContext.hasKey("ant")).willReturn(true);

        PrioritizableMethodOrConstructorHolder resolve = resolver.resolve(OneStringArgOnlyClass.class, mockContext);
        assertThat(resolve.args()).hasSize(1);
        assertThat(resolve.args()[0]).isNull();
    }

    @Test
    void givenContextDataWithSameNameOfParameterNameButDifferentTypeThenThrowException() {
        Context mockContext = mock(Context.class);
        given(mockContext.getValueByKey("ant")).willReturn(new TypeDescribableObject(1, int.class));
        given(mockContext.hasKey("ant")).willReturn(true);

        assertThatExceptionOfType(ConstructorNotFoundException.class)
                .isThrownBy(() -> resolver.resolve(OneStringArgOnlyClass.class, mockContext));
    }

    @Test
    void givenContextDataWithSameNameOfAnnotationValueThenBind() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.getValueByKey("ant")).willReturn(new TypeDescribableObject("1"));
        given(mockContext.hasKey("ant")).willReturn(true);

        PrioritizableMethodOrConstructorHolder resolve = resolver.resolve(AnnotatedArgClass.class, mockContext);

        assertThat(resolve.constructor()).isEqualTo(AnnotatedArgClass.class.getConstructor(String.class));
        assertThat(resolve.args()).hasSize(1);
        assertThat(resolve.args()[0]).isEqualTo("1");
    }

    @Test
    @DisplayName("애노테이션 값과 파라미터 이름이 다른 생성자에서 파라미터 이름으로된 자료만 컨텍스트에 있다면 예외 발생")
    void givenParameterNameAndAnnotationValueDifferentAndOnlyValueExistsInContextWithParameterNameThenThrowException() {
        Context mockContext = mock(Context.class);
        given(mockContext.getValueByKey("bug")).willReturn(new TypeDescribableObject(1));
        given(mockContext.hasKey("bug")).willReturn(true);

        assertThatExceptionOfType(ConstructorNotFoundException.class)
                .isThrownBy(() -> resolver.resolve(AnnotatedArgClass.class, mockContext));
    }

    @Test
    @DisplayName("컨텍스트에 파라미터 이름으로된 값이 없다면 타입으로 바인드")
    void givenNoValueWithParameterNameThenBindWithType() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("ant")).willReturn(false);
        given(mockContext.hasType(String.class)).willReturn(true);
        given(mockContext.getOneValueByType(String.class)).willReturn(new TypeDescribableObject("1"));

        PrioritizableMethodOrConstructorHolder resolve = resolver.resolve(OneStringArgOnlyClass.class, mockContext);

        assertThat(resolve.constructor()).isEqualTo(OneStringArgOnlyClass.class.getConstructor(String.class));
        assertThat(resolve.args()).hasSize(1);
        assertThat(resolve.args()[0]).isEqualTo("1");
    }

    @Test
    @DisplayName("컨텍스트에 파라미터 이름으로된 값이 없고, 파라미터 타입과 같은 값이 여러개이면 예외 발생")
    void givenNoValueWithParamNameAndManyValueOfSameTypeOfParameterThenThrowException() {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("ant")).willReturn(false);
        given(mockContext.hasType(String.class)).willReturn(true);
        //noinspection unchecked
        given(mockContext.getOneValueByType(String.class)).willThrow(NoUniqueElementException.class);

        assertThatExceptionOfType(ConstructorNotFoundException.class)
                .isThrownBy(() -> resolver.resolve(AnnotatedArgClass.class, mockContext));
    }

    @Test
    @DisplayName("같은 타입 파라미터 2개가 중 하나만 매칭되는 값이 컨텍스트에 있을 때 예외 발생")
    void givenTwoSameTypeOfArgsAndOnlyOneArgMatchedThenThrowException() {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("ant")).willReturn(true);
        given(mockContext.getValueByKey("ant")).willReturn(new TypeDescribableObject("1"));
        given(mockContext.hasKey("bug")).willReturn(false);
        given(mockContext.hasType(String.class)).willReturn(true);
        //noinspection unchecked
        given(mockContext.getOneValueByType(String.class)).willThrow(NoUniqueElementException.class);

        assertThatExceptionOfType(ConstructorNotFoundException.class)
                .isThrownBy(() -> resolver.resolve(TwoStringArgsClass.class, mockContext));
    }

    @Test
    @DisplayName("같은 타입 파라미터 2개가 모두 파라미터 이름으로 매칭되는 값이 컨텍스트에 있을 때 바인딩")
    void givenTwoSameTypeOfArgsAndBothArgsMatchedThenBind() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("ant")).willReturn(true);
        given(mockContext.getValueByKey("ant")).willReturn(new TypeDescribableObject("1"));
        given(mockContext.hasKey("bug")).willReturn(true);
        given(mockContext.getValueByKey("bug")).willReturn(new TypeDescribableObject("2"));

        PrioritizableMethodOrConstructorHolder resolve = resolver.resolve(TwoStringArgsClass.class, mockContext);

        assertThat(resolve.constructor()).isEqualTo(TwoStringArgsClass.class.getConstructor(String.class, String.class));
        assertThat(resolve.args()).hasSize(2);
        assertThat(resolve.args()[0]).isEqualTo("1");
        assertThat(resolve.args()[1]).isEqualTo("2");
    }

    @Test
    @DisplayName("모든 생성자가 컨텍스트와 매칭되면 가장 파라미터 갯수가 많은 생성자 선택")
    void givenAllConstructMatchedWithContextThenLongestParamConstructorSelected() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("ant")).willReturn(true);
        given(mockContext.getValueByKey("ant")).willReturn(new TypeDescribableObject("1"));
        given(mockContext.hasKey("bug")).willReturn(true);
        given(mockContext.getValueByKey("bug")).willReturn(new TypeDescribableObject("2"));

        PrioritizableMethodOrConstructorHolder resolve = resolver.resolve(TwoStringArgsAndOneStringArgClass.class, mockContext);

        assertThat(resolve.constructor()).isEqualTo(TwoStringArgsAndOneStringArgClass.class.getConstructor(String.class, String.class));
        assertThat(resolve.args()).hasSize(2);
        assertThat(resolve.args()[0]).isEqualTo("1");
        assertThat(resolve.args()[1]).isEqualTo("2");
    }

    @Test
    @DisplayName("가장 긴 생성자가 컨텍스트와 매치되지 않으면 그 다음 긴 생성자를 선택")
    void givenNotMatchedLongestConstructorThenSelectTheSecond() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("ant")).willReturn(true);
        given(mockContext.getValueByKey("ant")).willReturn(new TypeDescribableObject("1"));
        given(mockContext.hasKey("bug")).willReturn(false);
        given(mockContext.hasType(String.class)).willReturn(true);
        //noinspection unchecked
        given(mockContext.getOneValueByType(String.class)).willThrow(NoUniqueElementException.class);

        PrioritizableMethodOrConstructorHolder resolve = resolver.resolve(TwoStringArgsAndOneStringArgClass.class, mockContext);

        assertThat(resolve.constructor()).isEqualTo(TwoStringArgsAndOneStringArgClass.class.getConstructor(String.class));
        assertThat(resolve.args()).hasSize(1);
        assertThat(resolve.args()[0]).isEqualTo("1");
    }

    @Test
    @DisplayName("생성자가 Primitive 타입과 Boxed 둘 다 있으면 예외발생")
    void givenContextHasPrimitiveParamShouldBindWithPrimitiveParamConstructor() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("bug")).willReturn(true);
        given(mockContext.getValueByKey("bug")).willReturn(new TypeDescribableObject(1));

        assertThatExceptionOfType(ConstructorNotFoundException.class)
                .isThrownBy(() -> resolver.resolve(ThreeDifferentTypeArgsClass.class, mockContext));
    }

    @Test
    @DisplayName("컨텍스트에 Boxed Type 이어도 컨스트럭터에 박싱타입이 없으면 primitive 타입에 매핑되어야 함")
    void givenBoxedTypeInContextAndNoBoxedTypeInConstructorThenBindWithPrimitiveConstructor() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("bug")).willReturn(true);
        given(mockContext.getValueByKey("bug")).willReturn(new TypeDescribableObject(1));

        PrioritizableMethodOrConstructorHolder resolve = resolver.resolve(PrimitiveOnlyConstructorClass.class, mockContext);

        assertThat(resolve.constructor()).isEqualTo(PrimitiveOnlyConstructorClass.class.getConstructor(int.class));
        assertThat(resolve.args()).hasSize(1);
        assertThat(resolve.args()[0]).isEqualTo(1);
    }

    @Test
    @DisplayName("컨텍스트에 Primitive type 이어도 컨스트럭터에 primitive type 이 없으면 Boxed 타입에 매핑되어야 함")
    void givenPrimitiveTypeInContextAndNoPrimitiveTypeInConstructorThenBindWithBoxedConstructor() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("bug")).willReturn(true);
        given(mockContext.getValueByKey("bug")).willReturn(new TypeDescribableObject(1));

        PrioritizableMethodOrConstructorHolder resolve = resolver.resolve(BoxedTypeOnlyConstructorClass.class, mockContext);

        assertThat(resolve.constructor()).isEqualTo(BoxedTypeOnlyConstructorClass.class.getConstructor(Integer.class));
        assertThat(resolve.args()).hasSize(1);
        assertThat(resolve.args()[0]).isEqualTo(1);
    }

    @Test
    @DisplayName("같은 길이를 가진 생성자 2개 이상 매핑되면 예외발생")
    void whenMoreThen2ConstructWithPrimitiveMatchedThenThrowException() {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("ant")).willReturn(true);
        given(mockContext.getValueByKey("ant")).willReturn(new TypeDescribableObject(1));
        given(mockContext.hasKey("bug")).willReturn(true);
        given(mockContext.getValueByKey("bug")).willReturn(new TypeDescribableObject(new Integer(1)));

        assertThatExceptionOfType(ConstructorNotFoundException.class)
                .isThrownBy(() -> resolver.resolve(PrimitiveAndWrappedButDifferentNameClass.class, mockContext));
    }

    @Test
    @DisplayName("같은 길이를 가진 생성자 2개 이상 매핑되면 예외발생")
    void whenMoreThen2ConstructWithReferenceTypeMatchedThenThrowException() {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("ant")).willReturn(true);
        given(mockContext.getValueByKey("ant")).willReturn(new TypeDescribableObject("1"));
        given(mockContext.hasKey("bug")).willReturn(true);
        given(mockContext.getValueByKey("bug")).willReturn(new TypeDescribableObject(new Integer(1)));

        assertThatExceptionOfType(ConstructorNotFoundException.class)
                .isThrownBy(() -> resolver.resolve(TwoDifferentTypeConstructorClass.class, mockContext));
    }

    @Test
    @DisplayName("컨텍스트에 null 인 것과 아닌 것이 있을 때 예외발생")
    void givenNullAndNonNullValueInContextThenUseNonNullValue() {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("ant")).willReturn(true);
        given(mockContext.getValueByKey("ant")).willReturn(new TypeDescribableObject(null, String.class));
        given(mockContext.hasKey("bug")).willReturn(true);
        given(mockContext.getValueByKey("bug")).willReturn(new TypeDescribableObject(1));

        assertThatExceptionOfType(ConstructorNotFoundException.class)
                .isThrownBy(() -> resolver.resolve(TwoDifferentTypeConstructorClass.class, mockContext));
    }

    @Test
    @DisplayName("생성자가 제네릭이면 이름과 매칭되는 값을 매핑")
    void givenGenericsConstructorThenMappingWithName() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("ant")).willReturn(true);
        given(mockContext.getValueByKey("ant")).willReturn(new TypeDescribableObject("1"));

        PrioritizableMethodOrConstructorHolder resolve = resolver.resolve(GenericClass.class, mockContext);

        assertThat(resolve.constructor()).isEqualTo(GenericClass.class.getConstructor(Object.class));
        assertThat(resolve.args()).hasSize(1);
        assertThat(resolve.args()[0]).isEqualTo("1");
    }

    @Test
    @DisplayName("제네릭 리스트 타입이면 자동 매핑")
    void givenGenericList() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("ants")).willReturn(true);
        List<String> list = new ArrayList<>();
        list.add("1");
        given(mockContext.getValueByKey("ants"))
                .willReturn(
                        new TypeDescribableObject(list, new ParameterizedTypeReference<List<String>>() {
                        }.getType()));

        PrioritizableMethodOrConstructorHolder resolve = resolver.resolve(GenericClass.class, mockContext);

        assertThat(resolve.constructor()).isEqualTo(GenericClass.class.getConstructor(List.class));
        assertThat(resolve.args()).hasSize(1);
        //noinspection unchecked
        assertThat(((List<String>) resolve.args()[0]).get(0)).isEqualTo("1");

    }

    @Test
    void givenGenericList2() throws NoSuchMethodException {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("ant")).willReturn(true);
        List<String> list = new ArrayList<>();
        list.add("1");
        given(mockContext.getValueByKey("ant"))
                .willReturn(
                        new TypeDescribableObject(list, new ParameterizedTypeReference<List<String>>() {
                        }.getType()));

        PrioritizableMethodOrConstructorHolder resolve = resolver.resolve(GenericClassList.class, mockContext);

        assertThat(resolve.constructor()).isEqualTo(GenericClassList.class.getConstructor(List.class));
        assertThat(resolve.args()).hasSize(1);
        //noinspection unchecked
        assertThat(((List<String>) resolve.args()[0]).get(0)).isEqualTo("1");

    }

    @Test
    @DisplayName("리스트의 요소타입이 다르면 매핑되면 안됨")
    void givenWrongTypeElementOfListThenException() {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("strings")).willReturn(true);
        List<Integer> integers = new ArrayList<>();
        integers.add(1);
        given(mockContext.getValueByKey("strings")).willReturn(new TypeDescribableObject(integers,
                new ParameterizedTypeReference<List<Integer>>() {
                }.getType()));

        assertThatExceptionOfType(ConstructorNotFoundException.class)
                .isThrownBy(() -> resolver.resolve(GenericListClass.class, mockContext));
    }

    @Test
    @DisplayName("호환 안되는 키를 가지고 있으면 매핑 안됨")
    void givenIncompatibleKeyThenException() {
        Context mockContext = mock(Context.class);
        given(mockContext.hasKey("list")).willReturn(true);
        Map<Integer, Integer> l = new HashMap<>();
        given(mockContext.getValueByKey("list")).willReturn(new TypeDescribableObject(l,
                new ParameterizedTypeReference<Map<Integer, Integer>>() {
                }.getType()));

        assertThatExceptionOfType(ConstructorNotFoundException.class)
                .isThrownBy(() -> resolver.resolve(MapConstructor.class, mockContext));
    }

    static class MapConstructor {
        public MapConstructor(Map<String, List<String>> list) {
        }
    }

    static class GenericListClass {
        List<String> list;

        public GenericListClass(List<String> strings) {
            this.list = strings;
        }

        public void add(String hey) {
            list.add(hey);
        }

    }

    static class GenericClass<T> {
        public GenericClass(T ant) {
            System.out.println("ant");
        }

        public GenericClass(List<T> ants) {
            System.out.println("ants");
        }

        public void hello() {
            System.out.println(this.getClass().getName());
        }
    }

    static class GenericClassList<T> {
        public GenericClassList(T ant) {
            System.out.println("ant");
        }

        public GenericClassList(List<T> ant) {
            System.out.println("ants");
        }
    }

    static class PrimitiveAndWrappedButDifferentNameClass {
        public PrimitiveAndWrappedButDifferentNameClass(int ant) {

        }

        public PrimitiveAndWrappedButDifferentNameClass(Integer bug) {

        }
    }

    static class TwoDifferentTypeConstructorClass {
        public TwoDifferentTypeConstructorClass(String ant) {

        }

        public TwoDifferentTypeConstructorClass(Integer bug) {

        }
    }

    static class BoxedTypeOnlyConstructorClass {
        public BoxedTypeOnlyConstructorClass(Integer bug) {
            System.out.println("int");
        }
    }

    static class PrimitiveOnlyConstructorClass {
        public PrimitiveOnlyConstructorClass(int bug) {
            System.out.println("int");
        }
    }

    static class ThreeDifferentTypeArgsClass {
        public ThreeDifferentTypeArgsClass(String ant) {
            System.out.println("String");
        }

        public ThreeDifferentTypeArgsClass(int bug) {
            System.out.println("int");
        }

        public ThreeDifferentTypeArgsClass(Integer bug) {
            System.out.println("Integer");
        }
    }

    static class TwoStringArgsAndOneStringArgClass {
        public TwoStringArgsAndOneStringArgClass(String ant, String bug) {
        }

        public TwoStringArgsAndOneStringArgClass(String ant) {
        }
    }

    static class TwoStringArgsClass {
        public TwoStringArgsClass(String ant, String bug) {
        }
    }

    static class AnnotatedArgClass {
        public AnnotatedArgClass(@ParameterQualifier("ant") String bug) {
        }
    }

    static class OneStringArgOnlyClass {
        public OneStringArgOnlyClass(String ant) {
        }
    }

    static class NoPublicConstWithNotPublicClass {
    }

    static public class NoPublicConstWithPublicClass {
        private NoPublicConstWithPublicClass() {
        }
    }

}