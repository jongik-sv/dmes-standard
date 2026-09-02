package com.dongkuk.oasis;

import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.provider.ServiceProvider;
import com.dongkuk.oasis.unmarshal.ClasspathFileToString;
import com.dongkuk.oasis.unmarshal.camunda.CamundaBpmnServiceUnmarshaller;

import java.util.HashMap;
import java.util.Map;

public class ServiceProviderForTest implements ServiceProvider {
    private final Map<String, Service> services = new HashMap<>();

    public ServiceProviderForTest(ServiceEntry... serviceEntries) {
        for (ServiceEntry serviceEntry : serviceEntries) {
            services.put(serviceEntry.serviceId, getService(serviceEntry.servicePath));
        }
    }

    public static Service getService(String filePath) {
        String serviceDocumentString = new ClasspathFileToString()
                .getString(filePath,
                        "utf-8");

        CamundaBpmnServiceUnmarshaller unmarshaller =
                new CamundaBpmnServiceUnmarshaller();
        return unmarshaller.unmarshal(serviceDocumentString, "s1", "s1");
    }

    @Override
    public Service service(String serviceId) {
        Service service = services.get(serviceId);
        if (service == null)
            throw new IllegalStateException("No service.");
        return service;
    }

    public static class ServiceEntry {
        private final String serviceId;
        private final String servicePath;

        public ServiceEntry(String serviceId, String servicePath) {
            this.serviceId = serviceId;
            this.servicePath = servicePath;
        }

    }
}
