package com.dongkuk.oasis.model.event;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.exceptions.PropertyException;
import com.dongkuk.oasis.model.ErrorBoundaryEvent;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.error.Error;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.Flow;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.model.flow.container.ComplexFlowContainer;
import com.dongkuk.oasis.model.flow.container.FlowContainer;
import com.dongkuk.oasis.model.flow.nodes.FlowPicker;

import java.util.Collection;

import static com.dongkuk.oasis.model.PropertyNames.CLASS;

/**
 * 기본 에러 바운더리 이벤트.
 *
 * @author Jeongjin Kim
 * @since 2023-01-03
 */
public class DefaultErrorBoundaryEvent implements ErrorBoundaryEvent {
    private final String eventId;
    private final String eventName;
    private final FlowContainer flowContainer;
    private final PropertyContainer properties;
    private final Error error;
    private final String attachedToRef;

    /**
     * @param eventId        이벤트 식별자
     * @param eventName      이벤트 이름
     * @param conditionalFlows {@link ConditionalFlow} 컬렉션
     * @param defaultFlow {@link DefaultFlow}
     * @param sequentialFlow {@link SequentialFlow}
     * @param properties     속성
     * @param error          에러
     * @param attachedToRef  에러 바운더리 이벤트가 붙어있는 요소의 식별자
     */
    public DefaultErrorBoundaryEvent(String eventId,
                                     String eventName,
                                     Collection<ConditionalFlow> conditionalFlows,
                                     DefaultFlow defaultFlow,
                                     SequentialFlow sequentialFlow,
                                     PropertyContainer properties,
                                     Error error,
                                     String attachedToRef) {
        if (eventId == null ||
                error == null)
            throw new IllegalArgumentException(
                    "Required arguments for creating an error boundary event are missing. " +
                            "Required arguments : eventId, error");

        this.eventId = eventId;
        this.eventName = eventName == null ? eventId : eventName;
        this.properties = properties;
        this.error = error;
        if (sequentialFlow == null) {
            if (defaultFlow == null) {
                this.flowContainer = new ComplexFlowContainer(conditionalFlows);
            } else {
                this.flowContainer = new ComplexFlowContainer(conditionalFlows, defaultFlow);
            }
        } else {
            this.flowContainer = new ComplexFlowContainer(sequentialFlow);
        }
        this.attachedToRef = attachedToRef;
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

    @Override
    public Class<?> getExceptionClass() {
        String className = properties.get(CLASS) == null ? null : properties.get(CLASS).getValue();
        if (className == null) {
            return Exception.class;
        }
        Class<?> aClass;
        try {
            aClass = Class.forName(className);
        } catch (ClassNotFoundException e) {
            throw new PropertyException("Cannot find the exception class for the error event. " +
                    "Exception class name : " + className);
        }
        return aClass;
    }

    @Override
    public Collection<ConditionalFlow> conditionalFlows() {
        return flowContainer.conditionalFlows();
    }

    @Override
    public DefaultFlow defaultFlow() {
        return flowContainer.defaultFlow();
    }

    @Override
    public String getAttachedToRef() {
        return this.attachedToRef;
    }
}
