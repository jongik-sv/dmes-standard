package com.dongkuk.oasis.methodinvoker;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatcher;
import org.mockito.ArgumentMatchers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.mockito.BDDMockito.given;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;

/**
 * 생성자가 프리미티브 타입일 때 객체 생성 테스트.
 */
class HasPrimitiveConstructorOnlyTest {
    @Test
    void givenContextHasParamThenObjectCreated() {
        ObjectFactory objectFactory = new DefaultObjectFactory();
        Context context = mock(Context.class);
        given(context.getValueByKey(any())).willReturn(new TypeDescribableObject(1));
        given(context.hasKey(ArgumentMatchers.anyString())).willReturn(true);
        given(context.hasType(Class.class)).willReturn(true);

        Object obj = objectFactory.createObject("com.dongkuk.oasis.methodinvoker.HasPrimitiveConstructorOnlyTest$PrimitiveConstructor", context);

        assertThat(obj).isNotNull();
        PrimitiveConstructor obj1 = (PrimitiveConstructor) obj;
        assertThat(obj1.getData()).isEqualTo(1);
    }

    @Test
    void givenContextHasParamButNullThenObjectCreatedWithDefaultValue() {
        ObjectFactory objectFactory = new DefaultObjectFactory();
        Context context = mock(Context.class);
        given(context.getValueByKey(any())).willReturn(new TypeDescribableObject(null, int.class));
        given(context.hasKey(ArgumentMatchers.anyString())).willReturn(true);

        Object obj = objectFactory.createObject("com.dongkuk.oasis.methodinvoker.HasPrimitiveConstructorOnlyTest$PrimitiveConstructor", context);

        assertThat(obj).isNotNull();
        PrimitiveConstructor obj1 = (PrimitiveConstructor) obj;
        assertThat(obj1.getData()).isEqualTo(0);
    }

    @Test
    void givenContextNotHaveParamThenClassInitializationException() {
        ObjectFactory objectFactory = new DefaultObjectFactory();
        Context context = mock(Context.class);
        given(context.getValueByKey(any())).willReturn(new TypeDescribableObject("no"));
        given(context.hasKey(ArgumentMatchers.anyString())).willReturn(true);

        assertThatExceptionOfType(ConstructorNotFoundException.class).isThrownBy(() ->
                objectFactory.createObject("com.dongkuk.oasis.methodinvoker.HasPrimitiveConstructorOnlyTest$PrimitiveConstructor", context));
    }

    static public class PrimitiveConstructor {
        private final int data;

        public PrimitiveConstructor(int a) {
            this.data = a;
        }

        public int getData() {
            return data;
        }
    }

    class F<T> implements ArgumentMatcher<Class<T>> {

        @Override
        public boolean matches(Class<T> argument) {
            return false;
        }
    }

}
