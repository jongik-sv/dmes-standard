package com.dongkuk.oasis.model;

import com.dongkuk.oasis.model.flow.nodes.FlowNodeElement;
import com.dongkuk.oasis.model.flow.nodes.SequentialFlowNode;

/**
 * 프로세스의 시작을 알리는 이벤트 요소이다. 이벤트를 소비하는 역할을 한다.
 * <p>
 * 프로세스 내에 한 개만 존재해야한다.
 * <p>
 * Sequence Flow 한 개만 가질 수 있다.
 *
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
public interface StartEvent extends Event, SequentialFlowNode, FlowNodeElement {
}
