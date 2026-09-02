package com.dongkuk.oasis.model;

import com.dongkuk.oasis.model.flow.nodes.ConditionalFlowNode;
import com.dongkuk.oasis.model.flow.nodes.FlowNodeElement;

/**
 * 조건에 맞는 Flow 으로 분기하기 위한 요소.
 * <p>
 * 조건 Flow 와 Default Flow 만 가질 수 있다.
 *
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
public interface ExclusiveGateway extends Gateway, ConditionalFlowNode, FlowNodeElement {
}
