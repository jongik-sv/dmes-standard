package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.Task;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.unmarshal.FlowStore;
import com.dongkuk.oasis.unmarshal.ProcessElementFromServiceElement;
import com.dongkuk.oasis.unmarshal.ServiceElementFromPath;
import com.dongkuk.oasis.unmarshal.TaskElementFromProcessElement;
import org.jdom2.Element;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-07-14
 */
class CamundaElementUtilTest {
    private final ServiceElementFromPath<Element> serviceParser =
            new CamundaClassPathJdom2ServiceElementFromPath();
    private final ProcessElementFromServiceElement<Element, Element> processExtractor =
            new CamundaJdom2ProcessElementFromServiceElement();
    private final TaskElementFromProcessElement<Element, Element> taskExtractor =
            new CamundaJdom2TaskElementFromProcessElement();

    @Test
    void buildShouldGetInputValueCollect() {
        CamundaTaskBuilder builder = new CamundaTaskBuilder();

        Element serviceElement = serviceParser.serviceElement("/unmarshal/camunda/CamundaElementUtilTest/input.bpmn");
        Element element = processExtractor.processElement(serviceElement);
        Set<Element> taskElements = taskExtractor.taskElement(element);

        FlowStore flowStore = mock(FlowStore.class);
        given(flowStore.sequentialFlow(any())).willReturn(mock(SequentialFlow.class));
        List<Task> tasks = new ArrayList<>();
        for (Element taskElement : taskElements) {
            tasks.add(builder.buildTask(taskElement, flowStore));
        }
        assertThat(tasks).hasSize(1);
        assertThat((Boolean) tasks.get(0).inputs().getValue("greeting")).isTrue();
    }

    @Test
    void taskInputOutputHasOrder() {
        CamundaTaskBuilder builder = new CamundaTaskBuilder();

        Element serviceElement = serviceParser.serviceElement("/unmarshal/camunda/CamundaElementUtilTest/input.bpmn");
        Element element = processExtractor.processElement(serviceElement);
        Set<Element> taskElements = taskExtractor.taskElement(element);

        FlowStore flowStore = mock(FlowStore.class);
        given(flowStore.sequentialFlow(any())).willReturn(mock(SequentialFlow.class));
        List<Task> tasks = new ArrayList<>();
        for (Element taskElement : taskElements) {
            tasks.add(builder.buildTask(taskElement, flowStore));
        }
        assertThat(tasks).hasSize(1);
        InputOutputContainer inputs = tasks.get(0).inputs();

        List<InputOutputContainer.InputOutputEntry> inputOutputEntries = inputs.exportInOrder();
        assertThat(inputOutputEntries.get(0).getKey()).isEqualTo("name");
        assertThat(inputOutputEntries.get(1).getKey()).isEqualTo("greeting");
    }
}