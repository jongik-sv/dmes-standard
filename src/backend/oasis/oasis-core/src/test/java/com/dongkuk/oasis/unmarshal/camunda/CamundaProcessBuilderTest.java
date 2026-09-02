package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.*;
import com.dongkuk.oasis.model.error.Error;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.Flow;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.model.flow.nodes.FlowPicker;
import com.dongkuk.oasis.unmarshal.*;
import org.jdom2.Element;
import org.junit.jupiter.api.Test;

import java.util.Collection;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-02-03
 */
class CamundaProcessBuilderTest {
    private final ServiceElementFromPath<Element> serviceParser
            = new CamundaClassPathJdom2ServiceElementFromPath();
    private final ProcessElementFromServiceElement<Element, Element> processExtractor
            = new CamundaJdom2ProcessElementFromServiceElement();

    @Test
    void processInitial() {
        MockFlowsStoreBuilder flowsBuilder = new MockFlowsStoreBuilder();
        MockTaskBuilder taskBuilder = new MockTaskBuilder();
        MockEventBuilder eventBuilder = new MockEventBuilder();
        MockGatewayBuilder gatewayBuilder = new MockGatewayBuilder();
        CallActivityBuilder<Element> callActivityBuilder = new CamundaCallActivityBuilder();
        SubProcessBuilder<Element> subProcessBuilder = new CamundaSubProcessBuilder(
                flowsBuilder, taskBuilder, eventBuilder, gatewayBuilder,
                callActivityBuilder);
        MockErrorStore mockErrorStore = new MockErrorStore();

        CamundaProcessBuilder processBuilder =
                new CamundaProcessBuilder(flowsBuilder,
                        taskBuilder,
                        eventBuilder,
                        gatewayBuilder,
                        subProcessBuilder,
                        callActivityBuilder);

        Element serviceElement =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaProcessBuilderTest/noDefaultProcess.bpmn");
        Element processElement = processExtractor.processElement(serviceElement);
        Process process = processBuilder.buildProcess(processElement, mockErrorStore);

        assertThat(process.getStartEvent().getId()).isEqualTo("StartEvent_1");
        assertThat(process.getId()).isEqualTo("Process_1ob4rra");
        assertThat(process.getElement("Activity_0g8lc6y")).isInstanceOf(Task.class);
        assertThat(process.getProperty("dao").getValue()).isEqualTo("hello");
    }

    @Test
    void inlineSubProcessInitial() {
        FlowsStoreBuilder<Element> flowsBuilder = new CamundaFlowsStoreBuilder();
        MockTaskBuilder taskBuilder = new MockTaskBuilder();
        MockEventBuilder eventBuilder = new MockEventBuilder();
        MockGatewayBuilder gatewayBuilder = new MockGatewayBuilder();
        CallActivityBuilder<Element> callActivityBuilder = new CamundaCallActivityBuilder();
        SubProcessBuilder<Element> subProcessBuilder = new CamundaSubProcessBuilder(
                flowsBuilder, taskBuilder, eventBuilder, gatewayBuilder,
                callActivityBuilder);
        MockErrorStore mockErrorStore = new MockErrorStore();

        CamundaProcessBuilder processBuilder =
                new CamundaProcessBuilder(flowsBuilder,
                        taskBuilder,
                        eventBuilder,
                        gatewayBuilder,
                        subProcessBuilder,
                        callActivityBuilder);

        Element serviceElement =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaProcessBuilderTest/inlineSubProcess.bpmn");
        Element processElement = processExtractor.processElement(serviceElement);
        Process process = processBuilder.buildProcess(processElement, mockErrorStore);

        assertThat(process.getStartEvent().getId()).isEqualTo("StartEvent_1");
        assertThat(process.getId()).isEqualTo("Process_1ob4rra");
        assertThat(process.getElement("Activity_1hl3vcj")).isInstanceOf(Process.class);
        com.dongkuk.oasis.model.Element element =
                ((Process) process.getElement("Activity_1hl3vcj")).getElement("Activity_14flxfw");
        assertThat(element).isInstanceOf(Task.class);
    }

