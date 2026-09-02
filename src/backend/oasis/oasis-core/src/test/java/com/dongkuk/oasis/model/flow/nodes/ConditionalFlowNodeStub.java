package com.dongkuk.oasis.model.flow.nodes;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.Flow;

import java.util.Collection;

/**
 * @author Jeongjin Kim
 * @since 2021-04-06
 */
public class ConditionalFlowNodeStub implements ConditionalFlowNode {
    private final Collection<ConditionalFlow> conditionalFlows;
    private final DefaultFlow defaultFlow;

    public ConditionalFlowNodeStub(Collection<ConditionalFlow> conditionalFlows, DefaultFlow defaultFlow) {
        this.conditionalFlows = conditionalFlows;
        this.defaultFlow = defaultFlow;
    }

    @Override
    public Collection<ConditionalFlow> conditionalFlows() {
        return conditionalFlows;
    }

    @Override
    public DefaultFlow defaultFlow() {
        return defaultFlow;
    }

    @Override
    public Flow pick(FlowPicker picker, TypedObject typedObject) {
        return picker.pick(this, typedObject);
    }
}
