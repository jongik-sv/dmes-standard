package com.dongkuk.oasis.methodinvoker;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-02-22
 */
class MultiTypeConstructorTest {
    @Test
    @DisplayName("컨텍스트에 존재하는 데이터가 여러 생성자와 매치될 때 가장 파라미터가 긴 것 사용")
    void givenFullMatchedParameterInContextThenUseMaximumMatchedConstructor() {
        ObjectFactory objectFactory = new DefaultObjectFactory();
        Context context = mock(Context.class);
        given(context.getValueByKey(any())).willReturn(new TypeDescribableObject("l"));
        given(context.hasKey(anyString())).willReturn(true);

        Object obj = objectFactory.createObject("com.dongkuk.oasis.methodinvoker.MultiTypeConstructorTest$MultiTypeConstructor", context);

        assertThat(obj).isNotNull();
        MultiTypeConstructor obj1 = (MultiTypeConstructor) obj;
        assertThat(obj1.getData1()).isEqualTo("l");
        assertThat(obj1.getData2()).isEqualTo("l");
    }

    @Test
    void givenPartiallyMatchedParameterInContextThenUseThem() {
        ObjectFactory objectFactory = new DefaultObjectFactory();
        Context context = mock(Context.class);
        given(context.getValueByKey("data1")).willReturn(new TypeDescribableObject("1"));
        given(context.hasKey("data1")).willReturn(true);
        given(context.hasKey("2")).willReturn(false);

        Object obj = objectFactory.createObject("com.dongkuk.oasis.methodinvoker.MultiTypeConstructorTest$MultiTypeConstructor", context);

        assertThat(obj).isNotNull();
        MultiTypeConstructor obj1 = (MultiTypeConstructor) obj;
        assertThat(obj1.getData1()).isEqualTo("1");
        assertThat(obj1.getData2()).isNull();
    }

    static public class MultiTypeConstructor {
        private final String data1;
        private final String data2;

        public MultiTypeConstructor(String data1, String data2) {
            this.data1 = data1;
            this.data2 = data2;
        }

        public MultiTypeConstructor(String data1) {
            this.data1 = data1;
            this.data2 = null;
        }

        public MultiTypeConstructor() {
            this.data1 = null;
            this.data2 = null;
        }

        public String getData1() {
            return data1;
        }

        public String getData2() {
            return data2;
        }
    }
}
