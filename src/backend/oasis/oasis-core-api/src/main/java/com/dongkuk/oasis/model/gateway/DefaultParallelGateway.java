package com.dongkuk.oasis.model.gateway;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.model.ParallelGateway;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.flow.Flow;
import com.dongkuk.oasis.model.flow.ParallelFlow;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.model.flow.container.FlowContainer;
import com.dongkuk.oasis.model.flow.container.ParallelFlowContainer;
import com.dongkuk.oasis.model.flow.nodes.FlowPicker;

import java.util.Collection;

/**
 * Flow 에 연결된 모든 Flow 를 선택하는 게이트웨이.
 *
 * @author Jeongjin Kim
 * @since 2021-07-23
 */
public class DefaultParallelGateway implements ParallelGateway {
    private final String gatewayId;
    private final String gatewayName;
    private final FlowContainer flowContainer;
    private final PropertyContainer properties;

    /**
     * @param gatewayId      Gateway 식별자
     * @param gatewayName    Gateway 이름
     * @param parallelFlows  병렬 흐름
     * @param sequentialFlow 순서 흐름
     * @param properties     속성
     */
    public DefaultParallelGateway(String gatewayId,
                                  String gatewayName,
                                  Collection<ParallelFlow> parallelFlows,
                                  SequentialFlow sequentialFlow,
                                  PropertyContainer properties) {
        if (gatewayId == null ||
                properties == null ||
                parallelFlows == null)
            throw new IllegalArgumentException();

        this.gatewayId = gatewayId;
        this.gatewayName = gatewayName == null ? gatewayId : gatewayName;
        this.flowContainer = new ParallelFlowContainer(parallelFlows, sequentialFlow);
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
    public Collection<ParallelFlow> parallelFlow() {
        return flowContainer.parallelFlow();
    }

    @Override
    public SequentialFlow sequenceFlow() {
        return flowContainer.sequenceFlow();
    }
}
