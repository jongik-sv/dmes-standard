package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.Gateway;
import com.dongkuk.oasis.unmarshal.FlowStore;
import com.dongkuk.oasis.unmarshal.GatewayBuilder;
import org.jdom2.Element;

/**
 * @author Jeongjin Kim
 * @since 2021-02-03
 */
final class CamundaGatewayBuilder implements GatewayBuilder<Element> {
    private final GatewayBuilder<Element> exclusiveGatewayBuilder = new CamundaExclusiveGatewayBuilder();
    private final GatewayBuilder<Element> parallelGatewayBuilder = new CamundaParallelGatewayBuilder();

    @Override
    public Gateway buildGateway(Element gatewayElement, FlowStore flowStore) {
        if (gatewayElement.getName().equals("exclusiveGateway")) {
            return exclusiveGatewayBuilder.buildGateway(gatewayElement, flowStore);
        } else if (gatewayElement.getName().equals("parallelGateway")) {
            return parallelGatewayBuilder.buildGateway(gatewayElement, flowStore);
        } else {
            throw new IllegalArgumentException("Not a gateway level element.");
        }
    }
}
