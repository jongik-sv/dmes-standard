package com.dongkuk.oasis.model.event;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.model.EndEvent;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.flow.DefaultTerminalFlow;
import com.dongkuk.oasis.model.flow.Flow;
import com.dongkuk.oasis.model.flow.nodes.FlowPicker;

/**
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
public class DefaultEndEvent implements EndEvent {
    private final String eventId;
    private final String eventName;
    private final PropertyContainer properties;

    /**
     * @param eventId    이벤트 식별자
     * @param eventName  이벤트 이름
     * @param properties 속성
     */
    public DefaultEndEvent(String eventId,
                           String eventName,
                           PropertyContainer properties) {
        if (eventId == null ||
                properties == null)
            throw new IllegalArgumentException("Event ID is null");

        this.eventId = eventId;
        this.eventName = eventName == null ? eventId : eventName;
        this.properties = properties;
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
        return new DefaultTerminalFlow();
    }
}
