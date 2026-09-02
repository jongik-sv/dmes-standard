package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.unmarshal.ProcessElementFromServiceElement;
import org.jdom2.Element;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Service Element 를 읽어 프로세스 레벨 {@link Element} 로 반환.
 * <p>
 * Camunda 모델러에서는 프로세스가 1개만 존재한다.
 *
 * @author Jeongjin Kim
 * @since 2021-02-04
 */
final class CamundaJdom2ProcessElementFromServiceElement
        implements ProcessElementFromServiceElement<Element, Element> {
    @Override
    public Element processElement(Element serviceElement) {
        List<Element> elements = serviceElement.getChildren();

        List<Element> processElements = elements.stream()
                .filter(element -> element.getName().equals("process"))
                .collect(Collectors.toList());

        return processElements.get(0);
    }
}
