package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.*;
import com.dongkuk.oasis.expression.property.PropertyExpression;
import com.dongkuk.oasis.utils.TypedMapBuilder;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Type;
import java.util.Collections;
import java.util.NoSuchElementException;

/**
 * @author Jeongjin Kim
 * @since 2021-09-15
 */
class PropertyExpressionAccessibleContextTest {
    @Test
    void givenNullKeyThenThrowException() {
        ProcessContext processContext = new DefaultProcessContext(new EmptyServiceContext());

        PropertyExpressionAccessibleContext context = new PropertyExpressionAccessibleContext(new DefaultExecutableContext(processContext),
                null);

        Assertions.assertThatExceptionOfType(IllegalArgumentException.class)
                .isThrownBy(() -> context.get((Type) null));
        Assertions.assertThatExceptionOfType(IllegalArgumentException.class)
                .isThrownBy(() -> context.get((String) null));
    }

    @Test
    void givenKeyInServiceContextThenReturnTheValue() {
        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(
                new TypedMapBuilder().addEntity("m", "hi").build()
        ));
        PropertyExpressionAccessibleContext context = new PropertyExpressionAccessibleContext(new DefaultExecutableContext(processContext),
                Collections.singletonList(new PropertyExpression("m")));

        TypedObject m = context.get("m");
        Assertions.assertThat(m).isNotNull();
        Assertions.assertThat(m.getObject(String.class)).isEqualTo("hi");
    }

    @Test
    void givenKeyInProcessContextThenReturnTheValue() {
        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(
                new TypedMapBuilder().addEntity("m", "hi").build()
        ));
        processContext.add("m", new TypedObject("hello"));
        PropertyExpressionAccessibleContext context = new PropertyExpressionAccessibleContext(new DefaultExecutableContext(processContext),
                Collections.singletonList(new PropertyExpression("m")));

        TypedObject m = context.get("m");
        Assertions.assertThat(m).isNotNull();
        Assertions.assertThat(m.getObject(String.class)).isEqualTo("hello");
    }

    @Test
    void givenKeyInProcessContextAndServiceContextThenReturnTheValueInProcessContext() {
        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(
                new TypedMapBuilder().addEntity("m", "hi").build()
        ));
        processContext.add("m", new TypedObject("hello"));
        PropertyExpressionAccessibleContext context = new PropertyExpressionAccessibleContext(new DefaultExecutableContext(processContext),
                Collections.singletonList(new PropertyExpression("m")));
        TypedObject m = context.get("m");
        Assertions.assertThat(m).isNotNull();
        Assertions.assertThat(m.getObject(String.class)).isEqualTo("hello");
    }

    @Test
    void givenKeyNoExistsInContextThenThrowsException() {
        ProcessContext processContext = new DefaultProcessContext(new EmptyServiceContext());
        PropertyExpressionAccessibleContext context = new PropertyExpressionAccessibleContext(new DefaultExecutableContext(processContext),
                Collections.singletonList(new PropertyExpression("m")));
        Assertions.assertThatThrownBy(() -> context.get("k")).isInstanceOf(NoSuchElementException.class);
    }
}