package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.Task;
import com.dongkuk.oasis.model.activity.SubServiceCallTask;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.unmarshal.*;
import org.jdom2.Element;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static com.dongkuk.oasis.model.PropertyNames.INPUT_KEY;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-06-29
 */
class CamundaCallActivityBuilderTest {
    private final ServiceElementFromPath<Element> serviceParser =
            new CamundaClassPathJdom2ServiceElementFromPath();
    private final ProcessElementFromServiceElement<Element, Element> processExtractor =
            new CamundaJdom2ProcessElementFromServiceElement();
    private final CallActivityElementFromProcessElement<Element, Element> callActivityExtractor =
            new CamundaJdom2CallActivityElementFromProcessElement();

    @Test
    void callJustService() {
        CamundaCallActivityBuilder builder = new CamundaCallActivityBuilder();

        Element serviceElement =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaCallActivityBuilderTest/justCallService.bpmn");
        Element element = processExtractor.processElement(serviceElement);
        Set<Element> callActivityElements = callActivityExtractor.callActivityElement(element);

        FlowStore flowStore = mock(FlowStore.class);
        given(flowStore.sequentialFlow(any())).willReturn(mock(SequentialFlow.class));
        List<Task> tasks = new ArrayList<>();
        for (Element callActivityElement : callActivityElements) {
            tasks.add(builder.buildTask(callActivityElement, flowStore));
        }

        assertThat(tasks).hasSize(1);
        SubServiceCallTask task = (SubServiceCallTask) tasks.get(0);
        assertThat(task).isNotNull();
        SequentialFlow sequentialFlow = task.sequenceFlow();
        assertThat(sequentialFlow).isEqualTo(flowStore.sequentialFlow("Flow_0ljyus5"));
        assertThat(task.getId()).isEqualTo("recordOrder");
        assertThat(task.serviceId()).isEqualTo("subService");
        assertThat(task.getProperty(INPUT_KEY)).isNull();
    }

    @Test
    void callServicePassingParam() {
        CamundaCallActivityBuilder builder = new CamundaCallActivityBuilder();

        Element serviceElement =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaCallActivityBuilderTest/justCallServicePassingParam.bpmn");
        Element element = processExtractor.processElement(serviceElement);
        Set<Element> callActivityElements = callActivityExtractor.callActivityElement(element);

        FlowStore flowStore = mock(FlowStore.class);
        given(flowStore.sequentialFlow(any())).willReturn(mock(SequentialFlow.class));
        List<Task> tasks = new ArrayList<>();
        for (Element callActivityElement : callActivityElements) {
            tasks.add(builder.buildTask(callActivityElement, flowStore));
        }

        assertThat(tasks).hasSize(1);
        SubServiceCallTask task = (SubServiceCallTask) tasks.get(0);
        assertThat(task).isNotNull();
        SequentialFlow sequentialFlow = task.sequenceFlow();
        assertThat(sequentialFlow).isEqualTo(flowStore.sequentialFlow("Flow_0ljyus5"));
        assertThat(task.getId()).isEqualTo("recordOrder");
        assertThat(task.serviceId()).isEqualTo("subService");
        assertThat(task.getProperty(INPUT_KEY).getValue()).isEqualTo("wow");
    }
}