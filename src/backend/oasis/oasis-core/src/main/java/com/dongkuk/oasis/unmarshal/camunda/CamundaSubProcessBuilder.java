package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.Task;
import com.dongkuk.oasis.model.activity.DefaultInlineSubProcess;
import com.dongkuk.oasis.model.activity.DefaultOfflineSubProcess;
import com.dongkuk.oasis.model.activity.OfflineSubProcessCallTask;
import com.dongkuk.oasis.unmarshal.*;
import org.jdom2.Element;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static com.dongkuk.oasis.unmarshal.camunda.CamundaElementUtil.isActivity;

/**
 * @author Jeongjin Kim
 * @since 2021-06-22
 */
final class CamundaSubProcessBuilder implements SubProcessBuilder<Element> {
    private final FlowsStoreBuilder<Element> flowsStoreBuilder;
    private final TaskBuilder<Element> taskBuilder;
    private final EventBuilder<Element> eventBuilder;
    private final GatewayBuilder<Element> gatewayBuilder;
    private final CallActivityBuilder<Element> callActivityBuilder;

    /**
     * @param flowsStoreBuilder   흐름 빌더
     * @param taskBuilder         태스크 빌더
     * @param eventBuilder        이벤트 빌더
     * @param gatewayBuilder      게이트웨이 빌더
     * @param callActivityBuilder 콜 액티비티 빌더
     */
    public CamundaSubProcessBuilder(FlowsStoreBuilder<Element> flowsStoreBuilder,
                                    TaskBuilder<Element> taskBuilder,
                                    EventBuilder<Element> eventBuilder,
                                    GatewayBuilder<Element> gatewayBuilder,
                                    CallActivityBuilder<Element> callActivityBuilder) {
        this.flowsStoreBuilder = flowsStoreBuilder;
        this.taskBuilder = taskBuilder;
        this.eventBuilder = eventBuilder;
        this.gatewayBuilder = gatewayBuilder;
        this.callActivityBuilder = callActivityBuilder;
    }

    @Override
    public Task buildProcess(Element taskElement, FlowStore flowStore, ErrorStore errorStore) {
        if (!taskElement.getName().equals("subProcess"))
            throw new IllegalArgumentException("Not a subprocess level element.");

        CommonElementAttributesAndProperties elementAttrProp
                = new CommonElementAttributesAndProperties(taskElement, flowStore);

        Set<com.dongkuk.oasis.model.Element> oasisElements = new HashSet<>();

        FlowStore flows = flowsStoreBuilder.flows(taskElement);

        List<Element> elements = taskElement.getChildren();

        CamundaProcessCommonElementBuilders.build(
                elements,
                flows,
                oasisElements,
                taskBuilder,
                eventBuilder,
                gatewayBuilder,
                callActivityBuilder,
                errorStore
        );

        for (Element element : elements
                .stream()
                .filter(element -> element.getName().toLowerCase().lastIndexOf("subprocess") > -1)
                .collect(Collectors.toList())) {
            Task process = buildProcess(element, flows, errorStore);
            oasisElements.add(process);
        }

        if (isInlineSubProcess(elements)) {
            return new DefaultInlineSubProcess(
                    elementAttrProp.id(),
                    elementAttrProp.name(),
                    elementAttrProp.properties(),
                    elementAttrProp.conditionalFlows(),
                    elementAttrProp.defaultFlow(),
                    elementAttrProp.sequentialFlow(),
                    elementAttrProp.inputs(),
                    elementAttrProp.outputs(),
                    oasisElements,
                    elementAttrProp.multiInstance());
        } else if (isOffLineSubProcess(elements)) {
            return new DefaultOfflineSubProcess(
                    elementAttrProp.id(),
                    elementAttrProp.name(),
                    elementAttrProp.properties(),
                    elementAttrProp.inputs(),
                    elementAttrProp.outputs(),
                    oasisElements,
                    elementAttrProp.multiInstance()
            );
        } else {
            return new OfflineSubProcessCallTask(
                    elementAttrProp.id(),
                    elementAttrProp.name(),
                    elementAttrProp.properties(),
                    elementAttrProp.conditionalFlows(),
                    elementAttrProp.defaultFlow(),
                    elementAttrProp.sequentialFlow(),
                    elementAttrProp.inputs(),
                    elementAttrProp.outputs(),
                    elementAttrProp.multiInstance());
        }
    }

    private boolean isOffLineSubProcess(List<Element> elements) {
        boolean incoming = elements.stream()
                .anyMatch(element -> element.getName().equals("incoming"));
        return !incoming;
    }

    private boolean isInlineSubProcess(List<Element> elements) {
        boolean incoming = elements.stream()
                .anyMatch(element -> element.getName().equals("incoming"));

        boolean hasActivity = elements.stream()
                .anyMatch(element -> isActivity(element.getName()));

        return incoming && hasActivity;
    }
}
