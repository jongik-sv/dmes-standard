package com.dongkuk.oasis.model.activity;

import com.dongkuk.oasis.model.*;
import com.dongkuk.oasis.model.flow.nodes.FlowNodeElement;

import java.util.*;
import java.util.stream.Collectors;

/**
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
public final class DefaultOfflineSubProcess implements SubProcess {
    private final String processId;
    private final String processName;
    private final PropertyContainer properties;
    private final InputOutputContainer inputs;
    private final InputOutputContainer outputs;

    private final Map<String, ? extends Element> elementMap;
    private final Map<String, FlowNodeElement> executableFlowNodeElementMap = new HashMap<>();
    private final StartEvent startEvent;
    private final MultiInstance multiInstance;

    /**
     * @param processId     프로세스 식별자
     * @param processName   프로세스 이름
     * @param properties    속성
     * @param inputs        입력값
     * @param outputs       출력값
     * @param elements      요소들
     * @param multiInstance 반복특성
     */
    public DefaultOfflineSubProcess(String processId,
                                    String processName,
                                    PropertyContainer properties,
                                    InputOutputContainer inputs,
                                    InputOutputContainer outputs,
                                    Collection<? extends Element> elements,
                                    MultiInstance multiInstance) {
        this.multiInstance = multiInstance;
        if (processId == null ||
                processName == null
        )
            throw new IllegalArgumentException(
                    String.format("Required value missing, " +
                                    "processId=[%s], " +
                                    "processName=[%s]",
                            processId, processName));

        if (elements == null)
            throw new IllegalArgumentException("No element list.");

        this.processId = processId;
        this.processName = processName;
        this.properties = properties == null ? new PropertyContainer() : properties;
        this.inputs = inputs == null ? new InputOutputContainer(new HashMap<>()) : inputs;
        this.outputs = outputs == null ? new InputOutputContainer(new HashMap<>()) : outputs;

        Map<String, Element> tempElements = new HashMap<>();
        List<Element> tempStartEvents = new ArrayList<>();
        int endEventCount = 0;

        for (Element element : elements) {
            String id = element.getId();

            if (id == null)
                throw new IllegalArgumentException("Element ID is null");

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

    @Override
    public InputOutputContainer inputs() {
        return this.inputs;
    }

    @Override
    public <T> T input(String key) {
        return this.inputs.getValue(key);
    }

    @Override
    public InputOutputContainer outputs() {
        return this.outputs;
    }

    @Override
    public <T> T output(String key) {
        return this.outputs.getValue(key);
    }

    @Override
    public MultiInstanceType multiInstanceType() {
        return multiInstance.multiInstanceType();
    }

    @Override
    public String collectionName() {
        return multiInstance.collectionName();
    }

    @Override
    public String itemVariableName() {
        return multiInstance.collectionName();
    }
}
