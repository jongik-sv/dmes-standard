package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.ExclusiveGateway;
import com.dongkuk.oasis.model.Gateway;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.model.flow.nodes.IllegalFlowException;
import com.dongkuk.oasis.model.gateway.DefaultExclusiveGateway;
import com.dongkuk.oasis.unmarshal.FlowStore;
import com.dongkuk.oasis.unmarshal.GatewayBuilder;
import org.jdom2.Element;

import java.util.Collection;

/**
 * @author Jeongjin Kim
 * @since 2021-02-03
 */
final class CamundaExclusiveGatewayBuilder implements GatewayBuilder<Element> {
    @Override
    public Gateway buildGateway(Element gatewayElement, FlowStore flowStore) {
        if (!(gatewayElement.getName().lastIndexOf("exclusiveGateway") > -1))
            throw new IllegalArgumentException("Not an exclusive gateway level element.");

        PropertyContainer properties = CamundaElementUtil.extractProperties(gatewayElement);

        String id = CamundaAttributeExtractor.id(gatewayElement);
        String name = CamundaAttributeExtractor.name(gatewayElement);

        Collection<ConditionalFlow> conditionalFlows = flowStore.conditionalFlows(id);
        DefaultFlow defaultFlow = flowStore.defaultFlow(id);
        SequentialFlow sequentialFlow = flowStore.sequentialFlow(id);

        if (sequentialFlow != null)
            throw new IllegalStateException("An exclusive gateway cannot have sequence flow without conditions. " +
                    "Please input flow conditions.");

        ExclusiveGateway exclusiveGateway;

        if (conditionalFlows.size() > 0 && defaultFlow != null) {
            exclusiveGateway =
                    new DefaultExclusiveGateway(id,
                            name,
                            conditionalFlows,
                            defaultFlow,
                            properties);
        } else if (conditionalFlows.size() > 0) {
            exclusiveGateway =
                    new DefaultExclusiveGateway(id,
                            name,
                            conditionalFlows,
                            properties);
        } else {
            throw new IllegalFlowException("Flow configuration is incorrect. " +
                    "There must be at least one conditional flow, and the default flow is optional.");
        }

        return exclusiveGateway;
    }
}
