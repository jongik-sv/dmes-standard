package com.dongkuk.oasis.methodinvoker;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-03-25
 */
class DefaultObjectFactoryTest {
    ObjectFactory objectFactory = new DefaultObjectFactory();

    @Test
    void givenHierarchicalParameterThenUseMostSubType() {
        String fqcn = "com.dongkuk.oasis.methodinvoker.DefaultObjectFactoryTest$BestFitConstructorArgument";
        Context context = mock(Context.class);
        given(context.hasKey("a")).willReturn(true);
        given(context.getValueByKey("a")).willReturn(new TypeDescribableObject(3));

        BestFitConstructorArgument object = (BestFitConstructorArgument) objectFactory.createObject(fqcn, context);
        assertThat(object).isNotNull();
        assertThat(object.n).isEqualTo(2);
    }

    @Test
    void givenNoPublicConstructorClassThenThrowsException() {
        String fqcn = "com.dongkuk.oasis.methodinvoker.DefaultObjectFactoryTest$NoPublicConstructor";
        Context context = mock(Context.class);
        assertThatExceptionOfType(ConstructorNotFoundException.class).isThrownBy(() ->
                objectFactory.createObject(fqcn, context)
        ).withMessage("No public constructor exists. : com.dongkuk.oasis.methodinvoker.DefaultObjectFactoryTest$NoPublicConstructor");
    }

    @Test
    void givenDefaultConstructorOnlyClassThenCreateObjectWithoutContext() {
        String fqcn = "com.dongkuk.oasis.methodinvoker.DefaultObjectFactoryTest$DefaultConstructorOnly";
        Object object = objectFactory.createObject(fqcn, null);
        assertThat(object).isNotNull();
    }

    @Test
    void givenOverloadedConstructorThenUseLongestParameterMatchingContextSizeOne() {
        String fqcn = "com.dongkuk.oasis.methodinvoker.DefaultObjectFactoryTest$OverloadedConstructors";
        Context context = mock(Context.class);
        given(context.hasKey("a")).willReturn(true);
        given(context.getValueByKey("a")).willReturn(new TypeDescribableObject("a"));
        given(context.hasKey("b")).willReturn(true);
        given(context.getValueByKey("b")).willReturn(new TypeDescribableObject("b"));

        OverloadedConstructors object = (OverloadedConstructors) objectFactory.createObject(fqcn, context);
        assertThat(object).isNotNull();
        assertThat(object.a).isEqualTo("a");
        assertThat(object.b).isEqualTo("b");
    }

    @Test
    void givenAmbiguousConstructorThenThrowsException() {
        String fqcn = "com.dongkuk.oasis.methodinvoker.DefaultObjectFactoryTest$BestAmbiguousConstructorArgument";
        Context context = mock(Context.class);
        given(context.hasKey("a")).willReturn(true);
        given(context.getValueByKey("a")).willReturn(new TypeDescribableObject(1));
        given(context.hasKey("b")).willReturn(true);
        given(context.getValueByKey("b")).willReturn(new TypeDescribableObject(2));

        assertThatExceptionOfType(ConstructorNotFoundException.class).isThrownBy(() ->
                objectFactory.createObject(fqcn, context)).withMessage("Ambiguous priority objects");
    }

    static class BestAmbiguousConstructorArgument {
        /**
         * Distinguishes which constructor was chosen.
         */
        public Number n;

        public BestAmbiguousConstructorArgument(Number a, Integer b) {
            this.n = 1;
        }

        public BestAmbiguousConstructorArgument(Integer a, Number b) {
            this.n = 2;
        }
    }

    static class BestFitConstructorArgument {
        /**
         * Distinguishes which constructor was chosen.
         */
        public Number n;

        public BestFitConstructorArgument(Number a) {
            this.n = 1;
        }

        public BestFitConstructorArgument(Integer a) {
            this.n = 2;
        }
    }

    static class OverloadedConstructors {
        /**
         * First constructor argument value.
         */
        public String a;

        /**
         * Second constructor argument value.
         */
        public String b;

        public OverloadedConstructors(String a) {
            this.a = a;
        }

        public OverloadedConstructors(String a, String b) {
            this.a = a;
            this.b = b;
        }
    }

    static class DefaultConstructorOnly {

    }

    static class NoPublicConstructor {
        private NoPublicConstructor() {
        }
    }
}
