package com.dongkuk.oasis.model.flow.nodes;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.Flow;

/**
 * {@link DefaultFlow} 를 반환한다.
 *
 * @author Jeongjin Kim
 * @since 2021-04-09
 */
public class DefaultFlowPicker implements FlowPicker {
    @Override
    public Flow pick(ComplexFlowNode node, TypedObject typedObject) {
        return node.defaultFlow();
    }

    @Override
    public Flow pick(ConditionalFlowNode node, TypedObject typedObject) {
        return node.defaultFlow();
    }
}
