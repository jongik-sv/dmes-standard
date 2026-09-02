package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.SendTask;
import com.dongkuk.oasis.model.Task;
import com.dongkuk.oasis.model.activity.ExternalSendTask;
import com.dongkuk.oasis.model.flow.nodes.IllegalFlowException;
import com.dongkuk.oasis.unmarshal.FlowStore;
import com.dongkuk.oasis.unmarshal.TaskBuilder;
import org.jdom2.Element;

/**
 * @author Jeongjin Kim
 * @since 2021-12-24
 */
final class CamundaExternalSendTaskBuilder implements TaskBuilder<Element> {
    @Override
    public Task buildTask(Element taskElement, FlowStore flowStore) {
        if (!(taskElement.getName().equals("sendTask")))
            throw new IllegalArgumentException(
                    String.format("Not a Send Task level element. : [%s]", taskElement.getName()));

        CommonElementAttributesAndProperties elementAttrProp =
                new CommonElementAttributesAndProperties(taskElement, flowStore);

        String topic = CamundaAttributeExtractor.topic(taskElement);

        SendTask sendTask;

        if (!elementAttrProp.isValidComplexFlowNode())
            throw new IllegalFlowException(
                    String.format("Incorrect flow configuration, task id : %s", elementAttrProp.id()));

        sendTask = new ExternalSendTask(
                elementAttrProp.id(),
                elementAttrProp.name(),
                elementAttrProp.conditionalFlows(),
                elementAttrProp.defaultFlow(),
                elementAttrProp.sequentialFlow(),
                topic,
                elementAttrProp.properties(),
                elementAttrProp.inputs(),
                elementAttrProp.outputs(),
                elementAttrProp.multiInstance());
        return sendTask;
    }
}
