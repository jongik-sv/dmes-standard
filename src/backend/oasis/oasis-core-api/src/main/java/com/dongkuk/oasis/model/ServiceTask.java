package com.dongkuk.oasis.model;

import com.dongkuk.oasis.model.flow.nodes.ComplexFlowNode;
import com.dongkuk.oasis.model.flow.nodes.FlowNodeElement;

/**
 * 외부에 정의된 서비스를 호출할 수 있는 태스크.
 *
 * @author Jeongjin Kim
 * @since 2021-01-30
 */
public interface ServiceTask extends Task, ComplexFlowNode, FlowNodeElement {
}
