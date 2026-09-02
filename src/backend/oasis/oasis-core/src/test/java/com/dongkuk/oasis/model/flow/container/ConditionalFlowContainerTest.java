package com.dongkuk.oasis.model.flow.container;

import com.dongkuk.oasis.model.flow.ConditionalFlow;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.Collections;

import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-02-01
 */
class ConditionalFlowContainerTest {
    @Test
    void flowCanNotBeNull() {
        Assertions.assertThatIllegalArgumentException().isThrownBy(
                () -> new ConditionalFlowContainer(Collections.singletonList(mock(ConditionalFlow.class)), null)
        )
        ;
    }

    @SuppressWarnings("ConstantConditions")
    @Test
    void conditionalFlowCollectionCanNotBeNull() {
        Assertions.assertThatIllegalArgumentException().isThrownBy(
                () -> new ConditionalFlowContainer(null, null)
        );
    }

    @Test
    void givenSequenceFlowInjectedAndRequestSequenceFlowThenThrowUnsupportedOperationException() {
        ConditionalFlowContainer container =
                new ConditionalFlowContainer(Collections.singletonList(mock(ConditionalFlow.class)));

        Assertions.assertThatExceptionOfType(UnsupportedOperationException.class).isThrownBy(
                container::sequenceFlow
        );
    }
}