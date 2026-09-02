package com.dongkuk.oasis.model.flow;

import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;

/**
 * 실제로는 존재하지 않은 {@link DefaultFlow} 임.
 * <p>
 * {@link com.dongkuk.oasis.model.flow.nodes.ConditionalFlowNode} 에서 조건에 맞는 흐름을 찾을 수 없을 때
 * {@link DefaultFlow} 를 선택하는데 별도로 {@link DefaultFlow} 를 정의하지 않으면
 * 이 클래스가 대신 들어간다.
 * <p>
 * 프레임워크에서 이 흐름을 선택하게되면 {@link IllegalConditionException}가 발생하므로 더 이상 프로세스를 진행할 수 없다.
 *
 * @author Jeongjin Kim
 * @since 2021-02-04
 */
public class UnidentifiableDefaultFlow implements DefaultFlow {
    @Override
    public String getId() {
        throw new IllegalConditionException("Cannot find the default flow");
    }

    @Override
    public String getName() {
        throw new IllegalConditionException("Cannot find the default flow");
    }

    @Override
    public Property getProperty(String name) {
        throw new UnsupportedOperationException();
    }

    @Override
    public PropertyContainer properties() {
        throw new UnsupportedOperationException();
    }

    @Override
    public String sourceElementId() {
        throw new IllegalConditionException("Cannot find the default flow");
    }

    @Override
    public String targetElementId() {
        throw new IllegalConditionException("Cannot find the default flow");
    }
}
