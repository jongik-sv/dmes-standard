package com.dongkuk.oasis.model.flow.nodes;

import com.dongkuk.oasis.model.flow.ParallelFlow;
import com.dongkuk.oasis.model.flow.SequentialFlow;

import java.util.Collection;

/**
 * Sequence Flow 를 한 개 이상 가질 수 있는 노드이다.
 *
 * @author Jeongjin Kim
 * @since 2021-07-23
 */
public interface ParallelFlowNode extends SequentialFlowNode {
    /**
     * @return {@link SequentialFlow} 컬렉션 개체
     */
    Collection<ParallelFlow> parallelFlow();
}
