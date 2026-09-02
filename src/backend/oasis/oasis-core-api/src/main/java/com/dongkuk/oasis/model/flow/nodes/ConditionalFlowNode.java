package com.dongkuk.oasis.model.flow.nodes;

import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;

import java.util.Collection;

/**
 * ConditionalFlow 와 DefaultFlow 초기화를 해야하는 노드.
 * <p>
 * Default Flow 는 한개만 올 수 있다.
 *
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
public interface ConditionalFlowNode extends FlowNode {
    /**
     * @return {@link ConditionalFlow} 개체 컬렉션, 없으면 {@code null} 반환
     */
    Collection<ConditionalFlow> conditionalFlows();

    /**
     * @return {@link DefaultFlow} 개체, 없으면 {@code null} 반환
     */
    DefaultFlow defaultFlow();
}
