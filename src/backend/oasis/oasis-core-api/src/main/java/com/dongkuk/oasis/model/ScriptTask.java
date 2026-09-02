package com.dongkuk.oasis.model;

import com.dongkuk.oasis.model.flow.nodes.ComplexFlowNode;
import com.dongkuk.oasis.model.flow.nodes.FlowNodeElement;

/**
 * 속성에 정의된 스크립으를 실행하는 태스크.
 *
 * @author Jeongjin Kim
 * @since 2021-06-09
 */
public interface ScriptTask extends Task, ComplexFlowNode, FlowNodeElement {
}
