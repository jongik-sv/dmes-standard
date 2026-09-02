package com.dongkuk.oasis.methodinvoker;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;

/**
 * 레퍼런스 타입을 가진 생성자가 있는 클래스의 객체 생성 테스트.
 */
class HasReferencedTypeConstructorOnlyTest {
    @Test
    void givenContextHasParamThenObjectCreated() {
        ObjectFactory objectFactory = new DefaultObjectFactory();
        Context context = mock(Context.class);
        given(context.getValueByKey(any())).willReturn(new TypeDescribableObject("1"));
        given(context.hasKey(anyString())).willReturn(true);

        Object obj = objectFactory.createObject("com.dongkuk.oasis.methodinvoker.HasReferencedTypeConstructorOnlyTest$ReferencedTypeConstructor", context);

        assertThat(obj).isNotNull();
        ReferencedTypeConstructor obj1 = (ReferencedTypeConstructor) obj;
        assertThat(obj1.getData1()).isEqualTo("1");
        assertThat(obj1.getData2()).isEqualTo("1");
    }

    static public class ReferencedTypeConstructor {
        private final String data1;
        private final String data2;

        public ReferencedTypeConstructor(String data1, String data2) {
            this.data1 = data1;
            this.data2 = data2;
        }

        public String getData1() {
            return data1;
        }

        public String getData2() {
            return data2;
        }
    }
}
