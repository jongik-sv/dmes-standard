package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.Flow;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.model.flow.nodes.TooManyDefaultFlowException;
import com.dongkuk.oasis.model.flow.nodes.TooManySequentialFlowException;
import com.dongkuk.oasis.unmarshal.FlowStore;
import com.dongkuk.oasis.unmarshal.ProcessElementFromServiceElement;
import com.dongkuk.oasis.unmarshal.ServiceElementFromPath;
import org.jdom2.Element;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/**
 * @author Jeongjin Kim
 * @since 2021-02-03
 */
@SuppressWarnings("SpellCheckingInspection")
class CamundaFlowsStoreBuilderTest {
    private final ServiceElementFromPath<Element> serviceParser =
            new CamundaClassPathJdom2ServiceElementFromPath();
    private final ProcessElementFromServiceElement<Element, Element> processExtractor =
            new CamundaJdom2ProcessElementFromServiceElement();
    private final CamundaFlowsStoreBuilder flowBuilder =
            new CamundaFlowsStoreBuilder();
    private FlowStore flows;

    void initVariousFlows() {
        Element service =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaFlowsBuilderTest/variousFlows.bpmn");
        Element process = processExtractor.processElement(service);
        flows = flowBuilder.flows(process);
    }

    @Test
    @DisplayName("요소에 순서 흐름이 두 개 있을 때 예외 발생")
    void givenDualSequentialFlowThenThrowsException() {
        Element serviceElement =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaFlowsBuilderTest/daulSequentialFlow.bpmn");
        Element element = processExtractor.processElement(serviceElement);

        assertThatExceptionOfType(TooManySequentialFlowException.class)
                .isThrownBy(() -> flowBuilder.flows(element));
    }

    @Test
    @DisplayName("요소에 기본 흐름이 두 개 있을 때 예외 발생")
    void givenDualDefaultFlowThenThrowsException() {
        Element serviceElement =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaFlowsBuilderTest/daulDefaultFlow.bpmn");
        Element element = processExtractor.processElement(serviceElement);

        assertThatExceptionOfType(TooManyDefaultFlowException.class)
                .isThrownBy(() -> flowBuilder.flows(element));
    }

    @Test
    @DisplayName("시작 이벤트에 순서 흐름이 두 개 있을 때 예외 발생")
    void givenDualSequentialFlowOnStartEventThenThrowsException() {
        Element serviceElement = serviceParser.serviceElement(
                "/unmarshal/camunda/CamundaFlowsBuilderTest/daulDualSequentialFlowOnStartEvent.bpmn");
        Element element = processExtractor.processElement(serviceElement);

        assertThatExceptionOfType(TooManySequentialFlowException.class)
                .isThrownBy(() -> flowBuilder.flows(element));
    }

    @Test
    @DisplayName("배타적 게이트웨이에 조건 흐름이 없을 때 예외 발생")
    void givenExclusiveGatewayWithNoConditionFlowThenThrowsException() {
        Element serviceElement =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaFlowsBuilderTest/gatewayWithNoCondition.bpmn");
        Element element = processExtractor.processElement(serviceElement);

        assertThatExceptionOfType(TooManySequentialFlowException.class)
                .isThrownBy(() -> flowBuilder.flows(element));
    }

    @Test
    void givenSequentialFlowAskedThenReturnSequentialFlow() {
        initVariousFlows();
        Flow flow = flows.flow("Flow_17s4468");
        assertThat(flow).isInstanceOf(SequentialFlow.class);
        assertThat(flow.getProperty("type").getValue()).isEqualTo("hello");
    }

    @Test
    void givenConditionalFlowAskedThenReturnConditionalFlow1() {
        initVariousFlows();
        Flow flow = flows.flow("Flow_1h4n0yo");
        assertThat(flow).isInstanceOf(ConditionalFlow.class);
    }

    @Test
    void givenConditionalFlowAskedThenReturnConditionalFlow2() {
        initVariousFlows();
        Flow flow = flows.flow("Flow_0d6nicc");
        assertThat(flow).isInstanceOf(ConditionalFlow.class);
    }

    @Test
    void givenDefaultFlowAskedThenReturnDefaultFlow() {
        initVariousFlows();
        Flow flow = flows.flow("Flow_1ebubbi");
        assertThat(flow).isInstanceOf(DefaultFlow.class);
    }

    @Test
    void givenSimpleSequential() {
        Element service =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaFlowsBuilderTest/simple.bpmn");
        Element process = processExtractor.processElement(service);
        FlowStore flows = flowBuilder.flows(process);

        Flow flow = flows.flow("Flow_17s4468");
        assertThat(flow).isInstanceOf(SequentialFlow.class);
    }

    @Test
    void givenSimpleDefaultSequential() {
        Element service =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaFlowsBuilderTest/defaultFlow.bpmn");
        Element process = processExtractor.processElement(service);
        FlowStore flows = flowBuilder.flows(process);

        Flow flow = flows.flow("Flow_0ccuqb6");
        assertThat(flow).isInstanceOf(DefaultFlow.class);
    }

    @Test
    void givenFlowNameAndNoExpressionThenNameAsCondition() {
        Element service =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaFlowsBuilderTest/nameAsCondition.bpmn");
        Element process = processExtractor.processElement(service);
        FlowStore flows = flowBuilder.flows(process);

        Flow flow = flows.flow("Flow_1jme54z");
        assertThat(flow).isInstanceOf(ConditionalFlow.class);

        Flow flow2 = flows.flow("Flow_1cgo2vi");
        assertThat(flow2).isInstanceOf(DefaultFlow.class);
    }

    @Test
    void givenFlowNameAndNoExpressionOfSequantialFlowThenNameIsJustName() {
        // flow 가 하나인데 컨디션을 사용해서 진행을 막는 프로세스가 있을 수 있으므로
        // 일단 조건으로 본다. 차후에 단일 흐름인데 이름을 적는 경우가 단일 흐름에 조건을 쓰는 경우가 더 많으면
        // 이름을 Sequantial flow로 보는 것으로 변경한다.
        Element service =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaFlowsBuilderTest/nameAsSequantial.bpmn");
        Element process = processExtractor.processElement(service);
        FlowStore flows = flowBuilder.flows(process);

        Flow flow = flows.flow("Flow_17s4468");
        assertThat(flow).isInstanceOf(ConditionalFlow.class);
    }
}