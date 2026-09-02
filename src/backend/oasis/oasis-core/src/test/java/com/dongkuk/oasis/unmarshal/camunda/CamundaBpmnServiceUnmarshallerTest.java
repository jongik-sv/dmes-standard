package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.model.activity.ExternalSendTask;
import com.dongkuk.oasis.unmarshal.ClasspathFileToString;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/**
 * @author Jeongjin Kim
 * @since 2021-04-05
 */
class CamundaBpmnServiceUnmarshallerTest {
    @Test
    void generateService() {
        String serviceDocumentString = new ClasspathFileToString()
                .getString("/unmarshal/camunda/CamundaBpmnServiceUnmarshallerTest/normal.bpmn",
                        "utf-8");

        CamundaBpmnServiceUnmarshaller unmarshaller =
                new CamundaBpmnServiceUnmarshaller();
        Service service = unmarshaller.unmarshal(serviceDocumentString, "s1", "s1");
        assertThat(service.getServiceId()).isEqualTo("s1");
        Process initialProcess = service.getInitialProcess();
        assertThat(initialProcess.getId()).isEqualTo("Process_1ob4rra");
    }

    @Test
    void givenNoFlowsTaskThenThrowsException() {
        String serviceDocumentString = new ClasspathFileToString()
                .getString("/unmarshal/camunda/CamundaBpmnServiceUnmarshallerTest/abnormal.bpmn",
                        "utf-8");
        CamundaBpmnServiceUnmarshaller unmarshaller =
                new CamundaBpmnServiceUnmarshaller();

        assertThatExceptionOfType(java.lang.IllegalArgumentException.class).isThrownBy(
                () -> unmarshaller.unmarshal(serviceDocumentString, "s1", "s1")
        ).withMessage("No end event.");

    }

    @Test
    void givenSendTaskBpmnThenReturnSendTaskObject() {
        String serviceDocumentString = new ClasspathFileToString()
                .getString("/unmarshal/camunda/CamundaBpmnServiceUnmarshallerTest/sendTask.bpmn",
                        "utf-8");
        CamundaBpmnServiceUnmarshaller unmarshaller =
                new CamundaBpmnServiceUnmarshaller();

        Service unmarshal = unmarshaller.unmarshal(serviceDocumentString, "s1", "s1");
        ExternalSendTask sendTask = (ExternalSendTask) unmarshal.
                getInitialProcess().getElement("Activity_0crqd2l");
        assertThat(sendTask.getTopic()).isEqualTo("m1");
    }
}