    @Test
    void inlineSubProcessContainsCallActivityOnlyInitial() {
        FlowsStoreBuilder<Element> flowsBuilder = new CamundaFlowsStoreBuilder();
        MockTaskBuilder taskBuilder = new MockTaskBuilder();
        MockEventBuilder eventBuilder = new MockEventBuilder();
        MockGatewayBuilder gatewayBuilder = new MockGatewayBuilder();
        CallActivityBuilder<Element> callActivityBuilder = new CamundaCallActivityBuilder();
        SubProcessBuilder<Element> subProcessBuilder = new CamundaSubProcessBuilder(
                flowsBuilder, taskBuilder, eventBuilder, gatewayBuilder,
                callActivityBuilder);
        MockErrorStore mockErrorStore = new MockErrorStore();

        CamundaProcessBuilder processBuilder =
                new CamundaProcessBuilder(flowsBuilder,
                        taskBuilder,
                        eventBuilder,
                        gatewayBuilder,
                        subProcessBuilder,
                        callActivityBuilder);

        Element serviceElement =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaProcessBuilderTest/inlineSubProcessContainsCallActivityTask.bpmn");
        Element processElement = processExtractor.processElement(serviceElement);
        Process process = processBuilder.buildProcess(processElement, mockErrorStore);

        assertThat(process.getStartEvent().getId()).isEqualTo("StartEvent_1");
        assertThat(process.getId()).isEqualTo("Process_1ob4rra");
        assertThat(process.getElement("Activity_1hl3vcj")).isInstanceOf(Process.class);
        com.dongkuk.oasis.model.Element element =
                ((Process) process.getElement("Activity_1hl3vcj")).getElement("Activity_14flxfw");
        assertThat(element).isInstanceOf(Task.class);
    }

    @Test
    void offlineSubProcessInitial() {
        FlowsStoreBuilder<Element> flowsBuilder = new CamundaFlowsStoreBuilder();
        MockTaskBuilder taskBuilder = new MockTaskBuilder();
        MockEventBuilder eventBuilder = new MockEventBuilder();
        MockGatewayBuilder gatewayBuilder = new MockGatewayBuilder();
        CallActivityBuilder<Element> callActivityBuilder = new CamundaCallActivityBuilder();
        SubProcessBuilder<Element> subProcessBuilder = new CamundaSubProcessBuilder(
                flowsBuilder, taskBuilder, eventBuilder, gatewayBuilder,
                callActivityBuilder);
        MockErrorStore mockErrorStore = new MockErrorStore();

        CamundaProcessBuilder processBuilder =
                new CamundaProcessBuilder(flowsBuilder,
                        taskBuilder,
                        eventBuilder,
                        gatewayBuilder,
                        subProcessBuilder,
                        callActivityBuilder);

        Element serviceElement =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaProcessBuilderTest/offlineSubProcess.bpmn");
        Element processElement = processExtractor.processElement(serviceElement);
        Process process = processBuilder.buildProcess(processElement, mockErrorStore);

        assertThat(process.getStartEvent().getId()).isEqualTo("StartEvent_1");
        assertThat(process.getId()).isEqualTo("Process_1ob4rra");
        assertThat(process.getElement("Activity_1hl3vcj")).isInstanceOf(Process.class);
        com.dongkuk.oasis.model.Element element = ((Process) process.getElement("Activity_1hl3vcj")).getElement("Activity_14flxfw");
        assertThat(element).isInstanceOf(Task.class);
    }

    @Test
    void subProcessOfSubProcessInitial() {
        FlowsStoreBuilder<Element> flowsBuilder = new CamundaFlowsStoreBuilder();
        MockTaskBuilder taskBuilder = new MockTaskBuilder();
        MockEventBuilder eventBuilder = new MockEventBuilder();
        MockGatewayBuilder gatewayBuilder = new MockGatewayBuilder();
        CallActivityBuilder<Element> callActivityBuilder = new CamundaCallActivityBuilder();
        SubProcessBuilder<Element> subProcessBuilder = new CamundaSubProcessBuilder(
                flowsBuilder, taskBuilder, eventBuilder, gatewayBuilder,
                callActivityBuilder);
        MockErrorStore mockErrorStore = new MockErrorStore();

        CamundaProcessBuilder processBuilder =
                new CamundaProcessBuilder(flowsBuilder,
                        taskBuilder,
                        eventBuilder,
                        gatewayBuilder,
                        subProcessBuilder,
                        callActivityBuilder);

        Element serviceElement =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaProcessBuilderTest/subProcessOfSubProcess.bpmn");
        Element processElement = processExtractor.processElement(serviceElement);
        Process process = processBuilder.buildProcess(processElement, mockErrorStore);

        assertThat(process.getStartEvent().getId()).isEqualTo("StartEvent_1");
        assertThat(process.getId()).isEqualTo("Process_1ob4rra");
        assertThat(process.getElement("Activity_1hl3vcj")).isInstanceOf(Process.class);
        com.dongkuk.oasis.model.Element element = ((Process) process.getElement("Activity_1hl3vcj")).getElement("Activity_14flxfw");
        assertThat(element).isInstanceOf(Process.class);
        assertThat(((Process) element).getElement("Activity_0w5pd02")).isInstanceOf(Task.class);
    }

