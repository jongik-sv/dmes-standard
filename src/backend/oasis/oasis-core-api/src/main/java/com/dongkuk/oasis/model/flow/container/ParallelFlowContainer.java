package com.dongkuk.oasis.model.flow.container;

import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.ParallelFlow;
import com.dongkuk.oasis.model.flow.SequentialFlow;

import java.util.Collection;

/**
 * 복수개 {@link ParallelFlow} 를 보관할 수 있는 컨테이너 클래스.
 * <p>
 * {@link ConditionalFlow} 또는 {@link DefaultFlow} 를 반환 요청한 경우 {@link UnsupportedOperationException} 이 발생한다.
 *
 * @author Jeongjin Kim
 * @since 2021-02-01
 */
public class ParallelFlowContainer implements FlowContainer {
    private final Collection<ParallelFlow> parallelFlows;
    private final SequentialFlow sequentialFlow;

    /**
     * FlowContainer 를 초기화.
     *
     * @param parallelFlows  {@link ParallelFlow}
     * @param sequentialFlow {@link SequentialFlow}
     */
    public ParallelFlowContainer(Collection<ParallelFlow> parallelFlows, SequentialFlow sequentialFlow) {
        if (parallelFlows.size() == 0 && sequentialFlow == null)
            throw new IllegalArgumentException(
                    "Either parallel flow or sequential flow must be configured. Both are empty values.");

        if (parallelFlows.size() > 0 && sequentialFlow != null)
            throw new IllegalArgumentException("Only one of parallel flow or sequential flow can be used.");

        if (parallelFlows.size() == 1)
            throw new IllegalArgumentException("Parallel flow requires two or more flows.");

        this.parallelFlows = parallelFlows;
        this.sequentialFlow = sequentialFlow;
    }

    @Override
    public Collection<ParallelFlow> parallelFlow() {
        return parallelFlows;
    }

    @Override
    public SequentialFlow sequenceFlow() {
        return sequentialFlow;
    }
}
