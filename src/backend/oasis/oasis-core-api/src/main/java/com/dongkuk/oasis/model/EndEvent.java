package com.dongkuk.oasis.model;

import com.dongkuk.oasis.model.flow.nodes.FlowNodeElement;
import com.dongkuk.oasis.model.flow.nodes.NonFlowNode;

/**
 * 프로세스의 종료를 알리는 이벤트이다. 이벤트를 소비하는 역할을 한다.
 * <p>
 * 밖으로 나가는 흐름을 가질 수 없다.
 *
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
public interface EndEvent extends Event, NonFlowNode, FlowNodeElement {
}
