package com.dongkuk.oasis.model.process;

import com.dongkuk.oasis.model.*;
import com.dongkuk.oasis.model.activity.DefaultProcess;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.Arrays;
import java.util.Collection;
import java.util.List;

import static org.mockito.BDDMockito.given;

/**
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
@SuppressWarnings({"ConstantConditions", "ArraysAsListWithZeroOrOneArgument"})
class DefaultProcessTest {
    static Collection<Element> mockStartAndEndEvent() {
        StartEvent startEvent = Mockito.mock(StartEvent.class);
        given(startEvent.getId()).willReturn("esid");
        EndEvent endEvent = Mockito.mock(EndEvent.class);
        given(endEvent.getId()).willReturn("eeid");
        return Arrays.asList(startEvent, endEvent);
    }

    @Test
    void givenAnyParamIsNullThenThrowException() {
        Task task = Mockito.mock(Task.class);

        Assertions.assertThatExceptionOfType(
                IllegalArgumentException.class
        ).isThrownBy(() -> new DefaultProcess(
                "pid",
                "sname",
                null,
                new PropertyContainer()));

        Assertions.assertThatExceptionOfType(
                IllegalArgumentException.class
        ).isThrownBy(() -> new DefaultProcess(
                "pid",
                null,
                Arrays.asList(task),
                new PropertyContainer()));

        Assertions.assertThatExceptionOfType(
                IllegalArgumentException.class
        ).isThrownBy(() -> new DefaultProcess(
                null,
                "sname",
                Arrays.asList(task),
                new PropertyContainer()));
    }

    @Test
    void givenElementIdIsNullThenThrowException() {
        Element el = Mockito.mock(Element.class);
        given(el.getId()).willReturn(null);

        Assertions.assertThatExceptionOfType(
                IllegalArgumentException.class
        ).isThrownBy(() -> new DefaultProcess(
                "pid",
                "pname",
                Arrays.asList(el),
                new PropertyContainer()));
    }

    @Test
    void givenElementIdThenReturnElement() {
        StartEvent startEvent = Mockito.mock(StartEvent.class);
        given(startEvent.getId()).willReturn("esid");

        EndEvent endEvent = Mockito.mock(EndEvent.class);
        given(endEvent.getId()).willReturn("eeid");

        Element element = Mockito.mock(Element.class);
        given(element.getId()).willReturn("eid");

        List<Element> spyProcesses = Arrays.asList(element, startEvent, endEvent);
        DefaultProcess process = new DefaultProcess(
                "pid",
                "sname",
                spyProcesses,
                new PropertyContainer());

        Element processFromService = process.getElement("eid");

        Assertions.assertThat(processFromService).isEqualTo(element);
    }

    @Test
    void startEventShouldBeReturned() {
        StartEvent startEvent = Mockito.mock(StartEvent.class);
        given(startEvent.getId()).willReturn("esid");

        EndEvent endEvent = Mockito.mock(EndEvent.class);
        given(endEvent.getId()).willReturn("eeid");

        Task otherTask = Mockito.mock(Task.class);
        given(otherTask.getId()).willReturn("pid2");

        List<Element> elements = Arrays.asList(startEvent, endEvent, otherTask);
        DefaultProcess process = new DefaultProcess(
                "pid",
                "pname",
                elements,
                new PropertyContainer());

        StartEvent startEventFromProcess = process.getStartEvent();

        Assertions.assertThat(startEventFromProcess).isEqualTo(startEvent);
    }

    @Test
    void givenMoreThenOneStartEventThenThrowException() {
        StartEvent startEvent1 = Mockito.mock(StartEvent.class);
        given(startEvent1.getId()).willReturn("e1");

        StartEvent startEvent2 = Mockito.mock(StartEvent.class);
        given(startEvent2.getId()).willReturn("s1");

        Assertions.assertThatExceptionOfType(
                IllegalArgumentException.class
        ).isThrownBy(() -> new DefaultProcess(
                "pid",
                "pname",
                Arrays.asList(startEvent1, startEvent2),
                new PropertyContainer()));
    }

    @Test
    void givenNoStartEventThenThrowException() {
        Element el1 = Mockito.mock(Element.class);
        given(el1.getId()).willReturn("e1");

        Element el2 = Mockito.mock(Element.class);
        given(el2.getId()).willReturn("e2");

        Assertions.assertThatExceptionOfType(
                IllegalArgumentException.class
        ).isThrownBy(() -> new DefaultProcess(
                "pid",
                "pname",
                Arrays.asList(el1, el2),
                new PropertyContainer()))
                .withMessage("No start event.");
    }

    @Test
    void givenNoEndEventThenThrowException() {
        StartEvent el1 = Mockito.mock(StartEvent.class);
        given(el1.getId()).willReturn("e1");

        Assertions.assertThatExceptionOfType(
                IllegalArgumentException.class
        ).isThrownBy(() -> new DefaultProcess(
                "pid",
                "pname",
                Arrays.asList(el1),
                new PropertyContainer()))
                .withMessage("No end event.");
    }

    @Test
    void givenElementWithSameIdThenThrowException() {
        Element el1 = Mockito.mock(Element.class);
        given(el1.getId()).willReturn("tid");

        Element el2 = Mockito.mock(Element.class);
        given(el2.getId()).willReturn("tid");

        List<Element> spyProcesses = Arrays.asList(el1, el2);

        Assertions.assertThatExceptionOfType(
                IllegalArgumentException.class
        ).isThrownBy(() -> new DefaultProcess(
                "pid",
                "sname",
                spyProcesses,
                new PropertyContainer()));
    }
}