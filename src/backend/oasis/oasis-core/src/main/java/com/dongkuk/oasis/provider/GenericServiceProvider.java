package com.dongkuk.oasis.provider;

import com.dongkuk.oasis.loader.ServiceDocumentLoader;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.unmarshal.ServiceUnmarshaller;

/**
 * {@link Service} 를 반환하는 서비스 프로바이더이다.
 */
public class GenericServiceProvider implements ServiceProvider {
    private final ServiceUnmarshaller serviceUnmarshaller;
    private final ServiceDocumentLoader serviceDocumentLoader;

    /**
     * @param serviceUnmarshaller   서비스 언마샬러
     * @param serviceDocumentLoader 서비스 문서 로더
     */
    public GenericServiceProvider(ServiceUnmarshaller serviceUnmarshaller,
                                  ServiceDocumentLoader serviceDocumentLoader) {
        this.serviceUnmarshaller = serviceUnmarshaller;
        this.serviceDocumentLoader = serviceDocumentLoader;
    }

    @Override
    public Service service(String serviceId) {
        String serviceDocumentString = serviceDocumentLoader.serviceDocument(serviceId);
        return serviceUnmarshaller.unmarshal(serviceDocumentString, serviceId, serviceId);
    }
}
