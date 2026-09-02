package usecase.subServiceCall;

import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.provider.ServiceProvider;
import com.dongkuk.oasis.unmarshal.ClasspathFileToString;
import com.dongkuk.oasis.unmarshal.camunda.CamundaBpmnServiceUnmarshaller;

import java.util.HashMap;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-06-25
 */
public class TestServiceProvider implements ServiceProvider {
    private final Map<String, Service> services = new HashMap<>();

    public TestServiceProvider() {
        services.put("mainService", getService("/usecase/subServiceCall/mainService.bpmn"));
        services.put("subService", getService("/usecase/subServiceCall/subService.bpmn"));
        services.put("subSubService", getService("/usecase/subServiceCall/subSubService.bpmn"));
        services.put("rev_mainService", getService("/usecase/subServiceCall/rev_mainService.bpmn"));
        services.put("rev_subService", getService("/usecase/subServiceCall/rev_subService.bpmn"));
        services.put("rev_subSubService", getService("/usecase/subServiceCall/rev_subSubService.bpmn"));

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