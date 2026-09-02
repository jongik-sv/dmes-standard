package com.dongkuk.oasis.unmarshal;

import org.jdom2.Element;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 *
 */
public class CamundaJdom2CallActivityElementFromProcessElement
        implements CallActivityElementFromProcessElement<Element, Element> {

    @Override
    public Set<Element> callActivityElement(Element processElement) {
        List<Element> elements = processElement.getChildren();

        Set<Element> eventElements = new HashSet<>();

        for (Element element : elements) {
            if (element.getName().toLowerCase().lastIndexOf("callactivity") > -1) {
                eventElements.add(element);
            }
        }

        return eventElements;
    }
}
