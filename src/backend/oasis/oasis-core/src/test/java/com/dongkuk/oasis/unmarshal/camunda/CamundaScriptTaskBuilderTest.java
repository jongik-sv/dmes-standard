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
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.mockito.BDDMockito.given;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-02-04
 */
@SuppressWarnings("SpellCheckingInspection")
class CamundaScriptTaskBuilderTest {
    private final ServiceElementFromPath<Element> serviceParser =
            new CamundaClassPathJdom2ServiceElementFromPath();
    private final ProcessElementFromServiceElement<Element, Element> processExtractor =
            new CamundaJdom2ProcessElementFromServiceElement();
    private final TaskElementFromProcessElement<Element, Element> taskExtractor =
            new CamundaJdom2TaskElementFromProcessElement();

    @Test
    void givenScriptTaskWithoutScriptFormatThenThrowException() {
        CamundaScriptTaskBuilder builder = new CamundaScriptTaskBuilder();

        Element serviceElement = serviceParser.serviceElement("/unmarshal/camunda/CamundaScriptTaskBuilderTest/noFormatProperty.bpmn");
        Element element = processExtractor.processElement(serviceElement);
        Set<Element> taskElements = taskExtractor.taskElement(element);

        FlowStore flowStore = mock(FlowStore.class);
        given(flowStore.sequentialFlow(any())).willReturn(mock(SequentialFlow.class));
        for (Element taskElement : taskElements) {
            assertThatExceptionOfType(IllegalStateException.class).isThrownBy(() ->
                    builder.buildTask(taskElement, flowStore)
            ).withMessage("No script format property exists. Element id : Activity_1xmpbht");
        }
    }

    @Test
    void givenPlainTaskThenThrowException() {
        CamundaScriptTaskBuilder builder = new CamundaScriptTaskBuilder();

        Element serviceElement = serviceParser.serviceElement("/unmarshal/camunda/CamundaScriptTaskBuilderTest/plainTask.bpmn");
        Element element = processExtractor.processElement(serviceElement);
        Set<Element> taskElements = taskExtractor.taskElement(element);

        FlowStore flowStore = mock(FlowStore.class);
        given(flowStore.sequentialFlow(any())).willReturn(mock(SequentialFlow.class));
        for (Element taskElement : taskElements) {
            assertThatExceptionOfType(IllegalArgumentException.class).isThrownBy(() ->
                    builder.buildTask(taskElement, flowStore)
            );
        }
    }

    @Test
    void givenScriptTaskWithoutSqlThenThrowException() {
        CamundaScriptTaskBuilder builder = new CamundaScriptTaskBuilder();

        Element serviceElement = serviceParser.serviceElement("/unmarshal/camunda/CamundaScriptTaskBuilderTest/noSql.bpmn");
        Element element = processExtractor.processElement(serviceElement);
        Set<Element> taskElements = taskExtractor.taskElement(element);

        FlowStore flowStore = mock(FlowStore.class);
        given(flowStore.sequentialFlow(any())).willReturn(mock(SequentialFlow.class));
        for (Element taskElement : taskElements) {
            assertThatExceptionOfType(IllegalStateException.class).isThrownBy(() ->
                    builder.buildTask(taskElement, flowStore)
            ).withMessage("SQL is empty. Element id : Activity_1xmpbht");
        }
    }

    @Test
    void givenScriptTaskWithNoSupportScriptFormatThenThrowException() {
        CamundaScriptTaskBuilder builder = new CamundaScriptTaskBuilder();

        Element serviceElement = serviceParser.serviceElement("/unmarshal/camunda/CamundaScriptTaskBuilderTest/noSupportFormat.bpmn");
        Element element = processExtractor.processElement(serviceElement);
        Set<Element> taskElements = taskExtractor.taskElement(element);

        FlowStore flowStore = mock(FlowStore.class);
        given(flowStore.sequentialFlow(any())).willReturn(mock(SequentialFlow.class));
        for (Element taskElement : taskElements) {
            assertThatExceptionOfType(IllegalStateException.class).isThrownBy(() ->
                    builder.buildTask(taskElement, flowStore)
            ).withMessage("Unsupported script format. Element id : Activity_1xmpbht");
        }
    }

