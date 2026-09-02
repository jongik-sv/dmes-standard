package com.dongkuk.oasis.model.activity;

import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.*;
import com.dongkuk.oasis.model.flow.nodes.FlowNodeElement;

import java.util.*;
import java.util.stream.Collectors;

/**
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
public final class DefaultProcess implements Process {
    private final String processId;
    private final String processName;
    private final Map<String, ? extends Element> elementMap;
    private final Map<String, FlowNodeElement> executableFlowNodeElementMap = new HashMap<>();
    private final StartEvent startEvent;
    private final PropertyContainer properties;

    /**
     * 프로세스 생성자.
     * 모든 파라미터는 null 일 수 없음
     *
     * @param processId   프로세스 식별자
     * @param processName 프로세스 이름
     * @param elements    요소들
     * @param properties  속성
     */
    public DefaultProcess(String processId,
                          String processName,
                          Collection<? extends Element> elements,
                          PropertyContainer properties) {
        if (processId == null ||
                processName == null ||
                properties == null ||
                elements == null)
            throw new IllegalArgumentException();

        this.processId = processId;
        this.processName = processName;
        this.properties = properties;

        Map<String, Element> tempElements = new HashMap<>();
        List<Element> tempStartEvents = new ArrayList<>();
        int endEventCount = 0;

        for (Element element : elements) {
            String id = element.getId();

            if (id == null)
                throw new IllegalArgumentException("Element ID is null.");

            if (tempElements.containsKey(id))
                throw new IllegalArgumentException(
                        String.format("Element [%s], An element with the same ID already exists.", id));

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
        return processId;
    }

    @Override
    public String getName() {
        return processName;
    }

    @Override
    public Property getProperty(String name) {
        return properties.get(name);
    }

    @Override
    public PropertyContainer properties() {
        return properties;
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
