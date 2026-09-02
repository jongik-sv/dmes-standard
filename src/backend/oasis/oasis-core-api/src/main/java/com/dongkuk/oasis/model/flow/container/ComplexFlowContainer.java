package com.dongkuk.oasis.model.flow.container;

import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.SequentialFlow;

import java.util.Collection;

/**
 * {@link ConditionalFlow} 와 {@link DefaultFlow}, {@link SequentialFlow} 를 묶어서 보관할 수 있는 컨테이너 클래스.
 * <p>
 * 한 번 {@link com.dongkuk.oasis.model.flow.Flow} 가 설정되면 다시 설정 할 수 없다.
 *
 * @author Jeongjin Kim
 * @since 2021-02-01
 */
public class ComplexFlowContainer implements FlowContainer {
    private Collection<ConditionalFlow> conditionalFlows;
    private DefaultFlow defaultFlow;
    private SequentialFlow sequentialFlow;

    /**
     * FlowContainer 를 초기화 한다.
     *
     * @param conditionalFlows {@link ConditionalFlow} 객체
     * @param defaultFlow      {@link DefaultFlow} 객체, 없으면 {@code null}을 반환
     */
    public ComplexFlowContainer(Collection<ConditionalFlow> conditionalFlows, DefaultFlow defaultFlow) {
        if (conditionalFlows == null ||
                defaultFlow == null)
            throw new IllegalArgumentException();

        this.conditionalFlows = conditionalFlows;
        this.defaultFlow = defaultFlow;
    }

    /**
     * FlowContainer 를 초기화 한다.
     *
     * @param sequentialFlow {@link SequentialFlow} 객체, 없으면 {@code null}을 반환
     */
    public ComplexFlowContainer(SequentialFlow sequentialFlow) {
        if (sequentialFlow == null)
            throw new IllegalArgumentException();

        this.sequentialFlow = sequentialFlow;
    }

    /**
     * FlowContainer 를 초기화 한다.
     *
     * @param conditionalFlows {@link ConditionalFlow} 객체, 없으면 {@code null}을 반환
     */
    public ComplexFlowContainer(Collection<ConditionalFlow> conditionalFlows) {
        if (conditionalFlows == null)
            throw new IllegalArgumentException();

        this.conditionalFlows = conditionalFlows;
    }

    @Override
    public Collection<ConditionalFlow> conditionalFlows() {
        return conditionalFlows;
    }

    @Override
    public DefaultFlow defaultFlow() {
        return defaultFlow;
    }

    @Override
    public SequentialFlow sequenceFlow() {
        return sequentialFlow;
    }
}
