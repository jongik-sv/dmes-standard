package com.dongkuk.oasis.provider;

import com.dongkuk.oasis.loader.ServiceDocumentLoader;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.unmarshal.camunda.CamundaBpmnServiceUnmarshaller;

/**
 * {@link Service} 를 반환하는 서비스 프로바이더이다.
 * <p>
 * 내부적으로 {@link CamundaBpmnServiceUnmarshaller}를 사용하여 {@link Service}를 생성한다.
 * 서비스 객체를 캐시하지 않는다.
 */
public class CamundaBpmnServiceProvider implements ServiceProvider {
    private final ServiceDocumentLoader serviceDocumentLoader;

    /**
     * @param serviceDocumentLoader 서비스 문서 로더
     */
    public CamundaBpmnServiceProvider(ServiceDocumentLoader serviceDocumentLoader) {
        this.serviceDocumentLoader = serviceDocumentLoader;
    }

    @Override
    public Service service(String serviceId) {
        String serviceDocumentString = serviceDocumentLoader.serviceDocument(serviceId);

        CamundaBpmnServiceUnmarshaller unmarshaller =
                new CamundaBpmnServiceUnmarshaller();

        return unmarshaller.unmarshal(serviceDocumentString, serviceId, serviceId);
    }
}
