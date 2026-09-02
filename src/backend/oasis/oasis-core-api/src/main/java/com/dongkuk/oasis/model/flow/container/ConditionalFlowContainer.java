package com.dongkuk.oasis.model.flow.container;

import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.model.flow.UnidentifiableDefaultFlow;

import java.util.Collection;

/**
 * {@link ConditionalFlow} 와 {@link DefaultFlow} 를 묶어서 보관할 수 있는 컨테이너 클래스.
 * <p>
 * {@link SequentialFlow} 를 반환 요청한 경우 {@link UnsupportedOperationException} 이 발생한다.
 *
 * @author Jeongjin Kim
 * @since 2021-02-01
 */
public class ConditionalFlowContainer implements FlowContainer {
    private final Collection<ConditionalFlow> conditionalFlows;
    private final DefaultFlow defaultFlow;

    /**
     * FlowContainer 를 초기화 한다.
     *
     * @param conditionalFlows {@link ConditionalFlow} 컬렉션 객체
     * @param defaultFlow      {@link DefaultFlow} 객체
     */
    public ConditionalFlowContainer(Collection<ConditionalFlow> conditionalFlows, DefaultFlow defaultFlow) {
        if (conditionalFlows == null ||
                defaultFlow == null)
            throw new IllegalArgumentException();

        this.conditionalFlows = conditionalFlows;
        this.defaultFlow = defaultFlow;
    }

    /**
     * 기본 흐름이 존재하지 않는 {@link FlowContainer} 를 초기화 한다.
     *
     * @param conditionalFlows {@link ConditionalFlow} 컬렉션 객체
     */
    public ConditionalFlowContainer(Collection<ConditionalFlow> conditionalFlows) {
        if (conditionalFlows == null)
            throw new IllegalArgumentException();

        this.conditionalFlows = conditionalFlows;

        this.defaultFlow = new UnidentifiableDefaultFlow();
    }

    @Override
    public Collection<ConditionalFlow> conditionalFlows() {
        return conditionalFlows;
    }

    @Override
    public DefaultFlow defaultFlow() {
        return defaultFlow;
    }
}
