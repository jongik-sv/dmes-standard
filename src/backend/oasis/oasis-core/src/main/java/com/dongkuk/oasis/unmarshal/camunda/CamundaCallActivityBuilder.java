package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.Task;
import com.dongkuk.oasis.model.activity.SubServiceCallTask;
import com.dongkuk.oasis.unmarshal.CallActivityBuilder;
import com.dongkuk.oasis.unmarshal.FlowStore;
import org.jdom2.Element;

/**
 * @author Jeongjin Kim
 * @since 2021-06-22
 */
final class CamundaCallActivityBuilder implements CallActivityBuilder<Element> {
    @Override
    public Task buildTask(Element taskElement, FlowStore flowStore) {
        if (!(taskElement.getName().toLowerCase().contains("callactivity")))
            throw new IllegalArgumentException("CallActivity Not a level element. :" + taskElement.getName());

        CommonElementAttributesAndProperties elementAttrProp =
                new CommonElementAttributesAndProperties(taskElement, flowStore);

        String serviceId = CamundaAttributeExtractor.calledElement(taskElement);

        return new SubServiceCallTask(
                elementAttrProp.id(),
                elementAttrProp.name(),
                elementAttrProp.properties(),
                elementAttrProp.conditionalFlows(),
                elementAttrProp.defaultFlow(),
                elementAttrProp.sequentialFlow(),
                elementAttrProp.inputs(),
                elementAttrProp.outputs(),
                serviceId,
                elementAttrProp.multiInstance());
    }
}
