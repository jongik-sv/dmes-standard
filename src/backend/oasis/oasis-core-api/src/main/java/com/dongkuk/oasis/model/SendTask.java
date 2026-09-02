package com.dongkuk.oasis.model;

import com.dongkuk.oasis.model.flow.nodes.ComplexFlowNode;
import com.dongkuk.oasis.model.flow.nodes.FlowNodeElement;

/**
 * 메시지를 전송하는 테스크.
 *
 * @author Jeongjin Kim
 * @since 2021-12-24
 */
public interface SendTask extends Task, ComplexFlowNode, FlowNodeElement {
}
