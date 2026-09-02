package com.dongkuk.oasis.model.flow.nodes;

import com.dongkuk.oasis.model.flow.SequentialFlow;

/**
 * Sequence Flow 한 개만 가질 수 있는 노드이다.
 *
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
public interface SequentialFlowNode extends FlowNode {
    /**
     * @return {@link SequentialFlow} 개체
     */
    SequentialFlow sequenceFlow();
}
