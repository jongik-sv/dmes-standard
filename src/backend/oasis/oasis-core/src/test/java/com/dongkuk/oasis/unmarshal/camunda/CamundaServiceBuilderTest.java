package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.unmarshal.ErrorStoreBuilder;
import com.dongkuk.oasis.unmarshal.ProcessBuilder;
import com.dongkuk.oasis.unmarshal.ServiceBuilder;
import com.dongkuk.oasis.unmarshal.ServiceElementFromPath;
import org.assertj.core.api.Assertions;
import org.jdom2.Element;
import org.junit.jupiter.api.Test;

import static org.mockito.BDDMockito.given;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-02-02
 */
class CamundaServiceBuilderTest {
    private final ServiceElementFromPath<Element> serviceParser = new CamundaClassPathJdom2ServiceElementFromPath();

    @Test
    void givenNoDefaultProcessThenReturnTheFirstProcess() {
        Process process = mock(Process.class);
        given(process.getId()).willReturn("Process_1ob4rra");
        ElementProcessBuilder processBuilder = mock(ElementProcessBuilder.class);
        ElementErrorStoreBuilder errorStore = mock(ElementErrorStoreBuilder.class);
        given(processBuilder.buildProcess(any(), any())).willReturn(process);
        ServiceBuilder<Element> serviceBuilder = new CamundaServiceBuilder(processBuilder, errorStore);
        Element serviceElement =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaServiceBuilderTest/noDefaultProcess.bpmn");

        Service service = serviceBuilder.buildService(serviceElement, "1", "2");

        Assertions.assertThat(service.getInitialProcess()).isEqualTo(process);
    }

    @Test
    void givenDefaultProcessThenReturnDefaultProcessMarked() {
        Process process = mock(Process.class);
        given(process.getId()).willReturn("Process_1ob4rra");
        ElementProcessBuilder processBuilder = mock(ElementProcessBuilder.class);
        ElementErrorStoreBuilder errorStore = mock(ElementErrorStoreBuilder.class);
        given(processBuilder.buildProcess(any(), any())).willReturn(process);
        ServiceBuilder<Element> serviceBuilder = new CamundaServiceBuilder(processBuilder, errorStore);
        Element serviceElement =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaServiceBuilderTest/givenDefaultProcess.bpmn");

        Service service = serviceBuilder.buildService(serviceElement, "1", "2");

        Assertions.assertThat(service.getInitialProcess()).isEqualTo(process);
    }

    @Test
    void givenLaneWithSingleProcessLineThenReturnDefaultProcessMarked() {
        Process process = mock(Process.class);
        given(process.getId()).willReturn("Process_1ob4rra");
        ElementProcessBuilder processBuilder = mock(ElementProcessBuilder.class);
        ElementErrorStoreBuilder errorStore = mock(ElementErrorStoreBuilder.class);
        given(processBuilder.buildProcess(any(), any())).willReturn(process);
        ServiceBuilder<Element> serviceBuilder = new CamundaServiceBuilder(processBuilder, errorStore);
        Element serviceElement =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaServiceBuilderTest/withLaneProcess.bpmn");

        Service service = serviceBuilder.buildService(serviceElement, "1", "2");

        Assertions.assertThat(service.getInitialProcess()).isEqualTo(process);
    }

    interface ElementProcessBuilder extends ProcessBuilder<Element> {
    }

    interface ElementErrorStoreBuilder extends ErrorStoreBuilder<Element> {

    }

}