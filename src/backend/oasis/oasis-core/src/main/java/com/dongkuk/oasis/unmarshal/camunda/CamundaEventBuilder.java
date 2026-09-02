package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.Event;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.error.Error;
import com.dongkuk.oasis.model.event.DefaultEndEvent;
import com.dongkuk.oasis.model.event.DefaultErrorBoundaryEvent;
import com.dongkuk.oasis.model.event.DefaultStartEvent;
import com.dongkuk.oasis.model.event.UserExceptionEndEvent;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.unmarshal.ErrorStore;
import com.dongkuk.oasis.unmarshal.EventBuilder;
import com.dongkuk.oasis.unmarshal.FlowStore;
import org.jdom2.Element;

/**
 * @author Jeongjin Kim
 * @since 2021-02-04
 */
final class CamundaEventBuilder implements EventBuilder<Element> {
    @Override
    public Event buildEvent(Element eventElement, FlowStore flows, ErrorStore errorStore) {
        if (!(eventElement.getName().toLowerCase().lastIndexOf("event") > -1))
            throw new IllegalArgumentException("Not an event level element.");

        PropertyContainer properties = CamundaElementUtil.extractProperties(eventElement);

        String id = CamundaAttributeExtractor.id(eventElement);
        String name = CamundaAttributeExtractor.name(eventElement);

        if (eventElement.getName().equals("startEvent")) {
            SequentialFlow flow = flows.sequentialFlow(id);
            return new DefaultStartEvent(id, name, flow, properties);
        } else if (eventElement.getName().equals("endEvent")) {
            String errorId = CamundaAttributeExtractor.errorId(eventElement);
            if (errorId == null)
                return new DefaultEndEvent(id, name, properties);
            else {
                Error error = errorStore.error(errorId);
                if (error == null)
                    throw new IllegalStateException(
                            String.format("Cannot find error information. Searched error ID : [%s]", errorId));

                return new UserExceptionEndEvent(id, name, properties, error);
            }
        } else if (eventElement.getName().equals("boundaryEvent")) {
            CommonElementAttributesAndProperties elementAttrProp =
                    new CommonElementAttributesAndProperties(eventElement, flows);
            String errorId = CamundaAttributeExtractor.errorId(eventElement);
            if (errorId == null)
                throw new IllegalStateException(
                        String.format(
                                "Error reference code is not specified in the error boundary event. " +
                                        "Searched error ID : [%s]",
                                eventElement.getAttribute("id").getValue()));

            Error error = errorStore.error(errorId);
            if (error == null) {
                throw new IllegalStateException(
                        String.format("Cannot find error information. Searched error ID : [%s]", errorId));
            }

            String attachedToRef = CamundaAttributeExtractor.attachedToRef(eventElement);

            if (attachedToRef == null)
                throw new IllegalStateException(
                        String.format(
                                "Reference element information is not specified in the error boundary event. " +
                                        "Searched error ID : [%s]",
                                eventElement.getAttribute("id").getValue()));
            return new DefaultErrorBoundaryEvent(
                    id,
                    name,
                    elementAttrProp.conditionalFlows(),
                    elementAttrProp.defaultFlow(),
                    elementAttrProp.sequentialFlow(),
                    properties,
                    error,
                    attachedToRef);
        } else {
            throw new IllegalArgumentException("Uncreatable event element exists.");
        }
    }
}
