package com.dongkuk.oasis.unmarshal;

import com.dongkuk.oasis.model.flow.*;

import java.util.Collection;

/**
 * 요소를 생성하기 위해 사용할 흐름들을 임시 저장하기 위한 인터페이스.
 *
 * @author Jeongjin Kim
 * @since 2021-02-05
 */
public interface FlowStore {
    /**
     * @param flowNodeId 흐름 노드 식별자
     * @return 요소에 달려있는 {@link ConditionalFlow} 의 컬렉션을 반환, 없으면 빈 컬렉션 반환.
     */
    Collection<ConditionalFlow> conditionalFlows(String flowNodeId);

    /**
     * @param flowNodeId 흐름 노드 식별자
     * @return 요소에 달려있는 {@link DefaultFlow} 반환, 없으면 {@code null}을 반환.
     */
    DefaultFlow defaultFlow(String flowNodeId);

    /**
     * @param flowNodeId 흐름 노드 식별자
     * @return 요소에 달려있는 {@link SequentialFlow} 반환, 없으면 {@code null}을 반환.
     */
    SequentialFlow sequentialFlow(String flowNodeId);

    /**
     * @param flowNodeId 흐름 노드 식별자
     * @return 요소에 달려있는 {@link ParallelFlow}의 컬렉션을 반환, 없으면 빈 컬렉션 반환.
     */
    Collection<ParallelFlow> parallelFlows(String flowNodeId);

    /**
     * @param flowId   흐름 식별자
     * @param flowType 흐름 타입
     * @param <T>      흐름 타입
     * @return 흐름
     */
    <T extends Flow> T flow(String flowId, Class<T> flowType);

    /**
     * @param flowId 흐름 식별자
     * @param <T>    흐름 타입
     * @return 흐름
     */
    <T extends Flow> T flow(String flowId);
}