    @Test
    void normalScriptTask() {
        CamundaScriptTaskBuilder builder = new CamundaScriptTaskBuilder();

        Element serviceElement = serviceParser.serviceElement("/unmarshal/camunda/CamundaScriptTaskBuilderTest/normalSqlScriptTask.bpmn");
        Element element = processExtractor.processElement(serviceElement);
        Set<Element> taskElements = taskExtractor.taskElement(element);

        FlowStore flowStore = mock(FlowStore.class);
        given(flowStore.sequentialFlow(any())).willReturn(mock(SequentialFlow.class));
        List<Task> tasks = new ArrayList<>();
        for (Element taskElement : taskElements) {
            tasks.add(builder.buildTask(taskElement, flowStore));
        }

        assertThat(tasks).hasSize(1);
    }

    @Test
    void inputMapScriptTask() {
        CamundaScriptTaskBuilder builder = new CamundaScriptTaskBuilder();

        Element serviceElement = serviceParser.serviceElement("/unmarshal/camunda/CamundaScriptTaskBuilderTest/plainMapInputTask.bpmn");
        Element element = processExtractor.processElement(serviceElement);
        Set<Element> taskElements = taskExtractor.taskElement(element);

        FlowStore flowStore = mock(FlowStore.class);
        given(flowStore.sequentialFlow(any())).willReturn(mock(SequentialFlow.class));
        List<Task> tasks = new ArrayList<>();
        for (Element taskElement : taskElements) {
            Task task = builder.buildTask(taskElement, flowStore);
            tasks.add(task);
            InputOutputContainer inputs = task.inputs();
            Map<String, Object> objectAsMap = inputs.getValue("params");
            assertThat(objectAsMap).hasSize(3);
            Object id = objectAsMap.get("id");
            assertThat(id).isEqualTo(33);
        }

        assertThat(tasks).hasSize(1);
    }

    @Test
    void inputListScriptTask() {
        CamundaScriptTaskBuilder builder = new CamundaScriptTaskBuilder();

        Element serviceElement = serviceParser.serviceElement("/unmarshal/camunda/CamundaScriptTaskBuilderTest/plainListInputTask.bpmn");
        Element element = processExtractor.processElement(serviceElement);
        Set<Element> taskElements = taskExtractor.taskElement(element);

        FlowStore flowStore = mock(FlowStore.class);
        given(flowStore.sequentialFlow(any())).willReturn(mock(SequentialFlow.class));
        List<Task> tasks = new ArrayList<>();
        for (Element taskElement : taskElements) {
            Task task = builder.buildTask(taskElement, flowStore);
            tasks.add(task);
            InputOutputContainer inputs = task.inputs();
            List<Object> objectAsList = inputs.getValue("params");
            assertThat(objectAsList).hasSize(3);
            Object id = objectAsList.get(0);
            assertThat(id).isEqualTo(1);
            id = objectAsList.get(1);
            assertThat(id).isEqualTo(3.0);
            id = objectAsList.get(2);
            assertThat(id).isEqualTo(5.4);
        }

        assertThat(tasks).hasSize(1);
    }

    @Test
    void inputStringScriptTask() {
        CamundaScriptTaskBuilder builder = new CamundaScriptTaskBuilder();

        Element serviceElement = serviceParser.serviceElement("/unmarshal/camunda/CamundaScriptTaskBuilderTest/plainStringInputTask.bpmn");
        Element element = processExtractor.processElement(serviceElement);
        Set<Element> taskElements = taskExtractor.taskElement(element);

        FlowStore flowStore = mock(FlowStore.class);
        given(flowStore.sequentialFlow(any())).willReturn(mock(SequentialFlow.class));
        List<Task> tasks = new ArrayList<>();
        for (Element taskElement : taskElements) {
            Task task = builder.buildTask(taskElement, flowStore);
            tasks.add(task);
            InputOutputContainer inputs = task.inputs();
            assertThat(((Integer) inputs.getValue("p1"))).isEqualTo(123);
            assertThat(((String) inputs.getValue("p2"))).isEqualTo("v2");
        }

        assertThat(tasks).hasSize(1);
    }
}
