package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.ErrorEndEvent;
import com.dongkuk.oasis.model.Event;
import com.dongkuk.oasis.model.error.DefaultError;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.unmarshal.*;
import org.jdom2.Element;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-02-04
 */
class CamundaEventBuilderTest {
    private final ServiceElementFromPath<Element> serviceParser =
            new CamundaClassPathJdom2ServiceElementFromPath();
    private final ProcessElementFromServiceElement<Element, Element> processExtractor =
            new CamundaJdom2ProcessElementFromServiceElement();
    private final EventElementFromProcessElement<Element, Element> eventExtractor =
            new CamundaJdom2EventElementFromProcessElement();

    @Test
    void givenNormalBpmn() {
        Element serviceElement = serviceParser.serviceElement("/unmarshal/camunda/CamundaEventBuilderTest/normal.bpmn");
        Element element = processExtractor.processElement(serviceElement);
        FlowStore flowStore = mock(FlowStore.class);
        ErrorStore errorStore = mock(ErrorStore.class);
        given(flowStore.sequentialFlow(any())).willReturn(mock(SequentialFlow.class));

        CamundaEventBuilder builder = new CamundaEventBuilder();

        Set<Element> eventElements = eventExtractor.eventElement(element);

        Set<Event> events = new HashSet<>();
        for (Element event : eventElements) {
            events.add(builder.buildEvent(event, flowStore, errorStore));
        }

        assertThat(events).hasSize(2);
        for (Event event : events) {
            assertThat(event.getProperty("hey").getValue()).isEqualTo("hello");
        }
    }

    @Test
    void exceptionEndEvent() {
        Element serviceElement = serviceParser.serviceElement("/unmarshal/camunda/CamundaEventBuilderTest/userExceptionEvent.bpmn");
        Element element = processExtractor.processElement(serviceElement);
        FlowStore flowStore = mock(FlowStore.class);
        CamundaErrorStore errorStore = new CamundaErrorStore();
        errorStore.put(new DefaultError("Error_17kc1w2", "iname", "icode", "imessage"));
        given(flowStore.sequentialFlow(any())).willReturn(mock(SequentialFlow.class));

        CamundaEventBuilder builder = new CamundaEventBuilder();

        Set<Element> eventElements = eventExtractor.eventElement(element);

        List<Event> events = new ArrayList<>();
        for (Element event : eventElements) {
            events.add(builder.buildEvent(event, flowStore, errorStore));
        }
        assertThat(events).hasSize(1);
        Event event = events.get(0);
        assertThat(event).isInstanceOf(ErrorEndEvent.class);
    }
}