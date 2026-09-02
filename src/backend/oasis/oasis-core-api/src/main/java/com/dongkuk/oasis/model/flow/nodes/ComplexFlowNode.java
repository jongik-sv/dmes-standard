package com.dongkuk.oasis.model.flow.nodes;

/**
 * 모든 종류의 Flow 를 초기화 해야하는 노드.
 * <p>
 * SequenceFlow 와 DefaultFlow 둘 중 하나만 존재해야한다.
 * SequenceFlow 와 DefaultFlow 는 한개씩만 존재야한다.
 * SequenceFlow 가 존재하면 그 Flow 가 유일해야한다. 즉, SequenceFlow 는 단독으로만 사용할 수 있다.
 *
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
public interface ComplexFlowNode extends ConditionalFlowNode, SequentialFlowNode {
}
