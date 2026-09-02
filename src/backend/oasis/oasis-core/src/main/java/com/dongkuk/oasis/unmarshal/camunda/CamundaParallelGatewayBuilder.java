package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.Gateway;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.ParallelFlow;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.model.flow.nodes.IllegalFlowException;
import com.dongkuk.oasis.model.gateway.DefaultParallelGateway;
import com.dongkuk.oasis.unmarshal.FlowStore;
import com.dongkuk.oasis.unmarshal.GatewayBuilder;
import org.jdom2.Element;

import java.util.Collection;

/**
 * @author Jeongjin Kim
 * @since 2021-02-03
 */
final class CamundaParallelGatewayBuilder implements GatewayBuilder<Element> {
    @Override
    public Gateway buildGateway(Element gatewayElement, FlowStore flowStore) {
        if (!(gatewayElement.getName().lastIndexOf("parallelGateway") > -1))
            throw new IllegalArgumentException("Not a parallel gateway level element");

        PropertyContainer properties = CamundaElementUtil.extractProperties(gatewayElement);

        String id = CamundaAttributeExtractor.id(gatewayElement);
        String name = CamundaAttributeExtractor.name(gatewayElement);

        Collection<ConditionalFlow> conditionalFlows = flowStore.conditionalFlows(id);
        DefaultFlow defaultFlow = flowStore.defaultFlow(id);
        SequentialFlow sequentialFlow = flowStore.sequentialFlow(id);
        Collection<ParallelFlow> parallelFlows = flowStore.parallelFlows(id);

        if (conditionalFlows.size() > 0 || defaultFlow != null)
            throw new IllegalFlowException("Parallel gateways cannot have conditional flows or a default flow.");
        if (parallelFlows.size() == 1)
            throw new IllegalFlowException("Flow configuration is incorrect. " +
                    "Parallel flow must have two or more flows.");
        if (parallelFlows.size() > 0 && sequentialFlow != null)
            throw new IllegalFlowException("Flow configuration is incorrect. " +
                    "Parallel and sequential flows cannot be set simultaneously.");

        return new DefaultParallelGateway(
                id,
                name,
                parallelFlows,
                sequentialFlow,
                properties
        );
    }
}
