package com.dongkuk.oasis.execution;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultExecutableContext;
import com.dongkuk.oasis.context.DefaultProcessContext;
import com.dongkuk.oasis.context.EmptyServiceContext;
import com.dongkuk.oasis.context.ProcessContext;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Type;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-04-11
 */
class DefaultExecutableContextTest {
    @Test
    void givenRequestedKeyNotExistsThenReturnNull() {
        ProcessContext processContext = new DefaultProcessContext(new EmptyServiceContext());

        DefaultExecutableContext context = new DefaultExecutableContext(
                processContext);

        TypedObject k1 = context.get("k1");
        assertThat(k1).isNull();
    }

    @Test
    void givenNullKeyThenThrowException() {
        ProcessContext processContext = new DefaultProcessContext(new EmptyServiceContext());

        DefaultExecutableContext context = new DefaultExecutableContext(
                processContext);

        Assertions.assertThatExceptionOfType(IllegalArgumentException.class)
                .isThrownBy(() -> context.get((Type) null));
        Assertions.assertThatExceptionOfType(IllegalArgumentException.class)
                .isThrownBy(() -> context.get((String) null));
    }
}