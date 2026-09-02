package com.dongkuk.oasis.model;

import com.dongkuk.oasis.model.flow.nodes.FlowNodeElement;
import com.dongkuk.oasis.model.flow.nodes.ParallelFlowNode;

/**
 * 분기, 조합 등을 하기 위한 흐름 제어 요소.
 *
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
public interface ParallelGateway extends Gateway, ParallelFlowNode, FlowNodeElement {
}
