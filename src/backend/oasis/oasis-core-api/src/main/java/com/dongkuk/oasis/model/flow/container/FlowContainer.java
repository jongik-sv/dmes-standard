package com.dongkuk.oasis.model.flow.container;

import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.ParallelFlow;
import com.dongkuk.oasis.model.flow.SequentialFlow;

import java.util.Collection;

/**
 * {@link com.dongkuk.oasis.model.flow.Flow} 를 보관하는 역할을 한다.
 *
 * @author Jeongjin Kim
 * @since 2021-02-01
 */
public interface FlowContainer {
    /**
     * @return {@link ConditionalFlow} Collection
     */
    default Collection<ConditionalFlow> conditionalFlows() {
        throw new UnsupportedOperationException("Does not support ConditionalFlow");
    }

    /**
     * @return {@link DefaultFlow}
     */
    default DefaultFlow defaultFlow() {
        throw new UnsupportedOperationException("Does not support DefaultFlow");
    }

    /**
     * @return {@link SequentialFlow}
     */
    default SequentialFlow sequenceFlow() {
        throw new UnsupportedOperationException("Does not support SequentialFlow");
    }

    /**
     * @return Collection of {@link ParallelFlow}
     */
    default Collection<ParallelFlow> parallelFlow() {
        throw new UnsupportedOperationException("Does not support ParallelFlow");
    }
}
