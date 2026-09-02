package com.dongkuk.oasis.model.event;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.model.ErrorEndEvent;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.error.Error;
import com.dongkuk.oasis.model.flow.DefaultTerminalFlow;
import com.dongkuk.oasis.model.flow.Flow;
import com.dongkuk.oasis.model.flow.nodes.FlowPicker;

/**
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
public class UserExceptionEndEvent implements ErrorEndEvent {
    private final String eventId;
    private final String eventName;
    private final PropertyContainer properties;
    private final Error error;

    /**
     * @param eventId    이벤트 식별자
     * @param eventName  이벤트 이름
     * @param properties 속성
     * @param error      에러
     */
    public UserExceptionEndEvent(String eventId,
                                 String eventName,
                                 PropertyContainer properties,
                                 Error error) {
        if (eventId == null ||
                error == null)
            throw new IllegalArgumentException(
                    "Required arguments are missing for error event creation. Required arguments : eventId, error");

        this.error = error;
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

    @Override
    public String errorName() {
        return error.errorName();
    }

    @Override
    public String errorCode() {
        return error.errorCode();
    }

    @Override
    public String errorMessage() {
        return error.errorMessage();
    }
}
