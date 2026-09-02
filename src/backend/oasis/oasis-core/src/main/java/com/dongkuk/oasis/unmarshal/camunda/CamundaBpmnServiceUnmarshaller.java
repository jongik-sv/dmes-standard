package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.unmarshal.ServiceBuilder;
import com.dongkuk.oasis.unmarshal.ServiceElementFromPlainString;
import com.dongkuk.oasis.unmarshal.ServiceUnmarshaller;
import org.jdom2.Element;

import java.nio.charset.StandardCharsets;

/**
 * bpmn 문서를 {@link Service} 개체로 변환.
 *
 * @author Jeongjin Kim
 */
public final class CamundaBpmnServiceUnmarshaller implements ServiceUnmarshaller {
    @Override
    public Service unmarshal(String documentString, String serviceId, String serviceName) {
        ServiceElementFromPlainString<Element> camundaServiceElementFromPlainString =
                new CamundaServiceElementFromPlainString(StandardCharsets.UTF_8);

        Element serviceElement = camundaServiceElementFromPlainString.serviceElement(documentString);

        CamundaTaskBuilder camundaTaskBuilder = new CamundaTaskBuilder(
                new CamundaTaskBuilder.
                        TaskBuilderMapping("serviceTask",
                        new CamundaJavaServiceTaskBuilder()),
                new CamundaTaskBuilder.
                        TaskBuilderMapping("scriptTask",
                        new CamundaScriptTaskBuilder()),
                new CamundaTaskBuilder.
                        TaskBuilderMapping("sendTask",
                        new CamundaExternalSendTaskBuilder())
        );

        ServiceBuilder<Element> serviceBuilder = new CamundaServiceBuilder(
                new CamundaProcessBuilder(
                        new CamundaFlowsStoreBuilder(),
                        camundaTaskBuilder,
                        new CamundaEventBuilder(),
                        new CamundaGatewayBuilder(),
                        new CamundaSubProcessBuilder(
                                new CamundaFlowsStoreBuilder(),
                                camundaTaskBuilder,
                                new CamundaEventBuilder(),
                                new CamundaGatewayBuilder(),
                                new CamundaCallActivityBuilder()),
                        new CamundaCallActivityBuilder()),
                new CamundaErrorStoreBuilder());

        return serviceBuilder.buildService(serviceElement, serviceId, serviceName);
    }
}
