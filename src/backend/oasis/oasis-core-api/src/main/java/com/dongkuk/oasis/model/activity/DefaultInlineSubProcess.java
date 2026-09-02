package com.dongkuk.oasis.model.activity;

import com.dongkuk.oasis.model.*;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.model.flow.nodes.FlowNodeElement;

import java.util.*;
import java.util.stream.Collectors;

/**
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
public final class DefaultInlineSubProcess extends AbstractTask implements InlineSubProcess {
    private final Map<String, ? extends Element> elementMap;
    private final Map<String, FlowNodeElement> executableFlowNodeElementMap = new HashMap<>();
    private final StartEvent startEvent;

    /**
     * @param processId        프로세스 식별자
     * @param processName      프로세스 이름
     * @param properties       태스크 속성
     * @param conditionalFlows 조건 Flow
     * @param defaultFlow      기본 Flow
     * @param sequentialFlow   순서 Flow
     * @param inputs           입력값
     * @param outputs          출력값
     * @param elements         프로세스 요소 컬렉션
     * @param multiInstance    반복 특성
     */
    public DefaultInlineSubProcess(String processId,
                                   String processName,
                                   PropertyContainer properties,
                                   Collection<ConditionalFlow> conditionalFlows,
                                   DefaultFlow defaultFlow,
                                   SequentialFlow sequentialFlow,
                                   InputOutputContainer inputs,
                                   InputOutputContainer outputs,
                                   Collection<? extends Element> elements,
                                   MultiInstance multiInstance
    ) {
        super(processId,
                processName,
                properties,
                conditionalFlows,
                defaultFlow,
                sequentialFlow,
                inputs,
                outputs,
                multiInstance);

        if (elements == null)
            throw new IllegalArgumentException("Element list is empty.");

        Map<String, Element> tempElements = new HashMap<>();
        List<Element> tempStartEvents = new ArrayList<>();
        int endEventCount = 0;

        for (Element element : elements) {
            String id = element.getId();

            if (id == null)
                throw new IllegalArgumentException("Element ID is null.");

            if (tempElements.containsKey(id))
                throw new IllegalArgumentException("Elements with the same ID.");

            tempElements.put(id, element);

            if (element instanceof StartEvent)
                tempStartEvents.add(element);

            if (element instanceof EndEvent)
                endEventCount++;

            if (element instanceof FlowNodeElement)
                executableFlowNodeElementMap.put(id, (FlowNodeElement) element);

        }

        if (elements.size() > 1 && tempStartEvents.size() == 0)
            throw new IllegalArgumentException("No start event.");

        if (tempStartEvents.size() > 1)
            throw new IllegalArgumentException("There are more than two start events.");

        if (tempStartEvents.size() > 0 && endEventCount == 0)
            throw new IllegalArgumentException("No end event.");

        startEvent = tempStartEvents.size() > 0 ? (StartEvent) tempStartEvents.get(0) : null;

        elementMap = tempElements;
    }

    @Override
    public String getId() {
        return taskId;
    }

    @Override
    public String getName() {
        return taskName;
    }

    @Override
    public Property getProperty(String name) {
        return properties.get(name);
    }

    @Override
    public StartEvent getStartEvent() {
        return startEvent;
    }

    @Override
    public Element getElement(String id) {
        if (elementMap.containsKey(id))
            return elementMap.get(id);
        else
            throw new NoSuchElementException(
                    "Cannot find an element with the given ID. " +
                            "Requested ID : " + id);
    }

    @Override
    public FlowNodeElement nextTargetExecutableElementOf(String elementId) {
        return executableFlowNodeElementMap.get(elementId);
    }

    @Override
    public Collection<? extends Element> getElements() {
        return this.elementMap.values();
    }

    @Override
    public List<BoundaryEvent> attachedBoundaryEvents(Element element) {
        return elementMap.values().stream()
                .filter(e-> e instanceof BoundaryEvent)
                .map(e-> (BoundaryEvent) e)
                .filter(e-> e.getAttachedToRef().equals(element.getId()))
                .collect(Collectors.toList());
    }
}