    @Test
    void subProcessCallTask() {
        FlowsStoreBuilder<Element> flowsBuilder = new CamundaFlowsStoreBuilder();
        MockTaskBuilder taskBuilder = new MockTaskBuilder();
        MockEventBuilder eventBuilder = new MockEventBuilder();
        MockGatewayBuilder gatewayBuilder = new MockGatewayBuilder();
        CallActivityBuilder<Element> callActivityBuilder = new CamundaCallActivityBuilder();
        SubProcessBuilder<Element> subProcessBuilder = new CamundaSubProcessBuilder(
                flowsBuilder, taskBuilder, eventBuilder, gatewayBuilder,
                callActivityBuilder);
        MockErrorStore mockErrorStore = new MockErrorStore();

        CamundaProcessBuilder processBuilder =
                new CamundaProcessBuilder(flowsBuilder,
                        taskBuilder,
                        eventBuilder,
                        gatewayBuilder,
                        subProcessBuilder,
                        callActivityBuilder);

        Element serviceElement =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaProcessBuilderTest/offlineSubProcessCallTask.bpmn");
        Element processElement = processExtractor.processElement(serviceElement);
        Process process = processBuilder.buildProcess(processElement, mockErrorStore);

        assertThat(process.getStartEvent().getId()).isEqualTo("StartEvent_1");
        assertThat(process.getId()).isEqualTo("Process_1ob4rra");
        com.dongkuk.oasis.model.Element processCallElement = process.getElement("Activity_1ttusxm");
        assertThat(processCallElement).isInstanceOf(Task.class);
    }

    static class MockErrorStore implements ErrorStore {
        @Override
        public Error error(String errorId) {
            return null;
        }
    }

    static class MockFlowsStoreBuilder implements FlowsStoreBuilder<Element> {
        @Override
        public FlowStore flows(Element processElement) {
            return null;
        }
    }

    static class MockTaskBuilder implements TaskBuilder<Element> {
        @Override
        public Task buildTask(Element taskElement, FlowStore flowStore) {
            return new Task() {
                @Override
                public InputOutputContainer inputs() {
                    return null;
                }

                @Override
                public InputOutputContainer outputs() {
                    return null;
                }

                @Override
                public <T> T output(String key) {
                    return null;
                }

                @Override
                public MultiInstanceType multiInstanceType() {
                    return MultiInstanceType.NONE;
                }

                @Override
                public String collectionName() {
                    return null;
                }

                @Override
                public String itemVariableName() {
                    return null;
                }

                @Override
                public <T> T input(String key) {
                    return null;
                }

                @Override
                public Property getProperty(String name) {
                    return null;
                }

                @Override
                public PropertyContainer properties() {
                    return null;
                }

                @Override
                public String getId() {
                    return taskElement.getAttributeValue("id");
                }

                @Override
                public String getName() {
                    return taskElement.getAttributeValue("name");
                }
            };
        }
    }

    static class MockEventBuilder implements EventBuilder<Element> {
        @Override
        public Event buildEvent(Element eventElement, FlowStore flows, ErrorStore errorStore) {
            if (eventElement.getName().equals("startEvent"))
                return new StartEvent() {
                    @Override
                    public SequentialFlow sequenceFlow() {
                        return null;
                    }

                    @Override
                    public Flow pick(FlowPicker picker, TypedObject typedObject) {
                        return null;
                    }

                    @Override
                    public String getId() {
                        return eventElement.getAttributeValue("id");
                    }

                    @Override
                    public String getName() {
                        return eventElement.getAttributeValue("name");
                    }

                    @Override
                    public Property getProperty(String name) {
                        return null;
                    }

                    @Override
                    public PropertyContainer properties() {
                        return null;
                    }

                };
            else if (eventElement.getName().equals("endEvent"))
                return new EndEvent() {
                    @Override
                    public Flow pick(FlowPicker picker, TypedObject typedObject) {
                        return null;
                    }

                    @Override
                    public String getId() {
                        return eventElement.getAttributeValue("id");
                    }

                    @Override
                    public String getName() {
                        return eventElement.getAttributeValue("name");
                    }

                    @Override
                    public Property getProperty(String name) {
                        return null;
                    }

                    @Override
                    public PropertyContainer properties() {
                        return null;
                    }
                };
            return null;
        }
    }

    static private class MockGatewayBuilder implements GatewayBuilder<Element> {
        @Override
        public Gateway buildGateway(Element gatewayElement, FlowStore flows) {
            return new ExclusiveGateway() {
                @Override
                public String getId() {
                    return null;
                }

                @Override
                public String getName() {
                    return null;
                }

                @Override
                public Property getProperty(String name) {
                    return null;
                }

                @Override
                public PropertyContainer properties() {
                    return null;
                }

                @Override
                public Collection<ConditionalFlow> conditionalFlows() {
                    return null;
                }

                @Override
                public DefaultFlow defaultFlow() {
                    return null;
                }

                @Override
                public Flow pick(FlowPicker picker, TypedObject typedObject) {
                    return null;
                }
            };
        }
    }
}