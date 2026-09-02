package com.dongkuk.oasis.model.gateway;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.model.ExclusiveGateway;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.Flow;
import com.dongkuk.oasis.model.flow.container.ConditionalFlowContainer;
import com.dongkuk.oasis.model.flow.container.FlowContainer;
import com.dongkuk.oasis.model.flow.nodes.FlowPicker;

import java.util.Collection;

/**
 * Flow 중 한 Flow 만 선택하는 요소 모델.
 * <p>
 * {@code input} 프로퍼티로 {@code context}에서 가져올 키값을 지정할 수 있다.
 * 이때 {@code context}에서 가져온 값은 {@link String} 타입이어야 한다.
 * <p>
 * {@code key} 프로퍼티를 지정하지 않으면 {@link com.dongkuk.oasis.context.ServiceContext}와
 * {@link com.dongkuk.oasis.context.ProcessContext}에 접근할 수 있는 {@link com.dongkuk.oasis.context.ContextAccessor}
 * 를 반환하여 브랜치 평가에 사용하도록 한다.
 *
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
public class DefaultExclusiveGateway implements ExclusiveGateway {
    private final String gatewayId;
    private final String gatewayName;
    private final FlowContainer flowContainer;
    private final PropertyContainer properties;

    /**
     * @param gatewayId        Gateway 식별자
     * @param gatewayName      Gateway 이름
     * @param conditionalFlows 조건 Flow
     * @param defaultFlow      기본 Flow
     * @param properties       속
     */
    public DefaultExclusiveGateway(String gatewayId,
                                   String gatewayName,
                                   Collection<ConditionalFlow> conditionalFlows,
                                   DefaultFlow defaultFlow,
                                   PropertyContainer properties) {
        if (gatewayId == null ||
                properties == null ||
                conditionalFlows == null)
            throw new IllegalArgumentException();

        this.gatewayId = gatewayId;
        this.gatewayName = gatewayName == null ? gatewayId : gatewayName;
        this.flowContainer = new ConditionalFlowContainer(conditionalFlows, defaultFlow);
        this.properties = properties;
    }

    /**
     * @param gatewayId        Gateway 식별자
     * @param gatewayName      Gateway 이름
     * @param conditionalFlows 조건 Flow
     * @param properties       속성
     */
    public DefaultExclusiveGateway(String gatewayId,
                                   String gatewayName,
                                   Collection<ConditionalFlow> conditionalFlows,
                                   PropertyContainer properties) {
        if (gatewayId == null ||
                properties == null ||
                conditionalFlows == null)
            throw new IllegalArgumentException();

        this.gatewayId = gatewayId;
        this.gatewayName = gatewayName == null ? gatewayId : gatewayName;
        this.flowContainer = new ConditionalFlowContainer(conditionalFlows);
        this.properties = properties;
    }

    @Override
    public String getId() {
        return gatewayId;
    }

    @Override
    public String getName() {
        return gatewayName;
    }

    @Override
    public Property getProperty(String name) {
        return properties.get(name);
    }

    @Override
    public PropertyContainer properties() {
        return properties;
    }

    @Override
    public Flow pick(FlowPicker picker, TypedObject typedObject) {
        return picker.pick(this, typedObject);
    }

    @Override
    public Collection<ConditionalFlow> conditionalFlows() {
        return flowContainer.conditionalFlows();
    }

    @Override
    public DefaultFlow defaultFlow() {
        return flowContainer.defaultFlow();
    }
}
