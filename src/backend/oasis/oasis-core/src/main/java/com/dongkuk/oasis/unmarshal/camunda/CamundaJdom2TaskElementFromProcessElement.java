package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.unmarshal.TaskElementFromProcessElement;
import org.jdom2.Element;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Process Element 를 읽어 태스크 {@link Element} 집합 반환.
 * <p>
 *
 * @author Jeongjin Kim
 * @since 2021-02-04
 */
final class CamundaJdom2TaskElementFromProcessElement
        implements TaskElementFromProcessElement<Element, Element> {
    @Override
    public Set<Element> taskElement(Element processElement) {
        List<Element> elements = processElement.getChildren();

        Set<Element> eventElements = new HashSet<>();

        for (Element element : elements) {
            if (element.getName().toLowerCase().lastIndexOf("task") > -1) {
                eventElements.add(element);
            }
        }

        return eventElements;
    }
}
