package com.dongkuk.oasis.model;

import com.dongkuk.oasis.model.flow.nodes.FlowNodeElement;

import java.util.Collection;
import java.util.List;

/**
 * 프로세스를 대표하는 인터페이스.
 *
 * @author Jeongjin Kim
 * @since 2021-01-28
 */
public interface Process extends Element {
    /**
     * 서비스가 실행할 최초 시작 이벤트를 반환.
     *
     * @return 시작 이벤트
     */
    StartEvent getStartEvent();

    /**
     * 지정한 요소 식별자를 가진 요소 객체를 반환.
     *
     * @param id 반환 받을 요소 식별자
     * @return 요소 객체
     */
    Element getElement(String id);

    /**
     * 실행가능한 흐름 노드인 요소를 반환.
     *
     * @param elementId 요소 식별자
     * @return {@link FlowNodeElement}
     */
    FlowNodeElement nextTargetExecutableElementOf(String elementId);

    /**
     * 프로세스가 가지고 있는 요소를 반환.
     *
     * @return 요소 객체
     */
    Collection<? extends Element> getElements();

    /**
     * 입력된 {@link Element}에 연결되어 있는 {@link BoundaryEvent}를 반환한다.
     * @param element 찾을 대상 요소
     * @return 연결된 바운더리 이벤트 목록
     */
    List<BoundaryEvent> attachedBoundaryEvents(Element element);
}
