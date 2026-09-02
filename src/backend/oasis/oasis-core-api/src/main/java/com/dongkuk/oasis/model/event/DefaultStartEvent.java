package com.dongkuk.oasis.model.event;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.StartEvent;
import com.dongkuk.oasis.model.flow.Flow;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.model.flow.container.FlowContainer;
import com.dongkuk.oasis.model.flow.container.SequentialFlowContainer;
import com.dongkuk.oasis.model.flow.nodes.FlowPicker;

/**
 * 시작 이벤트.
 * 이벤트 이름이 {@code null}이면 이벤트 식별자로 치환된다.
 *
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
public class DefaultStartEvent implements StartEvent {
    private final String eventId;
    private final String eventName;
    private final FlowContainer flowContainer;
    private final PropertyContainer properties;

    /**
     * @param eventId    이벤트 식별자
     * @param eventName  이벤트 이름
     * @param flow       {@link SequentialFlow}
     * @param properties 속성
     */
    public DefaultStartEvent(String eventId,
                             String eventName,
                             SequentialFlow flow,
                             PropertyContainer properties) {
        if (eventId == null ||
                properties == null ||
                flow == null)
            throw new IllegalArgumentException(
                    String.format("eventId[%s], eventName[%s], flow[%s]",
                            eventId, eventName, flow)
            );

        this.eventId = eventId;
        this.eventName = eventName == null ? eventId : eventName;
        this.properties = properties;
        flowContainer = new SequentialFlowContainer(flow);
    }

    @Override
    public String getId() {
        return eventId;
    }

    @Override
    public String getName() {
        return eventName;
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
    public Flow pick(FlowPicker picker, TypedObject object) {
        return picker.pick(this, object);
    }

    @Override
    public SequentialFlow sequenceFlow() {
        return flowContainer.sequenceFlow();
    }
}
