package usecase.transactionalSubService;

import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.provider.ServiceProvider;
import com.dongkuk.oasis.unmarshal.ClasspathFileToString;
import com.dongkuk.oasis.unmarshal.camunda.CamundaBpmnServiceUnmarshaller;

import java.util.HashMap;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2023-01-10
 */
public class TestServiceProvider implements ServiceProvider {
    private final Map<String, Service> services = new HashMap<>();

    public TestServiceProvider() {
        services.put("mainService", getService("/usecase/transactionalSubService/mainService.bpmn"));
        services.put("subService", getService("/usecase/transactionalSubService/subService.bpmn"));
        services.put("errorSubService", getService("/usecase/transactionalSubService/errorSubService.bpmn"));
        services.put("parameterPassedSubService", getService("/usecase/transactionalSubService/parameterPassedSubService.bpmn"));
        services.put("messageSubService", getService("/usecase/transactionalSubService/messageSubService.bpmn"));
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
}