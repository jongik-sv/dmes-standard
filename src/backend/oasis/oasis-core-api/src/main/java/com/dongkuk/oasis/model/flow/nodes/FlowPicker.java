package com.dongkuk.oasis.model.flow.nodes;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.model.flow.DefaultTerminalFlow;
import com.dongkuk.oasis.model.flow.Flow;
import com.dongkuk.oasis.model.flow.TerminalFlow;

/**
 * {@link FlowNode} 에 존재하는 {@link Flow} 중에서 다음 {@link FlowNode} 를 선택하기 위한 인터페이스.
 * <p>
 * Visitor 패턴의 Element 역할을 한다.
 * <p>
 * 적합한 {@link Flow}를 선택할 수 있으면 {@code null}을 반환한다. 하지만 선택된 {@link Flow}가
 * 2개 이상인 경우는 {@link IllegalFlowException}가 발생한다.
 *
 * @author Jeongjin Kim
 * @since 2021-02-05
 */
public interface FlowPicker {
    /**
     * @param node   {@link ComplexFlowNode}
     * @param object Context
     * @return {@link Flow}, nullable
     * @throws IllegalFlowException if more than one {@link Flow} selected
     */
    Flow pick(ComplexFlowNode node, TypedObject object);

    /**
     * @param node   {@link SequentialFlowNode}
     * @param object Context
     * @return {@link Flow}, nullable
     * @throws IllegalFlowException if more than one {@link Flow} selected
     */
    default Flow pick(SequentialFlowNode node, TypedObject object) {
        return node.sequenceFlow();
    }

    /**
     * @param node   {@link ConditionalFlowNode}
     * @param object Context
     * @return {@link Flow}, nullable
     * @throws IllegalFlowException if more than one {@link Flow} selected
     */
    Flow pick(ConditionalFlowNode node, TypedObject object);

    /**
     * 더이상 진행할 곳이 없는 흐름임을 알림.
     *
     * @param node   {@link NonFlowNode}
     * @param object Context
     * @return {@link TerminalFlow}, nullable
     * @throws IllegalFlowException if more than one {@link Flow} selected
     */
    default TerminalFlow pick(NonFlowNode node, TypedObject object) {
        return new DefaultTerminalFlow();
    }
}
