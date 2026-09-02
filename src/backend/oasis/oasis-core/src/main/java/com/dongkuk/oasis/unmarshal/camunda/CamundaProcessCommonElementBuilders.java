package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.Event;
import com.dongkuk.oasis.model.Gateway;
import com.dongkuk.oasis.model.Task;
import com.dongkuk.oasis.unmarshal.*;
import org.jdom2.Element;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * @author Jeongjin Kim
 * @since 2021-07-20
 */
final class CamundaProcessCommonElementBuilders {
    static void build(List<Element> elements,
                      FlowStore flows,
                      Set<com.dongkuk.oasis.model.Element> oasisElements,
                      TaskBuilder<Element> taskBuilder,
                      EventBuilder<Element> eventBuilder,
                      GatewayBuilder<Element> gatewayBuilder,
                      CallActivityBuilder<Element> callActivityBuilder,
                      ErrorStore errorStore) {
        for (Element element : elements
                .stream()
                .filter(element -> element.getName().toLowerCase().lastIndexOf("task") > -1
                )
                .collect(Collectors.toList())) {
            Task task = taskBuilder.buildTask(element, flows);
            oasisElements.add(task);
        }

        for (Element element : elements
                .stream()
                .filter(element -> element.getName().toLowerCase().lastIndexOf("event") > -1)
                .collect(Collectors.toList())) {
            Event event = eventBuilder.buildEvent(element, flows, errorStore);
            oasisElements.add(event);
        }

        for (Element element : elements
                .stream()
                .filter(element -> element.getName().toLowerCase().lastIndexOf("gateway") > -1)
                .collect(Collectors.toList())) {
            Gateway gateway = gatewayBuilder.buildGateway(element, flows);
            oasisElements.add(gateway);
        }

        for (Element element : elements
                .stream()
                .filter(element -> element.getName().toLowerCase().lastIndexOf("callactivity") > -1
                )
                .collect(Collectors.toList())) {
            Task task = callActivityBuilder.buildTask(element, flows);
            oasisElements.add(task);
        }
    }
}
