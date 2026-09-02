package com.dongkuk.oasis.methodinvoker;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;

/**
 * 기본 생성자만 있는 클래스의 객체 생성.
 */
class HasDefaultConstructorOnlyTest {
    @Test
    void defaultConstructorOnly() {
        ObjectFactory objectFactory = new DefaultObjectFactory();
        Context context = mock(Context.class);
        Object obj = objectFactory.createObject("com.dongkuk.oasis.methodinvoker.HasDefaultConstructorOnlyTest$DefaultConstructorOnly", context);
        Assertions.assertThat(obj).isNotNull();
    }

    static class DefaultConstructorOnly {
    }

    //org.springframework.beans.factory.support.SimpleInstantiationStrategy#instantiate(org.springframework.beans.factory.support.RootBeanDefinition, java.lang.String, org.springframework.beans.factory.BeanFactory)
}
