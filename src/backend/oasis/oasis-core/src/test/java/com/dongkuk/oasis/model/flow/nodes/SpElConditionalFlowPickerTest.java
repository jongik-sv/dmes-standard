package com.dongkuk.oasis.model.flow.nodes;

import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.Flow;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static com.dongkuk.oasis.model.flow.nodes.FakeFlowFactory.conditionalFlow;
import static com.dongkuk.oasis.model.flow.nodes.FakeFlowFactory.defaultFlow;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/**
 * @author Jeongjin Kim
 * @since 2021-04-05
 */
class SpElConditionalFlowPickerTest {
    FlowPicker picker = new SpElConditionalFlowPicker();

    @Test
    void conditionalNodePick() {
        List<ConditionalFlow> flows = Arrays.asList(
                conditionalFlow("1==1"),
                conditionalFlow("1==2")
        );

        ConditionalFlowNode conditionalFlowNode = new ConditionalFlowNodeStub(flows, null);

        Flow pick = conditionalFlowNode.pick(picker, null);
        assertThat(pick).isEqualTo(flows.get(0));
    }

    @Test
    void givenNoSuitableFlowThenNull() {
        List<ConditionalFlow> flows = Arrays.asList(
                conditionalFlow("1==2"),
                conditionalFlow("1==2")
        );

        DefaultFlow defaultFlow = defaultFlow();
        ConditionalFlowNode conditionalFlowNode = new ConditionalFlowNodeStub(flows, defaultFlow);

        Flow pick = conditionalFlowNode.pick(picker, null);
        assertThat(pick).isNull();
    }

    @Test
    void givenMultiplePassedFlowThenThrowException() {
        List<ConditionalFlow> flows = Arrays.asList(
                conditionalFlow("1==1"),
                conditionalFlow("1==1")
        );

        ConditionalFlowNode conditionalFlowNode = new ConditionalFlowNodeStub(flows, null);

        assertThatExceptionOfType(IllegalFlowException.class).isThrownBy(() ->
                conditionalFlowNode.pick(picker, null)
        ).withMessage("Too many flows picked.");
    }

    @Test
    void givenContextUseContextForEvaluate() {
        List<ConditionalFlow> flows = Arrays.asList(
                conditionalFlow("1==1"),
                conditionalFlow("1==2")
        );

        ConditionalFlowNode conditionalFlowNode = new ConditionalFlowNodeStub(flows, null);

        Flow pick = conditionalFlowNode.pick(picker, null);
        assertThat(pick).isEqualTo(flows.get(0));
    }
}