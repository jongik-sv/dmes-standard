package com.dongkuk.oasis.model.event;

import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.flow.Flow;
import com.dongkuk.oasis.model.flow.nodes.FlowPicker;
import learning.Visitor;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

/**
 * @author Jeongjin Kim
 * @since 2021-02-01
 */
class DefaultEndEventTest {
    @SuppressWarnings("ConstantConditions")
    @Test
    void ConstructArgumentsCanNotBeNull() {
        Assertions.assertThatIllegalArgumentException().isThrownBy(() ->
                new DefaultEndEvent(null, null, new PropertyContainer()));
    }

    @Test
    void visit() {
        DefaultEndEvent event = new DefaultEndEvent("1", null, new PropertyContainer());

        FlowPicker picker = new Visitor.AFlowPicker();
        Flow pick = event.pick(picker, null);
        Assertions.assertThat(pick.targetElementId()).isNull();
    }
}