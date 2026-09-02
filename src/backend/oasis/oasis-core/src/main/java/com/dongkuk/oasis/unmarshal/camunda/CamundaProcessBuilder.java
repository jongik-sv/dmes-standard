package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.Task;
import com.dongkuk.oasis.model.activity.DefaultProcess;
import com.dongkuk.oasis.unmarshal.ProcessBuilder;
import com.dongkuk.oasis.unmarshal.*;
import org.jdom2.Attribute;
import org.jdom2.Element;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * @author Jeongjin Kim
 * @since 2021-02-03
 */
final class CamundaProcessBuilder implements ProcessBuilder<Element> {
    private final FlowsStoreBuilder<Element> flowsStoreBuilder;
    private final TaskBuilder<Element> taskBuilder;
    private final EventBuilder<Element> eventBuilder;
    private final GatewayBuilder<Element> gatewayBuilder;
    private final SubProcessBuilder<Element> subProcessBuilder;
    private final CallActivityBuilder<Element> callActivityBuilder;

    /**
     * @param flowsStoreBuilder   흐름 빌더
     * @param taskBuilder         태스크 빌더
     * @param eventBuilder        이벤트 빌더
     * @param gatewayBuilder      게이트웨이 빌더
     * @param subProcessBuilder   서브 프로세스 빌더
     * @param callActivityBuilder 콜 액티비티 빌더
     */
    public CamundaProcessBuilder(FlowsStoreBuilder<Element> flowsStoreBuilder,
                                 TaskBuilder<Element> taskBuilder,
                                 EventBuilder<Element> eventBuilder,
                                 GatewayBuilder<Element> gatewayBuilder,
                                 SubProcessBuilder<Element> subProcessBuilder,
                                 CallActivityBuilder<Element> callActivityBuilder) {
        this.flowsStoreBuilder = flowsStoreBuilder;
        this.taskBuilder = taskBuilder;
        this.eventBuilder = eventBuilder;
        this.gatewayBuilder = gatewayBuilder;
        this.subProcessBuilder = subProcessBuilder;
        this.callActivityBuilder = callActivityBuilder;
    }

    @Override
    public Process buildProcess(Element processElement, ErrorStore errors) {
        if (!processElement.getName().equals("process") &&
                !processElement.getName().equals("subProcess")
        )
            throw new IllegalArgumentException("Not a process level element.");

        PropertyContainer properties = CamundaElementUtil.extractProperties(processElement);

        String processId = processElement.getAttribute("id").getValue();
        String processName;
        Attribute name = processElement.getAttribute("name");
        if (name == null)
            processName = processId;
        else
            processName = name.getValue();

        Set<com.dongkuk.oasis.model.Element> oasisElements = new HashSet<>();

        List<Element> elements = processElement.getChildren();

        FlowStore flows = flowsStoreBuilder.flows(processElement);

        CamundaProcessCommonElementBuilders.build(
                elements,
                flows,
                oasisElements,
                taskBuilder,
                eventBuilder,
                gatewayBuilder,
                callActivityBuilder,
                errors
        );

        for (Element element : elements
                .stream()
                .filter(element -> element.getName().toLowerCase().lastIndexOf("subprocess") > -1)
                .collect(Collectors.toList())) {
            Task process = subProcessBuilder.buildProcess(element, flows, errors);
            oasisElements.add(process);
        }

        return new DefaultProcess(processId, processName, oasisElements, properties);
    }
}
