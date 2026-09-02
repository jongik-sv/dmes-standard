package com.dongkuk.oasis.model;

import com.dongkuk.oasis.model.flow.nodes.ComplexFlowNode;
import com.dongkuk.oasis.model.flow.nodes.FlowNodeElement;

/**
 * 바운더리 이벤트 요소를 대표하는 인터페이스.
 *
 * @author Jeongjin Kim
 * @since 2022-09-24
 */
public interface BoundaryEvent extends Event, ComplexFlowNode, FlowNodeElement {
    /**
     * 바운더리 이벤트가 붙어있는 요소 ID를 반환한다.
     *
     * @return 요소ID
     */
    String getAttachedToRef();
}
