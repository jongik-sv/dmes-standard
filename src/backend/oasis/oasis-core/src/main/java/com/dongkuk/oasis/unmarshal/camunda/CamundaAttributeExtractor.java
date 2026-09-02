package com.dongkuk.oasis.unmarshal.camunda;

import org.jdom2.Element;

/**
 * @author Jeongjin Kim
 * @since 2021-05-11
 */
final class CamundaAttributeExtractor {
    static String id(Element element) {
        return element.getAttributeValue("id");
    }

    static String name(Element element) {
        return element.getAttributeValue("name");
    }

    static String scriptFormat(Element element) {
        return element.getAttributeValue("scriptFormat");
    }

    static String resource(Element element) {
        return element.getAttributeValue("resource", element.getNamespace("camunda"));
    }

    static String calledElement(Element element) {
        return element.getAttributeValue("calledElement");
    }

    static String className(Element element) {
        return element.getAttributeValue("class", element.getNamespace("camunda"));
    }

    static String topic(Element element) {
        return element.getAttributeValue("topic", element.getNamespace("camunda"));
    }

    static String errorId(Element eventElement) {
        Element errorEvent = eventElement
                .getChild("errorEventDefinition", eventElement.getNamespace("bpmn"));
        return errorEvent == null ? null : errorEvent.getAttributeValue("errorRef");
    }

    static String attachedToRef(Element eventElement) {
        return eventElement.getAttributeValue("attachedToRef");
    }
}
