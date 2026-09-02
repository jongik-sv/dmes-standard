package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.ServiceTask;
import com.dongkuk.oasis.model.Task;
import com.dongkuk.oasis.model.activity.JavaServiceTask;
import com.dongkuk.oasis.model.flow.nodes.IllegalFlowException;
import com.dongkuk.oasis.unmarshal.FlowStore;
import com.dongkuk.oasis.unmarshal.TaskBuilder;
import org.jdom2.Element;

/**
 * @author Jeongjin Kim
 * @since 2021-02-03
 */
final class CamundaJavaServiceTaskBuilder implements TaskBuilder<Element> {
    @Override
    public Task buildTask(Element taskElement, FlowStore flowStore) {
        if (!(taskElement.getName().equals("serviceTask")))
            throw new IllegalArgumentException(
                    String.format("Not a task level element. : [%s]", taskElement.getName()));

        CommonElementAttributesAndProperties elementAttrProp =
                new CommonElementAttributesAndProperties(taskElement, flowStore);

        String classNameFromTask = CamundaAttributeExtractor.className(taskElement);

        ServiceTask serviceTask;

        if (!elementAttrProp.isValidComplexFlowNode())
            throw new IllegalFlowException(
                    String.format("Incorrect flow configuration., task id : %s", elementAttrProp.id()));

        serviceTask = new JavaServiceTask(
                elementAttrProp.id(),
                elementAttrProp.name(),
                elementAttrProp.conditionalFlows(),
                elementAttrProp.defaultFlow(),
                elementAttrProp.sequentialFlow(),
                classNameFromTask,
                elementAttrProp.properties(),
                elementAttrProp.inputs(),
                elementAttrProp.outputs(),
                elementAttrProp.multiInstance());
        return serviceTask;
    }
}
