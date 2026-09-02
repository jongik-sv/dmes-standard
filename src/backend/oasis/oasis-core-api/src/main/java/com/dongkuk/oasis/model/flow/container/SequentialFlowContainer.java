package com.dongkuk.oasis.model.flow.container;

import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.SequentialFlow;

/**
 * {@link SequentialFlow} 를 보관할 수 있는 컨테이너 클래스.
 * <p>
 * {@link ConditionalFlow} 또는 {@link DefaultFlow} 를 반환 요청한 경우 {@link UnsupportedOperationException} 이 발생한다.
 *
 * @author Jeongjin Kim
 * @since 2021-02-01
 */
public class SequentialFlowContainer implements FlowContainer {
    private final SequentialFlow sequentialFlow;

    /**
     * FlowContainer 를 초기화.
     *
     * @param sequentialFlow {@link SequentialFlow}
     */
    public SequentialFlowContainer(SequentialFlow sequentialFlow) {
        if (sequentialFlow == null)
            throw new IllegalArgumentException();

        this.sequentialFlow = sequentialFlow;
    }

    @Override
    public SequentialFlow sequenceFlow() {
        return sequentialFlow;
    }
}
