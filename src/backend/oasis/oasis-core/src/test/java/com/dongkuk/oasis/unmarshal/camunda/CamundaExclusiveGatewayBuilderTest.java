package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.Gateway;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.unmarshal.FlowStore;
import com.dongkuk.oasis.unmarshal.GatewayElementFromProcessElement;
import com.dongkuk.oasis.unmarshal.ProcessElementFromServiceElement;
import com.dongkuk.oasis.unmarshal.ServiceElementFromPath;
import org.assertj.core.api.Assertions;
import org.jdom2.Element;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-02-09
 */
class CamundaExclusiveGatewayBuilderTest {
    private final ServiceElementFromPath<Element> serviceParser =
            new CamundaClassPathJdom2ServiceElementFromPath();
    private final ProcessElementFromServiceElement<Element, Element> processExtractor =
            new CamundaJdom2ProcessElementFromServiceElement();
    private final GatewayElementFromProcessElement<Element, Element> gatewayExtractor =
            new CamundaJdom2GatewayElementFromProcessElement();

    @Test
    void givenNormalBpmn() {
        CamundaExclusiveGatewayBuilder builder = new CamundaExclusiveGatewayBuilder();

        Element serviceElement =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaExclusiveGatewayBuilderTest/simple.bpmn");
        Element element = processExtractor.processElement(serviceElement);
        Set<Element> gatewayElements = gatewayExtractor.gatewayElement(element);

        FlowStore flowStore = mock(FlowStore.class);
        given(flowStore.conditionalFlows(any())).willReturn(Collections.singletonList(mock(ConditionalFlow.class)));
        List<Gateway> gateways = new ArrayList<>();
        for (Element gatewayElement : gatewayElements) {
            gateways.add(builder.buildGateway(gatewayElement, flowStore));
        }
        assertThat(gateways).hasSize(1);
        assertThat(gateways.get(0).getProperty("zzzzzz").getValue()).isEqualTo("ff");
    }

    @Test
    void givenDualGateway() {
        CamundaExclusiveGatewayBuilder builder = new CamundaExclusiveGatewayBuilder();

        Element serviceElement =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaExclusiveGatewayBuilderTest/double.bpmn");
        Element element = processExtractor.processElement(serviceElement);
        Set<Element> gatewayElements = gatewayExtractor.gatewayElement(element);

        FlowStore flowStore = mock(FlowStore.class);
        given(flowStore.conditionalFlows(any())).willReturn(Collections.singletonList(mock(ConditionalFlow.class)));
        List<Gateway> gateways = new ArrayList<>();
        for (Element gatewayElement : gatewayElements) {
            gateways.add(builder.buildGateway(gatewayElement, flowStore));
        }
        assertThat(gateways).hasSize(2);
    }

    @Test
    void givenSequentialFlowThenThrowException() {
        CamundaExclusiveGatewayBuilder builder = new CamundaExclusiveGatewayBuilder();

        Element serviceElement =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaExclusiveGatewayBuilderTest/simple.bpmn");
        Element element = processExtractor.processElement(serviceElement);
        Set<Element> gatewayElements = gatewayExtractor.gatewayElement(element);

        FlowStore flowStore = mock(FlowStore.class);
        given(flowStore.sequentialFlow(any())).willReturn(mock(SequentialFlow.class));

        for (Element gatewayElement : gatewayElements) {
            Assertions.assertThatIllegalStateException()
                    .isThrownBy(() -> builder.buildGateway(gatewayElement, flowStore));
        }
    }
}