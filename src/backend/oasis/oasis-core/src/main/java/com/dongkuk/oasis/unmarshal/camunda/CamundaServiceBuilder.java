package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.model.service.DefaultService;
import com.dongkuk.oasis.unmarshal.ErrorStore;
import com.dongkuk.oasis.unmarshal.ErrorStoreBuilder;
import com.dongkuk.oasis.unmarshal.ProcessBuilder;
import com.dongkuk.oasis.unmarshal.ServiceBuilder;
import org.jdom2.Element;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * @author Jeongjin Kim
 * @since 2021-02-02
 */
final class CamundaServiceBuilder implements ServiceBuilder<Element> {
    private final ProcessBuilder<Element> processBuilder;
    private final ErrorStoreBuilder<Element> errorStoreBuilder;

    /**
     * @param processBuilder    프로세스 빌더
     * @param errorStoreBuilder 에러 스토어 빌더
     */
    public CamundaServiceBuilder(ProcessBuilder<Element> processBuilder,
                                 ErrorStoreBuilder<Element> errorStoreBuilder) {
        this.processBuilder = processBuilder;
        this.errorStoreBuilder = errorStoreBuilder;
    }

    @Override
    public Service buildService(Element serviceElement, String serviceId, String serviceName) {
        if (!serviceElement.getName().equals("definitions"))
            throw new IllegalArgumentException("Not a service level element.");

        List<Element> elements = serviceElement.getChildren();

        ErrorStore errors = errorStoreBuilder.errors(serviceElement);

        List<Process> processes = new ArrayList<>();

        for (Element element : elements
                .stream()
                .filter(element -> element.getName().equals("process")
                )
                .collect(Collectors.toList())) {
            Process process = processBuilder.buildProcess(element, errors);
            processes.add(process);
        }

        if (processes.size() != 1)
            throw new IllegalArgumentException(String.format(
                    "There should be only one process, but there are [%s] processes.", processes.size()));

        // lane 을 사용하면 프로세스가 2개 이상 존재할 수 있다. 현재는 lane을 사용하지 않기 때문에
        // 프로세스 1개 일때만 정상적인 서비스로 인식하고, 첫번째 만들어진 프로세스를 초기 프로세스로 정한다.
        return new DefaultService(serviceId, serviceName, processes, processes.get(0).getId());
    }
}
