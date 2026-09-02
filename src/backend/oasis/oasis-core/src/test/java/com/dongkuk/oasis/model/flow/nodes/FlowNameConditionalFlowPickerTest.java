package com.dongkuk.oasis.model.flow.nodes;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.execution.UnmodifiableExecutionResult;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.Flow;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static com.dongkuk.oasis.model.flow.nodes.FakeFlowFactory.conditionalFlow;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-04-09
 */
class FlowNameConditionalFlowPickerTest {
    FlowPicker picker = new FlowNameConditionalFlowPicker();

    @Test
    void conditionalNodePick() {
        List<ConditionalFlow> flows = Arrays.asList(
                conditionalFlow("bod"),
                conditionalFlow("new")
        );

        ConditionalFlowNode conditionalFlowNode = new ConditionalFlowNodeStub(flows, null);
        ExecutionResult executionResult = new UnmodifiableExecutionResult(new TypedObject("new"));

        Flow pick = conditionalFlowNode.pick(picker, executionResult.result());
        assertThat(pick).isEqualTo(flows.get(1));
    }
}