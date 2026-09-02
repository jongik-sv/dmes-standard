package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.unmarshal.GatewayElementFromProcessElement;
import org.jdom2.Element;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Process Element 를 읽어 게이트웨이 {@link Element} 집합 반환.
 * <p>
 *
 * @author Jeongjin Kim
 * @since 2021-02-04
 */
final class CamundaJdom2GatewayElementFromProcessElement
        implements GatewayElementFromProcessElement<Element, Element> {
    @Override
    public Set<Element> gatewayElement(Element processElement) {
        List<Element> elements = processElement.getChildren();

        Set<Element> eventElements = new HashSet<>();

        for (Element element : elements) {
            if (element.getName().toLowerCase().lastIndexOf("gateway") > -1) {
                eventElements.add(element);
            }
        }

        return eventElements;
    }
}
