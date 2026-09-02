package com.dongkuk.oasis.model.event;

import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
class DefaultStartEventTest {
    @SuppressWarnings("ConstantConditions")
    @Test
    void ConstructArgumentsCanNotBeNull() {
        Assertions.assertThatIllegalArgumentException().isThrownBy(() ->
                new DefaultStartEvent(null, null, null, new PropertyContainer()));
    }

    @Test
    void startEventShouldReturnSequenceFlow() {
        SequentialFlow mock = Mockito.mock(SequentialFlow.class);
        DefaultStartEvent f =
                new DefaultStartEvent("1", "2", mock, new PropertyContainer());

        SequentialFlow flow1 = f.sequenceFlow();
        assertThat(flow1.getId()).isNull();
    }
}